const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

/**
 * DataEntryDraft — human-in-the-loop bridge between a finished call and the
 * external data-entry website.
 *
 * Lifecycle: pending → (human review) → approved → (extension fills form) → entered
 *                                     ↘ rejected
 *
 * `fields`      raw AI extraction from the transcript (reviewer edits these)
 * `formPayload` built by the AI Form Formatter ON APPROVAL — the exact,
 *               schema-validated JSON the Chrome extension fills
 */
const draftSchema = new mongoose.Schema({
  call:    { type: ObjectId, ref: 'CallLog', required: true, unique: true },
  contact: { type: ObjectId, ref: 'Contact', required: true },
  // Phase 6: the project this draft belongs to (schema + data-entry site lookup)
  project: { type: ObjectId, ref: 'Project' },

  // AI-extracted fields, keyed by formSchema.json field keys
  fields:      { type: mongoose.Schema.Types.Mixed, default: {} },
  needsReview: [String],   // field keys the AI wasn't confident about

  // Review state
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'entered'],
    default: 'pending',
  },
  reviewedBy:   { type: ObjectId, ref: 'User' },
  reviewedAt:   { type: Date },
  rejectReason: { type: String },

  // Audit trail of human edits during review
  edits: [{
    field: String,
    from:  mongoose.Schema.Types.Mixed,
    to:    mongoose.Schema.Types.Mixed,
    by:    { type: ObjectId, ref: 'User' },
    at:    { type: Date, default: Date.now },
  }],

  // Schema-validated payload for the extension (built on approve)
  formPayload:      { type: mongoose.Schema.Types.Mixed },
  formPayloadError: { type: String },   // set if the formatter failed validation

  enteredAt: { type: Date },
  enteredBy: { type: String },          // extension API key label / rep hint
}, { timestamps: true });

module.exports = mongoose.model('DataEntryDraft', draftSchema);
