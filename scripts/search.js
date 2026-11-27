/* ── search.js ─────────────────────────────────────────────────────────────
   Universal Search's ONLY cost on a page load (the user's 2026-11-26 rule:
   "make sure it doesn't make the website even slower"). It draws one button
   — a 🔍 circle above the notes button — and listens for Ctrl/⌘ K and "/".
   Nothing else is loaded, read or built until search is first opened:

   - search-core.js (the index) and search-view.js (the panel) are fetched on
     that first open, after the three shared modules the index is built on —
     mm-tree-core.js, files-core.js, source-dump-core.js and project-core.js — each only when
     its page does not load it already. The versions below are the pages'
     own `?v=` values and move with them: `rg -n 'files-core\.js\?v='` finds
     this file too, which is the point.
   - Plain JavaScript, no JSX: nothing here waits for Babel.
   - It is a READER, like everything Universal Search is: no track_db write,
     no key of its own, and whether it is open is never stored.
*/
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  // [global it defines, script] — in load order (files-core needs TrackMMTree).
  // project-core.js says which documentation pages belong to which goal —
  // the Documentations sidebar's own rule — so search files them the same way.
  var PARTS = [
    ['TrackMMTree', 'scripts/mm-tree-core.js?v=2'],
    ['TrackFiles', 'scripts/files-core.js?v=5'],
    ['TrackSourceDump', 'scripts/source-dump-core.js?v=3'],
    ['TrackProject', 'scripts/project-core.js?v=2'],
    ['TrackSearch', 'scripts/search-core.js?v=3'],
    ['TrackSearchView', 'scripts/search-view.js?v=3']
  ];

  var btn = null;
  var loading = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.setAttribute('data-tsr-part', '');
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('could not load ' + src)); };
      document.head.appendChild(s);
    });
  }

  function ensure() {
    if (!loading) {
      loading = PARTS.reduce(function (p, part) {
        return p.then(function () { return window[part[0]] ? null : loadScript(part[1]); });
      }, Promise.resolve());
      // A failed load (offline, a blip) is retried on the next open.
      loading.catch(function () { loading = null; });
    }
    return loading;
  }

  function isOpen() { return !!(window.TrackSearchView && window.TrackSearchView.isOpen()); }

  function open() {
    if (isOpen()) return;
    if (btn) btn.setAttribute('aria-busy', 'true');
    ensure().then(function () {
      if (btn) { btn.removeAttribute('aria-busy'); btn.removeAttribute('data-tsr-failed'); }
      window.TrackSearchView.open({ opener: btn });
    }, function () {
      if (btn) {
        btn.removeAttribute('aria-busy');
        btn.setAttribute('data-tsr-failed', '');
        btn.title = 'Search could not load — check the connection and try again';
      }
    });
  }

  function editable(el) {
    if (!el || el === document.body) return false;
    var tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el.isContentEditable;
  }

  function onKey(e) {
    if (e.defaultPrevented || e.altKey) return;
    var k = e.key;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (k === 'k' || k === 'K')) {
      e.preventDefault();
      if (isOpen()) window.TrackSearchView.close();
      else open();
      return;
    }
    if (k === '/' && !e.ctrlKey && !e.metaKey && !editable(e.target) && !isOpen()) {
      e.preventDefault();
      open();
    }
  }

  function mount() {
    if (document.getElementById('tsr-btn')) return;
    btn = document.createElement('button');
    btn.id = 'tsr-btn';
    btn.type = 'button';
    btn.title = 'Search everything (Ctrl K or /)';
    btn.setAttribute('aria-label', 'Search everything');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>';
    btn.addEventListener('click', open);
    document.body.appendChild(btn);
  }

  window.addEventListener('keydown', onKey);
  window.TrackSearchLoader = { open: open, ensure: ensure, PARTS: PARTS };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
