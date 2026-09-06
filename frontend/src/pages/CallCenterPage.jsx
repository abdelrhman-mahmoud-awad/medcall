import { useState, useEffect, useRef } from 'react';
import { getContacts, getScripts, initiateCall, getCalls } from '../services/api';
import { onProjectChange } from '../services/projectStore';
import CallDrawer, { CALL_STATUS, LEAD_LABEL, formatDuration } from '../components/CallDrawer';

export default function CallCenterPage() {
  const [contacts, setContacts] = useState([]);
  const [scripts,  setScripts]  = useState([]);
  const [calls,    setCalls]    = useState([]);
  const [selected, setSelected] = useState(null);

  const [form, setForm]       = useState({ contactIds: [], scriptId: '' });
  const [calling, setCalling] = useState(false);
  const [results, setResults] = useState(null);    // { started: [], failed: [] }
  const [liveSids, setLiveSids] = useState([]);    // Twilio SIDs still in flight
  const [error, setError]     = useState('');
  const [filter, setFilter]   = useState('');
  const [contactFilter, setContactFilter] = useState('');

  const pollRef = useRef(null);

  const loadAll = () =>
    Promise.all([getContacts({ limit: 200 }), getScripts(), getCalls({ limit: 100 })])
      .then(([c, s, cl]) => {
        setContacts(c.data.contacts || []);
        setScripts(s.data || []);
        setCalls(cl.data.calls || []);
      });

  useEffect(() => {
    loadAll();
    // Re-fetch when the topbar project switcher changes the active project
    return onProjectChange(() => {
      setForm(f => ({ ...f, contactIds: [] }));   // selection may no longer be visible
      loadAll();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll for updates every 5s while any launched call is live
  const isPolling = liveSids.length > 0;
  useEffect(() => {
    if (!isPolling) return;
    pollRef.current = setInterval(async () => {
      const res = await getCalls({ limit: 100 });
      const list = res.data.calls || [];
      setCalls(list);
      const finished = new Set(
        list.filter(c => ['completed', 'escalated', 'failed', 'no-answer'].includes(c.status))
            .map(c => c.twilioCallSid)
      );
      setLiveSids(sids => sids.filter(s => !finished.has(s)));
    }, 5000);
    return () => clearInterval(pollRef.current);
  }, [isPolling]);

  const toggleContact = (id) => setForm(f => ({
    ...f,
    contactIds: f.contactIds.includes(id)
      ? f.contactIds.filter(x => x !== id)
      : [...f.contactIds, id],
  }));

  // Fire all selected calls in parallel — each gets its own Twilio call + session
  const handleCall = async (e) => {
    e.preventDefault();
    setError(''); setResults(null);
    if (!form.contactIds.length) { setError('Select at least one contact.'); return; }
    setCalling(true);

    const targets = form.contactIds.map(id => ({
      id, name: contacts.find(c => c._id === id)?.name || 'Unknown',
    }));
    const settled = await Promise.allSettled(
      targets.map(t => initiateCall({ contactId: t.id, scriptId: form.scriptId }))
    );

    const started = [], failed = [];
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') started.push({ name: targets[i].name, callSid: r.value.data.callSid });
      else failed.push({ name: targets[i].name, error: r.reason?.response?.data?.error || 'Failed to start' });
    });
    setResults({ started, failed });
    if (started.length) setLiveSids(sids => [...sids, ...started.map(s => s.callSid)]);

    const fresh = await getCalls({ limit: 100 });
    setCalls(fresh.data.calls || []);
    setCalling(false);
  };

  const visibleContacts = contacts.filter(c =>
    !contactFilter ||
    c.name?.toLowerCase().includes(contactFilter.toLowerCase()) ||
    c.phone?.includes(contactFilter) ||
    c.city?.toLowerCase().includes(contactFilter.toLowerCase())
  );

  const filtered = calls.filter(c =>
    !filter ||
    c.contact?.name?.toLowerCase().includes(filter.toLowerCase()) ||
    c.script?.drugName?.toLowerCase().includes(filter.toLowerCase()) ||
    c.leadLabel === filter ||
    c.status === filter
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2 className="page-title">Call Center</h2>
          <p className="page-sub">Launch AI-assisted research calls and monitor live outcomes</p>
        </div>
      </div>

      {/* New call(s) */}
      <div className="card">
        <h3 className="card-title">Start new calls</h3>
        <form onSubmit={handleCall}>
          <div className="form-row">
            <div style={{ flex: 2, minWidth: 260 }}>
              <label className="label">
                Contacts <span className="muted">({form.contactIds.length} selected — calls run in parallel)</span>
              </label>
              <input className="input" placeholder="Search by name, phone, or city…" value={contactFilter}
                     onChange={e => setContactFilter(e.target.value)} style={{ marginBottom: 8 }} />
              <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                {visibleContacts.map(c => (
                  <label key={c._id} className="check" style={{ display: 'flex', padding: '3px 0' }}>
                    <input type="checkbox" checked={form.contactIds.includes(c._id)}
                           onChange={() => toggleContact(c._id)} />
                    {c.name} ({c.type === 'physician' ? 'Physician' : 'Pharmacist'}) — {c.phone}
                    {c.doNotCall && <span className="badge badge-red" style={{ marginLeft: 6 }}>DNC</span>}
                  </label>
                ))}
                {!visibleContacts.length && <p className="muted" style={{ margin: 0 }}>No matching contacts.</p>}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" className="btn btn-ghost btn-sm"
                        onClick={() => setForm(f => ({
                          ...f,
                          contactIds: [...new Set([...f.contactIds, ...visibleContacts.filter(c => !c.doNotCall).map(c => c._id)])],
                        }))}>
                  Select all shown
                </button>
                <button type="button" className="btn btn-ghost btn-sm"
                        onClick={() => setForm(f => ({ ...f, contactIds: [] }))}>
                  Clear
                </button>
              </div>
            </div>

            <div style={{ flex: 2, minWidth: 240 }}>
              <label className="label">Script / drug</label>
              <select className="select" required value={form.scriptId}
                      onChange={e => setForm(f => ({ ...f, scriptId: e.target.value }))}>
                <option value="">Select a script…</option>
                {scripts.map(s => (
                  <option key={s._id} value={s._id}>{s.name} — {s.drugName}</option>
                ))}
              </select>
              <button type="submit" disabled={calling || !form.contactIds.length}
                      className="btn btn-primary" style={{ marginTop: 12, width: '100%' }}>
                {calling
                  ? 'Dialing…'
                  : form.contactIds.length > 1
                  ? `Start ${form.contactIds.length} parallel calls`
                  : 'Start call'}
              </button>
              {liveSids.length > 0 && (
                <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
                  <span className="dot" style={{ background: 'var(--danger)', marginRight: 6 }} />
                  {liveSids.length} call{liveSids.length > 1 ? 's' : ''} live — the log refreshes every 5 seconds.
                </p>
              )}
            </div>
          </div>
        </form>

        {error && <div className="alert alert-err" style={{ marginTop: 14, marginBottom: 0 }}>{error}</div>}
        {results?.started.length > 0 && (
          <div className="alert alert-ok" style={{ marginTop: 14, marginBottom: 0 }}>
            <strong>{results.started.length} call{results.started.length > 1 ? 's' : ''} started:</strong>{' '}
            {results.started.map(s => s.name).join(', ')}
          </div>
        )}
        {results?.failed.length > 0 && (
          <div className="alert alert-err" style={{ marginTop: 14, marginBottom: 0 }}>
            <strong>{results.failed.length} failed:</strong>{' '}
            {results.failed.map(f => `${f.name} (${f.error})`).join(' · ')}
          </div>
        )}
      </div>

      {/* Call log */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="card-head" style={{ padding: '16px 20px', marginBottom: 0 }}>
          <h3 className="card-title">Recent calls <span className="muted">({filtered.length})</span></h3>
          <input className="input" style={{ width: 240 }} placeholder="Filter by name or drug…"
                 value={filter} onChange={e => setFilter(e.target.value)} />
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>{['Contact', 'Type', 'Drug', 'Status', 'Lead', 'Score', 'Duration', 'Date'].map(h => (
                <th key={h}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="empty-cell">No calls yet. Start one from the form above.</td></tr>
              ) : filtered.map(c => {
                const st = CALL_STATUS[c.status] || CALL_STATUS.failed;
                const lb = LEAD_LABEL[c.leadLabel] || LEAD_LABEL.cold;
                return (
                  <tr key={c._id} className="clickable" onClick={() => setSelected(c)}>
                    <td style={{ fontWeight: 600 }}>{c.contact?.name || '—'}</td>
                    <td>{c.contact?.type === 'physician' ? 'Physician' : 'Pharmacist'}</td>
                    <td>{c.script?.drugName || '—'}</td>
                    <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                    <td><span className={`badge ${lb.cls}`}>{lb.label}</span></td>
                    <td>{c.leadScore != null ? `${c.leadScore}%` : '—'}</td>
                    <td>{formatDuration(c.durationSec)}</td>
                    <td className="muted" style={{ fontSize: 12.5 }}>{new Date(c.createdAt).toLocaleString('en-GB')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selected && <CallDrawer call={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
