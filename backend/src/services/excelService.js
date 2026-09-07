/**
 * excelService.js — Excel sheet as the source of truth.
 *
 * importFromExcel()  — validated import; remembers each contact's row number.
 * updateRowForCall() — writes a finished call back into the contact's row
 *                      (status, score, colored label, answers, summary).
 * exportCallLogs()   — full call-results workbook for download.
 */
const ExcelJS = require('exceljs');
const path    = require('path');
const Contact = require('../models/Contact');
const { validateRow, detectChanges } = require('./validationService');

const BACKEND_ROOT = path.resolve(__dirname, '../..');
const FILE  = () => path.resolve(BACKEND_ROOT, process.env.EXCEL_FILE_PATH || './data/contacts.xlsx');
const SHEET = () => process.env.EXCEL_SHEET_NAME || 'Sheet1';

// Column map — input (A–E) and result columns (F–K)
const COLS = {
  name: 1, phone: 2, type: 3, specialty: 4, city: 5,
  status: 6, score: 7, label: 8, lastCalled: 9, answers: 10, summary: 11,
};

const RESULT_HEADERS = {
  6: 'Call Status', 7: 'Lead Score', 8: 'Lead Label',
  9: 'Last Called', 10: 'Answers', 11: 'Summary',
};

async function _open(filePath = FILE()) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.getWorksheet(SHEET()) || wb.worksheets[0];
  return { wb, ws };
}

/** Ensure result headers exist on row 1 (added once, non-destructive). */
function _ensureHeaders(ws) {
  for (const [col, title] of Object.entries(RESULT_HEADERS)) {
    const cell = ws.getRow(1).getCell(Number(col));
    if (!cell.value) cell.value = title;
  }
}

/**
 * Import all rows into MongoDB with validation + change detection.
 * - Invalid rows are rejected and reported (never imported).
 * - Existing contacts whose data changed produce PENDING changes for review.
 * - New valid contacts are created, remembering their row for write-back.
 */
async function importFromExcel(filePath = FILE()) {
  const { ws } = await _open(filePath);
  let imported = 0, linked = 0, skipped = 0;
  const invalidRows = [], pendingChanges = [];
  const seenPhones = new Map();

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const raw = {
      name:      row.getCell(COLS.name).value,
      phone:     row.getCell(COLS.phone).value,
      type:      row.getCell(COLS.type).value,
      specialty: row.getCell(COLS.specialty).value,
      city:      row.getCell(COLS.city).value,
    };
    if (!raw.phone && !raw.name) { skipped++; continue; }   // empty row

    // 1) Validate
    const check = validateRow(raw, r, seenPhones);
    if (!check.valid) {
      invalidRows.push({ row: r, errors: check.errors });
      continue;                                             // never import bad rows
    }

    // 2) Detect changes vs existing contact
    const { existing, changes } = await detectChanges(check.data, r, filePath);
    if (existing) {
      pendingChanges.push(...changes);
      await Contact.findByIdAndUpdate(existing._id, { excelRow: r, excelFile: filePath });
      linked++;
      continue;                                             // data NOT overwritten
    }

    // 3) Brand-new contact -> import
    await Contact.create({ ...check.data, excelRow: r, excelFile: filePath });
    imported++;
  }

  return {
    imported, linked, skipped,
    invalidRows,                           // [{ row: 7, errors: ['Invalid phone…'] }]
    pendingChanges: pendingChanges.length, // review at /api/excel/changes
  };
}

const normalizeCell = (value) => String(value ?? '').trim();
const normalizeMatch = (value) => normalizeCell(value).toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]/gi, '');
const normalizePhone = (value) => normalizeCell(value).replace(/\D/g, '').replace(/^20/, '0');

/**
 * Import the delayed successful-doctors sheet. This sheet is deliberately
 * separate from the master call list: it only attaches each doctor's unique
 * data-entry URL and never replaces contact fields.
 */
async function importSuccessfulDoctors(filePath) {
  const { ws } = await _open(filePath);
  const headers = [];
  ws.getRow(1).eachCell((cell, col) => {
    headers[col] = normalizeCell(cell.value).toLowerCase();
  });
  const findColumn = (patterns) => headers.findIndex(header => patterns.some(pattern => pattern.test(header)));
  const phoneCol = findColumn([/phone/, /mobile/, /tel/]);
  const nameCol = findColumn([/^name$/, /doctor/, /physician/]);
  const clinicCol = findColumn([/clinic/, /hospital/, /practice/]);
  const urlCol = findColumn([/data.*entry/, /entry.*link/, /url/, /link/]);

  const contacts = await Contact.find({}, 'name phone clinic').lean();
  const byPhone = new Map(contacts.map(contact => [normalizePhone(contact.phone), contact]));
  const result = { linked: 0, withLinks: 0, pending: 0, unmatched: 0, duplicates: 0, skipped: 0, rows: [] };

  for (let rowNumber = 2; rowNumber <= ws.rowCount; rowNumber++) {
    const row = ws.getRow(rowNumber);
    const url = urlCol > 0 ? normalizeCell(row.getCell(urlCol).text || row.getCell(urlCol).value) : '';

    const phone = phoneCol > 0 ? normalizePhone(row.getCell(phoneCol).text || row.getCell(phoneCol).value) : '';
    const name = nameCol > 0 ? normalizeMatch(row.getCell(nameCol).text || row.getCell(nameCol).value) : '';
    const clinic = clinicCol > 0 ? normalizeMatch(row.getCell(clinicCol).text || row.getCell(clinicCol).value) : '';
    let matches = phone ? (byPhone.has(phone) ? [byPhone.get(phone)] : []) : [];
    if (!matches.length && name) {
      matches = contacts.filter(contact => normalizeMatch(contact.name) === name &&
        (!clinic || normalizeMatch(contact.clinic) === clinic));
    }
    if (matches.length !== 1) {
      if (matches.length > 1) result.duplicates++;
      else result.unmatched++;
      result.rows.push({ row: rowNumber, name, phone, status: matches.length > 1 ? 'duplicate' : 'unmatched' });
      continue;
    }

    const update = { dataEntrySourceRow: rowNumber };
    if (url) {
      update.dataEntryUrl = url;
      update.dataEntryStatus = 'received';
      update.dataEntryReceivedAt = new Date();
      result.withLinks++;
    } else {
      update.dataEntryStatus = 'pending';
      result.pending++;
    }
    await Contact.findByIdAndUpdate(matches[0]._id, update);
    result.linked++;
  }
  return result;
}

/**
 * Write one finished call back into the contact's Excel row.
 * Called automatically from callSession._finalize() when EXCEL_AUTO_SYNC=true.
 */
async function updateRowForCall(callLog) {
  const contact = await Contact.findById(callLog.contact);
  if (!contact?.excelRow) {
    return { skipped: true, reason: 'contact not linked to a sheet row' };
  }

  const filePath = contact.excelFile || FILE();
  const { wb, ws } = await _open(filePath);
  _ensureHeaders(ws);

  const row = ws.getRow(contact.excelRow);
  row.getCell(COLS.status).value     = callLog.status;
  row.getCell(COLS.score).value      = callLog.leadScore ?? '';
  row.getCell(COLS.label).value      = callLog.leadLabel ?? '';
  row.getCell(COLS.lastCalled).value = callLog.endedAt
    ? new Date(callLog.endedAt).toLocaleString('en-GB') : '';
  row.getCell(COLS.answers).value    = (callLog.responses || [])
    .map(x => `${x.questionKey}: ${x.answer} (${x.sentiment})`).join(' | ');
  row.getCell(COLS.summary).value    = (callLog.transcript || '').slice(0, 500);

  // Color the label cell: warm=yellow, cold=blue
  const fills = { warm: 'FFFFD54F', cold: 'FF90CAF9' };
  if (fills[callLog.leadLabel]) {
    row.getCell(COLS.label).fill = {
      type: 'pattern', pattern: 'solid', fgColor: { argb: fills[callLog.leadLabel] },
    };
  }

  row.commit();
  await wb.xlsx.writeFile(filePath);
  await Contact.findByIdAndUpdate(contact._id, { excelSynced: true });
  return { updatedRow: contact.excelRow };
}

/** Full export of every call log to a fresh .xlsx buffer (for download). */
async function exportCallLogs(CallLog) {
  const logs = await CallLog.find().populate('contact script').sort('-createdAt');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Call Results');

  ws.columns = [
    { header: 'Name',        key: 'name',   width: 25 },
    { header: 'Phone',       key: 'phone',  width: 18 },
    { header: 'Drug',        key: 'drug',   width: 15 },
    { header: 'Status',      key: 'status', width: 12 },
    { header: 'Lead Score',  key: 'score',  width: 12 },
    { header: 'Lead Label',  key: 'label',  width: 12 },
    { header: 'Duration(s)', key: 'dur',    width: 12 },
    { header: 'Called At',   key: 'at',     width: 20 },
    { header: 'Answers',     key: 'ans',    width: 60 },
  ];
  ws.getRow(1).font = { bold: true };

  for (const log of logs) {
    ws.addRow({
      name:   log.contact?.name,
      phone:  log.contact?.phone,
      drug:   log.script?.drugName,
      status: log.status,
      score:  log.leadScore,
      label:  log.leadLabel,
      dur:    log.durationSec,
      at:     log.endedAt ? new Date(log.endedAt).toLocaleString('en-GB') : '',
      ans:    (log.responses || []).map(x => `${x.questionKey}: ${x.answer}`).join(' | '),
    });
  }
  return wb.xlsx.writeBuffer();
}

module.exports = { importFromExcel, importSuccessfulDoctors, updateRowForCall, exportCallLogs, FILE };
