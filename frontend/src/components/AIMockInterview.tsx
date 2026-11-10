import React, { useState, useRef, useEffect } from 'react';
import { sound } from '../sound';

interface AIMockInterviewProps {
  getCode: () => string;
  onClose: () => void;
}

export function AIMockInterview({ getCode, onClose }: AIMockInterviewProps) {
  const [topic, setTopic] = useState<string>('DSA');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    {
      role: 'assistant',
      content:
        'Welcome to your CodeMeet AI Technical Mock Interview! I will be your interviewer. Select your focus topic and tell me when you are ready to begin.',
    },
  ]);
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [scorecard, setScorecard] = useState<{
    rating: number;
    verdict: string;
    strengths: string;
    improvements: string;
  } | null>(null);

  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (customText?: string) => {
    const textToSend = customText || input;
    if (!textToSend.trim() || loading) return;

    const newHistory = [...messages, { role: 'user' as const, content: textToSend }];
    setMessages(newHistory);
    if (!customText) setInput('');
    setLoading(true);
    sound.playPop();

    try {
      let llmOpt: any = {};
      try {
        const saved = localStorage.getItem('codemeet_llm_config');
        if (saved) {
          const cfg = JSON.parse(saved);
          if (cfg.provider && cfg.provider !== 'auto') llmOpt.provider = cfg.provider;
          if (cfg.apiKey) llmOpt.apiKey = cfg.apiKey;
          if (cfg.model) llmOpt.model = cfg.model;
        }
      } catch {}

      const res = await fetch('/api/v1/ai/mock-interview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + (localStorage.getItem('token') || ''),
        },
        body: JSON.stringify({
          topic,
          messageHistory: newHistory,
          candidateCode: getCode(),
          ...llmOpt,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get interviewer response');

      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
      sound.playSuccess();
    } catch (err: any) {
      sound.playError();
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Connection issue: ' + err.message }]);
    } finally {
      setLoading(false);
    }
  };

  const finishAndEvaluate = async () => {
    setLoading(true);
    sound.playPop();
    try {
      let llmOpt: any = {};
      try {
        const saved = localStorage.getItem('codemeet_llm_config');
        if (saved) {
          const cfg = JSON.parse(saved);
          if (cfg.provider && cfg.provider !== 'auto') llmOpt.provider = cfg.provider;
          if (cfg.apiKey) llmOpt.apiKey = cfg.apiKey;
          if (cfg.model) llmOpt.model = cfg.model;
        }
      } catch {}

      const res = await fetch('/api/v1/ai/mock-interview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + (localStorage.getItem('token') || ''),
        },
        body: JSON.stringify({
          topic,
          messageHistory: messages,
          candidateCode: getCode(),
          mode: 'evaluate',
          ...llmOpt,
        }),
      });
      const data = await res.json();
      if (data.scoreCard) {
        setScorecard(data.scoreCard);
        sound.playSuccess();
      } else {
        throw new Error(data.error || 'Evaluation could not be generated');
      }
    } catch (err: any) {
      sound.playError();
      alert('Evaluation error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 650, height: '80vh' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🤖</span>
            <div>
              <h3 style={{ fontSize: 16 }}>AI Mock Technical Interview</h3>
              <div style={{ fontSize: 11, color: 'var(--mut)' }}>Adaptive SDE Technical Evaluation</div>
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 16 }}>
            ✕
          </button>
        </div>

        {/* Category Switcher */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['DSA', 'OOP', 'DBMS', 'Operating Systems', 'System Design'].map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setTopic(cat);
                sound.playPop();
              }}
              style={{
                fontSize: 11,
                padding: '4px 8px',
                borderColor: topic === cat ? 'var(--purple)' : 'var(--line)',
                background: topic === cat ? 'var(--purple-glow)' : 'transparent',
                color: topic === cat ? 'var(--purple)' : 'var(--mut)',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Chat / Interview Stream */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            background: 'rgba(0,0,0,0.25)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                alignItems: m.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <span style={{ fontSize: 11, color: 'var(--mut)', fontWeight: 600 }}>
                {m.role === 'user' ? 'Candidate' : 'AI Senior Interviewer'}
              </span>
              <div
                style={{
                  background: m.role === 'user' ? 'var(--acc-glow)' : 'rgba(255,255,255,0.05)',
                  border: '1px solid ' + (m.role === 'user' ? 'rgba(88,166,255,0.3)' : 'var(--line)'),
                  padding: '8px 12px',
                  borderRadius: 10,
                  fontSize: 13,
                  lineHeight: 1.5,
                  maxWidth: '85%',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {m.content}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ fontSize: 12, color: 'var(--mut)', fontStyle: 'italic' }}>
              AI Interviewer is evaluating your response…
            </div>
          )}

          {scorecard && (
            <div
              style={{
                background: 'rgba(63, 185, 80, 0.1)',
                border: '1px solid rgba(63, 185, 80, 0.4)',
                borderRadius: 8,
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, color: 'var(--success)' }}>Final Scorecard: {scorecard.verdict}</span>
                <span className="badge badge-easy">Rating: {scorecard.rating} / 5 ⭐</span>
              </div>
              <div style={{ fontSize: 12 }}>
                <b>Key Strengths:</b> {scorecard.strengths}
              </div>
              <div style={{ fontSize: 12, color: 'var(--mut)' }}>
                <b>Recommended Growth:</b> {scorecard.improvements}
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Input Bar */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => send("Could you provide a subtle hint on how to structure the algorithm?")}
            style={{ fontSize: 11, padding: '6px 10px', background: 'transparent' }}
            disabled={loading}
          >
            💭 Ask for Hint
          </button>
          <input
            style={{ flex: 1, fontSize: 13 }}
            placeholder="Type your explanation or thoughts for the interviewer…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            disabled={loading}
          />
          <button className="btn-primary" onClick={() => send()} disabled={loading || !input.trim()}>
            Send
          </button>
          <button
            className="p"
            style={{ fontSize: 11, padding: '6px 12px' }}
            onClick={finishAndEvaluate}
            disabled={scorecard !== null}
          >
            🏁 Conclude & Score
          </button>
        </div>
      </div>
    </div>
  );
}
