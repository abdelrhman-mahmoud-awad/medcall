import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import {
  HashRouter, Routes, Route, Navigate, NavLink, Link, useNavigate, useLocation,
} from 'react-router-dom';

// Code-split every page so the initial bundle stays small; the recharts-heavy
// Reports/Dashboard pages benefit the most.
const CallingPage         = lazy(() => import('./pages/CallingPage'));
const AgentConsolePage    = lazy(() => import('./pages/AgentConsolePage'));
const DataHubPage         = lazy(() => import('./pages/DataHubPage'));
const ReportsPage         = lazy(() => import('./pages/ReportsPage'));
const IntegrationsPage    = lazy(() => import('./pages/IntegrationsPage'));
const ProjectsPage        = lazy(() => import('./pages/ProjectsPage'));
const ProjectSettingsPage = lazy(() => import('./pages/ProjectSettingsPage'));
const AccountPage         = lazy(() => import('./pages/AccountPage'));
const DashboardPage       = lazy(() => import('./pages/DashboardPage'));
const OnboardingPage      = lazy(() => import('./pages/OnboardingPage'));
const CalendarPage        = lazy(() => import('./pages/CalendarPage'));

import PageLoader from './components/PageLoader';
import { getActiveProjectId, setActiveProject } from './services/projectStore';
import { getRole, isManager } from './hooks/useRole';

// ── Auth helpers ───────────────────────────────────────────────────────────────
const isLoggedIn = () => !!localStorage.getItem('medcall_token');
const devAuthBypass = import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS_AUTH === 'true';

function PrivateRoute({ children }) {
  return isLoggedIn() || devAuthBypass ? children : <Navigate to="/login" replace />;
}

// Manager-only routes: members are redirected to their console.
function ManagerRoute({ children }) {
  return isManager() ? children : <Navigate to="/agents" replace />;
}

// ── Icons (feather-style, stroke = currentColor) ──────────────────────────────
function Icon({ name, size = 16 }) {
  const paths = {
    phone:  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />,
    send:   <><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></>,
    calendar: <><rect x="3" y="4" width="18" height="17" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="8" y1="14" x2="8.01" y2="14" /><line x1="12" y1="14" x2="12.01" y2="14" /><line x1="16" y1="14" x2="16.01" y2="14" /></>,
    headset:<><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" /></>,
    briefcase: <><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>,
    trending:  <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></>,
    chart:  <><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>,
    check:  <><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
    users:  <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    list:   <><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>,
    file:   <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></>,
    grid:   <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></>,
    link:   <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>,
    user:   <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
    home:   <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>,
  };
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

// ── Auth pages ─────────────────────────────────────────────────────────────────
function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo"><Icon name="phone" size={20} /></div>
        <h1>{title}</h1>
        <p className="auth-sub">{subtitle}</p>
        {children}
        <p className="auth-foot">{footer}</p>
      </div>
    </div>
  );
}

function LoginPage() {
  const [form, setForm]   = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    try {
      const { login, getProjects } = await import('./services/api');
      const res = await login(form);
      const role = res.data.user?.role || 'manager';
      localStorage.setItem('medcall_token', res.data.token);
      localStorage.setItem('medcall_role', role);
      localStorage.setItem('medcall_user', JSON.stringify({
        name: res.data.user?.name || '', email: res.data.user?.email || form.email,
      }));

      // Role-based landing: members go straight to their console.
      if (role === 'member') { nav('/agents'); return; }

      // Managers with no projects yet are routed into first-time setup.
      try {
        const projects = await getProjects();
        if (!(projects.data || []).length) { nav('/onboarding'); return; }
      } catch { /* if the check fails, fall through to the dashboard */ }
      nav('/dashboard');
    } catch {
      setError('Invalid email or password.');
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your MedCall CRM workspace"
      footer={<>Don't have an account? <Link to="/register">Create one</Link></>}
    >
      <form onSubmit={submit}>
        {error && <div className="alert alert-err">{error}</div>}
        <div className="field">
          <label className="label">Email</label>
          <input className="input" placeholder="you@company.com" type="email" required
                 value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        </div>
        <div className="field">
          <label className="label">Password</label>
          <input className="input" placeholder="••••••••" type="password" required
                 value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
        </div>
        <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 6 }}>
          Sign in
        </button>
      </form>
    </AuthShell>
  );
}

function RegisterPage() {
  const [form, setForm]   = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    try {
      const { register } = await import('./services/api');
      const res = await register(form);
      localStorage.setItem('medcall_token', res.data.token);
      localStorage.setItem('medcall_role', res.data.user?.role || 'manager');
      localStorage.setItem('medcall_user', JSON.stringify({
        name: res.data.user?.name || form.name, email: res.data.user?.email || form.email,
      }));
      nav('/onboarding');   // first-time setup: project → members → script → doctors data
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed.');
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="New accounts are workspace managers"
      footer={<>Already have an account? <Link to="/login">Sign in</Link></>}
    >
      <form onSubmit={submit}>
        {error && <div className="alert alert-err">{error}</div>}
        <div className="field">
          <label className="label">Full name</label>
          <input className="input" placeholder="Jane Doe" required
                 value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="field">
          <label className="label">Email</label>
          <input className="input" placeholder="you@company.com" type="email" required
                 value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        </div>
        <div className="field">
          <label className="label">Password</label>
          <input className="input" placeholder="At least 6 characters" type="password" required minLength={6}
                 value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
        </div>
        <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 6 }}>
          Create account
        </button>
      </form>
    </AuthShell>
  );
}

// ── Navigation model ───────────────────────────────────────────────────────────
const NAV = [
  {
    section: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: 'home', managerOnly: true },
    ],
  },
  {
    section: 'Operations',
    items: [
      { to: '/calling', label: 'Calling',       icon: 'phone' },
      { to: '/agents',  label: 'Agent Console', icon: 'headset' },
      { to: '/calendar', label: 'Calendar',      icon: 'calendar' },
    ],
  },
  {
    section: 'Research',
    items: [
      { to: '/projects', label: 'Projects', icon: 'briefcase', managerOnly: true },
      { to: '/reports',  label: 'Reports',  icon: 'chart' },
    ],
  },
  {
    section: 'Data',
    items: [
      { to: '/data', label: 'Data', icon: 'grid' },
    ],
  },
  {
    section: 'Settings',
    items: [
      { to: '/integrations', label: 'Integrations', icon: 'link', managerOnly: true },
    ],
  },
];

function pageTitle(pathname) {
  for (const group of NAV) {
    for (const item of group.items) {
      if (pathname.startsWith(item.to)) return item.label;
    }
  }
  if (pathname.includes('/settings')) return 'Project Settings';
  if (pathname.startsWith('/account')) return 'Account & Team';
  return 'MedCall';
}

// ── Shell ──────────────────────────────────────────────────────────────────────
function Shell({ children }) {
  const role = getRole();
  const manager = isManager();
  const location = useLocation();

  const readUser = () => {
    try { return JSON.parse(localStorage.getItem('medcall_user')) || {}; } catch { return {}; }
  };
  const [user, setUser]         = useState(readUser);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Project switcher — role-scoped list from GET /api/projects
  const [projects, setProjects]         = useState([]);
  const [activeProject, setActiveState] = useState(getActiveProjectId);

  useEffect(() => {
    let alive = true;
    // api.js is imported dynamically to keep axios out of the entry chunk
    import('./services/api')
      .then(({ getProjects }) => getProjects())
      .then(r => {
        if (!alive) return;
        const list = r.data || [];
        setProjects(list);
        // Drop a stale selection (deleted/archived project, other account)
        const current = getActiveProjectId();
        if (current && !list.some(p => p._id === current)) {
          setActiveProject(null);
          setActiveState(null);
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const switchProject = (id) => {
    const project = projects.find(p => p._id === id) || null;
    setActiveProject(project);          // persists + fires medcall:project-changed
    setActiveState(project?._id || null);
  };

  useEffect(() => {
    const sync  = () => setUser(readUser());
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    window.addEventListener('medcall:user-updated', sync);
    document.addEventListener('mousedown', close);
    return () => {
      window.removeEventListener('medcall:user-updated', sync);
      document.removeEventListener('mousedown', close);
    };
  }, []);

  const initials = (user.name || 'U')
    .split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const logout = () => {
    localStorage.removeItem('medcall_token');
    localStorage.removeItem('medcall_role');
    localStorage.removeItem('medcall_user');
    localStorage.removeItem('medcall_project');
    window.location.href = '/#/login';
  };

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="sidebar-brand">
          <span className="logo-mark"><Icon name="phone" size={15} /></span>
          <span>MedCall<small>Research CRM</small></span>
        </div>

        {NAV.map(group => {
          const items = group.items.filter(i => manager || !i.managerOnly);
          if (!items.length) return null;
          return (
            <div key={group.section}>
              <div className="nav-section">{group.section}</div>
              {items.map(item => (
                <NavLink key={item.to} to={item.to} className="nav-link">
                  <Icon name={item.icon} />
                  {item.label}
                </NavLink>
              ))}
            </div>
          );
        })}

        <div className="sidebar-foot">
          <span className="role-chip">{role}</span>
          <button onClick={logout} title="Sign out">
            <Icon name="logout" size={14} /> Sign out
          </button>
        </div>
      </nav>

      <main className="main">
        <div className="topbar">
          <span className="crumb">{pageTitle(location.pathname)}</span>

          <div style={{ marginLeft: 'auto', marginRight: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="briefcase" size={14} />
            <select
              className="select"
              value={activeProject || ''}
              onChange={e => switchProject(e.target.value)}
              title="Active project"
              style={{ fontSize: 13, padding: '4px 8px', maxWidth: 220 }}
            >
              <option value="">All projects</option>
              {projects.map(p => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="topbar-user" ref={menuRef}>
            <button className="avatar" onClick={() => setMenuOpen(o => !o)} title={user.name || 'Account'}>
              {initials}
            </button>

            {menuOpen && (
              <div className="user-menu">
                <div className="user-menu-head">
                  <b>{user.name || 'My account'}</b>
                  <span>{user.email || ''}</span>
                  <span className={`badge ${role === 'member' ? 'badge-blue' : 'badge-green'}`} style={{ marginTop: 6 }}>
                    {role}
                  </span>
                </div>
                <NavLink to="/account" onClick={() => setMenuOpen(false)}>
                  <Icon name="user" size={14} /> Account{manager ? ' & Team' : ''}
                </NavLink>
                <button onClick={logout} className="danger">
                  <Icon name="logout" size={14} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

// ── Router ─────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <HashRouter>
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login"    element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/onboarding" element={
          <PrivateRoute><OnboardingPage /></PrivateRoute>
        } />
        <Route path="/*" element={
          <PrivateRoute>
            <Shell>
              <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/dashboard"   element={<ManagerRoute><DashboardPage /></ManagerRoute>} />
                <Route path="/calling"      element={<Navigate to="/calling/quick" replace />} />
                <Route path="/calling/:tab" element={<CallingPage />} />
                <Route path="/agents"     element={<AgentConsolePage />} />
                <Route path="/calendar"   element={<CalendarPage />} />
                <Route path="/data"       element={<Navigate to="/data/contacts" replace />} />
                <Route path="/data/:tab"  element={<DataHubPage />} />
                <Route path="/reports"      element={<Navigate to="/reports/analytics" replace />} />
                <Route path="/reports/:tab" element={<ReportsPage />} />
                {/* Legacy paths → new tabbed pages */}
                <Route path="/call-center" element={<Navigate to="/calling/quick" replace />} />
                <Route path="/campaigns"   element={<Navigate to="/calling/campaigns" replace />} />
                <Route path="/contacts"   element={<Navigate to="/data/contacts" replace />} />
                <Route path="/calls"      element={<Navigate to="/data/calls" replace />} />
                <Route path="/data-entry" element={<Navigate to="/data/review" replace />} />
                <Route path="/scripts"    element={<Navigate to="/data/scripts" replace />} />
                <Route path="/excel"      element={<Navigate to="/data/import" replace />} />
                <Route path="/analytics"  element={<Navigate to="/reports/analytics" replace />} />
                <Route path="/insights"   element={<Navigate to="/reports/insights" replace />} />
                <Route path="/integrations" element={<ManagerRoute><IntegrationsPage /></ManagerRoute>} />
                <Route path="/projects"   element={<ManagerRoute><ProjectsPage /></ManagerRoute>} />
                <Route path="/projects/:id/settings" element={<ManagerRoute><ProjectSettingsPage /></ManagerRoute>} />
                <Route path="/account"    element={<AccountPage />} />
                <Route path="/" element={<Navigate to={isManager() ? '/dashboard' : '/agents'} replace />} />
              </Routes>
              </Suspense>
            </Shell>
          </PrivateRoute>
        } />
      </Routes>
      </Suspense>
    </HashRouter>
  );
}
