/* ── scripts/viewport.js ───────────────────────────────────────────────────
   window.TrackViewport — the one definition, in JavaScript, of what counts as
   a phone.

   Why this file exists at all. Almost every phone rule in this app is CSS, and
   CSS is where it belongs: a media query needs no listener, cannot tear, and
   costs nothing. A handful of decisions are not expressible there, because
   they change WHAT RENDERS rather than how it looks — the Schedule opening in
   DAY mode instead of on a 1036px week grid, and the two 65/35 splits becoming
   one pane plus a switcher. Those are React state, and React needs to be told.

   Two constraints on anything added here, and both are load-bearing:

   1. IT MUST NEVER TOUCH `document`. scripts/theme.js cannot be covered by the
      offline suite because it reads document.documentElement at load. Keeping
      this module to window.matchMedia alone is what lets tests/viewport.test.js
      run with no browser, and the structural case there is what says so.

   2. IT HOLDS NO DATE CODE, which is why its suite runs once in tests/run.js
      rather than once per timezone. Same claim as quest-core.js and
      doc-table-core.js, and asserted the same structural way.

   THE TWIN. 720 is necessarily spelled twice — here, and in styles.css, which
   cannot read a JS constant any more than this file can read an @media rule.
   tests/viewport.test.js is what keeps the two equal: it pins the whole set of
   max-width breakpoints in the stylesheet, so a phone rule moving off 720
   fails there rather than silently making isPhone() lie to four pages. This is
   the same documented-twin arrangement as progress.html's copies of dlDone and
   noteTimed — the copy is admitted and tested, not hidden.
*/
(function () {
  'use strict';

  /* The ONE place the breakpoint is spelled in JavaScript. PHONE_QUERY is
     BUILT from it rather than written out, so there is no second literal here
     that could drift from the first. */
  var PHONE_PX = 720;
  var PHONE_QUERY = '(max-width: ' + PHONE_PX + 'px)';

  /* The other media query this app has to ask about, and it is deliberately
     NOT a width. Whether a control reveals on hover or has to be tapped is a
     question about the INPUT, not the screen: an iPad at 820px needs the tap
     path as much as a 390px phone does, while a 1280px laptop with a
     touchscreen should still reveal on hover. Keying that off isPhone() would
     leave the iPad with a control it can never trigger — the exact bug the old
     blanket reveal rule existed to fix.

     `(pointer: coarse)` and not `(hover: none)`, which is the more obvious
     spelling and was tried first. Two reasons, and the second is decisive.
     Semantically, coarse means the PRIMARY input is a finger, which is exactly
     the population that needs arming — a laptop with a touchscreen reports
     `pointer: fine` and rightly keeps one-click. And practically: headless
     Chrome reports `(hover: none)` at every viewport, with or without touch
     emulation, and `Emulation.setEmulatedMedia` cannot override it — both
     measured. So a hover gate is untestable in BOTH directions here, and would
     have silently put every existing desktop case on the touch path.
     `(pointer: coarse)` reads false on a desktop and true under touch
     emulation, so both paths can be asserted.

     styles.css must ask the SAME question — its docs-row block is
     `@media (pointer: coarse)` for this reason. Two queries meaning "a finger"
     in one codebase is how they drift apart.

     No subscribe() for this one, on purpose. The pointer can change (a mouse
     gets plugged in), but every caller asks at the moment of the click rather
     than rendering from it, so a live read is enough. */
  var COARSE_POINTER_QUERY = '(pointer: coarse)';

  var mql = window.matchMedia ? window.matchMedia(PHONE_QUERY) : null;
  var coarseMql = window.matchMedia ? window.matchMedia(COARSE_POINTER_QUERY) : null;

  function isPhone() {
    return !!(mql && mql.matches);
  }

  function isTouchPrimary() {
    return !!(coarseMql && coarseMql.matches);
  }

  /* Returns its own DISPOSER rather than exposing an unsubscribe(fn). One
     shape, and it makes the React adapter on each page a one-liner whose
     cleanup cannot be forgotten:

         React.useEffect(() => TrackViewport.subscribe(setPhone), []);

     The addListener branch is for Safari < 14, matching what theme.js already
     does for its own media query. */
  function subscribe(fn) {
    if (!mql || typeof fn !== 'function') return function () {};
    var handler = function (event) { fn(!!event.matches); };
    if (mql.addEventListener) {
      mql.addEventListener('change', handler);
      return function () { mql.removeEventListener('change', handler); };
    }
    if (mql.addListener) {
      mql.addListener(handler);
      return function () { mql.removeListener(handler); };
    }
    return function () {};
  }

  window.TrackViewport = {
    PHONE_PX: PHONE_PX,
    PHONE_QUERY: PHONE_QUERY,
    COARSE_POINTER_QUERY: COARSE_POINTER_QUERY,
    isPhone: isPhone,
    isTouchPrimary: isTouchPrimary,
    subscribe: subscribe
  };
})();
