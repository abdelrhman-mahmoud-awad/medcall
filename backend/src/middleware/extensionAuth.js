/**
 * extensionAuth.js — static API-key auth for the Chrome extension.
 *
 * Keys live in EXTENSION_API_KEYS (comma-separated, one per rep) so revoking
 * a rep's key never touches dashboard JWT logins.
 */
module.exports = function extensionAuth(req, res, next) {
  const keys = (process.env.EXTENSION_API_KEYS || '')
    .split(',').map(k => k.trim()).filter(Boolean);

  if (!keys.length) {
    return res.status(503).json({ error: 'Extension API disabled: set EXTENSION_API_KEYS in backend/.env' });
  }

  const provided = req.get('x-api-key');
  if (!provided || !keys.includes(provided)) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  req.extensionKey = provided;
  next();
};
