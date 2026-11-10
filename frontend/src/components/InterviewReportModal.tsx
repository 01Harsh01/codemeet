import React, { useEffect, useState } from 'react';
import { InterviewReport } from '../types';
import { sound } from '../sound';
import { API_BASE } from '../config';

interface InterviewReportModalProps {
  roomId: string;
  isHost: boolean;
  onClose: () => void;
}

export function InterviewReportModal({ roomId, isHost, onClose }: InterviewReportModalProps) {
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [candidateName, setCandidateName] = useState<string>('Candidate');
  const [candidateId, setCandidateId] = useState<string>('user');
  const [rating, setRating] = useState<number>(4);
  const [decision, setDecision] = useState<'PENDING' | 'HIRE' | 'STRONG_HIRE' | 'NO_HIRE'>('STRONG_HIRE');
  const [strengths, setStrengths] = useState<string>('');
  const [improvements, setImprovements] = useState<string>('');
  const [feedback, setFeedback] = useState<string>('');
  const [isReleased, setIsReleased] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    fetch(`${API_BASE}/rooms/${roomId}/report`, {
      headers: { Authorization: 'Bearer ' + (localStorage.getItem('token') || '') },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setReport(d);
          setCandidateName(d.candidateName);
          setRating(d.rating);
          setDecision(d.decision);
          setStrengths(d.strengths);
          setImprovements(d.improvements);
          setFeedback(d.feedback);
          setIsReleased(d.isReleased);
        }
      })
      .catch(() => {});
  }, [roomId]);

  const submitReport = async () => {
    setLoading(true);
    sound.playPop();
    try {
      const res = await fetch(`${API_BASE}/rooms/${roomId}/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + (localStorage.getItem('token') || ''),
        },
        body: JSON.stringify({
          candidateId,
          candidateName,
          rating: Number(rating),
          decision,
          strengths,
          improvements,
          feedback,
          isReleased,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit report');
      setReport(data);
      sound.playSuccess();
      alert('✓ Evaluation report saved successfully!');
    } catch (e: any) {
      sound.playError();
      alert('Error: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const releaseReport = async () => {
    sound.playPop();
    try {
      const res = await fetch(`${API_BASE}/rooms/${roomId}/report/release`, {
        method: 'PATCH',
        headers: { Authorization: 'Bearer ' + (localStorage.getItem('token') || '') },
      });
      const data = await res.json();
      setReport(data);
      setIsReleased(true);
      sound.playSuccess();
      alert('✓ Feedback released to candidate!');
    } catch (e: any) {
      alert('Error: ' + e.message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: 16 }}>📋 Interview Evaluation & Scorecard</h3>
            <div style={{ fontSize: 11, color: 'var(--mut)' }}>Structured technical interview evaluation metrics</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 16 }}>
            ✕
          </button>
        </div>

        {isHost ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--mut)' }}>Candidate Name:</label>
                <input
                  style={{ width: '100%', fontSize: 12 }}
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, color: 'var(--mut)' }}>Rating (1 - 5):</label>
                <select
                  value={rating}
                  onChange={(e) => setRating(Number(e.target.value))}
                  style={{ width: '100%', fontSize: 12 }}
                >
                  <option value="5">5 ⭐ - Exceptional</option>
                  <option value="4">4 ⭐ - Strong Hire</option>
                  <option value="3">3 ⭐ - Meets Bar</option>
                  <option value="2">2 ⭐ - Below Bar</option>
                  <option value="1">1 ⭐ - Significant Gaps</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ fontSize: 11, color: 'var(--mut)' }}>Hiring Decision:</label>
              <select
                value={decision}
                onChange={(e: any) => setDecision(e.target.value)}
                style={{ width: '100%', fontSize: 12 }}
              >
                <option value="STRONG_HIRE">Strong Hire</option>
                <option value="HIRE">Hire</option>
                <option value="PENDING">Pending Debrief</option>
                <option value="NO_HIRE">No Hire</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11, color: 'var(--mut)' }}>Demonstrated Strengths:</label>
              <textarea
                style={{ width: '100%', height: 60, fontSize: 12, resize: 'none' }}
                placeholder="e.g. Quick to spot $O(N)$ hash approach, clean variable naming, thorough test case dry-run..."
                value={strengths}
                onChange={(e) => setStrengths(e.target.value)}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, color: 'var(--mut)' }}>Areas for Improvement:</label>
              <textarea
                style={{ width: '100%', height: 60, fontSize: 12, resize: 'none' }}
                placeholder="e.g. Inquired about constraint bounds late in the session, minor syntax slips..."
                value={improvements}
                onChange={(e) => setImprovements(e.target.value)}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, color: 'var(--mut)' }}>Overall Qualitative Feedback:</label>
              <textarea
                style={{ width: '100%', height: 60, fontSize: 12, resize: 'none' }}
                placeholder="Detailed summary to share with recruiting / candidate..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isReleased}
                  onChange={(e) => setIsReleased(e.target.checked)}
                />
                Release feedback to candidate view
              </label>

              <div style={{ display: 'flex', gap: 8 }}>
                {report && !report.isReleased && (
                  <button className="btn-primary" onClick={releaseReport} style={{ fontSize: 12 }}>
                    📢 Release to Candidate
                  </button>
                )}
                <button className="p" onClick={submitReport} disabled={loading} style={{ fontSize: 12 }}>
                  {loading ? 'Saving…' : 'Save Evaluation Report'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {report && report.isReleased ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="badge badge-easy">Score: {report.rating} / 5 ⭐</span>
                  <span className="badge badge-host">Decision: {report.decision}</span>
                </div>
                <div className="card">
                  <b>Strengths:</b>
                  <p style={{ fontSize: 13, color: '#d1d7e0' }}>{report.strengths}</p>
                </div>
                <div className="card">
                  <b>Areas for Growth:</b>
                  <p style={{ fontSize: 13, color: '#d1d7e0' }}>{report.improvements}</p>
                </div>
                <div className="card">
                  <b>Interviewer Feedback:</b>
                  <p style={{ fontSize: 13, color: '#d1d7e0' }}>{report.feedback}</p>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--mut)', fontSize: 13 }}>
                The interviewer is currently reviewing your session. Feedback will appear here once released by the interviewer.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
