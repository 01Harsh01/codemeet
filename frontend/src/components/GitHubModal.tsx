import React, { useEffect, useState } from 'react';
import { sound } from '../sound';

interface GitHubModalProps {
  getCurrentCode: () => string;
  onLoadCode: (code: string, fileName?: string) => void;
  onClose: () => void;
}

export function GitHubModal({ getCurrentCode, onLoadCode, onClose }: GitHubModalProps) {
  const [token, setToken] = useState<string>('');
  const [connectedUser, setConnectedUser] = useState<string | null>(null);
  const [repos, setRepos] = useState<any[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<any | null>(null);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [commitMsg, setCommitMsg] = useState<string>('Update code from CodeMeet');
  const [activeFile, setActiveFile] = useState<any | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>('');

  useEffect(() => {
    // Check if user already connected
    fetch('/api/v1/auth/me', {
      headers: { Authorization: 'Bearer ' + (localStorage.getItem('token') || '') },
    })
      .then((r) => r.json())
      .then((u) => {
        if (u.githubUsername) {
          setConnectedUser(u.githubUsername);
          loadRepos();
        }
      })
      .catch(() => {});
  }, []);

  const connectToken = async () => {
    if (!token.trim()) return;
    setLoading(true);
    sound.playPop();
    try {
      const res = await fetch('/api/v1/github/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + (localStorage.getItem('token') || ''),
        },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Connection failed');
      setConnectedUser(data.username);
      sound.playSuccess();
      loadRepos();
    } catch (e: any) {
      sound.playError();
      alert('GitHub error: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadRepos = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/github/repos', {
        headers: { Authorization: 'Bearer ' + (localStorage.getItem('token') || '') },
      });
      const data = await res.json();
      if (Array.isArray(data)) setRepos(data);
    } catch {}
    setLoading(false);
  };

  const openRepo = async (repo: any, path = '') => {
    setSelectedRepo(repo);
    setCurrentPath(path);
    setLoading(true);
    sound.playPop();
    try {
      const res = await fetch(`/api/v1/github/contents?owner=${repo.owner.login}&repo=${repo.name}&path=${path}`, {
        headers: { Authorization: 'Bearer ' + (localStorage.getItem('token') || '') },
      });
      const data = await res.json();
      if (Array.isArray(data)) setFiles(data);
    } catch {}
    setLoading(false);
  };

  const loadFile = async (file: any) => {
    setLoading(true);
    sound.playPop();
    try {
      const res = await fetch(
        `/api/v1/github/file?owner=${selectedRepo.owner.login}&repo=${selectedRepo.name}&path=${file.path}`,
        {
          headers: { Authorization: 'Bearer ' + (localStorage.getItem('token') || '') },
        }
      );
      const data = await res.json();
      if (data.content !== undefined) {
        onLoadCode(data.content, file.name);
        setActiveFile({ ...file, sha: data.sha });
        setStatusMsg(`✓ Loaded '${file.name}' into Monaco Editor!`);
        sound.playSuccess();
      }
    } catch (e: any) {
      sound.playError();
      alert('Error fetching file: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const commitChanges = async () => {
    if (!selectedRepo || !activeFile) {
      alert('Please load a file from a repository before committing changes.');
      return;
    }
    setLoading(true);
    sound.playPop();
    try {
      const res = await fetch('/api/v1/github/commit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + (localStorage.getItem('token') || ''),
        },
        body: JSON.stringify({
          owner: selectedRepo.owner.login,
          repo: selectedRepo.name,
          path: activeFile.path,
          content: getCurrentCode(),
          message: commitMsg,
          branch: selectedRepo.default_branch || 'main',
          sha: activeFile.sha,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to commit changes');
      setStatusMsg(`🚀 Successfully committed changes to ${activeFile.path}!`);
      sound.playSuccess();
    } catch (e: any) {
      sound.playError();
      alert('Commit failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720, height: '78vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 22 }}>🐙</span>
            <div>
              <h3 style={{ fontSize: 16 }}>GitHub Integration & Repositories</h3>
              <div style={{ fontSize: 11, color: 'var(--mut)' }}>Import, edit, and push code directly to GitHub</div>
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 16 }}>
            ✕
          </button>
        </div>

        {statusMsg && <div className="success-banner">{statusMsg}</div>}

        {!connectedUser ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 10 }}>
            <p style={{ fontSize: 13, color: 'var(--mut)' }}>
              Connect your GitHub account using a GitHub Personal Access Token (with <code>repo</code> scope) to import code into sessions and commit back.
            </p>
            <input
              type="password"
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx (GitHub Personal Access Token)"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <button className="btn-primary" onClick={connectToken} disabled={loading || !token.trim()}>
              {loading ? 'Connecting…' : 'Securely Connect GitHub'}
            </button>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '6px 12px', borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <span>Connected as:</span>
                <b>@{connectedUser}</b>
              </div>
              <button onClick={loadRepos} style={{ fontSize: 11, padding: '3px 8px' }}>
                🔄 Refresh Repos
              </button>
            </div>

            {/* Repos / Files View */}
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '240px 1fr', gap: 10, overflow: 'hidden' }}>
              {/* Repos list */}
              <div style={{ overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 11, color: 'var(--mut)', fontWeight: 600, padding: '2px 4px' }}>YOUR REPOSITORIES</div>
                {repos.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => openRepo(r)}
                    style={{
                      padding: '6px 8px',
                      borderRadius: 6,
                      fontSize: 12,
                      cursor: 'pointer',
                      background: selectedRepo?.id === r.id ? 'var(--acc-glow)' : 'transparent',
                      color: selectedRepo?.id === r.id ? 'var(--acc)' : 'inherit',
                    }}
                  >
                    📦 {r.name}
                  </div>
                ))}
              </div>

              {/* Files list / Commit box */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
                <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: 8 }}>
                  {selectedRepo ? (
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--mut)', marginBottom: 6 }}>
                        Path: <code>{selectedRepo.name}/{currentPath}</code>
                      </div>
                      {files.map((f) => (
                        <div
                          key={f.path}
                          onClick={() => (f.type === 'dir' ? openRepo(selectedRepo, f.path) : loadFile(f))}
                          style={{
                            padding: '6px 8px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: 12,
                            cursor: 'pointer',
                            borderRadius: 4,
                          }}
                        >
                          <span>{f.type === 'dir' ? '📁' : '📄'} {f.name}</span>
                          {f.type === 'file' && <button style={{ fontSize: 10, padding: '2px 6px' }}>Load</button>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: 'var(--mut)', textAlign: 'center', marginTop: 40, fontSize: 12 }}>
                      Select a repository on the left to browse and load code files into the editor.
                    </div>
                  )}
                </div>

                {/* Commit box */}
                {activeFile && (
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)', borderRadius: 8, padding: 8, display: 'flex', gap: 8 }}>
                    <input
                      style={{ flex: 1, fontSize: 12 }}
                      placeholder="Commit message"
                      value={commitMsg}
                      onChange={(e) => setCommitMsg(e.target.value)}
                    />
                    <button className="btn-primary" onClick={commitChanges} disabled={loading} style={{ fontSize: 11 }}>
                      Commit & Push
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
