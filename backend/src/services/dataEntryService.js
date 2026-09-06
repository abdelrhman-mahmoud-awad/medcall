/**
 * dataEntryService.js — two AI steps around the human review gate:
 *
 *  1. generateDraft(callLog)     AFTER each call: transcript → extracted fields
 *                                (uncertain fields flagged, nothing invented)
 *  2. buildFormPayload(draft)    ON APPROVAL: human-approved fields → JSON that
 *                                is valid against config/formSchema.json
 *                                (select/radio values guaranteed legal)
 *
 * Both steps use Gemini in strict JSON mode. If Gemini is unavailable the
 * draft falls back to direct DB values and everything transcript-derived is
 * flagged for review — the pipeline never blocks on the AI.
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const DataEntryDraft = require('../models/DataEntryDraft');
const formSchema     = require('../config/formSchema.json');

const geminiApiKey = process.env.GEMINI_API_KEY;
const draftModelId = process.env.DRAFT_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

function getModel() {
  return genAI ? genAI.getGenerativeModel({ model: draftModelId }) : null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve a `source` path like "contact.name" / "call.leadScore" on the callLog. */
function resolveSource(source, callLog) {
  if (!source || source === 'transcript') return undefined;
  const [root, ...path] = source.split('.');
  let obj = root === 'contact' ? callLog.contact
          : root === 'call'    ? callLog
          : undefined;
  for (const p of path) obj = obj?.[p];
  return obj;
}

function formatDate(value) {
  const d = value ? new Date(value) : new Date();
  return d.toISOString().slice(0, 10);   // YYYY-MM-DD
}

function stripCodeFences(text) {
  return (text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
}

async function geminiJson(prompt) {
  const model = getModel();
  if (!model) return null;
  const completion = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
    },
  });
  const raw = stripCodeFences(completion?.response?.text?.() || '');
  return JSON.parse(raw);
}

// ─── Validation against a form schema (project's, or the global fallback) ────

function validateAgainstSchema(payload, schema = formSchema) {
  const errors = [];
  const clean = {};

  for (const field of schema.fields) {
    let v = payload?.[field.key];
    if (v === undefined || v === null || v === '') { clean[field.key] = null; continue; }

    switch (field.type) {
      case 'number': {
        const n = Number(v);
        if (Number.isNaN(n)) { errors.push(`${field.key}: not a number ("${v}")`); v = null; }
        else v = n;
        break;
      }
      case 'select':
      case 'radio': {
        const s = String(v).toLowerCase().trim();
        const match = (field.options || []).find(o => o.toLowerCase() === s);
        if (!match) { errors.push(`${field.key}: "${v}" not in [${field.options.join(', ')}]`); v = null; }
        else v = match;
        break;
      }
      case 'date': {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) {
          const d = new Date(v);
          if (Number.isNaN(d.getTime())) { errors.push(`${field.key}: invalid date ("${v}")`); v = null; }
          else v = formatDate(d);
        }
        break;
      }
      default:
        v = String(v);
    }
    clean[field.key] = v;
  }

  return { valid: errors.length === 0, errors, clean };
}

// ─── Step 1: transcript → draft ──────────────────────────────────────────────

async function generateDraft(callLog) {
  // callLog must be populated with contact (+ script optional)
  const existing = await DataEntryDraft.findOne({ call: callLog._id });
  if (existing) return existing;

  // Phase 6: use the contact's project schema (global file fallback)
  const { configForContact } = require('./projectConfigService');
  const contactId = callLog.contact?._id || callLog.contact;
  const { project, formSchema: schema } = await configForContact(contactId);

  const fields = {};
  const needsReview = [];

  // 1. Fill everything that comes straight from the database
  for (const f of schema.fields) {
    const direct = resolveSource(f.source, callLog);
    if (direct !== undefined && direct !== null && direct !== '') {
      fields[f.key] = f.type === 'date' ? formatDate(direct) : direct;
    }
  }
  if (fields.call_date === undefined) fields.call_date = formatDate(callLog.endedAt);

  // 2. Ask Gemini to extract the transcript-sourced fields
  const transcriptFields = schema.fields.filter(f => f.source === 'transcript');
  const answersText = (callLog.responses || [])
    .map(r => `- [${r.questionKey}] Q: ${r.questionText} | A: ${r.answer} (sentiment: ${r.sentiment})`)
    .join('\n');

  let aiExtract = null;
  try {
    aiExtract = await geminiJson(`You are a strict data-entry extraction engine for a pharma market-research team.

TRANSCRIPT of a phone call (AI interviewer + contact, Egyptian Arabic):
"""
${callLog.transcript || '(no transcript)'}
"""

STRUCTURED ANSWERS already extracted during the call:
${answersText || '(none)'}

Extract ONLY these fields. Rules:
- Base every value strictly on the transcript/answers above. NEVER invent data.
- For select/radio fields you MUST answer with exactly one of the allowed options, or null.
- If the transcript does not clearly state a value, use null.
- "notes" = a 1-3 sentence ENGLISH summary of the call outcome.

Fields:
${transcriptFields.map(f => `- "${f.key}" (${f.type}${f.options ? `, options: ${f.options.join(' | ')}` : ''}): ${f.label}`).join('\n')}

Respond with a single JSON object: { ${transcriptFields.map(f => `"${f.key}": ...`).join(', ')}, "uncertain": ["field_key", ...] }
"uncertain" lists the keys you are NOT confident about.`);
  } catch (err) {
    console.warn('📝 Draft extraction AI failed (falling back):', err.message);
  }

  if (aiExtract) {
    for (const f of transcriptFields) {
      fields[f.key] = aiExtract[f.key] ?? null;
      if (fields[f.key] === null) needsReview.push(f.key);
    }
    for (const k of aiExtract.uncertain || []) {
      if (!needsReview.includes(k)) needsReview.push(k);
    }
  } else {
    // AI unavailable — leave transcript fields empty and flag all of them
    for (const f of transcriptFields) {
      fields[f.key] = null;
      needsReview.push(f.key);
    }
  }

  const draft = await DataEntryDraft.create({
    call:    callLog._id,
    contact: callLog.contact._id || callLog.contact,
    project: project?._id,
    fields,
    needsReview,
  });

  console.log(`📝 Data-entry draft created for call ${callLog._id} (${needsReview.length} fields need review)`);
  return draft;
}

// ─── Step 2: approved draft → validated form payload ─────────────────────────

async function buildFormPayload(draft) {
  const approvedFields = draft.fields || {};

  // Phase 6: validate against the draft's project schema (global fallback)
  const { schemaForDraft } = require('./projectConfigService');
  const schema = await schemaForDraft(draft);

  const prompt = `You are a strict form-payload formatter. Convert the APPROVED data below
into the exact JSON payload for a data-entry form. Rules:
- Output keys: exactly the field keys listed. No extra keys.
- select/radio: value MUST be exactly one of the allowed options (translate/normalize
  Arabic or free text into the matching option), or null if there is no clear match.
- date fields: format YYYY-MM-DD. number fields: plain numbers.
- NEVER invent values that are not present in the approved data.

FORM SCHEMA:
${schema.fields.map(f => `- "${f.key}" (${f.type}${f.options ? `, options: ${f.options.join(' | ')}` : ''}${f.format ? `, format: ${f.format}` : ''})`).join('\n')}

APPROVED DATA:
${JSON.stringify(approvedFields, null, 2)}

Respond with a single JSON object containing every field key.`;

  let lastErrors = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    let candidate;
    try {
      candidate = await geminiJson(
        attempt === 1 ? prompt
        : `${prompt}\n\nYour previous output failed validation: ${lastErrors.join('; ')}. Fix these and respond again with only the JSON object.`
      );
    } catch (err) {
      console.warn(`📤 Payload formatter attempt ${attempt} failed:`, err.message);
      candidate = null;
    }

    // No AI available → deterministic fallback: validate approved fields directly
    if (!candidate) candidate = approvedFields;

    const { valid, errors, clean } = validateAgainstSchema(candidate, schema);
    if (valid) return clean;
    lastErrors = errors;

    // Deterministic fallback also produced a clean (nulled) payload — invalid
    // values became null rather than shipping bad data. Accept on final attempt.
    if (attempt === 2 || !getModel()) {
      console.warn(`📤 Payload shipped with nulled invalid fields: ${errors.join('; ')}`);
      return clean;
    }
  }
}

module.exports = { generateDraft, buildFormPayload, validateAgainstSchema, formSchema };
