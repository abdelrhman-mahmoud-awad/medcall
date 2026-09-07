import { useState, useEffect } from 'react';
import { getCalls, getCallStats } from '../services/api';
import { onProjectChange } from '../services/projectStore';
import CallDrawer, { CALL_STATUS, LEAD_LABEL, formatDuration } from '../components/CallDrawer';

export default function CallsPage() {
  const [calls,    setCalls]    = useState([]);
  const [stats,    setStats]    = useState(null);
  const [filter,   setFilter]   = useState('');
  const [selected, setSelected] = useState(null);

  const load = () =>
    Promise.all([getCalls({ limit: 200 }), getCallStats()]).then(([c, s]) => {
      setCalls(c.data.calls || []);
      setStats(s.data);
    });

  useEffect(() => {
    load();
    return onProjectChange(load);   // re-fetch on topbar project switch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = calls.filter(c =>
    !filter ||
    c.contact?.name?.toLowerCase().includes(filter.toLowerCase()) ||
    c.script?.drugName?.toLowerCase().includes(filter.toLowerCase()) ||
    c.leadLabel === filter ||
    c.status === filter
  );

  const KPIS = stats ? [
    { label: 'Total calls',     value: stats.total,     color: 'var(--primary)' },
    { label: 'Warm leads',      value: stats.warm,      color: 'var(--warning)' },
    { label: 'Cold leads',      value: stats.cold,      color: 'var(--info)' },
    { label: 'Escalated',       value: stats.escalated, color: 'var(--purple)' },
  ] : [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2 className="page-title">Call Log</h2>
          <p className="page-sub">Every research call, its outcome, and the full transcript</p>
        </div>
      </div>

      {stats && (
        <div className="kpi-grid">
          {KPIS.map(k => (
            <div key={k.label} className="kpi">
              <div className="kpi-value" style={{ color: k.color }}>{k.value ?? '—'}</div>
              <div className="kpi-label">{k.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="card-head" style={{ padding: '16px 20px', marginBottom: 0 }}>
          <h3 className="card-title">Calls <span className="muted">({filtered.length})</span></h3>
          <input className="input" style={{ width: 240 }} placeholder="Search…"
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
                <tr><td colSpan={8} className="empty-cell">No calls found.</td></tr>
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
