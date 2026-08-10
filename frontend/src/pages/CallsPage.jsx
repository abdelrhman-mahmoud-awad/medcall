import { useState, useEffect } from 'react';
import { getCalls, getCallStats } from '../services/api';

const th = { padding:'10px 12px', fontSize:12, fontWeight:600, color:'#666', borderBottom:'2px solid #eee', textAlign:'right' };
const td = { padding:'10px 12px', fontSize:13 };

const statusColors = {
  initiated:    { bg:'#e8f4ff', color:'#1a73e8', label:'جارٍ الاتصال' },
  'in-progress':{ bg:'#fff8e1', color:'#f57c00', label:'قيد التشغيل' },
  completed:    { bg:'#e8f5e9', color:'#2e7d32', label:'مكتمل' },
  escalated:    { bg:'#fce4ec', color:'#c62828', label:'محوّل' },
  failed:       { bg:'#f5f5f5', color:'#616161', label:'فشل' },
  'no-answer':  { bg:'#f5f5f5', color:'#616161', label:'لا رد' },
};
const labelColors = {
  hot:  { bg:'#fce4ec', color:'#c62828' },
  warm: { bg:'#fff3e0', color:'#e65100' },
  cold: { bg:'#e3f2fd', color:'#1565c0' },
};

function Badge({ text, style }) {
  return <span style={{ display:'inline-block', padding:'2px 10px', borderRadius:12, fontSize:12, fontWeight:600, ...style }}>{text}</span>;
}

function CallDetail({ call, onClose }) {
  if (!call) return null;
  return (
    <div style={{ position:'fixed', top:0, right:0, bottom:0, width:480, background:'#fff', boxShadow:'-4px 0 20px rgba(0,0,0,.12)', zIndex:100, display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'20px 24px', borderBottom:'1px solid #eee', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <h3 style={{ margin:0, fontSize:16 }}>تفاصيل المكالمة</h3>
        <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer' }}>✕</button>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:24, direction:'rtl' }}>
        <p><strong>جهة الاتصال:</strong> {call.contact?.name}</p>
        <p><strong>الهاتف:</strong> {call.contact?.phone}</p>
        <p><strong>الدواء:</strong> {call.script?.drugName}</p>
        <p><strong>النتيجة:</strong> {call.leadLabel} — {call.leadScore != null ? `${call.leadScore}%` : '—'}</p>
        <p><strong>المدة:</strong> {call.durationSec ? `${call.durationSec} ثانية` : '—'}</p>
        <p><strong>التاريخ:</strong> {new Date(call.createdAt).toLocaleString('ar-EG')}</p>

        {call.responses?.length > 0 && (
          <>
            <h4 style={{ marginTop:20, marginBottom:8 }}>إجابات السكريبت</h4>
            {call.responses.map((r, i) => (
              <div key={i} style={{ background:'#f8f9fa', borderRadius:8, padding:12, marginBottom:8 }}>
                <p style={{ margin:'0 0 4px', fontSize:12, color:'#888' }}>{r.questionText}</p>
                <p style={{ margin:'0 0 4px', fontWeight:500 }}>{r.answer || '—'}</p>
                <Badge text={r.sentiment || 'unclear'} style={{
                  background: r.sentiment==='positive'?'#e8f5e9':r.sentiment==='negative'?'#fce4ec':'#f5f5f5',
                  color:      r.sentiment==='positive'?'#2e7d32':r.sentiment==='negative'?'#c62828':'#616161',
                }} />
              </div>
            ))}
          </>
        )}

        {call.transcript && (
          <>
            <h4 style={{ marginTop:20, marginBottom:8 }}>نص المكالمة</h4>
            <div style={{ background:'#f8f9fa', borderRadius:8, padding:12, fontSize:13, whiteSpace:'pre-wrap', lineHeight:1.8 }}>
              {call.transcript}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function CallsPage() {
  const [calls,  setCalls]  = useState([]);
  const [stats,  setStats]  = useState(null);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    Promise.all([getCalls({ limit:200 }), getCallStats()]).then(([c, s]) => {
      setCalls(c.data.calls || []);
      setStats(s.data);
    });
  }, []);

  const filtered = calls.filter(c =>
    !filter ||
    c.contact?.name?.includes(filter) ||
    c.script?.drugName?.includes(filter) ||
    c.leadLabel === filter ||
    c.status === filter
  );

  const statCard = (label, value, color) => (
    <div style={{ background:'#fff', borderRadius:12, padding:'16px 20px', boxShadow:'0 2px 8px rgba(0,0,0,.06)', flex:1, minWidth:120 }}>
      <div style={{ fontSize:28, fontWeight:700, color }}>{value ?? '—'}</div>
      <div style={{ fontSize:13, color:'#666', marginTop:4 }}>{label}</div>
    </div>
  );

  return (
    <div style={{ padding:24, direction:'rtl', fontFamily:'Cairo,sans-serif', maxWidth:1100, margin:'0 auto' }}>
      <h2 style={{ marginBottom:20 }}>سجل المكالمات</h2>

      {stats && (
        <div style={{ display:'flex', gap:12, marginBottom:24, flexWrap:'wrap' }}>
          {statCard('إجمالي المكالمات', stats.total,     '#1a73e8')}
          {statCard('🔥 ساخن',           stats.hot,       '#c62828')}
          {statCard('🟡 دافئ',           stats.warm,      '#e65100')}
          {statCard('🔵 بارد',           stats.cold,      '#1565c0')}
          {statCard('محوّل لإنساني',     stats.escalated, '#7b1fa2')}
        </div>
      )}

      <div style={{ background:'#fff', borderRadius:12, boxShadow:'0 2px 8px rgba(0,0,0,.06)' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #eee', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h3 style={{ margin:0, fontSize:16 }}>المكالمات ({filtered.length})</h3>
          <input
            placeholder="بحث..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{ padding:'7px 12px', borderRadius:8, border:'1px solid #ddd', fontSize:13, width:200 }}
          />
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>{['الاسم','النوع','الدواء','الحالة','التصنيف','النتيجة','المدة','التاريخ'].map(h=>(
                <th key={h} style={th}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign:'center', padding:32, color:'#999' }}>لا توجد مكالمات</td></tr>
              ) : filtered.map(c => {
                const st = statusColors[c.status] || statusColors.failed;
                const lb = labelColors[c.leadLabel] || labelColors.cold;
                const dur = c.durationSec ? `${Math.floor(c.durationSec/60)}:${String(c.durationSec%60).padStart(2,'0')}` : '—';
                return (
                  <tr key={c._id} onClick={() => setSelected(c)} style={{ cursor:'pointer', borderBottom:'1px solid #f0f0f0' }}>
                    <td style={td}>{c.contact?.name || '—'}</td>
                    <td style={td}>{c.contact?.type === 'physician' ? 'طبيب' : 'صيدلاني'}</td>
                    <td style={td}>{c.script?.drugName || '—'}</td>
                    <td style={td}><Badge text={st.label} style={{ background:st.bg, color:st.color }} /></td>
                    <td style={td}><Badge text={c.leadLabel || 'cold'} style={{ background:lb.bg, color:lb.color }} /></td>
                    <td style={td}>{c.leadScore != null ? `${c.leadScore}%` : '—'}</td>
                    <td style={td}>{dur}</td>
                    <td style={td}>{new Date(c.createdAt).toLocaleString('ar-EG')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <>
          <div onClick={() => setSelected(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.25)', zIndex:99 }} />
          <CallDetail call={selected} onClose={() => setSelected(null)} />
        </>
      )}
    </div>
  );
}
