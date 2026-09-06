/**
 * popup.js — MedCall Filler popup.
 *
 * Flow:
 *   1. First run → settings view: backend URL + extension API key (chrome.storage)
 *   2. Ping /api/extension/ping to validate the key
 *   3. List APPROVED drafts (search by name / phone)
 *   4. "Fill this page" → inject content/filler.js into the active tab and send
 *      the draft's formPayload + the site profile from profiles/mappings.json
 *   5. "Mark entered" after the rep submits the site's own form
 */
const $ = (id) => document.getElementById(id);

let settings = { backendUrl: '', apiKey: '' };

// ─── Storage ──────────────────────────────────────────────────────────────────

const loadSettings = () =>
  new Promise((resolve) => chrome.storage.local.get(['backendUrl', 'apiKey'], resolve));

const saveSettings = (data) =>
  new Promise((resolve) => chrome.storage.local.set(data, resolve));

// ─── Backend API ──────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const base = settings.backendUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/api/extension${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.apiKey,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).error || msg; } catch { /* not json */ }
    throw new Error(msg);
  }
  return res.json();
}

// ─── Views ────────────────────────────────────────────────────────────────────

function showSettings(prefill = true) {
  $('main').classList.add('hidden');
  $('settings').classList.remove('hidden');
  if (prefill) {
    $('backendUrl').value = settings.backendUrl || '';
    $('apiKey').value     = settings.apiKey || '';
  }
  $('settingsError').textContent = '';
}

function showMain() {
  $('settings').classList.add('hidden');
  $('main').classList.remove('hidden');
  $('mainError').textContent = '';
  refreshDrafts();
}

// ─── Drafts list ──────────────────────────────────────────────────────────────

function draftCard(draft) {
  const card = document.createElement('div');
  card.className = 'draft';

  const name = document.createElement('b');
  name.textContent = draft.name || 'Unknown contact';

  const meta = document.createElement('small');
  const when = draft.approvedAt ? new Date(draft.approvedAt).toLocaleString() : '';
  meta.textContent = [draft.project, draft.phone, when && `approved ${when}`]
    .filter(Boolean).join(' · ');

  const actions = document.createElement('div');
  actions.className = 'actions';

  // Phase 6: open the project's own data-entry website
  if (draft.websiteUrl) {
    const openBtn = document.createElement('button');
    openBtn.className = 'secondary';
    openBtn.textContent = '🌐 Open site';
    openBtn.addEventListener('click', () => chrome.tabs.create({ url: draft.websiteUrl }));
    actions.append(openBtn);
  }

  const fillBtn = document.createElement('button');
  fillBtn.textContent = 'Fill this page';
  fillBtn.addEventListener('click', () => fillDraft(draft.id, fillBtn));

  const enteredBtn = document.createElement('button');
  enteredBtn.className = 'secondary';
  enteredBtn.textContent = 'Mark entered';
  enteredBtn.addEventListener('click', () => markEntered(draft.id, enteredBtn));

  actions.append(fillBtn, enteredBtn);
  card.append(name, meta, actions);
  return card;
}

async function refreshDrafts() {
  const list = $('draftList');
  const q = $('search').value.trim();
  $('mainError').textContent = '';
  try {
    const drafts = await apiFetch(`/drafts${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    list.replaceChildren();
    if (!drafts.length) {
      const empty = document.createElement('small');
      empty.textContent = 'No approved drafts waiting for data entry.';
      list.append(empty);
      return;
    }
    drafts.forEach((d) => list.append(draftCard(d)));
  } catch (err) {
    $('mainError').textContent = err.message;
  }
}

// ─── Fill flow ────────────────────────────────────────────────────────────────

async function getSiteProfile(tabUrl) {
  try {
    const res = await fetch(chrome.runtime.getURL('profiles/mappings.json'));
    const mappings = await res.json();
    const host = new URL(tabUrl).hostname;
    return mappings[host] || null;   // null → filler.js label-match fallback
  } catch {
    return null;
  }
}

async function fillDraft(id, btn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Filling…';
  $('mainError').textContent = '';
  try {
    const draft = await apiFetch(`/drafts/${id}`);
    if (!draft.formPayload || !Object.keys(draft.formPayload).length) {
      throw new Error('Draft has no form payload — re-approve it in the dashboard.');
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/.test(tab.url || '')) {
      throw new Error('Open the data-entry website first, then click Fill.');
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/filler.js'],
    });

    // Phase 6: the project's mapping (from the API) wins; mappings.json is fallback
    const profile = Object.keys(draft.dataEntry?.fieldMappings || {}).length
      ? { fields: draft.dataEntry.fieldMappings }
      : await getSiteProfile(tab.url);
    const result = await chrome.tabs.sendMessage(tab.id, {
      type: 'MEDCALL_FILL',
      payload: draft.formPayload,
      profile,
    });

    if (!result?.ok) throw new Error(result?.error || 'Fill failed on the page.');
    btn.textContent = `✅ ${result.filled} filled${result.skipped ? `, ${result.skipped} to check` : ''}`;
    setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 4000);
    return;
  } catch (err) {
    $('mainError').textContent = err.message;
  }
  btn.textContent = original;
  btn.disabled = false;
}

async function markEntered(id, btn) {
  btn.disabled = true;
  try {
    await apiFetch(`/drafts/${id}/entered`, { method: 'POST' });
    refreshDrafts();
  } catch (err) {
    $('mainError').textContent = err.message;
    btn.disabled = false;
  }
}

// ─── Wire-up ──────────────────────────────────────────────────────────────────

$('saveSettings').addEventListener('click', async () => {
  const backendUrl = $('backendUrl').value.trim();
  const apiKey     = $('apiKey').value.trim();
  if (!backendUrl || !apiKey) {
    $('settingsError').textContent = 'Both fields are required.';
    return;
  }
  settings = { backendUrl, apiKey };
  $('settingsError').textContent = 'Checking…';
  try {
    await apiFetch('/ping');
    await saveSettings(settings);
    showMain();
  } catch (err) {
    $('settingsError').textContent = `Connection failed: ${err.message}`;
  }
});

$('openSettings').addEventListener('click', () => showSettings());

let searchTimer;
$('search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(refreshDrafts, 300);
});

// ─── Init ─────────────────────────────────────────────────────────────────────

(async () => {
  const stored = await loadSettings();
  settings = { backendUrl: stored.backendUrl || '', apiKey: stored.apiKey || '' };
  if (!settings.backendUrl || !settings.apiKey) return showSettings();
  try {
    await apiFetch('/ping');
    showMain();
  } catch {
    showSettings();
    $('settingsError').textContent = 'Saved connection failed — check URL / key.';
  }
})();
