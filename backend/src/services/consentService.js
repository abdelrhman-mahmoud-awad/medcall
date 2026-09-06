/**
 * consentService.js — recording-consent detection + evidence record.
 *
 * The consent line is played at the very start of the call; the contact's
 * answer is transcribed and classified here. NO always wins over YES
 * ("لأ مش موافق" contains a yes-ish word but is a refusal).
 */
const YES = /(أيوه|ايوه|ايوة|أيوة|موافق|تمام|اوك|أوك|ماشي|طبعا|طبعًا|اتفضل|اكمل|كمل|نعم|yes|ok)/i;
const NO  = /(لأ|لا |لا،|مش موافق|رافض|ما ينفعش|مينفعش|لا شكرا|لا شكراً|no)/i;

function detectConsent(text) {
  const t = (text || '').trim();
  if (!t) return 'unknown';
  if (NO.test(t))  return 'denied';
  if (YES.test(t)) return 'granted';
  return 'unknown';
}

/** Evidence document stored next to the recording it authorizes. */
// Phase 6: pass consentLine to record the project-specific line that was played.
function buildConsentRecord({ callSid, contact, verdict, verbatim, consentLine }) {
  return {
    callSid,
    contactName:  contact?.name,
    contactPhone: contact?.phone,
    verdict,                                    // granted | denied
    verbatim:     verbatim || '',               // what the contact actually said
    consentLine:  consentLine ||
      process.env.CONSENT_LINE ||
      'المكالمة دي بتتسجل لأغراض الجودة، موافق نكمل؟',
    recordedAt:   new Date().toISOString(),
  };
}

const consentRequired = () => process.env.CONSENT_REQUIRED === 'true';

module.exports = { detectConsent, buildConsentRecord, consentRequired };
