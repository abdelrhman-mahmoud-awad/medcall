# MedCall AI — Phase 5 Implementation Guide

## What Phase 5 Delivers

**Projects, teams, targets & AI market interpretation** — the app becomes
multi-project and multi-user. Whoever registers is a **manager**; managers
create projects, add team **members** under them, attach the contact sheet,
set call/form targets, watch everyone's progress live, and get an AI-written
interpretation of the market research collected by the calls:

```
Register (email + password)
        ↓  the new account is a MANAGER
Manager creates PROJECTS (one or many)
        ↓ per project
   ├── Adds MEMBERS under him (name + email + password → member accounts)
   ├── Attaches the contact sheet:
   │     • upload .xlsx            (same validated import as Phase 3)
   │     • OR paste a Google Sheet link  (link-shared sheet, no OAuth)
   │     → contacts imported and TAGGED with the project
   ├── Sets TARGETS:  completed calls  +  entered forms
   ↓
Members log in (same login page) and work the project
   (calls → Phase 1/2 pipeline, forms → Phase 4 review + extension)
        ↓ everything they do is attributed to them
PROGRESS DASHBOARD (manager)
   ├── Total project progress:   calls  ▓▓▓▓▓░░ 68 / 100
   │                             forms  ▓▓▓░░░░ 41 / 100
   └── Per-member breakdown:     Sara   32 calls · 20 forms
                                 Omar   36 calls · 21 forms
        ↓
AI MARKET INSIGHTS page
   AI aggregates ALL project data (call outcomes, lead scores, per-question
   answers, specialties, cities, sentiment) → writes the market research
   interpretation: summary, key findings, market signals, recommendations, risks
```

> Same rule as before: dashboard in English/Arabic UI, only the phone AI
> speaks Egyptian Arabic. No new external services — insights reuse the
> existing `GEMINI_API_KEY`.

---

## Roles & Access Model

| Role | How created | Can do |
|---|---|---|
| **manager** | Self-registration (`/register`) | Everything: create projects, add/remove members, upload sheets, set targets, see all progress, generate insights |
| **member** | Created by a manager inside a project | Log in (same login page), work calls & data-entry review for their projects, see their own progress |

- A member account stores `manager` (the manager who created it) — members
  belong to their manager's team and can be attached to any of his projects.
- Old `admin` / `agent` roles keep working (backward compatible) — existing
  users are treated as managers.
- JWT auth is unchanged; login response now includes `role` so the frontend
  can hide manager-only UI from members.

---

## New Files to Add

```
backend/
└── src/
    ├── models/
    │   └── Project.js              ← ★ name, manager, members, sheet, targets, insights cache
    ├── services/
    │   └── projectService.js       ← ★ sheet import (xlsx + Google Sheet), progress
    │                                    aggregation, Gemini market interpretation
    ├── routes/
    │   └── projects.js             ← ★ project CRUD, members, sheet, progress, insights
    └── middleware/
        └── requireManager.js       ← manager-only guard (sits after auth)

frontend/
└── src/
    └── pages/
        ├── ProjectsPage.jsx        ← ★ create projects, members, sheet, targets, progress
        └── MarketInsightsPage.jsx  ← ★ AI interpretation of the market research
```

**Modified existing files:**

| File | Change |
|---|---|
| `backend/src/models/User.js` | Role enum + `manager`/`member`; `manager` ref on member accounts |
| `backend/src/routes/auth.js` | Register → role `manager`; login/register responses include `role` |
| `backend/src/models/Contact.js` | Add `project` ref — every imported contact belongs to a project |
| `backend/src/models/CallLog.js` | *(no schema change needed — `initiatedBy` already exists; project derived via `contact.project`)* |
| `backend/src/index.js` | Register `/api/projects` route |
| `frontend/src/App.jsx` | Nav + routes for **المشاريع** and **تحليل السوق (AI)**; hide manager pages from members |
| `frontend/src/services/api.js` | Project/member/progress/insights API helpers; store `role` on login |

---

## New Environment Variables

Add to `backend/.env` (both optional):

```env
# ── Phase 5: AI Market Insights ──────────────────────────────────────────────
INSIGHTS_MODEL=gemini-2.5-flash      # defaults to DRAFT_MODEL / GEMINI_MODEL
INSIGHTS_CACHE_HOURS=12              # regenerate at most every N hours (0 = always fresh)
```

No new dependencies — `exceljs`, `multer`, `axios`, and the Gemini SDK are
already installed.

---

## Feature 1: Projects & Members

### `backend/src/models/Project.js` (skeleton)

```js
const projectSchema = new mongoose.Schema({
  name:    { type: String, required: true, trim: true },
  manager: { type: ObjectId, ref: 'User', required: true },
  members: [{ type: ObjectId, ref: 'User' }],

  // Attached contact sheet
  sheet: {
    sourceType:    { type: String, enum: ['xlsx', 'google_sheet'] },
    fileName:      String,          // uploaded file name
    googleSheetUrl:String,          // pasted link
    importedCount: Number,
    invalidRows:   Number,
    importedAt:    Date,
  },

  // Targets set by the manager
  targets: {
    calls: { type: Number, default: 0 },   // completed calls goal
    forms: { type: Number, default: 0 },   // entered forms goal
  },

  status: { type: String, enum: ['active', 'archived'], default: 'active' },

  // AI insights cache (Feature 4)
  insights:            mongoose.Schema.Types.Mixed,
  insightsGeneratedAt: Date,
}, { timestamps: true });
```

### `backend/src/routes/projects.js`

| Method | Endpoint | Who | Purpose |
|---|---|---|---|
| GET | `/api/projects` | both | Manager: his projects · Member: projects he's in |
| POST | `/api/projects` | manager | Create project `{ name, targets? }` |
| PUT | `/api/projects/:id` | manager | Rename / edit targets / archive |
| DELETE | `/api/projects/:id` | manager | Archive the project (soft delete) |
| POST | `/api/projects/:id/members` | manager | `{ name, email, password }` → creates a member account under him **and** attaches it; if the email is already one of his members, just attaches |
| DELETE | `/api/projects/:id/members/:userId` | manager | Detach from project (account stays) |
| POST | `/api/projects/:id/sheet` | manager | Multipart `.xlsx` **or** JSON `{ googleSheetUrl }` → import contacts tagged with the project |
| GET | `/api/projects/:id/progress` | both | Totals + per-member breakdown vs targets |
| GET | `/api/projects/:id/insights` | manager | Cached AI interpretation (`?refresh=true` to regenerate) |

Manager routes are guarded by `middleware/requireManager.js`:

```js
module.exports = (req, res, next) => {
  const role = req.user?.role;
  if (role === 'manager' || role === 'admin' || role === 'agent') return next();
  return res.status(403).json({ error: 'Manager access required' });
};
```

Every project query is scoped: `{ manager: req.user._id }` for managers,
`{ members: req.user._id }` for members — nobody ever sees another team's data.

---

## Feature 2: Sheet Import (xlsx or Google Sheet)

Reuses the Phase 3 validation pipeline (`validateRow` — bad rows are rejected
and reported, never imported), but imports are **scoped to the project**:
every created contact gets `project: <projectId>`.

### Upload flow (`projectService.importSheet`)

```
xlsx upload      → multer temp file ─┐
                                      ├→ ExcelJS parse (name, phone, type,
Google Sheet URL → download as xlsx ─┘   specialty, city — same columns as Phase 3)
                                      → validateRow() each row
                                      → Contact.create({ ...row, project })
                                      → project.sheet = { sourceType, importedCount, … }
```

### Google Sheets without OAuth

A link-shared Google Sheet can be downloaded directly as xlsx:

```
https://docs.google.com/spreadsheets/d/<SHEET_ID>/export?format=xlsx
```

`projectService` extracts the `SHEET_ID` from any pasted Google Sheets URL and
fetches that export. **Requirement:** the sheet must be shared as
*"Anyone with the link — Viewer"*. If Google returns an HTML login page
instead of a file, the API responds with a clear error telling the manager to
fix the share setting. (Private-sheet access via the Phase 4 Google OAuth
integration is a possible later upgrade.)

Re-importing the same sheet is safe: contacts are matched by phone —
existing ones are linked to the project, not duplicated.

---

## Feature 3: Targets & Progress

### Definitions

- **Completed call** = `CallLog.status ∈ { completed, escalated }` on a
  contact belonging to the project
- **Entered form** = `DataEntryDraft.status = 'entered'` (the Phase 4
  end-state after the extension fills the real form) on a project contact
- **Attribution**: calls → `CallLog.initiatedBy` · forms → the reviewer who
  approved the draft (`reviewedBy`)

### `GET /api/projects/:id/progress` response

```json
{
  "targets":  { "calls": 100, "forms": 100 },
  "totals":   { "calls": 68, "forms": 41,
                "callsPct": 68, "formsPct": 41,
                "contacts": 250, "hotLeads": 12, "avgScore": 54 },
  "members": [
    { "id": "…", "name": "Sara",  "calls": 32, "forms": 20 },
    { "id": "…", "name": "Omar",  "calls": 36, "forms": 21 },
    { "id": null, "name": "Unattributed (auto/campaign)", "calls": 0, "forms": 0 }
  ]
}
```

Implementation: two MongoDB aggregations that `$lookup` the contact and match
`contact.project`, then `$group` by `initiatedBy` / `reviewedBy`. Campaign
calls launched by the worker have no `initiatedBy` — they land in the
*Unattributed* bucket so totals always add up.

### `frontend/src/pages/ProjectsPage.jsx`

- **Manager view**: project cards → create project · inline target editing ·
  *Add member* form (name, email, password — password shown once on creation) ·
  sheet attach (file picker **or** Google Sheet URL box) · progress bars
  (total calls / total forms vs target) · per-member table with mini-bars
- **Member view**: read-only card per project — the team's total progress and
  *your* personal numbers

---

## Feature 4: AI Market Insights

### What the AI sees (`projectService.buildInsightsDataset`)

One aggregated, **anonymized** dataset per project — no transcripts are sent,
only the structured results:

```json
{
  "project": "Cardio-X Launch",
  "contacts": { "total": 250, "byType": { "physician": 180, "pharmacist": 70 },
                "bySpecialty": { "cardiology": 90, "…": 0 }, "byCity": { "Cairo": 120 } },
  "calls":    { "completed": 68, "noAnswer": 20, "failed": 5, "avgDurationSec": 190,
                "consent":  { "granted": 60, "denied": 8 } },
  "leads":    { "hot": 12, "warm": 25, "cold": 31, "avgScore": 54 },
  "answers":  {
    "aware_of_drug": { "yes": 40, "no": 28 },
    "prescribing":   { "never": 20, "rarely": 18, "sometimes": 22, "often": 8 },
    "interested":    { "yes": 45, "no": 23 }
  },
  "sentiment": { "positive": 90, "neutral": 130, "negative": 40 },
  "progress":  { "callsTarget": 100, "callsDone": 68, "formsTarget": 100, "formsDone": 41 }
}
```

The per-question answer counts come from the Phase 4 drafts (approved +
entered), keyed by `formSchema.json` — the same fixed schema that drives
everything else.

### The interpretation (`projectService.generateInsights`)

Gemini (strict JSON mode, same pattern as `dataEntryService`) turns that
dataset into a market-research interpretation:

```json
{
  "summary":         "3-5 sentence executive summary of the market research so far",
  "keyFindings":     ["Awareness is at 59% among reached physicians…", "…"],
  "marketSignals":   [{ "signal": "High interest, low prescribing", "evidence": "45 interested vs 8 often-prescribing", "meaning": "…" }],
  "segments":        [{ "segment": "Cairo cardiologists", "insight": "…" }],
  "recommendations": ["Prioritize sample delivery to the 12 hot leads…", "…"],
  "risks":           ["8 consent denials suggest…"],
  "dataQuality":     "Caveats: only 68/100 target calls completed — findings are preliminary."
}
```

Rules baked into the prompt:

- **Numbers only from the dataset** — the model must cite the counts it was
  given, never invent statistics
- Must include a `dataQuality` caveat when sample sizes are small
- Output validated as JSON; on failure it retries once, then the page shows
  the raw stats with an "AI unavailable" note (never blocks)

Results are cached on the project (`insights`, `insightsGeneratedAt`) and
regenerated when older than `INSIGHTS_CACHE_HOURS` or when the manager clicks
**🔄 Regenerate**.

### `frontend/src/pages/MarketInsightsPage.jsx`

- Project selector (manager's projects)
- Top: the raw numbers the AI saw (small stat cards + answer distribution bars)
  — the human can always verify the interpretation against the data
- Below: the AI interpretation — summary, findings, signals table,
  segment insights, recommendations, risks, data-quality caveat
- **🔄 Regenerate** button + "generated N hours ago" stamp

---

## Setup Steps

1. **No new installs** — restart the backend after pulling the changes
2. (Optional) add `INSIGHTS_MODEL` / `INSIGHTS_CACHE_HOURS` to `backend/.env`
3. Register a fresh account → it's a **manager**
4. **المشاريع** page → create a project → set targets (e.g. 100 calls / 100 forms)
5. Add a member (name, email, password) → log in as them in another browser to verify
6. Attach the sheet: upload the `.xlsx` **or** paste a link-shared Google Sheet URL
7. Make calls / complete Phase 4 data entry → watch the progress bars move
8. **تحليل السوق (AI)** page → pick the project → read the interpretation → 🔄 Regenerate after more calls

---

## Phase 5 Checklist

- [ ] `User.js`: add `manager` / `member` roles + `manager` ref; register creates managers
- [ ] `auth.js`: return `role` on login/register; frontend stores it
- [ ] `Project.js` model (name, manager, members, sheet, targets, insights cache)
- [ ] `requireManager.js` middleware
- [ ] `projects.js` routes: CRUD + members + sheet + progress + insights
- [ ] `Contact.js`: add `project` ref; project-scoped sheet import (xlsx + Google Sheet link)
- [ ] `projectService.js`: import, progress aggregation, insights dataset + Gemini interpretation
- [ ] Register `/api/projects` in `index.js`
- [ ] `ProjectsPage.jsx` (manager + member views) + nav/route
- [ ] `MarketInsightsPage.jsx` + nav/route
- [ ] Test: register → manager; member account can log in but sees no manager UI
- [ ] Test: xlsx upload imports tagged contacts; Google Sheet link works when link-shared, clear error when private
- [ ] Test: complete a call + enter a form → both progress bars and the member's row update
- [ ] Test: insights page shows real counts + AI interpretation; regenerate works; graceful fallback without `GEMINI_API_KEY`

---

## Notes & Boundaries

- **Data isolation is by manager**: members created by manager A can never be
  attached to manager B's projects; all project queries are ownership-scoped
- **Passwords**: member passwords are set by the manager and bcrypt-hashed like
  any user; the plaintext is shown to the manager only once, at creation
- **Insights are advisory**: the AI only ever sees aggregated counts — no
  names, phones, or transcripts — and every claim must trace back to a number
  in the dataset shown at the top of the page
- Existing single-team installs keep working: contacts without a `project`
  stay visible in the old pages; only the new Projects/Insights pages require
  project tagging

---

## Phase 6 Preview (what comes next)

- **Fine-tuned TTS** — your own voice, Egyptian dialect
- **Call scheduling** — office hours, automatic no-answer retries
- **Private Google Sheets** — reuse the Phase 4 Drive OAuth integration for
  non-public sheets, plus live write-back of results
- **Insights v2** — trend charts over time, cross-project comparison, PDF export
