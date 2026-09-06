/**
 * callQueue.js — Bull queue (Redis-backed) for mass campaign calls.
 *
 * Returns null when REDIS_URL is not configured so the rest of the app
 * (single calls, dashboard) keeps working without Redis. Campaign launch
 * then responds with a clear error instead of crashing the server.
 */
const Bull = require('bull');

let queue = null;

if (process.env.REDIS_URL) {
  queue = new Bull('calls', process.env.REDIS_URL);
  queue.on('error', (err) => {
    console.error('🟥 Call queue (Redis) error:', err.message);
  });
} else {
  console.warn('⚠️  REDIS_URL not set — campaign mass calling is disabled.');
}

module.exports = queue;
