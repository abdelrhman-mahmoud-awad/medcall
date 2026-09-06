/**
 * verificationAgent.js — Gemini agent that verifies contact data online.
 *
 * Uses Google Search grounding so answers come from live web results
 * (medical directories like Vezeeta/DrBridge, clinic sites, Google Maps).
 * Reuses the same GEMINI_API_KEY as the Phase 1 ASR/conversation services.
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const ContactChange = require('../models/ContactChange');
const Contact       = require('../models/Contact');

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

function _model() {
  if (!genAI) return null;
  return genAI.getGenerativeModel({
    model: process.env.VERIFY_MODEL || 'gemini-2.0-flash',
    tools: [{ googleSearch: {} }],          // Google Search grounding (Gemini 2.x)
  });
}

function _parseJson(text) {
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

const CHANGE_PROMPT = (contact, change) => `
You are a data-verification agent for a medical CRM in Egypt.

Contact on record:
- Name: ${contact.name}
- Type: ${contact.type}
- Specialty: ${contact.specialty || 'unknown'}
- City: ${contact.city || 'unknown'}
- Clinic: ${contact.clinic || 'unknown'}

A data change was detected in an uploaded Excel sheet:
- Field: ${change.field}
- Old value (currently in database): ${change.oldValue}
- New value (from the sheet): ${change.newValue}

Task: search the web (medical directories like Vezeeta/DrBridge, clinic and
hospital websites, Google Maps listings) and determine which value appears to
be correct for this person.

Respond with ONLY this JSON (no markdown):
{
  "verdict": "confirmed" | "contradicted" | "not_found",
  "confidence": 0-100,
  "findings": "1-2 sentence summary of what you found online",
  "matched_value": "the value the web supports, or null"
}
"confirmed"    = online sources support the NEW value.
"contradicted" = online sources support the OLD value or a different one.
"not_found"    = no reliable online information about this contact.
`;

/**
 * Verify one pending ContactChange online. Saves the verdict on the change.
 * Returns the parsed verdict, or null on failure (never throws mid-import).
 */
async function verifyChange(changeId) {
  const change = await ContactChange.findById(changeId);
  if (!change) throw new Error('Change not found');
  const contact = await Contact.findById(change.contact);

  const model = _model();
  if (!model) {
    await ContactChange.findByIdAndUpdate(changeId, {
      aiVerdict: 'error',
      aiFindings: 'GEMINI_API_KEY not set',
      aiCheckedAt: new Date(),
    });
    return null;
  }

  try {
    const result = await model.generateContent(CHANGE_PROMPT(contact, change));
    const parsed = _parseJson(result.response.text());

    // Grounding metadata → source URLs Gemini actually used
    const grounding = result.response.candidates?.[0]?.groundingMetadata;
    const sources = (grounding?.groundingChunks || [])
      .map(c => c.web?.uri)
      .filter(Boolean)
      .slice(0, 5);

    await ContactChange.findByIdAndUpdate(changeId, {
      aiVerdict:    parsed.verdict,
      aiConfidence: parsed.confidence,
      aiFindings:   parsed.findings,
      aiSources:    sources,
      aiCheckedAt:  new Date(),
    });
    return parsed;
  } catch (err) {
    console.error('AI verification failed:', err.message);
    await ContactChange.findByIdAndUpdate(changeId, {
      aiVerdict: 'error',
      aiFindings: err.message,
      aiCheckedAt: new Date(),
    });
    return null;
  }
}

/** Verify a whole contact (no pending change needed) — spot-check any doctor. */
async function verifyContact(contactId) {
  const contact = await Contact.findById(contactId);
  if (!contact) throw new Error('Contact not found');

  const model = _model();
  if (!model) return { verdict: 'error', findings: 'GEMINI_API_KEY not set' };

  const result = await model.generateContent(`
Search the web for this Egyptian medical professional and report whether the
data on record looks correct:
- Name: ${contact.name} (${contact.type}, ${contact.specialty || 'unknown'})
- Phone: ${contact.phone}
- City: ${contact.city || 'unknown'} | Clinic: ${contact.clinic || 'unknown'}

Respond with ONLY this JSON (no markdown):
{ "verdict": "confirmed" | "contradicted" | "not_found",
  "confidence": 0-100,
  "findings": "1-2 sentences",
  "corrections": { "phone": null, "city": null, "clinic": null } }
Put a value in "corrections" ONLY if the web clearly shows a different one.`);

  return _parseJson(result.response.text());
}

module.exports = { verifyChange, verifyContact };
