const mongoose = require('mongoose');

/**
 * Agent — a human team member who can receive escalated calls.
 * The escalation service dials the first available agent (or falls back
 * to ESCALATION_PHONE from .env when no agent is available).
 */
const agentSchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true },
  phone:     { type: String, required: true, trim: true },
  email:     { type: String, trim: true },
  available: { type: Boolean, default: true },

  // Stats
  escalationsHandled: { type: Number, default: 0 },
  lastEscalationAt:   { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Agent', agentSchema);
