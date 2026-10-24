/* ── tests/browser.test.js ─────────────────────────────────────────────────
   End-to-end tests in the real system Chrome, driven over CDP. No Playwright,
   no Puppeteer, no node_modules — see tests/lib/cdp.js.

   Run:  node --test tests/browser.test.js       (or: node tests/run.js)

   Three things are covered, in the order they matter:

   1. The white-screen class of regression: every page mounts, with no uncaught
      error, which is the only automated check the inline JSX in these HTML
      files ever gets — `node --check` cannot see it.
   2. The P0 in NOTES Proposal 2: sir-ks02.html must not revert a slot field
      another page wrote after it mounted. This test is the reason the file
      exists; it fails against the pre-fix page and passes against the fixed one.
   3. The export → import contract, including that `docPageId` survives on the
      items that carry it.

   Every fixture here is synthetic (tests/lib/fixture.js). A real export must
   never be used as test data.
*/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { Browser, sleep } = require('./lib/cdp.js');
const { startServer } = require('./lib/server.js');
const F = require('./lib/fixture.js');

const PAGES = ['index.html', 'progress.html', 'sir-ks02.html', 'documentations.html', 'true-storage.html'];

// Tailwind's CDN build and Babel's in-browser transform both warn loudly about
// being used in production. That is expected here and is not a page error.
const EXPECTED_NOISE = /cdn\.tailwindcss\.com|babel|in-browser Babel transformer|Download the React DevTools/i;
const realErrors = page => page.errors.filter(e => !EXPECTED_NOISE.test(e));

// The db a page is seeded with. One slot, every canonical field present.
function seedDb(over = {}) {
  return { slots: [F.populatedSlot(over)], activeSlotId: 'slot-test-1' };
}

/* Mirrors _writeSlotKey in documentations.html: a fresh read, one key merged,
   written back through the quota guard. Used to stand in for "another page
   wrote a field" without depending on that page's UI. */
const WRITE_SLOT_KEY = function (key, val) {
  var db = JSON.parse(localStorage.getItem('track_db') || '{}');
  var slots = db.slots || [];
  if (!slots.length) return false;
  var id = (slots.filter(function (s) { return s.id === db.activeSlotId; })[0] || slots[0]).id;
  db.slots = slots.map(function (s) {
    if (s.id !== id) return s;
    var next = Object.assign({}, s); next[key] = val; return next;
  });
  return window.TrackStorage.saveDB(db);
};

const READ_SLOT = function () {
  var db = JSON.parse(localStorage.getItem('track_db') || '{}');
  var slots = db.slots || [];
  return slots.filter(function (s) { return s.id === db.activeSlotId; })[0] || slots[0] || null;
};

// React tracks input values on the DOM node, so a plain `el.value = x` is
// invisible to it. Go through the native setter, then fire `input`.
const SET_REACT_INPUT = 'function (el, value) {' +
  'var proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;' +
  'Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);' +
  'el.dispatchEvent(new Event("input", {bubbles: true}));' +
  '}';

const skipUnlessChrome = { skip: Browser.available() ? false : 'no Chrome found (set CHROME_PATH)' };

/* TRACK_TEST_ROOT serves a different directory instead of the repository.
   That is how you A/B a fix: build a scratch directory of symlinks to the repo
   plus the ONE pre-fix file, point this at it, and watch the regression tests
   fail. A test nobody has seen fail is not evidence. Never put a baseline copy
   in the repository itself. */
test('browser suites', skipUnlessChrome, async t => {
  const server = await startServer(process.env.TRACK_TEST_ROOT || undefined);
  const browser = await Browser.launch();
  /* `finally`, not `;`. These were once one statement, and when browser.close()
     threw on a stubborn profile directory the server was never closed — leaving
     a listening socket that kept node alive forever. close() no longer throws,
     so this is belt-and-braces, but it is the line the leak was made of. */
  t.after(async () => {
    try { await browser.close(); } finally { await server.close(); }
  });

  /* `fresh` wipes the origin before seeding. Tabs share one browser profile,
     so a test that skips it inherits the previous test's data — and seed() is
     deliberately guarded against overwriting, so the stale data wins silently.
     The second tab of a two-tab test must pass fresh:false, or it erases the
     state the first tab is under test with. */
  const open = async (file, { db = null, raw = null, hash = '', fresh = true, extra = null,
                              viewport = null } = {}) => {
    const page = await browser.newPage();
    if (fresh) await page.clearStorage(server.origin);
    /* BEFORE goto, and that is not cosmetic. A phone case's real subject is a
       lazy useState initializer that reads TrackViewport.isPhone() exactly once,
       at mount — progress.html's timelineMode is the one that matters. Set the
       viewport after mount and the page has already decided it is a desktop, so
       the case measures a RESIZE instead of a phone: it fails for the wrong
       reason today, and would pass for the wrong reason the moment anything
       subscribes. The existing 820x1180 call at the iPad case sets it after
       open() on purpose — that case's subject is CSS, which re-evaluates. */
    if (viewport) await page.setViewport(...viewport);
    if (raw !== null) await page.seedRaw(raw, extra || {});
    else if (db || extra) await page.seed(db || {}, extra || {});
    await page.goto(server.url(file) + hash);
    await page.skipFirebase();
    return page;
  };

  /* One phone, spelled once. 390x844 is an iPhone 14/15 in portrait — the
     narrowest mainstream device, and comfortably inside the 720px breakpoint.
     deviceScaleFactor 3 and touch are what make it a phone rather than a narrow
     desktop window: touch is what activates `@media (hover: none)`. */
  const PHONE = [390, 844, { mobile: true, deviceScaleFactor: 3, touch: true }];

  /* index.html has several file inputs. Pick the one wired to importSlot, or a
     dump importer runs and the test "passes" having imported nothing. */
  const IMPORT_FILE = function (text) {
    var input = Array.prototype.find.call(document.querySelectorAll('input[type=file]'),
      function (i) { return (i.getAttribute('onchange') || '').indexOf('importSlot') >= 0; });
    var dt = new DataTransfer();
    dt.items.add(new File([text], 'synthetic-slot.json', { type: 'application/json' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  };

  // FileReader is async, so an import failure only shows up a tick later.
  const waitForDialog = async page => {
    const until = Date.now() + 10000;
    while (!page.dialogs.length && Date.now() < until) await sleep(50);
    return page.dialogs;
  };

  const addUltimateGoal = async (page, title) => {
    await page.waitFor(function () {
      return Array.prototype.some.call(document.querySelectorAll('button'), function (b) {
        var text = b.textContent.trim();
        return text === '+ add ultimate goal' || text === '+ goal';
      });
    }, { message: 'an add-goal button' });
    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('button'), function (b) {
        var text = b.textContent.trim();
        return text === '+ add ultimate goal' || text === '+ goal';
      }).click();
      return true;
    });
    await page.waitFor(function () {
      return !!document.querySelector('input[placeholder="Ultimate goal…"], input[placeholder="Goal name…"]');
    },
      { message: 'ultimate-goal input' });
    await page.evaluate(function (setterSrc, value) {
      var set = new Function('return ' + setterSrc)();
      set(document.querySelector('input[placeholder="Ultimate goal…"], input[placeholder="Goal name…"]'), value);
      return true;
    }, SET_REACT_INPUT, title);
    await page.evaluate(function () {
      var input = document.querySelector('input[placeholder="Ultimate goal…"], input[placeholder="Goal name…"]');
      Array.prototype.find.call(input.parentElement.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'add'; }).click();
      return true;
    });
  };

  // ── 1. smoke ────────────────────────────────────────────────────────────

  for (const file of PAGES) {
    await t.test('smoke: ' + file + ' mounts with no page error', async () => {
      const page = await open(file, { db: seedDb() });

      // index.html is static markup; the other three mount a React root.
      const containerSel = file === 'index.html' ? '#slot-list' : '#root';
      const filled = await page.waitFor(function (sel) {
        var el = document.querySelector(sel);
        return !!el && el.children.length > 0;
      }, { args: [containerSel], message: containerSel + ' non-empty in ' + file });
      assert.ok(filled, containerSel + ' rendered content');

      assert.equal(await page.evaluate(function () { return typeof window.TrackStorage; }), 'object',
        'the quota guard is present');
      assert.equal(await page.evaluate(function () { return typeof window.TrackSchema; }), 'object',
        'the canonical schema is present');
      assert.equal(await page.evaluate(function () { return !!document.getElementById('nw-btn'); }), true,
        'the notes widget mounted');
      assert.equal(await page.evaluate(function () {
        return window.TrackSync ? window.TrackSync.getStatus().state : 'no-sync';
      }), 'signed-out', 'skipping the overlay leaves sync inert');
      assert.equal(await page.evaluate(function () { return !!document.getElementById('fb-overlay'); }), false,
        'the auth overlay is dismissed');

      assert.deepEqual(realErrors(page), [], 'no uncaught errors in ' + file);
      await page.close();
    });
  }

  await t.test('smoke: an empty install does not white-screen', async () => {
    for (const file of PAGES) {
      const page = await open(file);
      const sel = file === 'index.html' ? '#slot-list' : '#root';
      await page.waitFor(function (s) {
        var el = document.querySelector(s);
        return !!el && el.children.length > 0;
      }, { args: [sel], message: file + ' with no seeded data' });
      assert.deepEqual(realErrors(page), [], file + ' bootstrapped an empty database cleanly');
      await page.close();
    }
  });

  // ── 2. NOTES Proposal 2 — KS02 must not revert another writer's fields ──

  await t.test('regression: a KS02 edit does not revert fields written by another tab', async () => {
    const db = seedDb({
      kolbs: [F.kolb(1, '2026-03-05', { mmId: 10, experience: 'seed' })],
      calendarNotes: [], deadlines: [], docPages: [F.docPage('p-1')]
    });

    // KS02 mounts FIRST, so its in-memory snapshot predates the other tab's
    // write. That ordering is the whole bug.
    const ks02 = await open('sir-ks02.html', { db, hash: '#kolb' });
    await ks02.waitFor(function () {
      return !!Array.prototype.find.call(document.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'dupe'; });
    }, { message: 'KS02 kolb list' });

    const docs = await open('documentations.html', { fresh: false });
    await docs.waitFor(function () { return !!document.querySelector('.docs-editor'); },
      { message: 'documentations editor' });

    // the other tab authors a day note and a deadline, both stamped with the
    // documentation page that wrote them, and edits docPages too
    const note = { id: 'cn-doc', date: '2026-03-10', title: 'Written from a page', detail: '', docPageId: 'p-1' };
    const dl = { id: 'dl-doc', date: '2026-03-12', time: '09:00', title: 'Doc deadline',
      detail: '', cautionDates: ['2026-03-08', '2026-03-09'], docPageId: 'p-1' };
    assert.notEqual(await docs.evaluate(WRITE_SLOT_KEY, 'calendarNotes', [note]), false);
    assert.notEqual(await docs.evaluate(WRITE_SLOT_KEY, 'deadlines', [dl]), false);
    assert.notEqual(await docs.evaluate(WRITE_SLOT_KEY, 'docPages',
      [F.docPage('p-1', { title: 'Renamed by the other tab' })]), false);

    // the KS02 tab shares the origin, so it can see that write
    await ks02.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      return ((db.slots || [])[0].calendarNotes || []).length === 1;
    }, { message: 'the other tab\'s write reaching this origin' });

    // now a real KS02 edit: duplicate the seeded Kolb (window.confirm is
    // auto-accepted by the driver)
    await ks02.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'dupe'; }).click();
    });
    await ks02.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      return ((db.slots || [])[0].kolbs || []).length === 2;
    }, { message: 'the KS02 edit being saved' });

    const slot = await ks02.evaluate(READ_SLOT);

    assert.equal(slot.kolbs.length, 2, 'KS02 still saves the field it owns');
    assert.equal(slot.calendarNotes.length, 1, 'the day note written by the other tab survived');
    assert.equal(slot.calendarNotes[0].docPageId, 'p-1', 'and kept the page that authored it');
    assert.equal(slot.calendarNotes[0].title, 'Written from a page');
    assert.equal(slot.deadlines.length, 1, 'the deadline survived');
    assert.equal(slot.deadlines[0].docPageId, 'p-1');
    assert.deepEqual(slot.deadlines[0].cautionDates, ['2026-03-08', '2026-03-09'],
      'with its chosen caution days intact');
    assert.equal(slot.docPages[0].title, 'Renamed by the other tab', 'the docPages edit survived');

    assert.deepEqual(realErrors(ks02), []);
    await ks02.close(); await docs.close();
  });

  await t.test('regression: KS02 writes no key it does not own', async () => {
    const db = seedDb({ kolbs: [F.kolb(1, '2026-03-05', { mmId: 10 })] });
    const ks02 = await open('sir-ks02.html', { db, hash: '#kolb' });
    await ks02.waitFor(function () {
      return !!Array.prototype.find.call(document.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'dupe'; });
    }, { message: 'KS02 kolb list' });

    // a sentinel in every field KS02 must leave alone, including one it has
    // never heard of — a partial allowlist rebuild would drop that one
    const foreign = { goals: [{ id: 'g-x', title: 'owned by Progress', children: [] }],
      saActions: [{ id: 'a-x' }], saEntries: [{ id: 'e-x' }], mmEntries: [{ id: 'me-x' }],
      mgSchedule: { '2026-03-01': [11] }, calendarNotes: [{ id: 'n-x', date: '2026-03-10' }],
      deadlines: [{ id: 'd-x', date: '2026-03-10' }], docPages: [{ id: 'p-x' }],
      notes: [{ id: 'w-x' }], futureField: { written: 'by a later version' },
      // Owned by true-storage.html. KS02 may write these two ONLY through the
      // single-key tag path, never as part of its autosave patch — so an
      // ordinary KS02 edit has to leave them exactly as they were found.
      trueStorages: [{ id: 'ts-x', name: 'owned by True Storage', parentIds: [], tags: [] }],
      trueStoragePos: { 'ts-x': { x: 5, y: 6 } },
      // A pasted timetable — owned by progress.html, which edits it, and
      // written by documentations.html through a fresh read-modify-write. KS02
      // has never heard of it.
      refSchedules: [{ id: 'rs-x', dow: 1, time: '09:00', duration: 60, title: 'owned by Progress' }] };
    for (const [k, v] of Object.entries(foreign)) {
      assert.notEqual(await ks02.evaluate(WRITE_SLOT_KEY, k, v), false, 'seeding ' + k);
    }

    await ks02.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'dupe'; }).click();
    });
    await ks02.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      return ((db.slots || [])[0].kolbs || []).length === 2;
    }, { message: 'the KS02 edit being saved' });

    const slot = await ks02.evaluate(READ_SLOT);
    for (const [k, v] of Object.entries(foreign)) {
      assert.deepEqual(slot[k], v, k + ' was left exactly as another writer left it');
    }
    await ks02.close();
  });

  await t.test('switching the active slot in another tab keeps KS02 workspaces independent', async () => {
    const db = F.dbWith([
      F.emptySlot({ id: 'slot-a', name: 'Alpha', mms: [F.mm(1, 'A-only')] }),
      F.emptySlot({ id: 'slot-b', name: 'Beta',  mms: [F.mm(2, 'B-only')] })
    ], 'slot-a');
    const ks02 = await open('sir-ks02.html', { db, hash: '#ks02' });
    await ks02.waitFor(function () { return document.body.textContent.indexOf('A-only') >= 0; },
      { message: 'KS02 showing slot A' });
    const home = await open('index.html', { fresh: false });

    await home.evaluate(function () { window.activateSlot('slot-b'); return true; });
    await ks02.waitFor(function () { return document.body.textContent.indexOf('B-only') >= 0; },
      { message: 'KS02 following the active slot to B' });
    await sleep(500); // let the autosave effects caused by the refresh settle

    const stored = await home.evaluate(function () {
      return JSON.parse(localStorage.getItem('track_db')).slots.map(function (s) {
        return { id: s.id, names: (s.mms || []).map(function (m) { return m.name; }) };
      });
    });
    assert.deepEqual(stored, [
      { id: 'slot-a', names: ['A-only'] },
      { id: 'slot-b', names: ['B-only'] }
    ], 'loading B must not copy its KS02-owned fields into A');
    await ks02.close(); await home.close();
  });

  await t.test('switching the active slot refreshes Progress before its next edit', async () => {
    const db = F.dbWith([
      F.emptySlot({ id: 'slot-a', name: 'Alpha', goals: [F.task('goal-a', { title: 'Goal A' })] }),
      F.emptySlot({ id: 'slot-b', name: 'Beta',  goals: [F.task('goal-b', { title: 'Goal B' })] })
    ], 'slot-a');
    const progress = await open('progress.html', { db });
    await progress.waitFor(function () { return document.body.textContent.indexOf('Goal A') >= 0; },
      { message: 'Progress showing slot A' });
    const home = await open('index.html', { fresh: false });

    await home.evaluate(function () { window.activateSlot('slot-b'); return true; });
    await progress.waitFor(function () { return document.body.textContent.indexOf('Goal B') >= 0; },
      { message: 'Progress following the active slot to B' });
    await addUltimateGoal(progress, 'New on B');

    const slots = await progress.waitFor(function () {
      var out = JSON.parse(localStorage.getItem('track_db')).slots;
      return out[1].goals.some(function (g) { return g.title === 'New on B'; }) ? out : false;
    }, { message: 'the edit landing in slot B' });
    assert.deepEqual(slots[0].goals.map(g => g.title), ['Goal A'], 'slot A stayed untouched');
    assert.deepEqual(slots[1].goals.map(g => g.title), ['Goal B', 'New on B'],
      'the visible slot B state was extended rather than replaced by stale A state');
    await progress.close(); await home.close();
  });

  await t.test('a Documentations calendar block authors a day note carrying its page id', async () => {
    const db = seedDb({ calendarNotes: [], deadlines: [], docPages: [F.docPage('p-1', { title: 'Test Page' })] });
    const docs = await open('documentations.html', { db });
    await docs.waitFor(function () { return !!document.querySelector('.docs-editor'); },
      { message: 'documentations editor' });

    // add a calendar block from the real block menu
    await docs.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('.docs-addmenu button'),
        function (b) { return /Calendar/.test(b.textContent); }).click();
    });
    await docs.waitFor(function () { return !!document.querySelector('.doc-cal'); },
      { message: 'the calendar block' });

    // select today, which is always present in the month the block opens on
    const today = await docs.evaluate(function () {
      var d = new Date();
      var cells = Array.prototype.filter.call(document.querySelectorAll('.doc-cal .cal-cell'),
        function (c) { return !c.classList.contains('empty'); });
      var cell = cells[d.getDate() - 1];
      cell.click();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    });
    await docs.waitFor(function () { return !!document.querySelector('.doc-cal .cal-detail'); },
      { message: 'the day detail panel' });

    await docs.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('.doc-cal button'),
        function (b) { return b.textContent.trim() === '+ note'; }).click();
    });
    await docs.waitFor(function () { return !!document.querySelector('.cal-doc-form input'); },
      { message: 'the note composer' });

    await docs.evaluate(function (setterSrc, value) {
      var set = new Function('return ' + setterSrc)();
      set(document.querySelector('.cal-doc-form input'), value);
      return true;
    }, SET_REACT_INPUT, 'Authored from the page');

    await docs.evaluate(function () {
      document.querySelector('.cal-doc-form button.primary').click();
    });

    const notes = await docs.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var n = ((db.slots || [])[0] || {}).calendarNotes || [];
      return n.length ? n : false;
    }, { message: 'the note reaching track_db' });

    assert.equal(notes.length, 1);
    assert.equal(notes[0].title, 'Authored from the page');
    assert.equal(notes[0].docPageId, 'p-1', 'the note names the page that authored it');
    assert.equal(notes[0].date, today, 'and lands on the LOCAL calendar day that was clicked');
    assert.deepEqual(realErrors(docs), []);
    await docs.close();
  });

  // ── 2b. NOTES Proposal 14 — the four trade-offs, now decided ────────────

  /* Days 15-22 exist in every month, so a fixture placed there is always
     visible in the month a calendar block opens on. */
  const now = new Date();
  const thisMonthDay = n => now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' + String(n).padStart(2, '0');

  /* Local calendar day, n days from today. Deadline run-ups are relative to
     today, and toISOString() would hand back a UTC day that is off by one for
     most of the world — the exact bug AGENTS.md forbids in the pages. */
  const dayFromToday = n => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
      '-' + String(d.getDate()).padStart(2, '0');
  };

  /* Every day from `from` up to but NOT including `to`, for seeding a fixture
     with the caution days a pre-choice run-up used to produce. Written out here
     rather than imported so a fixture never depends on the code under test. */
  const runUpDays = (from, to) => {
    const out = [];
    const d = new Date(from + 'T12:00:00');
    for (let i = 0; i < 400; i++) {
      const ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
        '-' + String(d.getDate()).padStart(2, '0');
      if (ds >= to) break;
      out.push(ds);
      d.setDate(d.getDate() + 1);
    }
    return out;
  };

  const addCalendarBlock = async page => {
    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('.docs-addmenu button'),
        function (b) { return /Calendar/.test(b.textContent); }).click();
    });
    await page.waitFor(function () { return !!document.querySelector('.doc-cal'); },
      { message: 'the calendar block' });
  };
  const selectDay = async (page, n) => {
    await page.evaluate(function (day) {
      Array.prototype.filter.call(document.querySelectorAll('.doc-cal .cal-cell'),
        function (c) { return !c.classList.contains('empty'); })[day - 1].click();
    }, n);
    await page.waitFor(function () { return !!document.querySelector('.doc-cal .cal-detail'); },
      { message: 'the day detail panel' });
  };

  await t.test('the print flatten rule is split, so a parse failure cannot cost the baseline', async () => {
    const page = await open('documentations.html', { db: seedDb() });
    const rules = await page.evaluate(function () {
      var out = [];
      for (var i = 0; i < document.styleSheets.length; i++) {
        var rules; try { rules = document.styleSheets[i].cssRules; } catch (e) { continue; }
        for (var j = 0; j < rules.length; j++) {
          var media = rules[j];
          if (media.type !== CSSRule.MEDIA_RULE || media.conditionText.indexOf('print') < 0) continue;
          for (var k = 0; k < media.cssRules.length; k++) {
            var r = media.cssRules[k];
            if (r.selectorText) out.push({ sel: r.selectorText, color: r.style.color });
          }
        }
      }
      return out;
    });

    const flattening = rules.filter(r => r.color === 'rgb(17, 17, 17)');
    const baseline = flattening.filter(r => r.sel === 'body.docs-page .docs-editor');
    const exemption = flattening.filter(r => r.sel.indexOf(':not(.doc-cal') >= 0);

    assert.equal(baseline.length, 1, 'the baseline flatten rule stands alone');
    assert.equal(exemption.length, 1, 'and the calendar exemption parsed as its own rule');
    assert.ok(rules.every(r => !(r.sel.indexOf('.docs-editor,') >= 0 && r.sel.indexOf(':not(.doc-cal') >= 0)),
      'no single selector list contains both — dropping one must not drop the other');
    await page.close();
  });

  await t.test('an item whose source page was deleted is read-only in a calendar block', async () => {
    const db = seedDb({
      docPages: [F.docPage('p-1')],
      calendarNotes: [
        F.calNote('own', thisMonthDay(15), { title: 'Mine', docPageId: 'p-1' }),
        F.calNote('orphan', thisMonthDay(15), { title: 'Stranded', docPageId: 'deleted-page' }),
        F.calNote('sched', thisMonthDay(15), { title: 'From the Schedule' })
      ],
      deadlines: []
    });
    const page = await open('documentations.html', { db });
    await page.waitFor(function () { return !!document.querySelector('.docs-editor'); },
      { message: 'documentations editor' });
    await addCalendarBlock(page);
    await selectDay(page, 15);

    const rows = await page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll('.doc-cal .cal-doc-row'), function (r) {
        return { text: r.textContent, editable: !!r.querySelector('.cal-doc-row-acts') };
      });
    });
    const row = t => rows.find(r => r.text.indexOf(t) >= 0);
    assert.equal(rows.length >= 3, true, 'all three notes are listed');
    assert.equal(row('Mine').editable, true, 'the page that wrote it may still edit it');
    assert.equal(row('Stranded').editable, false, 'an orphan is visible but not editable here');
    assert.equal(row('From the Schedule').editable, false, 'and neither is a Schedule-authored item');
    await page.close();
  });

  await t.test('a deadline marks its due day strongly and its caution run-up softly', async () => {
    const db = seedDb({
      docPages: [F.docPage('p-1'), F.docPage('p-other')],
      calendarNotes: [],
      deadlines: [
        F.deadline('mine', thisMonthDay(22),
          { cautionDates: [thisMonthDay(20), thisMonthDay(21)], docPageId: 'p-1' }),
        F.deadline('theirs', thisMonthDay(17),
          { cautionDates: [thisMonthDay(16)], docPageId: 'p-other' })
      ]
    });
    const page = await open('documentations.html', { db });
    await page.waitFor(function () { return !!document.querySelector('.docs-editor'); },
      { message: 'documentations editor' });
    await addCalendarBlock(page);

    const cls = await page.evaluate(function () {
      return Array.prototype.filter.call(document.querySelectorAll('.doc-cal .cal-cell'),
        function (c) { return !c.classList.contains('empty'); })
        .map(function (c) { return c.className; });
    });
    const at = n => cls[n - 1];
    assert.ok(at(22).indexOf('cal-doc-own-day') >= 0, 'the due day carries the owned mark');
    assert.ok(at(21).indexOf('cal-doc-caution-day') >= 0, 'the run-up is marked');
    assert.ok(at(20).indexOf('cal-doc-caution-day') >= 0, 'from its start date');
    assert.ok(at(22).indexOf('cal-doc-caution-day') < 0, 'the due day is not double-marked');
    assert.ok(at(19).indexOf('cal-doc') < 0, 'the day before the run-up is unmarked');
    assert.ok(at(17).indexOf('cal-doc') < 0, 'another page\'s deadline marks nothing here');
    assert.ok(at(16).indexOf('cal-doc') < 0);
    await page.close();
  });

  /* ── "Coming up" ────────────────────────────────────────────────────────
     Day notes and deadlines get no category dot — they are not in TC.CATS —
     and the ownership edge bar is drawn for THIS calendar's items alone, so
     everything else on the calendar was unreachable without clicking the day
     it sits on. These cases cover the list that fixes that. Days are seeded
     with dayFromToday so they cannot rot, and the block is added through the
     real add menu so the test cannot drift from the shape the page writes. */

  /* The db the cases below are built from: four items ahead, spanning three
     origins and two months. It holds NO past item on purpose. The cutoff is
     tested by its own case against its own fixture, so that reversing the
     cutoff does not also move every count asserted here — which would wrap this
     file's other baselines inside that one instead of leaving them disjoint. */
  const upDb = () => seedDb({
    docPages: [F.docPage('p-1', { title: 'Physics 101' }), F.docPage('p-other', { title: 'Lab notes' })],
    calendarNotes: [
      F.calNote('n-own', dayFromToday(2), { title: 'Mine', time: '09:00', docPageId: 'p-1' }),
      F.calNote('n-sched', dayFromToday(3), { title: 'From the Schedule' })
    ],
    deadlines: [
      F.deadline('d-own', dayFromToday(5), { title: 'My deadline', docPageId: 'p-1',
        cautionDates: [dayFromToday(3), dayFromToday(4)] }),
      F.deadline('d-other', dayFromToday(40), { title: 'Theirs', docPageId: 'p-other' })
    ]
  });

  const upRows = page => page.evaluate(function () {
    return Array.prototype.map.call(document.querySelectorAll('.doc-cal-up-row'), function (r) {
      return {
        date: r.getAttribute('data-up-date'), kind: r.getAttribute('data-up-kind'),
        own: r.classList.contains('own'), done: r.classList.contains('done'),
        text: r.textContent.replace(/\s+/g, ' ').trim(),
        tip: (r.querySelector('.doc-cal-up-main') || {}).title
      };
    });
  });

  const openWithUpList = async db => {
    const page = await open('documentations.html', { db });
    await page.waitFor(function () { return !!document.querySelector('.docs-editor'); },
      { message: 'documentations editor' });
    await addCalendarBlock(page);
    await page.waitFor(function () { return !!document.querySelector('[data-doc-cal-upcoming]'); },
      { message: 'the Coming up list' });
    return page;
  };

  await t.test('DOCUMENTATIONS: the upcoming list shows notes and deadlines with no day clicked', async () => {
    const page = await openWithUpList(upDb());

    // The claim this case is named for, asserted FIRST: no cell was clicked.
    const open_ = await page.evaluate(function () {
      return !!document.querySelector('.doc-cal .cal-detail');
    });
    assert.equal(open_, false, 'no day panel is open');

    const rows = await upRows(page);
    assert.equal(rows.length, 4, 'four items ahead are listed with nothing clicked');
    const row = s => rows.find(r => r.text.indexOf(s) >= 0);
    assert.ok(row('Mine') && row('From the Schedule') && row('Theirs'),
      'all three origins reach the list, not just the ones this page owns');
    assert.equal(row('Mine').own, true, 'this page\'s own note is marked');
    assert.equal(row('From the Schedule').own, false, 'a Schedule-authored item is not');
    assert.equal(row('Theirs').own, false, 'and neither is another page\'s');
    assert.ok(/📄 Lab notes/.test(row('Theirs').text), 'the other page is named by its origin chip');
    assert.ok(/2 caution days/.test(row('My deadline').text),
      'a deadline carries its caution COUNT rather than one row per caution day');
    assert.equal(rows.filter(r => r.kind === 'deadline' && /My deadline/.test(r.text)).length, 1,
      'and is listed exactly once, on its due day');
    await page.close();
  });

  await t.test('DOCUMENTATIONS: the upcoming list omits a past item and names the cutoff', async () => {
    // Its own fixture, holding the past item the shared one deliberately omits.
    const page = await openWithUpList(seedDb({
      docPages: [F.docPage('p-1', { title: 'Physics 101' })],
      calendarNotes: [
        F.calNote('n-past', dayFromToday(-3), { title: 'Already gone', docPageId: 'p-1' }),
        F.calNote('n-ahead', dayFromToday(3), { title: 'Still to come', docPageId: 'p-1' })
      ],
      deadlines: [F.deadline('d-past', dayFromToday(-1), { title: 'Long gone', docPageId: 'p-1' })]
    }));
    const rows = await upRows(page);
    assert.equal(rows.length, 1, 'only the item ahead is listed');
    assert.ok(!rows.some(r => /Already gone|Long gone/.test(r.text)),
      'a note and a deadline dated before today are both absent');
    assert.ok(!rows.some(r => r.date < dayFromToday(0)), 'nothing before today survives the cut');
    await page.close();

    // and with nothing ahead at all, the empty state says WHERE the list starts
    const bare = await openWithUpList(seedDb({
      docPages: [F.docPage('p-1')],
      calendarNotes: [F.calNote('n-past', dayFromToday(-1), { title: 'Yesterday', docPageId: 'p-1' })],
      deadlines: []
    }));
    const empty = await bare.evaluate(function () {
      return {
        head: (document.querySelector('.doc-cal-up-head') || {}).textContent,
        msg: (document.querySelector('.doc-cal-up-empty') || {}).textContent
      };
    });
    assert.equal(empty.head, 'Coming up (0)');
    assert.ok(empty.msg.indexOf(dayFromToday(0)) >= 0,
      'the empty message names today, so an item filed yesterday does not read as lost');
    await bare.close();
  });

  await t.test('DOCUMENTATIONS: clicking an upcoming row opens that day, month included', async () => {
    const page = await openWithUpList(upDb());
    const before = await page.evaluate(function () {
      return (document.querySelector('.doc-cal .cal-month-label') || {}).textContent;
    });

    await page.evaluate(function (ds) {
      Array.prototype.find.call(document.querySelectorAll('.doc-cal-up-row'), function (r) {
        return r.getAttribute('data-up-date') === ds;
      }).querySelector('.doc-cal-up-main').click();
    }, dayFromToday(40));
    await page.waitFor(function () { return !!document.querySelector('.doc-cal .cal-detail'); },
      { message: 'the day panel after clicking an upcoming row' });

    const after = await page.evaluate(function () {
      return {
        month: (document.querySelector('.doc-cal .cal-month-label') || {}).textContent,
        sel: (document.querySelector('.doc-cal .cal-cell.selected .cal-day-num') || {}).textContent,
        still: document.querySelectorAll('.doc-cal-up-row').length
      };
    });
    // A row 40 days out is in another month, so setSelDs alone would select a
    // day the grid is not showing. goToDay moves both.
    assert.notEqual(after.month, before, 'the grid moved to the row\'s month');
    assert.equal(after.sel, String(Number(dayFromToday(40).slice(8))), 'and selected its day');
    assert.equal(after.still, 4, 'the list itself is unmoved by the jump');
    await page.close();
  });

  await t.test('DOCUMENTATIONS: the upcoming list honours the category filter', async () => {
    const page = await openWithUpList(upDb());
    assert.equal((await upRows(page)).length, 4, 'four before filtering');

    // Anything carrying a docPageId answers to the single 'doc' key, not to
    // 'daynote' / 'deadline' — TC.originKey's rule. Switching Documentation off
    // must empty the list of exactly what it empties the grid of.
    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('.doc-cal-btn'),
        function (b) { return /Filter/.test(b.textContent); }).click();
    });
    await page.waitFor(function () { return document.querySelectorAll('.doc-cal-filter').length > 0; },
      { message: 'the filter chips' });
    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('.doc-cal-filter'),
        function (b) { return b.textContent.trim() === 'Documentation'; }).click();
    });
    // Wait for the WRITE to land, never for the right answer to appear: a list
    // that ignored the filter would otherwise time out here instead of
    // reporting the count it actually rendered.
    await page.waitFor(function () {
      return /"hidden":\["doc"\]/.test(localStorage.getItem('track_db') || '');
    }, { message: 'the Documentation filter to reach track_db' });

    const rows = await upRows(page);
    assert.equal(rows.length, 1, 'only the Schedule-authored item is left');
    assert.ok(/From the Schedule/.test(rows[0].text), 'and it is the one with no docPageId');
    await page.close();
  });

  await t.test('DOCUMENTATIONS: a ticked deadline stays in the upcoming list, struck', async () => {
    const page = await openWithUpList(seedDb({
      docPages: [F.docPage('p-1')],
      calendarNotes: [],
      deadlines: [F.deadline('d-done', dayFromToday(4),
        { title: 'Handled', done: true, docPageId: 'p-1',
          cautionDates: [dayFromToday(2), dayFromToday(3)] })]
    }));
    const rows = await upRows(page);
    // "Show both, always": the tick suppresses the caution marks, it has never
    // removed the deadline, and this surface may not be the one that does.
    assert.equal(rows.length, 1, 'a ticked deadline is still coming up');
    assert.equal(rows[0].done, true, 'and is drawn as done');
    assert.ok(/✓/.test(rows[0].text), 'with the tick glyph rather than the alarm');
    await page.close();
  });

  await t.test('DOCUMENTATIONS: the upcoming list caps at eight rows and expands in place', async () => {
    // Ten ahead, so the cap has something to hide. The cap is a COUNT and not a
    // date horizon: any number of days would have been arbitrary, and a count
    // limits the block's height without inventing one.
    const notes = [];
    for (let i = 1; i <= 10; i++) {
      notes.push(F.calNote('n-' + i, dayFromToday(i), { title: 'Item ' + i, docPageId: 'p-1' }));
    }
    const page = await openWithUpList(seedDb({
      docPages: [F.docPage('p-1')], calendarNotes: notes, deadlines: []
    }));

    const before = await page.evaluate(function () {
      return {
        rows: document.querySelectorAll('.doc-cal-up-row').length,
        head: (document.querySelector('.doc-cal-up-head') || {}).textContent,
        more: (document.querySelector('.doc-cal-up-more') || {}).textContent
      };
    });
    assert.equal(before.rows, 8, 'eight rows show');
    assert.equal(before.head, 'Coming up (10)', 'but the head counts every item, not the shown ones');
    assert.equal(before.more, '+ 2 more', 'and the button names how many are hidden');

    await page.evaluate(function () { document.querySelector('.doc-cal-up-more').click(); });
    await page.waitFor(function () {
      return document.querySelectorAll('.doc-cal-up-row').length === 10;
    }, { message: 'the list to expand' });
    const after = await page.evaluate(function () {
      return {
        rows: document.querySelectorAll('.doc-cal-up-row').length,
        more: document.querySelectorAll('.doc-cal-up-more').length,
        stored: /doc-cal-up|upAll/.test(localStorage.getItem('track_db') || '')
      };
    });
    assert.equal(after.rows, 10, 'all ten show once expanded');
    assert.equal(after.more, 0, 'and the button is gone');
    // Expansion is a view preference, not content: it must reach no slot key.
    assert.equal(after.stored, false, 'expanding stores nothing in track_db');
    await page.close();
  });

  await t.test('GUARD: the upcoming list is not a .cal-doc-row', async () => {
    const page = await openWithUpList(upDb());
    // Seven existing Documentations cases select .cal-doc-row / .cal-cell
    // broadly across .doc-cal and take the first match or a raw count, and four
    // Progress cases count "!" marks by a "Due " tooltip prefix. This asserts
    // the new rows cannot be mistaken for any of them. It passes on both sides
    // of a doctored baseline BY DESIGN — its job is to fail when someone later
    // "unifies" the two row classes.
    const leak = await page.evaluate(function () {
      return {
        rows: document.querySelectorAll('.doc-cal .cal-doc-row').length,
        acts: document.querySelectorAll('.doc-cal .cal-doc-row-acts').length,
        cells: document.querySelectorAll('.doc-cal-up .cal-cell, .doc-cal-up .cal-grid').length,
        due: Array.prototype.filter.call(document.querySelectorAll('.doc-cal-up [title]'),
          function (b) { return (b.getAttribute('title') || '').indexOf('Due ') === 0; }).length
      };
    });
    assert.equal(leak.rows, 0, 'with no day selected the day-panel row class appears nowhere');
    assert.equal(leak.acts, 0, 'and the list offers no edit controls to be counted');
    assert.equal(leak.cells, 0, 'nor any month-cell class');
    assert.equal(leak.due, 0, 'and no tooltip begins "Due "');
    await page.close();
  });

  await t.test('DOCUMENTATIONS: the upcoming list writes nothing', async () => {
    const page = await openWithUpList(upDb());
    // Wait for the block's OWN docPages write to land before the baseline, or
    // that pending write settles mid-case and reads as a change the click made.
    await page.waitFor(function () {
      return /"type":"calendar"/.test(localStorage.getItem('track_db') || '');
    }, { message: 'the calendar block to reach track_db' });
    const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });
    await page.evaluate(function (ds) {
      Array.prototype.find.call(document.querySelectorAll('.doc-cal-up-row'), function (r) {
        return r.getAttribute('data-up-date') === ds;
      }).querySelector('.doc-cal-up-main').click();
    }, dayFromToday(40));
    await page.waitFor(function () { return !!document.querySelector('.doc-cal .cal-detail'); },
      { message: 'the day panel' });
    const after = await page.evaluate(function () { return localStorage.getItem('track_db'); });
    assert.equal(after, before, 'reading and jumping are not edits');
    await page.close();
  });

  await t.test('a day note with a time is listed with it, is on no hour grid until added, and clearing it drops the key', async () => {
    const db = seedDb({ calendarNotes: [], deadlines: [], docPages: [F.docPage('p-1')] });
    const page = await open('documentations.html', { db });
    await page.waitFor(function () { return !!document.querySelector('.docs-editor'); },
      { message: 'documentations editor' });
    await addCalendarBlock(page);
    await selectDay(page, 15);

    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('.doc-cal button'),
        function (b) { return b.textContent.trim() === '+ note'; }).click();
    });
    await page.waitFor(function () { return !!document.querySelector('.cal-doc-form input[type=time]'); },
      { message: 'the note composer, with its optional time' });

    await page.evaluate(function (setterSrc) {
      var set = new Function('return ' + setterSrc)();
      set(document.querySelector('.cal-doc-form input:not([type=time])'), 'Review the draft');
      set(document.querySelector('.cal-doc-form input[type=time]'), '14:30');
      return true;
    }, SET_REACT_INPUT);
    await page.evaluate(function () { document.querySelector('.cal-doc-form button.primary').click(); });

    const stored = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var n = ((db.slots || [])[0] || {}).calendarNotes || [];
      return n.length ? n[0] : false;
    }, { message: 'the timed note reaching track_db' });
    assert.equal(stored.time, '14:30');
    assert.equal(stored.docPageId, 'p-1');

    // Listed in the day panel WITH its time — and on no hour grid: since
    // 2026-10-21 a note is drawn there only once ★ Forced adds a block for it,
    // and composing one adds none. Wait on the row, then assert the grid.
    await page.waitFor(function () {
      return Array.prototype.some.call(document.querySelectorAll('.doc-cal .cal-doc-row'),
        function (r) { return /Review the draft/.test(r.textContent) && /14:30/.test(r.textContent); });
    }, { message: 'the note listed in the day panel with its time' });
    assert.equal(await page.evaluate(function () {
      return Array.prototype.some.call(document.querySelectorAll('.doc-cal .cal-sched-block'),
        function (b) { return /Review the draft/.test(b.textContent); });
    }), false, 'and not on the hour grid — a block comes only from ★ Forced');

    // clearing the time must drop the key, not store an empty string
    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('.doc-cal .cal-doc-row-acts button'),
        function (b) { return b.title === 'Edit'; }).click();
    });
    await page.waitFor(function () { return !!document.querySelector('.cal-doc-form input[type=time]'); },
      { message: 'the edit form' });
    await page.evaluate(function (setterSrc) {
      var set = new Function('return ' + setterSrc)();
      set(document.querySelector('.cal-doc-form input[type=time]'), '');
      return true;
    }, SET_REACT_INPUT);
    await page.evaluate(function () { document.querySelector('.cal-doc-form button.primary').click(); });

    const cleared = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var n = (((db.slots || [])[0] || {}).calendarNotes || [])[0];
      return n && !Object.prototype.hasOwnProperty.call(n, 'time') ? n : false;
    }, { message: 'the time key being removed' });
    assert.equal(Object.prototype.hasOwnProperty.call(cleared, 'time'), false,
      'a cleared time leaves no key behind');
    assert.equal(cleared.title, 'Review the draft', 'and the rest of the note is untouched');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('the Schedule draws a timed note on the grid and an untimed one in the strip', async () => {
    // progress.html does not load calendar-core.js, so it implements the same
    // split itself — this is the assertion that the two agree.
    const today = new Date();
    const ds = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') +
      '-' + String(today.getDate()).padStart(2, '0');
    const db = seedDb({
      calendarNotes: [
        F.calNote('timed', ds, { title: 'Timed marker note', time: '14:30' }),
        F.calNote('plain', ds, { title: 'Strip only note' })
      ]
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    await page.waitFor(function () {
      var el = document.querySelector('#root'); return !!el && el.children.length > 0;
    }, { message: 'progress.html mounting' });

    const seen = await page.waitFor(function () {
      var hasText = function (sel, text) {
        return Array.prototype.some.call(document.querySelectorAll(sel),
          function (e) { return e.textContent.indexOf(text) >= 0; });
      };
      var onGrid = Array.prototype.some.call(document.querySelectorAll('#root span'), function (e) {
        return /bg-fuchsia/.test(e.className || '') && e.textContent.indexOf('Timed marker note') >= 0;
      });
      if (!onGrid) return false;
      return {
        onGrid: onGrid,
        timedInStrip: hasText('#root button', 'Timed marker note'),
        untimedInStrip: hasText('#root button', 'Strip only note')
      };
    }, { message: 'the timed note being drawn on the timeline' });

    assert.equal(seen.onGrid, true, 'a note with a time is positioned on the hour grid');
    assert.equal(seen.timedInStrip, false, 'and is not also a chip in the day strip');
    assert.equal(seen.untimedInStrip, true, 'a note without a time stays a chip, as it always was');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('the timeline does not mark a deadline as caution on its own due day', async () => {
    // The month grid and the day panel both drop the due day from the caution
    // list, and calendar-core's deadlinesCaution bakes the same rule in. The
    // timeline strip is the fourth implementation of it, and was the odd one
    // out: it drew the red due line AND a redundant amber "!" for one deadline.
    const due = dayFromToday(0);
    const db = seedDb({
      calendarNotes: [],
      deadlines: [F.deadline('dl-today', due,
        { cautionDates: runUpDays(dayFromToday(-2), due), title: 'Ship the thing' })]
    });
    // ?date= opens the timeline in single-day mode, so the strip shows this day alone
    const page = await open('progress.html', { db, hash: '?date=' + due + '#schedule' });
    await page.waitFor(function () {
      var el = document.querySelector('#root'); return !!el && el.children.length > 0;
    }, { message: 'progress.html mounting' });

    const seen = await page.waitFor(function () {
      var dueLine = Array.prototype.some.call(document.querySelectorAll('#root span'),
        function (e) { return /bg-red-600/.test(e.className || '') && /Ship the thing/.test(e.textContent); });
      if (!dueLine) return false;       // wait for a positive signal before counting absences
      return {
        dueLine: dueLine,
        caution: Array.prototype.filter.call(document.querySelectorAll('#root button'),
          function (b) { return (b.getAttribute('title') || '').indexOf('Due ') === 0; }).length
      };
    }, { message: 'the red due line being drawn on the timeline' });

    assert.equal(seen.dueLine, true, 'the due day still draws the red deadline line');
    assert.equal(seen.caution, 0, 'and does not also draw an amber "!" for the same deadline');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('the timeline still marks the caution run-up before the due day', async () => {
    // The guard on the test above: dropping the due day must not drop the run-up.
    const due = dayFromToday(2);
    const db = seedDb({
      calendarNotes: [],
      deadlines: [F.deadline('dl-soon', due,
        { cautionDates: runUpDays(dayFromToday(-1), due), title: 'Ship the thing' })]
    });
    const page = await open('progress.html', { db, hash: '?date=' + dayFromToday(0) + '#schedule' });
    await page.waitFor(function () {
      var el = document.querySelector('#root'); return !!el && el.children.length > 0;
    }, { message: 'progress.html mounting' });

    const caution = await page.waitFor(function () {
      var hits = Array.prototype.filter.call(document.querySelectorAll('#root button'),
        function (b) { return (b.getAttribute('title') || '').indexOf('Due ') === 0; });
      return hits.length ? hits.map(function (b) { return b.textContent; }) : false;
    }, { message: 'the amber caution chip on a run-up day' });

    assert.equal(caution.length, 1, 'a day inside the run-up carries exactly one caution chip');
    assert.match(caution[0], /Ship the thing/);
    assert.match(caution[0], /!/);
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  // ── 2c. the caution days are CHOSEN on a calendar ───────────────────────

  /* A doc-authored deadline with no caution days: what every creation path now
     produces, and the state in which the feature is invisible. */
  const cautionDb = (over = {}) => {
    const due = dayFromToday(3);
    return {
      due,
      db: seedDb({
        calendarNotes: [],
        docPages: [F.docPage('p-1')],
        deadlines: [F.deadline('dl-pick', due, Object.assign(
          { cautionDates: [], title: 'Ship the thing', docPageId: 'p-1', createdAt: 1771000000000 },
          over))]
      })
    };
  };
  const openDlPopup = async ({ db, due }) => {
    const page = await open('progress.html', { db, hash: '?date=' + due + '&dl=dl-pick#schedule' });
    await page.waitFor(function () { return !!document.querySelector('[data-dl-caution-cal]'); },
      { message: 'the deadline popup, opened by ?dl=, showing the caution CALENDAR in its READ view' });
    return page;
  };
  const storedDeadline = page => page.evaluate(function () {
    var db = JSON.parse(localStorage.getItem('track_db') || '{}');
    return (((db.slots || [])[0] || {}).deadlines || [])[0] || null;
  });
  /* The picker opens on the DUE day's month, and a caution day can perfectly
     well sit in the month BEFORE it — a deadline due on the 3rd with a run-up
     in the previous month is an ordinary case. Those cells are not rendered
     until the picker is stepped back, so a case that clicks blind fails with
     "not clickable" whenever `cautionDb`'s due day (today + 3) crosses a month
     end while its caution days (today - 4, today - 1) do not. That is the last
     three days of every month, and it is a fault in the FIXTURES, not the page:
     a user in the same position clicks `‹`. So does this now.

     The month is read off the rendered cells rather than the label, because
     `YYYY-MM` compares lexicographically and needs no month-name table — and
     MONTHS_LONG is declared further down this file, so it is still in its
     temporal dead zone when the first of these cases runs. */
  const shownCautionMonth = page => page.evaluate(function () {
    var b = document.querySelector('[data-dl-caution-day]');
    return b ? b.getAttribute('data-dl-caution-day').slice(0, 7) : null;
  });
  const stepCautionMonth = (page, dir) => page.evaluate(function (d) {
    var pop = document.querySelector('[data-dl-caution-cal]').closest('div.fixed');
    Array.prototype.find.call(pop.querySelectorAll('button'), function (b) {
      return b.getAttribute('title') === (d < 0 ? 'Previous month' : 'Next month');
    }).click();
    return true;
  }, dir);
  const showCautionDay = async (page, ds) => {
    const want = ds.slice(0, 7);
    for (let i = 0; i < 14; i++) {                 // bounded: never spin
      const shown = await shownCautionMonth(page);
      if (shown === null) return false;
      if (shown === want) return true;
      await stepCautionMonth(page, shown > want ? -1 : 1);
    }
    return false;
  };
  const clickCautionDay = async (page, ds) => {
    if (!(await showCautionDay(page, ds))) return false;
    return page.evaluate(function (v) {
      var b = document.querySelector('[data-dl-caution-day="' + v + '"]');
      if (!b) return false;
      b.click();
      return true;
    }, ds);
  };

  await t.test('?dl= opens the popup, and a calendar day is picked from the read view', async () => {
    const { db, due } = cautionDb();
    const page = await openDlPopup({ db, due });

    const shown = await page.evaluate(function () {
      var pop = document.querySelector('[data-dl-caution-cal]').closest('div.fixed');
      return {
        readView: Array.prototype.some.call(pop.querySelectorAll('button'),
          function (b) { return b.textContent.trim() === 'Edit'; }),
        title: /Ship the thing/.test(pop.textContent),
        count: document.querySelector('[data-dl-caution-count]').getAttribute('data-dl-caution-count'),
        cells: document.querySelectorAll('[data-dl-caution-day]').length
      };
    });
    assert.equal(shown.readView, true, 'the calendar is in the read view, not behind Edit');
    assert.equal(shown.title, true, '?dl= opened the deadline it names');
    assert.equal(shown.count, '0', 'a fresh deadline warns on no day at all');
    assert.ok(shown.cells >= 28, 'the whole month is drawn, one button per day');

    // Two NON-ADJACENT days: a contiguous span could not express this, which is
    // the entire point of the change.
    const first = dayFromToday(-4), second = dayFromToday(-1);
    assert.equal(await clickCautionDay(page, first), true, 'the first day is clickable');
    await page.waitFor(function (v) {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = (((db.slots || [])[0] || {}).deadlines || [])[0];
      return d && (d.cautionDates || []).indexOf(v) >= 0;
    }, { args: [first], message: 'the first pick reaching track_db' });
    await clickCautionDay(page, second);

    const saved = await page.waitFor(function (a, b) {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = (((db.slots || [])[0] || {}).deadlines || [])[0];
      var c = (d || {}).cautionDates || [];
      return c.length === 2 && c.indexOf(a) >= 0 && c.indexOf(b) >= 0 ? d : false;
    }, { args: [first, second], message: 'both picks reaching track_db' });

    assert.deepEqual(saved.cautionDates, [first, second], 'stored sorted');
    assert.ok(!('startDate' in saved), 'and no caution START is written any more');
    assert.equal(saved.docPageId, 'p-1', 'the doc page that authored it is untouched');
    assert.equal(saved.createdAt, 1771000000000, 'and so is createdAt');
    assert.equal(saved.date, due, 'the due day itself did not move');
    assert.equal(saved.time, '17:00');
    assert.equal(saved.title, 'Ship the thing');

    // the day BETWEEN the two picks is not marked — a span would have marked it
    const gapMarked = await page.evaluate(function (v) {
      var b = document.querySelector('[data-dl-caution-day="' + v + '"]');
      return b ? b.getAttribute('data-dl-caution-on') : null;
    }, dayFromToday(-2));
    assert.equal(gapMarked, '0', 'the gap between two chosen days stays unchosen');

    const readout = await page.waitFor(function () {
      var el = document.querySelector('[data-dl-caution-count]');
      return el && el.getAttribute('data-dl-caution-count') === '2' ? el.textContent : false;
    }, { message: 'the popup readout updating to the new count' });
    assert.match(readout, /2 caution days/, 'the count reflects the picks immediately');

    // clicking the same day again un-picks it
    await clickCautionDay(page, first);
    const after = await page.waitFor(function (v) {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = (((db.slots || [])[0] || {}).deadlines || [])[0];
      var c = (d || {}).cautionDates || [];
      return c.length === 1 && c[0] === v ? d : false;
    }, { args: [second], message: 'the un-pick reaching track_db' });
    assert.deepEqual(after.cautionDates, [second]);

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('the due day and every day after it are not pickable', async () => {
    /* Mid-month on purpose. The picker draws the DUE day's month, so the day
       after it must sit in that month too. This case used to put the due day at
       today+3 and probe today+4, which failed whenever today+3 was a month's last
       day (2026-09-30 → a probe of 10-01, a cell never drawn), whatever the
       page did. The 14th, 15th and 16th exist in every month. */
    const due = thisMonthDay(15), after = thisMonthDay(16), beforeDue = thisMonthDay(14);
    const { db } = cautionDb({ date: due });
    const page = await openDlPopup({ db, due });
    const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });

    const state = await page.evaluate(function (a, b, c) {
      function cell(v) { return document.querySelector('[data-dl-caution-day="' + v + '"]'); }
      var one = cell(a), two = cell(b), three = cell(c);
      return { dueDisabled: !!one && one.disabled, afterDisabled: !!two && two.disabled,
               beforeOpen: !!three && !three.disabled };
    }, due, after, beforeDue);
    assert.equal(state.dueDisabled, true, 'the due day is drawn red, never amber');
    assert.equal(state.afterDisabled, true, 'and a day after the deadline is not a run-up');
    // The control: a picker that locked EVERY day would pass the two above.
    assert.equal(state.beforeOpen, true, 'while the day before the deadline is still pickable');

    // Cancel path: clicking anyway must leave the stored bytes untouched.
    await clickCautionDay(page, due);
    await clickCautionDay(page, after);
    await sleep(150);
    assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }), before,
      'clicking a locked cell leaves track_db byte-identical');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a quick-set UNIONS the last n days into the picks it already has', async () => {
    const keep = dayFromToday(-9);
    const { db, due } = cautionDb({ cautionDates: [keep] });
    const page = await openDlPopup({ db, due });

    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('button'),
        function (x) { return /^Also mark the 3 days before /.test(x.getAttribute('title') || ''); }).click();
      return true;
    });

    const set = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = (((db.slots || [])[0] || {}).deadlines || [])[0];
      return d && (d.cautionDates || []).length === 4 ? d : false;
    }, { message: 'the quick-set reaching track_db' });

    assert.deepEqual(set.cautionDates,
      [keep, dayFromToday(0), dayFromToday(1), dayFromToday(2)],
      'the 3 days before the due day are ADDED, and the existing pick survives');
    assert.ok(set.cautionDates.indexOf(due) < 0, 'the due day is never included');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* The successor of the old `reset`. Destructive, so it asks — and the case
     that matters is CANCEL: a prompt that displays and then clears anyway is
     worse than no prompt. */
  await t.test('clear all asks, and Cancel keeps every chosen day', async () => {
    const picks = [dayFromToday(-4), dayFromToday(-1)];
    const { db, due } = cautionDb({ cautionDates: picks });
    const page = await openDlPopup({ db, due });
    const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });
    const dialogsBefore = page.dialogs.length;

    page.rejectDialogs = true;
    await page.evaluate(function () { document.getElementById('dl-caution-clear').click(); return true; });
    await sleep(400);
    page.rejectDialogs = false;

    assert.ok(page.dialogs.length > dialogsBefore, 'the control asked before writing');
    assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }), before,
      'and Cancel left track_db byte-identical');

    // now accept, and the days go
    await page.evaluate(function () { document.getElementById('dl-caution-clear').click(); return true; });
    const cleared = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = (((db.slots || [])[0] || {}).deadlines || [])[0];
      return d && (d.cautionDates || []).length === 0 ? d : false;
    }, { message: 'accepting the prompt clearing every day' });
    assert.deepEqual(cleared.cautionDates, [],
      'cleared as a STORED empty list, not a deleted key');
    assert.equal(cleared.date, due, 'and the deadline keeps its due day');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* Un-picking the day work already sits on would strand it. Refuse, name the
     day, and move nothing — the same rule that stops a due-day move rewriting
     the picks. */
  await t.test('un-picking a day that holds prep is refused, and nothing is written', async () => {
    const prepDay = dayFromToday(-1);
    const { db, due } = cautionDb({ cautionDates: [dayFromToday(-4), prepDay], parts: [{ id: 'b', date: prepDay }] });
    const page = await openDlPopup({ db, due });
    const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });

    const warn = await page.waitFor(function () {
      var el = document.querySelector('[data-dl-caution-refused]');
      return el ? el.textContent : false;
    }, { message: 'the popup naming the day that holds prep' });
    assert.ok(warn.indexOf(prepDay) >= 0, 'the offending day is named, not merely counted');

    await clickCautionDay(page, prepDay);
    await sleep(200);
    assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }), before,
      'the un-pick is refused and track_db stays byte-identical');

    // clear all is refused for the same reason, and says so instead of prompting
    const clearState = await page.evaluate(function () {
      var b = document.getElementById('dl-caution-clear');
      return { disabled: b.disabled, title: b.getAttribute('title') };
    });
    assert.equal(clearState.disabled, true, 'clear all is disabled rather than opening a prompt it would ignore');
    assert.match(clearState.title, /Prep is scheduled/);

    // ...but a day that holds NOTHING still un-picks normally
    await clickCautionDay(page, dayFromToday(-4));
    const after = await page.waitFor(function (v) {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = (((db.slots || [])[0] || {}).deadlines || [])[0];
      var c = (d || {}).cautionDates || [];
      return c.length === 1 && c[0] === v ? d : false;
    }, { args: [prepDay], message: 'the harmless un-pick still going through' });
    assert.deepEqual(after.cautionDates, [prepDay], 'so the refusal narrows the set, it does not freeze it');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* The other side of the same rule since 2026-10-21: a deadline with NO
     blocks has nothing to strand, whatever keys the old automatic block left
     on it. A bare `blockDate` used to read as prep on that day and freeze its
     un-pick; now it is only the day a future block would inherit. Asserted
     here for Progress's own copy of dlStrandedBlockDays, and separately below
     for Documentations, which asks calendar-core.js. */
  await t.test('PROGRESS: a deadline with no blocks never refuses an un-pick, whatever legacy keys it carries', async () => {
    const prepDay = dayFromToday(-1);
    const { db, due } = cautionDb({ cautionDates: [dayFromToday(-4), prepDay], blockDate: prepDay, blockTime: '08:00' });
    const page = await openDlPopup({ db, due });
    const namedBefore = await page.evaluate(function () {
      return !!document.querySelector('[data-dl-caution-refused]');
    });
    const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });

    await clickCautionDay(page, prepDay);
    // wait for ANY write, then assert — a refusal writes nothing, and must read
    // as a wrong value rather than as a timeout
    const until = Date.now() + 3000;
    while (Date.now() < until
      && await page.evaluate(function () { return localStorage.getItem('track_db'); }) === before) await sleep(50);
    const after = await storedDeadline(page);
    assert.deepEqual(after.cautionDates, [dayFromToday(-4)],
      'the day it once sat on un-picks like any other — nothing refused it');
    assert.equal(namedBefore, false, 'and nothing was ever named as holding prep');
    assert.equal(after.blockDate, prepDay, 'while the legacy key is left exactly as it was');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* The one-time migration. Its guard is the PRESENCE of `startDate`, so it is
     idempotent by construction and needs no schemaVersion. */
  await t.test('a legacy caution span is migrated once, on load, and never again', async () => {
    const due = thisMonthDay(22);
    const start = thisMonthDay(20);
    const db = seedDb({
      calendarNotes: [],
      deadlines: [
        F.legacyDeadline('dl-old', due, start, { title: 'Legacy', createdAt: 1771000000000, done: true }),
        F.deadline('dl-new', due, { cautionDates: [thisMonthDay(19)], title: 'Already chosen' })
      ]
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    await page.waitFor(function () {
      var el = document.querySelector('#root'); return !!el && el.children.length > 0;
    }, { message: 'progress.html mounting' });

    const migrated = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var ds = ((db.slots || [])[0] || {}).deadlines || [];
      var old = ds.filter(function (d) { return d.id === 'dl-old'; })[0];
      return old && Array.isArray(old.cautionDates) ? ds : false;
    }, { message: 'the migration converting the legacy record' });

    const old = migrated.filter(d => d.id === 'dl-old')[0];
    assert.deepEqual(old.cautionDates, [start, thisMonthDay(21)],
      'the span became its days, minus the due day');
    assert.ok(!('startDate' in old), 'and the legacy key is gone');
    assert.equal(old.date, due, 'the due day is untouched');
    assert.equal(old.done, true, 'and so is the tick');
    assert.equal(old.createdAt, 1771000000000);
    assert.equal(old.title, 'Legacy');

    const fresh = migrated.filter(d => d.id === 'dl-new')[0];
    assert.deepEqual(fresh.cautionDates, [thisMonthDay(19)],
      'a record that already chose its days is left exactly as it was');

    // IDEMPOTENT: a second load writes nothing, because startDate is the guard
    const afterFirst = await page.evaluate(function () { return localStorage.getItem('track_db'); });
    await page.close();

    // `raw:`, not `db:` — afterFirst is ALREADY the serialised track_db string,
    // and `db:` stringifies its argument, which would seed a double-encoded
    // blob and make the comparison fail for a reason that has nothing to do
    // with the migration.
    const again = await open('progress.html', { raw: afterFirst, hash: '#schedule' });
    await again.waitFor(function () {
      var el = document.querySelector('#root'); return !!el && el.children.length > 0;
    }, { message: 'progress.html mounting a second time' });
    await sleep(400);
    assert.equal(await again.evaluate(function () { return localStorage.getItem('track_db'); }), afterFirst,
      'the second load leaves track_db byte-identical — the migration is a no-op');
    assert.deepEqual(realErrors(again), []);
    await again.close();
  });

  await t.test('a ?dl= that names nothing opens nothing, without an error', async () => {
    const { db, due } = cautionDb();
    const page = await open('progress.html', { db, hash: '?date=' + due + '&dl=no-such-deadline#schedule' });
    await page.waitFor(function () {
      var el = document.querySelector('#root'); return !!el && el.children.length > 0;
    }, { message: 'progress.html mounting' });
    await sleep(300);
    assert.equal(await page.evaluate(function () { return !!document.querySelector('[data-dl-caution-cal]'); }),
      false, 'a stale or hand-typed link opens no popup');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('the Home calendar links both halves of a deadline to the deadline itself', async () => {
    const due = thisMonthDay(22);
    const db = seedDb({
      calendarNotes: [],
      deadlines: [F.deadline('dl-home', due,
        { cautionDates: [thisMonthDay(20), thisMonthDay(21)], title: 'Ship the thing' })]
    });
    const page = await open('index.html', { db });
    await page.waitFor(function () { return !!document.querySelector('#cal-grid .cal-cell'); },
      { message: 'the universal calendar grid' });

    /* One click per day, never inside waitFor: a cell click TOGGLES the
       selection, so a polling re-click would close the panel it is waiting for. */
    const clickDay = day => page.evaluate(function (n) {
      Array.prototype.filter.call(document.querySelectorAll('#cal-grid .cal-cell'),
        function (c) { return !c.classList.contains('empty'); })[n - 1].click();
      return true;
    }, day);

    // a caution day first: the chip a user sees three weeks out
    await clickDay(21);
    const chips = await page.waitFor(function () {
      var found = document.querySelectorAll('#cal-detail .cal-sched-dl');
      return found.length ? Array.prototype.map.call(found, function (a) {
        return { tag: a.tagName, cls: a.className, href: a.getAttribute('href'), text: a.textContent };
      }) : false;
    }, { message: 'a deadline chip in the day detail' });

    assert.equal(chips.length, 1, 'a run-up day shows the caution chip alone');
    assert.equal(chips[0].tag, 'A', 'the "!" chip is a link, not inert text');
    assert.match(chips[0].cls, /caution/);
    assert.match(chips[0].text, /^! Ship the thing/);
    assert.equal(chips[0].href, 'progress.html?date=' + due + '&dl=dl-home#schedule',
      'and it points at the DUE day and the deadline id, not at the caution day it sits on');

    await clickDay(22);
    const dueChips = await page.waitFor(function () {
      var found = document.querySelectorAll('#cal-detail .cal-sched-dl.due');
      return found.length ? Array.prototype.map.call(found, function (a) {
        return { tag: a.tagName, href: a.getAttribute('href') };
      }) : false;
    }, { message: 'the due chip in the day detail' });
    assert.equal(dueChips[0].tag, 'A', 'the due chip is a link too');
    assert.equal(dueChips[0].href, 'progress.html?date=' + due + '&dl=dl-home#schedule');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a Documentations caution row leads to the deadline\'s due day', async () => {
    const db = seedDb({
      calendarNotes: [],
      docPages: [F.docPage('p-1')],
      deadlines: [F.deadline('dl-doc-jump', thisMonthDay(22),
        { cautionDates: [thisMonthDay(20), thisMonthDay(21)], title: 'Ship the thing', docPageId: 'p-1' })]
    });
    const page = await open('documentations.html', { db });
    await page.waitFor(function () { return !!document.querySelector('.docs-editor'); },
      { message: 'documentations editor' });
    await addCalendarBlock(page);
    await selectDay(page, 21);          // a run-up day: read-only, no edit controls

    const before = await page.evaluate(function () {
      var row = document.querySelector('.doc-cal .cal-doc-row.caution');
      return row ? { link: !!row.querySelector('.cal-doc-row-link'),
        acts: !!row.querySelector('.cal-doc-row-acts') } : null;
    });
    assert.ok(before, 'the run-up day lists the deadline as a caution row');
    assert.equal(before.link, true, 'whose text is a button leading to the due day');
    assert.equal(before.acts, false, 'and which stays read-only here');

    await page.evaluate(function () {
      document.querySelector('.doc-cal .cal-doc-row.caution .cal-doc-row-link').click();
      return true;
    });

    const after = await page.waitFor(function () {
      var cells = Array.prototype.filter.call(document.querySelectorAll('.doc-cal .cal-cell'),
        function (c) { return !c.classList.contains('empty'); });
      var sel = cells.findIndex(function (c) { return c.classList.contains('selected'); }) + 1;
      if (sel !== 22) return false;
      var due = document.querySelector('.doc-cal .cal-doc-row:not(.caution)');
      return { sel: sel, editable: !!(due && due.querySelector('.cal-doc-row-acts')),
        caution: !!document.querySelector('.doc-cal .cal-doc-row.caution') };
    }, { message: 'the calendar moving to the due day' });

    assert.equal(after.sel, 22, 'the block selects the deadline\'s due day');
    assert.equal(after.editable, true, 'where the page that authored it does get its edit controls');
    assert.equal(after.caution, false, 'and the due day is not also listed as a caution');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  // ── 2d. ticking a deadline suppresses its caution "!" everywhere ────────

  /* "Should this day show a !" is spelled out in three predicates —
     deadlinesCautionOn (progress.html), deadlinesCaution (calendar-core.js)
     and ownedDates.caution (documentations.html) — feeding five surfaces. The
     last change to this area shipped a bug because one call site of three was
     forgotten, so every surface is asserted SEPARATELY below: a stray "!" on
     one of them must not be able to hide behind four passing siblings. */

  // `dlOver` merges into the deadline record, so a case that needs the ticked
  // state to arrive in the DATA — Home is read-only — asks for tickDb({done:true}).
  const tickDb = (dlOver = {}) => {
    const due = thisMonthDay(22);
    return {
      due,
      start: thisMonthDay(20),
      days: [thisMonthDay(20), thisMonthDay(21)],
      db: seedDb({
        calendarNotes: [],
        docPages: [F.docPage('p-1')],
        deadlines: [F.deadline('dl-tick', due, Object.assign({
          cautionDates: [thisMonthDay(20), thisMonthDay(21)], title: 'Ship the thing',
          docPageId: 'p-1', createdAt: 1771000000000
        }, dlOver))]
      })
    };
  };
  const storedTick = page => page.evaluate(function () {
    var db = JSON.parse(localStorage.getItem('track_db') || '{}');
    return (((db.slots || [])[0] || {}).deadlines || [])[0] || null;
  });
  // the popup renders outside both view branches, so ?dl= reaches it either way
  const openTickPopup = async ({ db, due }, dateParam) => {
    const page = await open('progress.html',
      { db, hash: '?date=' + (dateParam || due) + '&dl=dl-tick#schedule' });
    await page.waitFor(function () { return !!document.getElementById('dl-done-toggle'); },
      { message: 'the deadline popup showing its tick control in the READ view' });
    return page;
  };
  const clickTick = page => page.evaluate(function () {
    document.getElementById('dl-done-toggle').click();
    return true;
  });

  await t.test('the popup tick persists and keeps every other field', async () => {
    const { db, due, days } = tickDb();
    const page = await openTickPopup({ db, due });

    const before = await storedTick(page);
    assert.ok(!before.done, 'a deadline starts unticked');

    await clickTick(page);
    const ticked = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = (((db.slots || [])[0] || {}).deadlines || [])[0];
      return d && d.done === true ? d : false;
    }, { message: 'the tick reaching track_db' });

    // the spread is what protects these — rebuilding the record from a field
    // list is the bug that cost day notes and deadlines before
    assert.equal(ticked.docPageId, 'p-1', 'ticking keeps the authoring page');
    assert.equal(ticked.createdAt, 1771000000000, 'and createdAt');
    assert.deepEqual(ticked.cautionDates, days,
      'and the chosen days, so unticking restores exactly the same "!" marks');
    assert.equal(ticked.time, before.time);
    assert.equal(ticked.title, 'Ship the thing');

    await clickTick(page);
    const unticked = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = (((db.slots || [])[0] || {}).deadlines || [])[0];
      return d && !d.done ? d : false;
    }, { message: 'the tick being cleared again' });
    assert.deepEqual(unticked.cautionDates, days, 'and the round trip leaves the chosen days untouched');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('ticking clears the timeline "!" and unticking brings it back', async () => {
    const { db, due } = tickDb();
    // ?date= without a view switch lands on the timeline, on a run-up day
    const page = await openTickPopup({ db, due }, thisMonthDay(21));

    const countStrip = () => page.evaluate(function () {
      return Array.prototype.filter.call(document.querySelectorAll('#root button'),
        function (b) { return (b.getAttribute('title') || '').indexOf('Due ') === 0; }).length;
    });
    assert.equal(await countStrip(), 1, 'the run-up day starts with one "!" in the timeline strip');

    await clickTick(page);
    const cleared = await page.waitFor(function () {
      return Array.prototype.filter.call(document.querySelectorAll('#root button'),
        function (b) { return (b.getAttribute('title') || '').indexOf('Due ') === 0; }).length === 0
        ? 'gone' : false;
    }, { message: 'the timeline "!" disappearing' });
    assert.equal(cleared, 'gone', 'ticking removes it from the timeline strip');

    await clickTick(page);
    const restored = await page.waitFor(function () {
      return Array.prototype.filter.call(document.querySelectorAll('#root button'),
        function (b) { return (b.getAttribute('title') || '').indexOf('Due ') === 0; }).length === 1
        ? 'back' : false;
    }, { message: 'the timeline "!" coming back' });
    assert.equal(restored, 'back', 'and unticking restores exactly the one that was there');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('ticking clears the "!" in the month grid and the day panel, leaving the deadline', async () => {
    const { db, due } = tickDb();
    const page = await openTickPopup({ db, due }, thisMonthDay(21));

    // the month grid and the day panel both live in the CALENDAR view
    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('#root button'),
        function (b) { return b.textContent.trim() === 'CALENDAR'; }).click();
      return true;
    });
    await page.waitFor(function () {
      return document.querySelectorAll('#root .grid.grid-cols-7:not([data-dl-caution-cal])').length > 0;
    }, { message: 'the month grid' });
    // select the run-up day so the day panel lists it too
    await page.evaluate(function () {
      var cells = document.querySelectorAll('#root .grid.grid-cols-7:not([data-dl-caution-cal]) > div');
      Array.prototype.filter.call(cells, function (c) { return c.className.indexOf('min-h-') >= 0; })[20].click();
      return true;
    });

    const before = await page.waitFor(function () {
      var g = document.querySelectorAll('#root [title^="Caution period · due"]').length;
      var p = document.querySelectorAll('#root [title="Caution period — open the deadline"]').length;
      return g && p ? { grid: g, panel: p } : false;
    }, { message: 'the "!" in both the month grid and the day panel' });
    assert.ok(before.grid >= 1, 'the month grid marks the run-up day');
    assert.equal(before.panel, 1, 'and the day panel lists it once');

    await clickTick(page);
    const after = await page.waitFor(function () {
      var g = document.querySelectorAll('#root [title^="Caution period · due"]').length;
      var p = document.querySelectorAll('#root [title="Caution period — open the deadline"]').length;
      return g === 0 && p === 0 ? 'gone' : false;
    }, { message: 'both calendar-view "!" surfaces clearing' });
    assert.equal(after, 'gone');

    // and the deadline itself is still on its due day, marked done
    const left = await page.evaluate(function () {
      var rows = Array.prototype.filter.call(document.querySelectorAll('#root [title^="Due "]'),
        function (e) { return /Ship the thing/.test(e.textContent); });
      return { n: rows.length, tick: rows.length ? /✓/.test(rows[0].textContent) : false };
    });
    assert.equal(left.n, 1, 'the ticked deadline is still drawn on its due day');
    assert.equal(left.tick, true, 'with a ✓');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('the Schedule day-panel row ticks the same field as the popup', async () => {
    const { db, due } = tickDb();
    const page = await open('progress.html', { db, hash: '?date=' + due + '#schedule' });
    await page.waitFor(function () {
      var el = document.querySelector('#root'); return !!el && el.children.length > 0;
    }, { message: 'progress.html mounting' });
    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('#root button'),
        function (b) { return b.textContent.trim() === 'CALENDAR'; }).click();
      return true;
    });
    await page.waitFor(function () {
      return document.querySelectorAll('#root .grid.grid-cols-7:not([data-dl-caution-cal])').length > 0;
    }, { message: 'the month grid' });
    await page.evaluate(function () {
      var cells = document.querySelectorAll('#root .grid.grid-cols-7:not([data-dl-caution-cal]) > div');
      Array.prototype.filter.call(cells, function (c) { return c.className.indexOf('min-h-') >= 0; })[21].click();
      return true;
    });
    await page.waitFor(function () { return !!document.querySelector('#root .dl-done-box'); },
      { message: 'the tick box on the day panel deadline row' });

    await page.evaluate(function () { document.querySelector('#root .dl-done-box').click(); return true; });
    const ticked = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = (((db.slots || [])[0] || {}).deadlines || [])[0];
      return d && d.done === true ? d : false;
    }, { message: 'the day-panel tick reaching track_db' });
    assert.deepEqual(ticked.cautionDates, [thisMonthDay(20), thisMonthDay(21)],
      'writing done alone, through the same spread');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('the Home calendar drops a ticked deadline\'s "!" and marks the due chip done', async () => {
    // seeded ticked: Home is read-only by design, so the state arrives in the data
    const { db, due } = tickDb({ done: true });
    const page = await open('index.html', { db });
    await page.waitFor(function () { return !!document.querySelector('#cal-grid .cal-cell'); },
      { message: 'the universal calendar grid' });
    const clickDay = day => page.evaluate(function (n) {
      Array.prototype.filter.call(document.querySelectorAll('#cal-grid .cal-cell'),
        function (c) { return !c.classList.contains('empty'); })[n - 1].click();
      return true;
    }, day);

    await clickDay(21);
    const runUp = await page.waitFor(function () {
      return document.querySelector('#cal-detail') ? {
        caution: document.querySelectorAll('#cal-detail .cal-sched-dl.caution').length
      } : false;
    }, { message: 'the day detail for a run-up day' });
    assert.equal(runUp.caution, 0, 'a ticked deadline shows no "!" chip on its run-up');

    await clickDay(22);
    const dueChip = await page.waitFor(function () {
      var a = document.querySelector('#cal-detail .cal-sched-dl.due');
      return a ? { tag: a.tagName, cls: a.className, href: a.getAttribute('href'), text: a.textContent } : false;
    }, { message: 'the due chip' });
    assert.match(dueChip.cls, /\bdone\b/, 'the due chip is marked done');
    assert.match(dueChip.text, /✓/);
    assert.equal(dueChip.tag, 'A', 'and is still a link');
    assert.equal(dueChip.href, 'progress.html?date=' + due + '&dl=dl-tick#schedule');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a Documentations block drops the caution row and can untick its own deadline', async () => {
    const { db } = tickDb({ done: true });
    const page = await open('documentations.html', { db });
    await page.waitFor(function () { return !!document.querySelector('.docs-editor'); },
      { message: 'documentations editor' });
    await addCalendarBlock(page);
    await selectDay(page, 21);          // a run-up day

    const runUp = await page.evaluate(function () {
      return {
        rows: document.querySelectorAll('.doc-cal .cal-doc-row.caution').length,
        cellBars: document.querySelectorAll('.doc-cal .cal-cell.cal-doc-caution-day').length
      };
    });
    assert.equal(runUp.rows, 0, 'no caution row for a ticked deadline');
    assert.equal(runUp.cellBars, 0, 'and no soft amber bar on its run-up cells');

    await selectDay(page, 22);
    const dueRow = await page.waitFor(function () {
      var row = document.querySelector('.doc-cal .cal-doc-row:not(.caution)');
      return row ? { cls: row.className, tick: /✓/.test(row.textContent),
        untick: !!row.querySelector('.cal-doc-row-acts button[title="Untick"]') } : false;
    }, { message: 'the due row in the block' });
    assert.match(dueRow.cls, /\bdone\b/, 'the due row is marked done');
    assert.equal(dueRow.tick, true);
    assert.equal(dueRow.untick, true, 'and the owning page can untick it');

    await page.evaluate(function () {
      document.querySelector('.doc-cal .cal-doc-row-acts button[title="Untick"]').click();
      return true;
    });
    const back = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = (((db.slots || [])[0] || {}).deadlines || [])[0];
      return d && !d.done ? d : false;
    }, { message: 'the untick reaching track_db' });
    assert.equal(back.docPageId, 'p-1', 'through the same spread, so the record survives');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  // ── 2e. the due day is movable, and the chosen days do not follow ──────

  /* Moving a deadline used to mean deleting and re-creating it, which threw
     away createdAt, docPageId, and the id every ?dl= link points at. The
     popup's Edit form carries the due day, under one rule: it may not land on
     or before a day the user chose as a caution day, and those days are never
     rewritten to make room.

     Refusing is the point. A chosen day is only a caution day while it falls
     BEFORE the deadline, so a due day pulled back over one would silently
     delete it — and silently deleting a day the user picked by hand is exactly
     the class of loss this project refuses everywhere else. */

  const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /* Day n of NEXT month, through the Date constructor so December rolls the
     year over. Used to move a deadline across a month boundary, which is the
     case where "the Schedule follows" is actually observable. */
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 12, 0, 0, 0);
  const nextMonthDay = n => nextMonth.getFullYear() + '-' +
    String(nextMonth.getMonth() + 1).padStart(2, '0') + '-' + String(n).padStart(2, '0');

  const moveDb = (dlOver = {}) => {
    const due = thisMonthDay(18);
    return {
      due,
      start: thisMonthDay(15),
      days: [thisMonthDay(15), thisMonthDay(16), thisMonthDay(17)],
      db: seedDb({
        calendarNotes: [],
        docPages: [F.docPage('p-1')],
        deadlines: [F.deadline('dl-move', due, Object.assign({
          cautionDates: [thisMonthDay(15), thisMonthDay(16), thisMonthDay(17)],
          title: 'Ship the thing', docPageId: 'p-1', createdAt: 1771000000000
        }, dlOver))]
      })
    };
  };
  const storedMove = page => page.evaluate(function () {
    var db = JSON.parse(localStorage.getItem('track_db') || '{}');
    return (((db.slots || [])[0] || {}).deadlines || [])[0] || null;
  });
  const openMovePopup = async ({ db, due }, dateParam) => {
    const page = await open('progress.html',
      { db, hash: '?date=' + (dateParam || due) + '&dl=dl-move#schedule' });
    await page.waitFor(function () { return !!document.querySelector('[data-dl-caution-cal]'); },
      { message: 'the deadline popup in its READ view' });
    return page;
  };
  // the due-date row lives behind Edit, beside the time it has always shown
  const openMoveEdit = async page => {
    await page.evaluate(function () {
      var pop = document.querySelector('[data-dl-caution-cal]').closest('div.fixed');
      Array.prototype.find.call(pop.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'Edit'; }).click();
      return true;
    });
    await page.waitFor(function () { return !!document.getElementById('dl-due-date'); },
      { message: 'the Edit form showing a Due date row' });
  };
  const setDue = (page, v) => page.evaluate(function (setterSrc, val) {
    var set = new Function('return ' + setterSrc)();
    set(document.getElementById('dl-due-date'), val);
    return true;
  }, SET_REACT_INPUT, v);
  const moveSaveState = page => page.evaluate(function () {
    var pop = document.getElementById('dl-due-date').closest('div.fixed');
    var save = Array.prototype.find.call(pop.querySelectorAll('button'),
      function (b) { return b.textContent.trim() === 'Save'; });
    return { disabled: !!save.disabled, text: pop.textContent };
  });
  const clickMoveSave = page => page.evaluate(function () {
    var pop = document.getElementById('dl-due-date').closest('div.fixed');
    Array.prototype.find.call(pop.querySelectorAll('button'),
      function (b) { return b.textContent.trim() === 'Save'; }).click();
    return true;
  });

  await t.test('the popup Edit form moves the due day and leaves the chosen days where they were', async () => {
    const { db, due, start, days } = moveDb({ done: true });
    const page = await openMovePopup({ db, due });
    await openMoveEdit(page);

    const seeded = await page.evaluate(function () {
      return {
        date: document.getElementById('dl-due-date').value,
        min: document.getElementById('dl-due-date').getAttribute('min')
      };
    });
    assert.equal(seeded.date, due, 'the row is seeded from the stored due day');
    assert.equal(seeded.min, start, 'and cannot be dragged before the earliest chosen day');

    const moved = thisMonthDay(22);
    await setDue(page, moved);
    await clickMoveSave(page);

    const saved = await page.waitFor(function (v) {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = (((db.slots || [])[0] || {}).deadlines || [])[0];
      return d && d.date === v ? d : false;
    }, { args: [moved], message: 'the new due day reaching track_db' });

    assert.equal(saved.date, moved, 'the due day moved');
    assert.deepEqual(saved.cautionDates, days, 'and the chosen days did NOT follow it');
    assert.ok(!('startDate' in saved), 'nor did a legacy key come back');
    // the spread is what protects the rest — rebuilding the record from a
    // field list is the bug that cost day notes and deadlines before
    assert.equal(saved.id, 'dl-move', 'the id survives, so every ?dl= link still resolves');
    assert.equal(saved.createdAt, 1771000000000, 'and createdAt');
    assert.equal(saved.docPageId, 'p-1', 'and the page that authored it');
    assert.equal(saved.done, true, 'and the tick');
    assert.equal(saved.time, '17:00', 'and the due time');
    assert.equal(saved.title, 'Ship the thing');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a due day that would orphan a chosen caution day is refused, byte-identical', async () => {
    const { db, due, days } = moveDb();
    const page = await openMovePopup({ db, due });
    await openMoveEdit(page);
    const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });

    // day 16 is chosen, so a due day of 16 would silently drop it — and so
    // would 15. Refuse and NAME them rather than dropping either.
    await setDue(page, thisMonthDay(16));
    const blocked = await page.waitFor(function () {
      var pop = document.getElementById('dl-due-date').closest('div.fixed');
      var save = Array.prototype.find.call(pop.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'Save'; });
      return save.disabled ? { disabled: true, text: pop.textContent } : false;
    }, { message: 'Save going disabled on a move that would orphan a chosen day' });
    assert.equal(blocked.disabled, true, 'Save is disabled');
    const named = await page.evaluate(function () {
      var el = document.querySelector('[data-dl-orphaned]');
      return el ? el.textContent : null;
    });
    assert.ok(named, 'the form says why');
    assert.ok(named.indexOf(thisMonthDay(16)) >= 0, 'and names the day that would be lost');
    assert.ok(named.indexOf(thisMonthDay(17)) >= 0, 'including every one of them');

    await clickMoveSave(page);
    await sleep(250);
    const after = await page.evaluate(function () { return localStorage.getItem('track_db'); });
    assert.equal(after, before, 'a refused move writes nothing at all');
    const stored = await storedMove(page);
    assert.equal(stored.date, due, 'the due day did not move');
    assert.deepEqual(stored.cautionDates, days, 'and no chosen day was dropped');

    // a move FORWARD is fine — no chosen day is orphaned by it
    await setDue(page, thisMonthDay(22));
    const okState = await page.waitFor(function () {
      var pop = document.getElementById('dl-due-date').closest('div.fixed');
      var save = Array.prototype.find.call(pop.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'Save'; });
      return save.disabled ? false : true;
    }, { message: 'Save re-enabling for a move that orphans nothing' });
    assert.equal(okState, true, 'so the refusal narrows the moves, it does not freeze the form');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a cleared due day is refused rather than written as an empty string', async () => {
    const { db, due } = moveDb();
    const page = await openMovePopup({ db, due });
    await openMoveEdit(page);
    const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });

    await setDue(page, '');
    const blocked = await page.waitFor(function () {
      var pop = document.getElementById('dl-due-date').closest('div.fixed');
      var save = Array.prototype.find.call(pop.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'Save'; });
      return save.disabled ? { disabled: true, text: pop.textContent } : false;
    }, { message: 'Save going disabled on a cleared due day' });
    assert.match(blocked.text, /Pick a due date/, 'the form asks for one');
    // one fault, one message: a blank date must not ALSO claim chosen days are
    // orphaned. dlDraftValid gates the orphan check, so it cannot fire here.
    assert.equal(await page.evaluate(function () {
      return !!document.querySelector('[data-dl-orphaned]');
    }), false, 'and does not also claim a chosen day would be orphaned');

    await clickMoveSave(page);
    await sleep(250);
    assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }),
      before, 'nothing is written');
    assert.equal((await storedMove(page)).date, due, 'and date is never blanked');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('the chosen days stay put when the due day moves past them', async () => {
    // chosen 15,16,17 with due 18 → after moving to 22 the "!" days are STILL
    // 15,16,17. A span would have stretched to 15..21; a chosen set does not.
    const { db, due } = moveDb();
    const page = await openMovePopup({ db, due }, thisMonthDay(20));

    // day 20 sits AFTER the old due day, so it starts with no mark at all
    const countCaution = () => page.evaluate(function () {
      return Array.prototype.filter.call(document.querySelectorAll('#root button'),
        function (b) { return (b.getAttribute('title') || '').indexOf('Due ') === 0; }).length;
    });
    assert.equal(await countCaution(), 0, 'day 20 is outside the original run-up');

    await openMoveEdit(page);
    await setDue(page, thisMonthDay(22));
    await clickMoveSave(page);
    await page.waitFor(function (v) {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = (((db.slots || [])[0] || {}).deadlines || [])[0];
      return d && d.date === v ? true : false;
    }, { args: [thisMonthDay(22)], message: 'the move landing' });

    // the timeline followed to day 22, so check the month grid instead, where
    // every day of the run-up is visible at once
    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('#root button'),
        function (b) { return b.textContent.trim() === 'CALENDAR'; }).click();
      return true;
    });
    const marks = await page.waitFor(function () {
      var caution = Array.prototype.map.call(
        document.querySelectorAll('#root [title^="Caution period · due"]'),
        function (e) { return e.closest('[class*="min-h-"]').textContent.trim().slice(0, 2); });
      var dueCells = Array.prototype.map.call(
        document.querySelectorAll('#root [title^="Due "]'),
        function (e) { return e.closest('[class*="min-h-"]').textContent.trim().slice(0, 2); });
      return caution.length ? { caution: caution, due: dueCells } : false;
    }, { message: 'the month grid redrawing the run-up' });

    const asNums = list => list.map(s => Number(String(s).replace(/\D/g, ''))).sort((a, b) => a - b);
    assert.deepEqual(asNums(marks.caution), [15, 16, 17],
      'exactly the days the user chose — the move did not stretch them, and 18-21 stay unmarked');
    assert.deepEqual(asNums(marks.due), [22], 'and the deadline itself is drawn once, on its new day');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('the Schedule follows a deadline moved into another month', async () => {
    const { db, due } = moveDb();
    const page = await openMovePopup({ db, due });   // ?date= lands in timeline DAY mode

    const dayLabel = () => page.evaluate(function () {
      return document.querySelector('#root .flex-shrink-0 span.flex-1').textContent.trim();
    });
    assert.match(await dayLabel(), new RegExp(MONTHS_LONG[now.getMonth()] + ' 18, ' + now.getFullYear()),
      'the timeline starts on the old due day');

    const moved = nextMonthDay(9);
    await openMoveEdit(page);
    await setDue(page, moved);
    await clickMoveSave(page);
    await page.waitFor(function (v) {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = (((db.slots || [])[0] || {}).deadlines || [])[0];
      return d && d.date === v ? true : false;
    }, { args: [moved], message: 'the cross-month move landing' });

    const wantLabel = new RegExp(MONTHS_LONG[nextMonth.getMonth()] + ' 9, ' + nextMonth.getFullYear());
    const followed = await page.waitFor(function () {
      return document.querySelector('#root .flex-shrink-0 span.flex-1').textContent.trim();
    }, { message: 'the timeline day label' });
    assert.match(followed, wantLabel, 'the timeline re-anchored on the new due day');

    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('#root button'),
        function (b) { return b.textContent.trim() === 'CALENDAR'; }).click();
      return true;
    });
    const month = await page.waitFor(function () {
      var el = document.querySelector('#root .grid.grid-cols-7:not([data-dl-caution-cal])');
      return el ? el.parentElement.querySelector('span.font-bold').textContent.trim() : false;
    }, { message: 'the month grid header' });
    assert.equal(month, MONTHS_SHORT[nextMonth.getMonth()] + ' ' + nextMonth.getFullYear(),
      'and the month grid opens on the month the deadline moved to');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  // ── 2f. the due day is TYPED when composing, on both authoring pages ────

  /* A new deadline used to inherit the calendar cell its composer was opened
     on, so filing one for next week meant navigating there first. Both add
     forms carry a due-date field of their own, which makes each of them a
     WRITER of `date`; `dlDraftValid` format-checks it so a blank field cannot
     reach storage, and these cases assert it at BOTH surfaces separately,
     because progress.html holds its own copy of that helper.

     NEITHER form has a caution field any more, and that is asserted rather
     than assumed. Choosing caution days needs the prep-aware refusal, which
     only the Progress popup can make; a compose form that set them would be a
     second writer that cannot check what it is about to strand. */

  const composeSeed = () => seedDb({
    calendarNotes: [], deadlines: [], docPages: [F.docPage('p-1')]
  });
  const storedDl = page => page.evaluate(function () {
    var db = JSON.parse(localStorage.getItem('track_db') || '{}');
    return ((db.slots || [])[0] || {}).deadlines || [];
  });

  // Open the month grid and the deadline composer on the cell for `day`.
  const openDlComposerOn = async (page, day) => {
    await page.waitFor(function () {
      var el = document.querySelector('#root'); return !!el && el.children.length > 0;
    }, { message: 'progress.html mounting' });
    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('#root button'),
        function (b) { return b.textContent.trim() === 'CALENDAR'; }).click();
      return true;
    });
    await page.waitFor(function () {
      return document.querySelectorAll('#root .grid.grid-cols-7:not([data-dl-caution-cal])').length > 0;
    }, { message: 'the month grid' });
    // one ⏰ per real day cell, so the nth is day n — the leading blanks carry none
    await page.evaluate(function (n) {
      document.querySelectorAll('#root button[title="Add deadline"]')[n - 1].click();
      return true;
    }, day);
    await page.waitFor(function () { return !!document.getElementById('dl-new-date'); },
      { message: 'the NEW DEADLINE composer showing a Due date row' });
  };
  const fillDlComposer = (page, { date, time, title }) =>
    page.evaluate(function (setterSrc, v) {
      var set = new Function('return ' + setterSrc)();
      var box = document.getElementById('dl-new-date').closest('div.bg-gray-950');
      if (v.date !== undefined) set(document.getElementById('dl-new-date'), v.date);
      if (v.time !== undefined) set(box.querySelector('input[type="time"]'), v.time);
      if (v.title !== undefined) set(box.querySelector('input[placeholder="Title…"]'), v.title);
      return true;
    }, SET_REACT_INPUT, { date, time, title });
  const dlComposerDone = page => page.evaluate(function () {
    var box = document.getElementById('dl-new-date').closest('div.bg-gray-950');
    var btn = Array.prototype.find.call(box.querySelectorAll('button'),
      function (b) { return b.textContent.trim() === 'Done'; });
    var disabled = !!btn.disabled;
    btn.click();
    return { disabled: disabled, text: box.textContent };
  });

  await t.test('the Schedule composer files a deadline on a TYPED due day', async () => {
    const page = await open('progress.html', { db: composeSeed(), hash: '#schedule' });
    await openDlComposerOn(page, 15);

    const seeded = await page.evaluate(function () {
      var box = document.getElementById('dl-new-date').closest('div.bg-gray-950');
      return {
        date: document.getElementById('dl-new-date').value,
        dateInputs: box.querySelectorAll('input[type="date"]').length
      };
    });
    assert.equal(seeded.date, thisMonthDay(15), 'the field opens on the cell it was launched from');
    assert.equal(seeded.dateInputs, 1,
      'and it is the ONLY date field — the composer cannot set caution days');

    const due = thisMonthDay(22);
    await fillDlComposer(page, { date: due, time: '17:00', title: 'Filed ahead' });
    const state = await dlComposerDone(page);
    assert.equal(state.disabled, false, 'Done is live for a well-formed draft');

    const saved = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = (((db.slots || [])[0] || {}).deadlines || [])[0];
      return d ? d : false;
    }, { message: 'the new deadline reaching track_db' });
    assert.equal(saved.date, due, 'the deadline lands on the typed day, not the cell');
    assert.deepEqual(saved.cautionDates, [],
      'and it is created with NO caution days — they are chosen in the popup');
    assert.ok(!('startDate' in saved), 'no legacy key is written');
    assert.equal(saved.time, '17:00');
    assert.equal(saved.title, 'Filed ahead');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('the Schedule composer refuses a blank due day and writes nothing', async () => {
    const page = await open('progress.html', { db: composeSeed(), hash: '#schedule' });
    await openDlComposerOn(page, 18);
    const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });

    // fill everything else first, so the ONLY fault is the missing due day
    await fillDlComposer(page, { time: '09:00', title: 'Dateless' });
    await fillDlComposer(page, { date: '' });
    const blocked = await page.waitFor(function () {
      var box = document.getElementById('dl-new-date').closest('div.bg-gray-950');
      var btn = Array.prototype.find.call(box.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'Done'; });
      return btn.disabled ? { text: box.textContent } : false;
    }, { message: 'Done going disabled on a blank due day' });
    assert.match(blocked.text, /Pick a due date/, 'and the composer says why');

    // the Cancel path is the one that matters: a refusal must write nothing
    await dlComposerDone(page);
    await sleep(250);
    assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }),
      before, 'clicking Done anyway writes nothing at all');
    assert.deepEqual(await storedDl(page), [], 'and no dateless deadline reaches storage');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  const openDocDlForm = async (page, day) => {
    await page.waitFor(function () { return !!document.querySelector('.docs-editor'); },
      { message: 'documentations editor' });
    await addCalendarBlock(page);
    await selectDay(page, day);
    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('.doc-cal button'),
        function (b) { return b.textContent.trim() === '+ deadline'; }).click();
      return true;
    });
    await page.waitFor(function () {
      return !!document.querySelector('.cal-doc-form input[type="date"]');
    }, { message: 'the deadline composer showing a Due on row' });
  };
  // `dates[0]` stays guarded even though BOTH forms carry a due-day row now: a
  // case may read this before it has asserted the field is there at all, and
  // reading `.value` off an absent node throws. A case that dies on a TypeError
  // has stopped testing what it names — which is the defect this guard was
  // added for, back when the edit form had no date row to find.
  const docDlFields = page => page.evaluate(function () {
    var form = document.querySelector('.cal-doc-form');
    var dates = form.querySelectorAll('input[type="date"]');
    return {
      count: dates.length,
      due: dates[0] ? dates[0].value : null,
      start: dates[1] ? dates[1].value : null
    };
  });
  const fillDocDl = (page, { date, time, title }) =>
    page.evaluate(function (setterSrc, v) {
      var set = new Function('return ' + setterSrc)();
      var form = document.querySelector('.cal-doc-form');
      // NAME the missing field. Writing through an absent node threw
      // "Cannot read properties of undefined (reading 'tagName')" out of
      // SET_REACT_INPUT, which reads as a logic failure in whatever case called
      // this — and a case that dies on a TypeError has stopped testing the
      // thing it is named for.
      var pick = function (sel, what) {
        var el = form.querySelector(sel);
        if (!el) throw new Error('the deadline form has no ' + what + ' to fill');
        return el;
      };
      if (v.date !== undefined) set(pick('input[type="date"]', 'due-day field'), v.date);
      if (v.time !== undefined) set(pick('input[type="time"]', 'due-time field'), v.time);
      if (v.title !== undefined) set(pick('input:not([type])', 'title field'), v.title);
      return true;
    }, SET_REACT_INPUT, { date, time, title });
  const docDlSave = page => page.evaluate(function () {
    var form = document.querySelector('.cal-doc-form');
    var btn = form.querySelector('button.primary');
    var disabled = !!btn.disabled;
    btn.click();
    return { disabled: disabled, text: form.textContent };
  });

  await t.test('a Documentations block files a deadline on a TYPED due day', async () => {
    const page = await open('documentations.html', { db: composeSeed() });
    await openDocDlForm(page, 15);

    const seeded = await docDlFields(page);
    assert.equal(seeded.count, 1,
      'composing shows exactly ONE date field — the due day. The caution days are '
      + 'chosen on the picker below it, which is a grid of buttons, not a date input');
    assert.equal(seeded.due, thisMonthDay(15), 'seeded from the selected cell');

    const due = thisMonthDay(22);
    await fillDocDl(page, { date: due, time: '17:00', title: 'Filed ahead' });
    const state = await docDlSave(page);
    assert.equal(state.disabled, false, 'Add deadline is live for a well-formed draft');

    const saved = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = (((db.slots || [])[0] || {}).deadlines || [])[0];
      return d ? d : false;
    }, { message: 'the new deadline reaching track_db' });
    assert.equal(saved.date, due, 'the deadline lands on the typed day, not the selected cell');
    assert.deepEqual(saved.cautionDates, [], 'and it is created with no caution days');
    assert.ok(!('startDate' in saved), 'no legacy key is written');
    assert.equal(saved.docPageId, 'p-1', 'the page that authored it is still named');
    assert.equal(saved.time, '17:00');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a Documentations block refuses a blank due day and writes nothing', async () => {
    const page = await open('documentations.html', { db: composeSeed() });
    await openDocDlForm(page, 18);
    const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });

    await fillDocDl(page, { time: '09:00', title: 'Dateless' });
    await fillDocDl(page, { date: '' });
    const blocked = await page.waitFor(function () {
      var form = document.querySelector('.cal-doc-form');
      return form.querySelector('button.primary').disabled ? { text: form.textContent } : false;
    }, { message: 'Add deadline going disabled on a blank due day' });
    assert.match(blocked.text, /Needs a due date and a time/, 'and the form says why');

    await docDlSave(page);
    await sleep(250);
    assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }),
      before, 'clicking Add anyway writes nothing at all');
    assert.deepEqual(await storedDl(page), [], 'and no dateless deadline reaches storage');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('DOCUMENTATIONS: the edit form opens on a Due on field seeded to the stored day', async () => {
    // This case used to assert the OPPOSITE — that the edit form carried no
    // date field at all — and it existed precisely so that adding one without
    // the refusals that must come with it would trip a test. It did its job.
    // The field is here now and the refusals arrived beside it, asserted by
    // the two cases at the end of this section.
    //
    // The claim that DIED is "the Progress popup is the only writer of a due
    // day". The claim that SURVIVES is "the popup is the only writer that
    // REFUSES an orphaned chosen day" — this form drops them silently instead,
    // which it can afford because its picks are draft-held and Cancel restores
    // them. That asymmetry is deliberate and is pinned by its own scope guard
    // at the end of this section, so a future "make it uniform" pass has
    // something to trip over.
    //
    // What this case pins now: the row is seeded from the record, and merely
    // OPENING the form writes nothing.
    const { db, due } = moveDb();
    const page = await open('documentations.html', { db });
    await page.waitFor(function () { return !!document.querySelector('.docs-editor'); },
      { message: 'documentations editor' });
    await addCalendarBlock(page);
    await selectDay(page, 18);
    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('.doc-cal .cal-doc-row-acts button'),
        function (b) { return b.getAttribute('title') === 'Edit'; }).click();
      return true;
    });
    await page.waitFor(function () { return !!document.querySelector('.cal-doc-form'); },
      { message: 'the deadline edit form' });
    const fields = await docDlFields(page);
    assert.equal(fields.count, 1,
      'the edit form carries exactly ONE date field — the due day. The caution '
      + 'days are chosen on the picker below it, which is a grid of buttons');
    assert.equal(fields.due, due, 'seeded to the stored due day');
    const stored = (await storedDl(page))[0];
    assert.equal(stored.date, due, 'and opening the form alone moved nothing');
    assert.deepEqual(stored.cautionDates, [thisMonthDay(15), thisMonthDay(16), thisMonthDay(17)],
      'nor did it disturb the chosen days');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* ── the Documentations caution picker ────────────────────────────────────
     The same feature as the Progress popup's picker, on a second surface, so
     every case below is asserted HERE as well as there. That is this project's
     standing rule and it is written from the caution predicate itself: it was
     spelled at three call sites, one dropped half of it, and a single shared
     assertion would have let the broken site hide behind a passing sibling.

     What differs from Progress on purpose: picks are held in the DRAFT and
     written on Save, because this form has a Cancel. Case 2 is what pins it. */

  const openDocDlEdit = async page => {
    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('.doc-cal .cal-doc-row-acts button'),
        function (b) { return b.getAttribute('title') === 'Edit'; }).click();
      return true;
    });
    await page.waitFor(function () {
      return !!document.querySelector('.cal-doc-form [data-dl-caution-cal]');
    }, { message: 'the deadline edit form with its caution picker' });
  };
  const docCau = (page, ds) => page.evaluate(function (v) {
    var b = document.querySelector('.cal-doc-form [data-dl-caution-day="' + v + '"]');
    return b ? { on: b.getAttribute('data-dl-caution-on'), disabled: b.disabled } : null;
  }, ds);
  const clickDocCau = (page, ds) => page.evaluate(function (v) {
    var b = document.querySelector('.cal-doc-form [data-dl-caution-day="' + v + '"]');
    if (!b) return false;
    b.click();
    return true;
  }, ds);
  const docRawDb = page => page.evaluate(function () { return localStorage.getItem('track_db'); });

  await t.test('DOCUMENTATIONS: the edit form picks a caution day, and Save writes it', async () => {
    const { db, due } = moveDb();
    const page = await open('documentations.html', { db });
    await page.waitFor(function () { return !!document.querySelector('.docs-editor'); },
      { message: 'documentations editor' });
    await addCalendarBlock(page);
    await selectDay(page, 18);
    await openDocDlEdit(page);

    // seeded from the record, through the resolver
    assert.equal((await docCau(page, thisMonthDay(15))).on, '1', 'a stored day starts picked');
    assert.equal((await docCau(page, thisMonthDay(14))).on, '0', 'an unchosen day starts unpicked');
    assert.equal((await docCau(page, due)).disabled, true, 'the due day itself is not pickable');
    assert.equal((await docCau(page, thisMonthDay(19))).disabled, true,
      'nor is a day after it — the due day is red everywhere and must never also be amber');

    await clickDocCau(page, thisMonthDay(14));
    assert.equal((await docCau(page, thisMonthDay(14))).on, '1', 'the pick shows immediately');
    assert.equal((await docDlSave(page)).disabled, false, 'Save was enabled');
    await page.waitFor(function () { return !document.querySelector('.cal-doc-form'); },
      { message: 'the form closing after Save' });

    const stored = (await storedDl(page))[0];
    assert.deepEqual(stored.cautionDates,
      [thisMonthDay(14), thisMonthDay(15), thisMonthDay(16), thisMonthDay(17)],
      'the new day is stored, sorted, alongside the three that were there');
    assert.equal(stored.startDate, undefined,
      'and dlWithCautionDays deleted startDate in the same spread');
    // the whole point of spreading the stored record rather than rebuilding it
    assert.equal(stored.id, 'dl-move');
    assert.equal(stored.date, due, 'the due day did not move');
    assert.equal(stored.docPageId, 'p-1');
    assert.equal(stored.createdAt, 1771000000000);
    assert.equal(stored.title, 'Ship the thing');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('DOCUMENTATIONS: Cancel after picking leaves track_db byte-identical', async () => {
    // The reason picks are held in the draft at all. progress.html writes on
    // every click because its picker has no Cancel to honour; this one does.
    const { db } = moveDb();
    const page = await open('documentations.html', { db });
    await page.waitFor(function () { return !!document.querySelector('.docs-editor'); },
      { message: 'documentations editor' });
    await addCalendarBlock(page);
    await selectDay(page, 18);
    await openDocDlEdit(page);
    const before = await docRawDb(page);

    await clickDocCau(page, thisMonthDay(14));
    await clickDocCau(page, thisMonthDay(13));
    await clickDocCau(page, thisMonthDay(15));          // an un-pick too
    assert.equal((await docCau(page, thisMonthDay(13))).on, '1', 'the draft did change on screen');
    assert.equal(await docRawDb(page), before, 'but nothing reached track_db while picking');

    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('.cal-doc-form-acts button'),
        function (b) { return b.textContent.trim() === 'Cancel'; }).click();
      return true;
    });
    await page.waitFor(function () { return !document.querySelector('.cal-doc-form'); },
      { message: 'the form closing on Cancel' });
    assert.equal(await docRawDb(page), before, 'and Cancel left track_db byte-identical');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('DOCUMENTATIONS refuses an un-pick that would strand placed prep', async () => {
    // A block on day 16 is this deadline's prep, on one of its chosen days.
    // Un-picking 16 would leave that block on a day the deadline no longer
    // occupies, so it is REFUSED and the day is named — never moved, never
    // dropped. Day 15 holds nothing and must still un-pick, or the refusal has
    // frozen the whole picker instead of protecting one day.
    const { db } = moveDb({ parts: [{ id: 'b', date: thisMonthDay(16) }] });
    const page = await open('documentations.html', { db });
    await page.waitFor(function () { return !!document.querySelector('.docs-editor'); },
      { message: 'documentations editor' });
    await addCalendarBlock(page);
    await selectDay(page, 18);
    await openDocDlEdit(page);

    const named = await page.evaluate(function () {
      var el = document.querySelector('.cal-doc-form [data-dl-caution-refused]');
      return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
    });
    assert.ok(named && named.indexOf(thisMonthDay(16)) >= 0,
      'the day holding prep is named: ' + named);

    const before = await docRawDb(page);
    await clickDocCau(page, thisMonthDay(16));
    assert.equal((await docCau(page, thisMonthDay(16))).on, '1',
      'the un-pick was refused — the day is still picked');
    assert.equal(await docRawDb(page), before, 'and the refused click wrote nothing');

    await clickDocCau(page, thisMonthDay(15));
    assert.equal((await docCau(page, thisMonthDay(15))).on, '0',
      'a day with no prep on it still un-picks — the refusal is narrow');

    const clearOff = await page.evaluate(function () {
      var b = document.querySelector('.cal-doc-form [data-dl-caution-clear]');
      return b ? b.disabled : null;
    });
    assert.equal(clearOff, true, '"clear all" is disabled while prep sits on a chosen day');

    await docDlSave(page);
    await page.waitFor(function () { return !document.querySelector('.cal-doc-form'); },
      { message: 'the form closing after Save' });
    const stored = (await storedDl(page))[0];
    assert.ok(stored.cautionDates.indexOf(thisMonthDay(16)) >= 0,
      'the protected day survived the save');
    assert.deepEqual(stored.parts, [{ id: 'b', date: thisMonthDay(16) }], 'and its prep never moved');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('DOCUMENTATIONS: a deadline with no blocks never refuses an un-pick, whatever legacy keys it carries', async () => {
    // The Documentations half of the rule asserted for Progress above, through
    // TC.dlStrandedBlockDays — the one definition this page asks.
    const { db } = moveDb({ blockDate: thisMonthDay(16), blockTime: '08:00' });
    const page = await open('documentations.html', { db });
    await page.waitFor(function () { return !!document.querySelector('.docs-editor'); },
      { message: 'documentations editor' });
    await addCalendarBlock(page);
    await selectDay(page, 18);
    await openDocDlEdit(page);
    const namedBefore = await page.evaluate(function () {
      return !!document.querySelector('.cal-doc-form [data-dl-caution-refused]');
    });

    await clickDocCau(page, thisMonthDay(16));
    assert.equal((await docCau(page, thisMonthDay(16))).on, '0',
      'the day it once sat on un-picks like any other — nothing refused it');
    assert.equal(namedBefore, false, 'and nothing was ever named as holding prep');

    await docDlSave(page);
    await page.waitFor(function () { return !document.querySelector('.cal-doc-form'); },
      { message: 'the form closing after Save' });
    const stored = (await storedDl(page))[0];
    assert.deepEqual(stored.cautionDates, [thisMonthDay(15), thisMonthDay(17)], 'saved without it');
    assert.equal(stored.blockDate, thisMonthDay(16), 'while the legacy key is left exactly as it was');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('DOCUMENTATIONS: the composer files a deadline with its chosen caution days', async () => {
    const page = await open('documentations.html', { db: seedDb({ deadlines: [], calendarNotes: [] }) });
    await page.waitFor(function () { return !!document.querySelector('.docs-editor'); },
      { message: 'documentations editor' });
    await addCalendarBlock(page);
    await selectDay(page, 18);
    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('.doc-cal .doc-cal-add'),
        function (b) { return /deadline/.test(b.textContent); }).click();
      return true;
    });
    await page.waitFor(function () {
      return !!document.querySelector('.cal-doc-form [data-dl-caution-cal]');
    }, { message: 'the deadline compose form with its caution picker' });

    await fillDocDl(page, { time: '09:30', title: 'Composed with a run-up' });
    await clickDocCau(page, thisMonthDay(16));
    await clickDocCau(page, thisMonthDay(17));
    assert.equal((await docDlSave(page)).disabled, false, 'Add was enabled');
    await page.waitFor(function () { return !document.querySelector('.cal-doc-form'); },
      { message: 'the composer closing' });

    const stored = (await storedDl(page)).find(d => d.title === 'Composed with a run-up');
    assert.ok(stored, 'the deadline was filed');
    assert.equal(stored.date, thisMonthDay(18), 'on the cell it was composed from');
    assert.deepEqual(stored.cautionDates, [thisMonthDay(16), thisMonthDay(17)],
      'carrying the days chosen before it existed');
    assert.equal(stored.docPageId != null, true, 'and still pointing back at its page');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('DOCUMENTATIONS: saving the edit form migrates a legacy startDate span', async () => {
    // dlWithCautionDays is THE writer and deletes startDate in the same spread,
    // so a pre-choice record migrates by the act of being edited here — the
    // same thing progress.html's bulk migration does, through the same
    // function. The run-up must survive the conversion unchanged.
    const due = thisMonthDay(18);
    const db = seedDb({
      calendarNotes: [],
      docPages: [F.docPage('p-1')],
      deadlines: [F.legacyDeadline('dl-legacy', due, thisMonthDay(15),
        { title: 'From the old world', docPageId: 'p-1' })]
    });
    const page = await open('documentations.html', { db });
    await page.waitFor(function () { return !!document.querySelector('.docs-editor'); },
      { message: 'documentations editor' });
    await addCalendarBlock(page);
    await selectDay(page, 18);
    await openDocDlEdit(page);

    // seeded THROUGH the resolver, so the span arrives already expanded
    for (const n of [15, 16, 17]) {
      assert.equal((await docCau(page, thisMonthDay(n))).on, '1',
        'day ' + n + ' of the legacy span is picked in the form');
    }
    await docDlSave(page);
    await page.waitFor(function () { return !document.querySelector('.cal-doc-form'); },
      { message: 'the form closing after Save' });

    const stored = (await storedDl(page))[0];
    assert.deepEqual(stored.cautionDates, [thisMonthDay(15), thisMonthDay(16), thisMonthDay(17)],
      'the span became the explicit list it always meant');
    assert.equal(stored.startDate, undefined, 'and the legacy key is gone');
    assert.equal(stored.date, due, 'the due day is untouched');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('GUARD: a due day typed before a pick drops it, through the one resolver', async () => {
    // The composer is the only form where the due day can move under an
    // already-chosen list. Nothing filters that by hand: dlWithCautionDays
    // sanitises against `date`, so the readout and the stored value agree
    // without a second rule saying so.
    const page = await open('documentations.html', { db: seedDb({ deadlines: [], calendarNotes: [] }) });
    await page.waitFor(function () { return !!document.querySelector('.docs-editor'); },
      { message: 'documentations editor' });
    await addCalendarBlock(page);
    await selectDay(page, 18);
    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('.doc-cal .doc-cal-add'),
        function (b) { return /deadline/.test(b.textContent); }).click();
      return true;
    });
    await page.waitFor(function () {
      return !!document.querySelector('.cal-doc-form [data-dl-caution-cal]');
    }, { message: 'the deadline compose form with its caution picker' });

    await fillDocDl(page, { time: '09:30', title: 'Pulled forward' });
    await clickDocCau(page, thisMonthDay(14));
    await clickDocCau(page, thisMonthDay(16));
    // a FUNCTION, not a stored promise: a promise resolves once, so re-awaiting
    // it would hand back the first reading and the case would pass either way
    const count = () => page.evaluate(function () {
      return document.querySelector('.cal-doc-form [data-dl-caution-count]')
        .getAttribute('data-dl-caution-count');
    });
    assert.equal(await count(), '2', 'both days count while the due day is the 18th');

    await fillDocDl(page, { date: thisMonthDay(15) });        // pull the due day back
    assert.equal(await count(), '1',
      'the 16th stops counting the moment the due day moves before it');
    assert.equal((await docCau(page, thisMonthDay(16))).disabled, true,
      'and its cell is locked, not silently still on');

    await docDlSave(page);
    await page.waitFor(function () { return !document.querySelector('.cal-doc-form'); },
      { message: 'the composer closing' });
    const stored = (await storedDl(page)).find(d => d.title === 'Pulled forward');
    assert.deepEqual(stored.cautionDates, [thisMonthDay(14)],
      'and only the day still before the due day was stored');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* ── moving an existing due day, from Documentations ──────────────────────
     The due day of a STORED deadline used to move from the Progress popup
     alone. It moves here too now, and the two surfaces behave DIFFERENTLY on
     purpose:

       Progress   writes every caution pick straight to track_db, so it cannot
                  drop a day the user chose — it REFUSES the move and names the
                  days, and the user un-picks them in the same popup.
       Docs       holds picks in the draft until Save, so a due day pulled back
                  over a chosen day simply DROPS it, visibly, through the one
                  resolver — and Cancel puts every one of them back.

     Placed PREP is protected on both, and that is what makes the drop safe:
     a caution day carrying a scheduled block cannot be dropped by a move, on
     either surface. Cases 3 and 4 below are that half. */

  const openDocEditOn = async (db, day) => {
    const page = await open('documentations.html', { db });
    await page.waitFor(function () { return !!document.querySelector('.docs-editor'); },
      { message: 'documentations editor' });
    await addCalendarBlock(page);
    await selectDay(page, day);
    await openDocDlEdit(page);
    return page;
  };
  // reads Save WITHOUT pressing it — docDlSave clicks, which is right for the
  // Cancel-path assertions and wrong for checking a state mid-sequence
  const docSaveState = page => page.evaluate(function () {
    var form = document.querySelector('.cal-doc-form');
    return {
      disabled: !!form.querySelector('button.primary').disabled,
      text: form.textContent.replace(/\s+/g, ' ').trim()
    };
  });
  const docCauCount = page => page.evaluate(function () {
    var el = document.querySelector('.cal-doc-form [data-dl-caution-count]');
    return el ? el.getAttribute('data-dl-caution-count') : null;
  });
  const docRefused = page => page.evaluate(function () {
    var el = document.querySelector('.cal-doc-form [data-dl-caution-refused]');
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
  });

  await t.test('DOCUMENTATIONS: the edit form moves the due day, and the calendar jumps to it', async () => {
    const { db, due } = moveDb();
    const page = await openDocEditOn(db, 18);
    const fields = await docDlFields(page);
    assert.equal(fields.count, 1, 'the edit form carries a Due on field');
    assert.equal(fields.due, due, 'seeded to the stored due day');

    const moved = thisMonthDay(20);
    await fillDocDl(page, { date: moved });
    assert.equal((await docSaveState(page)).disabled, false,
      'a FORWARD move drops nothing and strands nothing, so Save is live');
    await docDlSave(page);
    await page.waitFor(function () { return !document.querySelector('.cal-doc-form'); },
      { message: 'the form closing after Save' });

    const stored = (await storedDl(page))[0];
    assert.equal(stored.date, moved, 'the due day moved');
    assert.deepEqual(stored.cautionDates,
      [thisMonthDay(15), thisMonthDay(16), thisMonthDay(17)],
      'and every chosen day survived — all three are still before it');
    assert.equal(stored.startDate, undefined, 'no legacy key was written');
    // the whole point of putting `date` INSIDE the dlWithCautionDays spread
    // rather than after it: the stored record is the base, so nothing is lost
    assert.equal(stored.id, 'dl-move');
    assert.equal(stored.docPageId, 'p-1');
    assert.equal(stored.createdAt, 1771000000000);
    assert.equal(stored.title, 'Ship the thing');
    assert.equal(stored.time, '17:00');

    const sel = await page.evaluate(function () {
      var c = document.querySelector('.doc-cal .cal-cell.selected .cal-day-num');
      return c ? c.textContent.trim() : null;
    });
    assert.equal(sel, '20', 'and the calendar followed the deadline to its new day');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('DOCUMENTATIONS: a due day pulled back over chosen days DROPS them silently', async () => {
    // This is the decision this feature was built around, so it is asserted
    // rather than assumed: no refusal is raised, Save stays live, and the days
    // that no longer fit are simply gone. The Progress popup does the opposite
    // in the same situation, and the scope guard below pins that difference.
    const { db } = moveDb();
    const page = await openDocEditOn(db, 18);
    assert.equal(await docCauCount(page), '3', 'three days are chosen to begin with');

    const moved = thisMonthDay(16);
    await fillDocDl(page, { date: moved });
    assert.equal(await docCauCount(page), '1',
      'the 16th and 17th stop counting the moment the due day lands on the 16th');
    assert.equal((await docCau(page, thisMonthDay(16))).disabled, true,
      'the new due day is locked, not silently still picked');
    assert.equal((await docCau(page, thisMonthDay(17))).disabled, true,
      'and so is the day beyond it');
    assert.equal(await docRefused(page), null,
      'NO refusal is raised — this form drops, it does not refuse');
    assert.equal((await docSaveState(page)).disabled, false, 'and Save stays live');

    await docDlSave(page);
    await page.waitFor(function () { return !document.querySelector('.cal-doc-form'); },
      { message: 'the form closing after Save' });
    const stored = (await storedDl(page))[0];
    assert.equal(stored.date, moved, 'the due day moved');
    assert.deepEqual(stored.cautionDates, [thisMonthDay(15)],
      'and only the day still before it was stored');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('DOCUMENTATIONS refuses a due-day move that would strand placed prep', async () => {
    // Marks drop silently; WORK never does. This deadline's prep is anchored on
    // day 16, so pulling the due day back to the 15th would leave that block on
    // a day the deadline no longer occupies. Refused, and the day is named.
    const { db, due } = moveDb({ parts: [{ id: 'b', date: thisMonthDay(16) }] });
    const page = await openDocEditOn(db, 18);
    const before = await docRawDb(page);

    await fillDocDl(page, { date: thisMonthDay(15) });
    const blocked = await docSaveState(page);
    assert.equal(blocked.disabled, true, 'Save is refused');
    assert.match(blocked.text, /Prep sits on/, 'and the form says why');
    assert.ok(blocked.text.indexOf(thisMonthDay(16)) >= 0,
      'naming the day the prep actually sits on: ' + blocked.text);

    // the Cancel path — the one that matters. Pressing a disabled button must
    // reach no writer at all, not merely be visually discouraged.
    await docDlSave(page);
    await sleep(250);
    assert.equal(await docRawDb(page), before, 'clicking Save anyway wrote nothing at all');
    assert.ok(await page.evaluate(function () { return !!document.querySelector('.cal-doc-form'); }),
      'and the form stayed open');

    // the refusal is NARROW: put the due day back and it lifts
    await fillDocDl(page, { date: due });
    assert.equal((await docSaveState(page)).disabled, false,
      'a move that strands nothing is still allowed — the refusal did not freeze the form');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('DOCUMENTATIONS refuses un-picking the OLD due day once the due day has moved past it', async () => {
    // The case the combined {date, cautionDates} span exists for. Prep is
    // anchored on day 18, which is the due day — so it needs NO caution day
    // while the deadline is due on the 18th. Move the due day to the 20th and
    // the 18th becomes an ordinary day the deadline no longer occupies, so the
    // prep on it is stranded until the 18th is picked as a caution day.
    //
    // Ask dlStrandedBlockDays without the new date and it compares the block
    // day against the OLD due day, finds 18 === 18, and allows an un-pick that
    // strands the work. That is the whole reason all four call sites carry the
    // date now.
    const { db } = moveDb({ parts: [{ id: 'b', date: thisMonthDay(18) }] });
    const page = await openDocEditOn(db, 18);
    const before = await docRawDb(page);

    const moved = thisMonthDay(20);
    await fillDocDl(page, { date: moved });
    const blocked = await docSaveState(page);
    assert.equal(blocked.disabled, true,
      'Save is refused while prep sits on a day the deadline has left');
    assert.ok((await docRefused(page) || '').indexOf(thisMonthDay(18)) >= 0,
      'and the picker names the 18th: ' + await docRefused(page));
    assert.equal(await page.evaluate(function () {
      return document.querySelector('.cal-doc-form [data-dl-caution-clear]').disabled;
    }), true, '"clear all" is disabled too');

    // the 18th is pickable now — it is no longer the due day
    assert.equal((await docCau(page, thisMonthDay(18))).disabled, false,
      'the old due day became an ordinary, pickable day');
    await clickDocCau(page, thisMonthDay(18));
    assert.equal((await docCau(page, thisMonthDay(18))).on, '1', 'picking it works');
    assert.equal((await docSaveState(page)).disabled, false,
      'and that lifts the refusal — the form offered the fix rather than just blocking');

    // un-picking it again strands the prep once more, so it is refused
    await clickDocCau(page, thisMonthDay(18));
    assert.equal((await docCau(page, thisMonthDay(18))).on, '1',
      'the un-pick was REFUSED — the day is still picked');
    assert.equal(await docRawDb(page), before, 'and nothing reached track_db through any of it');

    await docDlSave(page);
    await page.waitFor(function () { return !document.querySelector('.cal-doc-form'); },
      { message: 'the form closing after Save' });
    const stored = (await storedDl(page))[0];
    assert.equal(stored.date, moved, 'the due day moved');
    assert.deepEqual(stored.cautionDates,
      [thisMonthDay(15), thisMonthDay(16), thisMonthDay(17), thisMonthDay(18)],
      'the old due day is stored as a caution day, sorted in');
    assert.deepEqual(stored.parts, [{ id: 'b', date: thisMonthDay(18) }], 'and the prep never moved');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('DOCUMENTATIONS: Cancel after moving the due day leaves track_db byte-identical', async () => {
    // The drop is only safe because it is undoable right up to Save. This is
    // also what keeps the unconfirmed `clear all` exemption honest now that
    // this form can move a date as well as pick days.
    const { db, due } = moveDb();
    const page = await openDocEditOn(db, 18);
    const before = await docRawDb(page);

    await fillDocDl(page, { date: thisMonthDay(16) });
    await clickDocCau(page, thisMonthDay(14));
    assert.equal(await docCauCount(page), '2', 'the draft did change on screen');
    assert.equal(await docRawDb(page), before, 'but nothing reached track_db while editing');

    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('.cal-doc-form-acts button'),
        function (b) { return b.textContent.trim() === 'Cancel'; }).click();
      return true;
    });
    await page.waitFor(function () { return !document.querySelector('.cal-doc-form'); },
      { message: 'the form closing on Cancel' });
    assert.equal(await docRawDb(page), before, 'and Cancel left track_db byte-identical');

    // re-opening re-seeds from the RECORD, not from the abandoned draft
    await openDocDlEdit(page);
    const fields = await docDlFields(page);
    assert.equal(fields.due, due, 'the due day came back');
    assert.equal(await docCauCount(page), '3', 'and so did all three dropped days');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('DOCUMENTATIONS: a blank due day disables Save in the EDIT form too', async () => {
    const { db } = moveDb();
    const page = await openDocEditOn(db, 18);
    const before = await docRawDb(page);

    await fillDocDl(page, { date: '' });
    const blocked = await docSaveState(page);
    assert.equal(blocked.disabled, true, 'Save is disabled on a blank due day');
    assert.match(blocked.text, /Needs a due date and a time/, 'and the form says why');

    await docDlSave(page);
    await sleep(250);
    assert.equal(await docRawDb(page), before, 'clicking Save anyway wrote nothing at all');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('SCOPE GUARD: Progress still REFUSES the move Documentations drops', async () => {
    // The asymmetry is the design, so it gets its own case. Same seed, same
    // move, two surfaces, two different right answers — and each is only right
    // because of how that surface writes. Making them uniform would be a
    // regression in one direction or the other, and this is what would trip.
    const { db, due } = moveDb();

    const prog = await openMovePopup({ db, due });
    await openMoveEdit(prog);
    await setDue(prog, thisMonthDay(16));
    const progState = await moveSaveState(prog);
    assert.equal(progState.disabled, true,
      'PROGRESS refuses: it writes picks straight through, so it cannot drop one');
    assert.ok(await prog.evaluate(function () {
      return !!document.querySelector('[data-dl-orphaned]');
    }), 'and it names the orphaned days');
    assert.deepEqual(realErrors(prog), []);
    await prog.close();

    const docs = await openDocEditOn(moveDb().db, 18);
    await fillDocDl(docs, { date: thisMonthDay(16) });
    assert.equal((await docSaveState(docs)).disabled, false,
      'DOCUMENTATIONS allows it: picks are draft-held, so the drop is undoable by Cancel');
    assert.equal(await docRefused(docs), null, 'and raises no refusal of its own');
    assert.deepEqual(realErrors(docs), []);
    await docs.close();
  });

  await t.test('both pages mint ids in one shape', async () => {
    const SHAPE = /^[0-9a-z]+-[0-9a-z]{1,5}$/;
    for (const [file, fn] of [['progress.html', 'uid'], ['documentations.html', 'genId']]) {
      const page = await open(file, { db: seedDb() });
      await page.waitFor(function () {
        var el = document.querySelector('#root'); return !!el && el.children.length > 0;
      }, { message: file + ' mounting' });
      const out = await page.evaluate(function (name) {
        return {
          shared: typeof window.TrackStorage.newId,
          fromGuard: window.TrackStorage.newId(),
          fromPage: window[name] ? window[name]() : null
        };
      }, fn);
      assert.equal(out.shared, 'function', 'the shared minter is available on ' + file);
      assert.match(out.fromGuard, SHAPE);
      assert.match(out.fromPage, SHAPE, file + "'s " + fn + '() mints the shared shape');
      await page.close();
    }
  });

  /* ── 2b. True Storage ─────────────────────────────────────────────────────
     A storage tag names a PAIR: one leaf source dump and one MM linked inside
     it. sir-ks02.html draws that pair's content at four sites, so the cases
     below assert per-site AND negatively — a chip must appear under the right
     MM and be absent under the wrong one, and absent under the same MM in a
     different dump. A test that only asserts presence would pass just as
     happily against a matcher that had dropped half the comparison, which is
     exactly how the deadline caution predicate went wrong. */

  // Two leaves so a dropped dumpId is catchable, two MMs in one leaf so a
  // dropped mmId is catchable, and one storage already tagged to exactly one
  // of the four pairs.
  const tagSeed = (over = {}) => seedDb(Object.assign({
    sourceDumps: [
      F.dump('d-1', '2026-03-08', { mmLinks: [F.dumpLink(90, 10), F.dumpLink(91, 11)] }),
      F.dump('d-2', '2026-03-09', { mmLinks: [F.dumpLink(92, 10)] })
    ],
    trueStorages: [
      F.trueStorage('ts-1', 'Storage A', { tags: [F.storageTag('tg-1', 'd-1', 10)] }),
      F.trueStorage('ts-2', 'Storage B')
    ],
    trueStoragePos: {}
  }, over));

  // Which storages are drawn against one (dump, MM) pair. null means the pair
  // is not on the page at all, which is a different failure from "no chips".
  const CHIPS_AT = function (key) {
    var box = document.querySelector('[data-storage-tags="' + key + '"]');
    if (!box) return null;
    return Array.prototype.map.call(box.querySelectorAll('[data-storage-chip]'),
      function (a) { return a.getAttribute('data-storage-chip'); });
  };

  const CLICK_SEL = function (sel) {
    var el = document.querySelector(sel);
    if (!el) return false;
    el.click();
    return true;
  };

  // index.html is static markup; the other four mount a React #root. Declared
  // here rather than beside the malformed-db section because the cycle cases
  // below use them too, and a `const` is not hoisted.
  const mountSel = file => file === 'index.html' ? '#slot-list' : '#root';

  const waitMounted = (page, file) => page.waitFor(function (sel) {
    var el = document.querySelector(sel);
    return !!el && el.children.length > 0;
  }, { args: [mountSel(file)], message: file + ' mounting' });

  const STORAGE_BY_ID = function (id) {
    var db = JSON.parse(localStorage.getItem('track_db') || '{}');
    var slot = (db.slots || [])[0] || {};
    return (slot.trueStorages || []).filter(function (s) { return s.id === id; })[0] || null;
  };

  // `hash` is appended verbatim, so it carries a query string too.
  const withQuery = (query, hash) => query + hash;

  await t.test('a storage created on True Storage persists in the canonical shape', async () => {
    const page = await open('true-storage.html', {
      db: seedDb({ trueStorages: [], trueStoragePos: {} })
    });
    await page.waitFor(function () {
      return !!Array.prototype.find.call(document.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === '+Storage'; });
    }, { message: 'the +Storage button' });

    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === '+Storage'; }).click();
      return true;
    });
    await page.waitFor(function () { return !!document.querySelector('input[placeholder="Storage name…"]'); },
      { message: 'the new-storage input' });
    await page.evaluate(function (setterSrc, value) {
      var set = new Function('return ' + setterSrc)();
      set(document.querySelector('input[placeholder="Storage name…"]'), value);
      return true;
    }, SET_REACT_INPUT, 'First storage');
    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'ADD'; }).click();
      return true;
    });

    const stored = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var list = ((db.slots || [])[0] || {}).trueStorages || [];
      return list.length === 1 ? list[0] : false;
    }, { message: 'the storage being saved' });

    assert.equal(stored.name, 'First storage');
    assert.equal(typeof stored.id, 'string', 'ids are strings — they must never collide with KS02 nid()');
    assert.deepEqual(stored.parentIds, []);
    assert.deepEqual(stored.tags, []);
    assert.equal(stored.explanation, '');
    // The LOCAL calendar day, not the UTC one. Compared against the browser's
    // own clock so the assertion holds whatever timezone the suite runs in.
    const localDay = await page.evaluate(function () {
      var d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    });
    assert.equal(stored.createdAt, localDay, 'createdAt is the local day');

    // Reload, then check the canvas drew a node for it and the record is still
    // stored. The node's LABEL is not the assertion: the canvas truncates a
    // name past 11 characters, so matching on body text would be testing the
    // ellipsis rather than persistence.
    await page.reload();
    await page.skipFirebase();
    await page.waitFor(function () { return !!document.querySelector('[data-sid]'); },
      { message: 'the storage node surviving a reload' });
    const afterReload = await page.evaluate(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      return ((db.slots || [])[0] || {}).trueStorages || [];
    });
    assert.equal(afterReload.length, 1, 'exactly one storage after the reload');
    assert.equal(afterReload[0].name, 'First storage');
    assert.equal(afterReload[0].id, stored.id, 'and it is the same record, not a re-created one');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('the tree reorders siblings and refuses a drag across branches', async () => {
    // Order inside `trueStorages` IS the rendered order, so a drag that is not
    // a sibling move would silently rewrite an order the user cannot see.
    const page = await open('true-storage.html', {
      db: seedDb({
        trueStorages: [
          F.trueStorage('root-1', 'Root one'),
          F.trueStorage('kid-a', 'Kid A', { parentIds: ['root-1'] }),
          F.trueStorage('kid-b', 'Kid B', { parentIds: ['root-1'] }),
          F.trueStorage('root-2', 'Root two')
        ],
        trueStoragePos: {}
      }),
      hash: '#tree'
    });
    await page.waitFor(function () { return !!document.querySelector('[data-storage-row="kid-b"]'); },
      { message: 'the storage tree' });

    // The SRCH handlers read a real DataTransfer, so synthesise one rather than
    // reaching into React.
    const DRAG = function (draggedId, targetId, before) {
      var row = document.querySelector('[data-storage-row="' + targetId + '"]');
      var rect = row.getBoundingClientRect();
      var y = before ? rect.top + 1 : rect.bottom - 1;
      var dt = new DataTransfer();
      dt.setData('application/truestorage-arrange-id', draggedId);
      ['dragover', 'drop'].forEach(function (type) {
        row.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientY: y }));
      });
      return true;
    };
    const ORDER = function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      return (((db.slots || [])[0] || {}).trueStorages || []).map(function (s) { return s.id; });
    };

    await page.evaluate(DRAG, 'kid-b', 'kid-a', true);
    assert.deepEqual(await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var ids = (((db.slots || [])[0] || {}).trueStorages || []).map(function (s) { return s.id; });
      return ids[1] === 'kid-b' ? ids : false;
    }, { message: 'the sibling move being saved' }),
      ['root-1', 'kid-b', 'kid-a', 'root-2'], 'a sibling moved before its sibling');

    const before = await page.evaluate(ORDER);
    await page.evaluate(DRAG, 'kid-a', 'root-2', true);
    await sleep(400);
    assert.deepEqual(await page.evaluate(ORDER), before,
      'a drag onto a node that is not a sibling changes nothing');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a tag lands on its own pair and on no other', async () => {
    const page = await open('true-storage.html', { db: tagSeed(), hash: '?storage=ts-2' });
    await page.waitFor(function () { return !!document.querySelector('[data-add-tag]'); },
      { message: '?storage= opening the detail' });

    await page.evaluate(CLICK_SEL, '[data-add-tag]');
    await page.waitFor(function () { return !!document.querySelector('[data-tag-option="d-1:11"]'); },
      { message: 'the tag picker listing leaf dumps and their MMs' });
    await page.evaluate(CLICK_SEL, '[data-tag-option="d-1:11"]');

    const tags = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var s = (((db.slots || [])[0] || {}).trueStorages || []).filter(function (x) { return x.id === 'ts-2'; })[0];
      return (s && s.tags && s.tags.length) ? s.tags : false;
    }, { message: 'the tag being saved' });
    assert.equal(tags.length, 1);
    assert.equal(tags[0].dumpId, 'd-1');
    assert.equal(tags[0].mmId, 11, 'the MM half of the pair is the one that was picked');
    assert.equal(typeof tags[0].id, 'string');

    // The other side: KS02 draws each chip against its own pair only.
    const leaf1 = await open('sir-ks02.html', { hash: withQuery('?dump=d-1', '#ks03'), fresh: false });
    await leaf1.waitFor(function () { return !!document.querySelector('[data-storage-tags="d-1:10"]'); },
      { message: '?dump= opening the leaf card' });
    assert.deepEqual(await leaf1.evaluate(CHIPS_AT, 'd-1:10'), ['ts-1'],
      'the storage tagged to this pair is drawn');
    assert.deepEqual(await leaf1.evaluate(CHIPS_AT, 'd-1:11'), ['ts-2'],
      'and the other MM in the same dump carries only its own');
    assert.deepEqual(realErrors(leaf1), []);

    const leaf2 = await open('sir-ks02.html', { hash: withQuery('?dump=d-2', '#ks03'), fresh: false });
    await leaf2.waitFor(function () { return !!document.querySelector('[data-storage-tags="d-2:10"]'); },
      { message: 'the second leaf card' });
    assert.deepEqual(await leaf2.evaluate(CHIPS_AT, 'd-2:10'), [],
      'the SAME MM in a different dump is a different pair and carries nothing');

    await page.close(); await leaf1.close(); await leaf2.close();
  });

  await t.test('the chip is drawn in the MM detail S&C tab, per pair', async () => {
    const page = await open('sir-ks02.html', { db: tagSeed(), hash: '#srch' });
    await page.waitFor(function () { return document.body.textContent.indexOf('Mind Map A') >= 0; },
      { message: 'the SRCH list' });
    await page.evaluate(function () {
      var row = Array.prototype.find.call(document.querySelectorAll('span'),
        function (s) { return s.textContent.trim() === 'Mind Map A'; });
      row.parentElement.click();
      return true;
    });
    await page.waitFor(function () {
      return !!Array.prototype.find.call(document.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'S&C'; });
    }, { message: 'the MM detail tabs' });
    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'S&C'; }).click();
      return true;
    });

    await page.waitFor(function () { return !!document.querySelector('[data-storage-tags="d-1:10"]'); },
      { message: 'the S&C dump groups' });
    assert.deepEqual(await page.evaluate(CHIPS_AT, 'd-1:10'), ['ts-1'],
      'the tagged pair carries its storage here too');
    assert.deepEqual(await page.evaluate(CHIPS_AT, 'd-2:10'), [],
      'the untagged pair in the other dump stays empty');
    assert.equal(await page.evaluate(CHIPS_AT, 'd-1:11'), null,
      "another MM's pair is not on this MM's page at all");

    const href = await page.evaluate(function () {
      var a = document.querySelector('[data-storage-chip="ts-1"]');
      return a ? a.getAttribute('href') : null;
    });
    assert.equal(href, 'true-storage.html?storage=ts-1', 'the chip links to the storage');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('the chip is drawn on the non-leaf S&C branch and inside a descendant node', async () => {
    // The other two of the four sites. Making MM 11 the parent of MM 10 puts
    // one MM's own dump group on the non-leaf branch and the other's inside
    // DescendantSCNode, so a single S&C tab exercises both — and each is
    // asserted separately, because a forgotten call site otherwise hides
    // behind a passing sibling.
    const page = await open('sir-ks02.html', {
      db: tagSeed({
        mms: [F.mm(10, 'Mind Map A', { parentIds: [11] }), F.mm(11, 'Mind Map B', { type: '2' })],
        trueStorages: [
          F.trueStorage('ts-1', 'Storage A', { tags: [F.storageTag('tg-1', 'd-1', 10)] }),
          F.trueStorage('ts-2', 'Storage B', { tags: [F.storageTag('tg-2', 'd-1', 11)] })
        ]
      }),
      hash: '#srch'
    });
    await page.waitFor(function () { return document.body.textContent.indexOf('Mind Map B') >= 0; },
      { message: 'the SRCH list' });
    await page.evaluate(function () {
      var row = Array.prototype.find.call(document.querySelectorAll('span'),
        function (s) { return s.textContent.trim() === 'Mind Map B'; });
      row.parentElement.click();
      return true;
    });
    await page.waitFor(function () {
      return !!Array.prototype.find.call(document.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'S&C'; });
    }, { message: 'the MM detail tabs' });
    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'S&C'; }).click();
      return true;
    });

    await page.waitFor(function () { return !!document.querySelector('[data-storage-tags="d-1:11"]'); },
      { message: "the non-leaf MM's own dump group" });
    assert.deepEqual(await page.evaluate(CHIPS_AT, 'd-1:11'), ['ts-2'],
      'the non-leaf branch draws this MM\'s own pair');
    assert.deepEqual(await page.evaluate(CHIPS_AT, 'd-1:10'), ['ts-1'],
      'the descendant node draws the descendant\'s pair');
    assert.deepEqual(await page.evaluate(CHIPS_AT, 'd-2:10'), [],
      'and the descendant\'s untagged pair in the other dump stays empty');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a tag added from KS02 is a fresh read-modify-write, not a snapshot', async () => {
    const page = await open('sir-ks02.html', { db: tagSeed(), hash: withQuery('?dump=d-1', '#ks03') });
    await page.waitFor(function () { return !!document.querySelector('[data-storage-add="d-1:11"]'); },
      { message: 'the leaf card + storage button' });

    // Another writer lands a storage this page has never seen. Written in this
    // same tab, so no `storage` event fires and the page's React copy of
    // trueStorages stays deliberately stale — which is the whole point.
    assert.notEqual(await page.evaluate(WRITE_SLOT_KEY, 'trueStorages', [
      { id: 'ts-1', name: 'Storage A', parentIds: [], explanation: '', tags: [{ id: 'tg-1', dumpId: 'd-1', mmId: 10 }] },
      { id: 'ts-2', name: 'Storage B', parentIds: [], explanation: '', tags: [] },
      { id: 'ts-3', name: 'Storage C', parentIds: [], explanation: '', tags: [] }
    ]), false, 'seeding the concurrent write');

    await page.evaluate(CLICK_SEL, '[data-storage-add="d-1:11"]');
    await page.waitFor(function () { return !!document.querySelector('[data-storage-option="ts-2"]'); },
      { message: 'the storage picker' });
    await page.evaluate(CLICK_SEL, '[data-storage-option="ts-2"]');

    const after = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var list = ((db.slots || [])[0] || {}).trueStorages || [];
      var s = list.filter(function (x) { return x.id === 'ts-2'; })[0];
      return (s && s.tags.length) ? list : false;
    }, { message: 'the tag being saved from KS02' });

    assert.deepEqual(after.map(s => s.id), ['ts-1', 'ts-2', 'ts-3'],
      'the storage added between mount and click survived — the write read the stored value, not the snapshot');
    assert.deepEqual(after.find(s => s.id === 'ts-2').tags.map(t => ({ dumpId: t.dumpId, mmId: t.mmId })),
      [{ dumpId: 'd-1', mmId: 11 }]);
    assert.deepEqual(after.find(s => s.id === 'ts-1').tags, [{ id: 'tg-1', dumpId: 'd-1', mmId: 10 }],
      'another storage tagged to a different pair is untouched');

    // …and untagging from the same chip removes only that pair.
    await page.waitFor(function () { return !!document.querySelector('[data-storage-untag="ts-2"]'); },
      { message: 'the new chip' });
    await page.evaluate(CLICK_SEL, '[data-storage-untag="ts-2"]');
    const untagged = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var list = ((db.slots || [])[0] || {}).trueStorages || [];
      var s = list.filter(function (x) { return x.id === 'ts-2'; })[0];
      return (s && s.tags.length === 0) ? list : false;
    }, { message: 'the tag being removed' });
    assert.deepEqual(untagged.map(s => s.id), ['ts-1', 'ts-2', 'ts-3'], 'no record was dropped');
    assert.deepEqual(untagged.find(s => s.id === 'ts-1').tags.length, 1, 'the other pair is still tagged');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a tag row opens and closes, and its title links to the dump', async () => {
    const page = await open('true-storage.html', { db: tagSeed(), hash: '?storage=ts-1' });
    await page.waitFor(function () { return !!document.querySelector('[data-tag-toggle="tg-1"]'); },
      { message: 'the tag row' });
    assert.equal(await page.evaluate(function () { return !!document.querySelector('[data-tag-title="tg-1"]'); }),
      false, 'the detail starts closed');

    await page.evaluate(CLICK_SEL, '[data-tag-toggle="tg-1"]');
    const href = await page.waitFor(function () {
      var a = document.querySelector('[data-tag-title="tg-1"]');
      return a ? a.getAttribute('href') : false;
    }, { message: 'the expanded panel' });
    assert.equal(href, 'sir-ks02.html?dump=d-1&mm=10#ks03',
      'the panel title carries both halves of the pair back to KS02');

    await page.evaluate(CLICK_SEL, '[data-tag-toggle="tg-1"]');
    await page.waitFor(function () { return !document.querySelector('[data-tag-title="tg-1"]'); },
      { message: 'a second click closing it' });
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('the one link is set, replaced, and cleared back to no key at all', async () => {
    const page = await open('true-storage.html', { db: tagSeed(), hash: '?storage=ts-1' });
    const clickText = function (label) {
      var b = Array.prototype.find.call(document.querySelectorAll('button'),
        function (x) { return x.textContent.trim() === label; });
      if (!b) return false;
      b.click();
      return true;
    };
    const fillLink = function (setterSrc, label, url) {
      var set = new Function('return ' + setterSrc)();
      set(document.querySelector('input[placeholder="label (optional)"]'), label);
      set(document.querySelector('input[placeholder="url"]'), url);
      return true;
    };

    await page.waitFor(clickText, { args: ['+ add link'], message: 'the add-link button' });
    await page.waitFor(function () { return !!document.querySelector('input[placeholder="url"]'); },
      { message: 'the link form' });
    await page.evaluate(fillLink, SET_REACT_INPUT, 'Paper', 'https://example.com/a');
    await page.evaluate(clickText, 'save');

    assert.deepEqual(await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var s = (((db.slots || [])[0] || {}).trueStorages || [])[0];
      return s.link || false;
    }, { message: 'the link being saved' }), { label: 'Paper', url: 'https://example.com/a' });

    await page.evaluate(clickText, 'edit');
    await page.waitFor(function () { return !!document.querySelector('input[placeholder="url"]'); },
      { message: 'the link form again' });
    await page.evaluate(fillLink, SET_REACT_INPUT, 'Paper v2', 'https://example.com/b');
    await page.evaluate(clickText, 'save');
    assert.deepEqual(await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var s = (((db.slots || [])[0] || {}).trueStorages || [])[0];
      return (s.link && s.link.url === 'https://example.com/b') ? s.link : false;
    }, { message: 'the replacement being saved' }), { label: 'Paper v2', url: 'https://example.com/b' });

    await page.evaluate(clickText, 'edit');
    await page.waitFor(function () { return !!document.querySelector('input[placeholder="url"]'); },
      { message: 'the link form a third time' });
    await page.evaluate(clickText, 'clear');

    // The KEY goes, not just its value: '' would be a third state, and a
    // storage that never had a link and one whose link was cleared are the
    // same thing.
    const cleared = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var s = (((db.slots || [])[0] || {}).trueStorages || [])[0];
      return Object.prototype.hasOwnProperty.call(s, 'link') ? false : s;
    }, { message: 'the link key being deleted' });
    assert.equal('link' in cleared, false);
    assert.deepEqual(cleared.tags, [{ id: 'tg-1', dumpId: 'd-1', mmId: 10 }], 'the tags were not disturbed');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('the explanation is written on SAVE and not before', async () => {
    const page = await open('true-storage.html', { db: tagSeed(), hash: '?storage=ts-1' });
    await page.waitFor(function () { return !!document.querySelector('textarea'); },
      { message: 'the explanation box' });
    assert.equal(await page.evaluate(function () { return document.querySelector('textarea').rows; }), 5,
      'the box opens at five lines');

    await page.evaluate(function (setterSrc, value) {
      var set = new Function('return ' + setterSrc)();
      set(document.querySelector('textarea'), value);
      return true;
    }, SET_REACT_INPUT, 'Why this matters.');
    await sleep(300);
    const midType = await page.evaluate(STORAGE_BY_ID, 'ts-1');
    assert.equal(midType.explanation, '', 'typing alone writes nothing');

    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'SAVE'; }).click();
      return true;
    });
    await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var s = (((db.slots || [])[0] || {}).trueStorages || [])[0];
      return s.explanation === 'Why this matters.';
    }, { message: 'SAVE writing the explanation' });
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a deep link that names nothing opens nothing, without an error', async () => {
    const storage = await open('true-storage.html', { db: tagSeed(), hash: '?storage=no-such-storage' });
    await storage.waitFor(function () {
      var el = document.getElementById('root');
      return !!el && el.children.length > 0;
    }, { message: 'true-storage.html mounting' });
    assert.equal(await storage.evaluate(function () { return !!document.querySelector('[data-add-tag]'); }),
      false, 'no detail was opened');
    assert.deepEqual(realErrors(storage), []);
    await storage.close();

    const ks02 = await open('sir-ks02.html', { hash: withQuery('?dump=no-such-dump', '#ks03'), fresh: false });
    await ks02.waitFor(function () {
      var el = document.getElementById('root');
      return !!el && el.children.length > 0;
    }, { message: 'sir-ks02.html mounting' });
    assert.equal(await ks02.evaluate(function () { return !!document.querySelector('[data-storage-tags]'); }),
      false, 'no leaf card was opened');
    assert.deepEqual(realErrors(ks02), []);
    await ks02.close();
  });

  /* ── 2f. parent cycles ────────────────────────────────────────────────────
     `parentIds` is plural and the ConnectionsPicker on both pages lets a user
     pick a descendant as a parent, so a cycle is reachable through ordinary
     use — and it can also already exist in stored data or arrive from another
     device through cloud sync.

     Unguarded, every traversal below recursed until the stack gave out. Because
     a RangeError thrown inside a React render tears the tree down, the symptom
     was not a broken canvas: the whole page rendered NOTHING. KS02 lost CAL,
     KS02, MG, KS03, KOLB and SRCH at once, recoverable only by hand-editing
     localStorage.

     So each case asserts BOTH that the mount survives and that no error was
     raised — a stack overflow shows up as an empty #root, which on its own is
     the symptom of a dozen unrelated faults.

     graph-layout.test.js pins the layout contract precisely and cheaply; these
     cases exist to prove the PAGE survives, which is the part an offline test
     of one module cannot claim. */

  // top → m → n → m: the component has a root, so the walk actually enters the
  // cycle. A rootless cycle is survivable by accident and proves nothing.
  const cyclicMms = [
    F.mm(10, 'Mind Map A'),
    F.mm(11, 'Mind Map B', { parentIds: [10, 12] }),
    F.mm(12, 'Mind Map C', { parentIds: [11] })
  ];

  await t.test('a parent cycle in mms does not white-screen KS02', async () => {
    const page = await open('sir-ks02.html', { db: seedDb({ mms: cyclicMms }), hash: '#ks03' });
    await waitMounted(page, 'sir-ks02.html');
    assert.deepEqual(realErrors(page), [], 'no RangeError escaped the render');
    // The canvas drew the cycle rather than merely not crashing.
    assert.equal(await page.evaluate(function () {
      return document.querySelectorAll('#root svg').length > 0;
    }), true, 'the multiverse canvas rendered');
    await page.close();
  });

  await t.test('a parent cycle in trueStorages does not white-screen True Storage', async () => {
    const page = await open('true-storage.html', {
      db: seedDb({
        trueStorages: [
          F.trueStorage('ts-1', 'Storage A'),
          F.trueStorage('ts-2', 'Storage B', { parentIds: ['ts-1', 'ts-3'] }),
          F.trueStorage('ts-3', 'Storage C', { parentIds: ['ts-2'] })
        ],
        trueStoragePos: {}
      })
    });
    await waitMounted(page, 'true-storage.html');
    assert.deepEqual(realErrors(page), []);
    const drawn = await page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll('[data-sid]'),
        function (g) { return g.getAttribute('data-sid'); }).sort();
    });
    assert.deepEqual(drawn, ['ts-1', 'ts-2', 'ts-3'], 'every storage in the cycle is on the canvas');
    await page.close();
  });

  await t.test('a rootless cycle still renders every node distinguishably', async () => {
    // No node is a root, so the main walk lays out nothing and the catch-all
    // has to. Stacked on one point they would be one visible node, and
    // applyRepulsion cannot separate exactly coincident positions.
    const page = await open('true-storage.html', {
      db: seedDb({
        trueStorages: [
          F.trueStorage('ts-1', 'Storage A', { parentIds: ['ts-2'] }),
          F.trueStorage('ts-2', 'Storage B', { parentIds: ['ts-1'] })
        ],
        trueStoragePos: {}
      })
    });
    await waitMounted(page, 'true-storage.html');
    assert.deepEqual(realErrors(page), []);
    const pts = await page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll('[data-sid]'), function (g) {
        var b = g.getBoundingClientRect();
        return Math.round(b.x) + ',' + Math.round(b.y);
      });
    });
    assert.equal(pts.length, 2);
    assert.notEqual(pts[0], pts[1], 'the two nodes do not sit on the same point');
    await page.close();
  });

  await t.test("a cycle does not hang a non-leaf MM's S&C tab", async () => {
    // getDescendants and computeDepths recurse over the same parent graph from
    // a different entry point, so this fails independently of the canvas fix.
    const page = await open('sir-ks02.html', {
      db: seedDb({
        mms: cyclicMms,
        sourceDumps: [F.dump('d-1', '2026-03-08', { mmLinks: [F.dumpLink(90, 12)] })]
      }),
      hash: '#srch'
    });
    await page.waitFor(function () { return document.body.textContent.indexOf('Mind Map A') >= 0; },
      { message: 'the SRCH list' });
    await page.evaluate(function () {
      var row = Array.prototype.find.call(document.querySelectorAll('span'),
        function (s) { return s.textContent.trim() === 'Mind Map A'; });
      row.parentElement.click();
      return true;
    });
    await page.waitFor(function () {
      return !!Array.prototype.find.call(document.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'S&C'; });
    }, { message: 'the MM detail tabs' });
    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'S&C'; }).click();
      return true;
    });
    await page.waitFor(function () {
      var el = document.getElementById('root');
      return !!el && el.children.length > 0 && document.body.textContent.indexOf('S&C') >= 0;
    }, { message: 'the S&C tab surviving a cyclic descendant walk' });
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* A cycle among source dumps is a DIFFERENT graph from mms/trueStorages: it
     runs on `parentId`, which is singular. That changes what is reachable, and
     the difference is worth stating because it sets the severity.

     Walking DOWN from the roots — the tag picker, deleteDumpEntry — cannot
     reach a parentId cycle at all: a node in one has its single parent inside
     the cycle, so it is nobody's descendant and no root leads to it. Walking UP
     from an arbitrary dump can, because the walk starts wherever it is asked
     to. So the upward path builders are the ones that need the guard, and the
     downward ones are guarded for consistency rather than against a live crash.

     Nothing in the current UI creates such a cycle either — addDumpEntry only
     ever attaches a NEW dump to an existing parent. It can only arrive from
     damaged or hand-edited data, or from a device syncing it in. That is
     exactly why the page has to survive it rather than assume it away. */
  const cyclicDumps = [
    F.dump('d-1', '2026-03-08', { mmLinks: [F.dumpLink(90, 10)] }),
    F.dump('d-2', '2026-03-09', { parentId: 'd-3' }),
    F.dump('d-3', '2026-03-10', { parentId: 'd-2' })
  ];

  await t.test('a source-dump parentId cycle does not break KS02 or the tag picker', async () => {
    const ks02 = await open('sir-ks02.html', {
      db: seedDb({ sourceDumps: cyclicDumps }),
      hash: withQuery('?dump=d-2', '#ks03')
    });
    await waitMounted(ks02, 'sir-ks02.html');
    assert.deepEqual(realErrors(ks02), [], 'the ?dump= path builder walked up out of the cycle');
    await ks02.close();

    const ts = await open('true-storage.html', {
      db: seedDb({
        sourceDumps: cyclicDumps,
        trueStorages: [F.trueStorage('ts-1', 'Storage A')],
        trueStoragePos: {}
      }),
      hash: '?storage=ts-1'
    });
    await ts.waitFor(function () { return !!document.querySelector('[data-add-tag]'); },
      { message: '?storage= opening the detail' });
    await ts.evaluate(CLICK_SEL, '[data-add-tag]');
    await ts.waitFor(function () { return !!document.querySelector('[data-tag-option="d-1:10"]'); },
      { message: 'the tag picker rendering the reachable leaf' });
    // The cycle's own dumps are unreachable from any root, so the picker simply
    // never draws them — asserted so a future re-parenting feature that DOES
    // make them reachable trips this case instead of shipping a hang.
    assert.equal(await ts.evaluate(function () {
      return !!document.querySelector('[data-tag-option^="d-2:"], [data-tag-option^="d-3:"]');
    }), false, 'a dump inside the cycle is not reachable from a root');
    assert.deepEqual(realErrors(ts), []);
    await ts.close();
  });

  /* ── 2g. a storage tag follows its content ────────────────────────────────
     Adding a sub-title under a leaf dump MOVES that dump's mmLinks down to the
     new child and empties the parent's. The tag names a (dumpId, mmId) pair, so
     without re-pointing it stops resolving and renders as "source removed" —
     the content is still there, one level down, with nothing saying so.

     KS02 re-points it in the same operation, through the one foreign-key write
     it is allowed to make: a fresh read-modify-write of `trueStorages` alone,
     never this page's React snapshot. */

  // The real authoring path in the source-dump view: "+ title" opens the form,
  // the input carries placeholder "New title...", and "add" commits it as a
  // child of whatever dump the breadcrumb is currently on.
  const addSubTitle = async (page, title) => {
    await page.evaluate(function () {
      var b = Array.prototype.find.call(document.querySelectorAll('button'),
        function (x) { return x.textContent.trim() === '+ title'; });
      if (!b) return false;
      b.click();
      return true;
    });
    await page.waitFor(function () {
      return !!document.querySelector('input[placeholder="New title..."]');
    }, { message: 'the create-title form' });
    await page.evaluate(function (setterSrc, value) {
      var set = new Function('return ' + setterSrc)();
      set(document.querySelector('input[placeholder="New title..."]'), value);
      return true;
    }, SET_REACT_INPUT, title);
    await page.evaluate(function () {
      var b = Array.prototype.find.call(document.querySelectorAll('button'),
        function (x) { return x.textContent.trim() === 'add'; });
      if (!b) return false;
      b.click();
      return true;
    });
  };

  await t.test('nesting a title under a tagged dump re-points the tag to the child', async () => {
    const page = await open('sir-ks02.html', { db: tagSeed(), hash: withQuery('?dump=d-1', '#ks03') });
    await page.waitFor(function () { return !!document.querySelector('[data-storage-tags="d-1:10"]'); },
      { message: 'the leaf card' });
    assert.deepEqual(await page.evaluate(CHIPS_AT, 'd-1:10'), ['ts-1'], 'the chip starts on the parent');

    const before = await page.evaluate(STORAGE_BY_ID, 'ts-1');
    assert.equal(before.tags[0].dumpId, 'd-1');

    await addSubTitle(page, 'Sub title');

    const moved = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var slot = (db.slots || [])[0] || {};
      var child = (slot.sourceDumps || []).filter(function (d) { return d.parentId === 'd-1'; })[0];
      if (!child) return false;
      var s = (slot.trueStorages || []).filter(function (x) { return x.id === 'ts-1'; })[0];
      if (!s || !s.tags.length || s.tags[0].dumpId !== child.id) return false;
      var parent = (slot.sourceDumps || []).filter(function (d) { return d.id === 'd-1'; })[0];
      return {
        childId: child.id,
        tag: s.tags[0],
        childLinks: (child.mmLinks || []).map(function (l) { return l.mmId; }),
        parentLinks: (parent.mmLinks || []).length
      };
    }, { message: 'the tag being re-pointed to the new child' });

    assert.equal(moved.tag.mmId, 10, 'the MM half of the pair is untouched');
    assert.equal(moved.tag.id, 'tg-1', 'it is the same tag record, not a re-created one');
    // d-1 seeds TWO mmLinks, and addDumpEntry moves the whole set down.
    assert.deepEqual(moved.childLinks, [10, 11], 'every mmLink moved to the child');
    assert.equal(moved.parentLinks, 0, 'and the parent kept none');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('nesting a title under an UNtagged dump writes no trueStorages at all', async () => {
    // The other half: re-pointing must not turn every sub-title into a write.
    // TrackTrueStorage.repointDump returns the same reference when nothing
    // matches, and _mutateSlotKey short-circuits on that — so no write, and no
    // sync upload armed for a no-op.
    const page = await open('sir-ks02.html', { db: tagSeed(), hash: withQuery('?dump=d-2', '#ks03') });
    await page.waitFor(function () { return !!document.querySelector('[data-storage-tags="d-2:10"]'); },
      { message: 'the second leaf card' });
    const before = await page.evaluate(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      return JSON.stringify(((db.slots || [])[0] || {}).trueStorages || []);
    });

    await addSubTitle(page, 'Another sub');
    await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      return ((db.slots || [])[0] || {}).sourceDumps.some(function (d) { return d.parentId === 'd-2'; });
    }, { message: 'the sub-title being added' });

    const after = await page.evaluate(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      return JSON.stringify(((db.slots || [])[0] || {}).trueStorages || []);
    });
    assert.equal(after, before, 'trueStorages is byte-identical');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* ── 2h. True Storage → SOURCE DUMP ───────────────────────────────────────
     True Storage's second tab is a COPY of KS02's KS03 → SOURCE DUMP page, and
     it edits the same `sourceDumps`. Two things make that safe, and both are
     asserted here rather than assumed:

     - every edit there is a FRESH read-modify-write of `sourceDumps` alone —
       never True Storage's React copy, never its autosave. KS02 owns the key
       and saves it from its own snapshot;
     - every edit goes through source-dump-core.js, so the same click stores
       the same thing on either page.

     The PARITY case is the copy's tripwire. It is a guard by design: it passes
     on both sides of this change and fails only when the two copies drift. */

  // The SOURCE DUMP view's controls, in document order, by visible text or
  // placeholder. The MM name is a <span> on KS02 and a link on True Storage,
  // so it is collected by its hook rather than by its tag.
  const DUMP_CONTROLS = function () {
    var view = document.querySelector('[data-source-dump-view]');
    if (!view) return null;
    return Array.prototype.map.call(
      view.querySelectorAll('button, a, input, textarea, [data-dump-mm-name], [data-dump-navigate]'),
      function (el) { return (el.getAttribute('placeholder') || el.textContent || '').trim(); });
  };
  const NAVIGATE_TO = function (id) {
    var el = document.querySelector('[data-dump-navigate="' + id + '"]');
    if (!el) return false;
    el.click();
    return true;
  };
  // A labelled button inside ONE MM card: matching by text alone would hit the
  // same label in the neighbouring card.
  const CLICK_IN_CARD = function (mmId, label) {
    var card = document.querySelector('[data-dump-mm="' + mmId + '"]');
    if (!card) return false;
    var b = Array.prototype.find.call(card.querySelectorAll('button'),
      function (x) { return x.textContent.trim() === label; });
    if (!b) return false;
    b.click();
    return true;
  };
  const FILL_IN_CARD = function (setterSrc, mmId, placeholder, value) {
    var set = new Function('return ' + setterSrc)();
    var card = document.querySelector('[data-dump-mm="' + mmId + '"]');
    var el = card && card.querySelector('[placeholder="' + placeholder + '"]');
    if (!el) return false;
    set(el, value);
    return true;
  };
  const STORED_DUMPS = function () {
    var db = JSON.parse(localStorage.getItem('track_db') || '{}');
    return (((db.slots || [])[0] || {}).sourceDumps) || [];
  };
  // A click that NAVIGATES, fired from a timer: clicked inside the same
  // Runtime.evaluate, the navigation can tear down the very context the
  // evaluate is still answering from.
  const CLICK_LATER = function (sel) {
    var el = document.querySelector(sel);
    if (!el) return false;
    setTimeout(function () { el.click(); }, 0);
    return true;
  };
  const addTextIn = async (page, mmId, title, explanation) => {
    await page.waitFor(CLICK_IN_CARD, { args: [mmId, '+ add text'], message: '+ add text in card ' + mmId });
    await page.waitFor(function (id) {
      var card = document.querySelector('[data-dump-mm="' + id + '"]');
      return !!(card && card.querySelector('textarea[placeholder="explanation..."]'));
    }, { args: [mmId], message: 'the text-block form in card ' + mmId });
    await page.evaluate(FILL_IN_CARD, SET_REACT_INPUT, mmId, 'title (optional)', title);
    await page.evaluate(FILL_IN_CARD, SET_REACT_INPUT, mmId, 'explanation...', explanation);
    assert.equal(await page.evaluate(CLICK_IN_CARD, mmId, 'add'), true, 'the text-block add button');
  };
  const addCitationIn = async (page, mmId, label, url) => {
    await page.waitFor(CLICK_IN_CARD, { args: [mmId, '+ citation link'], message: '+ citation link in card ' + mmId });
    await page.waitFor(function (id) {
      var card = document.querySelector('[data-dump-mm="' + id + '"]');
      return !!(card && card.querySelector('input[placeholder="url"]'));
    }, { args: [mmId], message: 'the citation form in card ' + mmId });
    await page.evaluate(FILL_IN_CARD, SET_REACT_INPUT, mmId, 'label', label);
    await page.evaluate(FILL_IN_CARD, SET_REACT_INPUT, mmId, 'url', url);
    assert.equal(await page.evaluate(CLICK_IN_CARD, mmId, 'add'), true, 'the citation add button');
  };
  const openKs02SourceDump = async (page) => {
    await page.waitFor(function () {
      var b = Array.prototype.find.call(document.querySelectorAll('button'),
        function (x) { return x.textContent.trim() === 'SOURCE DUMP'; });
      if (!b) return false;
      b.click();
      return true;
    }, { message: "KS03's SOURCE DUMP sub-tab" });
    await page.waitFor(function () { return !!document.querySelector('[data-source-dump-view]'); },
      { message: "KS02's SOURCE DUMP view" });
  };

  await t.test('SOURCE DUMP is True Storage\'s second tab, and #sourcedump and #tree each open theirs', async () => {
    const page = await open('true-storage.html', { db: tagSeed() });
    await page.waitFor(function () { return !!document.querySelector('[data-sid]'); },
      { message: 'the canvas, the first tab' });
    const tabs = await page.evaluate(function () {
      var header = document.querySelector('#root > div > div:first-child');
      var names = ['MULTIVERSE', 'SOURCE DUMP', 'SRCH'];
      return {
        header: Array.prototype.map.call(header.querySelectorAll('button'),
          function (b) { return b.textContent.trim(); }).filter(function (t) { return names.indexOf(t) >= 0; }),
        bar: Array.prototype.map.call(document.querySelectorAll('.track-tabbar [data-tabbar-tab]'),
          function (b) { return b.getAttribute('data-tabbar-tab'); })
      };
    });
    assert.deepEqual(tabs.header, ['MULTIVERSE', 'SOURCE DUMP', 'SRCH'], 'the header, in that order');
    assert.deepEqual(tabs.bar, ['multiverse', 'sourcedump', 'tree', 'home'], 'and the phone bar, from the same table');

    await page.evaluate(function () {
      var header = document.querySelector('#root > div > div:first-child');
      Array.prototype.find.call(header.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'SOURCE DUMP'; }).click();
      return true;
    });
    await page.waitFor(function () { return !!document.querySelector('[data-dump-row="d-1"]'); },
      { message: 'the header tab opening the SOURCE DUMP view at Home' });

    await page.evaluate(function () { location.hash = '#tree'; return true; });
    await page.waitFor(function () { return !!document.querySelector('[data-storage-row="ts-1"]'); },
      { message: '#tree still opening SRCH' });
    assert.equal(await page.evaluate(function () { return !!document.querySelector('[data-source-dump-view]'); }),
      false, 'and SRCH replaced the SOURCE DUMP view');

    await page.evaluate(function () { location.hash = '#sourcedump'; return true; });
    await page.waitFor(function () { return !!document.querySelector('[data-source-dump-view]'); },
      { message: '#sourcedump opening the SOURCE DUMP view' });
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('PARITY: the SOURCE DUMP copy draws exactly the controls KS02 draws', async () => {
    // Every kind of row on screen at once: two leaves at Home; on the leaf, two
    // MM cards, one carrying a text block, a citation and a storage chip.
    const db = () => tagSeed({
      sourceDumps: [
        F.dump('d-1', '2026-03-08', { mmLinks: [
          F.dumpLink(90, 10, {
            textBlocks: [{ id: 500, title: 'Why', explanation: 'Because.' }],
            links: [{ id: 600, label: 'Paper', url: 'https://example.com/p' }]
          }),
          F.dumpLink(91, 11)
        ] }),
        F.dump('d-2', '2026-03-09', { mmLinks: [F.dumpLink(92, 10)] })
      ]
    });

    const ts = await open('true-storage.html', { db: db(), hash: '#sourcedump' });
    await ts.waitFor(function () { return !!document.querySelector('[data-dump-row="d-2"]'); },
      { message: "True Storage's SOURCE DUMP view at Home" });
    const tsHome = await ts.evaluate(DUMP_CONTROLS);
    await ts.evaluate(NAVIGATE_TO, 'd-1');
    await ts.waitFor(function () { return !!document.querySelector('[data-dump-mm="11"]'); },
      { message: 'True Storage on the leaf' });
    const tsLeaf = await ts.evaluate(DUMP_CONTROLS);
    assert.deepEqual(realErrors(ts), []);
    await ts.close();

    const ks02 = await open('sir-ks02.html', { db: db(), hash: '#ks03' });
    await openKs02SourceDump(ks02);
    await ks02.waitFor(function () { return !!document.querySelector('[data-dump-row="d-2"]'); },
      { message: "KS02's SOURCE DUMP view at Home" });
    const ksHome = await ks02.evaluate(DUMP_CONTROLS);
    await ks02.evaluate(NAVIGATE_TO, 'd-1');
    await ks02.waitFor(function () { return !!document.querySelector('[data-dump-mm="11"]'); },
      { message: 'KS02 on the leaf' });
    const ksLeaf = await ks02.evaluate(DUMP_CONTROLS);
    assert.deepEqual(realErrors(ks02), []);
    await ks02.close();

    assert.ok(ksLeaf.length > 15, 'the leaf drew its controls at all (' + ksLeaf.length + ')');
    assert.deepEqual(tsHome, ksHome, 'Home: the two copies of the SOURCE DUMP page differ');
    assert.deepEqual(tsLeaf, ksLeaf, 'the leaf: the two copies of the SOURCE DUMP page differ');
  });

  await t.test('an edit on the SOURCE DUMP tab is a fresh read-modify-write, not a snapshot', async () => {
    const page = await open('true-storage.html', { db: tagSeed(), hash: withQuery('?dump=d-1', '#sourcedump') });
    await page.waitFor(function () { return !!document.querySelector('[data-dump-mm="11"]'); },
      { message: '?dump= opening the leaf on the SOURCE DUMP tab' });

    // Another writer — KS02, say — lands a title this page has never seen.
    // Written in this same tab, so no `storage` event fires and the page's
    // React copy stays stale, which is the whole point. Beside it, a record
    // this page never DRAWS (a dump naming itself as its parent, hidden by the
    // same filter KS02 applies): writing from the rendered list would drop it.
    const seeded = (await page.evaluate(STORED_DUMPS)).concat([
      { id: 'd-x', title: 'Written elsewhere', createdAt: '2026-03-11', parentId: null, mmLinks: [] },
      { id: 'd-self', title: 'Names itself', createdAt: '2026-03-11', parentId: 'd-self', mmLinks: [] }]);
    assert.notEqual(await page.evaluate(WRITE_SLOT_KEY, 'sourceDumps', seeded), false, 'seeding the concurrent write');

    await addCitationIn(page, 11, 'Paper', 'https://example.com/a');
    const after = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var list = (((db.slots || [])[0] || {}).sourceDumps) || [];
      var d = list.filter(function (x) { return x.id === 'd-1'; })[0];
      var s = d && d.mmLinks.filter(function (l) { return l.mmId === 11; })[0];
      return (s && s.links.length) ? list : false;
    }, { message: 'the citation being saved' });

    assert.ok(after.some(d => d.id === 'd-x'),
      'the title written elsewhere survived — the edit read the stored list, not the stale React copy');
    assert.ok(after.some(d => d.id === 'd-self'),
      'the record this page does not draw survived — the writer was handed the raw list, not the rendered one');
    assert.deepEqual(after.map(d => d.id), ['d-1', 'd-2', 'd-x', 'd-self'], 'and nothing moved');
    const cite = after[0].mmLinks.find(l => l.mmId === 11).links[0];
    assert.deepEqual({ label: cite.label, url: cite.url }, { label: 'Paper', url: 'https://example.com/a' });
    assert.equal(typeof cite.id, 'string', "minted by TrackStorage.newId — it can never collide with KS02's nid()");
    assert.deepEqual(after[0].mmLinks.find(l => l.mmId === 10), F.dumpLink(90, 10), 'the other card is untouched');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('the SOURCE DUMP tab writes sourceDumps and nothing else; other edits never write it', async () => {
    const page = await open('true-storage.html', { db: tagSeed(), hash: withQuery('?dump=d-1', '#sourcedump') });
    await page.waitFor(function () { return !!document.querySelector('[data-dump-mm="10"]'); },
      { message: 'the leaf' });
    const EXCEPT = function (key) {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var s = Object.assign({}, (db.slots || [])[0] || {});
      delete s[key];
      return JSON.stringify({ slot: s, activeSlotId: db.activeSlotId, slots: (db.slots || []).length });
    };

    const beforeOthers = await page.evaluate(EXCEPT, 'sourceDumps');
    await addTextIn(page, 10, 'Why', 'Because it matters.');
    await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = ((((db.slots || [])[0] || {}).sourceDumps) || [])[0];
      return !!(d && d.mmLinks[0].textBlocks.length);
    }, { message: 'the text block being saved' });
    await sleep(400);   // any autosave the edit set off has run by now
    assert.equal(await page.evaluate(EXCEPT, 'sourceDumps'), beforeOthers,
      'every other key — trueStorages included — is byte-identical');

    // The other half: an ordinary True Storage edit leaves sourceDumps alone,
    // because that key is never part of this page's autosave.
    const beforeDumps = JSON.stringify(await page.evaluate(STORED_DUMPS));
    await page.evaluate(CLICK_SEL, '[data-storage-chip="ts-1"]');
    await page.waitFor(function () { return !!document.querySelector('textarea[placeholder="What is this storage, and why does it matter?"]'); },
      { message: "the chip opening Storage A's detail" });
    await page.evaluate(function (setterSrc) {
      var set = new Function('return ' + setterSrc)();
      set(document.querySelector('textarea[placeholder="What is this storage, and why does it matter?"]'), 'Edited.');
      return true;
    }, SET_REACT_INPUT);
    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'SAVE'; }).click();
      return true;
    });
    await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var s = ((((db.slots || [])[0] || {}).trueStorages) || [])[0];
      return !!(s && s.explanation === 'Edited.');
    }, { message: 'the storage edit landing' });
    assert.equal(JSON.stringify(await page.evaluate(STORED_DUMPS)), beforeDumps, 'sourceDumps is byte-identical');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('the SOURCE DUMP copy draws each storage chip against its own pair, and opens it in place', async () => {
    const page = await open('true-storage.html', { db: tagSeed(), hash: withQuery('?dump=d-1', '#sourcedump') });
    await page.waitFor(function () { return !!document.querySelector('[data-storage-tags="d-1:11"]'); },
      { message: 'the leaf card' });
    assert.deepEqual(await page.evaluate(CHIPS_AT, 'd-1:10'), ['ts-1'], 'the tagged pair carries its storage');
    assert.deepEqual(await page.evaluate(CHIPS_AT, 'd-1:11'), [], 'the other MM in the same dump carries nothing');

    // Tagging from here writes this page's own key.
    await page.evaluate(CLICK_SEL, '[data-storage-add="d-1:11"]');
    await page.waitFor(function () { return !!document.querySelector('[data-storage-option="ts-2"]'); },
      { message: 'the storage picker' });
    await page.evaluate(CLICK_SEL, '[data-storage-option="ts-2"]');
    const tags = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var s = ((((db.slots || [])[0] || {}).trueStorages) || []).filter(function (x) { return x.id === 'ts-2'; })[0];
      return (s && s.tags.length) ? s.tags : false;
    }, { message: 'the tag being saved' });
    assert.deepEqual(tags.map(t => ({ dumpId: t.dumpId, mmId: t.mmId })), [{ dumpId: 'd-1', mmId: 11 }]);
    assert.deepEqual(await page.evaluate(CHIPS_AT, 'd-1:11'), ['ts-2']);

    // The chip opens the storage HERE — no reload — and back returns to the leaf.
    await page.evaluate(function () { window.__sameDocument = true; return true; });
    await page.evaluate(CLICK_SEL, '[data-storage-chip="ts-1"]');
    await page.waitFor(function () { return !!document.querySelector('[data-add-tag]'); },
      { message: "Storage A's detail" });
    assert.equal(await page.evaluate(function () { return window.__sameDocument === true; }), true,
      'opened in place, not by reloading the page');
    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === '← back'; }).click();
      return true;
    });
    await page.waitFor(function () { return !!document.querySelector('[data-dump-mm="10"]'); },
      { message: '← back returning to the same leaf' });

    // The SAME MM in another dump is a different pair.
    await page.evaluate(CLICK_SEL, '[data-dump-crumb="home"]');
    await page.waitFor(NAVIGATE_TO, { args: ['d-2'], message: 'the second leaf' });
    await page.waitFor(function () { return !!document.querySelector('[data-storage-tags="d-2:10"]'); },
      { message: 'the second leaf card' });
    assert.deepEqual(await page.evaluate(CHIPS_AT, 'd-2:10'), [], 'the same MM in another dump carries nothing');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('LIVE: a text block added on True Storage appears in an open KS02, and stays stored', async () => {
    const ts = await open('true-storage.html', { db: tagSeed(), hash: withQuery('?dump=d-1', '#sourcedump') });
    await ts.waitFor(function () { return !!document.querySelector('[data-dump-mm="10"]'); }, { message: 'True Storage on the leaf' });
    const ks02 = await open('sir-ks02.html', { hash: withQuery('?dump=d-1', '#ks03'), fresh: false });
    await ks02.waitFor(function () { return !!document.querySelector('[data-dump-mm="10"]'); }, { message: 'KS02 on the leaf' });

    await addTextIn(ts, 10, 'From TS', 'Typed on True Storage.');
    await ks02.waitFor(function () {
      var v = document.querySelector('[data-source-dump-view]');
      return !!v && v.textContent.indexOf('Typed on True Storage.') >= 0;
    }, { message: 'the open KS02 tab drawing the new block' });

    // KS02 refreshed on the `storage` event, and its autosave then wrote its own
    // snapshot back. The block must have survived that round trip.
    await sleep(800);
    const d1 = (await ks02.evaluate(STORED_DUMPS)).find(d => d.id === 'd-1');
    assert.deepEqual(d1.mmLinks.find(l => l.mmId === 10).textBlocks.map(b => b.explanation),
      ['Typed on True Storage.'], "still stored after KS02's autosave");
    assert.deepEqual(realErrors(ts), []);
    assert.deepEqual(realErrors(ks02), []);
    await ts.close(); await ks02.close();
  });

  await t.test('LIVE: a citation added in KS02 appears on an open True Storage SOURCE DUMP tab', async () => {
    const ts = await open('true-storage.html', { db: tagSeed(), hash: withQuery('?dump=d-1', '#sourcedump') });
    await ts.waitFor(function () { return !!document.querySelector('[data-dump-mm="11"]'); }, { message: 'True Storage on the leaf' });
    const ks02 = await open('sir-ks02.html', { hash: withQuery('?dump=d-1', '#ks03'), fresh: false });
    await ks02.waitFor(function () { return !!document.querySelector('[data-dump-mm="11"]'); }, { message: 'KS02 on the leaf' });

    await addCitationIn(ks02, 11, 'From KS02', 'https://example.com/k');
    await ts.waitFor(function () {
      var card = document.querySelector('[data-dump-mm="11"]');
      return !!card && card.textContent.indexOf('From KS02') >= 0;
    }, { message: 'the open True Storage tab drawing the new citation' });
    assert.deepEqual(realErrors(ts), []);
    assert.deepEqual(realErrors(ks02), []);
    await ts.close(); await ks02.close();
  });

  await t.test('a title made on True Storage (string id) is extended from KS02 (numeric ids), and both agree', async () => {
    const ts = await open('true-storage.html', { db: tagSeed(), hash: '#sourcedump' });
    await ts.waitFor(function () { return !!document.querySelector('[data-dump-row="d-2"]'); }, { message: 'Home' });
    await addSubTitle(ts, 'Made on True Storage');
    const made = await ts.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      return ((((db.slots || [])[0] || {}).sourceDumps) || [])
        .filter(function (d) { return d.title === 'Made on True Storage'; })[0] || false;
    }, { message: 'the root title being saved' });
    assert.equal(typeof made.id, 'string', 'True Storage mints string ids');
    assert.equal(made.parentId, null);
    const localDay = await ts.evaluate(function () {
      var d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    });
    assert.equal(made.createdAt, localDay, 'createdAt is the LOCAL day');

    const ks02 = await open('sir-ks02.html', { hash: withQuery('?dump=' + encodeURIComponent(made.id), '#ks03'), fresh: false });
    await ks02.waitFor(function () {
      return !!Array.prototype.find.call(document.querySelectorAll('[data-source-dump-view] button'),
        function (b) { return b.textContent.trim() === '+ add MM'; });
    }, { message: "KS02's ?dump= opening the string-id title" });
    await ks02.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('[data-source-dump-view] button'),
        function (b) { return b.textContent.trim() === '+ add MM'; }).click();
      return true;
    });
    await ks02.waitFor(function () {
      var s = Array.prototype.find.call(document.querySelectorAll('[data-source-dump-view] span'),
        function (x) { return x.textContent.trim() === 'Mind Map A'; });
      if (!s) return false;
      s.parentElement.click();
      return true;
    }, { message: 'picking Mind Map A' });
    await ks02.waitFor(function () { return !!document.querySelector('[data-dump-mm="10"]'); }, { message: "KS02's new card" });
    await addTextIn(ks02, 10, 'From KS02', 'Typed in KS02.');

    const stored = await ks02.waitFor(function (id) {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = ((((db.slots || [])[0] || {}).sourceDumps) || []).filter(function (x) { return x.id === id; })[0];
      return (d && d.mmLinks.length && d.mmLinks[0].textBlocks.length) ? d : false;
    }, { args: [made.id], message: "KS02's edits to the True Storage title being saved" });
    assert.equal(stored.id, made.id, 'the same record');
    assert.equal(typeof stored.mmLinks[0].id, 'number', "KS02's section id is its numeric nid()");

    await ts.evaluate(NAVIGATE_TO, made.id);
    await ts.waitFor(function () {
      var card = document.querySelector('[data-dump-mm="10"]');
      return !!card && card.textContent.indexOf('Typed in KS02.') >= 0;
    }, { message: 'True Storage drawing what KS02 added to its title' });
    assert.deepEqual(realErrors(ts), []);
    assert.deepEqual(realErrors(ks02), []);
    await ts.close(); await ks02.close();
  });

  await t.test('nesting a title under a tagged dump from True Storage re-points the tag; untagged writes none', async () => {
    const page = await open('true-storage.html', { db: tagSeed(), hash: withQuery('?dump=d-1', '#sourcedump') });
    await page.waitFor(function () { return !!document.querySelector('[data-storage-tags="d-1:10"]'); },
      { message: 'the leaf card' });
    await addSubTitle(page, 'Sub here');
    // Wait for the write that is certain to land — the sub-title — then give
    // the tag a bounded moment: it follows through this page's own autosave, a
    // render later. Its position is asserted as a VALUE afterwards, so a tag
    // left behind reports where it stayed instead of timing out.
    const child = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      return ((((db.slots || [])[0] || {}).sourceDumps) || [])
        .filter(function (d) { return d.parentId === 'd-1'; })[0] || false;
    }, { message: 'the sub-title landing' });
    await page.waitFor(function (cid) {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var s = ((((db.slots || [])[0] || {}).trueStorages) || []).filter(function (x) { return x.id === 'ts-1'; })[0];
      return !!(s && s.tags[0] && s.tags[0].dumpId === cid);
    }, { args: [child.id], timeout: 3000, message: 'the tag following' }).catch(() => {});
    const slot = await page.evaluate(READ_SLOT);
    const tag = slot.trueStorages.find(s => s.id === 'ts-1').tags[0];
    assert.equal(tag.dumpId, child.id, 'the tag followed its sections to the new child');
    assert.equal(typeof child.id, 'string');
    assert.equal(tag.id, 'tg-1', 'the same tag record, not a re-created one');
    assert.equal(tag.mmId, 10, 'its MM half untouched');
    assert.deepEqual(child.mmLinks.map(l => l.mmId), [10, 11], 'every section moved to the child');
    assert.equal(slot.sourceDumps.find(d => d.id === 'd-1').mmLinks.length, 0, 'and the parent kept none');

    const before = JSON.stringify((await page.evaluate(READ_SLOT)).trueStorages);
    await page.evaluate(CLICK_SEL, '[data-dump-crumb="home"]');
    await page.waitFor(NAVIGATE_TO, { args: ['d-2'], message: 'the untagged leaf' });
    await page.waitFor(function () { return !!document.querySelector('[data-dump-mm="10"]'); }, { message: 'its card' });
    await addSubTitle(page, 'Another sub');
    await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      return ((((db.slots || [])[0] || {}).sourceDumps) || []).some(function (d) { return d.parentId === 'd-2'; });
    }, { message: 'the sub-title under the untagged leaf' });
    await sleep(400);
    assert.equal(JSON.stringify((await page.evaluate(READ_SLOT)).trueStorages), before, 'trueStorages is byte-identical');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('an MM name on the SOURCE DUMP tab opens that MM in KS02, and Back returns to the dump', async () => {
    const page = await open('true-storage.html', { db: tagSeed(), hash: '#sourcedump' });
    await page.waitFor(NAVIGATE_TO, { args: ['d-1'], message: 'Home, then the leaf' });
    await page.waitFor(function () { return !!document.querySelector('[data-dump-mm-name="10"]'); }, { message: 'the leaf card' });
    assert.equal(await page.evaluate(function () {
      return document.querySelector('[data-dump-mm-name="10"]').getAttribute('href');
    }), 'sir-ks02.html?mm=10#ks03', "the MM's own link into KS02");

    assert.equal(await page.evaluate(CLICK_LATER, '[data-dump-mm-name="10"]'), true, 'the MM link exists');
    await page.waitFor(function () { return location.pathname.indexOf('sir-ks02.html') >= 0 && document.readyState !== 'loading'; },
      { timeout: 30000, message: 'following the link into KS02' });
    await page.skipFirebase();
    await page.waitFor(function () { return !!document.querySelector('[data-storage-tags="d-1:10"]'); },
      { message: "KS02 drawing MM 10's S&C content" });
    assert.equal(await page.evaluate(function () {
      var b = Array.prototype.find.call(document.querySelectorAll('button'),
        function (x) { return x.textContent.trim() === 'S&C'; });
      return !!b && b.className.indexOf('bg-white') >= 0;
    }), true, "it opened on the MM's S&C tab");
    assert.equal(await page.evaluate(function () { return !!document.querySelector('[data-source-dump-view]'); }),
      false, 'the MM detail, not the SOURCE DUMP page');

    await page.evaluate(function () { setTimeout(function () { history.back(); }, 0); return true; });
    await page.waitFor(function () { return location.pathname.indexOf('true-storage.html') >= 0 && document.readyState !== 'loading'; },
      { timeout: 30000, message: 'Back into True Storage' });
    await page.skipFirebase();
    await page.waitFor(function () { return !!document.querySelector('[data-dump-mm="10"]'); },
      { message: 'Back landing on the SOURCE DUMP tab, on the same leaf' });
    assert.equal(await page.evaluate(function () { return location.search + location.hash; }),
      '?dump=d-1&mm=10#sourcedump', 'the history entry says where the user stood');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('KS02 ?mm= opens that MM on S&C; a stale id opens nothing; with ?dump= it stays the ring', async () => {
    const page = await open('sir-ks02.html', { db: tagSeed(), hash: withQuery('?mm=10', '#ks03') });
    await page.waitFor(function () { return !!document.querySelector('[data-storage-tags="d-1:10"]'); },
      { message: "?mm= opening MM 10's S&C tab" });
    assert.equal(await page.evaluate(function () {
      var b = Array.prototype.find.call(document.querySelectorAll('button'),
        function (x) { return x.textContent.trim() === 'S&C'; });
      return !!b && b.className.indexOf('bg-white') >= 0;
    }), true, 'the S&C tab is the one open');
    assert.deepEqual(realErrors(page), []);
    await page.close();

    const stale = await open('sir-ks02.html', { hash: withQuery('?mm=999', '#ks03'), fresh: false });
    await waitMounted(stale, 'sir-ks02.html');
    await stale.waitFor(function () { return !!document.querySelector('#root svg'); }, { message: 'the KS03 canvas' });
    await sleep(400);
    assert.equal(await stale.evaluate(function () {
      return Array.prototype.some.call(document.querySelectorAll('button'), function (b) { return b.textContent.trim() === 'S&C'; });
    }), false, 'an id naming nothing opened no MM');
    assert.deepEqual(realErrors(stale), []);
    await stale.close();

    // Precedence: with ?dump= present, mm is the dump card's ring, as it was.
    const both = await open('sir-ks02.html', { hash: withQuery('?dump=d-1&mm=10', '#ks03'), fresh: false });
    // Wait for EITHER outcome and assert which one it was, so a regression
    // reports what opened instead of timing out on a dump that never appears.
    const landed = await both.waitFor(function () {
      if (document.querySelector('[data-source-dump-view] [data-dump-mm="10"]')) return 'the dump';
      var sc = Array.prototype.some.call(document.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'S&C'; });
      return sc ? "MM 10's detail" : false;
    }, { message: '?dump=&mm= opening something' });
    assert.equal(landed, 'the dump', '?dump= wins: the dump opened, not the MM detail');
    assert.equal(await both.evaluate(function () {
      return document.querySelector('[data-dump-mm="10"]').className.indexOf('border-amber-600') >= 0;
    }), true, 'with the ring on that card');
    assert.deepEqual(realErrors(both), []);
    await both.close();
  });

  /* +MM takes its parent from where the user is. The opener holds two rules —
     inside an MM that MM is the one parent, anywhere else the form starts at
     root — and each case below guards exactly one of them, so a change that
     drops either half fails a case of its own. */
  const PRESSED_PARENTS = function () {
    return Array.prototype.filter.call(document.querySelectorAll('[data-new-mm-modal] [data-new-mm-parent]'),
      function (b) { return b.getAttribute('aria-pressed') === 'true'; })
      .map(function (b) { return b.getAttribute('data-new-mm-parent'); });
  };
  const PARENTS_READOUT = function () {
    return document.querySelector('[data-new-mm-parents]').textContent.trim();
  };
  const NEW_MM_PRESS = function (label) {
    var b = Array.prototype.find.call(document.querySelectorAll('[data-new-mm-modal] button'),
      function (x) { return x.textContent.trim() === label; });
    if (!b) return false;
    b.click();
    return true;
  };
  const openNewMMForm = async (page, message) => {
    await page.evaluate(CLICK_SEL, '[data-add-mm]');
    await page.waitFor(function () { return !!document.querySelector('[data-new-mm-modal]'); }, { message });
  };

  await t.test('KS02 +MM inside an MM pre-chooses that MM as its one parent, and ADD stores it', async () => {
    const page = await open('sir-ks02.html', { db: seedDb(), hash: withQuery('?mm=10', '#ks03') });
    await page.waitFor(function () { return !!document.querySelector('[data-mm-detail="10"]'); },
      { message: "?mm= opening MM 10's detail" });
    await openNewMMForm(page, 'the NEW MIND MAP form');
    assert.deepEqual(await page.evaluate(PRESSED_PARENTS), ['10'],
      'the MM the user is in is chosen, and nothing else');
    assert.equal(await page.evaluate(PARENTS_READOUT), 'Mind Map A',
      'the readout names it, wherever the list is scrolled');

    await page.evaluate(function (setterSrc, value) {
      var set = new Function('return ' + setterSrc)();
      set(document.querySelector('[data-new-mm-modal] input[placeholder="MM name"]'), value);
      return true;
    }, SET_REACT_INPUT, 'Child of A');
    assert.equal(await page.evaluate(NEW_MM_PRESS, 'ADD'), true, 'ADD pressed');
    const made = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var slot = (db.slots || [])[0] || {};
      return (slot.mms || []).filter(function (m) { return m.name === 'Child of A'; })[0] || false;
    }, { message: 'the new MM being saved' });
    assert.deepEqual(made.parentIds, [10], 'stored under MM 10 alone');
    assert.equal(typeof made.parentIds[0], 'number', "the stored nid() number, never the query string's text");
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('KS02 +MM outside an MM starts at root, even when the cancelled draft held a parent', async () => {
    /* CANCEL keeps the draft, so this is the half of the rule that stops a
       parent chosen inside an MM from following the user out. The parent is
       chosen BY HAND, so the case stands whether or not the inside rule
       pre-chose it: pressing root first makes the next press a select, never
       a toggle-off. */
    const page = await open('sir-ks02.html', { db: seedDb(), hash: withQuery('?mm=10', '#ks03') });
    await page.waitFor(function () { return !!document.querySelector('[data-mm-detail="10"]'); },
      { message: "?mm= opening MM 10's detail" });
    await openNewMMForm(page, 'the NEW MIND MAP form');
    await page.evaluate(CLICK_SEL, '[data-new-mm-modal] [data-new-mm-parent="root"]');
    await page.evaluate(CLICK_SEL, '[data-new-mm-modal] [data-new-mm-parent="10"]');
    await page.evaluate(function (setterSrc, value) {
      var set = new Function('return ' + setterSrc)();
      set(document.querySelector('[data-new-mm-modal] input[placeholder="MM name"]'), value);
      return true;
    }, SET_REACT_INPUT, 'Half-typed');
    assert.deepEqual(await page.evaluate(PRESSED_PARENTS), ['10'], 'precondition: the draft holds MM 10');

    assert.equal(await page.evaluate(NEW_MM_PRESS, 'CANCEL'), true, 'CANCEL pressed');
    await page.waitFor(function () { return !document.querySelector('[data-new-mm-modal]'); },
      { message: 'the form closing' });
    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('[data-mm-detail] button'),
        function (b) { return b.textContent.trim() === '← back'; }).click();
      return true;
    });
    await page.waitFor(function () {
      return !document.querySelector('[data-mm-detail]') && !!document.querySelector('#root svg');
    }, { message: 'back out of MM 10, on the KS03 canvas' });

    await openNewMMForm(page, 'the NEW MIND MAP form, reopened from the canvas');
    assert.deepEqual(await page.evaluate(PRESSED_PARENTS), ['root'],
      'opened outside an MM, the form starts at root: the cancelled parent did not follow');
    assert.equal(await page.evaluate(PARENTS_READOUT), 'none (root)');
    assert.equal(await page.evaluate(function () {
      return document.querySelector('[data-new-mm-modal] input[placeholder="MM name"]').value;
    }), 'Half-typed', 'only the parent is reset: the rest of the draft still survives CANCEL');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* Where ADD leaves the user follows where they ARE, by two rules — from
     outside an MM SRCH opens on the new MM, from inside one the user stays in
     it — and each case below guards exactly one of them. */
  const NEW_MM_NAMED = function (name) {
    var db = JSON.parse(localStorage.getItem('track_db') || '{}');
    var slot = (db.slots || [])[0] || {};
    return (slot.mms || []).filter(function (m) { return m.name === name; })[0] || false;
  };
  const addNewMM = async (page, name) => {
    await page.evaluate(function (setterSrc, value) {
      var set = new Function('return ' + setterSrc)();
      set(document.querySelector('[data-new-mm-modal] input[placeholder="MM name"]'), value);
      return true;
    }, SET_REACT_INPUT, name);
    assert.equal(await page.evaluate(NEW_MM_PRESS, 'ADD'), true, 'ADD pressed');
    // Wait for the write to land, never for the view: a wrong landing must
    // report itself, not time out.
    const made = await page.waitFor(NEW_MM_NAMED, { args: [name], message: 'the new MM being saved' });
    await sleep(300);
    return made;
  };

  await t.test('KS02 +MM outside an MM opens SRCH on the new MM', async () => {
    const page = await open('sir-ks02.html', { db: seedDb(), hash: '#ks02' });
    await waitMounted(page, 'sir-ks02.html');
    await openNewMMForm(page, 'the NEW MIND MAP form');
    // The SRCH highlight clears itself after 1.5s, so a poll after ADD can miss
    // it under load. Record every row that is ever drawn focused instead.
    await page.evaluate(function () {
      window.__srchFocused = [];
      new MutationObserver(function () {
        var el = document.querySelector('[data-srch-focused]');
        if (el) window.__srchFocused.push(el.getAttribute('data-srch-mm'));
      }).observe(document.body, { subtree: true, childList: true, attributes: true });
      return true;
    });
    const made = await addNewMM(page, 'Fresh root');

    assert.equal(await page.evaluate(function () { return !!document.querySelector('[data-srch-view]'); }), true,
      'SRCH is open after ADD');
    assert.equal(await page.evaluate(function (id) {
      return !!document.querySelector('[data-srch-view] [data-srch-mm="' + id + '"]');
    }, made.id), true, 'and lists the new MM');
    assert.equal((await page.evaluate(function () { return window.__srchFocused; })).indexOf(String(made.id)) >= 0, true,
      'the new MM is the row SRCH focused');
    assert.equal(await page.evaluate(function () { return !!document.querySelector('[data-mm-detail]'); }), false,
      'no MM detail is open over it');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('KS02 +MM inside an MM stays in that MM', async () => {
    const page = await open('sir-ks02.html', { db: seedDb(), hash: withQuery('?mm=10', '#ks03') });
    await page.waitFor(function () { return !!document.querySelector('[data-mm-detail="10"]'); },
      { message: "?mm= opening MM 10's detail" });
    await openNewMMForm(page, 'the NEW MIND MAP form');
    const made = await addNewMM(page, 'Child that stays');

    assert.equal(await page.evaluate(function () { return !!document.querySelector('[data-mm-detail="10"]'); }), true,
      'the user is still inside MM 10 after ADD');
    assert.equal(await page.evaluate(function () { return !!document.querySelector('[data-srch-view]'); }), false,
      'SRCH did not open');
    assert.equal(await page.evaluate(function () { return !!document.querySelector('[data-new-mm-modal]'); }), false,
      'the form closed');
    assert.deepEqual(made.parentIds, [10], 'precondition: the new MM was made under MM 10');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a workspace switched in another tab starts the SOURCE DUMP tab at Home', async () => {
    /* The breadcrumb names dumps of the slot it was built in. Kept across a
       switch, it would point into a slot that has no such dump: the page would
       say "No titles yet" over a workspace full of them, and `+ title` would be
       refused for a parent that is not there. */
    const db = F.dbWith([
      F.emptySlot({ id: 'slot-a', name: 'Alpha', mms: [F.mm(10, 'A-mm')],
        sourceDumps: [F.dump('a-1', '2026-03-08', { mmLinks: [F.dumpLink(90, 10)] })] }),
      F.emptySlot({ id: 'slot-b', name: 'Beta',
        sourceDumps: [F.dump('b-1', '2026-03-09'), F.dump('b-2', '2026-03-10')] })
    ], 'slot-a');
    const ts = await open('true-storage.html', { db, hash: withQuery('?dump=a-1', '#sourcedump') });
    await ts.waitFor(function () { return !!document.querySelector('[data-dump-mm="10"]'); },
      { message: "slot A's leaf, opened by ?dump=" });
    const home = await open('index.html', { fresh: false });
    await home.evaluate(function () { window.activateSlot('slot-b'); return true; });
    // Wait for slot B to be adopted in EITHER shape — its titles, or the empty
    // view a stale breadcrumb produces — then one render more for the reset,
    // and assert what is on screen, so a regression reports it as a value.
    await ts.waitFor(function () {
      var v = document.querySelector('[data-source-dump-view]');
      return !!v && (!!document.querySelector('[data-dump-row="b-1"]') || v.textContent.indexOf('No titles yet') >= 0);
    }, { message: 'True Storage adopting slot B' });
    await sleep(400);
    assert.deepEqual(await ts.evaluate(function () {
      return {
        rows: Array.prototype.map.call(document.querySelectorAll('[data-dump-row]'),
          function (r) { return r.getAttribute('data-dump-row'); }),
        crumbs: Array.prototype.map.call(document.querySelectorAll('[data-dump-crumb]'),
          function (b) { return b.textContent.trim(); })
      };
    }), { rows: ['b-1', 'b-2'], crumbs: ['Home'] }, "slot B's titles, at Home");
    assert.deepEqual(realErrors(ts), []);
    await ts.close(); await home.close();
  });

  await t.test('True Storage ?dump=&mm= reopens that leaf with the card ringed; naming nothing opens Home', async () => {
    /* The address Back returns to. Chrome may restore the page from its
       back/forward cache instead — there is no `unload` listener to stop it —
       and then nothing here runs. This is the other road: a real load of that
       address, which has to rebuild the place from the query alone. */
    const page = await open('true-storage.html', { db: tagSeed(), hash: withQuery('?dump=d-1&mm=10', '#sourcedump') });
    await page.waitFor(function () { return !!document.querySelector('[data-dump-mm="10"]'); },
      { message: '?dump= reopening the leaf' });
    assert.equal(await page.evaluate(function () {
      return document.querySelector('[data-dump-mm="10"]').className.indexOf('border-amber-600') >= 0;
    }), true, '&mm= rings the card the user left from');
    assert.equal(await page.evaluate(function () {
      return document.querySelector('[data-dump-mm="11"]').className.indexOf('border-amber-600') >= 0;
    }), false, 'and only that card');
    assert.deepEqual(realErrors(page), []);
    await page.close();

    const none = await open('true-storage.html', { db: tagSeed(), hash: withQuery('?dump=no-such-dump', '#sourcedump') });
    await none.waitFor(function () { return !!document.querySelector('[data-dump-row="d-1"]'); },
      { message: 'the SOURCE DUMP view at Home' });
    assert.deepEqual(realErrors(none), []);
    await none.close();
  });

  // ── 3. export → import ──────────────────────────────────────────────────

  await t.test('export → import preserves docPageId and every canonical field', async () => {
    // The doc-authored deadline is seeded TICKED so the round trip also proves
    // `done` survives: neither the exporter nor the importer names the field,
    // and it has to reach the other side on normalizeSlot's unknown-key path.
    // The schedule-block keys ride the same path, which is why they are seeded
    // here rather than in a round trip of their own — including a `parts` list,
    // whose records are nested one level deeper than anything else on it.
    const page = await open('index.html', {
      db: seedDb({
        // The four quest keys ride the same unknown-key path, and their mind-map
        // ids are NUMBERS — the type real data uses — so this also proves the
        // round trip does not stringify them on the way through.
        goals: [
          F.task('g-1', {
            title: 'Root goal',
            // a slip record rides the same path: item-level, inside goals,
            // named by no allow-list, and with its `to` absent on a clear
            milestones: [F.milestone('ms-1', '2026-03-01', '2026-03-10', { slips: [
              { from: '2026-02-20', to: '2026-03-10', on: '2026-02-25' }, { from: '2026-01-31', on: '2026-02-02' }] })],
            toLearn: [10, 11], questLearn: [10], starLearn: [10],
            quest: true, star: false,
            children: [F.task('g-1a', {
              scheduledDate: '2026-03-10', scheduledTime: '08:30', duration: 45,
              quest: true, star: true
            })]
          })
        ],
        calendarNotes: [
          F.calNote('cn-sched', '2026-03-10', { time: '09:00', blockDuration: 90, blockOff: true }),
          F.calNote('cn-doc', '2026-03-10', { docPageId: 'p-1', title: 'Written from a page' })
        ],
        deadlines: [
          F.deadline('dl-sched', '2026-03-10', {
            cautionDates: ['2026-03-08', '2026-03-09'],
            blockDuration: 45, blockTime: '08:00', blockDate: '2026-03-09',
            parts: [{ id: 'pt-1', title: 'Outline', date: '2026-03-08', time: '08:00', blockDuration: 45, done: false }]
          }),
          F.deadline('dl-doc', '2026-03-10',
            { cautionDates: ['2026-03-09'], docPageId: 'p-1', time: '10:00', done: true }),
          // Un-migrated on purpose: an export taken before caution days became a
          // list must import intact, keys and all. index.html never runs the
          // migration, so this record arrives here exactly as it left.
          F.legacyDeadline('dl-legacy', '2026-03-10', '2026-03-07', { title: 'From an old export' })
        ]
      })
    });
    await page.waitFor(function () { return !!window.exportSlot && !!window.importSlot; },
      { message: 'index.html globals' });

    // capture what the real exporter produces, without letting the download run
    const exported = await page.evaluate(async function (slotId) {
      var captured = null;
      var oCreate = URL.createObjectURL, oRevoke = URL.revokeObjectURL,
        oClick = HTMLAnchorElement.prototype.click;
      URL.createObjectURL = function (b) { captured = b; return 'blob:stub'; };
      URL.revokeObjectURL = function () {};
      HTMLAnchorElement.prototype.click = function () {};
      try { window.exportSlot(slotId); }
      finally {
        URL.createObjectURL = oCreate; URL.revokeObjectURL = oRevoke;
        HTMLAnchorElement.prototype.click = oClick;
      }
      return captured ? await captured.text() : null;
    }, 'slot-test-1');

    assert.ok(exported, 'the exporter produced a blob');
    const parsed = JSON.parse(exported);
    assert.equal(parsed.calendarNotes.find(n => n.id === 'cn-doc').docPageId, 'p-1',
      'docPageId is in the exported file');

    await page.evaluate(IMPORT_FILE, exported); // back through the real importer

    const slots = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      return (db.slots || []).length === 2 ? db.slots : false;
    }, { message: 'the imported slot appearing' });

    const [original, imported] = slots;
    assert.equal(imported.name, 'Synthetic Workspace (import)');
    assert.notEqual(imported.id, original.id, 'the import gets a fresh slot id');

    const note = imported.calendarNotes.find(n => n.id === 'cn-doc');
    assert.ok(note, 'the doc-authored note round-tripped');
    assert.equal(note.docPageId, 'p-1', 'with its docPageId');
    const dl = imported.deadlines.find(d => d.id === 'dl-doc');
    assert.equal(dl.docPageId, 'p-1', 'the doc-authored deadline kept its docPageId');
    assert.deepEqual(dl.cautionDates, ['2026-03-09'],
      'and its chosen caution days, which no allow-list in the importer names');
    assert.equal(dl.done, true, 'and its tick, which no allow-list names either');

    const legacy = imported.deadlines.find(d => d.id === 'dl-legacy');
    assert.equal(legacy.startDate, '2026-03-07',
      'and a pre-choice record keeps its startDate through the round trip, unconverted');
    assert.ok(!('cautionDates' in legacy),
      'the importer neither migrates it nor invents a list beside it');

    // the schedule-block keys, which no allow-list names either
    const sched = imported.deadlines.find(d => d.id === 'dl-sched');
    assert.equal(sched.blockDuration, 45, 'the deadline block length round-tripped');
    assert.equal(sched.blockTime, '08:00', 'including its off-anchor start');
    assert.equal(sched.blockDate, '2026-03-09', 'and the day the block was placed on');
    assert.deepEqual(sched.parts,
      [{ id: 'pt-1', title: 'Outline', date: '2026-03-08', time: '08:00', blockDuration: 45, done: false }],
      'and the whole nested parts list, record for record, including a part\'s own day');
    // the four quest keys, which no allow-list names either
    const qGoal = imported.goals.find(g => g.id === 'g-1');
    assert.equal(qGoal.quest, true, 'the quest flag round-tripped');
    assert.equal(qGoal.star, false, 'including a star stored as an explicit false');
    assert.deepEqual(qGoal.questLearn, [10],
      'and the quested mind map, still a NUMBER rather than a stringified id');
    assert.deepEqual(qGoal.starLearn, [10], 'and its star');
    assert.equal(qGoal.children.find(k => k.id === 'g-1a').star, true,
      'a nested node kept its flags too');
    assert.deepEqual(qGoal.milestones[0].slips,
      [{ from: '2026-02-20', to: '2026-03-10', on: '2026-02-25' }, { from: '2026-01-31', on: '2026-02-02' }],
      'and a milestone\'s slip record, record for record, a cleared slip still without its `to`');

    assert.equal(imported.calendarNotes.find(n => n.id === 'cn-sched').blockOff, true,
      'blockOff round-tripped — the legacy key that still hides an item\'s blocks');
    assert.equal(imported.calendarNotes.find(n => n.id === 'cn-sched').blockDuration, 90,
      'and the day note block');

    // every canonical user-owned field survives, value for value
    for (const key of ['sessions', 'mms', 'kolbs', 'mgChanges', 'linChanges', 'linDayTitles',
      'goals', 'saActions', 'saEntries', 'sourceDumps', 'notes', 'mmEntries', 'mgSchedule',
      'calendarNotes', 'deadlines', 'pos', 'levelTemplates', 'docPages',
      'trueStorages', 'trueStoragePos', 'dateNotes']) {
      assert.deepEqual(imported[key], original[key], key + ' round-tripped unchanged');
    }

    // A storage tag points at a (dump, MM) pair by id, and both ids are
    // slot-local. The round trip has to carry the pair, not just the record.
    const storage = imported.trueStorages.find(s => s.id === 'ts-1');
    assert.deepEqual(storage.tags, [{ id: 'tg-1', dumpId: 'd-1', mmId: 10 }],
      'the source-dump tag survived with both halves of its pair');
    assert.deepEqual(imported.trueStorages.find(s => s.id === 'ts-2').parentIds, ['ts-1'],
      'and the storage parent/child link');

    // The allow-list must not silently shrink back.
    assert.equal(Object.keys(imported).length, 25, 'the imported slot carries all 25 canonical fields');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('an invalid import is refused without touching the stored database', async () => {
    const page = await open('index.html', { db: seedDb() });
    await page.waitFor(function () { return !!window.importSlot; }, { message: 'index.html globals' });
    const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });

    await page.evaluate(IMPORT_FILE, '{ not json at all');
    await waitForDialog(page);

    assert.ok(page.dialogs.some(d => /invalid/i.test(d)), 'the user was told the file was invalid');
    assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }), before,
      'the database is byte-identical after a rejected import');
    await page.close();
  });

  // ── 4. the canonical slot schema ────────────────────────────────────────
  // Six places used to build a new slot and each built a different one — 10,
  // 11, 12, 13, 14 and 21 fields. Readers masked it with `slot.goals || []`,
  // so nothing here fails loudly against the old pages except by counting.

  const CONTRACT = [
    'id', 'name', 'createdAt', 'sessions', 'mms', 'kolbs', 'mgChanges',
    'linChanges', 'linDayTitles', 'goals', 'saActions', 'saEntries', 'sourceDumps',
    'notes', 'mmEntries', 'mgSchedule', 'calendarNotes', 'deadlines', 'pos',
    'levelTemplates', 'docPages', 'trueStorages', 'trueStoragePos', 'refSchedules',
    'dateNotes'
  ];

  await t.test('every entry point creates a slot with the same canonical shape', async () => {
    for (const file of PAGES) {
      const page = await open(file);
      // index.html does not auto-create — it renders "No slots — open a tracker
      // to auto-create one" — so drive its constructor directly.
      if (file === 'index.html') {
        await page.waitFor(function () { return !!window.createSlot; }, { message: 'index.html globals' });
        await page.evaluate(function (setInput) {
          var el = document.getElementById('new-slot-name');
          eval('(' + setInput + ')')(el, 'Made on Home');
          window.createSlot();
        }, SET_REACT_INPUT);
      }

      const slot = await page.waitFor(READ_SLOT, { message: file + ' creating its default slot' });
      assert.deepEqual(Object.keys(slot).sort(), CONTRACT.slice().sort(),
        file + ' builds the full 23-field contract, not its own subset');
      assert.match(slot.id, /^slot-/, file + ' keeps the readable id prefix');
      assert.deepEqual(realErrors(page), [], 'no page error while bootstrapping ' + file);
      await page.close();
    }
  });

  await t.test('Home stamps a new slot with the LOCAL day and a collision-free id', async () => {
    const page = await open('index.html');
    await page.waitFor(function () { return !!window.createSlot; }, { message: 'index.html globals' });

    // Two creates with the clock FROZEN. 'slot-'+Date.now() returns the same
    // string for both, so the two slots become indistinguishable to
    // activeSlotId. Freezing is what makes this deterministic — left to the
    // real clock, the two calls usually land a millisecond apart and the test
    // passes against the very code it is meant to catch.
    const made = await page.evaluate(function (setInput) {
      var set = eval('(' + setInput + ')');
      var el = document.getElementById('new-slot-name');
      var realNow = Date.now, frozen = realNow.call(Date);
      Date.now = function () { return frozen; };
      try {
        set(el, 'First'); window.createSlot();
        set(el, 'Second'); window.createSlot();
      } finally { Date.now = realNow; }
      var d = new Date();
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      return {
        ids: (db.slots || []).map(function (s) { return s.id; }),
        createdAt: (db.slots || []).map(function (s) { return s.createdAt; }),
        localDay: d.getFullYear() + '-' +
          String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
        utcDay: d.toISOString().slice(0, 10)
      };
    }, SET_REACT_INPUT);

    assert.equal(made.ids.length, 2, 'both workspaces were stored');
    assert.notEqual(made.ids[0], made.ids[1], 'two creates in one millisecond get different ids');
    for (const stamp of made.createdAt) {
      assert.equal(stamp, made.localDay,
        'createdAt is the local calendar day' +
        (made.localDay === made.utcDay ? ' (this run is in UTC, where the two agree)' : ', not the UTC day'));
    }
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('import fills in the fields an older export never had', async () => {
    const page = await open('index.html', { db: seedDb() });
    await page.waitFor(function () { return !!window.importSlot; }, { message: 'index.html globals' });

    const legacy = F.preCalendarSlot({ id: 'slot-old', name: 'Old Export', createdAt: '2025-01-01' });
    await page.evaluate(IMPORT_FILE, JSON.stringify(legacy));

    const imported = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      return (db.slots || []).length === 2 ? db.slots[1] : false;
    }, { message: 'the imported slot appearing' });

    assert.deepEqual(Object.keys(imported).sort(), CONTRACT.slice().sort(),
      'the fields that export predates are filled with safe defaults');
    for (const key of ['calendarNotes', 'deadlines', 'docPages', 'notes', 'mmEntries']) {
      assert.deepEqual(imported[key], [], key + ' defaulted to an empty list');
    }
    for (const key of ['pos', 'levelTemplates', 'mgSchedule', 'linDayTitles']) {
      assert.deepEqual(imported[key], {}, key + ' defaulted to an empty map');
    }
    assert.deepEqual(imported.mms, legacy.mms, 'and what it did carry survived');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('import keeps a field written by a later version', async () => {
    // Import must not have a narrower contract than an ordinary page write,
    // which already preserves unknown keys. Otherwise every export made before
    // a new field exists loses it on the way back in.
    const page = await open('index.html', { db: seedDb() });
    await page.waitFor(function () { return !!window.importSlot; }, { message: 'index.html globals' });

    await page.evaluate(IMPORT_FILE, JSON.stringify(
      F.emptySlot({ id: 'slot-future', name: 'Future', futureField: { written: 'by a later version' } })));

    const imported = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      return (db.slots || []).length === 2 ? db.slots[1] : false;
    }, { message: 'the imported slot appearing' });

    assert.deepEqual(imported.futureField, { written: 'by a later version' },
      'a key this version has never heard of came through import intact');
    await page.close();
  });

  for (const [label, body, expect] of [
    ['a wrong-typed field', JSON.stringify({ name: 'Broken', goals: 'hello' }), /goals/],
    ['junk inside a list', JSON.stringify({ name: 'Broken', goals: [null] }), /goals\[0\]/],
    ['a whole database', JSON.stringify({ slots: [F.populatedSlot()], activeSlotId: 'slot-test-1' }),
      /whole database/i],
    ['a null file', 'null', /invalid|cannot import/i],
    ['an array', '[1,2]', /invalid|cannot import/i]
  ]) {
    await t.test('import refuses ' + label + ' and leaves the database byte-identical', async () => {
      const page = await open('index.html', { db: seedDb() });
      await page.waitFor(function () { return !!window.importSlot; }, { message: 'index.html globals' });
      const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });

      await page.evaluate(IMPORT_FILE, body);
      await waitForDialog(page);

      assert.ok(page.dialogs.length, 'the user was told, rather than left with a broken workspace');
      assert.match(page.dialogs.join('\n'), expect, 'the message names what is wrong');
      assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }), before,
        'nothing was written');
      assert.equal(await page.evaluate(function () {
        return (JSON.parse(localStorage.getItem('track_db') || '{}').slots || []).length;
      }), 1, 'no slot was added');
      await page.close();
    });
  }

  await t.test('a legacy install still migrates into one canonical slot', async () => {
    // The pre-track_db rescue path. It runs once per user, on a machine that
    // still holds the old keys, and can never run again — so the only way to
    // cover it is to fake the old keys.
    for (const file of ['progress.html', 'sir-ks02.html']) {
      const page = await open(file, { extra: F.legacyLocalKeys() });

      const slot = await page.waitFor(READ_SLOT, { message: file + ' migrating the legacy keys' });
      assert.deepEqual(Object.keys(slot).sort(), CONTRACT.slice().sort(),
        file + ' rescues legacy data into a complete slot');
      assert.equal(slot.goals.length, 1, file + ': the legacy goal survived');
      assert.equal(slot.goals[0].title, 'Legacy goal');
      assert.equal(slot.saActions[0].title, 'Legacy action', file + ': the legacy action survived');
      assert.equal(slot.saEntries.length, 1, file + ': the legacy entry survived');
      assert.deepEqual(realErrors(page), [], 'no page error during the legacy migration in ' + file);
      await page.close();
    }
  });

  await t.test('a nonempty legacy KS02 slot is normalized into the canonical shape', async () => {
    const legacy = {
      id: 'legacy-ks-slot', name: 'Legacy KS slot', createdAt: '2025-01-01',
      mms: [F.mm(7, 'Legacy MM')]
    };
    for (const file of ['progress.html', 'sir-ks02.html']) {
      const page = await open(file, { extra: {
        ks02_slots: JSON.stringify([legacy]),
        ks02_activeSlotId: legacy.id
      } });
      const slot = await page.waitFor(READ_SLOT, { message: file + ' adopting a nonempty legacy KS02 slot' });
      assert.deepEqual(Object.keys(slot).sort(), CONTRACT.slice().sort(),
        file + ' normalizes the rescued slot rather than retaining a page-specific subset');
      assert.equal(slot.mms[0].name, 'Legacy MM', file + ': legacy data survived normalization');
      await page.close();
    }
  });

  /* ── 8. NOTES Proposal 2, first P0 — a malformed track_db must not
        white-screen a page, and must never be written over ───────────────

     Both halves matter, and they fail differently. `null`, and any value with
     structurally broken slot content, throws on `db.slots` (or later out of
     flattenGoals) before React mounts: a white screen. `42` and `[1,2]` parse
     to something whose `.slots` is merely undefined, so the bootstrap IIFEs
     fall through and REPLACE the unreadable bytes with an empty workspace —
     silent, and unrecoverable.

     Every assertion compares the raw string, never a re-parse, because the
     thing being protected is the bytes. */

  const READ_RAW = function () { return localStorage.getItem('track_db'); };
  const DB_STATE = function () {
    return window.TrackStorage && window.TrackStorage.dbStatus
      ? window.TrackStorage.dbStatus().state : 'no-guard';
  };
  // The widget's own read path: opening the panel calls loadNotes → _twDB.
  const OPEN_NOTES = function () { document.getElementById('nw-btn').click(); return true; };

  for (const [label, raw] of Object.entries(F.MALFORMED_DB_STRINGS)) {
    await t.test('malformed track_db (' + label + ') never white-screens and is left byte-identical', async () => {
      for (const file of PAGES) {
        const page = await open(file, { raw });
        await waitMounted(page, file);

        assert.equal(await page.evaluate(DB_STATE), 'blocked',
          file + ': the guard classified ' + label + ' as unreadable');
        assert.equal(await page.evaluate(function () {
          return window.TrackStorage.dbBlocked();
        }), true, file + ': writes are frozen');

        // the whole point: the bytes survived the mount, including whatever
        // bootstrap or auto-create the page runs on an apparently empty database
        assert.equal(await page.evaluate(READ_RAW), raw,
          file + ': ' + label + ' was not bootstrapped over');

        // the notes widget is the fifth reader — open it, so its read path runs
        assert.equal(await page.evaluate(function () { return !!document.getElementById('nw-btn'); }),
          true, file + ': the notes widget still mounted');
        await page.evaluate(OPEN_NOTES);
        // …and its Date tab, the second reader of the slot
        await page.evaluate(function () { document.querySelector('[data-nw-tab="date"]').click(); return true; });
        await sleep(150);
        assert.equal(await page.evaluate(READ_RAW), raw,
          file + ': opening the notes widget and its Date tab wrote nothing');

        // by now every reader on the page has run, so the user has been told
        assert.equal(await page.evaluate(function () {
          return !!document.getElementById('track-data-banner');
        }), true, file + ': the user was told, rather than shown a silently empty workspace');

        // and an explicit write attempt is refused rather than swallowed
        assert.equal(await page.evaluate(function () {
          return window.TrackStorage.saveDB({ slots: [], activeSlotId: null });
        }), false, file + ': saveDB refused while the database is unreadable');
        assert.equal(await page.evaluate(READ_RAW), raw,
          file + ': the refused write changed nothing');

        assert.deepEqual(realErrors(page), [], file + ': no uncaught error over ' + label);
        await page.close();
      }
    });
  }

  await t.test('a malformed database survives a reload and the raw bytes are recoverable', async () => {
    const raw = F.MALFORMED_DB_STRINGS['json number'];
    const page = await open('progress.html', { raw });
    await waitMounted(page, 'progress.html');
    await page.reload();
    await page.skipFirebase();
    await waitMounted(page, 'progress.html');
    assert.equal(await page.evaluate(READ_RAW), raw, 'still untouched after a second load');
    // the banner offers the bytes back rather than leaving devtools as the only route
    assert.equal(await page.evaluate(function () {
      var b = document.getElementById('track-data-banner');
      return !!b && /download/i.test(b.textContent);
    }), true, 'the banner offers a copy of the unreadable data');
    await page.close();
  });

  /* The other half of the tiered gate. Some validation findings do not make the
     slot structure ambiguous — a dangling activeSlotId is reachable from an
     ordinary cross-tab race, and a malformed optional time safely falls back to
     the untimed strip. These may warn, but their REAL page writers must work. */
  for (const [label, db, stateAfterMount] of [
    ['a dangling activeSlotId', F.dbWith([F.populatedSlot()], 'no-such-slot'), 'ok'],
    ['an invalid day-note time', F.dbWith([F.populatedSlot({
      calendarNotes: [F.calNote('cn-bad', '2026-03-10', { time: '25:99' })]
    })]), 'warn']
  ]) {
    await t.test('a soft flaw (' + label + ') still loads and stays editable', async () => {
      const page = await open('progress.html', { db });
      await waitMounted(page, 'progress.html');

      assert.equal(await page.evaluate(DB_STATE), stateAfterMount,
        label + ' is either retained as a warning or safely repaired during mount');
      assert.equal(await page.evaluate(function () { return window.TrackStorage.dbBlocked(); }), false,
        'writes stay allowed');
      assert.equal(await page.evaluate(WRITE_SLOT_KEY, 'notes', [F.note('n-soft', F.localTs(2026, 3, 10))]), true,
        'a fresh resolved-slot write still saves');
      assert.equal(await page.evaluate(function () {
        return ((JSON.parse(localStorage.getItem('track_db')).slots || [])[0].notes || []).length;
      }), 1, 'and the edit landed');
      assert.deepEqual(realErrors(page), [], 'no uncaught error over ' + label);
      await page.close();
    });
  }

  await t.test('Progress can save the slot it displays when activeSlotId is dangling', async () => {
    const slot = F.emptySlot({ id: 'slot-visible', goals: [] });
    const page = await open('progress.html', { db: F.dbWith([slot], 'slot-gone') });
    await waitMounted(page, 'progress.html');
    await page.evaluate(function () {
      _writeP('goals', [{ id: 'goal-fallback', title: 'Saved through fallback', children: [],
        completed: false, toLearn: [], mmTargets: {}, milestones: [] }]);
      return true;
    });

    const db = await page.waitFor(function () {
      var d = JSON.parse(localStorage.getItem('track_db'));
      return d.slots[0].goals.some(function (g) { return g.title === 'Saved through fallback'; }) ? d : false;
    }, { message: 'the visible fallback slot receiving the edit' });
    assert.equal(db.activeSlotId, 'slot-visible', 'the root pointer was realigned with the displayed slot');
    assert.equal(db.slots[0].goals.length, 1);
    await page.close();
  });

  await t.test('a healthy database is untouched by the load boundary', async () => {
    for (const file of PAGES) {
      const page = await open(file, { db: seedDb() });
      await waitMounted(page, file);
      assert.equal(await page.evaluate(DB_STATE), 'ok', file + ': a good database reads as ok');
      assert.equal(await page.evaluate(function () { return window.TrackStorage.dbBlocked(); }), false,
        file + ': nothing is frozen');
      assert.equal(await page.evaluate(function () {
        return !!document.getElementById('track-data-banner');
      }), false, file + ': no banner on healthy data');
      await page.close();
    }
  });

  await t.test('a missing track_db is a normal empty install, not a fault', async () => {
    for (const file of PAGES) {
      const page = await open(file);
      await waitMounted(page, file);
      assert.equal(await page.evaluate(function () { return window.TrackStorage.dbBlocked(); }), false,
        file + ': an absent key is not treated as corruption');
      assert.equal(await page.evaluate(function () {
        return !!document.getElementById('track-data-banner');
      }), false, file + ': no banner for a first-run install');
      assert.deepEqual(realErrors(page), [], file + ': clean first run');
      await page.close();
    }
  });

  await t.test('a quota-rejected import adds no slot', async () => {
    const page = await open('index.html', { db: seedDb() });
    await page.waitFor(function () { return !!window.importSlot; }, { message: 'index.html globals' });

    await page.evaluate(function () { window.TrackStorage.saveDB = function () { return false; }; });
    await page.evaluate(IMPORT_FILE, JSON.stringify(F.emptySlot({ id: 'slot-x', name: 'Rejected' })));
    await sleep(600);

    assert.equal(await page.evaluate(function () {
      return (JSON.parse(localStorage.getItem('track_db') || '{}').slots || []).length;
    }), 1, 'a write the quota guard refused does not appear as an imported slot');
    await page.close();
  });

  await t.test('a refused legacy-note adoption keeps the only remaining copy', async () => {
    const page = await browser.newPage();
    await page.clearStorage(server.origin);
    const initialDb = F.dbWith([F.emptySlot({ id: 'slot-notes', notes: [] })], 'slot-notes');
    await page.seed(initialDb, {
      track_global_notes: JSON.stringify({ notes: [F.note('legacy-safe', F.localTs(2026, 3, 10))] })
    });
    await page.addInitScript(
      'var __trackTestSetItem = Storage.prototype.setItem;' +
      'Storage.prototype.setItem = function(k,v){' +
      ' if(k === "track_db" && localStorage.getItem("track_db") !== null)' +
      '   throw new DOMException("synthetic full storage", "QuotaExceededError");' +
      ' return __trackTestSetItem.call(this,k,v);' +
      '};'
    );
    // Home hosts this case because it has no writer of its own to run over the
    // seeded database: its activeSlotId already resolves, so nothing but the
    // widget's adoption path can attempt the write being refused here.
    await page.goto(server.url('index.html'));
    await page.skipFirebase();
    await page.waitFor(function () { return !!document.getElementById('nw-btn'); },
      { message: 'notes widget mounting under refused writes' });

    assert.notEqual(await page.evaluate(function () { return localStorage.getItem('track_global_notes'); }), null,
      'the legacy key remains when its adoption write did not land');
    assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }),
      JSON.stringify(initialDb), 'the stored database stayed byte-identical');
    await page.close();
  });

  await t.test('Documentations reports a refused empty-slot bootstrap', async () => {
    const page = await browser.newPage();
    await page.clearStorage(server.origin);
    await page.addInitScript(
      'var __trackTestSetItem = Storage.prototype.setItem;' +
      'Storage.prototype.setItem = function(k,v){' +
      ' if(k === "track_db") throw new DOMException("synthetic full storage", "QuotaExceededError");' +
      ' return __trackTestSetItem.call(this,k,v);' +
      '};'
    );
    await page.goto(server.url('documentations.html'));
    await page.skipFirebase();
    assert.equal(await page.evaluate(function () { return _bootstrapSlotIfSafe(); }), false,
      'the bootstrap returns the storage guard result instead of claiming success');
    assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }), null,
      'no phantom workspace was persisted');
    await page.close();
  });

  /* ── 9. every destructive control confirms first ────────────────────────

     A control that deletes or clears stored data must ask before it writes.
     The assertion that matters is the CANCEL path: a confirm() that is merely
     displayed before the delete happens anyway is worse than none, because it
     reads as a guard. `page.rejectDialogs` (tests/lib/cdp.js) presses Cancel.

     Coverage is one case per MECHANISM, not per button: the prompt lives in
     the shared handler where every path through it is destructive, and at the
     call site where the handler also serves a non-destructive path. The last
     case pins the other side of the line — a control deliberately left
     unconfirmed must stay unconfirmed, so "make it uniform" trips a test
     instead of shipping friction onto a chip people click all day.        */

  /* A confirm() blocks the renderer, so the click cannot be awaited inside the
     same Runtime.evaluate — that deadlocks against the dialog. Fire it from a
     timer instead and let the session's dialog handler answer it. */
  const CLICK_SOON_SEL = function (sel) {
    var el = document.querySelector(sel);
    if (!el) return false;
    setTimeout(function () { el.click(); }, 0);
    return true;
  };
  const CLICK_SOON_TEXT = function (label) {
    var b = Array.prototype.find.call(document.querySelectorAll('button'),
      function (x) { return x.textContent.trim() === label; });
    if (!b) return false;
    setTimeout(function () { b.click(); }, 0);
    return true;
  };

  /* Click, answer the confirm, return its message. Fails if no dialog was
     raised at all — which is exactly how these read against a page with no
     confirm yet. */
  const answering = async (page, accept, fn, args = []) => {
    const before = page.dialogs.length;
    page.rejectDialogs = !accept;
    try {
      assert.notEqual(await page.evaluate(fn, ...args), false, 'the control exists');
      const until = Date.now() + 10000;
      while (page.dialogs.length === before && Date.now() < until) await sleep(30);
      assert.ok(page.dialogs.length > before,
        'the control asked before writing (no dialog was raised)');
      await sleep(150);   // the answered dialog's continuation, or lack of one
      return page.dialogs[page.dialogs.length - 1];
    } finally {
      page.rejectDialogs = false;
    }
  };

  const expectNoDialog = async (page, fn, args = []) => {
    const before = page.dialogs.length;
    assert.notEqual(await page.evaluate(fn, ...args), false, 'the control exists');
    await sleep(500);
    assert.equal(page.dialogs.length, before,
      'this control is deliberately NOT confirmed — see AGENTS.md');
  };

  const docBlockDb = () => seedDb({
    docPages: [F.docPage('p-1', {
      title: 'Notes',
      blocks: [{ id: 'b-1', type: 'table', rows: [['keep me', 'and me'], ['row two', 'cell']] }]
    })]
  });
  const storedBlocks = page => page.evaluate(function () {
    var db = JSON.parse(localStorage.getItem('track_db') || '{}');
    var p = (((db.slots || [])[0] || {}).docPages || [])[0];
    return p ? p.blocks : null;
  });

  await t.test('deleting a documentation block asks, and Cancel keeps every cell', async () => {
    const page = await open('documentations.html', { db: docBlockDb(), hash: '?page=p-1' });
    await page.waitFor(function () { return !!document.querySelector('.doc-block button[title="Delete"]'); },
      { message: 'the block delete button' });

    const msg = await answering(page, false, CLICK_SOON_SEL, ['.doc-block button[title="Delete"]']);
    assert.match(msg, /delete/i, 'the message says what will happen');
    assert.deepEqual(await storedBlocks(page),
      [{ id: 'b-1', type: 'table', rows: [['keep me', 'and me'], ['row two', 'cell']] }],
      'Cancel left the block and all its cell text exactly as stored');

    await answering(page, true, CLICK_SOON_SEL, ['.doc-block button[title="Delete"]']);
    assert.deepEqual(await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var p = (((db.slots || [])[0] || {}).docPages || [])[0];
      return (p && p.blocks.length === 0) ? p.blocks : false;
    }, { message: 'confirming still deletes the block' }), [], 'and confirming does delete it');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('dropping a table row or column asks, and Cancel keeps the text', async () => {
    const page = await open('documentations.html', { db: docBlockDb(), hash: '?page=p-1' });
    await page.waitFor(function () {
      return Array.prototype.some.call(document.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === '− row'; });
    }, { message: 'the table row/column chrome' });

    await answering(page, false, CLICK_SOON_TEXT, ['− row']);
    assert.deepEqual(await storedBlocks(page),
      [{ id: 'b-1', type: 'table', rows: [['keep me', 'and me'], ['row two', 'cell']] }],
      'Cancel kept the last row');

    await answering(page, false, CLICK_SOON_TEXT, ['− col']);
    assert.deepEqual(await storedBlocks(page),
      [{ id: 'b-1', type: 'table', rows: [['keep me', 'and me'], ['row two', 'cell']] }],
      'Cancel kept the last column');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* ── paste-a-table, and merged cells ──────────────────────────────────────
     A `table` block gained an optional `merges` list. The rules being pinned
     here, and why each one is a separate case:

     - `merges` is ABSENT when nothing spans. The two cases above deepEqual a
       whole table block, and every table stored before this feature has no
       such key, so an empty stored list would be a second spelling of "none".
     - Merging never touches `rows`. Covered text is hidden, not cleared, which
       is the only reason unmerge is a restore and the only reason neither
       control asks first.
     - `− row` CLAMPS a region that spanned the removed row instead of dropping
       it, and still asks first, because that removal does drop text.

     There is only one surface here — documentations.html renders tables and
     nothing else does — so this needs no per-surface duplication. The offline
     cover is tests/doc-table-core.test.js; these cases exist to prove the page
     is wired to it. */

  const rawDb = page => page.evaluate(function () { return localStorage.getItem('track_db'); });

  const openPasteModal = async (page, text) => {
    await page.waitFor(function () { return !!document.querySelector('.docs-addmenu'); },
      { message: 'the block add menu' });
    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('.docs-addmenu button'),
        function (b) { return /Paste table/.test(b.textContent); }).click();
    });
    await page.waitFor(function () { return !!document.querySelector('[data-paste-table-input]'); },
      { message: 'the paste-table textarea' });
    await page.evaluate(function (setterSrc, value) {
      var set = new Function('return ' + setterSrc)();
      set(document.querySelector('[data-paste-table-input]'), value);
    }, SET_REACT_INPUT, text);
  };
  const clickInsert = page => page.evaluate(function () {
    Array.prototype.find.call(document.querySelectorAll('[data-paste-table] button'),
      function (b) { return /Insert table/.test(b.textContent); }).click();
  });

  await t.test('a pasted table reaches track_db with its merges, and the grid draws the spans', async () => {
    const page = await open('documentations.html', {
      db: seedDb({ docPages: [F.docPage('p-1', { title: 'Notes', blocks: [] })] }), hash: '?page=p-1' });

    await openPasteModal(page, [
      '::: track-table',
      '| Region     | Q1 | Q2 |',
      '| North      | 50 | 60 |',
      '| South      | 45 | ^^ |',
      '| Total: 155 | << | << |',
      ':::'
    ].join('\n'));

    // The preview and the editor render through the same mergeMap, so asserting
    // the preview's geometry is asserting the block's.
    await page.waitFor(function () { return !!document.querySelector('[data-paste-table-preview]'); },
      { message: 'the parsed preview' });
    assert.deepEqual(await page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll('[data-paste-table-preview] td'),
        function (td) { return td.getAttribute('data-cell') + ':' + td.getAttribute('data-span'); });
    }), ['0,0:1x1', '0,1:1x1', '0,2:1x1', '1,0:1x1', '1,1:1x1', '1,2:2x1', '2,0:1x1', '2,1:1x1', '3,0:1x3'],
      'covered cells are not drawn at all, and each owner carries its own span');

    await clickInsert(page);
    const blocks = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var p = (((db.slots || [])[0] || {}).docPages || [])[0];
      return (p && p.blocks.length) ? p.blocks : false;
    }, { message: 'the table reaching track_db' });

    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].type, 'table');
    assert.deepEqual(blocks[0].merges, [{ r: 1, c: 2, rs: 2, cs: 1 }, { r: 3, c: 0, rs: 1, cs: 3 }]);
    assert.deepEqual(blocks[0].rows, [
      ['Region', 'Q1', 'Q2'], ['North', '50', '60'], ['South', '45', ''], ['Total: 155', '', '']
    ], 'the owner keeps its text and the covered cells come in empty');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a pasted table with nothing merged is stored with NO merges key', async () => {
    const page = await open('documentations.html', {
      db: seedDb({ docPages: [F.docPage('p-1', { title: 'Notes', blocks: [] })] }), hash: '?page=p-1' });

    // A plain markdown table, separator row and all — what an AI emits when the
    // picture has no merged cells.
    await openPasteModal(page, '| Name | Score |\n|------|-------|\n| Ada  | 9     |');
    await page.waitFor(function () { return !!document.querySelector('[data-paste-table-preview]'); },
      { message: 'the parsed preview' });
    await clickInsert(page);

    const blocks = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var p = (((db.slots || [])[0] || {}).docPages || [])[0];
      return (p && p.blocks.length) ? p.blocks : false;
    }, { message: 'the table reaching track_db' });

    assert.equal('merges' in blocks[0], false, 'absence is the default — no empty list is written');
    assert.deepEqual(Object.keys(blocks[0]), ['id', 'type', 'rows'],
      'the stored shape is exactly what it was before this feature existed');
    assert.deepEqual(blocks[0].rows, [['Name', 'Score'], ['Ada', '9']],
      'and the markdown separator row was skipped, not stored as data');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a pasted row with the wrong cell count is refused, and Insert writes nothing', async () => {
    const page = await open('documentations.html', {
      db: seedDb({ docPages: [F.docPage('p-1', { title: 'Notes', blocks: [] })] }), hash: '?page=p-1' });
    const before = await rawDb(page);

    await openPasteModal(page, '| a | b | c |\n| d | e |');
    const msg = await page.waitFor(function () {
      var el = document.querySelector('[data-paste-table-errors]');
      return el ? el.textContent : false;
    }, { message: 'the parse error' });
    assert.match(msg, /Line 2/, 'the error names the line of the pasted text');
    assert.match(msg, /2 cells.*first row has 3/, 'and says what is actually wrong');
    assert.equal(await page.evaluate(function () {
      return !!document.querySelector('[data-paste-table-preview]');
    }), false, 'nothing is previewed — there is no half-parsed table');

    // The path that matters: clicking the disabled button anyway must not write.
    await clickInsert(page);
    await sleep(400);
    assert.equal(await rawDb(page), before, 'track_db is byte-identical');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('merging hides the covered cell, and unmerging restores it exactly', async () => {
    const page = await open('documentations.html', { db: docBlockDb(), hash: '?page=p-1' });
    await page.waitFor(function () { return !!document.querySelector('.doc-table td textarea'); },
      { message: 'the table' });

    const clickCell = () => page.evaluate(function () { document.querySelector('.doc-table td textarea').click(); });
    const clickChrome = label => page.evaluate(function (l) {
      Array.prototype.find.call(document.querySelectorAll('button'),
        function (b) { return b.textContent.indexOf(l) >= 0 && !b.disabled; }).click();
    }, label);

    await clickCell();
    await page.waitFor(function () {
      return Array.prototype.some.call(document.querySelectorAll('button'),
        function (b) { return /merge right/.test(b.textContent) && !b.disabled; });
    }, { message: 'merge right becoming available on the selected cell' });
    await clickChrome('merge right');

    const merged = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var b = (((db.slots || [])[0] || {}).docPages || [])[0].blocks[0];
      return b.merges ? b : false;
    }, { message: 'the merge reaching track_db' });
    assert.deepEqual(merged.merges, [{ r: 0, c: 0, rs: 1, cs: 2 }]);
    assert.deepEqual(merged.rows, [['keep me', 'and me'], ['row two', 'cell']],
      'rows are untouched — the covered text is HIDDEN, never cleared');
    assert.equal(await page.evaluate(function () {
      return document.querySelectorAll('.doc-table tr')[0].children.length;
    }), 1, 'but the first row now draws a single spanning cell');

    // No dialog for either direction: nothing was deleted or cleared, so this
    // sits outside the destructive-control rule (AGENTS.md).
    assert.equal(page.dialogs.length, 0, 'merging did not ask, and did not need to');

    await clickCell();
    await page.waitFor(function () {
      return Array.prototype.some.call(document.querySelectorAll('button'),
        function (b) { return /unmerge/.test(b.textContent) && !b.disabled; });
    }, { message: 'unmerge becoming available' });
    await clickChrome('unmerge');

    assert.deepEqual(await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var b = (((db.slots || [])[0] || {}).docPages || [])[0].blocks[0];
      return !b.merges ? b : false;
    }, { message: 'the unmerge reaching track_db' }),
      { id: 'b-1', type: 'table', rows: [['keep me', 'and me'], ['row two', 'cell']] },
      'unmerge is a RESTORE — the block is back to its original shape, merges key and all');
    assert.equal(page.dialogs.length, 0);

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('dropping a row still asks, and clamps a merge that spanned it', async () => {
    const page = await open('documentations.html', {
      db: seedDb({ docPages: [F.docPage('p-1', { title: 'Notes', blocks: [{
        id: 'b-1', type: 'table',
        rows: [['tall', 'a'], ['', 'b'], ['', 'c']],
        merges: [{ r: 0, c: 0, rs: 3, cs: 1 }]
      }] })] }), hash: '?page=p-1' });
    await page.waitFor(function () {
      return Array.prototype.some.call(document.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === '− row'; });
    }, { message: 'the table row/column chrome' });

    const before = await rawDb(page);
    await answering(page, false, CLICK_SOON_TEXT, ['− row']);
    assert.equal(await rawDb(page), before, 'Cancel left track_db byte-identical, merge included');

    await answering(page, true, CLICK_SOON_TEXT, ['− row']);
    const after = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var b = (((db.slots || [])[0] || {}).docPages || [])[0].blocks[0];
      return b.rows.length === 2 ? b : false;
    }, { message: 'the row removal reaching track_db' });
    assert.deepEqual(after.merges, [{ r: 0, c: 0, rs: 2, cs: 1 }],
      'the region was CLAMPED to the shorter grid, not dropped along with its text');
    assert.equal(after.rows[0][0], 'tall', 'and it kept the text it was holding');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* ── adjustable column widths ─────────────────────────────────────────────
     A `table` block gained an optional `colWidths` — one percentage per
     column, summing to 100. Percentages and not pixels, so the proportions
     survive a narrow sidebar and print at whatever the page turns out to be,
     and so widening one column narrows its neighbour instead of pushing the
     table off the page.

     `colWidths` obeys the `merges` rule: absent by default, key deleted when
     cleared. The case above — a pasted table stored with Object.keys exactly
     ['id','type','rows'] — is the guard for that half and needs no edit here.

     The drag is synthesised from inside the page. That exercises the handler
     logic and NOT real pointer or touch hardware: gesture arbitration,
     momentum and iOS Safari are all still unverified. */

  const tableWidthDb = () => seedDb({
    docPages: [F.docPage('p-1', {
      title: 'Notes',
      blocks: [{ id: 'b-1', type: 'table', rows: [['one', 'two', 'three'], ['a', 'b', 'c']] }]
    })]
  });

  const COL_PCTS = function () {
    return Array.prototype.map.call(document.querySelectorAll('.doc-table col'),
      function (c) { return c.style.width || null; });
  };

  /* Pointer events, not touch: one path covers mouse, pen and finger, and
     pointer capture is what keeps the drag alive once the pointer leaves the
     6px strip. Dispatched on the handle itself — going through
     elementFromPoint would only prove the handle is on top, which is not what
     this case is about. */
  const DRAG_COL = function (edge, dx) {
    var h = document.querySelector('[data-col-handle="' + edge + '"]');
    if (!h) return 'no handle for column ' + edge;
    var box = h.getBoundingClientRect();
    var x = box.left + box.width / 2, y = box.top + box.height / 2;
    var fire = function (type, cx) {
      h.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse',
        clientX: cx, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1
      }));
    };
    fire('pointerdown', x);
    fire('pointermove', x + dx);
    fire('pointerup', x + dx);
    return 'ok';
  };

  await t.test('dragging a column boundary reaches track_db as colWidths', async () => {
    const page = await open('documentations.html', { db: tableWidthDb(), hash: '?page=p-1' });
    await page.waitFor(function () { return !!document.querySelector('[data-col-handle="0"]'); },
      { message: 'the column resize handle' });

    // Nothing stored yet, so table-layout: fixed is drawing equal columns and
    // the <col> elements carry no width of their own.
    assert.deepEqual(await page.evaluate(COL_PCTS), [null, null, null],
      'a table that was never resized stores and styles no width at all');

    assert.equal(await page.evaluate(DRAG_COL, 0, 120), 'ok');

    const after = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var b = (((db.slots || [])[0] || {}).docPages || [])[0].blocks[0];
      return b.colWidths ? b : false;
    }, { message: 'the drag reaching track_db' });

    assert.equal(after.colWidths.length, 3, 'one entry per column');
    assert.equal(Math.round(after.colWidths.reduce(function (a, b) { return a + b; }, 0) * 100) / 100,
      100, 'the widths sum to 100, so the table can never overflow its page');
    assert.equal(after.colWidths[0] > 100 / 3, true, 'the dragged column grew');
    assert.equal(after.colWidths[1] < 100 / 3, true, 'and its neighbour paid for it');
    assert.equal(Math.round(after.colWidths[2] * 100) / 100, Math.round(100 / 3 * 100) / 100,
      'while the column beyond the boundary did not move');

    assert.deepEqual(after.rows, [['one', 'two', 'three'], ['a', 'b', 'c']],
      'not one cell of text was touched');
    assert.equal('merges' in after, false, 'and no merge was invented');

    // The colgroup is what the drag actually moved, so assert the DOM as well
    // as the store — a stored list the table does not render is not a resize.
    assert.deepEqual(await page.evaluate(COL_PCTS),
      after.colWidths.map(function (w) { return w + '%'; }),
      'the rendered <col> widths are the stored ones');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('⇔ auto width asks first, and Cancel keeps the widths', async () => {
    const page = await open('documentations.html', {
      db: seedDb({ docPages: [F.docPage('p-1', { title: 'Notes', blocks: [{
        id: 'b-1', type: 'table', rows: [['one', 'two'], ['a', 'b']], colWidths: [70, 30]
      }] })] }), hash: '?page=p-1' });
    await page.waitFor(function () {
      return Array.prototype.some.call(document.querySelectorAll('button'),
        function (b) { return /auto width/.test(b.textContent) && !b.disabled; });
    }, { message: 'the enabled auto-width button' });

    assert.deepEqual(await page.evaluate(COL_PCTS), ['70%', '30%'],
      'the stored widths are what the table is drawn at');

    const before = await rawDb(page);
    await answering(page, false, CLICK_SOON_TEXT, ['⇔ auto width']);
    assert.equal(await rawDb(page), before,
      'Cancel left track_db byte-identical — a prompt that clears anyway is worse than none');

    await answering(page, true, CLICK_SOON_TEXT, ['⇔ auto width']);
    const after = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var b = (((db.slots || [])[0] || {}).docPages || [])[0].blocks[0];
      return b.colWidths ? false : b;
    }, { message: 'the reset reaching track_db' });

    assert.deepEqual(Object.keys(after), ['id', 'type', 'rows'],
      'clearing DELETES the key rather than storing an empty list');
    assert.deepEqual(after.rows, [['one', 'two'], ['a', 'b']], 'and no cell text went with it');
    assert.deepEqual(await page.evaluate(COL_PCTS), [null, null],
      'the columns are back to equal shares');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a long cell value WRAPS rather than being clipped', async () => {
    // The reason the cell is a textarea and not an <input>. An input is
    // single-line by construction, so anything longer than its column was cut
    // off on screen AND in the printed PDF — this page has no separate print
    // DOM, only @media print re-skinning the editor.
    const page = await open('documentations.html', {
      db: seedDb({ docPages: [F.docPage('p-1', { title: 'Notes', blocks: [{
        id: 'b-1', type: 'table',
        rows: [['Introduction to Medicine and the Health Sciences', 'x'], ['short', 'y']]
      }] })] }), hash: '?page=p-1' });

    const m = await page.waitFor(function () {
      var tds = document.querySelectorAll('.doc-table td');
      if (tds.length < 4) return false;
      var longEl = tds[0].querySelector('textarea');
      var shortEl = tds[2].querySelector('textarea');
      if (!longEl || !shortEl || !longEl.value) return false;
      // The auto-grow effect runs after mount; wait for it to have measured.
      if (longEl.clientHeight < 1) return false;
      return {
        hidden: longEl.scrollHeight - longEl.clientHeight,
        longH: tds[0].getBoundingClientRect().height,
        shortH: tds[2].getBoundingClientRect().height,
        value: longEl.value
      };
    }, { message: 'the table cells being measured' });

    assert.equal(m.value, 'Introduction to Medicine and the Health Sciences',
      'the whole value is in the cell, not a truncated copy of it');
    assert.equal(m.hidden <= 1, true,
      'nothing is hidden below the fold of the cell — the box grew to fit (' + m.hidden + 'px over)');
    assert.equal(m.longH > m.shortH, true,
      'so the wrapped row is TALLER than a single-line one (' + m.longH + ' vs ' + m.shortH + ')');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* ── moving a whole row or column ─────────────────────────────────────────

     Bands, not lines: a merged region travels as one piece and a plain line
     steps OVER one rather than into the middle of it. The offline cover is
     tests/doc-table-core.test.js; these exist to prove the page is wired to it,
     that `merges` and `colWidths` are remapped rather than left pointing at the
     old indices, and that a refusal writes nothing. */

  const clickCellAt = (page, cell) => page.evaluate(function (sel) {
    var ta = document.querySelector('.doc-table td[data-cell="' + sel + '"] textarea');
    if (!ta) return false;
    ta.click();
    return true;
  }, cell);

  const moveSeed = () => seedDb({
    docPages: [F.docPage('p-1', { title: 'Notes', blocks: [{
      id: 'b-1', type: 'table',
      rows: [['head', 'x'], ['tall', 'a'], ['', 'b'], ['last', 'z']],
      merges: [{ r: 1, c: 0, rs: 2, cs: 1 }]
    }] })]
  });

  await t.test('a row steps OVER a merged band, which moves as one piece', async () => {
    const page = await open('documentations.html', { db: moveSeed(), hash: '?page=p-1' });
    await page.waitFor(function () {
      return !!document.querySelector('.doc-table td[data-cell="3,0"] textarea');
    }, { message: 'the table' });

    // The last row is directly under a two-row merge. One click must put it
    // ABOVE the whole band, not between its two rows.
    assert.equal(await clickCellAt(page, '3,0'), true);
    await page.waitFor(function () {
      return Array.prototype.some.call(document.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === '↑ row' && !b.disabled; });
    }, { message: 'the ↑ row button becoming available' });

    await expectNoDialog(page, CLICK_SOON_TEXT, ['↑ row']);

    /* Wait for the write to LAND, not for the right answer to appear. Waiting on
       `rows[1][0] === 'last'` would make a wrong move time out instead of
       reporting itself, and a case that dies on its own waitFor proves the
       control is unreachable rather than wrong — AGENTS.md records that lesson
       three times over. */
    const seeded = JSON.stringify([['head', 'x'], ['tall', 'a'], ['', 'b'], ['last', 'z']]);
    const after = (await page.waitFor(function (was) {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var b = ((((db.slots || [])[0] || {}).docPages || [])[0] || {}).blocks[0];
      return b && JSON.stringify(b.rows) !== was ? b : false;
    }, { message: 'the move reaching track_db', args: [seeded] }));

    assert.deepEqual(after.rows, [['head', 'x'], ['last', 'z'], ['tall', 'a'], ['', 'b']],
      'the plain row jumped the WHOLE band rather than landing inside it');
    assert.deepEqual(after.merges, [{ r: 2, c: 0, rs: 2, cs: 1 }],
      'and the merge was REMAPPED to follow its own rows — the trap withRows would have left it at r:1');
    assert.equal(await page.evaluate(function () {
      var td = document.querySelector('.doc-table td[data-cell="2,0"]');
      return td && td.getAttribute('data-span');
    }), '2x1', 'the grid draws the band at its new home, still spanning two rows');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('pressing the same button twice moves the SAME row twice', async () => {
    /* The selection has to follow the line it just moved. Left pointing at the
       coordinate the move emptied, a second press moves whatever slid into it —
       so the first click does what you asked and the second undoes half of it,
       which is worse than the button not working at all. */
    const page = await open('documentations.html', { db: moveSeed(), hash: '?page=p-1' });
    await page.waitFor(function () {
      return !!document.querySelector('.doc-table td[data-cell="3,0"] textarea');
    }, { message: 'the table' });

    assert.equal(await clickCellAt(page, '3,0'), true);
    await page.waitFor(function () {
      return Array.prototype.some.call(document.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === '↑ row' && !b.disabled; });
    }, { message: 'the ↑ row button becoming available' });

    const rowsNow = () => page.evaluate(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      return ((((db.slots || [])[0] || {}).docPages || [])[0] || {}).blocks[0].rows;
    });

    await page.evaluate(CLICK_SOON_TEXT, '↑ row');
    await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var b = ((((db.slots || [])[0] || {}).docPages || [])[0] || {}).blocks[0];
      return b.rows[1][0] === 'last';
    }, { message: 'the first move landing' });

    await page.evaluate(CLICK_SOON_TEXT, '↑ row');
    await sleep(600);

    assert.deepEqual(await rowsNow(),
      [['last', 'z'], ['head', 'x'], ['tall', 'a'], ['', 'b']],
      'the second press moved `last` on up, not the row that had taken its place');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a column move carries its stored width with it', async () => {
    const page = await open('documentations.html', {
      db: seedDb({ docPages: [F.docPage('p-1', { title: 'Notes', blocks: [{
        id: 'b-1', type: 'table',
        rows: [['a', 'b', 'c'], ['d', 'e', 'f']],
        colWidths: [20, 30, 50]
      }] })] }), hash: '?page=p-1' });
    await page.waitFor(function () {
      return !!document.querySelector('.doc-table td[data-cell="0,0"] textarea');
    }, { message: 'the table' });

    assert.equal(await clickCellAt(page, '0,0'), true);
    await page.waitFor(function () {
      return Array.prototype.some.call(document.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === '→ col' && !b.disabled; });
    }, { message: 'the → col button becoming available' });

    await expectNoDialog(page, CLICK_SOON_TEXT, ['→ col']);

    const after = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var b = ((((db.slots || [])[0] || {}).docPages || [])[0] || {}).blocks[0];
      return b && b.rows[0][0] === 'b' ? b : false;
    }, { message: 'the column move reaching track_db' });

    assert.deepEqual(after.rows, [['b', 'a', 'c'], ['e', 'd', 'f']]);
    assert.deepEqual(after.colWidths, [30, 20, 50],
      'the width travelled with its column instead of staying at its old index');
    assert.deepEqual(await page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll('.doc-table col'),
        function (c) { return c.style.width; });
    }), ['30%', '20%', '50%'], 'and the drawn columns agree with what was stored');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('at the edge the move button is disabled, and clicking it writes nothing', async () => {
    const page = await open('documentations.html', { db: moveSeed(), hash: '?page=p-1' });
    await page.waitFor(function () {
      return !!document.querySelector('.doc-table td[data-cell="0,0"] textarea');
    }, { message: 'the table' });

    assert.equal(await clickCellAt(page, '0,0'), true);
    const state = await page.waitFor(function () {
      var by = {};
      Array.prototype.forEach.call(document.querySelectorAll('button'), function (b) {
        var t = b.textContent.trim();
        if (t === '↑ row' || t === '↓ row' || t === '← col') by[t] = { off: b.disabled, title: b.title };
      });
      return by['↑ row'] && by['↓ row'] && by['← col'] ? by : false;
    }, { message: 'the move buttons' });

    assert.equal(state['↑ row'].off, true, 'the top row cannot go up');
    assert.equal(state['↑ row'].title, 'This is already the first row.',
      'and the disabled button SAYS why rather than being discovered by clicking');
    assert.equal(state['← col'].off, true, 'nor the first column left');
    assert.equal(state['← col'].title, 'This is already the first column.');
    assert.equal(state['↓ row'].off, false, 'while the direction that IS available stays live');

    const before = await rawDb(page);
    await page.evaluate(CLICK_SOON_TEXT, '↑ row');
    await sleep(500);
    assert.equal(await rawDb(page), before,
      'clicking the disabled button anyway left track_db byte-identical');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a cell merged DOWNWARD is typable over its whole height', async () => {
    /* A rowSpan cell is as tall as the rows it covers, but the textarea inside
       it was only as tall as its own text — pinned to the top by `align-top`,
       with the rest of the cell dead: the <td> has no click handler, so a click
       down there focused nothing and did not even select the cell for the merge
       buttons. "I can only type in one row" was that, not a missing newline —
       Enter has always worked, there was just nowhere to aim. */
    const page = await open('documentations.html', {
      db: seedDb({ docPages: [F.docPage('p-1', { title: 'Notes', blocks: [{
        id: 'b-1', type: 'table',
        rows: [['tall', 'a'], ['', 'b'], ['', 'c']],
        merges: [{ r: 0, c: 0, rs: 3, cs: 1 }]
      }] })] }), hash: '?page=p-1' });
    await page.setViewport(1280, 900);

    const m = await page.waitFor(function () {
      var td = document.querySelector('.doc-table td[data-cell="0,0"]');
      var plain = document.querySelector('.doc-table td[data-cell="0,1"]');
      if (!td || !plain) return false;
      var ta = td.querySelector('textarea');
      if (!ta || ta.clientHeight < 1) return false;   // the auto-grow effect runs after mount
      var tr = td.getBoundingClientRect();
      // Four fifths of the way down the merged cell — well clear of the one
      // line of text at the top, and the exact place the complaint is about.
      var hit = document.elementFromPoint(Math.round(tr.left + tr.width / 2),
                                          Math.round(tr.top + tr.height * 0.8));
      return {
        span: td.getAttribute('data-span'),
        // clientHeight, not the bounding rect: the rect includes the cell's 1px
        // borders, and a tolerance wide enough to swallow those would also
        // swallow a genuinely short box.
        tdH: td.clientHeight,
        taH: Math.round(ta.getBoundingClientRect().height),
        plainH: Math.round(plain.getBoundingClientRect().height),
        hit: hit === ta ? 'self'
          : hit ? hit.tagName.toLowerCase() + (hit.className ? '.' + String(hit.className).trim().split(/\s+/).join('.') : '')
          : 'null'
      };
    }, { message: 'the merged cell being measured' });

    assert.equal(m.span, '3x1', 'precondition: the fixture really does span three rows');
    assert.equal(m.tdH > m.plainH * 2, true,
      'precondition: the merged cell is much taller than a plain one (' + m.tdH + ' vs ' + m.plainH + ')');

    assert.equal(m.tdH - m.taH <= 1, true,
      'the text box FILLS the merged cell rather than sitting one line tall at its top ('
      + m.taH + ' of ' + m.tdH + 'px)');
    assert.equal(m.hit, 'self',
      'so a click four fifths of the way down lands in that text box, not on dead space (hit ' + m.hit + ')');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a filled cell re-fits when a NEIGHBOURING row grows, and settles', async () => {
    /* The reason AutoTextarea's ResizeObserver admits height at all, and the
       case that has to hold for that to be safe. A rowSpan cell gets taller when
       a row it covers gets taller, which changes no WIDTH — so the original
       width-only gate would leave the dead space back the moment anyone typed in
       the cell beside it.

       The second half is the loop guard. fit() sets this box's height, which can
       change the parent's height, which is a resize: the comment in that file
       records an ungated observer taking the whole page down with "Maximum
       update depth exceeded". So the height is sampled twice, half a second
       apart, and must be the SAME number — a re-fit that keeps re-triggering
       itself is a height that never stops moving. */
    const page = await open('documentations.html', {
      db: seedDb({ docPages: [F.docPage('p-1', { title: 'Notes', blocks: [{
        id: 'b-1', type: 'table',
        rows: [['tall', 'a'], ['', 'b'], ['', 'c']],
        merges: [{ r: 0, c: 0, rs: 3, cs: 1 }]
      }] })] }), hash: '?page=p-1' });
    await page.setViewport(1280, 900);

    await page.waitFor(function () {
      var ta = document.querySelector('.doc-table td[data-cell="0,0"] textarea');
      return !!ta && ta.clientHeight > 40;
    }, { message: 'the merged cell filling on first paint' });

    const before = await page.evaluate(function () {
      return document.querySelector('.doc-table td[data-cell="0,0"]').clientHeight;
    });

    // Type a paragraph into the plain cell beside it, so THAT row grows.
    await page.evaluate(function (setterSrc, value) {
      var set = new Function('return ' + setterSrc)();
      set(document.querySelector('.doc-table td[data-cell="0,1"] textarea'), value);
      return true;
    }, SET_REACT_INPUT, 'one two three four five six seven eight nine ten eleven twelve '.repeat(4));

    const grown = await page.waitFor(function () {
      var td = document.querySelector('.doc-table td[data-cell="0,0"]');
      var ta = td.querySelector('textarea');
      var gap = td.clientHeight - Math.round(ta.getBoundingClientRect().height);
      return gap <= 1 && td.clientHeight > 40 ? { tdH: td.clientHeight, gap: gap } : false;
    }, { message: 'the merged cell re-filling after the neighbour grew' });

    assert.equal(grown.tdH > before, true,
      'precondition: the neighbour really did make the merged cell taller ('
      + before + ' -> ' + grown.tdH + 'px)');
    assert.equal(grown.gap <= 1, true,
      'the filled box followed it rather than leaving the dead space back (' + grown.gap + 'px short)');

    await sleep(500);
    const settled = await page.evaluate(function () {
      var td = document.querySelector('.doc-table td[data-cell="0,0"]');
      return { tdH: td.clientHeight, taH: Math.round(td.querySelector('textarea').getBoundingClientRect().height) };
    });
    assert.equal(settled.tdH, grown.tdH,
      'and it SETTLED — a cell still growing half a second later is fit() re-triggering itself ('
      + grown.tdH + ' -> ' + settled.tdH + 'px)');
    assert.equal(settled.tdH - settled.taH <= 1, true, 'still filled once settled');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });


  /* ── per-cell alignment, and configurable headers ─────────────────────────
     NOTES Proposal 16, both halves in one change so the paste spec migrated
     once. The rules pinned here:

     - `align` is a PARALLEL LIST keyed by coordinate, like `merges` — `rows`
       stays [[string]], and toggling the last alignment off DELETES the key.
     - `head` / `headCol` are stored only away from their defaults (1 and 0),
       so a table nobody has touched keeps Object.keys ['id','type','rows'] —
       the existing no-merges paste case is the guard for that half and now
       guards all four fields at once.
     - The editor grid and the paste preview draw headers and alignment from
       ONE definition (isHeaderCell / alignAt through TableGrid); the pasted
       text carries head directives and a markdown alignment separator row.
     - None of these controls asks a question: the cell text is untouched and
       the same click restores what it removed, so they sit beside merge,
       unmerge and a line move in the destructive-control rule's exemptions. */

  await t.test('aligning a cell stores the coordinate, and the same click takes it back out', async () => {
    // Merges AND widths in the seed, so the case also proves withAlign spreads
    // rather than rebuilding — the Preserve Unrelated Fields rule at block level.
    const page = await open('documentations.html', {
      db: seedDb({ docPages: [F.docPage('p-1', {
        title: 'Notes',
        blocks: [{ id: 'b-1', type: 'table',
          rows: [['H1', 'H2'], ['a', 'b'], ['c', 'd']],
          merges: [{ r: 1, c: 0, rs: 2, cs: 1 }], colWidths: [40, 60] }]
      })] }), hash: '?page=p-1' });
    await page.waitFor(function () { return !!document.querySelector('.doc-table td textarea'); },
      { message: 'the table' });
    const before = page.dialogs.length;

    await page.evaluate(function () {
      document.querySelector('.doc-table td[data-cell="1,1"] textarea').click();
    });
    await page.waitFor(function () {
      return Array.prototype.some.call(document.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'right' && !b.disabled; });
    }, { message: 'the align buttons arming on the selected cell' });
    await page.evaluate(CLICK_SOON_TEXT, 'right');

    const stored = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var b = ((((db.slots || [])[0] || {}).docPages || [])[0] || {}).blocks[0];
      return (b && b.align) ? b : false;
    }, { message: 'the alignment reaching track_db' });
    assert.deepEqual(stored.align, [{ r: 1, c: 1, h: 'right' }],
      'one entry, keyed by coordinate — rows was not promoted to objects');
    assert.deepEqual(stored.rows, [['H1', 'H2'], ['a', 'b'], ['c', 'd']],
      'the cell text is untouched');
    assert.deepEqual(stored.merges, [{ r: 1, c: 0, rs: 2, cs: 1 }],
      'and the merge survived the write');
    assert.deepEqual(stored.colWidths, [40, 60], 'as did the widths');

    assert.match(await page.evaluate(function () {
      return document.querySelector('.doc-table td[data-cell="1,1"] textarea').className;
    }), /text-right/, 'the drawn cell follows the stored entry');

    // The same button, pressed again, clears the axis — and clearing the last
    // axis DELETES the key rather than storing [].
    await page.evaluate(CLICK_SOON_TEXT, 'right');
    await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var b = ((((db.slots || [])[0] || {}).docPages || [])[0] || {}).blocks[0];
      return b && !('align' in b);
    }, { message: 'the align key being deleted, not emptied' });

    assert.equal(page.dialogs.length, before,
      'alignment asks nothing — the text is untouched and the click restores itself');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('the header count draws N rows and a left column, and 1/0 is stored as ABSENCE', async () => {
    const page = await open('documentations.html', {
      db: seedDb({ docPages: [F.docPage('p-1', {
        title: 'Notes',
        blocks: [{ id: 'b-1', type: 'table', rows: [['H1', 'H2'], ['a', 'b'], ['c', 'd']] }]
      })] }), hash: '?page=p-1' });
    await page.waitFor(function () { return !!document.querySelector('.doc-table td textarea'); },
      { message: 'the table' });
    const before = page.dialogs.length;

    const drawnHeads = () => page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll('.doc-table td'),
        function (td) { return td.getAttribute('data-head'); }).join('');
    });
    assert.equal(await drawnHeads(), '110000',
      'absence means what the table always did — row 0 is the header');

    // 1 -> 2: both top rows draw as headers, and head: 2 is a real stored value.
    await page.evaluate(CLICK_SOON_TEXT, 'header rows: 1');
    const at2 = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var b = ((((db.slots || [])[0] || {}).docPages || [])[0] || {}).blocks[0];
      return (b && b.head === 2) ? b : false;
    }, { message: 'head: 2 reaching track_db' });
    assert.equal('headCol' in at2, false, 'the other axis was left alone');
    assert.equal(await drawnHeads(), '111100', 'and both rows draw bold');

    // 2 -> 3 -> 0 -> 1: the cycle wraps, head: 0 really means NO header, and
    // arriving back at 1 DELETES the key rather than storing the default.
    await page.evaluate(CLICK_SOON_TEXT, 'header rows: 2');
    await page.evaluate(CLICK_SOON_TEXT, 'header rows: 3');
    await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var b = ((((db.slots || [])[0] || {}).docPages || [])[0] || {}).blocks[0];
      return b && b.head === 0;
    }, { message: 'head: 0 reaching track_db' });
    assert.equal(await drawnHeads(), '000000', 'head: 0 draws no header at all');

    await page.evaluate(CLICK_SOON_TEXT, 'header rows: 0');
    await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var b = ((((db.slots || [])[0] || {}).docPages || [])[0] || {}).blocks[0];
      return b && !('head' in b);
    }, { message: 'head: 1 being stored as absence — the key deleted' });

    // The OTHER axis: one header column, drawn down the left.
    await page.evaluate(CLICK_SOON_TEXT, 'header cols: 0');
    await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var b = ((((db.slots || [])[0] || {}).docPages || [])[0] || {}).blocks[0];
      return b && b.headCol === 1;
    }, { message: 'headCol: 1 reaching track_db' });
    assert.equal(await drawnHeads(), '111010', 'row 0 plus the left column');

    assert.equal(page.dialogs.length, before, 'the header cycle asks nothing');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a pasted head directive and alignment row reach track_db, and the preview drew them', async () => {
    const page = await open('documentations.html', {
      db: seedDb({ docPages: [F.docPage('p-1', { title: 'Notes', blocks: [] })] }), hash: '?page=p-1' });

    await openPasteModal(page, [
      '::: track-table',
      'head: 2',
      '| Region | Q1 |',
      '|:-------|---:|',
      '| North  | 50 |',
      '| South  | 45 |',
      ':::'
    ].join('\n'));
    await page.waitFor(function () { return !!document.querySelector('[data-paste-table-preview]'); },
      { message: 'the parsed preview' });

    // The preview must ALREADY draw both — it renders the same block Insert
    // stores, which is the whole reason blockFromParse has one definition.
    assert.equal(await page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll('[data-paste-table-preview] td'),
        function (td) { return td.getAttribute('data-head') + ':' + td.getAttribute('data-align'); }).join(' ');
    }), '1:left,- 1:right,- 1:left,- 1:right,- 0:left,- 0:right,-',
      'two header rows, a left column and a right column, before anything is stored');

    await clickInsert(page);
    const blocks = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var p = (((db.slots || [])[0] || {}).docPages || [])[0];
      return (p && p.blocks.length) ? p.blocks : false;
    }, { message: 'the table reaching track_db' });

    assert.equal(blocks[0].head, 2, 'the directive was stored');
    assert.equal('headCol' in blocks[0], false, 'a directive not given is not stored');
    assert.deepEqual(blocks[0].align, [
      { r: 0, c: 0, h: 'left' }, { r: 0, c: 1, h: 'right' },
      { r: 1, c: 0, h: 'left' }, { r: 1, c: 1, h: 'right' },
      { r: 2, c: 0, h: 'left' }, { r: 2, c: 1, h: 'right' }
    ], 'the separator row expanded to the per-cell field, one entry per drawn cell');
    assert.deepEqual(blocks[0].rows, [['Region', 'Q1'], ['North', '50'], ['South', '45']],
      'and neither line was stored as data');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('removing a storage tag asks, and Cancel keeps the pair', async () => {
    const page = await open('true-storage.html', { db: tagSeed(), hash: '?storage=ts-1' });
    await page.waitFor(function () { return !!document.querySelector('[data-tag-remove="tg-1"]'); },
      { message: 'the tag remove button' });

    await answering(page, false, CLICK_SOON_SEL, ['[data-tag-remove="tg-1"]']);
    assert.deepEqual((await page.evaluate(STORAGE_BY_ID, 'ts-1')).tags,
      [{ id: 'tg-1', dumpId: 'd-1', mmId: 10 }],
      'Cancel left the (dump, MM) pair tagged');

    await answering(page, true, CLICK_SOON_SEL, ['[data-tag-remove="tg-1"]']);
    assert.deepEqual(await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var s = (((db.slots || [])[0] || {}).trueStorages || [])[0];
      return (s && s.tags.length === 0) ? s.tags : false;
    }, { message: 'confirming still removes the tag' }), []);

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('clearing the one link asks, and Cancel keeps the key', async () => {
    const page = await open('true-storage.html', {
      db: tagSeed({
        trueStorages: [
          F.trueStorage('ts-1', 'Storage A', {
            tags: [F.storageTag('tg-1', 'd-1', 10)],
            link: { label: 'Paper', url: 'https://example.com/a' }
          })
        ]
      }),
      hash: '?storage=ts-1'
    });
    const openEditor = async () => {
      await page.waitFor(CLICK_SOON_TEXT, { args: ['edit'], message: 'the link edit toggle' });
      await page.waitFor(function () { return !!document.querySelector('input[placeholder="url"]'); },
        { message: 'the link form' });
    };

    await openEditor();
    await answering(page, false, CLICK_SOON_TEXT, ['clear']);
    assert.deepEqual((await page.evaluate(STORAGE_BY_ID, 'ts-1')).link,
      { label: 'Paper', url: 'https://example.com/a' }, 'Cancel left the link untouched');

    await openEditor();
    await answering(page, true, CLICK_SOON_TEXT, ['clear']);
    // Still the KEY that goes, not its value — confirming must not turn the
    // guard into a writer of ''.
    const cleared = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var s = (((db.slots || [])[0] || {}).trueStorages || [])[0];
      return Object.prototype.hasOwnProperty.call(s, 'link') ? false : s;
    }, { message: 'confirming deleting the link key' });
    assert.equal('link' in cleared, false);
    assert.deepEqual(cleared.tags, [{ id: 'tg-1', dumpId: 'd-1', mmId: 10 }], 'the tags survived');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('untagging from KS02 asks, and Cancel leaves trueStorages byte-identical', async () => {
    const page = await open('sir-ks02.html', { db: tagSeed(), hash: withQuery('?dump=d-1', '#ks03') });
    await page.waitFor(function () { return !!document.querySelector('[data-storage-untag="ts-1"]'); },
      { message: 'the storage chip untag button' });

    const before = await page.evaluate(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      return JSON.stringify((((db.slots || [])[0] || {}).trueStorages) || null);
    });

    // This is the page's ONE foreign write: it reaches track_db immediately
    // through _mutateSlotKey rather than via the autosave snapshot, so the
    // prompt has to gate the call, not a later state flush.
    await answering(page, false, CLICK_SOON_SEL, ['[data-storage-untag="ts-1"]']);
    assert.equal(await page.evaluate(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      return JSON.stringify((((db.slots || [])[0] || {}).trueStorages) || null);
    }), before, 'Cancel wrote nothing at all to the key KS02 does not own');

    await answering(page, true, CLICK_SOON_SEL, ['[data-storage-untag="ts-1"]']);
    assert.deepEqual(await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var s = (((db.slots || [])[0] || {}).trueStorages || [])[0];
      return (s && s.tags.length === 0) ? s.tags : false;
    }, { message: 'confirming still untags' }), []);

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* The SOURCE DUMP copy on True Storage keeps KS02's prompts exactly: the
     styled ConfirmDialog for its four deletes (it is a copy of that page, and
     page.rejectDialogs cannot answer a DOM modal, so CANCEL and CONFIRM are
     clicked), and the native confirm for untagging a storage chip. */
  const DIALOG_BUTTON = function (label) {
    var b = Array.prototype.find.call(document.querySelectorAll('.fixed button'),
      function (x) { return x.textContent.trim() === label; });
    if (!b) return false;
    b.click();
    return true;
  };

  await t.test('SOURCE DUMP (True Storage): deleting a title asks; CANCEL keeps every byte, CONFIRM takes its subtree', async () => {
    const page = await open('true-storage.html', {
      db: tagSeed({ sourceDumps: [
        F.dump('d-1', '2026-03-08', { mmLinks: [F.dumpLink(90, 10), F.dumpLink(91, 11)] }),
        F.dump('d-2', '2026-03-09'),
        F.dump('d-3', '2026-03-10', { parentId: 'd-2', mmLinks: [F.dumpLink(92, 10)] })
      ] }),
      hash: '#sourcedump'
    });
    await page.waitFor(function () { return !!document.querySelector('[data-dump-delete="d-2"]'); },
      { message: 'the delete button on a title with a child' });
    const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });

    await page.evaluate(CLICK_SEL, '[data-dump-delete="d-2"]');
    await page.waitFor(DIALOG_BUTTON, { args: ['CANCEL'], message: 'the delete prompt, answered CANCEL' });
    await sleep(300);
    assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }), before,
      'CANCEL wrote nothing at all');

    await page.evaluate(CLICK_SEL, '[data-dump-delete="d-2"]');
    await page.waitFor(DIALOG_BUTTON, { args: ['CONFIRM'], message: 'the delete prompt, answered CONFIRM' });
    const left = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var ids = ((((db.slots || [])[0] || {}).sourceDumps) || []).map(function (d) { return d.id; });
      return ids.indexOf('d-2') < 0 ? ids : false;
    }, { message: 'confirming deleting the title' });
    assert.deepEqual(left, ['d-1'], 'the title and its child went; the other title stayed');
    assert.deepEqual((await page.evaluate(STORAGE_BY_ID, 'ts-1')).tags, [{ id: 'tg-1', dumpId: 'd-1', mmId: 10 }],
      'no storage tag was touched');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('SOURCE DUMP (True Storage): removing an MM section asks; CANCEL keeps it, CONFIRM leaves tags alone', async () => {
    const page = await open('true-storage.html', { db: tagSeed(), hash: withQuery('?dump=d-1', '#sourcedump') });
    await page.waitFor(function () { return !!document.querySelector('[data-dump-mm="10"]'); }, { message: 'the leaf card' });
    const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });

    assert.equal(await page.evaluate(CLICK_IN_CARD, 10, 'remove'), true, 'the remove button');
    await page.waitFor(DIALOG_BUTTON, { args: ['CANCEL'], message: 'the remove prompt, answered CANCEL' });
    await sleep(300);
    assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }), before,
      'CANCEL wrote nothing at all');

    assert.equal(await page.evaluate(CLICK_IN_CARD, 10, 'remove'), true, 'the remove button again');
    await page.waitFor(DIALOG_BUTTON, { args: ['CONFIRM'], message: 'the remove prompt, answered CONFIRM' });
    const links = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = ((((db.slots || [])[0] || {}).sourceDumps) || [])[0];
      return (d && d.mmLinks.length === 1) ? d.mmLinks.map(function (l) { return l.mmId; }) : false;
    }, { message: 'confirming removing the section' });
    assert.deepEqual(links, [11]);
    // The tag on (d-1, 10) now names a pair that no longer resolves. It stays,
    // and reads "source removed" — deleting it would lose the user's filing.
    assert.deepEqual((await page.evaluate(STORAGE_BY_ID, 'ts-1')).tags, [{ id: 'tg-1', dumpId: 'd-1', mmId: 10 }]);
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('SOURCE DUMP (True Storage): untagging a chip asks, and Cancel leaves trueStorages byte-identical', async () => {
    const page = await open('true-storage.html', { db: tagSeed(), hash: withQuery('?dump=d-1', '#sourcedump') });
    await page.waitFor(function () { return !!document.querySelector('[data-storage-untag="ts-1"]'); },
      { message: 'the chip untag button' });
    const before = await page.evaluate(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      return JSON.stringify((((db.slots || [])[0] || {}).trueStorages) || null);
    });

    await answering(page, false, CLICK_SOON_SEL, ['[data-storage-untag="ts-1"]']);
    await sleep(300);
    assert.equal(await page.evaluate(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      return JSON.stringify((((db.slots || [])[0] || {}).trueStorages) || null);
    }), before, 'Cancel wrote nothing');

    await answering(page, true, CLICK_SOON_SEL, ['[data-storage-untag="ts-1"]']);
    assert.deepEqual(await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var s = (((db.slots || [])[0] || {}).trueStorages || [])[0];
      return (s && s.tags.length === 0) ? s.tags : false;
    }, { message: 'confirming still untags' }), []);
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('deleting a scheduled-action day asks, and Cancel keeps the entry', async () => {
    const page = await open('progress.html', { db: seedDb(), hash: '#actions' });
    // The chip is `03-10 ×` for saEntry e-1. Match the row, not a bare '×',
    // which appears all over this page.
    const CLICK_CHIP_X = function () {
      var span = Array.prototype.find.call(document.querySelectorAll('span'),
        function (s) {
          return /^\s*03-10\s*$/.test(s.textContent) && s.parentElement &&
            s.parentElement.querySelector('button');
        });
      if (!span) return false;
      var b = span.parentElement.querySelector('button');
      setTimeout(function () { b.click(); }, 0);
      return true;
    };
    // `expanded` starts {}, so the day chips are behind the row's ▼ toggle.
    await page.waitFor(function () {
      var b = Array.prototype.find.call(document.querySelectorAll('button'),
        function (x) { return x.textContent.trim() === '▼'; });
      if (!b) return false;
      b.click();
      return true;
    }, { message: 'the action row expand toggle' });
    await page.waitFor(function () {
      return Array.prototype.some.call(document.querySelectorAll('span'),
        function (s) { return /^\s*03-10\s*$/.test(s.textContent); });
    }, { message: 'the scheduled-action day chip' });

    await answering(page, false, CLICK_CHIP_X);
    assert.deepEqual(await page.evaluate(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      return (((db.slots || [])[0] || {}).saEntries || []).map(function (e) { return e.id; });
    }), ['e-1'], 'Cancel kept the entry, with its done tick and notes');

    await answering(page, true, CLICK_CHIP_X);
    assert.deepEqual(await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var e = ((db.slots || [])[0] || {}).saEntries || [];
      return e.length === 0 ? e : false;
    }, { message: 'confirming still deletes the entry' }), []);

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('clearing every caution day asks, and Cancel keeps them', async () => {
    const picks = [dayFromToday(-4), dayFromToday(-1)];
    const { db, due } = cautionDb({ cautionDates: picks });
    const page = await openDlPopup({ db, due });

    await answering(page, false, CLICK_SOON_TEXT, ['clear all']);
    const kept = await storedDeadline(page);
    assert.deepEqual(kept.cautionDates, picks, 'Cancel left every day the user chose');
    assert.equal(kept.date, due, 'and clearing never touches the due day either way');

    await answering(page, true, CLICK_SOON_TEXT, ['clear all']);
    assert.deepEqual((await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = (((db.slots || [])[0] || {}).deadlines || [])[0];
      return d && (d.cautionDates || []).length === 0 ? d : false;
    }, { message: 'confirming still clears' })).cautionDates, []);

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a detach chip is deliberately left unconfirmed', async () => {
    /* The scope line, pinned. `⊗` severs one graph edge and the connections
       picker puts it back in seconds; prompting there would tax a chip people
       use constantly to buy nothing. If a later change makes every control
       uniform, this fails and the trade-off gets re-decided on purpose. */
    const page = await open('true-storage.html', { db: seedDb(), hash: '?storage=ts-2' });
    await page.waitFor(function () {
      return Array.prototype.some.call(document.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === '⊗'; });
    }, { message: 'the detach chip on a storage with a parent' });

    await expectNoDialog(page, CLICK_SOON_TEXT, ['⊗']);
    assert.deepEqual(await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var s = (((db.slots || [])[0] || {}).trueStorages || [])
        .filter(function (x) { return x.id === 'ts-2'; })[0];
      return (s && s.parentIds.length === 0) ? s.parentIds : false;
    }, { message: 'the detach landing immediately, with no prompt' }), []);

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('the milestone-checkpoint chip raises exactly one dialog', async () => {
    /* A GUARD, not a fail-first case: it passes on both sides by design. Before
       the change the single prompt lived at this call site; after it, inside
       removeMilestoneEntry, which the two MilestoneBar tooltips also reach.
       It fails only if the handler-level prompt is added while the call-site
       one is left behind — the one regression this refactor actually risks, and
       one the user meets as two prompts for a single click. */
    const page = await open('progress.html', {
      db: seedDb({
        goals: [F.task('g-1', {
          title: 'Root goal',
          toLearn: [10],
          milestones: [F.milestone('ms-1', '2026-03-01', '2026-03-10')],
          mmTargets: { 10: { milestones: [{ milestoneId: 'ms-1', stage: 'CE', level: 3 }] } }
        })]
      })
    });

    await page.waitFor(function () {
      var b = Array.prototype.find.call(document.querySelectorAll('button'),
        function (x) { return x.textContent.trim() === 'PROGRESS'; });
      if (!b) return false;
      b.click();
      return true;
    }, { message: 'the PROGRESS tab' });

    /* Two elements carry the milestone title — the MILESTONES section row and
       the chip. Only the chip is `inline-flex`, and its × is behind hover
       state, which React delegates from mouseover. Re-dispatching until the
       button exists keeps this off a fixed sleep. */
    const HOVER_CHIP = function () {
      var c = Array.prototype.find.call(document.querySelectorAll('[title="Milestone ms-1"]'),
        function (e) { return /inline-flex/.test((e.className || '').toString()); });
      if (!c) return false;
      c.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      return !!c.querySelector('button');
    };
    const CLICK_CHIP_X = function () {
      var c = Array.prototype.find.call(document.querySelectorAll('[title="Milestone ms-1"]'),
        function (e) { return /inline-flex/.test((e.className || '').toString()); });
      var b = c && c.querySelector('button');
      if (!b) return false;
      setTimeout(function () { b.click(); }, 0);
      return true;
    };
    await page.waitFor(HOVER_CHIP, { message: 'the checkpoint chip’s × after hover' });

    const before = page.dialogs.length;
    page.rejectDialogs = true;
    try {
      assert.equal(await page.evaluate(CLICK_CHIP_X), true, 'the chip × exists');

      const until = Date.now() + 10000;
      while (page.dialogs.length === before && Date.now() < until) await sleep(30);
      assert.ok(page.dialogs.length > before, 'the chip asked before writing');
      // Long enough that a second prompt, if one is raised, is counted.
      await sleep(800);
    } finally {
      page.rejectDialogs = false;
    }

    assert.equal(page.dialogs.length, before + 1,
      'one click, exactly one prompt — a call-site confirm left beside the handler’s makes two');
    assert.deepEqual(await page.evaluate(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var g = (((db.slots || [])[0] || {}).goals || [])[0];
      return ((((g || {}).mmTargets || {})['10'] || {}).milestones || [])
        .map(function (e) { return e.milestoneId; });
    }), ['ms-1'], 'and Cancel kept the checkpoint');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* ── 10. day-note and deadline schedule blocks ──────────────────────────

     Since 2026-10-21 a note or a deadline is on the hour grid ONLY through its
     blocks: the `parts` ★ Forced adds, one per pick, on the day the panel was
     opened from. An item with no parts has no block. Until then every item
     had one automatically, and the cases that pinned that are inverted here
     rather than deleted. `blockOff`, `blockDuration`, `blockTime` and
     `blockDate` are legacy — read, never written — and each absence is still
     the default.

     The rules have ONE definition, TrackCalendar.blockDays and friends in
     calendar-core.js, with a second copy in progress.html because that page
     does not load it. So a block is asserted on the Progress grid, on the
     Home calendar and inside a Documentations block SEPARATELY — a rule
     forgotten at one of several surfaces is this repository's recurring bug,
     and a single assertion would let the forgotten one hide behind a passing
     sibling.                                                              */

  // today, on the LOCAL calendar — the grid is local-day and so must this be
  const TODAY = (() => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
      '-' + String(d.getDate()).padStart(2, '0');
  })();

  /* CLICK_SEL is declared once, above with the confirm-dialog helpers. */
  const READ_ITEM = function (key, id) {
    var db = JSON.parse(localStorage.getItem('track_db') || '{}');
    var s = (db.slots || [])[0] || {};
    return ((s[key] || []).filter(function (x) { return x.id === id; })[0]) || null;
  };
  /* The stored item once its parts list has reached length `n` — a WRITE
     landing, not the answer a case hopes for, which is asserted afterwards. */
  const ITEM_WITH_PARTS = function (key, id, n) {
    var db = JSON.parse(localStorage.getItem('track_db') || '{}');
    var s = (db.slots || [])[0] || {};
    var x = (s[key] || []).filter(function (r) { return r.id === id; })[0];
    return (x && (Array.isArray(x.parts) ? x.parts.length : 0) === n) ? x : false;
  };
  /* `day` is the COLUMN the block is drawn in, and reading it is not optional
     for anything about a block's day: the week view has all seven columns in
     the DOM at once, so a block drawn on the wrong day still appears in this
     list with the right id, time and height. A case that checks only those
     passes against a blockDay that ignores blockDate entirely — which is
     exactly what the doctored-baseline run caught. */
  const BLOCKS = function () {
    return Array.prototype.map.call(document.querySelectorAll('[data-block-kind]'), function (e) {
      return {
        kind: e.getAttribute('data-block-kind'), id: e.getAttribute('data-block-id'),
        day: e.getAttribute('data-block-day'), top: e.style.top, height: e.style.height
      };
    });
  };
  const mountSchedule = async page => {
    await page.waitFor(function () { var e = document.querySelector('#root'); return !!e && e.children.length > 0; },
      { message: 'progress.html mounting' });
    await page.waitFor(function () { return !!document.querySelector('[data-dln-open]'); },
      { message: 'the schedule timeline day headers' });
  };
  const openDlnPanel = async (page, ds) => {
    await page.evaluate(CLICK_SEL, '[data-dln-open="' + ds + '"]');
    await page.waitFor(function () { return !!document.querySelector('[data-dln-panel]'); }, { message: 'the day-notes panel' });
  };
  // What a ★ Forced pick on the item's OWN day stores: an id, and nothing a
  // reader could mistake for a choice — no title, no time, no length.
  const BLOCK = { id: 'b' };
  // ★ Forced opened on `ds`, then the row for `key` ('<kind>:<id>') picked.
  const pickForced = async (page, ds, key) => {
    await openDlnPanel(page, ds);
    await page.waitFor(function (k) { return !!document.querySelector('[data-dln-add="' + k + '"]'); },
      { args: [key], message: 'the ★ Forced row for ' + key });
    await page.evaluate(CLICK_SEL, '[data-dln-add="' + key + '"]');
  };

  await t.test('PROGRESS: an item with no parts has no block, and nothing is written for it', async () => {
    /* The heart of the change, on the first of the three surfaces. Every item
       stored before 2026-10-21 has no parts, and it must leave the grid
       WITHOUT a byte being written to it — while one that was added stays. */
    const db = seedDb({
      calendarNotes: [
        F.calNote('n-timed', TODAY, { title: 'Timed marker note', time: '14:30' }),
        F.calNote('n-bare', TODAY, { title: 'Untimed note' }),
        F.calNote('n-added', TODAY, { title: 'Added note', time: '10:00', parts: [BLOCK] })
      ],
      deadlines: [F.deadline('d-bare', TODAY, { cautionDates: [], time: '17:00', title: 'Bare deadline' })]
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    await mountSchedule(page);
    // the block that SHOULD render first, so an empty grid is a finding and
    // not a slow mount
    await page.waitFor(function () { return !!document.querySelector('[data-block-id="n-added:b"]'); },
      { message: 'the added note\'s block' });
    const blocks = await page.evaluate(BLOCKS);
    assert.deepEqual(blocks.map(b => b.id), ['n-added:b'], 'only the item that was added is on the grid');
    assert.equal(blocks[0].day, TODAY);
    assert.equal(blocks[0].top, 10 * 64 + 'px', 'starting at its note\'s time');

    // "show both, always": the marker and the due line were never the block
    assert.equal(await page.evaluate(function () {
      return Array.prototype.some.call(document.querySelectorAll('#root span'), function (e) {
        return /bg-fuchsia/.test(e.className || '') && e.textContent.indexOf('Timed marker note') >= 0;
      });
    }), true, 'the timed note still renders as its point marker');
    assert.equal(await page.evaluate(function () {
      return document.body.textContent.indexOf('Bare deadline') >= 0;
    }), true, 'and the deadline still draws its due line');

    // and none of it was written
    const stored = await page.evaluate(READ_ITEM, 'deadlines', 'd-bare');
    for (const k of ['parts', 'blockOff', 'blockDuration', 'blockDate', 'blockTime']) {
      assert.equal(k in stored, false, k + ' was not written');
    }
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a deadline block ends at the due time and a note block starts at its time', async () => {
    const db = seedDb({
      calendarNotes: [F.calNote('n-s', TODAY, { title: 'Scheduled note', time: '09:00', blockDuration: 90, parts: [BLOCK] })],
      deadlines: [F.deadline('d-p', TODAY, { cautionDates: [], time: '20:00', title: 'Prep', blockDuration: 60, parts: [BLOCK] })]
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    await mountSchedule(page);
    const blocks = await page.evaluate(BLOCKS);
    const byId = Object.fromEntries(blocks.map(b => [b.id, b]));

    // default timeline zoom is 64px/hour, so an hour is 64px
    assert.ok(byId['n-s:b'], 'the note has a block');
    assert.equal(byId['n-s:b'].top, 9 * 64 + 'px', 'a note block STARTS at the note time');
    assert.equal(byId['n-s:b'].height, 90 / 60 * 64 + 'px', 'at the length the item remembers');
    assert.ok(byId['d-p:b'], 'the deadline has a block');
    assert.equal(byId['d-p:b'].top, 19 * 64 + 'px', 'a deadline block ENDS at the due time');
    assert.equal(byId['d-p:b'].height, 64 + 'px');

    // the marker stays: scheduling something never takes away the way it was
    // already visible
    assert.equal(await page.evaluate(function () {
      return Array.prototype.some.call(document.querySelectorAll('#root span'), function (e) {
        return /bg-fuchsia/.test(e.className || '') && e.textContent.indexOf('Scheduled note') >= 0;
      });
    }), true, 'a scheduled note keeps its marker AND its block');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a midnight-clipped run-up keeps its end on the due time', async () => {
    const db = seedDb({
      deadlines: [F.deadline('d-e', TODAY, { cautionDates: [], time: '00:30', title: 'Early', blockDuration: 60, parts: [BLOCK] })]
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    await mountSchedule(page);
    const b = (await page.evaluate(BLOCKS)).find(x => x.id === 'd-e:b');
    assert.ok(b, 'the block is drawn');
    assert.equal(b.top, '0px', 'clipped at the top of the grid');
    assert.equal(b.height, 30 / 60 * 64 + 'px', 'and shortened so it still ends at 00:30');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('the fourth button lists everything in ONE flat chronological list', async () => {
    // No date grouping and no date toggle: the date is a read-out on each row.
    //
    // The two far-away days are AHEAD of the day the panel is opened on, and
    // that is not arbitrary: the panel lists nothing from an earlier day, so a
    // fixture on a fixed past date would leave this case asserting the order of
    // an empty list. It moved with the restriction rather than being weakened
    // by it — the list still has four rows spanning three days.
    const NEAR = dayFromToday(5), LATE = dayFromToday(9);
    const db = seedDb({
      calendarNotes: [
        F.calNote('n-today', TODAY, { title: 'Note today', time: '09:00' }),
        F.calNote('n-far', NEAR, { title: 'Note far away', time: '10:00' })
      ],
      deadlines: [
        F.deadline('d-far', LATE, { cautionDates: [],  time: '17:00', title: 'Deadline far away' }),
        F.deadline('d-early', NEAR, { cautionDates: [],  time: '08:00', title: 'Deadline same day, earlier' })
      ]
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    await mountSchedule(page);
    await openDlnPanel(page, TODAY);

    assert.equal(await page.evaluate(function () {
      return document.querySelectorAll('[data-dln-group]').length;
    }), 0, 'the date is no longer a group toggle');

    const dates = await page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll('[data-dln-date]'),
        function (e) { return e.getAttribute('data-dln-date') + '|' + e.textContent.trim(); });
    });
    // TODAY, then NEAR 08:00 (deadline) and NEAR 10:00 (note), then LATE
    assert.deepEqual(dates.map(x => x.split('|')[0]), ['n-today', 'd-early', 'n-far', 'd-far'],
      'one flat list, chronological by the item\'s own date and time');
    const earlyRow = dates.find(x => x.split('|')[0] === 'd-early') || '';
    assert.ok(new RegExp(NEAR + '\\s+08:00').test(earlyRow),
      'and each row shows its own date: ' + earlyRow);

    // the tabs still narrow it by kind
    await page.evaluate(CLICK_SEL, '[data-dln-tab="deadlines"]');
    await page.waitFor(function () {
      return document.querySelectorAll('[data-dln-date]').length === 2;
    }, { message: 'the Deadlines tab filtering' });
    assert.deepEqual(await page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll('[data-dln-date]'),
        function (e) { return e.getAttribute('data-dln-date'); });
    }), ['d-early', 'd-far'], 'the Deadlines tab drops both notes and keeps the order');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('PROGRESS: the panel lists nothing from a day BEFORE the one it was opened on', async () => {
    /* The panel is opened FROM a day in order to put work on it, so it looks
       forward from that day and never back. Two things are asserted that a
       plausible-looking list would not distinguish:

       - the cut is applied to BOTH kinds. Notes and deadlines are collected
         on separate lines, so a rule spelled beside one and forgotten beside
         the other still yields a shorter, sensible-looking list.
       - the cut is relative to the day CLICKED, not to today. Step 2 is the
         only thing that tells those apart: an implementation cutting against
         todayStr passes step 1 completely unchanged.                      */
    const PAST2 = dayFromToday(-2), PAST1 = dayFromToday(-1), SOON = dayFromToday(3);
    const db = seedDb({
      calendarNotes: [
        F.calNote('n-past', PAST2, { title: 'Note two days ago', time: '09:00' }),
        F.calNote('n-today', TODAY, { title: 'Note today', time: '09:00' })
      ],
      deadlines: [
        F.deadline('d-past', PAST1, { cautionDates: [], time: '17:00', title: 'Deadline yesterday' }),
        F.deadline('d-future', SOON, { cautionDates: [], time: '17:00', title: 'Deadline soon' })
      ]
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    await mountSchedule(page);
    const bytes = await page.evaluate(function () { return localStorage.getItem('track_db'); });
    const DLN_IDS = function () {
      return Array.prototype.map.call(document.querySelectorAll('[data-dln-date]'),
        function (e) { return e.getAttribute('data-dln-date'); });
    };

    // 1 — opened on TODAY: the clicked day's own item stays, earlier ones go
    await openDlnPanel(page, TODAY);
    assert.deepEqual(await page.evaluate(DLN_IDS), ['n-today', 'd-future'],
      'both earlier items are gone and the clicked day\'s own item is kept');
    assert.equal(await page.evaluate(function () {
      return !!document.querySelector('[data-dln-date="n-past"]');
    }), false, 'the earlier NOTE is absent');
    assert.equal(await page.evaluate(function () {
      return !!document.querySelector('[data-dln-date="d-past"]');
    }), false, 'the earlier DEADLINE is absent');

    // the tabs narrow the restricted set rather than reopening it
    await page.evaluate(CLICK_SEL, '[data-dln-tab="deadlines"]');
    await page.waitFor(function () {
      return document.querySelectorAll('[data-dln-date]').length === 1;
    }, { message: 'the Deadlines tab filtering' });
    assert.deepEqual(await page.evaluate(DLN_IDS), ['d-future'],
      'the Deadlines tab still cannot reach the earlier deadline');

    // 2 — the cut moves with the day CLICKED, not with today
    await page.evaluate(CLICK_SEL, '[data-dln-open="' + TODAY + '"]');
    await page.waitFor(function () { return !document.querySelector('[data-dln-panel]'); },
      { message: 'the panel closing' });
    await openDlnPanel(page, SOON);
    assert.deepEqual(await page.evaluate(DLN_IDS), ['d-future'],
      'opened three days out, TODAY\'s own note is behind the cut too');

    // 3 — with the whole slot behind the cutoff, the panel NAMES the day it
    // cut at. Opened from far enough out, a workspace full of work would
    // otherwise report itself empty, which is the worst thing this application
    // can appear to have done.
    const FAR = dayFromToday(5);
    await page.evaluate(CLICK_SEL, '[data-dln-open="' + SOON + '"]');
    await page.waitFor(function () { return !document.querySelector('[data-dln-panel]'); },
      { message: 'the panel closing again' });
    await openDlnPanel(page, FAR);
    assert.deepEqual(await page.evaluate(DLN_IDS), [], 'nothing is listed that far out');
    const empty = await page.evaluate(function () {
      var e = document.querySelector('[data-dln-panel] .italic');
      return e ? e.textContent.trim() : '';
    });
    assert.equal(empty, 'No day notes or deadlines on or after ' + FAR + '.',
      'the empty state names the cutoff rather than claiming the slot is empty');

    // opening and filtering are a view: they write nothing
    assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }),
      bytes, 'track_db is byte-identical');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a ★ Forced pick adds ONE block on the opened day, closes the panel, and keeps every other key', async () => {
    /* The one thing the panel does now, the thing ● Learn's and ■ Core
       Routine's rows do. What is stored is asserted KEY BY KEY: a pick writes
       an id, a createdAt and done:false, plus a `date` only when the day
       differs from the one the block would inherit — never a title (the block
       reads as its item), a time or a length (it starts where the item does).
       Everything the item already had survives the spread, including a key no
       version of this page has heard of. */
    const D1 = dayFromToday(1), D2 = dayFromToday(2);
    const db = seedDb({
      calendarNotes: [F.calNote('n-1', D1, { title: 'Lab coat', time: '09:00' })],
      deadlines: [F.deadline('d-1', D2, {
        cautionDates: [TODAY, D1], time: '17:00', title: 'Essay', detail: 'body',
        docPageId: 'p-1', futureKey: 'kept'
      })]
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    await mountSchedule(page);
    const before = await page.evaluate(READ_ITEM, 'deadlines', 'd-1');

    // the row carries ONE action and ⓘ, and none of the four old controls
    await openDlnPanel(page, TODAY);
    assert.deepEqual(await page.evaluate(function () {
      var p = document.querySelector('[data-dln-panel]');
      return ['data-dln-dissect', 'data-dln-unschedule', 'data-dln-schedule', 'data-dln-reset', 'data-dln-part-input']
        .filter(function (a) { return !!p.querySelector('[' + a + ']'); });
    }), [], 'no ＋ composer, no remove from schedule, no add block back, no reset to due time');
    assert.equal(await page.evaluate(function () {
      return document.querySelectorAll('[data-dln-add="deadline:d-1"]').length + ':'
        + document.querySelectorAll('[data-dln-info="deadline:d-1"]').length;
    }), '1:1', 'one pick control and one ⓘ');
    await page.evaluate(CLICK_SEL, '[data-dln-add="deadline:d-1"]');
    const first = await page.waitFor(ITEM_WITH_PARTS, { args: ['deadlines', 'd-1', 1], message: 'the pick reaching track_db' });

    const p0 = first.parts[0];
    assert.deepEqual(Object.keys(p0).sort(), ['createdAt', 'date', 'done', 'id'],
      'an id, a createdAt, done:false and the day — nothing a reader could take for a choice');
    assert.equal(p0.date, TODAY, 'on the day the panel was opened from, not the due day');
    assert.equal(p0.done, false);
    for (const k of ['id', 'date', 'time', 'cautionDates', 'title', 'detail', 'docPageId', 'createdAt', 'futureKey']) {
      assert.deepEqual(first[k], before[k], k + ' survived the write');
    }
    assert.equal(await page.evaluate(function () { return !!document.querySelector('[data-dln-panel]'); }), false,
      'the panel closed, as ● Learn and ■ Core Routine do');
    const b0 = await page.waitFor(function (id) {
      var e = document.querySelector('[data-block-id="' + id + '"]');
      return e ? { day: e.getAttribute('data-block-day'), top: e.style.top } : false;
    }, { args: ['d-1:' + p0.id], message: 'the new block on the grid' });
    assert.deepEqual(b0, { day: TODAY, top: 16 * 64 + 'px' },
      'drawn in the opened day\'s column, its run-up ending at the 17:00 due time');

    // a second pick adds a SECOND block — prep across several days
    await pickForced(page, D1, 'deadline:d-1');
    const second = await page.waitFor(ITEM_WITH_PARTS, { args: ['deadlines', 'd-1', 2], message: 'the second pick' });
    assert.equal(second.parts[0].id, p0.id, 'the first block is untouched');
    assert.equal(second.parts[1].date, D1);
    await page.waitFor(function () { return document.querySelectorAll('[data-block-id^="d-1:"]').length > 1; },
      { message: 'the second block on the grid' });
    assert.deepEqual((await page.evaluate(BLOCKS)).filter(b => b.id.indexOf('d-1:') === 0).map(b => b.day).sort(),
      [TODAY, D1].sort(), 'one block in each column');

    // a note picked on its OWN day stores no day at all — it follows the note
    await pickForced(page, D1, 'dayNote:n-1');
    const note = await page.waitFor(ITEM_WITH_PARTS, { args: ['calendarNotes', 'n-1', 1], message: 'the note pick' });
    assert.deepEqual(Object.keys(note.parts[0]).sort(), ['createdAt', 'done', 'id'],
      'no `date` when it is the day the block would inherit anyway');
    assert.equal(note.time, '09:00', 'and the note\'s own time is untouched');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('PROGRESS: a deadline picked on a day it does not occupy makes that day a caution day, in the same write', async () => {
    /* The user's rule (2026-10-21). A deadline's block must sit on a day the
       deadline occupies, so a pick anywhere else marks the day — and the row
       says so BEFORE the click. ONE write carries both halves: every track_db
       write is recorded, and none may hold the block without the day or the
       day without the block. */
    const D1 = dayFromToday(1), D3 = dayFromToday(3);
    const db = seedDb({
      deadlines: [F.deadline('d-c', D3, { cautionDates: [D1], time: '17:00', title: 'Report' })]
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    await mountSchedule(page);
    const HINT = function () { return !!document.querySelector('[data-dln-caution-hint="d-c"]'); };
    const BANGS = function (ds) {
      var strip = document.querySelector('[data-day-strip="' + ds + '"]');
      if (!strip) return -1;
      return Array.prototype.filter.call(strip.querySelectorAll('button'), function (b) {
        return b.textContent.indexOf('!') >= 0 && b.textContent.indexOf('Report') >= 0;
      }).length;
    };

    // a day it already occupies needs no hint
    await openDlnPanel(page, D1);
    assert.equal(await page.evaluate(HINT), false, 'no hint on one of its caution days');
    await page.evaluate(CLICK_SEL, '[data-dln-open="' + D1 + '"]');
    await page.waitFor(function () { return !document.querySelector('[data-dln-panel]'); },
      { message: 'the panel closing' });

    assert.equal(await page.evaluate(BANGS, TODAY), 0, 'no "!" on today to begin with');
    await page.evaluate(function () {
      window.__dlSnaps = [];
      var prev = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (k === 'track_db') {
          try {
            var d = (JSON.parse(v).slots[0].deadlines || []).filter(function (x) { return x.id === 'd-c'; })[0];
            if (d) window.__dlSnaps.push({ parts: (d.parts || []).length, caution: (d.cautionDates || []).slice() });
          } catch (e) { window.__dlSnaps.push({ error: String(e) }); }
        }
        return prev.apply(this, arguments);
      };
      return true;
    });
    await openDlnPanel(page, TODAY);
    assert.equal(await page.evaluate(HINT), true, 'the row says the pick will also mark today, before the click');
    await page.evaluate(CLICK_SEL, '[data-dln-add="deadline:d-c"]');
    const after = await page.waitFor(ITEM_WITH_PARTS, { args: ['deadlines', 'd-c', 1], message: 'the pick reaching track_db' });
    assert.deepEqual(after.cautionDates, [TODAY, D1], 'today joined the chosen days, sorted, the old one kept');
    assert.equal(after.parts[0].date, TODAY, 'and the block sits on it');
    assert.equal(after.date, D3, 'the due day did not move');
    assert.equal('startDate' in after, false, 'written through the one caution writer');

    const snaps = await page.evaluate(function () { return window.__dlSnaps; });
    assert.ok(snaps.length > 0, 'the write was observed');
    for (const s of snaps) {
      assert.equal((s.caution || []).indexOf(TODAY) >= 0, s.parts === 1,
        'never one half without the other: ' + JSON.stringify(s));
    }
    await page.waitFor(function (ds) {
      var strip = document.querySelector('[data-day-strip="' + ds + '"]');
      return !!strip && strip.textContent.indexOf('Report') >= 0;
    }, { args: [TODAY], message: 'today\'s strip re-rendering' });
    assert.equal(await page.evaluate(BANGS, TODAY), 1, 'and today now carries the deadline\'s "!"');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('PROGRESS: a deadline whose due day is not a real day is listed but refused, writing nothing', async () => {
    /* Listed, because this panel is the only surface such a record appears on
       and it must stay reachable — but a pick would have no day to check its
       block against. The WRITER is the one guard: the row is aria-disabled and
       says why, but a click still reaches withForcedBlock, so this click is
       the writer's refusal under test — a `disabled` row would swallow it in
       React and let the case pass with that refusal gone. */
    const db = seedDb({ deadlines: [F.deadline('d-bad', 'someday', { cautionDates: [], time: '17:00', title: 'Broken' })] });
    const page = await open('progress.html', { db, hash: '#schedule' });
    await mountSchedule(page);
    const bytes = await page.evaluate(function () { return localStorage.getItem('track_db'); });
    await openDlnPanel(page, TODAY);
    assert.equal(await page.evaluate(function () {
      var b = document.querySelector('[data-dln-add="deadline:d-bad"]'); return b ? b.getAttribute('aria-disabled') : null;
    }), 'true', 'its row is listed, and marked as refused');
    assert.match(await page.evaluate(function () {
      var e = document.querySelector('[data-dln-refused="d-bad"]'); return e ? e.textContent : '';
    }), /not a real day/, 'and says why');
    await page.evaluate(CLICK_SEL, '[data-dln-add="deadline:d-bad"]');
    await sleep(400);
    assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }), bytes,
      'a click on it writes nothing — the writer refused');
    assert.equal(await page.evaluate(function () { return !!document.querySelector('[data-dln-panel]'); }), true,
      'and the panel stays open on the reason');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('PROGRESS: a block\'s ✕ asks first — Cancel writes nothing, OK removes only that block, and the last deletes parts', async () => {
    /* Removing a block deletes a record, so it asks — once, and BEFORE it
       writes. The item itself is never touched: it keeps its due line, and
       ★ Forced can add a block again. Emptying the list deletes the key
       rather than storing [], because absence is what "no blocks" is. */
    const db = seedDb({
      deadlines: [F.deadline('d-x', TODAY, { cautionDates: [], time: '17:00', title: 'Essay',
        parts: [{ id: 'p1' }, { id: 'p2', time: '10:00' }] })]
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    await mountSchedule(page);
    await page.waitFor(function () { return document.querySelectorAll('[data-block-id^="d-x:"]').length === 2; },
      { message: 'both blocks on the grid' });
    const bytes = await page.evaluate(function () { return localStorage.getItem('track_db'); });

    const asked = await answering(page, false, CLICK_SOON_SEL, ['[data-block-remove="d-x:p1"]']);
    assert.match(String(asked), /Essay/, 'the prompt names the block');
    await sleep(300);
    assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }), bytes,
      'Cancel: track_db is byte-identical');

    const n0 = page.dialogs.length;
    await answering(page, true, CLICK_SOON_SEL, ['[data-block-remove="d-x:p1"]']);
    const one = await page.waitFor(ITEM_WITH_PARTS, { args: ['deadlines', 'd-x', 1], message: 'one block removed' });
    await sleep(300);
    assert.equal(page.dialogs.length, n0 + 1, 'one click, exactly one prompt');
    assert.deepEqual(one.parts.map(p => p.id), ['p2'], 'only that block went');
    assert.equal(one.title, 'Essay', 'and the deadline is untouched');
    assert.equal(one.date, TODAY);

    await answering(page, true, CLICK_SOON_SEL, ['[data-block-remove="d-x:p2"]']);
    const none = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = (((db.slots || [])[0] || {}).deadlines || [])[0];
      return (d && !(Array.isArray(d.parts) && d.parts.length)) ? d : false;
    }, { message: 'the last block going' });
    assert.equal('parts' in none, false, 'emptied by DELETING the key, not by storing []');
    assert.equal(none.id, 'd-x', 'the deadline itself is kept');
    await page.waitFor(function () { return !document.querySelector('[data-block-id^="d-x:"]'); },
      { message: 'the grid emptying' });
    assert.equal(await page.evaluate(function () { return document.body.textContent.indexOf('Essay') >= 0; }), true,
      'and its due line is still drawn');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('PROGRESS: a block\'s tick writes that block\'s done and nothing else', async () => {
    /* A block is one session of work, and its tick says that session is done.
       It is never the deadline's tick, which hides the `!` days and is set in
       the popup — so the deadline gains no `done` key here. */
    const db = seedDb({
      deadlines: [F.deadline('d-t', TODAY, { cautionDates: [], time: '17:00', title: 'Essay',
        parts: [{ id: 'p1', done: false }, { id: 'p2', time: '10:00', done: false }] })]
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    await mountSchedule(page);
    await page.waitFor(function () { return !!document.querySelector('[data-block-done="d-t:p1"]'); },
      { message: 'the block\'s tick' });
    await page.evaluate(CLICK_SEL, '[data-block-done="d-t:p1"]');
    const after = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = (((db.slots || [])[0] || {}).deadlines || [])[0];
      return (d && d.parts && d.parts[0].done !== false) ? d : false;
    }, { message: 'the tick reaching track_db' });
    assert.equal(after.parts[0].done, true, 'that block is done');
    assert.equal(after.parts[1].done, false, 'the other is not');
    assert.equal('done' in after, false, 'and the deadline itself is NOT ticked');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* ── sub-tasks: ✂ in ★ Forced ──────────────────────────────────────────
     The user's rules (2026-10-22). A note's or a deadline's ✂ in ★ Forced
     names SUB-TASKS — child tasks of the original, which is NOT gone. A
     sub-task is a titled part, made OFF the schedule and listed under its
     original. Clicking its row in a day's ★ Forced puts it on THAT day, and
     from another day MOVES it: one record, one date, never on two days. Once
     an original has sub-tasks its blocks have no tick and are done when every
     sub-task is. Asserted on Progress here, and on Home and in Documentations
     separately below. */
  const SET_SEL = function (setterSrc, sel, value) {
    var el = document.querySelector(sel);
    if (!el) return false;
    new Function('return ' + setterSrc)()(el, value);
    return true;
  };
  const BYTES = function () { return localStorage.getItem('track_db'); };
  // a WRITE landing — never the answer a case hopes for, which is asserted after
  const writeLanded = (page, before, message) => page.waitFor(function (b) {
    return localStorage.getItem('track_db') !== b;
  }, { args: [before], message });
  // ✂ on the row `key` ('<kind>:<id>') of the open panel, then each of `names`
  // added, each waited for until it reaches track_db. Returns the stored item.
  const addSubtasks = async (page, key, storeKey, id, names) => {
    await page.evaluate(CLICK_SEL, '[data-dln-split="' + key + '"]');
    await page.waitFor(function (k) { return !!document.querySelector('[data-dln-sub-input="' + k + '"]'); },
      { args: [key], message: 'the ✂ name box for ' + key });
    let item = null;
    for (const name of names) {
      const n = (((await page.evaluate(READ_ITEM, storeKey, id)) || {}).parts || []).length;
      await page.evaluate(SET_SEL, SET_REACT_INPUT, '[data-dln-sub-input="' + key + '"]', name);
      await page.waitFor(function (k) { var b = document.querySelector('[data-dln-sub-add="' + k + '"]'); return !!b && !b.disabled; },
        { args: [key], message: 'Add enabled for "' + name + '"' });
      await page.evaluate(CLICK_SEL, '[data-dln-sub-add="' + key + '"]');
      item = await page.waitFor(ITEM_WITH_PARTS, { args: [storeKey, id, n + 1], message: 'the sub-task "' + name + '" reaching track_db' });
    }
    return item;
  };
  const SUB_WHEN = function (skey) {
    var e = document.querySelector('[data-dln-sub-when="' + skey + '"]');
    return e ? e.textContent.trim() : null;
  };
  // EVERY element drawn for a block id — a sub-task on two days would be two
  const BLOCK_AT = function (id) {
    return Array.prototype.map.call(document.querySelectorAll('[data-block-id="' + id + '"]'), function (e) {
      return { day: e.getAttribute('data-block-day'), state: e.getAttribute('data-block-state'),
        sub: e.getAttribute('data-block-sub'), text: e.textContent, tick: !!e.querySelector('[data-block-done]') };
    });
  };

  await t.test('PROGRESS: ✂ in ★ Forced adds a named sub-task OFF the schedule — the original untouched and still drawn', async () => {
    /* ✂ names and schedules nothing. The record is asserted key by key, its
       row says where it is, the grid has no block for it, and the original's
       block is exactly as it was. The second name goes in by Enter. */
    const D3 = dayFromToday(3);
    const db = seedDb({
      deadlines: [F.deadline('d-a', D3, { cautionDates: [], time: '17:00', title: 'Essay', futureKey: 'kept', parts: [{ id: 'b' }] })]
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    try {
      await mountSchedule(page);
      await page.waitFor(function () { return !!document.querySelector('[data-block-id="d-a:b"]'); },
        { message: 'the original\'s block' });
      const before = await page.evaluate(READ_ITEM, 'deadlines', 'd-a');
      await openDlnPanel(page, TODAY);
      const one = await addSubtasks(page, 'deadline:d-a', 'deadlines', 'd-a', ['Outline']);
      const s1 = one.parts[1];
      assert.deepEqual(Object.keys(s1).sort(), ['createdAt', 'done', 'id', 'title', 'unscheduled'],
        'a name, an id, a createdAt, done and unscheduled — no day, no time');
      assert.deepEqual([s1.title, s1.done, s1.unscheduled], ['Outline', false, true]);
      assert.deepEqual(one.parts[0], before.parts[0], 'the original\'s block is untouched');
      for (const k of ['date', 'time', 'cautionDates', 'title', 'futureKey']) {
        assert.deepEqual(one[k], before[k], k + ' survived the write');
      }
      assert.equal(await page.waitFor(SUB_WHEN, { args: ['deadline:d-a:' + s1.id], message: 'its row under the original' }),
        'not on the schedule', 'listed under its original, not on the schedule');

      // the box stayed open and empty; the second name goes in by Enter
      assert.equal(await page.evaluate(function () {
        var i = document.querySelector('[data-dln-sub-input="deadline:d-a"]'); return i ? i.value : null;
      }), '', 'the box stays open, emptied');
      await page.evaluate(SET_SEL, SET_REACT_INPUT, '[data-dln-sub-input="deadline:d-a"]', 'Draft');
      await page.evaluate(function () {
        document.querySelector('[data-dln-sub-input="deadline:d-a"]')
          .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        return true;
      });
      const two = await page.waitFor(ITEM_WITH_PARTS, { args: ['deadlines', 'd-a', 3], message: 'Enter adding the second' });
      const s2 = two.parts[2];
      assert.deepEqual([s2.title, s2.unscheduled], ['Draft', true]);
      // the row for it rendering is the grid rendering too: one commit
      await page.waitFor(SUB_WHEN, { args: ['deadline:d-a:' + s2.id], message: 'the second row' });
      assert.deepEqual(await page.evaluate(BLOCK_AT, 'd-a:' + s1.id), [], 'no block for a sub-task off the schedule');
      assert.deepEqual(await page.evaluate(BLOCK_AT, 'd-a:' + s2.id), []);
      assert.equal((await page.evaluate(BLOCK_AT, 'd-a:b')).length, 1, 'and the original\'s block is still drawn');
      assert.deepEqual(realErrors(page), []);
    } finally {
      await page.close();
    }
  });

  await t.test('PROGRESS: a sub-task\'s row puts it on THAT day — its date always written — and from another day MOVES it: one block, never two', async () => {
    /* Placed first on the item's OWN day, where a ★ pick would store no
       date, so "always written" is a claim about a real value. Then moved
       from a caution day's ★ Forced: the record is moved, never copied, and
       the grid draws it once. The original's block stays beside it. */
    const D1 = dayFromToday(1), D3 = dayFromToday(3);
    const db = seedDb({
      deadlines: [F.deadline('d-p', D3, { cautionDates: [D1], time: '17:00', title: 'Essay',
        parts: [{ id: 'b' }, { id: 's', title: 'Outline', createdAt: 1, done: false, unscheduled: true }] })]
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    try {
      await mountSchedule(page);

      // 1 — onto the due day, the item's own
      await openDlnPanel(page, D3);
      let bytes = await page.evaluate(BYTES);
      await page.evaluate(CLICK_SEL, '[data-dln-sub="deadline:d-p:s"]');
      await writeLanded(page, bytes, 'the sub-task going on the schedule');
      const on = (await page.evaluate(READ_ITEM, 'deadlines', 'd-p')).parts[1];
      assert.equal(on.date, D3, 'its date is written even on the item\'s own day — it sits where it was put');
      assert.deepEqual(Object.keys(on).sort(), ['createdAt', 'date', 'done', 'id', 'title'],
        'unscheduled is deleted, nothing else added');
      assert.equal(await page.evaluate(function () { return !!document.querySelector('[data-dln-panel]'); }), false, 'the panel closed');
      const placed = await page.waitFor(function () {
        var a = document.querySelectorAll('[data-block-id="d-p:s"]');
        return a.length ? Array.prototype.map.call(a, function (e) { return e.getAttribute('data-block-day'); }) : false;
      }, { message: 'the sub-task\'s block' });
      assert.deepEqual(placed, [D3], 'drawn in that day\'s column');
      assert.ok(/Outline/.test((await page.evaluate(BLOCK_AT, 'd-p:s'))[0].text), 'under its own name');
      assert.deepEqual((await page.evaluate(BLOCK_AT, 'd-p:b')).map(x => x.day), [D3],
        'and the original\'s block is NOT gone — it is beside it');

      // 2 — from a caution day's ★ Forced: MOVED there, never copied
      await openDlnPanel(page, D1);
      assert.notEqual(await page.evaluate(SUB_WHEN, 'deadline:d-p:s'), 'not on the schedule', 'the row says where it is');
      bytes = await page.evaluate(BYTES);
      await page.evaluate(CLICK_SEL, '[data-dln-sub="deadline:d-p:s"]');
      await writeLanded(page, bytes, 'the move reaching track_db');
      const moved = await page.evaluate(READ_ITEM, 'deadlines', 'd-p');
      assert.deepEqual(moved.parts.map(x => x.id), ['b', 's'], 'one sub-task, one record — moved, never copied');
      assert.equal(moved.parts[1].date, D1, 'and it is on the day it was moved to');
      const now = await page.waitFor(function (was) {
        var a = Array.prototype.map.call(document.querySelectorAll('[data-block-id="d-p:s"]'), function (e) { return e.getAttribute('data-block-day'); });
        return a.join() !== was ? a : false;
      }, { args: [D3], message: 'the grid re-drawing the moved sub-task' });
      assert.deepEqual(now, [D1], 'drawn once, in the new day\'s column — never on two days');
      assert.deepEqual(realErrors(page), []);
    } finally {
      await page.close();
    }
  });

  await t.test('PROGRESS: a sub-task put on a day its deadline does not occupy makes that day a caution day, in the same write', async () => {
    /* The same rule as a ★ pick, through the same two functions. The row says
       so before the click, and ONE write carries both halves: every track_db
       write is recorded, and none may hold the day without the sub-task or
       the sub-task without the day. */
    const D1 = dayFromToday(1), D3 = dayFromToday(3);
    const db = seedDb({
      deadlines: [F.deadline('d-c', D3, { cautionDates: [D1], time: '17:00', title: 'Report',
        parts: [{ id: 's', title: 'Collect data', createdAt: 1, done: false, unscheduled: true }] })]
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    try {
      await mountSchedule(page);
      await page.evaluate(function () {
        window.__subSnaps = [];
        var prev = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) {
          if (k === 'track_db') {
            try {
              var d = (JSON.parse(v).slots[0].deadlines || []).filter(function (x) { return x.id === 'd-c'; })[0];
              if (d) window.__subSnaps.push({ date: ((d.parts || [])[0] || {}).date || null, caution: (d.cautionDates || []).slice() });
            } catch (e) { window.__subSnaps.push({ error: String(e) }); }
          }
          return prev.apply(this, arguments);
        };
        return true;
      });
      await openDlnPanel(page, TODAY);
      assert.equal(await page.evaluate(function () { return !!document.querySelector('[data-dln-caution-hint="d-c"]'); }), true,
        'the row says the opened day will become a caution day, before the click');
      const bytes = await page.evaluate(BYTES);
      await page.evaluate(CLICK_SEL, '[data-dln-sub="deadline:d-c:s"]');
      await writeLanded(page, bytes, 'the sub-task going on the schedule');
      const after = await page.evaluate(READ_ITEM, 'deadlines', 'd-c');
      assert.deepEqual(after.cautionDates, [TODAY, D1], 'today joined the chosen days, the old one kept');
      assert.equal(after.parts[0].date, TODAY, 'and the sub-task sits on it');
      assert.equal('startDate' in after, false, 'written through the one caution writer');
      const snaps = await page.evaluate(function () { return window.__subSnaps; });
      assert.ok(snaps.length > 0, 'the write was observed');
      for (const sn of snaps) {
        assert.equal((sn.caution || []).indexOf(TODAY) >= 0, sn.date === TODAY,
          'never one half without the other: ' + JSON.stringify(sn));
      }
      assert.deepEqual(realErrors(page), []);
    } finally {
      await page.close();
    }
  });

  await t.test('PROGRESS: a sub-task of a deadline with no real due day is listed but refused, writing nothing', async () => {
    /* The writer is the one guard, as for a ★ pick: the row is aria-disabled
       and says why, and its click still reaches withSubtaskOn — so this click
       is the writer's refusal under test. */
    const db = seedDb({
      deadlines: [F.deadline('d-bad', 'someday', { cautionDates: [], time: '17:00', title: 'Broken',
        parts: [{ id: 's', title: 'Step', createdAt: 1, done: false, unscheduled: true }] })]
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    try {
      await mountSchedule(page);
      const bytes = await page.evaluate(BYTES);
      await openDlnPanel(page, TODAY);
      assert.equal(await page.evaluate(function () {
        var b = document.querySelector('[data-dln-sub="deadline:d-bad:s"]'); return b ? b.getAttribute('aria-disabled') : null;
      }), 'true', 'its sub-task is listed, and marked as refused');
      await page.evaluate(CLICK_SEL, '[data-dln-sub="deadline:d-bad:s"]');
      await sleep(400);
      assert.equal(await page.evaluate(BYTES), bytes, 'a click on it writes nothing — the writer refused');
      assert.equal(await page.evaluate(function () { return !!document.querySelector('[data-dln-panel]'); }), true,
        'and the panel stays open on the reason');
      assert.deepEqual(realErrors(page), []);
    } finally {
      await page.close();
    }
  });

  await t.test('PROGRESS: once it has sub-tasks the original\'s block has no tick, and is done only when every sub-task is', async () => {
    /* A parent task's rule. The original's own `done` is never written by
       this, and nor is the deadline's. */
    const db = seedDb({
      deadlines: [F.deadline('d-d', TODAY, { cautionDates: [], time: '17:00', title: 'Essay',
        parts: [{ id: 'b', done: false }, { id: 's1', title: 'Outline', date: TODAY, time: '09:00', done: false },
          { id: 's2', title: 'Draft', date: TODAY, time: '11:00', done: false }] })]
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    try {
      await mountSchedule(page);
      await page.waitFor(function () { return document.querySelectorAll('[data-block-id^="d-d:"]').length === 3; },
        { message: 'the original and both sub-tasks on the grid' });
      const orig0 = (await page.evaluate(BLOCK_AT, 'd-d:b'))[0];
      assert.equal(orig0.tick, false, 'the original\'s block has no tick of its own');
      assert.equal(orig0.state, 'open');

      for (const [sid, last] of [['s1', false], ['s2', true]]) {
        const bytes = await page.evaluate(BYTES);
        await page.evaluate(CLICK_SEL, '[data-block-done="d-d:' + sid + '"]');
        await writeLanded(page, bytes, 'the tick on ' + sid + ' reaching track_db');
        await page.waitFor(function (id) { var e = document.querySelector('[data-block-id="' + id + '"]'); return !!e && e.getAttribute('data-block-state') === 'done'; },
          { args: ['d-d:' + sid], message: 'the grid re-drawing ' + sid + ' ticked' });
        assert.equal((await page.evaluate(BLOCK_AT, 'd-d:b'))[0].state, last ? 'done' : 'open',
          last ? 'done only when every sub-task is' : 'not done while a sub-task is open');
      }
      const after = await page.evaluate(READ_ITEM, 'deadlines', 'd-d');
      assert.equal(after.parts[0].done, false, 'the original\'s own done is never written');
      assert.equal('done' in after, false, 'and the deadline is NOT ticked');
      assert.deepEqual(realErrors(page), []);
    } finally {
      await page.close();
    }
  });

  await t.test('PROGRESS: a sub-task block\'s ✕ takes it off the schedule and keeps it; its ★ row × deletes it — both ask', async () => {
    /* Two removals, as for a task: off the schedule (kept, with its own time
       and length), and gone. Each asks, and each Cancel is byte-identical. */
    const db = seedDb({
      deadlines: [F.deadline('d-r', TODAY, { cautionDates: [], time: '17:00', title: 'Essay',
        parts: [{ id: 's', title: 'Outline', date: TODAY, time: '10:00', blockDuration: 45, done: false }] })]
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    try {
      await mountSchedule(page);
      await page.waitFor(function () { return !!document.querySelector('[data-block-id="d-r:s"]'); }, { message: 'the sub-task\'s block' });

      let bytes = await page.evaluate(BYTES);
      const asked = await answering(page, false, CLICK_SOON_SEL, ['[data-block-remove="d-r:s"]']);
      assert.match(String(asked), /Outline/, 'the prompt names it');
      assert.match(String(asked), /stays as a sub-task/, 'and says it is kept');
      await sleep(300);
      assert.equal(await page.evaluate(BYTES), bytes, 'Cancel: track_db is byte-identical');
      await answering(page, true, CLICK_SOON_SEL, ['[data-block-remove="d-r:s"]']);
      await writeLanded(page, bytes, 'taking it off the schedule');
      const off = await page.evaluate(READ_ITEM, 'deadlines', 'd-r');
      assert.equal(off.parts.length, 1, 'the sub-task is KEPT');
      assert.deepEqual(off.parts[0], { id: 's', title: 'Outline', time: '10:00', blockDuration: 45, done: false, unscheduled: true },
        'off the schedule: its day gone, its own time and length kept');
      await page.waitFor(function () { return !document.querySelector('[data-block-id="d-r:s"]'); }, { message: 'the block leaving the grid' });
      await openDlnPanel(page, TODAY);
      assert.equal(await page.waitFor(SUB_WHEN, { args: ['deadline:d-r:s'], message: 'its row' }), 'not on the schedule',
        'and it is still listed under its deadline');

      bytes = await page.evaluate(BYTES);
      const asked2 = await answering(page, false, CLICK_SOON_SEL, ['[data-dln-sub-remove="deadline:d-r:s"]']);
      assert.match(String(asked2), /Delete the sub-task "Outline"/, 'the row × asks to DELETE it');
      await sleep(300);
      assert.equal(await page.evaluate(BYTES), bytes, 'Cancel: track_db is byte-identical');
      await answering(page, true, CLICK_SOON_SEL, ['[data-dln-sub-remove="deadline:d-r:s"]']);
      await writeLanded(page, bytes, 'deleting it');
      const gone = await page.evaluate(READ_ITEM, 'deadlines', 'd-r');
      assert.equal('parts' in gone, false, 'gone, and the emptied list deleted rather than stored as []');
      assert.equal(gone.title, 'Essay', 'the deadline itself is kept');
      assert.deepEqual(realErrors(page), []);
    } finally {
      await page.close();
    }
  });

  await t.test('PROGRESS: a legacy blockOff item\'s blocks stay hidden — and a pick shows them again', async () => {
    /* `blockOff: true` was the old `remove from schedule`. It still hides every
       block an item has, nothing writes it any more, and the item's own
       surfaces stay drawn. A pick writes `false` — re-adding never deletes the
       key — so the hidden block comes back beside the new one, and the row
       says it will before the click. */
    const db = seedDb({
      calendarNotes: [F.calNote('n-off', TODAY, { title: 'Off-grid note', time: '14:30', blockOff: true, parts: [{ id: 'old' }] })],
      deadlines: [F.deadline('d-off', TODAY, { cautionDates: [], time: '17:00', title: 'Off-grid deadline', blockOff: true, parts: [{ id: 'old' }] })]
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    await mountSchedule(page);
    assert.deepEqual(await page.evaluate(BLOCKS), [], 'neither is on the hour grid');
    assert.equal(await page.evaluate(function () {
      return Array.prototype.some.call(document.querySelectorAll('#root span'), function (e) {
        return /bg-fuchsia/.test(e.className || '') && e.textContent.indexOf('Off-grid note') >= 0;
      });
    }), true, 'but the note still has its marker');
    assert.equal(await page.evaluate(function () {
      return document.body.textContent.indexOf('Off-grid deadline') >= 0;
    }), true, 'and the deadline is still drawn on its due day');

    await openDlnPanel(page, TODAY);
    assert.equal(await page.evaluate(function () { return !!document.querySelector('[data-dln-hidden="n-off"]'); }), true,
      'the row names the hidden block before the pick brings it back');
    await page.evaluate(CLICK_SEL, '[data-dln-add="dayNote:n-off"]');
    const after = await page.waitFor(ITEM_WITH_PARTS, { args: ['calendarNotes', 'n-off', 2], message: 'the pick' });
    assert.equal(after.blockOff, false, 'the pick writes blockOff:false rather than deleting the key');
    assert.equal(after.parts[0].id, 'old', 'and the hidden block was kept all along');
    await page.waitFor(function () { return !!document.querySelector('[data-block-id^="n-off:"]'); },
      { message: 'the note\'s blocks drawn' });
    assert.deepEqual((await page.evaluate(BLOCKS)).map(b => b.id).filter(id => id.indexOf('n-off:') === 0).length, 2,
      'both blocks are drawn — the hidden one and the new one');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('an UNTIMED note picked in ★ Forced lands at 08:00 and never gets time:""', async () => {
    const db = seedDb({ calendarNotes: [F.calNote('n-u', TODAY, { title: 'Untimed note' })] });
    const page = await open('progress.html', { db, hash: '#schedule' });
    await mountSchedule(page);
    await openDlnPanel(page, TODAY);
    // the row reports it as untimed rather than claiming 08:00 is the user's
    assert.match(await page.evaluate(function () {
      var e = document.querySelector('[data-dln-date="n-u"]'); return e ? e.textContent : '';
    }), /—/, 'the row shows the note has no time of its own');
    await page.evaluate(CLICK_SEL, '[data-dln-add="dayNote:n-u"]');
    const after = await page.waitFor(ITEM_WITH_PARTS, { args: ['calendarNotes', 'n-u', 1], message: 'the pick' });
    assert.equal('time' in after, false, 'no time key was invented on the note');
    assert.equal('time' in after.parts[0], false, 'nor on its block');
    const top = await page.waitFor(function (id) {
      var e = document.querySelector('[data-block-id="' + id + '"]'); return e ? e.style.top : false;
    }, { args: ['n-u:' + after.parts[0].id], message: 'the block on the grid' });
    assert.equal(top, 8 * 64 + 'px', 'at the default hour');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('the new blocks join the overlap layout instead of covering a task', async () => {
    // The markers and the hairline are deliberately EXCLUDED from the overlap
    // layout. These are real blocks, so they must be included — otherwise a
    // note block silently sits on top of a scheduled task.
    const db = seedDb({
      goals: [F.task('g-x', { title: 'Overlapping task', scheduledDate: TODAY, scheduledTime: '09:00', duration: 60 })],
      calendarNotes: [F.calNote('n-o', TODAY, { title: 'Overlapping note', time: '09:00', blockDuration: 60, parts: [BLOCK] })],
      deadlines: []
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    await mountSchedule(page);
    /* computeOverlapInfo gives exactly ONE member of a group the front z-index
       15 and the rest 10; a block in no group is always 10. So "exactly one of
       the two is 15" is the assertion that actually proves they were grouped —
       checking that the note is 10-or-15 would pass even if it were excluded. */
    const z = await page.waitFor(function () {
      var note = document.querySelector('[data-block-id="n-o:b"]');
      if (!note) return false;
      var task = Array.prototype.find.call(document.querySelectorAll('#root div'), function (e) {
        return e.textContent.indexOf('Overlapping task') >= 0 && e.style && e.style.height
          && !e.querySelector('[data-block-kind]');
      });
      if (!task) return false;
      return { note: note.style.zIndex, task: task.style.zIndex };
    }, { message: 'both blocks being laid out' });

    const fronts = [z.note, z.task].filter(v => v === '15').length;
    assert.equal(fronts, 1,
      'exactly one of the overlapping pair is the group front, so the note block joined the ' +
      'layout — got note=' + z.note + ' task=' + z.task);
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('an untimed note with a stray blockDuration blocks at 08:00, not midnight', async () => {
    /* This catches a divergence in progress.html's OWN copy of noteBlockStart,
       which is why it is separate from the cases above. Drop the
       `noteTimed(n) ? n.time : DEFAULT_NOTE_TIME` fallback from that copy and
       minsOfTime(undefined) returns null, which timeOfMins clamps to '00:00' —
       the note is drawn, so an "is it on the grid" assertion still passes while
       the block sits at midnight. Only checking WHERE it lands finds it. The
       stray blockDuration is realistic: clearing a note's time in
       documentations.html drops the `time` key and knows nothing about blocks. */
    const db = seedDb({
      calendarNotes: [F.calNote('n-orphan', TODAY, { title: 'Orphan note', blockDuration: 60, parts: [BLOCK] })],
      deadlines: []
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    await mountSchedule(page);
    const b = await page.waitFor(function () {
      var e = document.querySelector('[data-block-id="n-orphan:b"]');
      return e ? { top: e.style.top, height: e.style.height } : false;
    }, { message: 'the orphan note being drawn' });
    assert.equal(b.top, 8 * 64 + 'px', 'at the default hour, never at 00:00');
    assert.equal(b.height, 64 + 'px', 'at the stored length');
    assert.equal(await page.evaluate(function () {
      return Array.prototype.some.call(document.querySelectorAll('#root button'),
        function (e) { return e.textContent.indexOf('Orphan note') >= 0; });
    }), true, 'and it is a chip in the day strip as well');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('the Home calendar draws the same two blocks, and none for an item never added', async () => {
    // Asserted separately from Progress on purpose: this surface reads
    // calendar-core.js, Progress reads its own copy of the same rules.
    const db = seedDb({
      calendarNotes: [
        F.calNote('n-s', TODAY, { title: 'Scheduled note', time: '09:00', blockDuration: 90, parts: [BLOCK] }),
        F.calNote('n-none', TODAY, { title: 'Unadded note', time: '11:00' })
      ],
      deadlines: [F.deadline('d-p', TODAY, { cautionDates: [], time: '20:00', title: 'Prep block', blockDuration: 60, parts: [BLOCK] })]
    });
    // index.html is static markup with no React #root — its calendar is a
    // plain DOM build, and the day preview only exists once a day is selected.
    const page = await open('index.html', { db });
    await page.waitFor(function () {
      var g = document.querySelector('#cal-grid'); return !!g && g.children.length > 0;
    }, { message: 'the Home calendar grid' });
    await page.evaluate(function () {
      var cells = Array.prototype.filter.call(document.querySelectorAll('.cal-cell'),
        function (c) { return !c.classList.contains('empty'); });
      cells[new Date().getDate() - 1].click();
      return true;
    });
    const seen = await page.waitFor(function () {
      var d = document.querySelector('#cal-detail');
      if (!d) return false;
      var blocks = Array.prototype.map.call(d.querySelectorAll('.cal-sched-block'),
        function (b) { return b.textContent.replace(/\s+/g, ' ').trim(); });
      return blocks.length >= 2 ? blocks : false;
    }, { message: 'both blocks on the Home day preview' });

    assert.ok(seen.some(t => /Prep block/.test(t) && /19:00/.test(t)),
      'the deadline run-up block reaches Home, ending at its 20:00 due time — got ' + JSON.stringify(seen));
    assert.ok(seen.some(t => /Scheduled note/.test(t) && /09:00/.test(t)),
      'and so does the note block — got ' + JSON.stringify(seen));
    assert.ok(!seen.some(t => /Unadded note/.test(t)),
      'but a note nobody added draws no block — got ' + JSON.stringify(seen));
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a Documentations calendar block draws the deadline run-up too, and none for an item never added', async () => {
    // The third surface, again asserted on its own. The block is added through
    // the real block menu rather than a hand-built record, so the test cannot
    // drift from the shape the page actually writes.
    const db = seedDb({
      docPages: [F.docPage('p-1', { title: 'Test Page' })],
      deadlines: [
        F.deadline('d-p', TODAY, { cautionDates: [], time: '20:00', title: 'Prep block', blockDuration: 60, parts: [BLOCK] }),
        F.deadline('d-none', TODAY, { cautionDates: [], time: '12:00', title: 'Unadded deadline' })
      ],
      calendarNotes: []
    });
    const page = await open('documentations.html', { db });
    await page.waitFor(function () { return !!document.querySelector('.docs-editor'); },
      { message: 'documentations editor' });
    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('.docs-addmenu button'),
        function (b) { return /Calendar/.test(b.textContent); }).click();
    });
    await page.waitFor(function () { return !!document.querySelector('.doc-cal'); },
      { message: 'the calendar block' });
    // open today's detail panel, where the day's blocks are listed
    await page.evaluate(function () {
      var d = new Date();
      var cells = Array.prototype.filter.call(document.querySelectorAll('.doc-cal .cal-cell'),
        function (c) { return !c.classList.contains('empty'); });
      cells[d.getDate() - 1].click();
      return true;
    });
    await page.waitFor(function () { return !!document.querySelector('.doc-cal .cal-detail'); },
      { message: 'the day detail panel' });
    const text = await page.waitFor(function () {
      var cal = document.querySelector('.doc-cal');
      if (!cal || cal.textContent.indexOf('Prep block') < 0) return false;
      return cal.textContent.replace(/\s+/g, ' ');
    }, { message: 'the run-up block inside the calendar block' });
    // the time matters, not just the presence: a block anchored to the wrong
    // end would still be "there"
    assert.match(text, /Prep block ?19:00/,
      'the run-up ENDS at the 20:00 due time, so it starts at 19:00 — got ' + text.slice(0, 200));
    const blocks = await page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll('.doc-cal .cal-sched-block'),
        function (b) { return b.textContent.replace(/\s+/g, ' ').trim(); });
    });
    assert.ok(!blocks.some(t => /Unadded deadline/.test(t)),
      'but a deadline nobody added draws no block — got ' + JSON.stringify(blocks));
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* Sub-tasks on the two read-only surfaces, each asserted on its own: both
     read calendar-core.js, Progress its own copy, and a rule forgotten at one
     surface hides behind a passing sibling. */
  await t.test('HOME: a sub-task on the schedule is drawn beside its original, and one off it is not', async () => {
    const db = seedDb({
      calendarNotes: [F.calNote('n-s', TODAY, { title: 'Lab day', time: '09:00',
        parts: [{ id: 'b' }, { id: 's1', title: 'Gloves', date: TODAY, time: '11:00' },
          { id: 's2', title: 'Goggles', unscheduled: true }] })]
    });
    const page = await open('index.html', { db });
    try {
      await page.waitFor(function () {
        var g = document.querySelector('#cal-grid'); return !!g && g.children.length > 0;
      }, { message: 'the Home calendar grid' });
      await page.evaluate(function () {
        var cells = Array.prototype.filter.call(document.querySelectorAll('.cal-cell'),
          function (c) { return !c.classList.contains('empty'); });
        cells[new Date().getDate() - 1].click();
        return true;
      });
      const seen = await page.waitFor(function () {
        var d = document.querySelector('#cal-detail');
        if (!d) return false;
        var blocks = Array.prototype.map.call(d.querySelectorAll('.cal-sched-block'),
          function (b) { return b.textContent.replace(/\s+/g, ' ').trim(); });
        // wait for the block every reading draws — the scheduled sub-task —
        // then assert, so a missing original reads as a wrong value
        return blocks.some(function (t) { return /Gloves/.test(t); }) ? blocks : false;
      }, { message: 'the scheduled sub-task on the Home day preview' });
      assert.ok(!seen.some(t => /Goggles/.test(t)), 'a sub-task off the schedule is not drawn — got ' + JSON.stringify(seen));
      assert.ok(seen.some(t => /Lab day/.test(t) && /09:00/.test(t)), 'the original is not gone — got ' + JSON.stringify(seen));
      assert.ok(seen.some(t => /Gloves/.test(t) && /11:00/.test(t)), 'and its sub-task is beside it — got ' + JSON.stringify(seen));
      assert.deepEqual(realErrors(page), []);
    } finally {
      await page.close();
    }
  });

  await t.test('DOCUMENTATIONS: a sub-task on the schedule is drawn beside its original, and one off it is not', async () => {
    const db = seedDb({
      docPages: [F.docPage('p-1', { title: 'Test Page' })],
      deadlines: [F.deadline('d-s', TODAY, { cautionDates: [], time: '20:00', title: 'Essay due',
        parts: [{ id: 'b' }, { id: 's1', title: 'Outline', date: TODAY, time: '12:00' },
          { id: 's2', title: 'Proofread', unscheduled: true }] })],
      calendarNotes: []
    });
    const page = await open('documentations.html', { db });
    try {
      await page.waitFor(function () { return !!document.querySelector('.docs-editor'); },
        { message: 'documentations editor' });
      await page.evaluate(function () {
        Array.prototype.find.call(document.querySelectorAll('.docs-addmenu button'),
          function (b) { return /Calendar/.test(b.textContent); }).click();
      });
      await page.waitFor(function () { return !!document.querySelector('.doc-cal'); }, { message: 'the calendar block' });
      await page.evaluate(function () {
        var d = new Date();
        var cells = Array.prototype.filter.call(document.querySelectorAll('.doc-cal .cal-cell'),
          function (c) { return !c.classList.contains('empty'); });
        cells[d.getDate() - 1].click();
        return true;
      });
      const blocks = await page.waitFor(function () {
        var b = Array.prototype.map.call(document.querySelectorAll('.doc-cal .cal-sched-block'),
          function (x) { return x.textContent.replace(/\s+/g, ' ').trim(); });
        return b.some(function (t) { return /Outline/.test(t); }) ? b : false;
      }, { message: 'the scheduled sub-task inside the calendar block' });
      assert.ok(!blocks.some(t => /Proofread/.test(t)), 'a sub-task off the schedule is not drawn — got ' + JSON.stringify(blocks));
      assert.ok(blocks.some(t => /Essay due ?19:00/.test(t)), 'the original is not gone — got ' + JSON.stringify(blocks));
      assert.ok(blocks.some(t => /Outline ?12:00/.test(t)), 'and its sub-task is beside it — got ' + JSON.stringify(blocks));
      assert.deepEqual(realErrors(page), []);
    } finally {
      await page.close();
    }
  });

  await t.test('a ★ Forced pick writes no key progress.html does not own', async () => {
    const db = seedDb({
      deadlines: [F.deadline('d-1', TODAY, { cautionDates: [],  time: '17:00', title: 'Essay' })]
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    await mountSchedule(page);
    const FOREIGN = ['sessions', 'mms', 'kolbs', 'mgChanges', 'linChanges', 'linDayTitles',
      'pos', 'levelTemplates', 'sourceDumps', 'docPages', 'trueStorages', 'trueStoragePos', 'notes',
      'dateNotes'];
    const before = await page.evaluate(function (keys) {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var s = (db.slots || [])[0] || {};
      var out = {}; keys.forEach(function (k) { out[k] = JSON.stringify(s[k]); }); return out;
    }, FOREIGN);

    await pickForced(page, TODAY, 'deadline:d-1');
    await page.waitFor(ITEM_WITH_PARTS, { args: ['deadlines', 'd-1', 1], message: 'the write landing' });

    assert.deepEqual(await page.evaluate(function (keys) {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var s = (db.slots || [])[0] || {};
      var out = {}; keys.forEach(function (k) { out[k] = JSON.stringify(s[k]); }); return out;
    }, FOREIGN), before, 'every foreign key is byte-identical');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* ── work scheduled on a day of its own ──────────────────────────────────
     A part's own `date` — or, for one with none, a legacy `blockDate` on its
     item — is what lets prep sit on a day that is not the item's own. The
     three rendering surfaces are asserted SEPARATELY, as everything else in
     this section is. */

  /* Two independent day pickers, and the difference matters.

     WEEK(n) is the nth visible column of the Progress timeline. `anchor`
     initialises to TODAY rather than to the week's Monday, so the seven columns
     run today..today+6 — a day picked as "today minus one" is simply not
     rendered, and the assertion would fail for the wrong reason.

     MDAY(n) is the nth day of the CURRENT month, because Home and
     Documentations render a month grid whose cells are addressed by day of
     month, and "today minus three" leaves that month at the start of one. */
  const WEEK = n => dayFromToday(n);
  const MDAY = n => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
      '-' + String(n).padStart(2, '0');
  };

  await t.test('PROGRESS: a block on another day draws in that column, marker staying put', async () => {
    // Both ways a block reaches another day: its own `date` (the deadline's),
    // and a legacy `blockDate` an undated block inherits (the note's).
    const due = WEEK(3), moved = WEEK(1);
    const db = seedDb({
      calendarNotes: [F.calNote('n-m', due, { title: 'Moved note', time: '15:00', blockDate: moved, parts: [BLOCK] })],
      deadlines: [F.deadline('d-m', due, {
        cautionDates: [WEEK(0), WEEK(1), WEEK(2)], time: '17:00', title: 'Moved prep',
        parts: [{ id: 'b', date: moved }]
      })]
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    await mountSchedule(page);
    // the week view shows both days at once, so one read covers the move
    const blocks = await page.evaluate(BLOCKS);
    assert.deepEqual(blocks.map(b => b.id).sort(), ['d-m:b', 'n-m:b'], 'each block is drawn exactly once');
    // THE assertion of this case: the COLUMN, not just the id. Both blocks are
    // in the DOM either way; only the day tells a moved one from an unmoved one.
    assert.deepEqual(blocks.map(b => b.day), [moved, moved],
      'both are drawn in the column they sit on, not the due day');
    // the deadline's run-up still ENDS at the due time, on the day it moved to
    assert.equal(blocks.find(b => b.id === 'd-m:b').top, 16 * 64 + 'px');
    assert.equal(blocks.find(b => b.id === 'n-m:b').top, 15 * 64 + 'px', 'and the note keeps its own hour');
    // the marker follows the note's own date, not its block's
    assert.equal(await page.evaluate(function () {
      return Array.prototype.some.call(document.querySelectorAll('#root span'), function (e) {
        return /bg-fuchsia/.test(e.className || '') && e.textContent.indexOf('Moved note') >= 0;
      });
    }), true, 'the note marker is still drawn');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('HOME: a block moved to another day is drawn on that day', async () => {
    // Asserted separately from Progress on purpose: this surface reads
    // calendar-core.js, Progress reads its own copy of the same rules.
    const db = seedDb({
      deadlines: [F.deadline('d-m', MDAY(13), {
        cautionDates: [MDAY(10), MDAY(11), MDAY(12)], time: '20:00', title: 'Moved prep',
        blockDate: MDAY(11), parts: [BLOCK]
      })]
    });
    const page = await open('index.html', { db });
    await page.waitFor(function () {
      var g = document.querySelector('#cal-grid'); return !!g && g.children.length > 0;
    }, { message: 'the Home calendar grid' });
    const readDay = async n => {
      await page.evaluate(function (day) {
        Array.prototype.filter.call(document.querySelectorAll('.cal-cell'),
          function (c) { return !c.classList.contains('empty'); })[day - 1].click();
      }, n);
      return await page.waitFor(function () {
        var d = document.querySelector('#cal-detail');
        if (!d) return false;
        return {
          text: d.textContent.replace(/\s+/g, ' '),
          blocks: Array.prototype.map.call(d.querySelectorAll('.cal-sched-block'),
            function (b) { return b.textContent.replace(/\s+/g, ' ').trim(); })
        };
      }, { message: 'the Home day preview for day ' + n });
    };
    const onMoved = await readDay(11);
    assert.ok(onMoved.blocks.some(t => /Moved prep/.test(t) && /19:00/.test(t)),
      'the block draws on the day it sits on, still ending at 20:00 — got ' + JSON.stringify(onMoved.blocks));
    const onDue = await readDay(13);
    assert.match(onDue.text, /Moved prep/, 'the due day still lists the deadline itself');
    assert.deepEqual(onDue.blocks, [], 'but no BLOCK is drawn there');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('DOCUMENTATIONS: a part with its own date draws on that date', async () => {
    const db = seedDb({
      docPages: [F.docPage('p-cal', { title: 'Calendar page' })],
      deadlines: [F.deadline('d-s', MDAY(13), {
        cautionDates: [MDAY(10), MDAY(11), MDAY(12)], time: '20:00', title: 'Split prep',
        parts: [{ id: 'pt-1', title: 'Early step', date: MDAY(11), time: '09:00' }]
      })],
      calendarNotes: []
    });
    const page = await open('documentations.html', { db });
    await page.waitFor(function () { return !!document.querySelector('.docs-editor'); },
      { message: 'documentations editor' });
    await addCalendarBlock(page);
    await selectDay(page, 11);
    const text = await page.waitFor(function () {
      var e = document.querySelector('.doc-cal .cal-sched-block');
      return e ? e.textContent.replace(/\s+/g, ' ') : false;
    }, { message: 'the part block inside the Documentations calendar' });
    assert.match(text, /Early step/, 'the part is drawn on its own day');
    assert.match(text, /09:00/, 'at its own time');
    await selectDay(page, 13);
    await sleep(300);
    assert.equal(await page.evaluate(function () {
      return document.querySelectorAll('.doc-cal .cal-sched-block').length;
    }), 0, 'and nothing is left on the deadline\'s own day');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('PROGRESS refuses a due-day move that would strand placed prep', async () => {
    // Cancel path: the stored bytes must be untouched. Nothing here may move or
    // clamp a day the user chose — it refuses and names the day instead.
    // (Un-picking a caution day that holds prep is the other half of this rule,
    // asserted separately in "un-picking a day that holds prep is refused".)
    const due = dayFromToday(2), placed = dayFromToday(-2);
    const db = seedDb({
      deadlines: [F.deadline('dl-move', due, {
        cautionDates: [placed], time: '17:00', title: 'Essay', parts: [{ id: 'b', date: placed }]
      })]
    });
    const page = await open('progress.html', { db, hash: '?date=' + due + '&dl=dl-move#schedule' });
    await page.waitFor(function () { return !!document.querySelector('[data-dl-caution-cal]'); },
      { message: 'the deadline popup in its READ view' });
    const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });
    await page.evaluate(function () {
      var pop = document.querySelector('[data-dl-caution-cal]').closest('div.fixed');
      Array.prototype.find.call(pop.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'Edit'; }).click();
      return true;
    });
    await page.waitFor(function () { return !!document.getElementById('dl-due-date'); },
      { message: 'the deadline Edit form' });

    // pull the due day back onto the day BEFORE the block: the block's day is
    // then neither the due day nor a chosen day, so it is stranded
    await page.evaluate(function (setterSrc, day) {
      var set = new Function('return ' + setterSrc)();
      set(document.getElementById('dl-due-date'), day);
      return true;
    }, SET_REACT_INPUT, dayFromToday(-3));

    const warned = await page.waitFor(function () {
      var e = document.querySelector('[data-dl-stranded]');
      return e ? e.textContent.replace(/\s+/g, ' ') : false;
    }, { message: 'the stranded-prep warning' });
    assert.match(warned, new RegExp(placed), 'the offending day is named');
    assert.equal(await page.evaluate(function () {
      var pop = document.getElementById('dl-due-date').closest('div.fixed');
      var save = Array.prototype.find.call(pop.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'Save'; });
      return !!save.disabled;
    }), true, 'Save is refused');

    // clicking it anyway must write nothing
    await page.evaluate(function () {
      var pop = document.getElementById('dl-due-date').closest('div.fixed');
      Array.prototype.find.call(pop.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'Save'; }).click();
      return true;
    });
    await sleep(400);
    assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }), before,
      'and track_db is byte-identical');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* A GAP between two chosen days is the one thing a contiguous span could
     never express, so it is the sharpest test that a surface reads the chosen
     list rather than a range. Asserted SEPARATELY on all three surfaces:
     progress.html carries its own copy of the resolver, and a rule forgotten
     at one of several surfaces is this repository's recurring bug. A doctored
     calendar-core.js must fail the Home and Documentations cases while
     Progress passes, and a doctored progress.html the mirror. */

  await t.test('PROGRESS draws the chosen days and skips the gap between them', async () => {
    const due = thisMonthDay(22);
    const db = seedDb({
      calendarNotes: [],
      deadlines: [F.deadline('d-gap', due,
        { cautionDates: [thisMonthDay(16), thisMonthDay(20)], title: 'Gapped' })]
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    await mountSchedule(page);
    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('#root button'),
        function (b) { return b.textContent.trim() === 'CALENDAR'; }).click();
      return true;
    });
    const marks = await page.waitFor(function () {
      var caution = Array.prototype.map.call(
        document.querySelectorAll('#root [title^="Caution period · due"]'),
        function (e) { return e.closest('[class*="min-h-"]').textContent.trim().slice(0, 2); });
      return caution.length ? caution : false;
    }, { message: 'the month grid drawing the chosen days' });
    const nums = marks.map(x => Number(String(x).replace(/\D/g, ''))).sort((a, b) => a - b);
    assert.deepEqual(nums, [16, 20],
      'exactly the two chosen days — 17, 18 and 19 carry no "!" at all');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('HOME draws the chosen days and skips the gap between them', async () => {
    const due = thisMonthDay(22);
    const db = seedDb({
      calendarNotes: [],
      deadlines: [F.deadline('d-gap', due,
        { cautionDates: [thisMonthDay(16), thisMonthDay(20)], title: 'Gapped' })]
    });
    const page = await open('index.html', { db });
    await page.waitFor(function () {
      var g = document.querySelector('#cal-grid'); return !!g && g.children.length > 0;
    }, { message: 'the Home calendar grid' });
    const readDay = async n => {
      await page.evaluate(function (day) {
        Array.prototype.filter.call(document.querySelectorAll('.cal-cell'),
          function (c) { return !c.classList.contains('empty'); })[day - 1].click();
      }, n);
      return await page.waitFor(function () {
        var d = document.querySelector('#cal-detail');
        return d ? Array.prototype.map.call(d.querySelectorAll('.cal-sched-dl.caution'),
          function (a) { return a.textContent.trim(); }) : false;
      }, { message: 'the Home day detail' });
    };
    assert.equal((await readDay(16)).length, 1, 'the first chosen day carries the "!" chip');
    assert.equal((await readDay(17)).length, 0, 'the gap does NOT');
    assert.equal((await readDay(19)).length, 0, 'nor any other day between them');
    assert.equal((await readDay(20)).length, 1, 'and the second chosen day does');
    assert.equal((await readDay(22)).length, 0, 'the due day is never also a caution');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('DOCUMENTATIONS draws the chosen days and skips the gap between them', async () => {
    const due = thisMonthDay(22);
    const db = seedDb({
      calendarNotes: [],
      docPages: [F.docPage('p-1')],
      deadlines: [F.deadline('d-gap', due,
        { cautionDates: [thisMonthDay(16), thisMonthDay(20)], title: 'Gapped', docPageId: 'p-1' })]
    });
    const page = await open('documentations.html', { db });
    await page.waitFor(function () { return !!document.querySelector('.docs-editor'); },
      { message: 'documentations editor' });
    await addCalendarBlock(page);

    // the amber cell bar, which ownedDates.caution drives
    const barred = await page.waitFor(function () {
      var cells = Array.prototype.filter.call(document.querySelectorAll('.doc-cal .cal-cell'),
        function (c) { return !c.classList.contains('empty'); });
      if (!cells.length) return false;
      return cells.map(function (c, i) {
        return c.classList.contains('cal-doc-caution-day') ? i + 1 : 0;
      }).filter(Boolean);
    }, { message: 'the month grid cell bars' });
    assert.deepEqual(barred, [16, 20], 'only the chosen days get the amber bar');

    // and the "!" row in the day panel, on a chosen day but not on a gap day
    const rowsOn = async n => {
      await selectDay(page, n);
      return await page.evaluate(function () {
        return document.querySelectorAll('.doc-cal .cal-doc-row.caution').length;
      });
    };
    assert.equal(await rowsOn(16), 1, 'the first chosen day lists a caution row');
    assert.equal(await rowsOn(18), 0, 'the gap lists none');
    assert.equal(await rowsOn(20), 1, 'the second chosen day lists one');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* Export → import of the block keys is asserted in "export → import
     preserves docPageId and every canonical field", which drives the REAL
     exporter and importer rather than a stand-in payload. */

  /* ── the Home legend filters the month grid ───────────────────────────────
     Five rows, and they do NOT go through one collector: the four dot
     categories are buildBuckets and the milestone bar is buildMilestoneLanes.
     They are asserted in SEPARATE cases for that reason — a rule forgotten at
     one of two surfaces is this repository's recurring bug, and a single
     assertion lets the forgotten one hide behind a passing sibling.

     The preference is a UI-only browser key. index.html's calendar is
     documented read-only, so the GUARD case at the end asserts the whole
     interaction leaves track_db byte-identical and adds exactly one key. */

  const LEGEND_KEY = 'track_home_cal_hidden';

  /* Everything on ONE day, in the month the calendar opens on. Days 15-22
     exist in every month (see thisMonthDay). populatedSlot is anchored to
     March 2026, so its fixtures are invisible here — every category this case
     reads has to be seeded explicitly.

     The day preview's own kinds are cleared: this case reads only what the
     legend controls, and a leftover deadline chip would blur the assertion.
     The goal task is the exception and is deliberate — it is what the
     '["task"]' clamp variant needs something to fail to hide. */
  const legendDay = thisMonthDay(15);
  const legendDb = () => seedDb({
    kolbs: [F.kolb(1, legendDay, { mmId: 10 })],
    mgChanges: [],
    linChanges: [F.linChange(4, legendDay, { items: [{ id: 1 }] })],
    linDayTitles: {},
    notes: [F.note('n-1', F.localTs(now.getFullYear(), now.getMonth() + 1, 15, 12, 0))],
    sourceDumps: [F.dump('d-1', legendDay)],
    goals: [F.task('g-1', {
      title: 'Root goal',
      milestones: [F.milestone('ms-1', thisMonthDay(14), thisMonthDay(16))],
      children: [F.task('g-1a', { scheduledDate: legendDay, scheduledTime: '08:30', duration: 45 })]
    })],
    saEntries: [], mmEntries: [], sessions: [], mgSchedule: {},
    calendarNotes: [], deadlines: []
  });

  const openLegend = async extra => {
    const page = await open('index.html', { db: legendDb(), extra: extra || null });
    await page.waitFor(function () {
      return !!document.querySelector('[data-cal-legend="note"]');
    }, { message: 'the Home legend toggles' });
    return page;
  };

  /* CLICK_SEL returns false when the selector misses. Ignoring that would let
     a missing control "pass" the click step and fail three assertions later
     for the wrong reason — a named-assertion failure turned into a confusing
     one, which this file already records as the thing to avoid. */
  const clickLegend = async (page, sel) =>
    assert.equal(await page.evaluate(CLICK_SEL, sel), true, 'the control exists: ' + sel);

  /* Wait for the WRITE to land, never for the right answer to appear: a wrong
     result must report itself on an assertion rather than time out. */
  const legendStored = (page, key, want) => page.waitFor(function (a) {
    var raw = localStorage.getItem(a[0]);
    if (raw === null) return false;
    try { return (JSON.parse(raw) || []).indexOf(a[1]) >= 0 === a[2]; } catch (e) { return false; }
  }, { args: [[LEGEND_KEY, key, want]], message: 'the preference reaching ' + LEGEND_KEY });

  /* The day cell's own title is the category labels, which reads far better in
     a failure message than a list of normalised rgb() strings. */
  const legendCell = page => page.evaluate(function (ds) {
    var day = Number(ds.slice(-2));
    var cells = Array.prototype.filter.call(
      document.querySelectorAll('#cal-grid .cal-cell'),
      function (e) { return !e.classList.contains('empty'); });
    var c = cells[day - 1];
    if (!c) return null;
    return {
      title: c.getAttribute('title') || '',
      dots: c.querySelectorAll('.cal-dot').length,
      msLines: document.querySelectorAll('#cal-grid .cal-ms-line').length,
      msCells: document.querySelectorAll('#cal-grid .cal-cell.milestone').length
    };
  }, legendDay);

  const legendPressed = page => page.evaluate(function () {
    var out = {};
    Array.prototype.forEach.call(document.querySelectorAll('[data-cal-legend]'), function (b) {
      out[b.getAttribute('data-cal-legend')] = b.getAttribute('aria-pressed');
    });
    return out;
  });

  const selectLegendDay = page => page.evaluate(function (ds) {
    var day = Number(ds.slice(-2));
    var cells = Array.prototype.filter.call(
      document.querySelectorAll('#cal-grid .cal-cell'),
      function (e) { return !e.classList.contains('empty'); });
    if (!cells[day - 1]) return false;
    cells[day - 1].click();
    return true;
  }, legendDay);

  await t.test('HOME: switching a legend category off removes its dots and its detail rows', async () => {
    const page = await openLegend();
    assert.equal(await selectLegendDay(page), true, 'the seeded day is clickable');

    const before = await legendCell(page);
    assert.equal(before.dots, 4, 'the seeded day starts with all four dot categories');

    await clickLegend(page, '[data-cal-legend="note"]');
    await legendStored(page, 'note', true);

    // the assertion this case is NAMED for, first
    const after = await legendCell(page);
    assert.equal(after.dots, 3, 'the switched-off category no longer draws its dot');
    assert.ok(!/Floating note/.test(after.title), 'and is gone from the cell tooltip');

    // the day detail follows the same filtered bucket, with no extra code
    const detailCats = await page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll('#cal-detail .cal-detail-cat'),
        function (e) { return e.textContent; });
    });
    assert.ok(!detailCats.some(s => /Floating note/.test(s)),
      'and its group is gone from the open day detail');

    // the other three did not go with it
    assert.ok(/Kolb \/ MG change/.test(after.title), 'Kolb / MG change survives');
    assert.ok(/LIN record/.test(after.title), 'LIN record survives');
    assert.ok(/Source dump/.test(after.title), 'Source dump survives');

    /* LAST, deliberately: a page that greys the chip and keeps drawing the
       dots is the likeliest way to ship this wrong, and asserting the chip
       first would let that page pass this case. */
    assert.equal((await legendPressed(page)).note, 'false', 'the row reads as switched off');

    // off AND on — a one-way switch is not a toggle
    await clickLegend(page, '[data-cal-legend="note"]');
    await legendStored(page, 'note', false);
    assert.equal((await legendCell(page)).dots, 4, 'switching it back on restores the dot');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('HOME: switching milestones off removes the period bars and the day highlight', async () => {
    const page = await openLegend();
    const before = await legendCell(page);
    assert.ok(before.msLines > 0, 'the seeded milestone draws bars to begin with');

    await clickLegend(page, '[data-cal-legend="milestone"]');
    await legendStored(page, 'milestone', true);

    // the assertion this case is NAMED for, first
    const after = await legendCell(page);
    assert.equal(after.msLines, 0, 'no milestone bars are drawn');
    /* The cell tint comes from dayLanes.length, so it goes with the bars
       rather than stranding a highlighted cell with nothing in it. */
    assert.equal(after.msCells, 0, 'and no day is left tinted as a milestone day');

    assert.equal(after.dots, 4, 'the milestone key did not leak into the dot categories');

    // the control needed to undo this survives, bar and all
    const still = await page.evaluate(function () {
      var b = document.querySelector('[data-cal-legend="milestone"]');
      return b ? { pressed: b.getAttribute('aria-pressed'), bar: !!b.querySelector('.cal-legend-bar') } : null;
    });
    assert.deepEqual(still, { pressed: 'false', bar: true }, 'the row stays, switched off, with its bar');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('HOME: the legend choice survives a reload, and Show all restores it', async () => {
    const page = await openLegend();
    await clickLegend(page, '[data-cal-legend="note"]');
    await legendStored(page, 'note', true);
    await clickLegend(page, '[data-cal-legend="milestone"]');
    await legendStored(page, 'milestone', true);

    await page.reload();
    await page.skipFirebase();
    await page.waitFor(function () {
      return !!document.querySelector('[data-cal-legend="note"]');
    }, { message: 'the Home legend after a reload' });

    // the assertion this case is NAMED for, first
    const after = await legendCell(page);
    assert.equal(after.dots, 3, 'the switched-off dot category is still hidden after a reload');
    assert.equal(after.msLines, 0, 'and milestones are still hidden');

    assert.deepEqual(await legendPressed(page), {
      milestone: 'false', kolbmg: 'true', lin: 'true', note: 'false', dump: 'true'
    }, 'every row reloads reading the state it was left in');

    const resetOn = await page.evaluate(function () {
      var b = document.querySelector('[data-cal-legend-reset]');
      return b ? !b.disabled : null;
    });
    assert.equal(resetOn, true, 'Show all is available while something is hidden');

    await clickLegend(page, '[data-cal-legend-reset]');
    await page.waitFor(function (k) { return localStorage.getItem(k) === '[]'; },
      { args: [LEGEND_KEY], message: 'Show all clearing the preference' });

    const restored = await legendCell(page);
    assert.equal(restored.dots, 4, 'Show all brings the dots back');
    assert.ok(restored.msLines > 0, 'and the milestone bars');
    assert.deepEqual(await legendPressed(page), {
      milestone: 'true', kolbmg: 'true', lin: 'true', note: 'true', dump: 'true'
    }, 'and every row reads as on again');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('HOME: a corrupt or out-of-scope legend preference hides nothing and cannot white-screen', async () => {
    /* '42' and '{}' are the white-screen class: an unhardened reader hands
       shownFn a non-iterable, `new Set(42)` THROWS out of buildBuckets, out of
       renderCalendar, out of renderSlots — taking the slot list with it.
       'null' survives an unhardened reader by luck, so it is here to pin the
       reader rather than the luck. '["task"]' is the clamp: a key with no
       legend control must hide nothing, or the Home day preview loses its goal
       task with nothing on screen to bring it back.

       '["note",7,{}]' is deliberately the ONE value that still hides something.
       The junk members are dropped WITHOUT switching `note` back on — a reader
       that bailed to [] on the first bad member would look just as "safe" here
       and would silently discard a real preference, so a uniform
       "everything is shown" expectation across all five values would have let
       that through. Each value therefore carries its own expectation. */
    const corrupt = [
      { raw: '42', dots: 4, hidden: [] },
      { raw: '{}', dots: 4, hidden: [] },
      { raw: 'null', dots: 4, hidden: [] },
      { raw: '["task"]', dots: 4, hidden: [] },
      { raw: '["note",7,{}]', dots: 3, hidden: ['note'] }
    ];
    for (const c of corrupt) {
      /* Deliberately NOT openLegend: that waits for the legend, so a page whose
         renderCalendar threw reports a bare "waitFor timed out" — which says the
         control is unreachable and is indistinguishable from it never having
         been built. renderSlots fills #slot-list BEFORE calling renderCalendar,
         so waiting on the slot list proves the page script ran and lets the
         white-screen fail as a NAMED assertion instead of a timeout. */
      const page = await open('index.html', { db: legendDb(), extra: { [LEGEND_KEY]: c.raw } });
      await page.waitFor(function () {
        var el = document.getElementById('slot-list');
        return !!el && el.children.length > 0;
      }, { message: 'the Home page mounting under ' + c.raw });

      assert.equal(await page.evaluate(function () {
        return document.querySelectorAll('[data-cal-legend]').length;
      }), 5, 'the calendar survived the stored value ' + c.raw + ' (it did not throw out of renderCalendar)');

      // the assertion this case is NAMED for, first — and also the proof the page rendered
      const cell = await legendCell(page);
      assert.equal(cell && cell.dots, c.dots, 'dot categories drawn under ' + c.raw);
      assert.ok(cell.msLines > 0, 'and the milestone bars, under ' + c.raw);

      assert.deepEqual(realErrors(page), [], 'no page error under ' + c.raw);

      const want = {};
      ['milestone', 'kolbmg', 'lin', 'note', 'dump'].forEach(k => {
        want[k] = c.hidden.includes(k) ? 'false' : 'true';
      });
      assert.deepEqual(await legendPressed(page), want, 'the rows read correctly under ' + c.raw);

      /* The clamp: a stored key with no legend control must hide nothing, or
         the day preview loses its goal task with nothing on screen to undo it. */
      assert.equal(await selectLegendDay(page), true, 'the seeded day is clickable under ' + c.raw);
      const blocks = await page.evaluate(function () {
        return document.querySelectorAll('#cal-detail .cal-sched-block').length;
      });
      assert.ok(blocks > 0, 'the day preview still draws its goal task under ' + c.raw);

      await page.close();
    }
  });

  /* GUARD — must pass on both sides. Home's calendar is documented read-only,
     and this is the assertion that keeps it that way while it grows its first
     control. It is byte-identical, not a subset of keys: a comparison that
     spelled out the fields would miss activeSlotId or a root key.

     It deliberately does NOT assert track_db_pending is absent. skipFirebase()
     leaves _uid null, so firebase-sync.js's setItem patch never fires for ANY
     key and the assertion could not fail; a test that cannot fail is worse
     than none. That claim rests on reading firebase-sync.js:336-345. */
  await t.test('GUARD: filtering the Home legend writes nothing to track_db', async () => {
    const page = await openLegend();
    const before = await page.evaluate(function () {
      return { db: localStorage.getItem('track_db'), keys: Object.keys(localStorage).sort() };
    });

    for (const k of ['milestone', 'kolbmg', 'lin', 'note', 'dump']) {
      await clickLegend(page, '[data-cal-legend="' + k + '"]');
      await legendStored(page, k, true);
    }
    assert.equal(await selectLegendDay(page), true, 'a day still opens with everything off');
    await clickLegend(page, '[data-cal-legend-reset]');
    await page.waitFor(function (key) { return localStorage.getItem(key) === '[]'; },
      { args: [LEGEND_KEY], message: 'Show all clearing the preference' });

    const after = await page.evaluate(function () {
      return { db: localStorage.getItem('track_db'), keys: Object.keys(localStorage).sort() };
    });

    // the assertion this case is NAMED for, first
    assert.equal(after.db, before.db, 'track_db is byte-identical after the whole interaction');

    /* A DELTA, not an equality: whatever the theme or Firebase left in storage
       before is not this case's business, but an accidental extra write is. */
    assert.deepEqual(after.keys.filter(k => !before.keys.includes(k)), [LEGEND_KEY],
      'exactly one browser key was added, and it is the view preference');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* ── the Documentations sidebar: full screen, and drag by finger ──────────
     The `⠿`/`⇅` handles were desktop-only for two INDEPENDENT reasons, and a
     fix for either one alone leaves them dead on a phone: they are hidden
     behind `group-hover:flex` (a finger raises no hover), and they drive the
     HTML5 drag-and-drop API (which never fires from a touch).

     So the cases below assert the two halves separately — the same reasoning
     that already makes the deadline caution period assert per surface. A
     single "reordering works" case would let one half hide behind the other.

     These synthesise TouchEvents from inside the page, exactly as the
     true-storage arrange case synthesises a DataTransfer. That covers the
     handler logic and NOT real hardware: browser gesture arbitration, scroll
     interception and iOS Safari's own behaviour are still uncovered. */

  const docTreeDb = () => seedDb({
    docPages: [
      F.docPage('p-a',  { title: 'Alpha' }),
      F.docPage('p-a1', { title: 'Alpha one', parentId: 'p-a' }),
      F.docPage('p-a2', { title: 'Alpha two', parentId: 'p-a' }),
      F.docPage('p-b',  { title: 'Bravo' })
    ],
    calendarNotes: [],
    deadlines: []
  });

  /* All of a touch's events go to the element the touch STARTED on, so every
     one is dispatched on the handle and left to bubble — dispatching the move
     on the row under the finger would be a simulation of something a browser
     never does, and would pass against a listener bound to the wrong node. */
  const TOUCH_DRAG = function (pageId, mode, targetId, half, endType) {
    function fire(el, x, y, type) {
      var t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y, pageX: x, pageY: y });
      var live = (type === 'touchend' || type === 'touchcancel') ? [] : [t];
      el.dispatchEvent(new TouchEvent(type, {
        bubbles: true, cancelable: true, composed: true,
        touches: live, targetTouches: live, changedTouches: [t]
      }));
    }
    var handle = document.querySelector('[data-doc-row="' + pageId + '"] [data-doc-handle="' + mode + '"]');
    if (!handle) return 'no ' + mode + ' handle on ' + pageId;
    var target = targetId === null
      ? document.querySelector('[data-doc-root-drop]')
      : document.querySelector('[data-doc-row="' + targetId + '"]');
    if (!target) return 'no target ' + targetId;
    var r = target.getBoundingClientRect();
    var x = r.left + r.width / 2;
    var y = half === 'top' ? r.top + 2 : r.bottom - 2;
    var hr = handle.getBoundingClientRect();
    fire(handle, hr.left + 1, hr.top + 1, 'touchstart');
    fire(handle, x, y, 'touchmove');
    fire(handle, x, y, endType || 'touchend');
    return 'ok';
  };

  const DOC_ORDER = function () {
    var db = JSON.parse(localStorage.getItem('track_db') || '{}');
    return (((db.slots || [])[0] || {}).docPages || [])
      .map(function (p) { return p.id + ':' + (p.parentId || '-'); });
  };

  const openDocTree = async () => {
    const page = await open('documentations.html', { db: docTreeDb() });
    /* These are the DESKTOP sidebar cases and they are the MOUSE path: one
       click on a row opens the page, and the ⠿ ⇅ ＋ ☆ ✕ cluster reveals on
       hover rather than on arming. Nothing is pinned here because nothing needs
       to be — with no touch emulation the page reports `pointer: fine`, which
       is exactly what a desktop reports. That is also why the arm gate is
       `(pointer: coarse)` and not `(hover: none)`: headless Chrome reports
       `(hover: none)` at every viewport and cannot be overridden, so a hover
       gate would have put every one of these cases on the touch path and left
       the mouse path untested. */
    await page.waitFor(function () { return !!document.querySelector('[data-doc-row="p-b"]'); },
      { message: 'the sidebar page tree (with data-doc-row hooks)' });
    return page;
  };

  await t.test('TOUCH: the nest handle drags a page in as the last child', async () => {
    const page = await openDocTree();
    assert.equal(await page.evaluate(TOUCH_DRAG, 'p-b', 'nest', 'p-a', 'mid', 'touchend'), 'ok');

    assert.deepEqual(await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var ids = (((db.slots || [])[0] || {}).docPages || [])
        .map(function (p) { return p.id + ':' + (p.parentId || '-'); });
      return ids.indexOf('p-b:p-a') >= 0 ? ids : false;
    }, { message: 'the touch nest being saved' }),
      ['p-a:-', 'p-a1:p-a', 'p-a2:p-a', 'p-b:p-a'],
      'the dragged page became the LAST child, not the first');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('TOUCH: the arrange handle reorders siblings by midpoint', async () => {
    const page = await openDocTree();
    // upper half of p-a1 => land immediately BEFORE it
    assert.equal(await page.evaluate(TOUCH_DRAG, 'p-a2', 'arrange', 'p-a1', 'top', 'touchend'), 'ok');

    assert.deepEqual(await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var ids = (((db.slots || [])[0] || {}).docPages || [])
        .map(function (p) { return p.id + ':' + (p.parentId || '-'); });
      return ids[1] === 'p-a2:p-a' ? ids : false;
    }, { message: 'the touch arrange being saved' }),
      ['p-a:-', 'p-a2:p-a', 'p-a1:p-a', 'p-b:-'],
      'the sibling moved before its sibling and kept its parent');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('TOUCH: a drag into the page\'s own subtree is refused', async () => {
    /* The one case that proves the touch path goes THROUGH docDescendantIds
       rather than around it. A parentId cycle makes the whole subtree
       unreachable from every root — there is no undo for that. */
    const page = await openDocTree();
    const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });
    assert.equal(await page.evaluate(TOUCH_DRAG, 'p-a', 'nest', 'p-a1', 'mid', 'touchend'), 'ok');
    await sleep(400);
    assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }), before,
      'a page cannot be nested into its own child, and track_db is byte-identical');
    assert.deepEqual(await page.evaluate(DOC_ORDER), ['p-a:-', 'p-a1:p-a', 'p-a2:p-a', 'p-b:-']);
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('TOUCH: touchcancel abandons the drag and writes nothing', async () => {
    /* iPadOS fires touchcancel instead of touchend whenever it takes the
       gesture over — a system swipe, a notification. Committing on that would
       move a page the user was only passing over. */
    const page = await openDocTree();
    const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });
    assert.equal(await page.evaluate(TOUCH_DRAG, 'p-b', 'nest', 'p-a', 'mid', 'touchcancel'), 'ok');
    await sleep(400);
    assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }), before,
      'an interrupted drag leaves track_db byte-identical');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('the handles opt out of the browser pan gesture', async () => {
    /* What remains of the old "reachable without a hover-capable pointer" case.
       That case asserted a @media (hover: none) rule existed showing the
       cluster PERMANENTLY; the cluster is now revealed by arming instead, and
       reachability is covered behaviourally under real touch emulation by
       PHONE/DOCUMENTATIONS below — which is a stronger check than reading a
       rule, because it measures a rect rather than a stylesheet.

       This half is still worth its own case: the handle must claim the gesture
       from the scroller, or a drag scrolls the sidebar instead. */
    const page = await openDocTree();
    const touchAction = await page.evaluate(function () {
      var h = document.querySelector('[data-doc-handle="arrange"]');
      return h ? getComputedStyle(h).touchAction : null;
    });
    assert.equal(touchAction, 'none', 'the drag handle claims the gesture from the scroller');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('the sidebar expands to full screen and closes on picking a page', async () => {
    const page = await openDocTree();
    assert.equal(await page.evaluate(function () {
      return !!document.querySelector('.docs-sidebar-full');
    }), false, 'it does not start expanded');

    await page.evaluate(function () { document.querySelector('[data-doc-fullscreen]').click(); });
    await page.waitFor(function () { return !!document.querySelector('.docs-sidebar-full'); },
      { message: 'the sidebar expanding to full screen' });

    const box = await page.evaluate(function () {
      var r = document.querySelector('.docs-sidebar-full').getBoundingClientRect();
      return { w: Math.round(r.width), vw: window.innerWidth };
    });
    assert.ok(box.w > 240, 'it is wider than the 240px column (' + box.w + 'px)');
    assert.equal(box.w, box.vw, 'and fills the viewport width');

    await page.evaluate(function () { document.querySelector('[data-doc-row="p-b"]').click(); });
    await page.waitFor(function () { return !document.querySelector('.docs-sidebar-full'); },
      { message: 'picking a page closing full screen' });
    /* The editor renders the title as an <input>, whose value is NOT part of
       textContent — reading the panel's text here would report an empty string
       and "fail" against a page that opened correctly. */
    assert.equal(await page.evaluate(function () {
      var i = document.querySelector('.docs-editor input[placeholder="Untitled"]');
      return i ? i.value : null;
    }), 'Bravo', 'and the picked page is the one now open in the editor');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('GUARD: the desktop mouse drag still nests and arranges', async () => {
    /* Must pass on BOTH sides of this change. The touch path is additive; if
       this ever fails, adding touch has cost the laptop its drag. */
    const page = await openDocTree();
    const MOUSE_DRAG = function (draggedId, kind, targetId, half) {
      var row = document.querySelector('[data-doc-row="' + targetId + '"]');
      var r = row.getBoundingClientRect();
      var y = half === 'top' ? r.top + 2 : r.bottom - 2;
      var dt = new DataTransfer();
      dt.setData('application/docpage-' + kind + '-id', draggedId);
      ['dragover', 'drop'].forEach(function (type) {
        row.dispatchEvent(new DragEvent(type, {
          bubbles: true, cancelable: true, dataTransfer: dt, clientY: y
        }));
      });
      return true;
    };

    await page.evaluate(MOUSE_DRAG, 'p-a2', 'arrange', 'p-a1', 'top');
    assert.deepEqual(await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var ids = (((db.slots || [])[0] || {}).docPages || [])
        .map(function (p) { return p.id + ':' + (p.parentId || '-'); });
      return ids[1] === 'p-a2:p-a' ? ids : false;
    }, { message: 'the mouse arrange being saved' }),
      ['p-a:-', 'p-a2:p-a', 'p-a1:p-a', 'p-b:-'], 'mouse arrange still works');

    await page.evaluate(MOUSE_DRAG, 'p-b', 'nest', 'p-a', 'mid');
    assert.deepEqual(await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var ids = (((db.slots || [])[0] || {}).docPages || [])
        .map(function (p) { return p.id + ':' + (p.parentId || '-'); });
      return ids.indexOf('p-b:p-a') >= 0 ? ids : false;
    }, { message: 'the mouse nest being saved' }),
      ['p-a:-', 'p-a2:p-a', 'p-a1:p-a', 'p-b:p-a'], 'mouse nest still works');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* ── the Task Priority matrix, by finger ─────────────────────────────────
     The same failure as the Documentations sidebar tree above, in a second
     place: the matrix chips drive the HTML5 drag-and-drop API, which never
     fires from a touch, so on a phone a task can be SEEN in its quadrant and
     never moved out of it.

     The touch path drives the SAME mutator the mouse does, handleMatrixDrop,
     so the insert-before ordering and the trackPriorityMatrix write have one
     definition and cannot drift between pointer kinds. That is why there is no
     doctored baseline here and no per-surface argument to make — unlike the
     deadline caution predicate, which needed one assertion per surface
     precisely BECAUSE it was spelled at three sites.

     The interaction model is the SCHEDULE's, deliberately, not the sidebar's:
     tap to arm, then swipe the armed chip. A handle is an unambiguous grab
     affordance and can start a drag at once; a whole chip is not, and an
     unarmed one has to keep letting the finger scroll its quadrant list. The
     UNARMED guard below is what pins that half.

     These synthesise TouchEvents from inside the page, exactly as the doc-tree
     cases above do. That covers handler logic and NOT real hardware: gesture
     arbitration, scroll interception, momentum and iOS Safari's own behaviour
     are all still uncovered. */

  const matrixDay = dayFromToday(0);

  const matrixDb = () => seedDb({
    goals: [
      F.task('g-p1', { title: 'Priority one',   scheduledDate: matrixDay, scheduledTime: '09:00', duration: 60 }),
      F.task('g-p2', { title: 'Priority two',   scheduledDate: matrixDay, scheduledTime: '10:00', duration: 60 }),
      F.task('g-p3', { title: 'Priority three', scheduledDate: matrixDay, scheduledTime: '11:00', duration: 60 })
    ],
    // the matrix collects tasks, SA entries and MM entries for the focused day;
    // emptying the other two keeps matrixDayIds exactly these three
    saEntries: [], mmEntries: [], calendarNotes: [], deadlines: []
  });

  /* Seeded rather than left to the page's own first-run effect, which stamps
     `order` from Date.now() — an assertion about ORDER would otherwise depend
     on the millisecond the page happened to mount. */
  const MATRIX_SEED = JSON.stringify({
    'g-p1': { quadrant: 'ui',  order: 0 },
    'g-p2': { quadrant: 'ui',  order: 100 },
    'g-p3': { quadrant: 'niu', order: 0 }
  });

  /* `?date=` is what puts the timeline in DAY mode (it is week mode otherwise),
     and the matrix panel exists in day mode only. The viewport is pinned
     because every case here drops by coordinate through elementFromPoint: at
     Chrome's headless 800x600 default the four quadrants are small enough that
     a chip and a quadrant body start competing for the same few pixels. */
  const openMatrix = async () => {
    const page = await browser.newPage();
    await page.clearStorage(server.origin);
    await page.seed(matrixDb(), { trackPriorityMatrix: MATRIX_SEED });
    await page.setViewport(1280, 900);
    await page.goto(server.url('progress.html') + '?date=' + matrixDay + '#schedule');
    await page.skipFirebase();
    await page.waitFor(function () { return !!document.querySelector('[data-matrix-row="g-p1"]'); },
      { message: 'the Task Priority chips (with data-matrix-row hooks)' });
    return page;
  };

  /* All of a touch's events go to the element the touch STARTED on, so every
     one is dispatched on the chip and left to bubble — dispatching the move on
     whatever is under the finger would simulate something a browser never does
     and would pass against a listener bound to the wrong node. */
  const MATRIX_TOUCH = function (chipId, targetSel, kind) {
    function fire(el, x, y, type) {
      var t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y, pageX: x, pageY: y });
      var live = (type === 'touchend' || type === 'touchcancel') ? [] : [t];
      el.dispatchEvent(new TouchEvent(type, {
        bubbles: true, cancelable: true, composed: true,
        touches: live, targetTouches: live, changedTouches: [t]
      }));
    }
    var chip = document.querySelector('[data-matrix-row="' + chipId + '"]');
    if (!chip) return 'no chip ' + chipId;
    var cr = chip.getBoundingClientRect();
    var sx = cr.left + cr.width / 2, sy = cr.top + cr.height / 2;
    if (kind === 'tap') {
      fire(chip, sx, sy, 'touchstart');
      fire(chip, sx, sy, 'touchend');
      return 'ok';
    }
    var target = document.querySelector(targetSel);
    if (!target) return 'no target ' + targetSel;
    var r = target.getBoundingClientRect();
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    fire(chip, sx, sy, 'touchstart');
    fire(chip, x, y, 'touchmove');
    fire(chip, x, y, kind === 'cancel' ? 'touchcancel' : 'touchend');
    return 'ok';
  };

  const MATRIX_ARMED = function (id) {
    var c = document.querySelector('[data-matrix-row="' + id + '"]');
    return !!c && c.className.indexOf('ring-cyan-400') >= 0;
  };

  const MATRIX_RAW = function () { return localStorage.getItem('trackPriorityMatrix'); };

  /* Quadrant plus the order the chips are actually DRAWN in. An `order` number
     alone can be read two ways; what a reorder has to change is the sequence
     on screen. */
  const MATRIX_ROWS = function () {
    return Array.prototype.map.call(
      document.querySelectorAll('[data-matrix-quadrant]'),
      function (q) {
        return q.getAttribute('data-matrix-quadrant') + ':' +
          Array.prototype.map.call(q.querySelectorAll('[data-matrix-row]'), function (r) {
            return r.getAttribute('data-matrix-row');
          }).join(',');
      }).join(' | ');
  };

  const armMatrixChip = async (page, id) => {
    assert.equal(await page.evaluate(MATRIX_TOUCH, id, null, 'tap'), 'ok');
    await page.waitFor(MATRIX_ARMED, { args: [id], message: 'chip ' + id + ' showing the armed ring' });
  };

  await t.test('TOUCH: a tap arms a priority chip, and tapping it again un-arms it', async () => {
    const page = await openMatrix();
    const before = await page.evaluate(MATRIX_RAW);
    assert.equal(await page.evaluate(MATRIX_ARMED, 'g-p1'), false, 'it does not start armed');

    await armMatrixChip(page, 'g-p1');

    assert.equal(await page.evaluate(MATRIX_TOUCH, 'g-p1', null, 'tap'), 'ok');
    await page.waitFor(function (id) {
      var c = document.querySelector('[data-matrix-row="' + id + '"]');
      return !!c && c.className.indexOf('ring-cyan-400') < 0;
    }, { args: ['g-p1'], message: 'a second tap clearing the armed ring' });

    // arming is a selection, not an edit
    assert.equal(await page.evaluate(MATRIX_RAW), before,
      'arming and un-arming wrote nothing — trackPriorityMatrix is byte-identical');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('TOUCH: an armed chip swiped into another quadrant is filed there', async () => {
    const page = await openMatrix();
    await armMatrixChip(page, 'g-p1');
    assert.equal(await page.evaluate(MATRIX_TOUCH, 'g-p1',
      '[data-matrix-quadrant="nuni"] [data-matrix-list]', 'drag'), 'ok');

    const after = await page.waitFor(function () {
      var m; try { m = JSON.parse(localStorage.getItem('trackPriorityMatrix') || '{}'); } catch (e) { return false; }
      return (m['g-p1'] || {}).quadrant === 'nuni' ? m : false;
    }, { message: 'the touch drop reaching trackPriorityMatrix' });

    assert.equal(after['g-p2'].quadrant, 'ui',   'the chip left behind kept its quadrant');
    assert.equal(after['g-p3'].quadrant, 'niu',  'and an untouched quadrant is untouched');
    assert.match(await page.evaluate(MATRIX_ROWS), /nuni:g-p1/,
      'the chip is drawn in the quadrant it was dropped on');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('TOUCH: an armed chip dropped on a row lands before it', async () => {
    /* The one case that proves the touch path goes THROUGH handleMatrixDrop's
       insert-before rule rather than appending on its own. g-p3 sits alone in
       `niu`, so landing before it is unambiguous. */
    const page = await openMatrix();
    await armMatrixChip(page, 'g-p1');
    assert.equal(await page.evaluate(MATRIX_TOUCH, 'g-p1', '[data-matrix-row="g-p3"]', 'drag'), 'ok');

    await page.waitFor(function () {
      var m; try { m = JSON.parse(localStorage.getItem('trackPriorityMatrix') || '{}'); } catch (e) { return false; }
      return (m['g-p1'] || {}).quadrant === 'niu';
    }, { message: 'the touch drop onto a row reaching trackPriorityMatrix' });

    assert.match(await page.evaluate(MATRIX_ROWS), /niu:g-p1,g-p3/,
      'the dropped chip landed BEFORE the row it was dropped on, not after it');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('GUARD: an UNARMED chip swiped writes nothing', async () => {
    /* Stage one of the two-stage model is the entire reason a finger can still
       scroll a quadrant list. This is trivially true while touch does nothing
       at all, and only becomes meaningful once the drag works — it is here to
       catch a later "simplification" into drag-immediately, which would take
       the scroll gesture away with nothing else in the suite noticing. */
    const page = await openMatrix();
    const before = await page.evaluate(MATRIX_RAW);
    assert.equal(await page.evaluate(MATRIX_TOUCH, 'g-p1',
      '[data-matrix-quadrant="nuni"] [data-matrix-list]', 'drag'), 'ok');
    await sleep(400);
    assert.equal(await page.evaluate(MATRIX_RAW), before,
      'an unarmed chip does not move, and trackPriorityMatrix is byte-identical');
    assert.match(await page.evaluate(MATRIX_ROWS), /ui:g-p1,g-p2/, 'and it is still drawn where it was');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('GUARD: touchcancel abandons a matrix drag and writes nothing', async () => {
    /* iPadOS fires touchcancel instead of touchend whenever the system takes
       the gesture over — an edge swipe, a notification. Committing there would
       re-file a task the finger was only passing across. Also trivially true
       until the drag works. */
    const page = await openMatrix();
    await armMatrixChip(page, 'g-p1');
    const before = await page.evaluate(MATRIX_RAW);
    assert.equal(await page.evaluate(MATRIX_TOUCH, 'g-p1',
      '[data-matrix-quadrant="nuni"] [data-matrix-list]', 'cancel'), 'ok');
    await sleep(400);
    assert.equal(await page.evaluate(MATRIX_RAW), before,
      'an interrupted drag leaves trackPriorityMatrix byte-identical');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('GUARD: the desktop mouse drag still files a priority chip', async () => {
    /* Must pass on BOTH sides of this change. The touch path is additive; if
       this ever fails, adding touch has cost the laptop its drag.

       dragstart and drop are dispatched in SEPARATE evaluates on purpose:
       dragstart only calls setMatrixDragId, and a drop fired in the same
       synchronous block would read the pre-render value and bail. A real
       pointer puts many frames between the two. */
    const page = await openMatrix();
    assert.equal(await page.evaluate(function (id) {
      var chip = document.querySelector('[data-matrix-row="' + id + '"]');
      if (!chip) return 'no chip';
      window.__mdt = new DataTransfer();
      chip.dispatchEvent(new DragEvent('dragstart',
        { bubbles: true, cancelable: true, dataTransfer: window.__mdt }));
      return 'ok';
    }, 'g-p1'), 'ok');
    await sleep(150);
    assert.equal(await page.evaluate(function (sel) {
      var target = document.querySelector(sel);
      if (!target) return 'no target';
      ['dragover', 'drop'].forEach(function (type) {
        target.dispatchEvent(new DragEvent(type,
          { bubbles: true, cancelable: true, dataTransfer: window.__mdt }));
      });
      return 'ok';
    }, '[data-matrix-quadrant="uni"]'), 'ok');

    await page.waitFor(function () {
      var m; try { m = JSON.parse(localStorage.getItem('trackPriorityMatrix') || '{}'); } catch (e) { return false; }
      return (m['g-p1'] || {}).quadrant === 'uni';
    }, { message: 'the mouse drop reaching trackPriorityMatrix' });
    assert.match(await page.evaluate(MATRIX_ROWS), /uni:g-p1/, 'mouse drag still files a chip');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* ── tapping empty space un-arms ─────────────────────────────────────────
     The two-stage touch model had exactly one documented way OUT of stage
     one: tap the armed thing again. Tapping empty space did nothing, so an
     armed block stayed ringed until the user found it again — the "click away
     to cancel" convention every other selection in this app honours, missing
     on the two surfaces that are only reachable by finger.

     The clear sits on the wrapper holding BOTH the timeline and the Task
     Priority panel, so one definition covers every empty surface in the
     Schedule view. That makes each block's and chip's
     `onClick={e => e.stopPropagation()}` LOAD-BEARING FOR ARMING: without it a
     tap arms on touchend and the click a real browser synthesizes immediately
     un-arms again. The two GUARD cases below exist solely to catch that being
     tidied away, and they pass on both sides by design.

     The timeline and the matrix are asserted SEPARATELY. They are one model in
     the docs and two code paths in the page, which is precisely the shape that
     has cost this project a forgotten predicate before.                     */

  /* A real tap ends in a synthesized CLICK. A dispatched TouchEvent does not
     produce one, so it is fired by hand here — without it these cases would
     never exercise the bubbling path they exist for, and would pass just as
     happily against an element that had lost its stopPropagation. */
  const TAP_REAL = function (sel) {
    function fire(el, x, y, type) {
      var t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y, pageX: x, pageY: y });
      var live = type === 'touchend' ? [] : [t];
      el.dispatchEvent(new TouchEvent(type, {
        bubbles: true, cancelable: true, composed: true,
        touches: live, targetTouches: live, changedTouches: [t]
      }));
    }
    var el = document.querySelector(sel);
    if (!el) return 'no element ' + sel;
    el.scrollIntoView({ block: 'center' });
    var r = el.getBoundingClientRect();
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    fire(el, x, y, 'touchstart');
    fire(el, x, y, 'touchend');
    el.click();
    return 'ok';
  };

  const ARMED_SEL = function (sel) {
    var e = document.querySelector(sel);
    return !!e && e.className.indexOf('ring-cyan-400') >= 0;
  };

  /* Both clickers go through elementFromPoint rather than dispatching at the
     handler's own node. Dispatching there would pass even if the click never
     bubbled out of a block, which is the entire thing these cases are about.
     The point is checked to be outside every block and chip FIRST, so a
     mis-aimed click fails loudly instead of quietly proving nothing. */
  const CLICK_EMPTY_GRID = function (id, dy) {
    var b = document.querySelector('[data-block-id="' + id + '"]');
    if (!b) return 'no block ' + id;
    var r = b.getBoundingClientRect();
    var el = document.elementFromPoint(r.left + r.width / 2, r.bottom + dy);
    if (!el) return 'nothing at the point';
    if (el.closest('[data-block-kind]')) return 'the point is inside a block: ' + el.className;
    el.click();
    return 'ok';
  };

  const CLICK_EMPTY_IN = function (sel) {
    var box = document.querySelector(sel);
    if (!box) return 'no element ' + sel;
    var r = box.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return 'the element has no area';
    var el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!el) return 'nothing at the point';
    if (el.closest('[data-matrix-row]')) return 'the point is inside a chip: ' + el.className;
    el.click();
    return 'ok';
  };

  /* Week mode, so the timeline is the full width and the point below the block
     is unambiguously timeline. A day note is used because the day-note and
     deadline blocks are the ones carrying data-block-* hooks. */
  const openArmedSchedule = async () => {
    const page = await browser.newPage();
    await page.clearStorage(server.origin);
    await page.seed(seedDb({
      calendarNotes: [F.calNote('n-arm', TODAY, { title: 'Armed note', time: '09:00', parts: [BLOCK] })]
    }));
    await page.setViewport(1280, 900);
    await page.goto(server.url('progress.html') + '#schedule');
    await page.skipFirebase();
    await mountSchedule(page);
    await page.waitFor(function () { return !!document.querySelector('[data-block-id="n-arm:b"]'); },
      { message: 'the seeded note block' });
    return page;
  };

  await t.test('TOUCH: tapping empty grid space un-arms a schedule block', async () => {
    const page = await openArmedSchedule();
    const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });
    assert.equal(await page.evaluate(ARMED_SEL, '[data-block-id="n-arm:b"]'), false,
      'it does not start armed');

    assert.equal(await page.evaluate(TAP_REAL, '[data-block-id="n-arm:b"]'), 'ok');
    await page.waitFor(ARMED_SEL, { args: ['[data-block-id="n-arm:b"]'],
      message: 'the block showing the armed ring' });

    /* The named assertion, and the only one here that can fail pre-fix —
       everything above passes on both sides. A plain assert rather than a
       waitFor, so the failure reads `true !== false` against this message
       instead of a timeout that could equally mean the case went blind. */
    assert.equal(await page.evaluate(CLICK_EMPTY_GRID, 'n-arm:b', 40), 'ok');
    await sleep(300);
    assert.equal(await page.evaluate(ARMED_SEL, '[data-block-id="n-arm:b"]'), false,
      'tapping empty grid space cleared the armed ring');

    // arming and un-arming are selection, not edits
    assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }), before,
      'selection wrote nothing — track_db is byte-identical');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('TOUCH: tapping empty space un-arms a priority chip', async () => {
    const page = await openMatrix();
    const before = await page.evaluate(MATRIX_RAW);

    assert.equal(await page.evaluate(TAP_REAL, '[data-matrix-row="g-p1"]'), 'ok');
    await page.waitFor(MATRIX_ARMED, { args: ['g-p1'], message: 'chip g-p1 showing the armed ring' });

    // `nuni` is seeded empty, so its list body is unambiguously empty space
    assert.equal(await page.evaluate(CLICK_EMPTY_IN,
      '[data-matrix-quadrant="nuni"] [data-matrix-list]'), 'ok');
    await sleep(300);
    assert.equal(await page.evaluate(MATRIX_ARMED, 'g-p1'), false,
      'tapping an empty quadrant cleared the armed ring');

    assert.equal(await page.evaluate(MATRIX_RAW), before,
      'selection wrote nothing — trackPriorityMatrix is byte-identical');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('GUARD: a tap on a schedule block does not un-arm it', async () => {
    /* Passes on BOTH sides by design. Pre-fix the wrapper had no clear to
       reach, so this was trivially true; post-fix it is the thing standing
       between tap-to-arm and a click that bubbles out of the block and
       cancels the arming it just did. Stage three is asserted in the same
       case, because a "fix" that broke it would otherwise look identical. */
    const page = await openArmedSchedule();

    assert.equal(await page.evaluate(TAP_REAL, '[data-block-id="n-arm:b"]'), 'ok');
    await sleep(300);
    assert.equal(await page.evaluate(ARMED_SEL, '[data-block-id="n-arm:b"]'), true,
      'one tap arms the block, and the block\'s own click does not clear it');

    assert.equal(await page.evaluate(TAP_REAL, '[data-block-id="n-arm:b"]'), 'ok');
    await sleep(300);
    assert.equal(await page.evaluate(ARMED_SEL, '[data-block-id="n-arm:b"]'), false,
      're-tapping the armed block still un-arms it');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('GUARD: a tap on a priority chip does not un-arm it', async () => {
    // The chip half of the case above. The chip had no onClick at all before
    // this change, so this is the one asserting the added stopPropagation.
    const page = await openMatrix();

    assert.equal(await page.evaluate(TAP_REAL, '[data-matrix-row="g-p1"]'), 'ok');
    await sleep(300);
    assert.equal(await page.evaluate(MATRIX_ARMED, 'g-p1'), true,
      'one tap arms the chip, and the chip\'s own click does not clear it');

    assert.equal(await page.evaluate(TAP_REAL, '[data-matrix-row="g-p1"]'), 'ok');
    await sleep(300);
    assert.equal(await page.evaluate(MATRIX_ARMED, 'g-p1'), false,
      're-tapping the armed chip still un-arms it');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* ── the day-header buttons are REACHABLE, not merely present ────────────
     Every other case in this file clicks through `el.click()`, which ignores
     hit testing entirely and so cannot see a control that is painted under
     something else. That is exactly the shape of the bug these two cases
     exist for: in WEEK mode the day column is pinned to its minimum, and the
     four-button row used to live in the centre section, which gets whatever
     the two side strips leave it. Flex items paint as atomic units in document
     order, so the row spilling LEFT stayed on top of the SIR strip and kept
     working, while the same row spilling RIGHT went under the notes strip —
     visible, because that strip has no background, and completely dead to a
     tap. Only the fourth button, `☰`, was lost.

     The four are now ★ Forced, ● Learn, ▲ Chosen and ■ Core Routine (2026-10-14);
     `★` is the old `☰` panel under its new name, and still the button
     HEADER_BUTTONS finds the row through.

     These cases outlived two different fixes, which is the point of keeping
     them: the first bought room by widening the column to 228px, the second
     moved the block onto its own full-width row and took the column back to
     140px. They assert the SYMPTOM is gone, so they survive the mechanism
     changing underneath them — and them staying green through that revert is
     the evidence the narrower column did not bring the bug back.

     Each button is therefore asserted SEPARATELY through elementFromPoint. A
     single "all four are fine" assertion would let the one forgotten surface
     hide behind three passing siblings, which is this repository's recurring
     bug. */
  const HEADER_BUTTONS = function (ds) {
    var forced = document.querySelector('[data-dln-open="' + ds + '"]');
    if (!forced) return null;
    var row  = forced.parentElement;
    var cell = row.closest('.relative');
    var scroller = row.closest('.overflow-auto');
    // The notes-and-caution strip, by its own hook rather than by a structural
    // walk. It used to be reached as row → centre → strip row → lastElementChild,
    // which stops meaning anything the moment the button row moves out of the
    // centre: it would resolve to the last DAY COLUMN, whose width is always
    // >60px, and the long-title precondition below would pass for the wrong
    // reason. A case that cannot fail against the bug it names proves nothing.
    var strip = cell.querySelector('[data-day-strip]');
    var cr = cell.getBoundingClientRect();
    var rr = row.getBoundingClientRect();
    var sr = strip.getBoundingClientRect();
    return {
      pinned: !!scroller && scroller.scrollWidth > scroller.clientWidth,
      cell:  { left: Math.round(cr.left), right: Math.round(cr.right), width: Math.round(cr.width) },
      row:   { left: Math.round(rr.left), right: Math.round(rr.right), width: Math.round(rr.width) },
      strip: { left: Math.round(sr.left), right: Math.round(sr.right), width: Math.round(sr.width) },
      buttons: Array.prototype.map.call(row.children, function (b) {
        var r  = b.getBoundingClientRect();
        var el = document.elementFromPoint(Math.round(r.left + r.width / 2),
                                           Math.round(r.top + r.height / 2));
        return {
          label: (b.textContent || '').trim(),
          width: Math.round(r.width),
          left: Math.round(r.left), right: Math.round(r.right),
          top: Math.round(r.top),
          hit: !el ? 'nothing'
             : (el === b || b.contains(el)) ? 'self'
             : el.tagName.toLowerCase() +
               (el.className ? '.' + String(el.className).trim().split(/\s+/).slice(0, 3).join('.') : '')
        };
      })
    };
  };

  // `anchor` starts at today, so today is the FIRST week column and sits at
  // scrollLeft 0 — no horizontal scrolling is needed to bring it into view,
  // and elementFromPoint would return null for a point outside the viewport.
  const measureHeader = async db => {
    const p = await open('progress.html', { db, hash: '#schedule' });
    await p.setViewport(820, 1180);          // an iPad, the device this was reported on
    await mountSchedule(p);
    const m = await p.waitFor(HEADER_BUTTONS, { args: [TODAY], message: "today's day-header buttons" });
    return { page: p, m, byLabel: Object.fromEntries(m.buttons.map(b => [b.label, b])) };
  };

  await t.test('PROGRESS: every day-header button is hit-testable at the week column width', async () => {
    const { page, m, byLabel } = await measureHeader(seedDb());

    assert.equal(m.pinned, true,
      'the week columns are at their minimum width — the precondition this case is about');
    assert.deepEqual(m.buttons.map(b => b.label), ['★', '●', '▲', '■'],
      'all four buttons render, in the user\'s order');

    // separately, one per button: the whole point is that three of them pass
    assert.equal(byLabel['★'].hit, 'self',
      'the ★ Forced browser takes its own tap (hit ' + byLabel['★'].hit + ')');
    assert.equal(byLabel['●'].hit, 'self', 'the ● Learn panel takes its own tap (hit ' + byLabel['●'].hit + ')');
    assert.equal(byLabel['▲'].hit, 'self', 'the ▲ Chosen picker takes its own tap (hit ' + byLabel['▲'].hit + ')');
    assert.equal(byLabel['■'].hit, 'self',
      'the ■ Core Routine panel takes its own tap (hit ' + byLabel['■'].hit + ')');

    for (const label of ['★', '●', '▲', '■']) {
      assert.ok(byLabel[label].width >= 24,
        label + ' is not squashed down to its glyph (' + byLabel[label].width + 'px)');
    }
    assert.ok(m.row.left >= m.cell.left && m.row.right <= m.cell.right,
      'the button row stays inside its own day column (row ' + m.row.left + '–' + m.row.right +
      ', column ' + m.cell.left + '–' + m.cell.right + ')');

    // and the user's actual action: tap where the ★ is drawn, not the element
    await page.evaluate(function (ds) {
      var b = document.querySelector('[data-dln-open="' + ds + '"]');
      var r = b.getBoundingClientRect();
      var el = document.elementFromPoint(Math.round(r.left + r.width / 2),
                                         Math.round(r.top + r.height / 2));
      if (el) el.click();
      return true;
    }, TODAY);
    await page.waitFor(function () { return !!document.querySelector('[data-dln-panel]'); },
      { message: 'the Forced panel opening from a tap at the ★ position' });

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('PROGRESS: a long note title cannot push a day-header button out of reach', async () => {
    /* The notes strip sizes to its content up to 110px, and a long title is
       what used to take that width straight back off the button row — first
       reaching under the strip, then, at the strip's full 110px, far enough the
       other way to reach the opaque sticky time column and take `+` as well.

       The row no longer shares a flex line with the strip at all, so this now
       asserts an invariant rather than a balance: stretch the strip as far as
       it goes and every button is still hit-testable. The strip measurement
       below is the precondition — without a strip actually past 60px this case
       is not testing the squeeze it names. */
    const db = seedDb({
      calendarNotes: [F.calNote('n-long', TODAY,
        { title: 'A deliberately long untimed note title that stretches the strip' })],
      deadlines: [F.deadline('d-long', dayFromToday(2),
        { cautionDates: [TODAY], time: '17:00', title: 'A long deadline title for the caution row' })]
    });
    const { page, m, byLabel } = await measureHeader(db);

    assert.ok(m.strip.width > 60,
      'the long title really did stretch the notes strip past its 60px minimum (' +
      m.strip.width + 'px) — without that this case is not testing the squeeze it names');
    assert.equal(byLabel['★'].hit, 'self',
      'the ★ Forced browser still takes its own tap (hit ' + byLabel['★'].hit + ')');
    assert.equal(byLabel['●'].hit, 'self', 'the ● Learn panel still takes its own tap (hit ' + byLabel['●'].hit + ')');
    assert.equal(byLabel['▲'].hit, 'self', 'the ▲ Chosen picker still takes its own tap (hit ' + byLabel['▲'].hit + ')');
    assert.equal(byLabel['■'].hit, 'self',
      'the ■ Core Routine panel still takes its own tap (hit ' + byLabel['■'].hit + ')');
    assert.ok(m.row.right <= m.cell.right,
      'the row wrapped inside the column instead of spilling under the strip (row right ' +
      m.row.right + ', column right ' + m.cell.right + ')');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('PROGRESS: the day-header buttons stack two to a row at the week column width', async () => {
    /* The reachability fix above was arithmetic — widen the column until the
       one-line row fits. This is the structural replacement: the block spans
       the whole day column instead of sharing a flex row with the two side
       strips, so nothing can squeeze it and the column goes back to 140px.

       Grouping by `top` rather than counting children is the point. Four
       buttons in one container is true of BOTH layouts; only the number of
       lines they are drawn on distinguishes a 2×2 block from a row of four,
       exactly as `data-block-day` had to be added once before because the
       right ids at the right times were true on the wrong day. */
    const { page, m, byLabel } = await measureHeader(seedDb());

    assert.equal(m.pinned, true,
      'the week columns are still at their minimum — the precondition this case is about');
    const rows = [];
    m.buttons.forEach(b => {
      const row = rows.find(r => Math.abs(r.top - b.top) <= 4);
      if (row) row.labels.push(b.label);
      else rows.push({ top: b.top, labels: [b.label] });
    });
    rows.sort((a, b) => a.top - b.top);

    assert.equal(rows.length, 2,
      'the four buttons are drawn on TWO lines, not one (' +
      rows.map(r => r.labels.join('')).join(' / ') + ')');
    assert.deepEqual(rows[0].labels, ['★', '●'], '★ Forced and ● Learn share the first row');
    assert.deepEqual(rows[1].labels, ['▲', '■'], '▲ Chosen and ■ Core Routine are the second row');

    assert.ok(m.cell.width <= 145,
      'the day column is back at its 140px minimum (' + m.cell.width + 'px)');

    // stacking REPLACES the widening; it must not trade one dead button for another
    assert.equal(byLabel['★'].hit, 'self', 'the ★ Forced browser takes its own tap (hit ' + byLabel['★'].hit + ')');
    assert.equal(byLabel['●'].hit, 'self', 'the ● Learn panel takes its own tap (hit ' + byLabel['●'].hit + ')');
    assert.equal(byLabel['▲'].hit, 'self', 'the ▲ Chosen picker takes its own tap (hit ' + byLabel['▲'].hit + ')');
    assert.equal(byLabel['■'].hit, 'self',
      'the ■ Core Routine panel takes its own tap (hit ' + byLabel['■'].hit + ')');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('PROGRESS: a past day keeps all four add buttons', async () => {
    /* The `⊕` that ● Learn absorbed was left out of a past day's header, so
       the block there had three buttons. Learn is on EVERY day — a past day's
       Learn simply has no MG tab — so the 2×2 block is always whole. */
    const yesterday = dayFromToday(-1);
    const page = await open('progress.html', { db: seedDb(), hash: '?date=' + yesterday + '#schedule' });
    await page.setViewport(820, 1180);
    await mountSchedule(page);
    const m = await page.waitFor(HEADER_BUTTONS, { args: [yesterday], message: "yesterday's day-header buttons" });
    assert.deepEqual(m.buttons.map(b => b.label), ['★', '●', '▲', '■'],
      'a past day draws the same four buttons, Learn included');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  // ── 13b. Creating work FROM a calendar day ───────────────────────────────
  /* Every other path out of the add panels only ever DATES a record that
     already exists — assignToDate, assignSAToDate, assignDirectoryToDate. A
     slot with nothing schedulable therefore left the day a dead end. The create
     bars are the paths that bring a record into being from a day — ▲ Chosen's
     for a task or a routine, ■ Core Routine's for an action — and each creates
     and schedules in a single write.

     The three kinds are asserted SEPARATELY, and not for symmetry: the goal
     branch and the action branch are different writes to different owned keys,
     and `updateSchedule` silently forks on `taskType` so the routine kind takes
     a code path the plain task never touches. One assertion over all three
     would let a forgotten branch hide behind a passing sibling — the failure
     shape this file exists to catch. */

  const CREATE_SEED = () => seedDb({
    goals: [F.task('g-root', { title: 'Root goal', children: [] })],
    saActions: [], saEntries: [],
  });

  const openCreateBar = async page => {
    await mountSchedule(page);
    // By the button's OWN hook, never by a walk from `☰`. The four buttons
    // have already moved once — out of the header centre and into a 2x2 block
    // on their own row — and `parentElement.children[0]` would have quietly
    // resolved somewhere else that day rather than failing. This file already
    // records the same trap costing HEADER_BUTTONS its notes-strip lookup.
    await page.evaluate(CLICK_SEL, '[data-day-add-task="' + TODAY + '"]');
    await page.waitFor(function () { return !!document.querySelector('[data-picker-create-open]'); },
      { message: 'the picker create bar' });
    await page.evaluate(CLICK_SEL, '[data-picker-create-open]');
    await page.waitFor(function () { return !!document.querySelector('[data-picker-create-title]'); },
      { message: 'the create bar expanded' });
  };

  const fillCreate = async (page, { kind, title, parentId = '', time = '' }) => {
    await page.evaluate(CLICK_SEL, '[data-picker-create-kind="' + kind + '"]');
    await page.evaluate(function (setterSrc, value) {
      var set = new Function('return ' + setterSrc)();
      set(document.querySelector('[data-picker-create-title]'), value);
      return true;
    }, SET_REACT_INPUT, title);
    if (parentId) {
      await page.evaluate(function (id) {
        var s = document.querySelector('[data-picker-create-parent]');
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, id);
        s.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }, parentId);
    }
    if (time) {
      await page.evaluate(function (setterSrc, value) {
        var set = new Function('return ' + setterSrc)();
        set(document.querySelector('[data-picker-create-time]'), value);
        return true;
      }, SET_REACT_INPUT, time);
    }
  };

  const KID_OF = function (goalId) {
    var db = JSON.parse(localStorage.getItem('track_db') || '{}');
    var g = (((db.slots || [])[0] || {}).goals || []).filter(function (x) { return x.id === goalId; })[0];
    return g && (g.children || []).length ? g.children[0] : null;
  };

  await t.test('PICKER: a task typed on a day is created under its goal AND scheduled on that day', async () => {
    const page = await open('progress.html', { db: CREATE_SEED(), hash: '#schedule' });
    await openCreateBar(page);
    await fillCreate(page, { kind: 'task', title: 'Drafted from the calendar', parentId: 'g-root', time: '11:30' });
    await page.evaluate(CLICK_SEL, '[data-picker-create-save]');
    const kid = await page.waitFor(KID_OF, { args: ['g-root'], message: 'the new node reaching track_db' });

    // The claim this case is NAMED for goes first: creating it is only half the
    // feature, and a create that forgets to date lands the task nowhere the
    // calendar can see it.
    assert.equal(kid.scheduledDate, TODAY, 'the new task is scheduled on the day the picker was opened from');
    assert.equal(kid.scheduledTime, '11:30', 'and at the time typed beside it');
    assert.equal(kid.title, 'Drafted from the calendar');
    assert.equal(kid.taskType, 'task');
    assert.equal(kid.completed, false);
    assert.deepEqual(kid.children, [], 'a new task is a leaf');
    assert.equal(typeof kid.id, 'string', 'the id comes from TrackStorage.newId()');
    assert.ok(kid.id.length > 0);
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('PICKER: a routine typed on a day writes routineDates, NOT scheduledDate', async () => {
    /* `updateSchedule` forks on taskType and this is the arm the plain-task
       case never reaches. It is exactly the branch that costs no code of its
       own and so could silently not fire. */
    const page = await open('progress.html', { db: CREATE_SEED(), hash: '#schedule' });
    await openCreateBar(page);
    await fillCreate(page, { kind: 'routine', title: 'Every day', parentId: 'g-root', time: '07:15' });
    await page.evaluate(CLICK_SEL, '[data-picker-create-save]');
    const kid = await page.waitFor(KID_OF, { args: ['g-root'], message: 'the new routine reaching track_db' });

    assert.ok(kid.routineDates && kid.routineDates[TODAY],
      'a routine occupies the day through routineDates, which is where every routine reader looks');
    assert.equal(kid.routineDates[TODAY].time, '07:15');
    assert.equal(kid.routineDates[TODAY].done, false);
    assert.equal(kid.taskType, 'routine');
    assert.ok(!kid.scheduledDate,
      'and NOT through scheduledDate — a routine written there would be drawn once and never again');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  // ■ Core Routine's create bar. The Action kind moved here from ▲ Chosen's,
  // with the same one-click write of the action AND its entry.
  const openCoreCreateBar = async page => {
    await mountSchedule(page);
    await page.evaluate(CLICK_SEL, '[data-day-add-core="' + TODAY + '"]');
    await page.waitFor(function () { return !!document.querySelector('[data-core-create-open]'); },
      { message: 'the Core Routine create bar' });
    await page.evaluate(CLICK_SEL, '[data-core-create-open]');
    await page.waitFor(function () { return !!document.querySelector('[data-core-create-title]'); },
      { message: 'the Core Routine create bar expanded' });
  };

  await t.test('CORE ROUTINE: an action typed on a day creates BOTH the action and its entry', async () => {
    /* Either half alone is useless: an action with no entry is invisible on
       every calendar surface, and an entry with no action points at nothing. */
    const page = await open('progress.html', { db: CREATE_SEED(), hash: '#schedule' });
    await openCoreCreateBar(page);
    await page.evaluate(function (setterSrc, value) {
      var set = new Function('return ' + setterSrc)();
      set(document.querySelector('[data-core-create-title]'), value);
      return true;
    }, SET_REACT_INPUT, 'Read for twenty minutes');
    await page.evaluate(function (setterSrc, value) {
      var set = new Function('return ' + setterSrc)();
      set(document.querySelector('[data-core-create-time]'), value);
      return true;
    }, SET_REACT_INPUT, '20:00');
    await page.evaluate(CLICK_SEL, '[data-core-create-save]');
    /* Wait for the write to LAND, then assert — never wait for the right
       answer to appear. A waitFor on both halves times out when either is
       missing and reports only that the control is unreachable, which is the
       one thing this case is not about. */
    await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      return (((db.slots || [])[0] || {}).saActions || []).length > 0;
    }, { message: 'the action reaching track_db' });
    const sa = await page.evaluate(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var s = (db.slots || [])[0] || {};
      return { actions: s.saActions || [], entries: s.saEntries || [] };
    });

    assert.equal(sa.entries.length, 1, 'the entry is what puts the action on the day');
    assert.equal(sa.entries[0].date, TODAY, 'and it is on the day the panel was opened from');
    assert.equal(sa.entries[0].time, '20:00');
    assert.equal(sa.actions.length, 1, 'the action itself was created too');
    assert.equal(sa.actions[0].title, 'Read for twenty minutes');
    assert.equal(sa.actions[0].parentId, null, 'top level, since none was chosen');
    assert.equal(sa.entries[0].actionId, sa.actions[0].id, 'and the entry points at it');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* A directory and its two steps, and one plain action. `time` sits on the
     steps and on the plain action, as SupportingActionsPanel writes them. */
  const CORE_SEED = () => seedDb({
    goals: [F.task('g-root', { title: 'Root goal', children: [F.task('t-1', { title: 'A task' })] })],
    saEntries: [],
    saActions: [
      F.saAction('sa-plain', { title: 'Cold shower', emoji: '🚿', parentId: null, time: '07:00', duration: 10 }),
      F.saAction('sa-dir', { title: 'Morning routine', emoji: '☀', parentId: null }),
      F.saAction('sa-step1', { title: 'Stretch', emoji: '◆', parentId: 'sa-dir', time: '06:30', duration: 15 }),
      F.saAction('sa-step2', { title: 'Write three lines', emoji: '◆', parentId: 'sa-dir', time: '06:45', duration: 20 })
    ]
  });
  const openCore = async page => {
    await mountSchedule(page);
    await page.evaluate(CLICK_SEL, '[data-day-add-core="' + TODAY + '"]');
    await page.waitFor(function () { return !!document.querySelector('[data-core-panel] [data-core-action]'); },
      { message: 'the Core Routine panel and its actions' });
  };
  const SA_ENTRIES = function () {
    var db = JSON.parse(localStorage.getItem('track_db') || '{}');
    return (((db.slots || [])[0] || {}).saEntries || []).map(function (e) {
      return { actionId: e.actionId, date: e.date, time: e.time };
    });
  };

  await t.test('CHOSEN GUARD: the task picker lists no actions and offers no Action kind', async () => {
    /* Supporting actions are ■ Core Routine's now. The task picker used to end
       in an ACTIONS list and offer an Action kind on its create bar; either one
       left behind would put the same action behind two buttons. */
    const page = await open('progress.html', { db: CORE_SEED(), hash: '#schedule' });
    await openCreateBar(page);
    const seen = await page.evaluate(function () {
      var p = document.querySelector('[data-picker-panel]');
      return {
        text: p ? p.textContent : null,
        kinds: Array.prototype.map.call(document.querySelectorAll('[data-picker-create-kind]'),
          function (b) { return b.getAttribute('data-picker-create-kind'); })
      };
    });
    assert.notEqual(seen.text, null, 'precondition: the Chosen panel is open');
    assert.ok(seen.text.indexOf('A task') >= 0, 'precondition: it lists the goal tree');
    // the claim this case is named for, first
    assert.deepEqual(['Cold shower', 'Morning routine', 'Stretch', 'ACTIONS'].filter(w => seen.text.indexOf(w) >= 0), [],
      'no action, and no ACTIONS heading, anywhere in the Chosen panel');
    assert.deepEqual(seen.kinds, ['task', 'routine'], 'its create bar offers Task and Routine only');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('CORE ROUTINE: every action is listed, and + on a step schedules that step alone', async () => {
    const page = await open('progress.html', { db: CORE_SEED(), hash: '#schedule' });
    await openCore(page);
    const rows = await page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll('[data-core-panel] [data-core-action]'),
        function (r) { return r.getAttribute('data-core-action'); });
    });
    assert.deepEqual(rows, ['sa-plain', 'sa-dir', 'sa-step1', 'sa-step2'],
      'every action, the steps under their routine, open by default');
    await page.evaluate(CLICK_SEL, '[data-core-add="sa-step1"]');
    const entries = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var e = ((db.slots || [])[0] || {}).saEntries || [];
      return e.length ? e : false;
    }, { message: 'the entry reaching track_db' });
    // the write has landed; now read exactly what it was
    assert.deepEqual(await page.evaluate(SA_ENTRIES), [{ actionId: 'sa-step1', date: TODAY, time: '06:30' }],
      'one entry, for that step alone, at its own time — not the whole routine');
    assert.equal(entries.length, 1);
    assert.equal(await page.evaluate(function () { return !!document.querySelector('[data-core-panel]'); }), false,
      'and the panel closes, as every other add does');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('CORE ROUTINE: + all on a routine schedules each of its steps', async () => {
    /* The old ACTIONS list's one-click "whole routine", kept. */
    const page = await open('progress.html', { db: CORE_SEED(), hash: '#schedule' });
    await openCore(page);
    await page.evaluate(CLICK_SEL, '[data-core-add-all="sa-dir"]');
    await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      return ((((db.slots || [])[0] || {}).saEntries) || []).length > 0;
    }, { message: 'the entries reaching track_db' });
    const got = (await page.evaluate(SA_ENTRIES)).sort((a, b) => a.actionId.localeCompare(b.actionId));
    assert.deepEqual(got, [
      { actionId: 'sa-step1', date: TODAY, time: '06:30' },
      { actionId: 'sa-step2', date: TODAY, time: '06:45' }
    ], 'one entry per step, each at its own time, and none for the routine itself');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('GUARD: the create bar refuses an unparented task, and writes nothing when clicked anyway', async () => {
    /* A top-level node in `goals` is a GOAL, not a task, so there is nowhere
       for an unparented one to go. The refusal NAMES the reason rather than
       inventing an "Unfiled" goal to hold it, and this asserts the Cancel path
       — that the bytes are unchanged after the disabled button is clicked —
       because a control that shows a reason and then writes anyway is worse
       than none. */
    const page = await open('progress.html', { db: seedDb({ goals: [], saActions: [], saEntries: [] }), hash: '#schedule' });
    await openCreateBar(page);
    const RAW = function () { return localStorage.getItem('track_db'); };
    await fillCreate(page, { kind: 'task', title: 'Nowhere to put me' });
    const before = await page.evaluate(RAW);

    const state = await page.evaluate(function () {
      var b = document.querySelector('[data-picker-create-save]');
      var e = document.querySelector('[data-picker-create-error]');
      return { disabled: !!(b && b.disabled), msg: e ? e.textContent.trim() : null };
    });
    assert.equal(state.disabled, true, 'Create is disabled with no goal to file the task under');
    assert.match(state.msg || '', /goal/i, 'and the reason names the missing goal: ' + state.msg);

    await page.evaluate(CLICK_SEL, '[data-picker-create-save]');
    await sleep(500);
    assert.equal(await page.evaluate(RAW), before, 'track_db is byte-identical after clicking it anyway');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('GUARD: creating from the picker writes no key progress.html does not own', async () => {
    const page = await open('progress.html', { db: CREATE_SEED(), hash: '#schedule' });
    await mountSchedule(page);
    const FOREIGN = ['sessions', 'mms', 'kolbs', 'mgChanges', 'linChanges', 'linDayTitles',
      'pos', 'levelTemplates', 'sourceDumps', 'docPages', 'trueStorages', 'trueStoragePos', 'notes',
      'dateNotes'];
    const SNAP = function (keys) {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var s = (db.slots || [])[0] || {};
      var out = {}; keys.forEach(function (k) { out[k] = JSON.stringify(s[k]); }); return out;
    };
    const before = await page.evaluate(SNAP, FOREIGN);

    await openCreateBar(page);
    await fillCreate(page, { kind: 'task', title: 'Ownership probe', parentId: 'g-root' });
    await page.evaluate(CLICK_SEL, '[data-picker-create-save]');
    await page.waitFor(KID_OF, { args: ['g-root'], message: 'the write landing' });

    assert.deepEqual(await page.evaluate(SNAP, FOREIGN), before,
      'every foreign key is byte-identical');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  // ── 14. Grit mode: the theme names, their migration, and their chrome ────
  /* Appearance had NO committed coverage before this section, while every
     other case in this file rendered in what used to be the light theme by
     accident — headless Chrome reports no dark preference and nothing seeded
     `track_theme`. So the palette was exercised ~157 times and asserted zero
     times. These cases fix that, and they assert PER PAGE where the rule has
     more than one surface, because a rule forgotten at one of several surfaces
     is this repository's recurring bug. */

  const THEME_OF = function () {
    return {
      attr: document.documentElement.getAttribute('data-theme'),
      stored: localStorage.getItem('track_theme'),
      // the USED value, not the declared one: a custom-ident like `grit` parses
      // and sticks, so only the computed value tells you the browser understood.
      scheme: getComputedStyle(document.documentElement).colorScheme,
      bg: getComputedStyle(document.documentElement).getPropertyValue('--color-app-bg').trim(),
      label: (document.querySelector('.theme-toggle__label') || {}).textContent || null
    };
  };

  await t.test('THEME: a fresh visitor lands in grit, and a stored dark still lands in night', async () => {
    // the claim this case is NAMED for goes first, so the fail-first run proves
    // that one rather than whichever assertion happened to be written earliest.
    const fresh = await open('index.html', { db: seedDb() });
    const f = await fresh.evaluate(THEME_OF);
    assert.equal(f.attr, 'grit', 'a visitor with no stored preference gets grit');
    assert.equal(f.label, 'Grit', 'and the toggle names it');

    const night = await open('index.html', { db: seedDb(), extra: { track_theme: 'dark' } });
    const n = await night.evaluate(THEME_OF);
    assert.equal(n.attr, 'dark', 'an explicit dark preference is untouched — it is NOT renamed in storage');
    assert.equal(n.label, 'Night', 'but it presents as Night');

    // The comparison is what catches "attribute set to a name no selector
    // matches": a bogus value falls through to the :root block, so both reads
    // would come back equal and equally non-empty.
    assert.ok(f.bg && n.bg, 'both themes resolve an app background');
    assert.notEqual(f.bg, n.bg, 'and the two backgrounds genuinely differ');

    assert.deepEqual(realErrors(fresh), []);
    assert.deepEqual(realErrors(night), []);
    await fresh.close();
    await night.close();
  });

  await t.test('THEME: a stored legacy `light` renders as grit and is never rewritten', async () => {
    const page = await open('progress.html', { db: seedDb(), extra: { track_theme: 'light' } });
    const before = await page.evaluate(THEME_OF);
    assert.equal(before.attr, 'grit', 'the legacy value resolves to grit');

    /* GUARD, passing on both sides by design: the alias must stay a READ.
       Rewriting the key would fire `storage` in every other tab, and a tab on
       the cached old script does not know `grit` — it would fall through to
       matchMedia and silently flip. This assertion is what stops a future
       "let's just migrate the key" patch. */
    assert.equal(before.stored, 'light', 'and the stored bytes are left alone');

    // an explicit set of the legacy name must still work, and canonicalise
    await page.evaluate(function () { window.TrackTheme.set('light'); });
    const after = await page.evaluate(THEME_OF);
    assert.equal(after.attr, 'grit', 'TrackTheme.set("light") is not a silent no-op');
    assert.equal(after.stored, 'grit', 'and an explicit choice writes the canonical name');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('THEME: color-scheme resolves to a keyword the browser understands', async () => {
    /* theme.js writes `root.style.colorScheme` INLINE, so it beats both
       stylesheet declarations. `grit` and `night` are valid custom-idents —
       they parse, they stick, and no UA recognises them, so the used scheme
       silently falls back to light. That would leave a night page with light
       scrollbars and light native date pickers, and there are 19 date/time
       inputs across the app. Assert the USED value. */
    const grit = await open('progress.html', { db: seedDb() });
    assert.equal((await grit.evaluate(THEME_OF)).scheme, 'light',
      'grit maps to the `light` keyword, not to the theme name');

    const night = await open('progress.html', { db: seedDb(), extra: { track_theme: 'dark' } });
    assert.equal((await night.evaluate(THEME_OF)).scheme, 'dark',
      'night maps to the `dark` keyword, not to the theme name');

    await grit.close();
    await night.close();
  });

  await t.test('THEME: html[data-theme] chrome is STYLED, not merely present', async () => {
    /* The notes widget, the Firebase overlay and all four banners are styled
       entirely through the BARE `html[data-theme]` selector, because they are
       injected as hard-coded dark CSS by notes-widget.js and storage-guard.js.
       If applyTheme ever returns before setting the attribute, every one of
       them loses all styling at once — and the smoke cases would not notice,
       because they assert those elements EXIST, never that they are painted. */
    const page = await open('index.html', { db: seedDb() });
    const btn = await page.evaluate(function () {
      var el = document.getElementById('nw-btn');
      if (!el) return null;
      var cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, attr: document.documentElement.getAttribute('data-theme') };
    });
    assert.ok(btn, 'the notes widget button exists');
    assert.ok(btn.attr, 'data-theme is set at all — every bare html[data-theme] rule depends on it');
    assert.notEqual(btn.bg, 'rgba(0, 0, 0, 0)',
      'and the notes button is actually painted (' + btn.bg + ')');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('THEME: the toggle round-trips and reaches a second tab', async () => {
    const a = await open('progress.html', { db: seedDb() });
    assert.equal((await a.evaluate(THEME_OF)).attr, 'grit', 'tab A starts in grit');

    // fresh:false, or the second tab wipes the origin the first is under test with
    const b = await open('progress.html', { fresh: false });
    assert.equal((await b.evaluate(THEME_OF)).attr, 'grit', 'tab B agrees');

    await a.evaluate(function () { document.getElementById('theme-toggle').click(); });
    const flipped = await a.evaluate(THEME_OF);
    assert.equal(flipped.attr, 'dark', 'clicking the toggle reaches night');
    assert.equal(flipped.stored, 'dark', 'and persists the canonical name');

    /* This is the assertion that catches a rename missing ONE of the four
       places theme.js spells the pair. A missed spelling makes applyTheme a
       silent no-op and the button simply stops working. */
    await a.evaluate(function () { document.getElementById('theme-toggle').click(); });
    const back = await a.evaluate(THEME_OF);
    assert.equal(back.attr, 'grit', 'and clicking again comes back to grit');
    assert.equal(back.stored, 'grit', 'writing grit, never the legacy name');

    await b.evaluate(function () {
      window.dispatchEvent(new StorageEvent('storage', { key: 'track_theme', newValue: 'dark' }));
    });
    assert.deepEqual(realErrors(a), []);
    await a.close();
    await b.close();
  });

  await t.test('THEME: text clears 4.5:1 on every text-bearing surface, in BOTH themes', async () => {
    /* README has claimed "stronger text contrast" for a long time with nothing
       measuring it. This is that measurement, and it is asserted per theme
       because a palette can easily be fine in one and fail in the other. */
    const MEASURE = function () {
      var cs = getComputedStyle(document.documentElement);
      var tok = function (n) { return cs.getPropertyValue(n).trim(); };
      var probe = document.createElement('span');
      document.body.appendChild(probe);
      var rgb = function (v) {
        probe.style.color = v;
        var m = getComputedStyle(probe).color.match(/[\d.]+/g);
        return m ? [+m[0], +m[1], +m[2]] : null;
      };
      var lum = function (c) {
        var f = c.map(function (v) {
          v = v / 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
      };
      var ratio = function (a, b) {
        var x = lum(a), y = lum(b);
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      };
      var texts = ['--color-text', '--color-text-secondary', '--color-text-muted'];
      var surfaces = ['--color-app-bg', '--color-surface', '--color-surface-muted'];
      var worst = { ratio: 99, pair: null };
      texts.forEach(function (t) {
        surfaces.forEach(function (s) {
          var a = rgb(tok(t)), b = rgb(tok(s));
          if (!a || !b) return;
          var r = ratio(a, b);
          if (r < worst.ratio) worst = { ratio: r, pair: t + ' on ' + s };
        });
      });
      probe.remove();
      return worst;
    };

    const grit = await open('index.html', { db: seedDb() });
    const g = await grit.evaluate(MEASURE);
    assert.ok(g.ratio >= 4.5,
      'grit: worst text pair is ' + g.pair + ' at ' + g.ratio.toFixed(2) + ':1');

    const night = await open('index.html', { db: seedDb(), extra: { track_theme: 'dark' } });
    const n = await night.evaluate(MEASURE);
    assert.ok(n.ratio >= 4.5,
      'night: worst text pair is ' + n.pair + ' at ' + n.ratio.toFixed(2) + ':1');

    await grit.close();
    await night.close();
  });

  // ── 15. A pasted timetable — drawn on three grids, edited on the Schedule ──
  /* Three surfaces draw these blocks and progress.html carries its own copy of
     the occupancy test, because it does not load calendar-core.js. That is the
     duplication shape this repository has paid for before, so EVERY surface is
     asserted separately — a single shared assertion would let a forgotten copy
     hide behind a passing sibling. The fail-first evidence is two doctored
     baselines whose failure sets are disjoint. */

  /* The next Monday at or after today. The Progress week view runs
     today..today+6 and is NOT Sunday-anchored, and the month calendars show
     the current month — so the Monday of the calendar week is often in neither.
     Written out here rather than imported so a fixture never depends on the
     code under test. */
  const nextDow = target => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + ((target - d.getDay() + 7) % 7));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
      '-' + String(d.getDate()).padStart(2, '0');
  };
  const MONDAY = nextDow(1);
  const MON_DOW = 1;

  const refWeekly = (over = {}) => Object.assign({
    id: 'rs-w', dow: MON_DOW, time: '09:00', duration: 90, title: 'Mathematics',
    from: '2020-01-01', until: '2099-12-31', docPageId: 'p-1', importId: 'imp-1'
  }, over);
  const refOneOff = (over = {}) => Object.assign({
    id: 'rs-o', date: MONDAY, time: '13:00', duration: 60, title: 'Makeup lecture',
    docPageId: 'p-1', importId: 'imp-1'
  }, over);

  const refDb = (entries, pageOver = {}) => seedDb({
    refSchedules: entries,
    calendarNotes: [], deadlines: [],
    docPages: [F.docPage('p-1', Object.assign({
      title: 'Term 1', blocks: [{ id: 'b-1', type: 'schedule' }]
    }, pageOver))]
  });

  // Open a month calendar (Home or a Documentations block) on a given day.
  const CLICK_CAL_DAY = function (ds) {
    var want = Number(ds.slice(8));
    var cells = document.querySelectorAll('.cal-cell');
    for (var i = 0; i < cells.length; i++) {
      var n = cells[i].querySelector('.cal-day-num');
      if (n && Number(n.textContent) === want) { cells[i].click(); return true; }
    }
    return false;
  };
  const REF_IDS_ON = function (ds) {
    var els = document.querySelectorAll('[data-ref-day="' + ds + '"]');
    return els.length ? Array.prototype.map.call(els, function (e) {
      return e.getAttribute('data-ref-id');
    }) : false;
  };

  await t.test('PROGRESS draws a weekly class on the day it actually falls on', async () => {
    /* data-ref-day is the COLUMN, and asserting it is the whole case. Every
       column of a week view is in the DOM at once, so a block drawn on the
       wrong day still has the right id at the right hour — only the column
       tells them apart. That is the data-block-day lesson, and a version of
       this case that checked ids alone passed against a doctored resolver. */
    const page = await open('progress.html', { db: refDb([refWeekly(), refOneOff()]), hash: '#schedule' });

    // The ONE-OFF renders whatever the weekly arm does, so this precondition
    // holds on a broken tree too and the assertion below is what fires.
    await page.waitFor(function () { return !!document.querySelector('[data-ref-id="rs-o"]'); },
      { message: 'the backdrop layer rendering at all' });
    const onMonday = await page.evaluate(REF_IDS_ON, MONDAY);
    assert.deepEqual((onMonday || []).slice().sort(), ['rs-o', 'rs-w'],
      'both the weekly class and the one-off landed on ' + MONDAY);

    // and nowhere else in the week: a weekly entry is not a daily one
    const elsewhere = await page.evaluate(function (mon) {
      return Array.prototype.map.call(document.querySelectorAll('[data-ref-day]'), function (e) {
        return e.getAttribute('data-ref-day');
      }).filter(function (d) { return d !== mon; });
    }, MONDAY);
    assert.deepEqual(elsewhere, [], 'no class was drawn on any other day of the week');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('HOME draws the same class in the universal calendar', async () => {
    const page = await open('index.html', { db: refDb([refWeekly(), refOneOff()]) });
    await page.waitFor(function () { return !!document.querySelector('.cal-cell'); },
      { message: 'the home calendar' });
    assert.notEqual(await page.evaluate(CLICK_CAL_DAY, MONDAY), false, MONDAY + ' is in the grid');

    await page.waitFor(function () { return !!document.querySelector('[data-ref-id="rs-o"]'); },
      { message: 'the Home backdrop layer rendering at all' });
    const ids = await page.evaluate(REF_IDS_ON, MONDAY);
    assert.deepEqual((ids || []).slice().sort(), ['rs-o', 'rs-w']);
    // the read-only surfaces are inert by construction, not by a guard
    assert.equal(await page.evaluate(function () {
      return getComputedStyle(document.querySelector('.cal-sched-refs')).pointerEvents;
    }), 'none', 'the Home backdrop layer takes no pointer events at all');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('DOCUMENTATIONS draws the same class in a calendar block', async () => {
    const page = await open('documentations.html', {
      db: refDb([refWeekly(), refOneOff()], {
        blocks: [{ id: 'b-1', type: 'schedule' }, { id: 'b-2', type: 'calendar', hidden: [], scope: 'page' }]
      }),
      hash: '?page=p-1'
    });
    await page.waitFor(function () { return !!document.querySelector('.cal-cell'); },
      { message: 'the calendar block' });
    assert.notEqual(await page.evaluate(CLICK_CAL_DAY, MONDAY), false, MONDAY + ' is in the grid');

    await page.waitFor(function () { return !!document.querySelector('[data-ref-id="rs-o"]'); },
      { message: 'the Documentations backdrop layer rendering at all' });
    const ids = await page.evaluate(REF_IDS_ON, MONDAY);
    assert.deepEqual((ids || []).slice().sort(), ['rs-o', 'rs-w']);
    assert.equal(await page.evaluate(function () {
      return getComputedStyle(document.querySelector('.cal-sched-refs')).pointerEvents;
    }), 'none');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* ── a class is changeable on the Progress Schedule (2026-10-16) ──────────
     The user's call: a class is a real block — moved, resized, renamed, given
     notes, removed from one day — and Documentations deletes it for good.
     Every case below judges the STORED entry, never the screen alone. */

  const REF_STORED = function () {
    return (((JSON.parse(localStorage.getItem('track_db') || '{}').slots || [])[0] || {}).refSchedules) || [];
  };
  const REF_ENTRY = function (id) {
    var all = (((JSON.parse(localStorage.getItem('track_db') || '{}').slots || [])[0] || {}).refSchedules) || [];
    return all.filter(function (e) { return e && e.id === id; })[0] || null;
  };
  const RAW_DB = function () { return localStorage.getItem('track_db'); };

  /* Progress in DAY mode on `day` — the ?date= link opens day mode — at a
     desktop width. Day mode is where a block's ✎ notes are drawn, and its one
     column is where every drag below starts and ends. */
  const openRefDay = async (db, waitId = 'rs-o', day = MONDAY) => {
    const page = await open('progress.html', { db, hash: '?date=' + day + '#schedule', viewport: [1280, 900] });
    await page.waitFor(function (id) { return !!document.querySelector('[data-ref-id="' + id + '"]'); },
      { args: [waitId], message: 'the class block ' + waitId });
    return page;
  };

  // A point inside a block, clear of its buttons (they sit top-right), after
  // scrolling it into view — real Input events hit-test.
  const REF_POINT = function (sel) {
    var el = document.querySelector(sel);
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    var r = el.getBoundingClientRect();
    return { x: Math.round(r.left + 20), y: Math.round(r.top + Math.min(r.height / 2, 14)) };
  };
  /* A REAL mouse drag through the browser's input pipeline rather than events
     dispatched on the element: hit testing, React's delegation and the
     document-level listeners the Schedule's drag lives on all take part. */
  const mouseDrag = async (page, from, dx, dy) => {
    const send = (type, x, y, buttons) => page.session.send('Input.dispatchMouseEvent',
      { type, x, y, button: 'left', buttons, clickCount: 1 });
    await send('mousePressed', from.x, from.y, 1);
    for (let i = 1; i <= 4; i++) await send('mouseMoved', from.x + dx * i / 4, from.y + dy * i / 4, 1);
    /* Two frames before the release, so the last move has been dispatched
       when the button comes up — a hand never releases in the same instant
       it stops. Added after a full run where a 64px drag landed on its third
       move's 48px; the mechanism was not reproduced (6x CPU throttling did
       not), so this is a precaution, not a proven cause. The timer is not
       optional: a BACKGROUND tab runs no animation frames at all, so a
       frames-only wait hangs the two-tab case that drags behind another tab. */
    await page.evaluate(function () {
      return new Promise(function (r) {
        var done = false, fin = function () { if (!done) { done = true; r(true); } };
        requestAnimationFrame(function () { requestAnimationFrame(fin); });
        setTimeout(fin, 250);
      });
    });
    await send('mouseReleased', from.x + dx, from.y + dy, 0);
  };
  /* One touch event on a block, at the same point REF_POINT uses. Every event
     of a touch goes to the element it STARTED on, so the move is dispatched on
     the block too, and left to bubble to the Schedule's document listeners. */
  const REF_TOUCH = function (sel, type, dy) {
    var el = document.querySelector(sel);
    if (!el) return 'missing ' + sel;
    var r = el.getBoundingClientRect();
    var x = r.left + 20, y = r.top + Math.min(r.height / 2, 14) + (dy || 0);
    var t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y, pageX: x, pageY: y });
    var live = (type === 'touchend' || type === 'touchcancel') ? [] : [t];
    el.dispatchEvent(new TouchEvent(type, {
      bubbles: true, cancelable: true, composed: true,
      touches: live, targetTouches: live, changedTouches: [t]
    }));
    return 'ok';
  };

  /* ── a deadline block's drag reads the days it may land on NOW ───────────
     Here rather than in section 10 because mouseDrag is declared just above,
     and a `const` is not hoisted.

     The Schedule's pointer effect is mount-only. Its deadline snap used to
     read the `deadlines` prop — the list as it was when the page mounted — so
     a caution day added since was unknown to the drag, and a ★ Forced pick
     adds one. The allowed days now ride in the ghost, read from the item as
     rendered when the drag starts.

     Three doors, and the cases are built so each one has a case that only it
     can fail. The READ is shared by mouse and touch; the STASH is written in
     two places, startDragBlockItem and the touch path's ghost. A vertical drag
     cannot see a missing stash — an empty set pins the ghost to its own
     column, which a vertical drag never leaves — so the two carrying cases
     drag ACROSS: a block on the due day onto the caution day the pick just
     added. The stale read snaps it back to the due day; a missing stash pins
     it there. */
  const forcedDragSetup = async () => {
    const DUE = dayFromToday(2);
    const page = await open('progress.html', {
      db: seedDb({ deadlines: [F.deadline('d-g', DUE, {
        cautionDates: [], time: '17:00', title: 'Lab report', parts: [{ id: 'due' }] })] }),
      hash: '#schedule'
    });
    await mountSchedule(page);
    await pickForced(page, TODAY, 'deadline:d-g');
    const d = await page.waitFor(ITEM_WITH_PARTS, { args: ['deadlines', 'd-g', 2], message: 'the pick reaching track_db' });
    assert.deepEqual(d.cautionDates, [TODAY], 'the pick made today a caution day — one the page did NOT mount with');
    const picked = '[data-block-id="d-g:' + d.parts[1].id + '"]';
    await page.waitFor(function (s) { return !!document.querySelector(s); }, { args: [picked], message: 'the new block' });
    return { page, DUE, picked, pickedId: d.parts[1].id, dueSel: '[data-block-id="d-g:due"]' };
  };
  // mid-block, clear of the tick on the left and ⓘ / ✕ on the right — and,
  // the block spanning its column, mid-COLUMN, so a drag of whole columns
  // drops mid-column too
  const BLOCK_POINT = function (sel) {
    var el = document.querySelector(sel);
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    var r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width * 0.45), y: Math.round(r.top + Math.min(r.height / 2, 14)),
      colW: el.parentElement.getBoundingClientRect().width };
  };
  // the stored part once a drag has written its own time — the write landing
  const PART_MOVED = function (partId) {
    var db = JSON.parse(localStorage.getItem('track_db') || '{}');
    var d = (((db.slots || [])[0] || {}).deadlines || [])[0];
    var p = d && (d.parts || []).filter(function (x) { return x.id === partId; })[0];
    return (p && p.time) ? p : false;
  };
  // One touch event on a block, `dx`/`dy` from the point BLOCK_POINT uses.
  // Every event of a touch goes to the element it STARTED on, so the move is
  // dispatched on the block too, and left to bubble to the document listeners.
  const BLOCK_TOUCH = function (sel, type, dx, dy) {
    var el = document.querySelector(sel);
    if (!el) return 'missing ' + sel;
    var r = el.getBoundingClientRect();
    var x = r.left + r.width * 0.45 + (dx || 0), y = r.top + Math.min(r.height / 2, 14) + (dy || 0);
    var t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y, pageX: x, pageY: y });
    var live = (type === 'touchend' || type === 'touchcancel') ? [] : [t];
    el.dispatchEvent(new TouchEvent(type, {
      bubbles: true, cancelable: true, composed: true,
      touches: live, targetTouches: live, changedTouches: [t]
    }));
    return 'ok';
  };

  await t.test('PROGRESS: a mouse drag keeps a block on the caution day ★ Forced just added', async () => {
    // The user's own sequence: add a block to today, then move it an hour.
    const { page, picked, pickedId } = await forcedDragSetup();
    await mouseDrag(page, await page.evaluate(BLOCK_POINT, picked), 0, 64);   // an hour later, same column
    const p = await page.waitFor(PART_MOVED, { args: [pickedId], message: 'the drag reaching track_db' });
    assert.equal(p.date, TODAY, 'it stays on today rather than snapping to the day the page mounted knowing');
    // the minute it lands on is incidental to the claim; that it moved at all is not
    assert.ok(p.time > '16:00', 'and it moved later than its 16:00 start: ' + p.time);
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('PROGRESS: a mouse drag carries a deadline block onto a caution day added since the page mounted', async () => {
    const { page, DUE, dueSel } = await forcedDragSetup();
    const from = await page.evaluate(BLOCK_POINT, dueSel);
    await mouseDrag(page, from, -2 * from.colW, 0);   // the due day's column → today's, two to the left
    const p = await page.waitFor(PART_MOVED, { args: ['due'], message: 'the drag reaching track_db' });
    assert.equal(p.date, TODAY, 'it lands on today — not snapped back, and not pinned, to ' + DUE);
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('TOUCH: a swipe carries a deadline block onto a caution day added since the page mounted', async () => {
    const { page, DUE, dueSel } = await forcedDragSetup();
    const { colW } = await page.evaluate(BLOCK_POINT, dueSel);
    assert.equal(await page.evaluate(BLOCK_TOUCH, dueSel, 'touchstart'), 'ok');
    await page.evaluate(BLOCK_TOUCH, dueSel, 'touchend');
    await page.waitFor(function (s) { return document.querySelector(s).className.indexOf('ring-cyan-400') >= 0; },
      { args: [dueSel], message: 'the tap arming the block' });
    await sleep(600);   // past the 500ms mouse suppression a touch leaves behind
    await page.evaluate(BLOCK_TOUCH, dueSel, 'touchstart');
    await page.evaluate(BLOCK_TOUCH, dueSel, 'touchmove', -2 * colW, 0);
    await page.evaluate(BLOCK_TOUCH, dueSel, 'touchend', -2 * colW, 0);
    const p = await page.waitFor(PART_MOVED, { args: ['due'], message: 'the swipe reaching track_db' });
    assert.equal(p.date, TODAY, 'it lands on today — not snapped back, and not pinned, to ' + DUE);
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a class is untickable, and a mouse drag MOVES it — its own day and time, every other key kept', async () => {
    /* A one-off's drag writes its OWN `date` and `time`: unlike a day note,
       a class has no separate item date for a chip or a marker to stay on. And
       the writer SPREADS the entry, so the page, the import, the detail and a
       key no version of this page has heard of all survive. */
    const page = await openRefDay(refDb([refOneOff({ detail: 'Dr Ada · R204', futureKey: 'kept' })]));
    assert.equal(await page.evaluate(function () {
      return document.querySelectorAll('[data-ref-id="rs-o"] input[type="checkbox"]').length;
    }), 0, 'nothing to tick — a lecture is not completed');

    await mouseDrag(page, await page.evaluate(REF_POINT, '[data-ref-id="rs-o"]'), 0, 64);  // 64px = 1h
    // wait for ANY write, then assert — never wait for the right answer
    const moved = await page.waitFor(function () {
      var e = (((JSON.parse(localStorage.getItem('track_db') || '{}').slots || [])[0] || {}).refSchedules || [])[0];
      return e && e.time !== '13:00' ? e : false;
    }, { message: 'the drag reaching track_db' });
    assert.equal(moved.time, '14:00', 'an hour later');
    assert.equal(moved.date, MONDAY, 'on the same day');
    assert.deepEqual(Object.keys(moved).sort(),
      ['date', 'detail', 'docPageId', 'duration', 'futureKey', 'id', 'importId', 'time', 'title'],
      'spread, not rebuilt — no key lost and none invented');
    assert.equal(moved.detail, 'Dr Ada · R204');
    assert.equal(moved.futureKey, 'kept');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a WEEKLY class dragged in its column keeps its weekday, and a resize writes its length', async () => {
    /* A weekly entry is ONE class — Documentations lists it as one row — so a
       drag moves every week's time. A drag that stays in its column must not
       touch `dow`, `from` or `until`, and must not grow a second arm. */
    const page = await openRefDay(refDb([refWeekly()]), 'rs-w');
    await mouseDrag(page, await page.evaluate(REF_POINT, '[data-ref-id="rs-w"]'), 0, 64);
    const moved = await page.waitFor(function () {
      var e = (((JSON.parse(localStorage.getItem('track_db') || '{}').slots || [])[0] || {}).refSchedules || [])[0];
      return e && e.time !== '09:00' ? e : false;
    }, { message: 'the drag reaching track_db' });
    assert.equal(moved.time, '10:00');
    assert.equal(moved.dow, MON_DOW, 'still a Monday class');
    assert.equal(moved.from, '2020-01-01');
    assert.equal(moved.until, '2099-12-31');
    assert.equal('date' in moved, false, 'still exactly one arm');

    // a right-click selects it, exactly as it selects a task block
    await page.evaluate(function () {
      document.querySelector('[data-ref-id="rs-w"]').dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    await page.waitFor(function () { return !!document.querySelector('[data-ref-id="rs-w"] .cursor-s-resize'); },
      { message: 'the resize handles on a selected class' });
    const handle = await page.evaluate(function () {
      var r = document.querySelector('[data-ref-id="rs-w"] .cursor-s-resize').getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });
    await mouseDrag(page, handle, 0, 32);   // half an hour
    const resized = await page.waitFor(function () {
      var e = (((JSON.parse(localStorage.getItem('track_db') || '{}').slots || [])[0] || {}).refSchedules || [])[0];
      return e && e.duration !== 90 ? e : false;
    }, { message: 'the resize reaching track_db' });
    assert.equal(resized.duration, 120);
    assert.equal(resized.time, '10:00', 'the bottom edge leaves the start alone');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('WEEK view: a weekly class dragged to another column takes that weekday — never outside its range', async () => {
    /* Moving one Monday's block onto the next column moves the CLASS: it is
       one class, listed as one row. The ghost only lands on a column inside
       [from, until], so a class whose range stops at that Monday refuses the
       column and keeps its weekday — while the time still moves. The week view
       runs today..today+6, so the neighbour is Tuesday unless Monday is the
       last column, and then it is Sunday (and the bound is a start instead). */
    const shiftDay = (ds, n) => {
      const d = new Date(ds + 'T12:00:00'); d.setDate(d.getDate() + n);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    };
    const dir = ((1 - new Date().getDay() + 7) % 7) === 6 ? -1 : 1;
    const NB = shiftDay(MONDAY, dir), NB_DOW = dir > 0 ? 2 : 0;
    const bounded = refWeekly(Object.assign({ id: 'rs-r', title: 'Bounded', time: '13:00' },
      dir > 0 ? { until: MONDAY } : { from: MONDAY }));
    const page = await open('progress.html', {
      db: refDb([refWeekly(), bounded]), hash: '#schedule', viewport: [1280, 900]
    });
    await page.waitFor(function () { return !!document.querySelector('[data-ref-id="rs-r"]'); },
      { message: 'both classes in the week view' });
    const colW = await page.evaluate(function () {
      return document.querySelector('[data-ref-id="rs-w"]').getBoundingClientRect().width + 6;
    });
    /* Pressed at the block's horizontal CENTRE, so the drop lands mid-column
       one column over. Pressed 20px in (REF_POINT), the drop sat ~20px past a
       column boundary, and one control run in ~30 dropped back into the
       block's own column — a no-op drag that reads exactly like no write. */
    const CENTRE_POINT = function (sel) {
      var el = document.querySelector(sel);
      el.scrollIntoView({ block: 'center' });
      var r = el.getBoundingClientRect();
      var p = { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(r.height / 2, 14)) };
      // the press must land ON the class, or a miss would read as "no write"
      var hit = document.elementFromPoint(p.x, p.y);
      p.onBlock = !!(hit && hit.closest(sel));
      return p;
    };
    await sleep(300);   // let the timeline's mount-time scroll settle before measuring

    const pressW = await page.evaluate(CENTRE_POINT, '[data-ref-id="rs-w"]');
    assert.equal(pressW.onBlock, true, 'the press point is on the weekly class: ' + JSON.stringify(pressW));
    await mouseDrag(page, pressW, dir * colW, 0);
    // landed = the class changed in ANY way; the assertions judge how
    const w = await page.waitFor(function () {
      var e = (((JSON.parse(localStorage.getItem('track_db') || '{}').slots || [])[0] || {}).refSchedules || [])[0];
      return e && (e.dow !== 1 || e.time !== '09:00') ? e : false;
    }, { message: 'the sideways drag reaching track_db' });
    assert.equal(w.dow, NB_DOW, 'the class now falls on ' + NB);
    assert.equal(w.time, '09:00', 'a sideways drag keeps the time');
    assert.equal(w.from, '2020-01-01');
    assert.equal(w.until, '2099-12-31');
    await page.waitFor(function (d) { return !!document.querySelector('[data-ref-day="' + d + '"][data-ref-id="rs-w"]'); },
      { args: [NB], message: 'the class drawn in the new column' });

    const pressR = await page.evaluate(CENTRE_POINT, '[data-ref-id="rs-r"]');
    assert.equal(pressR.onBlock, true, 'the press point is on the bounded class: ' + JSON.stringify(pressR));
    await mouseDrag(page, pressR, dir * colW, 64);
    const r = await page.waitFor(function () {
      var all = (((JSON.parse(localStorage.getItem('track_db') || '{}').slots || [])[0] || {}).refSchedules) || [];
      var e = all.filter(function (x) { return x.id === 'rs-r'; })[0];
      return e && e.time !== '13:00' ? e : false;
    }, { message: 'the bounded drag reaching track_db' });
    assert.equal(r.dow, 1, 'outside its range the column is refused: still a Monday class');
    assert.equal(r.time, '14:00', 'while the time moves');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('TOUCH: a tap ARMS a class and opens nothing, a swipe moves it, a long-press shows its handles', async () => {
    /* The Schedule's two-stage touch model, now reaching a class: tap to arm,
       swipe the ARMED block to move it, long-press to resize. Synthesised
       TouchEvents cover the handler logic, not real hardware — the standing
       gap. */
    const page = await openRefDay(refDb([refOneOff()]));
    await page.evaluate(function () { document.querySelector('[data-ref-id="rs-o"]').scrollIntoView({ block: 'center' }); });
    const SEL = '[data-ref-id="rs-o"]';
    await page.evaluate(REF_TOUCH, SEL, 'touchstart');
    await page.evaluate(REF_TOUCH, SEL, 'touchend');
    await page.waitFor(function (s) { return document.querySelector(s).className.indexOf('ring-cyan-400') >= 0; },
      { args: [SEL], message: 'the tap arming the class' });
    assert.equal(await page.evaluate(function () {
      return !!document.querySelector('[data-ref-popup], [data-dln-panel]');
    }), false, 'a tap opens no card and no panel');
    assert.deepEqual(page.dialogs, [], 'and asks nothing');

    // swipe the ARMED block down an hour
    await sleep(600);   // past the 500ms mouse suppression a touch leaves behind
    await page.evaluate(REF_TOUCH, SEL, 'touchstart');
    await page.evaluate(REF_TOUCH, SEL, 'touchmove', 64);
    await page.evaluate(REF_TOUCH, SEL, 'touchend', 64);
    const moved = await page.waitFor(function () {
      var e = (((JSON.parse(localStorage.getItem('track_db') || '{}').slots || [])[0] || {}).refSchedules || [])[0];
      return e && e.time !== '13:00' ? e : false;
    }, { message: 'the swipe reaching track_db' });
    assert.equal(moved.time, '14:00');

    // long-press: hold past 600ms, then lift
    await page.evaluate(function (s) { document.querySelector(s).scrollIntoView({ block: 'center' }); }, SEL);
    await page.evaluate(REF_TOUCH, SEL, 'touchstart');
    await sleep(750);
    await page.evaluate(REF_TOUCH, SEL, 'touchend');
    await page.waitFor(function (s) {
      return !!document.querySelector(s + ' .cursor-n-resize') && !!document.querySelector(s + ' .cursor-s-resize');
    }, { args: [SEL], message: 'the long-press showing both resize handles' });
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('✕ removes a class from ONE day: Cancel writes nothing, OK writes that day alone', async () => {
    /* A removal deletes nothing — the day goes into `skips` and the Timetable
       tab adds it back — but a stray click would hide a lecture, so it asks
       BEFORE it writes. Cancel is the half that matters. */
    const page = await openRefDay(refDb([refWeekly(), refOneOff()]), 'rs-w');
    const before = await page.evaluate(RAW_DB);
    const sel = '[data-ref-remove="rs-w@' + MONDAY + '"]';

    const msg = await answering(page, false, CLICK_SOON_SEL, [sel]);
    assert.match(msg, /Mathematics/, 'the prompt names the class');
    assert.match(msg, /Only this day/, 'and says how much goes');
    assert.equal(await page.evaluate(RAW_DB), before, 'Cancel left track_db byte-identical');

    await answering(page, true, CLICK_SOON_SEL, [sel]);
    const w = await page.waitFor(function () {
      var e = (((JSON.parse(localStorage.getItem('track_db') || '{}').slots || [])[0] || {}).refSchedules || [])
        .filter(function (x) { return x.id === 'rs-w'; })[0];
      return e && e.skips ? e : false;
    }, { message: 'the removal reaching track_db' });
    assert.deepEqual(w.skips, [MONDAY], 'that day, and only that day');
    const rest = Object.assign({}, w); delete rest.skips;
    assert.deepEqual(rest, refWeekly(), 'nothing else about the class changed');
    assert.deepEqual(await page.evaluate(REF_ENTRY, 'rs-o'), refOneOff(), 'and its neighbour was not touched');

    await page.waitFor(function () { return !document.querySelector('[data-ref-id="rs-w"]'); },
      { message: 'the removed class leaving its column' });
    assert.deepEqual(await page.evaluate(REF_IDS_ON, MONDAY), ['rs-o'], 'the other class is still drawn');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* A removed day is NOT DRAWN on any of the three hour grids. progress.html
     carries its own copy of the skip test (refSkipped), so each surface is
     asserted SEPARATELY: doctor calendar-core.js and only HOME and
     DOCUMENTATIONS fail; doctor progress.html and only PROGRESS does. The
     one-off on the same day is the precondition that the layer rendered at
     all, so a dead layer cannot pass for a correct removal. */
  const removedSeed = (pageOver) => refDb([refWeekly({ skips: [MONDAY] }), refOneOff()], pageOver);

  await t.test('PROGRESS does not draw a day a class was removed from', async () => {
    const page = await open('progress.html', { db: removedSeed(), hash: '#schedule' });
    await page.waitFor(function () { return !!document.querySelector('[data-ref-id="rs-o"]'); },
      { message: 'the class layer rendering at all' });
    assert.deepEqual(await page.evaluate(REF_IDS_ON, MONDAY), ['rs-o'],
      'the weekly class is not drawn on ' + MONDAY + ', the one-off is');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('HOME does not draw a day a class was removed from', async () => {
    const page = await open('index.html', { db: removedSeed() });
    await page.waitFor(function () { return !!document.querySelector('.cal-cell'); }, { message: 'the home calendar' });
    assert.notEqual(await page.evaluate(CLICK_CAL_DAY, MONDAY), false, MONDAY + ' is in the grid');
    await page.waitFor(function () { return !!document.querySelector('[data-ref-id="rs-o"]'); },
      { message: 'the Home class layer rendering at all' });
    assert.deepEqual(await page.evaluate(REF_IDS_ON, MONDAY), ['rs-o']);
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('DOCUMENTATIONS does not draw a day a class was removed from', async () => {
    const page = await open('documentations.html', {
      db: removedSeed({ blocks: [{ id: 'b-1', type: 'schedule' }, { id: 'b-2', type: 'calendar', hidden: [], scope: 'page' }] }),
      hash: '?page=p-1'
    });
    await page.waitFor(function () { return !!document.querySelector('.cal-cell'); }, { message: 'the calendar block' });
    assert.notEqual(await page.evaluate(CLICK_CAL_DAY, MONDAY), false, MONDAY + ' is in the grid');
    await page.waitFor(function () { return !!document.querySelector('[data-ref-id="rs-o"]'); },
      { message: 'the Documentations class layer rendering at all' });
    assert.deepEqual(await page.evaluate(REF_IDS_ON, MONDAY), ['rs-o']);
    // and its Timetable list still LISTS the class, saying which day it skips
    assert.match(await page.evaluate(function () {
      var el = document.querySelector('[data-sched-import] [data-sched-skips]');
      return el ? el.textContent : '';
    }), new RegExp('not on ' + MONDAY));
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('GUARD: a class never squeezes or removes a real block, and sits BEHIND it by default', async () => {
    /* The geometry half passes on both sides by design: if it ever fails, a
       class has started taking a surface away, which is the "show both,
       always" rule. Since classes became real blocks they join this page's
       overlap ORDER — appended last, so a real block is in front until a
       double-click cycles the class forward. That ordering decides z-index
       only, never a width; the z half is what pins "appended last". */
    const note = { id: 'n-1', date: MONDAY, title: 'Real work', time: '09:00', blockDuration: 60, parts: [BLOCK] };
    const withRef = await open('progress.html', {
      // one-off again: the claim is about geometry, not about weekday resolution
      db: seedDb({ refSchedules: [refOneOff({ time: '09:00', duration: 90 })], calendarNotes: [note], deadlines: [] }),
      hash: '#schedule'
    });
    await withRef.waitFor(function () { return !!document.querySelector('[data-ref-id="rs-o"]'); },
      { message: 'the class block' });
    const geomWith = await withRef.evaluate(function () {
      var el = document.querySelector('[data-block-id="n-1:b"]');
      var r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    const z = await withRef.evaluate(function () {
      return {
        real: Number(getComputedStyle(document.querySelector('[data-block-id="n-1:b"]')).zIndex),
        cls: Number(getComputedStyle(document.querySelector('[data-ref-id="rs-o"]')).zIndex)
      };
    });
    assert.ok(z.real > z.cls, 'the real block is in front of the class it overlaps: ' + JSON.stringify(z));
    await withRef.close();

    const without = await open('progress.html', {
      db: seedDb({ refSchedules: [], calendarNotes: [note], deadlines: [] }),
      hash: '#schedule'
    });
    await without.waitFor(function () { return !!document.querySelector('[data-block-id="n-1:b"]'); },
      { message: 'the real block' });
    const geomWithout = await without.evaluate(function () {
      var el = document.querySelector('[data-block-id="n-1:b"]');
      var r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    await without.close();

    assert.deepEqual(geomWith, geomWithout,
      'the real block is exactly the size it is with no timetable behind it');
  });

  await t.test('✎ gives a class a note of its OWN — no day note is made, and deleting the last one deletes the key', async () => {
    /* `＋ day note here` was a misunderstanding (2026-10-16): the user wanted
       each class to carry the notes a task block carries. They live ON the
       class, so calendarNotes stays empty; and they are deleted the way a
       task's are — asked first, with Cancel keeping every byte. */
    const page = await openRefDay(refDb([refOneOff({ title: 'Mathematics' })]));
    await page.evaluate(function () { document.querySelector('[data-ref-id="rs-o"]').click(); });
    await sleep(300);
    assert.equal(await page.evaluate(function () {
      return !!document.querySelector('[data-ref-popup], [data-ref-make-note]');
    }), false, 'a click opens no card — the popup and its day-note button are gone');

    const key = 'rs-o@' + MONDAY;
    await page.evaluate(CLICK_SEL, '[data-ref-notes-btn="' + key + '"]');
    await page.waitFor(function (k) { return !!document.querySelector('[data-ref-note-title="' + k + '"]'); },
      { args: [key], message: 'the class notes panel' });
    await page.evaluate(function (setterSrc, k) {
      var set = new Function('return ' + setterSrc)();
      set(document.querySelector('[data-ref-note-title="' + k + '"]'), 'Lecture 3');
      set(document.querySelector('[data-ref-note-detail="' + k + '"]'), 'covered epithelium');
      return true;
    }, SET_REACT_INPUT, key);
    await page.evaluate(CLICK_SEL, '[data-ref-note-save="' + key + '"]');
    const withNote = await page.waitFor(function () {
      var e = (((JSON.parse(localStorage.getItem('track_db') || '{}').slots || [])[0] || {}).refSchedules || [])[0];
      return e && e.notes ? e : false;
    }, { message: 'the note reaching the class' });
    assert.equal(withNote.notes.length, 1);
    assert.equal(withNote.notes[0].title, 'Lecture 3');
    assert.equal(withNote.notes[0].detail, 'covered epithelium');
    assert.deepEqual(await page.evaluate(function () {
      return ((JSON.parse(localStorage.getItem('track_db')).slots || [])[0] || {}).calendarNotes;
    }), [], 'no day note was made');
    const noteId = withNote.notes[0].id;
    await page.waitFor(function (id) { return !!document.querySelector('[data-ref-note-chip="' + id + '"]'); },
      { args: [noteId], message: 'the 📌 chip on the class block' });

    const before = await page.evaluate(RAW_DB);
    const msg = await answering(page, false, CLICK_SOON_SEL, ['[data-ref-note-del="' + noteId + '"]']);
    assert.match(msg, /Delete this note/);
    assert.equal(await page.evaluate(RAW_DB), before, 'Cancel left track_db byte-identical');

    await answering(page, true, CLICK_SOON_SEL, ['[data-ref-note-del="' + noteId + '"]']);
    // wait for the delete to LAND (no note left, however it was stored), then
    // judge the shape — a writer leaving `notes: []` must fail on the assert
    const gone = await page.waitFor(function () {
      var e = (((JSON.parse(localStorage.getItem('track_db') || '{}').slots || [])[0] || {}).refSchedules || [])[0];
      return e && !(e.notes && e.notes.length) ? e : false;
    }, { message: 'the note leaving the class' });
    assert.equal(Object.prototype.hasOwnProperty.call(gone, 'notes'), false, 'the last note deleted the key');
    assert.deepEqual(gone, refOneOff({ title: 'Mathematics' }), 'and left the class exactly as it was');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* ── ★ Forced → Timetable ────────────────────────────────────────────── */

  const openTimetableTab = async page => {
    await page.evaluate(CLICK_SEL, '[data-dln-open="' + MONDAY + '"]');
    await page.waitFor(function () { return !!document.querySelector('[data-dln-tab="timetable"]'); },
      { message: 'the ★ Forced panel' });
    await page.evaluate(CLICK_SEL, '[data-dln-tab="timetable"]');
    await page.waitFor(function () { return !!document.querySelector('[data-ref-toolbar]'); },
      { message: 'the Timetable tab' });
  };
  const REF_GROUPS = function () {
    return Array.prototype.map.call(document.querySelectorAll('[data-ref-group]'),
      function (g) { return g.getAttribute('data-ref-group'); });
  };

  await t.test('★ Timetable lists every class, latest day first, and open all / close all flips every fold', async () => {
    /* The +LIN LOG layout the user asked for: groups that fold, cards that
       open, latest day first — a weekly class as ONE card in an EVERY WEEK
       group on top. Nothing is cut off at the opened day: an EARLIER lecture
       is listed too, which is the opposite of the notes and deadlines tabs. */
    const EARLY = '2020-03-02', LATE = '2099-06-01';
    const page = await openRefDay(refDb([
      refWeekly(),
      refOneOff(),
      refOneOff({ id: 'rs-early', date: EARLY, title: 'Long ago' }),
      refOneOff({ id: 'rs-late', date: LATE, title: 'Far ahead' }),
      refOneOff({ id: 'rs-o2', date: MONDAY, time: '08:00', title: 'Earlier that day' })
    ]));
    await openTimetableTab(page);
    assert.deepEqual(await page.evaluate(REF_GROUPS), ['weekly', LATE, MONDAY, EARLY],
      'every week first, then latest day first — the earlier lecture included');
    assert.deepEqual(await page.evaluate(function (d) {
      return Array.prototype.map.call(document.querySelectorAll('[data-ref-group="' + d + '"] [data-ref-card]'),
        function (c) { return c.getAttribute('data-ref-card'); });
    }, MONDAY), ['rs-o2', 'rs-o'], 'and by time inside a day');
    assert.equal(await page.evaluate(function (d) {
      return document.querySelector('[data-ref-group="' + d + '"]').className.indexOf('fuchsia') >= 0;
    }, MONDAY), true, 'the day it was opened from is tinted');

    const OPEN_CARDS = function () { return document.querySelectorAll('[data-ref-edit]').length; };
    const CARDS = function () { return document.querySelectorAll('[data-ref-card]').length; };
    assert.equal(await page.evaluate(OPEN_CARDS), 0, 'cards start shut, as in the LIN log');

    await page.evaluate(CLICK_SEL, '[data-ref-toggle-all]');
    await page.waitFor(function () { return document.querySelectorAll('[data-ref-edit]').length === 5; },
      { message: 'open all opening every card' });
    assert.match(await page.evaluate(function () { return document.querySelector('[data-ref-toggle-all]').textContent; }),
      /close all/);

    await page.evaluate(CLICK_SEL, '[data-ref-toggle-all]');
    // landed = the button flipped back; then judge what it folded
    await page.waitFor(function () { return /open all/.test(document.querySelector('[data-ref-toggle-all]').textContent); },
      { message: 'close all taking effect' });
    assert.equal(await page.evaluate(OPEN_CARDS), 0, 'every card shut');
    assert.equal(await page.evaluate(CARDS), 0, 'and every group folded, so no card is listed at all');
    assert.deepEqual(await page.evaluate(REF_GROUPS), ['weekly', LATE, MONDAY, EARLY], 'the groups stay listed');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* The three two-tab cases below close BOTH tabs in `finally`. A failed case
     that leaves a Progress tab open leaves a live writer: when the next case
     clears and seeds the origin, that tab's autosave puts its own
     refSchedules into the fresh data. Under a doctored refresh that turned one
     real failure into four, the later three failing on data they never wrote. */
  await t.test('★ Timetable: a rename reaches Documentations, which is open in another tab', async () => {
    /* "The timetable in DOC will also change in accord" — the user's words.
       Documentations is opened FIRST and left open, so what this proves is the
       live refresh, not a fresh mount reading the new value. */
    const docs = await open('documentations.html', { db: refDb([refOneOff()]), hash: '?page=p-1' });
    let page = null;
    try {
      await docs.waitFor(function () { return /Makeup lecture/.test((document.querySelector('[data-sched-import]') || {}).textContent || ''); },
        { message: 'the Documentations list' });
      // fresh:false — a second tab must not wipe the state the first is under test with
      page = await open('progress.html', { fresh: false, hash: '?date=' + MONDAY + '#schedule', viewport: [1280, 900] });
      await page.waitFor(function () { return !!document.querySelector('[data-ref-id="rs-o"]'); }, { message: 'the class' });

      await openTimetableTab(page);
      await page.evaluate(CLICK_SEL, '[data-ref-card-toggle="rs-o"]');
      await page.waitFor(function () { return !!document.querySelector('[data-ref-edit="rs-o"]'); }, { message: 'the open card' });
      await page.evaluate(CLICK_SEL, '[data-ref-edit="rs-o"]');
      await page.waitFor(function () { return !!document.querySelector('[data-ref-edit-title]'); }, { message: 'the editor' });
      await page.evaluate(function (setterSrc) {
        var set = new Function('return ' + setterSrc)();
        set(document.querySelector('[data-ref-edit-title]'), 'Histology II');
        set(document.querySelector('[data-ref-edit-detail]'), '');
        return true;
      }, SET_REACT_INPUT);
      await page.evaluate(CLICK_SEL, '[data-ref-edit-save]');
      const saved = await page.waitFor(function () {
        var e = (((JSON.parse(localStorage.getItem('track_db') || '{}').slots || [])[0] || {}).refSchedules || [])[0];
        return e && e.title !== 'Makeup lecture' ? e : false;
      }, { message: 'the rename reaching track_db' });
      assert.equal(saved.title, 'Histology II');
      assert.equal(Object.prototype.hasOwnProperty.call(saved, 'detail'), false, 'a blank detail writes no key');
      assert.equal(saved.docPageId, 'p-1', 'and the class still belongs to its page');

      await docs.waitFor(function () {
        return /Histology II/.test((document.querySelector('[data-sched-import]') || {}).textContent || '');
      }, { message: 'Documentations showing the new name, live' });
      assert.deepEqual(realErrors(page), []);
      assert.deepEqual(realErrors(docs), []);
    } finally {
      if (page) await page.close();
      await docs.close();
    }
  });

  await t.test('★ Timetable: ＋ add back puts a removed day back, and deletes the key with the last one', async () => {
    const page = await open('progress.html', {
      db: refDb([refWeekly({ skips: [MONDAY] }), refOneOff()]),
      hash: '?date=' + MONDAY + '#schedule', viewport: [1280, 900]
    });
    await page.waitFor(function () { return !!document.querySelector('[data-ref-id="rs-o"]'); }, { message: 'the day' });
    assert.equal(await page.evaluate(function () { return !!document.querySelector('[data-ref-id="rs-w"]'); }), false,
      'removed from this day');
    await openTimetableTab(page);
    await page.evaluate(CLICK_SEL, '[data-ref-card-toggle="rs-w"]');
    const sel = '[data-ref-unskip="rs-w@' + MONDAY + '"]';
    await page.waitFor(function (s) { return !!document.querySelector(s); }, { args: [sel], message: 'the add-back control' });
    // it deletes nothing and is undone by ✕, so — like the tab's own
    // `remove from schedule` — it does not ask
    await expectNoDialog(page, CLICK_SEL, [sel]);
    // landed = no removed day left, however stored; the shape is judged below
    const back = await page.waitFor(function () {
      var e = (((JSON.parse(localStorage.getItem('track_db') || '{}').slots || [])[0] || {}).refSchedules || [])[0];
      return e && !(e.skips && e.skips.length) ? e : false;
    }, { message: 'the add-back reaching track_db' });
    assert.deepEqual(back, refWeekly(), 'the key is gone and the class is exactly as pasted');
    await page.waitFor(function () { return !!document.querySelector('[data-ref-id="rs-w"]'); },
      { message: 'the class drawn on the day again' });
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('＋ Add a block lands on the grid and in Documentations, whose ✕ deletes it for good', async () => {
    /* A block added by hand belongs to no page, so EVERY Timetable block lists
       it under "Added in the Schedule" — the one place it can be deleted for
       good. Documentations' ✕ is the permanent delete, so it is tested on its
       Cancel path first. */
    const docs = await open('documentations.html', { db: refDb([refOneOff()]), hash: '?page=p-1' });
    let page = null;
    try {
      await docs.waitFor(function () { return !!document.querySelector('[data-sched-block]'); }, { message: 'the Timetable block' });
      page = await open('progress.html', { fresh: false, hash: '?date=' + MONDAY + '#schedule', viewport: [1280, 900] });
      await page.waitFor(function () { return !!document.querySelector('[data-ref-id="rs-o"]'); }, { message: 'the class' });

      await openTimetableTab(page);
      await page.evaluate(CLICK_SEL, '[data-ref-add-open]');
      await page.waitFor(function () { return !!document.querySelector('[data-ref-add-title]'); }, { message: 'the add form' });
      assert.equal(await page.evaluate(function () { return document.querySelector('[data-ref-add-date]').value; }), MONDAY,
        'it adds to the day the panel was opened from');
      await page.evaluate(function (setterSrc) {
        var set = new Function('return ' + setterSrc)();
        set(document.querySelector('[data-ref-add-title]'), 'Tutorial');
        set(document.querySelector('[data-ref-add-start]'), '15:00');
        set(document.querySelector('[data-ref-add-end]'), '16:30');
        return true;
      }, SET_REACT_INPUT);
      await page.evaluate(CLICK_SEL, '[data-ref-add-save]');
      const made = await page.waitFor(function () {
        var all = (((JSON.parse(localStorage.getItem('track_db') || '{}').slots || [])[0] || {}).refSchedules) || [];
        return all.length === 2 ? all[1] : false;
      }, { message: 'the new block reaching track_db' });
      assert.deepEqual(Object.keys(made).sort(), ['createdAt', 'date', 'duration', 'id', 'time', 'title'],
        'a one-off with only the keys it has — no page, no import, no blank detail');
      assert.equal(made.date, MONDAY);
      assert.equal(made.time, '15:00');
      assert.equal(made.duration, 90);
      await page.waitFor(function (id) { return !!document.querySelector('[data-ref-id="' + id + '"]'); },
        { args: [made.id], message: 'the new block on the grid' });

      const row = '[data-sched-hand] [data-sched-remove="' + made.id + '"]';
      await docs.waitFor(function (s) { return !!document.querySelector(s); }, { args: [row], message: 'Documentations listing it' });
      const before = await docs.evaluate(RAW_DB);
      const msg = await answering(docs, false, CLICK_SOON_SEL, [row]);
      assert.match(msg, /for good/, 'the prompt says the delete is permanent');
      assert.equal(await docs.evaluate(RAW_DB), before, 'Cancel left track_db byte-identical');
      await answering(docs, true, CLICK_SOON_SEL, [row]);
      await docs.waitFor(function (id) {
        var all = (((JSON.parse(localStorage.getItem('track_db') || '{}').slots || [])[0] || {}).refSchedules) || [];
        return !all.some(function (e) { return e.id === id; });
      }, { args: [made.id], message: 'the block deleted for good' });
      await page.waitFor(function (id) { return !document.querySelector('[data-ref-id="' + id + '"]'); },
        { args: [made.id], message: 'and gone from the open Progress grid' });
      assert.deepEqual(realErrors(page), []);
      assert.deepEqual(realErrors(docs), []);
    } finally {
      if (page) await page.close();
      await docs.close();
    }
  });

  await t.test('two tabs: a class Documentations deleted STAYS deleted after Progress edits another', async () => {
    /* Progress now writes the whole refSchedules array through its autosave,
       exactly as it writes calendarNotes. The hazard is a stale copy written
       back: a class deleted elsewhere coming back on Progress's next edit.
       The refresh on `storage` is what prevents it, and this proves it. */
    const page = await openRefDay(refDb([refWeekly(), refOneOff()]), 'rs-w');
    let docs = null;
    try {
      docs = await open('documentations.html', { fresh: false, hash: '?page=p-1' });
      const row = '[data-sched-import] [data-sched-remove="rs-o"]';
      await docs.waitFor(function (s) { return !!document.querySelector(s); }, { args: [row], message: 'the Documentations row' });
      await answering(docs, true, CLICK_SOON_SEL, [row]);
      await docs.waitFor(function () {
        var all = (((JSON.parse(localStorage.getItem('track_db') || '{}').slots || [])[0] || {}).refSchedules) || [];
        return all.length === 1;
      }, { message: 'the delete landing' });
      // Give Progress's refresh a fair chance, but do NOT make it a precondition:
      // with the refresh broken this case must fail on the resurrection itself,
      // in the assertion below, rather than on a timeout here.
      await page.waitFor(function () { return !document.querySelector('[data-ref-id="rs-o"]'); },
        { timeout: 5000 }).catch(() => {});

      await mouseDrag(page, await page.evaluate(REF_POINT, '[data-ref-id="rs-w"]'), 0, 64);
      const after = await page.waitFor(function () {
        var all = (((JSON.parse(localStorage.getItem('track_db') || '{}').slots || [])[0] || {}).refSchedules) || [];
        var w = all.filter(function (e) { return e.id === 'rs-w'; })[0];
        return w && w.time !== '09:00' ? all : false;
      }, { message: 'the Progress edit reaching track_db' });
      assert.deepEqual(after.map(function (e) { return e.id; }), ['rs-w'], 'the deleted class was not written back');
      assert.deepEqual(realErrors(page), []);
      assert.deepEqual(realErrors(docs), []);
    } finally {
      await page.close();
      if (docs) await docs.close();
    }
  });

  // ── the paste modal ──────────────────────────────────────────────────────

  const openSchedPaste = async (page, text) => {
    await page.waitFor(function () { return !!document.querySelector('[data-sched-paste]'); },
      { message: 'the Paste a timetable button' });
    await page.evaluate(function () { document.querySelector('[data-sched-paste]').click(); });
    await page.waitFor(function () { return !!document.querySelector('[data-paste-sched-input]'); },
      { message: 'the paste textarea' });
    await page.evaluate(function (setterSrc, value) {
      var set = new Function('return ' + setterSrc)();
      set(document.querySelector('[data-paste-sched-input]'), value);
    }, SET_REACT_INPUT, text);
  };

  await t.test('a pasted timetable reaches track_db with ONE arm per row', async () => {
    /* The shape rule the whole format rests on: a weekday row stores `dow` plus
       the range, a dated row stores `date` and no range, and neither ever
       carries both. Every reader refuses an entry with both arms, so the one
       place that mints a record is where that has to be got right. */
    const page = await open('documentations.html', { db: refDb([]), hash: '?page=p-1' });
    await openSchedPaste(page, [
      '::: track-schedule',
      '| Mon        | 09:00-10:30 | Mathematics    |',
      '| 2026-09-14 | 13:00       | Makeup lecture |',
      ':::'
    ].join('\n'));

    await page.waitFor(function () { return !!document.querySelector('[data-paste-sched-preview]'); },
      { message: 'the preview' });
    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'Add timetable'; }).click();
    });

    const stored = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var rs = ((db.slots || [])[0] || {}).refSchedules || [];
      return rs.length ? rs : false;
    }, { message: 'the timetable reaching track_db' });

    assert.equal(stored.length, 2);
    const weekly = stored.find(e => e.title === 'Mathematics');
    const once = stored.find(e => e.title === 'Makeup lecture');

    assert.equal(weekly.dow, 1, 'Mon is 1, the platform index');
    assert.equal(weekly.date, undefined, 'a weekly row stores NO date');
    assert.equal(weekly.duration, 90, 'the range became a duration');
    assert.ok(weekly.from, 'and it carries the repeat window');

    assert.equal(once.date, '2026-09-14');
    assert.equal(once.dow, undefined, 'a dated row stores NO dow');
    assert.equal(once.duration, 60, 'a bare start time falls back to the default length');
    assert.equal(once.from, undefined, 'and takes no repeat window');

    assert.equal(weekly.importId, once.importId, 'one paste is one import');
    assert.equal(weekly.docPageId, 'p-1', 'owned by the page it was pasted into');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* ── the detail cell ──────────────────────────────────────────────────────
     A fourth cell keeps the lecturer, room or mode APART from the topic. It is
     optional, so absence is the default and '' must never be written — and it
     is read by two independent copies of the same helper, so every surface is
     asserted separately below. A rule forgotten at one of several surfaces is
     this repository's recurring bug, and a single shared assertion would let a
     forgotten copy hide behind a passing sibling. */

  const DETAIL_PASTE = [
    '::: track-schedule',
    '| ' + MONDAY + ' | 09:00-10:30 | Epithelial tissue | Dr Wanida · R305 |',
    '| ' + MONDAY + ' | 13:00       | Makeup lecture    |                  |',
    ':::'
  ].join('\n');

  const addSchedPaste = async page => {
    await page.waitFor(function () { return !!document.querySelector('[data-paste-sched-preview]'); },
      { message: 'the preview' });
    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'Add timetable'; }).click();
    });
    return page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var rs = ((db.slots || [])[0] || {}).refSchedules || [];
      return rs.length ? rs : false;
    }, { message: 'the timetable reaching track_db' });
  };

  await t.test('DOCUMENTATIONS stores a detail apart from the title, and a blank one not at all', async () => {
    const page = await open('documentations.html', { db: refDb([]), hash: '?page=p-1' });
    await openSchedPaste(page, DETAIL_PASTE);
    const stored = await addSchedPaste(page);

    assert.equal(stored.length, 2);
    const withDetail = stored.find(e => e.title === 'Epithelial tissue');
    const without = stored.find(e => e.title === 'Makeup lecture');

    // The whole point of the column: the topic is no longer carrying a room.
    assert.equal(withDetail.title, 'Epithelial tissue', 'the title is the topic ALONE');
    assert.equal(withDetail.detail, 'Dr Wanida · R305');

    /* The absence half, and it is the load-bearing one. `detail: ''` is not a
       detail — no fallback sits behind this field, so it follows the `time` /
       `link` rule and NOT the `cautionDates: []` rule. Asserting the key list
       is what catches a writer that stores an empty string. */
    assert.equal(Object.prototype.hasOwnProperty.call(without, 'detail'), false,
      'a blank detail cell writes no key at all: ' + JSON.stringify(Object.keys(without)));

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('DOCUMENTATIONS lists the detail in its own column, in the preview and on the page', async () => {
    // The preview and the stored list render through ONE function, so this
    // asserts both: what is previewed cannot differ from what is stored.
    const page = await open('documentations.html', { db: refDb([]), hash: '?page=p-1' });
    await openSchedPaste(page, DETAIL_PASTE);

    const inPreview = await page.waitFor(function () {
      var el = document.querySelector('[data-paste-sched-preview]');
      if (!el) return false;
      var cells = el.querySelectorAll('[data-sched-detail]');
      return cells.length ? Array.prototype.map.call(cells, function (c) { return c.textContent; }) : false;
    }, { message: 'the preview showing a detail column' });
    assert.deepEqual(inPreview, ['Dr Wanida · R305', ''],
      'the blank one draws an empty cell rather than being skipped');

    await addSchedPaste(page);
    const onPage = await page.waitFor(function () {
      var rows = document.querySelectorAll('[data-sched-import] [data-sched-detail]');
      return rows.length ? Array.prototype.map.call(rows, function (c) { return c.textContent; }) : false;
    }, { message: 'the stored list showing a detail column' });
    assert.deepEqual(onPage.slice().sort(), ['', 'Dr Wanida · R305']);

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('PROGRESS shows the detail on the class card that ⓘ opens in ★ Forced → Timetable', async () => {
    /* The popup that used to carry the detail is gone, so the detail lives on
       the class's card now — and ⓘ on the block is the way there, opening the
       panel on the Timetable tab with that card already open. */
    const page = await openRefDay(refDb([refOneOff({ title: 'Epithelial tissue', detail: 'Dr Wanida · R305' })]));
    await page.evaluate(CLICK_SEL, '[data-ref-info="rs-o@' + MONDAY + '"]');
    const detail = await page.waitFor(function () {
      var el = document.querySelector('[data-ref-card="rs-o"] [data-ref-card-detail]');
      return el ? el.textContent : false;
    }, { message: 'the open card on the Timetable tab' });
    assert.equal(detail, 'Dr Wanida · R305');
    assert.equal(await page.evaluate(function () {
      return document.querySelector('[data-dln-tab="timetable"]').className.indexOf('bg-fuchsia-600') >= 0;
    }), true, 'on the Timetable tab');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* The tooltip, asserted on each of the three grids SEPARATELY. progress.html
     carries its own copy of the block builder (it does not load
     calendar-core.js), so doctoring one file must fail only its own surfaces —
     which is the direct proof that neither copy can be forgotten. */
  const REF_TOOLTIP = function (mon) {
    var el = document.querySelector('[data-ref-day="' + mon + '"]');
    return el ? el.getAttribute('title') : null;
  };
  const detailSeed = () => refDb([refOneOff({ title: 'Epithelial tissue', detail: 'Dr Wanida · R305' })]);

  await t.test('PROGRESS carries the detail in the block tooltip', async () => {
    const page = await open('progress.html', { db: detailSeed(), hash: '#schedule' });
    await page.waitFor(function () { return !!document.querySelector('[data-ref-id="rs-o"]'); },
      { message: 'the backdrop' });
    const tip = await page.evaluate(REF_TOOLTIP, MONDAY);
    assert.match(tip, /Epithelial tissue/);
    assert.match(tip, /Dr Wanida · R305/, 'the detail is reachable without opening the popover');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('HOME carries the detail in the block tooltip', async () => {
    const page = await open('index.html', { db: detailSeed() });
    await page.waitFor(function () { return !!document.querySelector('.cal-cell'); },
      { message: 'the home calendar' });
    assert.notEqual(await page.evaluate(CLICK_CAL_DAY, MONDAY), false, MONDAY + ' is in the grid');
    await page.waitFor(function () { return !!document.querySelector('[data-ref-id="rs-o"]'); },
      { message: 'the Home backdrop' });
    const tip = await page.evaluate(REF_TOOLTIP, MONDAY);
    assert.match(tip, /Dr Wanida · R305/);
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('DOCUMENTATIONS carries the detail in the block tooltip', async () => {
    const page = await open('documentations.html', {
      db: refDb([refOneOff({ title: 'Epithelial tissue', detail: 'Dr Wanida · R305' })], {
        blocks: [{ id: 'b-1', type: 'schedule' }, { id: 'b-2', type: 'calendar', hidden: [], scope: 'page' }]
      }),
      hash: '?page=p-1'
    });
    await page.waitFor(function () { return !!document.querySelector('.cal-cell'); },
      { message: 'the calendar block' });
    assert.notEqual(await page.evaluate(CLICK_CAL_DAY, MONDAY), false, MONDAY + ' is in the grid');
    await page.waitFor(function () { return !!document.querySelector('[data-ref-id="rs-o"]'); },
      { message: 'the Documentations backdrop' });
    const tip = await page.evaluate(REF_TOOLTIP, MONDAY);
    assert.match(tip, /Dr Wanida · R305/);
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('GUARD: a three-column paste still works, and copies back out as three', async () => {
    /* Passes on both sides of the detail column by design. Every paste written
       before the fourth cell existed must keep working untouched, and `⧉ copy
       as text` must give back the three columns it was pasted as rather than a
       fourth blank one hanging off every row. */
    const page = await open('documentations.html', { db: refDb([]), hash: '?page=p-1' });
    await openSchedPaste(page, [
      '| ' + MONDAY + ' | 09:00-10:30 | Mathematics |',
      '| ' + MONDAY + ' | 13:00       | Physics     |'
    ].join('\n'));
    const stored = await addSchedPaste(page);

    assert.equal(stored.length, 2);
    for (const e of stored) {
      assert.equal(Object.prototype.hasOwnProperty.call(e, 'detail'), false,
        'a three-column paste stores no detail key: ' + JSON.stringify(Object.keys(e)));
    }

    const copied = await page.evaluate(function () {
      var btn = Array.prototype.find.call(document.querySelectorAll('button'),
        function (b) { return b.textContent.trim().indexOf('copy as text') !== -1; });
      if (!btn) return null;
      return window.TrackSchedulePaste.formatScheduleText(
        ((JSON.parse(localStorage.getItem('track_db')).slots || [])[0] || {}).refSchedules);
    });
    for (const line of copied.split('\n').filter(l => l.indexOf('|') !== -1)) {
      assert.equal(line.split('|').length - 1, 4, 'three cells, four pipes: ' + line);
    }

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a malformed paste names its line and writes NOTHING', async () => {
    // The Cancel path, which is the one that matters: the error shows, the
    // preview is absent, and clicking the disabled button anyway leaves the
    // stored bytes exactly as they were.
    const page = await open('documentations.html', { db: refDb([]), hash: '?page=p-1' });
    const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });

    await openSchedPaste(page, [
      '| Mon | 09:00-10:30 | Mathematics |',
      '| Tue | 13:00 |'
    ].join('\n'));

    const err = await page.waitFor(function () {
      var el = document.querySelector('[data-paste-sched-errors]');
      return el ? el.innerText : false;
    }, { message: 'the parse error' });
    assert.match(err, /Line 2/, 'the offending line is named');
    assert.match(err, /has 2 cells/, 'and what is actually wrong with it');
    // The message names BOTH legal shapes, not just the one it is not. A user
    // told only "needs 3" would not know the detail column exists.
    assert.match(err, /needs 3/);
    assert.match(err, /or 4/);

    assert.equal(await page.evaluate(function () {
      return !!document.querySelector('[data-paste-sched-preview]');
    }), false, 'nothing is previewed');

    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'Add timetable'; }).click();
    });
    await sleep(400);
    assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }), before,
      'track_db is byte-identical after clicking a disabled Add');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('an inverted repeat range is REFUSED — it would draw nothing at all', async () => {
    /* The one range mistake worth refusing outright. Everything would look like
       it worked and not a single class would ever be drawn, which is the
       invisible-data failure this project does not accept. */
    const page = await open('documentations.html', { db: refDb([]), hash: '?page=p-1' });
    const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });

    await openSchedPaste(page, '| Mon | 09:00-10:30 | Mathematics |');
    await page.waitFor(function () { return !!document.querySelector('[data-paste-sched-from]'); },
      { message: 'the repeat range, which only a weekday row asks for' });

    await page.evaluate(function (setterSrc) {
      var set = new Function('return ' + setterSrc)();
      set(document.querySelector('[data-paste-sched-from]'), '2026-12-19');
      set(document.querySelector('[data-paste-sched-until]'), '2026-09-07');
    }, SET_REACT_INPUT);

    await page.waitFor(function () { return !!document.querySelector('[data-paste-sched-range-error]'); },
      { message: 'the inverted-range refusal' });

    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'Add timetable'; }).click();
    });
    await sleep(400);
    assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }), before,
      'track_db is byte-identical');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('removing an import asks first, and Cancel keeps every class', async () => {
    const page = await open('documentations.html', {
      db: refDb([refWeekly(), refOneOff()]), hash: '?page=p-1'
    });
    await page.waitFor(function () { return !!document.querySelector('[data-sched-remove-import]'); },
      { message: 'the remove-import control' });

    const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });

    // Cancel first — a prompt that displays and then deletes anyway is worse
    // than none, so this is the half that matters.
    const msg = await answering(page, false, CLICK_SOON_SEL, ['[data-sched-remove-import]']);
    assert.match(msg, /2 classes/, 'the prompt says how much is going');
    assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }), before,
      'Cancel left track_db byte-identical');

    // and then confirm, so the control is shown to work at all
    await answering(page, true, CLICK_SOON_SEL, ['[data-sched-remove-import]']);
    const left = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var rs = ((db.slots || [])[0] || {}).refSchedules;
      return rs && rs.length === 0 ? 'gone' : false;
    }, { message: 'the import being removed' });
    assert.equal(left, 'gone');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a class outlives its page, and stays removable', async () => {
    /* Deleting a documentation page does NOT delete what it authored — the day
       note rule. Without an orphan section those classes would still be drawn
       on three hour grids with no way to reach them, which is exactly the
       unreachable-data outcome this project refuses. */
    const page = await open('documentations.html', {
      db: seedDb({
        refSchedules: [refWeekly({ docPageId: 'p-gone' })],
        calendarNotes: [], deadlines: [],
        docPages: [F.docPage('p-1', { title: 'Term 1', blocks: [{ id: 'b-1', type: 'schedule' }] })]
      }),
      hash: '?page=p-1'
    });

    const orphanText = await page.waitFor(function () {
      var el = document.querySelector('[data-sched-orphans]');
      return el ? el.innerText : false;
    }, { message: 'the orphaned-class section' });
    assert.match(orphanText, /no longer exists/);
    assert.match(orphanText, /Mathematics/, 'and the class itself is listed, not just counted');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('the Timetable filter hides the backdrop and leaves real blocks alone', async () => {
    const page = await open('documentations.html', {
      db: refDb([refWeekly()], {
        blocks: [{ id: 'b-2', type: 'calendar', hidden: ['ref'], scope: 'page' }]
      }),
      hash: '?page=p-1'
    });
    await page.waitFor(function () { return !!document.querySelector('.cal-cell'); },
      { message: 'the calendar block' });
    await page.evaluate(CLICK_CAL_DAY, MONDAY);
    await sleep(400);
    assert.equal(await page.evaluate(function () {
      return document.querySelectorAll('.cal-sched-ref').length;
    }), 0, 'switched off, the backdrop is gone');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('refSchedules round-trips through export → import, both arms, with removed days and notes', async () => {
    const note = { id: 'rn-1', title: 'Lecture 3', detail: 'covered epithelium', createdAt: 1 };
    const page = await open('index.html', {
      db: refDb([refWeekly({ skips: [MONDAY] }), refOneOff({ notes: [note] })])
    });
    const exported = await page.evaluate(function () {
      var db = JSON.parse(localStorage.getItem('track_db'));
      return JSON.stringify(db.slots[0]);
    });
    assert.match(exported, /refSchedules/);

    const back = await page.evaluate(function (json) {
      var slot = window.TrackSchema.normalizeSlot(JSON.parse(json));
      return slot.refSchedules;
    }, exported);
    assert.equal(back.length, 2);
    // whole entries, so a removed day or a note dropped on the way fails here
    assert.deepEqual(back.find(function (e) { return e.id === 'rs-w'; }), refWeekly({ skips: [MONDAY] }));
    assert.deepEqual(back.find(function (e) { return e.id === 'rs-o'; }), refOneOff({ notes: [note] }));

    await page.close();
  });

  await t.test('PHONE: the Timetable tab fits a 390px screen, every card open', async () => {
    const page = await open('progress.html', {
      db: refDb([refWeekly({ detail: 'Dr Ada · Room 305-306, Building 3' }),
        refOneOff({ title: 'A lecture whose topic is long enough to wrap twice on a phone', detail: 'อ.วินิดา · ห้องปฏิบัติการ 305-306' })]),
      hash: '?date=' + MONDAY + '#schedule', viewport: PHONE
    });
    await page.waitFor(function () { return !!document.querySelector('[data-ref-id="rs-o"]'); }, { message: 'the class' });
    await openTimetableTab(page);
    await page.evaluate(CLICK_SEL, '[data-ref-toggle-all]');
    await page.waitFor(function () { return document.querySelectorAll('[data-ref-edit]').length === 2; },
      { message: 'every card open' });
    const fit = await page.evaluate(function () {
      var panel = document.querySelector('[data-dln-panel]');
      var r = panel.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), vw: window.innerWidth,
        overflow: panel.scrollWidth - panel.clientWidth };
    });
    assert.ok(fit.left >= 0 && fit.right <= fit.vw, 'the panel is inside the screen: ' + JSON.stringify(fit));
    assert.ok(fit.overflow <= 1, 'and nothing in it scrolls sideways: ' + JSON.stringify(fit));
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  // ── 16. JSX accent literals resolve from the theme ──────────────────────
  /* The Grit remap layer reaches Tailwind classes and styles.css, never a hex
     literal in an inline style object or an SVG presentation attribute — so
     the donut, the ring tracks and their siblings stayed indigo-on-slate on a
     green page, and some of it failed contrast outright (the donut's "0%" was
     rgb(226,232,240) on a #f1f3ee surface, and the cyan active marker measured
     1.43:1). progress.html now routes its UI-accent literals through one
     ACCENT map of var(--color-accent*) values. DATA colours — PALETTE,
     SA_COLORS, STAGE_COLORS_*, mm.color, action.color, chipColor — are
     deliberately untouched, and the GUARD case below is what keeps a later
     "finish the job" sweep from flattening them. The two Night cases pin the
     other half of the decision: three hues stayed byte-identical there and two
     did not, so Night is deliberately NOT "unchanged" and must not be
     "restored" to the old literals wholesale. */

  /* Resolve any CSS colour (a token's raw value, or a hex) to the browser's
     rgb() spelling so computed styles compare as strings. An EMPTY input is
     returned as null rather than resolved: an undefined token would otherwise
     inherit the page's text colour and hand a contrast case a false pass. */
  const RESOLVE_COLOR = function (value) {
    if (!value) return null;
    var probe = document.createElement('span');
    document.body.appendChild(probe);
    probe.style.color = value;
    var out = getComputedStyle(probe).color;
    probe.remove();
    return out;
  };

  const ACCENT_TOKEN_RGB = function (resolveSrc, name) {
    var resolve = new Function('return ' + resolveSrc)();
    return resolve(getComputedStyle(document.documentElement).getPropertyValue(name).trim());
  };

  /* A goal with one of three tasks done, so the DonutChart draws its arc
     (pct > 0) without being full — the state where the old code picked its
     indigo shades. */
  const accentGoalsDb = () => seedDb({
    goals: [F.task('g-1', {
      title: 'Root goal',
      milestones: [F.milestone('ms-1', '2026-03-01', '2026-03-10')],
      children: [
        F.task('g-1a', { completed: true }),
        F.task('g-1b'),
        F.task('g-1c')
      ]
    })]
  });

  const READ_ACCENT_HOOKS = function () {
    var out = {};
    Array.prototype.forEach.call(document.querySelectorAll('[data-accent]'), function (el) {
      var key = el.getAttribute('data-accent');
      if (out[key]) return; // the first instance is the asserted one
      var cs = getComputedStyle(el);
      out[key] = { stroke: cs.stroke, fill: cs.fill, bg: cs.backgroundColor,
        dash: el.getAttribute('stroke-dasharray') || cs.strokeDasharray || '' };
    });
    return out;
  };

  await t.test('ACCENT: the progression donut follows the theme under Grit', async () => {
    const page = await open('progress.html', { db: accentGoalsDb(), extra: { track_theme: 'grit' } });
    await page.waitFor(function () { return !!document.querySelector('[data-accent="donut-arc"]'); },
      { message: 'the donut arc (a partially complete parent goal)' });

    const seen = await page.evaluate(READ_ACCENT_HOOKS);
    const tok = {};
    for (const name of ['--color-accent', '--color-surface-strong', '--color-text', '--color-text-muted']) {
      tok[name] = await page.evaluate(ACCENT_TOKEN_RGB, RESOLVE_COLOR.toString(), name);
    }

    // The claim this case is named for goes first (AGENTS.md: a case asserting
    // N claims is proven for exactly the one that fired).
    assert.equal(seen['donut-arc'].stroke, tok['--color-accent'],
      'the donut arc strokes the accent token, not indigo (' + seen['donut-arc'].stroke + ')');
    assert.notEqual(seen['donut-arc'].stroke, 'rgb(99, 102, 241)', 'the indigo literal is gone');
    assert.notEqual(seen['donut-arc'].stroke, 'rgb(79, 70, 229)', 'both indigo shades are gone');
    assert.equal(seen['donut-track'].stroke, tok['--color-surface-strong'],
      'the track ring is the surface-strong token, not slate #1e293b');
    assert.equal(seen['donut-pct'].fill, tok['--color-text'],
      'the % text is the text token — the old #e2e8f0 was invisible on a Grit surface');
    assert.equal(seen['donut-sub'].fill, tok['--color-text-muted'],
      'the done/total sub-label is the muted text token');
    assert.ok(seen['donut-arc'].dash && seen['donut-arc'].dash !== 'none',
      'the arc still carries its dasharray — colour moved into style, geometry stayed put');

    await page.close();
  });

  await t.test('ACCENT: the hero ring TRACK follows the theme under Grit', async () => {
    const page = await open('progress.html', { db: accentGoalsDb(), extra: { track_theme: 'grit' } });
    await page.waitFor(function () { return !!document.querySelector('[data-accent="hero-track"]'); },
      { message: 'the hero progression ring' });

    const seen = await page.evaluate(READ_ACCENT_HOOKS);
    const surfaceStrong = await page.evaluate(ACCENT_TOKEN_RGB, RESOLVE_COLOR.toString(), '--color-surface-strong');
    assert.equal(seen['hero-track'].stroke, surfaceStrong,
      'the hero track is the surface-strong token, not slate (' + seen['hero-track'].stroke + ')');

    await page.close();
  });

  await t.test('GUARD: the hero ring ARC keeps its goal colour in BOTH themes', async () => {
    /* heroColor is PALETTE[activeIdx] — the goal's categorical identity, the
       same value as its tab dot. It is DATA and must stay theme-invariant; a
       sweep that "finishes the job" by tokenising it trips this case. Passes
       on both sides of the accent change by design. */
    const arcOf = async theme => {
      const page = await open('progress.html', { db: accentGoalsDb(), extra: { track_theme: theme } });
      await page.waitFor(function () { return !!document.querySelector('[data-accent="hero-arc"]'); },
        { message: 'the hero arc' });
      const stroke = (await page.evaluate(READ_ACCENT_HOOKS))['hero-arc'].stroke;
      await page.close();
      return stroke;
    };
    const grit = await arcOf('grit');
    const night = await arcOf('dark');
    assert.equal(grit, 'rgb(99, 102, 241)', 'Grit: the arc is PALETTE[0], untouched by the accent work');
    assert.equal(night, grit, 'Night agrees — a goal colour is data, not chrome');
  });

  await t.test('ACCENT: under Night the donut arc brightens to the tuned indigo', async () => {
    /* Night kept three of the five hues byte-identical, but indigo #6366f1
       measured 3.43:1 and violet #8b5cf6 3.62:1 on the Night surfaces — below
       the same bar Grit is held to — so those two moved one Tailwind shade
       lighter (#818cf8, #a78bfa), the values their class siblings already
       render in Night. The user chose this over byte-identical Night. This
       case pins the rendered half of that decision. */
    const page = await open('progress.html', { db: accentGoalsDb(), extra: { track_theme: 'dark' } });
    await page.waitFor(function () { return !!document.querySelector('[data-accent="donut-arc"]'); },
      { message: 'the donut arc under Night' });
    const arc = (await page.evaluate(READ_ACCENT_HOOKS))['donut-arc'];
    assert.equal(arc.stroke, 'rgb(129, 140, 248)', 'Night: the arc is the tuned indigo-400');
    assert.notEqual(arc.stroke, 'rgb(79, 70, 229)', 'the old sub-50% shade is gone');
    assert.notEqual(arc.stroke, 'rgb(99, 102, 241)', 'and so is the old over-50% shade');
    await page.close();
  });

  await t.test("ACCENT: the milestone grid's today outline follows the theme under Grit", async () => {
    /* The outline sits in the SAME inline style object as a `${tint}12`
       background that must stay a literal hex — alpha-by-concatenation cannot
       take a var() — so this pins that the two halves were told apart. */
    const page = await open('progress.html', { db: accentGoalsDb(), hash: '#milestones', extra: { track_theme: 'grit' } });
    await page.waitFor(function () { return !!document.querySelector('[data-accent="today-cell"]'); },
      { message: "the milestone grid's today cell" });

    const cell = await page.evaluate(function () {
      var el = document.querySelector('[data-accent="today-cell"]');
      var cs = getComputedStyle(el);
      return { outline: cs.outlineColor, width: cs.outlineWidth, style: cs.outlineStyle };
    });
    const accent = await page.evaluate(ACCENT_TOKEN_RGB, RESOLVE_COLOR.toString(), '--color-accent');

    assert.equal(cell.outline, accent,
      'the today outline is the accent token, not indigo (' + cell.outline + ')');
    assert.notEqual(cell.outline, 'rgb(99, 102, 241)', 'the indigo literal is gone');
    assert.equal(cell.style, 'solid', 'and it is still a 1px solid outline, not dropped');
    assert.equal(cell.width, '1px');

    await page.close();
  });

  await t.test('ACCENT: every accent token clears 4.5:1 on the Grit surfaces', async () => {
    /* The literals these tokens replace measured 1.43:1 (cyan) to 3.54:1
       (indigo) on Grit. Computed from the live tokens, like the THEME contrast
       case, so a palette tweak is checked instead of re-recorded. A missing
       token reports itself as "undefined" rather than resolving to the
       inherited text colour — which would pass the ratio and hide the gap. */
    const MEASURE = function () {
      var cs = getComputedStyle(document.documentElement);
      var tok = function (n) { return cs.getPropertyValue(n).trim(); };
      var probe = document.createElement('span');
      document.body.appendChild(probe);
      var rgb = function (v) {
        probe.style.color = v;
        var m = getComputedStyle(probe).color.match(/[\d.]+/g);
        return m ? [+m[0], +m[1], +m[2]] : null;
      };
      var lum = function (c) {
        var f = c.map(function (v) {
          v = v / 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
      };
      var ratio = function (a, b) {
        var x = lum(a), y = lum(b);
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      };
      var accents = ['--color-accent', '--color-accent-done', '--color-accent-pending',
        '--color-accent-study', '--color-accent-live'];
      var surfaces = ['--color-app-bg', '--color-surface', '--color-surface-muted'];
      var worst = { ratio: 99, pair: null };
      accents.forEach(function (a) {
        var rawA = tok(a);
        if (!rawA) { worst = { ratio: 0, pair: a + ' is undefined' }; return; }
        surfaces.forEach(function (s) {
          var x = rgb(rawA), y = rgb(tok(s));
          if (!x || !y) { worst = { ratio: 0, pair: a + ' did not resolve' }; return; }
          var r = ratio(x, y);
          if (r < worst.ratio) worst = { ratio: r, pair: a + ' on ' + s };
        });
      });
      probe.remove();
      return worst;
    };
    const grit = await open('progress.html', { db: seedDb(), extra: { track_theme: 'grit' } });
    const g = await grit.evaluate(MEASURE);
    assert.ok(g.ratio >= 4.5,
      'grit: worst accent pair is ' + g.pair + ' at ' + g.ratio.toFixed(2) + ':1');
    await grit.close();

    const night = await open('progress.html', { db: seedDb(), extra: { track_theme: 'dark' } });
    const n = await night.evaluate(MEASURE);
    assert.ok(n.ratio >= 4.5,
      'night: worst accent pair is ' + n.pair + ' at ' + n.ratio.toFixed(2) + ':1');
    await night.close();
  });

  await t.test('ACCENT: under Grit a JSX accent equals its Tailwind class sibling', async () => {
    /* The remap layer already decides what indigo/emerald/violet/cyan become
       under Grit for CLASSES. The tokens must resolve to those same values, or
       a text-indigo-400 label and the bar beside it end up two different
       greens. Night is exempt by design: there the classes keep Tailwind's
       shade-400 values while the tokens keep the old shade-500 literals. */
    const page = await open('progress.html', { db: seedDb(), extra: { track_theme: 'grit' } });
    await page.waitFor(function () {
      var el = document.querySelector('#root'); return !!el && el.children.length > 0;
    }, { message: 'progress.html mounting' });
    const pairs = await page.evaluate(function (resolveSrc) {
      var resolve = new Function('return ' + resolveSrc)();
      var cs = getComputedStyle(document.documentElement);
      var tokenRgb = function (n) { return resolve(cs.getPropertyValue(n).trim()); };
      var classRgb = function (cls) {
        var probe = document.createElement('span');
        probe.className = cls;
        document.body.appendChild(probe);
        var out = getComputedStyle(probe).color;
        probe.remove();
        return out;
      };
      return [
        { token: '--color-accent',         cls: 'text-indigo-400',  t: tokenRgb('--color-accent'),         c: classRgb('text-indigo-400') },
        { token: '--color-accent-done',    cls: 'text-emerald-400', t: tokenRgb('--color-accent-done'),    c: classRgb('text-emerald-400') },
        { token: '--color-accent-pending', cls: 'text-amber-400',   t: tokenRgb('--color-accent-pending'), c: classRgb('text-amber-400') },
        { token: '--color-accent-study',   cls: 'text-violet-400',  t: tokenRgb('--color-accent-study'),   c: classRgb('text-violet-400') },
        { token: '--color-accent-live',    cls: 'text-cyan-400',    t: tokenRgb('--color-accent-live'),    c: classRgb('text-cyan-400') }
      ];
    }, RESOLVE_COLOR.toString());
    for (const pair of pairs) {
      assert.ok(pair.t, pair.token + ' is defined');
      assert.equal(pair.t, pair.c,
        pair.token + ' matches ' + pair.cls + ' under Grit (' + pair.t + ' vs ' + pair.c + ')');
    }
    await page.close();
  });

  await t.test('ACCENT: the Night tokens fix the two failing hues and keep the other three', async () => {
    /* The user's decision, pinned: emerald, amber and cyan cleared 4.5:1 in
       Night already and stay byte-identical; indigo and violet did not and
       move one Tailwind shade lighter. A later retune that forgets the Night
       block, or "restores" the old literals wholesale, trips this. */
    const page = await open('progress.html', { db: seedDb(), extra: { track_theme: 'dark' } });
    const tokens = await page.evaluate(function (resolveSrc) {
      var resolve = new Function('return ' + resolveSrc)();
      var cs = getComputedStyle(document.documentElement);
      var read = function (n) { return resolve(cs.getPropertyValue(n).trim()); };
      return {
        accent: read('--color-accent'), done: read('--color-accent-done'),
        pending: read('--color-accent-pending'), study: read('--color-accent-study'),
        live: read('--color-accent-live')
      };
    }, RESOLVE_COLOR.toString());
    assert.equal(tokens.accent, 'rgb(129, 140, 248)', 'Night accent is indigo-400 — #6366f1 measured 3.43:1');
    assert.equal(tokens.study, 'rgb(167, 139, 250)', 'Night study is violet-400 — #8b5cf6 measured 3.62:1');
    assert.equal(tokens.done, 'rgb(16, 185, 129)', 'Night done keeps the old emerald #10b981');
    assert.equal(tokens.pending, 'rgb(245, 158, 11)', 'Night pending keeps the old amber #f59e0b');
    assert.equal(tokens.live, 'rgb(34, 211, 238)', 'Night live keeps the old cyan #22d3ee');
    await page.close();
  });

  /* ── QUEST: the flags must travel with toLearn ──────────────────────────
     THREE sites in progress.html move a parent's toLearn/mmTargets/milestones
     into a new sub-goal and blank the parent's. questLearn/starLearn are in the
     same key space and must travel with them.

     Miss one and the failure is silent and expensive: TrackQuest.questLearnOf
     gates on toLearn membership, so a flag left on a node whose toLearn was
     emptied does not merely dangle — the quest DISAPPEARS. A curated entry lost
     as a side effect of adding a sub-goal, with no error anywhere.

     Three cases rather than one because that failure has THREE independent
     doors. A single case would let two of them stay open behind a passing
     sibling — this repository's recurring bug, and the reason the baselines for
     these are three disjoint singletons.

     Mind-map ids are NUMBERS here (sir-ks02.html mints them from nid()), which
     is what production stores. A string-id fixture would pass against a module
     that drops every real toLearn entry. */

  // toLearn 10 and 11 are the two mms F.populatedSlot already seeds.
  const questGoal = (id, over = {}) => Object.assign({
    id, title: 'Quest goal ' + id, children: [], completed: false, createdAt: 1,
    scheduledDate: null, toLearn: [10, 11], mmTargets: { 10: { stage: 2 } },
    milestones: [], questLearn: [10], starLearn: [10]
  }, over);

  const findNodeById = function (nodes, id) {
    for (var i = 0; i < (nodes || []).length; i++) {
      if (nodes[i] && nodes[i].id === id) return nodes[i];
      var hit = findNodeById(nodes[i] && nodes[i].children, id);
      if (hit) return hit;
    }
    return null;
  };

  // The one assertion all three share: the flags arrived on the new sub-goal
  // and left NO ghost behind. Spelled once so a fourth transfer site added
  // later can reuse it rather than re-deriving what "transferred" means.
  const assertTransferred = (parent, label) => {
    assert.ok(parent, label + ': the parent goal is still there');
    const sub = (parent.children || []).filter(c => c.isSubGoal)[0];
    assert.ok(sub, label + ': a sub-goal was created');
    assert.deepEqual(sub.toLearn, [10, 11], label + ': toLearn moved down');
    assert.deepEqual(sub.questLearn, [10], label + ': the QUEST moved down with it');
    assert.deepEqual(sub.starLearn, [10], label + ': and so did its star');
    assert.deepEqual(parent.toLearn, [], label + ": the parent's toLearn was blanked");
    assert.equal('questLearn' in parent, false, label + ': no questLearn ghost on the parent');
    assert.equal('starLearn' in parent, false, label + ': no starLearn ghost on the parent');
  };

  await t.test('QUEST: adding a sub-goal carries the quest flags down with toLearn', async () => {
    const page = await open('progress.html', {
      db: seedDb({ goals: [questGoal('qg-1')] }), hash: '#progress'
    });
    await page.waitFor(function () { return !!document.querySelector('[data-add-subgoal="qg-1"]'); },
      { message: 'the + sub-goal control' });

    await page.evaluate(function () { document.querySelector('[data-add-subgoal="qg-1"]').click(); });
    await page.waitFor(function () {
      return !!document.querySelector('input[placeholder="Sub-goal name…"]');
    }, { message: 'the sub-goal name input' });

    await page.evaluate(function (setter) {
      var set = new Function('return ' + setter)();
      var input = document.querySelector('input[placeholder="Sub-goal name…"]');
      set(input, 'Fingerstyle');
      // The `add` button beside the input, not the task-kid one elsewhere.
      Array.prototype.find.call(input.parentElement.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'add'; }).click();
    }, SET_REACT_INPUT);

    // Wait for the WRITE TO LAND, never for the right answer: a wrong transfer
    // would otherwise time out here and report "unreachable" instead of wrong.
    await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var g = ((db.slots || [])[0] || {}).goals || [];
      return !!(g[0] && (g[0].children || []).length);
    }, { message: 'the sub-goal reaching track_db' });

    const slot = await page.evaluate(READ_SLOT);
    assertTransferred(slot.goals[0], 'addSubGoalAndMigrateTasks');
    await page.close();
  });

  await t.test('QUEST: nesting a goal into a goal carries the quest flags down', async () => {
    const page = await open('progress.html', {
      db: seedDb({ goals: [questGoal('qg-1'), questGoal('qg-2', { toLearn: [], questLearn: [], starLearn: [], mmTargets: {} })] }),
      hash: '#progress'
    });
    await page.waitFor(function () { return !!document.querySelector('[data-goal-tab="qg-2"]'); },
      { message: 'the goal tab bar' });

    // dragstart and drop go in SEPARATE evaluates: dragstart only sets state,
    // and a drop fired in the same synchronous block reads the pre-render value.
    assert.equal(await page.evaluate(function () {
      var tab = document.querySelector('[data-goal-tab="qg-2"]');
      if (!tab) return 'no source tab';
      window.__qdt = new DataTransfer();
      tab.dispatchEvent(new DragEvent('dragstart',
        { bubbles: true, cancelable: true, dataTransfer: window.__qdt }));
      return 'ok';
    }), 'ok');
    await sleep(150);

    /* dragover gets its own evaluate too, and that is not belt-and-braces here.
       onDragOver calls setDragTabTarget, and onDrop READS that state — fired in
       the same synchronous block the drop sees the pre-render null and bails
       without nesting. This case timed out on exactly that.

       The band matters as well: the handler only NESTS between 30% and 70% of
       the target's width and reorders outside it, so aim at the centre or the
       case silently tests reordering instead. */
    assert.equal(await page.evaluate(function () {
      var target = document.querySelector('[data-goal-tab="qg-1"]');
      if (!target) return 'no target tab';
      var r = target.getBoundingClientRect();
      target.dispatchEvent(new DragEvent('dragover', {
        bubbles: true, cancelable: true, dataTransfer: window.__qdt,
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2
      }));
      return 'ok';
    }), 'ok');
    await sleep(150);

    assert.equal(await page.evaluate(function () {
      var target = document.querySelector('[data-goal-tab="qg-1"]');
      if (!target) return 'no target tab';
      var r = target.getBoundingClientRect();
      target.dispatchEvent(new DragEvent('drop', {
        bubbles: true, cancelable: true, dataTransfer: window.__qdt,
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2
      }));
      return 'ok';
    }), 'ok');

    await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var g = ((db.slots || [])[0] || {}).goals || [];
      return g.length === 1;
    }, { message: 'the nest reaching track_db' });

    const slot = await page.evaluate(READ_SLOT);
    assertTransferred(slot.goals[0], 'nestGoalIntoGoal');
    await page.close();
  });

  await t.test('QUEST: nesting a sub-goal into a sub-goal carries the quest flags down', async () => {
    const page = await open('progress.html', {
      db: seedDb({
        goals: [{
          id: 'qg-1', title: 'Root', children: [
            questGoal('sub-a', { isSubGoal: true, title: 'Holds the quest' }),
            questGoal('sub-b', { isSubGoal: true, title: 'Dragged', toLearn: [], questLearn: [], starLearn: [], mmTargets: {} })
          ],
          completed: false, createdAt: 1, scheduledDate: null,
          toLearn: [], mmTargets: {}, milestones: []
        }]
      }),
      hash: '#progress'
    });
    await page.waitFor(function () { return !!document.querySelector('[data-subgoal-handle="sub-b"]'); },
      { message: 'the sub-goal drag handle' });

    assert.equal(await page.evaluate(function () {
      var handle = document.querySelector('[data-subgoal-handle="sub-b"]');
      if (!handle) return 'no handle';
      window.__qdt = new DataTransfer();
      handle.dispatchEvent(new DragEvent('dragstart',
        { bubbles: true, cancelable: true, dataTransfer: window.__qdt }));
      return 'ok';
    }), 'ok');
    await sleep(150);

    assert.equal(await page.evaluate(function () {
      var target = document.querySelector('[data-goal-node="sub-a"]');
      if (!target) return 'no target';
      ['dragover', 'drop'].forEach(function (type) {
        target.dispatchEvent(new DragEvent(type,
          { bubbles: true, cancelable: true, dataTransfer: window.__qdt }));
      });
      return 'ok';
    }), 'ok');

    await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var g = ((db.slots || [])[0] || {}).goals || [];
      var a = ((g[0] || {}).children || []).filter(function (c) { return c.id === 'sub-a'; })[0];
      return !!(a && (a.children || []).length);
    }, { message: 'the sub-goal nest reaching track_db' });

    const slot = await page.evaluate(READ_SLOT);
    const subA = findNodeById(slot.goals, 'sub-a');
    assertTransferred(subA, 'nestSubGoalIntoSubGoal');
    await page.close();
  });

  await t.test('QUEST: un-linking a mind map re-scopes the quest flags with toLearn', async () => {
    /* updateGoalToLearn is the ONE writer of toLearn, which is why the re-scope
       lives there rather than in ToLearnRow's remove handler. A flag left
       pointing at an unlinked mind map would let re-linking it silently
       resurrect a quest the user removed. */
    const page = await open('progress.html', {
      db: seedDb({ goals: [questGoal('qg-1', { questLearn: [10, 11], starLearn: [11] })] }),
      hash: '#progress'
    });
    await page.waitFor(function () { return !!document.querySelector('[data-goal-node="qg-1"]'); },
      { message: 'the goal node' });

    // Drive the product function through the page rather than a UI hunt: the
    // remove control is behind hover state and a confirm, and what is under
    // test is the writer, not the chrome that reaches it.
    await page.evaluate(function () {
      window.__q = window.TrackQuest;
      var scoped = Object.assign({}, { id: 'x', toLearn: [10], questLearn: [10, 11], starLearn: [11] });
      window.__res = Object.assign({}, window.__q.withoutLearnFlags(scoped), window.__q.learnFlagsOf(scoped));
    });
    const res = await page.evaluate(function () { return window.__res; });
    assert.deepEqual(res.questLearn, [10], 'the flag for the dropped mm went with it');
    assert.equal('starLearn' in res, false, 'starLearn emptied, so the key went entirely');
    await page.close();
  });

  /* ── QUEST: the tab ─────────────────────────────────────────────────────
     Assertions are per SURFACE and per RULE. The Progress tab and the Home
     panel read the same TrackQuest module, so doctoring the module fails both
     by design — the disjointness that proves each surface is independently
     load-bearing has to come from doctoring the SURFACES, one page at a time. */

  const questNode = (id, over = {}) => Object.assign({
    id, title: id, children: [], completed: false, createdAt: 1, scheduledDate: null,
    toLearn: [], mmTargets: {}, milestones: []
  }, over);

  // Guitar → two quest tasks, a quest routine, a non-quest sibling, one quested
  // mind map; plus a whole branch with no quest in it at all.
  const QUEST_TREE = () => [
    questNode('root', {
      title: 'Guitar', toLearn: [10, 11], mmTargets: { 10: { stage: 2 } },
      questLearn: [10], starLearn: [10],
      children: [
        questNode('t1', { title: 'Travis picking', quest: true, star: true }),
        questNode('t2', { title: 'Thumb independence', quest: true }),
        questNode('r1', { title: 'Daily warmup', quest: true, taskType: 'routine' }),
        questNode('t3', { title: 'Not a quest' })
      ]
    }),
    questNode('other', { title: 'Questless goal', children: [questNode('t9', { title: 'nope' })] })
  ];

  const openQuest = async (goals = QUEST_TREE()) => {
    const page = await open('progress.html', { db: seedDb({ goals }), hash: '#quest' });
    await page.waitFor(function () { return !!document.querySelector('[data-quest-tab]'); },
      { message: 'the QUEST tab' });
    return page;
  };
  const attrs = function (name) {
    return Array.prototype.map.call(document.querySelectorAll('[' + name + ']'),
      function (e) { return e.getAttribute(name); });
  };

  await t.test('QUEST: the tab prunes to quest branches and keeps ancestors as context', async () => {
    const page = await openQuest();
    const rows = await page.evaluate(attrs, 'data-quest-row');
    assert.deepEqual(rows, ['root', 't1', 't2', 'r1'],
      'the questless sibling and the whole questless branch are gone; the ancestor stays');
    assert.deepEqual(await page.evaluate(attrs, 'data-quest-learn-row'), ['root:10'],
      'the quested mind map hangs off its own goal, and the unquested one does not');
    // The ancestor is CONTEXT: it carries no controls, because a tick there
    // would complete work the user never selected.
    assert.equal(await page.evaluate(function () {
      return !!document.querySelector('[data-quest-row="root"] [data-quest-star-toggle="root"]');
    }), false, 'a context ancestor has no star control');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('QUEST: a starred parent is ONE row in the starred list, not its subtree', async () => {
    /* "If the parent is chosen include all child but only show the parent."
       The whole rule is a single `return` inside starRollup. */
    const page = await openQuest([questNode('g', {
      title: 'Guitar', quest: true, star: true,
      children: ['a', 'b', 'c'].map(k => questNode(k, { title: k, quest: true, star: true }))
    })]);
    assert.deepEqual(await page.evaluate(attrs, 'data-quest-star-row'), ['g'],
      'one row for the parent — its starred descendants are what that row stands for');
    await page.close();
  });

  await t.test('QUEST: ticking a leaf writes completed and disturbs nothing else', async () => {
    const page = await openQuest();
    await page.evaluate(function () { document.querySelector('[data-quest-tick="t1"]').click(); });
    await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var g = ((db.slots || [])[0] || {}).goals || [];
      var kids = (g[0] || {}).children || [];
      return kids.some(function (k) { return k.id === 't1' && k.completed; });
    }, { message: 'the tick reaching track_db' });

    const slot = await page.evaluate(READ_SLOT);
    const t1 = slot.goals[0].children.filter(k => k.id === 't1')[0];
    assert.equal(t1.completed, true);
    assert.equal(t1.quest, true, 'still a quest');
    assert.equal(t1.star, true, 'still starred');
    assert.deepEqual(slot.goals[0].toLearn, [10, 11], 'the goal\'s toLearn is untouched');
    assert.deepEqual(slot.goals[0].questLearn, [10], 'and so are its quest flags');
    await page.close();
  });

  await t.test('QUEST: a parent row and a to-learn row carry NO checkbox', async () => {
    /* Both absences are the mechanism. toggleLeaf refuses a non-leaf, so a
       checkbox on a parent would render, click and do nothing; and MM
       completion is COMPUTED, never stored, so a to-learn cannot be ticked at
       all. A future change that "makes the rows uniform" trips this. */
    const page = await openQuest();
    assert.deepEqual(await page.evaluate(attrs, 'data-quest-tick'), ['t1', 't2', 'r1'],
      'only the three leaf quests are tickable');
    assert.equal(await page.evaluate(function () {
      return !!document.querySelector('[data-quest-learn-row="root:10"] input[type=checkbox]');
    }), false, 'a to-learn row has no checkbox');
    await page.close();
  });

  await t.test('QUEST: a routine ticks in the tab ONLY, and never touches track_db', async () => {
    /* The user's rule: a routine quest can be ticked, it resets at the end of
       the day, and it does not affect the real tick. So the tick goes to its
       own browser key — not routineDates, not any slot field. */
    const page = await openQuest();
    const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });

    await page.evaluate(function () { document.querySelector('[data-quest-routine-tick="r1"]').click(); });
    await page.waitFor(function () {
      return !!localStorage.getItem('track_quest_routine_ticks');
    }, { message: 'the routine tick reaching its browser key' });

    const stored = JSON.parse(await page.evaluate(function () {
      return localStorage.getItem('track_quest_routine_ticks');
    }));
    assert.deepEqual(stored.ids, ['r1']);
    assert.equal(stored.slotId, 'slot-test-1');
    assert.match(stored.day, /^\d{4}-\d{2}-\d{2}$/, 'a local calendar day, stored for the expiry');

    assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }),
      before, 'track_db is BYTE-IDENTICAL — the real routine tick was not touched');
    const slot = await page.evaluate(READ_SLOT);
    const r1 = slot.goals[0].children.filter(k => k.id === 'r1')[0];
    assert.equal('routineDates' in r1, false, 'no routineDates was invented');
    await page.close();
  });

  await t.test('QUEST: a routine tick from YESTERDAY reads as unticked — the daily reset', async () => {
    /* Expiry is structural, not scheduled: one stored day covers the whole set,
       so there is no timer and no cleanup job to go wrong. */
    const page = await open('progress.html', {
      db: seedDb({ goals: QUEST_TREE() }), hash: '#quest',
      extra: { track_quest_routine_ticks: JSON.stringify(
        { slotId: 'slot-test-1', day: '2020-01-01', ids: ['r1'] }) }
    });
    await page.waitFor(function () { return !!document.querySelector('[data-quest-tab]'); },
      { message: 'the QUEST tab' });
    assert.equal(await page.evaluate(function () {
      return document.querySelector('[data-quest-routine-tick="r1"]').checked;
    }), false, 'a tick stored under another day does not survive into today');
    await page.close();
  });

  await t.test('QUEST: un-questing writes false, deletes nothing, and leaves the star DORMANT', async () => {
    /* The restore property. Un-questing suppresses the star rather than
       clearing it, so re-questing puts back exactly what the user chose — the
       same reasoning that makes unmerge a restore rather than a guess. */
    const page = await openQuest();
    await page.evaluate(function () {
      var row = document.querySelector('[data-quest-row="t1"]');
      Array.prototype.find.call(row.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === '✕'; }).click();
    });
    await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var kids = (((db.slots || [])[0] || {}).goals || [{}])[0].children || [];
      return kids.some(function (k) { return k.id === 't1' && k.quest === false; });
    }, { message: 'the un-quest reaching track_db' });

    let slot = await page.evaluate(READ_SLOT);
    let t1 = slot.goals[0].children.filter(k => k.id === 't1')[0];
    assert.equal(t1.quest, false, 'written as false, not deleted');
    assert.ok('quest' in t1, 'the key is still present');
    assert.equal(t1.star, true, 'the star is DORMANT, not cleared');
    assert.deepEqual(await page.evaluate(attrs, 'data-quest-star-row'), ['root:10'],
      'and it has left the starred list, because isStarred gates on quest membership');

    // …and re-questing restores it, which is the half a "tidying" writer breaks.
    await page.evaluate(function () { document.querySelector('[data-quest-add]').click(); });
    await page.waitFor(function () { return !!document.querySelector('[data-quest-pick="t1"]'); },
      { message: 'the picker' });
    await page.evaluate(function () { document.querySelector('[data-quest-pick="t1"]').click(); });
    await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var kids = (((db.slots || [])[0] || {}).goals || [{}])[0].children || [];
      return kids.some(function (k) { return k.id === 't1' && k.quest === true; });
    }, { message: 'the re-quest reaching track_db' });
    slot = await page.evaluate(READ_SLOT);
    t1 = slot.goals[0].children.filter(k => k.id === 't1')[0];
    assert.equal(t1.star, true, 're-questing RESTORED the star the user chose');
    await page.close();
  });

  await t.test('QUEST: un-questing raises NO dialog', async () => {
    /* Deliberately exempt from the confirm rule, beside merge/unmerge and a
       line move: it writes false, deletes nothing, and is undone by pressing
       the same control. A "clear all quests" button would NOT be exempt. */
    const page = await openQuest();
    const before = page.dialogs.length;
    await page.evaluate(function () {
      var row = document.querySelector('[data-quest-row="t2"]');
      Array.prototype.find.call(row.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === '✕'; }).click();
    });
    await sleep(800);
    assert.equal(page.dialogs.length, before, 'no confirm was raised for an un-quest');
    await page.close();
  });

  await t.test('QUEST: the picker offers a ZERO-LEAF goal and its mind maps', async () => {
    /* The decisive difference from the schedule picker, which drops a zero-leaf
       node because there is nothing there to schedule. A goal whose only
       content is linked mind maps is exactly a quest target. */
    const page = await openQuest([questNode('lonely', {
      title: 'Only mind maps', toLearn: [10, 11], mmTargets: {}
    })]);
    await page.evaluate(function () { document.querySelector('[data-quest-add]').click(); });
    await page.waitFor(function () { return !!document.querySelector('[data-quest-pick]'); },
      { message: 'the picker' });
    assert.deepEqual(await page.evaluate(attrs, 'data-quest-pick'),
      ['lonely', 'lonely:10', 'lonely:11'],
      'the zero-leaf goal AND both of its linked mind maps are pickable');

    await page.evaluate(function () { document.querySelector('[data-quest-pick="lonely:11"]').click(); });
    await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var g = ((db.slots || [])[0] || {}).goals || [];
      return !!(g[0] && g[0].questLearn);
    }, { message: 'the pick reaching track_db' });
    const slot = await page.evaluate(READ_SLOT);
    assert.deepEqual(slot.goals[0].questLearn, [11], 'a numeric mind-map id was stored');
    assert.equal('quest' in slot.goals[0], false, 'picking a to-learn did not quest its goal');
    await page.close();
  });

  await t.test('QUEST: dragging arranges the quest view and leaves the GOAL TREE alone', async () => {
    /* The user's explicit choice: quest order is the Quest tab's own view, and
       dragging must not restructure their goals. Both halves are asserted —
       the rendered order changes AND `children` is byte-identical. */
    const page = await openQuest([questNode('root', {
      title: 'Guitar', quest: true,
      children: ['a', 'b', 'c'].map(k => questNode(k, { title: k, quest: true }))
    })]);
    await page.waitFor(function () { return !!document.querySelector('[data-quest-drag="c"]'); },
      { message: 'the arrange handles' });
    assert.deepEqual(await page.evaluate(attrs, 'data-quest-row'), ['root', 'a', 'b', 'c'],
      'starts in goal-tree order, with nothing stored');

    // dragstart, dragover and drop in SEPARATE evaluates: dragover sets React
    // state that drop reads, so a drop in the same block sees the pre-render
    // value — the lesson the priority-matrix and nest-goal cases already record.
    await page.evaluate(function () {
      var h = document.querySelector('[data-quest-drag="c"]');
      window.__qdt = new DataTransfer();
      h.dispatchEvent(new DragEvent('dragstart',
        { bubbles: true, cancelable: true, dataTransfer: window.__qdt }));
    });
    await sleep(150);
    for (const type of ['dragover', 'drop']) {
      await page.evaluate(function (t) {
        var row = document.querySelector('[data-quest-row="a"]');
        var r = row.getBoundingClientRect();
        // Above the midpoint means "before" — aim high, or this lands after.
        row.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true,
          dataTransfer: window.__qdt, clientY: r.top + 2 }));
      }, type);
      await sleep(150);
    }

    await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var kids = (((db.slots || [])[0] || {}).goals || [{}])[0].children || [];
      return kids.some(function (k) { return typeof k.questOrder === 'number'; });
    }, { message: 'the arrangement reaching track_db' });

    assert.deepEqual(await page.evaluate(attrs, 'data-quest-row'), ['root', 'c', 'a', 'b'],
      'the quest view reads in the chosen order');
    const slot = await page.evaluate(READ_SLOT);
    assert.deepEqual(slot.goals[0].children.map(k => k.id), ['a', 'b', 'c'],
      'the GOAL TREE did not move — dragging a quest is not a structural edit');
    assert.deepEqual(slot.goals[0].children.map(k => k.questOrder), [1, 2, 0],
      'the order is a per-node key written across the whole group');
    await page.close();
  });

  await t.test('QUEST: an unarranged group stores no order at all', async () => {
    /* Absence is the default. A workspace nobody has dragged in must carry no
       questOrder anywhere — the same "clearing writes nothing" property the
       merges and colWidths cases guard for their own fields. */
    const page = await openQuest();
    const slot = await page.evaluate(READ_SLOT);
    const anyOrder = JSON.stringify(slot.goals).indexOf('questOrder') >= 0;
    assert.equal(anyOrder, false, 'no questOrder key exists until something is dragged');
    await page.close();
  });

  await t.test('QUEST: a starred parent says how many quests it stands for', async () => {
    const page = await openQuest([questNode('root', {
      title: 'Guitar', quest: true, star: true,
      toLearn: [10], mmTargets: {}, questLearn: [10],
      children: [
        questNode('a', { quest: true }),
        questNode('b', { quest: true }),
        questNode('c') // not a quest — must NOT be counted
      ]
    })]);
    assert.equal(await page.evaluate(function () {
      var el = document.querySelector('[data-quest-star-count="root"]');
      return el ? el.textContent : null;
    }), '4 quests', 'itself + its quested to-learn + its two quested children');
    await page.close();
  });

  await t.test('QUEST: a starred LEAF shows no count, because 1 is noise', async () => {
    const page = await openQuest([questNode('root', {
      children: [questNode('a', { quest: true, star: true })]
    })]);
    await page.waitFor(function () { return !!document.querySelector('[data-quest-star-row]'); },
      { message: 'the starred row' });
    assert.equal(await page.evaluate(function () {
      return !!document.querySelector('[data-quest-star-count]');
    }), false, 'a row standing only for itself says nothing');
    await page.close();
  });

  await t.test('GUARD: a quest edit writes no key progress.html does not own', async () => {
    const page = await openQuest();
    const before = await page.evaluate(function () {
      var s = JSON.parse(localStorage.getItem('track_db')).slots[0];
      var out = {};
      ['mms', 'sourceDumps', 'docPages', 'trueStorages', 'trueStoragePos',
        'sessions', 'kolbs', 'notes', 'dateNotes', 'pos', 'levelTemplates'].forEach(function (k) {
          out[k] = JSON.stringify(s[k]);
        });
      return out;
    });
    await page.evaluate(function () { document.querySelector('[data-quest-star-toggle="t2"]').click(); });
    await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var kids = (((db.slots || [])[0] || {}).goals || [{}])[0].children || [];
      return kids.some(function (k) { return k.id === 't2' && k.star === true; });
    }, { message: 'the star reaching track_db' });
    const after = await page.evaluate(function () {
      var s = JSON.parse(localStorage.getItem('track_db')).slots[0];
      var out = {};
      ['mms', 'sourceDumps', 'docPages', 'trueStorages', 'trueStoragePos',
        'sessions', 'kolbs', 'notes', 'dateNotes', 'pos', 'levelTemplates'].forEach(function (k) {
          out[k] = JSON.stringify(s[k]);
        });
      return out;
    });
    assert.deepEqual(after, before, 'every foreign key is byte-identical');
    await page.close();
  });

  /* ── QUEST: the Home panel ──────────────────────────────────────────────
     Read-only, vanilla, below the universal calendar. It reads the SAME
     TrackQuest module the Progress tab does, so these assertions are what make
     each surface independently load-bearing: a doctored index.html must fail
     here and nowhere else. */

  await t.test('HOME: the quest panel draws the same pruned tree and rollup', async () => {
    const page = await open('index.html', { db: seedDb({ goals: QUEST_TREE() }) });
    await page.waitFor(function () { return !!document.querySelector('.quest-panel'); },
      { message: 'the Home quest panel' });
    assert.deepEqual(await page.evaluate(attrs, 'data-quest-row'), ['root', 't1', 't2', 'r1'],
      'the same prune as the Progress tab — one module, two surfaces');
    assert.deepEqual(await page.evaluate(attrs, 'data-quest-learn-row'), ['root:10']);
    assert.deepEqual(await page.evaluate(attrs, 'data-quest-star-row'), ['root:10', 't1']);
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('HOME: the quest panel is READ-ONLY and writes nothing', async () => {
    /* Home's write set is "the slot list itself". A tick or a star here would
       make index.html a writer of `goals`, which progress.html owns. */
    const page = await open('index.html', { db: seedDb({ goals: QUEST_TREE() }) });
    await page.waitFor(function () { return !!document.querySelector('.quest-panel'); },
      { message: 'the Home quest panel' });
    const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });
    assert.equal(await page.evaluate(function () {
      return document.querySelectorAll('.quest-panel input, .quest-panel button').length;
    }), 0, 'no input and no button inside the panel — the only control is a link out');
    await page.evaluate(function () {
      var rows = document.querySelectorAll('[data-quest-row]');
      for (var i = 0; i < rows.length; i++) rows[i].click();
    });
    await sleep(300);
    assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }),
      before, 'clicking every row left track_db byte-identical');
    await page.close();
  });

  await t.test('HOME: an empty workspace draws the empty line, not stale rows', async () => {
    /* renderQuests is called from BOTH renderSlots exits — the normal path and
       the no-slots early return. Missing the second leaves the previous
       workspace's quests on screen. */
    const page = await open('index.html', { db: { slots: [], activeSlotId: null } });
    await page.waitFor(function () { return !!document.getElementById('slot-list'); },
      { message: 'the slot list (proving the page script ran)' });
    await sleep(200);
    assert.deepEqual(await page.evaluate(attrs, 'data-quest-row'), [],
      'no rows survive an empty workspace');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('HOME: a routine quest ticked in Progress reads as ticked here', async () => {
    const page = await open('index.html', {
      db: seedDb({ goals: QUEST_TREE() }),
      extra: { track_quest_routine_ticks: JSON.stringify(
        { slotId: 'slot-test-1', day: 'TODAY', ids: ['r1'] }) }
    });
    // Seeded with a placeholder day, then rewritten to the browser's own local
    // day: the fixture cannot know the test machine's timezone, and a UTC day
    // would be the wrong day west of Greenwich for part of every day.
    await page.evaluate(function () {
      var d = new Date();
      var day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
        '-' + String(d.getDate()).padStart(2, '0');
      localStorage.setItem('track_quest_routine_ticks',
        JSON.stringify({ slotId: 'slot-test-1', day: day, ids: ['r1'] }));
    });
    await page.reload();
    await page.waitFor(function () { return !!document.querySelector('[data-quest-row="r1"]'); },
      { message: 'the routine quest row' });
    assert.equal(await page.evaluate(function () {
      return document.querySelector('[data-quest-row="r1"]').className.indexOf('is-done') >= 0;
    }), true, 'the quest-local tick shows here too');
    // …and it is still not slot data.
    const slot = await page.evaluate(READ_SLOT);
    const r1 = slot.goals[0].children.filter(k => k.id === 'r1')[0];
    assert.equal('routineDates' in r1, false, 'nothing was written to the routine itself');
    await page.close();
  });

  await t.test('HOME: the chosen order and the starred count are mirrored', async () => {
    /* Both come free from questTree/starRollup, which is the point: Home
       re-derives nothing, so the two surfaces cannot disagree. Seeded through
       stored questOrder rather than a drag, because Home has no drag — it is
       read-only, and that is asserted separately. */
    const page = await open('index.html', {
      db: seedDb({ goals: [questNode('root', {
        title: 'Guitar', quest: true, star: true, toLearn: [10], mmTargets: {}, questLearn: [10],
        children: [
          questNode('a', { quest: true, questOrder: 1 }),
          questNode('b', { quest: true, questOrder: 2 }),
          questNode('c', { quest: true, questOrder: 0 })
        ]
      })] })
    });
    await page.waitFor(function () { return !!document.querySelector('[data-quest-row]'); },
      { message: 'the Home quest rows' });
    assert.deepEqual(await page.evaluate(attrs, 'data-quest-row'), ['root', 'c', 'a', 'b'],
      'the same order the Progress tab would draw');
    assert.equal(await page.evaluate(function () {
      var el = document.querySelector('[data-quest-star-count="root"]');
      return el ? el.textContent : null;
    }), '5 quests', 'and the same count');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('HOME: a goal title is TEXT, never markup', async () => {
    /* The Progress tab is React and escapes by construction; this panel builds
       an innerHTML string, so it is the one surface where a title could become
       markup. That difference is the whole reason this case exists — and it
       guards a maintenance hazard as much as a bug, since a future edit that
       interpolates one more value without esc() would be silent. */
    const payload = '<img src=x onerror="window.__pwned=1">';
    const page = await open('index.html', {
      db: seedDb({ goals: [questNode('root', {
        title: payload, quest: true, star: true,
        children: [questNode('t1', { title: 'He said "hi" & <b>bold</b>', quest: true })]
      })] })
    });
    await page.waitFor(function () { return !!document.querySelector('[data-quest-row]'); },
      { message: 'the Home quest rows' });
    const r = await page.evaluate(function () {
      return {
        pwned: !!window.__pwned,
        injected: document.querySelectorAll('.quest-panel img, .quest-panel b').length,
        titles: Array.prototype.map.call(
          document.querySelectorAll('.quest-panel .quest-title'), function (e) { return e.textContent; })
      };
    });
    assert.equal(r.pwned, false, 'the payload did not execute');
    assert.equal(r.injected, 0, 'and produced no elements');
    assert.ok(r.titles.indexOf(payload) >= 0, 'it is shown verbatim as text');
    assert.ok(r.titles.indexOf('He said "hi" & <b>bold</b>') >= 0,
      'quotes and ampersands survive the escaping unmangled');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('HOME: the panel uses the SHARED local-day helper, not a copy', async () => {
    /* index.html already loads calendar-core.js, so a second local-day helper
       here would be the duplication that becomes a UTC-day bug one edit later.
       Asserted structurally, because a behavioural check would need the machine
       to be in a timezone where the two disagree. */
    const src = await open('index.html', { db: seedDb() });
    const usesShared = await src.evaluate(function () {
      return typeof window.TrackCalendar === 'object' &&
        typeof window.TrackCalendar.toDateStr === 'function';
    });
    assert.equal(usesShared, true, 'TrackCalendar.toDateStr is available on Home');
    await src.close();

    const page = await open('index.html', { db: seedDb() });
    const body = await page.evaluate(async function (url) {
      var r = await fetch(url); var text = await r.text();
      // Comments stripped FIRST, and then only renderQuests is read. This file
      // explains in prose why it avoids a UTC day, and an earlier version of
      // this case failed on that explanation rather than on any code — the
      // same trap schedule-paste-core.test.js already records. The rest of the
      // page is deliberately out of scope: its export-filename date is
      // pre-existing and is not what this case is about.
      var src = text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
      var i = src.indexOf('function renderQuests');
      var j = src.indexOf('function renderSlots');
      return (i >= 0 && j > i) ? src.slice(i, j) : null;
    }, '/index.html');

    assert.ok(body, 'found the renderQuests body');
    assert.equal(/questLocalDay/.test(body), false,
      'no page-local day helper — use TrackCalendar.toDateStr');
    assert.equal(/toISOString/.test(body), false,
      'and no UTC day inside the quest panel');
    assert.ok(/TrackCalendar\.toDateStr/.test(body),
      'the shared local-day helper is the one it calls');
    await page.close();
  });

  await t.test('HOME: a corrupt routine-tick value cannot break the panel', async () => {
    /* JSON.parse does not throw on 'null' or '42', so a hand-rolled try/catch
       around it is not a check. A view preference must never break Home. */
    for (const raw of ['42', 'null', '{', '[]', '{"ids":7}']) {
      const page = await open('index.html', {
        db: seedDb({ goals: QUEST_TREE() }), extra: { track_quest_routine_ticks: raw }
      });
      await page.waitFor(function () { return !!document.getElementById('slot-list'); },
        { message: 'the slot list (proving the page script ran)' });
      assert.deepEqual(await page.evaluate(attrs, 'data-quest-row'), ['root', 't1', 't2', 'r1'],
        'the panel survived the stored value ' + raw);
      assert.deepEqual(realErrors(page), []);
      await page.close();
    }
  });

  /* ── NOTES: the floating widget's saves ─────────────────────────────────
     The content box saves on a 300ms debounce. It used to read WHICH note to
     save into from `state.activeId` when the timer FIRED, not when it was armed —
     so the last keystrokes before × were dropped (activeId was already null), and
     ← then opening another note inside the window wrote the first note's text
     into the second. Both cases act inside one evaluate, well under 300ms, and
     are written against ids the widget has always had so they fail on their
     assertion rather than on a missing control. */

  const NOTE_OF = function (id) {
    var db = JSON.parse(localStorage.getItem('track_db') || '{}');
    var s = (db.slots || [])[0] || {};
    return (s.notes || []).filter(function (n) { return n.id === id; })[0] || null;
  };

  await t.test('NOTES: typing and closing at once still saves the typing', async () => {
    const page = await open('index.html', { db: seedDb({
      notes: [F.note('n-a', F.localTs(2026, 3, 7), { topic: 'Alpha', content: 'A body' })]
    }) });
    await page.waitFor(function () { return !!document.getElementById('nw-btn'); }, { message: 'the notes widget' });
    await page.evaluate(function () {
      document.getElementById('nw-btn').click();
      document.querySelector('.nw-note-row').click();
      var ta = document.getElementById('nw-content');
      ta.value = 'typed then closed';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('[aria-label="Close notes"]').click();
      return true;
    });
    await sleep(700);
    assert.equal((await page.evaluate(NOTE_OF, 'n-a')).content, 'typed then closed',
      'the keystrokes typed just before × were saved');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('NOTES: ← then opening another note never writes the first note\'s text into it', async () => {
    const page = await open('index.html', { db: seedDb({
      notes: [F.note('n-a', F.localTs(2026, 3, 7), { topic: 'Alpha', content: 'A body' }),
        F.note('n-b', F.localTs(2026, 3, 8), { topic: 'Beta', content: 'B body' })]
    }) });
    await page.waitFor(function () { return !!document.getElementById('nw-btn'); }, { message: 'the notes widget' });
    await page.evaluate(function () {
      document.getElementById('nw-btn').click();
      document.querySelectorAll('.nw-note-row')[0].click();
      var ta = document.getElementById('nw-content');
      ta.value = 'A edited';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('nw-back-btn').click();
      document.querySelectorAll('.nw-note-row')[1].click();
      return true;
    });
    await sleep(700);
    assert.equal((await page.evaluate(NOTE_OF, 'n-b')).content, 'B body',
      'the second note kept its own text');
    assert.equal((await page.evaluate(NOTE_OF, 'n-a')).content, 'A edited',
      'and the first note received its edit');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('NOTES: going back and reopening a note at once shows what was just typed', async () => {
    /* The reopened editor reads storage. If the text typed a moment ago is still
       waiting on its debounce, the editor shows the OLD text — and the next
       keystroke saves old-plus-new over what was typed. Every navigation must
       land a pending save before the next view reads. */
    const page = await open('index.html', { db: seedDb({
      notes: [F.note('n-a', F.localTs(2026, 3, 7), { topic: 'Alpha', content: 'A body' })]
    }) });
    await page.waitFor(function () { return !!document.getElementById('nw-btn'); }, { message: 'the notes widget' });
    const shown = await page.evaluate(function () {
      document.getElementById('nw-btn').click();
      document.querySelector('.nw-note-row').click();
      var ta = document.getElementById('nw-content');
      ta.value = 'A body, and more';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('nw-back-btn').click();
      document.querySelector('.nw-note-row').click();
      return document.getElementById('nw-content').value;
    });
    assert.equal(shown, 'A body, and more', 'the reopened note shows the text just typed');
    await page.close();
  });

  /* ── NOTES: Sorted and Date, side by side ─────────────────────────────────
     `dateNotes` is a map keyed by LOCAL day; absence is an empty day and the key
     is deleted, never set to '', when the text empties. Side opening puts up to
     four notes in a full-screen view, and Send appends a selection to another
     open note. Every case waits for the write to LAND, then asserts. */

  const NOTES_SEED = over => seedDb(Object.assign({
    notes: [F.note('n-a', F.localTs(2026, 3, 7), { topic: 'Alpha', content: 'A body' }),
      F.note('n-b', F.localTs(2026, 3, 8), { topic: 'Beta', content: 'B body' }),
      F.note('n-c', F.localTs(2026, 3, 9), { topic: 'Gamma', content: 'C body' })],
    dateNotes: { '2026-03-09': F.dateNote('an older draft', F.localTs(2026, 3, 9)) }
  }, over || {}));

  const TODAY_IN = function () { return window.TrackSchema.localToday(); };
  const SLOT0 = function () { return (JSON.parse(localStorage.getItem('track_db') || '{}').slots || [])[0] || null; };
  const TYPE_IN = function (sel, value) {
    var ta = document.querySelector(sel);
    ta.value = value;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  };
  const OPEN_TODAY = function () {
    document.getElementById('nw-btn').click();
    document.querySelector('[data-nw-tab="date"]').click();
    document.querySelector('.nw-date-today').click();
    return true;
  };
  // Waits for track_db to differ from `before` — the write landing — and no more.
  const landed = (page, before, message) => page.waitFor(function (b) {
    return localStorage.getItem('track_db') !== b;
  }, { args: [before], message: message || 'the write landing in track_db' });

  // Today's Date note beside `second` ('sorted:<id>' or 'date:<day>'), through the UI.
  const toSplit = async (page, second) => {
    await page.waitFor(function () { return !!document.getElementById('nw-btn'); }, { message: 'the notes widget' });
    await page.evaluate(function (second) {
      document.getElementById('nw-btn').click();
      document.querySelector('[data-nw-tab="date"]').click();
      document.querySelector('.nw-date-today').click();
      document.querySelector('[data-nw-side-open]').click();
      var tab = document.querySelector('[data-nw-picker-tab="' + second.split(':')[0] + '"]');
      if (tab.getAttribute('aria-selected') !== 'true') tab.click();
      document.querySelector('[data-nw-pick="' + second + '"]').click();
      return true;
    }, second);
    await page.waitFor(function () { return document.querySelectorAll('[data-nw-pane]').length === 2; },
      { message: 'two notes side by side' });
  };
  const addPane = (page, pick) => page.evaluate(function (pick) {
    document.querySelector('[data-nw-add-pane]').click();
    var o = document.querySelector('[data-nw-pick-overlay]');
    var tab = o.querySelector('[data-nw-picker-tab="' + pick.split(':')[0] + '"]');
    if (tab.getAttribute('aria-selected') !== 'true') tab.click();
    o.querySelector('[data-nw-pick="' + pick + '"]').click();
    return true;
  }, pick);
  const PANES = function () {
    return Array.prototype.map.call(document.querySelectorAll('[data-nw-pane]'),
      function (p) { return p.getAttribute('data-nw-pane'); });
  };
  const SELECT_IN = function (sel, a, b) {
    var ta = document.querySelector(sel);
    ta.focus();
    ta.setSelectionRange(a, b);
    document.dispatchEvent(new Event('selectionchange'));
    return true;
  };

  await t.test('NOTES: opening the Date tab and an empty day writes nothing', async () => {
    const page = await open('index.html', { db: NOTES_SEED() });
    await page.waitFor(function () { return !!document.getElementById('nw-btn'); }, { message: 'the notes widget' });
    const before = await page.evaluate(READ_RAW);
    await page.evaluate(OPEN_TODAY);
    await page.waitFor(function () { return !!document.querySelector('[data-nw-day-title]'); }, { message: 'today\'s draft' });
    await page.evaluate(function () { document.querySelector('[aria-label="Close notes"]').click(); return true; });
    await sleep(600);
    assert.equal(await page.evaluate(READ_RAW), before, 'track_db is byte-identical');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('NOTES: today\'s draft is written under the LOCAL day, and emptying it deletes the key', async () => {
    const page = await open('index.html', { db: NOTES_SEED() });
    await page.waitFor(function () { return !!document.getElementById('nw-btn'); }, { message: 'the notes widget' });
    const today = await page.evaluate(TODAY_IN);
    const slotBefore = await page.evaluate(SLOT0);
    let raw = await page.evaluate(READ_RAW);
    await page.evaluate(OPEN_TODAY);
    await page.evaluate(TYPE_IN, '#nw-content', 'first idea');
    await landed(page, raw, 'the first draft landing');
    const slot = await page.evaluate(SLOT0);
    assert.equal(slot.dateNotes[today].content, 'first idea', 'stored under TrackSchema.localToday()');
    assert.equal(typeof slot.dateNotes[today].createdAt, 'number');
    assert.deepEqual(slot.dateNotes['2026-03-09'], slotBefore.dateNotes['2026-03-09'], 'the older draft is untouched');
    for (const key of Object.keys(slotBefore)) {
      if (key === 'dateNotes') continue;
      assert.deepEqual(slot[key], slotBefore[key], key + ' is unchanged — the widget writes one key');
    }

    raw = await page.evaluate(READ_RAW);
    await page.evaluate(TYPE_IN, '#nw-content', '   ');
    await landed(page, raw, 'the emptied draft landing');
    const after = (await page.evaluate(SLOT0)).dateNotes;
    assert.equal(Object.prototype.hasOwnProperty.call(after, today), false,
      'an emptied day is DELETED — never stored as blank text');
    assert.deepEqual(Object.keys(after), ['2026-03-09']);
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('NOTES: clearing a day asks first — Cancel keeps it — and an empty day asks nothing', async () => {
    const page = await open('index.html', { db: NOTES_SEED() });
    await page.waitFor(function () { return !!document.getElementById('nw-btn'); }, { message: 'the notes widget' });
    const today = await page.evaluate(TODAY_IN);

    // the no-op guard: today holds nothing yet, so there is nothing to ask about
    await page.evaluate(OPEN_TODAY);
    const dialogs0 = page.dialogs.length;
    await page.evaluate(function () { document.querySelector('[data-nw-clear-day]').click(); return true; });
    await sleep(150);
    assert.equal(page.dialogs.length, dialogs0, 'an empty day raised no prompt');

    let raw = await page.evaluate(READ_RAW);
    await page.evaluate(TYPE_IN, '#nw-content', 'keep me');
    await landed(page, raw);
    raw = await page.evaluate(READ_RAW);

    page.rejectDialogs = true;
    await page.evaluate(function () { document.querySelector('[data-nw-clear-day]').click(); return true; });
    await sleep(300);
    page.rejectDialogs = false;
    assert.equal(page.dialogs.length, dialogs0 + 1, 'the clear asked first');
    assert.equal(await page.evaluate(READ_RAW), raw, 'Cancel left track_db byte-identical');
    assert.equal(await page.evaluate(function () { return document.getElementById('nw-content').value; }), 'keep me');

    await page.evaluate(function () { document.querySelector('[data-nw-clear-day]').click(); return true; });
    await landed(page, raw, 'the accepted clear landing');
    assert.equal(Object.prototype.hasOwnProperty.call((await page.evaluate(SLOT0)).dateNotes, today), false,
      'accepting deleted the day');
    await page.close();
  });

  await t.test('NOTES: side-open from a Date note offers Sorted first, and both panes save to their own records', async () => {
    const page = await open('index.html', { db: NOTES_SEED() });
    await page.waitFor(function () { return !!document.getElementById('nw-btn'); }, { message: 'the notes widget' });
    const today = await page.evaluate(TODAY_IN);
    await page.evaluate(function () {
      document.getElementById('nw-btn').click();
      document.querySelector('[data-nw-tab="date"]').click();
      document.querySelector('.nw-date-today').click();
      document.querySelector('[data-nw-side-open]').click();
      return true;
    });
    assert.equal(await page.evaluate(function () {
      return document.querySelector('[data-nw-picker-tab="sorted"]').getAttribute('aria-selected');
    }), 'true', 'a Date note opens the picker on Sorted — the draft → sorted direction');
    await page.evaluate(function () { document.querySelector('[data-nw-pick="sorted:n-b"]').click(); return true; });
    await page.waitFor(function () { return document.querySelectorAll('[data-nw-pane]').length === 2; },
      { message: 'two notes side by side' });
    assert.deepEqual(await page.evaluate(PANES), ['date:' + today, 'sorted:n-b']);

    let raw = await page.evaluate(READ_RAW);
    await page.evaluate(TYPE_IN, '[data-nw-pane="date:' + today + '"] textarea', 'drafted on the left');
    await page.evaluate(TYPE_IN, '[data-nw-pane="sorted:n-b"] textarea', 'B body, sorted on the right');
    await landed(page, raw);
    await sleep(400); // both panes have their own debounce
    const slot = await page.evaluate(SLOT0);
    assert.equal(slot.dateNotes[today].content, 'drafted on the left');
    assert.equal(slot.notes.find(n => n.id === 'n-b').content, 'B body, sorted on the right');
    assert.equal(slot.notes.find(n => n.id === 'n-a').content, 'A body', 'no other note was touched');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('NOTES: side-open from a Sorted note offers Date first, with Today at the top', async () => {
    const page = await open('index.html', { db: NOTES_SEED() });
    await page.waitFor(function () { return !!document.getElementById('nw-btn'); }, { message: 'the notes widget' });
    const today = await page.evaluate(TODAY_IN);
    const picks = await page.evaluate(function () {
      document.getElementById('nw-btn').click();
      document.querySelector('[data-nw-row="sorted:n-a"]').click();
      document.querySelector('[data-nw-side-open]').click();
      return {
        tab: document.querySelector('[data-nw-picker-tab="date"]').getAttribute('aria-selected'),
        rows: Array.prototype.map.call(document.querySelectorAll('[data-nw-pick]'),
          function (r) { return r.getAttribute('data-nw-pick'); })
      };
    });
    assert.equal(picks.tab, 'true', 'a Sorted note opens the picker on Date');
    assert.equal(picks.rows[0], 'date:' + today, 'Today first, even though it holds nothing yet');
    assert.ok(picks.rows.includes('date:2026-03-09'), 'and the older draft is offered');
    await page.close();
  });

  await t.test('NOTES: up to four notes side by side, and an open note is never offered twice', async () => {
    const page = await open('index.html', { db: NOTES_SEED() });
    const today = await page.evaluate(TODAY_IN);
    await toSplit(page, 'sorted:n-a');
    const offered = await page.evaluate(function () {
      document.querySelector('[data-nw-add-pane]').click();
      var o = document.querySelector('[data-nw-pick-overlay]');
      var sorted = Array.prototype.map.call(o.querySelectorAll('[data-nw-pick]'), function (r) { return r.getAttribute('data-nw-pick'); });
      o.querySelector('[data-nw-picker-tab="date"]').click();
      var dated = Array.prototype.map.call(o.querySelectorAll('[data-nw-pick]'), function (r) { return r.getAttribute('data-nw-pick'); });
      o.querySelector('[data-nw-pick-cancel]').click();
      return { sorted: sorted, dated: dated };
    });
    assert.deepEqual(offered.sorted, ['sorted:n-b', 'sorted:n-c'], 'the open Sorted note is not offered');
    assert.equal(offered.dated.includes('date:' + today), false, 'nor is the open day');
    assert.deepEqual(offered.dated, ['date:2026-03-09']);

    await addPane(page, 'sorted:n-b');
    await addPane(page, 'date:2026-03-09');
    assert.deepEqual(await page.evaluate(PANES), ['date:' + today, 'sorted:n-a', 'sorted:n-b', 'date:2026-03-09']);
    const bar = await page.evaluate(function () {
      var add = document.querySelector('[data-nw-add-pane]');
      return { disabled: add.disabled, count: document.querySelector('[data-nw-pane-count]').textContent };
    });
    assert.equal(bar.disabled, true, 'a fifth cannot be opened');
    assert.equal(bar.count, '4 / 4');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('NOTES: closing a pane right after typing saves it, and the last pane returns to the panel', async () => {
    const page = await open('index.html', { db: NOTES_SEED() });
    const today = await page.evaluate(TODAY_IN);
    await toSplit(page, 'sorted:n-a');
    await page.evaluate(function () {
      var ta = document.querySelector('[data-nw-pane="sorted:n-a"] textarea');
      ta.value = 'typed, then the pane closed';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('[data-nw-pane="sorted:n-a"] [data-nw-pane-close]').click();
      return true;
    });
    await sleep(700);
    assert.equal((await page.evaluate(NOTE_OF, 'n-a')).content, 'typed, then the pane closed',
      'the close flushed the pane before it went');
    const view = await page.evaluate(function () {
      return { split: document.getElementById('nw-split').style.display,
               panel: document.getElementById('nw-panel').style.display,
               day: (document.querySelector('[data-nw-day-title]') || {}).getAttribute
                 ? document.querySelector('[data-nw-day-title]').getAttribute('data-nw-day-title') : null };
    });
    assert.deepEqual(view, { split: 'none', panel: 'flex', day: today },
      'one note left is not side by side — it is the panel\'s detail view');
    await page.close();
  });

  await t.test('NOTES: Send appends the highlighted draft to the other note and leaves the draft alone', async () => {
    const page = await open('index.html', { db: NOTES_SEED() });
    const today = await page.evaluate(TODAY_IN);
    await toSplit(page, 'sorted:n-a');
    const DRAFT = '[data-nw-pane="date:' + today + '"] textarea';
    let raw = await page.evaluate(READ_RAW);
    await page.evaluate(TYPE_IN, DRAFT, 'keep this line\nsend this idea\nand this');
    await landed(page, raw);
    await sleep(100);

    // nothing highlighted: the button says so and nothing is written
    raw = await page.evaluate(READ_RAW);
    await page.evaluate(SELECT_IN, DRAFT, 3, 3);
    assert.equal(await page.evaluate(function (sel) {
      return document.querySelector(sel).closest('[data-nw-pane]').querySelector('[data-nw-send]').getAttribute('aria-disabled');
    }, DRAFT), 'true', 'Send is marked unavailable with no selection');
    await page.evaluate(function (sel) {
      document.querySelector(sel).closest('[data-nw-pane]').querySelector('[data-nw-send]').click(); return true;
    }, DRAFT);
    await sleep(200);
    assert.equal(await page.evaluate(READ_RAW), raw, 'pressing it anyway wrote nothing');
    assert.ok(/Highlight/.test(await page.evaluate(function () {
      return document.querySelector('[data-nw-toast]').textContent;
    })), 'and the press explained why');

    const FROM = 'keep this line\n'.length, TO = FROM + 'send this idea\nand this'.length;
    await page.evaluate(SELECT_IN, DRAFT, FROM, TO);
    assert.equal(await page.evaluate(function (sel) {
      return document.querySelector(sel).closest('[data-nw-pane]').querySelector('[data-nw-send]').getAttribute('aria-disabled');
    }, DRAFT), 'false');
    await page.evaluate(function (sel) {
      document.querySelector(sel).closest('[data-nw-pane]').querySelector('[data-nw-send]').click(); return true;
    }, DRAFT);
    await landed(page, raw, 'the sent text landing');
    const slot = await page.evaluate(SLOT0);
    assert.equal(slot.notes.find(n => n.id === 'n-a').content, 'A body\nsend this idea\nand this',
      'APPENDED on a line of its own — the existing text is untouched');
    assert.equal(slot.dateNotes[today].content, 'keep this line\nsend this idea\nand this',
      'the draft is left as it was');
    assert.equal(await page.evaluate(function (sel) { return document.querySelector(sel).value; }, DRAFT),
      'keep this line\nsend this idea\nand this');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('NOTES: with two Sorted notes open, Send asks which — and only that one changes', async () => {
    const page = await open('index.html', { db: NOTES_SEED() });
    const today = await page.evaluate(TODAY_IN);
    await toSplit(page, 'sorted:n-a');
    await addPane(page, 'sorted:n-b');
    const DRAFT = '[data-nw-pane="date:' + today + '"] textarea';
    let raw = await page.evaluate(READ_RAW);
    await page.evaluate(TYPE_IN, DRAFT, 'for beta only');
    await landed(page, raw);
    await sleep(100);
    raw = await page.evaluate(READ_RAW);
    const beforeA = await page.evaluate(NOTE_OF, 'n-a');

    await page.evaluate(SELECT_IN, DRAFT, 0, 13);
    const menu = await page.evaluate(function (sel) {
      document.querySelector(sel).closest('[data-nw-pane]').querySelector('[data-nw-send]').click();
      return Array.prototype.map.call(document.querySelectorAll('[data-nw-send-menu] [data-nw-send-to]'),
        function (b) { return b.getAttribute('data-nw-send-to'); });
    }, DRAFT);
    assert.deepEqual(menu, ['sorted:n-a', 'sorted:n-b'], 'both Sorted notes offered, in pane order');
    assert.equal(await page.evaluate(READ_RAW), raw, 'opening the menu wrote nothing');

    await page.evaluate(function () { document.querySelector('[data-nw-send-to="sorted:n-b"]').click(); return true; });
    await landed(page, raw, 'the send landing');
    assert.equal((await page.evaluate(NOTE_OF, 'n-b')).content, 'B body\nfor beta only', 'the chosen note got the text');
    assert.deepEqual(await page.evaluate(NOTE_OF, 'n-a'), beforeA, 'the other one is byte-identical');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('NOTES: a note keeps writing to the workspace it was opened in', async () => {
    // Another tab switching the active workspace must not redirect an open
    // pane's saves. For a Date note that would CREATE a draft in the wrong slot.
    const A = F.populatedSlot({ id: 'slot-A', name: 'A',
      notes: [F.note('n-a', F.localTs(2026, 3, 7), { topic: 'Alpha', content: 'A body' })], dateNotes: {} });
    const B = F.emptySlot({ id: 'slot-B', name: 'B' });
    const page = await open('index.html', { db: F.dbWith([A, B], 'slot-A') });
    const today = await page.evaluate(TODAY_IN);
    await toSplit(page, 'sorted:n-a');

    await page.evaluate(function () {
      var db = JSON.parse(localStorage.getItem('track_db'));
      db.activeSlotId = 'slot-B';
      localStorage.setItem('track_db', JSON.stringify(db));
      return true;
    });
    const slotB = function () {
      return JSON.stringify(JSON.parse(localStorage.getItem('track_db')).slots.filter(function (s) { return s.id === 'slot-B'; })[0]);
    };
    const bBefore = await page.evaluate(slotB);
    const raw = await page.evaluate(READ_RAW);
    await page.evaluate(TYPE_IN, '[data-nw-pane="date:' + today + '"] textarea', 'written in A');
    await landed(page, raw);
    assert.equal(await page.evaluate(slotB), bBefore, 'slot B is byte-identical');
    const a = await page.evaluate(function () {
      return JSON.parse(localStorage.getItem('track_db')).slots.filter(function (s) { return s.id === 'slot-A'; })[0];
    });
    assert.equal(a.dateNotes[today].content, 'written in A', 'the draft went to the slot the pane was opened in');
    await page.close();
  });

  await t.test('NOTES: typing into a Sorted note deleted elsewhere says so, and never recreates it', async () => {
    const page = await open('index.html', { db: NOTES_SEED() });
    await toSplit(page, 'sorted:n-a');
    await page.evaluate(WRITE_SLOT_KEY, 'notes', [F.note('n-b', F.localTs(2026, 3, 8), { topic: 'Beta', content: 'B body' })]);
    await page.evaluate(TYPE_IN, '[data-nw-pane="sorted:n-a"] textarea', 'into the void');
    await page.waitFor(function () {
      var s = document.querySelector('[data-nw-pane="sorted:n-a"] [data-nw-status]');
      return s && s.getAttribute('data-nw-status') !== 'idle';
    }, { message: 'the pane reporting its save' });
    assert.equal(await page.evaluate(function () {
      return document.querySelector('[data-nw-pane="sorted:n-a"] [data-nw-status]').getAttribute('data-nw-status');
    }), 'missing', 'the pane says the note is gone');
    assert.deepEqual((await page.evaluate(SLOT0)).notes.map(n => n.id), ['n-b'], 'and n-a was not recreated');
    await page.close();
  });

  await t.test('NOTES: side by side fills the viewport, left to right, under the storage banners', async () => {
    const page = await open('index.html', { db: NOTES_SEED(), viewport: [1280, 900] });
    await toSplit(page, 'sorted:n-a');
    await addPane(page, 'sorted:n-b');
    const geo = await page.evaluate(function () {
      var s = document.getElementById('nw-split');
      var r = s.getBoundingClientRect();
      return {
        split: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        z: Number(getComputedStyle(s).zIndex),
        panes: Array.prototype.map.call(document.querySelectorAll('[data-nw-pane]'), function (p) {
          var q = p.getBoundingClientRect(); return { left: Math.round(q.left), top: Math.round(q.top), w: Math.round(q.width) };
        })
      };
    });
    assert.deepEqual(geo.split, [0, 0, 1280, 900], 'full screen');
    assert.ok(geo.z < 9998, 'below the quota and sync banners (z-index ' + geo.z + ')');
    assert.equal(new Set(geo.panes.map(p => p.top)).size, 1, 'the panes share one top edge');
    assert.ok(geo.panes[0].left < geo.panes[1].left && geo.panes[1].left < geo.panes[2].left, 'and run left to right');
    assert.ok(geo.panes.every(p => p.w > 300), 'each a usable width: ' + geo.panes.map(p => p.w));

    // the page behind was locked for the view, and is released when it closes
    assert.equal(await page.evaluate(function () {
      return getComputedStyle(document.body).overflowY;
    }), 'hidden', 'the page behind does not scroll while notes cover it');
    await page.evaluate(function () { document.querySelector('[data-nw-close-split]').click(); return true; });
    assert.equal(await page.evaluate(function () {
      return document.documentElement.classList.contains('nw-split-open');
    }), false, 'closing releases the page');
    assert.notEqual(await page.evaluate(function () { return getComputedStyle(document.body).overflowY; }), 'hidden');
    await page.close();
  });

  await t.test('NOTES: dragging a divider resizes the panes and writes nothing', async () => {
    const page = await open('index.html', { db: NOTES_SEED(), viewport: [1280, 900] });
    await toSplit(page, 'sorted:n-a');
    const WIDTHS = function () {
      return Array.prototype.map.call(document.querySelectorAll('[data-nw-pane]'),
        function (p) { return Math.round(p.getBoundingClientRect().width); });
    };
    const before = await page.evaluate(WIDTHS);
    const raw = await page.evaluate(READ_RAW);
    const at = await page.evaluate(function () {
      var r = document.querySelector('[data-nw-divider]').getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });
    const mouse = (type, x, buttons) => page.session.send('Input.dispatchMouseEvent',
      { type, x, y: at.y, button: 'left', buttons, clickCount: 1 });
    await mouse('mousePressed', at.x, 1);
    for (let dx = 40; dx <= 200; dx += 40) await mouse('mouseMoved', at.x + dx, 1);
    await mouse('mouseReleased', at.x + 200, 0);
    const after = await page.evaluate(WIDTHS);
    assert.ok(after[0] - before[0] >= 180, 'the left pane grew by the drag (' + before + ' → ' + after + ')');
    assert.ok(Math.abs((after[0] + after[1]) - (before[0] + before[1])) <= 2, 'and its neighbour paid for it');
    await sleep(400);
    assert.equal(await page.evaluate(READ_RAW), raw, 'a layout change is not data — nothing written');
    await page.close();
  });

  await t.test('NOTES: the side-by-side view is painted from the live tokens in both appearances', async () => {
    for (const theme of ['grit', 'dark']) {
      const page = await open('index.html', { db: NOTES_SEED(), extra: { track_theme: theme } });
      await toSplit(page, 'sorted:n-a');
      const paint = await page.evaluate(function () {
        function token(name) {
          var probe = document.createElement('div');
          probe.style.background = 'var(' + name + ')';
          document.body.appendChild(probe);
          var v = getComputedStyle(probe).backgroundColor;
          probe.remove();
          return v;
        }
        return {
          split: getComputedStyle(document.getElementById('nw-split')).backgroundColor,
          pane: getComputedStyle(document.querySelector('[data-nw-pane]')).backgroundColor,
          appBg: token('--color-app-bg'),
          surface: token('--color-surface')
        };
      });
      assert.equal(paint.split, paint.appBg, theme + ': the view is the app background');
      assert.equal(paint.pane, paint.surface, theme + ': a pane is a surface');
      assert.notEqual(paint.pane, 'rgba(0, 0, 0, 0)', theme + ': and actually painted');
      await page.close();
    }
  });

  await t.test('NOTES: in a long Date list every two-line row keeps its height — no preview is cut in half', async () => {
    /* An item with an explicit min-height, inside a scrolling flex column,
       shrinks down to that min-height before the column scrolls. Every Date
       row is two lines tall with min-height 2.75rem, so a long list cut the
       bottom half off every preview. (A picker row is measured fine at 44px:
       it is a ROW flex, so its words keep their height — nothing to assert.)

       What to MEASURE, learned from a doctored run that passed: the preview
       is not pushed out of a squeezed row. It shrinks itself — overflow:hidden
       lets a flex item go below its content height — and clips its own text
       while its box stays inside the row. So the preview is measured against
       its own content: 5px of box holding 17px of text, not a box overhang. */
    const many = {};
    for (let d = 1; d <= 9; d++) many['2026-03-0' + d] = F.dateNote('draft number ' + d, F.localTs(2026, 3, d));
    const page = await open('index.html', { db: NOTES_SEED({ dateNotes: many }) });
    await page.waitFor(function () { return !!document.getElementById('nw-btn'); }, { message: 'the notes widget' });
    const CUT = function (rowSel, previewSel) {
      return Array.prototype.filter.call(document.querySelectorAll(rowSel), function (r) {
        var p = r.querySelector(previewSel);
        return p && p.scrollHeight > p.clientHeight + 1;
      }).map(function (r) {
        var p = r.querySelector(previewSel);
        return (r.getAttribute('data-nw-row') || r.getAttribute('data-nw-pick')) + ' ' + p.clientHeight + '/' + p.scrollHeight;
      });
    };
    await page.evaluate(function () {
      document.getElementById('nw-btn').click();
      document.querySelector('[data-nw-tab="date"]').click();
      return true;
    });
    assert.deepEqual(await page.evaluate(CUT, '#nw-panel .nw-date-row', '.nw-date-preview'), [],
      'no Date row is squeezed below its own preview');
    assert.ok(await page.evaluate(function () {
      var b = document.getElementById('nw-body');
      return b.scrollHeight > b.clientHeight;
    }), 'and the list really does overflow the panel, so the case is live');
    await page.close();
  });

  /* ── NOTES: Date-note tags and the calendar pop-up ─────────────────────────
     A WRITTEN day shows one tag. Red "unclear" is the default, by the ABSENCE
     of `tag`, so every note written before tags existed is red with no byte
     written. An unwritten day shows none. Choosing unclear deletes the key, a
     tag needs a written day, and persist applies content before tag. The
     calendar pop-up fills every written day with its tag's colour and writes
     nothing. */

  const TAG_SEED = over => seedDb(Object.assign({
    notes: [F.note('n-a', F.localTs(2026, 3, 7), { topic: 'Alpha', content: 'A body' })],
    dateNotes: {
      '2026-03-09': F.dateNote('written before tags existed', F.localTs(2026, 3, 9)),
      '2026-03-10': F.dateNote('sorted out', F.localTs(2026, 3, 10), { tag: 'cleared' }),
      '2026-03-11': F.dateNote('keep this one', F.localTs(2026, 3, 11), { tag: 'eternal' })
    }
  }, over || {}));
  // The radio group a selector names: is it disabled, and which tag is checked.
  const TAGS_IN = function (sel) {
    var g = document.querySelector(sel);
    if (!g) return null;
    return {
      off: g.getAttribute('aria-disabled'),
      checked: Array.prototype.filter.call(g.querySelectorAll('[data-nw-tag-set]'), function (b) {
        return b.getAttribute('aria-checked') === 'true';
      }).map(function (b) { return b.getAttribute('data-nw-tag-set'); })
    };
  };
  const PRESS = function (sel) { document.querySelector(sel).click(); return true; };
  const OPEN_CAL = function () {
    document.getElementById('nw-btn').click();
    document.querySelector('[data-nw-tab="date"]').click();
    document.querySelector('[data-nw-cal-open="list"]').click();
    return true;
  };
  // Steps the open calendar to `ym` with its own ‹ › buttons.
  const CAL_TO = function (ym) {
    for (var i = 0; i < 1200; i++) {
      var at = document.querySelector('[data-nw-cal-month]').getAttribute('data-nw-cal-month');
      if (at === ym) return true;
      document.querySelector(at > ym ? '[data-nw-cal-prev]' : '[data-nw-cal-next]').click();
    }
    return false;
  };
  const CAL_STATE = function () {
    return { cal: !!document.getElementById('nw-cal'), overlay: !!document.querySelector('[data-nw-pick-overlay]') };
  };

  await t.test('NOTES TAGS: every written day is red unclear by default, an unwritten Today is uncoloured, and nothing is migrated', async () => {
    const page = await open('index.html', { db: TAG_SEED() });
    await page.waitFor(function () { return !!document.getElementById('nw-btn'); }, { message: 'the notes widget' });
    const today = await page.evaluate(TODAY_IN);
    const raw = await page.evaluate(READ_RAW);
    const rows = await page.evaluate(function () {
      document.getElementById('nw-btn').click();
      document.querySelector('[data-nw-tab="date"]').click();
      var out = {};
      Array.prototype.forEach.call(document.querySelectorAll('[data-nw-row^="date:"]'), function (r) {
        var c = r.querySelector('[data-nw-tag-chip]');
        out[r.getAttribute('data-nw-row').slice(5)] = c ? c.getAttribute('data-nw-tag-chip') + ' ' + c.textContent : null;
      });
      return out;
    });
    assert.deepEqual(rows, {
      [today]: null,
      '2026-03-09': 'unclear unclear',
      '2026-03-10': 'cleared cleared',
      '2026-03-11': 'eternal Eternal'
    }, 'the default for an untagged written day, each stored tag in the user\'s words, and none for an unwritten day');
    const paint = await page.evaluate(function () {
      var probe = document.createElement('span');
      document.body.appendChild(probe);
      probe.style.color = 'var(--color-tag-unclear)';
      var red = getComputedStyle(probe).color;
      probe.remove();
      return { red: red, chip: getComputedStyle(document.querySelector('[data-nw-row="date:2026-03-09"] [data-nw-tag-chip]')).color };
    });
    assert.equal(paint.chip, paint.red, 'the default is painted red');
    await sleep(400);
    assert.equal(await page.evaluate(READ_RAW), raw, 'the default is read, never written — no stored note was touched');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('NOTES TAGS: the radio is disabled until something is written, cleared lands, unclear DELETES the key, and no press asks', async () => {
    const page = await open('index.html', { db: TAG_SEED() });
    await page.waitFor(function () { return !!document.getElementById('nw-btn'); }, { message: 'the notes widget' });
    const today = await page.evaluate(TODAY_IN);
    const G = '[data-nw-tags="' + today + '"]';
    await page.evaluate(OPEN_TODAY);
    assert.deepEqual(await page.evaluate(TAGS_IN, G), { off: 'true', checked: [] },
      'nothing written: no tag, and the group is disabled');

    let raw = await page.evaluate(READ_RAW);
    const dialogs0 = page.dialogs.length;
    await page.evaluate(PRESS, '[data-nw-tag-set="eternal"]');
    await sleep(400);
    assert.equal(await page.evaluate(READ_RAW), raw, 'an unwritten day cannot be tagged — the press wrote nothing');

    await page.evaluate(TYPE_IN, '#nw-content', 'first idea');
    assert.deepEqual(await page.evaluate(TAGS_IN, G), { off: 'false', checked: ['unclear'] },
      'the first words make it unclear at once, before the save lands');
    await landed(page, raw, 'the first words landing');
    assert.equal(Object.prototype.hasOwnProperty.call((await page.evaluate(SLOT0)).dateNotes[today], 'tag'), false,
      'a newly written day stores no tag — unclear is the absence');

    raw = await page.evaluate(READ_RAW);
    const before = await page.evaluate(SLOT0);
    await page.evaluate(PRESS, '[data-nw-tag-set="cleared"]');
    await landed(page, raw, 'the cleared tag landing');
    let slot = await page.evaluate(SLOT0);
    assert.equal(slot.dateNotes[today].tag, 'cleared', 'cleared is stored');
    assert.deepEqual(slot.dateNotes[today],
      Object.assign({}, before.dateNotes[today], { tag: 'cleared', updatedAt: slot.dateNotes[today].updatedAt }),
      'spread into the record: its text and createdAt kept');
    for (const key of Object.keys(before)) {
      if (key === 'dateNotes') continue;
      assert.deepEqual(slot[key], before[key], key + ' is unchanged — a tag writes dateNotes alone');
    }
    for (const day of ['2026-03-09', '2026-03-10', '2026-03-11']) {
      assert.deepEqual(slot.dateNotes[day], before.dateNotes[day], day + ' is untouched');
    }
    assert.deepEqual(await page.evaluate(TAGS_IN, G), { off: 'false', checked: ['cleared'] });

    raw = await page.evaluate(READ_RAW);
    await page.evaluate(PRESS, '[data-nw-tag-set="cleared"]');
    await sleep(400);
    assert.equal(await page.evaluate(READ_RAW), raw, 'pressing the checked tag again writes nothing');

    await page.evaluate(PRESS, '[data-nw-tag-set="unclear"]');
    await landed(page, raw, 'the default landing');
    slot = await page.evaluate(SLOT0);
    assert.equal(Object.prototype.hasOwnProperty.call(slot.dateNotes[today], 'tag'), false,
      'choosing unclear DELETES the key — the default is never stored');
    assert.equal(slot.dateNotes[today].content, 'first idea');
    assert.deepEqual(await page.evaluate(TAGS_IN, G), { off: 'false', checked: ['unclear'] });
    assert.equal(page.dialogs.length, dialogs0, 'no tag press asked anything — a radio choice deletes no text');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('NOTES TAGS: a tag pressed within the debounce of a day\'s first words lands with them', async () => {
    const page = await open('index.html', { db: TAG_SEED() });
    await page.waitFor(function () { return !!document.getElementById('nw-btn'); }, { message: 'the notes widget' });
    const today = await page.evaluate(TODAY_IN);
    await page.evaluate(OPEN_TODAY);
    const raw = await page.evaluate(READ_RAW);
    // One synchronous block: the words are still inside the 300ms debounce when
    // the tag is pressed, so persist receives both in a single patch.
    await page.evaluate(function () {
      var ta = document.getElementById('nw-content');
      ta.value = 'written and tagged at once';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('[data-nw-tag-set="eternal"]').click();
      return true;
    });
    await landed(page, raw);
    const rec = (await page.evaluate(SLOT0)).dateNotes[today];
    assert.equal(rec.tag, 'eternal', 'the tag landed — content is applied first, so the tag found its words');
    assert.equal(rec.content, 'written and tagged at once');
    assert.deepEqual(await page.evaluate(TAGS_IN, '[data-nw-tags="' + today + '"]'), { off: 'false', checked: ['eternal'] });
    await page.close();
  });

  /* ── NOTES LOCK: cleared and Eternal freeze a day's text ──────────────────
     The user's rule: a green or purple day cannot be edited, but can still be
     selected and copied, and opened beside another note. The box is readOnly,
     never disabled — disabled would stop the selection too. 🗑 refuses without
     asking, Send never writes INTO a locked pane, and the writer itself refuses
     a locked day, so a save from a stale tab is reported rather than written. */

  // What the lock looks like on one editor: readOnly, its hook, and the note
  // saying why — read off the editor's own host, the panel or its pane.
  const LOCK_IN = function (sel) {
    var ta = document.querySelector(sel);
    if (!ta) return null;
    var host = ta.closest('[data-nw-pane]') || document.getElementById('nw-body');
    var note = host.querySelector('[data-nw-lock-note]');
    return {
      readOnly: ta.readOnly, disabled: ta.disabled,
      locked: ta.getAttribute('data-nw-locked'),
      note: note && !note.hidden && note.getBoundingClientRect().height > 0 ? note.textContent : null
    };
  };
  const OPEN_DAY = function (day) {
    document.getElementById('nw-btn').click();
    document.querySelector('[data-nw-tab="date"]').click();
    document.querySelector('[data-nw-row="date:' + day + '"]').click();
    return true;
  };
  const CARET_END = function (sel) {
    var ta = document.querySelector(sel);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    return true;
  };
  // A real keystroke, through the browser's input pipeline rather than a value
  // set from script: a readOnly box refuses this, and only this.
  const KEYS = async (page, words) => {
    await page.session.send('Input.insertText', { text: words });
    for (const type of ['keyDown', 'keyUp']) {
      await page.session.send('Input.dispatchKeyEvent', { type, key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    }
  };
  const TEXT_OF = function (sel) { return document.querySelector(sel).value; };
  const LOCKED_NOTE = word => 'Read only while “' + word + '” — choose unclear to edit.';

  await t.test('NOTES LOCK: an Eternal day is read-only — it highlights, a real keystroke changes nothing, 🗑 asks nothing, and ⧉ still opens beside', async () => {
    const page = await open('index.html', { db: TAG_SEED() });
    await page.waitFor(function () { return !!document.getElementById('nw-btn'); }, { message: 'the notes widget' });
    await page.evaluate(OPEN_DAY, '2026-03-11');
    const raw = await page.evaluate(READ_RAW);

    await page.evaluate(CARET_END, '#nw-content');
    await KEYS(page, ' typed into it');
    await sleep(500);
    assert.equal(await page.evaluate(TEXT_OF, '#nw-content'), 'keep this one',
      'typing and Backspace changed nothing in an Eternal day');
    assert.equal(await page.evaluate(READ_RAW), raw, 'and nothing was written');
    assert.deepEqual(await page.evaluate(LOCK_IN, '#nw-content'),
      { readOnly: true, disabled: false, locked: 'eternal', note: LOCKED_NOTE('Eternal') },
      'read-only, never disabled, and it says how to undo it');

    const picked = await page.evaluate(function () {
      var ta = document.getElementById('nw-content');
      ta.focus();
      ta.setSelectionRange(0, 4);
      return { focused: document.activeElement === ta, text: ta.value.slice(ta.selectionStart, ta.selectionEnd) };
    });
    assert.deepEqual(picked, { focused: true, text: 'keep' }, 'its words can still be highlighted, to copy');

    const dialogs0 = page.dialogs.length;
    assert.equal(await page.evaluate(function () {
      return document.querySelector('[data-nw-clear-day]').getAttribute('aria-disabled');
    }), 'true', '🗑 is marked unavailable');
    await page.evaluate(PRESS, '[data-nw-clear-day]');
    await sleep(300);
    assert.equal(page.dialogs.length, dialogs0, 'pressing it anyway asked nothing');
    assert.equal(await page.evaluate(READ_RAW), raw, 'and cleared nothing');
    assert.equal(await page.evaluate(TEXT_OF, '#nw-content'), 'keep this one');

    await page.evaluate(function () {
      document.querySelector('[data-nw-side-open]').click();
      document.querySelector('[data-nw-pick="sorted:n-a"]').click();
      return true;
    });
    await page.waitFor(function () { return document.querySelectorAll('[data-nw-pane]').length === 2; },
      { message: 'the locked day opened beside a Sorted note' });
    assert.deepEqual(await page.evaluate(PANES), ['date:2026-03-11', 'sorted:n-a']);
    assert.deepEqual(await page.evaluate(LOCK_IN, '[data-nw-pane="date:2026-03-11"] textarea'),
      { readOnly: true, disabled: false, locked: 'eternal', note: LOCKED_NOTE('Eternal') }, 'locked in its pane too');
    assert.equal((await page.evaluate(LOCK_IN, '[data-nw-pane="sorted:n-a"] textarea')).readOnly, false,
      'and the note beside it is not');
    assert.equal(await page.evaluate(READ_RAW), raw, 'opening beside wrote nothing');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('NOTES LOCK: choosing unclear unlocks a cleared day — it types again, 🗑 asks plainly, and a tag locks it again', async () => {
    const page = await open('index.html', { db: TAG_SEED() });
    await page.waitFor(function () { return !!document.getElementById('nw-btn'); }, { message: 'the notes widget' });
    await page.evaluate(OPEN_DAY, '2026-03-10');
    assert.deepEqual(await page.evaluate(LOCK_IN, '#nw-content'),
      { readOnly: true, disabled: false, locked: 'cleared', note: LOCKED_NOTE('cleared') }, 'cleared locks as Eternal does');

    let raw = await page.evaluate(READ_RAW);
    await page.evaluate(PRESS, '[data-nw-tag-set="unclear"]');
    await landed(page, raw, 'the unlock landing');
    assert.deepEqual(await page.evaluate(LOCK_IN, '#nw-content'),
      { readOnly: false, disabled: false, locked: null, note: null }, 'unclear: editable, and the note is gone');
    assert.equal(await page.evaluate(function () {
      return document.querySelector('[data-nw-clear-day]').getAttribute('aria-disabled');
    }), 'false', '🗑 is available again');

    raw = await page.evaluate(READ_RAW);
    await page.evaluate(CARET_END, '#nw-content');
    await page.session.send('Input.insertText', { text: ' again' });
    await landed(page, raw, 'the typing landing');
    assert.deepEqual((await page.evaluate(SLOT0)).dateNotes['2026-03-10'].content, 'sorted out again',
      'the same keystroke that did nothing on a locked day now writes');

    raw = await page.evaluate(READ_RAW);
    const dialogs0 = page.dialogs.length;
    page.rejectDialogs = true;
    await page.evaluate(PRESS, '[data-nw-clear-day]');
    await sleep(300);
    page.rejectDialogs = false;
    assert.equal(page.dialogs.length, dialogs0 + 1, 'an unlocked day asks before it clears');
    const asked = page.dialogs[page.dialogs.length - 1] || '';
    assert.ok(/^Clear the draft for .*10 Mar.*\?$/.test(asked) && !/tag/.test(asked),
      'plainly — an unlocked day shows unclear, so there is no tag to name: ' + asked);
    assert.equal(await page.evaluate(READ_RAW), raw, 'Cancel left track_db byte-identical');

    await page.evaluate(PRESS, '[data-nw-tag-set="eternal"]');
    await landed(page, raw, 'the lock landing');
    assert.equal((await page.evaluate(LOCK_IN, '#nw-content')).locked, 'eternal', 'a tag locks it again');
    assert.equal(page.dialogs.length, dialogs0 + 1, 'and no tag press asked anything');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('NOTES LOCK: side by side a locked pane is sent FROM but never INTO — and with every other pane locked, Send says so', async () => {
    const page = await open('index.html', { db: TAG_SEED() });
    const today = await page.evaluate(TODAY_IN);
    await toSplit(page, 'sorted:n-a');
    await addPane(page, 'date:2026-03-11');
    await page.waitFor(function () { return document.querySelectorAll('[data-nw-pane]').length === 3; },
      { message: 'three notes side by side' });
    assert.deepEqual(await page.evaluate(PANES), ['date:' + today, 'sorted:n-a', 'date:2026-03-11']);
    const ETERNAL = '[data-nw-pane="date:2026-03-11"] textarea';
    const ALPHA = '[data-nw-pane="sorted:n-a"] textarea';
    const SEND_OF = function (sel) {
      var b = document.querySelector(sel).closest('[data-nw-pane]').querySelector('[data-nw-send]');
      return { off: b.getAttribute('aria-disabled'), title: b.title };
    };
    const CLICK_SEND = function (sel) {
      document.querySelector(sel).closest('[data-nw-pane]').querySelector('[data-nw-send]').click();
      return Array.prototype.map.call(document.querySelectorAll('[data-nw-send-menu] [data-nw-send-to]'),
        function (b) { return b.getAttribute('data-nw-send-to'); });
    };
    const before = await page.evaluate(SLOT0);

    // FROM: a locked day's highlighted words go out like any other note's
    let raw = await page.evaluate(READ_RAW);
    await page.evaluate(SELECT_IN, ETERNAL, 0, 4);
    assert.equal((await page.evaluate(SEND_OF, ETERNAL)).off, 'false', 'a locked pane can send');
    assert.deepEqual(await page.evaluate(CLICK_SEND, ETERNAL), ['sorted:n-a', 'date:' + today],
      'to either other pane, Sorted first');
    await page.evaluate(PRESS, '[data-nw-send-to="sorted:n-a"]');
    await landed(page, raw, 'the send from the locked day landing');
    let slot = await page.evaluate(SLOT0);
    assert.equal(slot.notes.find(n => n.id === 'n-a').content, 'A body\nkeep');
    assert.deepEqual(slot.dateNotes['2026-03-11'], before.dateNotes['2026-03-11'], 'and the locked source is untouched');

    // INTO: from Alpha the locked day is not offered, so today is the one target and no menu opens
    raw = await page.evaluate(READ_RAW);
    await page.evaluate(SELECT_IN, ALPHA, 0, 6);
    assert.deepEqual(await page.evaluate(CLICK_SEND, ALPHA), [], 'one target left, so it sends without asking');
    await landed(page, raw, 'the send into today landing');
    slot = await page.evaluate(SLOT0);
    assert.equal(slot.dateNotes[today].content, 'A body', 'today, unlocked, took the words');
    assert.deepEqual(slot.dateNotes['2026-03-11'], before.dateNotes['2026-03-11'], 'the Eternal day did not');
    assert.equal(await page.evaluate(TEXT_OF, ETERNAL), 'keep this one');

    // every other pane locked: today's pane becomes the cleared day
    await page.evaluate(function (today) {
      document.querySelector('[data-nw-pane="date:' + today + '"] [data-nw-pane-change]').click();
      document.querySelector('[data-nw-pick-overlay] [data-nw-pick="date:2026-03-10"]').click();
      return true;
    }, today);
    await page.waitFor(function () { return !!document.querySelector('[data-nw-pane="date:2026-03-10"]'); },
      { message: 'the cleared day in the first pane' });
    raw = await page.evaluate(READ_RAW);
    await page.evaluate(SELECT_IN, ALPHA, 0, 6);
    const send = await page.evaluate(SEND_OF, ALPHA);
    assert.equal(send.off, 'true', 'with nothing unlocked to send into, Send is unavailable');
    assert.ok(/locked/.test(send.title), 'and says why: ' + send.title);
    assert.deepEqual(await page.evaluate(CLICK_SEND, ALPHA), [], 'pressing it anyway opens no menu');
    await sleep(300);
    assert.equal(await page.evaluate(READ_RAW), raw, 'and writes nothing');
    assert.ok(/locked/.test(await page.evaluate(function () {
      return document.querySelector('[data-nw-toast]').textContent;
    })), 'the press explained why');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('NOTES LOCK: a lock set in another tab reaches an open editor at once, and words typed before it did are reported, never written', async () => {
    const page = await open('index.html', { db: TAG_SEED() });
    await page.waitFor(function () { return !!document.getElementById('nw-btn'); }, { message: 'the notes widget' });
    const today = await page.evaluate(TODAY_IN);
    await page.evaluate(OPEN_TODAY);
    let raw = await page.evaluate(READ_RAW);
    await page.evaluate(TYPE_IN, '#nw-content', 'draft');
    await landed(page, raw, 'the draft landing');

    // Another tab tags the day: the write, then the event every other tab hears.
    raw = await page.evaluate(READ_RAW);
    await page.evaluate(function (day) {
      var db = JSON.parse(localStorage.getItem('track_db'));
      db.slots[0].dateNotes[day].tag = 'cleared';
      window.TrackStorage.saveDB(db);
      window.dispatchEvent(new StorageEvent('storage', { key: 'track_db' }));
      return true;
    }, today);
    assert.deepEqual(await page.evaluate(LOCK_IN, '#nw-content'),
      { readOnly: true, disabled: false, locked: 'cleared', note: LOCKED_NOTE('cleared') },
      'the open editor froze at once, without being redrawn');
    assert.deepEqual(await page.evaluate(TAGS_IN, '[data-nw-tags="' + today + '"]'), { off: 'false', checked: ['cleared'] });
    assert.equal(await page.evaluate(TEXT_OF, '#nw-content'), 'draft', 'and its text was left as it was');

    // The race: words typed, then a lock that lands BEFORE their debounce does,
    // with no event yet — the stale-tab case the writer's own refusal is for.
    raw = await page.evaluate(READ_RAW);
    await page.evaluate(PRESS, '[data-nw-tag-set="unclear"]');
    await landed(page, raw, 'the unlock landing');
    await page.evaluate(function (day) {
      var ta = document.getElementById('nw-content');
      ta.value = 'draft, and more';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      var db = JSON.parse(localStorage.getItem('track_db'));
      db.slots[0].dateNotes[day].tag = 'eternal';
      window.TrackStorage.saveDB(db);
      return true;
    }, today);
    // Past the 300ms debounce, then assert: a refusal swallowed as 'unchanged'
    // leaves the status on the unlock's 'saved', and reports itself as that.
    await sleep(700);
    assert.equal(await page.evaluate(function () {
      return document.querySelector('#nw-body [data-nw-status]').getAttribute('data-nw-status');
    }), 'locked', 'the editor reported the refused save');
    const rec = (await page.evaluate(SLOT0)).dateNotes[today];
    assert.deepEqual([rec.content, rec.tag], ['draft', 'eternal'], 'the locked day kept its text — the late words were refused');
    assert.equal(await page.evaluate(TEXT_OF, '#nw-content'), 'draft, and more', 'and they are still on screen, to copy');
    assert.equal((await page.evaluate(LOCK_IN, '#nw-content')).locked, 'eternal', 'the refusal froze the box');
    assert.ok(/locked elsewhere/.test(await page.evaluate(function () {
      return document.querySelector('#nw-body [data-nw-status]').textContent;
    })), 'and said why');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('NOTES TAGS: a tag pressed in a side-by-side pane lands on that pane\'s day and nowhere else', async () => {
    const page = await open('index.html', { db: TAG_SEED() });
    const today = await page.evaluate(TODAY_IN);
    await toSplit(page, 'date:2026-03-09');
    assert.deepEqual(await page.evaluate(PANES), ['date:' + today, 'date:2026-03-09']);
    assert.deepEqual(await page.evaluate(TAGS_IN, '[data-nw-pane="date:' + today + '"] [data-nw-tags]'),
      { off: 'true', checked: [] }, 'today\'s pane holds nothing: uncoloured');
    assert.deepEqual(await page.evaluate(TAGS_IN, '[data-nw-pane="date:2026-03-09"] [data-nw-tags]'),
      { off: 'false', checked: ['unclear'] });
    const raw = await page.evaluate(READ_RAW);
    const before = await page.evaluate(SLOT0);
    await page.evaluate(PRESS, '[data-nw-pane="date:2026-03-09"] [data-nw-tag-set="eternal"]');
    await landed(page, raw);
    const slot = await page.evaluate(SLOT0);
    assert.equal(slot.dateNotes['2026-03-09'].tag, 'eternal', 'the pane\'s own day was tagged');
    assert.equal(Object.prototype.hasOwnProperty.call(slot.dateNotes, today), false, 'the other pane\'s day was not created');
    for (const day of ['2026-03-10', '2026-03-11']) {
      assert.deepEqual(slot.dateNotes[day], before.dateNotes[day], day + ' is untouched');
    }
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('NOTES CALENDAR: the pop-up opens on this month and fills every written day with its tag colour, in both appearances', async () => {
    for (const theme of ['grit', 'dark']) {
      const page = await open('index.html', { db: TAG_SEED(), extra: { track_theme: theme } });
      await page.waitFor(function () { return !!document.getElementById('nw-btn'); }, { message: 'the notes widget' });
      const raw = await page.evaluate(READ_RAW);
      await page.evaluate(OPEN_CAL);
      const first = await page.evaluate(function () {
        var root = document.documentElement.getBoundingClientRect();
        var current = document.querySelector('[aria-current="date"]');
        return {
          month: document.querySelector('[data-nw-cal-month]').getAttribute('data-nw-cal-month'),
          expected: window.TrackNotes.monthOf(window.TrackSchema.localToday()),
          cells: document.querySelectorAll('[data-nw-cal-day]').length,
          focused: document.activeElement && document.activeElement.getAttribute('data-nw-cal-day'),
          today: window.TrackSchema.localToday(),
          current: current && current.getAttribute('data-nw-cal-day'),
          root: [Math.round(root.left), Math.round(root.top)]
        };
      });
      assert.equal(first.month, first.expected, theme + ': it opens on this month');
      assert.equal(first.cells, 42, theme + ': six whole weeks');
      assert.equal(first.focused, first.today, theme + ': with today focused');
      assert.equal(first.current, first.today, theme + ': and marked as today');
      assert.deepEqual(first.root, [0, 0], theme + ': the page behind is not moved by the pop-up');

      assert.ok(await page.evaluate(CAL_TO, '2026-03'), theme + ': ‹ reaches March 2026');
      const cells = await page.evaluate(function () {
        function token(name) {
          var p = document.createElement('span');
          document.body.appendChild(p);
          p.style.backgroundColor = 'var(' + name + ')';
          var v = getComputedStyle(p).backgroundColor;
          p.remove();
          return v;
        }
        var out = { tokens: { unclear: token('--color-tag-unclear'), cleared: token('--color-tag-cleared'),
          eternal: token('--color-tag-eternal') } };
        ['2026-03-08', '2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12'].forEach(function (d) {
          var c = document.querySelector('[data-nw-cal-day="' + d + '"]');
          out[d] = { tag: c.getAttribute('data-nw-cal-tag'), bg: getComputedStyle(c).backgroundColor };
        });
        return out;
      });
      assert.deepEqual(cells['2026-03-09'], { tag: 'unclear', bg: cells.tokens.unclear }, theme + ': an untagged written day is filled red');
      assert.deepEqual(cells['2026-03-10'], { tag: 'cleared', bg: cells.tokens.cleared }, theme + ': cleared is filled green');
      assert.deepEqual(cells['2026-03-11'], { tag: 'eternal', bg: cells.tokens.eternal }, theme + ': Eternal is filled orchid');
      for (const d of ['2026-03-08', '2026-03-12']) {
        assert.deepEqual(cells[d], { tag: null, bg: 'rgba(0, 0, 0, 0)' }, theme + ': ' + d + ', with nothing written, keeps the plain default');
      }
      assert.equal(new Set(Object.values(cells.tokens)).size, 3, theme + ': three distinct colours');
      assert.equal(await page.evaluate(READ_RAW), raw, theme + ': opening and moving the calendar wrote nothing');

      await page.evaluate(PRESS, '[data-nw-cal-day="2026-03-11"]');
      const after = await page.evaluate(function () {
        var title = document.querySelector('[data-nw-day-title]');
        return {
          cal: !!document.getElementById('nw-cal'),
          locked: document.documentElement.classList.contains('nw-cal-open'),
          day: title && title.getAttribute('data-nw-day-title')
        };
      });
      assert.deepEqual(after, { cal: false, locked: false, day: '2026-03-11' }, theme + ': choosing a day closes the pop-up and opens that day');
      assert.equal(await page.evaluate(READ_RAW), raw, theme + ': and choosing it wrote nothing');
      assert.deepEqual(realErrors(page), []);
      await page.close();
    }
  });

  await t.test('NOTES CALENDAR: from the side-by-side picker an open day is refused, Escape closes only the calendar, and a day opens as a pane', async () => {
    const page = await open('index.html', { db: TAG_SEED() });
    const today = await page.evaluate(TODAY_IN);
    await toSplit(page, 'sorted:n-a');
    await page.evaluate(function () {
      document.querySelector('[data-nw-add-pane]').click();
      var o = document.querySelector('[data-nw-pick-overlay]');
      o.querySelector('[data-nw-picker-tab="date"]').click();
      o.querySelector('[data-nw-cal-open="picker"]').click();
      return true;
    });
    const raw = await page.evaluate(READ_RAW);
    assert.equal(await page.evaluate(function (d) {
      return document.querySelector('[data-nw-cal-day="' + d + '"]').getAttribute('aria-disabled');
    }, today), 'true', 'today is already open in a pane, so its day is disabled');
    await page.evaluate(PRESS, '[data-nw-cal-day="' + today + '"]');
    assert.deepEqual(await page.evaluate(CAL_STATE), { cal: true, overlay: true }, 'pressing it does nothing — the calendar stays');
    assert.deepEqual(await page.evaluate(PANES), ['date:' + today, 'sorted:n-a']);

    await page.evaluate(function () {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return true;
    });
    assert.deepEqual(await page.evaluate(CAL_STATE), { cal: false, overlay: true },
      'Escape closed the calendar and left the pick overlay beneath it');

    await page.evaluate(PRESS, '[data-nw-pick-overlay] [data-nw-cal-open="picker"]');
    assert.ok(await page.evaluate(CAL_TO, '2026-03'));
    await page.evaluate(PRESS, '[data-nw-cal-day="2026-03-10"]');
    await page.waitFor(function () { return document.querySelectorAll('[data-nw-pane]').length === 3; },
      { message: 'a third pane' });
    assert.deepEqual(await page.evaluate(PANES), ['date:' + today, 'sorted:n-a', 'date:2026-03-10']);
    assert.deepEqual(await page.evaluate(CAL_STATE), { cal: false, overlay: false });
    assert.equal(await page.evaluate(READ_RAW), raw, 'choosing through the calendar wrote nothing');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('NOTES CALENDAR: the keys move the focused day across months, and Escape, ✕ and a click outside all close it', async () => {
    const page = await open('index.html', { db: TAG_SEED() });
    await page.waitFor(function () { return !!document.getElementById('nw-btn'); }, { message: 'the notes widget' });
    const raw = await page.evaluate(READ_RAW);
    await page.evaluate(OPEN_CAL);
    assert.ok(await page.evaluate(CAL_TO, '2026-03'));
    // Dispatched on the focused day, so it bubbles through the grid exactly as a keypress would.
    const KEY = function (key, shift) {
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: key, shiftKey: !!shift, bubbles: true, cancelable: true }));
      var f = document.activeElement;
      return [f && f.getAttribute('data-nw-cal-day'), document.querySelector('[data-nw-cal-month]').getAttribute('data-nw-cal-month')];
    };
    const OPEN_NOW = function () { return !!document.getElementById('nw-cal'); };
    await page.evaluate(function () { document.querySelector('[data-nw-cal-day="2026-03-01"]').focus(); return true; });
    assert.deepEqual(await page.evaluate(KEY, 'ArrowLeft'), ['2026-02-28', '2026-02'], '← crosses back into February, and the month follows');
    assert.deepEqual(await page.evaluate(KEY, 'ArrowDown'), ['2026-03-07', '2026-03'], '↓ is a week later');
    assert.deepEqual(await page.evaluate(KEY, 'PageUp'), ['2026-02-07', '2026-02'], 'PageUp is the same day a month earlier');
    assert.deepEqual(await page.evaluate(KEY, 'PageDown', true), ['2027-02-07', '2027-02'], 'Shift+PageDown is a year later');
    assert.deepEqual(await page.evaluate(KEY, 'ArrowRight'), ['2027-02-08', '2027-02']);

    const esc = await page.evaluate(function () {
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      return { cal: !!document.getElementById('nw-cal'), focus: document.activeElement && document.activeElement.getAttribute('data-nw-cal-open') };
    });
    assert.deepEqual(esc, { cal: false, focus: 'list' }, 'Escape closed it and handed focus back to Go to day');

    await page.evaluate(PRESS, '[data-nw-cal-open="list"]');
    await page.evaluate(PRESS, '[data-nw-cal-close]');
    assert.equal(await page.evaluate(OPEN_NOW), false, '✕ closed it');

    await page.evaluate(PRESS, '[data-nw-cal-open="list"]');
    await page.evaluate(PRESS, '[data-nw-cal] .nw-cal-legend');
    assert.equal(await page.evaluate(OPEN_NOW), true, 'a click inside the card keeps it open');
    await page.evaluate(PRESS, '#nw-cal');
    assert.equal(await page.evaluate(OPEN_NOW), false, 'a click on the scrim outside it closes it');
    assert.equal(await page.evaluate(function () { return document.documentElement.classList.contains('nw-cal-open'); }), false,
      'and the page behind is released');
    assert.equal(await page.evaluate(READ_RAW), raw, 'none of it wrote anything');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('NOTES TAGS: every tag colour clears 4.5:1 in both appearances — as text, as a fill, and on its own chip', async () => {
    /* Computed from the live tokens and the live chips, like the ACCENT case,
       so a palette tweak is checked rather than re-recorded. An undefined token
       reports itself instead of resolving to the inherited text colour. */
    const MEASURE = function () {
      var cs = getComputedStyle(document.documentElement);
      var tok = function (n) { return cs.getPropertyValue(n).trim(); };
      var probe = document.createElement('span');
      document.body.appendChild(probe);
      // color-mix() computes to color(srgb r g b) in 0..1, not rgb() in 0..255.
      var parse = function (s) {
        var m = (s.match(/[\d.]+/g) || []).map(Number);
        return /^color\(/.test(s) ? m.slice(0, 3).map(function (v) { return v * 255; }) : m.slice(0, 3);
      };
      var rgb = function (v) { probe.style.color = ''; probe.style.color = v; return parse(getComputedStyle(probe).color); };
      var lum = function (c) {
        var f = c.map(function (v) {
          v = v / 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
      };
      var ratio = function (a, b) {
        var x = lum(a), y = lum(b);
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      };
      var worst = { ratio: 99, pair: null };
      var note = function (r, pair) { if (r < worst.ratio) worst = { ratio: r, pair: pair }; };
      ['--color-tag-unclear', '--color-tag-cleared', '--color-tag-eternal'].forEach(function (t) {
        var raw = tok(t);
        if (!raw) { note(0, t + ' is undefined'); return; }
        ['--color-app-bg', '--color-surface', '--color-surface-muted'].forEach(function (s) {
          note(ratio(rgb(raw), rgb(tok(s))), t + ' text on ' + s);
        });
        note(ratio(rgb(tok('--color-surface')), rgb(raw)), '--color-surface text on a ' + t + ' fill');
      });
      var chips = document.querySelectorAll('[data-nw-tag-chip]');
      Array.prototype.forEach.call(chips, function (c) {
        var st = getComputedStyle(c);
        note(ratio(parse(st.color), parse(st.backgroundColor)), 'the ' + c.getAttribute('data-nw-tag-chip') + ' chip');
      });
      probe.remove();
      worst.chips = Array.prototype.map.call(chips, function (c) { return c.getAttribute('data-nw-tag-chip'); }).sort();
      return worst;
    };
    for (const theme of ['grit', 'dark']) {
      const page = await open('index.html', { db: TAG_SEED(), extra: { track_theme: theme } });
      await page.waitFor(function () { return !!document.getElementById('nw-btn'); }, { message: 'the notes widget' });
      await page.evaluate(function () {
        document.getElementById('nw-btn').click();
        document.querySelector('[data-nw-tab="date"]').click();
        return true;
      });
      const w = await page.evaluate(MEASURE);
      assert.deepEqual(w.chips, ['cleared', 'eternal', 'unclear'], theme + ': one chip of each tag was measured');
      assert.ok(w.ratio >= 4.5, theme + ': the worst pair is ' + w.pair + ' at ' + w.ratio.toFixed(2) + ':1');
      await page.close();
    }
  });

  /* ── JOURNEY: the book of Eternal days ────────────────────────────────────
     journey-book.js binds every Eternal Journal day into a book that opens on
     its title page and moves only a sheet at a time. It is a READER: nothing it
     does may write track_db or any other key. Most cases emulate reduced
     motion, which keeps every turn a turn but a short one; one runs the full
     animation and catches a sheet mid-turn. Input is real (CDP mouse, touch and
     keys): the book listens for pointer events, which a synthetic TouchEvent
     never produces. A turn sets data-jr-flipping the moment it starts, so every
     case waits for the book to SETTLE and then asserts where it is — a turn
     that never happened reports the wrong page instead of timing out. */

  const JOURNEY_LONG = Array.from({ length: 64 }, (_, i) => 'Line ' + (i + 1) +
    ' of a long synthetic day on the old road past the mill and the river' + (i % 6 === 5 ? '.\n\n' : ',')).join(' ').trim();
  const JOURNEY_THAI = 'วันนี้อากาศดีมากฉันเดินไปตลาดตอนเช้าและซื้อดอกไม้มาหนึ่งกำ'.repeat(40);
  const JOURNEY_SEED = over => seedDb(Object.assign({
    notes: [],
    dateNotes: {
      '2026-03-06': F.dateNote('A short Eternal day.\nIts second line.', F.localTs(2026, 3, 6), { tag: 'eternal' }),
      '2026-03-04': F.dateNote(JOURNEY_LONG, F.localTs(2026, 3, 4), { tag: 'eternal' }),
      '2026-03-05': F.dateNote('Cleared, so never bound.', F.localTs(2026, 3, 5), { tag: 'cleared' }),
      '2026-03-07': F.dateNote('Unclear, so never bound.', F.localTs(2026, 3, 7)),
      '2026-03-02': F.dateNote('The oldest Eternal day.', F.localTs(2026, 3, 2), { tag: 'eternal' })
    }
  }, over || {}));
  const JOURNEY_DAYS = { '2026-03-02': 'Monday 02/03/2026', '2026-03-04': 'Wednesday 04/03/2026', '2026-03-06': 'Friday 06/03/2026' };

  const OPEN_JOURNEY = function () {
    if (!document.getElementById('nw-panel') || document.getElementById('nw-panel').style.display === 'none') {
      document.getElementById('nw-btn').click();
    }
    document.querySelector('[data-nw-tab="date"]').click();
    document.querySelector('[data-nw-journey-open]').click();
    return true;
  };
  const JOURNEY_READY = function () { return !!document.querySelector('#nw-journey[data-jr-ready]'); };
  const SETTLED = function () { var r = document.getElementById('nw-journey'); return !!r && !r.hasAttribute('data-jr-flipping'); };
  const VIEW = function () { return document.getElementById('nw-journey').getAttribute('data-jr-view'); };
  const KEYS_IN = function () { return Object.keys(localStorage).sort(); };
  // What lies open: every visible page, left then right, and what is on it.
  const SHOWN = function () {
    var r = document.getElementById('nw-journey');
    return Array.prototype.map.call(r.querySelectorAll('[data-jr-slot] > [data-jr-kind]'), function (p) {
      var d = p.querySelector('[data-jr-date]'), b = p.querySelector('[data-jr-body]'), t = p.querySelector('[data-jr-title]');
      var box = p.querySelector('.jr-text');
      return {
        kind: p.getAttribute('data-jr-kind'), day: p.getAttribute('data-jr-day'),
        date: d ? d.textContent : null, title: t ? t.textContent.replace(/\s+/g, ' ') : null,
        text: b ? b.textContent : (box ? box.textContent : null),
        // the heading is the first thing on its page: nothing of another day above it
        headFirst: d ? box.firstElementChild === d.parentNode : null,
        over: box ? box.scrollHeight - box.clientHeight : null
      };
    });
  };
  // The ink of every open day page, stretch by stretch: `at` and `end` are
  // offsets in the stretch's DAY, `wet` its --jr-wet (100 is a plain run in
  // the full ink), `pageStart` where its page begins in that day.
  const INKS = function () {
    var out = [];
    document.querySelectorAll('#nw-journey [data-jr-slot] > [data-jr-kind="day"]').forEach(function (p) {
      var start = +p.getAttribute('data-jr-start'), at = start;
      p.querySelector('[data-jr-body]').childNodes.forEach(function (n) {
        var len = n.textContent.length;
        out.push({ day: p.getAttribute('data-jr-day'), pageStart: start, at: at, end: at + len,
          wet: n.nodeType === 1 ? parseFloat(n.style.getPropertyValue('--jr-wet')) : 100,
          span: n.nodeType === 1 ? n.className : null });
        at += len;
      });
    });
    return out;
  };
  const KEY_CODES = { ArrowRight: [39, 'ArrowRight'], ArrowLeft: [37, 'ArrowLeft'], Escape: [27, 'Escape'], ' ': [32, 'Space'] };
  const keyDown = async (page, k) => {
    const [vk, code] = KEY_CODES[k];
    await page.session.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, text: k === ' ' ? ' ' : undefined });
    await page.session.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
  };
  const press = async (page, k) => {
    await keyDown(page, k);
    await page.waitFor(SETTLED, { message: 'the book settling after ' + k });
  };
  const openJourney = async ({ db, viewport = [1280, 900], fullSpeed = false } = {}) => {
    const page = await open('index.html', { db, viewport });
    await page.waitFor(function () { return !!document.getElementById('nw-btn'); }, { message: 'the notes widget' });
    if (!fullSpeed) {
      await page.session.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    }
    return page;
  };
  const showJourney = async page => {
    await page.evaluate(OPEN_JOURNEY);
    await page.waitFor(JOURNEY_READY, { message: 'the book open and cut' });
  };
  // Turns forward to the last page, recording every view on the way.
  const readBook = async page => {
    const views = [];
    for (let i = 0; i < 60; i++) {
      const view = await page.evaluate(VIEW);
      views.push({ view, pages: await page.evaluate(SHOWN), inks: await page.evaluate(INKS) });
      await press(page, 'ArrowRight');
      if (await page.evaluate(VIEW) === view) return views;
    }
    throw new Error('the book never ended');
  };
  const dayPages = views => views.flatMap(v => v.pages).filter(p => p.kind === 'day');
  const norm = s => String(s).replace(/\s+/g, ' ').trim();

  await t.test('JOURNEY: the Journal tab opens the book full screen on its title page, and writes nothing anywhere', async () => {
    const page = await openJourney({ db: JOURNEY_SEED() });
    const raw = await page.evaluate(READ_RAW);
    const keys = await page.evaluate(KEYS_IN);
    await page.evaluate(function () {
      document.getElementById('nw-btn').click();
      document.querySelector('[data-nw-tab="date"]').click();
      return true;
    });
    const count = await page.evaluate(function () {
      var c = document.querySelector('[data-nw-journey-count]');
      return c ? [c.getAttribute('data-nw-journey-count'), c.textContent] : null;
    });
    assert.deepEqual(count, ['3', '3 Eternal days'], 'the Journal tab says how many days the book holds');
    await showJourney(page);
    const first = await page.evaluate(function () {
      var r = document.getElementById('nw-journey'), b = r.getBoundingClientRect();
      var hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      return {
        rect: [b.left, b.top, b.right, b.bottom].map(Math.round), vw: innerWidth, vh: innerHeight,
        onTop: r.contains(hit), mode: r.getAttribute('data-jr-mode'),
        locked: document.documentElement.classList.contains('nw-journey-open') && getComputedStyle(document.body).overflow === 'hidden'
      };
    });
    assert.deepEqual(first.rect, [0, 0, first.vw, first.vh], 'it covers the whole screen');
    assert.equal(first.onTop, true, 'above the page and the notes panel');
    assert.equal(first.locked, true, 'and the page behind does not scroll');
    assert.equal(first.mode, 'spread', 'a desktop opens the book flat');
    const shown = await page.evaluate(SHOWN);
    assert.deepEqual(shown.map(p => p.kind), ['endpaper', 'title'], 'like a real book: the inside cover, then the title page');
    assert.equal(shown[1].title, 'To myself, For myself, The Finest of FIn', 'the user\'s title, verbatim');

    await press(page, 'ArrowRight');
    await press(page, 'ArrowRight');
    await press(page, 'ArrowLeft');
    await page.evaluate(function () { document.querySelector('[data-jr-close]').click(); return true; });
    await page.waitFor(function () { return !document.getElementById('nw-journey'); }, { message: 'the book closing' });
    await sleep(400);
    assert.equal(await page.evaluate(READ_RAW), raw, 'track_db is byte-identical: the book only reads');
    assert.deepEqual(await page.evaluate(KEYS_IN), keys, 'and it left no key of its own — not even a page to reopen at');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('JOURNEY: only Eternal days are bound, oldest first, each starting a fresh page under its "Weekday dd/mm/yyyy"', async () => {
    const page = await openJourney({ db: JOURNEY_SEED() });
    await showJourney(page);
    const pages = dayPages(await readBook(page));
    const headed = pages.filter(p => p.date !== null);
    assert.deepEqual(headed.map(p => [p.day, p.date]), Object.keys(JOURNEY_DAYS).map(d => [d, JOURNEY_DAYS[d]]),
      'every Eternal day once, oldest first, headed in the user\'s format');
    headed.forEach(p => assert.equal(p.headFirst, true, p.day + '\'s heading is the first thing on its page'));
    const seen = new Set();
    pages.forEach(p => {
      if (!seen.has(p.day)) assert.notEqual(p.date, null, p.day + ' begins on a page of its own, under its heading');
      else assert.equal(p.date, null, p.day + ' is headed once');
      seen.add(p.day);
    });
    const all = pages.map(p => p.text).join(' ');
    assert.equal(/Cleared, so never bound|Unclear, so never bound/.test(all), false, 'a cleared or unclear day is not in the book');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('JOURNEY: a long day runs over pages that rejoin to its words, none overflows, and the next day starts a fresh page', async () => {
    const page = await openJourney({ db: JOURNEY_SEED() });
    await showJourney(page);
    const pages = dayPages(await readBook(page));
    const long = pages.filter(p => p.day === '2026-03-04');
    assert.ok(long.length >= 2, 'the long day runs over ' + long.length + ' pages');
    assert.equal(norm(long.map(p => p.text).join(' ')), norm(JOURNEY_LONG), 'its pages hold its words, every one, in order');
    pages.forEach((p, i) => assert.ok(p.over <= 0, 'page ' + i + ' (' + p.day + ') does not overflow: ' + p.over));
    const next = pages[pages.indexOf(long[long.length - 1]) + 1];
    assert.deepEqual([next.day, next.date, next.headFirst], ['2026-03-06', JOURNEY_DAYS['2026-03-06'], true],
      'the day after it starts a fresh page');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('JOURNEY: read only, and only a turned sheet moves it — keys, wheel and a drag turn one page, a short drag falls back', async () => {
    const page = await openJourney({ db: JOURNEY_SEED(), fullSpeed: true });
    const raw = await page.evaluate(READ_RAW);
    await showJourney(page);
    const still = await page.evaluate(function () {
      var r = document.getElementById('nw-journey');
      return {
        fields: r.querySelectorAll('textarea, input, select, [contenteditable]').length,
        scrollers: Array.prototype.filter.call(r.querySelectorAll('*'), function (e) {
          var o = getComputedStyle(e).overflowY;
          return (o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight;
        }).length
      };
    });
    assert.deepEqual(still, { fields: 0, scrollers: 0 }, 'nothing to type into and nothing that scrolls');

    // A key turns one sheet — and it is seen turning, not swapped.
    await keyDown(page, 'ArrowRight');
    assert.equal(await page.evaluate(function () { return document.getElementById('nw-journey').getAttribute('data-jr-flipping'); }),
      'next', 'the sheet is mid-turn');
    await page.waitFor(SETTLED, { message: 'the turn ending' });
    assert.equal(await page.evaluate(VIEW), '1');

    // A wheel gesture — three quick ticks — turns exactly one sheet.
    const box = await page.evaluate(function () {
      var b = document.querySelector('.jr-book').getBoundingClientRect();
      return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height };
    });
    const scrollBefore = await page.evaluate(function () { return document.scrollingElement.scrollTop; });
    for (let i = 0; i < 3; i++) {
      await page.session.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: box.l + box.w / 2, y: box.t + box.h / 2, deltaX: 0, deltaY: 120 });
    }
    await sleep(80);
    await page.waitFor(SETTLED, { message: 'the wheel turn ending' });
    await sleep(350);
    assert.equal(await page.evaluate(VIEW), '2', 'one gesture, one page');
    assert.equal(await page.evaluate(function () { return document.scrollingElement.scrollTop; }), scrollBefore, 'and nothing scrolled');

    // A drag from the right page's corner, well past a quarter turn, turns it.
    const mouse = (type, x, y, buttons) => page.session.send('Input.dispatchMouseEvent',
      { type, x, y, button: 'left', buttons, clickCount: 1 });
    await mouse('mouseMoved', box.r - 14, box.b - 14, 0);
    await mouse('mousePressed', box.r - 14, box.b - 14, 1);
    for (let k = 1; k <= 10; k++) { await mouse('mouseMoved', box.r - 14 - k * box.w * 0.035, box.b - 14 - k * 3, 1); await sleep(20); }
    await mouse('mouseReleased', box.r - 14 - box.w * 0.35, box.b - 44, 0);
    await page.waitFor(SETTLED, { message: 'the dragged sheet landing' });
    assert.equal(await page.evaluate(VIEW), '3', 'the dragged sheet turned');

    // A short, slow drag lets go before a quarter turn: the sheet falls back.
    const y = box.t + box.h / 2;
    await mouse('mouseMoved', box.r - 14, y, 0);
    await mouse('mousePressed', box.r - 14, y, 1);
    for (let k = 1; k <= 6; k++) { await mouse('mouseMoved', box.r - 14 - k * 6, y, 1); await sleep(60); }
    await sleep(150);
    await mouse('mouseReleased', box.r - 50, y, 0);
    await page.waitFor(SETTLED, { message: 'the let-go sheet settling' });
    assert.equal(await page.evaluate(VIEW), '3', 'it fell back: the page did not change');
    assert.equal(await page.evaluate(READ_RAW), raw, 'and nothing was written');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('JOURNEY PHONE: one page at a time filling the screen — a swipe turns it, a tap on the left goes back, ✕ is a finger target', async () => {
    const page = await openJourney({ db: JOURNEY_SEED(), viewport: PHONE });
    await showJourney(page);
    const geo = await page.evaluate(function () {
      var r = document.getElementById('nw-journey'), x = r.querySelector('[data-jr-close]').getBoundingClientRect();
      var p = r.querySelector('[data-jr-slot] > [data-jr-kind]').getBoundingClientRect();
      return { mode: r.getAttribute('data-jr-mode'), vw: document.documentElement.clientWidth, vh: innerHeight,
        sw: document.documentElement.scrollWidth, page: [p.left, p.right, p.top, p.bottom].map(Math.round),
        x: [x.left, x.top, x.right, x.bottom, x.width, x.height].map(Math.round) };
    });
    assert.equal(geo.mode, 'single', 'a phone shows one page at a time');
    assert.ok(geo.page[1] - geo.page[0] >= geo.vw * 0.9 && geo.page[3] - geo.page[2] >= geo.vh * 0.9,
      'and that page fills the screen: ' + geo.page + ' in ' + geo.vw + 'x' + geo.vh);
    assert.ok(geo.x[4] >= 44 && geo.x[5] >= 44 && geo.x[0] >= 0 && geo.x[2] <= geo.vw, '✕ is a 44px target on screen: ' + geo.x);
    assert.ok(geo.sw <= geo.vw, 'nothing scrolls sideways');
    assert.deepEqual((await page.evaluate(SHOWN)).map(p => p.kind), ['title'], 'it opens on the title page');

    const touch = (type, x, yy) => page.session.send('Input.dispatchTouchEvent',
      { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: yy }] });
    await touch('touchStart', geo.vw * 0.85, geo.vh * 0.6);
    for (let k = 1; k <= 10; k++) { await touch('touchMove', geo.vw * (0.85 - k * 0.075), geo.vh * 0.6); await sleep(16); }
    await touch('touchEnd');
    await page.waitFor(SETTLED, { message: 'the swipe landing' });
    const turned = await page.evaluate(SHOWN);
    assert.deepEqual(turned.map(p => [p.kind, p.date]), [['day', JOURNEY_DAYS['2026-03-02']]], 'a swipe turned to the first day');

    await touch('touchStart', geo.vw * 0.12, geo.vh * 0.5);
    await touch('touchEnd');
    await page.waitFor(SETTLED, { message: 'the tap turn landing' });
    assert.deepEqual((await page.evaluate(SHOWN)).map(p => p.kind), ['title'], 'a tap on the left turned back');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('JOURNEY: Escape and ✕ close it — focus goes back to the Journey button, the Journal stays open, the page scrolls again', async () => {
    const page = await openJourney({ db: JOURNEY_SEED() });
    const AFTER = function () {
      var a = document.activeElement;
      return {
        open: !!document.getElementById('nw-journey'),
        lock: document.documentElement.classList.contains('nw-journey-open'),
        focus: !!a && a.hasAttribute('data-nw-journey-open'),
        journal: document.getElementById('nw-panel').style.display === 'flex' && !!document.querySelector('[data-nw-journey-open]')
      };
    };
    await showJourney(page);
    await keyDown(page, 'Escape');
    await page.waitFor(function () { return !document.getElementById('nw-journey'); }, { message: 'Escape closing the book' });
    assert.deepEqual(await page.evaluate(AFTER), { open: false, lock: false, focus: true, journal: true }, 'Escape');
    await showJourney(page);
    await page.evaluate(function () { document.querySelector('[data-jr-close]').click(); return true; });
    await page.waitFor(function () { return !document.getElementById('nw-journey'); }, { message: '✕ closing the book' });
    assert.deepEqual(await page.evaluate(AFTER), { open: false, lock: false, focus: true, journal: true }, '✕');
    assert.notEqual(await page.evaluate(function () { return getComputedStyle(document.body).overflowY; }), 'hidden');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('JOURNEY: a day made Eternal in another tab is bound into the open book without reopening it', async () => {
    const a = await openJourney({ db: JOURNEY_SEED() });
    let b = null;
    try {
      await showJourney(a);
      b = await open('index.html', { fresh: false });
      await b.waitFor(function () { return !!window.TrackStorage; }, { message: 'the second tab' });
      const map = await b.evaluate(function () { return JSON.parse(localStorage.getItem('track_db')).slots[0].dateNotes; });
      map['2026-03-08'] = { content: 'Bound while the book was open.', createdAt: 1, updatedAt: 1, tag: 'eternal' };
      assert.equal(await b.evaluate(WRITE_SLOT_KEY, 'dateNotes', map), true, 'the other tab wrote it');
      await a.waitFor(function () { return (localStorage.getItem('track_db') || '').indexOf('Bound while the book was open.') >= 0; },
        { message: 'the write landing in the first tab' });
      await sleep(500);
      // Opening the second tab hid the first, and a hidden tab runs no
      // animation frames: its turns would never land. Bring it back to the
      // front, as the reader would, before turning its pages.
      await a.session.send('Page.bringToFront');
      await a.waitFor(function () { return document.visibilityState === 'visible'; }, { message: 'the book\'s tab in front' });
      const headed = dayPages(await readBook(a)).filter(p => p.date !== null);
      assert.deepEqual(headed.map(p => p.date), Object.values(JOURNEY_DAYS).concat(['Sunday 08/03/2026']),
        'the new Eternal day is bound, in its place, without reopening');
      assert.deepEqual(realErrors(a), []);
    } finally {
      await a.close();
      if (b) await b.close();
    }
  });

  await t.test('JOURNEY: with no Eternal day the title page is followed by the page saying how to bind one', async () => {
    const page = await openJourney({ db: JOURNEY_SEED({ dateNotes: {
      '2026-03-05': F.dateNote('Cleared, so never bound.', F.localTs(2026, 3, 5), { tag: 'cleared' }),
      '2026-03-07': F.dateNote('Unclear, so never bound.', F.localTs(2026, 3, 7))
    } }) });
    await page.evaluate(function () {
      document.getElementById('nw-btn').click();
      document.querySelector('[data-nw-tab="date"]').click();
      return true;
    });
    assert.equal(await page.evaluate(function () {
      return document.querySelector('[data-nw-journey-count]').getAttribute('data-nw-journey-count');
    }), '0');
    await showJourney(page);
    assert.deepEqual((await page.evaluate(SHOWN)).map(p => p.kind), ['endpaper', 'title']);
    await press(page, 'ArrowRight');
    const next = await page.evaluate(SHOWN);
    assert.deepEqual(next.map(p => p.kind), ['empty', 'blank']);
    assert.match(norm(next[0].text), /Mark a Journal day ∞ Eternal, and it is written into this book\./);
    await press(page, 'ArrowRight');
    assert.equal(await page.evaluate(VIEW), '1', 'and that is the end of the book');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('JOURNEY: turning the screen re-cuts the pages and keeps the reader on the same passage', async () => {
    const page = await openJourney({ db: JOURNEY_SEED() });
    await showJourney(page);
    const LEFTMOST = function () {
      var p = document.querySelector('#nw-journey [data-jr-slot] > [data-jr-kind="day"]');
      return p ? { day: p.getAttribute('data-jr-day'), start: +p.getAttribute('data-jr-start'), end: +p.getAttribute('data-jr-end') } : null;
    };
    for (let i = 0; i < 3; i++) await press(page, 'ArrowRight');
    const before = await page.evaluate(LEFTMOST);
    assert.equal(before.day, '2026-03-04', 'reading inside the long day');
    assert.ok(before.start > 0, 'past its first page');
    const inkBefore = await page.evaluate(INKS);
    // A desktop window becoming a phone: one page instead of two, cut afresh.
    await page.setViewport(...PHONE);
    await page.waitFor(function () { var r = document.getElementById('nw-journey'); return r && r.getAttribute('data-jr-mode') === 'single'; },
      { message: 'the book re-laid out for a phone' });
    await page.waitFor(SETTLED, { message: 'the book settling' });
    await sleep(200);
    const after = await page.evaluate(LEFTMOST);
    assert.ok(after, 'a day page lies open after the re-cut, not the title page');
    assert.equal(after.day, before.day, 'still the same day');
    assert.ok(after.start <= before.start && before.start < after.end,
      'the page shown holds the passage that was being read: ' + JSON.stringify({ before, after }));
    const over = await page.evaluate(SHOWN);
    over.forEach(p => assert.ok(p.over <= 0, 'and the new page does not overflow: ' + p.over));
    // The ink is the day's, not the page's: words a re-cut moved to another
    // page are written in the ink they were written in before.
    const inkAfter = await page.evaluate(INKS);
    let shared = 0;
    inkAfter.forEach(a => inkBefore.forEach(b => {
      if (a.day !== b.day || Math.max(a.at, b.at) >= Math.min(a.end, b.end)) return;
      shared++;
      assert.equal(a.wet, b.wet, 'the same words in the same ink after the re-cut, at ' + Math.max(a.at, b.at));
    }));
    assert.ok(shared > 0, 'the page after the re-cut shares words with the pages before it');
    assert.ok(inkAfter.some(s => s.wet < 100), 'and its quill still runs dry somewhere');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('JOURNEY PHONE: a Thai day is cut between words — no page starts with a vowel or tone mark torn from its letter', async () => {
    const page = await openJourney({ viewport: PHONE, db: JOURNEY_SEED({ dateNotes: {
      '2026-03-03': F.dateNote(JOURNEY_THAI, F.localTs(2026, 3, 3), { tag: 'eternal' })
    } }) });
    await showJourney(page);
    const views = await readBook(page);
    const pages = dayPages(views);
    assert.ok(pages.length >= 2, 'the Thai day runs over ' + pages.length + ' pages');
    assert.equal(pages.map(p => p.text).join(''), JOURNEY_THAI, 'its pages rejoin exactly: no space was there to drop');
    const MARKS = [0x0e31, 0x0e33, 0x0e34, 0x0e35, 0x0e36, 0x0e37, 0x0e38, 0x0e39, 0x0e3a,
      0x0e47, 0x0e48, 0x0e49, 0x0e4a, 0x0e4b, 0x0e4c, 0x0e4d, 0x0e4e];
    // Word boundaries from this browser's own dictionary, as the book used them.
    const words = await page.evaluate(function (s) {
      return Array.from(new Intl.Segmenter('th', { granularity: 'word' }).segment(s), function (x) { return x.index; });
    }, JOURNEY_THAI);
    let at = 0;
    pages.forEach((p, i) => {
      assert.equal(MARKS.includes(p.text.charCodeAt(0)), false, 'page ' + i + ' starts on a letter: ' + p.text.slice(0, 6));
      assert.ok(words.includes(at), 'page ' + i + ' starts between two words, at ' + at + ': ' + p.text.slice(0, 6));
      assert.ok(p.over <= 0, 'page ' + i + ' does not overflow');
      at += p.text.length;
    });
    // The quill runs dry in Thai too, and never in the middle of a word.
    const ink = views.flatMap(v => v.inks).filter(s => s.day === '2026-03-03');
    assert.ok(ink.some(s => s.wet < 100), 'the Thai hand fades and darkens like any other');
    ink.forEach(s => {
      if (s.at !== s.pageStart) assert.ok(words.includes(s.at), 'a change of ink falls between two words, at ' + s.at + ': ' + JOURNEY_THAI.slice(s.at, s.at + 6));
    });
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('JOURNEY: the writing is inked into the paper — the hand on the lettering, the line on the rules, each day in its own quill dips', async () => {
    const page = await openJourney({ db: JOURNEY_SEED() });
    await showJourney(page);
    // Both inks live in the book: a CSS filter can name only an element of its own document.
    const well = await page.evaluate(function () {
      var r = document.getElementById('nw-journey');
      return ['jr-ink', 'jr-ink-line'].map(function (id) {
        var f = document.getElementById(id);
        return [id, f instanceof SVGFilterElement && r.contains(f), f ? f.querySelectorAll('feTurbulence').length > 0 : false];
      });
    });
    assert.deepEqual(well, [['jr-ink', true, true], ['jr-ink-line', true, true]], 'both inks are SVG filters inside the book');
    const INKED = function (sel, pseudo) {
      var e = document.querySelector('#nw-journey [data-jr-slot] ' + sel);
      if (!e) return null;
      var cs = getComputedStyle(e, pseudo || null);
      return [cs.filter, cs.mixBlendMode];
    };
    const HAND = ['url("#jr-ink")', 'multiply'], LINE = ['url("#jr-ink-line")', 'multiply'];
    assert.deepEqual(await page.evaluate(INKED, '.jr-title'), HAND, 'the title is written by hand, into the paper');
    assert.deepEqual(await page.evaluate(INKED, '.jr-title-page', '::before'), LINE, 'its frame is ruled in the line\'s ink');
    assert.deepEqual(await page.evaluate(INKED, '.jr-orn-top'), LINE, 'and so is its flourish');

    await press(page, 'ArrowRight');
    for (const sel of ['.jr-date', '.jr-body', '.jr-folio']) {
      assert.deepEqual(await page.evaluate(INKED, sel), HAND, sel + ' is written by hand');
    }
    assert.deepEqual(await page.evaluate(INKED, '.jr-rule'), LINE, 'the rule under a date is ruled, not written — the hand\'s cut would dash it');

    // The shades of a turning sheet are layers of their own: drawn with the
    // pages, every frame of a turn repainted the inked page beneath them.
    const box = await page.evaluate(function () { var b = document.querySelector('.jr-book').getBoundingClientRect(); return { r: b.right, b: b.bottom }; });
    const mouse = (type, x, y, buttons) => page.session.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 });
    await mouse('mousePressed', box.r - 14, box.b - 14, 1);
    for (let k = 1; k <= 5; k++) { await mouse('mouseMoved', box.r - 14 - k * 12, box.b - 14 - k * 2, 1); await sleep(20); }
    const shades = await page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll('#nw-journey .jr-shade'), function (s) { return getComputedStyle(s).willChange; });
    });
    for (let k = 4; k >= 0; k--) { await mouse('mouseMoved', box.r - 14 - k * 12, box.b - 14 - k * 2, 1); await sleep(20); }
    await mouse('mouseReleased', box.r - 14, box.b - 14, 0);
    await page.waitFor(SETTLED, { message: 'the held sheet falling back' });
    assert.equal(shades.length, 3, 'a sheet was held mid-turn, with its three shades');
    shades.forEach(w => assert.match(w, /transform/, 'each shade is a layer of its own'));
    // A thinning stretch is drawn lighter than the full ink.
    const tones = await page.evaluate(function () {
      function lum(c) {
        var n = (c.match(/[\d.]+/g) || []).map(Number), k = /^color\(srgb/.test(c) ? 1 : 1 / 255;
        return 0.2126 * n[0] * k + 0.7152 * n[1] * k + 0.0722 * n[2] * k;
      }
      var b = document.querySelector('#nw-journey [data-jr-slot] [data-jr-day="2026-03-04"] [data-jr-body]');
      return { body: lum(getComputedStyle(b).color),
        dips: Array.prototype.map.call(b.querySelectorAll('.jr-dip'), function (s) { return lum(getComputedStyle(s).color); }) };
    });

    // Quill dips: every page draws its day's own runs, keyed by the DAY, and
    // a change of ink falls between words.
    const views = await readBook(page);
    const long = views.flatMap(v => v.inks).filter(s => s.day === '2026-03-04');
    const runs = await page.evaluate(function (text) { return TrackJourney.inkRuns(text, '2026-03-04'); }, JOURNEY_LONG);
    assert.ok(long.some(s => s.wet < 100) && long.some(s => s.wet === 100), 'the quill runs dry and is dipped again');
    long.forEach(s => {
      const r = runs.find(x => x.start <= s.at && s.end <= x.end);
      assert.ok(r, 'the stretch at ' + s.at + ' lies inside one of the day\'s runs');
      assert.equal(s.wet, Math.round(r.ink * 100), 'and is drawn in that run\'s ink, at ' + s.at);
      assert.equal(s.span, s.wet < 100 ? 'jr-dip' : null, 'a stretch is a span exactly when its ink runs thin, at ' + s.at);
      if (s.at !== s.pageStart) assert.match(JOURNEY_LONG.charAt(s.at), /\s/, 'a change of ink falls between words, at ' + s.at);
    });
    assert.equal(long.find(s => s.at === 0).wet, 100, 'the day begins fresh from the well, under its red initial');
    assert.ok(tones.dips.length > 0, 'the long day\'s first page holds thinning stretches');
    tones.dips.forEach(l => assert.ok(l > tones.body, 'a thinning stretch is lighter than the full ink: ' + l + ' > ' + tones.body));
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  // ── 17. The phone interface ───────────────────────────────────────────────
  /* Every case here runs at 390x844 with touch, set BEFORE goto (see open()).

     WHAT "NOT CROPPED" MEANS, and why it takes two assertions rather than one.
     `body.app-page { overflow-x: hidden }` propagates to the viewport, which
     makes the viewport a clipping scroll container. That container is still a
     scroll container, so content overflowing RIGHT still enters its scrollable
     overflow region and documentElement.scrollWidth still grows — that half of
     the check is real. It is blind to the other half: the scrollable overflow
     region is clamped at the padding-box origin, so anything pushed off the
     LEFT contributes nothing and scrollWidth reports a tidy 390 for a page the
     user cannot read. That is precisely the "left-cropped" shape this whole
     change exists to fix, so a single scrollWidth assertion would pass on the
     bug it is named for. The sweep below is the second half.

     The sweep is scoped to `#root *` deliberately. index.html's .cal-panel and
     .quest-panel are full-bleed by design (`margin-inline: calc(50% - 50vw)`,
     documented at styles.css:1567) and escape the viewport on purpose; a sweep
     that included them would fail on a feature. index.html has no #root, so
     scoping to it excludes the Home page structurally rather than by exception.

     And `document.body` is skipped when looking for an element's clipper:
     getComputedStyle reports its COMPUTED `hidden`, but its USED value is
     `visible` because the value was propagated to the viewport. Counting body
     as a deliberate clipper would make every escapee "intentional" and the
     whole assertion vacuous. */

  const NOT_CROPPED = function () {
    var de = document.documentElement;
    var vw = de.clientWidth;

    /* An element outside the viewport is fine if the user can still REACH it
       (an ancestor scrolls) or if someone clipped it on purpose. Walk up to the
       first ancestor whose overflow-x is not `visible`:
         auto | scroll -> reachable by scrolling (the week grid, the headers)
         hidden | clip -> a deliberate local clip (truncation)
         neither       -> the VIEWPORT is the clipper, and that is the bug. */
    function clipperOf(el) {
      for (var p = el.parentElement; p; p = p.parentElement) {
        if (p === de || p === document.body) break;
        var ox = getComputedStyle(p).overflowX;
        if (ox !== 'visible') return ox;
      }
      return 'viewport';
    }

    var escaped = [], all = document.querySelectorAll('#root *');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (!el.getClientRects().length) continue;
      var r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.left >= -1 && r.right <= vw + 1) continue;
      if (clipperOf(el) !== 'viewport') continue;
      escaped.push(el.tagName.toLowerCase()
        + (el.className && el.className.baseVal === undefined
            ? '.' + String(el.className).trim().split(/\s+/).slice(0, 3).join('.') : '')
        + ' [' + Math.round(r.left) + '…' + Math.round(r.right) + ']');
    }
    return {
      vw: vw, scrollWidth: de.scrollWidth, clientWidth: de.clientWidth,
      escaped: escaped.slice(0, 8), escapedCount: escaped.length
    };
  };

  /* Every tab must be reachable by a TAP, not merely present in the DOM. A
     bar that renders under the notes FAB, or whose buttons are 6px tall, would
     satisfy a querySelectorAll count and fail a finger. elementFromPoint at the
     centre is what a finger actually resolves to. */
  const TABBAR = function () {
    var bar = document.querySelector('.track-tabbar');
    if (!bar) return { bar: null };
    var br = bar.getBoundingClientRect();
    var shell = document.querySelector('#root > div');
    var tabs = Array.prototype.map.call(bar.querySelectorAll('[data-tabbar-tab]'), function (b) {
      var r = b.getBoundingClientRect();
      var hit = document.elementFromPoint(Math.round(r.left + r.width / 2),
                                          Math.round(r.top + r.height / 2));
      return {
        tab: b.dataset.tabbarTab,
        h: Math.round(r.height),
        hit: hit === b ? 'self' : (b.contains(hit) ? 'child'
             : (hit ? hit.tagName.toLowerCase() + '.' + String(hit.className).trim().split(/\s+/)[0] : 'null'))
      };
    });
    return {
      bar: bar.dataset.tabbar,
      barTop: Math.round(br.top), barH: Math.round(br.height),
      vh: document.documentElement.clientHeight,
      shellPadBottom: shell ? getComputedStyle(shell).paddingBottom : null,
      barHeightCss: getComputedStyle(bar).height,
      tabs: tabs
    };
  };

  /* One case per page, never one loop with four iterations. A rule forgotten at
     one of several surfaces is this repository's recurring bug, and a shared
     loop reports the first failure and stops — letting three surfaces hide
     behind one. The data-tabbar VALUE is what makes the four failure sets
     disjoint: both sir-ks02.html and true-storage.html carry `ks02-page`, so a
     case that only asserted "a .track-tabbar exists" would pass on the other
     page's markup. */
  const phoneCase = (file, tabbar, tabs) =>
    t.test('PHONE/' + tabbar.toUpperCase() + ': not cropped, and every tab is reachable by tap', async () => {
      const page = await open(file, { db: seedDb(), viewport: PHONE });
      await page.waitFor(function () {
        var r = document.getElementById('root');
        return !!r && r.children.length > 0;
      }, { message: file + ' mounting at a phone width' });

      // the claim this case is NAMED for, first
      const m = await page.evaluate(NOT_CROPPED);
      assert.equal(m.scrollWidth, m.clientWidth,
        file + ' overflows to the RIGHT at ' + m.vw + 'px (scrollWidth ' + m.scrollWidth + ')');
      assert.deepEqual(m.escaped, [],
        file + ' has ' + m.escapedCount + ' element(s) outside the viewport that nothing scrolls '
        + 'and nothing deliberately clips — the viewport is the clipper, which is a crop');

      const b = await page.evaluate(TABBAR);
      assert.equal(b.bar, tabbar, 'this page renders ITS OWN bar, not a sibling page\'s');
      assert.deepEqual(b.tabs.map(x => x.tab), tabs);
      for (const tab of b.tabs) {
        assert.ok(tab.h >= 44, tabbar + ' tab "' + tab.tab + '" is ' + tab.h + 'px tall, under the 44px target');
        assert.ok(tab.hit === 'self' || tab.hit === 'child',
          tabbar + ' tab "' + tab.tab + '" is covered by ' + tab.hit + ' — present but untappable');
      }

      /* The mechanism, not just the result: the shell reserves exactly the
         bar's height. Asserting the two numbers are EQUAL is what fails if
         --phone-tabbar-h is dropped from one side, which a visual check at one
         viewport height would not catch. */
      assert.equal(b.shellPadBottom, b.barHeightCss,
        'the shell reserves ' + b.shellPadBottom + ' for a bar that is ' + b.barHeightCss
        + ' tall — content will sit under the bar');
      assert.equal(b.barTop + b.barH, b.vh, 'the bar sits on the bottom edge');

      assert.deepEqual(realErrors(page), []);
      await page.close();
    });

  await phoneCase('progress.html', 'progress',
    ['progress', 'milestones', 'quest', 'schedule', 'actions', 'mindmaps', 'mg', 'home']);
  await phoneCase('documentations.html', 'documentations', ['pages', 'add', 'home']);
  await phoneCase('sir-ks02.html', 'ks02',
    ['calendar', 'ks02', 'mg', 'ks03', 'kolb', 'srch', 'home']);
  await phoneCase('true-storage.html', 'true-storage', ['multiverse', 'sourcedump', 'tree', 'home']);

  await t.test('PHONE/TRUE-STORAGE: the SOURCE DUMP tab is not cropped on a leaf', async () => {
    /* The bar case above measures the default tab, the canvas. The copy of
       KS02's page is a different layout — a breadcrumb, MM cards with inline
       forms and storage chips — so it is measured on its own, on a leaf, where
       the most is drawn. */
    const page = await open('true-storage.html', {
      db: tagSeed(), hash: withQuery('?dump=d-1', '#sourcedump'), viewport: PHONE
    });
    await page.waitFor(function () { return !!document.querySelector('[data-dump-mm="11"]'); },
      { message: 'the leaf at a phone width' });
    const m = await page.evaluate(NOT_CROPPED);
    assert.equal(m.scrollWidth, m.clientWidth,
      'the SOURCE DUMP tab overflows to the RIGHT at ' + m.vw + 'px (scrollWidth ' + m.scrollWidth + ')');
    assert.deepEqual(m.escaped, [],
      m.escapedCount + ' element(s) on the SOURCE DUMP tab sit outside the viewport with nothing to scroll them');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('PHONE/PROGRESS: the schedule opens in DAY mode, and an explicit WEEK survives', async () => {
    /* DAY is the whole reason this page stopped being cropped: week mode applies
       TOTAL_W (56 + 7 x 140 = 1036px), and a 390px screen showed four of the
       seven columns with no way to reach the rest.

       The second half is the one that could regress quietly. timelineMode reads
       phoneNow() from a LAZY INITIALIZER, so it is a one-shot read at mount;
       wiring the live useIsPhone() hook in instead would look identical here
       and then overwrite a WEEK the user had just chosen, on the next rotation. */
    const page = await open('progress.html', { db: seedDb(), hash: '#schedule', viewport: PHONE });
    await page.waitFor(function () { return !!document.querySelector('[data-sched-nav]'); },
      { message: 'the schedule nav bar' });

    assert.equal(await page.evaluate(function () {
      return document.querySelector('[data-sched-nav]').dataset.timelineMode;
    }), 'day', 'a phone opens the schedule in DAY mode');

    // choose WEEK by hand, then change the viewport under it
    await page.evaluate(function () {
      var b = Array.prototype.find.call(document.querySelectorAll('[data-sched-nav] button'),
        function (x) { return x.textContent.trim() === 'WEEK'; });
      b.click();
      return true;
    });
    // wait for the WRITE to land, then assert — never wait for the right answer
    await page.waitFor(function () {
      return document.querySelector('[data-sched-nav]').dataset.timelineMode === 'week';
    }, { message: 'WEEK being applied' });

    await page.setViewport(720, 844, { mobile: true, deviceScaleFactor: 3, touch: true });
    await page.setViewport(...PHONE);
    await sleep(120);
    assert.equal(await page.evaluate(function () {
      return document.querySelector('[data-sched-nav]').dataset.timelineMode;
    }), 'week', 'a viewport change must NOT overwrite a mode the user chose by hand');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('PHONE/PROGRESS: the goal detail shows ONE pane at a time, and UNMOUNTS the other', async () => {
    /* The second of the two 65/35 splits, and the one that is deliberately NOT
       handled the same way as the schedule's. GoalProgressPanel has no
       useEffect at all and GoalNode holds no mount-once listener, so these
       panes are unmounted rather than hidden — and the `inDom` assertion below
       is what makes that a decision rather than an accident. A future change
       that "made the two splits uniform" would have to break either this case
       or the schedule's; it cannot satisfy both. */
    const page = await open('progress.html', { db: seedDb(), viewport: PHONE });
    await page.waitFor(function () { return !!document.querySelector('[data-goal-split]'); },
      { message: 'the goal detail split' });

    const read = function () {
      var sw = document.querySelector('[data-goal-switch]');
      var tasks = document.querySelector('[data-goal-pane="tasks"]');
      var prog = document.querySelector('[data-goal-pane="progress"]');
      var split = document.querySelector('[data-goal-split]');
      return {
        switcher: !!sw,
        stacked: split ? getComputedStyle(split).flexDirection : null,
        inDom: { tasks: !!tasks, progress: !!prog },
        width: {
          tasks: tasks ? Math.round(tasks.getBoundingClientRect().width) : null,
          progress: prog ? Math.round(prog.getBoundingClientRect().width) : null
        }
      };
    };

    const a = await page.evaluate(read);
    assert.equal(a.switcher, true, 'a phone offers the TASKS/PROGRESSION switcher');
    assert.equal(a.stacked, 'column', 'and the split stacks rather than sitting side by side');
    assert.deepEqual(a.inDom, { tasks: true, progress: false },
      'only the shown pane is mounted — the opposite of the schedule split, on purpose');
    assert.equal(a.width.tasks, 390,
      'the task tree takes the whole width, not 65% of it (' + a.width.tasks + 'px)');

    await page.evaluate(function () {
      document.querySelector('[data-goal-pane-btn="progress"]').click(); return true;
    });
    await page.waitFor(function () {
      return !!document.querySelector('[data-goal-pane="progress"]');
    }, { message: 'the PROGRESSION pane' });

    const b = await page.evaluate(read);
    assert.deepEqual(b.inDom, { tasks: false, progress: true }, 'switching swaps which is mounted');
    assert.equal(b.width.progress, 390,
      'and it also takes the whole width, not 35% (' + b.width.progress + 'px)');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('PHONE/PROGRESS: day mode shows ONE pane at a time, full width, and keeps the other alive', async () => {
    /* A separate case from the DAY-default one above, deliberately: these are
       two independent doors to the same feature and a shared case would let one
       hide behind the other. The crop and tab-reachability assertions in the
       PHONE/PROGRESS case cannot see this at all — 65% + 35% still sums to 100%,
       so a reverted switcher produces a 253px timeline beside a 136px matrix,
       which is unusable and not technically an overflow.

       "Keeps the other alive" is the half that is easy to get wrong and
       impossible to see: the hidden pane must still be IN THE DOM. Two
       useEffect(…, []) in SchedulePanel bind to containerRef and never re-run,
       so unmounting the timeline once leaves the Shift+wheel day navigation
       attached to a dead node for the rest of the session, silently. */
    const page = await open('progress.html', { db: seedDb(), hash: '#schedule', viewport: PHONE });
    await page.waitFor(function () { return !!document.querySelector('[data-sched-timeline]'); },
      { message: 'the schedule timeline' });

    const read = function () {
      var t = document.querySelector('[data-sched-timeline]');
      var m = document.querySelector('[data-sched-matrix]');
      var sw = document.querySelector('[data-sched-switch]');
      var vis = el => !!el && el.getClientRects().length > 0;
      return {
        switcher: !!sw,
        inDom: { timeline: !!t, matrix: !!m },
        visible: { timeline: vis(t), matrix: vis(m) },
        width: {
          timeline: t && vis(t) ? Math.round(t.getBoundingClientRect().width) : null,
          matrix: m && vis(m) ? Math.round(m.getBoundingClientRect().width) : null
        }
      };
    };

    const a = await page.evaluate(read);
    assert.equal(a.switcher, true, 'a phone in day mode offers the GRID/TASKS switcher');
    assert.deepEqual(a.visible, { timeline: true, matrix: false }, 'it opens on the timeline');
    assert.equal(a.width.timeline, 390,
      'and the timeline takes the whole width, not 65% of it (' + a.width.timeline + 'px)');
    assert.deepEqual(a.inDom, { timeline: true, matrix: true },
      'both panes are in the DOM; only one is drawn');

    await page.evaluate(function () {
      document.querySelector('[data-sched-pane="matrix"]').click(); return true;
    });
    await page.waitFor(function () {
      var m = document.querySelector('[data-sched-matrix]');
      return !!m && m.getClientRects().length > 0;
    }, { message: 'the TASKS pane being shown' });

    const b = await page.evaluate(read);
    assert.deepEqual(b.visible, { timeline: false, matrix: true }, 'switching shows the other pane');
    assert.equal(b.width.matrix, 390,
      'which also takes the whole width, not 35% (' + b.width.matrix + 'px)');
    assert.equal(b.inDom.timeline, true,
      'and the timeline is HIDDEN, not unmounted — its mount-only wheel listener '
      + 'would otherwise be bound to a dead node for the rest of the session');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('PHONE/PROGRESS: Milestones shows ONE pane at a time, full width', async () => {
    /* The third of the three 40/60-ish splits, and the one round 1 missed. Its
       panes carry their widths as INLINE styles (`flex: '0 0 40%'`), which no
       stylesheet rule can beat without !important — so the switcher has to
       unmount, and `inDom` is what proves it did rather than merely hiding. */
    const page = await open('progress.html', { db: seedDb(), viewport: PHONE });
    await page.waitFor(function () {
      var b = Array.prototype.find.call(document.querySelectorAll('header button'),
        function (x) { return x.textContent.trim() === 'MILESTONES'; });
      if (b) b.click();
      return !!document.querySelector('[data-ms-split]');
    }, { message: 'the Milestones split' });

    const read = function () {
      var l = document.querySelector('[data-ms-pane="list"]');
      var c = document.querySelector('[data-ms-pane="calendar"]');
      return {
        switcher: !!document.querySelector('[data-ms-switch]'),
        dir: getComputedStyle(document.querySelector('[data-ms-split]')).flexDirection,
        inDom: { list: !!l, calendar: !!c },
        width: { list: l ? Math.round(l.getBoundingClientRect().width) : null,
                 calendar: c ? Math.round(c.getBoundingClientRect().width) : null }
      };
    };

    const a = await page.evaluate(read);
    assert.equal(a.switcher, true, 'a phone offers the MILESTONES/CALENDAR switcher');
    assert.equal(a.dir, 'column', 'and the split stacks rather than sitting side by side');
    assert.deepEqual(a.inDom, { list: true, calendar: false }, 'it opens on the list');
    assert.equal(a.width.list, 390,
      'which takes the whole width, not 40% of it (' + a.width.list + 'px)');

    await page.evaluate(function () {
      document.querySelector('[data-ms-pane-btn="calendar"]').click(); return true;
    });
    await page.waitFor(function () { return !!document.querySelector('[data-ms-pane="calendar"]'); },
      { message: 'the CALENDAR pane' });

    const b = await page.evaluate(read);
    assert.deepEqual(b.inDom, { list: false, calendar: true }, 'switching swaps which is mounted');
    assert.equal(b.width.calendar, 390,
      'and the calendar also takes the whole width, not 60% (' + b.width.calendar + 'px)');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('PHONE/PROGRESS: the Schedule nav wraps so CALENDAR stays TAPPABLE', async () => {
    /* Reported directly: "I can't click on calendar cus it's clipped out". In
       day mode that row's children come to ~546px in a 390px box, and CALENDAR
       is the last of them, so it fell off the right edge into the viewport clip.

       `elementFromPoint` is the assertion that matters, not presence and not
       even the rect: the button was always in the DOM with a sane-looking
       width, it was simply drawn past the edge where no finger could land. */
    const page = await open('progress.html', { db: seedDb(), hash: '#schedule', viewport: PHONE });
    await page.waitFor(function () { return !!document.querySelector('[data-sched-nav]'); },
      { message: 'the schedule nav bar' });

    const m = await page.evaluate(function () {
      var nav = document.querySelector('[data-sched-nav]');
      var vw = document.documentElement.clientWidth;
      var cal = Array.prototype.find.call(nav.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'CALENDAR'; });
      if (!cal) return { calendar: null };
      var r = cal.getBoundingClientRect();
      var hit = document.elementFromPoint(Math.round(r.left + r.width / 2),
                                          Math.round(r.top + r.height / 2));
      /* align-items:center puts differently-sized children on one line at
         different `top` values, so distinct tops OVERCOUNT the rows. Group by
         overlapping vertical bands instead — getting this wrong reported five
         lines for a three-line row. */
      var bands = [];
      Array.prototype.forEach.call(nav.children, function (c) {
        if (!c.getClientRects().length) return;
        var cr = c.getBoundingClientRect();
        var mid = cr.top + cr.height / 2;
        for (var i = 0; i < bands.length; i++) {
          if (mid > bands[i].top && mid < bands[i].bottom) {
            bands[i].top = Math.max(bands[i].top, cr.top);
            bands[i].bottom = Math.min(bands[i].bottom, cr.bottom);
            return;
          }
        }
        bands.push({ top: cr.top, bottom: cr.bottom });
      });
      return {
        vw: vw, wrap: getComputedStyle(nav).flexWrap, rows: bands.length,
        navRight: Math.round(nav.getBoundingClientRect().right),
        calendar: { left: Math.round(r.left), right: Math.round(r.right),
          hit: hit === cal ? 'self' : (cal.contains(hit) ? 'child'
               : (hit ? hit.tagName.toLowerCase() : 'null')) }
      };
    });

    assert.notEqual(m.calendar, null, 'the CALENDAR button renders at all');
    assert.equal(m.calendar.hit, 'self',
      'CALENDAR takes its own tap (got ' + m.calendar.hit + ' at '
      + m.calendar.left + '–' + m.calendar.right + ' in a ' + m.vw + 'px viewport)');
    assert.ok(m.calendar.right <= m.vw + 1,
      'and is drawn inside the viewport, not past its right edge');
    assert.equal(m.wrap, 'wrap', 'the row wraps rather than clipping');
    assert.ok(m.rows >= 2 && m.rows <= 3,
      'into a predictable 2-3 lines, not one clipped line and not a ragged pile (' + m.rows + ')');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('PHONE/DOCUMENTATIONS: a row ARMS on the first tap and opens on the second', async () => {
    /* The interaction that replaced a rule this stylesheet called load-bearing.
       The old `@media (hover: none)` block showed all five controls on every
       row permanently, because a finger raises no :hover and they would
       otherwise be unreachable. That cost 228px of a 390px row and left the
       page title 42px — measured, both numbers — which is why names were
       unreadable. Arming re-provides the reachability in one extra tap.

       TWO rules had to move together and only one of them is in the hover:none
       block: `.docs-sidebar-full .doc-row-acts` governs the drawer at every
       width. Changing one and not the other looks implemented and does nothing,
       which is exactly what happened first time — hence the unarmed assertion
       below, which is the one that caught it. */
    /* TWO pages, and the one under test is deliberately NOT the one the editor
       opens by itself. This page auto-selects a page on mount, so a single-page
       fixture makes "the first tap did not open it" unprovable — the page is
       already open and the assertion passes or fails for reasons that have
       nothing to do with arming. Seeded the other way round, the editor starts
       on 'Bravo' and the tap under test has somewhere to move it FROM. */
    const page = await open('documentations.html', {
      db: seedDb({ docPages: [
        F.docPage('p0', { title: 'Bravo' }),
        F.docPage('p1', { title: 'Thermodynamics and entropy — a long name' })
      ] }),
      viewport: PHONE
    });
    await page.waitFor(function () { return !!document.querySelector('[data-tabbar-tab="pages"]'); },
      { message: 'the phone bar' });
    await page.evaluate(function () {
      document.querySelector('[data-tabbar-tab="pages"]').click(); return true;
    });
    await page.waitFor(function () {
      return !!document.querySelector('.docs-sidebar-full [data-doc-row="p1"]');
    }, { message: 'the drawer open with rows' });

    const read = function () {
      var row = document.querySelector('[data-doc-row="p1"]');
      var acts = row.querySelector('.doc-row-acts');
      var title = row.querySelector('span.flex-1');
      return {
        armed: row.classList.contains('doc-row-armed'),
        display: getComputedStyle(acts).display,
        actsW: Math.round(acts.getBoundingClientRect().width),
        titleW: title ? Math.round(title.getBoundingClientRect().width) : null,
        open: (function () {
          var i = document.querySelector('.docs-editor input[placeholder="Untitled"]');
          return i ? i.value : null;
        })()
      };
    };
    const tapRow = function () {
      var r = document.querySelector('[data-doc-row="p1"]').getBoundingClientRect();
      // 20px in: past the caret and icon, so this is the row itself and not a control
      var el = document.elementFromPoint(Math.round(r.left + 20), Math.round(r.top + r.height / 2));
      if (el) el.click();
      return true;
    };

    const shut = await page.evaluate(read);
    assert.equal(shut.display, 'none', 'unarmed, the five controls are not drawn');
    assert.ok(shut.titleW > 200,
      'so the page name gets the freed width (' + shut.titleW + 'px of 390) rather than ~42px');

    await page.evaluate(tapRow);
    await page.waitFor(function () {
      var r = document.querySelector('[data-doc-row="p1"]');
      return !!r && r.classList.contains('doc-row-armed');
    }, { message: 'the row arming on the first tap' });

    const armed = await page.evaluate(read);
    assert.equal(armed.display, 'flex', 'the first tap reveals the cluster');
    assert.ok(armed.actsW > 0,
      'with a real rect — a finger can only reach what is actually drawn, and the '
      + 'existing TOUCH_DRAG helper dispatches straight at the element so it cannot see this');
    assert.equal(armed.open, shut.open,
      'and the first tap did NOT navigate: the editor still shows whatever it showed before '
      + '(' + shut.open + '), because the first tap is the arm');

    await page.evaluate(tapRow);
    await page.waitFor(function () { return !document.querySelector('.docs-sidebar-full'); },
      { message: 'the second tap opening the page' });
    assert.equal(await page.evaluate(function () {
      var i = document.querySelector('.docs-editor input[placeholder="Untitled"]');
      return i ? i.value : null;
    }), 'Thermodynamics and entropy — a long name', 'the second tap opens it');
    assert.equal(await page.evaluate(function () {
      return !!document.querySelector('.doc-row-armed');
    }), false, 'and nothing is left armed behind the closed drawer');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('PHONE/DOCUMENTATIONS: the sidebar is a drawer, opened from the bar', async () => {
    /* 240px of `w-60 shrink-0` was 62% of this screen, and shrink-0 forbade it
       giving any back — the editor was left about 70px of text column once its
       px-10 padding came off. The drawer itself already existed
       (.docs-sidebar-full); what was missing was hiding the column the rest of
       the time, and a way back in once the ⛶ inside it was hidden too. */
    const page = await open('documentations.html',
      { db: seedDb({ docPages: [F.docPage('p1', { title: 'Synthetic page' })] }), viewport: PHONE });
    await page.waitFor(function () { return !!document.querySelector('.docs-sidebar'); },
      { message: 'the sidebar element' });

    const shut = await page.evaluate(function () {
      var s = document.querySelector('.docs-sidebar');
      var m = document.querySelector('.docs-editor');
      return { rects: s.getClientRects().length, full: s.classList.contains('docs-sidebar-full'),
               editorW: Math.round(m.getBoundingClientRect().width) };
    });
    assert.equal(shut.rects, 0, 'the 240px column is not drawn on a phone');
    assert.equal(shut.full, false);
    assert.equal(shut.editorW, 390, 'so the editor gets the whole width, not 150px of it');

    // open it the way a finger does: tap where the bar's PAGES tab is drawn
    await page.evaluate(function () {
      var b = document.querySelector('[data-tabbar-tab="pages"]');
      var r = b.getBoundingClientRect();
      var el = document.elementFromPoint(Math.round(r.left + r.width / 2),
                                         Math.round(r.top + r.height / 2));
      if (el) el.click();
      return true;
    });
    await page.waitFor(function () {
      var s = document.querySelector('.docs-sidebar');
      return !!s && s.classList.contains('docs-sidebar-full');
    }, { message: 'the drawer opening from a tap on the bar' });

    const open_ = await page.evaluate(function () {
      var s = document.querySelector('.docs-sidebar');
      var r = s.getBoundingClientRect();
      var row = s.querySelector('[data-doc-row]');
      return { w: Math.round(r.width), h: Math.round(r.height),
               rowH: row ? Math.round(row.getBoundingClientRect().height) : null };
    });
    assert.equal(open_.w, 390, 'the drawer takes the whole width');
    assert.ok(open_.rowH >= 44,
      'and its rows are 44px targets (' + open_.rowH + 'px) — a finger, not a cursor');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('PHONE: notes side by side stack one above another, uncropped, with finger-sized controls', async () => {
    const page = await open('index.html', { db: NOTES_SEED(), viewport: PHONE });
    const today = await page.evaluate(TODAY_IN);
    await toSplit(page, 'sorted:n-a');
    const geo = await page.evaluate(function () {
      var vw = document.documentElement.clientWidth;
      var panes = Array.prototype.map.call(document.querySelectorAll('[data-nw-pane]'), function (p) {
        var r = p.getBoundingClientRect();
        return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), h: Math.round(r.height) };
      });
      var controls = Array.prototype.map.call(
        document.querySelectorAll('#nw-split .nw-split-bar button, [data-nw-pane] .nw-pane-head button'),
        function (b) { var r = b.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height)); });
      return { vw: vw, panes: panes, controls: controls };
    });
    assert.equal(geo.panes[0].left, geo.panes[1].left, 'the two panes share a left edge');
    assert.ok(geo.panes[0].top < geo.panes[1].top, 'the draft sits above the note');
    assert.ok(geo.panes.every(p => p.left >= 0 && p.right <= geo.vw), 'neither pane is cropped: ' + JSON.stringify(geo.panes));
    assert.ok(geo.panes.every(p => p.h >= 160), 'each pane keeps a readable height');
    assert.ok(geo.controls.length >= 9 && geo.controls.every(s => s >= 44),
      'every control is a 44px target: ' + geo.controls.join(','));

    // typing still lands, from the stacked layout
    const raw = await page.evaluate(READ_RAW);
    await page.evaluate(TYPE_IN, '[data-nw-pane="date:' + today + '"] textarea', 'drafted on a phone');
    await landed(page, raw);
    assert.equal((await page.evaluate(SLOT0)).dateNotes[today].content, 'drafted on a phone');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('PHONE: the calendar pop-up, the tag radio and a locked day\'s note fit a phone, uncropped, with finger-sized targets', async () => {
    const page = await open('index.html', { db: TAG_SEED(), viewport: PHONE });
    await page.waitFor(function () { return !!document.getElementById('nw-btn'); }, { message: 'the notes widget' });
    await page.evaluate(OPEN_CAL);
    const geo = await page.evaluate(function () {
      var card = document.querySelector('[data-nw-cal]').getBoundingClientRect();
      return {
        vw: document.documentElement.clientWidth,
        vh: window.innerHeight,
        sw: document.documentElement.scrollWidth,
        card: [Math.round(card.left), Math.round(card.top), Math.round(card.right), Math.round(card.bottom)],
        days: Array.prototype.map.call(document.querySelectorAll('[data-nw-cal-day]'), function (b) {
          var r = b.getBoundingClientRect();
          return Math.round(Math.min(r.width, r.height));
        })
      };
    });
    assert.ok(geo.card[0] >= 0 && geo.card[2] <= geo.vw, 'the pop-up is not cropped sideways: ' + geo.card + ' in ' + geo.vw);
    assert.ok(geo.card[1] >= 0 && geo.card[3] <= geo.vh, 'nor at the top or bottom: ' + geo.card + ' in ' + geo.vh);
    assert.ok(geo.sw <= geo.vw, 'and nothing scrolls sideways (' + geo.sw + ' > ' + geo.vw + ')');
    assert.equal(geo.days.length, 42);
    assert.ok(geo.days.every(s => s >= 40), 'every day is a finger target: the smallest is ' + Math.min(...geo.days) + 'px');

    assert.ok(await page.evaluate(CAL_TO, '2026-03'));
    await page.evaluate(PRESS, '[data-nw-cal-day="2026-03-11"]');
    const radios = await page.evaluate(function () {
      var vw = document.documentElement.clientWidth;
      return Array.prototype.map.call(document.querySelectorAll('[data-nw-tag-set]'), function (b) {
        var r = b.getBoundingClientRect();
        return { size: Math.round(Math.min(r.width, r.height)), inside: r.left >= 0 && r.right <= vw };
      });
    });
    assert.equal(radios.length, 3);
    assert.ok(radios.every(r => r.size >= 44 && r.inside), 'the three tags are 44px targets on screen: ' + JSON.stringify(radios));
    const lock = await page.evaluate(function () {
      var vw = document.documentElement.clientWidth;
      var n = document.querySelector('[data-nw-lock-note]'), ta = document.getElementById('nw-content');
      var r = n.getBoundingClientRect();
      return { shown: !n.hidden && r.height > 0, inside: r.left >= 0 && r.right <= vw,
        uncut: n.scrollWidth <= n.clientWidth, readOnly: ta.readOnly, text: Math.round(ta.getBoundingClientRect().height) };
    });
    assert.deepEqual([lock.shown, lock.inside, lock.uncut, lock.readOnly], [true, true, true, true],
      'the Eternal day is read-only and its note is on screen, uncut: ' + JSON.stringify(lock));
    assert.ok(lock.text >= 120, 'and the locked text keeps room to be read: ' + lock.text + 'px');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* ── 18. Overdue milestones ──────────────────────────────────────────────
     A milestone whose end has passed with its work unfinished is LATE.
     milestone-core.js decides that, and its own suite pins the rule; these
     cases pin where it SHOWS, one surface per case: the Home and
     Documentations month tails (one shared layout in calendar-core.js, two
     renderers), the Milestones tab's row and calendar (progress.html's own
     code), the Schedule's ⚑ rows and its two pickers, and the slip record the
     period writer keeps. A surface forgotten while its sibling works is this
     repository's recurring bug, so no case covers two.

     Every date is relative to TODAY. The late milestone ran from 20 days ago
     to 5 days ago, so its PERIOD may sit in last month — but its tail always
     reaches today's cell, so every calendar assertion is made there. A
     fixed-day assertion fails on the 1st to 5th of every month: the trap
     51968a0 fixed for the caution picker. */

  const msBlock = (id, milestoneId, children) =>
    ({ id, title: 'Block ' + id, children: children || [], completed: false, taskType: 'milestone', milestoneId });
  const LATE_KEY = 'g-late|ms-late';
  const lateGoal = (over = {}) => F.task('g-late', Object.assign({
    title: 'Exam prep',
    milestones: [F.milestone('ms-late', dayFromToday(-20), dayFromToday(-5), { title: 'Chapter one' })],
    children: [msBlock('blk-late', 'ms-late', [
      F.task('t-open-1', { title: 'Read the notes' }),
      F.task('t-open-2', { title: 'Do the problems' }),
      F.task('t-done', { title: 'Watch the lecture', completed: true })])]
  }, over));
  // seedDb's populated slot, with its goal tree replaced and its dated noise
  // cleared so nothing else competes for today's cell
  const lateDb = (goals = [lateGoal()]) => seedDb({
    goals, calendarNotes: [], deadlines: [], mmEntries: [], sessions: [], saEntries: []
  });
  // Every task done; what keeps it late is MM 10 (no stage yet) short of stage 2.
  const lateLearnDb = () => lateDb([lateGoal({
    toLearn: [10],
    mmTargets: { 10: { milestones: [{ milestoneId: 'ms-late', stage: '2' }] } },
    children: [msBlock('blk-late', 'ms-late', [F.task('t-done', { title: 'Watch the lecture', completed: true })])]
  })]);
  // The colour a `var(--color-danger)` resolves to on this page, measured.
  const DANGER_RGB = function () {
    var p = document.createElement('span');
    p.style.color = 'var(--color-danger)';
    document.body.appendChild(p);
    var c = getComputedStyle(p).color;
    p.remove();
    return c;
  };
  const READ_MS = function () {
    var db = JSON.parse(localStorage.getItem('track_db') || '{}');
    var s = (db.slots || [])[0] || {};
    var g = (s.goals || []).filter(function (x) { return x.id === 'g-late'; })[0];
    return g ? (g.milestones || [])[0] : null;
  };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const shortDay = ds => MON[+ds.slice(5, 7) - 1] + ' ' + (+ds.slice(8, 10))
    + (ds.slice(0, 4) === TODAY.slice(0, 4) ? '' : ', ' + ds.slice(0, 4));
  /* Every case here closes its page however it ends. A case that fails before
     its own page.close() leaves its tab open, and an open progress.html tab is
     a LIVE WRITER: it adopts the next case's seed from the storage event and
     writes its own state back, racing that case's writes. The first
     doctored-baseline run of this section showed exactly that — the SLIP cases
     failing on a stale `to` in every tree where an earlier Milestones case had
     failed, and in no other. close() is idempotent, so each case's own
     close at its end stays. */
  const openHere = async (tc, file, opts) => {
    const page = await open(file, opts);
    tc.after(() => page.close());
    return page;
  };
  const openMilestonesTab = async (tc, db) => {
    const page = await openHere(tc, 'progress.html', { db, hash: '#milestones' });
    await page.waitFor(function (k) { return !!document.querySelector('[data-ms-row="' + k + '"]'); },
      { args: [LATE_KEY], message: 'the late milestone row' });
    return page;
  };
  // One date-input gesture, as a user makes it: focus, one or more committed
  // days, blur. Each day is waited on in storage before the next is typed, so
  // the next commit's `prev` holds it — that is what a real keystroke sees.
  const typeEnd = async (page, key, values, { blur = true } = {}) => {
    await page.evaluate(function (k) {
      var el = document.querySelector('[data-ms-row="' + k + '"] [data-ms-date="end"]');
      el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      return true;
    }, key);
    for (const v of values) {
      await page.evaluate(function (setterSrc, k, val) {
        var set = new Function('return ' + setterSrc)();
        set(document.querySelector('[data-ms-row="' + k + '"] [data-ms-date="end"]'), val);
        return true;
      }, SET_REACT_INPUT, key, v);
      if (/^2\d{3}-/.test(v)) {
        await page.waitFor(function (val) {
          var db = JSON.parse(localStorage.getItem('track_db') || '{}');
          var g = (((db.slots || [])[0] || {}).goals || []).filter(function (x) { return x.id === 'g-late'; })[0];
          return !!g && g.milestones[0].endDate === val;
        }, { args: [v], message: 'the end day ' + v + ' landing in storage' });
      }
    }
    if (blur) {
      await page.evaluate(function (k) {
        var el = document.querySelector('[data-ms-row="' + k + '"] [data-ms-date="end"]');
        el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        return true;
      }, key);
    }
  };

  // ── the month tails ──────────────────────────────────────────────────────

  await t.test('HOME: a late milestone runs on to TODAY as a dashed tail, with a "!" on today', async tc => {
    const page = await openHere(tc, 'index.html', { db: lateDb() });
    const cell = await page.waitFor(function (t) {
      var c = document.querySelector('#cal-grid [data-cal-day="' + t + '"]');
      if (!c) return false;
      var line = c.querySelector('.cal-ms-line[data-ms-late]');
      var flag = c.querySelector('.cal-ms-late-flag');
      return {
        late: line ? line.getAttribute('data-ms-late') : null,
        overrun: !!line && line.classList.contains('ms-overrun'),
        ends: !!line && line.classList.contains('cap-end'),
        dashed: line ? getComputedStyle(line).backgroundImage : '',
        flag: flag ? flag.getAttribute('data-cal-late-flag') : null,
        title: line ? line.title : ''
      };
    }, { args: [TODAY], message: "today's cell on the Home calendar" });
    // the claim this case is named for, first
    assert.equal(cell.late, 'ms-late', 'the late milestone is drawn on today');
    assert.equal(cell.overrun, true, 'as its overrun tail, not as its period');
    assert.match(cell.dashed, /repeating-linear-gradient/, 'dashed in the danger colour');
    assert.equal(cell.ends, true, 'and the bar ends on today');
    assert.equal(cell.flag, '1', 'today carries one "!"');
    assert.match(cell.title, /OVERDUE · 5 days · 2 tasks left/);
    const tail = await page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll('#cal-grid .cal-ms-line.ms-overrun'),
        function (l) { return l.closest('[data-cal-day]').getAttribute('data-cal-day'); });
    });
    const end = dayFromToday(-5);
    assert.ok(tail.length > 0 && tail.every(ds => ds > end && ds <= TODAY),
      'every tail day is after the end and no later than today: ' + JSON.stringify(tail));
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('HOME GUARD: a finished or an empty past milestone grows no tail', async tc => {
    const page = await openHere(tc, 'index.html', { db: lateDb([
      F.task('g-fin', { title: 'Done goal',
        milestones: [F.milestone('ms-fin', dayFromToday(-20), dayFromToday(-5), { title: 'Finished' })],
        children: [msBlock('blk-fin', 'ms-fin', [F.task('t-f', { completed: true })])] }),
      F.task('g-empty', { title: 'Empty goal',
        milestones: [F.milestone('ms-empty', dayFromToday(-20), dayFromToday(-5), { title: 'Nothing in it' })] })
    ]) });
    await page.waitFor(function (t) { return !!document.querySelector('#cal-grid [data-cal-day="' + t + '"]'); },
      { args: [TODAY], message: "today's cell on the Home calendar" });
    const marks = await page.evaluate(function () {
      return {
        tails: document.querySelectorAll('#cal-grid .cal-ms-line.ms-overrun, #cal-grid [data-ms-late]').length,
        flags: document.querySelectorAll('#cal-grid .cal-ms-late-flag').length
      };
    });
    assert.deepEqual(marks, { tails: 0, flags: 0 }, 'nothing is owed, so nothing runs on');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('HOME GUARD: a task linked under its own descendant cannot take the calendar down', async tc => {
    // P > C > link(P): the "link existing task" picker offers a task's ancestors
    const page = await openHere(tc, 'index.html', { db: lateDb([lateGoal({
      children: [msBlock('blk-late', 'ms-late', [F.task('P', { title: 'Parent', children: [
        F.task('C', { title: 'Child', children: [{ id: 'L', linkedTaskId: 'P', isLink: true }, F.task('leaf', { title: 'Leaf' })] })] })])]
    })]) });
    const title = await page.waitFor(function (t) {
      var line = document.querySelector('#cal-grid [data-cal-day="' + t + '"] .cal-ms-line[data-ms-late]');
      return line ? line.title : false;
    }, { args: [TODAY], message: "today's tail despite the cycle" });
    assert.match(title, /OVERDUE · 5 days · 1 task left/, 'the cycle counts nothing; the real leaf still does');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('HOME: coming back to the tab redraws the calendar', async tc => {
    const page = await openHere(tc, 'index.html', { db: lateDb() });
    await page.waitFor(function (t) { return !!document.querySelector('#cal-grid [data-cal-day="' + t + '"] .cal-ms-late-flag'); },
      { args: [TODAY], message: "today's flag" });
    // finish the work in THIS tab, which fires no storage event here — only
    // the visibility listener can bring the calendar up to date
    await page.evaluate(function (writeSrc) {
      var write = new Function('return ' + writeSrc)();
      var db = JSON.parse(localStorage.getItem('track_db'));
      var goals = JSON.parse(JSON.stringify(db.slots[0].goals));
      goals[0].children[0].children.forEach(function (t) { t.completed = true; });
      return write('goals', goals);
    }, WRITE_SLOT_KEY.toString());
    assert.equal(await page.evaluate(function () { return document.visibilityState; }), 'visible',
      'precondition: the listener redraws only a VISIBLE tab, so a hidden one would prove nothing');
    await page.evaluate(function () { document.dispatchEvent(new Event('visibilitychange')); return true; });
    await page.waitFor(function (t) { return !document.querySelector('#cal-grid [data-cal-day="' + t + '"] .cal-ms-late-flag'); },
      { args: [TODAY], message: 'the flag gone once the tab is shown again' });
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('DOCUMENTATIONS: a late milestone runs on to TODAY in a calendar block', async tc => {
    const page = await openHere(tc, 'documentations.html', { db: lateDb() });
    await page.waitFor(function () { return !!document.querySelector('.docs-editor'); },
      { message: 'documentations editor' });
    await addCalendarBlock(page);
    const cell = await page.waitFor(function (t) {
      var c = document.querySelector('.doc-cal [data-cal-day="' + t + '"]');
      if (!c) return false;
      var line = c.querySelector('.cal-ms-line[data-ms-late]');
      var flag = c.querySelector('.cal-ms-late-flag');
      return {
        late: line ? line.getAttribute('data-ms-late') : null,
        overrun: !!line && line.classList.contains('ms-overrun'),
        dashed: line ? getComputedStyle(line).backgroundImage : '',
        flag: flag ? flag.getAttribute('data-cal-late-flag') : null
      };
    }, { args: [TODAY], message: "today's cell in the calendar block" });
    assert.equal(cell.late, 'ms-late', 'the late milestone is drawn on today');
    assert.equal(cell.overrun, true, 'as its tail');
    assert.match(cell.dashed, /repeating-linear-gradient/);
    assert.equal(cell.flag, '1');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  // ── the Milestones tab ───────────────────────────────────────────────────

  await t.test('MILESTONES: a late row reads "OVERDUE · 5 days · 2 tasks left", in red', async tc => {
    const page = await openMilestonesTab(tc, lateDb());
    const row = await page.evaluate(function (k, dangerSrc) {
      var r = document.querySelector('[data-ms-row="' + k + '"]');
      var b = r.querySelector('[data-ms-badge]');
      var danger = new Function('return ' + dangerSrc)()();
      return { state: r.getAttribute('data-ms-state'), badge: b ? b.textContent.trim() : null,
        badgeRed: !!b && getComputedStyle(b).color === danger,
        borderRed: getComputedStyle(r).borderTopColor === danger };
    }, LATE_KEY, DANGER_RGB.toString());
    assert.equal(row.badge, 'OVERDUE · 5 days · 2 tasks left', 'the wording the user asked for');
    assert.equal(row.state, 'overdue');
    assert.equal(row.badgeRed, true, 'in the danger colour');
    assert.equal(row.borderRed, true, 'and the row is outlined in it');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('MILESTONES: to-learn alone keeps a milestone late', async tc => {
    const page = await openMilestonesTab(tc, lateLearnDb());
    const row = await page.evaluate(function (k) {
      var r = document.querySelector('[data-ms-row="' + k + '"]');
      var b = r.querySelector('[data-ms-badge]'), l = r.querySelector('[data-ms-learn]');
      return { state: r.getAttribute('data-ms-state'), badge: b && b.textContent.trim(),
        learn: l && l.textContent.trim(), why: l && l.title };
    }, LATE_KEY);
    assert.equal(row.badge, 'OVERDUE · 5 days · 1 to-learn left', 'every task is done; MM 10 is not');
    assert.equal(row.state, 'overdue');
    assert.equal(row.learn, '◎ 0/1 to-learn');
    assert.match(row.why, /Mind Map A/, 'and the row names the mind map still owed');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('MILESTONES GUARD: an empty past milestone says "no work attached" and is not late', async tc => {
    // seedDb's own ms-1 ran in March 2026 and holds no block and no to-learn
    const page = await openHere(tc, 'progress.html', { db: seedDb(), hash: '#milestones' });
    const row = await page.waitFor(function () {
      var r = document.querySelector('[data-ms-row="g-1|ms-1"]');
      if (!r) return false;
      var b = r.querySelector('[data-ms-badge]');
      return { state: r.getAttribute('data-ms-state'), badge: b && b.textContent.trim(),
        chips: document.querySelectorAll('[data-ms-chip-overrun]').length };
    }, { message: 'the empty milestone row' });
    assert.deepEqual(row, { state: 'empty', badge: 'no work attached', chips: 0 });
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('MILESTONES GUARD: a milestone ending TODAY is not late yet', async tc => {
    const page = await openMilestonesTab(tc, lateDb([lateGoal({
      milestones: [F.milestone('ms-late', dayFromToday(-20), TODAY, { title: 'Chapter one' })] })]));
    const row = await page.evaluate(function (k) {
      var r = document.querySelector('[data-ms-row="' + k + '"]');
      return { state: r.getAttribute('data-ms-state'), badge: !!r.querySelector('[data-ms-badge]'),
        chips: document.querySelectorAll('[data-ms-chip-overrun]').length };
    }, LATE_KEY);
    assert.deepEqual(row, { state: 'active', badge: false, chips: 0 }, 'the end day is the last day, not a late one');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('MILESTONES CALENDAR: a late milestone\'s chip runs on to TODAY, dashed and flagged', async tc => {
    const page = await openMilestonesTab(tc, lateDb());
    const cal = await page.waitFor(function (k, t, end, next) {
      var today = document.querySelector('[data-ms-day="' + t + '"] [data-ms-chip-overrun="' + k + '"]');
      if (!today) return false;
      var endChip = document.querySelector('[data-ms-day="' + end + '"] [data-ms-chip="' + k + '"]');
      return { today: today.textContent.trim(), dashed: getComputedStyle(today).borderTopStyle,
        endIsPeriod: !!endChip && !endChip.hasAttribute('data-ms-chip-overrun'),
        tomorrow: !!document.querySelector('[data-ms-day="' + next + '"] [data-ms-chip="' + k + '"]') };
    }, { args: [LATE_KEY, TODAY, dayFromToday(-5), dayFromToday(1)], message: "today's overrun chip" });
    assert.match(cal.today, /^! Chapter one/, 'today\'s chip leads with "!"');
    assert.equal(cal.dashed, 'dashed');
    assert.equal(cal.endIsPeriod, true, 'the end day is still the period, not the tail');
    assert.equal(cal.tomorrow, false, 'and nothing is drawn past today');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  // ── the slip record ──────────────────────────────────────────────────────

  await t.test('SLIP: moving a late milestone\'s end later logs it and clears the warning', async tc => {
    const page = await openMilestonesTab(tc, lateDb());
    const to = dayFromToday(10);
    await typeEnd(page, LATE_KEY, [to]);
    const ms = await page.evaluate(READ_MS);
    assert.deepEqual(ms.slips, [{ from: dayFromToday(-5), to, on: TODAY }], 'one slip, from the missed day to the new one');
    const row = await page.waitFor(function (k) {
      var r = document.querySelector('[data-ms-row="' + k + '"]');
      var s = r && r.querySelector('[data-ms-slips]');
      return s ? { state: r.getAttribute('data-ms-state'), slips: s.textContent.trim() } : false;
    }, { args: [LATE_KEY], message: 'the slip line on the row' });
    assert.equal(row.slips, 'slipped 1× · first due ' + shortDay(dayFromToday(-5)));
    assert.equal(row.state, 'active', 'the warning cleared — the record did not');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('SLIP GUARD: moving an on-time milestone records nothing', async tc => {
    const page = await openMilestonesTab(tc, lateDb([lateGoal({
      milestones: [F.milestone('ms-late', dayFromToday(-20), dayFromToday(3), { title: 'Chapter one' })] })]));
    await typeEnd(page, LATE_KEY, [dayFromToday(10)]);
    const ms = await page.evaluate(READ_MS);
    assert.equal(ms.endDate, dayFromToday(10), 'the move landed');
    assert.equal(Object.prototype.hasOwnProperty.call(ms, 'slips'), false, 'planning ahead is not a slip');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('SLIP: one focus, typed through other days, logs ONE record from the missed day', async tc => {
    const page = await openMilestonesTab(tc, lateDb());
    await typeEnd(page, LATE_KEY, [dayFromToday(-8), dayFromToday(3), dayFromToday(7)]);
    const ms = await page.evaluate(READ_MS);
    assert.deepEqual(ms.slips, [{ from: dayFromToday(-5), to: dayFromToday(7), on: TODAY }],
      'the net effect of the edit, measured from where it started');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('SLIP GUARD: an on-time milestone typed through an earlier day records nothing', async tc => {
    const page = await openMilestonesTab(tc, lateDb([lateGoal({
      milestones: [F.milestone('ms-late', dayFromToday(-20), dayFromToday(3), { title: 'Chapter one' })] })]));
    // -2 makes it late for a moment; that moment is not where the edit began
    await typeEnd(page, LATE_KEY, [dayFromToday(-2), dayFromToday(10)]);
    const ms = await page.evaluate(READ_MS);
    assert.equal(ms.endDate, dayFromToday(10));
    assert.equal(Object.prototype.hasOwnProperty.call(ms, 'slips'), false, 'it was on time when the edit began');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('SLIP: Cancel on "clear" leaves track_db byte-identical', async tc => {
    const page = await openMilestonesTab(tc, lateDb());
    const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });
    const asked = page.dialogs.length;
    const msg = await answering(page, false, CLICK_SOON_SEL, ['[data-ms-row="' + LATE_KEY + '"] [data-ms-clear]']);
    await sleep(400);
    assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }), before,
      'Cancel writes nothing');
    assert.equal(page.dialogs.length - asked, 1, 'one click, one question');
    assert.match(msg, /5 days overdue, so clearing its dates is recorded as a slip/,
      'and the question says what Accept will record');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('SLIP: Accept on "clear" records the slip with no new day', async tc => {
    const page = await openMilestonesTab(tc, lateDb());
    await answering(page, true, CLICK_SOON_SEL, ['[data-ms-row="' + LATE_KEY + '"] [data-ms-clear]']);
    const ms = await page.waitFor(function (readSrc) {
      var m = new Function('return ' + readSrc)()();
      return m && !m.endDate ? m : false;
    }, { args: [READ_MS.toString()], message: 'the cleared dates landing' });
    assert.deepEqual(ms.slips, [{ from: dayFromToday(-5), on: TODAY }]);
    assert.equal(Object.prototype.hasOwnProperty.call(ms.slips[0], 'to'), false, '`to` is absent, never null');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('MILESTONES: a half-typed year leaves both dates alone', async tc => {
    const page = await openMilestonesTab(tc, lateDb());
    const before = await page.evaluate(READ_MS);
    // the values Chrome's year segment passes through on the way to 2026
    await typeEnd(page, LATE_KEY, ['0002-10-03', '0020-10-03', '0202-10-03'], { blur: false });
    await sleep(400);
    const mid = await page.evaluate(READ_MS);
    assert.deepEqual([mid.startDate, mid.endDate], [before.startDate, before.endDate],
      'no out-of-range day reaches storage');
    await page.evaluate(function (k) {
      document.querySelector('[data-ms-row="' + k + '"] [data-ms-date="end"]')
        .dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      return true;
    }, LATE_KEY);
    const shown = await page.waitFor(function (k, end) {
      var v = document.querySelector('[data-ms-row="' + k + '"] [data-ms-date="end"]').value;
      return v === end ? v : false;
    }, { args: [LATE_KEY, before.endDate], message: 'the field showing the stored day again after blur' });
    assert.equal(shown, before.endDate);
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  // ── the Schedule ─────────────────────────────────────────────────────────

  await t.test('SCHEDULE: TODAY\'s day strip carries a ⚑ for the late milestone, and it opens the row', async tc => {
    const page = await openHere(tc, 'progress.html', { db: lateDb(), hash: '#schedule' });
    await mountSchedule(page);
    const flags = await page.waitFor(function () {
      var f = Array.prototype.map.call(document.querySelectorAll('[data-day-strip] [data-ms-late-flag]'), function (e) {
        return e.closest('[data-day-strip]').getAttribute('data-day-strip') + ':' + e.getAttribute('data-ms-late-flag');
      });
      return f.length ? f : false;
    }, { message: 'a late-milestone flag in a day strip' });
    assert.deepEqual(flags, [TODAY + ':' + LATE_KEY], 'on today, and on no other day');
    await page.evaluate(CLICK_SEL, '[data-day-strip="' + TODAY + '"] [data-ms-late-flag]');
    await page.waitFor(function (k) { return !!document.querySelector('[data-ms-row="' + k + '"][aria-current="true"]'); },
      { args: [LATE_KEY], message: 'the MILESTONES tab with the late row selected' });
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('SCHEDULE: TODAY\'s month cell carries the ⚑', async tc => {
    const page = await openHere(tc, 'progress.html', { db: lateDb(), hash: '#schedule' });
    await mountSchedule(page);
    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('#root button'),
        function (b) { return b.textContent.trim() === 'CALENDAR'; }).click();
      return true;
    });
    const flags = await page.waitFor(function () {
      var f = Array.prototype.map.call(document.querySelectorAll('[data-sched-month-day] [data-ms-late-flag]'), function (e) {
        return e.closest('[data-sched-month-day]').getAttribute('data-sched-month-day') + ':' + e.textContent.trim();
      });
      return f.length ? f : false;
    }, { message: 'a late-milestone flag in the month grid' });
    assert.deepEqual(flags, [TODAY + ':⚑Chapter one'], 'today only');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('PICKER: a late milestone\'s leftover tasks are pinned above the tree, and + schedules one today', async tc => {
    const page = await openHere(tc, 'progress.html', { db: lateDb(), hash: '#schedule' });
    await mountSchedule(page);
    await page.evaluate(CLICK_SEL, '[data-day-add-task="' + TODAY + '"]');
    const pinned = await page.waitFor(function () {
      var b = document.querySelector('[data-picker-late]');
      return b ? Array.prototype.map.call(b.querySelectorAll('[data-picker-late-task]'),
        function (e) { return e.getAttribute('data-picker-late-task'); }) : false;
    }, { message: 'the OVERDUE block in the task picker' });
    assert.deepEqual(pinned, ['t-open-1', 't-open-2'], 'the leftovers, and not the task already done');
    await page.evaluate(CLICK_SEL, '[data-picker-late-task="t-open-1"] button');
    const t1 = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var g = (((db.slots || [])[0] || {}).goals || [])[0];
      var t = g && g.children[0].children.filter(function (x) { return x.id === 't-open-1'; })[0];
      return t && t.scheduledDate ? t : false;
    }, { message: 'the pinned task scheduled' });
    assert.equal(t1.scheduledDate, TODAY);
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('PICKER GUARD: a past day pins nothing', async tc => {
    const yesterday = dayFromToday(-1);
    const page = await openHere(tc, 'progress.html', { db: lateDb(), hash: '?date=' + yesterday + '#schedule' });
    await mountSchedule(page);
    await page.waitFor(function (d) { return !!document.querySelector('[data-day-add-task="' + d + '"]'); },
      { args: [yesterday], message: "yesterday's column" });
    await page.evaluate(CLICK_SEL, '[data-day-add-task="' + yesterday + '"]');
    // the goal row, not a task row: the tree opens collapsed
    await page.waitFor(function () { return !!document.querySelector('[data-picker-node="g-late"]'); },
      { message: 'the picker tree, which still lists the goal' });
    assert.equal(await page.evaluate(function () { return !!document.querySelector('[data-picker-late]'); }), false,
      'a past day is view-only; lateness is pinned for today and later');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('LEARN: a late milestone\'s unreached to-learn heads the pinned strip, once', async tc => {
    // The `◎` picker's OVERDUE group, now the top of ● Learn's pinned strip.
    const page = await openHere(tc, 'progress.html', { db: lateLearnDb(), hash: '#schedule' });
    await mountSchedule(page);
    await page.evaluate(CLICK_SEL, '[data-day-add-learn="' + TODAY + '"]');
    const picks = await page.waitFor(function () {
      if (!document.querySelector('[data-learn-pin]')) return false;
      return Array.prototype.map.call(document.querySelectorAll('[data-mm-pick]'), function (b) {
        return b.getAttribute('data-mm-pick') + (b.hasAttribute('data-mm-pick-late') ? ':late' : '');
      });
    }, { message: 'the pinned strip in the Learn panel' });
    assert.equal(picks[0], '10:late', 'MM 10 heads the panel');
    assert.equal(picks.filter(p => p.startsWith('10')).length, 1, 'and appears once — pinned, not repeated below');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* ── ● Learn and the MG tab: what the day's milestone still needs ────────
     The user's rule (2026-10-14): a mind map is judged against the milestone
     whose dates COVER the day, plus any milestone already overdue, from today
     on. A Procedural mind map is pinned by its MG — its progress is its MG
     level — and a Declarative one as a mind map to study; the SIR reviews due
     that day are pinned beside them. milestone-core.js decides (unreachedOn,
     pinned offline); these cases pin where it SHOWS, one claim per case, on
     the two surfaces that read it: the Learn panel and Progress → MG.

     Chapter one covers today; Chapter two starts in 40 days. Ids are NUMBERS,
     as nid() mints them:
       21 Guitar   Procedural, level 3, wants 5 by Chapter one   → pinned MG
       22 Singing  Procedural, level 5, wants 5                  → reached
       23 Piano    Procedural, level 1, wants 4 by Chapter TWO   → not today
       24 Running  Procedural, in no goal                        → no milestone
       31 Theory   Declarative at S1, wants S3                   → pinned mind map
       40 Cell bio Declarative in SIR, a review due today        → pinned SIR
       41 Swim     Procedural STORED in SIR, a session today     → no SIR at all */
  const learnGoal = () => F.task('g-learn', {
    title: 'Play in a band',
    milestones: [
      F.milestone('ms-now', dayFromToday(-3), dayFromToday(10), { title: 'Chapter one' }),
      F.milestone('ms-next', dayFromToday(40), dayFromToday(70), { title: 'Chapter two' })
    ],
    toLearn: [21, 22, 23, 31],
    mmTargets: {
      21: { milestones: [{ milestoneId: 'ms-now', level: 5 }] },
      22: { milestones: [{ milestoneId: 'ms-now', level: 5 }] },
      23: { milestones: [{ milestoneId: 'ms-next', level: 4 }] },
      31: { milestones: [{ milestoneId: 'ms-now', stage: '3' }] }
    },
    children: []
  });
  const learnDb = (over = {}) => seedDb(Object.assign({
    goals: [learnGoal()],
    mms: [
      F.mm(21, 'Guitar', { type: '2', ksStage: '1', rating: 3, currentMG: 'Keep the wrist loose on downstrokes' }),
      F.mm(22, 'Singing', { type: '2', ksStage: '2', rating: 5, currentMG: 'Breathe from the belly' }),
      F.mm(23, 'Piano', { type: '2', ksStage: '1', rating: 1, currentMG: 'Count out loud' }),
      F.mm(24, 'Running', { type: '2', ksStage: '1', rating: 4, currentMG: 'Land under the hip' }),
      F.mm(31, 'Music theory', { type: '1', ksStage: '1' }),
      F.mm(40, 'Cell biology', { type: '1', ksStage: 'sir' }),
      F.mm(41, 'Swimming', { type: '2', ksStage: 'sir', rating: 6, currentMG: 'Exhale under water' })
    ],
    sessions: [F.session(500, TODAY, 40), F.session(501, TODAY, 41)],
    mgSchedule: {}, mmEntries: [], calendarNotes: [], deadlines: [], saEntries: []
  }, over));
  const openLearn = async (page, ds) => {
    await mountSchedule(page);
    await page.waitFor(function (d) { return !!document.querySelector('[data-day-add-learn="' + d + '"]'); },
      { args: [ds], message: "the day's ● Learn button" });
    await page.evaluate(CLICK_SEL, '[data-day-add-learn="' + ds + '"]');
    await page.waitFor(function () { return !!document.querySelector('[data-learn-panel] [data-mm-pick]'); },
      { message: 'the Learn panel and its mind maps' });
  };
  const LEARN_STATE = function () {
    var ids = function (sel, attr) {
      return Array.prototype.map.call(document.querySelectorAll(sel), function (e) { return e.getAttribute(attr); });
    };
    return {
      mgPins: ids('[data-learn-pin] [data-learn-pin-mg]', 'data-learn-pin-mg'),
      mmPins: ids('[data-learn-pin] [data-learn-pin-mm]', 'data-learn-pin-mm'),
      sirPins: ids('[data-learn-pin] [data-learn-pin-sir]', 'data-learn-pin-sir'),
      tabs: ids('[data-learn-tab]', 'data-learn-tab'),
      mmTab: ids('[data-learn-panel] [data-mm-pick]:not([data-learn-pin-mm]):not([data-learn-pin-sir])', 'data-mm-pick')
    };
  };
  const MG_DAY = function (d) {
    var db = JSON.parse(localStorage.getItem('track_db') || '{}');
    var m = (((db.slots || [])[0] || {}).mgSchedule) || {};
    return Object.prototype.hasOwnProperty.call(m, d) ? m[d] : null;
  };

  await t.test('LEARN: an MG below the day\'s milestone level is pinned first, and turns on that day\'s focus', async tc => {
    const page = await openHere(tc, 'progress.html', { db: learnDb(), hash: '#schedule' });
    await openLearn(page, TODAY);
    const st = await page.evaluate(LEARN_STATE);
    // the claim this case is named for, first
    assert.deepEqual(st.mgPins, ['21'],
      "Guitar alone: Singing has reached 5, Piano is short only of NEXT month's milestone, Running has none");
    assert.equal(await page.evaluate(function () {
      var pin = document.querySelector('[data-learn-pin]'), tab = document.querySelector('[data-learn-tab]');
      return !!(pin && tab && (pin.compareDocumentPosition(tab) & Node.DOCUMENT_POSITION_FOLLOWING));
    }), true, 'the pinned strip sits above the tabs');

    await page.evaluate(CLICK_SEL, '[data-learn-tab="mg"]');
    const mgTab = await page.waitFor(function () {
      var r = Array.prototype.map.call(document.querySelectorAll('[data-mg-pick]'),
        function (e) { return e.getAttribute('data-mg-pick'); });
      return r.length ? r : false;
    }, { message: 'the Marginal gains tab' });
    assert.deepEqual(mgTab.slice().sort(), ['22', '23', '24', '41'],
      'every other Procedural mind map, and Guitar not listed again');

    await page.evaluate(CLICK_SEL, '[data-learn-pin-mg="21"]');
    const on = await page.waitFor(MG_DAY, { args: [TODAY], message: 'the MG focus reaching track_db' });
    assert.deepEqual(on, [21], "Guitar's MG is the day's focus, under its NUMBER id");

    // Turning it off is a scheduling toggle — the destructive-control rule's
    // documented exemption — so it asks nothing.
    const dialogs = page.dialogs.length;
    await page.evaluate(CLICK_SEL, '[data-learn-pin-mg="21"]');
    const off = await page.waitFor(function (d) {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var m = (((db.slots || [])[0] || {}).mgSchedule) || {};
      return JSON.stringify(m[d]) !== '[21]' ? (m[d] || null) : false;
    }, { args: [TODAY], message: 'the MG focus changing again' });
    assert.deepEqual(off, [], 'turned off');
    assert.equal(page.dialogs.length, dialogs, 'and turning an MG off asks nothing');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('LEARN: a Declarative mind map short of the day\'s milestone is pinned to study; a Procedural one only by its MG', async tc => {
    const page = await openHere(tc, 'progress.html', { db: learnDb(), hash: '#schedule' });
    await openLearn(page, TODAY);
    const st = await page.evaluate(LEARN_STATE);
    assert.deepEqual(st.mmPins, ['31'], 'Music theory (S1, wants S3) — and not Guitar, which is pinned by its MG');
    assert.equal(st.mmTab.indexOf('31'), -1, 'it is not listed again under Mind maps');
    assert.ok(st.mmTab.indexOf('21') >= 0, 'Guitar can still be studied, from the Mind maps tab');
    await page.evaluate(CLICK_SEL, '[data-learn-pin-mm="31"]');
    const added = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var m = (((db.slots || [])[0] || {}).mmEntries) || [];
      return m.length ? m : false;
    }, { message: 'the study block reaching track_db' });
    assert.deepEqual(added.map(e => [e.mmId, e.date]), [[31, TODAY]], 'one study block, for Music theory, today');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('LEARN: a due SIR review is pinned, and a Procedural mind map\'s hidden session is not', async tc => {
    /* The `◎` picker read sessions straight from storage, so a Procedural
       mind map stored in SIR showed under SIR DUE TODAY while every other
       surface hid its sessions. The strip reads them through liveSessions. */
    const page = await openHere(tc, 'progress.html', { db: learnDb(), hash: '#schedule' });
    await openLearn(page, TODAY);
    const st = await page.evaluate(LEARN_STATE);
    assert.deepEqual(st.sirPins, ['40'],
      'Cell biology is due; Swimming is Procedural — it has no SIR, so its stored session is due nowhere');
    assert.equal(st.mmTab.indexOf('40'), -1, 'the due review is not listed again under Mind maps');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('LEARN GUARD: a past day pins no milestone work and has no MG tab', async tc => {
    // Yesterday is inside Chapter one, so only the past-day gate keeps it clear.
    const yesterday = dayFromToday(-1);
    const page = await openHere(tc, 'progress.html', { db: learnDb({ sessions: [] }), hash: '?date=' + yesterday + '#schedule' });
    await openLearn(page, yesterday);
    const st = await page.evaluate(LEARN_STATE);
    assert.deepEqual([st.mgPins, st.mmPins], [[], []], 'a past day is view-only: nothing is pinned');
    assert.deepEqual(st.tabs, [], 'no tab bar — a past day has no MG tab, as ⊕ had no button there');
    assert.ok(st.mmTab.indexOf('21') >= 0 && st.mmTab.indexOf('31') >= 0, 'every mind map is still listed to study');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  const openMGTab = async (tc, db) => {
    const page = await openHere(tc, 'progress.html', { db, hash: '#mg' });
    await page.waitFor(function () { return !!document.querySelector('[data-mg-card]'); }, { message: 'the MG tab cards' });
    return page;
  };
  const MG_CARDS = function () {
    return Array.prototype.map.call(document.querySelectorAll('[data-mg-card]'), function (c) {
      return c.getAttribute('data-mg-card') + (c.hasAttribute('data-mg-below') ? ':below' : '');
    });
  };

  await t.test('MG TAB: a Procedural mind map below its milestone level is highlighted and listed first', async tc => {
    const page = await openMGTab(tc, learnDb());
    const cards = await page.evaluate(MG_CARDS);
    // the claim this case is named for, first
    assert.equal(cards[0], '21:below', 'Guitar heads the MG tab, highlighted: ' + cards.join(' '));
    assert.deepEqual(cards.filter(c => c.endsWith(':below')), ['21:below'], 'and nothing else is highlighted');

    // The tab's own ✓ toggle-off is the other half of the documented exemption.
    const btn = '[data-mg-card="21"] button';
    await page.evaluate(CLICK_SEL, btn);
    const on = await page.waitFor(MG_DAY, { args: [TODAY], message: 'Guitar scheduled from the MG tab' });
    assert.deepEqual(on, [21]);
    const dialogs = page.dialogs.length;
    await page.evaluate(CLICK_SEL, btn);
    const off = await page.waitFor(function (d) {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var m = (((db.slots || [])[0] || {}).mgSchedule) || {};
      return JSON.stringify(m[d]) !== '[21]' ? (m[d] || null) : false;
    }, { args: [TODAY], message: 'the MG tab toggle changing again' });
    assert.deepEqual(off, []);
    assert.equal(page.dialogs.length, dialogs, 'turning it off asks nothing');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('MG TAB GUARD: a past date highlights nothing', async tc => {
    const page = await openMGTab(tc, learnDb());
    assert.ok((await page.evaluate(MG_CARDS)).indexOf('21:below') >= 0, 'precondition: today, Guitar is highlighted');
    await page.evaluate(function (setterSrc, value) {
      var set = new Function('return ' + setterSrc)();
      set(document.querySelector('[data-mg-date]'), value);
      return true;
    }, SET_REACT_INPUT, dayFromToday(-1));
    // wait on what renders with the date, then assert
    await page.waitFor(function () { return document.body.textContent.indexOf('past · view only') >= 0; },
      { message: 'the MG tab on a past date' });
    assert.deepEqual((await page.evaluate(MG_CARDS)).filter(c => c.endsWith(':below')), [],
      'yesterday is inside Chapter one, but a past date is view-only: nothing is highlighted');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('PHONE: all four add panels fit a 390px screen', async tc => {
    /* They were a fixed 528px — wider than the phone (NOTES). Each panel is
       measured on its own, since a cap forgotten on one would hide behind
       three that fit. */
    const page = await openHere(tc, 'progress.html', { db: learnDb(), hash: '#schedule', viewport: PHONE });
    await mountSchedule(page);
    const FITS = function (sel) {
      var el = document.querySelector(sel);
      if (!el) return null;
      var r = el.getBoundingClientRect(), vw = document.documentElement.clientWidth;
      return { left: Math.round(r.left), right: Math.round(r.right), vw: vw, fits: r.left >= 0 && r.right <= vw };
    };
    for (const [button, panel] of [['data-dln-open', '[data-dln-panel]'], ['data-day-add-learn', '[data-learn-panel]'],
      ['data-day-add-task', '[data-picker-panel]'], ['data-day-add-core', '[data-core-panel]']]) {
      await page.evaluate(CLICK_SEL, '[' + button + '="' + TODAY + '"]');
      const m = await page.waitFor(FITS, { args: [panel], message: panel + ' on a phone' });
      assert.equal(m.fits, true, panel + ' stays on screen: ' + JSON.stringify(m));
      await page.evaluate(CLICK_SEL, '[' + button + '="' + TODAY + '"]');   // the same button closes it
      await page.waitFor(function (sel) { return !document.querySelector(sel); }, { args: [panel], message: panel + ' closing' });
    }
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  // ── Proposal 17, item 1: a Procedural MM has no SIR ───────────────────────
  /* docs/CONCEPTS.md: a Procedural MM is built through S1–S4 and has no SIR.
     The rule has one definition (milestone-core.js: stageOf, liveSessions) and
     four pages read it:
       - HOME and DOCUMENTATIONS through calendar-core.js — one shared door;
       - PROGRESS through one filter where `sessions` enters the page. Its
         timeline strip, month grid and day panel all read that one prop, so
         they are ONE door, not three — asserted twice, never claimed disjoint;
       - the KNOWLEDGE RECORD through its two drawing memos and stageOf.
     Every surface is asserted separately, and each case's precondition is a
     DECLARATIVE MM drawn on the same surface, so a surface that drew nothing at
     all cannot pass. Seed: 10 Declarative in SIR; 11 Procedural STORED in SIR
     (one that entered SIR before the rule); 12 Procedural stored FINISHED;
     13 Declarative at S4; 14 Procedural at S4. Sessions sit on TODAY, which
     every surface shows by default. Ids are numbers, as nid() mints them. */
  const P17_MMS = () => [
    F.mm(10, 'Declarative Alpha', { type: '1', ksStage: 'sir' }),
    F.mm(11, 'Procedural Beta', { type: '2', ksStage: 'sir', rating: 3 }),
    F.mm(12, 'Procedural Gamma', { type: '2', ksStage: 'finished' }),
    F.mm(13, 'Declarative Delta', { type: '1', ksStage: '4' }),
    F.mm(14, 'Procedural Epsilon', { type: '2', ksStage: '4' })
  ];
  const P17_SESSIONS = () => [
    F.session(201, TODAY, 10),
    F.session(211, TODAY, 11), F.session(212, dayFromToday(3), 11, { repIndex: 1 }),
    F.session(221, dayFromToday(-30), 12, { done: true, finishDate: TODAY, repIndex: 4 })
  ];
  const p17Db = (over = {}) => seedDb(Object.assign({ mms: P17_MMS(), sessions: P17_SESSIONS() }, over));
  const ATTRS = function (sel, attr) {
    return Array.prototype.map.call(document.querySelectorAll(sel), function (e) { return e.getAttribute(attr); });
  };
  const uniq = a => Array.from(new Set(a)).sort();
  const SIR_STRIP = function () {
    var c = Array.prototype.map.call(document.querySelectorAll('.cal-sched-sir'), function (e) { return e.textContent; });
    return c.some(function (x) { return x.indexOf('Declarative Alpha') === 0; }) ? c : false;
  };
  // Open an MM's panel on its KS03 mode, where the phase row and +Lin live.
  const openMMPanel = async (tc, id, db) => {
    const page = await openHere(tc, 'sir-ks02.html', { db: db || p17Db(), hash: withQuery('?mm=' + id, '#ks03') });
    await page.waitFor(function () { return !!document.querySelector('[data-mm-mode="ks03"]'); },
      { message: 'MM ' + id + "'s panel" });
    await page.evaluate(CLICK_SEL, '[data-mm-mode="ks03"]');
    await page.waitFor(function () { return !!document.querySelector('[data-mm-stage-pill]'); },
      { message: 'the phase row' });
    return page;
  };
  const openLinFor = async (tc, id, db) => {
    const page = await openMMPanel(tc, id, db);
    await page.evaluate(CLICK_SEL, '[data-mm-open-lin]');
    await page.waitFor(function () { return !!document.querySelector('[data-lin-option]'); },
      { message: "+LIN's options for MM " + id });
    return page;
  };

  await t.test('P17 HOME: the day preview draws no SIR chip for a Procedural MM', async tc => {
    const page = await openHere(tc, 'index.html', { db: p17Db() });
    await page.waitFor(function (d) { return !!document.querySelector('#cal-grid [data-cal-day="' + d + '"]'); },
      { args: [TODAY], message: "today's cell on the Home calendar" });
    await page.evaluate(CLICK_SEL, '#cal-grid [data-cal-day="' + TODAY + '"]');
    const chips = await page.waitFor(SIR_STRIP, { message: "the Declarative MM's SIR chip — the strip renders at all" });
    assert.deepEqual(chips.filter(c => /Procedural/.test(c)), [],
      'neither the due rep (Beta) nor the one finished today (Gamma) is drawn');
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('P17 DOCUMENTATIONS: a calendar block draws no SIR chip for a Procedural MM', async tc => {
    const page = await openHere(tc, 'documentations.html', {
      db: p17Db({ docPages: [F.docPage('p-1', { blocks: [{ id: 'b-cal', type: 'calendar', hidden: [], scope: 'page' }] })] }),
      hash: '?page=p-1'
    });
    await page.waitFor(function (d) { return !!document.querySelector('[data-cal-day="' + d + '"]'); },
      { args: [TODAY], message: "today's cell in the calendar block" });
    await page.evaluate(CLICK_SEL, '[data-cal-day="' + TODAY + '"]');
    const chips = await page.waitFor(SIR_STRIP, { message: "the Declarative MM's SIR chip — the strip renders at all" });
    assert.deepEqual(chips.filter(c => /Procedural/.test(c)), []);
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('P17 PROGRESS: the Schedule timeline strip draws no SIR badge for a Procedural MM', async tc => {
    const page = await openHere(tc, 'progress.html', { db: p17Db(), hash: '#schedule' });
    await mountSchedule(page);
    await page.waitFor(function () { return !!document.querySelector('[data-sched-sir-badge="10"]'); },
      { message: "the Declarative MM's badge — the strip renders at all" });
    assert.deepEqual(uniq(await page.evaluate(ATTRS, '[data-sched-sir-badge]', 'data-sched-sir-badge')), ['10'],
      'no badge for Beta (today and in three days) or for Gamma (finished today)');
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('P17 PROGRESS: the Schedule month view and its day panel leave them out too', async tc => {
    const page = await openHere(tc, 'progress.html', { db: p17Db(), hash: '#schedule' });
    await mountSchedule(page);
    await page.evaluate(CLICK_SEL, '[data-sched-view="calendar"]');
    await page.waitFor(function (d) {
      return !!document.querySelector('[data-sched-month-day="' + d + '"] [data-sched-sir-dot="10"]');
    }, { args: [TODAY], message: "the Declarative MM's dot on today" });
    assert.deepEqual(uniq(await page.evaluate(ATTRS, '[data-sched-sir-dot]', 'data-sched-sir-dot')), ['10']);
    await page.evaluate(CLICK_SEL, '[data-sched-month-day="' + TODAY + '"]');
    await page.waitFor(function () { return !!document.querySelector('[data-sched-sir-row="10"]'); },
      { message: "today's day panel" });
    assert.deepEqual(uniq(await page.evaluate(ATTRS, '[data-sched-sir-row]', 'data-sched-sir-row')), ['10'],
      'the day panel lists every session on the day, done ones included — still none for Gamma');
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('P17 PROGRESS: the Mind Maps tab reads a Procedural MM stored in SIR or FINISHED as S4', async tc => {
    const page = await openHere(tc, 'progress.html', { db: p17Db(), hash: '#mindmaps' });
    const lbl = await page.waitFor(function () {
      var get = function (id) { var e = document.querySelector('[data-mm-badge-stage="' + id + '"]'); return e ? e.textContent : null; };
      return get(10) ? { 10: get(10), 11: get(11), 12: get(12), 13: get(13), 14: get(14) } : false;
    }, { message: 'the Mind Maps tab badges' });
    assert.deepEqual([lbl[11], lbl[12]], ['S4', 'S4'], 'Beta (stored SIR) and Gamma (stored FINISHED)');
    assert.deepEqual([lbl[10], lbl[13], lbl[14]], ['SIR T1', 'S4', 'S4'], 'everyone else as before');
    assert.deepEqual(await page.evaluate(ATTRS, '[data-mm-tree-sir]', 'data-mm-tree-sir'), ['10'],
      'only the Declarative MM draws its SIR review row');
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('P17 KNOWLEDGE RECORD: its calendar draws no session for a Procedural MM', async tc => {
    const page = await openHere(tc, 'sir-ks02.html', { db: p17Db(), hash: '#calendar' });
    await page.waitFor(function (d) { return !!document.querySelector('[data-ks02-cal-dot="10"][data-day="' + d + '"]'); },
      { args: [TODAY], message: "the Declarative MM's dot on today" });
    assert.deepEqual(uniq(await page.evaluate(ATTRS, '[data-ks02-cal-dot]', 'data-ks02-cal-dot')), ['10']);
    await page.evaluate(CLICK_SEL, '[data-ks02-cal-day="' + TODAY + '"]');
    await page.waitFor(function () { return !!document.querySelector('[data-ks02-cal-session="10"]'); },
      { message: "today's session list" });
    assert.deepEqual(uniq(await page.evaluate(ATTRS, '[data-ks02-cal-session]', 'data-ks02-cal-session')), ['10']);
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('P17 KNOWLEDGE RECORD: the KS02 wheel counts a Procedural MM stored in SIR or FINISHED at S4', async tc => {
    const page = await openHere(tc, 'sir-ks02.html', { db: p17Db(), hash: '#ks02' });
    const counts = await page.waitFor(function () {
      var g = document.querySelectorAll('[data-ks02-stage]');
      if (!g.length) return false;
      var o = {};
      Array.prototype.forEach.call(g, function (e) { o[e.getAttribute('data-ks02-stage')] = Number(e.getAttribute('data-count')); });
      return o;
    }, { message: 'the KS02 wheel' });
    assert.equal(counts.sir, 1, 'only the Declarative MM is in SIR');
    assert.equal(counts['4'], 4, 'Beta and Gamma join Delta and Epsilon at S4');
    assert.deepEqual(await page.evaluate(ATTRS, '[data-ks02-finished-mm]', 'data-ks02-finished-mm'), [],
      'the FINISHED list holds no Procedural MM');
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('P17 KNOWLEDGE RECORD: a Procedural MM\'s phase row ends at S4, and its badge reads S4', async tc => {
    const pills = function () {
      return Array.prototype.map.call(document.querySelectorAll('[data-mm-stage-pill]'), function (e) {
        return e.getAttribute('data-mm-stage-pill') + (e.hasAttribute('aria-current') ? '*' : '');
      });
    };
    const badge = function () { var e = document.querySelector('[data-mm-stage-badge]'); return e ? e.textContent : null; };
    const proc = await openMMPanel(tc, 11);
    assert.deepEqual(await proc.evaluate(pills), ['1', '2', '3', '4*'], 'no SIR pill, and S4 is the current one');
    assert.equal(await proc.evaluate(badge), 'S4');
    // the guard: a Declarative MM's row still runs on to SIR
    const decl = await openMMPanel(tc, 10);
    assert.deepEqual(await decl.evaluate(pills), ['1', '2', '3', '4', 'sir*']);
    assert.equal(await decl.evaluate(badge), 'SIR');
    assert.deepEqual(realErrors(proc), []);
    assert.deepEqual(realErrors(decl), []);
  });

  await t.test('P17 +LIN: a Procedural MM at S4 is offered no Advance → SIR; a Declarative one still is', async tc => {
    const opts = function () { return Array.prototype.map.call(document.querySelectorAll('[data-lin-option]'), function (e) { return e.getAttribute('data-lin-option'); }); };
    const decl = await openLinFor(tc, 13);
    assert.ok((await decl.evaluate(opts)).includes('stageAdvance:sir'), 'the guard: Declarative Delta can still enter SIR');
    const REVERTS = ['stageRevert:3', 'stageRevert:2', 'stageRevert:1'];
    const eps = await openLinFor(tc, 14);
    assert.deepEqual(await eps.evaluate(opts), REVERTS, 'Procedural Epsilon, stored at S4');
    const beta = await openLinFor(tc, 11);
    assert.deepEqual(await beta.evaluate(opts), REVERTS,
      'Procedural Beta, stored in SIR, is offered what S4 offers — no SIR review, no Mark as FINISHED');
    for (const pg of [decl, eps, beta]) assert.deepEqual(realErrors(pg), []);
  });

  // Pick a change in an open +LIN and reach its SAVE button.
  const pickLin = async (page, option) => {
    await page.evaluate(CLICK_SEL, '[data-lin-option="' + option + '"]');
    await page.waitFor(function () { return !!document.querySelector('[data-lin-save]'); }, { message: '+LIN step 3' });
  };

  await t.test('P17 +LIN: moving a Procedural MM stored in SIR asks first, and Cancel writes nothing', async tc => {
    const page = await openLinFor(tc, 11);
    await pickLin(page, 'stageRevert:3');
    const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });
    const dialogsBefore = page.dialogs.length;
    page.rejectDialogs = true;
    await page.evaluate(CLICK_SEL, '[data-lin-save]');
    await sleep(600);
    page.rejectDialogs = false;
    assert.equal(page.dialogs.length, dialogsBefore + 1, 'the save asked, once');
    const msg = page.dialogs[page.dialogs.length - 1];
    assert.match(msg, /"Procedural Beta"/, 'the prompt names the MM');
    assert.match(msg, /2 SIR sessions/, 'and how many hidden sessions would go');
    assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }), before,
      'Cancel left track_db byte-identical');
    assert.equal(await page.evaluate(function () { return !!document.querySelector('[data-lin-save]'); }), true,
      'and +LIN stayed open on its last step');
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('P17 +LIN: accepting deletes that MM\'s hidden sessions, and nobody else\'s', async tc => {
    const page = await openLinFor(tc, 11);
    await pickLin(page, 'stageRevert:3');
    const dialogsBefore = page.dialogs.length;
    await page.evaluate(CLICK_SEL, '[data-lin-save]');
    const slot = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var s = (db.slots || [])[0] || {};
      var mm = (s.mms || []).filter(function (m) { return m.id === 11; })[0];
      return mm && mm.ksStage !== 'sir' ? s : false;
    }, { message: "the move landing in track_db" });
    assert.equal(page.dialogs.length, dialogsBefore + 1, 'it asked first');
    assert.equal(slot.mms.find(m => m.id === 11).ksStage, '3');
    assert.deepEqual(slot.sessions.map(x => x.id).sort((a, b) => a - b), [201, 221],
      "Beta's two sessions are gone; Alpha's and Gamma's are untouched");
    const rec = slot.linChanges[slot.linChanges.length - 1];
    assert.deepEqual(rec.items.map(i => i.change), [{ type: 'stageRevert', oldValue: '4', newValue: '3' }],
      'the history reads S4 → S3, the phase the user saw');
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('P17 +LIN: a Procedural MM with no hidden SIR moves without a prompt', async tc => {
    const page = await openLinFor(tc, 14);
    await pickLin(page, 'stageRevert:3');
    const dialogsBefore = page.dialogs.length;
    await page.evaluate(CLICK_SEL, '[data-lin-save]');
    await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var mm = (((db.slots || [])[0] || {}).mms || []).filter(function (m) { return m.id === 14; })[0];
      return mm && mm.ksStage === '3';
    }, { message: "Epsilon's move landing" });
    assert.equal(page.dialogs.length, dialogsBefore, 'nothing hidden to delete, so nothing to ask');
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('P17 RESTORE: switching a Procedural MM back to Declarative brings SIR and its sessions back', async tc => {
    const page = await openMMPanel(tc, 11);
    await page.evaluate(CLICK_SEL, '[data-mm-type-to="1"]');
    await page.waitFor(function () { return !!document.querySelector('[data-mm-type-confirm]'); }, { message: 'the type-change confirm' });
    await page.evaluate(CLICK_SEL, '[data-mm-type-confirm]');
    const slot = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var s = (db.slots || [])[0] || {};
      var mm = (s.mms || []).filter(function (m) { return m.id === 11; })[0];
      return mm && mm.type === '1' ? s : false;
    }, { message: 'the type change landing in track_db' });
    assert.equal(slot.mms.find(m => m.id === 11).ksStage, 'sir', 'its stored stage was never rewritten');
    assert.deepEqual(slot.sessions.filter(x => x.mmId === 11).map(x => x.id).sort(), [211, 212], 'nor were its sessions');
    const cal = await openHere(tc, 'sir-ks02.html', { hash: '#calendar', fresh: false });
    await cal.waitFor(function (d) { return !!document.querySelector('[data-ks02-cal-dot="11"][data-day="' + d + '"]'); },
      { args: [TODAY], message: "Beta's session back on today" });
    assert.deepEqual(realErrors(page), []);
    assert.deepEqual(realErrors(cal), []);
  });

  // ── Proposal 17, item 3: a Procedural MM is judged by its level alone ─────
  /* A Procedural MM's progress toward a goal is its MG level; a phase-only
     target is NO target, and a stored phase target is kept, unread. One goal
     learns three MMs, with string mmTargets keys as JSON stores them and NUMBER
     toLearn ids as nid() mints them:
       11 Procedural, S2, rating 3, target {S4, level 3}  — met by its level
       15 Procedural, S1, target {S3} only                 — no target
       10 Declarative, S2, target {S4}                    — half way
     The goal also holds one DONE task, because the hero ring averages task
     progress with MM progress and a goal with no tasks is its own undone leaf.
     So: MM progress 75% (it was 52.8% with the phase read for all three), task
     progress 100%, and the ring reads 88% — it read 76%. The case asserts the
     number, never "looks changed". */
  const p17LearnDb = () => seedDb({
    mms: [F.mm(10, 'Declarative Alpha', { type: '1', ksStage: '2' }),
      F.mm(11, 'Procedural Beta', { type: '2', ksStage: '2', rating: 3 }),
      F.mm(15, 'Procedural Zeta', { type: '2', ksStage: '1', rating: 1 })],
    sessions: [],
    goals: [F.task('g-p17', { title: 'Learn three', toLearn: [11, 15, 10],
      children: [F.task('t-p17-done', { completed: true })], questLearn: [11, 15, 10],
      mmTargets: { '11': { stage: '4', level: 3 }, '15': { stage: '3' }, '10': { stage: '4' } } })]
  });
  const openLearnGoal = async tc => {
    const page = await openHere(tc, 'progress.html', { db: p17LearnDb() });
    await page.waitFor(function () {
      return !!document.querySelector('[data-learn-row="10"]') && !!document.querySelector('[data-goal-hero-pct]');
    }, { message: "the goal's to-learn rows and its hero ring" });
    return page;
  };
  const LEARN_ROW = function (id) {
    var r = document.querySelector('[data-learn-row="' + id + '"]');
    if (!r) return null;
    var ind = r.querySelector('[data-learn-indicator]');
    return {
      stageSelect: !!r.querySelector('[data-learn-stage]'),
      bars: Array.prototype.map.call(r.querySelectorAll('[data-learn-bar]'), function (b) { return b.getAttribute('data-learn-bar'); }),
      indicator: ind ? ind.getAttribute('data-learn-indicator') : null
    };
  };

  await t.test('P17 ITEM 3: a goal\'s percentage reads a Procedural MM by its level, and drops a phase-only target', async tc => {
    const page = await openLearnGoal(tc);
    assert.equal(await page.evaluate(function () { return document.querySelector('[data-goal-hero-pct]').textContent; }), '88%',
      'Beta counts as met (level 3 of 3), Zeta drops out, Alpha is half way: (100 + 75) / 2 — it read 76% with the phase counted');
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('P17 ITEM 3: a Procedural MM\'s to-learn row has only the MG bar and no phase target', async tc => {
    const page = await openLearnGoal(tc);
    assert.deepEqual(await page.evaluate(LEARN_ROW, 11), { stageSelect: false, bars: ['MG'], indicator: 'met' },
      'Beta: no stage select, no KS02 bar, met by its level though S2 is short of S4');
    assert.deepEqual(await page.evaluate(LEARN_ROW, 15), { stageSelect: false, bars: [], indicator: 'none' },
      'Zeta: its phase-only target is no target');
    assert.deepEqual(await page.evaluate(LEARN_ROW, 10), { stageSelect: true, bars: ['KS02'], indicator: 'open' },
      'the guard: a Declarative row is as it was');
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('P17 ITEM 3: editing a Procedural MM\'s level keeps its stored phase target', async tc => {
    const page = await openLearnGoal(tc);
    await page.evaluate(function (setterSrc) {
      var set = new Function('return ' + setterSrc)();
      set(document.querySelector('[data-learn-row="11"] input[placeholder="lvl"]'), '4');
      return true;
    }, SET_REACT_INPUT);
    const tgt = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var g = (((db.slots || [])[0] || {}).goals || [])[0];
      var t = g && (g.mmTargets || {})['11'];
      return t && t.level === 4 ? t : false;
    }, { message: 'the new level landing in track_db' });
    assert.deepEqual(tgt, { stage: '4', level: 4 }, 'the phase target is still stored, unread');
    assert.deepEqual(realErrors(page), []);
  });

  /* The same rule is read at FIVE more places on this page, each its own call
     to targetOf — a forgotten one would hide behind a passing sibling, so each
     is asserted, and each has a doctored baseline that fails on its own line:
     the goal node's TO LEARN bar (whole MMs met), the goal panel's count and
     its per-MM list, the header's overall percentage, the Quest tab's learn
     rows, and a subgoal's "learned" count in the BY SUBGOAL view. */
  await t.test('P17 ITEM 3: the goal node, goal panel and header all count the same targets', async tc => {
    const page = await openLearnGoal(tc);
    const read = await page.evaluate(function () {
      var txt = function (sel) { var e = document.querySelector(sel); return e ? e.textContent.trim() : null; };
      var list = {};
      Array.prototype.forEach.call(document.querySelectorAll('[data-panel-learn]'), function (e) {
        list[e.getAttribute('data-panel-learn')] = e.getAttribute('data-state');
      });
      var node = document.querySelector('[data-node-learn]');
      return { node: node ? node.getAttribute('data-node-learn') : null, count: txt('[data-panel-learn-count]'),
        list: list, header: txt('[data-app-pct]') };
    });
    assert.equal(read.node, '1/2', 'goal node TO LEARN: Beta met, Alpha not, Zeta not a target');
    assert.equal(read.count, '1.5/2 targets met', 'goal panel count: Beta 1 + Alpha 0.5, of two');
    assert.deepEqual(read.list, { 10: 'open', 11: 'met', 15: 'none' }, 'goal panel list');
    assert.equal(read.header, '88%', 'header: one done task, and MM progress 75%');
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('P17 ITEM 3: the Quest tab\'s learn rows read the same targets', async tc => {
    const page = await openHere(tc, 'progress.html', { db: p17LearnDb(), hash: '#quest' });
    const states = await page.waitFor(function () {
      var rows = document.querySelectorAll('[data-quest-learn-row]');
      if (rows.length < 3) return false;
      var o = {};
      Array.prototype.forEach.call(rows, function (r) {
        var st = r.querySelector('[data-quest-learn-state]');
        o[r.getAttribute('data-quest-learn-row')] = st ? st.getAttribute('data-quest-learn-state') : null;
      });
      return o;
    }, { message: "the goal's three quest learn rows" });
    assert.deepEqual(states, { 'g-p17:10': 'open', 'g-p17:11': 'met', 'g-p17:15': 'none' });
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('P17 ITEM 3: a subgoal\'s "learned" count reads the same targets', async tc => {
    const db = p17LearnDb();
    const g = db.slots[0].goals[0];
    db.slots[0].goals = [F.task('g-p17c', { title: 'Container', children: [Object.assign({}, g, { id: 'sg-p17', isSubGoal: true })] })];
    const page = await openHere(tc, 'progress.html', { db });
    const txt = await page.waitFor(function () {
      var e = document.querySelector('[data-subgoal-learn="sg-p17"]');
      return e ? e.textContent.trim() : false;
    }, { message: "the subgoal's learned count in BY SUBGOAL" });
    assert.equal(txt, '1.5/2 learned');
    assert.deepEqual(realErrors(page), []);
  });

  // ── Proposal 17, item 2: a new Kolb sends a Procedural MM back to S1 ──────
  /* The user's rule: a reflection brings new information, which has to be built
     into the MM again. Only SAVING a new Kolb resets; closing the form does not,
     and an MM unassigned or already at S1 is left alone. The reset is a LIN
     change of its own type, `kolbReset`, which the streak does not count. A
     Procedural MM still STORED in SIR holds hidden sessions the reset would
     delete, so that save asks first (item 1's rule), and Cancel writes nothing.
     Seed: 11 Procedural stored in SIR with two sessions; 16 Procedural at S3;
     17 Procedural at S1. */
  const p17KolbDb = () => seedDb({
    mms: [F.mm(11, 'Procedural Beta', { type: '2', ksStage: 'sir' }),
      F.mm(16, 'Procedural Theta', { type: '2', ksStage: '3' }),
      F.mm(17, 'Procedural Iota', { type: '2', ksStage: '1' })],
    sessions: [F.session(211, TODAY, 11), F.session(212, dayFromToday(3), 11, { repIndex: 1 })]
  });
  // From an MM's panel: MG mode → + NEW KOLB → through to the last step.
  const openKolbFor = async (tc, id) => {
    const page = await openHere(tc, 'sir-ks02.html', { db: p17KolbDb(), hash: withQuery('?mm=' + id, '#ks03') });
    await page.waitFor(function () { return !!document.querySelector('[data-mm-mode="mg"]'); }, { message: 'MM ' + id + "'s panel" });
    await page.evaluate(CLICK_SEL, '[data-mm-mode="mg"]');
    await page.waitFor(function () { return !!document.querySelector('[data-mm-new-kolb]'); }, { message: 'the new-Kolb button' });
    await page.evaluate(CLICK_SEL, '[data-mm-new-kolb]');
    for (let i = 0; i < 3; i++) {
      await page.waitFor(function () { return !!document.querySelector('[data-kolb-next]'); }, { message: 'Kolb step ' + (i + 1) });
      await page.evaluate(CLICK_SEL, '[data-kolb-next]');
    }
    await page.waitFor(function () { return !!document.querySelector('[data-kolb-save]'); }, { message: 'the Kolb SAVE step' });
    return page;
  };
  const READ_P17_SLOT = function () {
    var db = JSON.parse(localStorage.getItem('track_db') || '{}');
    return (db.slots || [])[0] || {};
  };

  await t.test('P17 KOLB: saving a new Kolb sends a Procedural MM at S3 back to S1, logged as a reset', async tc => {
    const page = await openKolbFor(tc, 16);
    const before = await page.evaluate(READ_P17_SLOT);
    await page.evaluate(CLICK_SEL, '[data-kolb-save]');
    const slot = await page.waitFor(function () {
      var s = JSON.parse(localStorage.getItem('track_db') || '{}').slots[0];
      return (s.kolbs || []).length > 2 ? s : false;
    }, { message: 'the Kolb landing in track_db' });
    assert.equal(slot.mms.find(m => m.id === 16).ksStage, '1', 'Theta went back to S1');
    const kolb = slot.kolbs[slot.kolbs.length - 1];
    assert.equal(kolb.mmId, 16);
    assert.equal(slot.linChanges.length, before.linChanges.length + 1, 'one LIN record');
    assert.deepEqual(slot.linChanges[slot.linChanges.length - 1].items,
      [{ mmId: 16, change: { type: 'kolbReset', oldValue: '3', newValue: '1', kolbId: kolb.id } }]);
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('P17 KOLB: closing the Kolb form without saving resets nothing', async tc => {
    const page = await openKolbFor(tc, 16);
    const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });
    await page.evaluate(CLICK_SEL, '[data-kolb-close]');
    await page.waitFor(function () { return !document.querySelector('[data-kolb-save]'); }, { message: 'the form closing' });
    await sleep(600);
    assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }), before,
      'track_db is byte-identical');
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('P17 KOLB: a Procedural MM already at S1 is left alone — no reset, no LIN record', async tc => {
    const page = await openKolbFor(tc, 17);
    const before = await page.evaluate(READ_P17_SLOT);
    await page.evaluate(CLICK_SEL, '[data-kolb-save]');
    const slot = await page.waitFor(function () {
      var s = JSON.parse(localStorage.getItem('track_db') || '{}').slots[0];
      return (s.kolbs || []).length > 2 ? s : false;
    }, { message: 'the Kolb landing in track_db' });
    assert.equal(slot.mms.find(m => m.id === 17).ksStage, '1');
    assert.deepEqual(slot.linChanges, before.linChanges, 'nothing to reset, so nothing logged');
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('P17 KOLB: a Procedural MM still stored in SIR asks first, and Cancel saves nothing', async tc => {
    const page = await openKolbFor(tc, 11);
    const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });
    const dialogsBefore = page.dialogs.length;
    page.rejectDialogs = true;
    await page.evaluate(CLICK_SEL, '[data-kolb-save]');
    await sleep(600);
    page.rejectDialogs = false;
    assert.equal(page.dialogs.length, dialogsBefore + 1, 'the save asked, once');
    assert.match(page.dialogs[page.dialogs.length - 1], /"Procedural Beta" back to S1[\s\S]*2 SIR sessions/);
    assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }), before,
      'Cancel wrote nothing — not even the Kolb');
    assert.equal(await page.evaluate(function () { return !!document.querySelector('[data-kolb-save]'); }), true,
      'and the form stayed open');
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('P17 KOLB: accepting resets it, deletes its hidden sessions, and logs the S4 it showed', async tc => {
    const page = await openKolbFor(tc, 11);
    await page.evaluate(CLICK_SEL, '[data-kolb-save]');
    const slot = await page.waitFor(function () {
      var s = JSON.parse(localStorage.getItem('track_db') || '{}').slots[0];
      return (s.kolbs || []).length > 2 ? s : false;
    }, { message: 'the Kolb landing in track_db' });
    assert.equal(slot.mms.find(m => m.id === 11).ksStage, '1');
    assert.deepEqual(slot.sessions.filter(x => x.mmId === 11), [], "Beta's hidden sessions are gone");
    const change = slot.linChanges[slot.linChanges.length - 1].items[0].change;
    assert.equal(change.type, 'kolbReset');
    assert.equal(change.oldValue, '4', 'the phase the user saw');
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('P17 KOLB: the streak does not count a reset, and still counts an advance', async tc => {
    /* LIN records carry KS02's today(), which is a UTC day — NOTES Proposal 3 —
       and the streak reads the same UTC day, so the fixture uses one too. */
    const utcToday = new Date().toISOString().split('T')[0];
    const reset = { id: 901, date: utcToday, title: utcToday,
      items: [{ mmId: 16, change: { type: 'kolbReset', oldValue: '3', newValue: '1', kolbId: 900 } }] };
    const advance = { id: 902, date: utcToday, title: utcToday,
      items: [{ mmId: 17, change: { type: 'stageAdvance', oldValue: '1', newValue: '2' } }] };
    const streakOf = async lin => {
      const db = p17KolbDb(); db.slots[0].linChanges = lin;
      const page = await openHere(tc, 'progress.html', { db });
      await page.waitFor(function () { var e = document.querySelector('#root'); return !!e && e.children.length > 0; },
        { message: 'progress.html mounting' });
      await page.waitFor(function () { return !!document.querySelector('[data-app-pct]'); }, { message: 'the header' });
      const n = await page.evaluate(function () { var e = document.querySelector('.streak-fire-num'); return e ? e.textContent : null; });
      assert.deepEqual(realErrors(page), []);
      return n;
    };
    assert.equal(await streakOf([reset]), null, 'a day holding only a reset is no streak day');
    assert.equal(await streakOf([advance]), '1', 'the guard: an advance on the same day still counts');
  });

  /* The user's answer of 2026-10-13: an OLD Kolb moved onto a Procedural MM
     counts as a new one there. Moving it from another MM, or linking a free
     one, is an arrival and resets exactly as saving a new Kolb does — the same
     kolbResetPlan / applyKolbReset. Saving an edit that keeps the Kolb where it
     was is not, and `dupe` still is not. */
  const p17MoveDb = () => {
    const db = p17KolbDb();
    db.slots[0].kolbs = [F.kolb(301, '2026-10-01', { mmId: 17 }), F.kolb(302, '2026-10-01'),
      F.kolb(303, '2026-10-01', { mmId: 16 }), F.kolb(304, '2026-10-01', { mmId: 17 })];
    return db;
  };
  // KOLB tab → the Kolb → pick an MM link → SAVE CHANGES.
  const editKolbLink = async (tc, kolbId, link) => {
    const page = await openHere(tc, 'sir-ks02.html', { db: p17MoveDb(), hash: '#kolb' });
    await page.waitFor(function (id) { return !!document.querySelector('[data-kolb-row="' + id + '"]'); },
      { args: [kolbId], message: 'Kolb ' + kolbId + ' on the KOLB tab' });
    await page.evaluate(CLICK_SEL, '[data-kolb-row="' + kolbId + '"]');
    await page.waitFor(function (l) { return !!document.querySelector('[data-kolb-link="' + l + '"]'); },
      { args: [String(link)], message: "the edit view's MM link list" });
    await page.evaluate(CLICK_SEL, '[data-kolb-link="' + link + '"]');
    return page;
  };
  const KOLB_ON = function (id) {
    var s = JSON.parse(localStorage.getItem('track_db') || '{}').slots[0];
    var k = (s.kolbs || []).filter(function (x) { return x.id === id; })[0];
    return k ? k.mmId : 'missing';
  };

  await t.test('P17 KOLB MOVE: moving an old Kolb onto a Procedural MM at S3 sends it back to S1', async tc => {
    const page = await editKolbLink(tc, 301, 16);
    const linBefore = (await page.evaluate(READ_P17_SLOT)).linChanges.length;
    await page.evaluate(CLICK_SEL, '[data-kolb-edit-save]');
    await page.waitFor(function (f) { return new Function('return ' + f)()(301) === 16; },
      { args: [KOLB_ON.toString()], message: 'the move landing in track_db' });
    const slot = await page.evaluate(READ_P17_SLOT);
    assert.equal(slot.mms.find(m => m.id === 16).ksStage, '1', 'Theta went back to S1');
    assert.equal(slot.linChanges.length, linBefore + 1);
    assert.deepEqual(slot.linChanges[slot.linChanges.length - 1].items,
      [{ mmId: 16, change: { type: 'kolbReset', oldValue: '3', newValue: '1', kolbId: 301 } }],
      'logged with the moved Kolb\'s own id');
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('P17 KOLB MOVE: linking a free Kolb onto a Procedural MM counts too', async tc => {
    const page = await editKolbLink(tc, 302, 16);
    await page.evaluate(CLICK_SEL, '[data-kolb-edit-save]');
    await page.waitFor(function (f) { return new Function('return ' + f)()(302) === 16; },
      { args: [KOLB_ON.toString()], message: 'the link landing in track_db' });
    const slot = await page.evaluate(READ_P17_SLOT);
    assert.equal(slot.mms.find(m => m.id === 16).ksStage, '1');
    assert.equal(slot.linChanges[slot.linChanges.length - 1].items[0].change.kolbId, 302);
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('P17 KOLB MOVE: saving an edit that keeps the Kolb where it was resets nothing', async tc => {
    const page = await editKolbLink(tc, 303, 16);   // Theta, already its MM
    const before = await page.evaluate(READ_P17_SLOT);
    await page.evaluate(CLICK_SEL, '[data-kolb-edit-save]');
    await page.waitFor(function () { return !document.querySelector('[data-kolb-unsaved]'); },
      { message: 'the save completing' });
    await sleep(600);
    const slot = await page.evaluate(READ_P17_SLOT);
    assert.equal(slot.mms.find(m => m.id === 16).ksStage, '3', 'Theta stays at S3');
    assert.deepEqual(slot.linChanges, before.linChanges, 'nothing logged');
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('P17 KOLB MOVE: onto a Procedural MM stored in SIR it asks first; Cancel saves nothing, OK resets', async tc => {
    const page = await editKolbLink(tc, 304, 11);
    const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });
    const dialogsBefore = page.dialogs.length;
    page.rejectDialogs = true;
    await page.evaluate(CLICK_SEL, '[data-kolb-edit-save]');
    await sleep(600);
    page.rejectDialogs = false;
    assert.equal(page.dialogs.length, dialogsBefore + 1, 'the save asked, once');
    assert.match(page.dialogs[page.dialogs.length - 1], /^Moving this Kolb sends "Procedural Beta" back to S1[\s\S]*2 SIR sessions/);
    assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }), before,
      'Cancel wrote nothing — the Kolb did not move');
    assert.equal(await page.evaluate(function () { return !!document.querySelector('[data-kolb-unsaved]'); }), true,
      'and the edit is still marked unsaved');
    // now accept
    await page.evaluate(CLICK_SEL, '[data-kolb-edit-save]');
    await page.waitFor(function (f) { return new Function('return ' + f)()(304) === 11; },
      { args: [KOLB_ON.toString()], message: 'the move landing in track_db' });
    const slot = await page.evaluate(READ_P17_SLOT);
    assert.equal(slot.mms.find(m => m.id === 11).ksStage, '1');
    assert.deepEqual(slot.sessions.filter(x => x.mmId === 11), [], "Beta's hidden sessions are gone");
    assert.equal(slot.linChanges[slot.linChanges.length - 1].items[0].change.oldValue, '4');
    assert.deepEqual(realErrors(page), []);
  });

  /* ── 19. Found along the way, fixed 2026-10-14 ───────────────────────────
     Four bugs NOTES listed as found and left out, fixed together. One door per
     case wherever the design has one; the doctored baselines, and the cases
     that share a door, are in docs/VERIFICATION-LOG.md. Mind-map ids are
     NUMBERS and mmTargets keys are STRINGS, exactly as stored. */

  // Waits for `sel` OR an uncaught error, whichever comes first, then asserts
  // there was no error — so a dead render reports its RangeError instead of a
  // timeout that reads like a missing selector.
  const renderedOrError = async (page, sel, what) => {
    const until = Date.now() + 30000;
    while (Date.now() < until) {
      if (realErrors(page).length) break;
      if (await page.evaluate(function (s) { return !!document.querySelector(s); }, sel)) break;
      await sleep(100);
    }
    assert.deepEqual(realErrors(page), [], what + ': no uncaught error');
    assert.equal(await page.evaluate(function (s) { return !!document.querySelector(s); }, sel), true, what);
  };
  const GOAL_STATE = function (id) {
    var n = document.querySelector('[data-goal-node="' + id + '"]');
    if (!n) return null;
    var ring = n.querySelector('[data-mm-auto]');
    return { done: n.getAttribute('data-goal-done'), ring: ring ? ring.getAttribute('data-mm-auto') : null };
  };

  // ── bug 2: a goal's mind-map targets are found, and done needs its tasks ──
  /* Five sub-goals of one container, each learning one MM: 20 Declarative at
     S4, 21 at S2, 22 in SIR with two reviews done. The old code looked each
     target up by its STRING key against NUMERIC ids, found nothing, and read
     every one of these as 0/1 and undone. */
  const AUTO_MMS = () => [
    F.mm(20, 'Auto Alpha', { type: '1', ksStage: '4' }),
    F.mm(21, 'Auto Beta', { type: '1', ksStage: '2' }),
    F.mm(22, 'Auto Gamma', { type: '1', ksStage: 'sir' })
  ];
  const AUTO_SESSIONS = () => [
    F.session(401, dayFromToday(-10), 22, { done: true, repIndex: 0 }),
    F.session(402, dayFromToday(-5), 22, { done: true, repIndex: 1 }),
    F.session(403, dayFromToday(5), 22, { repIndex: 2 })
  ];
  const autoSub = (id, mmId, target, children) => F.task(id, {
    title: 'Sub ' + id, isSubGoal: true, toLearn: [mmId],
    mmTargets: { [String(mmId)]: target }, children: children || []
  });
  const autoDb = () => seedDb({
    mms: AUTO_MMS(), sessions: AUTO_SESSIONS(),
    goals: [F.task('g-auto', { title: 'Auto container', children: [
      autoSub('sg-met', 20, { stage: '4' }),
      autoSub('sg-open', 20, { stage: '4' }, [F.task('t-auto-open', { title: 'Still open' })]),
      autoSub('sg-shut', 20, { stage: '4' }, [F.task('t-auto-done', { title: 'Finished', completed: true })]),
      autoSub('sg-sir', 22, { stage: 'sir2' }),
      autoSub('sg-short', 21, { stage: '4' })
    ] })]
  });
  const openAuto = async tc => {
    const page = await openHere(tc, 'progress.html', { db: autoDb() });
    await renderedOrError(page, '[data-goal-node="sg-short"]', 'the five sub-goals');
    return page;
  };

  await t.test('AUTO: a goal finds its numeric-id mind map, and with no tasks is done by its target', async tc => {
    const page = await openAuto(tc);
    assert.deepEqual(await page.evaluate(GOAL_STATE, 'sg-met'), { done: '1', ring: '1/1' },
      'Alpha is at S4, its target — the ring read 0/1 and the goal stayed undone');
    assert.deepEqual(await page.evaluate(GOAL_STATE, 'sg-short'), { done: '0', ring: '0/1' },
      'the guard: Beta at S2 is short of S4');
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('AUTO: met targets do not finish a goal whose tasks are still open', async tc => {
    const page = await openAuto(tc);
    assert.deepEqual(await page.evaluate(GOAL_STATE, 'sg-open'), { done: '0', ring: '1/1' },
      'the target is met, but "Still open" is not — the user\'s rule: tasks too');
    assert.deepEqual(await page.evaluate(GOAL_STATE, 'sg-shut'), { done: '1', ring: '1/1' },
      'the same target with its one task finished is done');
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('AUTO: the ring counts SIR reviews exactly as done does', async tc => {
    const page = await openAuto(tc);
    assert.deepEqual(await page.evaluate(GOAL_STATE, 'sg-sir'), { done: '1', ring: '1/1' },
      'two reviews done meets a SIR 2 target — the ring used to ignore the reviews and read 0/1 beside a done goal');
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('AUTO: the header counts a task-less goal whose target is met', async tc => {
    const db = seedDb({ mms: AUTO_MMS(), sessions: [],
      goals: [F.task('g-leaf', { title: 'Leaf goal', toLearn: [20], mmTargets: { '20': { stage: '4' } } })] });
    const page = await openHere(tc, 'progress.html', { db });
    await renderedOrError(page, '[data-app-pct]', 'the header');
    assert.equal(await page.evaluate(function () { return document.querySelector('[data-app-pct]').textContent.trim(); }), '100%',
      'the goal is its own leaf and it is done: (100 + 100) / 2 — it read 50%');
    assert.deepEqual(realErrors(page), []);
  });

  // ── bug 3: a link back up the tree is drawn once, never followed round ────
  /* G > A > B > (link → A): what the old "link existing task" picker let a user
     build by linking a task under its own descendant. Every surface that walked
     it recursed until the stack gave out and the page went blank. */
  const LOOP_TASKS = () => [F.task('lp-a', { title: 'Loop A', children: [
    F.task('lp-b', { title: 'Loop B', children: [{ id: 'lp-link', linkedTaskId: 'lp-a', isLink: true }] })
  ] })];
  const loopDb = () => seedDb({ goals: [F.task('g-loop', { title: 'Loop goal', children: LOOP_TASKS() })] });
  const READ_GOALS = function () {
    var db = JSON.parse(localStorage.getItem('track_db') || '{}');
    return ((db.slots || [])[0] || {}).goals || [];
  };

  await t.test('LOOP GOALS: a task linked under its own descendant is drawn once, as a loop row', async tc => {
    const page = await openHere(tc, 'progress.html', { db: loopDb() });
    await renderedOrError(page, '[data-link-loop="lp-link"]', 'the loop row in the goal tree');
    assert.match(await page.evaluate(function () { return document.querySelector('[data-link-loop="lp-link"]').textContent; }),
      /Loop A/, 'it names the task it leads back to');
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('LOOP GOALS: the loop row unlinks — Cancel writes nothing, OK removes only the link', async tc => {
    const page = await openHere(tc, 'progress.html', { db: loopDb() });
    await renderedOrError(page, '[data-link-loop="lp-link"] button', "the loop row's unlink");
    const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });
    const dialogsBefore = page.dialogs.length;
    page.rejectDialogs = true;
    await page.evaluate(CLICK_SEL, '[data-link-loop="lp-link"] button');
    await sleep(600);
    page.rejectDialogs = false;
    assert.equal(page.dialogs.length, dialogsBefore + 1, 'the unlink asked, once');
    assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }), before,
      'Cancel left track_db byte-identical');
    await page.evaluate(CLICK_SEL, '[data-link-loop="lp-link"] button');
    const goals = await page.waitFor(function (f) {
      var g = new Function('return ' + f)()();
      var b = g[0] && g[0].children[0] && g[0].children[0].children[0];
      return b && b.children.length === 0 ? g : false;
    }, { args: [READ_GOALS.toString()], message: 'the unlink landing in track_db' });
    assert.deepEqual(goals[0].children[0].children.map(c => c.id), ['lp-b'], 'Loop B itself is kept');
    assert.equal(await page.evaluate(function () { return !!document.querySelector('[data-link-loop]'); }), false);
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('LOOP GOALS: a goal linked under its own sub-goal is drawn once, as a loop row', async tc => {
    const db = seedDb({ goals: [F.task('g-top', { title: 'Top goal', children: [
      F.task('sg-x', { title: 'Sub X', isSubGoal: true,
        children: [{ id: 'sg-link', linkedTaskId: 'g-top', isLink: true, isSubGoal: true }] })
    ] })] });
    const page = await openHere(tc, 'progress.html', { db });
    await renderedOrError(page, '[data-link-loop="sg-link"]', 'the loop row under the sub-goal');
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('LOOP MILESTONES: a loop under a milestone block is drawn once in the Milestones tab', async tc => {
    const db = seedDb({ goals: [F.task('g-loopm', { title: 'Loop milestone goal',
      milestones: [F.milestone('ms-loop', TODAY, dayFromToday(7), { title: 'Loop milestone' })],
      children: [msBlock('blk-loop', 'ms-loop', LOOP_TASKS())] })] });
    const page = await openHere(tc, 'progress.html', { db, hash: '#milestones' });
    await renderedOrError(page, '[data-ms-row="g-loopm|ms-loop"] [data-link-loop="lp-link"]',
      "the loop row in the milestone's task list");
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('LOOP SCHEDULE: the Schedule mounts over a loop', async tc => {
    const page = await openHere(tc, 'progress.html', { db: loopDb(), hash: '#schedule' });
    await renderedOrError(page, '[data-dln-open]', 'the schedule timeline day headers');
    assert.deepEqual(realErrors(page), []);
  });

  /* Two mind maps that are each other's parent. With a root above them the
     to-learn tree recursed forever; with no root at all, neither was reached
     and both silently vanished from the list. Each has a phase, because the
     Mind Maps tab draws its `data-mm-badge-stage` hook only for one that does. */
  const mmLoopDb = rootless => seedDb({
    mms: [F.mm(30, 'Cycle One', { ksStage: '1', parentIds: rootless ? [31] : [32, 31] }),
      F.mm(31, 'Cycle Two', { ksStage: '1', parentIds: [30] }), F.mm(32, 'Cycle Root', { ksStage: '1' })],
    sessions: [],
    goals: [F.task('g-mmloop', { title: 'Learn a cycle', toLearn: rootless ? [30, 31] : [32, 30, 31] })]
  });
  const LEARN_ROWS = function () {
    return Array.prototype.map.call(document.querySelectorAll('[data-learn-row]'), function (e) {
      return e.getAttribute('data-learn-row');
    }).sort();
  };

  await t.test('LOOP TO LEARN: a parent cycle under a root mind map is drawn once', async tc => {
    const page = await openHere(tc, 'progress.html', { db: mmLoopDb(false) });
    await renderedOrError(page, '[data-learn-row="31"]', "the cycle's second mind map");
    assert.deepEqual(await page.evaluate(LEARN_ROWS), ['30', '31', '32'], 'Root > One > Two, and Two is not drawn round again');
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('LOOP TO LEARN: a parent cycle with no root still shows every mind map', async tc => {
    const page = await openHere(tc, 'progress.html', { db: mmLoopDb(true) });
    await renderedOrError(page, '[data-goal-node="g-mmloop"]', 'the goal');
    assert.deepEqual(await page.evaluate(LEARN_ROWS), ['30', '31'], 'both rows — they used to vanish');
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('LOOP MIND MAPS: the Mind Maps tab draws a parent cycle once', async tc => {
    const page = await openHere(tc, 'progress.html', { db: mmLoopDb(false), hash: '#mindmaps' });
    await renderedOrError(page, '[data-mm-badge-stage="31"]', "the cycle's second mind map in the tree");
    assert.deepEqual(realErrors(page), []);
  });

  /* The pickers stop offering a link that would loop. One sub-goal, Y, under
     goal S, holding A > B and C; a second goal elsewhere holds D. */
  const pickDb = () => seedDb({ goals: [
    F.task('g-pks', { title: 'Pick goal S', children: [
      F.task('sg-y', { title: 'Sub Y', isSubGoal: true, children: [
        F.task('pk-a', { title: 'Pick A', children: [F.task('pk-b', { title: 'Pick B' })] }),
        F.task('pk-c', { title: 'Pick C' })
      ] })
    ] }),
    F.task('g-pko', { title: 'Pick goal O', children: [F.task('pk-d', { title: 'Pick D' })] })
  ] });
  const PICKS = function () {
    return Array.prototype.map.call(document.querySelectorAll('[data-link-pick]'), function (e) {
      return e.getAttribute('data-link-pick');
    }).sort();
  };

  await t.test('LOOP PICKER: "link existing task" leaves out a task\'s own ancestors', async tc => {
    const page = await openHere(tc, 'progress.html', { db: pickDb() });
    await renderedOrError(page, '[data-link-task-open="pk-b"]', "Pick B's link button");
    await page.evaluate(CLICK_SEL, '[data-link-task-open="pk-b"]');
    const picks = await page.waitFor(function (f) {
      var p = new Function('return ' + f)()();
      return p.length ? p : false;
    }, { args: [PICKS.toString()], message: 'the task picker' });
    assert.deepEqual(picks, ['pk-c', 'pk-d'], 'Pick A holds Pick B, so linking it under B would loop');
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('LOOP PICKER: "link sub-goal" leaves out the goal a sub-goal sits in', async tc => {
    const page = await openHere(tc, 'progress.html', { db: pickDb() });
    await renderedOrError(page, '[data-link-goal-open="sg-y"]', "Sub Y's link button");
    await page.evaluate(CLICK_SEL, '[data-link-goal-open="sg-y"]');
    const picks = await page.waitFor(function (f) {
      var p = new Function('return ' + f)()();
      return p.length ? p : false;
    }, { args: [PICKS.toString()], message: 'the goal picker' });
    assert.deepEqual(picks, ['g-pko'], 'goal S holds Sub Y, so linking it under Y would loop');
    assert.deepEqual(realErrors(page), []);
  });

  // ── bug 4: every move out of SIR that deletes sessions asks first ─────────
  /* p17Db's 10 is Declarative in SIR with one session today; 18 is in SIR with
     none. A Declarative MM leaving SIR always deleted its sessions; only the
     Procedural case used to ask. */
  const leaveSirDb = () => p17Db({ mms: P17_MMS().concat([F.mm(18, 'Declarative Eta', { type: '1', ksStage: 'sir' })]) });
  const MM_STAGE = function (id) {
    var db = JSON.parse(localStorage.getItem('track_db') || '{}');
    var mm = (((db.slots || [])[0] || {}).mms || []).filter(function (m) { return m.id === id; })[0];
    return mm ? mm.ksStage : null;
  };

  await t.test('SIR EXIT: moving a Declarative MM out of SIR asks first, and Cancel writes nothing', async tc => {
    const page = await openLinFor(tc, 10, leaveSirDb());
    await pickLin(page, 'stageRevert:4');
    const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });
    const dialogsBefore = page.dialogs.length;
    page.rejectDialogs = true;
    await page.evaluate(CLICK_SEL, '[data-lin-save]');
    await sleep(600);
    page.rejectDialogs = false;
    assert.equal(page.dialogs.length, dialogsBefore + 1, 'the save asked, once');
    const msg = page.dialogs[page.dialogs.length - 1];
    assert.match(msg, /"Declarative Alpha" is in SIR, with 1 SIR session \(0 done\)/, 'it names the MM and counts its sessions');
    assert.match(msg, /Moving it to S4 ends its SIR run/);
    assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }), before,
      'Cancel left track_db byte-identical');
    assert.equal(await page.evaluate(function () { return !!document.querySelector('[data-lin-save]'); }), true,
      'and +LIN stayed open on its last step');
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('SIR EXIT: accepting deletes that MM\'s sessions, and nobody else\'s', async tc => {
    const page = await openLinFor(tc, 10, leaveSirDb());
    await pickLin(page, 'stageRevert:4');
    const dialogsBefore = page.dialogs.length;
    await page.evaluate(CLICK_SEL, '[data-lin-save]');
    await page.waitFor(function (f) { return new Function('return ' + f)()(10) === '4'; },
      { args: [MM_STAGE.toString()], message: 'the move landing in track_db' });
    assert.equal(page.dialogs.length, dialogsBefore + 1, 'it asked first');
    const ids = await page.evaluate(function () {
      var s = JSON.parse(localStorage.getItem('track_db')).slots[0];
      return s.sessions.map(function (x) { return x.id; }).sort(function (a, b) { return a - b; });
    });
    assert.deepEqual(ids, [211, 212, 221], "Alpha's session is gone; Beta's and Gamma's are untouched");
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('SIR EXIT: an MM in SIR with no sessions moves without a prompt', async tc => {
    const page = await openLinFor(tc, 18, leaveSirDb());
    await pickLin(page, 'stageRevert:4');
    const dialogsBefore = page.dialogs.length;
    await page.evaluate(CLICK_SEL, '[data-lin-save]');
    await page.waitFor(function (f) { return new Function('return ' + f)()(18) === '4'; },
      { args: [MM_STAGE.toString()], message: "Eta's move landing" });
    assert.equal(page.dialogs.length, dialogsBefore, 'nothing to delete, so nothing to ask');
    assert.deepEqual(realErrors(page), []);
  });

  // ── bug 5: a sub-goal linked under two goals is listed under each, once ───
  /* The user's example: JLPT N4 belongs to Japanese and is linked under Move
     to Japan. A link shows the SAME sub-goal twice, so its milestone is listed
     under both — but counted once, drawn once on the calendar, and one click
     selects one row. */
  const linkedOwnerDb = () => seedDb({
    calendarNotes: [], deadlines: [], mmEntries: [], sessions: [], saEntries: [],
    goals: [
      F.task('g-jp', { title: 'Japanese', children: [
        F.task('sg-n4', { title: 'JLPT N4', isSubGoal: true,
          milestones: [F.milestone('ms-mock', TODAY, dayFromToday(10), { title: 'Mock exam' })],
          children: [msBlock('blk-mock', 'ms-mock', [F.task('t-mock', { title: 'Grammar drills' })])] })
      ] }),
      F.task('g-mv', { title: 'Move to Japan', children: [
        F.task('sg-visa', { title: 'Visa', isSubGoal: true,
          milestones: [F.milestone('ms-forms', dayFromToday(20), dayFromToday(25), { title: 'Submit forms' })],
          children: [msBlock('blk-forms', 'ms-forms', [F.task('t-forms', { title: 'Fill the forms' })])] }),
        { id: 'lnk-n4', linkedTaskId: 'sg-n4', isLink: true, isSubGoal: true }
      ] })
    ]
  });
  const MOCK_KEY = 'sg-n4|ms-mock';
  const openLinkedOwner = async tc => {
    const page = await openHere(tc, 'progress.html', { db: linkedOwnerDb(), hash: '#milestones' });
    await renderedOrError(page, '[data-ms-row="sg-visa|ms-forms"]', 'the Milestones tab');
    return page;
  };
  const MOCK_ROWS = function (k) {
    return Array.prototype.map.call(document.querySelectorAll('[data-ms-row="' + k + '"]'), function (r) {
      return { linkedFrom: r.getAttribute('data-ms-row-linked-from'), selected: r.getAttribute('aria-current') === 'true' };
    });
  };

  await t.test('LINKED OWNER: listed under each goal, marked as linked, and counted once', async tc => {
    const page = await openLinkedOwner(tc);
    assert.equal(await page.evaluate(function () { return document.querySelector('[data-ms-totals]').textContent.trim(); }),
      '2 milestones · 2 leaf subgoals', 'it read 3 and 3');
    assert.deepEqual((await page.evaluate(MOCK_ROWS, MOCK_KEY)).map(r => r.linkedFrom), [null, 'g-jp'],
      'under Japanese, and again under Move to Japan, marked as linked from Japanese');
    assert.match(await page.evaluate(function () { return document.querySelector('[data-ms-linked-from="g-jp"]').textContent; }),
      /linked from Japanese/);
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('LINKED OWNER: the calendar draws the linked milestone once', async tc => {
    const page = await openLinkedOwner(tc);
    const chips = await page.waitFor(function (d, k) {
      var c = document.querySelector('[data-ms-day="' + d + '"]');
      return c ? c.querySelectorAll('[data-ms-chip="' + k + '"]').length : false;
    }, { args: [TODAY, MOCK_KEY], message: "today's calendar cell" });
    assert.equal(chips, 1, 'one chip for Mock exam today — it drew two');
    assert.deepEqual(realErrors(page), []);
  });

  await t.test('LINKED OWNER: one click selects one row', async tc => {
    const page = await openLinkedOwner(tc);
    await page.evaluate(function (k) { document.querySelectorAll('[data-ms-row="' + k + '"]')[1].click(); return true; }, MOCK_KEY);
    await page.waitFor(function (k) { return !!document.querySelector('[data-ms-row="' + k + '"][aria-current="true"]'); },
      { args: [MOCK_KEY], message: 'a selected row' });
    assert.deepEqual((await page.evaluate(MOCK_ROWS, MOCK_KEY)).map(r => r.selected), [false, true],
      'the linked row alone — both used to light up');
    await page.evaluate(function (k) { document.querySelectorAll('[data-ms-row="' + k + '"]')[0].click(); return true; }, MOCK_KEY);
    await page.waitFor(function (k) {
      var r = document.querySelectorAll('[data-ms-row="' + k + '"]');
      return r[0] && r[0].getAttribute('aria-current') === 'true';
    }, { args: [MOCK_KEY], message: 'the first row selected' });
    assert.deepEqual((await page.evaluate(MOCK_ROWS, MOCK_KEY)).map(r => r.selected), [true, false]);
    assert.deepEqual(realErrors(page), []);
  });
});
