/**
 * routes/excel.js — Excel sync endpoints.
 *
 * POST /api/excel/upload               upload a sheet, make it the master, import
 * POST /api/excel/sync                 re-push ALL completed calls to the sheet
 * GET  /api/excel/download             download full call-results workbook
 * GET  /api/excel/status               sync health for the dashboard
 * GET  /api/excel/changes              pending data changes awaiting review
 * POST /api/excel/changes/:id/approve  apply the new value to the contact
 * POST /api/excel/changes/:id/reject   keep the old value
 * POST /api/excel/changes/:id/verify   (re)run AI verification on one change
 * POST /api/excel/verify/:contactId    spot-check any contact online (Gemini)
 */
const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const auth    = require('../middleware/auth');
const CallLog = require('../models/CallLog');
const Contact = require('../models/Contact');
const ContactChange = require('../models/ContactChange');
const { importFromExcel, updateRowForCall, exportCallLogs, FILE } = require('../services/excelService');
const { reviewChange } = require('../services/validationService');
const { verifyChange, verifyContact } = require('../services/verificationAgent');

const upload = multer({ dest: path.resolve(__dirname, '../../data/uploads/') });

// POST /api/excel/upload — upload a sheet, make it the master, import contacts
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const dest = FILE();
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(req.file.path, dest);
    fs.unlinkSync(req.file.path);

    const result = await importFromExcel(dest);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/excel/sync — re-push ALL completed calls to the sheet (repair/catch-up)
router.post('/sync', auth, async (req, res) => {
  try {
    const logs = await CallLog.find({ status: { $in: ['completed', 'escalated'] } });
    let updated = 0, skipped = 0;
    for (const log of logs) {
      const r = await updateRowForCall(log);
      r.skipped ? skipped++ : updated++;
    }
    res.json({ success: true, updated, skipped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/excel/download — download full call-results workbook
router.get('/download', auth, async (req, res) => {
  try {
    const buffer = await exportCallLogs(CallLog);
    res.setHeader('Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',
      `attachment; filename=medcall_results_${Date.now()}.xlsx`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/excel/status — sync health for the dashboard
router.get('/status', auth, async (req, res) => {
  const [total, linked, synced, pending] = await Promise.all([
    Contact.countDocuments(),
    Contact.countDocuments({ excelRow: { $exists: true } }),
    Contact.countDocuments({ excelSynced: true }),
    ContactChange.countDocuments({ status: 'pending' }),
  ]);
  res.json({
    total, linked, synced,
    pendingChanges: pending,
    autoSync:   process.env.EXCEL_AUTO_SYNC === 'true',
    autoVerify: process.env.VERIFY_AUTO === 'true',
  });
});

// GET /api/excel/changes — pending data changes awaiting review
router.get('/changes', auth, async (req, res) => {
  const changes = await ContactChange.find({ status: 'pending' })
    .populate('contact', 'name phone city')
    .sort('-createdAt');
  res.json(changes);
});

// POST /api/excel/changes/:id/approve — apply the new value to the contact
router.post('/changes/:id/approve', auth, async (req, res) => {
  try {
    res.json(await reviewChange(req.params.id, 'approve', req.user._id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/excel/changes/:id/reject — keep the old value
router.post('/changes/:id/reject', auth, async (req, res) => {
  try {
    res.json(await reviewChange(req.params.id, 'reject', req.user._id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/excel/changes/:id/verify — (re)run AI verification on one change
router.post('/changes/:id/verify', auth, async (req, res) => {
  try {
    await verifyChange(req.params.id);
    const change = await ContactChange.findById(req.params.id)
      .populate('contact', 'name phone city');
    res.json(change);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/excel/verify/:contactId — spot-check any contact online
router.post('/verify/:contactId', auth, async (req, res) => {
  try {
    res.json(await verifyContact(req.params.contactId));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
