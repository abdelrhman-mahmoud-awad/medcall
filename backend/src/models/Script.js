const mongoose = require('mongoose');

// A single question node in the script
const questionSchema = new mongoose.Schema({
  key:          { type: String, required: true },  // machine-readable ID
  text:         { type: String, required: true },  // What the AI says (Arabic)
  textEn:       { type: String },                   // English reference
  type:         { type: String, enum: ['open', 'scale', 'yesno', 'multiple'], default: 'open' },
  options:      [String],                           // for 'multiple' type
  followUpIf:   { type: String },                   // answer keyword that triggers follow-up
  followUpKey:  { type: String },                   // key of follow-up question
  scoringWeight:{ type: Number, default: 1 },       // weight for lead scoring
}, { _id: false });

const scriptSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  drugName:     { type: String, required: true },
  targetType:   { type: String, enum: ['physician', 'pharmacist', 'both'], default: 'both' },
  language:     { type: String, default: 'ar-EG' },

  // AI greeting (Arabic)
  greeting:     { type: String, required: true },
  // AI closing message (Arabic)
  closing:      { type: String, required: true },
  // AI response when contact is unavailable
  unavailableMessage: { type: String },

  questions:    [questionSchema],

  // Lead scoring thresholds
  warmThreshold:{ type: Number, default: 40 },
  hotThreshold: { type: Number, default: 70 },

  active:       { type: Boolean, default: true },
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Script', scriptSchema);
