/**
 * background.js — MV3 service worker.
 * Minimal by design: the popup talks to the backend directly and injects the
 * filler content script on demand. The worker only handles install logging.
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log('MedCall Filler installed.');
});
