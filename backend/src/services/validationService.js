/**
 * validationService.js — Excel row validation + data change detection.
 *
 * validateRow()   — rejects rows with invalid phone / missing name / wrong
 *                   type / duplicate phone inside the same sheet.
 * detectChanges() — compares a sheet row against the existing DB contact.
 *                   Differences in watched fields become PENDING ContactChanges
 *                   (nothing is overwritten until a human approves).
 * reviewChange()  — approve (apply new value) or reject (keep old value).
 */
const Contact       = require('../models/Contact');
const ContactChange = require('../models/ContactChange');

// Egyptian mobile in E.164: +201 followed by 0/1/2/5 + 8 digits
const PHONE_RE = /^\+20(10|11|12|15)\d{8}$/;
const TYPES    = ['physician', 'pharmacist'];

// Fields that trigger a pending change when they differ from the DB
const WATCHED_FIELDS = ['phone', 'city', 'name', 'specialty'];

/** Normalize common sheet formats: 01xxxxxxxxx, 201..., 0020... -> +20... */
function normalizePhone(raw) {
  let p = String(raw || '').replace(/[\s\-()]/g, '');
  if (p.startsWith('0020')) p = '+20' + p.slice(4);
  else if (p.startsWith('20') && !p.startsWith('+')) p = '+' + p;
  else if (p.startsWith('01')) p = '+2' + p;
  return p;
}

/**
 * Validate one sheet row.
 * @param {object} row        raw cell values { name, phone, type, specialty, city }
 * @param {number} rowNumber  1-based Excel row number (for error reporting)
 * @param {Map}    seenPhones phones already seen in this sheet -> row number
 * @returns {{ valid: boolean, errors: string[], data: object, rowNumber: number }}
 */
function validateRow(row, rowNumber, seenPhones) {
  const errors = [];
  const data = {
    name:      String(row.name || '').trim(),
    phone:     normalizePhone(row.phone),
    type:      String(row.type || 'physician').trim().toLowerCase(),
    specialty: String(row.specialty || '').trim(),
    city:      String(row.city || '').trim(),
  };

  if (!data.name)                 errors.push('Name is missing');
  if (!PHONE_RE.test(data.phone)) errors.push(`Invalid phone number: ${row.phone}`);
  if (!TYPES.includes(data.type)) errors.push(`Type must be physician or pharmacist, got: ${data.type}`);
  if (seenPhones.has(data.phone)) errors.push(`Duplicate phone inside the sheet (first seen on row ${seenPhones.get(data.phone)})`);
  else seenPhones.set(data.phone, rowNumber);

  return { valid: errors.length === 0, errors, data, rowNumber };
}

/**
 * Compare a validated sheet row against the existing DB contact.
 * Any difference in the watched fields becomes a PENDING ContactChange —
 * the DB is NOT updated until someone approves it.
 *
 * Matching strategy: by excelRow first (same sheet position), then by phone.
 */
async function detectChanges(data, rowNumber, filePath) {
  const existing =
    await Contact.findOne({ excelRow: rowNumber, excelFile: filePath }) ||
    await Contact.findOne({ phone: data.phone });

  if (!existing) return { existing: null, changes: [] };

  const changes = [];
  for (const field of WATCHED_FIELDS) {
    const oldVal = String(existing[field] || '').trim();
    const newVal = String(data[field]     || '').trim();
    if (oldVal && newVal && oldVal !== newVal) {
      // Skip if an identical pending change already exists
      const dup = await ContactChange.findOne({
        contact: existing._id, field, newValue: newVal, status: 'pending',
      });
      if (dup) continue;

      const change = await ContactChange.create({
        contact: existing._id, field,
        oldValue: oldVal, newValue: newVal, excelRow: rowNumber,
      });
      changes.push(change);

      // Fire-and-forget AI verification (non-blocking; import stays fast)
      if (process.env.VERIFY_AUTO === 'true') {
        const { verifyChange } = require('./verificationAgent');
        verifyChange(change._id).catch(() => {});
      }
    }
  }
  return { existing, changes };
}

/** Approve: apply the new value to the contact. Reject: keep the old value. */
async function reviewChange(changeId, action, userId) {
  const change = await ContactChange.findById(changeId);
  if (!change || change.status !== 'pending') {
    throw new Error('Change not found or already reviewed');
  }

  if (action === 'approve') {
    await Contact.findByIdAndUpdate(change.contact, { [change.field]: change.newValue });
  }
  change.status     = action === 'approve' ? 'approved' : 'rejected';
  change.reviewedBy = userId;
  change.reviewedAt = new Date();
  await change.save();
  return change;
}

module.exports = { validateRow, normalizePhone, detectChanges, reviewChange };
