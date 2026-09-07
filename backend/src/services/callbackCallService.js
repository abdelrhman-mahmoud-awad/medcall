const twilio = require('twilio');
const Contact = require('../models/Contact');
const Script = require('../models/Script');
const CallLog = require('../models/CallLog');
const CalendarEvent = require('../models/CalendarEvent');
const session = require('./callSession');
const audioCache = require('./audioCache');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const baseUrl = () => (process.env.PUBLIC_URL || process.env.BASE_URL || '').replace(/\/$/, '');

async function placeCallback(callbackId) {
  const event = await CalendarEvent.findById(callbackId).populate('contact');
  if (!event || event.status !== 'scheduled') return { skipped: true, reason: 'callback is no longer scheduled' };

  const contact = event.contact;
  if (!contact || contact.doNotCall || contact.recordingConsent === 'denied') {
    await CalendarEvent.findByIdAndUpdate(callbackId, { status: 'failed' });
    return { skipped: true, reason: 'contact cannot be called' };
  }

  const { configForContact } = require('./projectConfigService');
  const scriptId = (await configForContact(contact._id)).scriptId;
  const script = scriptId ? await Script.findById(scriptId) : null;
  if (!script) {
    await CalendarEvent.findByIdAndUpdate(callbackId, { status: 'failed' });
    return { skipped: true, reason: 'project script missing' };
  }

  const callLog = await CallLog.create({
    contact: contact._id,
    script: script._id,
    callback: event._id,
    status: 'initiated',
    startedAt: new Date(),
    initiatedBy: event.scheduledBy,
  });

  const tmpKey = `callback_pending_${event._id}`;
  const tmpSession = session.create({ callSid: tmpKey, contact, script, callLogId: callLog._id });
  const greeting = await tmpSession.getGreeting();
  const greetingAudio = await tmpSession.synthesize(greeting.speak, 'friendly');
  const call = await client.calls.create({
    to: contact.phone,
    from: process.env.TWILIO_NUMBER,
    url: `${baseUrl()}/api/twilio/twiml/greeting`,
    method: 'GET',
    statusCallback: `${baseUrl()}/api/twilio/status`,
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    statusCallbackMethod: 'POST',
    ...(process.env.RECORD_CALLS === 'true' ? {
      record: true,
      recordingChannels: 'dual',
      recordingStatusCallback: `${baseUrl()}/api/twilio/recording-complete`,
      recordingStatusCallbackEvent: ['completed'],
    } : { record: false }),
  });

  session.remove(tmpKey);
  const realSession = session.create({ callSid: call.sid, contact, script, callLogId: callLog._id });
  realSession.history.push({ role: 'assistant', content: greeting.speak });
  realSession.turns.push({ role: 'ai', text: greeting.speak, timestamp: new Date() });
  audioCache.set(`${call.sid}_greeting`, greetingAudio);

  await CallLog.findByIdAndUpdate(callLog._id, { twilioCallSid: call.sid });
  await CalendarEvent.findByIdAndUpdate(callbackId, {
    status: 'in-progress',
    callLog: callLog._id,
    queueJobId: undefined,
  });
  return { callSid: call.sid, callLogId: callLog._id };
}

module.exports = { placeCallback };
