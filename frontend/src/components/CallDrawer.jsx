// Shared call-detail drawer + status/lead badge maps.
// Used by CallCenterPage and CallsPage.

export const CALL_STATUS = {
  initiated:     { cls: 'badge-info',  label: 'Dialing' },
  'in-progress': { cls: 'badge-amber', label: 'In progress' },
  completed:     { cls: 'badge-green', label: 'Completed' },
  escalated:     { cls: 'badge-red',   label: 'Escalated' },
  failed:        { cls: 'badge-gray',  label: 'Failed' },
  'no-answer':   { cls: 'badge-gray',  label: 'No answer' },
};

export const LEAD_LABEL = {
  warm: { cls: 'badge-amber', label: 'Warm' },
  cold: { cls: 'badge-blue',  label: 'Cold' },
};

const SENTIMENT = {
  positive: 'badge-green',
  negative: 'badge-red',
  unclear:  'badge-gray',
};

export function formatDuration(sec) {
  if (!sec && sec !== 0) return '—';
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '7px 0', borderBottom: '1px solid #232326', fontSize: 13 }}>
      <span style={{ width: 110, flexShrink: 0, color: 'var(--text-3)', fontWeight: 500 }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{children}</span>
    </div>
  );
}

export default function CallDrawer({ call, onClose }) {
  if (!call) return null;
  const st = CALL_STATUS[call.status] || CALL_STATUS.failed;
  const lb = LEAD_LABEL[call.leadLabel] || LEAD_LABEL.cold;

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-head">
          <h3>Call details</h3>
          <button className="drawer-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="drawer-body">
          <Row label="Contact">{call.contact?.name || '—'}</Row>
          <Row label="Phone">{call.contact?.phone || '—'}</Row>
          <Row label="Drug">{call.script?.drugName || '—'}</Row>
          <Row label="Status"><span className={`badge ${st.cls}`}>{st.label}</span></Row>
          <Row label="Lead">
            <span className={`badge ${lb.cls}`}>{lb.label}</span>
            {call.leadScore != null && <span className="muted" style={{ marginLeft: 8 }}>{call.leadScore}%</span>}
          </Row>
          <Row label="Duration">{call.durationSec ? `${call.durationSec}s (${formatDuration(call.durationSec)})` : '—'}</Row>
          <Row label="Date">{new Date(call.createdAt).toLocaleString('en-GB')}</Row>

          {call.responses?.length > 0 && (
            <>
              <h4 style={{ margin: '20px 0 10px', fontSize: 13.5 }}>Script responses</h4>
              {call.responses.map((r, i) => (
                <div key={i} style={{ background: '#141414', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                  <p className="muted" style={{ margin: '0 0 4px' }}>{r.questionText}</p>
                  <p style={{ margin: '0 0 6px', fontWeight: 500, fontSize: 13 }}>{r.answer || '—'}</p>
                  <span className={`badge ${SENTIMENT[r.sentiment] || 'badge-gray'}`}>{r.sentiment || 'unclear'}</span>
                </div>
              ))}
            </>
          )}

          {call.transcript && (
            <>
              <h4 style={{ margin: '20px 0 10px', fontSize: 13.5 }}>Transcript</h4>
              <pre className="transcript">{call.transcript}</pre>
            </>
          )}
        </div>
      </div>
    </>
  );
}
