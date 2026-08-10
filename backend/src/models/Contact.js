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
  callCount:   { type: Number, default: 0 },
  lastCalledAt:{ type: Date },
  doNotCall:   { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Contact', contactSchema);
