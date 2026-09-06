/**
 * useRole — single source of truth for the current user's role.
 *
 * The role is written to localStorage at login/logout only, so plain read
 * helpers are enough (no reactivity needed). Anything that is not an
 * explicit 'member' is treated as a manager — this mirrors the backend's
 * requireManager middleware, which accepts legacy 'admin'/'agent' roles.
 */
export const getRole = () => localStorage.getItem('medcall_role') || 'manager';

export const isManager = () => getRole() !== 'member';
