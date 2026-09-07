import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const card = {
  background: '#1a1a1a', borderRadius: 12, padding: 20,
  border: '1px solid #27272a',
  boxShadow: '0 1px 2px rgba(0,0,0,.35)',
};
const btn = (bg) => ({
  padding: '8px 18px', background: bg, color: '#fff', border: 'none',
  borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'Cairo, sans-serif',
});
const STATUS_TABS = ['pending', 'approved', 'entered', 'rejected'];
const STATUS_COLORS = { pending: '#d97706', approved: '#10b981', entered: '#059669', rejected: '#52525b' };

export default function DataEntryReviewPage() {
  const [tab,      setTab]      = useState('pending');
  const [drafts,   setDrafts]   = useState([]);
  const [schema,   setSchema]   = useState(null);
  const [selected, setSelected] = useState(null);   // full draft detail
  const [fields,   setFields]   = useState({});     // editable copy
  const [error,    setError]    = useState('');
  const [busy,     setBusy]     = useState(false);

  const loadList = useCallback(() => {
    api.get('/data-entry', { params: { status: tab } })
      .then(res => setDrafts(res.data))
      .catch(() => setError('Failed to load drafts'));
  }, [tab]);

  useEffect(() => { api.get('/data-entry/schema').then(r => setSchema(r.data)).catch(() => {}); }, []);
  useEffect(() => { setSelected(null); loadList(); }, [loadList]);

  const open = async (id) => {
    setError('');
    const res = await api.get(`/data-entry/${id}`);
    setSelected(res.data);
    setFields({ ...res.data.fields });
  };

  const saveEdits = async () => {
    const res = await api.put(`/data-entry/${selected._id}`, { fields });
    setSelected(prev => ({ ...prev, ...res.data, call: prev.call, contact: prev.contact }));
    return res.data;
  };

  const approve = async () => {
    setBusy(true); setError('');
    try {
      await saveEdits();
      await api.post(`/data-entry/${selected._id}/approve`);
      setSelected(null);
      loadList();
    } catch (err) {
      setError(err.response?.data?.error || 'Approve failed');
    } finally { setBusy(false); }
  };

  const reject = async () => {
    const reason = window.prompt('Reject reason (optional):') ?? '';
    setBusy(true); setError('');
    try {
      await api.post(`/data-entry/${selected._id}/reject`, { reason });
      setSelected(null);
      loadList();
    } catch (err) {
      setError(err.response?.data?.error || 'Reject failed');
    } finally { setBusy(false); }
  };

  const regenerate = async () => {
    setBusy(true); setError('');
    try {
      const res = await api.post(`/data-entry/${selected._id}/regenerate`);
      await open(res.data._id);
      loadList();
    } catch (err) {
      setError(err.response?.data?.error || 'Regenerate failed');
    } finally { setBusy(false); }
  };

  const renderInput = (f) => {
    const value = fields[f.key] ?? '';
    const flagged = selected.needsReview?.includes(f.key);
    const base = {
      width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 13,
      border: flagged ? '2px solid #fbbf24' : '1px solid #3f3f46',
      background: flagged ? 'rgba(251,191,36,.12)' : '#242424',
      color: '#f4f4f5',
      fontFamily: 'Cairo, sans-serif', boxSizing: 'border-box',
    };
    const set = (v) => setFields(prev => ({ ...prev, [f.key]: v }));
    const readOnly = selected.status !== 'pending';

    if (f.type === 'select' || f.type === 'radio') {
      return (
        <select style={base} value={value ?? ''} disabled={readOnly} onChange={e => set(e.target.value || null)}>
          <option value="">— empty —</option>
          {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (f.type === 'textarea') {
      return <textarea style={{ ...base, minHeight: 60 }} value={value ?? ''} readOnly={readOnly}
                       onChange={e => set(e.target.value)} />;
    }
    return <input style={base} type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                  value={value ?? ''} readOnly={readOnly}
                  onChange={e => set(f.type === 'number' ? Number(e.target.value) : e.target.value)} />;
  };

  return (
    <div style={{ padding: 24, fontFamily: 'Cairo, sans-serif', background: '#111111', minHeight: '100vh' }}>
      <h2 style={{ marginTop: 0 }}> Data Entry Review</h2>
      {error && <p style={{ color: 'red', fontSize: 13 }}>{error}</p>}

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {STATUS_TABS.map(s => (
          <button key={s} onClick={() => setTab(s)}
                  style={{ ...btn(tab === s ? STATUS_COLORS[s] : '#3f3f46'), textTransform: 'capitalize' }}>
            {s}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24, alignItems: 'start' }}>
        {/* ── Draft list ── */}
        <div style={card}>
          {drafts.map(d => (
            <div key={d._id} onClick={() => open(d._id)}
                 style={{ padding: '10px 8px', borderBottom: '1px solid #232326', cursor: 'pointer', fontSize: 14,
                          background: selected?._id === d._id ? 'rgba(16,185,129,.12)' : 'transparent', borderRadius: 6 }}>
              <b>{d.contact?.name || 'Unknown'}</b> — {d.contact?.phone}
              <br />
              <small style={{ color: '#a1a1aa' }}>
                {new Date(d.createdAt).toLocaleString('en-GB')}
                {d.needsReview?.length > 0 && ` | ⚠️ ${d.needsReview.length} to review`}
              </small>
            </div>
          ))}
          {!drafts.length && <p style={{ color: '#a1a1aa', fontSize: 13 }}>No {tab} drafts.</p>}
        </div>

        {/* ── Review detail: fields (left) + transcript (right) ── */}
        {selected && (selected.schema || schema) ? (
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>
                {selected.contact?.name}
                {selected.project?.name && (
                  <span style={{ fontSize: 12, color: '#a1a1aa', fontWeight: 400 }}> — 📊 {selected.project.name}</span>
                )}
              </h3>
              <div style={{ marginTop: 8, fontSize: 12, color: '#a1a1aa' }}>
                Data-entry link:{' '}
                {selected.contact?.dataEntryUrl
                  ? <a href={selected.contact.dataEntryUrl} target="_blank" rel="noreferrer">Open doctor link</a>
                  : <span>Waiting for the successful-doctors sheet</span>}
              </div>
              <span style={{ background: STATUS_COLORS[selected.status], color: '#fff', borderRadius: 8, padding: '2px 10px', fontSize: 12 }}>
                {selected.status}
              </span>
            </div>

            {selected.call?.recordingUrl && (
              <audio controls style={{ width: '100%', margin: '12px 0' }}
                     src={`${api.defaults.baseURL}/recordings/${selected.call._id}/stream`} />
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 12 }}>
              {/* Extracted fields */}
              <div>
                <h4 style={{ margin: '0 0 10px' }}>Extracted Fields</h4>
                {/* Phase 6: render THIS draft's project schema (global fallback) */}
                {(selected.schema || schema).fields.map(f => (
                  <div key={f.key} style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 12, color: '#a1a1aa' }}>
                      {f.label} {selected.needsReview?.includes(f.key) && '⚠️'}
                    </label>
                    {renderInput(f)}
                  </div>
                ))}
              </div>

              {/* Transcript */}
              <div>
                <h4 style={{ margin: '0 0 10px' }}>Transcript</h4>
                <pre style={{ background: '#141414', border: '1px solid #27272a', borderRadius: 8, padding: 12, fontSize: 12,
                              whiteSpace: 'pre-wrap', direction: 'rtl', textAlign: 'right',
                              maxHeight: 460, overflowY: 'auto', fontFamily: 'Cairo, sans-serif' }}>
                  {selected.call?.transcript || '(no transcript)'}
                </pre>
                {selected.call?.drive?.folderId && (
                  <p style={{ fontSize: 12 }}>
                    📁 <a href={selected.call.drive.recordingUrl || '#'} target="_blank" rel="noreferrer">Drive recording</a>
                  </p>
                )}
              </div>
            </div>

            {selected.status === 'pending' && (
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button style={btn('#43a047')} disabled={busy} onClick={approve}>✅ Approve</button>
                <button style={btn('#ff5252')} disabled={busy} onClick={reject}>❌ Reject</button>
                <button style={btn('#7e57c2')} disabled={busy} onClick={regenerate}>🔄 Re-extract</button>
              </div>
            )}

            {selected.status === 'approved' && selected.formPayload && (
              <div style={{ marginTop: 16 }}>
                <h4 style={{ margin: '0 0 8px' }}>Form Payload (what the extension fills)</h4>
                <pre style={{ background: '#141414', border: '1px solid #27272a', borderRadius: 8, padding: 12, fontSize: 12 }}>
                  {JSON.stringify(selected.formPayload, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <div style={{ ...card, color: '#a1a1aa', fontSize: 14 }}>
            Select a draft to review it against the call transcript.
          </div>
        )}
      </div>
    </div>
  );
}
