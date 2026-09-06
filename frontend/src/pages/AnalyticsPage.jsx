import { useState, useEffect } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from 'recharts';
import LeadScoreChart from '../components/LeadScoreChart';
import api from '../services/api';

function Kpi({ label, value, color = 'var(--primary)' }) {
  return (
    <div className="kpi">
      <div className="kpi-value" style={{ color }}>{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [summary,  setSummary]  = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [days,     setDays]     = useState(30);
  const [error,    setError]    = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/analytics/summary'),
      api.get('/analytics/timeline', { params: { days } }),
    ]).then(([s, t]) => {
      setSummary(s.data);
      setTimeline(t.data);
    }).catch(() => setError('Failed to load analytics.'));
  }, [days]);

  const exportCsv = () => {
    const rows = [
      ['date', 'calls', 'hot', 'warm'],
      ...timeline.map(d => [d.date, d.calls, d.hot, d.warm]),
    ];
    const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `medcall-analytics-${days}d.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (error) return <div className="page"><div className="alert alert-err">{error}</div></div>;
  if (!summary) return <div className="page"><p className="muted">Loading…</p></div>;

  const completed = summary.byStatus?.completed || 0;
  const escalated = summary.byStatus?.escalated || 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2 className="page-title">Analytics</h2>
          <p className="page-sub">Call volume, lead quality, and outcomes over time</p>
        </div>
        <div className="page-actions">
          <select className="select" style={{ width: 150 }} value={days} onChange={e => setDays(Number(e.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button className="btn btn-primary" onClick={exportCsv}>Export CSV</button>
        </div>
      </div>

      {/* KPI row */}
      <div className="kpi-grid">
        <Kpi label="Total calls"        value={summary.totalCalls} />
        <Kpi label="Completed"          value={completed}                    color="var(--success)" />
        <Kpi label="Escalated to human" value={escalated}                    color="var(--warning)" />
        <Kpi label="Hot leads"          value={summary.byLabel?.hot || 0}    color="var(--danger)" />
        <Kpi label="Avg lead score"     value={summary.avgScore}             color="var(--purple)" />
      </div>

      <div className="grid-21">
        {/* Calls per day */}
        <div className="card">
          <h3 className="card-title">Calls per day</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={timeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="date" fontSize={11} stroke="#71717a" />
              <YAxis allowDecimals={false} fontSize={11} stroke="#71717a" />
              <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #27272a', borderRadius: 8, color: '#f4f4f5' }} />
              <Legend />
              <Line type="monotone" dataKey="calls" name="Calls" stroke="#10b981" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="hot"   name="Hot"   stroke="#f87171" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="warm"  name="Warm"  stroke="#fbbf24" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Lead distribution */}
        <div className="card">
          <h3 className="card-title">Lead distribution</h3>
          <LeadScoreChart byLabel={summary.byLabel} />
        </div>
      </div>
    </div>
  );
}
