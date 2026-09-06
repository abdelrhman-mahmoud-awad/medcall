import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createProject, updateProject, addProjectMember,
  getScripts, getProjects, updateProjectSettings,
  uploadProjectSheet, linkProjectSheet,
} from '../services/api';

const STEPS = ['Project', 'Team', 'Script', 'Doctors data'];
const emptyMember = { name: '', email: '', password: '' };
const WIZARD_KEY = 'medcall_onboarding';

// Restore persisted wizard state so a page refresh doesn't restart the wizard
// (and re-create a duplicate project on step 1).
const readWizardState = () => {
  try { return JSON.parse(sessionStorage.getItem(WIZARD_KEY)) || {}; } catch { return {}; }
};

export default function OnboardingPage() {
  const nav = useNavigate();
  const saved = readWizardState();
  const [step, setStep]           = useState(saved.step || 1);
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState('');
  const [done, setDone]           = useState(false);

  // Step 1 — project
  const [projectId, setProjectId] = useState(saved.projectId || null);
  const [project, setProject]     = useState(saved.project || { name: '', targets: { calls: 0, forms: 0 } });

  // Step 2 — members
  const [members, setMembers]     = useState([{ ...emptyMember }]);
  const [addedMembers, setAddedMembers] = useState([]);

  // Step 3 — script
  const [scripts, setScripts]     = useState([]);
  const [scriptId, setScriptId]   = useState(saved.scriptId || '');

  // Step 4 — doctors data
  const [method, setMethod]       = useState(saved.method || 'file');   // 'file' | 'url'
  const [file, setFile]           = useState(null);
  const [sheetUrl, setSheetUrl]   = useState(saved.sheetUrl || '');
  const [importResult, setImportResult] = useState(null);

  const userName = (() => {
    try { return (JSON.parse(localStorage.getItem('medcall_user')) || {}).name || ''; } catch { return ''; }
  })();

  useEffect(() => { getScripts().then(r => setScripts(r.data || [])).catch(() => {}); }, []);

  // Validate a restored projectId — if it no longer exists (deleted, other
  // account, stale tab), fall back to a fresh wizard state.
  useEffect(() => {
    if (!saved.projectId) return;
    getProjects()
      .then(r => {
        const exists = (r.data || []).some(p => p._id === saved.projectId);
        if (!exists) {
          sessionStorage.removeItem(WIZARD_KEY);
          setStep(1);
          setProjectId(null);
          setProject({ name: '', targets: { calls: 0, forms: 0 } });
          setScriptId('');
          setMethod('file');
          setSheetUrl('');
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist wizard progress (never member passwords or files).
  useEffect(() => {
    if (done) return;
    try {
      sessionStorage.setItem(WIZARD_KEY, JSON.stringify({ step, projectId, project, scriptId, method, sheetUrl }));
    } catch { /* storage full/unavailable — wizard still works, just not refresh-safe */ }
  }, [step, projectId, project, scriptId, method, sheetUrl, done]);

  // Clear persisted state once setup is finished.
  useEffect(() => {
    if (done) sessionStorage.removeItem(WIZARD_KEY);
  }, [done]);

  const finish = () => { sessionStorage.removeItem(WIZARD_KEY); nav('/dashboard'); };

  // ── Step 1: create (or rename) the project ──
  const saveProject = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      if (projectId) {
        await updateProject(projectId, { name: project.name, targets: project.targets });
      } else {
        const r = await createProject(project);
        setProjectId(r.data._id);
      }
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create the project.');
    }
    setBusy(false);
  };

  // ── Step 2: create member accounts under this project ──
  const saveMembers = async () => {
    const rows = members.filter(m => m.name.trim() && m.email.trim() && m.password);
    if (!rows.length) { setStep(3); return; }
    setBusy(true); setError('');
    const failures = [];
    for (const m of rows) {
      try {
        await addProjectMember(projectId, m);
        setAddedMembers(prev => [...prev, m.email]);
      } catch (err) {
        failures.push(`${m.email}: ${err.response?.data?.error || 'failed'}`);
      }
    }
    setBusy(false);
    if (failures.length) { setError(failures.join(' · ')); return; }
    setMembers([{ ...emptyMember }]);
    setStep(3);
  };

  // ── Step 3: bind a script ──
  const saveScript = async () => {
    if (!scriptId) { setStep(4); return; }
    setBusy(true); setError('');
    try {
      await updateProjectSettings(projectId, { script: scriptId });
      setStep(4);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to link the script.');
    }
    setBusy(false);
  };

  // ── Step 4: import doctors / pharmacists data ──
  const importSheet = async () => {
    setBusy(true); setError(''); setImportResult(null);
    try {
      let r;
      if (method === 'file') {
        if (!file) { setError('Choose an .xlsx file first.'); setBusy(false); return; }
        const fd = new FormData();
        fd.append('file', file);
        r = await uploadProjectSheet(projectId, fd);
      } else {
        if (!sheetUrl.trim()) { setError('Paste the Google Sheet link first.'); setBusy(false); return; }
        r = await linkProjectSheet(projectId, sheetUrl.trim());
      }
      setImportResult(r.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Import failed.');
    }
    setBusy(false);
  };

  const setMemberField = (i, field, val) =>
    setMembers(ms => ms.map((m, j) => (j === i ? { ...m, [field]: val } : m)));

  return (
    <div className="auth-wrap">
      <div className="card" style={{ width: '100%', maxWidth: 640, padding: '28px 30px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 6 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 19 }}>
            {done ? 'You’re all set!' : `Welcome${userName ? `, ${userName.split(' ')[0]}` : ''} — let’s set up your workspace`}
          </h2>
          {!done && (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Four quick steps. You can change everything later, and skip anything you’re not ready for.
            </p>
          )}
        </div>

        {!done && (
          <>
            {/* Step indicator */}
            <div className="wizard-steps">
              <div className="wizard-line" />
              <div className="wizard-line-fill" style={{ width: `calc((100% - 68px) * ${(step - 1) / (STEPS.length - 1)})` }} />
              {STEPS.map((label, i) => {
                const n = i + 1;
                return (
                  <div key={label} className={`wizard-step ${step === n ? 'active' : step > n ? 'done' : ''}`}>
                    <div className="wizard-dot">{step > n ? '✓' : n}</div>
                    <span>{label}</span>
                  </div>
                );
              })}
            </div>

            {error && <div className="alert alert-err" style={{ marginTop: 14 }}>{error}</div>}

            {/* ── Step 1: Project ── */}
            {step === 1 && (
              <form onSubmit={saveProject} style={{ marginTop: 16 }}>
                <div className="field">
                  <label className="label">Project name *</label>
                  <input className="input" required autoFocus placeholder="e.g. Augmentin — Cairo market study"
                         value={project.name}
                         onChange={e => setProject(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="form-row field">
                  <div>
                    <label className="label">Target calls <span className="muted">(optional)</span></label>
                    <input className="input" type="number" min={0} value={project.targets.calls}
                           onChange={e => setProject(p => ({ ...p, targets: { ...p.targets, calls: Number(e.target.value) } }))} />
                  </div>
                  <div>
                    <label className="label">Target forms <span className="muted">(optional)</span></label>
                    <input className="input" type="number" min={0} value={project.targets.forms}
                           onChange={e => setProject(p => ({ ...p, targets: { ...p.targets, forms: Number(e.target.value) } }))} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                  <button type="button" className="btn btn-ghost" onClick={finish}>Skip setup</button>
                  <button type="submit" className="btn btn-primary" disabled={busy}>Continue</button>
                </div>
              </form>
            )}

            {/* ── Step 2: Members ── */}
            {step === 2 && (
              <div style={{ marginTop: 16 }}>
                <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
                  Member accounts work under you and only see this project. Save the passwords now — they won’t be shown again.
                </p>
                {members.map((m, i) => (
                  <div key={i} className="form-row field" style={{ alignItems: 'flex-end' }}>
                    <div>
                      <label className="label">Name</label>
                      <input className="input" value={m.name} onChange={e => setMemberField(i, 'name', e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Email</label>
                      <input className="input" type="email" value={m.email} onChange={e => setMemberField(i, 'email', e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Password</label>
                      <input className="input" type="text" minLength={6} value={m.password} onChange={e => setMemberField(i, 'password', e.target.value)} />
                    </div>
                    {members.length > 1 && (
                      <button type="button" className="btn-icon" style={{ marginBottom: 8 }} title="Remove"
                              onClick={() => setMembers(ms => ms.filter((_, j) => j !== i))}>✕</button>
                    )}
                  </div>
                ))}
                <button type="button" className="btn btn-outline btn-sm"
                        onClick={() => setMembers(ms => [...ms, { ...emptyMember }])}>
                  + Add another member
                </button>
                {addedMembers.length > 0 && (
                  <div className="alert alert-ok" style={{ marginTop: 12 }}>Added: {addedMembers.join(', ')}</div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
                  <button className="btn btn-ghost" onClick={() => setStep(3)}>Skip — just me for now</button>
                  <span style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-outline" onClick={() => setStep(1)}>Back</button>
                    <button className="btn btn-primary" disabled={busy} onClick={saveMembers}>
                      {busy ? 'Adding…' : 'Continue'}
                    </button>
                  </span>
                </div>
              </div>
            )}

            {/* ── Step 3: Script ── */}
            {step === 3 && (
              <div style={{ marginTop: 16 }}>
                <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
                  The script is what the AI says on calls for this project — greeting, research questions, and closing.
                </p>
                <div className="field">
                  <label className="label">Choose a script</label>
                  <select className="select" value={scriptId} onChange={e => setScriptId(e.target.value)}>
                    <option value="">— Decide later —</option>
                    {scripts.map(s => (
                      <option key={s._id} value={s._id}>{s.name} — {s.drugName} ({s.questions?.length || 0} questions)</option>
                    ))}
                  </select>
                </div>
                {!scripts.length && (
                  <div className="alert alert-info">No scripts yet — you can create one on the Scripts page after setup.</div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
                  <button className="btn btn-ghost" onClick={() => setStep(4)}>Skip</button>
                  <span style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-outline" onClick={() => setStep(2)}>Back</button>
                    <button className="btn btn-primary" disabled={busy} onClick={saveScript}>Continue</button>
                  </span>
                </div>
              </div>
            )}

            {/* ── Step 4: Doctors data ── */}
            {step === 4 && (
              <div style={{ marginTop: 16 }}>
                <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
                  Import your doctors / pharmacists sheet. Rows are validated (Egyptian phone format, duplicates) and invalid rows are rejected with reasons.
                </p>
                <div className="tabs" style={{ marginBottom: 14 }}>
                  <button className={`tab ${method === 'file' ? 'active' : ''}`} onClick={() => setMethod('file')}>Upload .xlsx</button>
                  <button className={`tab ${method === 'url' ? 'active' : ''}`} onClick={() => setMethod('url')}>Google Sheet link</button>
                </div>

                {method === 'file' ? (
                  <div className="field">
                    <label className="label">Excel file (.xlsx)</label>
                    <input className="input" type="file" accept=".xlsx"
                           onChange={e => setFile(e.target.files?.[0] || null)} />
                  </div>
                ) : (
                  <div className="field">
                    <label className="label">Google Sheet URL <span className="muted">(must be link-shared)</span></label>
                    <input className="input" placeholder="https://docs.google.com/spreadsheets/d/…"
                           value={sheetUrl} onChange={e => setSheetUrl(e.target.value)} />
                  </div>
                )}

                <button className="btn btn-outline" disabled={busy} onClick={importSheet}>
                  {busy ? 'Importing…' : 'Import'}
                </button>

                {importResult && (
                  <div className="alert alert-ok" style={{ marginTop: 12 }}>
                    Imported: <b>{importResult.imported}</b> new · <b>{importResult.linked}</b> linked
                    {importResult.invalidRows?.length > 0 && <> · <b>{importResult.invalidRows.length}</b> rejected rows</>}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
                  <button className="btn btn-ghost" onClick={() => setDone(true)}>Skip</button>
                  <span style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-outline" onClick={() => setStep(3)}>Back</button>
                    <button className="btn btn-primary" onClick={() => setDone(true)}>Finish setup</button>
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Success ── */}
        {done && (
          <div style={{ textAlign: 'center', padding: '24px 0 8px' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px',
              background: 'rgba(16,185,129,.15)', color: 'var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 30, boxShadow: '0 0 0 8px rgba(16,185,129,.06)',
            }}>✓</div>
            <h3 style={{ margin: '0 0 6px' }}>“{project.name}” is ready</h3>
            <p className="muted" style={{ margin: '0 0 20px', fontSize: 13 }}>
              You can add more projects, members, scripts, and data anytime from the sidebar.
            </p>
            <button className="btn btn-primary" onClick={finish}>Go to dashboard</button>
          </div>
        )}
      </div>
    </div>
  );
}
