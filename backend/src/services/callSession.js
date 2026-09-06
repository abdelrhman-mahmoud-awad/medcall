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

    // ── Phase 2: real-time dashboard update + campaign stats ──
    try {
      const { emitCallUpdate, emitCampaignProgress } = require('./socketService');
      const updatedLog = await CallLog.findById(this.callLogId).populate('contact script');
      emitCallUpdate(updatedLog);

      if (updatedLog.campaign) {
        const Campaign = require('../models/Campaign');
        const inc = { completedCalls: 1 };
        if (label === 'hot')  inc.hotLeads  = 1;
        if (label === 'warm') inc.warmLeads = 1;
        if (label === 'cold') inc.coldLeads = 1;

        const campaign = await Campaign.findByIdAndUpdate(
          updatedLog.campaign, { $inc: inc }, { new: true }
        );

        if (campaign) {
          // Rolling average score + auto-complete when all calls are done
          const avgScore = Math.round(
            ((campaign.avgScore * (campaign.completedCalls - 1)) + score) / campaign.completedCalls
          );
          const done = campaign.completedCalls >= campaign.totalCalls;
          await Campaign.findByIdAndUpdate(campaign._id, {
            avgScore,
            ...(done ? { status: 'completed', completedAt: endedAt } : {}),
          });
          emitCampaignProgress(campaign._id, {
            completedCalls: campaign.completedCalls,
            totalCalls:     campaign.totalCalls,
            hotLeads:       campaign.hotLeads,
            warmLeads:      campaign.warmLeads,
            coldLeads:      campaign.coldLeads,
            avgScore,
            status: done ? 'completed' : campaign.status,
          });
        }
      }
    } catch (err) {
      console.error('📡 Realtime/campaign update failed (non-fatal):', err.message);
    }

    // ── Phase 4: data-entry draft + Google Drive archive ──
    try {
      if (process.env.DRAFT_AUTO_GENERATE !== 'false') {
        const { generateDraft } = require('./dataEntryService');
        const populatedLog = await CallLog.findById(this.callLogId).populate('contact');
        generateDraft(populatedLog).catch(err =>
          console.warn('📝 Draft generation failed (non-fatal):', err.message));
      }
      const { enqueueArchive } = require('../queues/uploadQueue');
      enqueueArchive(this.callLogId);
    } catch (err) {
      console.error('📁 Phase 4 hooks failed (non-fatal):', err.message);
    }

    // ── Phase 3: write the call result back to the Excel sheet ──
    if (process.env.EXCEL_AUTO_SYNC === 'true') {
      try {
        const { updateRowForCall } = require('./excelService');
        const savedLog = await CallLog.findById(this.callLogId);
        const result   = await updateRowForCall(savedLog);
        console.log('📊 Excel sync:', result);
      } catch (err) {
        console.error('📊 Excel sync failed (non-fatal):', err.message);
      }
    }

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
