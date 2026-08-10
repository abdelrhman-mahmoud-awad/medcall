/**
 * callSession.js  —  In-memory call state machine
 *
 * One CallSession per active Twilio call.
 * Stores conversation history, current question index, extracted answers,
 * and coordinates between Twilio webhooks, TTS, ASR, and the LLM.
 *
 * Sessions are stored in a Map keyed by Twilio CallSid.
 */

const { processTurn, scoreCall, detectSentiment } = require('./conversationLLM');
const { synthesize }  = require('./tts');
const { transcribe }  = require('./asr');
const CallLog         = require('../models/CallLog');
const Contact         = require('../models/Contact');
const axios           = require('axios');

// ─── Session store (in-memory) ────────────────────────────────────────────────
const sessions = new Map();

class CallSession {
  constructor({ callSid, contact, script, callLogId }) {
    this.callSid    = callSid;
    this.contact    = contact;   // full Mongoose doc
    this.script     = script;    // full Mongoose doc
    this.callLogId  = callLogId;

    this.history          = [];   // Conversation history array
    this.responses        = [];   // extracted structured answers
    this.currentQIdx      = -1;   // -1 = greeting not sent yet
    this.ended            = false;
    this.startedAt        = new Date();
    this.turns            = [];   // raw turn log for CallLog
  }

  // ─── Get the first AI utterance (greeting) ──────────────────────────────
  async getGreeting() {
    const result = await processTurn(this.script, this.contact, [], '');
    this._recordAITurn(result.speak);
    return result;
  }

  // ─── Process a recording URL from Twilio ────────────────────────────────
  async processRecording(recordingUrl) {
    // Download the audio from Twilio
    const audioRes = await axios.get(recordingUrl + '.mp3', {
      responseType: 'arraybuffer',
      auth: {
        username: process.env.TWILIO_ACCOUNT_SID,
        password: process.env.TWILIO_AUTH_TOKEN,
      },
    });
    const audioBuffer = Buffer.from(audioRes.data);

    // Transcribe the latest recording
    const userText = await transcribe(audioBuffer, 'recording.mp3');

    // Log the contact's turn
    this.turns.push({ role: 'contact', text: userText, timestamp: new Date() });
    this.history.push({ role: 'user', content: userText });

    // Run conversation LLM
    const result = await processTurn(
      this.script,
      this.contact,
      this.history,
      null  // already added to history above
    );

    // Extract structured answers
    for (const [key, answer] of Object.entries(result.extractions || {})) {
      const question = this.script.questions.find(q => q.key === key);
      this.responses.push({
        questionKey:  key,
        questionText: question ? question.text : key,
        answer,
        sentiment:    detectSentiment(answer),
      });
    }

    this._recordAITurn(result.speak);

    if (result.action === 'END_CALL' || result.action === 'ESCALATE') {
      await this._finalize(result.action);
    }

    return result;
  }

  // ─── Synthesize text to MP3 buffer ──────────────────────────────────────
  async synthesize(text, style = 'friendly') {
    return synthesize(text, { style });
  }

  // ─── Save session to MongoDB and mark call as complete ───────────────────
  async _finalize(action) {
    this.ended   = true;
    const endedAt = new Date();
    const duration = Math.round((endedAt - this.startedAt) / 1000);

    const { score, label } = scoreCall(this.responses, this.script);

    const transcript = this.turns
      .map(t => `[${t.role === 'ai' ? 'AI' : 'Contact'}] ${t.text}`)
      .join('\n');

    await CallLog.findByIdAndUpdate(this.callLogId, {
      status:      action === 'ESCALATE' ? 'escalated' : 'completed',
      turns:       this.turns,
      responses:   this.responses,
      leadScore:   score,
      leadLabel:   label,
      escalated:   action === 'ESCALATE',
      escalatedAt: action === 'ESCALATE' ? endedAt : undefined,
      endedAt,
      durationSec: duration,
      transcript,
    });

    // Update contact stats
    await Contact.findByIdAndUpdate(this.contact._id, {
      $inc: { callCount: 1 },
      lastCalledAt: endedAt,
    });

    sessions.delete(this.callSid);
  }

  _recordAITurn(text) {
    this.turns.push({ role: 'ai', text, timestamp: new Date() });
    this.history.push({ role: 'assistant', content: text });
  }
}

// ─── Public session store API ─────────────────────────────────────────────────
function create(opts) {
  const session = new CallSession(opts);
  sessions.set(opts.callSid, session);
  return session;
}

function get(callSid) {
  return sessions.get(callSid);
}

function remove(callSid) {
  sessions.delete(callSid);
}

module.exports = { create, get, remove, CallSession };
