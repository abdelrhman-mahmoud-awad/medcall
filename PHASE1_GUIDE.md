# MedCall AI — Phase 1 Implementation Guide

## What Phase 1 Delivers

A **complete single-call pipeline** end-to-end:

```
Your Server → Twilio → Physician/Pharmacist's Phone
                ↓
         Azure TTS (Egyptian Arabic, ar-EG-SalmaNeural)
                ↓
     Contact speaks → Twilio records audio
                ↓
        OpenAI Whisper ASR (Arabic transcription)
                ↓
      GPT-4o Conversation LLM (follows your script)
                ↓
    Lead scored → saved to MongoDB → shown in dashboard
```

---

## New Files Added

```
backend/
├── src/
│   ├── index.js                    ← Express app entry point
│   ├── middleware/auth.js          ← JWT middleware
│   ├── models/
│   │   ├── User.js
│   │   ├── Contact.js
│   │   ├── CallLog.js              ← Full call record with transcript
│   │   └── Script.js              ← Drug call script model
│   ├── routes/
│   │   ├── auth.js
│   │   ├── contacts.js
│   │   ├── calls.js               ← Call logs + stats
│   │   ├── scripts.js             ← Script CRUD
│   │   └── twilio.js              ← ★ Core: call initiation + webhooks
│   ├── services/
│   │   ├── tts.js                 ← Azure TTS (Egyptian Arabic)
│   │   ├── asr.js                 ← Whisper speech-to-text
│   │   ├── conversationLLM.js     ← GPT-4o script driver
│   │   └── callSession.js         ← In-memory call state machine
│   └── scripts/
│       └── seedScript.js          ← Sample Augmentin script + test contacts
└── .env.example                   ← All required env vars

frontend/
└── src/
    ├── services/api.js            ← Axios client with JWT
    └── pages/CallCenterPage.jsx  ← ★ Call initiation + live log UI
```

---

## Setup Steps

### 1. Install dependencies

```bash
# From project root
npm run install-all
```

### 2. Configure backend environment

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` and fill in:

| Variable | Where to get it |
|---|---|
| `MONGO_URI` | Local MongoDB or MongoDB Atlas |
| `JWT_SECRET` | Any long random string |
| `TWILIO_ACCOUNT_SID` | [console.twilio.com](https://console.twilio.com) |
| `TWILIO_AUTH_TOKEN` | [console.twilio.com](https://console.twilio.com) |
| `TWILIO_NUMBER` | Your Twilio phone number |
| `BASE_URL` | Your public ngrok URL (see step 4) |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) |
| `AZURE_SPEECH_KEY` | Azure portal → Cognitive Services → Speech |
| `AZURE_SPEECH_REGION` | e.g. `eastus` |

### 3. Seed the database

```bash
cd backend
node src/scripts/seedScript.js
```

This creates:
- Sample Augmentin market research script (in Arabic)
- 3 test contacts (2 physicians + 1 pharmacist)

### 4. Expose backend for Twilio webhooks (development)

Twilio needs a public URL to POST recordings and status updates.
Use [ngrok](https://ngrok.com):

```bash
ngrok http 5000
```

Copy the `https://xxxx.ngrok.io` URL and set it as `BASE_URL` in your `.env`.

### 5. Start the servers

```bash
# From project root
npm run dev
```

- Frontend: http://localhost:5173
- Backend:  http://localhost:5000

### 6. Test the pipeline

1. Open http://localhost:5173 → Register → Login
2. Go to **مركز المكالمات** (Call Center)
3. Select a contact and the Augmentin script
4. Click **ابدأ المكالمة**
5. Your phone rings. Answer it. The AI speaks in Egyptian Arabic.
6. Respond naturally. The AI follows the script, transcribes your answers.
7. Watch the call log update in real time.

---

## How the Call Flow Works

```
1. You click "ابدأ المكالمة"
   └─ POST /api/twilio/call
      ├─ Fetch contact + script from MongoDB
      ├─ Pre-generate greeting audio (Azure TTS)
      ├─ Create CallLog (status: initiated)
      ├─ Create CallSession (in-memory state)
      └─ Twilio.calls.create() → phone rings

2. Contact answers
   └─ Twilio GETs /api/twilio/twiml/greeting
      └─ Returns TwiML: <Play> greeting MP3 + <Record>

3. Contact speaks
   └─ Twilio POSTs to /api/twilio/twiml/respond
      ├─ Download recording from Twilio
      ├─ Whisper transcribes Arabic audio → text
      ├─ GPT-4o processes turn → next question + extractions
      ├─ Azure TTS synthesizes response → MP3
      └─ Returns TwiML: <Play> response + <Record>
      (loop until END_CALL or ESCALATE)

4. Call ends
   └─ callSession._finalize()
      ├─ Score lead (0–100, cold/warm/hot)
      ├─ Save full transcript to CallLog
      └─ Update contact.callCount + lastCalledAt
```

---

## The Script Format

Scripts are stored in MongoDB and loaded per call. Each question has:

```json
{
  "key": "awareness",
  "text": "بتعرف دواء أوجمنتين وبتتعامل معاه في شغلك؟",
  "type": "yesno",
  "scoringWeight": 2
}
```

**Question types:** `open`, `yesno`, `scale`, `multiple`

**Lead scoring:**
- Each answer is given a sentiment score (positive / neutral / negative)
- Weighted sum → 0–100 score
- `warm` threshold: 35+, `hot` threshold: 65+

---

## Adding Your Own Script

Via the API (POST /api/scripts):

```json
{
  "name": "كوفيد سكريبت - أبريل 2025",
  "drugName": "Paxlovid",
  "targetType": "physician",
  "greeting": "أهلاً دكتور، أنا سلمى من MedCall...",
  "closing": "شكراً جزيلاً على وقتك...",
  "questions": [
    {
      "key": "usage",
      "text": "بتستخدم باكسلوفيد في علاج حالات كوفيد الحادة؟",
      "type": "yesno",
      "scoringWeight": 3
    }
  ],
  "warmThreshold": 40,
  "hotThreshold": 70
}
```

---

## Azure TTS Voices (Egyptian Arabic)

| Voice | Gender | Style options |
|---|---|---|
| `ar-EG-SalmaNeural` | Female | friendly, empathetic, cheerful, calm |
| `ar-EG-ShakirNeural` | Male | friendly, calm, newscast |

Change `AZURE_TTS_VOICE` in `.env` to switch.

---

## Phase 2 Preview (what comes next)

- **Mass calling orchestrator** — Celery/Bull queue, concurrent call batching
- **Human escalation** — Twilio conference bridge for warm transfers
- **Real-time dashboard** — WebSocket updates as calls happen
- **Fine-tuned TTS** — Upload your own audio, fine-tune XTTS-v2 on Egyptian dialect
- **Improved ASR** — Domain-specific vocabulary list for drug names

---

## Troubleshooting

**"Twilio can't reach webhook"**
→ Make sure ngrok is running and `BASE_URL` in `.env` is the ngrok URL.

**"Azure TTS error"**
→ Check `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`. Try `eastus` region.
→ The system falls back to Twilio's built-in `<Say language="ar-EG">` if Azure fails.

**"Whisper transcription empty"**
→ Check that Twilio recording completed. Add `playBeep="false"` is already set.
→ Minimum recording length is ~1 second.

**"GPT-4o returns malformed response"**
→ The parser has a fallback — it treats the whole response as speech.
→ Check the system prompt in `conversationLLM.js` and adjust if needed.
