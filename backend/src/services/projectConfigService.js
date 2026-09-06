/**
 * projectConfigService.js — Phase 6: resolve per-project configuration with
 * global fallbacks. One resolver used by the consent gate, the data-entry
 * pipeline, insights, and the extension API:
 *
 *   contact → project → { script, formSchema, consentLine, consentRequired, dataEntry }
 *                       └── missing settings fall back to the old globals
 *                           (config/formSchema.json, CONSENT_LINE env, …)
 */
const Contact = require('../models/Contact');
const Project = require('../models/Project');
const globalSchema = require('../config/formSchema.json');

const DEFAULT_CONSENT_LINE = 'المكالمة دي بتتسجل لأغراض الجودة، موافق نكمل؟';
const FIELD_TYPES = ['text', 'select', 'radio', 'number', 'date', 'textarea'];
const KEY_RE = /^[a-z][a-z0-9_]*$/;

// ─── Schema validation (shared rules: settings route + frontend builder) ──────

function validateFormSchema(fields) {
  const errors = [];
  if (!Array.isArray(fields) || fields.length === 0) {
    return { valid: false, errors: ['Schema needs at least one field'] };
  }
  const seen = new Set();
  fields.forEach((f, i) => {
    const at = `field ${i + 1}${f?.key ? ` (${f.key})` : ''}`;
    if (!f?.key || !KEY_RE.test(f.key)) {
      errors.push(`${at}: key must be snake_case (a-z, 0-9, _), starting with a letter`);
    } else if (seen.has(f.key)) {
      errors.push(`${at}: duplicate key`);
    } else {
      seen.add(f.key);
    }
    if (!f?.label?.trim()) errors.push(`${at}: label required`);
    if (!FIELD_TYPES.includes(f?.type)) errors.push(`${at}: invalid type "${f?.type}"`);
    if ((f?.type === 'select' || f?.type === 'radio')
        && (!Array.isArray(f.options) || f.options.filter(o => o?.trim()).length < 2)) {
      errors.push(`${at}: select/radio needs at least 2 options`);
    }
  });
  return { valid: errors.length === 0, errors };
}

// ─── Resolution ───────────────────────────────────────────────────────────────

/** The (active) project a contact belongs to, or null. */
async function projectForContact(contactId) {
  if (!contactId) return null;
  const contact = await Contact.findById(contactId).select('project');
  if (!contact?.project) return null;
  return Project.findOne({ _id: contact.project, status: { $ne: 'archived' } });
}

const hasCustomSchema = (project) => (project?.formSchema?.fields?.length || 0) > 0;
const hasDataEntry = (project) =>
  !!(project?.dataEntry?.websiteUrl ||
     Object.keys(project?.dataEntry?.fieldMappings || {}).length);

/** Effective config for a project (null project = pure global behavior). */
function effectiveConfig(project) {
  return {
    scriptId: project?.script || null,
    formSchema: hasCustomSchema(project)
      ? { fields: project.formSchema.fields.map(f => (f.toObject ? f.toObject() : f)) }
      : globalSchema,
    usingGlobalSchema: !hasCustomSchema(project),
    consentLine: project?.consent?.line?.trim()
      || process.env.CONSENT_LINE
      || DEFAULT_CONSENT_LINE,
    consentRequired: (project?.consent?.required === true || project?.consent?.required === false)
      ? project.consent.required
      : process.env.CONSENT_REQUIRED === 'true',
    dataEntry: hasDataEntry(project)
      ? {
          websiteUrl:    project.dataEntry.websiteUrl || null,
          fieldMappings: project.dataEntry.fieldMappings || {},
        }
      : null,
  };
}

/** Resolve everything for a contact in one call. */
async function configForContact(contactId) {
  const project = await projectForContact(contactId);
  return { project, ...effectiveConfig(project) };
}

/** Schema for a draft: its project's schema, else global. */
async function schemaForDraft(draft) {
  if (draft?.project) {
    const project = await Project.findById(draft.project).select('formSchema');
    if (hasCustomSchema(project)) {
      return { fields: project.formSchema.fields.map(f => (f.toObject ? f.toObject() : f)) };
    }
  }
  return globalSchema;
}

// ─── Readiness (settings page checklist) ──────────────────────────────────────

async function readiness(project) {
  const items = [];

  if (project.script) {
    const Script = require('../models/Script');
    const script = await Script.findById(project.script).select('name questions');
    if (script) {
      const schemaFields = hasCustomSchema(project) ? project.formSchema.fields : globalSchema.fields;
      const transcriptKeys = schemaFields
        .filter(f => f.source === 'transcript' || f.source === undefined)
        .map(f => f.key);
      const questionKeys = new Set((script.questions || []).map(q => q.key));
      const uncovered = transcriptKeys.filter(k => !questionKeys.has(k)
        && !['notes', 'recording_link', 'call_date', 'lead_score', 'lead_label'].includes(k));
      items.push({
        key: 'script', ok: uncovered.length === 0,
        text: uncovered.length === 0
          ? `Script "${script.name}" linked (${script.questions?.length || 0} questions, all fields covered)`
          : `Script "${script.name}" linked — no question for: ${uncovered.join(', ')}`,
        level: uncovered.length === 0 ? 'ok' : 'warn',
      });
    } else {
      items.push({ key: 'script', ok: false, text: 'Linked script no longer exists', level: 'error' });
    }
  } else {
    items.push({ key: 'script', ok: false, text: 'No script linked — calls must pick one manually', level: 'warn' });
  }

  items.push(hasCustomSchema(project)
    ? { key: 'schema', ok: true, text: `Form schema (${project.formSchema.fields.length} fields)`, level: 'ok' }
    : { key: 'schema', ok: false, text: 'Using the global form schema (config/formSchema.json)', level: 'warn' });

  items.push(project.consent?.line?.trim()
    ? { key: 'consent', ok: true, text: 'Project consent line set', level: 'ok' }
    : { key: 'consent', ok: false, text: 'Consent line not set — using the global default', level: 'warn' });

  items.push(hasDataEntry(project)
    ? { key: 'dataEntry', ok: true,
        text: `Data-entry site configured (${Object.keys(project.dataEntry?.fieldMappings || {}).length} mapped fields)`, level: 'ok' }
    : { key: 'dataEntry', ok: false, text: 'Data-entry website not configured — extension will use label-matching', level: 'warn' });

  return items;
}

module.exports = {
  validateFormSchema,
  projectForContact,
  effectiveConfig,
  configForContact,
  schemaForDraft,
  readiness,
  globalSchema,
};
