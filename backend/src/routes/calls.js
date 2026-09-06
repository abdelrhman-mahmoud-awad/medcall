const router       = require('express').Router();
const auth         = require('../middleware/auth');
const projectScope = require('../middleware/projectScope');
const CallLog      = require('../models/CallLog');
const Contact      = require('../models/Contact');

// CallLog has no direct project ref — scope via the project's contacts.
const projectContactIds = (projectId) =>
  Contact.find({ project: projectId }).distinct('_id');

// GET /api/calls — supports optional ?project=<id> scoping (via contacts)
router.get('/', auth, projectScope, async (req, res) => {
  try {
    const { status, label, contactId, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status)    filter.status    = status;
    if (label)     filter.leadLabel = label;
    if (contactId) filter.contact   = contactId;
    if (req.scopeProject) {
      const ids = await projectContactIds(req.scopeProject._id);
      // If contactId was also passed, $in keeps the stricter contact filter.
      filter.contact = contactId ? contactId : { $in: ids };
      if (contactId && !ids.some(id => String(id) === String(contactId))) {
        return res.json({ calls: [], total: 0, page: Number(page), pages: 0 });
      }
    }

    const total = await CallLog.countDocuments(filter);
    const calls = await CallLog.find(filter)
      .populate('contact', 'name type phone city')
      .populate('script',  'name drugName')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ calls, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/calls/:id  (full call detail with transcript)
router.get('/:id', auth, async (req, res) => {
  try {
    const call = await CallLog.findById(req.params.id)
      .populate('contact')
      .populate('script');
    if (!call) return res.status(404).json({ error: 'Not found' });
    res.json(call);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/calls/stats/summary  — dashboard numbers (optional ?project=<id>)
router.get('/stats/summary', auth, projectScope, async (req, res) => {
  try {
    const base = {};
    if (req.scopeProject) {
      base.contact = { $in: await projectContactIds(req.scopeProject._id) };
    }
    const [total, warm, hot, escalated] = await Promise.all([
      CallLog.countDocuments(base),
      CallLog.countDocuments({ ...base, leadLabel: 'warm' }),
      CallLog.countDocuments({ ...base, leadLabel: 'hot' }),
      CallLog.countDocuments({ ...base, escalated: true }),
    ]);
    res.json({ total, warm, hot, escalated, cold: total - warm - hot });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
