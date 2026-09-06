/**
 * escalationService.js — bridges an escalated AI call to a human agent
 * via a Twilio Conference.
 *
 * Flow:
 *   1. The contact's live call is answered with TwiML that joins a conference
 *      (built by the /twiml/respond ESCALATE branch using conferenceTwiml()).
 *   2. dialAgent() rings a human (first available Agent, or ESCALATION_PHONE)
 *      and drops them into the same conference room.
 */
const twilio = require('twilio');
const Agent  = require('../models/Agent');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const conferenceName = (callSid) => `escalation_${callSid}`;

/** TwiML fragment that puts the CONTACT's call into the conference room. */
function conferenceTwiml(callSid) {
  return `<Dial><Conference endConferenceOnExit="true">${conferenceName(callSid)}</Conference></Dial>`;
}

/** Pick the agent to receive the escalation. */
async function pickAgentPhone() {
  const agent = await Agent.findOne({ available: true }).sort('lastEscalationAt');
  if (agent) {
    await Agent.findByIdAndUpdate(agent._id, {
      $inc: { escalationsHandled: 1 },
      lastEscalationAt: new Date(),
    });
    return agent.phone;
  }
  return process.env.ESCALATION_PHONE || null;
}

/** Ring the human agent and drop them into the contact's conference. */
async function dialAgent(callSid) {
  const agentPhone = await pickAgentPhone();
  if (!agentPhone) {
    console.warn('⚠️  Escalation requested but no agent available and ESCALATION_PHONE not set.');
    return null;
  }

  await client.calls.create({
    to:   agentPhone,
    from: process.env.TWILIO_NUMBER,
    twiml: `<Response>
      <Say>Incoming escalated call from MedCall AI. Connecting you now.</Say>
      <Dial><Conference>${conferenceName(callSid)}</Conference></Dial>
    </Response>`,
  });

  console.log(`🤝 Escalation: dialing agent ${agentPhone} into ${conferenceName(callSid)}`);
  return { conference: conferenceName(callSid), agentPhone };
}

module.exports = { conferenceTwiml, dialAgent, conferenceName };
