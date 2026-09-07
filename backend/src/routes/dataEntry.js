/**
 * routes/dataEntry.js — human review of data-entry drafts.
 *
 * GET  /api/data-entry                 list drafts (?status=pending|approved|entered|rejected)
 * GET  /api/data-entry/schema          the fixed form schema (drives the review UI)
 * GET  /api/data-entry/:id             draft + transcript + recording link
 * PUT  /api/data-entry/:id             edit extracted fields (audit-logged)
 * POST /api/data-entry/:id/approve     approve → AI builds validated formPayload
 * POST /api/data-entry/:id/reject      archive with a reason
 * POST /api/data-entry/:id/regenerate  re-run AI extraction on the transcript
 */
const router  = require('express').Router();
const auth    = require('../middleware/auth');
const DataEntryDraft = require('../models/DataEntryDraft');
const CallLog = require('../models/CallLog');
const { generateDraft, buildFormPayload, formSchema } = require('../services/dataEntryService');

// GET /api/data-entry/schema
router.get('/schema', auth, (_req, res) => res.json(formSchema));

// GET /api/data-entry?status=pending
router.get('/', auth, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const drafts = await DataEntryDraft.find(filter)
      .populate('contact', 'name phone specialty city type dataEntryUrl dataEntryStatus')
      .sort('-createdAt')
      .limit(200);
    res.json(drafts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/data-entry/:id — full detail for the review screen
router.get('/:id', auth, async (req, res) => {
  try {
    const draft = await DataEntryDraft.findById(req.params.id)
      .populate('contact', 'name phone specialty city type dataEntryUrl dataEntryStatus')
      .populate('call', 'transcript leadScore leadLabel endedAt durationSec drive recordingUrl status')
      .populate('project', 'name');
    if (!draft) return res.status(404).json({ error: 'Draft not found' });

    // Phase 6: the review UI renders THIS draft's project schema
    const { schemaForDraft } = require('../services/projectConfigService');
    const schema = await schemaForDraft(draft);
    res.json({ ...draft.toObject(), schema });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/data-entry/:id — edit fields (only while pending)
router.put('/:id', auth, async (req, res) => {
  try {
    const draft = await DataEntryDraft.findById(req.params.id);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    if (draft.status !== 'pending') {
      return res.status(400).json({ error: `Cannot edit a ${draft.status} draft` });
    }

    const updates = req.body.fields || {};
    for (const [key, value] of Object.entries(updates)) {
      if (draft.fields[key] === value) continue;
      draft.edits.push({ field: key, from: draft.fields[key], to: value, by: req.user._id });
      draft.fields[key] = value;
      draft.needsReview = draft.needsReview.filter(k => k !== key);
    }
    draft.markModified('fields');
    await draft.save();
    res.json(draft);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/data-entry/:id/approve — approve + build the extension payload
router.post('/:id/approve', auth, async (req, res) => {
  try {
    const draft = await DataEntryDraft.findById(req.params.id);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    if (draft.status !== 'pending') {
      return res.status(400).json({ error: `Draft is already ${draft.status}` });
    }

    // AI Form Formatter: approved data → validated payload JSON
    try {
      draft.formPayload = await buildFormPayload(draft);
      draft.formPayloadError = undefined;
    } catch (err) {
      draft.formPayloadError = err.message;
      await draft.save();
      return res.status(422).json({ error: `Payload build failed: ${err.message}` });
    }

    draft.status     = 'approved';
    draft.reviewedBy = req.user._id;
    draft.reviewedAt = new Date();
    await draft.save();

    // Archive the payload next to the recording on Drive (non-fatal)
    try {
      const { archivePayload } = require('../services/driveService');
      archivePayload(draft).catch(e => console.warn('📁 Payload archive failed:', e.message));
    } catch { /* drive service optional */ }

    res.json(draft);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/data-entry/:id/reject
router.post('/:id/reject', auth, async (req, res) => {
  try {
    const draft = await DataEntryDraft.findByIdAndUpdate(req.params.id, {
      status: 'rejected',
      rejectReason: req.body.reason || '',
      reviewedBy: req.user._id,
      reviewedAt: new Date(),
    }, { new: true });
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    res.json(draft);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/data-entry/:id/regenerate — re-run AI extraction
router.post('/:id/regenerate', auth, async (req, res) => {
  try {
    const draft = await DataEntryDraft.findById(req.params.id);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    if (draft.status !== 'pending') {
      return res.status(400).json({ error: `Cannot regenerate a ${draft.status} draft` });
    }

    const callLog = await CallLog.findById(draft.call).populate('contact');
    await DataEntryDraft.findByIdAndDelete(draft._id);
    const fresh = await generateDraft(callLog);
    res.json(fresh);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
