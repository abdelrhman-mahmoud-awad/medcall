import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import CallCenterPage from './pages/CallCenterPage';
import ContactsPage   from './pages/ContactsPage';
import CallsPage      from './pages/CallsPage';
import ScriptsPage    from './pages/ScriptsPage';

// ── Tiny auth helper ───────────────────────────────────────────────────────────
const isLoggedIn = () => !!localStorage.getItem('medcall_token');

function PrivateRoute({ children }) {
  return isLoggedIn() ? children : <Navigate to="/login" replace />;
}

// ── Placeholder pages (replace with your existing pages) ──────────────────────
function LoginPage() {
  const [form, setForm]   = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    try {
      const { login } = await import('./services/api');
      const res = await login(form);
      localStorage.setItem('medcall_token', res.data.token);
      nav('/call-center');
    } catch {
      setError('بيانات الدخول غير صحيحة');
    }
  };

  return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'100vh' }}>
      <form onSubmit={submit} style={{ background:'#fff', padding:32, borderRadius:12, width:340, boxShadow:'0 4px 20px rgba(0,0,0,.08)' }}>
        <h2 style={{ textAlign:'center', marginBottom:24 }}>MedCall CRM</h2>
        {error && <p style={{ color:'red', fontSize:13 }}>{error}</p>}
        <input
          placeholder="البريد الإلكتروني"
          type="email" required value={form.email}
          onChange={e=>setForm(f=>({...f,email:e.target.value}))}
          style={inputStyle}
        />
        <input
          placeholder="كلمة المرور"
          type="password" required value={form.password}
          onChange={e=>setForm(f=>({...f,password:e.target.value}))}
          style={inputStyle}
        />
        <button type="submit" style={btnStyle}>دخول</button>
        <p style={{ textAlign:'center', fontSize:13, marginTop:12 }}>
          <a href="/register" style={{ color:'#1a73e8' }}>تسجيل حساب جديد</a>
        </p>
      </form>
    </div>
  );
}

function RegisterPage() {
  const [form, setForm]   = useState({ name:'', email:'', password:'' });
  const [error, setError] = useState('');
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    try {
      const { register } = await import('./services/api');
      const res = await register(form);
      localStorage.setItem('medcall_token', res.data.token);
      nav('/call-center');
    } catch (err) {
      setError(err.response?.data?.error || 'فشل التسجيل');
    }
  };

  return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'100vh' }}>
      <form onSubmit={submit} style={{ background:'#fff', padding:32, borderRadius:12, width:340, boxShadow:'0 4px 20px rgba(0,0,0,.08)' }}>
        <h2 style={{ textAlign:'center', marginBottom:24 }}>إنشاء حساب</h2>
        {error && <p style={{ color:'red', fontSize:13 }}>{error}</p>}
        <input placeholder="الاسم" required value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={inputStyle} />
        <input placeholder="البريد الإلكتروني" type="email" required value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} style={inputStyle} />
        <input placeholder="كلمة المرور" type="password" required value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} style={inputStyle} />
        <button type="submit" style={btnStyle}>إنشاء الحساب</button>
        <p style={{ textAlign:'center', fontSize:13, marginTop:12 }}>
          <a href="/login" style={{ color:'#1a73e8' }}>لديك حساب؟ سجل الدخول</a>
        </p>
      </form>
    </div>
  );
}

// ── Shell with sidebar nav ─────────────────────────────────────────────────────
function Shell({ children }) {
  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>
      <nav style={{
        width:220, background:'#1e1e2d', color:'#fff',
        display:'flex', flexDirection:'column', padding:'24px 0',
        position:'fixed', top:0, right:0, bottom:0,
      }}>
        <div style={{ padding:'0 20px 24px', borderBottom:'1px solid rgba(255,255,255,.1)', fontSize:18, fontWeight:700 }}>
          📞 MedCall
        </div>
        {[
          { to:'/call-center', label:'مركز المكالمات' },
          { to:'/contacts',    label:'جهات الاتصال' },
          { to:'/calls',       label:'سجل المكالمات' },
          { to:'/scripts',     label:'السكريبتات' },
        ].map(item => (
          <NavLink
            key={item.to} to={item.to}
            style={({ isActive }) => ({
              padding:'12px 20px', color: isActive ? '#fff' : 'rgba(255,255,255,.6)',
              background: isActive ? 'rgba(255,255,255,.1)' : 'none',
              textDecoration:'none', fontSize:14, display:'block',
            })}
          >
            {item.label}
          </NavLink>
        ))}
        <div style={{ marginTop:'auto', padding:'16px 20px' }}>
          <button
            onClick={() => { localStorage.removeItem('medcall_token'); window.location.href='/login'; }}
            style={{ background:'none', border:'none', color:'rgba(255,255,255,.5)', cursor:'pointer', fontSize:13 }}
          >
            تسجيل الخروج
          </button>
        </div>
      </nav>
      <main style={{ marginRight:220, flex:1, minHeight:'100vh' }}>
        {children}
      </main>
    </div>
  );
}

// ── useState/useNavigate must be imported at top in real code ─────────────────
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const inputStyle = {
  display:'block', width:'100%', padding:'10px 12px',
  marginBottom:12, borderRadius:8, border:'1px solid #ddd',
  fontSize:14, fontFamily:'Cairo,sans-serif',
};
const btnStyle = {
  display:'block', width:'100%', padding:'11px',
  background:'#1a73e8', color:'#fff', border:'none',
  borderRadius:8, fontSize:14, cursor:'pointer', fontFamily:'Cairo,sans-serif',
};

// ── Router ────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"    element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/*" element={
          <PrivateRoute>
            <Shell>
              <Routes>
                <Route path="/call-center" element={<CallCenterPage />} />
                <Route path="/contacts"   element={<ContactsPage />} />
                <Route path="/calls"      element={<CallsPage />} />
                <Route path="/scripts"    element={<ScriptsPage />} />
                <Route path="/" element={<Navigate to="/call-center" replace />} />
              </Routes>
            </Shell>
          </PrivateRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}
