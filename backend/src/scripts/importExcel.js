/**
 * importExcel.js — CLI one-shot import of an .xlsx contact sheet.
 *
 * Usage: node src/scripts/importExcel.js [path/to/contacts.xlsx]
 * Defaults to EXCEL_FILE_PATH from .env
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const { importFromExcel, FILE } = require('../services/excelService');

const file = process.argv[2]
  ? path.resolve(process.argv[2])
  : FILE();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  console.log(`Importing from: ${file}`);
  const r = await importFromExcel(file);
  console.log(`Imported: ${r.imported} | Linked: ${r.linked} | Skipped: ${r.skipped}`);
  if (r.invalidRows.length) {
    console.log(`Rejected rows (${r.invalidRows.length}):`);
    r.invalidRows.forEach(x => console.log(`  Row ${x.row}: ${x.errors.join(' — ')}`));
  }
  if (r.pendingChanges) {
    console.log(`Pending data changes to review: ${r.pendingChanges} (see /api/excel/changes)`);
  }
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
