# MedCall AI — Phase 6 Implementation Guide

## What Phase 6 Delivers

**Per-project configuration** — until now the whole system ran on ONE global
setup: one form schema (`config/formSchema.json`), one consent line (`.env`),
one extension mapping (`mappings.json`), and scripts picked per call. Phase 6
makes every project self-contained. Each project gets its **own**:

| Setting | Was (global) | Becomes (per project) |
|---|---|---|
| **Call script & questions** | Any script, picked per call/campaign | The project's script — its questions ARE the research |
| **Form fields (data schema)** | `config/formSchema.json` (fixed) | Editable schema builder per project |
| **Consent line** | `CONSENT_LINE` in `.env` | Per-project consent text (+ on/off switch) |
| **Data-entry website** | `extension/profiles/mappings.json` (static file) | Per-project website URL + field mapping, served by the API |

The manager sets all four **when creating the project** (a setup wizard) or
changes them any time from **Project Settings**:

```
Manager → Project Settings (per project)
   ├── 1. SCRIPT       greeting + the research questions (each question linked
   │                    to a form field key — asked on the phone, lands in the form)
   ├── 2. FORM SCHEMA  the data-entry fields: key, label, type
   │                    (text / select / radio / number / date / textarea) + options
   ├── 3. CONSENT      the Egyptian-Arabic consent line for THIS project
   │                    + required yes/no toggle
   └── 4. DATA ENTRY   the external website URL + CSS-selector → field-key mapping
        ↓ everything downstream follows the project automatically
Call to a project contact
   → plays THIS project's consent line
   → asks THIS project's questions
        ↓ call completes
AI extraction uses THIS project's form schema
        ↓ human review (fields rendered from the project schema)
Approve → form payload validated against THIS project's schema
        ↓
Extension: draft response now carries the project's website URL + mapping
   → popup shows "Open data-entry site" for the right site
   → filler uses the project mapping (static mappings.json = fallback only)
        ↓
Insights (Phase 5) aggregate answers using THIS project's schema keys
```

> Existing single-project installs keep working: any project without custom
> settings falls back to the old global defaults (global schema file, `.env`
> consent line, static extension mapping).

---

## New Files to Add

```
backend/
└── src/
    └── services/
        └── projectConfigService.js   ← ★ resolve per-project config with global
                                          fallbacks; schema validation helpers

frontend/
└── src/
    └── pages/
        └── ProjectSettingsPage.jsx   ← ★ 4-tab settings editor + creation wizard
```

**Modified existing files:**

| File | Change |
|---|---|
| `backend/src/models/Project.js` | Add `script` ref, `formSchema` (embedded fields), `consent { line, required }`, `dataEntry { websiteUrl, fieldMappings }` |
| `backend/src/models/DataEntryDraft.js` | Add `project` ref (set at draft creation — faster queries, correct schema lookup) |
| `backend/src/routes/projects.js` | `GET/PUT /api/projects/:id/settings` — script, schema, consent, data-entry config |
| `backend/src/routes/twilio.js` | Consent gate resolves the line from the contact's project (env fallback) |
| `backend/src/queues/callWorker.js` | Campaign calls use the project script + consent automatically |
| `backend/src/services/dataEntryService.js` | `generateDraft` / `buildFormPayload` use the project's schema (global file fallback) |
| `backend/src/services/projectService.js` | Insights answer-aggregation reads the project schema, not the global file |
| `backend/src/routes/extension.js` | Draft responses include `{ websiteUrl, fieldMappings }` of the draft's project |
| `extension/popup/popup.js` | "Open data-entry site" button; prefer the API-served mapping over `mappings.json` |
| `frontend/src/pages/ProjectsPage.jsx` | ⚙️ Settings link per project; creation flow offers the setup wizard |
| `frontend/src/pages/DataEntryReviewPage.jsx` | Render review fields from the draft's project schema |
| `frontend/src/App.jsx` | Route `/projects/:id/settings` |
| `frontend/src/services/api.js` | `getProjectSettings` / `updateProjectSettings` helpers |

**No new dependencies. No new environment variables** — the old globals
(`CONSENT_LINE`, `config/formSchema.json`, `mappings.json`) become fallbacks.

---

## Feature 1: Project Data Model

### `Project.js` additions (skeleton)

```js
{
  // ── Phase 6: per-project configuration ──
  script: { type: ObjectId, ref: 'Script' },        // THIS project's call script

  // The data-entry fields (same shape as config/formSchema.json)
  formSchema: {
    fields: [{
      key:     String,                               // e.g. "aware_of_drug"
      label:   String,                               // "Aware of drug?"
      type:    { type: String,
                 enum: ['text','select','radio','number','date','textarea'] },
      options: [String],                             // for select / radio
      format:  String,                               // e.g. "YYYY-MM-DD"
      source:  String,                               // 'transcript' | 'contact.name' | 'call.leadScore' …
    }],
  },

  consent: {
    line:     String,                                // Egyptian-Arabic consent question
    required: { type: Boolean, default: true },
  },

  dataEntry: {
    websiteUrl:    String,                           // the external form's URL
    fieldMappings: mongoose.Schema.Types.Mixed,      // { "input[name='x']": "field_key" }
  },
}
```

### `projectConfigService.js` — one resolver, used everywhere

```js
// Resolve the effective config for a contact/callLog/draft, walking:
//   contact.project → project settings → GLOBAL FALLBACKS
async function configForContact(contactId) {
  return {
    script:        project?.script        || null,                    // caller decides default
    formSchema:    project?.formSchema?.fields?.length
                     ? project.formSchema
                     : require('../config/formSchema.json'),          // global file
    consentLine:   project?.consent?.line || process.env.CONSENT_LINE,
    consentRequired: project?.consent?.required ?? (process.env.CONSENT_REQUIRED === 'true'),
    dataEntry:     project?.dataEntry     || null,                    // extension falls back to mappings.json
  };
}
```

Also exports `validateFormSchema(fields)` — key uniqueness, snake_case keys,
select/radio must have ≥ 2 options, at least one field — used by the settings
route **and** the frontend builder (same rules, no drift).

---

## Feature 2: Script & Questions per Project

- The Scripts page (Phase 1) still owns script editing — Phase 6 just **binds
  one script to the project** and adds an inline "create from template" in the
  wizard (template = one question per `transcript`-sourced schema field, so
  the questions and the form stay in sync).
- Each script question keeps a `questionKey`; Phase 6 requires it to match a
  schema field key — that's the thread from *asked on the phone* → *extracted*
  → *reviewed* → *filled in the form*. The settings page shows a live
  **coverage check**: schema fields with no matching question are flagged.
- Call paths (`routes/twilio.js` single calls, `queues/callWorker.js`
  campaigns): when a contact belongs to a project with a script, that script
  is used automatically; explicitly choosing another script is still allowed
  for ad-hoc calls.

---

## Feature 3: Form Schema Builder

`ProjectSettingsPage.jsx`, tab **"Form Fields"**:

- Table of fields: drag order · key · label · type dropdown · options editor
  (chips) · source (transcript / contact / call) · delete
- "Add field" + "Start from the global template" (copies
  `config/formSchema.json` as the editable starting point)
- Validation before save (mirrors `validateFormSchema`): duplicate keys,
  empty options on select/radio, invalid key characters — inline errors
- **Change safety**: editing the schema only affects **future drafts**.
  Existing drafts keep the schema snapshot they were extracted with (the
  draft's `fields` object is already self-contained), so review of old drafts
  never breaks. A warning banner appears if pending drafts exist.

Downstream (all resolved through `projectConfigService`):

- `dataEntryService.generateDraft` — extraction prompt lists the project's
  fields, `resolveSource` runs on the project schema
- `dataEntryService.buildFormPayload` — validation against the project schema
- `DataEntryReviewPage` — renders inputs from the draft's project schema
  (types, options, labels), amber highlights unchanged
- `projectService.buildInsightsDataset` — answer distributions built from the
  project's select/radio keys

---

## Feature 4: Consent per Project

- Settings tab **"Consent"**: the consent line (Egyptian Arabic, free text)
  + **"Consent required"** toggle + live preview of the exact TwiML `<Say>` text
- `routes/twilio.js` consent gate:
  ```
  contact → project → consent.line   (fallback: CONSENT_LINE env)
                    → consent.required (fallback: CONSENT_REQUIRED env)
  ```
  If `required = false` for the project, the gate is skipped entirely for its
  contacts (recording still obeys `RECORD_CALLS`).
- `consent.json` archived to Drive (Phase 4) already stores the exact line
  played — with per-project lines this now varies per call, which is exactly
  what the compliance evidence needs. `detectConsent()` (yes/no regex) is
  language-level, not project-level — unchanged.

---

## Feature 5: Data-Entry Website per Project

### Settings tab **"Data Entry"**

- **Website URL** — where the reps type the results for this project
- **Field mapping table**: CSS selector ↔ schema field key (dropdown of the
  project's own fields, so you can't map to a nonexistent key)
- "Test on the site" tip: open the site → extension popup → **Fill** with any
  approved draft → unmatched fields glow amber → adjust selectors → save

### Extension changes (small)

`GET /api/extension/drafts/:id` response grows:

```json
{
  "id": "…",
  "name": "Dr. Ahmed",
  "formPayload": { "doctor_name": "…" },
  "dataEntry": {
    "websiteUrl": "https://crm.example.com/new-entry",
    "fieldMappings": { "input[name='doctor_name']": "doctor_name" }
  }
}
```

`popup.js`:
- Shows **🌐 Open site** per draft (opens `websiteUrl` in a new tab) — reps no
  longer need to remember which site belongs to which project
- On **Fill**: uses `dataEntry.fieldMappings` from the API when present;
  `profiles/mappings.json` and the label-match fallback remain as backup
- `filler.js` is unchanged — it already accepts any profile object

The list endpoint (`/drafts`) also returns each draft's project name so reps
working multiple projects can tell drafts apart.

---

## Feature 6: Setup Wizard & Settings Page

### Creation wizard (ProjectsPage)

Creating a project now opens a 4-step wizard (all steps skippable — defaults
apply until changed):

```
1. Basics     name + targets                      (Phase 5 fields)
2. Form       schema builder (or copy global template)
3. Script     pick existing / generate from schema template
4. Data entry consent line + website URL + mapping
```

### `ProjectSettingsPage.jsx` (`/projects/:id/settings`)

Same four sections as tabs, editable any time. Header shows the project's
"readiness" checklist:

```
✅ Script linked (8 questions, all schema fields covered)
✅ Form schema (11 fields)
⚠️ Consent line not set — using the global default
❌ Data-entry website not configured — extension will use label-matching
```

### API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/projects/:id/settings` | Full settings + readiness + effective (resolved) config |
| PUT | `/api/projects/:id/settings` | Partial update: `{ script?, formSchema?, consent?, dataEntry? }` — schema changes validated server-side |

Both manager-only (`requireManager` + ownership), same guards as Phase 5.

---

## Setup Steps

1. Pull changes, restart backend — **no installs, no new env vars**
2. Open **المشاريع** → ⚙️ on a project (or create a new one → wizard)
3. **Form Fields** tab → "Start from the global template" → adjust → save
4. **Script** tab → generate from schema (or pick an existing script) → tweak wording
5. **Consent** tab → write this project's consent line
6. **Data Entry** tab → paste the website URL → map selectors to fields
7. Call a project contact → verify the new consent line and questions play
8. Complete the flow → review page shows the project's fields → approve →
   extension popup shows **🌐 Open site** → Fill → selectors hit

---

## Phase 6 Checklist

- [ ] `Project.js`: `script`, `formSchema`, `consent`, `dataEntry` fields
- [ ] `DataEntryDraft.js`: `project` ref, set in `generateDraft`
- [ ] `projectConfigService.js`: resolver with global fallbacks + `validateFormSchema`
- [ ] Settings endpoints in `projects.js` (GET returns readiness; PUT validates)
- [ ] Consent gate + call paths resolve script/consent via the contact's project
- [ ] `dataEntryService` + insights use the project schema
- [ ] Extension: draft responses carry `dataEntry`; popup "Open site" + API-mapping priority
- [ ] `ProjectSettingsPage.jsx` (4 tabs + readiness) + wizard entry from ProjectsPage
- [ ] `DataEntryReviewPage.jsx` renders from the project schema
- [ ] Test: two projects with different consent lines → each contact hears their own
- [ ] Test: different schemas → drafts/review/payload/extension all follow the project
- [ ] Test: project with NO custom settings behaves exactly like Phase 5 (fallbacks)
- [ ] Test: schema edit doesn't break pending drafts from the old schema

---

## Notes & Boundaries

- **Fallback-first**: every per-project setting is optional; missing = global
  behavior. Nothing existing breaks on upgrade
- **Schema snapshots**: drafts carry their extracted `fields` object, so
  historical data survives schema edits; only *new* extractions use the new schema
- **Extension security unchanged**: still API-key-only, still approved drafts
  only — the mapping/URL it receives is config, not data
- **Script ↔ schema coverage** is a warning, not a hard block: some fields are
  DB-sourced (`contact.name`, `call.leadScore`) and never need a question

---

## Phase 7 Preview (what comes next)

- **Fine-tuned TTS** — your own voice, Egyptian dialect
- **Call scheduling** — office hours, automatic no-answer retries
- **Private Google Sheets** via the Phase 4 Drive OAuth integration + live write-back
- **Extension v2** — visual point-and-click mapper (click a field on the site,
  pick the schema key — no CSS selectors by hand)
