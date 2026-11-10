import React, { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { CodeCommentItem } from '../types';
import { sound } from '../sound';
import { API_BASE } from '../config';

interface CodeCommentsProps {
  roomId: string;
  socket?: Socket;
  onClose: () => void;
}

export function CodeComments({ roomId, socket, onClose }: CodeCommentsProps) {
  const [comments, setComments] = useState<CodeCommentItem[]>([]);
  const [lineNum, setLineNum] = useState<number>(1);
  const [newComment, setNewComment] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const loadComments = () => {
    fetch(`${API_BASE}/rooms/${roomId}/comments`, {
      headers: { Authorization: 'Bearer ' + (localStorage.getItem('token') || '') },
    })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setComments(data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadComments();

    if (socket) {
      socket.on('comment:added', (c: CodeCommentItem) => {
        setComments((prev) => [...prev, c]);
        sound.playPop();
      });

      socket.on('comment:resolved', (c: CodeCommentItem) => {
        setComments((prev) => prev.map((item) => (item.id === c.id ? c : item)));
      });
    }

    return () => {
      socket?.off('comment:added');
      socket?.off('comment:resolved');
    };
  }, [roomId, socket]);

  const addComment = async () => {
    if (!newComment.trim() || loading) return;
    setLoading(true);
    sound.playPop();
    try {
      const res = await fetch(`${API_BASE}/rooms/${roomId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + (localStorage.getItem('token') || ''),
        },
        body: JSON.stringify({
          lineNumber: Number(lineNum),
          comment: newComment,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to post comment');
      setNewComment('');
      sound.playSuccess();
    } catch (e: any) {
      sound.playError();
      alert('Error: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const resolveComment = async (id: string) => {
    try {
      await fetch(`${API_BASE}/rooms/${roomId}/comments/${id}/resolve`, {
        method: 'PATCH',
        headers: { Authorization: 'Bearer ' + (localStorage.getItem('token') || '') },
      });
      sound.playSuccess();
    } catch {}
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600, height: '70vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: 16 }}>💬 Code Review & Line Discussions</h3>
            <div style={{ fontSize: 11, color: 'var(--mut)' }}>Leave feedback and discuss code lines collaboratively</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 16 }}>
            ✕
          </button>
        </div>

        {/* Comments stream */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: 4 }}>
          {comments.length === 0 ? (
            <div style={{ color: 'var(--mut)', textAlign: 'center', marginTop: 40, fontSize: 13 }}>
              No line comments yet. Add a review note below!
            </div>
          ) : (
            comments.map((c) => (
              <div
                key={c.id}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  padding: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  opacity: c.status === 'RESOLVED' ? 0.6 : 1,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="badge badge-lang">Line {c.lineNumber}</span>
                    <b>{c.userName}</b>
                    <span style={{ color: 'var(--mut)' }}>{new Date(c.createdAt).toLocaleTimeString()}</span>
                  </div>
                  {c.status === 'OPEN' ? (
                    <button
                      onClick={() => resolveComment(c.id)}
                      style={{ fontSize: 10, padding: '2px 8px', color: 'var(--success)' }}
                    >
                      ✓ Resolve
                    </button>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--success)' }}>✓ Resolved</span>
                  )}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.5 }}>{c.comment}</div>
              </div>
            ))
          )}
        </div>

        {/* New Comment Input */}
        <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--mut)' }}>Line:</span>
            <input
              type="number"
              min={1}
              value={lineNum}
              onChange={(e) => setLineNum(Number(e.target.value))}
              style={{ width: 60, fontSize: 12 }}
            />
          </div>
          <input
            style={{ flex: 1, fontSize: 12 }}
            placeholder="Add a review comment on this line..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addComment()}
          />
          <button className="btn-primary" onClick={addComment} disabled={loading || !newComment.trim()}>
            Post Note
          </button>
        </div>
      </div>
    </div>
  );
}
