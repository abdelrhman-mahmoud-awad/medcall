/**
 * routes/analytics.js — aggregated stats for the analytics dashboard.
 *
 * GET /api/analytics/summary   totals, lead/status breakdown, avg score
 * GET /api/analytics/timeline  calls per day (default: last 30 days)
 */
const router  = require('express').Router();
const auth    = require('../middleware/auth');
const CallLog = require('../models/CallLog');

// GET /api/analytics/summary?from=&to=&scriptId=
router.get('/summary', auth, async (req, res) => {
  try {
    const { from, to, scriptId } = req.query;
    const match = {};
    if (from || to) match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(from);
    if (to)   match.createdAt.$lte = new Date(to);
    if (scriptId) match.script = scriptId;

    const [totals, byLabel, byStatus, avgScore] = await Promise.all([
      CallLog.countDocuments(match),
      CallLog.aggregate([
        { $match: match },
        { $group: { _id: '$leadLabel', count: { $sum: 1 } } },
      ]),
      CallLog.aggregate([
        { $match: match },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      CallLog.aggregate([
        { $match: { ...match, leadScore: { $exists: true } } },
        { $group: { _id: null, avg: { $avg: '$leadScore' } } },
      ]),
    ]);

    res.json({
      totalCalls: totals,
      byLabel:    Object.fromEntries(byLabel.map(b => [b._id, b.count])),
      byStatus:   Object.fromEntries(byStatus.map(b => [b._id, b.count])),
      avgScore:   avgScore[0]?.avg?.toFixed(1) || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/timeline?days=30 — calls per day
router.get('/timeline', auth, async (req, res) => {
  try {
    const days  = parseInt(req.query.days) || 30;
    const since = new Date(Date.now() - days * 86_400_000);

    const data = await CallLog.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: {
        _id:   { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        calls: { $sum: 1 },
        warm:  { $sum: { $cond: [{ $eq: ['$leadLabel', 'warm'] }, 1, 0] } },
      }},
      { $sort: { _id: 1 } },
    ]);

    res.json(data.map(d => ({ date: d._id, calls: d.calls, warm: d.warm })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
