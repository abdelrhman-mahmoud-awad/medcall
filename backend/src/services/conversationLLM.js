/**
 * conversationLLM.js  —  Script-driven Egyptian Arabic conversation engine
 *
 * This service wraps Gemini and is responsible for:
 *  1. Following the call script question-by-question
 *  2. Responding naturally in Egyptian Arabic dialect
 *  3. Handling objections, off-topic replies, and short answers
 *  4. Deciding when to end the call
 *  5. Extracting structured answers from the contact's speech
 *
 * State is kept OUTSIDE this module (in CallSession) and passed in each call.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
const model = genAI ? genAI.getGenerativeModel({ model: geminiModel }) : null;

// ─── System prompt template ───────────────────────────────────────────────────
function buildSystemPrompt(script, contact) {
  return `أنت باحث سوق طبي محترف يعمل في شركة أبحاث صيدلانية مصرية.
اسمك "سلمى" وتتحدث باللهجة المصرية العامية بشكل طبيعي وودود.

مهمتك: إجراء مقابلة بحثية قصيرة مع ${contact.type === 'physician' ? 'الدكتور' : 'الصيدلاني'} ${contact.name}
الموضوع: دراسة سوق دواء "${script.drugName}"

قواعد مهمة:
- تكلم دايماً بالعربي المصري العامية، مش بالفصحى
- كن ودود ومحترم وواضح
- اتبع الأسئلة بالترتيب المحدد
- لو الشخص مشغول، اعتذر وسأل عن وقت أنسب
- لو الشخص مش متعاون، اشكره واختم المكالمة بأدب
- استخرج الإجابات من كلام الشخص وسجّلها بشكل منظم
- لا تسأل أكثر من سؤال في نفس الوقت
- لو الإجابة مش واضحة، اسأل للتوضيح مرة واحدة بس
- لما تخلص كل الأسئلة أو الشخص يطلب الإنهاء، قل التحية الختامية وأنهي المكالمة

السكريبت:
تحية الافتتاح: ${script.greeting}
تحية الختام: ${script.closing}

الأسئلة المطلوبة (بالترتيب):
${script.questions.map((q, i) => `${i + 1}. [${q.key}] ${q.text}`).join('\n')}

في كل رد، قدّم ردك بالشكل الآتي:
SPEAK: [النص اللي هتقوله بالعربي المصري]
EXTRACT: [اسم_السؤال=إجابة_مختصرة] (لو استخرجت إجابة جديدة)
ACTION: [CONTINUE|END_CALL|ESCALATE]
NEXT_QUESTION: [key_اسم_السؤال_التالي أو DONE]`;
}

// ─── Parse the structured LLM response ───────────────────────────────────────
function parseLLMResponse(raw) {
  const result = {
    speak:        '',
    extractions:  {},   // { questionKey: answer }
    action:       'CONTINUE',
    nextQuestion: null,
  };

  const lines = raw.split('\n');
  for (const line of lines) {
    if (line.startsWith('SPEAK:'))
      result.speak = line.replace('SPEAK:', '').trim();
    else if (line.startsWith('EXTRACT:')) {
      const kv = line.replace('EXTRACT:', '').trim();
      const [key, ...rest] = kv.split('=');
      if (key && rest.length) result.extractions[key.trim()] = rest.join('=').trim();
    } else if (line.startsWith('ACTION:'))
      result.action = line.replace('ACTION:', '').trim();
    else if (line.startsWith('NEXT_QUESTION:'))
      result.nextQuestion = line.replace('NEXT_QUESTION:', '').trim();
  }

  // Fallback — if LLM didn't wrap properly, treat whole response as speech
  if (!result.speak) result.speak = raw.trim();

  return result;
}

// ─── Main turn function ───────────────────────────────────────────────────────
/**
 * Process one conversation turn.
 *
 * @param {object} script   - Script document from MongoDB
 * @param {object} contact  - Contact document from MongoDB
 * @param {Array}  history  - Array of { role: 'assistant'|'user', content: string }
 * @param {string} userText - Latest transcribed text from the contact ('' for first turn)
 * @returns {Promise<{speak, extractions, action, nextQuestion}>}
 */
async function processTurn(script, contact, history, userText) {
  if (!geminiApiKey || !model) {
    console.warn('GEMINI_API_KEY is not set or Gemini model is unavailable; using fallback conversation response.');
    return {
      speak: 'أعتذر، لا أستطيع معالجة الطلب حالياً. سنواصل لاحقاً إذا أمكن.',
      extractions: {},
      action: 'CONTINUE',
      nextQuestion: null,
    };
  }

  const messages = [
    { role: 'system', content: buildSystemPrompt(script, contact) },
    ...history,
  ];

  if (userText) {
    messages.push({ role: 'user', content: userText });
  }

  const prompt = messages
    .map(message => `${message.role.toUpperCase()}: ${message.content}`)
    .join('\n\n');

  try {
    const completion = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 500,
      },
    });

    const raw = completion?.response?.text?.() || '';
    return parseLLMResponse(raw);
  } catch (error) {
    console.warn('Gemini conversation request failed; using fallback response:', error.message);
    return {
      speak: 'أعتذر، لا أستطيع معالجة الطلب حالياً في هذه اللحظة.',
      extractions: {},
      action: 'CONTINUE',
      nextQuestion: null,
    };
  }
}

// ─── Lead scoring ─────────────────────────────────────────────────────────────
/**
 * Score the call based on extracted responses.
 * Returns { score: 0-100, label: 'cold'|'warm' }
 */
function scoreCall(responses, script) {
  if (!responses || responses.length === 0) return { score: 0, label: 'cold' };

  let total    = 0;
  let maxTotal = 0;

  const questionMap = {};
  for (const q of script.questions) questionMap[q.key] = q;

  for (const r of responses) {
    const q = questionMap[r.questionKey];
    const weight = q ? q.scoringWeight : 1;
    maxTotal += weight * 10;

    // Simple heuristic: positive sentiment = full weight, neutral = half, negative = 0
    if (r.sentiment === 'positive')      total += weight * 10;
    else if (r.sentiment === 'neutral')  total += weight * 5;
    // negative / unclear = 0
  }

  const score = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;
  const label = score >= (script.warmThreshold || 40) ? 'warm' : 'cold';

  return { score, label };
}

// ─── Sentiment detection (lightweight, no extra API call) ─────────────────────
const POSITIVE_WORDS = ['نعم','أيوه','تمام','كويس','ممتاز','بستخدم','بصرف','مفيد','شايفه','بنصح'];
const NEGATIVE_WORDS = ['لا','مش','مش عارف','مش بستخدم','مش بصرف','ما عنديش','رافض','صعب'];

function detectSentiment(text) {
  const t = (text || '').toLowerCase();
  const pos = POSITIVE_WORDS.filter(w => t.includes(w)).length;
  const neg = NEGATIVE_WORDS.filter(w => t.includes(w)).length;
  if (pos > neg) return 'positive';
  if (neg > pos) return 'negative';
  if (pos === 0 && neg === 0) return 'unclear';
  return 'neutral';
}

module.exports = { processTurn, scoreCall, detectSentiment };
