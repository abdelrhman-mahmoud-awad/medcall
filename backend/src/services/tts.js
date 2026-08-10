/**
 * tts.js  —  Egyptian Arabic Text-to-Speech via Azure Cognitive Services
 *
 * Voice: ar-EG-SalmaNeural (female) or ar-EG-ShakirNeural (male)
 * Returns a Buffer of MP3 audio ready to be streamed to Twilio.
 *
 * Emotion / style options for ar-EG-SalmaNeural:
 *   friendly | empathetic | cheerful | calm | newscast
 *
 * Usage:
 *   const audio = await synthesize("مرحباً، كيف حالك؟", { style: 'friendly' });
 */

const axios = require('axios');

const REGION = process.env.AZURE_SPEECH_REGION || 'eastus';
const KEY    = process.env.AZURE_SPEECH_KEY;
const VOICE  = process.env.AZURE_TTS_VOICE || 'ar-EG-SalmaNeural';

const TTS_URL = `https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;

/**
 * @param {string} text  - Arabic text to synthesize
 * @param {object} opts
 * @param {string} opts.style - Speaking style (default: 'friendly')
 * @param {string} opts.rate  - Speaking rate e.g. "-10%" or "0%"
 * @returns {Promise<Buffer>}  MP3 audio buffer
 */
async function synthesize(text, { style = 'friendly', rate = '-5%' } = {}) {
  if (!KEY) throw new Error('AZURE_SPEECH_KEY is not set in environment');

  // SSML with Egyptian Arabic neural voice + emotion style
  const ssml = `
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"
       xmlns:mstts="https://www.w3.org/2001/mstts"
       xml:lang="ar-EG">
  <voice name="${VOICE}">
    <mstts:express-as style="${style}" styledegree="1.5">
      <prosody rate="${rate}">
        ${escapeXml(text)}
      </prosody>
    </mstts:express-as>
  </voice>
</speak>`.trim();

  const response = await axios.post(TTS_URL, ssml, {
    headers: {
      'Ocp-Apim-Subscription-Key': KEY,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-16khz-32kbitrate-mono-mp3',
      'User-Agent': 'MedCallAI/1.0',
    },
    responseType: 'arraybuffer',
    timeout: 15_000,
  });

  return Buffer.from(response.data);
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

module.exports = { synthesize };
