# MedCall AI — Phase 4 Implementation Guide

## What Phase 4 Delivers

**Compliance archive + zero-typing data entry** — every call is fully recorded
with explicit consent, archived to your team's Google Drive, and a Chrome
extension lets reps fill any external CRM / data-entry form with one click:

```
Call starts (Phase 1/2 pipeline)
        ↓
   Consent line played first: "This call is recorded for quality purposes…"
        ↓
   Contact's YES / NO captured → consent clip + verdict saved
        ↓  (NO → polite goodbye, call ends, contact flagged no-consent)
   Full call recorded by Twilio (dual-channel)
        ↓ call completes
   Recording MP3 + consent.json + transcript.txt
        ↓ auto-upload (background, retried via Bull queue)
Google Drive:  MedCall Recordings / <Campaign> / <YYYY-MM-DD> / <Contact – CallSid> /
   ├── recording.mp3
   ├── consent.json        (verdict, timestamp, consent audio clip link)
   └── transcript.txt
        ↓ Drive links saved on the CallLog (visible in dashboard)

Data Entry Pipeline (human-in-the-loop)
        ↓ call completes
   Call audio → text (transcript, Phase 1 ASR)
        ↓
   AI extracts the data-entry fields from the transcript
   (name, phone, specialty, city, answers, lead score, notes…)
        ↓
   Draft file generated:  data-entry.json  (+ copy archived to Drive)
        ↓
   Review page in the dashboard: human sees transcript side-by-side with
   the extracted fields → edits any field → ✅ Approve  or  ❌ Reject
        ↓ only APPROVED drafts continue
   AI Form Formatter: approved data → form-payload.json
   (keys/values match the ONE fixed form schema — same questions on every
    call and every form — dropdown options, dates, yes/no all normalized)
        ↓
Chrome Extension (MedCall Filler)
        ↓ rep opens the CRM / govt portal / data-entry site
   Popup lists approved drafts → pick one → "Fill this page"
        ↓
   Content script fills the form fields using a per-site field mapping
   profile → rep submits the form → draft marked as ENTERED
```

> The app, dashboard, and extension are in **English**. Only the AI voice on
> the phone speaks Egyptian Arabic (the consent line included).

---

## New Files to Add

```
backend/
└── src/
    ├── config/
    │   └── formSchema.json         ← ★ THE fixed form: every question/field, type, options
    ├── models/
    │   └── DataEntryDraft.js       ← ★ extracted fields + review status + audit trail
    ├── services/
    │   ├── driveService.js         ← ★ Google Drive upload (service account)
    │   ├── consentService.js       ← ★ consent detection + consent.json builder
    │   └── dataEntryService.js     ← ★ transcript → structured draft (Gemini extraction)
    ├── queues/
    │   └── uploadQueue.js          ← Bull queue: retryable Drive uploads
    ├── routes/
    │   ├── recordings.js           ← list/replay recordings, Drive links, re-upload
    │   ├── dataEntry.js            ← ★ drafts list / edit / approve / reject
    │   └── extension.js            ← ★ API used by the Chrome extension
    └── middleware/
        └── extensionAuth.js        ← API-key auth for the extension (no cookies)

frontend/
└── src/
    └── pages/
        └── DataEntryReviewPage.jsx ← ★ transcript vs. extracted fields, edit + approve

extension/                          ← ★ new top-level folder (Manifest V3)
├── manifest.json
├── popup/
│   ├── popup.html
│   ├── popup.js                    ← login, search contacts/calls, trigger fill
│   └── popup.css
├── content/
│   └── filler.js                   ← content script: fills the active page's form
├── background.js                   ← service worker: API calls, messaging
└── profiles/
    └── mappings.json               ← per-site field selector profiles
```

**Modified existing files:**

| File | Change |
|---|---|
| `backend/src/routes/twilio.js` | Consent gate before greeting; `record: true` on outbound calls; recording callback → upload queue |
| `backend/src/queues/callWorker.js` | Same recording + consent options for campaign calls |
| `backend/src/models/CallLog.js` | Add `consent { given, verdictText, at }`, `drive { folderId, recordingUrl, consentUrl, transcriptUrl }` |
| `backend/src/models/Contact.js` | Add `recordingConsent` (`granted` / `denied` / `unknown`) — denied contacts are auto-skipped like DNC |
| `backend/src/services/callSession.js` | `_finalize()` enqueues the Drive upload job **and** generates the data-entry draft |
| `backend/src/index.js` | Register `/api/recordings`, `/api/data-entry` + `/api/extension` routes; CORS allowance for `chrome-extension://` origins |
| `frontend/src/pages/CallsPage.jsx` | Show ▶️ recording + 📁 Drive link per call |
| `frontend/src/App.jsx` | Add the **Data Entry Review** page to nav + router |

---

## New Environment Variables

Add to `backend/.env`:

```env
# ── Call Recording & Consent ──────────────────────────────────────────────────
RECORD_CALLS=true                       # master switch for full-call recording
CONSENT_REQUIRED=true                   # play consent line & require a YES
CONSENT_LINE=المكالمة دي بتتسجل لأغراض الجودة، موافق نكمل؟   # Egyptian Arabic consent question

# ── Google Drive ─────────────────────────────────────────────────────────────
GOOGLE_SERVICE_ACCOUNT_FILE=./secrets/medcall-drive-sa.json  # service account key
GDRIVE_ROOT_FOLDER_ID=xxxxxxxxxxxxxxxxx   # "MedCall Recordings" folder ID
GDRIVE_UPLOAD_RETRIES=3

# ── Data Entry Drafts ────────────────────────────────────────────────────────
DRAFT_AUTO_GENERATE=true                # build a draft after every completed call
DRAFT_MODEL=gemini-2.0-flash            # extraction model (reuses GEMINI_API_KEY)

# ── Chrome Extension API ──────────────────────────────────────────────────────
EXTENSION_API_KEYS=key1,key2            # one key per rep (rotate anytime)
```

---

## Setup Steps

### 1. Install new dependencies

```bash
cd backend
npm install googleapis
```

(Bull/Redis is already installed from Phase 2 — the upload queue reuses it.)

### 2. Create the Google Drive service account

1. Go to **console.cloud.google.com** → create/select a project
2. Enable the **Google Drive API**
3. IAM & Admin → **Service Accounts** → Create → download the JSON key
4. Save it as `backend/secrets/medcall-drive-sa.json` (**gitignored**)
5. In Drive, create a folder **"MedCall Recordings"** and **share it with the
   service account's email** (Editor) — service accounts can only write to
   folders shared with them
6. Copy the folder ID from the URL into `GDRIVE_ROOT_FOLDER_ID`

### 3. Load the Chrome extension (dev mode)

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select the `extension/` folder
3. Open the popup → paste the backend URL + your `EXTENSION_API_KEY` → Save

### 4. Test the full loop

1. Make a call → AI asks the consent question first
2. Say "أيوه موافق" → call proceeds; say "لأ" → polite goodbye, contact flagged
3. When the call ends, check Drive: a new dated folder with `recording.mp3`,
   `consent.json`, `transcript.txt`, `data-entry.json`
4. Open the **Calls** page → the call row shows ▶️ and a 📁 Drive link
5. Open **Data Entry Review** → the new draft is *pending*: compare the
   extracted fields against the transcript, fix anything, **✅ Approve**
6. Open the data-entry website → extension popup → the approved draft is
   listed → **Fill this page** → verify → submit → **Mark as entered**

---

## Feature 1: Consent Gate

### Flow change in `routes/twilio.js`

The greeting TwiML now plays the consent line **before** the Phase 1 greeting
and records the answer to a new endpoint:

```
GET /twiml/greeting       → <Play consent line> + <Record action="/twiml/consent">
POST /twiml/consent       → ASR the answer → consentService.detectConsent(text)
      YES  → save consent, continue to the normal greeting + question loop
      NO   → <Play polite goodbye> + <Hangup/>, contact.recordingConsent = 'denied'
      unclear → re-ask once, then treat as NO
```

### `backend/src/services/consentService.js` (skeleton)

```js
// Detects a yes/no in Egyptian Arabic transcripts.
const YES = /(أيوه|ايوه|موافق|تمام|اوك|ماشي|طبعا|اتفضل)/;
const NO  = /(لأ|لا|مش موافق|رافض|ما ينفعش)/;

function detectConsent(text) {
  if (NO.test(text))  return 'denied';    // NO wins over YES ("لأ مش موافق")
  if (YES.test(text)) return 'granted';
  return 'unknown';
}

function buildConsentRecord({ callSid, contact, verdict, transcriptLine }) {
  return {
    callSid,
    contactName:  contact.name,
    contactPhone: contact.phone,
    verdict,                       // granted | denied
    verbatim:     transcriptLine,  // what the contact actually said
    consentLine:  process.env.CONSENT_LINE,
    recordedAt:   new Date().toISOString(),
  };
}

module.exports = { detectConsent, buildConsentRecord };
```

Contacts with `recordingConsent: 'denied'` are **skipped by the campaign
worker** exactly like DNC contacts — consent is asked once, remembered forever
(until manually reset).

---

## Feature 2: Full-Call Recording

Change `record: false` → dual-channel recording on both call paths
(`routes/twilio.js` single calls + `queues/callWorker.js` campaigns):

```js
record: process.env.RECORD_CALLS === 'true',
recordingChannels: 'dual',            // AI on one channel, contact on the other
recordingStatusCallback: `${BASE_URL()}/api/twilio/recording-complete`,
recordingStatusCallbackEvent: ['completed'],
```

New webhook `POST /api/twilio/recording-complete` saves `recordingUrl` on the
CallLog and enqueues the Drive upload job. (The existing per-turn `<Record>`
flow for ASR is untouched — this is a second, whole-call recording.)

---

## Feature 3: Google Drive Archival

### `backend/src/services/driveService.js` (skeleton)

```js
const { google } = require('googleapis');

const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE,
  scopes: ['https://www.googleapis.com/auth/drive.file'],
});
const drive = google.drive({ version: 'v3', auth });

// Find-or-create:  root / <Campaign name or "Single Calls"> / <YYYY-MM-DD> / <Contact – CallSid>
async function ensureCallFolder({ campaignName, contactName, callSid }) { /* ... */ }

async function uploadBuffer(folderId, name, mimeType, buffer) {
  const res = await drive.files.create({
    requestBody: { name, parents: [folderId] },
    media: { mimeType, body: bufferToStream(buffer) },
    fields: 'id, webViewLink',
  });
  return res.data;   // { id, webViewLink }
}

async function archiveCall(callLog) {
  // 1. download recording MP3 from Twilio (basic auth, same as callSession)
  // 2. build consent.json via consentService.buildConsentRecord
  // 3. build transcript.txt from callLog.transcript
  // 4. upload all three → save links on callLog.drive
}

module.exports = { archiveCall };
```

### `backend/src/queues/uploadQueue.js`

A tiny Bull queue (`drive-uploads`) so uploads survive crashes and Twilio's
recording delay — jobs retry `GDRIVE_UPLOAD_RETRIES` times with backoff.
`callSession._finalize()` and the `recording-complete` webhook both just
`uploadQueue.add({ callLogId })`; the worker calls `archiveCall()`.

### `backend/src/routes/recordings.js`

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/recordings` | List calls with recording + Drive links |
| GET | `/api/recordings/:callId/stream` | Proxy-stream the MP3 (dashboard player) |
| POST | `/api/recordings/:callId/reupload` | Re-run a failed Drive upload |

---

## Feature 4: Data Entry Draft + Human Review

The heart of the pipeline: **no data reaches an external website without a
human approving it first.**

### Draft generation (`backend/src/services/dataEntryService.js`)

After every completed call, `_finalize()` calls `generateDraft(callLog)`:

1. Takes the **transcript** (call already converted to text by the Phase 1 ASR)
2. Sends it to Gemini with the target field schema — extraction only, no
   invention: any field not clearly stated in the transcript stays empty and
   is flagged `needsReview`
3. Saves a `DataEntryDraft` document **and** writes `data-entry.json` into the
   same Drive folder as the recording (audit copy)

### `backend/src/models/DataEntryDraft.js` (skeleton)

```js
const draftSchema = new mongoose.Schema({
  call:     { type: ObjectId, ref: 'CallLog', required: true },
  contact:  { type: ObjectId, ref: 'Contact', required: true },

  // Extracted fields — the payload the extension will eventually fill
  fields: {
    name:       String,
    phone:      String,
    specialty:  String,
    city:       String,
    leadScore:  Number,
    leadLabel:  String,
    answers:    mongoose.Schema.Types.Mixed,   // per-question extractions
    notes:      String,                        // AI summary of the call
    recordingLink: String,                     // Drive link (evidence)
  },
  needsReview: [String],       // field keys the AI wasn't sure about

  // Human-in-the-loop review
  status:     { type: String,
                enum: ['pending', 'approved', 'rejected', 'entered'],
                default: 'pending' },
  reviewedBy: { type: ObjectId, ref: 'User' },
  reviewedAt: Date,
  edits:      [{ field: String, from: String, to: String, at: Date }],  // audit trail

  // Built by the AI Form Formatter ON APPROVAL — the exact JSON the
  // extension fills, keyed by formSchema.json field keys
  formPayload: mongoose.Schema.Types.Mixed,

  enteredAt:  Date,            // when the extension confirmed the form was filled
}, { timestamps: true });
```

### The fixed form schema (`backend/src/config/formSchema.json`)

Because **every call asks the same questions and every data-entry form has the
same fields**, the whole pipeline is driven by one schema file — the call
script questions, the AI extraction, the review page, the payload formatter,
and the extension selectors all share these keys:

```json
{
  "fields": [
    { "key": "doctor_name",   "label": "Doctor Name",   "type": "text" },
    { "key": "phone",         "label": "Phone",         "type": "text",
      "format": "+20XXXXXXXXXX" },
    { "key": "specialty",     "label": "Specialty",     "type": "select",
      "options": ["cardiology", "dermatology", "internal_medicine", "other"] },
    { "key": "city",          "label": "City",          "type": "select",
      "options": ["Cairo", "Giza", "Alexandria", "Other"] },
    { "key": "aware_of_drug", "label": "Aware of drug?","type": "radio",
      "options": ["yes", "no"] },
    { "key": "prescribing",   "label": "Prescribing frequency", "type": "select",
      "options": ["never", "rarely", "sometimes", "often"] },
    { "key": "interested",    "label": "Interested in samples?", "type": "radio",
      "options": ["yes", "no"] },
    { "key": "lead_score",    "label": "Lead Score",    "type": "number" },
    { "key": "notes",         "label": "Notes",         "type": "textarea" },
    { "key": "call_date",     "label": "Call Date",     "type": "date",
      "format": "YYYY-MM-DD" },
    { "key": "recording_link","label": "Recording Link","type": "text" }
  ]
}
```

### Post-approval: the AI Form Formatter (`dataEntryService.buildFormPayload`)

Fires automatically inside `POST /api/data-entry/:id/approve`:

1. Takes the **human-approved** fields + answers (never the raw AI draft)
2. Gemini maps them onto `formSchema.json` — for every field it must return a
   value that is **valid for that field's type**:
   - `select` / `radio` → one of the allowed `options`, exactly
     ("بوصفه كتير" → `"often"`, "أيوه عارفه" → `"yes"`)
   - `date` → the declared format; `number` → numeric; free text passed through
   - anything it can't map confidently → `null` (the extension skips it,
     highlights it for the rep)
3. Output is validated against the schema in code (type + options check) —
   if validation fails, the formatter retries once, then the draft is flagged
   instead of shipping bad data
4. Saved as `formPayload` on the draft **and** archived as `form-payload.json`
   in the call's Drive folder

```js
// dataEntryService.js (skeleton)
async function buildFormPayload(draft) {
  const schema = require('../config/formSchema.json');
  const payload = await geminiFormat({          // strict JSON-only prompt
    schema, approvedFields: draft.fields, answers: draft.fields.answers,
  });
  const { valid, errors } = validateAgainstSchema(payload, schema);
  if (!valid) throw new Error(`Payload validation failed: ${errors.join(', ')}`);
  return payload;   // e.g. { doctor_name: "Dr. Ahmed", specialty: "cardiology", aware_of_drug: "yes", ... }
}
```

### Review page (`frontend/src/pages/DataEntryReviewPage.jsx`)

- Split view: **transcript on the right, extracted fields on the left** —
  reviewer verifies each value against what was actually said
- Fields flagged `needsReview` are highlighted amber
- Every field is **editable inline**; edits are recorded in the audit trail
- ▶️ inline audio player (the Drive recording) for spot-checking
- **✅ Approve** → draft becomes available in the extension
- **❌ Reject** → draft archived with a reason, never leaves the system
- Filter tabs: Pending / Approved / Entered / Rejected

### `backend/src/routes/dataEntry.js`

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/data-entry` | List drafts (filter by status) |
| GET | `/api/data-entry/:id` | Draft + transcript + recording link |
| PUT | `/api/data-entry/:id` | Edit extracted fields (audit-logged) |
| POST | `/api/data-entry/:id/approve` | Mark approved → visible to extension |
| POST | `/api/data-entry/:id/reject` | Archive with reason |
| POST | `/api/data-entry/:id/regenerate` | Re-run AI extraction on the transcript |

---

## Feature 5: Chrome Extension (MedCall Filler)

### How it works

```
popup.js ──(API key)──> backend /api/extension/drafts   (approved only)
                          ← list of approved, not-yet-entered drafts
popup.js ──pick draft, "Fill this page"──> background.js ──message──> content/filler.js
                                                    ↓
                              loads the form profile from profiles/mappings.json
                                                    ↓
                              document.querySelector(selector).value = draft.formPayload[key]
                              + dispatch 'input'/'change' events (React-safe)
                                                    ↓
                              rep verifies + submits the form manually
                                                    ↓
popup.js ──"Mark as entered"──> POST /api/extension/drafts/:id/entered
```

> The extension can **only see approved drafts** — pending, rejected, and raw
> call data are never exposed to it. The rep still presses the website's own
> submit button; the extension types, it never submits.

### `extension/manifest.json` (skeleton)

```json
{
  "manifest_version": 3,
  "name": "MedCall Filler",
  "version": "1.0.0",
  "description": "Fill data-entry forms with MedCall call results in one click.",
  "permissions": ["activeTab", "scripting", "storage"],
  "host_permissions": ["<all_urls>"],
  "action": { "default_popup": "popup/popup.html" },
  "background": { "service_worker": "background.js" }
}
```

### `extension/profiles/mappings.json`

Because the data-entry form is **always the same form**, there's exactly one
profile to maintain: CSS selector → `formSchema.json` key. Map it once, done.

```json
{
  "dataentry.example.com": {
    "fields": {
      "input[name='doctor_name']":    "doctor_name",
      "input[name='phone']":          "phone",
      "select[name='specialty']":     "specialty",
      "select[name='city']":          "city",
      "input[name='aware'][value='yes']":  "aware_of_drug",
      "select[name='prescribing']":   "prescribing",
      "input[name='interested'][value='yes']": "interested",
      "input[name='lead_score']":     "lead_score",
      "textarea[name='notes']":       "notes",
      "input[name='call_date']":      "call_date",
      "input[name='recording_link']": "recording_link"
    }
  }
}
```

Fill behavior in `filler.js`:

- `select` → picks the `<option>` whose value/text matches the payload value
  (the AI formatter already normalized it to a legal option, so this always hits)
- `radio` → checks the radio whose `value` matches (`yes` / `no`)
- `null` payload values → skipped and outlined in amber so the rep fills them
  manually
- Every filled element is briefly highlighted green — the rep sees exactly
  what was touched before submitting

### Backend: `routes/extension.js` + `middleware/extensionAuth.js`

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/extension/ping` | Validate the API key (popup "Connected ✅") |
| GET | `/api/extension/drafts` | List **approved** drafts pending data entry (search by name/phone) |
| GET | `/api/extension/drafts/:id` | Full fill payload for one approved draft |
| POST | `/api/extension/drafts/:id/entered` | Mark the draft as entered after the rep submits the form |

Auth is a static API key (`x-api-key` header) checked against
`EXTENSION_API_KEYS` — deliberately separate from JWT so revoking a rep's key
never touches dashboard logins. CORS: allow `chrome-extension://*` origins on
these routes only.

---

## Phase 4 Checklist

- [ ] Create Google Cloud project, enable Drive API, download service account key
- [ ] Share the "MedCall Recordings" Drive folder with the service account email
- [ ] `npm install googleapis` + add new env vars
- [ ] Add `consent` + `drive` fields to `CallLog.js`, `recordingConsent` to `Contact.js`
- [ ] Build `consentService.js` + consent gate in `twilio.js` (`/twiml/consent`)
- [ ] Enable full-call recording on both call paths + `recording-complete` webhook
- [ ] Build `driveService.js` + `uploadQueue.js`, hook into `_finalize()`
- [ ] Build `recordings.js` route + recording player/links on the Calls page
- [ ] Write `formSchema.json` — the one fixed form (mirror the call script questions)
- [ ] Build `DataEntryDraft.js` model + `dataEntryService.js` (transcript → draft)
- [ ] Hook draft generation into `_finalize()` + archive `data-entry.json` to Drive
- [ ] Build `dataEntry.js` routes + `DataEntryReviewPage.jsx` (edit, approve, reject)
- [ ] Build `buildFormPayload()` — AI formats approved data → validated `formPayload` JSON on approve
- [ ] Build `extension.js` route + `extensionAuth.js` middleware + CORS rule
- [ ] Build the extension: manifest, popup (approved drafts list), background, filler, mappings profile
- [ ] Test: consent YES → Drive folder appears; consent NO → call ends + contact flagged
- [ ] Test: call → draft pending → edit a field → approve → fill a real form → mark entered
- [ ] Test: rejected draft never appears in the extension

---

## Compliance Notes

- **Consent is stored as evidence**: verdict + the contact's verbatim words +
  timestamp + the exact consent line played, all inside `consent.json` next to
  the recording it authorizes
- **Denied = never recorded**: on a NO, the Twilio recording is deleted via the
  API before the goodbye finishes, and nothing is uploaded
- Keep the service account key in `backend/secrets/` (gitignored) — never
  commit it
- Drive access uses the `drive.file` scope: the service account can only touch
  files/folders it created or was explicitly given

---

## Phase 5 Preview (what comes next)

- **Fine-tuned TTS** — upload your own voice recordings, fine-tune on Egyptian dialect
- **Improved ASR** — domain-specific vocabulary for drug names
- **Call scheduling** — respect office hours, retry no-answers automatically
- **Extension v2** — screenshot-based field detection for canvas/PDF forms,
  bulk-fill queue for back-to-back data entry
