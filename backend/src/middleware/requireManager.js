/**
 * requireManager — guards manager-only routes. Sits AFTER the auth middleware.
 * Legacy 'admin'/'agent' accounts (pre-Phase 5) are treated as managers so
 * existing installs keep working.
 */
module.exports = (req, res, next) => {
  const role = req.user?.role;
  if (role === 'manager' || role === 'admin' || role === 'agent') return next();
  return res.status(403).json({ error: 'Manager access required' });
};
