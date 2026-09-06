# Known Issues & Improvement Backlog

A review of the current site structure, pages, and architecture. Each item lists the problem and a concrete example from the codebase.

> **Note:** Issues 1–15 (navigation consolidation, project scoping, role-based landing, code-splitting, auth handling, wizard persistence, tab alignment, member management, dashboard targets, etc.) were all resolved and have been removed from this file. See git history for their details.

## Open issues

### 16. No dedicated member layout / workspace — ✅ Fixed

**Resolution:** Implemented the guard-only approach. Role reads are centralized in `frontend/src/hooks/useRole.js` (`getRole()` / `isManager()`); `/dashboard` is wrapped in `ManagerRoute` and the Dashboard nav item is `managerOnly` (members land on `/agents`); the Data hub hides the **Scripts** and **Import / Sync** tabs for members; `CallingPage` / `ReportsPage` were migrated to `useRole()`; Agent Console hides the add/toggle/remove actions for members; and the backend `POST` / `PUT` / `DELETE` `/api/agents` routes now chain `requireManager`. The member-specific dashboard variant (fix-plan item 2's "better" option) was **deferred** in favor of the `ManagerRoute` guard.

**Problem:** Members do **not** get a different layout from managers. Both roles share the exact same `Shell` (sidebar + topbar) in `frontend/src/App.jsx`, and the only role-based differences today are surface-level filtering: the `managerOnly` nav flag hides Projects and Integrations, `ManagerRoute` guards a handful of routes, and `CallingPage` / `ReportsPage` hide the Campaigns and Market Insights tabs. Several manager-oriented surfaces remain fully exposed to members:

- **`/dashboard` is unguarded.** The Dashboard nav item is not `managerOnly` and the route has no `ManagerRoute` guard, so members can open a manager overview: campaign cards, a "New campaign" button (which links to `/calling/campaigns` and then bounces them), project-target progress bars, and the analytics summary.
- **Data hub (`/data/:tab`) shows all 5 tabs to members**, including **Scripts** (script management) and **Import / Sync** (`ExcelSyncPage`, which hits the manager-scoped `POST /projects/:id/sheet`).
- **Agent Console write actions are ungated.** Any user can add, toggle, or delete agents in `AgentConsolePage.jsx` (`POST` / `PUT` / `DELETE` `/agents`) — no role check on the frontend actions or the backend routes.
- **No member home view.** Members are simply dropped on Agent Console; there is no "my calls / my assigned contacts / my stats" workspace, even though the backend already tracks per-member stats (`GET /auth/team` aggregates from `CallLog.initiatedBy` and `DataEntryDraft.reviewedBy`).
- **Role reads are duplicated** — `localStorage` role lookups are repeated in 4+ places (`App.jsx` ×2, `CallingPage.jsx`, `ReportsPage.jsx`) with no single source of truth.

**Example:** a member logs in, clicks "Dashboard" in the sidebar, and lands on the manager overview with campaign management CTAs they cannot actually use; from the Data hub they can open Scripts and Import / Sync; from Agent Console they can delete an agent used by the whole team.

**Proposed fix plan:**

1. **Centralize role reads.** Add a `useRole()` helper/hook (or extend the `services/projectStore.js` pattern) so role checks like `isManager` come from one place instead of repeated `localStorage` reads.
2. **Fix `/dashboard` for members.** Either guard it with `ManagerRoute`, or (better) render a member-specific dashboard variant — my calls today, my escalations, my form count — using the existing per-member stats endpoints (`GET /auth/team` aggregation sources: `CallLog.initiatedBy`, `DataEntryDraft.reviewedBy`).
3. **Filter nav and Data hub tabs by role.** Mark the `Dashboard` nav item `managerOnly` (or swap its label/target per role), and hide the **Scripts** and **Import / Sync** tabs for members in `DataHubPage.jsx`, mirroring the existing tab-filtering pattern in `CallingPage.jsx` / `ReportsPage.jsx` (direct URL access already falls back to the first visible tab via `TabbedPage`'s `Navigate`).
4. **Gate agent mutations.** Hide/disable the add, toggle, and delete agent actions in `AgentConsolePage.jsx` behind `isManager`, and add the `requireManager` middleware to the mutating `/agents` routes on the backend so the API is protected regardless of the UI.
5. **Optional: slimmer member sidebar.** Give members a reduced nav with fewer sections — Console, Calling, Data, Reports, Account.

**Affected files (for future implementers):**

- `frontend/src/App.jsx` — Shell, `NAV` array, `ManagerRoute`, routes
- `frontend/src/pages/DataHubPage.jsx` — role-based tab filtering (Scripts, Import / Sync)
- `frontend/src/pages/DashboardPage.jsx` — guard or member variant
- `frontend/src/pages/AgentConsolePage.jsx` — gate add/toggle/delete actions
- `frontend/src/pages/CallingPage.jsx`, `frontend/src/pages/ReportsPage.jsx` — existing tab-filtering pattern to reuse / migrate to `useRole()`
- `backend/src/middleware/requireManager.js` — apply to mutating agent routes
- backend agents route (`backend/src/routes/`) — add `requireManager` to `POST` / `PUT` / `DELETE` `/agents`
