const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

/**
 * Project — a market-research project owned by one manager.
 *
 * A manager can own many projects. Members (accounts the manager created)
 * are attached per project. Contacts imported from the project's sheet are
 * tagged with the project, which is how calls/forms roll up into progress.
 */
const projectSchema = new mongoose.Schema({
  name:    { type: String, required: true, trim: true },
  manager: { type: ObjectId, ref: 'User', required: true },
  members: [{ type: ObjectId, ref: 'User' }],

  // Attached contact sheet
  sheet: {
    sourceType:     { type: String, enum: ['xlsx', 'google_sheet'] },
    fileName:       { type: String },
    googleSheetUrl: { type: String },
    importedCount:  { type: Number },
    linkedCount:    { type: Number },   // existing contacts attached (matched by phone)
    invalidRows:    { type: Number },
    importedAt:     { type: Date },
  },

  // Targets set by the manager
  targets: {
    calls: { type: Number, default: 0 },   // completed-calls goal
    forms: { type: Number, default: 0 },   // entered-forms goal
  },

  status: { type: String, enum: ['active', 'archived'], default: 'active' },

  // ── Phase 6: per-project configuration (all optional — global fallbacks) ──

  // THIS project's call script (used automatically for its contacts)
  script: { type: ObjectId, ref: 'Script' },

  // The data-entry fields (same shape as config/formSchema.json)
  formSchema: {
    fields: [{
      _id: false,
      key:     { type: String },
      label:   { type: String },
      type:    { type: String, enum: ['text', 'select', 'radio', 'number', 'date', 'textarea'] },
      options: [String],                   // for select / radio
      format:  { type: String },           // e.g. "YYYY-MM-DD"
      source:  { type: String },           // 'transcript' | 'contact.name' | 'call.leadScore' …
    }],
  },

  // Per-project consent (undefined → CONSENT_LINE / CONSENT_REQUIRED env fallback)
  consent: {
    line:     { type: String },
    required: { type: Boolean },
  },

  // The external data-entry website for this project
  dataEntry: {
    websiteUrl:    { type: String },
    fieldMappings: { type: mongoose.Schema.Types.Mixed },   // { "css selector": "field_key" }
  },

  // AI market-insights cache (regenerated on demand / when stale)
  insights:            { type: mongoose.Schema.Types.Mixed },
  insightsGeneratedAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Project', projectSchema);
