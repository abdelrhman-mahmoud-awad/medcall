/**
 * uploadQueue.js — Bull queue for retryable Google Drive uploads.
 *
 * Twilio recordings are ready a few seconds AFTER the call ends and Drive can
 * fail transiently, so uploads run as background jobs with backoff.
 * Without Redis, enqueueArchive() falls back to a direct fire-and-forget call.
 */
const Bull = require('bull');

let queue = null;

if (process.env.REDIS_URL) {
  queue = new Bull('drive-uploads', process.env.REDIS_URL);
  queue.on('error', (err) => console.error('🟥 Upload queue (Redis) error:', err.message));
} else {
  console.warn('⚠️  REDIS_URL not set — Drive uploads run inline without retries.');
}

function startWorker() {
  if (!queue) return;
  queue.process(2, async (job) => {
    const { archiveCall } = require('../services/driveService');
    return archiveCall(job.data.callLogId);
  });
  console.log('📁 Drive upload worker started');
}

/** Enqueue an archive job (or run inline when Redis is absent). */
function enqueueArchive(callLogId, { delayMs = 10_000 } = {}) {
  if (queue) {
    return queue.add({ callLogId: String(callLogId) }, {
      attempts: Number(process.env.GDRIVE_UPLOAD_RETRIES) || 3,
      backoff: { type: 'exponential', delay: 30_000 },
      delay: delayMs,                 // give Twilio time to finalize the recording
      removeOnComplete: true,
    });
  }
  // Inline fallback
  setTimeout(() => {
    const { archiveCall } = require('../services/driveService');
    archiveCall(callLogId).catch(err =>
      console.warn(`📁 Inline archive failed for ${callLogId}:`, err.message));
  }, delayMs);
  return null;
}

module.exports = { startWorker, enqueueArchive };
