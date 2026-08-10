import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api',
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

// ── Auth ──────────────────────────────────────────────────────────────────────
export const login    = (data) => api.post('/auth/login',    data);
export const register = (data) => api.post('/auth/register', data);

// ── Contacts ──────────────────────────────────────────────────────────────────
export const getContacts   = (params) => api.get('/contacts', { params });
export const getContact    = (id)     => api.get(`/contacts/${id}`);
export const createContact = (data)   => api.post('/contacts', data);
export const updateContact = (id, d)  => api.put(`/contacts/${id}`, d);
export const deleteContact = (id)     => api.delete(`/contacts/${id}`);

// ── Call logs ─────────────────────────────────────────────────────────────────
export const getCalls     = (params) => api.get('/calls', { params });
export const getCall      = (id)     => api.get(`/calls/${id}`);
export const getCallStats = ()       => api.get('/calls/stats/summary');

// ── Scripts ───────────────────────────────────────────────────────────────────
export const getScripts   = ()       => api.get('/scripts');
export const getScript    = (id)     => api.get(`/scripts/${id}`);
export const createScript = (data)   => api.post('/scripts', data);
export const updateScript = (id, d)  => api.put(`/scripts/${id}`, d);

// ── Twilio / Calling ──────────────────────────────────────────────────────────
export const initiateCall = (data)   => api.post('/twilio/call', data);

export default api;
