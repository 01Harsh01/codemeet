import React, { useEffect, useState } from 'react';
import { API_BASE } from '../config';

interface WeeklyItem {
  day: string;
  date: string;
  success: number;
  failed: number;
  total: number;
}

interface LanguageStat {
  language: string;
  count: number;
  successCount: number;
  successRate: number;
}

interface AnalyticsData {
  totalSessions: number;
  totalSubmissions: number;
  successfulRuns: number;
  failedRuns: number;
  successRate: number;
  avgExecutionTimeMs: number;
  trendPercent: number;
  statusDistribution: {
    success: number;
    failed: number;
    total: number;
  };
  languageStats: LanguageStat[];
  weeklyActivity: WeeklyItem[];
  interviewCount: number;
  contestCount: number;
}

export function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetch(`${API_BASE}/analytics`, {
      headers: { Authorization: 'Bearer ' + (localStorage.getItem('token') || '') },
    })
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch((e) => console.error('Failed to load analytics', e))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ color: 'var(--fg-muted)', textAlign: 'center', padding: '60px 20px' }}>
        <div className="status-dot" style={{ margin: '0 auto 12px', width: 12, height: 12 }} />
        Loading real-time session telemetry…
      </div>
    );
  }

  const totalRuns = data?.totalSubmissions || 0;
  const successRuns = data?.successfulRuns || 0;
  const failedRuns = data?.failedRuns || 0;
  const totalSessions = data?.totalSessions || 0;
  const avgTime = data?.avgExecutionTimeMs || 0;
  const weekly = data?.weeklyActivity || [];
  const langStats = data?.languageStats || [];
  const trendPercent = data?.trendPercent || 0;

  // Maximum value for scaling the weekly bar chart dynamically
  const maxDayCount = Math.max(...weekly.map((w) => w.total), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="animate-fade-in">
      {/* 4 Top KPI Cards */}
      <div className="kpi-grid">
        {/* Card 1: Total Sessions */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">TOTAL SESSIONS</span>
            <div className="kpi-icon-wrap kpi-icon-blue">📁</div>
          </div>
          <div className="kpi-val">{totalSessions}</div>
          <div className="kpi-trend neutral">
            <span>{totalSessions === 1 ? '1 collaborative room' : `${totalSessions} rooms joined`}</span>
          </div>
        </div>

        {/* Card 2: Total Submissions */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">TOTAL SUBMISSIONS</span>
            <div className="kpi-icon-wrap kpi-icon-amber">⚡</div>
          </div>
          <div className="kpi-val">{totalRuns}</div>
          <div className={`kpi-trend ${trendPercent > 0 ? 'positive' : trendPercent < 0 ? 'negative' : 'neutral'}`}>
            <span>{trendPercent > 0 ? `+${trendPercent}%` : `${trendPercent}%`}</span>
            <span style={{ color: 'var(--fg-subtle)', fontWeight: 400 }}>vs previous week</span>
          </div>
        </div>

        {/* Card 3: Success Rate */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">SUCCESS RATE</span>
            <div className="kpi-icon-wrap kpi-icon-green">✓</div>
          </div>
          <div className="kpi-val" style={{ color: totalRuns > 0 && data?.successRate! >= 70 ? 'var(--emerald)' : 'inherit' }}>
            {totalRuns > 0 ? `${data?.successRate}%` : '—'}
          </div>
          <div className="kpi-trend neutral">
            <span>{successRuns} passed / {failedRuns} failed</span>
          </div>
        </div>

        {/* Card 4: Avg Execution Time */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">AVG RUNTIME</span>
            <div className="kpi-icon-wrap kpi-icon-cyan">⏱</div>
          </div>
          <div className="kpi-val">{avgTime > 0 ? `${avgTime}ms` : '—'}</div>
          <div className="kpi-trend neutral">
            <span>{totalRuns > 0 ? 'Local execution engine' : 'No executions recorded'}</span>
          </div>
        </div>
      </div>

      {totalRuns === 0 ? (
        /* Clean Zero State when no code has been submitted yet */
        <div
          className="chart-card"
          style={{
            textAlign: 'center',
            padding: '48px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'rgba(255, 161, 22, 0.1)',
              border: '1px solid rgba(255, 161, 22, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              color: 'var(--amber)',
            }}
          >
            📊
          </div>
          <h4 style={{ fontSize: 17, fontWeight: 700 }}>No Submission Telemetry Yet</h4>
          <p style={{ color: 'var(--fg-muted)', fontSize: 13, maxWidth: 500, lineHeight: 1.6 }}>
            Run and submit your algorithms in any collaborative coding room to generate real-time execution graphs,
            language stability metrics, and runtime benchmarks.
          </p>
        </div>
      ) : (
        <>
          {/* Row 2: Stacked Daily Submissions Chart & Status Distribution Doughnut */}
          <div className="analytics-dashboard-grid">
            {/* Left: Stacked Daily Chart */}
            <div className="chart-card">
              <div className="chart-header">
                <div>
                  <div className="chart-title">Submissions per Day</div>
                  <div className="chart-timeframe">Past 7 days live activity</div>
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: 11 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--emerald)' }} /> Accepted
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--coral)' }} /> Failed / Error
                  </span>
                </div>
              </div>

              <div className="bar-chart-container" style={{ minHeight: 180 }}>
                {weekly.map((item, idx) => {
                  const hGreen = item.total > 0 ? (item.success / maxDayCount) * 140 : 0;
                  const hCoral = item.total > 0 ? (item.failed / maxDayCount) * 140 : 0;

                  return (
                    <div key={idx} className="bar-col">
                      <div className="bar-stack-track" title={`${item.date}: ${item.success} passed, ${item.failed} failed`}>
                        {item.total > 0 ? (
                          <>
                            {hGreen > 0 && (
                              <div
                                className="bar-seg-green"
                                style={{ height: `${Math.max(hGreen, 6)}px` }}
                                title={`Passed: ${item.success}`}
                              />
                            )}
                            {hCoral > 0 && (
                              <div
                                className="bar-seg-coral"
                                style={{ height: `${Math.max(hCoral, 6)}px` }}
                                title={`Failed: ${item.failed}`}
                              />
                            )}
                          </>
                        ) : (
                          <div style={{ height: 4, width: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: 2 }} />
                        )}
                      </div>
                      <span className="bar-col-day">{item.day}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: Status Distribution Circular Doughnut */}
            <div className="chart-card">
              <div className="chart-header">
                <div>
                  <div className="chart-title">Submission Outcomes</div>
                  <div className="chart-timeframe">Real execution ratio</div>
                </div>
              </div>

              <div className="doughnut-wrap">
                <div className="doughnut-circle-container">
                  {(() => {
                    const total = totalRuns || 1;
                    const successPct = (successRuns / total) * 100;
                    const failedPct = (failedRuns / total) * 100;
                    const circumference = 2 * Math.PI * 38; // ~238.76
                    const successDash = (successPct / 100) * circumference;
                    const failedDash = (failedPct / 100) * circumference;

                    return (
                      <svg width="160" height="160" viewBox="0 0 100 100">
                        {/* Background Ring */}
                        <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
                        {/* Success Ring (LeetCode Green) */}
                        {successRuns > 0 && (
                          <circle
                            cx="50"
                            cy="50"
                            r="38"
                            fill="none"
                            stroke="var(--emerald)"
                            strokeWidth="10"
                            strokeDasharray={`${successDash} ${circumference}`}
                            strokeDashoffset="0"
                            strokeLinecap="round"
                          />
                        )}
                        {/* Failed Ring (LeetCode Red) */}
                        {failedRuns > 0 && (
                          <circle
                            cx="50"
                            cy="50"
                            r="38"
                            fill="none"
                            stroke="var(--coral)"
                            strokeWidth="10"
                            strokeDasharray={`${failedDash} ${circumference}`}
                            strokeDashoffset={`-${successDash}`}
                            strokeLinecap="round"
                          />
                        )}
                      </svg>
                    );
                  })()}

                  <div className="doughnut-center-metric">
                    <span className="doughnut-metric-num">{totalRuns}</span>
                    <span className="doughnut-metric-sub">TOTAL</span>
                  </div>
                </div>

                <div className="doughnut-legend-grid">
                  <div className="legend-item">
                    <span className="legend-dot-label">
                      <span className="legend-dot" style={{ background: 'var(--emerald)' }} /> Accepted
                    </span>
                    <span className="legend-count">{successRuns}</span>
                  </div>

                  <div className="legend-item">
                    <span className="legend-dot-label">
                      <span className="legend-dot" style={{ background: 'var(--coral)' }} /> Runtime Error / Failed
                    </span>
                    <span className="legend-count">{failedRuns}</span>
                  </div>

                  <div className="legend-item">
                    <span className="legend-dot-label">
                      <span className="legend-dot" style={{ background: 'var(--amber)' }} /> Contests
                    </span>
                    <span className="legend-count">{data?.contestCount || 0}</span>
                  </div>

                  <div className="legend-item">
                    <span className="legend-dot-label">
                      <span className="legend-dot" style={{ background: 'var(--cyan)' }} /> Interviews
                    </span>
                    <span className="legend-count">{data?.interviewCount || 0}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Row 3: Real Language Breakdown from database */}
          <div className="chart-card">
            <div className="chart-header">
              <div>
                <div className="chart-title">Language Usage & Success Metrics</div>
                <div className="chart-timeframe">Based on your submitted executions</div>
              </div>
            </div>

            {langStats.length === 0 ? (
              <div style={{ color: 'var(--fg-muted)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
                No language execution data recorded yet.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginTop: 12 }}>
                {langStats.map((item) => {
                  const langName =
                    item.language === 'python'
                      ? 'Python 3'
                      : item.language === 'javascript'
                      ? 'JavaScript (Node.js)'
                      : item.language === 'cpp'
                      ? 'C++ (GCC)'
                      : item.language === 'java'
                      ? 'Java'
                      : item.language.toUpperCase();

                  const barColor =
                    item.language === 'python'
                      ? 'var(--amber)'
                      : item.language === 'javascript'
                      ? 'var(--acc)'
                      : item.language === 'cpp'
                      ? 'var(--purple)'
                      : 'var(--emerald)';

                  return (
                    <div
                      key={item.language}
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid var(--line)',
                        borderRadius: 8,
                        padding: 14,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                        <span style={{ fontWeight: 600 }}>{langName}</span>
                        <span style={{ color: 'var(--fg-muted)', fontSize: 11 }}>{item.count} runs</span>
                      </div>

                      <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${item.successRate}%`,
                            height: '100%',
                            background: barColor,
                            borderRadius: 4,
                            transition: 'width 0.5s ease',
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--fg-subtle)' }}>
                        <span>Success: {item.successCount}/{item.count}</span>
                        <span style={{ fontWeight: 700, color: item.successRate >= 70 ? 'var(--emerald)' : 'var(--coral)' }}>
                          {item.successRate}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
