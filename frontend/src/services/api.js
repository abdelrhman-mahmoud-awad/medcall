import axios from 'axios';
import { withProject } from './projectStore';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || 'http://localhost:5000/api',
});

// Attach JWT from localStorage automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('medcall_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Redirect to login on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('medcall_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ── Auth & account ────────────────────────────────────────────────────────────
export const login    = (data) => api.post('/auth/login',    data);
export const register = (data) => api.post('/auth/register', data);
export const getMe    = ()     => api.get('/auth/me');
export const updateMe = (data) => api.put('/auth/me', data);
export const getTeam          = ()      => api.get('/auth/team');
export const createTeamMember = (data)  => api.post('/auth/team', data);
export const updateTeamMember = (id, d) => api.put(`/auth/team/${id}`, d);

// ── Contacts ──────────────────────────────────────────────────────────────────
// List endpoints are automatically scoped to the active project (topbar switcher).
export const getContacts   = (params) => api.get('/contacts', { params: withProject(params) });
export const getContact    = (id)     => api.get(`/contacts/${id}`);
export const createContact = (data)   => api.post('/contacts', data);
export const updateContact = (id, d)  => api.put(`/contacts/${id}`, d);
export const deleteContact = (id)     => api.delete(`/contacts/${id}`);

// ── Call logs ─────────────────────────────────────────────────────────────────
export const getCalls     = (params) => api.get('/calls', { params: withProject(params) });
export const getCall      = (id)     => api.get(`/calls/${id}`);
export const getCallStats = ()       => api.get('/calls/stats/summary', { params: withProject() });

// ── Scripts ───────────────────────────────────────────────────────────────────
export const getScripts   = ()       => api.get('/scripts', { params: withProject() });
export const getScript    = (id)     => api.get(`/scripts/${id}`);
export const createScript = (data)   => api.post('/scripts', data);
export const updateScript = (id, d)  => api.put(`/scripts/${id}`, d);

// ── Twilio / Calling ──────────────────────────────────────────────────────────
export const initiateCall = (data)   => api.post('/twilio/call', data);

// ── Excel sync ────────────────────────────────────────────────────────────────
export const uploadExcel        = (formData) => api.post('/excel/upload', formData);
export const syncExcel          = ()   => api.post('/excel/sync');
export const downloadExcel      = ()   => api.get('/excel/download', { responseType: 'blob' });
export const getExcelStatus     = ()   => api.get('/excel/status');
export const getExcelChanges    = ()   => api.get('/excel/changes');
export const approveChange      = (id) => api.post(`/excel/changes/${id}/approve`);
export const rejectChange       = (id) => api.post(`/excel/changes/${id}/reject`);
export const verifyChange       = (id) => api.post(`/excel/changes/${id}/verify`);
export const verifyContactData  = (contactId) => api.post(`/excel/verify/${contactId}`);

// ── Integrations ──────────────────────────────────────────────────────────────
export const getGoogleStatus     = () => api.get('/integrations/google/status');
export const getGoogleConnectUrl = () => api.get('/integrations/google/connect');
export const disconnectGoogle    = () => api.delete('/integrations/google');

// ── Campaigns (Phase 2) ───────────────────────────────────────────────────────
export const getCampaigns   = ()     => api.get('/campaigns');
export const createCampaign = (data) => api.post('/campaigns', data);
export const launchCampaign = (id)   => api.post(`/campaigns/${id}/launch`);
export const pauseCampaign  = (id)   => api.post(`/campaigns/${id}/pause`);
export const resumeCampaign = (id)   => api.post(`/campaigns/${id}/resume`);

// ── Analytics (Phase 2) ───────────────────────────────────────────────────────
export const getAnalyticsSummary  = (params) => api.get('/analytics/summary',  { params });
export const getAnalyticsTimeline = (params) => api.get('/analytics/timeline', { params });

// ── Agents (Phase 2) ──────────────────────────────────────────────────────────
export const getAgents   = ()      => api.get('/agents');
export const createAgent = (data)  => api.post('/agents', data);
export const updateAgent = (id, d) => api.put(`/agents/${id}`, d);
export const deleteAgent = (id)    => api.delete(`/agents/${id}`);

// ── Projects (Phase 5) ────────────────────────────────────────────────────────
export const getProjects         = ()        => api.get('/projects');
export const createProject       = (data)    => api.post('/projects', data);
export const updateProject       = (id, d)   => api.put(`/projects/${id}`, d);
export const archiveProject      = (id)      => api.delete(`/projects/${id}`);
export const addProjectMember    = (id, d)   => api.post(`/projects/${id}/members`, d);
export const removeProjectMember = (id, uid) => api.delete(`/projects/${id}/members/${uid}`);
export const uploadProjectSheet  = (id, formData) => api.post(`/projects/${id}/sheet`, formData);
export const linkProjectSheet    = (id, googleSheetUrl) => api.post(`/projects/${id}/sheet`, { googleSheetUrl });
export const getProjectProgress  = (id)      => api.get(`/projects/${id}/progress`);
export const getProjectInsights  = (id, refresh = false) =>
  api.get(`/projects/${id}/insights`, { params: refresh ? { refresh: true } : {} });

// ── Project settings (Phase 6) ────────────────────────────────────────────────
export const getProjectSettings    = (id)    => api.get(`/projects/${id}/settings`);
export const updateProjectSettings = (id, d) => api.put(`/projects/${id}/settings`, d);

export default api;
