/**
 * callWorker.js — dequeues campaign jobs and fires outbound Twilio calls.
 *
 * Processes up to MAX_CONCURRENT_CALLS jobs simultaneously. Each job mirrors
 * the single-call flow from routes/twilio.js: create CallLog, pre-generate
 * the greeting audio, create the Twilio call, and register the CallSession.
 */
const queue      = require('./callQueue');
const Contact    = require('../models/Contact');
const Script     = require('../models/Script');
const CallLog    = require('../models/CallLog');
const session    = require('../services/callSession');
const audioCache = require('../services/audioCache');
const twilio     = require('twilio');

function start() {
  if (!queue) return;   // Redis not configured — nothing to do

  const client   = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const BASE_URL = () => (process.env.PUBLIC_URL || process.env.BASE_URL || '').replace(/\/$/, '');

  queue.process(Number(process.env.MAX_CONCURRENT_CALLS) || 5, async (job) => {
    if (job.data.type === 'callback') {
      const { placeCallback } = require('../services/callbackCallService');
      return placeCallback(job.data.callbackId);
    }

    const { contactId, scriptId, campaignId, initiatedBy } = job.data;

    const contact = await Contact.findById(contactId);
    if (!contact) return { skipped: true, reason: 'contact missing' };

    // Phase 6: campaign's explicit script wins; else the contact's project script
    let effectiveScriptId = scriptId;
    if (!effectiveScriptId) {
      const { configForContact } = require('../services/projectConfigService');
      effectiveScriptId = (await configForContact(contactId)).scriptId;
    }
    const script = effectiveScriptId ? await Script.findById(effectiveScriptId) : null;

    if (!script)               return { skipped: true, reason: 'contact or script missing' };
    if (contact.doNotCall)     return { skipped: true, reason: 'do-not-call' };
    // Phase 4: consent denied once = never call for recording again (like DNC)
    if (contact.recordingConsent === 'denied') return { skipped: true, reason: 'recording-consent-denied' };

    const callLog = await CallLog.create({
      contact:  contact._id,
      script:   script._id,
      status:   'initiated',
      startedAt: new Date(),
      initiatedBy,
      campaign: campaignId,
    });

    // Pre-generate the greeting audio (same flow as single calls)
    const tmpSession = session.create({
      callSid: `pending_${job.id}`, contact, script, callLogId: callLog._id,
    });
    const greeting      = await tmpSession.getGreeting();
    const greetingAudio = await tmpSession.synthesize(greeting.speak, 'friendly');

    const call = await client.calls.create({
      to:     contact.phone,
      from:   process.env.TWILIO_NUMBER,
      url:    `${BASE_URL()}/api/twilio/twiml/greeting`,
      method: 'GET',
      statusCallback: `${BASE_URL()}/api/twilio/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
      // Phase 4: full-call recording (same options as single calls)
      ...(process.env.RECORD_CALLS === 'true' ? {
        record: true,
        recordingChannels: 'dual',
        recordingStatusCallback: `${BASE_URL()}/api/twilio/recording-complete`,
        recordingStatusCallbackEvent: ['completed'],
      } : { record: false }),
    });

    // Re-key the session with the real CallSid
    session.remove(`pending_${job.id}`);
    const real = session.create({
      callSid: call.sid, contact, script, callLogId: callLog._id,
    });
    real.history.push({ role: 'assistant', content: greeting.speak });
    real.turns.push({ role: 'ai', text: greeting.speak, timestamp: new Date() });

    audioCache.set(`${call.sid}_greeting`, greetingAudio);
    await CallLog.findByIdAndUpdate(callLog._id, { twilioCallSid: call.sid });

    return { callSid: call.sid, callLogId: callLog._id };
  });

  console.log(`📞 Call worker started (max ${process.env.MAX_CONCURRENT_CALLS || 5} concurrent calls)`);
}

module.exports = { start };
