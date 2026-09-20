/* ── tests/viewport.test.js ────────────────────────────────────────────────
   Offline cover for viewport.js — the one definition, in JavaScript, of what
   counts as a phone.

       node --test tests/viewport.test.js

   Run once by tests/run.js rather than once per timezone, and that is a claim
   about the module rather than a convenience: nothing in viewport.js
   constructs a Date. The structural case below is what says so, the same way
   quest-core.test.js, doc-table-core.test.js, graph-layout.test.js and
   schedule-paste-core.test.js each earn their place in UNSWEPT_FILES.

   What is being pinned here, in order of how much it would cost to get wrong:

   1. THE TWIN. 720 is spelled in BOTH viewport.js and styles.css, because CSS
      cannot read a JS constant and JS cannot read an @media rule. If a phone
      rule in the stylesheet moved to another width, isPhone() would go on
      answering for 720 and four pages would disagree with their own CSS — the
      Schedule opening in DAY mode on a screen the stylesheet is still laying
      out for a desktop, with no error anywhere. The breakpoint case below is
      the only thing standing between that and a shipped release.

   2. IT NEVER READS `document`. That is what lets this suite exist at all:
      theme.js has no offline cover precisely because it reads
      document.documentElement at load. A `document` appearing in viewport.js
      would not break the app, it would break the ability to test it — which is
      the kind of loss that is invisible until the day it matters.

   3. matchMedia can be ABSENT. Not a paranoid branch: this suite runs in plain
      Node with no matchMedia at all, which is the same shape as a very old
      browser. isPhone() must answer false and subscribe() must still hand back
      a callable disposer, or every page's useEffect cleanup throws on unmount.
*/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/* A browser IIFE that assigns to `window`, so `window` has to exist before it
   runs. runInThisContext, not runInNewContext, matching quest-core.test.js:
   a fresh realm would give the module a different Array/Object than the one
   this file builds values with. */
globalThis.window = globalThis;
const SRC = path.join(__dirname, '..', 'scripts', 'viewport.js');
const CSS = path.join(__dirname, '..', 'styles', 'styles.css');
vm.runInThisContext(fs.readFileSync(SRC, 'utf8'), { filename: 'viewport.js' });
const V = globalThis.TrackViewport;

/* Comments are stripped before any structural grep. This file's own prose and
   viewport.js's header both discuss `document` and the number 720 at length,
   and a check that read the prose would fail on the explanation rather than on
   the code. Same helper shape as quest-core.test.js. */
const strip = src => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

// ── module surface ─────────────────────────────────────────────────────────

test('the module exports exactly the documented surface', () => {
  // Written out by hand on purpose: if an export is added or renamed, this is
  // the case that notices, the same way quest-core.test.js pins TrackQuest.
  assert.deepEqual(Object.keys(V).sort(),
    ['PHONE_PX', 'PHONE_QUERY', 'isPhone', 'subscribe']);
  assert.equal(V.PHONE_PX, 720);
  assert.equal(V.PHONE_QUERY, '(max-width: 720px)');
});

test('PHONE_QUERY is BUILT from PHONE_PX — the number is spelled once in the module', () => {
  const src = strip(fs.readFileSync(SRC, 'utf8'));
  assert.deepEqual([...src.matchAll(/max-width:\s*\d+px/g)].map(m => m[0]), [],
    'viewport.js must not spell a literal media query — PHONE_QUERY concatenates PHONE_PX');
  assert.equal((src.match(/\b720\b/g) || []).length, 1,
    'the breakpoint appears exactly once in viewport.js, in the PHONE_PX declaration');
});

// ── the twin ───────────────────────────────────────────────────────────────

test('THE TWIN: styles.css carries the same breakpoint, and the set is PINNED', () => {
  /* Pinned rather than filtered, deliberately. A filter ("is 720 among them?")
     would wave through a stray 719 sitting beside it, which is exactly the
     drift this case exists to stop — and it would also let a fourth breakpoint
     appear with nobody deciding to add one. Writing the set out by hand is the
     same choice quest-core.test.js makes for TrackQuest's export list.

     460 is the Home page's narrow tier and 640 the Universal calendar's; 720
     is the phone breakpoint this module answers for, shared with the Home hub
     and the calendar's bottom sheet. */
  const css = fs.readFileSync(CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const widths = [...new Set(
    [...css.matchAll(/@media[^{]*\(\s*max-width:\s*(\d+)px\s*\)/g)].map(m => Number(m[1]))
  )].sort((a, b) => a - b);

  assert.deepEqual(widths, [460, 640, 720],
    'styles.css max-width breakpoints changed — if a phone rule moved off 720, '
    + 'TrackViewport.PHONE_PX is now lying to every page that asks it');
  assert.ok(widths.includes(V.PHONE_PX), 'PHONE_PX must be one of the stylesheet breakpoints');
});

// ── structural claims that keep this suite where it is ─────────────────────

test('the module constructs no Date, which is why its suite is not swept', () => {
  const src = strip(fs.readFileSync(SRC, 'utf8'));
  assert.equal(/new Date|Date\.now|getDay\(|toISOString|getTimezoneOffset/.test(src), false,
    'viewport.js must hold no date code — move its suite to OFFLINE_FILES if it does');
});

test('the module never reads document, which is what lets this suite run offline', () => {
  const src = strip(fs.readFileSync(SRC, 'utf8'));
  assert.equal(/\bdocument\b/.test(src), false,
    'viewport.js reads window.matchMedia and nothing else — theme.js has no offline '
    + 'cover precisely because it reads document.documentElement at load');
  assert.equal(/localStorage|sessionStorage|indexedDB/.test(src), false,
    'viewport.js stores nothing; a viewport is measured, never remembered');
});

// ── behaviour with no matchMedia ───────────────────────────────────────────

test('with no matchMedia, isPhone is false and subscribe returns a callable disposer', () => {
  /* This is the real environment of this suite, not a contrived one — plain
     Node has no matchMedia, and neither does a browser old enough to matter.
     The disposer has to stay callable either way: every page's adapter is
     `useEffect(() => TrackViewport.subscribe(setPhone), [])`, so a non-function
     return throws on unmount rather than at subscribe time, which would make
     the stack point at React instead of at here. */
  assert.equal(typeof globalThis.matchMedia, 'undefined',
    'the guard case is only a guard if the state it guards against is the one it runs in');
  assert.equal(V.isPhone(), false);

  const off = V.subscribe(() => { throw new Error('must not fire without matchMedia'); });
  assert.equal(typeof off, 'function');
  off();
  off(); // idempotent: React StrictMode runs cleanup twice
});

test('subscribe refuses a non-function without throwing', () => {
  for (const bad of [undefined, null, 0, 'nope', {}]) {
    const off = V.subscribe(bad);
    assert.equal(typeof off, 'function');
    off();
  }
});

// ── behaviour with a matchMedia ────────────────────────────────────────────

test('isPhone and subscribe read a real matchMedia, and the disposer detaches', () => {
  /* A stub rather than a browser: what is under test is the wiring between
     TrackViewport and a MediaQueryList, and the wiring is identical whichever
     provides the list. The browser suite covers the other half — that the
     query itself matches at 390px and not at 1280px. */
  const listeners = new Set();
  const stub = {
    matches: false,
    media: V.PHONE_QUERY,
    addEventListener: (type, fn) => { if (type === 'change') listeners.add(fn); },
    removeEventListener: (type, fn) => { if (type === 'change') listeners.delete(fn); }
  };
  const asked = [];
  globalThis.matchMedia = query => { asked.push(query); return stub; };

  try {
    // Re-run the module so it binds to the stub: the real one captured null.
    vm.runInThisContext(fs.readFileSync(SRC, 'utf8'), { filename: 'viewport.js' });
    const W = globalThis.TrackViewport;
    assert.deepEqual(asked, ['(max-width: 720px)'],
      'the module asks matchMedia for PHONE_QUERY, once, at load');

    assert.equal(W.isPhone(), false);
    stub.matches = true;
    assert.equal(W.isPhone(), true, 'isPhone reads the list live rather than caching at load');

    const seen = [];
    const off = W.subscribe(v => seen.push(v));
    assert.equal(listeners.size, 1);
    listeners.forEach(fn => fn({ matches: true }));
    listeners.forEach(fn => fn({ matches: false }));
    assert.deepEqual(seen, [true, false], 'the subscriber is handed the boolean, not the event');

    off();
    assert.equal(listeners.size, 0, 'the disposer detaches its own handler');
    listeners.forEach(fn => fn({ matches: true }));
    assert.deepEqual(seen, [true, false], 'and nothing arrives after it');
  } finally {
    delete globalThis.matchMedia;
    vm.runInThisContext(fs.readFileSync(SRC, 'utf8'), { filename: 'viewport.js' });
  }
});

test('the Safari < 14 addListener branch is used when addEventListener is absent', () => {
  // theme.js carries the same fallback for its own query; this is the case
  // that stops it being dropped here as dead code.
  const listeners = new Set();
  const stub = {
    matches: true,
    media: V.PHONE_QUERY,
    addListener: fn => listeners.add(fn),
    removeListener: fn => listeners.delete(fn)
  };
  globalThis.matchMedia = () => stub;

  try {
    vm.runInThisContext(fs.readFileSync(SRC, 'utf8'), { filename: 'viewport.js' });
    const W = globalThis.TrackViewport;
    assert.equal(W.isPhone(), true);

    const seen = [];
    const off = W.subscribe(v => seen.push(v));
    assert.equal(listeners.size, 1, 'addListener is reached when addEventListener is missing');
    listeners.forEach(fn => fn({ matches: false }));
    assert.deepEqual(seen, [false]);
    off();
    assert.equal(listeners.size, 0);
  } finally {
    delete globalThis.matchMedia;
    vm.runInThisContext(fs.readFileSync(SRC, 'utf8'), { filename: 'viewport.js' });
  }
});
