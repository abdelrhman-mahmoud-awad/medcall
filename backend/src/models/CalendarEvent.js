const mongoose = require('mongoose');

const calendarEventSchema = new mongoose.Schema({
  contact:    { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: true },
  project:    { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  scheduledAt:{ type: Date, required: true },
  timezone:   { type: String, required: true, default: 'Africa/Cairo' },
  notes:      { type: String, trim: true, maxlength: 1000 },
  status: {
    type: String,
    enum: ['scheduled', 'in-progress', 'completed', 'cancelled', 'failed'],
    default: 'scheduled',
  },
  scheduledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  callLog:    { type: mongoose.Schema.Types.ObjectId, ref: 'CallLog' },
  queueJobId: { type: String },
}, { timestamps: true });

calendarEventSchema.index({ project: 1, scheduledAt: 1, status: 1 });

module.exports = mongoose.model('CalendarEvent', calendarEventSchema);
