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
| **Data-entry website** | `extension/profiles/mappings.json` (static file) | Common project website + field mapping, with each doctor's unique entry link |

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
    └── 4. DATA ENTRY   the common website URL + CSS-selector → field-key mapping;
                  each successful doctor also gets a unique entry URL
        ↓ everything downstream follows the project automatically
Call to a project contact
   → plays THIS project's consent line
   → asks THIS project's questions
        ↓ call completes
AI extraction uses THIS project's form schema
        ↓ human review (fields rendered from the project schema)
Approve → form payload validated against THIS project's schema
        ↓
Extension: draft response now carries the doctor's unique entry URL when available
  → popup shows "Open data-entry site" for the right doctor
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
| `backend/src/models/Contact.js` | Add the per-doctor `dataEntryUrl`, source/status metadata, and received date |
| `backend/src/models/DataEntryDraft.js` | Add `project` ref (set at draft creation — faster queries, correct schema lookup) |
| `backend/src/routes/projects.js` | `GET/PUT /api/projects/:id/settings` — script, schema, consent, data-entry config |
| `backend/src/routes/twilio.js` | Consent gate resolves the line from the contact's project (env fallback) |
| `backend/src/queues/callWorker.js` | Campaign calls use the project script + consent automatically |
| `backend/src/services/dataEntryService.js` | `generateDraft` / `buildFormPayload` use the project's schema (global file fallback) |
| `backend/src/services/projectService.js` | Insights answer-aggregation reads the project schema, not the global file |
| `backend/src/routes/extension.js` | Draft responses include `{ websiteUrl, fieldMappings }` of the draft's project |
| `backend/src/routes/excel.js` | Integrate the valid-doctors sheet; match rows to Contacts and accept data-entry URLs when they arrive later |
| `backend/src/services/excelService.js` | Keep master-sheet sync separate from successful-doctor link imports |
| `backend/src/routes/contacts.js` | AI verification proposals and manager-approved contact changes |
| `backend/src/services/verificationAgent.js` | Online evidence search, source URLs, confidence, and duplicate-aware matching |
| `extension/popup/popup.js` | "Open data-entry site" button; prefer the API-served mapping over `mappings.json` |
| `frontend/src/pages/ProjectsPage.jsx` | ⚙️ Settings link per project; creation flow offers the setup wizard |
| `frontend/src/pages/ContactsPage.jsx` | "AI check online" action, proposed changes, and verification history |
| `frontend/src/pages/DataHubPage.jsx` | Data tab includes the Excel sheets integration |
| `frontend/src/pages/ExcelSyncPage.jsx` | One-button valid-doctors Excel integration and pending-change review |
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

### `Contact.js` additions for per-doctor data entry

```js
{
  dataEntryUrl:        String,  // unique link supplied for THIS doctor
  dataEntryStatus:     String,  // 'pending' | 'received' | 'completed' | 'missing'
  dataEntryReceivedAt: Date,
  dataEntrySourceRow:  Number,  // row in the successful-doctors sheet
}
```

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

- **Website URL** — the common website where the reps type the results for this project
- **Field mapping table**: CSS selector ↔ schema field key (dropdown of the
  project's own fields, so you can't map to a nonexistent key)
- The unique doctor URL is stored on the contact and is selected automatically
  when an approved draft is opened; the project website is the fallback when
  that doctor does not have a unique URL yet
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
    "websiteUrl": "https://crm.example.com/new-entry/doctor-123",
    "baseWebsiteUrl": "https://crm.example.com/new-entry",
    "fieldMappings": { "input[name='doctor_name']": "doctor_name" }
  }
}
```

`popup.js`:
- Shows **🌐 Open site** per draft (opens the doctor's unique `websiteUrl` in a
  new tab; falls back to `baseWebsiteUrl`) — reps no longer need to search for
  the correct link
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

## Feature 7: Requested Callback Scheduling

When a doctor cannot continue the call and asks to speak at another time, the
agent must be able to schedule a callback instead of ending the contact as
unresolved:

```text
Doctor asks for another time
   → agent captures the requested date and time (and timezone)
   → callback is added to the Calendar page for that doctor
   → callback remains visible as Scheduled
   → scheduler starts the call at the requested time
   → calendar entry and call log are updated with the outcome
```

### Calendar entry

Each requested callback stores:

- doctor/contact reference and project
- requested date, time, and timezone
- callback status: `scheduled`, `in-progress`, `completed`, `cancelled`, or
  `failed`
- the user who scheduled it and optional notes
- the linked call log once the callback is placed

The Calendar page must allow authorized users to view upcoming callbacks,
open the doctor's contact details, cancel or reschedule an entry, and see
whether the callback was completed. Past entries remain available for the
contact's call history.

### Calling behavior

- The requested time is interpreted in the timezone captured with the entry;
  the stored value is normalized for reliable scheduling.
- The system must not place the callback immediately after the doctor asks for
  another time.
- At the requested time, the scheduler queues the normal project call flow,
  including the project's script and consent settings.
- The callback is marked `in-progress` when dialing starts and is finalized
  after the call status callback completes.
- A failed or unanswered callback is recorded in the call log and remains
  visible for an authorized user to retry or reschedule.
- Duplicate active callbacks for the same contact and time should be rejected
  or clearly warned before saving.

### Acceptance tests

- Doctor requests another time → one scheduled entry appears on the Calendar
  page and no call is placed immediately.
- Callback time arrives → the correct doctor is called and the entry links to
  the resulting call log.
- Rescheduling or cancelling an entry prevents the old time from placing a
  call.
- The callback uses the contact's project script and consent configuration.
- A timezone conversion results in the call being placed at the doctor's
  requested local time.

---

## Feature 8: Two-Sheet Doctor and Data-Entry Workflow

The company provides two Excel sheets for the same project:

1. **Doctor call list** — the source list with the doctor data used to place
   calls: name, phone, specialty, clinic, city, and any other contact fields.
2. **Valid doctors sheet** — doctors approved for the project. Their unique
  data-entry links may arrive later in the same sheet or a later update.

All unique links point to the same data-entry website, but the path or token
is different for every doctor. The common website and field mapping belong to
the project; the unique link belongs to the contact.

### Import and matching rules

- The **Contacts** page is the doctor call list and contains the names, phones,
  specialty, clinic, and area used for calling.
- The Data page tab **Excel sheets** provides one button to integrate the
  **Valid doctors** Excel sheet.
- A valid doctor can be integrated before a data-entry link exists; the contact
  stays pending until a later sheet update supplies the link.
- Match rows using a stable identifier in this order: source contact ID or
  Excel row ID, normalized phone number, then a reviewed combination of name
  and clinic. Never match on an unreviewed name alone.
- Save a supplied unique URL on the matched contact as `dataEntryUrl`,
  together with its source row and received date. If no URL is supplied yet,
  keep the contact as `pending`.
- If a row is unmatched, duplicated, missing a URL, or matches multiple
  doctors, place it in a review queue and do not overwrite a contact silently.
- Re-importing the successful-doctors sheet is idempotent: the same doctor and
  link update the existing record rather than creating another contact.

### Data-entry behavior

- A doctor is eligible for data entry after the valid-doctors sheet is matched;
  the unique URL may be attached later.
- Approved drafts open the doctor's unique URL automatically when available;
  otherwise Review shows that the link is still pending.
- The shared project website is used only as a fallback when no unique URL has
  arrived yet; the extension must clearly show that the link is missing.
- The project's field mapping is reused for every doctor because all links use
  the same website. A changed mapping affects future fills, while approved
  historical drafts keep their payload snapshot.
- The contact page and Data Entry review page show the data-entry status:
  `pending`, `received`, `completed`, or `missing`.

### Acceptance tests

- A doctor from the call-list sheet can be matched to the same doctor in the
  successful-doctors sheet without creating a duplicate contact.
- Two doctors with different unique URLs open two different entry pages on the
  same website.
- An approved draft opens the matched doctor's URL, not only the common base
  website.
- A valid-doctor row with no match is visible for review and does not overwrite
  another doctor's link. A matched row without a URL remains pending.
- Re-importing the same sheet does not duplicate contacts or data-entry links.

---

## Feature 9: AI Doctor Data Verification and Discovery

Doctor information can become outdated, and a project may need more doctors
for a specialty or area. Phase 6 adds two manager actions that use online
research while keeping a human approval step before the sheet or call list is
changed.

### Verify existing doctor data

The Contacts page and Excel review page provide an **AI check online** action
for one doctor or a selected batch. The AI searches using the available
contact fields, such as name, specialty, clinic, city/area, phone, and website,
then returns:

- current candidate values for name, specialty, clinic, area, phone, and
  practice status
- source URLs, source titles, and the date each source was checked
- a confidence level and a result of `confirmed`, `changed`, `not found`, or
  `conflicting`
- a field-by-field proposed change, never a silent overwrite

The manager reviews the evidence and explicitly approves or rejects each
proposed change. Approved changes update the contact and the project source
sheet; rejected or unresolved changes remain in the verification history.
Existing Excel safeguards still apply: a changed phone, name, or clinic is a
pending change until approved.

### Find additional doctors

When a manager needs to fill a project target, specialty, or area, the project
page provides **Find doctors**. The manager enters:

- specialty or specialties
- city, district, or service area
- the number of doctors needed
- optional practice type, hospital, clinic, or language filters

The AI searches public sources and returns candidate doctors with the evidence
used, normalized contact fields, confidence, and possible duplicate matches.
Candidates are shown in a review list. The manager selects which candidates to
add to the project; only approved candidates become contacts and eligible call
targets. The system must never automatically call a discovered doctor or add a
candidate based only on an unverified name.

### Safety and duplicate rules

- Use public, relevant sources and retain source links with every result.
- Normalize Egyptian phone numbers before duplicate checks.
- Match against existing contacts by stable ID, normalized phone, then a
  reviewed combination of name, clinic, specialty, and area.
- Rate-limit searches and show the search time and query to the manager.
- Do not expose private data, bypass access controls, or treat search results
  as proof without manager approval.
- Every verification, proposal, approval, rejection, and imported candidate is
  auditable with the responsible manager and timestamp.

### Acceptance tests

- An outdated phone or clinic is found with source evidence and appears as a
  pending proposed change, not an automatic overwrite.
- A manager can approve one proposed field while rejecting another field from
  the same search.
- **Find doctors** for a specialty and area returns reviewable candidates with
  source links and confidence values.
- Approving a candidate adds one contact to the project without creating a
  duplicate or placing a call automatically.
- A candidate that matches an existing contact is flagged for review instead
  of being imported twice.

---

## Setup Steps

1. Pull changes, restart backend — **no installs, no new env vars**
2. Open **المشاريع** → ⚙️ on a project (or create a new one → wizard)
3. **Form Fields** tab → "Start from the global template" → adjust → save
4. **Script** tab → generate from schema (or pick an existing script) → tweak wording
5. **Consent** tab → write this project's consent line
6. **Data Entry** tab → paste the common website URL → map selectors to fields
7. Confirm the doctor call list is present in **Contacts**, then open **Data →
  Excel sheets** and click **Integrate valid doctors Excel sheet** → review
  unmatched rows and pending doctors
8. Use **AI check online** to review outdated doctor records and approve only
  verified changes
9. Use **Find doctors** when the project needs more doctors for a specialty or
  area → review and approve candidates
10. Call a project contact → verify the new consent line and questions play
11. Complete the flow → review page shows the project's fields → approve →
  extension popup opens that doctor's unique site link → Fill → selectors hit

---

## Phase 6 Checklist

- [ ] `Project.js`: `script`, `formSchema`, `consent`, `dataEntry` fields
- [ ] `DataEntryDraft.js`: `project` ref, set in `generateDraft`
- [ ] `Contact.js`: per-doctor data-entry URL, status, received date, and source row
- [ ] Valid-doctors Excel integration matches Contacts without duplicates
- [ ] Data-entry links can arrive later and appear in Data Entry Review
- [ ] AI check online verifies outdated doctor data with sources and manager approval
- [ ] AI doctor discovery searches by specialty and area without auto-adding or auto-calling
- [ ] Verification and discovery results retain confidence, sources, and audit history
- [ ] `projectConfigService.js`: resolver with global fallbacks + `validateFormSchema`
- [ ] Settings endpoints in `projects.js` (GET returns readiness; PUT validates)
- [ ] Consent gate + call paths resolve script/consent via the contact's project
- [ ] `dataEntryService` + insights use the project schema
- [ ] Extension: draft responses carry `dataEntry`; popup "Open site" + API-mapping priority
- [ ] `ProjectSettingsPage.jsx` (4 tabs + readiness) + wizard entry from ProjectsPage
- [ ] `DataEntryReviewPage.jsx` renders from the project schema
- [ ] Requested callback flow: doctor request → Calendar entry → scheduled call
- [ ] Calendar entries support timezone, status, cancellation, and rescheduling
- [ ] Scheduled callbacks link their result to the contact and call log
- [ ] Extension opens each doctor's unique data-entry URL with the shared project mapping
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
- **Private Google Sheets** via the Phase 4 Drive OAuth integration + live write-back
- **Extension v2** — visual point-and-click mapper (click a field on the site,
  pick the schema key — no CSS selectors by hand)
