import React, { useState, useRef, useEffect } from 'react';
import { sound } from '../sound';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  action?: string;
  providerUsed?: string;
  timestamp: Date;
}

interface LLMConfig {
  provider: 'auto' | 'groq' | 'gemini' | 'openai' | 'openrouter' | 'ollama';
  apiKey: string;
  model: string;
}

interface AIAssistantProps {
  language: string;
  getCode: () => string;
  onInsertCode: (code: string) => void;
  lastErrorOutput?: string;
  onClose: () => void;
}

const DEFAULT_MODELS: Record<string, string> = {
  groq: 'llama-3.3-70b-versatile',
  gemini: 'gemini-1.5-flash',
  openai: 'gpt-4o-mini',
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
  ollama: 'llama3',
  auto: '',
};

export function AIAssistant({ language, getCode, onInsertCode, lastErrorOutput, onClose }: AIAssistantProps) {
  // Load saved LLM configuration
  const [llmConfig, setLlmConfig] = useState<LLMConfig>(() => {
    try {
      const saved = localStorage.getItem('codemeet_llm_config');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { provider: 'auto', apiKey: '', model: '' };
  });

  const [serverEnv, setServerEnv] = useState<{
    hasGeminiEnv?: boolean;
    hasGroqEnv?: boolean;
    hasOpenAIEnv?: boolean;
    hasOpenRouterEnv?: boolean;
  }>({});

  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [testStatus, setTestStatus] = useState<{ loading: boolean; ok?: boolean; message?: string } | null>(null);
  const [dismissBanner, setDismissBanner] = useState<boolean>(false);

  // Temp settings state while in modal
  const [tempProvider, setTempProvider] = useState<LLMConfig['provider']>(llmConfig.provider);
  const [tempKey, setTempKey] = useState<string>(llmConfig.apiKey);
  const [tempModel, setTempModel] = useState<string>(llmConfig.model);
  const [showKeyText, setShowKeyText] = useState<boolean>(false);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init-1',
      role: 'assistant',
      content: `👋 Hello! I am your **CodeMeet AI Copilot**.\n\nI can generate working code from scratch, analyze your **${language.toUpperCase()}** code, explain algorithms, diagnose runtime errors, provide Socratic hints, or answer any engineering questions.\n\nType any prompt below or click any quick action above to start!`,
      timestamp: new Date(),
    },
  ]);
  const [inputPrompt, setInputPrompt] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [activeAction, setActiveAction] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check server environment on mount
  useEffect(() => {
    fetch('/api/v1/ai/config', {
      headers: { Authorization: 'Bearer ' + (localStorage.getItem('token') || '') },
    })
      .then((r) => (r.ok ? r.json() : {}))
      .then(setServerEnv)
      .catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const hasActiveLLM =
    Boolean(llmConfig.apiKey.trim()) ||
    Boolean(serverEnv.hasGroqEnv) ||
    Boolean(serverEnv.hasGeminiEnv) ||
    Boolean(serverEnv.hasOpenAIEnv) ||
    Boolean(serverEnv.hasOpenRouterEnv) ||
    llmConfig.provider === 'ollama';

  const getActiveBadgeLabel = () => {
    if (llmConfig.apiKey.trim()) {
      const p = llmConfig.provider === 'auto' ? 'LLM' : llmConfig.provider.toUpperCase();
      return `🟢 ${p} Connected`;
    }
    if (serverEnv.hasGroqEnv) return '🟢 Server Groq';
    if (serverEnv.hasGeminiEnv) return '🟢 Server Gemini';
    if (serverEnv.hasOpenAIEnv) return '🟢 Server OpenAI';
    if (serverEnv.hasOpenRouterEnv) return '🟢 Server OpenRouter';
    if (llmConfig.provider === 'ollama') return '🟢 Ollama Local';
    return '⚡ Offline Mode';
  };

  const handleSaveSettings = () => {
    const updated: LLMConfig = {
      provider: tempProvider,
      apiKey: tempKey.trim(),
      model: tempModel.trim() || DEFAULT_MODELS[tempProvider] || '',
    };
    setLlmConfig(updated);
    localStorage.setItem('codemeet_llm_config', JSON.stringify(updated));
    setShowSettings(false);
    sound.playSuccess();
  };

  const handleTestConnection = async () => {
    setTestStatus({ loading: true });
    try {
      const res = await fetch('/api/v1/ai/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + (localStorage.getItem('token') || ''),
        },
        body: JSON.stringify({
          provider: tempProvider,
          apiKey: tempKey.trim(),
          model: tempModel.trim() || DEFAULT_MODELS[tempProvider] || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        sound.playSuccess();
        setTestStatus({
          loading: false,
          ok: true,
          message: `Connected successfully! (${data.latencyMs}ms)`,
        });
      } else {
        sound.playError();
        setTestStatus({
          loading: false,
          ok: false,
          message: data.error || 'Connection failed',
        });
      }
    } catch (e: any) {
      sound.playError();
      setTestStatus({
        loading: false,
        ok: false,
        message: 'Network error contacting server: ' + e.message,
      });
    }
  };

  const callAI = async (
    action: 'explain' | 'debug' | 'optimize' | 'testcases' | 'hints' | 'complexity' | 'runtime_error' | 'custom',
    customPrompt?: string
  ) => {
    if (loading) return;

    const code = getCode();
    const promptToSend = customPrompt || inputPrompt;

    if (action === 'custom' && !promptToSend.trim()) return;

    // For code-specific actions, check if code exists
    if (action !== 'custom' && !code.trim()) {
      setMessages((prev) => [
        ...prev,
        {
          id: 'err-' + Date.now(),
          role: 'assistant',
          content: '⚠️ Please write or paste code into the Monaco Editor first so I can analyze it.',
          timestamp: new Date(),
        },
      ]);
      sound.playError();
      return;
    }

    setLoading(true);
    setActiveAction(action);
    sound.playPop();

    const userMsgText =
      action === 'custom'
        ? promptToSend
        : action === 'explain'
        ? '💡 Explain current code implementation'
        : action === 'debug'
        ? '🐞 Find bugs & potential edge-case issues'
        : action === 'optimize'
        ? '⚡ Suggest time & space algorithmic optimizations'
        : action === 'testcases'
        ? '🧪 Generate edge-case test cases'
        : action === 'complexity'
        ? '📊 Analyze Big-O time and space complexity'
        : action === 'hints'
        ? '💭 Provide an incremental Socratic hint'
        : '⚠️ Explain runtime/compiler diagnostic error';

    const userMessage: Message = {
      id: 'usr-' + Date.now(),
      role: 'user',
      content: userMsgText,
      action,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (action === 'custom') setInputPrompt('');

    try {
      const res = await fetch('/api/v1/ai/assist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + (localStorage.getItem('token') || ''),
        },
        body: JSON.stringify({
          action,
          language,
          code,
          prompt: promptToSend,
          errorOutput: lastErrorOutput,
          provider: llmConfig.provider !== 'auto' ? llmConfig.provider : undefined,
          apiKey: llmConfig.apiKey || undefined,
          model: llmConfig.model || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI Copilot request failed');

      const assistantMessage: Message = {
        id: 'ast-' + Date.now(),
        role: 'assistant',
        content: data.text || 'No response returned from AI service.',
        action,
        providerUsed: data.providerUsed,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      sound.playSuccess();
    } catch (err: any) {
      sound.playError();
      setMessages((prev) => [
        ...prev,
        {
          id: 'err-' + Date.now(),
          role: 'assistant',
          content: '❌ Error contacting AI Copilot: ' + err.message,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
      setActiveAction('');
    }
  };

  const copyCodeFromMessage = (msgId: string, content: string) => {
    const codeMatch = content.match(/```(?:[a-zA-Z]+)?\n([\s\S]*?)```/);
    const textToCopy = codeMatch ? codeMatch[1].trim() : content;
    navigator.clipboard.writeText(textToCopy);
    sound.playSuccess();
    setCopiedId(msgId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const insertSnippetFromMessage = (content: string) => {
    const codeMatch = content.match(/```(?:[a-zA-Z]+)?\n([\s\S]*?)```/);
    const codeToInsert = codeMatch ? codeMatch[1].trim() : content;
    onInsertCode(codeToInsert);
    sound.playSuccess();
  };

  const currentCodeLines = (getCode() || '').trim().split('\n').filter(Boolean).length;

  return (
    <div
      className="ai-copilot-pane animate-fade-in"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#202020',
        borderLeft: '1px solid var(--line)',
        overflow: 'hidden',
        position: 'relative',
        zIndex: 20,
      }}
    >
      {/* Copilot Header */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#262626',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>✨</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
              CodeMeet AI Copilot
              <span
                onClick={() => {
                  setTempProvider(llmConfig.provider);
                  setTempKey(llmConfig.apiKey);
                  setTempModel(llmConfig.model);
                  setTestStatus(null);
                  setShowSettings(true);
                }}
                style={{
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontWeight: 600,
                  background: hasActiveLLM ? 'rgba(0, 184, 163, 0.15)' : 'rgba(255, 192, 30, 0.15)',
                  color: hasActiveLLM ? 'var(--emerald)' : 'var(--amber)',
                  border: `1px solid ${hasActiveLLM ? 'var(--emerald)' : 'var(--amber)'}`,
                }}
                title="Click to configure LLM provider & API keys"
              >
                {getActiveBadgeLabel()}
              </span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--fg-muted)' }}>
              Context: <span style={{ color: 'var(--acc)', fontWeight: 600 }}>{language.toUpperCase()}</span> ({currentCodeLines} lines)
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => {
              setTempProvider(llmConfig.provider);
              setTempKey(llmConfig.apiKey);
              setTempModel(llmConfig.model);
              setTestStatus(null);
              setShowSettings(true);
            }}
            style={{
              fontSize: 11,
              padding: '3px 8px',
              background: 'rgba(255, 161, 22, 0.12)',
              borderColor: 'rgba(255, 161, 22, 0.4)',
              color: 'var(--acc)',
              borderRadius: 4,
              fontWeight: 600,
            }}
            title="Configure LLM Provider (Groq, Gemini, OpenAI, etc.)"
          >
            ⚙️ LLM
          </button>
          <button
            onClick={() => setMessages([messages[0]])}
            style={{ fontSize: 10, padding: '2px 6px', background: 'transparent', border: 'none', color: 'var(--fg-muted)' }}
            title="Clear Chat History"
          >
            Clear
          </button>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', fontSize: 16, color: 'var(--fg-muted)', cursor: 'pointer' }}
            title="Close AI Copilot"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Connect LLM Promotion Banner (if offline and not dismissed) */}
      {!hasActiveLLM && !dismissBanner && (
        <div
          style={{
            background: 'linear-gradient(90deg, rgba(255, 161, 22, 0.15), rgba(189, 83, 237, 0.15))',
            borderBottom: '1px solid rgba(255, 161, 22, 0.3)',
            padding: '8px 12px',
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div>
            ⚡ <b>Connect Free LLM</b>: Add a free <b>Groq</b> or <b>Gemini</b> key for instant real-time code generation!
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              className="btn-primary"
              onClick={() => {
                setTempProvider('groq');
                setTempKey(llmConfig.apiKey);
                setTempModel(DEFAULT_MODELS.groq);
                setTestStatus(null);
                setShowSettings(true);
              }}
              style={{ fontSize: 10, padding: '2px 8px' }}
            >
              Connect Key
            </button>
            <button
              onClick={() => setDismissBanner(true)}
              style={{ border: 'none', background: 'transparent', color: 'var(--fg-muted)', cursor: 'pointer', fontSize: 11 }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Quick Action Buttons Strip */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--line)',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 6,
          background: '#232323',
        }}
      >
        <button
          style={{ fontSize: 11, padding: '5px 4px', borderColor: activeAction === 'explain' ? 'var(--acc)' : 'var(--line)' }}
          disabled={loading}
          onClick={() => callAI('explain')}
          title="Explain current algorithm & logic"
        >
          💡 Explain
        </button>
        <button
          style={{ fontSize: 11, padding: '5px 4px', borderColor: activeAction === 'debug' ? 'var(--coral)' : 'var(--line)' }}
          disabled={loading}
          onClick={() => callAI('debug')}
          title="Find bugs and edge-case errors"
        >
          🐞 Debug
        </button>
        <button
          style={{ fontSize: 11, padding: '5px 4px', borderColor: activeAction === 'optimize' ? 'var(--emerald)' : 'var(--line)' }}
          disabled={loading}
          onClick={() => callAI('optimize')}
          title="Optimize time & space complexity"
        >
          ⚡ Optimize
        </button>
        <button
          style={{ fontSize: 11, padding: '5px 4px', borderColor: activeAction === 'testcases' ? 'var(--acc)' : 'var(--line)' }}
          disabled={loading}
          onClick={() => callAI('testcases')}
          title="Generate 5 edge-case test inputs"
        >
          🧪 Tests
        </button>
        <button
          style={{ fontSize: 11, padding: '5px 4px', borderColor: activeAction === 'complexity' ? 'var(--purple)' : 'var(--line)' }}
          disabled={loading}
          onClick={() => callAI('complexity')}
          title="Calculate Big-O Time & Space Complexity"
        >
          📊 Big-O
        </button>
        <button
          style={{ fontSize: 11, padding: '5px 4px', borderColor: activeAction === 'hints' ? 'var(--amber)' : 'var(--line)' }}
          disabled={loading}
          onClick={() => callAI('hints')}
          title="Get Socratic step-by-step hint"
        >
          💭 Hint
        </button>
      </div>

      {/* Runtime Error Action Banner (if active failure) */}
      {lastErrorOutput && (
        <div
          style={{
            padding: '6px 12px',
            background: 'rgba(255, 55, 95, 0.1)',
            borderBottom: '1px solid rgba(255, 55, 95, 0.3)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--coral)', fontWeight: 600 }}>⚠️ Execution Error Detected</span>
          <button
            className="btn-coral"
            onClick={() => callAI('runtime_error')}
            disabled={loading}
            style={{ fontSize: 10, padding: '3px 8px' }}
          >
            Diagnose Error
          </button>
        </div>
      )}

      {/* Conversational Message Feed */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '92%',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: 'var(--fg-muted)',
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                display: 'flex',
                gap: 6,
                alignItems: 'center',
              }}
            >
              <span>{m.role === 'user' ? 'You' : 'Copilot'}</span>
              <span>•</span>
              <span>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              {m.providerUsed && (
                <span style={{ color: 'var(--emerald)', fontSize: 9 }}>({m.providerUsed})</span>
              )}
            </div>

            <div
              style={{
                background: m.role === 'user' ? 'var(--acc)' : '#282828',
                color: m.role === 'user' ? '#141414' : 'var(--fg)',
                fontWeight: m.role === 'user' ? 600 : 400,
                padding: '10px 14px',
                borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '2px 12px 12px 12px',
                border: m.role === 'user' ? 'none' : '1px solid var(--line)',
                fontSize: 12.5,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              }}
            >
              {m.content}

              {/* Snippet Action Buttons for Code Blocks in Assistant Messages */}
              {m.role === 'assistant' && m.content.includes('```') && (
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    marginTop: 10,
                    paddingTop: 8,
                    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  <button
                    onClick={() => copyCodeFromMessage(m.id, m.content)}
                    style={{ fontSize: 11, padding: '3px 8px', background: '#333' }}
                  >
                    {copiedId === m.id ? '✓ Copied!' : '📋 Copy Code'}
                  </button>
                  <button
                    className="btn-orange"
                    onClick={() => insertSnippetFromMessage(m.content)}
                    style={{ fontSize: 11, padding: '3px 8px' }}
                  >
                    ⚡ Insert into Editor
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fg-muted)', fontSize: 12, padding: 8 }}>
            <div className="status-dot" style={{ width: 8, height: 8 }} />
            <span>Copilot is reasoning and generating code…</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Interactive Prompt Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          callAI('custom', inputPrompt);
        }}
        style={{
          padding: '10px 12px',
          borderTop: '1px solid var(--line)',
          background: '#242424',
          display: 'flex',
          gap: 6,
        }}
      >
        <input
          style={{
            flex: 1,
            fontSize: 12,
            padding: '8px 10px',
            background: '#1a1a1a',
            border: '1px solid var(--line)',
            borderRadius: 6,
          }}
          placeholder="Ask Copilot anything (e.g. Generate quicksort, Find palindrome, Fix bug)..."
          value={inputPrompt}
          onChange={(e) => setInputPrompt(e.target.value)}
          disabled={loading}
        />
        <button
          type="submit"
          className="btn-primary"
          disabled={loading || !inputPrompt.trim()}
          style={{ fontSize: 12, padding: '6px 12px', fontWeight: 700 }}
          title="Submit Prompt"
        >
          {loading ? '…' : '➤'}
        </button>
      </form>

      {/* LLM Settings Configuration Modal */}
      {showSettings && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(4px)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            padding: 16,
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              background: '#262626',
              border: '1px solid var(--line-strong)',
              borderRadius: 10,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              boxShadow: '0 8px 30px rgba(0,0,0,0.8)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#fff' }}>⚙️ Connect AI / LLM Engine</div>
              <button
                onClick={() => setShowSettings(false)}
                style={{ border: 'none', background: 'transparent', fontSize: 18, color: 'var(--fg-muted)', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: 11, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
              Connect your preferred LLM provider for unconstrained real-time reasoning, dynamic code generation, and interactive DSA assistance.
            </p>

            {/* Provider Select */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)' }}>AI Provider:</label>
              <select
                value={tempProvider}
                onChange={(e) => {
                  const p = e.target.value as LLMConfig['provider'];
                  setTempProvider(p);
                  setTempModel(DEFAULT_MODELS[p] || '');
                  setTestStatus(null);
                }}
                style={{ padding: '8px 10px', fontSize: 12 }}
              >
                <option value="groq">⚡ Groq (Recommended — Ultra-Fast & Free Llama-3.3-70b)</option>
                <option value="gemini">💎 Google Gemini (Free Tier — gemini-1.5-flash / 2.0-flash)</option>
                <option value="openrouter">🌐 OpenRouter (Free models: Llama-3.3-70b, DeepSeek-R1)</option>
                <option value="openai">🤖 OpenAI (gpt-4o-mini / gpt-4o)</option>
                <option value="ollama">💻 Ollama (Local offline server on port 11434)</option>
                <option value="auto">🔍 Auto-Detect (Uses key format or server env)</option>
              </select>
            </div>

            {/* Free Key Helper Links */}
            <div style={{ fontSize: 11, background: '#1e1e1e', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--line)' }}>
              {tempProvider === 'groq' && (
                <div>
                  🎁 <b>Get Free Groq Key</b>: Go to{' '}
                  <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" style={{ color: 'var(--acc)', textDecoration: 'underline' }}>
                    console.groq.com/keys
                  </a>{' '}
                  (Free, 14,400 req/day, instant signup).
                </div>
              )}
              {tempProvider === 'gemini' && (
                <div>
                  🎁 <b>Get Free Gemini Key</b>: Go to{' '}
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: 'var(--acc)', textDecoration: 'underline' }}>
                    aistudio.google.com/app/apikey
                  </a>{' '}
                  (Free tier, 15 req/min, Google account).
                </div>
              )}
              {tempProvider === 'openrouter' && (
                <div>
                  🎁 <b>OpenRouter Key</b>: Go to{' '}
                  <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" style={{ color: 'var(--acc)', textDecoration: 'underline' }}>
                    openrouter.ai/keys
                  </a>{' '}
                  (Includes access to free models).
                </div>
              )}
              {tempProvider === 'openai' && (
                <div>
                  🔑 <b>OpenAI API Key</b>: Go to{' '}
                  <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" style={{ color: 'var(--acc)', textDecoration: 'underline' }}>
                    platform.openai.com/api-keys
                  </a>
                </div>
              )}
              {tempProvider === 'ollama' && (
                <div>
                  💻 <b>Ollama Local</b>: Make sure Ollama is running (`ollama run llama3`). No API key required!
                </div>
              )}
            </div>

            {/* API Key Input */}
            {tempProvider !== 'ollama' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)' }}>API Key:</label>
                  <button
                    type="button"
                    onClick={() => setShowKeyText(!showKeyText)}
                    style={{ fontSize: 10, background: 'transparent', border: 'none', color: 'var(--fg-muted)', cursor: 'pointer' }}
                  >
                    {showKeyText ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  type={showKeyText ? 'text' : 'password'}
                  placeholder={
                    tempProvider === 'groq'
                      ? 'gsk_...'
                      : tempProvider === 'gemini'
                      ? 'AIzaSy...'
                      : tempProvider === 'openai'
                      ? 'sk-...'
                      : 'Paste API Key here...'
                  }
                  value={tempKey}
                  onChange={(e) => {
                    setTempKey(e.target.value);
                    setTestStatus(null);
                  }}
                  style={{
                    padding: '8px 10px',
                    fontSize: 12,
                    background: '#1a1a1a',
                    border: '1px solid var(--line)',
                    borderRadius: 6,
                  }}
                />
              </div>
            )}

            {/* Model Name Input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)' }}>Model Name:</label>
              <input
                type="text"
                placeholder={DEFAULT_MODELS[tempProvider] || 'e.g. llama-3.3-70b-versatile'}
                value={tempModel}
                onChange={(e) => setTempModel(e.target.value)}
                style={{
                  padding: '8px 10px',
                  fontSize: 12,
                  background: '#1a1a1a',
                  border: '1px solid var(--line)',
                  borderRadius: 6,
                }}
              />
            </div>

            {/* Test Connection Result */}
            {testStatus && (
              <div
                style={{
                  padding: '8px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  background: testStatus.ok ? 'rgba(0, 184, 163, 0.15)' : 'rgba(255, 55, 95, 0.15)',
                  color: testStatus.ok ? 'var(--emerald)' : 'var(--coral)',
                  border: `1px solid ${testStatus.ok ? 'var(--emerald)' : 'var(--coral)'}`,
                }}
              >
                {testStatus.loading ? '⏳ Verifying connection...' : testStatus.message}
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testStatus?.loading}
                style={{ fontSize: 11, padding: '6px 12px' }}
              >
                {testStatus?.loading ? 'Testing…' : '⚡ Test Connection'}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSaveSettings}
                style={{ fontSize: 11, padding: '6px 14px', fontWeight: 700 }}
              >
                Save & Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
