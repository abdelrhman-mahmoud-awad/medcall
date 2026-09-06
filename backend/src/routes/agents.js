/**
 * routes/agents.js — manage human agents for call escalation.
 *
 * GET    /api/agents        list agents
 * POST   /api/agents        create an agent
 * PUT    /api/agents/:id    update an agent (e.g. toggle availability)
 * DELETE /api/agents/:id    remove an agent
 */
const router = require('express').Router();
const auth   = require('../middleware/auth');
const Agent  = require('../models/Agent');

// GET /api/agents
router.get('/', auth, async (req, res) => {
  try {
    const agents = await Agent.find().sort('-createdAt');
    res.json(agents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agents
router.post('/', auth, async (req, res) => {
  try {
    const { name, phone, email } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: 'name and phone are required' });
    }
    const agent = await Agent.create({ name, phone, email });
    res.json(agent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/agents/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, phone, email, available } = req.body;
    const agent = await Agent.findByIdAndUpdate(
      req.params.id,
      { ...(name !== undefined && { name }),
        ...(phone !== undefined && { phone }),
        ...(email !== undefined && { email }),
        ...(available !== undefined && { available }) },
      { new: true }
    );
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    res.json(agent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/agents/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const agent = await Agent.findByIdAndDelete(req.params.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
