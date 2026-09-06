/**
 * routes/extension.js — API consumed by the MedCall Filler Chrome extension.
 *
 * Security model: the extension can ONLY see APPROVED drafts (their validated
 * formPayload). Pending/rejected drafts and raw call data are never exposed.
 *
 * GET  /api/extension/ping                 validate the API key
 * GET  /api/extension/drafts?q=            approved, not-yet-entered drafts
 * GET  /api/extension/drafts/:id           one draft's fill payload
 * POST /api/extension/drafts/:id/entered   mark as entered after form submit
 */
const router = require('express').Router();
const extensionAuth  = require('../middleware/extensionAuth');
const DataEntryDraft = require('../models/DataEntryDraft');

router.use(extensionAuth);

// GET /api/extension/ping
router.get('/ping', (_req, res) => res.json({ ok: true, service: 'medcall-extension-api' }));

// GET /api/extension/drafts?q=ahmed
router.get('/drafts', async (req, res) => {
  try {
    const drafts = await DataEntryDraft.find({ status: 'approved' })
      .populate('contact', 'name phone')
      .populate('project', 'name dataEntry')
      .select('contact project formPayload reviewedAt createdAt')
      .sort('-reviewedAt')
      .limit(50);

    const q = (req.query.q || '').toLowerCase().trim();
    const filtered = q
      ? drafts.filter(d =>
          d.contact?.name?.toLowerCase().includes(q) ||
          d.contact?.phone?.includes(q))
      : drafts;

    res.json(filtered.map(d => ({
      id:         d._id,
      name:       d.contact?.name,
      phone:      d.contact?.phone,
      approvedAt: d.reviewedAt,
      // Phase 6: which project this draft belongs to + its data-entry site
      project:    d.project?.name || null,
      websiteUrl: d.project?.dataEntry?.websiteUrl || null,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/extension/drafts/:id — the exact payload to fill
router.get('/drafts/:id', async (req, res) => {
  try {
    const draft = await DataEntryDraft.findOne({ _id: req.params.id, status: 'approved' })
      .populate('contact', 'name phone')
      .populate('project', 'name dataEntry');
    if (!draft) return res.status(404).json({ error: 'Approved draft not found' });

    // Phase 6: ship the project's data-entry config with the payload
    const hasMapping = Object.keys(draft.project?.dataEntry?.fieldMappings || {}).length > 0;
    res.json({
      id:          draft._id,
      name:        draft.contact?.name,
      project:     draft.project?.name || null,
      formPayload: draft.formPayload || {},
      dataEntry: (draft.project?.dataEntry?.websiteUrl || hasMapping) ? {
        websiteUrl:    draft.project.dataEntry.websiteUrl || null,
        fieldMappings: draft.project.dataEntry.fieldMappings || {},
      } : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/extension/drafts/:id/entered
router.post('/drafts/:id/entered', async (req, res) => {
  try {
    const draft = await DataEntryDraft.findOneAndUpdate(
      { _id: req.params.id, status: 'approved' },
      { status: 'entered', enteredAt: new Date(), enteredBy: req.extensionKey.slice(0, 6) + '…' },
      { new: true }
    );
    if (!draft) return res.status(404).json({ error: 'Approved draft not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
