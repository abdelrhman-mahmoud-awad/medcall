const router = require('express').Router();
const auth = require('../middleware/auth');
const projectScope = require('../middleware/projectScope');
const CalendarEvent = require('../models/CalendarEvent');
const Contact = require('../models/Contact');
const queue = require('../queues/callQueue');

const activeStatuses = ['scheduled', 'in-progress'];

async function queueCallback(event) {
  if (!queue) return null;
  const delay = Math.max(0, new Date(event.scheduledAt).getTime() - Date.now());
  const job = await queue.add({ type: 'callback', callbackId: event._id.toString() }, {
    delay,
    jobId: event._id.toString(),
    attempts: 2,
    backoff: { type: 'fixed', delay: 30_000 },
    removeOnComplete: true,
  });
  return job.id.toString();
}

async function removeCallbackJob(jobId) {
  if (!queue || !jobId) return;
  try {
    const job = await queue.getJob(jobId);
    if (job) await job.remove();
  } catch (err) {
    console.warn('[Calendar] Could not remove old callback job:', err.message);
  }
}

function projectFilter(req) {
  return req.scopeProject ? { project: req.scopeProject._id } : {};
}

router.get('/', auth, projectScope, async (req, res) => {
  try {
    const events = await CalendarEvent.find(projectFilter(req))
      .populate('contact', 'name type phone specialty city')
      .populate('callLog', 'status twilioCallSid createdAt')
      .sort({ scheduledAt: 1 });
    res.json(events);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, projectScope, async (req, res) => {
  try {
    const { contactId, scheduledAt, timezone, notes } = req.body;
    if (!contactId || !scheduledAt || !timezone) {
      return res.status(400).json({ error: 'contactId, scheduledAt and timezone are required' });
    }
    const contact = await Contact.findById(contactId);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    if (req.scopeProject && String(contact.project) !== String(req.scopeProject._id)) {
      return res.status(403).json({ error: 'Contact is not in the selected project' });
    }
    const when = new Date(scheduledAt);
    if (Number.isNaN(when.getTime()) || when <= new Date()) {
      return res.status(400).json({ error: 'Callback time must be in the future' });
    }
    const duplicate = await CalendarEvent.findOne({
      ...projectFilter(req), contact: contact._id, scheduledAt: when, status: { $in: activeStatuses },
    });
    if (duplicate) return res.status(409).json({ error: 'An active callback already exists at this time' });

    const event = await CalendarEvent.create({
      contact: contact._id,
      project: req.scopeProject?._id || contact.project,
      scheduledAt: when,
      timezone,
      notes,
      scheduledBy: req.user._id,
    });
    event.queueJobId = await queueCallback(event);
    await event.save();
    res.status(201).json(await event.populate('contact', 'name type phone specialty city'));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', auth, projectScope, async (req, res) => {
  try {
    const event = await CalendarEvent.findOne({ _id: req.params.id, ...projectFilter(req) });
    if (!event) return res.status(404).json({ error: 'Callback not found' });
    if (event.status !== 'scheduled') return res.status(400).json({ error: 'Only scheduled callbacks can be rescheduled' });
    const { scheduledAt, timezone, notes, contactId } = req.body;
    const when = scheduledAt ? new Date(scheduledAt) : event.scheduledAt;
    if (Number.isNaN(when.getTime()) || when <= new Date()) return res.status(400).json({ error: 'Callback time must be in the future' });
    if (contactId && String(contactId) !== String(event.contact)) {
      const contact = await Contact.findById(contactId);
      if (!contact || (req.scopeProject && String(contact.project) !== String(req.scopeProject._id))) return res.status(400).json({ error: 'Invalid contact' });
      event.contact = contact._id;
    }
    await removeCallbackJob(event.queueJobId);
    event.scheduledAt = when;
    if (timezone) event.timezone = timezone;
    if (notes !== undefined) event.notes = notes;
    event.queueJobId = await queueCallback(event);
    await event.save();
    res.json(await event.populate('contact', 'name type phone specialty city'));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/cancel', auth, projectScope, async (req, res) => {
  try {
    const event = await CalendarEvent.findOne({ _id: req.params.id, ...projectFilter(req) });
    if (!event) return res.status(404).json({ error: 'Callback not found' });
    if (event.status === 'completed') return res.status(400).json({ error: 'Completed callbacks cannot be cancelled' });
    await removeCallbackJob(event.queueJobId);
    event.status = 'cancelled';
    event.queueJobId = undefined;
    await event.save();
    res.json(event);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
