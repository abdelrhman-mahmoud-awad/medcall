import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { useSocket } from '../hooks/useSocket';
import LeadScoreChart from '../components/LeadScoreChart';
import LiveCallFeed from '../components/LiveCallFeed';
import { CALL_STATUS, LEAD_LABEL } from '../components/CallDrawer';
import api, { getProjects, getProjectProgress } from '../services/api';

const CAMPAIGN_BADGE = {
  draft: 'badge-gray', running: 'badge-blue', paused: 'badge-amber', completed: 'badge-green',
};

function Kpi({ label, value, color = 'var(--text)' }) {
  return (
    <div className="kpi">
      <div className="kpi-value" style={{ color }}>{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

export default function DashboardPage() {
  const [summary,   setSummary]   = useState(null);
  const [timeline,  setTimeline]  = useState([]);
  const [calls,     setCalls]     = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [liveCalls, setLiveCalls] = useState([]);
  const [targets,   setTargets]   = useState([]);   // per-project target progress
  const [error,     setError]     = useState('');

  const userName = (() => {
    try { return (JSON.parse(localStorage.getItem('medcall_user')) || {}).name || ''; } catch { return ''; }
  })();

  // Real-time: prepend finalized calls to the live feed and bump campaign counters
  useSocket(
    (callLog) => setLiveCalls(prev => [callLog, ...prev].slice(0, 10)),
    (progress) => setCampaigns(prev => prev.map(c =>
      c._id === progress.campaignId ? { ...c, ...progress } : c
    ))
  );

  useEffect(() => {
    Promise.all([
      api.get('/analytics/summary'),
      api.get('/analytics/timeline', { params: { days: 14 } }),
      api.get('/calls', { params: { limit: 8 } }),
      api.get('/campaigns'),
    ]).then(([s, t, c, cp]) => {
      setSummary(s.data);
      setTimeline(t.data);
      setCalls(c.data.calls || c.data || []);
      setCampaigns(cp.data || []);
    }).catch(() => setError('Failed to load the dashboard.'));

    // Target progress bars — projects with a calls/forms target set
    getProjects().then(async (r) => {
      const list = (r.data || []).slice(0, 4);
      const rows = await Promise.all(list.map(p =>
        getProjectProgress(p._id)
          .then(x => ({ id: p._id, name: p.name, ...x.data }))
          .catch(() => null)
      ));
      setTargets(rows.filter(Boolean));
    }).catch(() => {});
  }, []);

  if (error)    return <div className="page"><div className="alert alert-err">{error}</div></div>;
  if (!summary) return <div className="page"><p className="muted">Loading…</p></div>;

  const completed  = summary.byStatus?.completed || 0;
  const escalated  = summary.byStatus?.escalated || 0;
  const activeCampaigns = campaigns.filter(c => c.status === 'running' || c.status === 'paused');
  const topCampaigns = (activeCampaigns.length ? activeCampaigns : campaigns).slice(0, 4);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2 className="page-title">{userName ? `Welcome back, ${userName.split(' ')[0]}` : 'Dashboard'}</h2>
          <p className="page-sub">Overview of your calls, leads, and campaigns</p>
        </div>
        <div className="page-actions">
          <Link to="/calling/campaigns" className="btn btn-outline">New campaign</Link>
          <Link to="/calling/quick" className="btn btn-primary">Start calling</Link>
        </div>
      </div>

      {/* ── Project targets ── */}
      {targets.some(t => (t.targets?.calls || 0) > 0 || (t.targets?.forms || 0) > 0) && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <h3 className="card-title">Project targets</h3>
            <Link to="/projects" className="btn btn-ghost btn-sm">Projects →</Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
            {targets
              .filter(t => (t.targets?.calls || 0) > 0 || (t.targets?.forms || 0) > 0)
              .map(t => (
                <div key={t.id}>
                  <b style={{ fontSize: 13, display: 'block', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.name}
                  </b>
                  {(t.targets?.calls || 0) > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${t.totals?.callsPct ?? 0}%` }} />
                      </div>
                      <div className="progress-meta" style={{ marginTop: 3 }}>
                        <span>{t.totals?.calls ?? 0} / {t.targets.calls} calls</span>
                        <span>{t.totals?.callsPct ?? 0}%</span>
                      </div>
                    </div>
                  )}
                  {(t.targets?.forms || 0) > 0 && (
                    <div>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${t.totals?.formsPct ?? 0}%`, background: 'var(--info)' }} />
                      </div>
                      <div className="progress-meta" style={{ marginTop: 3 }}>
                        <span>{t.totals?.forms ?? 0} / {t.targets.forms} forms</span>
                        <span>{t.totals?.formsPct ?? 0}%</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── KPI row ── */}
      <div className="kpi-grid">
        <Kpi label="Total calls"    value={summary.totalCalls} />
        <Kpi label="Completed"      value={completed}                 color="var(--success)" />
        <Kpi label="Warm leads"     value={summary.byLabel?.warm || 0} color="var(--warning)" />
        <Kpi label="Escalated"      value={escalated}                 color="var(--info)" />
        <Kpi label="Avg lead score" value={summary.avgScore}          color="var(--primary)" />
      </div>

      {/* ── Chart + lead distribution ── */}
      <div className="grid-21">
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Calls — last 14 days</h3>
            <Link to="/reports/analytics" className="btn btn-ghost btn-sm">Full analytics →</Link>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={timeline}>
              <defs>
                <linearGradient id="dashCalls" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="date" fontSize={11} stroke="#71717a" />
              <YAxis allowDecimals={false} fontSize={11} stroke="#71717a" width={30} />
              <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #27272a', borderRadius: 8, color: '#f4f4f5' }} />
              <Area type="monotone" dataKey="calls" name="Calls" stroke="#10b981" strokeWidth={2}
                    fill="url(#dashCalls)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="card-title">Lead distribution</h3>
          <LeadScoreChart byLabel={summary.byLabel} />
        </div>
      </div>

      {/* ── Recent calls + right rail ── */}
      <div className="grid-21" style={{ marginTop: 16 }}>
        <div className="card" style={{ padding: 0 }}>
          <div className="card-head" style={{ padding: '16px 20px 0', marginBottom: 10 }}>
            <h3 className="card-title">Recent calls</h3>
            <Link to="/data/calls" className="btn btn-ghost btn-sm">View all →</Link>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Contact</th><th>Status</th><th>Lead</th><th>Score</th><th>Date</th></tr>
              </thead>
              <tbody>
                {calls.map(c => {
                  const st = CALL_STATUS[c.status] || CALL_STATUS.failed;
                  const lb = LEAD_LABEL[c.leadLabel];
                  return (
                    <tr key={c._id}>
                      <td><b>{c.contact?.name || 'Unknown'}</b><br /><small className="muted">{c.contact?.phone || ''}</small></td>
                      <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                      <td>{lb ? <span className={`badge ${lb.cls}`}>{lb.label}</span> : <span className="muted">—</span>}</td>
                      <td>{c.leadScore != null ? `${c.leadScore}%` : '—'}</td>
                      <td className="muted">{new Date(c.createdAt).toLocaleString('en-GB')}</td>
                    </tr>
                  );
                })}
                {!calls.length && (
                  <tr><td colSpan={5} className="empty-cell">
                    No calls yet — start one from the <Link to="/calling/quick">Calling page</Link>.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-head">
              <h3 className="card-title">Campaigns</h3>
              <Link to="/calling/campaigns" className="btn btn-ghost btn-sm">Manage →</Link>
            </div>
            {topCampaigns.map(c => {
              const pct = c.totalCalls ? Math.round((c.completedCalls / c.totalCalls) * 100) : 0;
              return (
                <div key={c._id} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5, gap: 8 }}>
                    <b style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</b>
                    <span className={`badge ${CAMPAIGN_BADGE[c.status] || 'badge-gray'}`}>{c.status}</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="progress-meta" style={{ marginTop: 4 }}>
                    <span>{c.completedCalls}/{c.totalCalls} calls</span>
                    <span>{c.warmLeads || 0} warm</span>
                  </div>
                </div>
              );
            })}
            {!topCampaigns.length && <p className="muted" style={{ margin: 0 }}>No campaigns yet.</p>}
          </div>

          <div className="card">
            <h3 className="card-title">
              <span className="dot" style={{ background: 'var(--danger)', marginRight: 6 }} />
              Live calls
            </h3>
            <LiveCallFeed calls={liveCalls} />
          </div>
        </div>
      </div>
    </div>
  );
}
