/* ── tests/search-browser.test.js ──────────────────────────────────────────
   Universal Search in the real system Chrome, over CDP (tests/lib/cdp.js).
   The index itself — what is listed, where, and in what order — is pinned
   offline in tests/search-core.test.js; these cases are about the SURFACE:

   1. "Make sure it doesn't make the website even slower": a page loads ONE
      small script, and nothing of search is fetched, defined or drawn
      beyond the button until it is opened. Asserted on each of the five
      pages separately, after a pause (docs/TESTING-LESSONS.md: a check that
      something was NOT fetched must wait for it to be fetched).
   2. It is a READER: track_db byte-identical and the localStorage key set
      unchanged across open, search, browse and close — on each page.
   3. A closed panel keeps NO DOM.
   4. The user's own flow: "search and click to go in that directory and
      search again and click again … until I hit the button" — and nothing
      but Go → leaves the page.
   5. Bigger parents first; a search inside a folder stays inside it.
   6. A Go to the page it is on reloads there (pages read ?/# once).
   7. A folder already on the crumbs (a mind-map loop) is not entered again.
   8. The keys; the phone; print.
   9. "Look real": the five pages at the top, and a SUB-TAB is a heading in
      its tab's list with its own Go → — not a folder to click into ("if
      it's just sub tab I don't want to click just to show it").
  10. Anything the user made — a mind map from SRCH down, a goal and its
      sub-goals, a Kolb or MG under a mind map — is SHOWN on a click, with
      its whole tree opened out to the last leaf beside the list; a click on
      a name in that tree moves the SEARCH there, never the page ("then
      clicking on that will navigate THE SEARCH (which is not '->')"). While
      a query is typed, search works as it always did.

   Its own file, beside browser.test.js rather than inside it, so a change
   here never edits that 23,000-line single scope. Fixtures are synthetic.
*/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { Browser, sleep } = require('./lib/cdp.js');
const { startServer } = require('./lib/server.js');
const F = require('./lib/fixture.js');

const PAGES = ['index.html', 'progress.html', 'sir-ks02.html', 'documentations.html', 'true-storage.html'];
const EXPECTED_NOISE = /cdn\.tailwindcss\.com|babel|in-browser Babel transformer|Download the React DevTools/i;
const realErrors = page => page.errors.filter(e => !EXPECTED_NOISE.test(e));
const skipUnlessChrome = { skip: Browser.available() ? false : 'no Chrome found (set CHROME_PATH)' };
const PHONE = [390, 844, { mobile: true, deviceScaleFactor: 3, touch: true }];

/* Chemistry ── Organic ─┬─ Alkanes (a Kolb and an MG change under it)
                         └─ Loop A ⇄ Loop B (A's parents: Organic and B)
                              └─ Deep ── Deeper
   Physics (Procedural). Ids are numbers, as KS02's nid() mints them.
   Pass finals ─┬─ Maths (a sub-goal) ── Past papers
                └─ ⚑ Mocks done                                          */
function searchSlot() {
  return F.populatedSlot({
    mms: [
      F.mm(10, 'Chemistry', { type: 'anchor', explanation: 'bonds and reactions' }),
      F.mm(11, 'Organic', { parentIds: [10] }),
      F.mm(12, 'Alkanes', { parentIds: [11], explanation: 'single bonds' }),
      F.mm(13, 'Physics', { type: '2', explanation: 'no carbon here' }),
      F.mm(14, 'Loop A', { parentIds: [11, 15] }),
      F.mm(15, 'Loop B', { parentIds: [14] }),
      F.mm(16, 'Deep', { parentIds: [14] }),
      F.mm(17, 'Deeper', { parentIds: [16] })
    ],
    kolbs: [F.kolb(1, '2026-03-05', { mmId: 12, experience: 'mixed up the bonds' }),
      F.kolb(2, '2026-03-06', { mmId: 13, experience: 'carbon dating question' })],
    mgChanges: [F.mgChange(5, '2026-03-07', 12, 'slow down at the start')],
    goals: [F.task('g-1', { title: 'Pass finals',
      milestones: [F.milestone('ms-1', '2026-03-01', '2026-03-10', { title: 'Mocks done' })],
      children: [F.task('g-sub', { title: 'Maths', isSubGoal: true, children: [F.task('g-t', { title: 'Past papers' })] })] })],
    saActions: [F.saAction('sa1', { title: 'Read a chapter' })]
  });
}
const searchDb = () => { const s = searchSlot(); return { slots: [s], activeSlotId: s.id }; };

const NO_DRIVE = '(' + function () {
  var held;
  Object.defineProperty(window, 'TrackFileStore', {
    configurable: true,
    get: function () { return held; },
    set: function (v) { if (v && typeof v.configure === 'function') v.configure({ clientId: '' }); held = v; }
  });
} + ')();';

// ── in-page helpers ──
const STORE = function () { return { db: localStorage.getItem('track_db'), keys: Object.keys(localStorage).sort() }; };
const OPEN = function () { document.getElementById('tsr-btn').click(); return true; };
const TYPE = function (v) {
  var i = document.getElementById('tsr-q'); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); return true;
};
const ROWS = function () {
  return Array.prototype.map.call(document.querySelectorAll('#tsr .tsr-row'), function (r) {
    var p = r.querySelector('.tsr-path');
    return (p ? p.textContent + ' › ' : '') + r.querySelector('.tsr-title').textContent;
  });
};
const CRUMBS = function () {
  return Array.prototype.map.call(document.querySelectorAll('#tsr .tsr-crumb'), function (e) { return e.textContent; });
};
const PICK = function (title) {
  var b = Array.prototype.find.call(document.querySelectorAll('#tsr .tsr-pick'), function (x) {
    return x.querySelector('.tsr-title').textContent === title;
  });
  if (!b) return false;
  b.click();
  return true;
};
// The list as drawn: a sub-tab heading as [TITLE], a row as its title.
const LIST = function () {
  return Array.prototype.map.call(document.querySelectorAll('#tsr .tsr-list > .tsr-sub, #tsr .tsr-list > .tsr-row'), function (e) {
    return e.classList.contains('tsr-sub') ? '[' + e.querySelector('.tsr-sub-title').textContent + ']' : e.querySelector('.tsr-title').textContent;
  });
};
// The opened-out tree beside the list: two spaces a level, ↻ for a loop.
const TREE = function () {
  return Array.prototype.map.call(document.querySelectorAll('#tsr .tsr-t-row'), function (r) {
    return '  '.repeat(Number(r.style.getPropertyValue('--tsr-lvl'))) + (r.hasAttribute('data-tsr-loop') ? '↻ ' : '') +
      r.querySelector('.tsr-t-title').textContent;
  });
};
const TREE_CLICK = function (title) {
  var b = Array.prototype.find.call(document.querySelectorAll('#tsr .tsr-t-row'), function (r) {
    return !r.hasAttribute('data-tsr-loop') && r.querySelector('.tsr-t-title').textContent === title;
  });
  if (!b) return false;
  b.click();
  return true;
};
const D_TITLE = function () { var t = document.querySelector('#tsr .tsr-d-title'); return t ? t.textContent : null; };
const KEY = function (key, opts, target) {
  var el = target === 'input' ? document.getElementById('tsr-q') : (target === 'body' ? document.body : document.activeElement || document.body);
  var e = new KeyboardEvent('keydown', Object.assign({ key: key, bubbles: true, cancelable: true }, opts || {}));
  el.dispatchEvent(e);
  return true;
};

test('universal search', skipUnlessChrome, async t => {
  const server = await startServer(process.env.TRACK_TEST_ROOT || undefined);
  const browser = await Browser.launch();
  t.after(async () => {
    try { await browser.close(); } finally { await server.close(); }
  });

  const open = async (file, { db = searchDb(), viewport = null, extra = null } = {}) => {
    const page = await browser.newPage();
    await page.addInitScript(NO_DRIVE);
    await page.clearStorage(server.origin);
    if (viewport) await page.setViewport(...viewport);
    await page.seed(db, extra || {});
    await page.goto(server.url(file));
    await page.skipFirebase();
    await page.waitFor(function () { return !!document.getElementById('tsr-btn') && !!document.getElementById('nts-toggle'); },
      { timeout: 60000, message: 'the search button on ' + file });
    return page;
  };
  const opened = page => page.waitFor(function () { return !!document.querySelector('#tsr .tsr-row, #tsr .tsr-empty'); },
    { timeout: 20000, message: 'the search panel drawn' });
  const settle = () => sleep(200); // the input's 60ms debounce, and a frame

  for (const file of PAGES) {
    await t.test('SEARCH: ' + file + ' — nothing of search loads with the page; it opens, writes nothing, and leaves no DOM', async () => {
      const page = await open(file);
      try {
        await sleep(1500);
        const atLoad = await page.evaluate(function () {
          return {
            parts: document.querySelectorAll('script[data-tsr-part]').length,
            defined: [typeof window.TrackSearch, typeof window.TrackSearchView],
            fetched: performance.getEntriesByType('resource').filter(function (e) { return /search-(core|view)\.js/.test(e.name); }).length,
            panel: !!document.getElementById('tsr'),
            loader: performance.getEntriesByType('resource').filter(function (e) { return /\/scripts\/search\.js/.test(e.name); }).length
          };
        });
        assert.deepEqual(atLoad, { parts: 0, defined: ['undefined', 'undefined'], fetched: 0, panel: false, loader: 1 },
          'the page loads search.js and nothing else of search');

        const before = await page.evaluate(STORE);
        await page.evaluate(OPEN);
        await opened(page);
        assert.deepEqual((await page.evaluate(ROWS)),
          ['Home', 'Schedule', 'Knowledge Record', 'Documentations', 'Storages'],
          'the top of the directory: the five pages, in the site\'s order');
        await page.evaluate(TYPE, 'bonds'); await settle();
        await page.evaluate(PICK, 'Chemistry');
        await page.evaluate(TYPE, 'mixed'); await settle();
        await page.evaluate(PICK, 'Kolb · 2026-03-05');
        await page.evaluate(function () { document.querySelector('#tsr [data-tsr-close]').click(); return true; });
        assert.equal(await page.evaluate(function () { return document.getElementById('tsr'); }), null,
          'a closed panel keeps no DOM');
        assert.equal(await page.evaluate(function () { return document.getElementById('tsr-btn').getAttribute('aria-expanded'); }), 'false');
        assert.deepEqual(await page.evaluate(STORE), before, 'a READER: track_db byte-identical and no browser key added');
        assert.deepEqual(realErrors(page), []);
      } finally { await page.close(); }
    });
  }

  await t.test('SEARCH: the user\'s flow — search, click into a folder, search again inside, choose, and only Go → leaves', async () => {
    const page = await open('index.html');
    try {
      await page.evaluate(OPEN); await opened(page);
      await page.evaluate(TYPE, 'bonds'); await settle();
      assert.deepEqual(await page.evaluate(ROWS), [
        'Knowledge Record › SRCH › Chemistry',
        'Knowledge Record › SRCH › Chemistry › Organic › Alkanes',
        'Knowledge Record › SRCH › Chemistry › Organic › Alkanes › Kolb · 2026-03-05'
      ], 'bigger parents first, each with its path — the Kolb where it lives, not where KOLB also lists it');

      await page.evaluate(PICK, 'Chemistry');
      const inside = await page.evaluate(function () {
        return { q: document.getElementById('tsr-q').value, focus: document.activeElement && document.activeElement.id,
          placeholder: document.getElementById('tsr-q').placeholder };
      });
      assert.deepEqual(await page.evaluate(CRUMBS), ['All', 'Knowledge Record', 'SRCH', 'Chemistry'],
        'a search hit with something inside is entered, as search always did');
      assert.deepEqual(inside, { q: '', focus: 'tsr-q', placeholder: 'Search in Chemistry…' },
        'the box empties and keeps the focus, ready for the next search');

      await page.evaluate(TYPE, 'carbon'); await settle();
      assert.deepEqual(await page.evaluate(ROWS), [], 'Physics\' carbon is outside Chemistry, so it is not found here');
      await page.evaluate(TYPE, 'mixed'); await settle();
      assert.deepEqual(await page.evaluate(ROWS), ['Organic › Alkanes › Kolb · 2026-03-05'], 'the path is counted from the folder searched in');

      const href = await page.evaluate(function () { return location.href; });
      await page.evaluate(PICK, 'Kolb · 2026-03-05');
      await sleep(400); // a wrong navigation would have begun by now
      assert.equal(await page.evaluate(function () { return location.href; }), href, 'choosing a leaf does not move the page');
      const chosen = await page.evaluate(function () {
        var go = document.querySelector('#tsr .tsr-detail .tsr-go-big');
        return { title: document.querySelector('#tsr .tsr-d-title').textContent, go: go && go.getAttribute('href'),
          crumbs: Array.prototype.map.call(document.querySelectorAll('#tsr .tsr-crumb'), function (e) { return e.textContent; }) };
      });
      assert.deepEqual(chosen, { title: 'Kolb · 2026-03-05', go: 'sir-ks02.html?mm=12', crumbs: ['All', 'Knowledge Record', 'SRCH', 'Chemistry'] },
        'a leaf is only CHOSEN: its details show beside the list');

      await page.evaluate(function () { document.querySelector('#tsr .tsr-detail .tsr-go-big').click(); return true; });
      await page.waitFor(function () { return /sir-ks02\.html\?mm=12$/.test(location.href); }, { timeout: 30000, message: 'Go → took it to the Kolb\'s mind map' });
    } finally { await page.close(); }
  });

  await t.test('SEARCH: a folder\'s own Go → opens the bigger parent; the crumbs walk back up', async () => {
    const page = await open('index.html');
    try {
      await page.evaluate(OPEN); await opened(page);
      const hereGo = () => page.evaluate(function () {
        var g = document.querySelector('#tsr .tsr-here .tsr-go'); return g && g.getAttribute('href');
      });
      await page.evaluate(PICK, 'Knowledge Record');
      await page.evaluate(PICK, 'SRCH');
      assert.deepEqual(await page.evaluate(CRUMBS), ['All', 'Knowledge Record', 'SRCH'], 'a page and a tab are gone into');
      assert.equal(await hereGo(), 'sir-ks02.html#srch', 'the tab you are in has its own Go →');
      await page.evaluate(PICK, 'Chemistry');
      await page.evaluate(TREE_CLICK, 'Organic');
      assert.deepEqual(await page.evaluate(CRUMBS), ['All', 'Knowledge Record', 'SRCH', 'Chemistry', 'Organic']);
      assert.equal(await hereGo(), 'sir-ks02.html?mm=11', 'and so has the mind map you are in');
      await page.evaluate(function () { document.querySelector('#tsr [data-tsr-crumb="3"]').click(); return true; });
      assert.deepEqual(await page.evaluate(CRUMBS), ['All', 'Knowledge Record', 'SRCH', 'Chemistry'], 'a crumb goes back up');
      await page.evaluate(KEY, 'Backspace', {}, 'input');
      assert.deepEqual(await page.evaluate(CRUMBS), ['All', 'Knowledge Record', 'SRCH'], 'Backspace in an empty box goes up one folder');
      await page.evaluate(function () { document.querySelector('#tsr [data-tsr-crumb="0"]').click(); return true; });
      assert.deepEqual(await page.evaluate(CRUMBS), ['All']);
    } finally { await page.close(); }
  });

  // Into Loop A by search, then Loop B through its tree: … › Organic › Loop A › Loop B.
  const LOOP_CRUMBS = ['All', 'Knowledge Record', 'SRCH', 'Chemistry', 'Organic', 'Loop A', 'Loop B'];
  const intoTheLoop = async page => {
    await page.evaluate(OPEN); await opened(page);
    await page.evaluate(TYPE, 'loop a'); await settle();
    await page.evaluate(PICK, 'Loop A');
    await page.evaluate(PICK, 'Loop B');
    assert.deepEqual(await page.evaluate(TREE), ['Loop B', '  ↻ Loop A'], 'Loop B\'s tree: its child is the crumb above it');
    await page.evaluate(TREE_CLICK, 'Loop B');
    assert.deepEqual(await page.evaluate(CRUMBS), LOOP_CRUMBS);
  };

  await t.test('SEARCH: a sub-tab is a heading in its tab\'s list, with its own Go →; ↑ ↓ pass it; search still finds it', async () => {
    const page = await open('index.html');
    try {
      await page.evaluate(OPEN); await opened(page);
      await page.evaluate(PICK, 'Knowledge Record');
      await page.evaluate(PICK, 'MG');
      assert.deepEqual(await page.evaluate(LIST), ['[TIMELINE]', 'MG · slow down at the start', '[LEVELS]'],
        'what TIMELINE shows sits under its heading, in MG — no click to reach it');
      const heads = await page.evaluate(function () {
        return Array.prototype.map.call(document.querySelectorAll('#tsr .tsr-sub'), function (h) {
          var g = h.querySelector('.tsr-go');
          return { go: g && g.getAttribute('href'), note: h.querySelector('.tsr-sub-meta').textContent, pick: !!h.querySelector('[data-tsr-pick]') };
        });
      });
      assert.deepEqual(heads.map(h => h.go), ['sir-ks02.html#mg', 'sir-ks02.html#mg'], 'each heading has its own Go →');
      assert.equal(heads[1].note, 'Go → opens MG — then press LEVELS.', 'one with no address says which button shows it');
      assert.ok(heads.every(h => !h.pick), 'a heading is nothing to click into');
      await page.evaluate(function () { document.querySelector('#tsr .tsr-sub-title').click(); return true; });
      assert.deepEqual(await page.evaluate(CRUMBS), ['All', 'Knowledge Record', 'MG'], 'a click on a heading goes nowhere');
      assert.equal(await page.evaluate(function () { return document.querySelector('#tsr .tsr-status').textContent; }), '1 entry',
        'headings are not counted');

      await page.evaluate(KEY, 'ArrowDown', {}, 'input');
      assert.equal(await page.evaluate(D_TITLE), 'MG · slow down at the start', '↓ passes the heading to the first row');
      await page.evaluate(KEY, 'ArrowDown', {}, 'input');
      assert.equal(await page.evaluate(D_TITLE), 'MG · slow down at the start', 'and stops before a heading with nothing after it');
      assert.equal(await page.evaluate(function () { return document.querySelector('#tsr .tsr-row.is-hi .tsr-title').textContent; }),
        'MG · slow down at the start', 'the chosen row is the one marked');
      await page.evaluate(KEY, 'ArrowUp', {}, 'input');
      assert.equal(await page.evaluate(D_TITLE), 'MG', '↑ passes the heading back to the tab itself');

      await page.evaluate(function () { document.querySelector('#tsr [data-tsr-crumb="1"]').click(); return true; });
      await page.evaluate(PICK, 'SRCH');
      assert.deepEqual(await page.evaluate(LIST), ['Chemistry', 'Physics'], 'SRCH\'s LIST and DIRECTORY are one list');
      await page.evaluate(function () { document.querySelector('#tsr [data-tsr-crumb="0"]').click(); return true; });
      await page.evaluate(TYPE, 'levels'); await settle();
      assert.deepEqual(await page.evaluate(ROWS), ['Knowledge Record › MG › LEVELS'], 'a search finds a sub-tab by name, as a row');
      await page.evaluate(PICK, 'LEVELS');
      assert.equal(await page.evaluate(function () { return document.querySelector('#tsr .tsr-d-hint').textContent; }),
        'Go → opens MG — then press LEVELS.');
      await page.evaluate(TYPE, 'slow down'); await settle();
      assert.deepEqual(await page.evaluate(ROWS), ['Knowledge Record › SRCH › Chemistry › Organic › Alkanes › MG · slow down at the start'],
        'shown where it lives — under its mind map, not MG › TIMELINE');
      assert.deepEqual(realErrors(page), []);
    } finally { await page.close(); }
  });

  await t.test('SEARCH: a mind map click SHOWS its whole tree beside the list; a name in it moves the SEARCH there, never the page', async () => {
    const page = await open('index.html');
    try {
      await page.evaluate(OPEN); await opened(page);
      const href = await page.evaluate(function () { return location.href; });
      await page.evaluate(PICK, 'Knowledge Record');
      await page.evaluate(PICK, 'SRCH');
      assert.equal(await page.evaluate(function () {
        return document.querySelector('#tsr .tsr-row[data-tsr-row="mm:10"] .tsr-pick').hasAttribute('data-tsr-folder');
      }), false, 'a mind map is not drawn as a folder to go into');

      await page.evaluate(PICK, 'Chemistry');
      assert.deepEqual(await page.evaluate(CRUMBS), ['All', 'Knowledge Record', 'SRCH'], 'the click does not go in');
      assert.equal(await page.evaluate(D_TITLE), 'Chemistry');
      assert.deepEqual(await page.evaluate(TREE), [
        'Chemistry',
        '  Organic',
        '    Alkanes',
        '      Kolb · 2026-03-05',
        '      MG · slow down at the start',
        '    Loop A',
        '      Loop B',
        '        ↻ Loop A',
        '      Deep',
        '        Deeper'
      ], 'opened out to the last leaf — the Kolb and MG too — with a loop drawn ↻ and not followed');

      await page.evaluate(TREE_CLICK, 'Deeper');
      assert.deepEqual(await page.evaluate(CRUMBS), ['All', 'Knowledge Record', 'SRCH', 'Chemistry', 'Organic', 'Loop A', 'Deep'],
        'a leaf in the tree: the search moves to the folder it is in');
      assert.equal(await page.evaluate(function () { return document.querySelector('#tsr .tsr-row.is-hi .tsr-title').textContent; }), 'Deeper',
        'with it chosen');
      assert.equal(await page.evaluate(D_TITLE), 'Deeper');
      assert.deepEqual(await page.evaluate(function () {
        return { q: document.getElementById('tsr-q').value, focus: document.activeElement && document.activeElement.id };
      }), { q: '', focus: 'tsr-q' }, 'ready to search again from there');

      await page.evaluate(function () { document.querySelector('#tsr [data-tsr-crumb="4"]').click(); return true; });
      assert.deepEqual(await page.evaluate(LIST), ['Alkanes', 'Loop A'], 'inside Organic');
      await page.evaluate(PICK, 'Alkanes');
      assert.deepEqual(await page.evaluate(CRUMBS), ['All', 'Knowledge Record', 'SRCH', 'Chemistry', 'Organic'], 'one level down: still shown, not gone into');
      assert.deepEqual(await page.evaluate(TREE), ['Alkanes', '  Kolb · 2026-03-05', '  MG · slow down at the start']);
      await page.evaluate(TREE_CLICK, 'Alkanes');
      assert.deepEqual(await page.evaluate(CRUMBS), ['All', 'Knowledge Record', 'SRCH', 'Chemistry', 'Organic', 'Alkanes'],
        'the tree\'s top: the search goes into it');
      assert.deepEqual(await page.evaluate(TREE), ['Kolb · 2026-03-05', 'MG · slow down at the start'], 'the folder you are in, opened out');

      await page.evaluate(function () { document.querySelector('#tsr [data-tsr-crumb="2"]').click(); return true; });
      await page.evaluate(TYPE, 'organic'); await settle();
      await page.evaluate(PICK, 'Organic');
      assert.deepEqual(await page.evaluate(CRUMBS), ['All', 'Knowledge Record', 'SRCH', 'Chemistry', 'Organic'],
        'and with a query typed, a hit with something inside is still gone into — the search works as it did');
      await sleep(400); // a wrong navigation would have begun by now
      assert.equal(await page.evaluate(function () { return location.href; }), href, 'nothing here moved the page');
      assert.deepEqual(realErrors(page), []);
    } finally { await page.close(); }
  });

  await t.test('SEARCH: a goal, its sub-goals and milestones, and a project page are shown the same way', async () => {
    const page = await open('index.html');
    try {
      await page.evaluate(OPEN); await opened(page);
      await page.evaluate(PICK, 'Documentations');
      await page.evaluate(PICK, 'Projects');
      assert.deepEqual(await page.evaluate(LIST), ['Pass finals']);
      await page.evaluate(PICK, 'Pass finals');
      assert.deepEqual(await page.evaluate(CRUMBS), ['All', 'Documentations', 'Projects']);
      assert.deepEqual(await page.evaluate(TREE), ['Pass finals', '  Maths', '    Past papers', '  Mocks done']);
      await page.evaluate(TREE_CLICK, 'Maths');
      assert.deepEqual(await page.evaluate(CRUMBS), ['All', 'Documentations', 'Projects', 'Pass finals', 'Maths'], 'a sub-goal is gone into');
      assert.equal(await page.evaluate(function () {
        var g = document.querySelector('#tsr .tsr-here .tsr-go'); return g && g.getAttribute('href');
      }), 'documentations.html?goal=g-sub', 'with its own Go →');

      await page.evaluate(function () { document.querySelector('#tsr [data-tsr-crumb="0"]').click(); return true; });
      await page.evaluate(PICK, 'Schedule');
      await page.evaluate(PICK, '▲ PROJECT');
      assert.deepEqual(await page.evaluate(LIST), ['[PROGRESSION]', 'Pass finals', '[MILESTONES]', 'Mocks done', '[QUEST]'],
        'the goal overview and the milestones, under their sub-tabs\' headings');
      await page.evaluate(PICK, 'Pass finals');
      assert.deepEqual(await page.evaluate(TREE), ['Pass finals', '  Maths', '    Past papers', '  Mocks done'], 'the same tree from here');
      assert.deepEqual(realErrors(page), []);
    } finally { await page.close(); }
  });

  await t.test('SEARCH: a mind map already on the crumbs (a loop) is drawn ↻ and is not entered again', async () => {
    const page = await open('index.html');
    try {
      await page.evaluate(OPEN); await opened(page);
      await intoTheLoop(page);
      const loopRow = await page.evaluate(function () {
        var r = document.querySelector('#tsr .tsr-row[data-tsr-loop]');
        return r ? { title: r.querySelector('.tsr-title').textContent, icon: r.querySelector('.tsr-ico').textContent,
          folder: r.querySelector('.tsr-pick').hasAttribute('data-tsr-folder') } : null;
      });
      assert.deepEqual(loopRow, { title: 'Loop A', icon: '↻', folder: false });
      await page.evaluate(PICK, 'Loop A');
      assert.deepEqual(await page.evaluate(CRUMBS), LOOP_CRUMBS, 'clicking it shows its details and does not go round again');
      assert.equal(await page.evaluate(D_TITLE), 'Loop A');
      assert.deepEqual(await page.evaluate(TREE), [], 'and opens no tree of it: it is already on the path');
    } finally { await page.close(); }
  });


  await t.test('SEARCH: a crumb that a search finds again, through a loop, is shown when clicked — never a dead click', async () => {
    const page = await open('index.html');
    try {
      await intoTheLoop(page);
      await page.evaluate(TYPE, 'loop'); await settle();
      assert.deepEqual(await page.evaluate(ROWS), ['Loop A'], 'inside Loop B, the search finds Loop A again');
      await page.evaluate(KEY, 'ArrowUp', {}, 'input'); // no row chosen: the details show Loop B
      assert.equal(await page.evaluate(function () { return document.querySelector('#tsr .tsr-d-title').textContent; }), 'Loop B');
      await page.evaluate(PICK, 'Loop A');
      assert.equal(await page.evaluate(function () { return document.querySelector('#tsr .tsr-d-title').textContent; }), 'Loop A',
        'clicking the found crumb shows it');
      assert.deepEqual(await page.evaluate(CRUMBS), LOOP_CRUMBS, 'and goes nowhere');
      assert.equal(await page.evaluate(function () {
        var r = document.querySelector('#tsr .tsr-row[data-tsr-loop]'); return r && r.querySelector('.tsr-ico').textContent;
      }), '↻', 'marked ↻ in search results as in a list');
    } finally { await page.close(); }
  });

  await t.test('SEARCH: entering a hit whose path runs back through a crumb climbs to that crumb — none appears twice', async () => {
    const page = await open('index.html');
    try {
      await intoTheLoop(page);
      await page.evaluate(TYPE, 'deep'); await settle();
      assert.deepEqual(await page.evaluate(ROWS), ['Loop A › Deep', 'Loop A › Deep › Deeper'], 'found through the loop, from Loop B');
      await page.evaluate(PICK, 'Deep');
      assert.deepEqual(await page.evaluate(CRUMBS), ['All', 'Knowledge Record', 'SRCH', 'Chemistry', 'Organic', 'Loop A', 'Deep'],
        'Loop A is climbed back to, not repeated');
    } finally { await page.close(); }
  });

  await t.test('SEARCH: a Go → to the page it is on reloads there, since pages read ? and # once', async () => {
    const page = await open('progress.html');
    try {
      await page.evaluate(function () { window.__beforeGo = 1; return true; });
      await page.evaluate(OPEN); await opened(page);
      await page.evaluate(TYPE, 'read a chapter'); await settle();
      assert.deepEqual(await page.evaluate(ROWS), ['Schedule › ■ ACTIONS › Read a chapter']);
      await page.evaluate(function () { document.querySelector('#tsr .tsr-row .tsr-go').click(); return true; });
      await page.waitFor(function () { return location.hash === '#actions' && window.__beforeGo === undefined; },
        { timeout: 30000, message: 'the page reloaded at #actions' });
      await page.waitFor(function () { return !!document.getElementById('tsr-btn'); }, { timeout: 60000, message: 'remounted' });
      assert.equal(await page.evaluate(function () { return document.getElementById('tsr'); }), null, 'and search is shut');
    } finally { await page.close(); }
  });

  await t.test('SEARCH: Ctrl K and / open it (never / while typing); arrows choose; Enter goes in; Escape closes unless taken', async () => {
    const page = await open('index.html');
    try {
      await page.evaluate(function () {
        var i = document.createElement('input'); i.id = 'host-input'; document.body.appendChild(i); i.focus(); return true;
      });
      await page.evaluate(KEY, '/', {}, null);
      await sleep(400);
      assert.equal(await page.evaluate(function () { return !!document.getElementById('tsr'); }), false, '/ typed into a field is just a /');

      await page.evaluate(function () { document.getElementById('host-input').remove(); document.body.focus(); return true; });
      await page.evaluate(KEY, 'k', { ctrlKey: true }, 'body');
      await opened(page);
      for (let i = 0; i < 3; i++) await page.evaluate(KEY, 'ArrowDown', {}, 'input');
      await page.evaluate(KEY, 'Enter', {}, 'input');
      assert.deepEqual(await page.evaluate(CRUMBS), ['All', 'Knowledge Record'], 'the third row, then Enter, goes into it');
      await page.evaluate(TYPE, 'alkanes'); await settle();
      await page.evaluate(KEY, 'Enter', {}, 'input');
      assert.deepEqual(await page.evaluate(CRUMBS), ['All', 'Knowledge Record', 'SRCH', 'Chemistry', 'Organic', 'Alkanes'],
        'Enter on a search hit with something inside goes in along its path');

      await page.evaluate(function () {
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') e.preventDefault(); }, { once: true });
        return true;
      });
      await page.evaluate(KEY, 'Escape', {}, 'input');
      assert.equal(await page.evaluate(function () { return !!document.getElementById('tsr'); }), true,
        'an Escape something else already handled leaves it open');
      await page.evaluate(KEY, 'Escape', {}, 'input');
      assert.equal(await page.evaluate(function () { return !!document.getElementById('tsr'); }), false, 'a plain Escape closes it');
      assert.equal(await page.evaluate(function () { return document.activeElement && document.activeElement.id; }), 'tsr-btn',
        'and gives the focus back to the button');

      await page.evaluate(KEY, '/', {}, 'body');
      await opened(page);
      await page.evaluate(KEY, 'k', { metaKey: true }, 'input');
      assert.equal(await page.evaluate(function () { return !!document.getElementById('tsr'); }), false, '⌘ K closes it again');
      assert.deepEqual(realErrors(page), []);
    } finally { await page.close(); }
  });

  await t.test('SEARCH: an edit in another tab reaches an open panel', async () => {
    const page = await open('index.html');
    try {
      await page.evaluate(OPEN); await opened(page);
      await page.evaluate(TYPE, 'zoology'); await settle();
      assert.deepEqual(await page.evaluate(ROWS), []);
      await page.evaluate(function () {
        var db = JSON.parse(localStorage.getItem('track_db'));
        db.slots[0].mms = db.slots[0].mms.concat([{ id: 99, name: 'Zoology', type: '1', parentIds: [] }]);
        localStorage.setItem('track_db', JSON.stringify(db)); // stands in for the other tab's write
        window.dispatchEvent(new StorageEvent('storage', { key: 'track_db' }));
        return true;
      });
      await settle();
      assert.deepEqual(await page.evaluate(ROWS), ['Knowledge Record › SRCH › Zoology'], 'the index is rebuilt and the search re-run');
    } finally { await page.close(); }
  });

  await t.test('SEARCH: on a phone — finger targets, details replace the list with a way back, the notes button steps aside', async () => {
    const page = await open('progress.html', { viewport: PHONE });
    try {
      const btn = await page.evaluate(function () {
        var b = document.getElementById('tsr-btn').getBoundingClientRect();
        var n = document.getElementById('nw-btn').getBoundingClientRect();
        var bar = document.querySelector('.track-tabbar');
        var barTop = bar ? bar.getBoundingClientRect().top : window.innerHeight;
        var hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return { w: b.width, h: b.height, aboveNotes: b.bottom <= n.top, aboveBar: b.bottom <= barTop, self: hit && hit.closest('#tsr-btn') !== null };
      });
      assert.deepEqual(btn, { w: 48, h: 48, aboveNotes: true, aboveBar: true, self: true },
        'a 48px button above the notes button and the tab bar, taking its own tap');

      await page.evaluate(OPEN); await opened(page);
      assert.equal(await page.evaluate(function () { return getComputedStyle(document.getElementById('nw-btn')).visibility; }), 'hidden',
        'the notes button does not float over the open panel');
      await page.evaluate(TYPE, 'bonds'); await settle();
      const sizes = await page.evaluate(function () {
        return Array.prototype.map.call(document.querySelectorAll('#tsr .tsr-pick, #tsr .tsr-row .tsr-go'), function (e) {
          return Math.round(e.getBoundingClientRect().height);
        });
      });
      assert.ok(sizes.length >= 6 && sizes.every(h => h >= 44), 'every pick and Go is at least 44px: ' + sizes.join(','));
      await page.evaluate(PICK, 'Kolb · 2026-03-05');
      const shown = await page.evaluate(function () {
        var list = document.querySelector('#tsr .tsr-list'), detail = document.querySelector('#tsr .tsr-detail');
        return { list: getComputedStyle(list).display, detail: getComputedStyle(detail).display,
          back: getComputedStyle(document.querySelector('#tsr .tsr-back')).display };
      });
      assert.deepEqual(shown, { list: 'none', detail: 'block', back: 'block' }, 'the details replace the list');
      await page.evaluate(KEY, 'Escape', {}, 'input');
      assert.equal(await page.evaluate(function () { return getComputedStyle(document.querySelector('#tsr .tsr-list')).display; }), 'block',
        'Escape on the details goes back to the list first');
      await page.evaluate(TYPE, ''); await settle();
      await page.evaluate(PICK, 'Knowledge Record');
      await page.evaluate(PICK, 'SRCH');
      await page.evaluate(PICK, 'Chemistry');
      const tree = await page.evaluate(function () {
        return { list: getComputedStyle(document.querySelector('#tsr .tsr-list')).display,
          rows: Array.prototype.map.call(document.querySelectorAll('#tsr .tsr-t-row'), function (r) { return Math.round(r.getBoundingClientRect().height); }) };
      });
      assert.equal(tree.list, 'none', 'a mind map\'s tree replaces the list too');
      assert.ok(tree.rows.length >= 9 && tree.rows.every(h => h >= 44), 'every tree row is at least 44px: ' + tree.rows.join(','));
      await page.evaluate(TREE_CLICK, 'Deep');
      assert.equal(await page.evaluate(function () { return getComputedStyle(document.querySelector('#tsr .tsr-list')).display; }), 'block',
        'a name in the tree moves the search, and the list shows where it went');
      await page.evaluate(function () { document.querySelector('#tsr [data-tsr-close]').click(); return true; });
      assert.equal(await page.evaluate(function () { return getComputedStyle(document.getElementById('nw-btn')).visibility; }), 'visible',
        'and comes back when search closes');
      const m = await page.evaluate(function () { return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }; });
      assert.equal(m.sw, m.cw, 'nothing overflows the 390px screen');
      assert.deepEqual(realErrors(page), []);
    } finally { await page.close(); }
  });

  await t.test('SEARCH: neither the button nor an open panel prints', async () => {
    const page = await open('documentations.html');
    try {
      await page.evaluate(OPEN); await opened(page);
      await page.session.send('Emulation.setEmulatedMedia', { media: 'print' });
      const shown = await page.evaluate(function () {
        return [getComputedStyle(document.getElementById('tsr-btn')).display, getComputedStyle(document.getElementById('tsr')).display];
      });
      await page.session.send('Emulation.setEmulatedMedia', { media: '' });
      assert.deepEqual(shown, ['none', 'none']);
    } finally { await page.close(); }
  });
});
