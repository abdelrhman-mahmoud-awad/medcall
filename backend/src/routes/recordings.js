/**
 * routes/recordings.js — recordings + Drive archive access.
 *
 * GET  /api/recordings                    list calls with recording/Drive info
 * GET  /api/recordings/:callId/stream     proxy-stream the MP3 from Twilio
 * POST /api/recordings/:callId/reupload   re-run a failed Drive upload
 */
const router  = require('express').Router();
const axios   = require('axios');
const auth    = require('../middleware/auth');
const CallLog = require('../models/CallLog');
const { enqueueArchive } = require('../queues/uploadQueue');

// GET /api/recordings
router.get('/', auth, async (req, res) => {
  try {
    const calls = await CallLog.find({
      $or: [{ recordingUrl: { $exists: true, $ne: null } }, { 'drive.folderId': { $exists: true } }],
    })
      .populate('contact', 'name phone')
      .select('contact status leadScore leadLabel endedAt durationSec recordingUrl drive consent twilioCallSid')
      .sort('-createdAt')
      .limit(100);
    res.json(calls);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/recordings/:callId/stream — dashboard audio player source
router.get('/:callId/stream', auth, async (req, res) => {
  try {
    const call = await CallLog.findById(req.params.callId);
    if (!call?.recordingUrl) return res.status(404).json({ error: 'No recording for this call' });

    const audio = await axios.get(`${call.recordingUrl}.mp3`, {
      responseType: 'stream',
      auth: {
        username: process.env.TWILIO_ACCOUNT_SID,
        password: process.env.TWILIO_AUTH_TOKEN,
      },
    });
    res.set('Content-Type', 'audio/mpeg');
    audio.data.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/recordings/:callId/reupload
router.post('/:callId/reupload', auth, async (req, res) => {
  try {
    const call = await CallLog.findById(req.params.callId);
    if (!call) return res.status(404).json({ error: 'Call not found' });
    enqueueArchive(call._id, { delayMs: 0 });
    res.json({ success: true, queued: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
