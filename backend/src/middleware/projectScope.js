const Project = require('../models/Project');

/**
 * Optional ?project=<id> scoping for list endpoints.
 *
 * - No `project` query param → no-op (unscoped, existing behaviour).
 * - With a param, the project must exist and the requester must be its
 *   manager (owner) or an attached member — otherwise 403.
 * - On success `req.scopeProject` is set for the route handler to use.
 */
module.exports = async function projectScope(req, res, next) {
  const projectId = req.query.project;
  if (!projectId) return next();

  try {
    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const isOwner  = String(project.manager) === String(req.user._id);
    const isMember = (project.members || []).some(m => String(m) === String(req.user._id));
    if (!isOwner && !isMember) return res.status(403).json({ error: 'Not your project' });

    req.scopeProject = project;
    next();
  } catch {
    res.status(400).json({ error: 'Invalid project id' });
  }
};
