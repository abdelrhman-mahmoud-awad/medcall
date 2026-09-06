const mongoose = require('mongoose');

/**
 * Integration — stores third-party integration credentials connected from the
 * dashboard (currently: Google Drive OAuth).
 *
 * One document per provider. The refresh token lets the backend upload call
 * archives to the connected account's Drive without any fixed service account.
 */
const integrationSchema = new mongoose.Schema({
  provider: { type: String, required: true, unique: true },   // 'google_drive'

  email:        { type: String },   // connected Google account (display only)
  refreshToken: { type: String },   // long-lived OAuth refresh token

  rootFolderId:   { type: String }, // auto-created "MedCall Recordings" folder
  rootFolderName: { type: String },

  connectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  connectedAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Integration', integrationSchema);
