const router  = require('express').Router();
const auth    = require('../middleware/auth');
const CallLog = require('../models/CallLog');

// GET /api/calls
router.get('/', auth, async (req, res) => {
  try {
    const { status, label, contactId, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status)    filter.status    = status;
    if (label)     filter.leadLabel = label;
    if (contactId) filter.contact   = contactId;

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

// GET /api/calls/stats/summary  — dashboard numbers
router.get('/stats/summary', auth, async (req, res) => {
  try {
    const [total, warm, hot, escalated] = await Promise.all([
      CallLog.countDocuments(),
      CallLog.countDocuments({ leadLabel: 'warm' }),
      CallLog.countDocuments({ leadLabel: 'hot' }),
      CallLog.countDocuments({ escalated: true }),
    ]);
    res.json({ total, warm, hot, escalated, cold: total - warm - hot });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
