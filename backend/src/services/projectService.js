/**
 * projectService.js — Phase 5 business logic:
 *
 *   importSheet()            xlsx upload OR link-shared Google Sheet → contacts
 *                            tagged with the project (Phase 3 row validation)
 *   getProgress()            totals + per-member breakdown vs targets
 *   buildInsightsDataset()   anonymized aggregated counts (no names/transcripts)
 *   generateInsights()       Gemini interpretation of the dataset (cached)
 */
const ExcelJS = require('exceljs');
const axios   = require('axios');
const mongoose = require('mongoose');

const Contact        = require('../models/Contact');
const CallLog        = require('../models/CallLog');
const DataEntryDraft = require('../models/DataEntryDraft');
const Project        = require('../models/Project');
const User           = require('../models/User');
const formSchema     = require('../config/formSchema.json');
const { validateRow, normalizePhone } = require('./validationService');

// ─── Sheet import ─────────────────────────────────────────────────────────────

// Same input columns as Phase 3 (A–E)
const COLS = { name: 1, phone: 2, type: 3, specialty: 4, city: 5 };

function extractGoogleSheetId(url) {
  const m = String(url || '').match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : null;
}

/** Download a link-shared Google Sheet as an xlsx buffer (no OAuth needed). */
async function downloadGoogleSheet(url) {
  const id = extractGoogleSheetId(url);
  if (!id) throw new Error('That does not look like a Google Sheets URL.');

  const res = await axios.get(
    `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`,
    { responseType: 'arraybuffer', maxRedirects: 5, validateStatus: () => true }
  );
  const contentType = res.headers['content-type'] || '';
  if (res.status !== 200 || contentType.includes('text/html')) {
    throw new Error('Could not download the sheet. Share it as "Anyone with the link — Viewer" and try again.');
  }
  return Buffer.from(res.data);
}

/**
 * Import a sheet into a project. Accepts { buffer, fileName } (xlsx upload)
 * or { googleSheetUrl }. Existing contacts (matched by phone) are attached
 * to the project, never duplicated; invalid rows are rejected and reported.
 */
async function importSheet(project, { buffer, fileName, googleSheetUrl }) {
  let sourceType = 'xlsx';
  if (googleSheetUrl) {
    sourceType = 'google_sheet';
    buffer = await downloadGoogleSheet(googleSheetUrl);
  }
  if (!buffer) throw new Error('Provide an .xlsx file or a Google Sheet URL.');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('The workbook has no sheets.');

  let imported = 0, linked = 0, skipped = 0;
  const invalidRows = [];
  const seenPhones = new Map();

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const raw = {
      name:      row.getCell(COLS.name).value,
      phone:     row.getCell(COLS.phone).value,
      type:      row.getCell(COLS.type).value,
      specialty: row.getCell(COLS.specialty).value,
      city:      row.getCell(COLS.city).value,
    };
    if (!raw.phone && !raw.name) { skipped++; continue; }   // empty row

    const check = validateRow(raw, r, seenPhones);
    if (!check.valid) {
      invalidRows.push({ row: r, errors: check.errors });
      continue;
    }

    const phone = normalizePhone
      ? normalizePhone(check.data.phone) || check.data.phone
      : check.data.phone;

    const existing = await Contact.findOne({ phone });
    if (existing) {
      // Attach to this project (never overwrite data — Phase 3 change review owns that)
      if (String(existing.project || '') !== String(project._id)) {
        existing.project = project._id;
        await existing.save();
      }
      linked++;
    } else {
      await Contact.create({ ...check.data, project: project._id });
      imported++;
    }
  }

  project.sheet = {
    sourceType,
    fileName:       fileName || undefined,
    googleSheetUrl: googleSheetUrl || undefined,
    importedCount:  imported,
    linkedCount:    linked,
    invalidRows:    invalidRows.length,
    importedAt:     new Date(),
  };
  await project.save();

  return { imported, linked, skipped, invalidRows };
}

// ─── Progress ─────────────────────────────────────────────────────────────────

const COMPLETED_STATUSES = ['completed', 'escalated'];

/** Aggregate completed calls / entered forms per member + project totals. */
async function getProgress(project) {
  const projectId = new mongoose.Types.ObjectId(String(project._id));

  const [callAgg, formAgg, contacts] = await Promise.all([
    CallLog.aggregate([
      { $match: { status: { $in: COMPLETED_STATUSES } } },
      { $lookup: { from: 'contacts', localField: 'contact', foreignField: '_id', as: 'c' } },
      { $unwind: '$c' },
      { $match: { 'c.project': projectId } },
      { $group: {
        _id: '$initiatedBy',
        calls:    { $sum: 1 },
        avgScore: { $avg: '$leadScore' },
      } },
    ]),
    DataEntryDraft.aggregate([
      { $match: { status: 'entered' } },
      { $lookup: { from: 'contacts', localField: 'contact', foreignField: '_id', as: 'c' } },
      { $unwind: '$c' },
      { $match: { 'c.project': projectId } },
      { $group: { _id: '$reviewedBy', forms: { $sum: 1 } } },
    ]),
    Contact.countDocuments({ project: projectId }),
  ]);

  // Merge per-user buckets (null _id = campaign/auto calls → "Unattributed")
  const buckets = new Map();
  const bucket = (id) => {
    const key = id ? String(id) : 'none';
    if (!buckets.has(key)) buckets.set(key, { id: id ? String(id) : null, calls: 0, forms: 0 });
    return buckets.get(key);
  };
  let totalCalls = 0, totalForms = 0, scoreSum = 0, scoreN = 0;

  for (const row of callAgg) {
    const b = bucket(row._id);
    b.calls = row.calls;
    totalCalls += row.calls;
    if (row.avgScore != null) { scoreSum += row.avgScore * row.calls; scoreN += row.calls; }
  }
  for (const row of formAgg) {
    const b = bucket(row._id);
    b.forms = row.forms;
    totalForms += row.forms;
  }

  // Resolve names: project members + manager + anyone found in the buckets
  const idsToName = [...buckets.keys()].filter(k => k !== 'none');
  const users = await User.find({
    $or: [
      { _id: { $in: [...idsToName, ...project.members, project.manager] } },
    ],
  }).select('name email role');
  const nameOf = new Map(users.map(u => [String(u._id), u]));

  // Ensure every project member appears even with 0 activity
  for (const m of project.members || []) bucket(m);

  const members = [...buckets.values()].map(b => ({
    id:    b.id,
    name:  b.id ? (nameOf.get(b.id)?.name || 'Unknown user') : 'Unattributed (auto/campaign)',
    email: b.id ? (nameOf.get(b.id)?.email || '') : '',
    calls: b.calls,
    forms: b.forms,
  })).sort((a, b) => (b.calls + b.forms) - (a.calls + a.forms));

  const pct = (done, target) => (target > 0 ? Math.min(100, Math.round((done / target) * 100)) : null);

  return {
    targets: { calls: project.targets?.calls || 0, forms: project.targets?.forms || 0 },
    totals: {
      calls: totalCalls,
      forms: totalForms,
      callsPct: pct(totalCalls, project.targets?.calls),
      formsPct: pct(totalForms, project.targets?.forms),
      contacts,
      avgScore: scoreN ? Math.round(scoreSum / scoreN) : null,
    },
    members,
  };
}

// ─── AI Market Insights ───────────────────────────────────────────────────────

const countBy = (rows) => Object.fromEntries(rows.map(r => [r._id ?? 'unknown', r.n]));

/** One anonymized, aggregated dataset — counts only, no names or transcripts. */
async function buildInsightsDataset(project) {
  const projectId = new mongoose.Types.ObjectId(String(project._id));
  const contactMatch = [
    { $lookup: { from: 'contacts', localField: 'contact', foreignField: '_id', as: 'c' } },
    { $unwind: '$c' },
    { $match: { 'c.project': projectId } },
  ];

  const [byType, bySpecialty, byCity, callStatus, callMeta, leads, sentiment, drafts, progress] =
    await Promise.all([
      Contact.aggregate([{ $match: { project: projectId } }, { $group: { _id: '$type', n: { $sum: 1 } } }]),
      Contact.aggregate([{ $match: { project: projectId } }, { $group: { _id: '$specialty', n: { $sum: 1 } } }]),
      Contact.aggregate([{ $match: { project: projectId } }, { $group: { _id: '$city', n: { $sum: 1 } } }]),
      CallLog.aggregate([...contactMatch, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      CallLog.aggregate([...contactMatch, { $group: {
        _id: null,
        avgDurationSec: { $avg: '$durationSec' },
        consentGranted: { $sum: { $cond: [{ $eq: ['$consent.given', true] }, 1, 0] } },
        consentDenied:  { $sum: { $cond: [{ $eq: ['$consent.given', false] }, 1, 0] } },
      } }]),
      CallLog.aggregate([...contactMatch,
        { $match: { status: { $in: COMPLETED_STATUSES } } },
        { $group: { _id: '$leadLabel', n: { $sum: 1 }, avgScore: { $avg: '$leadScore' } } }]),
      CallLog.aggregate([...contactMatch,
        { $unwind: '$responses' },
        { $group: { _id: '$responses.sentiment', n: { $sum: 1 } } }]),
      DataEntryDraft.aggregate([
        { $match: { status: { $in: ['approved', 'entered'] } } },
        { $lookup: { from: 'contacts', localField: 'contact', foreignField: '_id', as: 'c' } },
        { $unwind: '$c' },
        { $match: { 'c.project': projectId } },
        { $project: { fields: 1 } },
      ]),
      getProgress(project),
    ]);

  // Per-question answer distribution (select/radio only)
  // Phase 6: use THIS project's schema when set, else the global file
  const schemaFields = project.formSchema?.fields?.length
    ? project.formSchema.fields
    : formSchema.fields;
  const answerKeys = schemaFields
    .filter(f => (f.type === 'select' || f.type === 'radio') && f.options?.length)
    .map(f => f.key);
  const answers = {};
  for (const key of answerKeys) answers[key] = {};
  for (const d of drafts) {
    for (const key of answerKeys) {
      const v = d.fields?.[key];
      if (v === null || v === undefined || v === '') continue;
      const s = String(v).toLowerCase();
      answers[key][s] = (answers[key][s] || 0) + 1;
    }
  }

  const leadCounts = { warm: 0, cold: 0 };
  let leadScoreSum = 0, leadN = 0;
  for (const l of leads) {
    if (l._id) leadCounts[l._id] = l.n;
    if (l.avgScore != null) { leadScoreSum += l.avgScore * l.n; leadN += l.n; }
  }

  const meta = callMeta[0] || {};
  return {
    project: project.name,
    generatedAt: new Date().toISOString(),
    contacts: {
      total: progress.totals.contacts,
      byType:      countBy(byType),
      bySpecialty: countBy(bySpecialty),
      byCity:      countBy(byCity),
    },
    calls: {
      byStatus: countBy(callStatus),
      avgDurationSec: meta.avgDurationSec ? Math.round(meta.avgDurationSec) : null,
      consent: { granted: meta.consentGranted || 0, denied: meta.consentDenied || 0 },
    },
    leads: { ...leadCounts, avgScore: leadN ? Math.round(leadScoreSum / leadN) : null },
    answers,
    sentiment: countBy(sentiment),
    progress: {
      callsTarget: progress.targets.calls, callsDone: progress.totals.calls,
      formsTarget: progress.targets.forms, formsDone: progress.totals.forms,
    },
  };
}

// Gemini strict-JSON helper (same pattern as dataEntryService)
async function geminiJson(prompt) {
  if (!process.env.GEMINI_API_KEY) return null;
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const modelId = process.env.INSIGHTS_MODEL || process.env.DRAFT_MODEL ||
                  process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    .getGenerativeModel({ model: modelId });
  const completion = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    },
  });
  const raw = (completion?.response?.text?.() || '')
    .replace(/```json/gi, '').replace(/```/g, '').trim();
  return JSON.parse(raw);
}

const INSIGHT_KEYS = ['summary', 'keyFindings', 'marketSignals', 'segments',
                      'recommendations', 'risks', 'dataQuality'];

/**
 * Returns { dataset, insights, generatedAt, aiAvailable }.
 * Uses the cache on the project unless it's stale or refresh=true.
 */
async function generateInsights(project, { refresh = false } = {}) {
  const cacheHours = process.env.INSIGHTS_CACHE_HOURS !== undefined
    ? Number(process.env.INSIGHTS_CACHE_HOURS) : 12;
  const age = project.insightsGeneratedAt
    ? (Date.now() - new Date(project.insightsGeneratedAt).getTime()) / 36e5
    : Infinity;

  const dataset = await buildInsightsDataset(project);

  if (!refresh && project.insights && age < cacheHours) {
    return {
      dataset,
      insights: project.insights,
      generatedAt: project.insightsGeneratedAt,
      aiAvailable: true,
      cached: true,
    };
  }

  const prompt = `You are a senior pharmaceutical market-research analyst. Interpret the
aggregated results of a phone-based market research project (Egyptian market).

RULES:
- Use ONLY the numbers in the dataset below. NEVER invent statistics.
- Cite the actual counts/percentages you derive from the dataset as evidence.
- Write in clear professional ENGLISH.
- If sample sizes are small or targets are far from complete, say so in "dataQuality".

DATASET:
${JSON.stringify(dataset, null, 2)}

Respond with ONE JSON object with exactly these keys:
{
  "summary":         "3-5 sentence executive summary",
  "keyFindings":     ["finding with its number", ...],
  "marketSignals":   [{ "signal": "...", "evidence": "counts from the dataset", "meaning": "..." }, ...],
  "segments":        [{ "segment": "e.g. Cairo cardiologists", "insight": "..." }, ...],
  "recommendations": ["actionable next step", ...],
  "risks":           ["risk or concern", ...],
  "dataQuality":     "caveats about sample size / progress"
}`;

  let insights = null;
  for (let attempt = 1; attempt <= 2 && !insights; attempt++) {
    try {
      const candidate = await geminiJson(prompt);
      if (candidate && INSIGHT_KEYS.every(k => k in candidate)) insights = candidate;
    } catch (err) {
      console.warn(`📊 Insights attempt ${attempt} failed:`, err.message);
    }
  }

  if (!insights) {
    // Never block — the page still shows the raw dataset
    return { dataset, insights: null, generatedAt: null, aiAvailable: false };
  }

  project.insights = insights;
  project.insightsGeneratedAt = new Date();
  await project.save();

  return { dataset, insights, generatedAt: project.insightsGeneratedAt, aiAvailable: true, cached: false };
}

module.exports = { importSheet, getProgress, buildInsightsDataset, generateInsights };
