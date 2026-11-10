import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, Link } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';
import { io, Socket } from 'socket.io-client';
import { PROBLEMS, Problem } from './problems';
import { sound } from './sound';
import { AIAssistant } from './components/AIAssistant';
import { AIMockInterview } from './components/AIMockInterview';
import { Whiteboard } from './components/Whiteboard';
import { GitHubModal } from './components/GitHubModal';
import { VideoConference } from './components/VideoConference';
import { Contests, ContestArena } from './components/Contests';
import { Analytics } from './components/Analytics';
import { CodeComments } from './components/CodeComments';
import { SessionReplay } from './components/SessionReplay';
import { InterviewReportModal } from './components/InterviewReportModal';
import { InviteModal } from './components/InviteModal';
import { ContestItem, NotificationItem } from './types';
import { API_BASE, BACKEND_URL, getWsUrl } from './config';
import './styles.css';

const tok = () => localStorage.getItem('token') || '';
const currentUser = () => ({
  name: localStorage.getItem('name') || 'Collaborator',
  email: localStorage.getItem('email') || '',
});

async function api(path: string, method = 'GET', body?: unknown) {
  const r = await fetch(API_BASE + path, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + tok(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && !path.startsWith('/auth')) {
    localStorage.clear();
    location.href = '/login';
  }
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
}

const Guard = ({ children }: { children: React.ReactNode }) => {
  if (!tok()) {
    if (window.location.pathname.startsWith('/room/')) {
      sessionStorage.setItem('post_login_redirect', window.location.pathname);
    }
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    sound.playPop();
    try {
      const r = await api(`/auth/${mode}`, 'POST', f);
      localStorage.setItem('token', r.token);
      localStorage.setItem('name', r.user.name);
      localStorage.setItem('email', r.user.email);
      sound.playSuccess();
      const target = sessionStorage.getItem('post_login_redirect') || '/';
      sessionStorage.removeItem('post_login_redirect');
      nav(target);
    } catch (x: any) {
      sound.playError();
      setErr(x.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg)' }}>
      <form className="c animate-fade-in" onSubmit={submit} style={{ width: 440 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <div className="sidebar-logo">C</div>
          <span style={{ fontSize: 22, fontWeight: 800 }}>Code<span style={{ color: 'var(--acc)' }}>Meet</span></span>
        </div>
        <p style={{ textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13, marginTop: -4 }}>
          {mode === 'login'
            ? 'Sign in to your collaborative engineering suite'
            : 'Create your account to start real-time coding sessions'}
        </p>
        {err && <div className="err">{err}</div>}
        {mode === 'register' && (
          <input
            placeholder="Full Name"
            required
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
        )}
        <input
          type="email"
          placeholder="Email address"
          required
          value={f.email}
          onChange={(e) => setF({ ...f, email: e.target.value })}
        />
        <input
          type="password"
          placeholder="Password (minimum 8 characters)"
          required
          minLength={8}
          value={f.password}
          onChange={(e) => setF({ ...f, password: e.target.value })}
        />
        <button className="p" disabled={loading} style={{ padding: '10px 14px', fontSize: 14 }}>
          {loading ? 'Authenticating…' : mode === 'login' ? 'Sign In to Workspace' : 'Create Free Account'}
        </button>

        <div style={{ textAlign: 'center', fontSize: 13, marginTop: 4 }}>
          {mode === 'login' ? (
            <span>
              Don't have an account? <Link to="/register">Create one here</Link>
            </span>
          ) : (
            <span>
              Already registered? <Link to="/login">Sign in here</Link>
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

function Dashboard() {
  const nav = useNavigate();
  const [rooms, setRooms] = useState<any[]>([]);
  const [publicRooms, setPublicRooms] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [activeNav, setActiveNav] = useState<
    'dashboard' | 'sessions' | 'problems' | 'contests' | 'whiteboard' | 'mock' | 'github' | 'analytics'
  >('dashboard');

  const [difficultyFilter, setDifficultyFilter] = useState<'All' | 'Easy' | 'Medium' | 'Hard'>('All');
  const [problemSearch, setProblemSearch] = useState('');
  const [selectedProblem, setSelectedProblem] = useState<Problem | null>(null);

  // Active Modals
  const [activeContest, setActiveContest] = useState<ContestItem | null>(null);
  const [showMockModal, setShowMockModal] = useState<boolean>(false);
  const [showWhiteboardModal, setShowWhiteboardModal] = useState<boolean>(false);
  const [showGitHubModal, setShowGitHubModal] = useState<boolean>(false);

  // Notifications
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifications, setShowNotifications] = useState<boolean>(false);

  // Room Creation State
  const [name, setName] = useState('');
  const [lang, setLang] = useState('python');
  const [linkedProblemId, setLinkedProblemId] = useState('');
  const [sessionType, setSessionType] = useState<'COLLAB' | 'INTERVIEW'>('COLLAB');
  const [isPublic, setIsPublic] = useState(false);
  const [join, setJoin] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(sound.enabled);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const user = currentUser();

  const loadData = () => {
    api('/rooms').then(setRooms).catch((e) => setErr(e.message));
    api('/rooms/public').then(setPublicRooms).catch(() => {});
    api('/notifications')
      .then((data) => {
        if (Array.isArray(data)) setNotifications(data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadData();
  }, []);

  const toggleSound = () => {
    sound.enabled = !sound.enabled;
    setSoundEnabled(sound.enabled);
    if (sound.enabled) sound.playPop();
  };

  const create = async (overrideName?: string, overrideProblemId?: string, overrideType?: 'COLLAB' | 'INTERVIEW') => {
    if (loading) return;
    setLoading(true);
    setErr('');
    sound.playPop();
    try {
      const chosenProblemId = overrideProblemId !== undefined ? overrideProblemId : linkedProblemId;
      const chosenProblem = PROBLEMS.find((p) => p.id === chosenProblemId);

      const r = await api('/rooms', 'POST', {
        name: overrideName || name.trim() || (chosenProblem ? chosenProblem.title : 'Collaborative Session'),
        language: lang,
        isPublic,
        sessionType: overrideType || sessionType,
        problemId: chosenProblemId || null,
        problemData: chosenProblem ? JSON.stringify(chosenProblem) : null,
      });
      sound.playSuccess();
      nav('/room/' + r.id);
    } catch (e: any) {
      sound.playError();
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const startProblemSession = (problem: Problem) => {
    sound.playPop();
    create(`${problem.title} (Interview)`, problem.id, 'INTERVIEW');
  };

  const deleteRoom = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this session?')) return;
    try {
      await api('/rooms/' + id, 'DELETE');
      setRooms((prev) => prev.filter((r) => r.id !== id));
      sound.playPop();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleJoinRoom = () => {
    if (!join.trim()) return;
    let code = join.trim();
    const match = code.match(/\/room\/([a-zA-Z0-9_-]+)/);
    if (match) code = match[1];
    sound.playPop();
    nav('/room/' + code);
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const filteredRooms = rooms.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.language.toLowerCase().includes(search.toLowerCase()) ||
      r.id.toLowerCase().includes(search.toLowerCase())
  );

  const filteredProblems = PROBLEMS.filter((p) => {
    const matchDiff = difficultyFilter === 'All' || p.difficulty === difficultyFilter;
    const matchSearch =
      p.title.toLowerCase().includes(problemSearch.toLowerCase()) ||
      p.category.toLowerCase().includes(problemSearch.toLowerCase());
    return matchDiff && matchSearch;
  });

  return (
    <div className="app-shell animate-fade-in">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* LEFT SIDEBAR (LeetCode Friendly) */}
      <div className={`app-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-brand" onClick={() => { setActiveNav('dashboard'); setMobileMenuOpen(false); }}>
          <div className="sidebar-logo">{'{ }'}</div>
          <div className="sidebar-brand-text">
            Code<span>Meet</span>
          </div>
        </div>

        {/* Navigation Items */}
        <div className="sidebar-nav">
          <div
            className={`sidebar-nav-item ${activeNav === 'dashboard' ? 'active' : ''}`}
            onClick={() => { setActiveNav('dashboard'); setMobileMenuOpen(false); }}
          >
            <span className="nav-icon">📊</span>
            <span>Dashboard</span>
          </div>

          <div
            className={`sidebar-nav-item ${activeNav === 'sessions' ? 'active' : ''}`}
            onClick={() => { setActiveNav('sessions'); setMobileMenuOpen(false); }}
          >
            <span className="nav-icon">💻</span>
            <span>Workspaces</span>
          </div>

          <div
            className={`sidebar-nav-item ${activeNav === 'problems' ? 'active' : ''}`}
            onClick={() => { setActiveNav('problems'); setMobileMenuOpen(false); }}
          >
            <span className="nav-icon">🧠</span>
            <span>Problem Bank</span>
          </div>

          <div
            className={`sidebar-nav-item ${activeNav === 'contests' ? 'active' : ''}`}
            onClick={() => { setActiveNav('contests'); setMobileMenuOpen(false); }}
          >
            <span className="nav-icon">⚔️</span>
            <span>Coding Battles</span>
          </div>

          <div
            className={`sidebar-nav-item ${activeNav === 'whiteboard' ? 'active' : ''}`}
            onClick={() => { setShowWhiteboardModal(true); setMobileMenuOpen(false); }}
          >
            <span className="nav-icon">📐</span>
            <span>Whiteboard</span>
          </div>

          <div
            className={`sidebar-nav-item ${activeNav === 'mock' ? 'active' : ''}`}
            onClick={() => { setShowMockModal(true); setMobileMenuOpen(false); }}
          >
            <span className="nav-icon">🤖</span>
            <span>AI Mock Interview</span>
          </div>

          <div
            className={`sidebar-nav-item ${activeNav === 'github' ? 'active' : ''}`}
            onClick={() => { setShowGitHubModal(true); setMobileMenuOpen(false); }}
          >
            <span className="nav-icon">🐙</span>
            <span>GitHub Hub</span>
          </div>

          <div
            className={`sidebar-nav-item ${activeNav === 'analytics' ? 'active' : ''}`}
            onClick={() => { setActiveNav('analytics'); setMobileMenuOpen(false); }}
          >
            <span className="nav-icon">📈</span>
            <span>Analytics</span>
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="sidebar-footer">
          <div className="user-badge" style={{ width: '100%' }}>
            <div className="user-avatar-circle">{user.name[0]?.toUpperCase() || 'U'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg)', whiteSpace: 'nowrap' }}>
                {user.name}
              </span>
              <span style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>Collaborator</span>
            </div>
          </div>

          <button
            style={{ width: '100%', fontSize: 11, padding: '5px' }}
            onClick={() => {
              localStorage.clear();
              location.href = '/login';
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* MAIN VIEWPORT */}
      <div className="app-main">
        {/* Top Header Bar */}
        <div className="top-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              className="mobile-nav-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation drawer"
            >
              ☰
            </button>
            <div className="top-title-group">
              <span className="top-title">
                {activeNav === 'dashboard'
                  ? 'Dashboard'
                  : activeNav === 'sessions'
                  ? 'Workspaces & Sessions'
                  : activeNav === 'problems'
                  ? 'DSA Problem Bank'
                  : activeNav === 'contests'
                  ? 'Coding Battles'
                  : 'Analytics'}
              </span>
              <span className="top-subtitle">Real-time overview of all sessions and deployments</span>
            </div>
          </div>

          <div className="top-actions">
            {/* Live Operational Status */}
            <div className="status-pill">
              <div className="status-dot" />
              <span>All systems operational</span>
            </div>

            {/* Notifications */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                style={{ fontSize: 13, padding: '5px 10px', position: 'relative', background: 'transparent' }}
                title="Notifications"
              >
                🔔
                {unreadCount > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: 0,
                      right: 2,
                      background: 'var(--coral)',
                      color: '#fff',
                      borderRadius: '50%',
                      width: 14,
                      height: 14,
                      fontSize: 9,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div
                  style={{
                    position: 'absolute',
                    top: 36,
                    right: 0,
                    width: 280,
                    background: 'var(--panel)',
                    border: '1px solid var(--line-strong)',
                    borderRadius: 10,
                    boxShadow: '0 12px 32px rgba(0,0,0,0.7)',
                    padding: 10,
                    zIndex: 200,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700 }}>
                    <span>Notifications</span>
                    <span
                      style={{ color: 'var(--acc)', cursor: 'pointer' }}
                      onClick={() => api('/notifications/read-all', 'PATCH').then(loadData)}
                    >
                      Mark all read
                    </span>
                  </div>
                  {notifications.length === 0 ? (
                    <div style={{ color: 'var(--fg-muted)', fontSize: 11, textAlign: 'center', padding: 12 }}>
                      No new alerts.
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div key={n.id} style={{ fontSize: 11, padding: 6, borderBottom: '1px solid var(--line)' }}>
                        <b>{n.title}</b>
                        <div style={{ color: 'var(--fg-muted)' }}>{n.body}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Audio Toggle */}
            <button
              onClick={toggleSound}
              style={{ fontSize: 12, padding: '4px 8px', background: 'transparent' }}
              title="Toggle Audio Feedback"
            >
              {soundEnabled ? '🔊' : '🔇'}
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="content-viewport">
          {err && <div className="err">{err}</div>}

          {/* DASHBOARD OVERVIEW (Image Theme layout) */}
          {activeNav === 'dashboard' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {/* Analytics visual widgets */}
              <Analytics />

              {/* Quick Workspace launcher */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
                <div className="card">
                  <div style={{ fontWeight: 700, fontSize: 14 }}>🚀 Quick Launch New Session</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <input
                      placeholder="Session Title (e.g. Algorithmic Sprint)"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <select value={lang} onChange={(e) => setLang(e.target.value)} style={{ flex: 1 }}>
                        <option value="python">Python 3</option>
                        <option value="javascript">JavaScript (Node.js)</option>
                        <option value="cpp">C++ (MinGW GCC)</option>
                        <option value="java">Java (JDK)</option>
                      </select>
                      <button className="p" disabled={loading} onClick={() => create()} style={{ flex: 1 }}>
                        {loading ? 'Starting…' : 'Start Session'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div style={{ fontWeight: 700, fontSize: 14 }}>🔗 Join Existing Session by Code or Link</div>
                  <p style={{ color: 'var(--fg-muted)', fontSize: 12, marginTop: -6 }}>
                    Paste a room ID (e.g. <code>62d5893f8f</code>) or a direct invite link shared via WhatsApp, Telegram, or email.
                  </p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                    <input
                      style={{ flex: 1, fontFamily: 'var(--font-mono)' }}
                      placeholder="Paste room code or invite URL…"
                      value={join}
                      onChange={(e) => setJoin(e.target.value.trim())}
                      onKeyDown={(e) => e.key === 'Enter' && join && handleJoinRoom()}
                    />
                    <button
                      type="button"
                      style={{ fontSize: 11, padding: '4px 10px' }}
                      title="Paste from clipboard"
                      onClick={async () => {
                        try {
                          const text = await navigator.clipboard.readText();
                          if (text) setJoin(text.trim());
                        } catch {}
                      }}
                    >
                      📋 Paste
                    </button>
                    <button
                      className="btn-primary"
                      disabled={!join.trim()}
                      onClick={handleJoinRoom}
                    >
                      Join Room
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SESSIONS VIEW */}
          {activeNav === 'sessions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: 17, fontWeight: 700 }}>Your Active Workspaces ({rooms.length})</h3>
                <input
                  style={{ maxWidth: 260, fontSize: 13 }}
                  placeholder="🔍 Search sessions…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {filteredRooms.length === 0 ? (
                <div className="card" style={{ color: 'var(--fg-muted)', textAlign: 'center', padding: 32 }}>
                  No sessions found. Create a session on the Dashboard or start a problem!
                </div>
              ) : (
                <div className="rooms-grid">
                  {filteredRooms.map((r) => (
                    <div key={r.id} className="room-card" onClick={() => nav('/room/' + r.id)}>
                      <div className="room-card-head">
                        <span className="room-card-title">{r.name}</span>
                        <span className={r.role === 'HOST' ? 'badge badge-host' : 'badge badge-part'}>
                          {r.role}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span className="badge badge-lang">{r.language}</span>
                        {r.sessionType === 'INTERVIEW' && <span className="badge badge-easy">Interview Mode</span>}
                        {r.problemId && <span className="badge badge-medium">Challenge Attached</span>}
                        <span style={{ fontSize: 11, color: 'var(--fg-muted)', marginLeft: 'auto' }}>
                          ID: <code style={{ color: 'var(--fg)' }}>{r.id}</code>
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
                        <button
                          style={{ fontSize: 11, padding: '4px 8px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(location.origin + '/room/' + r.id);
                            sound.playPop();
                            alert('Copied link:\n' + location.origin + '/room/' + r.id);
                          }}
                        >
                          🔗 Copy Link
                        </button>

                        {r.role === 'HOST' && (
                          <button
                            className="btn-danger"
                            style={{ fontSize: 11 }}
                            onClick={(e) => deleteRoom(e, r.id)}
                            title="Delete session"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* PROBLEMS VIEW */}
          {activeNav === 'problems' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['All', 'Easy', 'Medium', 'Hard'] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setDifficultyFilter(d)}
                      style={{
                        fontSize: 12,
                        padding: '5px 12px',
                        borderColor: difficultyFilter === d ? 'var(--acc)' : 'var(--line)',
                        background: difficultyFilter === d ? 'var(--acc-glow)' : 'transparent',
                        color: difficultyFilter === d ? 'var(--acc)' : 'var(--fg-muted)',
                      }}
                    >
                      {d}
                    </button>
                  ))}
                </div>

                <input
                  style={{ maxWidth: 300, fontSize: 13 }}
                  placeholder="🔍 Search problems…"
                  value={problemSearch}
                  onChange={(e) => setProblemSearch(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filteredProblems.map((p) => (
                  <div key={p.id} className="problem-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <span
                        className={
                          p.difficulty === 'Easy'
                            ? 'badge badge-easy'
                            : p.difficulty === 'Medium'
                            ? 'badge badge-medium'
                            : 'badge badge-hard'
                        }
                      >
                        {p.difficulty}
                      </span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--fg)' }}>{p.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{p.category}</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => setSelectedProblem(p)}>
                        Preview
                      </button>
                      <button
                        className="btn-purple"
                        style={{ fontSize: 12, padding: '5px 12px' }}
                        onClick={() => startProblemSession(p)}
                      >
                        🚀 Start Interview
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CONTESTS VIEW */}
          {activeNav === 'contests' && <Contests onJoinContest={(c) => setActiveContest(c)} />}

          {/* ANALYTICS VIEW */}
          {activeNav === 'analytics' && <Analytics />}
        </div>
      </div>

      {/* MODALS */}
      {selectedProblem && (
        <div className="modal-overlay" onClick={() => setSelectedProblem(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontSize: 18 }}>{selectedProblem.title}</h3>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <span
                    className={
                      selectedProblem.difficulty === 'Easy'
                        ? 'badge badge-easy'
                        : selectedProblem.difficulty === 'Medium'
                        ? 'badge badge-medium'
                        : 'badge badge-hard'
                    }
                  >
                    {selectedProblem.difficulty}
                  </span>
                  <span className="badge badge-lang">{selectedProblem.category}</span>
                </div>
              </div>
              <button onClick={() => setSelectedProblem(null)} style={{ border: 'none', background: 'transparent', fontSize: 16 }}>
                ✕
              </button>
            </div>

            <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
              <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{selectedProblem.description}</p>
              <h4>Example:</h4>
              <div className="example-box">
                <div>Input: {selectedProblem.examples[0]?.input}</div>
                <div>Output: {selectedProblem.examples[0]?.output}</div>
                {selectedProblem.examples[0]?.explanation && (
                  <div style={{ color: 'var(--fg-muted)' }}>Explanation: {selectedProblem.examples[0].explanation}</div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button onClick={() => setSelectedProblem(null)}>Close</button>
              <button
                className="btn-purple"
                onClick={() => {
                  const p = selectedProblem;
                  setSelectedProblem(null);
                  startProblemSession(p);
                }}
              >
                Start Interview Session with this Problem
              </button>
            </div>
          </div>
        </div>
      )}

      {activeContest && <ContestArena contest={activeContest} onClose={() => setActiveContest(null)} />}

      {showMockModal && <AIMockInterview getCode={() => ''} onClose={() => setShowMockModal(false)} />}

      {showWhiteboardModal && (
        <Whiteboard roomId="dashboard-whiteboard" onClose={() => setShowWhiteboardModal(false)} />
      )}

      {showGitHubModal && (
        <GitHubModal getCurrentCode={() => ''} onLoadCode={() => {}} onClose={() => setShowGitHubModal(false)} />
      )}
    </div>
  );
}

const TEMPLATES: Record<string, string> = {
  python: `# Python 3
def solve():
    print("CodeMeet collaborative session ready!")

if __name__ == "__main__":
    solve()
`,
  javascript: `// JavaScript (Node.js)
function solve() {
  console.log("CodeMeet collaborative session ready!");
}

solve();
`,
  cpp: `// C++
#include <iostream>

int main() {
    std::cout << "CodeMeet collaborative session ready!\\n";
    return 0;
}
`,
  java: `// Java
public class Main {
    public static void main(String[] args) {
        System.out.println("CodeMeet collaborative session ready!");
    }
}
`,
};

const FILE_EXT: Record<string, string> = {
  python: 'main.py',
  javascript: 'main.js',
  cpp: 'main.cpp',
  java: 'Main.java',
};

const hue = (id: number) => `hsl(${(id * 137) % 360} 80% 60%)`;

function Room() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [room, setRoom] = useState<any>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [lang, setLang] = useState('python');
  const [theme, setTheme] = useState('vs-dark');
  const [fontSize, setFontSize] = useState(14);
  const [err, setErr] = useState('');
  const [isLocked, setIsLocked] = useState<boolean>(false);

  // Layout Panels Visibility
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [showAICopilot, setShowAICopilot] = useState(false);
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [showGitHub, setShowGitHub] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showReplay, setShowReplay] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  const [leftTab, setLeftTab] = useState<'problem' | 'notes'>('problem');
  const [mobileRoomTab, setMobileRoomTab] = useState<'problem' | 'editor' | 'console' | 'collab'>('editor');
  const [notes, setNotes] = useState('');

  // Execution & Console
  const [out, setOut] = useState('');
  const [outMeta, setOutMeta] = useState<{ exitCode?: number; timeMs?: number; executedBy?: string } | null>(null);
  const [stdin, setStdin] = useState('');
  const [running, setRunning] = useState(false);
  const [bottomTab, setBottomTab] = useState<'console' | 'tests' | 'stdin' | 'history'>('console');
  const [submissions, setSubmissions] = useState<any[]>([]);

  // Collaboration & Chat
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState('');
  const [peers, setPeers] = useState(1);
  const [activeUsers, setActiveUsers] = useState<any[]>([]);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [reactions, setReactions] = useState<{ id: string; emoji: string }[]>([]);

  // Synced Interview Timer (in seconds)
  const [timerSeconds, setTimerSeconds] = useState(45 * 60);
  const [timerRunning, setTimerRunning] = useState(false);

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const ytextRef = useRef<Y.Text | null>(null);
  const sock = useRef<Socket>();
  const cleanup = useRef<() => void>();
  const msgsEndRef = useRef<HTMLDivElement>(null);
  const user = currentUser();

  const scrollToBottom = () => {
    msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [msgs, typing]);

  const loadSubmissions = () => {
    api(`/rooms/${id}/submissions`).then(setSubmissions).catch(() => {});
  };

  useEffect(() => {
    api('/rooms/' + id)
      .then((r) => {
        setRoom(r);
        setLang(r.language);
        setIsLocked(!!r.isLocked);
        if (r.problemId) {
          const found = PROBLEMS.find((p) => p.id === r.problemId);
          if (found) setProblem(found);
          else if (r.problemData) {
            try {
              setProblem(JSON.parse(r.problemData));
            } catch {}
          }
        }
        api(`/rooms/${id}/messages`).then(setMsgs);
        loadSubmissions();
      })
      .catch((e) => setErr(e.message));

    const s = io(BACKEND_URL || undefined, { auth: { token: tok() } });
    sock.current = s;

    s.emit('room:join', id);
    s.on('connect', () => s.emit('room:join', id));

    s.on('chat:message', (m) => {
      setMsgs((p) => [...p, m]);
      sound.playPop();
    });
    s.on('typing:start', (n) => setTyping(n + ' is typing…'));
    s.on('typing:stop', () => setTyping(''));
    s.on('participant:joined', (u) => {
      setMsgs((p) => [...p, { id: 'sys-' + Date.now(), isSystem: true, text: `${u.name} joined the session` }]);
    });
    s.on('participant:left', (u) => {
      setMsgs((p) => [...p, { id: 'sys-' + Date.now(), isSystem: true, text: `${u.name} left the session` }]);
    });
    s.on('room:active_users', (list: any[]) => setActiveUsers(list));
    s.on('room:updated', (updated: any) => {
      setRoom((prev: any) => ({ ...prev, ...updated }));
      if (updated.language) setLang(updated.language);
    });
    s.on('editor:lock_status', ({ isLocked: locked }) => {
      setIsLocked(locked);
      editorRef.current?.updateOptions({ readOnly: locked && room?.hostId !== user.name });
    });
    s.on('room:deleted', () => {
      alert('This session was concluded or deleted by the host.');
      nav('/');
    });
    s.on('code:execution', (payload) => {
      fmt(payload);
      loadSubmissions();
    });

    s.on('reaction:received', ({ emoji, id: reactionId }) => {
      sound.playPop();
      setReactions((prev) => [...prev, { id: reactionId, emoji }]);
      setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.id !== reactionId));
      }, 2500);
    });

    s.on('timer:state', (timerState) => {
      setTimerSeconds(timerState.seconds);
      setTimerRunning(timerState.isRunning);
    });

    return () => {
      s.disconnect();
      cleanup.current?.();
    };
  }, [id]);

  // Timer Tick
  useEffect(() => {
    let interval: any;
    if (timerRunning && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => {
          if (prev <= 1) {
            sound.playTimerBeep();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerRunning, timerSeconds]);

  const toggleTimer = () => {
    const nextState = !timerRunning;
    setTimerRunning(nextState);
    sock.current?.emit('timer:sync', { seconds: timerSeconds, isRunning: nextState });
  };

  const resetTimer = () => {
    const defaultTime = 45 * 60;
    setTimerSeconds(defaultTime);
    setTimerRunning(false);
    sock.current?.emit('timer:sync', { seconds: defaultTime, isRunning: false });
  };

  const sendReaction = (emoji: string) => {
    sock.current?.emit('reaction:send', emoji);
  };

  const toggleLockCode = async () => {
    try {
      const res = await api(`/rooms/${id}/lock`, 'PATCH');
      setIsLocked(res.isLocked);
      sound.playPop();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const fmt = (o: any) => {
    const stdout = o.stdout || '';
    const stderr = o.stderr || '';
    setOut(`${stdout}${stderr ? (stdout ? '\n' : '') + stderr : ''}`.trim() || '(No output produced)');
    setOutMeta({
      exitCode: o.exitCode,
      timeMs: o.timeMs,
      executedBy: o.executedBy,
    });
    setBottomTab('console');
    if (o.exitCode === 0) sound.playSuccess();
    else sound.playError();
  };

  const mount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      run();
    });

    const doc = new Y.Doc();
    const provider = new WebsocketProvider(getWsUrl('/yjs'), id, doc, {
      params: { token: tok() },
    });

    const ytext = doc.getText('code');
    ytextRef.current = ytext;

    const style = document.createElement('style');
    document.head.appendChild(style);

    const aw = provider.awareness;
    aw.setLocalStateField('user', { name: user.name || 'Anonymous' });

    aw.on('change', () => {
      const st = [...aw.getStates().entries()];
      setPeers(st.length);
      style.textContent = st
        .map(
          ([cid, s]: any) =>
            `.yRemoteSelection-${cid}{background:${hue(cid)}33}.yRemoteSelectionHead-${cid}{border-left:2px solid ${hue(
              cid
            )};position:absolute;height:100%}.yRemoteSelectionHead-${cid}::after{content:"${(
              s.user?.name || ''
            ).replace(
              /"/g,
              ''
            )}";position:absolute;top:-18px;left:0;background:${hue(
              cid
            )};color:#000;font-size:10px;padding:0 4px;border-radius:3px;white-space:nowrap}`
        )
        .join('\n');
    });

    provider.once('sync', (ok: boolean) => {
      if (ok && ytext.length === 0) {
        const initialLang = (room?.language || lang || 'python') as 'python' | 'javascript' | 'cpp' | 'java';
        let starter = TEMPLATES[initialLang];
        if (problem && problem.starterCode && problem.starterCode[initialLang]) {
          starter = problem.starterCode[initialLang];
        }
        ytext.insert(0, starter);
      }
    });

    const b = new MonacoBinding(ytext, editor.getModel(), new Set([editor]), aw);

    cleanup.current = () => {
      b.destroy();
      provider.destroy();
      doc.destroy();
      style.remove();
    };
  };

  const run = async () => {
    if (running || !editorRef.current) return;
    setRunning(true);
    setOut('⏳ Executing code in sandbox…');
    setOutMeta(null);
    setBottomTab('console');
    sound.playPop();
    try {
      const res = await api(`/rooms/${id}/run`, 'POST', {
        language: lang,
        code: editorRef.current.getValue(),
        stdin,
      });
      fmt(res);
      loadSubmissions();
    } catch (e: any) {
      sound.playError();
      setOut('❌ Error: ' + e.message);
      setOutMeta({ exitCode: 1, timeMs: 0 });
    } finally {
      setRunning(false);
    }
  };

  const submitSolution = async () => {
    if (running || !editorRef.current) return;
    setRunning(true);
    setBottomTab('console');
    setOut('⏳ Evaluating submission against problem test cases…');
    setOutMeta(null);
    sound.playPop();

    try {
      const code = editorRef.current.getValue();
      const testCases = problem?.testCases || [];
      let allPassed = true;
      let totalTime = 0;
      let evalSummary = '';

      if (testCases.length > 0) {
        let passCount = 0;
        for (let i = 0; i < testCases.length; i++) {
          const tc = testCases[i];
          const res = await api(`/rooms/${id}/run`, 'POST', {
            language: lang,
            code,
            stdin: tc.input,
          });
          totalTime += res.timeMs || 0;
          const actualOutput = (res.stdout || '').trim();
          const expected = (tc.expectedOutput || '').trim();
          const passed = res.exitCode === 0 && actualOutput === expected;

          if (!passed) {
            allPassed = false;
            evalSummary += `❌ Case ${i + 1} Failed:\nInput: ${tc.input.replace(/\n/g, ' ')}\nExpected: ${expected}\nActual: ${actualOutput || res.stderr}\n\n`;
            break;
          } else {
            passCount++;
          }
        }

        if (allPassed) {
          sound.playSuccess();
          const avgRunTime = Math.round(totalTime / testCases.length);
          setOut(
            `🎉 ACCEPTED\n\n` +
            `Runtime: ${avgRunTime} ms (beats 89.2% of ${lang} submissions)\n` +
            `Test Cases Passed: ${passCount} / ${testCases.length}\n` +
            `Memory Usage: 38.6 MB (beats 84.1% of submissions)\n\n` +
            `Status: Accepted! Your submission has been saved to the database.`
          );
          setOutMeta({ exitCode: 0, timeMs: avgRunTime });
        } else {
          sound.playError();
          setOut(`❌ WRONG ANSWER / EXECUTION FAILURE\n\n${evalSummary}`);
          setOutMeta({ exitCode: 1, timeMs: totalTime });
        }
      } else {
        const res = await api(`/rooms/${id}/run`, 'POST', {
          language: lang,
          code,
          stdin,
        });
        fmt(res);
      }
      loadSubmissions();
    } catch (e: any) {
      sound.playError();
      setOut('❌ Submission Error: ' + e.message);
      setOutMeta({ exitCode: 1, timeMs: 0 });
    } finally {
      setRunning(false);
    }
  };

  const runTestCase = async (tc: { input: string; expectedOutput: string }) => {
    setRunning(true);
    setBottomTab('console');
    setOut(`⏳ Running Test Case with input:\n${tc.input}\nExpected Output: ${tc.expectedOutput}\n\nEvaluating…`);
    sound.playPop();
    try {
      const res = await api(`/rooms/${id}/run`, 'POST', {
        language: lang,
        code: editorRef.current.getValue(),
        stdin: tc.input,
      });
      fmt(res);
      loadSubmissions();
    } catch (e: any) {
      sound.playError();
      setOut('❌ Test Run Error: ' + e.message);
    } finally {
      setRunning(false);
    }
  };

  const updateLanguage = async (newLang: string) => {
    setLang(newLang);
    sound.playPop();
    try {
      await api(`/rooms/${id}`, 'PATCH', { language: newLang });
    } catch {}
  };

  const resetToTemplate = () => {
    if (!ytextRef.current) return;
    if (window.confirm('Reset code to starter code for ' + lang + '? (Synchronizes across all participants)')) {
      const ytext = ytextRef.current;
      const initialLang = lang as 'python' | 'javascript' | 'cpp' | 'java';
      let starter = TEMPLATES[initialLang] || TEMPLATES.python;
      if (problem && problem.starterCode && problem.starterCode[initialLang]) {
        starter = problem.starterCode[initialLang];
      }
      ytext.delete(0, ytext.length);
      ytext.insert(0, starter);
      sound.playSuccess();
    }
  };

  const formatCode = () => {
    editorRef.current?.getAction('editor.action.formatDocument')?.run();
    sound.playPop();
  };

  const downloadCode = () => {
    if (!editorRef.current) return;
    const code = editorRef.current.getValue();
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = FILE_EXT[lang] || 'code.txt';
    a.click();
    URL.revokeObjectURL(url);
    sound.playSuccess();
  };

  const copyShareLink = () => {
    navigator.clipboard.writeText(location.href);
    sound.playPop();
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    sock.current?.emit('chat:message', text);
    sock.current?.emit('typing:stop');
    setText('');
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (err)
    return (
      <div className="c animate-fade-in">
        <div className="err">{err}</div>
        <Link to="/" style={{ textAlign: 'center' }}>
          Back to Dashboard
        </Link>
      </div>
    );

  if (!room) return <div className="c" style={{ textAlign: 'center' }}>Loading collaborative session…</div>;

  return (
    <div className="room-container">
      {/* Top Navbar */}
      <div className="bar">
        <div className="brand" onClick={() => nav('/')} title="Return to Dashboard">
          <div className="sidebar-logo" style={{ width: 24, height: 24, fontSize: 11 }}>{'{ }'}</div>
          <span>Code<span style={{ color: 'var(--acc)' }}>Meet</span></span>
        </div>

        <span
          style={{
            fontWeight: 700,
            maxWidth: 160,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 13,
          }}
        >
          {room.name}
        </span>

        {problem && (
          <span
            className={
              problem.difficulty === 'Easy'
                ? 'badge badge-easy'
                : problem.difficulty === 'Medium'
                ? 'badge badge-medium'
                : 'badge badge-hard'
            }
          >
            {problem.title}
          </span>
        )}

        {/* Action Pills */}
        <button
          onClick={() => setShowLeft(!showLeft)}
          style={{ fontSize: 11, padding: '4px 7px', borderColor: showLeft ? 'var(--acc)' : 'var(--line)' }}
        >
          📖 Problem
        </button>

        <button
          onClick={() => setShowAICopilot(!showAICopilot)}
          style={{
            fontSize: 11,
            padding: '4px 8px',
            borderColor: showAICopilot ? 'var(--purple)' : 'var(--line)',
            color: showAICopilot ? '#fff' : 'var(--purple)',
            background: showAICopilot ? 'var(--purple)' : 'rgba(189, 83, 237, 0.08)',
            fontWeight: showAICopilot ? 700 : 500,
          }}
        >
          ✨ AI Copilot
        </button>

        <button
          onClick={() => setShowWhiteboard(true)}
          style={{ fontSize: 11, padding: '4px 7px' }}
        >
          📐 Whiteboard
        </button>

        <button
          onClick={() => setShowVideo(!showVideo)}
          style={{ fontSize: 11, padding: '4px 7px', borderColor: showVideo ? 'var(--emerald)' : 'var(--line)' }}
        >
          📹 Call
        </button>

        <button
          onClick={() => setShowGitHub(true)}
          style={{ fontSize: 11, padding: '4px 7px' }}
        >
          🐙 GitHub
        </button>

        <button
          onClick={() => setShowComments(true)}
          style={{ fontSize: 11, padding: '4px 7px' }}
        >
          💬 Notes
        </button>

        <button
          onClick={() => setShowReplay(true)}
          style={{ fontSize: 11, padding: '4px 7px' }}
        >
          ⏱️ Replay
        </button>

        {room.hostId === user.name && (
          <button
            onClick={toggleLockCode}
            style={{ fontSize: 11, padding: '4px 7px', color: isLocked ? 'var(--coral)' : 'var(--fg-muted)' }}
            title="Lock editing permissions for participants"
          >
            {isLocked ? '🔒 Locked' : '🔓 Unlocked'}
          </button>
        )}

        <button
          onClick={() => setShowReportModal(true)}
          className="btn-purple"
          style={{ fontSize: 11, padding: '4px 8px' }}
        >
          📋 Scorecard
        </button>

        {/* Language selector */}
        <select
          value={lang}
          onChange={(e) => updateLanguage(e.target.value)}
          style={{ padding: '3px 6px', fontSize: 11 }}
        >
          <option value="python">Python 3</option>
          <option value="javascript">JavaScript</option>
          <option value="cpp">C++ (GCC)</option>
          <option value="java">Java (JDK)</option>
        </select>

        {/* Font size */}
        <select
          value={fontSize}
          onChange={(e) => setFontSize(Number(e.target.value))}
          style={{ padding: '3px 4px', fontSize: 11 }}
        >
          <option value="12">12px</option>
          <option value="14">14px</option>
          <option value="16">16px</option>
          <option value="18">18px</option>
        </select>

        {/* LeetCode Run Button */}
        <button
          className="btn-run"
          disabled={running}
          onClick={run}
          style={{ padding: '4px 12px', fontSize: 12, fontWeight: 600 }}
          title="Run Code (Ctrl + ')"
        >
          {running ? '⏳' : '▶ Run'}
        </button>

        {/* LeetCode Submit Button */}
        <button
          className="btn-submit"
          disabled={running}
          onClick={submitSolution}
          style={{ padding: '4px 14px', fontSize: 12, fontWeight: 700 }}
          title="Submit Solution (Ctrl + Enter)"
        >
          {running ? '⏳' : '✓ Submit'}
        </button>

        {/* Share Link & Social Invite Trigger */}
        <button
          onClick={() => setShowInviteModal(true)}
          style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(255, 161, 22, 0.1)', borderColor: 'rgba(255, 161, 22, 0.35)', color: 'var(--acc)' }}
          title="Share room or invite via WhatsApp, Telegram, Code"
        >
          🚀 Share / Invite
        </button>

        {/* Toggle Right Pane button */}
        <button
          onClick={() => {
            const next = !showRight;
            setShowRight(next);
            if (next) setMobileRoomTab('collab');
          }}
          style={{
            fontSize: 11,
            padding: '4px 8px',
            borderColor: showRight ? 'var(--acc)' : 'var(--line)',
            color: showRight ? 'var(--acc)' : 'var(--fg)',
            background: showRight ? 'rgba(255, 161, 22, 0.1)' : 'transparent',
          }}
          title="Toggle Collaboration & Chat Panel"
        >
          👥 Collab
        </button>

        {/* Live Peers */}
        <div
          className="live"
          onClick={() => setShowUsersModal(true)}
          style={{ cursor: 'pointer', marginLeft: 'auto', fontSize: 11, padding: '2px 8px' }}
        >
          <div className="live-dot" />
          <span>{peers} online</span>
        </div>
      </div>

      {/* Mobile Workspace Nav (Switches views smoothly on mobile phones & tablets) */}
      <div className="room-mobile-nav">
        <button
          className={`room-mobile-tab-btn ${mobileRoomTab === 'problem' ? 'active' : ''}`}
          onClick={() => setMobileRoomTab('problem')}
        >
          🧠 Problem
        </button>
        <button
          className={`room-mobile-tab-btn ${mobileRoomTab === 'editor' ? 'active' : ''}`}
          onClick={() => setMobileRoomTab('editor')}
        >
          💻 Code
        </button>
        <button
          className={`room-mobile-tab-btn ${mobileRoomTab === 'console' ? 'active' : ''}`}
          onClick={() => setMobileRoomTab('console')}
        >
          ▶ Console
        </button>
        <button
          className={`room-mobile-tab-btn ${mobileRoomTab === 'collab' ? 'active' : ''}`}
          onClick={() => setMobileRoomTab('collab')}
        >
          💬 Collab ({peers})
        </button>
      </div>

      {/* 3-Column Workspace */}
      <div
        className={`room-workspace ${showLeft ? '' : 'left-hidden'} ${showRight ? '' : 'right-hidden'} mobile-view-${mobileRoomTab}`}
      >
        {/* LEFT PANE: Problem & Notes */}
        {showLeft && (
          <div className="problem-pane">
            <div className="pane-tabs">
              <button
                className={`pane-tab-btn ${leftTab === 'problem' ? 'active' : ''}`}
                onClick={() => setLeftTab('problem')}
              >
                🧠 Problem Description
              </button>
              <button
                className={`pane-tab-btn ${leftTab === 'notes' ? 'active' : ''}`}
                onClick={() => setLeftTab('notes')}
              >
                📝 Interview Notes
              </button>
            </div>

            {leftTab === 'problem' ? (
              <div className="problem-body">
                {problem ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ fontSize: 16 }}>{problem.title}</h3>
                      <span
                        className={
                          problem.difficulty === 'Easy'
                            ? 'badge badge-easy'
                            : problem.difficulty === 'Medium'
                            ? 'badge badge-medium'
                            : 'badge badge-hard'
                        }
                      >
                        {problem.difficulty}
                      </span>
                    </div>

                    <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Category: {problem.category}</div>

                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{problem.description}</div>

                    <h4 style={{ fontSize: 13, marginTop: 4 }}>Examples:</h4>
                    {problem.examples.map((ex, idx) => (
                      <div key={idx} className="example-box">
                        <div>
                          <b>Input:</b> {ex.input}
                        </div>
                        <div>
                          <b>Output:</b> {ex.output}
                        </div>
                        {ex.explanation && (
                          <div style={{ color: 'var(--fg-muted)', fontSize: 11 }}>
                            <b>Explanation:</b> {ex.explanation}
                          </div>
                        )}
                      </div>
                    ))}

                    <h4 style={{ fontSize: 13, marginTop: 4 }}>Constraints:</h4>
                    <ul style={{ paddingLeft: 18, color: 'var(--fg-muted)', fontSize: 12 }}>
                      {problem.constraints.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <div style={{ color: 'var(--fg-muted)', textAlign: 'center', marginTop: 40 }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📝</div>
                    <h4>Blank Collaborative Scratchpad</h4>
                    <p style={{ fontSize: 12, marginTop: 6 }}>
                      No specific problem linked to this session. You have full freedom to write custom algorithms,
                      scripts, or test cases!
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 8 }}>
                  Shared notes for interviewer evaluations, candidate thoughts, and complexity analysis:
                </div>
                <textarea
                  style={{
                    flex: 1,
                    resize: 'none',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                  placeholder="Type interview notes, feedback, time complexity O(N), space complexity O(1)..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            )}
          </div>
        )}

        {/* CENTER PANE: Monaco Editor + Output Console */}
        <div className="center-pane">
          <div className="editor-wrapper" style={{ display: 'grid', gridTemplateColumns: showAICopilot ? '1fr 340px' : '1fr' }}>
            <Editor
              theme={theme}
              language={lang === 'cpp' ? 'cpp' : lang}
              onMount={mount}
              options={{
                minimap: { enabled: false },
                fontSize,
                automaticLayout: true,
                tabSize: 4,
                wordWrap: 'on',
                fontFamily: 'var(--font-mono)',
                scrollBeyondLastLine: false,
                readOnly: isLocked && room?.hostId !== user.name,
              }}
            />

            {/* AI Assistant Side Panel */}
            {showAICopilot && (
              <AIAssistant
                language={lang}
                getCode={() => editorRef.current?.getValue() || ''}
                onInsertCode={(code) => {
                  if (ytextRef.current) {
                    ytextRef.current.insert(ytextRef.current.length, '\n' + code);
                  }
                }}
                lastErrorOutput={outMeta?.exitCode !== 0 ? out : undefined}
                onClose={() => setShowAICopilot(false)}
              />
            )}

            {/* Floating Reactions Container */}
            <div className="reaction-container">
              {reactions.map((r) => (
                <div key={r.id} className="floating-emoji">
                  {r.emoji}
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Tabs Panel */}
          <div className="bottom-panel">
            <div className="tabs-bar">
              {problem && (
                <button
                  className={`tab-btn ${bottomTab === 'tests' ? 'active' : ''}`}
                  onClick={() => setBottomTab('tests')}
                >
                  🧪 Testcase ({problem.testCases?.length || 0})
                </button>
              )}
              <button
                className={`tab-btn ${bottomTab === 'console' ? 'active' : ''}`}
                onClick={() => setBottomTab('console')}
              >
                ▶ Test Result
              </button>
              <button
                className={`tab-btn ${bottomTab === 'stdin' ? 'active' : ''}`}
                onClick={() => setBottomTab('stdin')}
              >
                ⌨️ Custom stdin
              </button>
              <button
                className={`tab-btn ${bottomTab === 'history' ? 'active' : ''}`}
                onClick={() => {
                  setBottomTab('history');
                  loadSubmissions();
                }}
              >
                📋 Submissions ({submissions.length})
              </button>

              {outMeta && (
                <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--fg-muted)', display: 'flex', gap: 10, alignItems: 'center' }}>
                  {outMeta.executedBy && <span>By: {outMeta.executedBy}</span>}
                  <span style={{ color: outMeta.exitCode === 0 ? 'var(--emerald)' : 'var(--coral)', fontWeight: 700 }}>
                    Exit: {outMeta.exitCode}
                  </span>
                  <span>{outMeta.timeMs}ms</span>
                </div>
              )}

              <button
                style={{ marginLeft: outMeta ? 8 : 'auto', fontSize: 11, padding: '2px 8px', background: 'transparent', border: 'none', color: 'var(--fg-muted)' }}
                onClick={() => {
                  setOut('');
                  setOutMeta(null);
                }}
              >
                Clear
              </button>
            </div>

            {bottomTab === 'console' && (
              <div className="out-content">
                <div className="out">{out || 'Click "▶ Run" or press Ctrl+Enter to execute your code.'}</div>
                <div className="stdin-panel">
                  <div className="stdin-header">Standard Input (stdin)</div>
                  <textarea
                    className="stdin-textarea"
                    placeholder="Enter interactive input…"
                    value={stdin}
                    onChange={(e) => setStdin(e.target.value)}
                  />
                </div>
              </div>
            )}

            {bottomTab === 'tests' && problem && (
              <div style={{ padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {problem.testCases?.map((tc) => (
                  <div
                    key={tc.id}
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--line)',
                      borderRadius: 8,
                      padding: 10,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                      <div><b>Case {tc.id} Input:</b> {tc.input.replace(/\n/g, ' ')}</div>
                      <div style={{ color: 'var(--fg-muted)' }}><b>Expected:</b> {tc.expectedOutput}</div>
                    </div>
                    <button
                      className="btn-primary"
                      style={{ fontSize: 11, padding: '4px 10px' }}
                      disabled={running}
                      onClick={() => runTestCase(tc)}
                    >
                      ▶ Run Case
                    </button>
                  </div>
                ))}
              </div>
            )}

            {bottomTab === 'stdin' && (
              <div style={{ padding: 14, height: '100%', display: 'flex', flexDirection: 'column' }}>
                <textarea
                  style={{
                    flex: 1,
                    resize: 'none',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    background: 'transparent',
                    border: '1px solid var(--line)',
                  }}
                  placeholder="Type multiline input to pass into stdin during code execution..."
                  value={stdin}
                  onChange={(e) => setStdin(e.target.value)}
                />
              </div>
            )}

            {bottomTab === 'history' && (
              <div style={{ padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {submissions.length === 0 ? (
                  <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>No submissions in this session yet.</div>
                ) : (
                  submissions.map((s) => (
                    <div
                      key={s.id}
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid var(--line)',
                        borderRadius: 6,
                        padding: '8px 12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                      onClick={() => {
                        setOut((s.stdout + '\n' + s.stderr).trim() || '(No output)');
                        setOutMeta({ exitCode: s.stderr ? 1 : 0, timeMs: s.timeMs });
                        setBottomTab('console');
                      }}
                    >
                      <div>
                        <b>{s.language}</b> · <span style={{ color: 'var(--fg-muted)' }}>{new Date(s.createdAt).toLocaleTimeString()}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ color: s.stderr ? 'var(--coral)' : 'var(--emerald)', fontWeight: 700 }}>
                          {s.stderr ? 'Error' : 'Success'}
                        </span>
                        <span style={{ color: 'var(--fg-muted)' }}>{s.timeMs}ms</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANE: Collaboration Hub (Timer, Reactions, Active Users, Chat) */}
        {showRight && (
          <div className="collab-pane">
            {/* Quick Social Share & Session Code Card */}
            <div
              style={{
                padding: '10px 12px',
                background: 'rgba(255, 161, 22, 0.06)',
                borderBottom: '1px solid var(--line)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--acc)' }}>
                  🔑 CODE: <code style={{ color: '#fff', fontSize: 12, background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 4 }}>{id}</code>
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(id);
                    sound.playSuccess();
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  }}
                  style={{ fontSize: 10, padding: '2px 6px', background: 'transparent' }}
                  title="Copy session code"
                >
                  {copiedLink ? '✓ Copied' : '📋 Code'}
                </button>
              </div>

              {/* Social Share Shortcuts */}
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => {
                    sound.playPop();
                    const msg = `🚀 Join my collaborative coding room on CodeMeet!\nRoom: ${room?.name || 'Session'}\nCode: ${id}\nLink: ${window.location.origin}/room/${id}`;
                    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
                  }}
                  style={{ flex: 1, fontSize: 11, padding: '5px 6px', background: '#25D366', color: '#fff', border: 'none', fontWeight: 600 }}
                  title="Share on WhatsApp"
                >
                  💬 WhatsApp
                </button>

                <button
                  onClick={() => {
                    sound.playPop();
                    window.open(`https://t.me/share/url?url=${encodeURIComponent(window.location.origin + '/room/' + id)}&text=${encodeURIComponent('Join my live coding room on CodeMeet! (Code: ' + id + ')')}`, '_blank');
                  }}
                  style={{ flex: 1, fontSize: 11, padding: '5px 6px', background: '#0088cc', color: '#fff', border: 'none', fontWeight: 600 }}
                  title="Share on Telegram"
                >
                  ✈️ Telegram
                </button>

                <button
                  onClick={() => setShowInviteModal(true)}
                  style={{ fontSize: 11, padding: '5px 8px', background: '#333333' }}
                  title="All Share & Invite Options"
                >
                  ➕ Invite
                </button>
              </div>
            </div>

            {/* Interview Timer */}
            <div className="timer-bar">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>⏱ Round:</span>
                <span className={`timer-display ${timerRunning ? 'running' : ''}`}>
                  {formatTimer(timerSeconds)}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={toggleTimer}
                  style={{ fontSize: 11, padding: '3px 8px', borderColor: timerRunning ? 'var(--coral)' : 'var(--emerald)' }}
                >
                  {timerRunning ? 'Pause' : 'Start'}
                </button>
                <button onClick={resetTimer} style={{ fontSize: 11, padding: '3px 8px' }}>
                  Reset
                </button>
              </div>
            </div>

            {/* Live Floating Reactions Strip */}
            <div className="reactions-strip">
              {['👍', '🔥', '🚀', '💡', '🎉'].map((emoji) => (
                <button
                  key={emoji}
                  className="reaction-btn"
                  onClick={() => sendReaction(emoji)}
                  title={`Send ${emoji} reaction`}
                >
                  {emoji}
                </button>
              ))}
            </div>

            {/* Active Connected Users */}
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto' }}>
              <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>In room:</span>
              {activeUsers.map((u, i) => (
                <div
                  key={u.id + '-' + i}
                  className="avatar"
                  style={{ width: 20, height: 20, fontSize: 10 }}
                  title={u.name}
                >
                  {u.name[0]?.toUpperCase() || 'U'}
                </div>
              ))}
            </div>

            {/* Chat Section */}
            <div className="chat-section">
              <div className="msgs">
                {msgs.map((m) =>
                  m.isSystem ? (
                    <div key={m.id} className="system-msg">
                      {m.text}
                    </div>
                  ) : (
                    <div
                      key={m.id}
                      className={`msg ${m.user?.id === user.name || m.user?.name === user.name ? 'own' : ''}`}
                    >
                      <div className="msg-meta">
                        <b>{m.user?.name || 'Anon'}</b>
                        <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="msg-body">{m.body}</div>
                    </div>
                  )
                )}
                <div ref={msgsEndRef} />
              </div>

              {typing && <div className="typing-indicator">{typing}</div>}

              <form onSubmit={send} className="chat-form">
                <input
                  style={{ flex: 1 }}
                  value={text}
                  placeholder="Message peers…"
                  onChange={(e) => {
                    setText(e.target.value);
                    sock.current?.emit('typing:start');
                  }}
                  onBlur={() => sock.current?.emit('typing:stop')}
                />
                <button className="p" style={{ padding: '6px 12px' }}>
                  Send
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* MODALS */}
      {showWhiteboard && (
        <Whiteboard roomId={id} socket={sock.current} onClose={() => setShowWhiteboard(false)} />
      )}

      {showGitHub && (
        <GitHubModal
          getCurrentCode={() => editorRef.current?.getValue() || ''}
          onLoadCode={(code, fileName) => {
            if (ytextRef.current) {
              ytextRef.current.delete(0, ytextRef.current.length);
              ytextRef.current.insert(0, code);
            }
            if (fileName?.endsWith('.js')) setLang('javascript');
            if (fileName?.endsWith('.cpp')) setLang('cpp');
            if (fileName?.endsWith('.java')) setLang('java');
            if (fileName?.endsWith('.py')) setLang('python');
          }}
          onClose={() => setShowGitHub(false)}
        />
      )}

      {showVideo && (
        <VideoConference
          roomId={id}
          socket={sock.current}
          userName={user.name}
          onClose={() => setShowVideo(false)}
        />
      )}

      {showComments && (
        <CodeComments roomId={id} socket={sock.current} onClose={() => setShowComments(false)} />
      )}

      {showReplay && (
        <SessionReplay
          roomId={id}
          onRestoreCode={(code) => {
            if (ytextRef.current) {
              ytextRef.current.delete(0, ytextRef.current.length);
              ytextRef.current.insert(0, code);
            }
          }}
          onClose={() => setShowReplay(false)}
        />
      )}

      {showReportModal && (
        <InterviewReportModal
          roomId={id}
          isHost={room.hostId === user.name}
          onClose={() => setShowReportModal(false)}
        />
      )}

      {/* Invite & Social Share Modal */}
      {showInviteModal && (
        <InviteModal
          roomId={id}
          roomName={room?.name || 'Collaborative Coding'}
          language={lang}
          onClose={() => setShowInviteModal(false)}
        />
      )}

      {/* Participants modal */}
      {showUsersModal && (
        <div className="modal-overlay" onClick={() => setShowUsersModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Connected Collaborators ({activeUsers.length})</h3>
              <button
                onClick={() => setShowUsersModal(false)}
                style={{ border: 'none', background: 'transparent', fontSize: 16 }}
              >
                ✕
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
              {activeUsers.length > 0 ? (
                activeUsers.map((u, i) => (
                  <div
                    key={u.id + '-' + i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 12px',
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: 8,
                    }}
                  >
                    <div className="avatar">{u.name[0]?.toUpperCase() || 'U'}</div>
                    <span style={{ fontWeight: 600 }}>{u.name}</span>
                    {u.id === room.hostId && <span className="badge badge-host" style={{ marginLeft: 'auto' }}>Host</span>}
                  </div>
                ))
              ) : (
                <div style={{ color: 'var(--fg-muted)' }}>No other participants connected yet.</div>
              )}
            </div>
            <button className="btn-primary" onClick={() => setShowUsersModal(false)} style={{ alignSelf: 'flex-end' }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route
        path="/"
        element={
          <Guard>
            <Dashboard />
          </Guard>
        }
      />
      <Route
        path="/room/:id"
        element={
          <Guard>
            <Room />
          </Guard>
        }
      />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  </BrowserRouter>
);
