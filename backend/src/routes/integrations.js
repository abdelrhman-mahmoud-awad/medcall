/**
 * routes/integrations.js — third-party integrations (Google Drive OAuth).
 *
 * GET    /api/integrations/google/status     connection state (dashboard card)
 * GET    /api/integrations/google/connect    returns the Google consent URL
 * GET    /api/integrations/google/callback   OAuth redirect target (state-verified, no JWT)
 * DELETE /api/integrations/google            disconnect + revoke the token
 */
const router = require('express').Router();
const jwt    = require('jsonwebtoken');
const auth   = require('../middleware/auth');
const driveService = require('../services/driveService');

// GET /api/integrations/google/status
router.get('/google/status', auth, async (_req, res) => {
  try {
    res.json(await driveService.getStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/integrations/google/connect — dashboard asks for the consent URL
router.get('/google/connect', auth, (req, res) => {
  try {
    // Short-lived signed state = CSRF guard for the callback
    const state = jwt.sign(
      { p: 'gdrive', u: String(req.user._id) },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );
    res.json({ url: driveService.getAuthUrl(state) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/integrations/google/callback — Google redirects the browser here
router.get('/google/callback', async (req, res) => {
  const client = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
  try {
    const { code, state, error } = req.query;
    if (error) throw new Error(error);
    if (!code)  throw new Error('Missing authorization code');

    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    if (decoded.p !== 'gdrive') throw new Error('Invalid state');

    await driveService.handleOAuthCallback(code, decoded.u);
    res.redirect(`${client}/integrations?drive=connected`);
  } catch (err) {
    console.error('Google Drive connect failed:', err.message);
    res.redirect(`${client}/integrations?drive=error&message=${encodeURIComponent(err.message)}`);
  }
});

// DELETE /api/integrations/google
router.delete('/google', auth, async (_req, res) => {
  try {
    res.json({ success: await driveService.disconnect() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
