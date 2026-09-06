/**
 * Active-project store — mirrors the `medcall_user` / `medcall:user-updated`
 * pattern: state lives in localStorage, components sync via a window event.
 *
 * The stored value is `{ _id, name }` or absent (= "All projects").
 */
const KEY   = 'medcall_project';
const EVENT = 'medcall:project-changed';

export const getActiveProject = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
};

export const getActiveProjectId = () => getActiveProject()?._id || null;

export const setActiveProject = (project) => {
  if (project?._id) {
    localStorage.setItem(KEY, JSON.stringify({ _id: project._id, name: project.name || '' }));
  } else {
    localStorage.removeItem(KEY);   // null/undefined → "All projects"
  }
  window.dispatchEvent(new Event(EVENT));
};

/** Subscribe to switches; returns an unsubscribe function for useEffect cleanup. */
export const onProjectChange = (fn) => {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
};

/** Merge the active project id into API query params (no-op when unset). */
export const withProject = (params = {}) => {
  const id = getActiveProjectId();
  return id ? { ...params, project: id } : params;
};
