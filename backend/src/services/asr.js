/**
 * asr.js  —  Arabic Speech Recognition via Gemini
 *
 * Accepts a Buffer of audio (MP3 / WAV / OGG) captured from Twilio
 * and returns the transcribed Arabic text.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
const model = genAI ? genAI.getGenerativeModel({ model: geminiModel }) : null;

// Medical / pharmaceutical vocabulary hint for transcription
const MEDICAL_PROMPT =
  'Transcribe this Egyptian Arabic medical conversation exactly. Keep names of drugs, doctors, and pharmacies as accurately as possible.';

/**
 * Transcribes an audio buffer to Arabic text.
 *
 * @param {Buffer} audioBuffer  - Raw audio bytes (MP3 preferred)
 * @param {string} filename     - Hint for file format e.g. "audio.mp3"
 * @returns {Promise<string>}   - Transcribed Arabic text
 */
async function transcribe(audioBuffer, filename = 'audio.mp3') {
  if (!geminiApiKey || !model) {
    console.warn('GEMINI_API_KEY is not set or Gemini model is unavailable; using fallback transcription.');
    return 'لا يمكن التعرّف على الصوت حالياً';
  }

  const mimeType = filename.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg';
  const audioPart = {
    inlineData: {
      mimeType,
      data: Buffer.from(audioBuffer).toString('base64'),
    },
  };

  try {
    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: MEDICAL_PROMPT }, audioPart] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 1024,
      },
    });

    return (response?.response?.text?.() || '').trim();
  } catch (error) {
    console.warn('Gemini transcription request failed; using fallback transcription:', error.message);
    return 'لا يمكن التعرّف على الصوت حالياً';
  }
}

module.exports = { transcribe };
