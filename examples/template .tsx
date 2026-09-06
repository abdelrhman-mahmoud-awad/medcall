import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, BarChart3, ShoppingCart, Users, FolderKanban, 
  Wallet, UserCheck, Megaphone, GraduationCap, Truck, Cloud, 
  PieChart, Search, Bell, Sun, Plus, ArrowUpRight, 
  ChevronRight, Menu, X, Inbox, Star, Send, File, Trash2, Mail, MessageSquare, Folder, Kanban, CalendarDays, Wand2, FormInput,
  Tag, AlertCircle, RefreshCw, Package, Users2, Receipt, ArrowLeft, Shield, MoreHorizontal, Bot, Sparkles, User, CornerDownLeft, Camera, Lock, Save,
  LogOut, Settings, HelpCircle, Check, DollarSign, Eye, ArrowDownRight, Target, FileText, CheckCircle2, Clock, Upload, Download, SlidersHorizontal, TrendingUp, Calendar, MousePointer, MoreVertical, PlusCircle, CheckCircle
} from 'lucide-react';

export default function App() {
  const [activeNav, setActiveNav] = useState('Wizard');
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Dropdown menus state
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);
  const notificationMenuRef = useRef(null);

  // Wizard state
  const [wizardStep, setWizardStep] = useState(1);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    company: '',
    role: 'Developer',
    plan: 'Pro',
    newsletter: true
  });
  const [wizardSubmitted, setWizardSubmitted] = useState(false);

  useEffect(() => {
    function handleClickOutside(event) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setProfileMenuOpen(false);
      }
      if (notificationMenuRef.current && !notificationMenuRef.current.contains(event.target)) {
        setNotificationMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleWizardNext = () => {
    if (wizardStep < 3) setWizardStep(wizardStep + 1);
    else setWizardSubmitted(true);
  };

  const handleWizardPrev = () => {
    if (wizardStep > 1) setWizardStep(wizardStep - 1);
  };

  return (
    <div className="flex h-screen bg-[#111111] text-zinc-100 font-sans overflow-hidden select-none">
      
      {/* ================= GLOBAL MAIN SIDEBAR ================= */}
      <aside className={`fixed inset-y-0 left-0 z-30 w-64 bg-[#1a1a1a] border-r border-zinc-800 flex flex-col justify-between transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div>
          {/* Logo Brand */}
          <div className="flex items-center justify-between px-6 h-16 border-b border-zinc-800">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-500 p-1.5 rounded-lg text-black font-bold flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <LayoutDashboard size={20} />
              </div>
              <div>
                <h1 className="font-bold text-sm leading-none tracking-wide text-white">Apex</h1>
                <span className="text-[10px] text-zinc-400 tracking-wider font-semibold">DASHBOARD</span>
              </div>
            </div>
            <button className="lg:hidden text-zinc-400 hover:text-white" onClick={() => setSidebarOpen(false)}>
              <X size={20} />
            </button>
          </div>

          {/* Navigation Links */}
          <div className="px-3 py-4 space-y-6 overflow-y-auto max-h-[calc(100vh-8rem)] scrollbar-thin scrollbar-thumb-zinc-800">
            <div>
              <p className="px-3 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase mb-2">Overview</p>
              <nav className="space-y-0.5">
                <NavItem icon={<LayoutDashboard size={17} />} label="Dashboard" active={activeNav === 'Dashboard'} onClick={() => setActiveNav('Dashboard')} />
                <NavItem icon={<BarChart3 size={17} />} label="Analytics" active={activeNav === 'Analytics'} onClick={() => setActiveNav('Analytics')} />
                <NavItem icon={<ShoppingCart size={17} />} label="eCommerce" active={activeNav === 'eCommerce'} onClick={() => setActiveNav('eCommerce')} />
                <NavItem icon={<Users size={17} />} label="CRM" active={activeNav === 'CRM'} onClick={() => setActiveNav('CRM')} />
                <NavItem icon={<FolderKanban size={17} />} label="Project" active={activeNav === 'Project'} onClick={() => setActiveNav('Project')} />
                <NavItem icon={<Wallet size={17} />} label="Finance" active={activeNav === 'Finance'} onClick={() => setActiveNav('Finance')} />
              </nav>
            </div>
            
            <div>
              <p className="px-3 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase mb-2">Commerce & Forms</p>
              <nav className="space-y-0.5">
                <NavItem icon={<ShoppingCart size={17} />} label="Orders" active={activeNav === 'Orders'} badge="12" onClick={() => setActiveNav('Orders')} />
                <NavItem icon={<Package size={17} />} label="Products" active={activeNav === 'Products'} onClick={() => setActiveNav('Products')} />
                <NavItem icon={<FormInput size={17} />} label="Wizard Form" active={activeNav === 'Wizard'} onClick={() => setActiveNav('Wizard')} />
              </nav>
            </div>
          </div>
        </div>

        {/* User Profile Footer */}
        <div className="p-3 border-t border-zinc-800 bg-[#1a1a1a]">
          <div 
            onClick={() => setActiveNav('Profile')}
            className="flex items-center justify-between p-2 rounded-lg bg-[#242424] border border-zinc-700 hover:border-emerald-500/50 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-inner">
                AS
              </div>
              <div>
                <h4 className="text-xs font-medium leading-none text-white">Aigars S.</h4>
                <span className="text-[10px] text-zinc-400">Admin</span>
              </div>
            </div>
            <button className="text-zinc-400 hover:text-white transition-colors p-1">
              <ArrowUpRight size={15} className="rotate-45" />
            </button>
          </div>
        </div>
      </aside>

      {/* Backdrop for mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ================= MAIN CONTENT AREA ================= */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-[#111111]">
        
        {/* Top Navbar */}
        <header className="h-16 border-b border-zinc-800 px-4 lg:px-8 flex items-center justify-between bg-[#111111] sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button className="lg:hidden text-zinc-400 hover:text-white p-1" onClick={() => setSidebarOpen(true)}>
              <Menu size={22} />
            </button>
            <div className="flex items-center w-64 lg:w-96 bg-[#1a1a1a] border border-zinc-800 rounded-lg px-3 py-1.5 text-zinc-400 focus-within:border-emerald-500/50 transition-colors">
              <Search size={15} className="mr-2 text-zinc-400" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search wizards, forms..." 
                className="bg-transparent border-none outline-none text-sm text-zinc-200 w-full placeholder-zinc-400"
              />
              <span className="text-[10px] bg-[#242424] px-1.5 py-0.5 rounded text-zinc-300 border border-zinc-700 hidden sm:inline-block">⌘K</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-[#1a1a1a] transition-colors">
              <Sun size={17} />
            </button>
            
            {/* Notification Bell Dropdown */}
            <div className="relative" ref={notificationMenuRef}>
              <button 
                onClick={() => { setNotificationMenuOpen(!notificationMenuOpen); setProfileMenuOpen(false); }}
                className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-[#1a1a1a] transition-colors relative"
              >
                <Bell size={17} />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              </button>

              {notificationMenuOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-[#1a1a1a] border border-zinc-800 rounded-xl shadow-2xl py-2 z-50 text-xs">
                  <div className="px-4 py-2 border-b border-zinc-800 flex items-center justify-between font-semibold text-white">
                    <span>Notifications</span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">3 New</span>
                  </div>
                  <div className="divide-y divide-zinc-800 max-h-64 overflow-y-auto">
                    <div className="p-3 hover:bg-[#242424] transition-colors cursor-pointer">
                      <p className="font-medium text-zinc-200">New system alert</p>
                      <span className="text-[10px] text-zinc-400">10 minutes ago</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Profile Avatar Dropdown */}
            <div className="relative" ref={profileMenuRef}>
              <div 
                onClick={() => { setProfileMenuOpen(!profileMenuOpen); setNotificationMenuOpen(false); }}
                className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-inner cursor-pointer hover:ring-2 hover:ring-emerald-500"
              >
                AS
              </div>

              {profileMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-[#1a1a1a] border border-zinc-800 rounded-xl shadow-2xl py-2 z-50 text-xs">
                  <div className="px-4 py-3 border-b border-zinc-800">
                    <p className="font-bold text-white">Aigars S.</p>
                    <p className="text-[11px] text-zinc-400">aigars@dashboardpack.com</p>
                  </div>
                </div>
              )}
            </div>

          </div>
        </header>

        {/* ================= WIZARD PAGE VIEW ================= */}
        {activeNav === 'Wizard' && (
          <div className="p-4 lg:p-8 flex-1 flex flex-col items-center justify-center max-w-3xl mx-auto w-full">
            
            <div className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-2xl p-6 lg:p-8 shadow-2xl space-y-8">
              
              {/* Header */}
              <div className="text-center space-y-1">
                <h2 className="text-xl lg:text-2xl font-bold text-white tracking-tight">Account Setup Wizard</h2>
                <p className="text-xs lg:text-sm text-zinc-400">Complete the steps below to configure your workspace profile.</p>
              </div>

              {!wizardSubmitted ? (
                <>
                  {/* Step Progress Bar */}
                  <div className="flex items-center justify-between relative px-4">
                    <div className="absolute left-10 right-10 top-1/2 -translate-y-1/2 h-0.5 bg-zinc-800 z-0"></div>
                    <div 
                      className="absolute left-10 top-1/2 -translate-y-1/2 h-0.5 bg-emerald-500 transition-all duration-300 z-0"
                      style={{ width: wizardStep === 1 ? '0%' : wizardStep === 2 ? '50%' : '100%' }}
                    ></div>

                    {[1, 2, 3].map((step) => (
                      <div key={step} className="relative z-10 flex flex-col items-center gap-1.5">
                        <div className={`w-9 h-9 rounded-full font-bold text-xs flex items-center justify-center transition-all ${
                          wizardStep === step 
                            ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/30 ring-4 ring-emerald-500/20' 
                            : wizardStep > step 
                            ? 'bg-emerald-600 text-white' 
                            : 'bg-[#242424] text-zinc-400 border border-zinc-700'
                        }`}>
                          {wizardStep > step ? <Check size={16} /> : step}
                        </div>
                        <span className={`text-[11px] font-semibold ${wizardStep === step ? 'text-white' : 'text-zinc-500'}`}>
                          {step === 1 ? 'Personal' : step === 2 ? 'Workspace' : 'Billing'}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Wizard Form Steps */}
                  <div className="py-4 space-y-4">
                    {wizardStep === 1 && (
                      <div className="space-y-4 animate-fadeIn">
                        <h3 className="text-sm font-bold text-white border-b border-zinc-800 pb-2">1. Personal Information</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-zinc-300 mb-1">First Name</label>
                            <input 
                              type="text" 
                              value={formData.firstName}
                              onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                              placeholder="e.g. John" 
                              className="w-full bg-[#242424] border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm text-white outline-none focus:border-emerald-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-zinc-300 mb-1">Last Name</label>
                            <input 
                              type="text" 
                              value={formData.lastName}
                              onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                              placeholder="e.g. Doe" 
                              className="w-full bg-[#242424] border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm text-white outline-none focus:border-emerald-500"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-zinc-300 mb-1">Email Address</label>
                          <input 
                            type="email" 
                            value={formData.email}
                            onChange={(e) => setFormData({...formData, email: e.target.value})}
                            placeholder="john.doe@company.com" 
                            className="w-full bg-[#242424] border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm text-white outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>
                    )}

                    {wizardStep === 2 && (
                      <div className="space-y-4 animate-fadeIn">
                        <h3 className="text-sm font-bold text-white border-b border-zinc-800 pb-2">2. Workspace Details</h3>
                        <div>
                          <label className="block text-xs font-semibold text-zinc-300 mb-1">Company / Organization Name</label>
                          <input 
                            type="text" 
                            value={formData.company}
                            onChange={(e) => setFormData({...formData, company: e.target.value})}
                            placeholder="e.g. Acme Corp" 
                            className="w-full bg-[#242424] border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm text-white outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-zinc-300 mb-1">Primary Role</label>
                          <select 
                            value={formData.role}
                            onChange={(e) => setFormData({...formData, role: e.target.value})}
                            className="w-full bg-[#242424] border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm text-white outline-none focus:border-emerald-500"
                          >
                            <option value="Developer">Software Developer / Engineer</option>
                            <option value="Designer">Product Designer / UI/UX</option>
                            <option value="Manager">Product Manager / Project Lead</option>
                            <option value="Founder">Founder / Executive</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {wizardStep === 3 && (
                      <div className="space-y-4 animate-fadeIn">
                        <h3 className="text-sm font-bold text-white border-b border-zinc-800 pb-2">3. Select Plan & Confirm</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div 
                            onClick={() => setFormData({...formData, plan: 'Pro'})}
                            className={`p-4 rounded-xl border cursor-pointer transition-all ${formData.plan === 'Pro' ? 'bg-emerald-500/10 border-emerald-500' : 'bg-[#242424] border-zinc-700'}`}
                          >
                            <h4 className="font-bold text-white text-sm">Pro Plan</h4>
                            <p className="text-xs text-zinc-400 mt-1">Full access to dashboards, Kanban, & AI tools.</p>
                            <span className="text-emerald-400 font-bold text-sm mt-3 block">$29 / month</span>
                          </div>
                          <div 
                            onClick={() => setFormData({...formData, plan: 'Enterprise'})}
                            className={`p-4 rounded-xl border cursor-pointer transition-all ${formData.plan === 'Enterprise' ? 'bg-emerald-500/10 border-emerald-500' : 'bg-[#242424] border-zinc-700'}`}
                          >
                            <h4 className="font-bold text-white text-sm">Enterprise</h4>
                            <p className="text-xs text-zinc-400 mt-1">Advanced security, dedicated support & custom limits.</p>
                            <span className="text-emerald-400 font-bold text-sm mt-3 block">$99 / month</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Wizard Controls */}
                  <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
                    <button 
                      onClick={handleWizardPrev}
                      disabled={wizardStep === 1}
                      className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#242424] text-zinc-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed border border-zinc-700 transition-colors"
                    >
                      Back
                    </button>
                    <button 
                      onClick={handleWizardNext}
                      className="px-5 py-2.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-black shadow-lg shadow-emerald-500/20 transition-all"
                    >
                      {wizardStep === 3 ? 'Complete Setup' : 'Continue'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="py-12 text-center space-y-4 animate-fadeIn">
                  <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto ring-8 ring-emerald-500/10">
                    <CheckCircle size={32} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-white">Setup Completed Successfully!</h3>
                    <p className="text-xs text-zinc-400">Welcome aboard, {formData.firstName || 'User'}. Your {formData.plan} plan is ready.</p>
                  </div>
                  <button 
                    onClick={() => { setWizardStep(1); setWizardSubmitted(false); }}
                    className="px-5 py-2.5 rounded-lg text-xs font-bold bg-[#242424] text-zinc-200 border border-zinc-700 hover:bg-zinc-800 mt-4"
                  >
                    Reset Wizard
                  </button>
                </div>
              )}

            </div>

          </div>
        )}

        {/* Fallback View for other tabs */}
        {activeNav !== 'Wizard' && (
          <div className="py-20 text-center space-y-3 flex-1 flex flex-col items-center justify-center">
            <h2 className="text-xl font-bold text-white">{activeNav} View</h2>
            <p className="text-xs text-zinc-400">Click on "Wizard Form" in the left sidebar to view the wizard form page.</p>
            <button onClick={() => setActiveNav('Wizard')} className="bg-emerald-500 text-black font-semibold text-xs px-4 py-2 rounded-lg mt-2">
              Go to Wizard Form
            </button>
          </div>
        )}

      </main>

    </div>
  );
}

// --- Helper Components ---

function NavItem({ icon, label, active = false, badge, onClick }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
        active 
          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
          : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#242424]/40'
      }`}
    >
      <div className="flex items-center gap-2.5">
        {icon}
        <span>{label}</span>
      </div>
      {badge && (
        <span className="bg-emerald-500/20 text-emerald-400 text-[10px] px-1.5 py-0.2 rounded-full font-semibold">
          {badge}
        </span>
      )}
    </button>
  );
}