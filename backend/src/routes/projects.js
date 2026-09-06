/**
 * routes/projects.js — Phase 5: projects, members, sheet, targets, progress, insights.
 *
 * GET    /api/projects                      manager: own · member: attached
 * POST   /api/projects                      create { name, targets? }        (manager)
 * PUT    /api/projects/:id                  rename / targets / archive       (manager)
 * DELETE /api/projects/:id                  archive (soft delete)            (manager)
 * POST   /api/projects/:id/members         { name, email, password } → create member
 *                                           account under this manager + attach; or
 *                                           attach an existing member by email
 * DELETE /api/projects/:id/members/:userId  detach (account stays)           (manager)
 * POST   /api/projects/:id/sheet            multipart .xlsx OR { googleSheetUrl }
 * GET    /api/projects/:id/progress         totals + per-member vs targets   (both)
 * GET    /api/projects/:id/insights         AI interpretation (?refresh=true) (manager)
 */
const router = require('express').Router();
const multer = require('multer');
const fs     = require('fs');
const path   = require('path');

const auth           = require('../middleware/auth');
const requireManager = require('../middleware/requireManager');
const Project        = require('../models/Project');
const User           = require('../models/User');
const projectService = require('../services/projectService');

const upload = multer({ dest: path.resolve(__dirname, '../../data/uploads/') });

const isManagerRole = (u) => ['manager', 'admin', 'agent'].includes(u.role);

/** Load the project and verify access. Managers must OWN it; members must be IN it. */
async function loadProject(req, res, next, { managerOnly = false } = {}) {
  const project = await Project.findById(req.params.id).populate('members', 'name email role');
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const isOwner  = String(project.manager) === String(req.user._id);
  const isMember = project.members.some(m => String(m._id) === String(req.user._id));

  if (managerOnly && !isOwner) return res.status(403).json({ error: 'Not your project' });
  if (!managerOnly && !isOwner && !isMember) return res.status(403).json({ error: 'Not your project' });

  req.project = project;
  next();
}
const ownProject    = (req, res, next) => loadProject(req, res, next, { managerOnly: true });
const accessProject = (req, res, next) => loadProject(req, res, next);

// ─── List / create / update ───────────────────────────────────────────────────

// GET /api/projects
router.get('/', auth, async (req, res) => {
  try {
    const filter = isManagerRole(req.user)
      ? { manager: req.user._id }
      : { members: req.user._id };
    const projects = await Project.find({ ...filter, status: { $ne: 'archived' } })
      .populate('members', 'name email')
      .sort('-createdAt');
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects
router.post('/', auth, requireManager, async (req, res) => {
  try {
    const { name, targets } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Project name required' });
    const project = await Project.create({
      name: name.trim(),
      manager: req.user._id,
      targets: {
        calls: Number(targets?.calls) || 0,
        forms: Number(targets?.forms) || 0,
      },
    });
    res.status(201).json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/projects/:id — rename / edit targets / archive
router.put('/:id', auth, requireManager, ownProject, async (req, res) => {
  try {
    const { name, targets, status } = req.body;
    if (name?.trim()) req.project.name = name.trim();
    if (targets) {
      if (targets.calls !== undefined) req.project.targets.calls = Number(targets.calls) || 0;
      if (targets.forms !== undefined) req.project.targets.forms = Number(targets.forms) || 0;
    }
    if (status && ['active', 'archived'].includes(status)) req.project.status = status;
    await req.project.save();
    res.json(req.project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/projects/:id — soft delete
router.delete('/:id', auth, requireManager, ownProject, async (req, res) => {
  try {
    req.project.status = 'archived';
    await req.project.save();
    res.json({ success: true, archived: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Members ──────────────────────────────────────────────────────────────────

// POST /api/projects/:id/members — create member account + attach (or attach existing)
router.post('/:id/members', auth, requireManager, ownProject, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!email?.trim()) return res.status(400).json({ error: 'Email required' });

    let user = await User.findOne({ email: email.toLowerCase().trim() });

    if (user) {
      // Existing account: must be a member of THIS manager's team
      const isOwnMember = user.role === 'member' && String(user.manager) === String(req.user._id);
      if (!isOwnMember) {
        return res.status(409).json({ error: 'This email belongs to another account/team' });
      }
    } else {
      if (!name?.trim() || !password) {
        return res.status(400).json({ error: 'Name and password required for a new member' });
      }
      user = await User.create({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password,                       // bcrypt-hashed by the User pre-save hook
        role: 'member',
        manager: req.user._id,
      });
    }

    if (!req.project.members.some(m => String(m._id) === String(user._id))) {
      req.project.members.push(user._id);
      await req.project.save();
    }

    res.status(201).json({
      member: { id: user._id, name: user.name, email: user.email },
      created: !!password && user.createdAt > new Date(Date.now() - 5000),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/projects/:id/members/:userId — detach from project (account stays)
router.delete('/:id/members/:userId', auth, requireManager, ownProject, async (req, res) => {
  try {
    req.project.members = req.project.members.filter(
      m => String(m._id) !== String(req.params.userId)
    );
    await req.project.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Sheet ────────────────────────────────────────────────────────────────────

// POST /api/projects/:id/sheet — .xlsx upload OR { googleSheetUrl }
router.post('/:id/sheet', auth, requireManager, ownProject, upload.single('file'), async (req, res) => {
  try {
    let result;
    if (req.file) {
      const buffer = fs.readFileSync(req.file.path);
      fs.unlinkSync(req.file.path);
      result = await projectService.importSheet(req.project, {
        buffer,
        fileName: req.file.originalname,
      });
    } else if (req.body.googleSheetUrl) {
      result = await projectService.importSheet(req.project, {
        googleSheetUrl: req.body.googleSheetUrl.trim(),
      });
    } else {
      return res.status(400).json({ error: 'Upload an .xlsx file or provide googleSheetUrl' });
    }
    res.json({ success: true, ...result, sheet: req.project.sheet });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Phase 6: per-project settings ────────────────────────────────────────────

// GET /api/projects/:id/settings — settings + readiness + effective config
router.get('/:id/settings', auth, requireManager, ownProject, async (req, res) => {
  try {
    const cfg = require('../services/projectConfigService');
    const p = req.project;
    res.json({
      script:     p.script || null,
      formSchema: p.formSchema?.fields?.length ? { fields: p.formSchema.fields } : null,
      consent:    { line: p.consent?.line || '', required: p.consent?.required ?? null },
      dataEntry:  {
        websiteUrl:    p.dataEntry?.websiteUrl || '',
        fieldMappings: p.dataEntry?.fieldMappings || {},
      },
      readiness: await cfg.readiness(p),
      effective: cfg.effectiveConfig(p),   // what the pipeline will actually use
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/projects/:id/settings — partial update { script?, formSchema?, consent?, dataEntry? }
router.put('/:id/settings', auth, requireManager, ownProject, async (req, res) => {
  try {
    const cfg = require('../services/projectConfigService');
    const { script, formSchema, consent, dataEntry } = req.body;
    const p = req.project;

    if (script !== undefined) {
      if (script === null || script === '') {
        p.script = undefined;
      } else {
        const Script = require('../models/Script');
        if (!(await Script.findById(script))) return res.status(400).json({ error: 'Script not found' });
        p.script = script;
      }
    }

    if (formSchema !== undefined) {
      if (formSchema === null) {
        p.formSchema = { fields: [] };            // back to the global fallback
      } else {
        const check = cfg.validateFormSchema(formSchema.fields);
        if (!check.valid) return res.status(400).json({ error: check.errors.join(' · ') });
        p.formSchema = { fields: formSchema.fields };
      }
    }

    if (consent !== undefined) {
      p.consent = {
        line: (consent?.line || '').trim() || undefined,
        required: (consent?.required === true || consent?.required === false)
          ? consent.required : undefined,
      };
    }

    if (dataEntry !== undefined) {
      const mappings = {};
      for (const [selector, key] of Object.entries(dataEntry?.fieldMappings || {})) {
        if (selector?.trim() && typeof key === 'string' && key.trim()) {
          mappings[selector.trim()] = key.trim();
        }
      }
      p.dataEntry = {
        websiteUrl: (dataEntry?.websiteUrl || '').trim() || undefined,
        fieldMappings: mappings,
      };
      p.markModified('dataEntry');
    }

    await p.save();
    res.json({
      success: true,
      readiness: await cfg.readiness(p),
      effective: cfg.effectiveConfig(p),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Progress & insights ──────────────────────────────────────────────────────

// GET /api/projects/:id/progress — manager or member
router.get('/:id/progress', auth, accessProject, async (req, res) => {
  try {
    res.json(await projectService.getProgress(req.project));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/:id/insights?refresh=true — manager only
router.get('/:id/insights', auth, requireManager, ownProject, async (req, res) => {
  try {
    const refresh = req.query.refresh === 'true';
    res.json(await projectService.generateInsights(req.project, { refresh }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
