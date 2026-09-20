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

  var mql = window.matchMedia ? window.matchMedia(PHONE_QUERY) : null;

  function isPhone() {
    return !!(mql && mql.matches);
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
    isPhone: isPhone,
    subscribe: subscribe
  };
})();
