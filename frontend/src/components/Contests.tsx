import React, { useEffect, useState } from 'react';
import { ContestItem, ContestSubmissionItem } from '../types';
import { PROBLEMS } from '../problems';
import { sound } from '../sound';
import { API_BASE } from '../config';

interface ContestsProps {
  onJoinContest: (contest: ContestItem) => void;
}

export function Contests({ onJoinContest }: ContestsProps) {
  const [contests, setContests] = useState<ContestItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [title, setTitle] = useState<string>('');
  const [problemId, setProblemId] = useState<string>(PROBLEMS[0]?.id || 'two-sum');
  const [duration, setDuration] = useState<number>(45);

  const loadContests = () => {
    setLoading(true);
    fetch(`${API_BASE}/contests`, {
      headers: { Authorization: 'Bearer ' + (localStorage.getItem('token') || '') },
    })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setContests(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadContests();
  }, []);

  const createContest = async () => {
    if (!title.trim()) return;
    sound.playPop();
    try {
      const res = await fetch(`${API_BASE}/contests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + (localStorage.getItem('token') || ''),
        },
        body: JSON.stringify({
          title,
          durationMinutes: Number(duration),
          problemId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create contest');
      setShowCreateModal(false);
      setTitle('');
      sound.playSuccess();
      loadContests();
    } catch (e: any) {
      sound.playError();
      alert('Error: ' + e.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 700 }}>⚔️ Coding Battles & Competitive Arena</h3>
          <p style={{ color: 'var(--mut)', fontSize: 13 }}>
            Compete in timed coding challenges with real-time server-side test case evaluation and live leaderboards.
          </p>
        </div>
        <button className="btn-purple" onClick={() => setShowCreateModal(true)}>
          ➕ Host a Coding Battle
        </button>
      </div>

      {/* Contests Grid */}
      <div className="rooms-grid">
        {contests.length === 0 ? (
          <div className="card" style={{ color: 'var(--mut)', textAlign: 'center', padding: 32, gridColumn: '1 / -1' }}>
            No active coding battles right now. Host a new contest above to challenge your peers!
          </div>
        ) : (
          contests.map((c) => (
            <div key={c.id} className="room-card" onClick={() => onJoinContest(c)}>
              <div className="room-card-head">
                <span className="room-card-title">{c.title}</span>
                <span className="badge badge-easy">Live Arena</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--mut)' }}>
                Problem: <b>{PROBLEMS.find((p) => p.id === c.problemId)?.title || c.problemId}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginTop: 4 }}>
                <span style={{ color: 'var(--mut)' }}>⏱ {c.durationMinutes} mins</span>
                <span className="badge badge-lang">Hosted by {c.creatorName}</span>
              </div>
              <button className="btn-primary" style={{ fontSize: 12, padding: '6px 12px', marginTop: 4 }}>
                Enter Battle Arena ⚔️
              </button>
            </div>
          ))
        )}
      </div>

      {/* Create Contest Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Host a Coding Battle</h3>
              <button onClick={() => setShowCreateModal(false)} style={{ border: 'none', background: 'transparent', fontSize: 16 }}>
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                placeholder="Competition Title (e.g. Algorithmic Sprint #1)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />

              <div style={{ display: 'flex', gap: 8 }}>
                <select value={problemId} onChange={(e) => setProblemId(e.target.value)} style={{ flex: 1.5 }}>
                  {PROBLEMS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} ({p.difficulty})
                    </option>
                  ))}
                </select>

                <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} style={{ flex: 1 }}>
                  <option value="15">15 Minutes</option>
                  <option value="30">30 Minutes</option>
                  <option value="45">45 Minutes</option>
                  <option value="60">60 Minutes</option>
                </select>
              </div>

              <button className="btn-purple" onClick={createContest} disabled={!title.trim()}>
                🚀 Publish & Start Competition
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ContestArena({ contest, onClose }: { contest: ContestItem; onClose: () => void }) {
  const [details, setDetails] = useState<ContestItem>(contest);
  const [submissions, setSubmissions] = useState<ContestSubmissionItem[]>([]);
  const problem = PROBLEMS.find((p) => p.id === contest.problemId) || PROBLEMS[0];

  useEffect(() => {
    fetch(`${API_BASE}/contests/${contest.id}`, {
      headers: { Authorization: 'Bearer ' + (localStorage.getItem('token') || '') },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d) {
          setDetails(d);
          if (Array.isArray(d.submissions)) setSubmissions(d.submissions);
        }
      })
      .catch(() => {});
  }, [contest.id]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 740, height: '80vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3>⚔️ {details.title} (Live Leaderboard)</h3>
            <div style={{ fontSize: 12, color: 'var(--mut)' }}>Challenge: {problem.title} · {details.durationMinutes} mins round</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 16 }}>
            ✕
          </button>
        </div>

        {/* Live Leaderboard */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 100px 100px 100px', padding: '6px 12px', fontSize: 11, color: 'var(--mut)', fontWeight: 700, borderBottom: '1px solid var(--line)' }}>
            <span>RANK</span>
            <span>USER</span>
            <span>SCORE</span>
            <span>TEST CASES</span>
            <span>TIME</span>
          </div>

          {submissions.length === 0 ? (
            <div style={{ color: 'var(--mut)', textAlign: 'center', marginTop: 40, fontSize: 13 }}>
              No submissions recorded yet for this battle. Be the first to submit a solution!
            </div>
          ) : (
            submissions.map((s, idx) => (
              <div
                key={s.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 1fr 100px 100px 100px',
                  alignItems: 'center',
                  padding: '8px 12px',
                  background: idx === 0 ? 'rgba(210, 153, 34, 0.15)' : 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  fontSize: 13,
                }}
              >
                <span style={{ fontWeight: 700, color: idx === 0 ? '#e3b341' : 'inherit' }}>
                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                </span>
                <span style={{ fontWeight: 600 }}>{s.userName}</span>
                <span style={{ fontWeight: 700, color: 'var(--acc)' }}>{s.score} pts</span>
                <span style={{ color: 'var(--success)' }}>{s.passedCases}/{s.totalCases} passed</span>
                <span style={{ color: 'var(--mut)' }}>{s.timeMs}ms</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
