/**
 * driveService.js — archives call evidence to Google Drive.
 *
 * Drive access is a per-account OAuth INTEGRATION: an admin clicks
 * "Connect Google Drive" on the dashboard → Integrations page, approves the
 * consent screen, and the refresh token is stored in the Integration
 * collection. A "MedCall Recordings" root folder is created automatically in
 * that account's Drive — no service account, no manual folder ID.
 *
 * Folder structure:
 *   MedCall Recordings / <Campaign name | "Single Calls"> / <YYYY-MM-DD> /
 *     <Contact – CallSid> /
 *        recording.mp3 | consent.json | transcript.txt | data-entry.json | form-payload.json
 *
 * Scope is drive.file: the app can only touch files/folders it created.
 * All archive functions are safe no-ops with a warning when Drive isn't connected.
 */
const { Readable } = require('stream');
const axios        = require('axios');
const CallLog      = require('../models/CallLog');
const Integration  = require('../models/Integration');

const PROVIDER = 'google_drive';
const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
];
const ROOT_FOLDER_NAME = process.env.GDRIVE_ROOT_FOLDER_NAME || 'MedCall Recordings';

// ─── OAuth plumbing ───────────────────────────────────────────────────────────

const envReady = () =>
  !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

function redirectUri() {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const base = (process.env.BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
  return `${base}/api/integrations/google/callback`;
}

function newOAuthClient() {
  const { google } = require('googleapis');
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri()
  );
}

/** The Google consent-screen URL the dashboard sends the admin to. */
function getAuthUrl(state) {
  if (!envReady()) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set in backend/.env');
  }
  return newOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',          // guarantees a refresh token on every connect
    scope: SCOPES,
    state,
  });
}

/** Exchange the OAuth callback code; store refresh token + account email. */
async function handleOAuthCallback(code, connectedBy) {
  const { google } = require('googleapis');
  const client = newOAuthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    // Re-connecting the same account can omit the refresh token — keep the old one
    const existing = await Integration.findOne({ provider: PROVIDER });
    if (!existing?.refreshToken) {
      throw new Error('Google did not return a refresh token. Remove MedCall at myaccount.google.com/permissions and connect again.');
    }
    tokens.refresh_token = existing.refreshToken;
  }
  client.setCredentials(tokens);

  let email = '';
  try {
    const me = await google.oauth2({ version: 'v2', auth: client }).userinfo.get();
    email = me.data.email || '';
  } catch { /* email is display-only */ }

  const integ = await Integration.findOneAndUpdate(
    { provider: PROVIDER },
    {
      provider: PROVIDER,
      email,
      refreshToken: tokens.refresh_token,
      rootFolderId: null,                 // re-resolve for the (possibly new) account
      rootFolderName: ROOT_FOLDER_NAME,
      connectedBy: connectedBy || undefined,
      connectedAt: new Date(),
    },
    { upsert: true, new: true }
  );

  // Pre-create the root folder so it appears in Drive immediately
  try {
    await ensureRootFolder(await getConnection());
  } catch (err) {
    console.warn('📁 Root folder creation deferred:', err.message);
  }

  return integ;
}

/** Returns { drive, integ } or null when Drive isn't connected. */
async function getConnection() {
  if (!envReady()) return null;
  const integ = await Integration.findOne({ provider: PROVIDER });
  if (!integ?.refreshToken) return null;

  const { google } = require('googleapis');
  const client = newOAuthClient();
  client.setCredentials({ refresh_token: integ.refreshToken });
  client.on('tokens', (t) => {
    // Persist a rotated refresh token if Google ever issues one
    if (t.refresh_token && t.refresh_token !== integ.refreshToken) {
      Integration.updateOne({ provider: PROVIDER }, { refreshToken: t.refresh_token })
        .catch(() => {});
    }
  });
  return { drive: google.drive({ version: 'v3', auth: client }), integ };
}

const isConfigured = async () => !!(await getConnection());

/** Connection state for the dashboard Integrations card. */
async function getStatus() {
  if (!envReady()) {
    return {
      connected: false,
      configured: false,
      reason: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing in backend/.env',
    };
  }
  const integ = await Integration.findOne({ provider: PROVIDER });
  if (!integ?.refreshToken) return { connected: false, configured: true };
  return {
    connected: true,
    configured: true,
    email: integ.email,
    rootFolderName: integ.rootFolderName || ROOT_FOLDER_NAME,
    connectedAt: integ.connectedAt,
  };
}

/** Disconnect: best-effort token revoke + delete the stored integration. */
async function disconnect() {
  const integ = await Integration.findOne({ provider: PROVIDER });
  if (!integ) return false;
  try {
    await newOAuthClient().revokeToken(integ.refreshToken);
  } catch { /* token may already be invalid */ }
  await Integration.deleteOne({ provider: PROVIDER });
  return true;
}

// ─── Folder helpers ───────────────────────────────────────────────────────────

async function findOrCreateFolder(drive, name, parentId) {
  const safe = name.replace(/'/g, "\\'");
  const parentClause = parentId ? ` and '${parentId}' in parents` : '';
  const q = `name = '${safe}' and mimeType = 'application/vnd.google-apps.folder'${parentClause} and trashed = false`;
  const found = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
  if (found.data.files?.length) return found.data.files[0].id;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    },
    fields: 'id',
  });
  return created.data.id;
}

/** Find-or-create the "MedCall Recordings" root in the connected Drive. */
async function ensureRootFolder(conn) {
  if (!conn) return null;
  const { drive, integ } = conn;
  if (integ.rootFolderId) return integ.rootFolderId;
  const id = await findOrCreateFolder(drive, ROOT_FOLDER_NAME, null);
  await Integration.updateOne(
    { provider: PROVIDER },
    { rootFolderId: id, rootFolderName: ROOT_FOLDER_NAME }
  );
  return id;
}

async function ensureCallFolder(conn, { campaignName, contactName, callSid, date }) {
  const { drive } = conn;
  const root = await ensureRootFolder(conn);
  const campaignId = await findOrCreateFolder(drive, campaignName || 'Single Calls', root);
  const dateId     = await findOrCreateFolder(drive, date, campaignId);
  return findOrCreateFolder(drive, `${contactName || 'Unknown'} - ${callSid || 'no-sid'}`, dateId);
}

async function uploadBuffer(drive, folderId, name, mimeType, buffer) {
  const res = await drive.files.create({
    requestBody: { name, parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id, webViewLink',
  });
  return res.data;   // { id, webViewLink }
}

// ─── Main: archive one call ───────────────────────────────────────────────────

/**
 * Uploads recording + consent + transcript for a call and saves the Drive
 * links back onto the CallLog. Idempotent-ish: skips files already uploaded.
 */
async function archiveCall(callLogId) {
  const conn = await getConnection();
  if (!conn) {
    console.warn('📁 Google Drive not connected — connect it on the dashboard → Integrations page. Skipping archive.');
    return null;
  }
  const { drive } = conn;

  const callLog = await CallLog.findById(callLogId)
    .populate('contact', 'name phone')
    .populate('campaign', 'name');
  if (!callLog) throw new Error(`CallLog ${callLogId} not found`);

  // Consent denied → never archive a recording
  if (callLog.consent?.given === false) {
    console.log(`📁 Skipping archive for ${callLogId}: consent denied.`);
    return null;
  }

  const date = new Date(callLog.endedAt || callLog.createdAt || Date.now())
    .toISOString().slice(0, 10);

  const folderId = callLog.drive?.folderId || await ensureCallFolder(conn, {
    campaignName: callLog.campaign?.name,
    contactName:  callLog.contact?.name,
    callSid:      callLog.twilioCallSid,
    date,
  });

  const driveLinks = { ...(callLog.drive?.toObject?.() || callLog.drive || {}), folderId };

  // 1. Recording MP3 (download from Twilio with basic auth)
  if (callLog.recordingUrl && !driveLinks.recordingUrl) {
    try {
      const audio = await axios.get(`${callLog.recordingUrl}.mp3`, {
        responseType: 'arraybuffer',
        auth: {
          username: process.env.TWILIO_ACCOUNT_SID,
          password: process.env.TWILIO_AUTH_TOKEN,
        },
      });
      const file = await uploadBuffer(drive, folderId, 'recording.mp3', 'audio/mpeg', Buffer.from(audio.data));
      driveLinks.recordingUrl = file.webViewLink;
    } catch (err) {
      console.warn(`📁 Recording upload failed for ${callLogId}:`, err.message);
      throw err;   // let the queue retry — Twilio recordings can lag
    }
  }

  // 2. consent.json
  if (callLog.consent && !driveLinks.consentUrl) {
    const { buildConsentRecord } = require('./consentService');
    // Phase 6: record the project's own consent line as evidence
    let consentLine;
    try {
      const { configForContact } = require('./projectConfigService');
      consentLine = (await configForContact(callLog.contact?._id)).consentLine;
    } catch { /* env fallback inside buildConsentRecord */ }
    const record = buildConsentRecord({
      callSid:  callLog.twilioCallSid,
      contact:  callLog.contact,
      verdict:  callLog.consent.given ? 'granted' : 'denied',
      verbatim: callLog.consent.verdictText,
      consentLine,
    });
    const file = await uploadBuffer(drive, folderId, 'consent.json', 'application/json',
      Buffer.from(JSON.stringify(record, null, 2)));
    driveLinks.consentUrl = file.webViewLink;
  }

  // 3. transcript.txt
  if (callLog.transcript && !driveLinks.transcriptUrl) {
    const file = await uploadBuffer(drive, folderId, 'transcript.txt', 'text/plain',
      Buffer.from(callLog.transcript, 'utf8'));
    driveLinks.transcriptUrl = file.webViewLink;
  }

  // 4. data-entry.json (audit copy of the AI draft, if one exists)
  try {
    const DataEntryDraft = require('../models/DataEntryDraft');
    const draft = await DataEntryDraft.findOne({ call: callLog._id });
    if (draft && !driveLinks.draftUrl) {
      const file = await uploadBuffer(drive, folderId, 'data-entry.json', 'application/json',
        Buffer.from(JSON.stringify({ fields: draft.fields, needsReview: draft.needsReview, status: draft.status }, null, 2)));
      driveLinks.draftUrl = file.webViewLink;
    }
  } catch (err) {
    console.warn('📁 Draft archive skipped:', err.message);
  }

  await CallLog.findByIdAndUpdate(callLogId, { drive: driveLinks });

  // Reflect the recording link into the draft so it reaches the form payload
  try {
    const DataEntryDraft = require('../models/DataEntryDraft');
    if (driveLinks.recordingUrl) {
      await DataEntryDraft.findOneAndUpdate(
        { call: callLogId, status: 'pending' },
        { $set: { 'fields.recording_link': driveLinks.recordingUrl } }
      );
    }
  } catch { /* non-fatal */ }

  console.log(`📁 Archived call ${callLogId} to Drive folder ${folderId}`);
  return driveLinks;
}

/** Archives the approved form payload next to the recording. */
async function archivePayload(draft) {
  const conn = await getConnection();
  if (!conn || !draft.formPayload) return null;
  const callLog = await CallLog.findById(draft.call);
  if (!callLog?.drive?.folderId) return null;
  await uploadBuffer(conn.drive, callLog.drive.folderId, 'form-payload.json', 'application/json',
    Buffer.from(JSON.stringify(draft.formPayload, null, 2)));
  return true;
}

module.exports = {
  archiveCall,
  archivePayload,
  isConfigured,
  getAuthUrl,
  handleOAuthCallback,
  getStatus,
  disconnect,
};
