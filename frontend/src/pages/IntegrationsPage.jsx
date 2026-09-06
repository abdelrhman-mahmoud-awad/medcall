import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getGoogleStatus, getGoogleConnectUrl, disconnectGoogle } from '../services/api';

export default function IntegrationsPage() {
  const [status, setStatus] = useState(null);
  const [busy,   setBusy]   = useState(false);
  const [notice, setNotice] = useState(null);   // { type, text }
  const [params, setParams] = useSearchParams();

  const load = useCallback(() => {
    getGoogleStatus().then(r => setStatus(r.data)).catch(() => setStatus({ connected: false }));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Handle the OAuth redirect result (?drive=connected | ?drive=error)
  useEffect(() => {
    const drive = params.get('drive');
    if (!drive) return;
    if (drive === 'connected') setNotice({ type: 'ok', text: 'Google Drive connected successfully.' });
    else setNotice({ type: 'err', text: params.get('message') || 'Google Drive connection failed.' });
    setParams({}, { replace: true });
    load();
  }, [params, setParams, load]);

  const connect = async () => {
    setBusy(true);
    try {
      const r = await getGoogleConnectUrl();
      window.location.href = r.data.url;
    } catch (e) {
      setNotice({ type: 'err', text: e.response?.data?.error || 'Could not start the Google connection.' });
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Disconnect Google Drive? Sheet imports via Google Sheets links will stop working.')) return;
    setBusy(true);
    try {
      await disconnectGoogle();
      setNotice({ type: 'ok', text: 'Google Drive disconnected.' });
      load();
    } catch (e) {
      setNotice({ type: 'err', text: e.response?.data?.error || 'Disconnect failed.' });
    }
    setBusy(false);
  };

  const connected = !!status?.connected;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2 className="page-title">Integrations</h2>
          <p className="page-sub">Connect third-party services to your workspace</p>
        </div>
      </div>

      {notice && <div className={`alert ${notice.type === 'ok' ? 'alert-ok' : 'alert-err'}`}>{notice.text}</div>}

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10, flexShrink: 0,
            background: 'var(--primary-50)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--primary)"
                 strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2l10 17H2z" /><path d="M8 13h8" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h3 className="card-title" style={{ margin: 0 }}>Google Drive</h3>
              {status === null
                ? <span className="badge badge-gray">Checking…</span>
                : <span className={`badge ${connected ? 'badge-green' : 'badge-gray'}`}>{connected ? 'Connected' : 'Not connected'}</span>}
            </div>
            <p className="page-sub" style={{ margin: '6px 0 0', maxWidth: 560 }}>
              Lets projects import contact sheets directly from Google Sheets links and keeps
              them in sync. Connect with the Google account that owns your research sheets.
            </p>
            {connected && status?.email && (
              <p className="muted" style={{ marginTop: 8 }}>Connected as <strong>{status.email}</strong></p>
            )}
          </div>
          <div>
            {connected ? (
              <button className="btn btn-danger-outline" disabled={busy} onClick={disconnect}>
                {busy ? 'Working…' : 'Disconnect'}
              </button>
            ) : (
              <button className="btn btn-primary" disabled={busy || status === null} onClick={connect}>
                {busy ? 'Redirecting…' : 'Connect Google Drive'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">More integrations</h3>
        <p className="empty" style={{ padding: '18px 0 6px' }}>
          Twilio calling and Gemini AI are configured server-side in <code>backend/.env</code>.
          More workspace integrations are coming soon.
        </p>
      </div>
    </div>
  );
}
