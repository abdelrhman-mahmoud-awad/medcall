# MedCall AI — Phase 3 Implementation Guide

## What Phase 3 Delivers

**Excel as the source of truth** — the sheet your team already uses becomes both
the input and the output of the calling system, guarded by validation and an AI
verification agent:

```
Your Excel Sheet (contacts.xlsx)
        ↓ import (validated)
   Bad rows rejected + reported (invalid phone, duplicates, missing name)
        ↓
   Changed data (phone/address/name) → PENDING review, never overwritten silently
        ↓
   Gemini AI Agent googles the doctor → verdict: confirmed / contradicted / not found
        ↓
   You approve or reject each change with one click
        ↓
   Calls run (Phase 1/2 pipeline — AI speaks Egyptian Arabic on the phone)
        ↓ auto write-back after every call
Your Excel Sheet updated in place:
   Call Status | Lead Score | Label | Last Called | Answers | Summary
        ↓ on demand
   Full results workbook downloadable from the dashboard
```

> The app, dashboard, and all data are in **English**. Only the AI voice on the
> phone call speaks Egyptian Arabic.

---

## New Files Added

```
backend/
├── data/                           ← master sheet + uploads live here (gitignored)
├── src/
│   ├── models/
│   │   └── ContactChange.js        ← pending data changes + AI verdict fields
│   ├── services/
│   │   ├── excelService.js         ← ★ import, write-back to row, export
│   │   ├── validationService.js    ← ★ row validation + change detection
│   │   └── verificationAgent.js    ← ★ Gemini agent: verifies data online
│   ├── routes/
│   │   └── excel.js                ← upload / sync / download / changes / verify
│   └── scripts/
│       └── importExcel.js          ← CLI: one-shot import of an .xlsx file

frontend/
└── src/
    └── pages/
        └── ExcelSyncPage.jsx       ← ★ upload, review changes, AI verdicts, download
```

**Modified existing files:**

| File | Change |
|---|---|
| `backend/src/models/Contact.js` | Added `excelRow`, `excelFile`, `excelSynced` fields |
| `backend/src/services/callSession.js` | `_finalize()` now writes the call result back to the sheet |
| `backend/src/index.js` | Registered `/api/excel` routes |
| `frontend/src/App.jsx` | Added the **Excel Sync** page to nav + router |

---

## Setup Steps

### 1. Install dependencies (already done if you ran it with me)

```bash
cd backend
npm install exceljs multer
```

### 2. Add environment variables

Add to `backend/.env`:

```env
# ── Excel Sync ────────────────────────────────────────────────────────────────
EXCEL_FILE_PATH=./data/contacts.xlsx   # master sheet location (relative to backend/)
EXCEL_SHEET_NAME=Sheet1                # worksheet to read/write
EXCEL_AUTO_SYNC=true                   # write back after every completed call

# ── AI Verification Agent (reuses your existing GEMINI_API_KEY) ───────────────
VERIFY_AUTO=true                       # auto-verify every pending change with Gemini
VERIFY_MODEL=gemini-2.0-flash          # model with Google Search grounding support
```

### 3. Prepare your Excel sheet

Expected columns (header row = row 1):

| A: Name | B: Phone | C: Type | D: Specialty | E: City |
|---|---|---|---|---|
| Dr. Ahmed Mohamed | +201001234567 | physician | cardiology | Cairo |

Result columns **F–K** (Call Status, Lead Score, Lead Label, Last Called,
Answers, Summary) are added automatically on the first write-back — don't
create them yourself.

Place the file at `backend/data/contacts.xlsx`, or just upload it from the UI.

### 4. Import the contacts

**Option A — UI:** open the app → **Excel Sync** → 📤 Upload sheet

**Option B — CLI:**

```bash
cd backend
node src/scripts/importExcel.js            # uses EXCEL_FILE_PATH
node src/scripts/importExcel.js my.xlsx    # or an explicit file
```

Either way you get a report: imported / linked / skipped, rejected rows with
reasons, and how many data changes need review.

### 5. Test the full loop

1. Upload the sheet → contacts appear in **Contacts**
2. Make a call from **Call Center** (Phase 1 flow)
3. When the call ends, open `contacts.xlsx` → the doctor's row now shows
   status, score, colored lead label, date, answers, and a transcript summary
4. Edit a phone number in the sheet → re-upload → a **pending change** appears
   on the Excel Sync page with a Gemini verdict → Approve or Reject

---

## How Each Piece Works

### Import + Validation (`validationService.js`)

Every row goes through three gates before touching the database:

1. **Validation** — rejected with a per-row error report if:
   - phone is invalid (expects Egyptian mobiles; auto-normalizes
     `01…` / `20…` / `0020…` into `+20…` E.164 format)
   - name is missing
   - type isn't `physician` or `pharmacist`
   - the same phone appears twice inside the sheet
2. **Change detection** — if the contact already exists (matched by sheet row,
   then by phone) and its **phone, city, name, or specialty** differs, a
   *pending change* is created. The database is **never overwritten silently**.
3. **New contacts** are created, remembering their Excel row number for
   write-back later.

### AI Verification Agent (`verificationAgent.js`)

When a pending change is created (and `VERIFY_AUTO=true`), Gemini — with
**Google Search grounding** — searches medical directories (Vezeeta, DrBridge),
clinic websites, and Google Maps for the doctor, then saves a verdict on the
change:

| Verdict | Meaning |
|---|---|
| ✅ `confirmed` | Online sources support the NEW value — safe to approve |
| ⚠️ `contradicted` | Online sources support the OLD value or a different one |
| ❓ `not_found` | Nothing conclusive found online |

Each verdict includes a confidence (0–100), a short findings summary, and the
**source URLs** Gemini actually used. Verification is fire-and-forget: imports
finish instantly and verdicts appear as each check completes.

There's also a spot-check endpoint (`POST /api/excel/verify/:contactId`) to
verify any doctor on demand — it returns suggested corrections if the web
clearly shows different data.

> **The AI advises, you decide.** Approve/Reject stays a human click. If you
> later want automation, auto-approve inside `verifyChange()` when the verdict
> is `confirmed` with confidence ≥ 85.

### Write-back (`excelService.js` + `callSession.js`)

When a call finalizes, `_finalize()` calls `updateRowForCall()`, which opens
the sheet, finds the contact's original row, writes the six result columns,
  colors the lead label cell (🟡 warm / 🔵 cold), and saves the file in
place — your formatting is untouched. Failures (e.g. the file is open in
Excel) are logged but **never crash the call pipeline**.

### The Excel Sync page (`ExcelSyncPage.jsx`)

- **Status bar** — contacts total / linked / synced, auto-sync + AI toggle state
- **📤 Upload sheet** — import with instant validation report
- **🔄 Sync all results** — re-push every completed call (repair after manual sheet edits)
- **⬇️ Download report** — fresh workbook of all call logs
- **Rejected rows panel** — row number + reasons
- **Change review panel** — `old value → new value`, AI verdict badge
  (hover for findings + sources), 🔍 Verify online, ✅ Approve, ❌ Reject

---

## API Endpoints Added

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/excel/upload` | Upload sheet, make it master, validated import |
| POST | `/api/excel/sync` | Re-push all completed calls to the sheet |
| GET | `/api/excel/download` | Download full results workbook |
| GET | `/api/excel/status` | Sync health counters |
| GET | `/api/excel/changes` | Pending data changes |
| POST | `/api/excel/changes/:id/approve` | Apply new value to contact |
| POST | `/api/excel/changes/:id/reject` | Keep the old value |
| POST | `/api/excel/changes/:id/verify` | (Re)run Gemini verification |
| POST | `/api/excel/verify/:contactId` | Spot-check any contact online |

---

## Troubleshooting

**"EBUSY / cannot write file"**
→ The sheet is open in Excel. Close it — Windows locks open .xlsx files.
→ Auto-sync failures are logged but never crash the call pipeline.
→ Run 🔄 Sync all results afterwards to catch up.

**"Row updated is wrong / shifted"**
→ You inserted/deleted rows in the sheet manually. Re-upload (or re-run
  `importExcel.js`) to re-link contacts to their new row numbers.

**"Contact skipped: not linked to a sheet row"**
→ That contact was created via seed/API, not from Excel. It still appears in
  the downloaded report; only in-place row updates need a link.

**"Valid number rejected"**
→ The validator expects Egyptian mobiles (+2010/11/12/15 + 8 digits). For
  landlines or other countries, adjust `PHONE_RE` in `validationService.js`.

**"AI verdict is 'error' / no sources listed"**
→ Google Search grounding needs a Gemini 2.x model — check `VERIFY_MODEL`.
  On Gemini 1.5, switch the tool to `googleSearchRetrieval` in
  `verificationAgent.js`.
→ Empty sources means Gemini answered without live search — treat the verdict
  as low confidence.

**"Verification is slow on big uploads"**
→ By design: it runs in the background and badges appear as checks complete.
  Gemini free tier allows ~15 req/min — for hundreds of changes, queue them
  through the Phase 2 Bull queue or add a small delay.

---

## Phase 4 Preview (what comes next)

- **Fine-tuned TTS** — upload your own voice recordings, fine-tune on Egyptian dialect
- **Improved ASR** — domain-specific vocabulary for drug names
- **Call scheduling** — respect office hours, retry no-answers automatically
- **Google Sheets mode** — live cloud sheet instead of a local .xlsx file
