import { useState, useEffect } from 'react';
import { getContacts, createContact, updateContact, deleteContact } from '../services/api';
import { onProjectChange } from '../services/projectStore';

const empty = { name: '', type: 'physician', specialty: '', phone: '', clinic: '', city: '' };

export default function ContactsPage() {
  const [contacts, setContacts] = useState([]);
  const [total,    setTotal]    = useState(0);
  const [search,   setSearch]   = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState(null);
  const [form,     setForm]     = useState(empty);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

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
          <button onClick={openNew} className="btn btn-primary">Add contact</button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>{['Name', 'Type', 'Specialty', 'Phone', 'Clinic', 'City', ''].map((h, i) => (
                <th key={i}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {contacts.length === 0 ? (
                <tr><td colSpan={7} className="empty-cell">No contacts found.</td></tr>
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
    </div>
  );
}
