const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  type:        { type: String, enum: ['physician', 'pharmacist'], required: true },
  specialty:   { type: String, trim: true },
  phone:       { type: String, required: true, trim: true },
  clinic:      { type: String, trim: true },
  city:        { type: String, trim: true },
  notes:       { type: String },
  tags:        [String],
  // ── Phase 5: project scoping ──
  project:     { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },

  callCount:   { type: Number, default: 0 },
  lastCalledAt:{ type: Date },
  doNotCall:   { type: Boolean, default: false },

  // ── Phase 4: recording consent (asked once, remembered) ──
  // 'denied' contacts are auto-skipped by campaigns, like DNC
  recordingConsent: { type: String, enum: ['granted', 'denied', 'unknown'], default: 'unknown' },

  // ── Phase 6: per-doctor data-entry link from the successful-doctors sheet ──
  dataEntryUrl:        { type: String, trim: true },
  dataEntryStatus:     { type: String, enum: ['pending', 'received', 'completed', 'missing'], default: 'pending' },
  dataEntryReceivedAt: { type: Date },
  dataEntrySourceRow:  { type: Number },

  // ── Excel sync (Phase 3) ──
  excelRow:    { type: Number },                  // 1-based row in the sheet
  excelFile:   { type: String },                  // source file path
  excelSynced: { type: Boolean, default: false }, // last call written back?
}, { timestamps: true });

module.exports = mongoose.model('Contact', contactSchema);
