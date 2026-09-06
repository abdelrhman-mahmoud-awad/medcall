/**
 * filler.js — content script that fills the active page's form with an
 * approved MedCall draft payload.
 *
 * Receives: { type: 'MEDCALL_FILL', payload: {key: value}, profile: {selector: key} | null }
 * Strategy:
 *   1. Profile match — exact CSS selectors for the mapped site
 *   2. Label-match fallback — matches input name/id/placeholder/label text
 *      against per-key synonyms (English + Arabic)
 * The script only TYPES into fields. It never submits the form.
 */
(() => {
  if (window.__medcallFillerLoaded) return;
  window.__medcallFillerLoaded = true;

  const SYNONYMS = {
    doctor_name:    ['doctor', 'name', 'customer', 'client', 'الاسم', 'الدكتور'],
    phone:          ['phone', 'mobile', 'tel', 'هاتف', 'موبايل', 'تليفون'],
    contact_type:   ['type', 'contact type', 'النوع'],
    specialty:      ['specialty', 'speciality', 'التخصص'],
    city:           ['city', 'region', 'المدينة', 'المحافظة'],
    aware_of_drug:  ['aware', 'awareness'],
    prescribing:    ['prescrib', 'frequency'],
    interested:     ['interest', 'sample'],
    lead_score:     ['score', 'التقييم'],
    lead_label:     ['label', 'lead'],
    notes:          ['note', 'comment', 'summary', 'ملاحظات'],
    call_date:      ['date', 'التاريخ'],
    recording_link: ['recording', 'link', 'url', 'التسجيل'],
  };

  function fireEvents(el) {
    // React/Vue-safe: dispatch both input and change
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function highlight(el, color) {
    el.style.outline = `2px solid ${color}`;
    setTimeout(() => { el.style.outline = ''; }, 4000);
  }

  function setNativeValue(el, value) {
    // Bypass React's value setter so the framework sees the change
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc?.set) desc.set.call(el, value);
    else el.value = value;
  }

  function fillElement(el, value) {
    if (value === null || value === undefined || value === '') {
      highlight(el, '#ffb300');   // amber: rep must fill manually
      return false;
    }

    const tag = el.tagName.toLowerCase();

    if (tag === 'select') {
      const target = String(value).toLowerCase();
      const opt = [...el.options].find(o =>
        o.value.toLowerCase() === target || o.text.toLowerCase().trim() === target);
      if (!opt) { highlight(el, '#ffb300'); return false; }
      el.value = opt.value;
      fireEvents(el);
      highlight(el, '#43a047');
      return true;
    }

    if (el.type === 'radio') {
      const group = document.querySelectorAll(`input[type="radio"][name="${el.name}"]`);
      const target = String(value).toLowerCase();
      for (const radio of group) {
        if (radio.value.toLowerCase() === target) {
          radio.checked = true;
          fireEvents(radio);
          highlight(radio, '#43a047');
          return true;
        }
      }
      highlight(el, '#ffb300');
      return false;
    }

    if (el.type === 'checkbox') {
      el.checked = ['yes', 'true', '1', 'on'].includes(String(value).toLowerCase());
      fireEvents(el);
      highlight(el, '#43a047');
      return true;
    }

    setNativeValue(el, String(value));
    fireEvents(el);
    highlight(el, '#43a047');
    return true;
  }

  function labelTextFor(el) {
    const bits = [el.name, el.id, el.placeholder, el.getAttribute('aria-label')];
    if (el.id) {
      const label = document.querySelector(`label[for="${el.id}"]`);
      if (label) bits.push(label.textContent);
    }
    const parentLabel = el.closest('label');
    if (parentLabel) bits.push(parentLabel.textContent);
    return bits.filter(Boolean).join(' ').toLowerCase();
  }

  function fill(payload, profile) {
    let filled = 0, skipped = 0;
    const usedKeys = new Set();

    // Strategy 1: exact selectors from the site profile
    if (profile?.fields) {
      for (const [selector, key] of Object.entries(profile.fields)) {
        const el = document.querySelector(selector);
        if (!el) continue;
        usedKeys.add(key);
        fillElement(el, payload[key]) ? filled++ : skipped++;
      }
    }

    // Strategy 2: label-match fallback for unmapped fields
    const inputs = document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea');
    for (const el of inputs) {
      if (el.dataset.medcallFilled) continue;
      const text = labelTextFor(el);
      if (!text) continue;
      for (const [key, words] of Object.entries(SYNONYMS)) {
        if (usedKeys.has(key) || payload[key] === undefined) continue;
        if (words.some(w => text.includes(w))) {
          el.dataset.medcallFilled = '1';
          usedKeys.add(key);
          fillElement(el, payload[key]) ? filled++ : skipped++;
          break;
        }
      }
    }

    return { filled, skipped };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'MEDCALL_FILL') {
      try {
        sendResponse({ ok: true, ...fill(msg.payload, msg.profile) });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    }
    return true;
  });
})();
