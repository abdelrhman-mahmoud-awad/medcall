import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  getProjects, createProject, updateProject, archiveProject,
  addProjectMember, removeProjectMember,
  uploadProjectSheet, linkProjectSheet, getProjectProgress,
} from '../services/api';

/**
 * ProjectsPage — Phase 5.
 * Manager: create projects, add members (email + password), attach the contact
 * sheet (xlsx upload or Google Sheet link), set targets, watch progress.
 * Member: read-only progress for the projects they're attached to.
 */

function Bar({ done, target }) {
  const pct = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;
  return (
    <div>
      <div className="progress-meta">
        <span>{done} / {target || '—'}</span>
        <span>{target > 0 ? `${pct}%` : 'No target'}</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ProjectCard({ project, isManager, onChanged }) {
  const [progress, setProgress] = useState(null);
  const [msg, setMsg]           = useState(null);   // { type, text }
  const [busy, setBusy]         = useState(false);
  const [targets, setTargets]   = useState({ calls: project.targets?.calls || 0, forms: project.targets?.forms || 0 });
  const [member, setMember]     = useState({ name: '', email: '', password: '' });
  const [sheetUrl, setSheetUrl] = useState('');

  const loadProgress = useCallback(() => {
    getProjectProgress(project._id)
      .then(r => setProgress(r.data))
      .catch(() => setProgress(null));
  }, [project._id]);

  useEffect(() => { loadProgress(); }, [loadProgress]);

  const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 6000); };

  const saveTargets = async () => {
    setBusy(true);
    try {
      await updateProject(project._id, { targets });
      flash('ok', 'Targets saved.');
      loadProgress();
    } catch (e) { flash('err', e.response?.data?.error || 'Failed to save targets.'); }
    setBusy(false);
  };

  const addMember = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await addProjectMember(project._id, member);
      flash('ok', `${member.email} added — save the password now, it won't be shown again.`);
      setMember({ name: '', email: '', password: '' });
      onChanged();
    } catch (e2) { flash('err', e2.response?.data?.error || 'Failed to add member.'); }
    setBusy(false);
  };

  const removeMember = async (uid) => {
    if (!window.confirm('Remove this member from the project?')) return;
    try { await removeProjectMember(project._id, uid); onChanged(); }
    catch (e) { flash('err', e.response?.data?.error || 'Failed to remove member.'); }
  };

  const uploadFile = async (file) => {
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await uploadProjectSheet(project._id, fd);
      flash('ok', `Imported: ${r.data.imported} new · ${r.data.linked} linked · ${r.data.invalidRows.length} rejected rows.`);
      onChanged(); loadProgress();
    } catch (e) { flash('err', e.response?.data?.error || 'Import failed.'); }
    setBusy(false);
  };

  const linkSheet = async () => {
    if (!sheetUrl.trim()) return;
    setBusy(true);
    try {
      const r = await linkProjectSheet(project._id, sheetUrl.trim());
      flash('ok', `Imported from Google Sheets: ${r.data.imported} new · ${r.data.linked} linked.`);
      setSheetUrl(''); onChanged(); loadProgress();
    } catch (e) { flash('err', e.response?.data?.error || 'Import failed.'); }
    setBusy(false);
  };

  const archive = async () => {
    if (!window.confirm(`Archive the project "${project.name}"?`)) return;
    try { await archiveProject(project._id); onChanged(); }
    catch (e) { flash('err', e.response?.data?.error || 'Archiving failed.'); }
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 16, margin: 0 }}>{project.name}</h3>
        <span className="muted">
          {project.sheet?.importedAt
            ? `Sheet: ${project.sheet.sourceType === 'google_sheet' ? 'Google Sheets' : project.sheet.fileName || 'xlsx'} · ${new Date(project.sheet.importedAt).toLocaleDateString('en-GB')}`
            : 'No sheet attached yet'}
        </span>
        {isManager && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
            <Link to={`/projects/${project._id}/settings`} className="btn btn-ghost btn-sm">Settings</Link>
            <button onClick={archive} className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}>Archive</button>
          </span>
        )}
      </div>

      {msg && (
        <div className={`alert ${msg.type === 'ok' ? 'alert-ok' : 'alert-err'}`} style={{ marginTop: 12, marginBottom: 0 }}>
          {msg.text}
        </div>
      )}

      {/* Progress */}
      <div className="grid-2" style={{ marginTop: 18 }}>
        <div>
          <div className="label">Completed calls</div>
          <Bar done={progress?.totals?.calls || 0} target={progress?.targets?.calls || 0} />
        </div>
        <div>
          <div className="label">Forms submitted</div>
          <Bar done={progress?.totals?.forms || 0} target={progress?.targets?.forms || 0} />
        </div>
      </div>
      {progress && (
        <div style={{ display: 'flex', gap: 18, marginTop: 12, fontSize: 12.5, color: 'var(--text-2)', flexWrap: 'wrap' }}>
          <span>Contacts: <b>{progress.totals.contacts}</b></span>
          <span>Hot leads: <b>{progress.totals.hotLeads}</b></span>
          {progress.totals.avgScore != null && <span>Avg. score: <b>{progress.totals.avgScore}</b></span>}
        </div>
      )}

      {/* Per-member table */}
      {progress?.members?.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 14 }}>
          <table className="table">
            <thead>
              <tr><th>Member</th><th>Calls</th><th>Forms</th>{isManager && <th />}</tr>
            </thead>
            <tbody>
              {progress.members.map(m => (
                <tr key={m.id || 'none'}>
                  <td>
                    {m.name} {m.email && <span className="muted">({m.email})</span>}
                  </td>
                  <td><b>{m.calls}</b></td>
                  <td><b>{m.forms}</b></td>
                  {isManager && (
                    <td style={{ textAlign: 'right' }}>
                      {m.id && project.members?.some(pm => (pm._id || pm) === m.id) && (
                        <button onClick={() => removeMember(m.id)} className="btn btn-danger-outline btn-sm">
                          Remove
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Manager tools */}
      {isManager && (
        <div className="grid-2" style={{ marginTop: 20 }}>
          {/* Targets */}
          <div>
            <div className="label">Targets <span className="muted">(completed calls · submitted forms)</span></div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input className="input" type="number" min="0" value={targets.calls} style={{ width: 100 }}
                     placeholder="Calls" onChange={e => setTargets(t => ({ ...t, calls: e.target.value }))} />
              <input className="input" type="number" min="0" value={targets.forms} style={{ width: 100 }}
                     placeholder="Forms" onChange={e => setTargets(t => ({ ...t, forms: e.target.value }))} />
              <button onClick={saveTargets} disabled={busy} className="btn btn-outline btn-sm">Save</button>
            </div>
          </div>

          {/* Sheet */}
          <div>
            <div className="label">Contact sheet</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}>
                Upload .xlsx
                <input type="file" accept=".xlsx" style={{ display: 'none' }}
                       onChange={e => { uploadFile(e.target.files[0]); e.target.value = ''; }} />
              </label>
              <input className="input" value={sheetUrl} onChange={e => setSheetUrl(e.target.value)}
                     placeholder="…or a Google Sheets link (shared by link)" style={{ flex: 1, minWidth: 180 }} />
              <button onClick={linkSheet} disabled={busy || !sheetUrl.trim()} className="btn btn-primary btn-sm">Import</button>
            </div>
          </div>

          {/* Add member */}
          <form onSubmit={addMember} style={{ gridColumn: '1 / -1' }}>
            <div className="label">Add a team member</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input className="input" required placeholder="Name" value={member.name} style={{ flex: 1, minWidth: 120 }}
                     onChange={e => setMember(m => ({ ...m, name: e.target.value }))} />
              <input className="input" required type="email" placeholder="Email" value={member.email} style={{ flex: 1, minWidth: 160 }}
                     onChange={e => setMember(m => ({ ...m, email: e.target.value }))} />
              <input className="input" required minLength={6} placeholder="Password" value={member.password} style={{ flex: 1, minWidth: 120 }}
                     onChange={e => setMember(m => ({ ...m, password: e.target.value }))} />
              <button type="submit" disabled={busy} className="btn btn-primary">Add member</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default function ProjectsPage() {
  const role = localStorage.getItem('medcall_role') || 'manager';
  const isManager = role !== 'member';

  const [projects, setProjects]     = useState(null);
  const [newProject, setNewProject] = useState({ name: '', calls: '', forms: '' });
  const [error, setError]           = useState('');

  const load = useCallback(() => {
    getProjects().then(r => setProjects(r.data)).catch(e => {
      setProjects([]);
      setError(e.response?.data?.error || 'Failed to load projects.');
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await createProject({
        name: newProject.name,
        targets: { calls: newProject.calls, forms: newProject.forms },
      });
      setNewProject({ name: '', calls: '', forms: '' });
      load();
    } catch (e2) { setError(e2.response?.data?.error || 'Failed to create the project.'); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2 className="page-title">Projects</h2>
          <p className="page-sub">
            {isManager
              ? 'Create research projects, add your team, attach the contact sheet, and track progress'
              : 'Your projects and team progress'}
          </p>
        </div>
      </div>

      {error && <div className="alert alert-err">{error}</div>}

      {isManager && (
        <form onSubmit={create} className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <b style={{ fontSize: 13 }}>New project</b>
          <input className="input" required placeholder="Project name" value={newProject.name} style={{ flex: 1, minWidth: 180 }}
                 onChange={e => setNewProject(p => ({ ...p, name: e.target.value }))} />
          <input className="input" type="number" min="0" placeholder="Calls target" value={newProject.calls} style={{ width: 130 }}
                 onChange={e => setNewProject(p => ({ ...p, calls: e.target.value }))} />
          <input className="input" type="number" min="0" placeholder="Forms target" value={newProject.forms} style={{ width: 130 }}
                 onChange={e => setNewProject(p => ({ ...p, forms: e.target.value }))} />
          <button type="submit" className="btn btn-primary">Create</button>
        </form>
      )}

      {projects === null ? (
        <div className="empty">Loading…</div>
      ) : projects.length === 0 ? (
        <div className="card">
          <div className="empty">
            {isManager ? 'No projects yet — create your first one above.' : "You haven't been added to any project yet."}
          </div>
        </div>
      ) : (
        projects.map(p => (
          <ProjectCard key={p._id} project={p} isManager={isManager} onChanged={load} />
        ))
      )}
    </div>
  );
}
