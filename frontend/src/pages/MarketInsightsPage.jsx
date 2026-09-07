import { useEffect, useState, useCallback } from 'react';
import { getProjects, getProjectInsights } from '../services/api';

/**
 * MarketInsightsPage — Phase 5.
 * The AI reads the project's aggregated results (counts only) and writes the
 * market-research interpretation. The raw numbers are always shown above the
 * interpretation so the manager can verify every claim.
 */

function DistBars({ title, dist }) {
  const entries = Object.entries(dist || {}).filter(([, n]) => n > 0);
  if (!entries.length) return null;
  const max = Math.max(...entries.map(([, n]) => n));
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="label">{title}</div>
      {entries.map(([k, n]) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <span className="muted" style={{ width: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={k}>{k}</span>
          <div className="progress-track" style={{ flex: 1, height: 12 }}>
            <div className="progress-fill" style={{ width: `${(n / max) * 100}%`, height: 12 }} />
          </div>
          <b style={{ fontSize: 12, width: 32, textAlign: 'right' }}>{n}</b>
        </div>
      ))}
    </div>
  );
}

export default function MarketInsightsPage() {
  const [projects, setProjects] = useState([]);
  const [selected, setSelected] = useState('');
  const [data, setData]         = useState(null);   // { dataset, insights, generatedAt, aiAvailable }
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    getProjects().then(r => {
      setProjects(r.data);
      if (r.data.length) setSelected(r.data[0]._id);
    }).catch(e => setError(e.response?.data?.error || 'Failed to load projects.'));
  }, []);

  const load = useCallback(async (refresh = false) => {
    if (!selected) return;
    setLoading(true);
    setError('');
    try {
      const r = await getProjectInsights(selected, refresh);
      setData(r.data);
    } catch (e) {
      setData(null);
      setError(e.response?.data?.error || 'Failed to load the analysis.');
    }
    setLoading(false);
  }, [selected]);

  useEffect(() => { load(); }, [load]);

  const ds  = data?.dataset;
  const ins = data?.insights;

  const KPIS = ds ? [
    { label: 'Contacts',           value: ds.contacts?.total },
    { label: 'Completed calls',    value: ds.progress?.callsDone },
    { label: 'Forms submitted',    value: ds.progress?.formsDone },
    { label: 'Warm leads',         value: ds.leads?.warm },
    { label: 'Cold leads',         value: ds.leads?.cold },
    { label: 'Avg. lead score',    value: ds.leads?.avgScore },
    { label: 'Avg. duration (s)',  value: ds.calls?.avgDurationSec },
    { label: 'Recording consent',  value: `${ds.calls?.consent?.granted ?? 0} / ${(ds.calls?.consent?.granted ?? 0) + (ds.calls?.consent?.denied ?? 0)}` },
  ] : [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2 className="page-title">Market Insights (AI)</h2>
          <p className="page-sub">
            The AI only sees aggregated numbers — no names, no call transcripts — and every
            conclusion is tied to a figure in the data below.
          </p>
        </div>
        <div className="page-actions">
          <select className="select" style={{ width: 220 }} value={selected} onChange={e => setSelected(e.target.value)}>
            {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
          <button className="btn btn-primary" onClick={() => load(true)} disabled={loading || !selected}>
            {loading ? 'Analyzing…' : 'Re-run analysis'}
          </button>
        </div>
      </div>

      {data?.generatedAt && (
        <p className="muted" style={{ marginTop: -10, marginBottom: 16 }}>
          Last analysis: {new Date(data.generatedAt).toLocaleString('en-GB')} {data.cached ? '(cached)' : ''}
        </p>
      )}

      {error && <div className="alert alert-err">{error}</div>}
      {loading && <div className="empty">Analyzing…</div>}

      {ds && !loading && (
        <>
          {/* The raw numbers the AI saw */}
          <div className="kpi-grid">
            {KPIS.map(k => (
              <div key={k.label} className="kpi">
                <div className="kpi-value" style={{ fontSize: 22 }}>{k.value ?? '—'}</div>
                <div className="kpi-label">{k.label}</div>
              </div>
            ))}
          </div>

          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div className="card">
              <h3 className="card-title">Question answers</h3>
              {Object.entries(ds.answers || {}).map(([k, dist]) => (
                <DistBars key={k} title={k} dist={dist} />
              ))}
              {!Object.values(ds.answers || {}).some(d => Object.keys(d).length) && (
                <p className="muted" style={{ fontSize: 13 }}>No aggregated answers yet — complete some calls and forms first.</p>
              )}
            </div>
            <div className="card">
              <h3 className="card-title">Distributions</h3>
              <DistBars title="Call status" dist={ds.calls?.byStatus} />
              <DistBars title="Specialties" dist={ds.contacts?.bySpecialty} />
              <DistBars title="Cities" dist={ds.contacts?.byCity} />
              <DistBars title="Sentiment" dist={ds.sentiment} />
            </div>
          </div>

          {/* The AI interpretation */}
          {!ins ? (
            <div className="alert alert-warn">
              <strong>AI interpretation unavailable.</strong>{' '}
              {data.aiAvailable === false
                ? <>Make sure <code>GEMINI_API_KEY</code> is set in <code>backend/.env</code>, then click "Re-run analysis". The numbers above are real and come straight from the database.</>
                : 'Click "Re-run analysis" to try again.'}
            </div>
          ) : (
            <>
              <div className="card">
                <h3 className="card-title">Executive summary</h3>
                <p style={{ fontSize: 13, lineHeight: 1.8, margin: 0 }}>{ins.summary}</p>
              </div>

              <div className="grid-2" style={{ marginTop: 16 }}>
                <div className="card">
                  <h3 className="card-title">Key findings</h3>
                  <ul style={{ fontSize: 13, lineHeight: 1.8, paddingLeft: 18, margin: 0 }}>
                    {(ins.keyFindings || []).map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                </div>
                <div className="card">
                  <h3 className="card-title">Recommendations</h3>
                  <ul style={{ fontSize: 13, lineHeight: 1.8, paddingLeft: 18, margin: 0 }}>
                    {(ins.recommendations || []).map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              </div>

              {(ins.marketSignals || []).length > 0 && (
                <div className="card" style={{ marginTop: 16, padding: 0, overflow: 'hidden' }}>
                  <div className="card-head" style={{ padding: '16px 20px', marginBottom: 0 }}>
                    <h3 className="card-title">Market signals</h3>
                  </div>
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr><th>Signal</th><th>Evidence</th><th>Meaning</th></tr>
                      </thead>
                      <tbody>
                        {ins.marketSignals.map((s, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 600 }}>{s.signal}</td>
                            <td style={{ color: 'var(--primary)' }}>{s.evidence}</td>
                            <td>{s.meaning}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="grid-2" style={{ marginTop: 16 }}>
                {(ins.segments || []).length > 0 && (
                  <div className="card">
                    <h3 className="card-title">Segments</h3>
                    {ins.segments.map((s, i) => (
                      <p key={i} style={{ fontSize: 13, lineHeight: 1.7, margin: '0 0 10px' }}>
                        <b>{s.segment}:</b> {s.insight}
                      </p>
                    ))}
                  </div>
                )}
                {(ins.risks || []).length > 0 && (
                  <div className="card">
                    <h3 className="card-title">Risks</h3>
                    <ul style={{ fontSize: 13, lineHeight: 1.7, paddingLeft: 18, margin: 0 }}>
                      {ins.risks.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                )}
              </div>

              {ins.dataQuality && (
                <div className="alert alert-info" style={{ marginTop: 16 }}>
                  <strong>Data quality:</strong> {ins.dataQuality}
                </div>
              )}
            </>
          )}
        </>
      )}

      {!loading && !ds && !error && (
        <div className="empty">Select a project to view its analysis.</div>
      )}
    </div>
  );
}
