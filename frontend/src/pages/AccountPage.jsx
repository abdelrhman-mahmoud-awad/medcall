import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getMe, updateMe, getTeam, createTeamMember, getProjects, addProjectMember } from '../services/api';

const emptyMember = { name: '', email: '', password: '', projectId: '' };

export default function AccountPage() {
  const [me, setMe]           = useState(null);
  const [name, setName]       = useState('');
  const [pw, setPw]           = useState({ current: '', next: '' });
  const [team, setTeam]       = useState([]);
  const [projects, setProjects] = useState([]);
  const [form, setForm]       = useState(emptyMember);
  const [notice, setNotice]   = useState(null);
  const [busy, setBusy]       = useState(false);

  const isManager = me && me.role !== 'member';
  const flash = (type, text) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 6000); };

  useEffect(() => {
    getMe().then(r => {
      setMe(r.data);
      setName(r.data.name);
      localStorage.setItem('medcall_user', JSON.stringify({ name: r.data.name, email: r.data.email }));
      if (r.data.role !== 'member') {
        getTeam().then(t => setTeam(t.data)).catch(() => {});
        getProjects().then(p => setProjects(p.data || [])).catch(() => {});
      }
    }).catch(() => flash('err', 'Failed to load your account.'));
  }, []);

  const saveProfile = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = { name };
      if (pw.next) { payload.currentPassword = pw.current; payload.newPassword = pw.next; }
      const r = await updateMe(payload);
      setMe(m => ({ ...m, name: r.data.name }));
      localStorage.setItem('medcall_user', JSON.stringify({ name: r.data.name, email: r.data.email }));
      setPw({ current: '', next: '' });
      flash('ok', 'Account updated.');
      window.dispatchEvent(new Event('medcall:user-updated'));
    } catch (err) {
      flash('err', err.response?.data?.error || 'Update failed.');
    }
    setBusy(false);
  };

  const addMember = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (form.projectId) {
        await addProjectMember(form.projectId, { name: form.name, email: form.email, password: form.password });
      } else {
        await createTeamMember({ name: form.name, email: form.email, password: form.password });
      }
      const t = await getTeam();
      setTeam(t.data);
      setForm(emptyMember);
      flash('ok', `Member account created${form.projectId ? ' and attached to the project' : ''}.`);
    } catch (err) {
      flash('err', err.response?.data?.error || 'Failed to create the member.');
    }
    setBusy(false);
  };

  if (!me) return <div className="page"><p className="muted">Loading…</p></div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2 className="page-title">Account{isManager ? ' & Team' : ''}</h2>
          <p className="page-sub">
            {isManager
              ? 'Your manager account and the member accounts that work under you'
              : 'Your member account — your work is attributed to you in project progress'}
          </p>
        </div>
      </div>

      {notice && <div className={`alert ${notice.type === 'ok' ? 'alert-ok' : 'alert-err'}`}>{notice.text}</div>}

      <div className={isManager ? 'grid-12' : ''}>
        {/* ── Profile ── */}
        <form onSubmit={saveProfile} className="card">
          <div className="card-head">
            <h3 className="card-title">Profile</h3>
            <span className={`badge ${me.role === 'member' ? 'badge-blue' : 'badge-green'}`}>{me.role}</span>
          </div>

          <div className="field">
            <label className="label">Name</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label className="label">Email</label>
            <input className="input" value={me.email} disabled />
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
            <p className="muted" style={{ margin: '0 0 10px' }}>Change password (leave empty to keep the current one)</p>
            <div className="field">
              <label className="label">Current password</label>
              <input className="input" type="password" value={pw.current} autoComplete="current-password"
                     onChange={e => setPw(p => ({ ...p, current: e.target.value }))} />
            </div>
            <div className="field">
              <label className="label">New password</label>
              <input className="input" type="password" minLength={6} value={pw.next} autoComplete="new-password"
                     onChange={e => setPw(p => ({ ...p, next: e.target.value }))} />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={busy}>Save changes</button>
        </form>

        {/* ── Team (managers only) ── */}
        {isManager && (
          <div>
            <form onSubmit={addMember} className="card">
              <h3 className="card-title">Add a member account</h3>
              <div className="form-row field">
                <div>
                  <label className="label">Name *</label>
                  <input className="input" required value={form.name}
                         onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Email *</label>
                  <input className="input" type="email" required value={form.email}
                         onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
              </div>
              <div className="form-row field">
                <div>
                  <label className="label">Password *</label>
                  <input className="input" type="password" required minLength={6} value={form.password}
                         onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Attach to project <span className="muted">(optional)</span></label>
                  <select className="select" value={form.projectId}
                          onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))}>
                    <option value="">— No project yet —</option>
                    {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                  </select>
                </div>
              </div>
              <button type="submit" className="btn btn-primary" disabled={busy}>Create member</button>
            </form>

            <div className="card">
              <div className="card-head">
                <h3 className="card-title">Team members ({team.length})</h3>
                <Link to="/projects" className="btn btn-outline btn-sm">Manage projects →</Link>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Name</th><th>Email</th><th>Projects</th><th>Added</th></tr>
                  </thead>
                  <tbody>
                    {team.map(m => (
                      <tr key={m.id}>
                        <td><b>{m.name}</b></td>
                        <td>{m.email}</td>
                        <td>
                          {m.projects?.length
                            ? m.projects.map(p => <span key={p} className="badge badge-blue" style={{ marginRight: 4 }}>{p}</span>)
                            : <span className="muted">Not attached</span>}
                        </td>
                        <td className="muted">{new Date(m.createdAt).toLocaleDateString('en-GB')}</td>
                      </tr>
                    ))}
                    {!team.length && (
                      <tr><td colSpan={4} className="empty-cell">
                        No member accounts yet — create one above. Members only see projects they're attached to.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
