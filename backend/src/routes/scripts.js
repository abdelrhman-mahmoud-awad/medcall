const router       = require('express').Router();
const auth         = require('../middleware/auth');
const projectScope = require('../middleware/projectScope');
const Script       = require('../models/Script');

// GET /api/scripts — supports optional ?project=<id>.
// Scripts have no project field; a project binds ONE script (Project.script).
// When scoped and the project has a bound script, return just that script.
// When the project has no bound script, fall back to all active scripts
// (mirrors the global-fallback behaviour of the call pipeline).
router.get('/', auth, projectScope, async (req, res) => {
  try {
    const filter = { active: true };
    if (req.scopeProject?.script) filter._id = req.scopeProject.script;
    const scripts = await Script.find(filter).sort({ createdAt: -1 });
    res.json(scripts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scripts
router.post('/', auth, async (req, res) => {
  try {
    const script = await Script.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json(script);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/scripts/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const script = await Script.findById(req.params.id);
    if (!script) return res.status(404).json({ error: 'Not found' });
    res.json(script);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/scripts/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const script = await Script.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!script) return res.status(404).json({ error: 'Not found' });
    res.json(script);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/scripts/:id (soft delete)
router.delete('/:id', auth, async (req, res) => {
  try {
    await Script.findByIdAndUpdate(req.params.id, { active: false });
    res.json({ message: 'Archived' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
