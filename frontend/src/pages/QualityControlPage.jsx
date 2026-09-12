import { useEffect, useMemo, useState } from 'react';
import { getCalls } from '../services/api';
import { onProjectChange } from '../services/projectStore';
import { CALL_STATUS, formatDuration } from '../components/CallDrawer';

const REVIEW_KEY = 'medcall_quality_reviews';
const ASSIGNMENT_KEY = 'medcall_call_assignments';
const criteria = ['Consent', 'Script coverage', 'Accuracy', 'Conversation', 'Outcome'];

const readStore = (key) => {
  try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; }
};

const callType = (call) => call.initiatedBy ? 'Human' : 'AI';
const statusBadge = (status) => ({
  completed: 'badge-green', escalated: 'badge-amber', failed: 'badge-red',
  'no-answer': 'badge-gray', 'in-progress': 'badge-info', initiated: 'badge-info',
}[status] || 'badge-gray');

export default function QualityControlPage() {
  const [calls, setCalls] = useState([]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [reviewFilter, setReviewFilter] = useState('all');
  const [assignments, setAssignments] = useState(readStore(ASSIGNMENT_KEY));
  const [reviews, setReviews] = useState(readStore(REVIEW_KEY));
  const [review, setReview] = useState({});
  const [issue, setIssue] = useState({ category: 'Accuracy', severity: 'medium', note: '' });
  const [message, setMessage] = useState('');

  const load = () => getCalls({ limit: 200 }).then(r => setCalls(r.data.calls || r.data || [])).catch(() => setMessage('Unable to load calls right now.'));

  useEffect(() => {
    load();
    return onProjectChange(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const members = useMemo(() => {
    const values = calls.map(c => c.initiatedBy?.name || c.initiatedBy?.email).filter(Boolean);
    return [...new Set(values)];
  }, [calls]);

  const filtered = useMemo(() => calls.filter(call => {
    const haystack = `${call.contact?.name || ''} ${call.contact?.phone || ''} ${call._id || ''}`.toLowerCase();
    const matchesQuery = !query || haystack.includes(query.toLowerCase());
    const matchesType = type === 'all' || callType(call).toLowerCase() === type;
    const matchesReview = reviewFilter === 'all'
      || (reviewFilter === 'pending' && !reviews[call._id])
      || (reviewFilter === 'reviewed' && !!reviews[call._id])
      || (reviewFilter === 'flagged' && reviews[call._id]?.issues?.length);
    return matchesQuery && matchesType && matchesReview;
  }), [calls, query, type, reviewFilter, reviews]);

  const openReview = (call) => {
    setSelected(call);
    setReview(reviews[call._id] || { ratings: {}, outcome: 'pass', notes: '' });
    setIssue({ category: 'Accuracy', severity: 'medium', note: '' });
    setMessage('');
  };

  const saveReview = () => {
    if (!selected) return;
    const next = { ...reviews, [selected._id]: { ...review, reviewedAt: new Date().toISOString(), issues: review.issues || [] } };
    setReviews(next);
    localStorage.setItem(REVIEW_KEY, JSON.stringify(next));
    setMessage('Quality review saved.');
  };

  const addIssue = () => {
    if (!selected || !issue.note.trim()) return;
    const nextReview = { ...review, issues: [...(review.issues || []), { ...issue, id: Date.now(), status: 'open' }] };
    setReview(nextReview);
    setIssue({ ...issue, note: '' });
  };

  const assignCall = (call, member) => {
    const next = { ...assignments, [call._id]: member };
    setAssignments(next);
    localStorage.setItem(ASSIGNMENT_KEY, JSON.stringify(next));
  };

  const reviewedCount = calls.filter(call => reviews[call._id]).length;
  const flaggedCount = calls.filter(call => reviews[call._id]?.issues?.length).length;

  return (
    <div className="page quality-page">
      <div className="page-head">
        <div>
          <h2 className="page-title">Quality Control</h2>
          <p className="page-sub">Review human and AI calls, rate quality, and track issues.</p>
        </div>
        <div className="quality-summary">
          <span><b>{reviewedCount}</b> reviewed</span>
          <span><b>{calls.length - reviewedCount}</b> pending</span>
          <span><b>{flaggedCount}</b> flagged</span>
        </div>
      </div>

      {message && <div className="alert alert-ok">{message}</div>}

      <div className="quality-toolbar card">
        <input className="input" placeholder="Search contact, phone, or call ID" value={query} onChange={e => setQuery(e.target.value)} />
        <select className="select" value={type} onChange={e => setType(e.target.value)}>
          <option value="all">All call types</option>
          <option value="human">Human calls</option>
          <option value="ai">AI calls</option>
        </select>
        <select className="select" value={reviewFilter} onChange={e => setReviewFilter(e.target.value)}>
          <option value="all">All review states</option>
          <option value="pending">Pending review</option>
          <option value="reviewed">Reviewed</option>
          <option value="flagged">Flagged</option>
        </select>
      </div>

      <div className="card quality-table-card">
        <div className="card-head"><h3 className="card-title">Review queue <span className="muted">({filtered.length})</span></h3></div>
        <div className="table-wrap">
          <table className="table quality-table">
            <thead><tr>{['Call', 'Type', 'Status', 'Assigned member', 'Duration', 'Review', 'Action'].map(label => <th key={label}>{label}</th>)}</tr></thead>
            <tbody>
              {filtered.length === 0 ? <tr><td colSpan={7} className="empty-cell">No calls match this queue.</td></tr> : filtered.map(call => {
                const reviewed = reviews[call._id];
                const assigned = assignments[call._id] || '';
                return <tr key={call._id}>
                  <td><button className="table-link" onClick={() => openReview(call)}>{call.contact?.name || 'Unknown contact'}</button><small>{call.contact?.phone || call._id}</small></td>
                  <td><span className={`badge ${callType(call) === 'Human' ? 'badge-blue' : 'badge-purple'}`}>{callType(call)}</span></td>
                  <td><span className={`badge ${statusBadge(call.status)}`}>{CALL_STATUS[call.status]?.label || call.status || 'Unknown'}</span></td>
                  <td>{callType(call) === 'Human' ? <select className="select assignment-select" value={assigned} onChange={e => assignCall(call, e.target.value)}><option value="">Unassigned</option>{members.map(member => <option key={member} value={member}>{member}</option>)}</select> : <span className="muted">AI flow</span>}</td>
                  <td>{formatDuration(call.durationSec)}</td>
                  <td>{reviewed ? <span className={`badge ${reviewed.issues?.length ? 'badge-amber' : 'badge-green'}`}>{reviewed.issues?.length ? `${reviewed.issues.length} issue(s)` : 'Reviewed'}</span> : <span className="badge badge-gray">Pending</span>}</td>
                  <td><button className="btn btn-outline btn-sm" onClick={() => openReview(call)}>{reviewed ? 'Open review' : 'Review call'}</button></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selected && <div className="scrim" onClick={() => setSelected(null)}><aside className="quality-drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer-head"><div><h3>{selected.contact?.name || 'Call review'}</h3><p className="page-sub">{callType(selected)} call · {new Date(selected.createdAt).toLocaleString('en-GB')}</p></div><button className="drawer-close" onClick={() => setSelected(null)} aria-label="Close review">×</button></div>
        <div className="quality-drawer-body">
          <div className="evidence-strip"><span className={`badge ${statusBadge(selected.status)}`}>{CALL_STATUS[selected.status]?.label || selected.status}</span><span>{formatDuration(selected.durationSec)}</span><span>{selected.contact?.phone || 'No phone'}</span></div>
          {selected.recordingUrl || selected.recordingLink ? <audio controls src={selected.recordingUrl || selected.recordingLink} className="quality-audio" /> : <div className="alert alert-warn">Recording unavailable for this call.</div>}
          <section className="quality-section"><h4>Transcript</h4><pre className="transcript">{selected.transcript || 'Transcript unavailable.'}</pre></section>
          <section className="quality-section"><h4>Ratings</h4>{criteria.map(label => <label className="rating-row" key={label}><span>{label}</span><select className="select" value={review.ratings?.[label] || ''} onChange={e => setReview(r => ({ ...r, ratings: { ...r.ratings, [label]: e.target.value } }))}><option value="">Rate</option><option value="1">1 · Critical</option><option value="2">2 · Needs attention</option><option value="3">3 · Acceptable</option><option value="4">4 · Strong</option><option value="5">5 · Excellent</option></select></label>)}<label className="field"><span className="label">Review outcome</span><select className="select" value={review.outcome || 'pass'} onChange={e => setReview(r => ({ ...r, outcome: e.target.value }))}><option value="pass">Pass</option><option value="needs-attention">Needs attention</option><option value="fail">Fail</option><option value="unable-to-review">Unable to review</option></select></label><label className="field"><span className="label">Reviewer notes</span><textarea className="textarea" value={review.notes || ''} onChange={e => setReview(r => ({ ...r, notes: e.target.value }))} placeholder="What should the team know about this call?" /></label></section>
          <section className="quality-section"><h4>Report an issue</h4><div className="form-row"><select className="select" value={issue.category} onChange={e => setIssue(i => ({ ...i, category: e.target.value }))}><option>Consent</option><option>Script coverage</option><option>Accuracy</option><option>Human conduct</option><option>AI behavior</option><option>Audio or transcript</option><option>Other</option></select><select className="select" value={issue.severity} onChange={e => setIssue(i => ({ ...i, severity: e.target.value }))}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></div><textarea className="textarea" value={issue.note} onChange={e => setIssue(i => ({ ...i, note: e.target.value }))} placeholder="Describe the issue and where it occurs..." /><button className="btn btn-danger-outline btn-sm" onClick={addIssue} disabled={!issue.note.trim()}>Add issue</button>{review.issues?.length > 0 && <div className="issue-list">{review.issues.map(item => <div className="issue-item" key={item.id}><span className={`badge badge-${item.severity === 'critical' || item.severity === 'high' ? 'red' : 'amber'}`}>{item.severity}</span><span>{item.category}: {item.note}</span></div>)}</div>}</section>
          <button className="btn btn-primary" onClick={saveReview}>Save quality review</button>
        </div>
      </aside></div>}
    </div>
  );
}
