import { useState, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';
import api from '../services/api';
import { onProjectChange, withProject } from '../services/projectStore';

export default function AgentConsolePage() {
  const [agents,      setAgents]      = useState([]);
  const [escalations, setEscalations] = useState([]);
  const [form,        setForm]        = useState({ name: '', phone: '', email: '' });
  const [error,       setError]       = useState('');

  // Live feed: surface escalated calls the moment they finalize
  useSocket((callLog) => {
    if (callLog?.escalated || callLog?.status === 'escalated') {
      setEscalations(prev => [callLog, ...prev].slice(0, 25));
    }
  });

  const loadEscalations = () =>
    api.get('/calls', { params: withProject({ status: 'escalated', limit: 25 }) })
      .then(res => setEscalations(res.data.calls || res.data || []))
      .catch(() => {});

  useEffect(() => {
    api.get('/agents')
      .then(res => setAgents(res.data))
      .catch(() => setError('Failed to load the agent list.'));
    // Load recent escalated calls from history
    loadEscalations();
    // Re-fetch escalations when the topbar project switcher changes
    return onProjectChange(loadEscalations);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addAgent = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name || !form.phone) { setError('Name and phone number are required.'); return; }
    try {
      const res = await api.post('/agents', form);
      setAgents(prev => [res.data, ...prev]);
      setForm({ name: '', phone: '', email: '' });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add the agent.');
    }
  };

  const toggleAvailable = async (agent) => {
    try {
      const res = await api.put(`/agents/${agent._id}`, { available: !agent.available });
      setAgents(prev => prev.map(a => a._id === agent._id ? res.data : a));
    } catch {
      setError('Failed to update availability.');
    }
  };

  const removeAgent = async (id) => {
    try {
      await api.delete(`/agents/${id}`);
      setAgents(prev => prev.filter(a => a._id !== id));
    } catch {
      setError('Failed to remove the agent.');
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2 className="page-title">Agent Console</h2>
          <p className="page-sub">Human agents who receive escalated calls via the conference bridge</p>
        </div>
      </div>
      {error && <div className="alert alert-err">{error}</div>}

      <div className="grid-2">
        {/* ── Agents management ── */}
        <div>
          <form onSubmit={addAgent} className="card">
            <h3 className="card-title">Add agent</h3>
            <div className="field">
              <label className="label">Name</label>
              <input className="input" placeholder="Agent name" value={form.name}
                     onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="field">
              <label className="label">Phone</label>
              <input className="input" placeholder="+20 1xx xxx xxxx" value={form.phone}
                     onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="field">
              <label className="label">Email (optional)</label>
              <input className="input" placeholder="agent@company.com" type="email" value={form.email}
                     onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <button type="submit" className="btn btn-primary">Add agent</button>
          </form>

          <div className="card">
            <h3 className="card-title">Agents</h3>
            {agents.map(a => (
              <div key={a._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #232326', fontSize: 13 }}>
                <span className="dot" style={{ background: a.available ? 'var(--success)' : '#3f3f46' }} />
                <span style={{ flex: 1 }}>
                  <b>{a.name}</b> — {a.phone}
                  <br />
                  <small className="muted">
                    Escalations handled: {a.escalationsHandled || 0}
                    {a.lastEscalationAt && ` · last: ${new Date(a.lastEscalationAt).toLocaleString('en-GB')}`}
                  </small>
                </span>
                <button onClick={() => toggleAvailable(a)} className="btn btn-outline btn-sm">
                  {a.available ? 'Set unavailable' : 'Set available'}
                </button>
                <button onClick={() => removeAgent(a._id)} className="btn-icon" title="Remove agent">✕</button>
              </div>
            ))}
            {!agents.length && <p className="muted" style={{ margin: 0 }}>No agents yet. Add one to receive escalated calls.</p>}
          </div>
        </div>

        {/* ── Escalated calls feed ── */}
        <div className="card">
          <h3 className="card-title">Escalated calls</h3>
          {escalations.map(c => (
            <div key={c._id} style={{ padding: '10px 0', borderBottom: '1px solid #232326', fontSize: 13 }}>
              <b>{c.contact?.name || 'Unknown'}</b> — {c.contact?.phone || ''}
              <br />
              <small className="muted">
                {c.script?.name && `Script: ${c.script.name} · `}
                {c.escalatedAt && new Date(c.escalatedAt).toLocaleString('en-GB')}
                {c.leadScore != null && ` · score: ${c.leadScore}`}
              </small>
            </div>
          ))}
          {!escalations.length && <p className="muted" style={{ margin: 0 }}>No escalated calls yet — they appear here in real time.</p>}
        </div>
      </div>
    </div>
  );
}
