# Known Issues & Improvement Backlog

A review of the current site structure, pages, and architecture. Each item lists the problem and a concrete example from the codebase.

## Navigation / structure

### 1. Nav overload — ✅ Fixed
13 sidebar items across 5 sections in `frontend/src/App.jsx`.
**Example:** a new user must guess the difference between "Contacts", "Call Log", and "Data Entry Review".
**Fix:** consolidated to 8 top-level pages. `DataHubPage` (tabs: Contacts / Call Log / Review / Scripts / Import) and `ReportsPage` (tabs: Analytics / Market Insights) replace 7 nav items; legacy routes redirect to the new tabbed paths.

### 2. Duplicate data views — ✅ Fixed
`ContactsPage`, `CallsPage`, and `DataEntryReviewPage` all render tables over the same call/contact records with separate fetching logic.
**Fix:** merged into one "Data" page with tabs — pages now live under `/data/:tab` via `DataHubPage` (Contacts / Call Log / Review / Scripts / Import-Sync). Each tab keeps its own fetch logic for now, which could still be unified as a refactor.

### 3. Redundant import page — ✅ Fixed
`ExcelSyncPage` duplicates the xlsx / Google Sheet import already built into `OnboardingPage` step 4 (both hit `POST /projects/:id/sheet`).
**Fix:** the standalone page was removed from the nav; import now lives as the "Import / Sync" tab inside the Data hub, and `/excel` redirects to `/data/import`.

### 4. Three overlapping chart pages — ✅ Fixed
`DashboardPage`, `AnalyticsPage`, and `MarketInsightsPage` overlap; users won't know where to look for a given number.
**Fix:** Dashboard remains the standalone overview; Analytics and Market Insights are now tabs under `/reports/:tab` via `ReportsPage` (Insights tab hidden for members). Legacy `/analytics` and `/insights` routes redirect.

### 11. Call Center and Campaigns overlap
Both pages are triggers for the same AI-calling engine and duplicate the same contact + script picker UI. `CallCenterPage` fires immediate ad-hoc calls (`initiateCall` + 5s polling), while `CampaignPage` queues named bulk runs on the backend (`POST /campaigns`) with WebSocket progress. Agent Console is unrelated (human escalation roster) and should stay separate.
**Example:** a user wanting to call 5 doctors doesn't know whether to use Call Center or create a Campaign; both screens show the same contact list and script dropdown.
**Fix:** merge into one "Calling" page with two tabs — **Quick calls** (current Call Center) and **Campaigns** (current Campaign page) — sharing a single contact + script picker component. Keep `/call-center` and `/campaigns` as legacy redirects to `/calling/quick` and `/calling/campaigns`.

## Architecture

### 5. No project scoping — ✅ Fixed
Call Center, Scripts, and Contacts are global routes, even though projects are the core entity (targets, scripts, members, sheets all hang off them).
**Example:** an agent on `/call-center` sees no indication of which project's script/targets apply.
**Fix:** implemented end to end:
- **Backend:** new `middleware/projectScope.js` supports an optional `?project=<id>` query param on `GET /api/contacts`, `GET /api/calls`, `GET /api/calls/stats/summary`, and `GET /api/scripts`, with access control (owner or attached member only; 403 otherwise). Contacts filter directly on `Contact.project`; calls filter indirectly via the project's contact ids; scripts return the project's bound script (`Project.script`) with a global fallback when none is bound. Without the param, behaviour is unchanged.
- **Frontend:** new `services/projectStore.js` (localStorage key `medcall_project` + `medcall:project-changed` window event, mirroring the `medcall:user-updated` pattern); a project switcher dropdown in the Shell topbar populated from the role-scoped `GET /api/projects` with an "All projects" option; `api.js` list helpers (`getContacts`, `getCalls`, `getCallStats`, `getScripts`) auto-merge the active project; Call Center, Agent Console, Contacts, and Call Log re-fetch on switch. The selection persists across reloads, and stale selections are cleared automatically.

### 6. No role-based landing — ✅ Fixed
Members land on `/dashboard` (a manager view) instead of `/agents`; the `managerOnly` flag only hides Insights and Integrations.
**Fix:** login now routes members to `/agents` and managers to `/dashboard`; `managerOnly` was extended to Campaigns and Projects nav items, and a `ManagerRoute` guard redirects members away from `/campaigns`, `/projects`, `/projects/:id/settings`, and `/integrations`.

### 7. Onboarding not gated — ✅ Fixed
`/onboarding` is only reached via the register redirect.
**Example:** refreshing mid-wizard loses `projectId` state and lands the user on an empty dashboard with no way back.
**Fix:** after a manager logs in, the app calls `getProjects()` and redirects to `/onboarding` when the list is empty (falls back to the dashboard if the check fails). Mid-wizard refresh resilience is covered by issue 10.

## Technical

### 8. 790 kB bundle, no code-splitting — ✅ Fixed
No `React.lazy`; all 15 pages ship on first load (Vite warns about this at build time).
**Fix:** every page in `App.jsx` is now loaded via `React.lazy` behind `<Suspense>` (shared `components/PageLoader.jsx` spinner), and the tab pages inside `DataHubPage` / `ReportsPage` are lazy too with per-tab Suspense boundaries. Result: the entry chunk dropped from **792.73 kB (gzip 235 kB)** to **~183 kB (gzip 59 kB)**; recharts (~374 kB) now only loads when the Dashboard or a Reports tab is opened.

### 9. Weak auth handling — ✅ Fixed
`PrivateRoute` only checks `localStorage` for a token; there is no 401 interceptor in `frontend/src/services/api.js`.
**Example:** expired token → every page renders but all requests silently fail.
**Fix:** `frontend/src/services/api.js` has an axios response interceptor that clears `medcall_token` and redirects to `/login` on 401.

### 10. Wizard state is volatile — ✅ Fixed
`OnboardingPage` keeps `projectId` and the current step in component state only.
**Example:** any refresh restarts the wizard from step 1 and can create a duplicate project.
**Fix:** wizard progress (`step`, `projectId`, project form values, script choice, import method/URL — never member passwords or files) is persisted to `sessionStorage` under `medcall_onboarding`, restored on mount, validated against `getProjects()` (falling back to a fresh wizard if the saved project no longer exists), and cleared on completion. Re-entering step 1 with a saved `projectId` updates the existing project instead of creating a duplicate.

## Missing features

### 12. No member management & progress tracking page
`AccountPage` ("Account & Team") can create team members (`createTeamMember`, `addProjectMember`) but there is no way to manage them afterwards or track their work.
**Example:** a manager who added 5 members during onboarding cannot see who made how many calls, who filled how many consent forms, or deactivate / reassign a member — there is no per-member activity view anywhere.
**Fix:** add a dedicated "Team" page (or expand Account & Team) with: member list (edit, deactivate, reassign project), and a per-member progress table — calls made, forms/consents completed, escalations, last active — fed by aggregating the existing calls data by member. Optionally add a leaderboard-style summary to the manager dashboard.

### 13. Dashboard missing target progress bars
Projects have `targets.calls` and `targets.forms` (collected in the onboarding wizard), but `DashboardPage` never visualizes progress against them — its only progress bars are per-campaign.
**Example:** a manager who set a target of 500 calls and 200 consent forms has no single view showing "312 / 500 calls · 87 / 200 consents".
**Fix:** add two progress bars per project on the dashboard using the existing `.progress-track` / `.progress-fill` styles: **calls done vs. target calls** and **consent forms filled vs. target forms**, with percentage labels and an over/under-pace indicator based on the project timeline.
