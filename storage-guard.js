// Track — localStorage quota guard.
//
// Every page saves the whole workspace as one `track_db` string. A full quota used to
// throw QuotaExceededError straight out of a React effect or event handler, and no page
// has an error boundary, so the tab white-screened mid-edit with no message and no sign
// that the change had not been saved. This routes those writes through one place that
// catches the quota error specifically and says so on screen.
//
// It deliberately does NOT patch Storage.prototype.setItem. firebase-sync.js captures the
// native method as `_origSet` and installs its own patch, which calls `_origSet` FIRST and
// only then marks `track_db_pending` and arms the upload debounce. Keeping this a plain
// function preserves that order: a quota throw happens inside `_origSet`, the patch's
// dirty-tracking lines never run, and no upload is armed for a write that did not land.
// Patching the prototype ahead of firebase-sync would make `_origSet` resolve to this
// guard, so a swallowed quota error would leave the sync layer believing a write happened.

(function () {
  'use strict';

  var DB_KEY = 'track_db';
  var BANNER_ID = 'track-quota-banner';

  // Firefox and Safari report the same condition under different names and codes, and
  // Safari's private mode throws it for any write at all.
  function isQuotaError(error) {
    if (!error) return false;
    return error.name === 'QuotaExceededError'
        || error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
        || error.code === 22
        || error.code === 1014;
  }

  function bannerButton(label, onClick) {
    var b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'background:#7f1d1d;color:#fecaca;border:none;border-radius:5px;' +
      'padding:4px 10px;font-family:monospace;font-size:10px;cursor:pointer';
    b.onclick = onClick;
    return b;
  }

  // Sits above the three stacked firebase-sync banners (14 / 60 / 110), so a quota failure
  // during a sync failure or conflict stays readable. Themed in styles.css; the inline
  // styles are the dark-default fallback, matching _makeBanner in firebase-sync.js.
  function showQuotaBanner() {
    var el = document.getElementById(BANNER_ID);
    if (el) return el;

    el = document.createElement('div');
    el.id = BANNER_ID;
    el.style.cssText = [
      'position:fixed', 'bottom:160px', 'right:14px',
      'background:#1e293b', 'border:1px solid #ef4444',
      'color:#fca5a5', 'padding:9px 14px', 'border-radius:8px',
      'font-size:11px', 'font-family:monospace', 'z-index:9998',
      'letter-spacing:.04em', 'max-width:320px', 'line-height:1.5'
    ].join(';');

    var msg = document.createElement('div');
    msg.textContent = '⚠ Storage full — this change was not saved.';
    el.appendChild(msg);

    var detail = document.createElement('div');
    detail.style.cssText = 'margin-top:5px;opacity:.85';
    detail.textContent = 'Everything saved before now is intact on this device. '
      + 'Reloading will discard the unsaved change. To free space, remove large images '
      + 'in Documentations, or export a slot from Home and delete it.';
    el.appendChild(detail);

    var row = document.createElement('div');
    row.style.cssText = 'margin-top:6px';
    row.appendChild(bannerButton('Dismiss', clearQuotaBanner));
    el.appendChild(row);

    (document.body || document.documentElement).appendChild(el);
    return el;
  }

  function clearQuotaBanner() {
    var el = document.getElementById(BANNER_ID);
    if (el) el.remove();
  }

  // Returns true when the value is stored, false when the quota rejected it. Anything
  // other than a quota error is rethrown — swallowing those would hide real bugs.
  function setItem(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      if (!isQuotaError(error)) throw error;
      console.warn('[Track storage] quota exceeded writing "' + key + '" — change not saved');
      showQuotaBanner();
      return false;
    }
  }

  // The one id shape for new records. progress.html and documentations.html both
  // write into calendarNotes and deadlines, and each used to mint its own shape,
  // so stored data carried a visible mix of two (NOTES Proposal 14). This file is
  // the only script besides theme.js loaded by every page, which is why the shared
  // helper lives here rather than in a page.
  //
  // Timestamp-then-random: sorts by creation, and can never collide with the plain
  // numeric counters sir-ks02.html uses (nid()), which matters because those two id
  // spaces meet inside one slot. Existing ids are never rewritten — only new ones
  // take this shape, so nothing that already points at an id stops resolving.
  function newId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  window.TrackStorage = {
    DB_KEY: DB_KEY,
    saveDB: function (db) { return setItem(DB_KEY, JSON.stringify(db)); },
    setItem: setItem,
    isQuotaError: isQuotaError,
    clearQuotaBanner: clearQuotaBanner,
    newId: newId
  };
})();
