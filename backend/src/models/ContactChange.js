const mongoose = require('mongoose');

/**
 * ContactChange — a pending data change detected during Excel import.
 *
 * When a re-uploaded sheet shows a different phone/city/name/specialty for an
 * existing contact, the change is stored here (status: pending) instead of
 * silently overwriting the database. A human approves or rejects it, and the
 * AI verification agent (Gemini) can attach an online-verified verdict.
 */
const contactChangeSchema = new mongoose.Schema({
  contact:   { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: true },
  field:     { type: String, required: true },        // 'phone' | 'city' | 'name' | 'specialty'
  oldValue:  { type: String },
  newValue:  { type: String },
  excelRow:  { type: Number },                        // where it was seen in the sheet
  status:    { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  reviewedBy:{ type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt:{ type: Date },

  // ── AI verification (filled by verificationAgent.js) ──
  aiVerdict:    { type: String, enum: ['confirmed', 'contradicted', 'not_found', 'error'] },
  aiConfidence: { type: Number, min: 0, max: 100 },
  aiFindings:   { type: String },     // short explanation of what was found online
  aiSources:    [String],             // URLs Gemini grounded its answer on
  aiCheckedAt:  { type: Date },
}, { timestamps: true });

// One pending change per contact+field at a time
contactChangeSchema.index({ contact: 1, field: 1, status: 1 });

module.exports = mongoose.model('ContactChange', contactChangeSchema);
