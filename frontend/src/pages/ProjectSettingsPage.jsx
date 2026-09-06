import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api, { getProjectSettings, updateProjectSettings, getScripts } from '../services/api';

/**
 * ProjectSettingsPage — Phase 6. Four tabs, all per-project:
 *   1. Form fields  — schema builder (key/label/type/options/source)
 *   2. Script       — bind one script; question↔field coverage check
 *   3. Consent      — the consent line + required toggle
 *   4. Data entry   — website URL + CSS-selector → field-key mapping
 */

const FIELD_TYPES = ['text', 'select', 'radio', 'number', 'date', 'textarea'];
const SOURCES = [
  { value: 'transcript',        label: 'Transcript (AI extracts it)' },
  { value: 'contact.name',      label: 'Contact: name' },
  { value: 'contact.phone',     label: 'Contact: phone' },
  { value: 'contact.specialty', label: 'Contact: specialty' },
  { value: 'contact.city',      label: 'Contact: city' },
  { value: 'call.leadScore',    label: 'Call: lead score' },
  { value: 'call.leadLabel',    label: 'Call: lead label' },
  { value: 'call.endedAt',      label: 'Call: date' },
];
const KEY_RE = /^[a-z][a-z0-9_]*$/;

function validateSchema(fields) {
  const errors = [];
  if (!fields.length) errors.push('Add at least one field');
  const seen = new Set();
  fields.forEach((f, i) => {
    const at = `Field ${i + 1}${f.key ? ` (${f.key})` : ''}`;
    if (!f.key || !KEY_RE.test(f.key)) errors.push(`${at}: key must be lowercase snake_case`);
    else if (seen.has(f.key)) errors.push(`${at}: duplicate key`);
    else seen.add(f.key);
    if (!f.label?.trim()) errors.push(`${at}: label is required`);
    if ((f.type === 'select' || f.type === 'radio') &&
        (f.options || []).filter(o => o.trim()).length < 2) {
      errors.push(`${at}: select/radio needs at least two options`);
    }
  });
  return errors;
}

export default function ProjectSettingsPage() {
  const { id } = useParams();
  const [tab, setTab]           = useState('schema');
  const [settings, setSettings] = useState(null);
  const [scripts, setScripts]   = useState([]);
  const [busy, setBusy]         = useState(false);
  const [notice, setNotice]     = useState(null);

  // Editable state per tab
  const [fields, setFields]       = useState([]);   // schema builder rows
  const [scriptId, setScriptId]   = useState('');
  const [consent, setConsent]     = useState({ line: '', required: null });
  const [dataEntry, setDataEntry] = useState({ websiteUrl: '', rows: [] }); // rows: [{selector,key}]

  const flash = (type, text) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 7000); };

  const load = useCallback(async () => {
    try {
      const [s, sc] = await Promise.all([getProjectSettings(id), getScripts()]);
      setSettings(s.data);
      setScripts(sc.data || []);
      setFields((s.data.formSchema?.fields || []).map(f => ({ ...f, options: f.options || [] })));
      setScriptId(s.data.script || '');
      setConsent({ line: s.data.consent?.line || '', required: s.data.consent?.required });
      setDataEntry({
        websiteUrl: s.data.dataEntry?.websiteUrl || '',
        rows: Object.entries(s.data.dataEntry?.fieldMappings || {}).map(([selector, key]) => ({ selector, key })),
      });
    } catch (e) {
      flash('err', e.response?.data?.error || 'Failed to load settings.');
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const save = async (patch, okMsg) => {
    setBusy(true);
    try {
      const r = await updateProjectSettings(id, patch);
      setSettings(prev => ({ ...prev, readiness: r.data.readiness, effective: r.data.effective }));
      flash('ok', okMsg);
    } catch (e) {
      flash('err', e.response?.data?.error || 'Save failed.');
    }
    setBusy(false);
  };

  // ── Tab save handlers ──
  const saveSchema = () => {
    const errors = validateSchema(fields);
    if (errors.length) return flash('err', errors.join(' · '));
    save({ formSchema: { fields: fields.map(f => ({
      key: f.key, label: f.label, type: f.type,
      options: (f.type === 'select' || f.type === 'radio') ? f.options.filter(o => o.trim()) : undefined,
      format: f.format || undefined,
      source: f.source || 'transcript',
    })) } }, 'Form fields saved.');
  };
  const resetSchema = () => save({ formSchema: null }, 'Reverted to the global template.').then(load);

  const copyGlobalTemplate = async () => {
    try {
      const r = await api.get('/data-entry/schema');
      setFields((r.data.fields || []).map(f => ({ ...f, options: f.options || [], source: f.source || 'transcript' })));
      flash('ok', 'Global template copied — edit and save.');
    } catch { flash('err', 'Failed to load the global template.'); }
  };

  const saveScript  = () => save({ script: scriptId || null }, 'Script linked.');
  const saveConsent = () => save({ consent: { line: consent.line, required: consent.required } }, 'Consent settings saved.');
  const saveDataEntry = () => {
    const fieldMappings = {};
    for (const row of dataEntry.rows) {
      if (row.selector.trim() && row.key.trim()) fieldMappings[row.selector.trim()] = row.key.trim();
    }
    save({ dataEntry: { websiteUrl: dataEntry.websiteUrl, fieldMappings } }, 'Data-entry site settings saved.');
  };

  // ── Schema builder row helpers ──
  const setField = (i, patch) => setFields(fs => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const moveField = (i, dir) => setFields(fs => {
    const j = i + dir;
    if (j < 0 || j >= fs.length) return fs;
    const copy = [...fs];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return copy;
  });

  const fieldKeys = fields.length
    ? fields.map(f => f.key).filter(Boolean)
    : (settings?.effective?.formSchema?.fields || []).map(f => f.key);

  if (!settings) {
    return (
      <div className="page">
        {notice
          ? <div className="alert alert-err">{notice.text}</div>
          : <div className="empty">Loading…</div>}
      </div>
    );
  }

  const TABS = [
    { key: 'schema',    label: 'Form fields' },
    { key: 'script',    label: 'Script' },
    { key: 'consent',   label: 'Consent' },
    { key: 'dataEntry', label: 'Data entry site' },
  ];

  const READINESS_BADGE = { ok: 'badge-green', warn: 'badge-amber', missing: 'badge-red' };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2 className="page-title">Project Settings</h2>
          <p className="page-sub">
            Each project has its own script, form fields, consent line, and data-entry site —
            anything left empty falls back to the global default.
          </p>
        </div>
        <div className="page-actions">
          <Link to="/projects" className="btn btn-outline btn-sm">← Back to projects</Link>
        </div>
      </div>

      {/* Readiness checklist */}
      <div className="card" style={{ padding: '14px 20px' }}>
        {(settings.readiness || []).map(item => (
          <div key={item.key} style={{ fontSize: 13, padding: '3px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`badge ${READINESS_BADGE[item.level] || 'badge-gray'}`}>
              {item.level === 'ok' ? 'OK' : item.level === 'warn' ? 'Warning' : 'Missing'}
            </span>
            {item.text}
          </div>
        ))}
      </div>

      {notice && <div className={`alert ${notice.type === 'ok' ? 'alert-ok' : 'alert-err'}`}>{notice.text}</div>}

      {/* Tabs */}
      <div className="tabs" style={{ margin: '16px 0' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`tab ${tab === t.key ? 'active' : ''}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab 1: Form schema builder ── */}
      {tab === 'schema' && (
        <div className="card">
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <button className="btn btn-outline btn-sm" onClick={copyGlobalTemplate}>Start from the global template</button>
            <button className="btn btn-outline btn-sm"
                    onClick={() => setFields(fs => [...fs, { key: '', label: '', type: 'text', options: [], source: 'transcript' }])}>
              Add field
            </button>
            {settings.formSchema && (
              <button className="btn btn-danger-outline btn-sm" onClick={resetSchema}>
                Revert to global template
              </button>
            )}
            <button className="btn btn-primary btn-sm" disabled={busy || !fields.length} onClick={saveSchema}>
              Save fields
            </button>
          </div>

          {!fields.length && (
            <p className="muted" style={{ fontSize: 13 }}>
              No custom fields — this project currently uses the global template. Start from the template or add fields.
            </p>
          )}

          {fields.map((f, i) => (
            <div key={i} style={{
              display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap',
              background: '#141414', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px',
            }}>
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <button onClick={() => moveField(i, -1)} className="btn-icon" style={{ padding: 0, fontSize: 10 }} title="Move up">▲</button>
                <button onClick={() => moveField(i, 1)}  className="btn-icon" style={{ padding: 0, fontSize: 10 }} title="Move down">▼</button>
              </span>
              <input className="input" placeholder="key (snake_case)" value={f.key} style={{ width: 150 }}
                     onChange={e => setField(i, { key: e.target.value })} />
              <input className="input" placeholder="Label" value={f.label} style={{ width: 170 }}
                     onChange={e => setField(i, { label: e.target.value })} />
              <select className="select" value={f.type} style={{ width: 110 }}
                      onChange={e => setField(i, { type: e.target.value })}>
                {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {(f.type === 'select' || f.type === 'radio') && (
                <input className="input" placeholder="options, comma-separated" value={(f.options || []).join(', ')}
                       style={{ flex: 1, minWidth: 160 }}
                       onChange={e => setField(i, { options: e.target.value.split(',').map(o => o.trim()) })} />
              )}
              <select className="select" value={f.source || 'transcript'} style={{ width: 200 }}
                      onChange={e => setField(i, { source: e.target.value })}>
                {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <button onClick={() => setFields(fs => fs.filter((_, j) => j !== i))}
                      className="btn-icon" title="Remove field">✕</button>
            </div>
          ))}

          <p className="muted" style={{ marginTop: 12 }}>
            Editing fields only affects new drafts — existing drafts keep their data as extracted.
          </p>
        </div>
      )}

      {/* ── Tab 2: Script ── */}
      {tab === 'script' && (
        <div className="card">
          <p style={{ fontSize: 13, margin: '0 0 14px', color: 'var(--text-2)' }}>
            Bind one script to this project — its calls will use it automatically.
            Question keys must match form field keys so answers flow into the form.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="select" value={scriptId} onChange={e => setScriptId(e.target.value)} style={{ minWidth: 280, width: 'auto' }}>
              <option value="">— No script (pick manually per call) —</option>
              {scripts.map(s => (
                <option key={s._id} value={s._id}>{s.name} ({s.questions?.length || 0} questions)</option>
              ))}
            </select>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={saveScript}>Save</button>
            <Link to="/scripts" style={{ fontSize: 12.5 }}>Manage scripts →</Link>
          </div>
          {scriptId && (
            <div style={{ marginTop: 16, fontSize: 12.5, color: 'var(--text-2)' }}>
              {(scripts.find(s => s._id === scriptId)?.questions || []).map(q => (
                <div key={q.key} style={{ padding: '6px 0', borderBottom: '1px solid #232326' }}>
                  <code>{q.key}</code>{' '}
                  <span dir="rtl">{q.text}</span>
                  {fieldKeys.length > 0 && !fieldKeys.includes(q.key) && (
                    <span className="badge badge-amber" style={{ marginLeft: 8 }}>No matching form field</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab 3: Consent ── */}
      {tab === 'consent' && (
        <div className="card">
          <div className="field">
            <label className="label">
              Consent line <span className="muted">(in Egyptian Arabic — spoken at the start of every call)</span>
            </label>
            <textarea className="textarea" dir="rtl" value={consent.line}
                      onChange={e => setConsent(c => ({ ...c, line: e.target.value }))}
                      placeholder={settings.effective?.consentLine} />
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="check">
              <input type="checkbox"
                     checked={consent.required ?? settings.effective?.consentRequired ?? true}
                     onChange={e => setConsent(c => ({ ...c, required: e.target.checked }))} />
              Consent is required (if unchecked, the call starts immediately)
            </label>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={saveConsent}>Save</button>
          </div>
          <div style={{ marginTop: 16, background: '#141414', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
            <span className="label" style={{ marginBottom: 4 }}>What will actually be said:</span>
            <span dir="rtl">{consent.line?.trim() || settings.effective?.consentLine}</span>
          </div>
        </div>
      )}

      {/* ── Tab 4: Data entry site ── */}
      {tab === 'dataEntry' && (
        <div className="card">
          <div className="field">
            <label className="label">Data-entry website URL for this project</label>
            <input className="input" value={dataEntry.websiteUrl}
                   onChange={e => setDataEntry(d => ({ ...d, websiteUrl: e.target.value }))}
                   placeholder="https://crm.example.com/new-entry" />
          </div>

          <div className="label" style={{ marginBottom: 8 }}>
            Field mappings: CSS selector → form field key
          </div>
          {dataEntry.rows.map((row, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input className="input" value={row.selector} placeholder={`input[name='doctor_name']`}
                     style={{ flex: 2 }}
                     onChange={e => setDataEntry(d => ({ ...d, rows: d.rows.map((r, j) => (j === i ? { ...r, selector: e.target.value } : r)) }))} />
              <select className="select" value={row.key} style={{ flex: 1 }}
                      onChange={e => setDataEntry(d => ({ ...d, rows: d.rows.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)) }))}>
                <option value="">— field —</option>
                {fieldKeys.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
              <button onClick={() => setDataEntry(d => ({ ...d, rows: d.rows.filter((_, j) => j !== i) }))}
                      className="btn-icon" title="Remove mapping">✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button className="btn btn-outline btn-sm"
                    onClick={() => setDataEntry(d => ({ ...d, rows: [...d.rows, { selector: '', key: '' }] }))}>
              Add mapping
            </button>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={saveDataEntry}>Save</button>
          </div>
          <p className="muted" style={{ marginTop: 14 }}>
            With no mappings, the browser extension tries to match fields by name automatically.
            Test on the real site: unmatched fields are highlighted in amber.
          </p>
        </div>
      )}
    </div>
  );
}
