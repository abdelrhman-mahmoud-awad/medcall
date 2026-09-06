const router       = require('express').Router();
const auth         = require('../middleware/auth');
const projectScope = require('../middleware/projectScope');
const Contact      = require('../models/Contact');

// GET /api/contacts — supports optional ?project=<id> scoping (Contact.project)
router.get('/', auth, projectScope, async (req, res) => {
  try {
    const { type, city, search, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (req.scopeProject) filter.project = req.scopeProject._id;
    if (type)   filter.type = type;
    if (city)   filter.city = new RegExp(city, 'i');
    if (search) filter.$or = [
      { name:    new RegExp(search, 'i') },
      { clinic:  new RegExp(search, 'i') },
      { phone:   new RegExp(search, 'i') },
    ];

    const total    = await Contact.countDocuments(filter);
    const contacts = await Contact.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ contacts, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/contacts
router.post('/', auth, async (req, res) => {
  try {
    const contact = await Contact.create(req.body);
    res.status(201).json(contact);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/contacts/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) return res.status(404).json({ error: 'Not found' });
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/contacts/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const contact = await Contact.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!contact) return res.status(404).json({ error: 'Not found' });
    res.json(contact);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/contacts/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    await Contact.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
