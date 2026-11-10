import React, { useEffect, useState } from 'react';
import { CodeSnapshotItem } from '../types';
import { sound } from '../sound';

interface SessionReplayProps {
  roomId: string;
  onRestoreCode: (code: string) => void;
  onClose: () => void;
}

export function SessionReplay({ roomId, onRestoreCode, onClose }: SessionReplayProps) {
  const [snapshots, setSnapshots] = useState<CodeSnapshotItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetch(`/api/v1/rooms/${roomId}/snapshots`, {
      headers: { Authorization: 'Bearer ' + (localStorage.getItem('token') || '') },
    })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setSnapshots(data);
          if (data.length > 0) setCurrentIndex(data.length - 1);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [roomId]);

  const activeSnapshot = snapshots[currentIndex] || null;

  const exportSummary = async () => {
    try {
      const res = await fetch(`/api/v1/rooms/${roomId}/export-summary`, {
        headers: { Authorization: 'Bearer ' + (localStorage.getItem('token') || '') },
      });
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `session-summary-${roomId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      sound.playSuccess();
    } catch {}
  };

  const handleRestore = () => {
    if (activeSnapshot) {
      if (window.confirm('Restore this historical code snapshot into the editor?')) {
        onRestoreCode(activeSnapshot.code);
        sound.playSuccess();
        onClose();
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 780, height: '80vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: 16 }}>⏱️ Session Recording & Code Timeline Replay</h3>
            <div style={{ fontSize: 11, color: 'var(--mut)' }}>Scrub through the session timeline to review code evolution</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={exportSummary} style={{ fontSize: 11, padding: '4px 8px' }}>
              📥 Export Session Summary
            </button>
            <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 16 }}>
              ✕
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ color: 'var(--mut)', textAlign: 'center', padding: 40 }}>Loading snapshot timeline…</div>
        ) : snapshots.length === 0 ? (
          <div style={{ color: 'var(--mut)', textAlign: 'center', padding: 40, fontSize: 13 }}>
            No snapshots recorded yet. Run code or save snapshots to build the replay timeline!
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
            {/* Timeline Slider */}
            <div style={{ background: 'rgba(0,0,0,0.25)', padding: 12, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span>
                  Snapshot <b>{currentIndex + 1}</b> of {snapshots.length}
                </span>
                <span style={{ color: 'var(--mut)' }}>
                  {activeSnapshot && new Date(activeSnapshot.createdAt).toLocaleTimeString()} ({activeSnapshot?.userName})
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={snapshots.length - 1}
                value={currentIndex}
                onChange={(e) => setCurrentIndex(Number(e.target.value))}
                style={{ width: '100%', cursor: 'pointer' }}
              />
              {activeSnapshot?.label && (
                <div style={{ fontSize: 11, color: 'var(--acc)' }}>Label: {activeSnapshot.label}</div>
              )}
            </div>

            {/* Code Preview */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                background: '#090d16',
                border: '1px solid var(--line)',
                borderRadius: 8,
                padding: 12,
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                color: '#d1d7e0',
              }}
            >
              {activeSnapshot?.code}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={onClose}>Close</button>
              <button className="btn-purple" onClick={handleRestore}>
                ↩ Restore This Version to Editor
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
