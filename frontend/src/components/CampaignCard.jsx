const STATUS_BADGE = {
  draft: 'badge-gray', running: 'badge-blue', paused: 'badge-amber', completed: 'badge-green',
};

/** Campaign summary card with live progress and launch/pause controls. */
export default function CampaignCard({ campaign: c, onLaunch, onPause, onResume }) {
  const pct = c.totalCalls ? Math.round((c.completedCalls / c.totalCalls) * 100) : 0;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-head" style={{ marginBottom: 6 }}>
        <h3 className="card-title">{c.name}</h3>
        <span className={`badge ${STATUS_BADGE[c.status] || 'badge-gray'}`}>{c.status}</span>
      </div>

      <p className="muted" style={{ margin: '0 0 10px' }}>
        Script: {c.script?.name || '—'} ({c.script?.drugName || '—'})
      </p>

      <div className="progress-meta">
        <span>{c.completedCalls}/{c.totalCalls} calls ({pct}%)</span>
        <span>Avg score: {c.avgScore ?? 0}</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <span className="badge badge-amber">{c.warmLeads} warm</span>
        <span className="badge badge-info">{c.coldLeads} cold</span>

        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {c.status === 'draft'   && <button className="btn btn-primary btn-sm" onClick={() => onLaunch(c._id)}>Launch</button>}
          {c.status === 'running' && <button className="btn btn-outline btn-sm" onClick={() => onPause(c._id)}>Pause</button>}
          {c.status === 'paused'  && <button className="btn btn-primary btn-sm" onClick={() => onResume(c._id)}>Resume</button>}
        </span>
      </div>
    </div>
  );
}
