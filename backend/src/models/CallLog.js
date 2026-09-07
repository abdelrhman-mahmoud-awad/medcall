const mongoose = require('mongoose');

// One message turn in the conversation
const turnSchema = new mongoose.Schema({
  role:       { type: String, enum: ['ai', 'contact'] },
  text:       { type: String },
  audioUrl:   { type: String },   // URL to recorded audio chunk (optional)
  timestamp:  { type: Date, default: Date.now },
}, { _id: false });

// One question from the script with the captured answer
const responseSchema = new mongoose.Schema({
  questionKey: { type: String },   // e.g. "awareness", "prescribing_frequency"
  questionText:{ type: String },
  answer:      { type: String },
  sentiment:   { type: String, enum: ['positive','neutral','negative','unclear'] },
}, { _id: false });

const callLogSchema = new mongoose.Schema({
  contact:      { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: true },
  script:       { type: mongoose.Schema.Types.ObjectId, ref: 'Script' },
  campaign:     { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },  // Phase 2: set by callWorker
  callback:     { type: mongoose.Schema.Types.ObjectId, ref: 'CalendarEvent' },
  twilioCallSid:{ type: String, unique: true, sparse: true },

  status: {
    type: String,
    enum: ['initiated', 'in-progress', 'completed', 'failed', 'no-answer', 'escalated'],
    default: 'initiated',
  },

  // Full conversation history
  turns:        [turnSchema],
  // Extracted structured answers from the script
  responses:    [responseSchema],

  // Lead qualification result
  leadScore:    { type: Number, min: 0, max: 100 },
  leadLabel:    { type: String, enum: ['cold', 'warm'], default: 'cold' },
  escalated:    { type: Boolean, default: false },
  escalatedAt:  { type: Date },

  // Timing
  startedAt:    { type: Date },
  endedAt:      { type: Date },
  durationSec:  { type: Number },

  // Raw Twilio recording URL
  recordingUrl: { type: String },

  // ── Phase 4: recording consent evidence ──
  consent: {
    given:       { type: Boolean },   // true = granted, false = denied, undefined = not asked
    verdictText: { type: String },    // the contact's verbatim answer
    at:          { type: Date },
  },

  // ── Phase 4: Google Drive archive links ──
  drive: {
    folderId:      { type: String },
    recordingUrl:  { type: String },
    consentUrl:    { type: String },
    transcriptUrl: { type: String },
    draftUrl:      { type: String },
  },

  // Full transcript text (concatenated)
  transcript:   { type: String },

  initiatedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('CallLog', callLogSchema);
