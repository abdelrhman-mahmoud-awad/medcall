import { useState, useEffect, useRef } from 'react';
import { getContacts, getScripts, initiateCall, getCalls } from '../services/api';

// ── Status badge ───────────────────────────────────────────────────────────────
const statusColors = {
  initiated:   { bg: '#e8f4ff', color: '#1a73e8', label: 'جارٍ الاتصال' },
  'in-progress':{ bg: '#fff8e1', color: '#f57c00', label: 'قيد التشغيل' },
  completed:   { bg: '#e8f5e9', color: '#2e7d32', label: 'مكتمل' },
  escalated:   { bg: '#fce4ec', color: '#c62828', label: 'محوّل لإنساني' },
  failed:      { bg: '#f5f5f5', color: '#616161', label: 'فشل' },
  'no-answer': { bg: '#f5f5f5', color: '#616161', label: 'لا رد' },
};

const labelColors = {
  hot:  { bg: '#fce4ec', color: '#c62828' },
  warm: { bg: '#fff3e0', color: '#e65100' },
  cold: { bg: '#e3f2fd', color: '#1565c0' },
};

function Badge({ text, style }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 600,
      ...style,
    }}>{text}</span>
  );
}

// ── Single call log row ────────────────────────────────────────────────────────
function CallRow({ call, onClick }) {
  const st  = statusColors[call.status] || statusColors.failed;
  const lb  = labelColors[call.leadLabel] || labelColors.cold;
  const dur = call.durationSec
    ? `${Math.floor(call.durationSec / 60)}:${String(call.durationSec % 60).padStart(2, '0')}`
    : '—';

  return (
    <tr
      onClick={() => onClick(call)}
      style={{ cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
    >
      <td style={td}>{call.contact?.name || '—'}</td>
      <td style={td}>{call.contact?.type === 'physician' ? 'طبيب' : 'صيدلاني'}</td>
      <td style={td}>{call.script?.drugName || '—'}</td>
      <td style={td}><Badge text={st.label} style={{ bg: st.bg, color: st.color, background: st.bg }} /></td>
      <td style={td}><Badge text={call.leadLabel || 'cold'} style={{ background: lb.bg, color: lb.color }} /></td>
      <td style={td}>{call.leadScore != null ? `${call.leadScore}%` : '—'}</td>
      <td style={td}>{dur}</td>
      <td style={td}>{new Date(call.createdAt).toLocaleString('ar-EG')}</td>
    </tr>
  );
}

const td = { padding: '10px 12px', fontSize: 13 };
const th = { padding: '10px 12px', fontSize: 12, fontWeight: 600, color: '#666', borderBottom: '2px solid #eee', textAlign: 'right' };

// ── Call detail drawer ─────────────────────────────────────────────────────────
function CallDetail({ call, onClose }) {
  if (!call) return null;
  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 480,
      background: '#fff', boxShadow: '-4px 0 20px rgba(0,0,0,.12)',
      zIndex: 100, display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>تفاصيل المكالمة</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <p><strong>جهة الاتصال:</strong> {call.contact?.name}</p>
        <p><strong>الدواء:</strong> {call.script?.drugName}</p>
        <p><strong>النتيجة:</strong> {call.leadLabel} — {call.leadScore}%</p>
        <p><strong>المدة:</strong> {call.durationSec ? `${call.durationSec} ثانية` : '—'}</p>

        {call.responses?.length > 0 && (
          <>
            <h4 style={{ marginTop: 20, marginBottom: 8 }}>إجابات السكريبت</h4>
            {call.responses.map((r, i) => (
              <div key={i} style={{ background: '#f8f9fa', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                <p style={{ margin: '0 0 4px', fontSize: 12, color: '#888' }}>{r.questionText}</p>
                <p style={{ margin: '0 0 4px', fontWeight: 500 }}>{r.answer || '—'}</p>
                <Badge text={r.sentiment || 'unclear'} style={{
                  background: r.sentiment === 'positive' ? '#e8f5e9' : r.sentiment === 'negative' ? '#fce4ec' : '#f5f5f5',
                  color:      r.sentiment === 'positive' ? '#2e7d32' : r.sentiment === 'negative' ? '#c62828' : '#616161',
                }} />
              </div>
            ))}
          </>
        )}

        {call.transcript && (
          <>
            <h4 style={{ marginTop: 20, marginBottom: 8 }}>نص المكالمة</h4>
            <div style={{ background: '#f8f9fa', borderRadius: 8, padding: 12, fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.8, direction: 'rtl' }}>
              {call.transcript}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CallCenterPage() {
  const [contacts, setContacts]       = useState([]);
  const [scripts,  setScripts]        = useState([]);
  const [calls,    setCalls]          = useState([]);
  const [selectedCall, setSelectedCall] = useState(null);

  const [form, setForm] = useState({ contactId: '', scriptId: '' });
  const [calling, setCalling]   = useState(false);
  const [callResult, setResult] = useState(null);
  const [error, setError]       = useState('');
  const [filter, setFilter]     = useState('');

  const pollRef = useRef(null);

  useEffect(() => {
    Promise.all([
      getContacts({ limit: 200 }),
      getScripts(),
      getCalls({ limit: 100 }),
    ]).then(([c, s, cl]) => {
      setContacts(c.data.contacts || []);
      setScripts(s.data || []);
      setCalls(cl.data.calls || []);
    });
  }, []);

  // Poll for call updates every 5s when a call is in progress
  useEffect(() => {
    if (callResult?.callSid) {
      pollRef.current = setInterval(async () => {
        const res = await getCalls({ limit: 100 });
        setCalls(res.data.calls || []);
        const thisCall = res.data.calls?.find(c => c.twilioCallSid === callResult.callSid);
        if (thisCall && ['completed','escalated','failed','no-answer'].includes(thisCall.status)) {
          clearInterval(pollRef.current);
        }
      }, 5000);
    }
    return () => clearInterval(pollRef.current);
  }, [callResult]);

  const handleCall = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setCalling(true);
    try {
      const res = await initiateCall(form);
      setResult(res.data);
      const freshCalls = await getCalls({ limit: 100 });
      setCalls(freshCalls.data.calls || []);
    } catch (err) {
      setError(err.response?.data?.error || 'فشل بدء المكالمة');
    } finally {
      setCalling(false);
    }
  };

  const filteredCalls = calls.filter(c =>
    !filter ||
    c.contact?.name?.includes(filter) ||
    c.script?.drugName?.includes(filter) ||
    c.leadLabel === filter ||
    c.status === filter
  );

  return (
    <div style={{ padding: 24, direction: 'rtl', fontFamily: 'Cairo, Segoe UI, sans-serif', maxWidth: 1100, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 24, fontSize: 22 }}>مركز المكالمات</h2>

      {/* ── Initiate Call Form ── */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,.06)', marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>بدء مكالمة جديدة</h3>
        <form onSubmit={handleCall} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={labelStyle}>جهة الاتصال</label>
            <select
              value={form.contactId}
              onChange={e => setForm(f => ({ ...f, contactId: e.target.value }))}
              required style={selectStyle}
            >
              <option value="">اختر طبيب أو صيدلاني...</option>
              {contacts.map(c => (
                <option key={c._id} value={c._id}>
                  {c.name} ({c.type === 'physician' ? 'طبيب' : 'صيدلاني'}) — {c.phone}
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={labelStyle}>السكريبت / الدواء</label>
            <select
              value={form.scriptId}
              onChange={e => setForm(f => ({ ...f, scriptId: e.target.value }))}
              required style={selectStyle}
            >
              <option value="">اختر سكريبت...</option>
              {scripts.map(s => (
                <option key={s._id} value={s._id}>{s.name} — {s.drugName}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={calling}
            style={{
              background: calling ? '#ccc' : '#1a73e8',
              color: '#fff', border: 'none', borderRadius: 8,
              padding: '10px 28px', fontSize: 14, cursor: calling ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', fontWeight: 600,
            }}
          >
            {calling ? '⏳ جارٍ الاتصال...' : '📞 ابدأ المكالمة'}
          </button>
        </form>

        {error && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: '#fce4ec', borderRadius: 8, color: '#c62828', fontSize: 13 }}>
            ❌ {error}
          </div>
        )}

        {callResult && (
          <div style={{ marginTop: 12, padding: '12px 16px', background: '#e8f5e9', borderRadius: 8, fontSize: 13 }}>
            <strong>✅ تم بدء المكالمة!</strong>
            <div style={{ marginTop: 4, color: '#555' }}>
              Call SID: <code>{callResult.callSid}</code> — الحالة: {callResult.status}
            </div>
            <div style={{ marginTop: 4, color: '#888', fontSize: 12 }}>
              سيتم تحديث السجل تلقائياً كل 5 ثواني...
            </div>
          </div>
        )}
      </div>

      {/* ── Call Log Table ── */}
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>سجل المكالمات</h3>
          <input
            placeholder="بحث بالاسم أو الدواء..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, width: 200 }}
          />
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['الاسم','النوع','الدواء','الحالة','التصنيف','النتيجة','المدة','التاريخ'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredCalls.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 32, color: '#999' }}>
                    لا توجد مكالمات بعد. ابدأ مكالمة من الأعلى!
                  </td>
                </tr>
              ) : filteredCalls.map(c => (
                <CallRow key={c._id} call={c} onClick={setSelectedCall} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Call Detail Drawer ── */}
      {selectedCall && (
        <>
          <div
            onClick={() => setSelectedCall(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.25)', zIndex: 99 }}
          />
          <CallDetail call={selectedCall} onClose={() => setSelectedCall(null)} />
        </>
      )}
    </div>
  );
}

const labelStyle  = { display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 };
const selectStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, fontFamily: 'inherit' };
