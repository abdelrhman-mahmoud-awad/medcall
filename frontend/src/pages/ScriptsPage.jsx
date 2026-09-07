import { useState, useEffect } from 'react';
import { getScripts, createScript, updateScript } from '../services/api';

const emptyForm = {
  name: '', drugName: '', targetType: 'both',
  greeting: '', closing: '', warmThreshold: 40,
  questions: [],
};

const emptyQ = { key: '', text: '', type: 'open', scoringWeight: 1 };

const TARGET_LABEL = {
  both: 'Physicians & pharmacists',
  physician: 'Physicians only',
  pharmacist: 'Pharmacists only',
};

const Q_TYPES = [
  { value: 'open',     label: 'Open-ended' },
  { value: 'yesno',    label: 'Yes / No' },
  { value: 'scale',    label: 'Scale' },
  { value: 'multiple', label: 'Multiple choice' },
];

export default function ScriptsPage() {
  const [scripts,  setScripts]  = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState(null);
  const [form,     setForm]     = useState(emptyForm);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [expanded, setExpanded] = useState(null);

  const load = async () => {
    const res = await getScripts();
    setScripts(res.data || []);
  };

  useEffect(() => { load(); }, []);

  const openNew  = () => { setEditing(null); setForm(emptyForm); setShowForm(true); setError(''); };
  const openEdit = (s) => {
    setEditing(s._id);
    setForm({
      name: s.name, drugName: s.drugName, targetType: s.targetType,
      greeting: s.greeting, closing: s.closing,
      warmThreshold: s.warmThreshold,
      questions: s.questions || [],
    });
    setShowForm(true); setError('');
  };
  const close = () => { setShowForm(false); setEditing(null); };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      if (editing) await updateScript(editing, form);
      else         await createScript(form);
      await load();
      close();
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong.');
    } finally { setSaving(false); }
  };

  const addQuestion = () => setForm(f => ({ ...f, questions: [...f.questions, { ...emptyQ }] }));
  const removeQ = (i) => setForm(f => ({ ...f, questions: f.questions.filter((_, idx) => idx !== i) }));
  const updateQ = (i, field, val) => setForm(f => ({
    ...f,
    questions: f.questions.map((q, idx) => (idx === i ? { ...q, [field]: val } : q)),
  }));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2 className="page-title">Scripts <span className="muted" style={{ fontSize: 14 }}>({scripts.length})</span></h2>
          <p className="page-sub">Call scripts the AI agent follows — spoken content is in Arabic, as heard on the call</p>
        </div>
        <div className="page-actions">
          <button onClick={openNew} className="btn btn-primary">New script</button>
        </div>
      </div>

      {scripts.length === 0 && (
        <div className="card"><div className="empty">No scripts yet. Create one or run the seed.</div></div>
      )}

      {scripts.map(s => (
        <div key={s._id} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: 15.5 }}>{s.name}</h3>
              <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-2)' }}>
                {s.drugName} · {TARGET_LABEL[s.targetType] || s.targetType}
              </p>
              <p className="muted" style={{ margin: 0 }}>
                {s.questions?.length || 0} questions ·{' '}
                <span className="badge badge-amber">warm ≥ {s.warmThreshold}%</span>{' '}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setExpanded(expanded === s._id ? null : s._id)} className="btn btn-outline btn-sm">
                {expanded === s._id ? 'Hide questions' : 'View questions'}
              </button>
              <button onClick={() => openEdit(s)} className="btn btn-outline btn-sm">Edit</button>
            </div>
          </div>

          {expanded === s._id && (
            <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <p style={{ fontSize: 13, margin: '0 0 8px' }}>
                <strong>Greeting:</strong> <span dir="rtl">{s.greeting}</span>
              </p>
              <p style={{ fontSize: 13, margin: '0 0 14px' }}>
                <strong>Closing:</strong> <span dir="rtl">{s.closing}</span>
              </p>
              <h4 style={{ margin: '0 0 8px', fontSize: 13 }}>Questions</h4>
              {(s.questions || []).map((q, i) => (
                <div key={i} style={{ background: '#141414', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                  <span className="muted" style={{ display: 'block', marginBottom: 3 }}>
                    <code>{q.key}</code> · {Q_TYPES.find(t => t.value === q.type)?.label || q.type} · weight {q.scoringWeight}
                  </span>
                  <span style={{ fontSize: 13 }} dir="rtl">{q.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Modal */}
      {showForm && (
        <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
          <form onSubmit={save} className="modal modal-lg">
            <h3>{editing ? 'Edit script' : 'New script'}</h3>
            {error && <div className="alert alert-err">{error}</div>}

            <div className="form-row field">
              <div>
                <label className="label">Script name *</label>
                <input className="input" required value={form.name}
                       onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Drug name *</label>
                <input className="input" required value={form.drugName}
                       onChange={e => setForm(f => ({ ...f, drugName: e.target.value }))} />
              </div>
            </div>

            <div className="field">
              <label className="label">Target audience</label>
              <select className="select" value={form.targetType}
                      onChange={e => setForm(f => ({ ...f, targetType: e.target.value }))}>
                <option value="both">Physicians & pharmacists</option>
                <option value="physician">Physicians only</option>
                <option value="pharmacist">Pharmacists only</option>
              </select>
            </div>

            <div className="field">
              <label className="label">Greeting * <span className="muted">(in Arabic — spoken at the start of the call)</span></label>
              <textarea className="textarea" required dir="rtl" value={form.greeting}
                        onChange={e => setForm(f => ({ ...f, greeting: e.target.value }))} />
            </div>
            <div className="field">
              <label className="label">Closing * <span className="muted">(in Arabic — spoken at the end of the call)</span></label>
              <textarea className="textarea" required dir="rtl" value={form.closing}
                        onChange={e => setForm(f => ({ ...f, closing: e.target.value }))} />
            </div>

            <div className="form-row field">
              <div>
                <label className="label">Warm threshold (%)</label>
                <input className="input" type="number" min={0} max={100} value={form.warmThreshold}
                       onChange={e => setForm(f => ({ ...f, warmThreshold: Number(e.target.value) }))} />
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <strong style={{ fontSize: 13.5 }}>Questions ({form.questions.length})</strong>
                <button type="button" onClick={addQuestion} className="btn btn-outline btn-sm">Add question</button>
              </div>
              {form.questions.map((q, i) => (
                <div key={i} style={{ background: '#141414', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input className="input" placeholder="key (e.g. awareness)" value={q.key} style={{ flex: 1 }}
                           onChange={e => updateQ(i, 'key', e.target.value)} />
                    <select className="select" value={q.type} style={{ width: 150 }}
                            onChange={e => updateQ(i, 'type', e.target.value)}>
                      {Q_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <input className="input" type="number" min={1} max={5} value={q.scoringWeight} style={{ width: 64 }}
                           title="Scoring weight" onChange={e => updateQ(i, 'scoringWeight', Number(e.target.value))} />
                    <button type="button" onClick={() => removeQ(i)} className="btn-icon" title="Remove question">✕</button>
                  </div>
                  <textarea className="textarea" style={{ minHeight: 52 }} dir="rtl"
                            placeholder="Question text (in Arabic) *" value={q.text}
                            onChange={e => updateQ(i, 'text', e.target.value)} />
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={close} className="btn btn-outline">Cancel</button>
              <button type="submit" disabled={saving} className="btn btn-primary">{saving ? 'Saving…' : 'Save script'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
