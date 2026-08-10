import { useState, useEffect } from 'react';
import { getContacts, createContact, updateContact, deleteContact } from '../services/api';

const inputStyle  = { display:'block', width:'100%', padding:'9px 12px', marginBottom:10, borderRadius:8, border:'1px solid #ddd', fontSize:13, fontFamily:'Cairo,sans-serif', boxSizing:'border-box' };
const btnPrimary  = { background:'#1a73e8', color:'#fff', border:'none', borderRadius:8, padding:'9px 20px', fontSize:13, cursor:'pointer', fontFamily:'Cairo,sans-serif' };
const btnDanger   = { background:'#fce4ec', color:'#c62828', border:'none', borderRadius:6, padding:'5px 12px', fontSize:12, cursor:'pointer' };
const btnSecondary= { background:'#f1f3f4', color:'#333', border:'none', borderRadius:6, padding:'5px 12px', fontSize:12, cursor:'pointer' };
const th = { padding:'10px 12px', fontSize:12, fontWeight:600, color:'#666', borderBottom:'2px solid #eee', textAlign:'right' };
const td = { padding:'10px 12px', fontSize:13 };

const empty = { name:'', type:'physician', specialty:'', phone:'', clinic:'', city:'' };

export default function ContactsPage() {
  const [contacts, setContacts] = useState([]);
  const [total,    setTotal]    = useState(0);
  const [search,   setSearch]   = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState(null);
  const [form,     setForm]     = useState(empty);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  const load = async (q = '') => {
    const res = await getContacts({ search: q, limit: 100 });
    setContacts(res.data.contacts || []);
    setTotal(res.data.total || 0);
  };

  useEffect(() => { load(); }, []);

  const openNew  = () => { setEditing(null); setForm(empty); setShowForm(true); setError(''); };
  const openEdit = (c) => { setEditing(c._id); setForm({ name:c.name, type:c.type, specialty:c.specialty||'', phone:c.phone, clinic:c.clinic||'', city:c.city||'' }); setShowForm(true); setError(''); };
  const close    = () => { setShowForm(false); setEditing(null); };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      if (editing) await updateContact(editing, form);
      else         await createContact(form);
      await load(search);
      close();
    } catch (err) {
      setError(err.response?.data?.error || 'حدث خطأ');
    } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('هل تريد حذف جهة الاتصال؟')) return;
    await deleteContact(id);
    await load(search);
  };

  return (
    <div style={{ padding:24, direction:'rtl', fontFamily:'Cairo,sans-serif', maxWidth:1100, margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <h2 style={{ margin:0 }}>جهات الاتصال ({total})</h2>
        <button onClick={openNew} style={btnPrimary}>+ إضافة جهة اتصال</button>
      </div>

      <input
        placeholder="بحث بالاسم أو الهاتف..."
        value={search}
        onChange={e => { setSearch(e.target.value); load(e.target.value); }}
        style={{ ...inputStyle, width:280, marginBottom:16 }}
      />

      <div style={{ background:'#fff', borderRadius:12, boxShadow:'0 2px 8px rgba(0,0,0,.06)', overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr>{['الاسم','النوع','التخصص','الهاتف','العيادة','المدينة','إجراءات'].map(h=>(
              <th key={h} style={th}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {contacts.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign:'center', padding:32, color:'#999' }}>لا توجد جهات اتصال</td></tr>
            ) : contacts.map(c => (
              <tr key={c._id} style={{ borderBottom:'1px solid #f0f0f0' }}>
                <td style={td}>{c.name}</td>
                <td style={td}>{c.type === 'physician' ? '👨‍⚕️ طبيب' : '💊 صيدلاني'}</td>
                <td style={td}>{c.specialty || '—'}</td>
                <td style={td}>{c.phone}</td>
                <td style={td}>{c.clinic || '—'}</td>
                <td style={td}>{c.city || '—'}</td>
                <td style={td}>
                  <button onClick={() => openEdit(c)} style={{ ...btnSecondary, marginLeft:6 }}>تعديل</button>
                  <button onClick={() => remove(c._id)} style={btnDanger}>حذف</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.4)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <form onSubmit={save} style={{ background:'#fff', borderRadius:12, padding:28, width:420, boxShadow:'0 8px 32px rgba(0,0,0,.15)' }}>
            <h3 style={{ margin:'0 0 20px' }}>{editing ? 'تعديل جهة الاتصال' : 'إضافة جهة اتصال جديدة'}</h3>
            {error && <p style={{ color:'#c62828', fontSize:13, marginBottom:10 }}>{error}</p>}
            <input placeholder="الاسم *" required value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={inputStyle} />
            <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} style={inputStyle}>
              <option value="physician">طبيب</option>
              <option value="pharmacist">صيدلاني</option>
            </select>
            <input placeholder="التخصص" value={form.specialty} onChange={e=>setForm(f=>({...f,specialty:e.target.value}))} style={inputStyle} />
            <input placeholder="رقم الهاتف * (مثال: +201001234567)" required value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} style={inputStyle} />
            <input placeholder="العيادة / الصيدلية" value={form.clinic} onChange={e=>setForm(f=>({...f,clinic:e.target.value}))} style={inputStyle} />
            <input placeholder="المدينة" value={form.city} onChange={e=>setForm(f=>({...f,city:e.target.value}))} style={inputStyle} />
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 }}>
              <button type="button" onClick={close} style={btnSecondary}>إلغاء</button>
              <button type="submit" disabled={saving} style={btnPrimary}>{saving ? 'جارٍ الحفظ...' : 'حفظ'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
