const LABEL_COLORS = { warm: '#fbbf24', cold: '#38bdf8' };

/** Real-time list of finalized calls (fed by the call:update socket event). */
export default function LiveCallFeed({ calls }) {
  if (!calls.length) {
    return <p className="muted" style={{ margin: 0 }}>Waiting for live call updates…</p>;
  }
  return (
    <div>
      {calls.map((c) => (
        <div key={c._id} style={{
          display: 'flex', gap: 10, alignItems: 'center',
          padding: '9px 0', borderBottom: '1px solid #232326', fontSize: 13,
        }}>
          <span className="dot" style={{ background: LABEL_COLORS[c.leadLabel] || '#3f3f46' }} />
          <span style={{ flex: 1 }}>
            <b>{c.contact?.name || 'Unknown'}</b> — {c.status}
            {c.leadScore != null && <> · score <b>{c.leadScore}</b> ({c.leadLabel})</>}
          </span>
          <small className="muted">
            {c.endedAt ? new Date(c.endedAt).toLocaleTimeString('en-GB') : ''}
          </small>
        </div>
      ))}
    </div>
  );
}
