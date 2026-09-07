import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getContacts, createContact, updateContact, deleteContact } from '../services/api';
import { onProjectChange } from '../services/projectStore';

const empty = { name: '', type: 'physician', specialty: '', phone: '', clinic: '', city: '' };

export default function ContactsPage() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [total,    setTotal]    = useState(0);
  const [search,   setSearch]   = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState(null);
  const [form,     setForm]     = useState(empty);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [verifyState, setVerifyState] = useState({});
  const [showFinder, setShowFinder] = useState(false);
  const [finder, setFinder] = useState({ specialty: '', area: '', count: 10, filters: '' });
  const [finderNotice, setFinderNotice] = useState('');
  const [showAddChoice, setShowAddChoice] = useState(false);

  const load = async (q = '') => {
    const res = await getContacts({ search: q, limit: 100 });
    setContacts(res.data.contacts || []);
    setTotal(res.data.total || 0);
  };

  useEffect(() => { load(); }, []);

  // Re-fetch on topbar project switch (keeps the current search text)
  useEffect(() => onProjectChange(() => load(search)), [search]);

  const openNew  = () => { setEditing(null); setForm(empty); setShowForm(true); setError(''); };
  const openEdit = (c) => {
    setEditing(c._id);
    setForm({ name: c.name, type: c.type, specialty: c.specialty || '', phone: c.phone, clinic: c.clinic || '', city: c.city || '' });
    setShowForm(true); setError('');
  };
  const close = () => { setShowForm(false); setEditing(null); };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      if (editing) await updateContact(editing, form);
      else         await createContact(form);
      await load(search);
      close();
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong.');
    } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this contact?')) return;
    await deleteContact(id);
    await load(search);
  };

  const checkOnline = (contact) => {
    setVerifyState(s => ({ ...s, [contact._id]: 'queued' }));
    setError(`AI check queued for ${contact.name}. Results will appear here after the AI service is connected.`);
  };

  const findDoctors = (e) => {
    e.preventDefault();
    setFinderNotice(`Search request saved: ${finder.specialty || 'any specialty'} in ${finder.area || 'any area'} (${finder.count} doctors). Connect the AI search service to return candidates.`);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2 className="page-title">Contacts <span className="muted" style={{ fontSize: 14 }}>({total})</span></h2>
          <p className="page-sub">Physicians and pharmacists in your call universe</p>
        </div>
        <div className="page-actions">
          <input
            className="input" style={{ width: 260 }}
            placeholder="Search by name or phone…"
            value={search}
            onChange={e => { setSearch(e.target.value); load(e.target.value); }}
          />
          <button onClick={() => navigate('/data/import')} className="btn btn-outline">Validate data</button>
          <button onClick={() => { setShowFinder(true); setFinderNotice(''); }} className="btn btn-outline">Find doctors</button>
          <button onClick={() => setShowAddChoice(true)} className="btn btn-primary">Add contact</button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>{['Name', 'Type', 'Specialty', 'Phone', 'Clinic', 'City', 'AI check', ''].map((h, i) => (
                <th key={i}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {contacts.length === 0 ? (
                <tr><td colSpan={8} className="empty-cell">No contacts found.</td></tr>
              ) : contacts.map(c => (
                <tr key={c._id}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td>
                    <span className={`badge ${c.type === 'physician' ? 'badge-blue' : 'badge-purple'}`}>
                      {c.type === 'physician' ? 'Physician' : 'Pharmacist'}
                    </span>
                  </td>
                  <td>{c.specialty || '—'}</td>
                  <td>{c.phone}</td>
                  <td>{c.clinic || '—'}</td>
                  <td>{c.city || '—'}</td>
                  <td>
                    <button className="btn btn-outline btn-sm" disabled={verifyState[c._id] === 'queued'} onClick={() => checkOnline(c)}>
                      {verifyState[c._id] === 'queued' ? 'Queued' : 'Check online'}
                    </button>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => openEdit(c)} className="btn btn-outline btn-sm" style={{ marginRight: 6 }}>Edit</button>
                    <button onClick={() => remove(c._id)} className="btn btn-danger-outline btn-sm">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showForm && (
        <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
          <form onSubmit={save} className="modal">
            <h3>{editing ? 'Edit contact' : 'New contact'}</h3>
            {error && <div className="alert alert-err">{error}</div>}
            <div className="field">
              <label className="label">Name *</label>
              <input className="input" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-row field">
              <div>
                <label className="label">Type</label>
                <select className="select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="physician">Physician</option>
                  <option value="pharmacist">Pharmacist</option>
                </select>
              </div>
              <div>
                <label className="label">Specialty</label>
                <input className="input" placeholder="e.g. cardiology" value={form.specialty} onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))} />
              </div>
            </div>
            <div className="field">
              <label className="label">Phone * <span className="muted">(e.g. +201001234567)</span></label>
              <input className="input" required value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="form-row field">
              <div>
                <label className="label">Clinic / pharmacy</label>
                <input className="input" value={form.clinic} onChange={e => setForm(f => ({ ...f, clinic: e.target.value }))} />
              </div>
              <div>
                <label className="label">City</label>
                <input className="input" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
              <button type="button" onClick={close} className="btn btn-outline">Cancel</button>
              <button type="submit" disabled={saving} className="btn btn-primary">{saving ? 'Saving…' : 'Save contact'}</button>
            </div>
          </form>
        </div>
      )}

      {showFinder && (
        <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) setShowFinder(false); }}>
          <form onSubmit={findDoctors} className="modal modal-lg">
            <h3>Find doctors</h3>
            <p className="modal-sub">Define the need first. The AI will search public sources and return candidates for manager review; it will not add or call anyone automatically.</p>
            {finderNotice && <div className="alert alert-info">{finderNotice}</div>}
            <div className="form-row field">
              <div><label className="label">Specialty or specialties *</label><input className="input" required placeholder="e.g. cardiology, endocrinology" value={finder.specialty} onChange={e => setFinder(f => ({ ...f, specialty: e.target.value }))} /></div>
              <div><label className="label">City / area *</label><input className="input" required placeholder="e.g. Cairo, Nasr City" value={finder.area} onChange={e => setFinder(f => ({ ...f, area: e.target.value }))} /></div>
            </div>
            <div className="form-row field">
              <div><label className="label">Doctors needed</label><input className="input" type="number" min="1" max="500" value={finder.count} onChange={e => setFinder(f => ({ ...f, count: e.target.value }))} /></div>
              <div><label className="label">Optional filters</label><input className="input" placeholder="hospital, clinic type, language" value={finder.filters} onChange={e => setFinder(f => ({ ...f, filters: e.target.value }))} /></div>
            </div>
            <div className="sourcing-checklist">
              <span>AI will return: source links</span><span>confidence</span><span>duplicate warnings</span><span>reviewable candidates</span>
            </div>
            <div className="modal-actions"><button type="button" className="btn btn-outline" onClick={() => setShowFinder(false)}>Close</button><button type="submit" className="btn btn-primary">Prepare AI search</button></div>
          </form>
        </div>
      )}

      {showAddChoice && (
        <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) setShowAddChoice(false); }}>
          <div className="modal">
            <h3>Add contact</h3>
            <p className="modal-sub">Choose how this doctor or pharmacist should be added to the call list.</p>
            <div className="add-contact-options">
              <button className="add-contact-option" onClick={() => { setShowAddChoice(false); openNew(); }}>
                <strong>Add manually</strong>
                <span>Open the new contact form and enter the details yourself.</span>
              </button>
              <button className="add-contact-option" onClick={() => { setShowAddChoice(false); navigate('/data/import'); }}>
                <strong>Excel integration</strong>
                <span>Open the Excel sheets integration to import the Successful doctors sheet.</span>
              </button>
            </div>
            <div className="modal-actions"><button className="btn btn-outline" onClick={() => setShowAddChoice(false)}>Cancel</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
