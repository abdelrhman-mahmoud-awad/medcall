/**
 * routes/campaigns.js — Campaign CRUD + launch/pause/resume.
 *
 * GET  /api/campaigns             list campaigns
 * POST /api/campaigns             create a campaign (draft)
 * POST /api/campaigns/:id/launch  enqueue all its calls (needs Redis)
 * POST /api/campaigns/:id/pause   pause the queue
 * POST /api/campaigns/:id/resume  resume the queue
 */
const router   = require('express').Router();
const auth     = require('../middleware/auth');
const Campaign = require('../models/Campaign');
const queue    = require('../queues/callQueue');

// GET /api/campaigns
router.get('/', auth, async (req, res) => {
  try {
    const campaigns = await Campaign.find()
      .populate('script', 'name drugName')
      .sort('-createdAt');
    res.json(campaigns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/campaigns — create a campaign (draft)
router.post('/', auth, async (req, res) => {
  try {
    const { name, scriptId, contactIds } = req.body;
    if (!name || !scriptId || !contactIds?.length) {
      return res.status(400).json({ error: 'name, scriptId and contactIds are required' });
    }
    const campaign = await Campaign.create({
      name,
      script:     scriptId,
      contacts:   contactIds,
      createdBy:  req.user._id,
      totalCalls: contactIds.length,
    });
    res.json(campaign);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/campaigns/:id/launch — enqueue all calls
router.post('/:id/launch', auth, async (req, res) => {
  try {
    if (!queue) {
      return res.status(503).json({
        error: 'Mass calling requires Redis. Set REDIS_URL in backend/.env and restart.',
      });
    }

    const campaign = await Campaign.findById(req.params.id).populate('contacts');
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (campaign.status === 'running') {
      return res.status(400).json({ error: 'Campaign is already running' });
    }

    await Campaign.findByIdAndUpdate(campaign._id, {
      status: 'running',
      startedAt: new Date(),
    });

    for (const contact of campaign.contacts) {
      await queue.add({
        contactId:   contact._id,
        scriptId:    campaign.script,
        campaignId:  campaign._id,
        initiatedBy: req.user._id,
      }, {
        attempts: 2,
        backoff: { type: 'fixed', delay: 30_000 },
        removeOnComplete: true,
      });
    }

    res.json({ success: true, queued: campaign.contacts.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/campaigns/:id/pause
router.post('/:id/pause', auth, async (req, res) => {
  try {
    if (queue) await queue.pause();
    await Campaign.findByIdAndUpdate(req.params.id, { status: 'paused' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/campaigns/:id/resume
router.post('/:id/resume', auth, async (req, res) => {
  try {
    if (queue) await queue.resume();
    await Campaign.findByIdAndUpdate(req.params.id, { status: 'running' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
