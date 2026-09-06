const router  = require('express').Router();
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');
const auth           = require('../middleware/auth');
const requireManager = require('../middleware/requireManager');

const sign = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'All fields required' });

    if (await User.findOne({ email }))
      return res.status(409).json({ error: 'Email already registered' });

    // Phase 5: whoever registers is a MANAGER (members are created by managers)
    const user = await User.create({ name, email, password, role: 'manager' });
    res.status(201).json({
      token: sign(user._id),
      user: { id: user._id, name, email, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password)))
      return res.status(401).json({ error: 'Invalid credentials' });

    res.json({
      token: sign(user._id),
      user: { id: user._id, name: user.name, email, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Account (Phase 5: manager / member) ───────────────────────────────────────

// GET /api/auth/me — current account
router.get('/me', auth, (req, res) => {
  const u = req.user;
  res.json({ id: u._id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt });
});

// PUT /api/auth/me — update name and/or password
router.put('/me', auth, async (req, res) => {
  try {
    const { name, currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);

    if (name?.trim()) user.name = name.trim();

    if (newPassword) {
      if (newPassword.length < 6)
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
      if (!currentPassword || !(await user.matchPassword(currentPassword)))
        return res.status(401).json({ error: 'Current password is incorrect' });
      user.password = newPassword;      // bcrypt-hashed by the pre-save hook
    }

    await user.save();
    res.json({ id: user._id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/team — manager: list member accounts under them (+ their projects)
router.get('/team', auth, requireManager, async (req, res) => {
  try {
    const Project = require('../models/Project');
    const [members, projects] = await Promise.all([
      User.find({ role: 'member', manager: req.user._id })
        .select('name email createdAt').sort('-createdAt'),
      Project.find({ manager: req.user._id, status: { $ne: 'archived' } })
        .select('name members'),
    ]);
    res.json(members.map(m => ({
      id: m._id, name: m.name, email: m.email, createdAt: m.createdAt,
      projects: projects
        .filter(p => p.members.some(id => String(id) === String(m._id)))
        .map(p => p.name),
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/team — manager: create a member account (attach via Projects later)
router.post('/team', auth, requireManager, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name?.trim() || !email?.trim() || !password)
      return res.status(400).json({ error: 'Name, email, and password are required' });
    if (await User.findOne({ email: email.toLowerCase().trim() }))
      return res.status(409).json({ error: 'Email already registered' });

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: 'member',
      manager: req.user._id,
    });
    res.status(201).json({ id: user._id, name: user.name, email: user.email, projects: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
