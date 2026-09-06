import { useState, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';
import CampaignCard from '../components/CampaignCard';
import LiveCallFeed from '../components/LiveCallFeed';
import api from '../services/api';

export default function CampaignPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [scripts,   setScripts]   = useState([]);
  const [contacts,  setContacts]  = useState([]);
  const [liveCalls, setLiveCalls] = useState([]);
  const [form,      setForm]      = useState({ name: '', scriptId: '', contactIds: [] });
  const [error,     setError]     = useState('');
  const [busy,      setBusy]      = useState(false);

  // Real-time updates from the backend
  useSocket(
    (callLog) => setLiveCalls(prev => [callLog, ...prev].slice(0, 25)),
    (progress) => setCampaigns(prev => prev.map(c =>
      c._id === progress.campaignId ? { ...c, ...progress } : c
    ))
  );

  const refresh = async () => {
    const res = await api.get('/campaigns');
    setCampaigns(res.data);
  };

  useEffect(() => {
    Promise.all([
      api.get('/campaigns'),
      api.get('/scripts'),
      api.get('/contacts', { params: { limit: 500 } }),
    ]).then(([c, s, ct]) => {
      setCampaigns(c.data);
      setScripts(s.data);
      setContacts(ct.data.contacts || ct.data || []);
    }).catch(() => setError('Failed to load data.'));
  }, []);

  const toggleContact = (id) => {
    setForm(f => ({
      ...f,
      contactIds: f.contactIds.includes(id)
        ? f.contactIds.filter(x => x !== id)
        : [...f.contactIds, id],
    }));
  };

  const create = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name || !form.scriptId || !form.contactIds.length) {
      setError('Fill in the name, choose a script, and select at least one contact.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post('/campaigns', form);
      setCampaigns(prev => [res.data, ...prev]);
      setForm({ name: '', scriptId: '', contactIds: [] });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create the campaign.');
    } finally {
      setBusy(false);
    }
  };

  const act = (action) => async (id) => {
    setError('');
    try {
      await api.post(`/campaigns/${id}/${action}`);
      await refresh();
    } catch (err) {
      setError(err.response?.data?.error || `Failed to ${action} the campaign.`);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2 className="page-title">Campaigns</h2>
          <p className="page-sub">Launch batch calls and watch progress in real time</p>
        </div>
      </div>
      {error && <div className="alert alert-err">{error}</div>}

      <div className="grid-21">
        {/* ── Left: create form + campaign list ── */}
        <div>
          <form onSubmit={create} className="card">
            <h3 className="card-title">New campaign</h3>
            <div className="field">
              <label className="label">Campaign name</label>
              <input className="input" placeholder="e.g. Cardio-X launch — Cairo"
                     value={form.name}
                     onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="field">
              <label className="label">Script</label>
              <select className="select" value={form.scriptId}
                      onChange={e => setForm(f => ({ ...f, scriptId: e.target.value }))}>
                <option value="">— select a script —</option>
                {scripts.map(s => (
                  <option key={s._id} value={s._id}>{s.name} ({s.drugName})</option>
                ))}
              </select>
            </div>

            <label className="label">Contacts ({form.contactIds.length} selected)</label>
            <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 14 }}>
              {contacts.map(c => (
                <label key={c._id} className="check" style={{ display: 'flex', padding: '3px 0' }}>
                  <input
                    type="checkbox"
                    checked={form.contactIds.includes(c._id)}
                    onChange={() => toggleContact(c._id)}
                  />
                  {c.name} — {c.phone} {c.doNotCall && <span className="badge badge-red">DNC</span>}
                </label>
              ))}
              {!contacts.length && <p className="muted" style={{ margin: 0 }}>No contacts available.</p>}
            </div>

            <button type="submit" disabled={busy} className="btn btn-primary">
              {busy ? 'Creating…' : 'Create campaign'}
            </button>
          </form>

          {campaigns.map(c => (
            <CampaignCard
              key={c._id}
              campaign={c}
              onLaunch={act('launch')}
              onPause={act('pause')}
              onResume={act('resume')}
            />
          ))}
          {!campaigns.length && <div className="empty">No campaigns yet.</div>}
        </div>

        {/* ── Right: live call feed ── */}
        <div className="card" style={{ position: 'sticky', top: 78 }}>
          <h3 className="card-title">
            <span className="dot" style={{ background: 'var(--danger)', marginRight: 6 }} />
            Live calls
          </h3>
          <LiveCallFeed calls={liveCalls} />
        </div>
      </div>
    </div>
  );
}
