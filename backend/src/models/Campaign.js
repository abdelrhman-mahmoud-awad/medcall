const mongoose = require('mongoose');

/**
 * Campaign — a batch of calls to a contact list using one script.
 * Stats are updated live as each call finalizes (see callSession._finalize).
 */
const campaignSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  script:    { type: mongoose.Schema.Types.ObjectId, ref: 'Script', required: true },
  contacts:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Contact' }],
  status:    { type: String, enum: ['draft', 'running', 'paused', 'completed'], default: 'draft' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Stats (updated as calls complete)
  totalCalls:     { type: Number, default: 0 },
  completedCalls: { type: Number, default: 0 },
  warmLeads:      { type: Number, default: 0 },
  coldLeads:      { type: Number, default: 0 },
  avgScore:       { type: Number, default: 0 },

  startedAt:   { type: Date },
  completedAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Campaign', campaignSchema);
