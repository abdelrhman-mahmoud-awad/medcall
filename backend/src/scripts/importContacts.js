/**
 * importContacts.js — CSV contact import utility.
 *
 * Usage: node src/scripts/importContacts.js contacts.csv
 *
 * CSV format (header row required):
 * name,phone,type,specialty,city
 * Dr. Ahmed Mohamed,+201001234567,physician,cardiology,Cairo
 *
 * Note: for Excel files use Phase 3's importExcel.js instead — it adds
 * validation, change detection, and sheet write-back linking.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const fs       = require('fs');
const csv      = require('csv-parser');
const mongoose = require('mongoose');
const Contact  = require('../models/Contact');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node src/scripts/importContacts.js <file.csv>');
  process.exit(1);
}

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const rows = [];
  fs.createReadStream(file)
    .pipe(csv())
    .on('data', row => rows.push(row))
    .on('end', async () => {
      let imported = 0, skipped = 0;
      for (const row of rows) {
        if (!row.phone) { skipped++; continue; }
        const exists = await Contact.findOne({ phone: row.phone });
        if (exists) { skipped++; continue; }
        await Contact.create({
          name:      row.name,
          phone:     row.phone,
          type:      row.type || 'physician',
          specialty: row.specialty,
          city:      row.city || row.region,
        });
        imported++;
      }
      console.log(`Imported: ${imported}, Skipped (duplicate/invalid): ${skipped}`);
      process.exit(0);
    });
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
