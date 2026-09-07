import { useState, useEffect, useCallback } from 'react';
import {
  getExcelStatus, getExcelChanges,
  uploadSuccessfulDoctors, approveChange, rejectChange, verifyChange,
} from '../services/api';

const VERDICT = {
  confirmed:    { cls: 'badge-green', label: 'Confirmed' },
  contradicted: { cls: 'badge-red',   label: 'Contradicted' },
  not_found:    { cls: 'badge-gray',  label: 'Not found' },
  error:        { cls: 'badge-amber', label: 'Error' },
};

export default function ExcelSyncPage() {
  const [status,  setStatus]  = useState(null);
  const [changes, setChanges] = useState([]);
  const [busy,    setBusy]    = useState('');       // '', 'upload', 'sync', 'download', or a change id
  const [notice,  setNotice]  = useState(null);     // { type, text }

  const flash = (type, text) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 7000); };

  const load = useCallback(async () => {
    const [s, c] = await Promise.all([getExcelStatus(), getExcelChanges()]);
    setStatus(s.data);
    setChanges(c.data || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSuccessfulUpload = async (file) => {
    if (!file) return;
    setBusy('successful-upload');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await uploadSuccessfulDoctors(fd);
      flash('ok', `Valid doctors integrated — ${r.data.linked} matched · ${r.data.withLinks} links received · ${r.data.pending} waiting for data-entry links.`);
      load();
    } catch (e) { flash('err', e.response?.data?.error || 'Successful-doctors import failed.'); }
    setBusy('');
  };

  const review = async (id, action) => {
    setBusy(id);
    try {
      if (action === 'approve') await approveChange(id);
      else if (action === 'reject') await rejectChange(id);
      else await verifyChange(id);
      flash('ok', action === 'verify' ? 'AI verification finished.' : `Change ${action}d.`);
      load();
    } catch (e) { flash('err', e.response?.data?.error || 'Action failed.'); }
    setBusy('');
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2 className="page-title">Excel Sync</h2>
          <p className="page-sub">Attach successful doctors to the Contacts call list with their unique data-entry links</p>
        </div>
        <div className="page-actions">
          <label className="btn btn-outline" style={{ cursor: 'pointer' }}>
            {busy === 'successful-upload' ? 'Integrating…' : 'Integrate valid doctors Excel sheet'}
            <input type="file" accept=".xlsx" style={{ display: 'none' }}
                   onChange={e => { handleSuccessfulUpload(e.target.files[0]); e.target.value = ''; }} />
          </label>
        </div>
      </div>

      {notice && <div className={`alert ${notice.type === 'ok' ? 'alert-ok' : 'alert-err'}`}>{notice.text}</div>}

      {status && (
        <div className="kpi-grid">
          <div className="kpi"><div className="kpi-value">{status.total}</div><div className="kpi-label">Contacts</div></div>
          <div className="kpi"><div className="kpi-value">{status.linked}</div><div className="kpi-label">Linked to a sheet row</div></div>
          <div className="kpi"><div className="kpi-value" style={{ color: 'var(--success)' }}>{status.synced}</div><div className="kpi-label">Synced</div></div>
          <div className="kpi"><div className="kpi-value" style={{ color: status.pendingChanges ? 'var(--warning)' : undefined }}>{status.pendingChanges}</div><div className="kpi-label">Pending changes</div></div>
          <div className="kpi">
            <div className="kpi-value" style={{ fontSize: 15, paddingTop: 6 }}>
              <span className={`badge ${status.autoSync ? 'badge-green' : 'badge-gray'}`}>{status.autoSync ? 'On' : 'Off'}</span>{' '}
              <span className={`badge ${status.autoVerify ? 'badge-green' : 'badge-gray'}`}>{status.autoVerify ? 'AI on' : 'AI off'}</span>
            </div>
            <div className="kpi-label">Auto-sync / auto-verify</div>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="card-head" style={{ padding: '16px 20px', marginBottom: 0 }}>
          <h3 className="card-title">Pending data changes <span className="muted">({changes.length})</span></h3>
          <span className="muted">Detected when a re-uploaded sheet disagrees with the database</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>{['Contact', 'Field', 'Current value', 'New value', 'Sheet row', 'AI verdict', ''].map((h, i) => (
                <th key={i}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {changes.length === 0 ? (
                <tr><td colSpan={7} className="empty-cell">No pending changes. Everything is in sync.</td></tr>
              ) : changes.map(ch => {
                const v = ch.aiVerdict ? VERDICT[ch.aiVerdict] : null;
                return (
                  <tr key={ch._id}>
                    <td style={{ fontWeight: 600 }}>{ch.contact?.name || '—'}</td>
                    <td><span className="badge badge-gray">{ch.field}</span></td>
                    <td className="muted">{ch.oldValue || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{ch.newValue || '—'}</td>
                    <td>{ch.excelRow ?? '—'}</td>
                    <td>
                      {v ? (
                        <span className={`badge ${v.cls}`} title={ch.aiFindings || ''}>
                          {v.label}{ch.aiConfidence != null ? ` · ${ch.aiConfidence}%` : ''}
                        </span>
                      ) : <span className="muted">Not checked</span>}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn btn-ghost btn-sm" disabled={busy === ch._id}
                              onClick={() => review(ch._id, 'verify')}>Verify (AI)</button>{' '}
                      <button className="btn btn-success btn-sm" disabled={busy === ch._id}
                              onClick={() => review(ch._id, 'approve')}>Approve</button>{' '}
                      <button className="btn btn-danger-outline btn-sm" disabled={busy === ch._id}
                              onClick={() => review(ch._id, 'reject')}>Reject</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
