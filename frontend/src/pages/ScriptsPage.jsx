import { useState, useEffect } from 'react';
import { getScripts, createScript, updateScript } from '../services/api';

const inputStyle   = { display:'block', width:'100%', padding:'9px 12px', marginBottom:10, borderRadius:8, border:'1px solid #ddd', fontSize:13, fontFamily:'Cairo,sans-serif', boxSizing:'border-box' };
const textareaStyle= { ...inputStyle, minHeight:80, resize:'vertical' };
const btnPrimary   = { background:'#1a73e8', color:'#fff', border:'none', borderRadius:8, padding:'9px 20px', fontSize:13, cursor:'pointer', fontFamily:'Cairo,sans-serif' };
const btnSecondary = { background:'#f1f3f4', color:'#333', border:'none', borderRadius:6, padding:'5px 12px', fontSize:12, cursor:'pointer' };

const emptyForm = {
  name:'', drugName:'', targetType:'both',
  greeting:'', closing:'', warmThreshold:40, hotThreshold:70,
  questions:[],
};

const emptyQ = { key:'', text:'', type:'open', scoringWeight:1 };

export default function ScriptsPage() {
  const [scripts,  setScripts]  = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState(null);
  const [form,     setForm]     = useState(emptyForm);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [expanded, setExpanded] = useState(null);

  const load = async () => {
    const res = await getScripts();
    setScripts(res.data || []);
  };

  useEffect(() => { load(); }, []);

  const openNew  = () => { setEditing(null); setForm(emptyForm); setShowForm(true); setError(''); };
  const openEdit = (s) => {
    setEditing(s._id);
    setForm({ name:s.name, drugName:s.drugName, targetType:s.targetType, greeting:s.greeting, closing:s.closing, warmThreshold:s.warmThreshold, hotThreshold:s.hotThreshold, questions:s.questions||[] });
    setShowForm(true); setError('');
  };
  const close = () => { setShowForm(false); setEditing(null); };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      if (editing) await updateScript(editing, form);
      else         await createScript(form);
      await load();
      close();
    } catch (err) {
      setError(err.response?.data?.error || 'حدث خطأ');
    } finally { setSaving(false); }
  };

  const addQuestion = () => setForm(f => ({ ...f, questions:[...f.questions, { ...emptyQ }] }));
  const removeQ = (i) => setForm(f => ({ ...f, questions:f.questions.filter((_,idx)=>idx!==i) }));
  const updateQ = (i, field, val) => setForm(f => ({
    ...f,
    questions: f.questions.map((q,idx) => idx===i ? { ...q, [field]:val } : q),
  }));

  return (
    <div style={{ padding:24, direction:'rtl', fontFamily:'Cairo,sans-serif', maxWidth:1000, margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <h2 style={{ margin:0 }}>السكريبتات ({scripts.length})</h2>
        <button onClick={openNew} style={btnPrimary}>+ سكريبت جديد</button>
      </div>

      {scripts.length === 0 && (
        <div style={{ textAlign:'center', padding:48, color:'#999', background:'#fff', borderRadius:12 }}>
          لا توجد سكريبتات. أضف سكريبتاً جديداً أو شغّل seed.
        </div>
      )}

      {scripts.map(s => (
        <div key={s._id} style={{ background:'#fff', borderRadius:12, padding:20, marginBottom:16, boxShadow:'0 2px 8px rgba(0,0,0,.06)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <h3 style={{ margin:'0 0 4px', fontSize:16 }}>{s.name}</h3>
              <p style={{ margin:'0 0 4px', fontSize:13, color:'#666' }}>💊 {s.drugName} · {s.targetType === 'both' ? 'أطباء وصيادلة' : s.targetType === 'physician' ? 'أطباء' : 'صيادلة'}</p>
              <p style={{ margin:0, fontSize:12, color:'#999' }}>{s.questions?.length || 0} سؤال · warm ≥{s.warmThreshold}% · hot ≥{s.hotThreshold}%</p>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setExpanded(expanded===s._id ? null : s._id)} style={btnSecondary}>
                {expanded===s._id ? 'إخفاء' : 'عرض الأسئلة'}
              </button>
              <button onClick={() => openEdit(s)} style={btnSecondary}>تعديل</button>
            </div>
          </div>

          {expanded === s._id && (
            <div style={{ marginTop:16, borderTop:'1px solid #eee', paddingTop:16 }}>
              <p style={{ fontSize:13, color:'#555', marginBottom:8 }}><strong>التحية:</strong> {s.greeting}</p>
              <p style={{ fontSize:13, color:'#555', marginBottom:12 }}><strong>الختام:</strong> {s.closing}</p>
              <h4 style={{ margin:'0 0 8px', fontSize:13 }}>الأسئلة:</h4>
              {(s.questions||[]).map((q,i) => (
                <div key={i} style={{ background:'#f8f9fa', borderRadius:8, padding:10, marginBottom:8 }}>
                  <span style={{ fontSize:11, color:'#888', display:'block', marginBottom:2 }}>[{q.key}] · {q.type} · وزن: {q.scoringWeight}</span>
                  <span style={{ fontSize:13 }}>{q.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Modal */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.4)', zIndex:200, display:'flex', alignItems:'flex-start', justifyContent:'center', overflowY:'auto', padding:'40px 0' }}>
          <form onSubmit={save} style={{ background:'#fff', borderRadius:12, padding:28, width:560, boxShadow:'0 8px 32px rgba(0,0,0,.15)', margin:'auto' }}>
            <h3 style={{ margin:'0 0 20px' }}>{editing ? 'تعديل السكريبت' : 'سكريبت جديد'}</h3>
            {error && <p style={{ color:'#c62828', fontSize:13, marginBottom:10 }}>{error}</p>}

            <input placeholder="اسم السكريبت *" required value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={inputStyle} />
            <input placeholder="اسم الدواء *" required value={form.drugName} onChange={e=>setForm(f=>({...f,drugName:e.target.value}))} style={inputStyle} />
            <select value={form.targetType} onChange={e=>setForm(f=>({...f,targetType:e.target.value}))} style={inputStyle}>
              <option value="both">أطباء وصيادلة</option>
              <option value="physician">أطباء فقط</option>
              <option value="pharmacist">صيادلة فقط</option>
            </select>
            <textarea placeholder="نص التحية (بالعربي) *" required value={form.greeting} onChange={e=>setForm(f=>({...f,greeting:e.target.value}))} style={textareaStyle} />
            <textarea placeholder="نص الختام (بالعربي) *" required value={form.closing} onChange={e=>setForm(f=>({...f,closing:e.target.value}))} style={textareaStyle} />

            <div style={{ display:'flex', gap:12, marginBottom:10 }}>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:12, color:'#555' }}>حد الدافئ (%)</label>
                <input type="number" min={0} max={100} value={form.warmThreshold} onChange={e=>setForm(f=>({...f,warmThreshold:Number(e.target.value)}))} style={inputStyle} />
              </div>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:12, color:'#555' }}>حد الساخن (%)</label>
                <input type="number" min={0} max={100} value={form.hotThreshold} onChange={e=>setForm(f=>({...f,hotThreshold:Number(e.target.value)}))} style={inputStyle} />
              </div>
            </div>

            <div style={{ borderTop:'1px solid #eee', paddingTop:16, marginBottom:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <strong style={{ fontSize:14 }}>الأسئلة ({form.questions.length})</strong>
                <button type="button" onClick={addQuestion} style={btnSecondary}>+ سؤال</button>
              </div>
              {form.questions.map((q,i) => (
                <div key={i} style={{ background:'#f8f9fa', borderRadius:8, padding:12, marginBottom:10 }}>
                  <div style={{ display:'flex', gap:8, marginBottom:6 }}>
                    <input placeholder="key (مثال: awareness)" value={q.key} onChange={e=>updateQ(i,'key',e.target.value)} style={{ ...inputStyle, marginBottom:0, flex:1 }} />
                    <select value={q.type} onChange={e=>updateQ(i,'type',e.target.value)} style={{ ...inputStyle, marginBottom:0, width:110 }}>
                      <option value="open">مفتوح</option>
                      <option value="yesno">نعم/لا</option>
                      <option value="scale">مقياس</option>
                      <option value="multiple">متعدد</option>
                    </select>
                    <input type="number" min={1} max={5} value={q.scoringWeight} onChange={e=>updateQ(i,'scoringWeight',Number(e.target.value))} style={{ ...inputStyle, marginBottom:0, width:60 }} title="الوزن" />
                    <button type="button" onClick={()=>removeQ(i)} style={{ ...btnSecondary, color:'#c62828', flexShrink:0 }}>✕</button>
                  </div>
                  <textarea placeholder="نص السؤال بالعربي *" value={q.text} onChange={e=>updateQ(i,'text',e.target.value)} style={{ ...textareaStyle, marginBottom:0, minHeight:50 }} />
                </div>
              ))}
            </div>

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button type="button" onClick={close} style={btnSecondary}>إلغاء</button>
              <button type="submit" disabled={saving} style={btnPrimary}>{saving ? 'جارٍ الحفظ...' : 'حفظ'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
