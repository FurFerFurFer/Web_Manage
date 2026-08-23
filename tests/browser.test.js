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
  t.after(async () => { await browser.close(); await server.close(); });

  /* `fresh` wipes the origin before seeding. Tabs share one browser profile,
     so a test that skips it inherits the previous test's data — and seed() is
     deliberately guarded against overwriting, so the stale data wins silently.
     The second tab of a two-tab test must pass fresh:false, or it erases the
     state the first tab is under test with. */
  const open = async (file, { db = null, raw = null, hash = '', fresh = true, extra = null } = {}) => {
    const page = await browser.newPage();
    if (fresh) await page.clearStorage(server.origin);
    if (raw !== null) await page.seedRaw(raw, extra || {});
    else if (db || extra) await page.seed(db || {}, extra || {});
    await page.goto(server.url(file) + hash);
    await page.skipFirebase();
    return page;
  };

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
      trueStoragePos: { 'ts-x': { x: 5, y: 6 } } };
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

  await t.test('a day note with a time moves to the hour grid, and clearing it moves it back', async () => {
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

    const placed = await page.waitFor(function () {
      var onGrid = Array.prototype.some.call(document.querySelectorAll('.doc-cal .cal-sched-block'),
        function (b) { return /Review the draft/.test(b.textContent); });
      var listed = Array.prototype.some.call(document.querySelectorAll('.doc-cal .cal-doc-row'),
        function (r) { return /Review the draft/.test(r.textContent); });
      var inStrip = Array.prototype.some.call(document.querySelectorAll('.doc-cal .cal-sched-note'),
        function (c) { return /Review the draft/.test(c.textContent); });
      return onGrid && listed && !inStrip ? 'placed' : false;
    }, { message: 'the note being drawn on the hour grid and nowhere else' });
    assert.equal(placed, 'placed');

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
  const clickCautionDay = (page, ds) => page.evaluate(function (v) {
    var b = document.querySelector('[data-dl-caution-day="' + v + '"]');
    if (!b) return false;
    b.click();
    return true;
  }, ds);

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
    const { db, due } = cautionDb();
    const page = await openDlPopup({ db, due });
    const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });

    const state = await page.evaluate(function (a, b) {
      var one = document.querySelector('[data-dl-caution-day="' + a + '"]');
      var two = document.querySelector('[data-dl-caution-day="' + b + '"]');
      return { dueDisabled: !!one && one.disabled, afterDisabled: !!two && two.disabled };
    }, due, dayFromToday(4));
    assert.equal(state.dueDisabled, true, 'the due day is drawn red, never amber');
    assert.equal(state.afterDisabled, true, 'and a day after the deadline is not a run-up');

    // Cancel path: clicking anyway must leave the stored bytes untouched.
    await clickCautionDay(page, due);
    await clickCautionDay(page, dayFromToday(4));
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
    const { db, due } = cautionDb({ cautionDates: [dayFromToday(-4), prepDay], blockDate: prepDay });
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
  // The edit form now has NO date field, so `dates[0]` can legitimately be
  // absent. Reading `.value` off it unconditionally threw and the scope-guard
  // case failed on a TypeError rather than on what it asserts.
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
      if (v.date !== undefined) set(form.querySelectorAll('input[type="date"]')[0], v.date);
      if (v.time !== undefined) set(form.querySelector('input[type="time"]'), v.time);
      if (v.title !== undefined) set(form.querySelector('input:not([type])'), v.title);
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

  await t.test('SCOPE GUARD: the Documentations edit form still moves no due DAY', async () => {
    // The due day of a STORED deadline moves from the Progress popup alone: it
    // is the one writer that refuses a move ORPHANING a chosen caution day, and
    // a second writer would have to repeat that check — exactly the shape that
    // cost this project the caution predicate once already.
    //
    // The caution days themselves ARE editable here now, and the cases below
    // cover them. What this guard pins is that the STRANDING refusal came with
    // them and the ORPHANING one did not have to: with no date field there is
    // no move to orphan anything. Adding one without that refusal trips here.
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
    assert.equal(fields.count, 0, 'the edit form carries NO date field at all');
    const stored = (await storedDl(page))[0];
    assert.equal(stored.date, due, 'the stored due day is untouched');
    assert.deepEqual(stored.cautionDates, [thisMonthDay(15), thisMonthDay(16), thisMonthDay(17)],
      'and so are the chosen days');
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
    // blockDate anchors this deadline's prep on day 16, one of its chosen days.
    // Un-picking 16 would leave that block on a day the deadline no longer
    // occupies, so it is REFUSED and the day is named — never moved, never
    // dropped. Day 15 holds nothing and must still un-pick, or the refusal has
    // frozen the whole picker instead of protecting one day.
    const { db } = moveDb({ blockDate: thisMonthDay(16) });
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
    assert.equal(stored.blockDate, thisMonthDay(16), 'and its prep never moved');
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
    assert.equal(imported.calendarNotes.find(n => n.id === 'cn-sched').blockOff, true,
      'blockOff round-tripped — the one key that decides whether an item is on the grid');
    assert.equal(imported.calendarNotes.find(n => n.id === 'cn-sched').blockDuration, 90,
      'and the day note block');

    // every canonical user-owned field survives, value for value
    for (const key of ['sessions', 'mms', 'kolbs', 'mgChanges', 'linChanges', 'linDayTitles',
      'goals', 'saActions', 'saEntries', 'sourceDumps', 'notes', 'mmEntries', 'mgSchedule',
      'calendarNotes', 'deadlines', 'pos', 'levelTemplates', 'docPages',
      'trueStorages', 'trueStoragePos']) {
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
    assert.equal(Object.keys(imported).length, 23, 'the imported slot carries all 23 canonical fields');

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
    'levelTemplates', 'docPages', 'trueStorages', 'trueStoragePos'
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
        await sleep(150);
        assert.equal(await page.evaluate(READ_RAW), raw,
          file + ': opening the notes widget wrote nothing');

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
    await page.waitFor(function () { return !!document.querySelector('.doc-table td input'); },
      { message: 'the table' });

    const clickCell = () => page.evaluate(function () { document.querySelector('.doc-table td input').click(); });
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

     Every note and every deadline is a real span on the hour grid, and it is so
     AUTOMATICALLY: `blockOff` is the switch that takes one off, `blockDuration`
     only a remembered length and `blockDate` only a remembered day. All three
     absences mean "the automatic default", which is what put blocks on items
     stored long before these keys existed with nothing written to them.

     The rules have ONE definition, TrackCalendar.blockOn and friends in
     calendar-core.js, with a second copy in progress.html because that page
     does not load it. So the block is asserted on the Progress grid, on the
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
  /* `day` is the COLUMN the block is drawn in, and reading it is not optional
     for anything about blockDate: the week view has all seven columns in the
     DOM at once, so a block drawn on the wrong day still appears in this list
     with the right id, time and height. A case that checks only those passes
     against a blockDay that ignores blockDate entirely — which is exactly what
     the doctored-baseline run caught. */
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

  await t.test('PROGRESS: an item with no block keys is on the grid automatically', async () => {
    // The heart of the change, on the first of the three surfaces. Data stored
    // before any of these keys existed must be drawn WITHOUT being written to.
    const db = seedDb({
      calendarNotes: [
        F.calNote('n-timed', TODAY, { title: 'Timed marker note', time: '14:30' }),
        F.calNote('n-bare', TODAY, { title: 'Untimed note' })
      ],
      deadlines: [F.deadline('d-bare', TODAY, { cautionDates: [],  time: '17:00', title: 'Bare deadline' })]
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    await mountSchedule(page);

    const byId = Object.fromEntries((await page.evaluate(BLOCKS)).map(b => [b.id, b]));
    assert.ok(byId['n-timed'], 'the timed note is drawn as a block');
    assert.equal(byId['n-timed'].top, 14.5 * 64 + 'px', 'starting at its own time');
    assert.equal(byId['n-timed'].height, 64 + 'px', 'at the automatic 60 minutes');
    assert.ok(byId['n-bare'], 'the UNTIMED note is drawn too');
    assert.equal(byId['n-bare'].top, 8 * 64 + 'px', 'at the 08:00 default hour');
    assert.ok(byId['d-bare'], 'and so is the deadline, with no opting in');
    assert.equal(byId['d-bare'].top, 16 * 64 + 'px', 'its run-up ENDS at the due time');

    // "show both, always": the marker is not taken away by the block
    assert.equal(await page.evaluate(function () {
      return Array.prototype.some.call(document.querySelectorAll('#root span'), function (e) {
        return /bg-fuchsia/.test(e.className || '') && e.textContent.indexOf('Timed marker note') >= 0;
      });
    }), true, 'the timed note ALSO still renders as its point marker');

    // and none of it was written
    const stored = await page.evaluate(READ_ITEM, 'deadlines', 'd-bare');
    assert.equal('blockDuration' in stored, false, 'nothing was written to storage');
    assert.equal('blockDate' in stored, false);
    assert.equal('blockOff' in stored, false);
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a deadline block ends at the due time and a note block starts at its time', async () => {
    const db = seedDb({
      calendarNotes: [F.calNote('n-s', TODAY, { title: 'Scheduled note', time: '09:00', blockDuration: 90 })],
      deadlines: [F.deadline('d-p', TODAY, { cautionDates: [],  time: '20:00', title: 'Prep', blockDuration: 60 })]
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    await mountSchedule(page);
    const blocks = await page.evaluate(BLOCKS);
    const byId = Object.fromEntries(blocks.map(b => [b.id, b]));

    // default timeline zoom is 64px/hour, so an hour is 64px
    assert.ok(byId['n-s'], 'the note has a block');
    assert.equal(byId['n-s'].top, 9 * 64 + 'px', 'a note block STARTS at the note time');
    assert.equal(byId['n-s'].height, 90 / 60 * 64 + 'px');
    assert.ok(byId['d-p'], 'the deadline has a block');
    assert.equal(byId['d-p'].top, 19 * 64 + 'px', 'a deadline block ENDS at the due time');
    assert.equal(byId['d-p'].height, 64 + 'px');

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
      deadlines: [F.deadline('d-e', TODAY, { cautionDates: [],  time: '00:30', title: 'Early', blockDuration: 60 })]
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    await mountSchedule(page);
    const b = (await page.evaluate(BLOCKS)).find(x => x.id === 'd-e');
    assert.ok(b, 'the block is drawn');
    assert.equal(b.top, '0px', 'clipped at the top of the grid');
    assert.equal(b.height, 30 / 60 * 64 + 'px', 'and shortened so it still ends at 00:30');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('the fourth button lists everything in ONE flat chronological list', async () => {
    // No date grouping and no date toggle: the date is a read-out on each row.
    const db = seedDb({
      calendarNotes: [
        F.calNote('n-today', TODAY, { title: 'Note today', time: '09:00' }),
        F.calNote('n-far', '2026-01-05', { title: 'Note far away', time: '10:00' })
      ],
      deadlines: [
        F.deadline('d-far', '2026-02-09', { cautionDates: [],  time: '17:00', title: 'Deadline far away' }),
        F.deadline('d-early', '2026-01-05', { cautionDates: [],  time: '08:00', title: 'Deadline same day, earlier' })
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
    // 2026-01-05 08:00 (deadline) then 10:00 (note), then 2026-02-09, then TODAY
    assert.deepEqual(dates.map(x => x.split('|')[0]), ['d-early', 'n-far', 'd-far', 'n-today'],
      'one flat list, chronological by the item\'s own date and time');
    assert.ok(/2026-01-05\s+08:00/.test(dates[0]), 'and each row shows its own date: ' + dates[0]);

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

  await t.test('remove from schedule writes blockOff and keeps everything else', async () => {
    // It must DELETE nothing: putting the block back has to restore the length,
    // day and anchor the user chose rather than guess at them again. And the
    // item's own surfaces — chip, marker, due line, run-up — all stay.
    const db = seedDb({
      deadlines: [F.deadline('d-1', TODAY, {
        cautionDates: ['2026-08-01', '2026-08-02'], time: '17:00', title: 'Essay', detail: 'body',
        done: true, docPageId: 'p-1', blockDuration: 45, blockTime: '08:00'
      })]
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    await mountSchedule(page);
    const before = await page.evaluate(READ_ITEM, 'deadlines', 'd-1');
    assert.equal((await page.evaluate(BLOCKS)).length, 1, 'it starts on the grid');

    await openDlnPanel(page, TODAY);
    await page.evaluate(CLICK_SEL, '[data-dln-unschedule="d-1"]');
    const after = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = (((db.slots || [])[0] || {}).deadlines || [])[0];
      return (d && d.blockOff === true) ? d : false;
    }, { message: 'blockOff reaching track_db' });

    assert.equal(after.blockDuration, 45, 'the remembered length is NOT deleted');
    assert.equal(after.blockTime, '08:00', 'nor the anchor');
    for (const k of ['id', 'date', 'time', 'cautionDates', 'title', 'detail', 'done', 'docPageId', 'createdAt']) {
      assert.deepEqual(after[k], before[k], k + ' survived the write');
    }

    // putting it back is a restore, not a guess
    await page.evaluate(CLICK_SEL, '[data-dln-schedule="d-1"]');
    const back = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = (((db.slots || [])[0] || {}).deadlines || [])[0];
      return (d && d.blockOff === false) ? d : false;
    }, { message: 'the block being restored' });
    assert.equal(back.blockDuration, 45, 'at the length it had');
    assert.equal(back.blockTime, '08:00', 'and where it was');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a removed block leaves the strip chip and the due line drawn', async () => {
    const db = seedDb({
      calendarNotes: [F.calNote('n-off', TODAY, { title: 'Off-grid note', time: '14:30', blockOff: true })],
      deadlines: [F.deadline('d-off', TODAY, { cautionDates: [],  time: '17:00', title: 'Off-grid deadline', blockOff: true })]
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
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('an UNTIMED note is on the grid at 08:00 and never gets time:""', async () => {
    const db = seedDb({ calendarNotes: [F.calNote('n-u', TODAY, { title: 'Untimed note' })] });
    const page = await open('progress.html', { db, hash: '#schedule' });
    await mountSchedule(page);
    const b = (await page.evaluate(BLOCKS)).find(x => x.id === 'n-u');
    assert.ok(b, 'it is on the grid with no time of its own');
    assert.equal(b.top, 8 * 64 + 'px', 'at the default hour');

    // …and being on the grid invented no stored time
    const still = await page.evaluate(READ_ITEM, 'calendarNotes', 'n-u');
    assert.equal('time' in still, false, 'no time key was invented');
    assert.equal('blockDuration' in still, false, 'and nothing was written at all');

    // the row reports it as untimed rather than claiming 08:00 is the user's
    await openDlnPanel(page, TODAY);
    assert.match(await page.evaluate(function () {
      var e = document.querySelector('[data-dln-date="n-u"]'); return e ? e.textContent : '';
    }), /—/, 'the row shows the note has no time of its own');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('dissecting replaces the parent block with its parts, and emptying restores it', async () => {
    const db = seedDb({
      deadlines: [F.deadline('d-1', TODAY, { cautionDates: [],  time: '17:00', title: 'Essay', blockDuration: 60 })]
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    await mountSchedule(page);
    assert.deepEqual((await page.evaluate(BLOCKS)).map(b => b.id), ['d-1'], 'the parent block to begin with');

    await openDlnPanel(page, TODAY);
    await page.evaluate(CLICK_SEL, '[data-dln-dissect="deadline:d-1"]');
    await page.waitFor(function () { return !!document.querySelector('[data-dln-part-input="deadline:d-1"]'); },
      { message: 'the dissect sub-panel' });
    await page.evaluate(function (setterSrc) {
      var set = new Function('return ' + setterSrc)();
      set(document.querySelector('[data-dln-part-input="deadline:d-1"]'), 'Outline');
      return true;
    }, SET_REACT_INPUT);
    await page.evaluate(CLICK_SEL, '[data-dln-part-add="deadline:d-1"]');

    const withPart = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = (((db.slots || [])[0] || {}).deadlines || [])[0];
      return (d && d.parts && d.parts.length === 1) ? d : false;
    }, { message: 'the part reaching track_db' });
    assert.equal(withPart.parts[0].title, 'Outline');
    assert.equal(withPart.parts[0].time, '16:00', 'a new part inherits the parent block start');
    assert.equal(withPart.parts[0].blockDuration, 60, 'and its length');
    assert.equal('date' in withPart.parts[0], false,
      'and NO date of its own — absence means it follows the parent block\'s day');
    assert.equal(withPart.blockDuration, 60, 'the parent keeps its own block record');

    const ids = await page.waitFor(function () {
      var b = Array.prototype.map.call(document.querySelectorAll('[data-block-kind]'),
        function (e) { return e.getAttribute('data-block-id'); });
      return (b.length === 1 && b[0].indexOf(':') > 0) ? b : false;
    }, { message: 'the parts standing in for the parent block' });
    assert.match(ids[0], /^d-1:/, 'the parent block is replaced by its part');

    // removing the last part deletes the key, so the parent block comes back
    await page.evaluate(function () {
      var rows = document.querySelectorAll('[data-dln-panel] .group\\/part button');
      if (!rows.length) return false;
      rows[rows.length - 1].click();
      return true;
    });
    const back = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = (((db.slots || [])[0] || {}).deadlines || [])[0];
      return (d && !('parts' in d)) ? d : false;
    }, { message: 'the parts key being deleted' });
    assert.equal('parts' in back, false, 'emptied rather than left as []');
    assert.deepEqual((await page.evaluate(BLOCKS)).map(b => b.id), ['d-1'], 'and the parent block is back');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('the new blocks join the overlap layout instead of covering a task', async () => {
    // The markers and the hairline are deliberately EXCLUDED from the overlap
    // layout. These are real blocks, so they must be included — otherwise a
    // note block silently sits on top of a scheduled task.
    const db = seedDb({
      goals: [F.task('g-x', { title: 'Overlapping task', scheduledDate: TODAY, scheduledTime: '09:00', duration: 60 })],
      calendarNotes: [F.calNote('n-o', TODAY, { title: 'Overlapping note', time: '09:00', blockDuration: 60 })],
      deadlines: []
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    await mountSchedule(page);
    /* computeOverlapInfo gives exactly ONE member of a group the front z-index
       15 and the rest 10; a block in no group is always 10. So "exactly one of
       the two is 15" is the assertion that actually proves they were grouped —
       checking that the note is 10-or-15 would pass even if it were excluded. */
    const z = await page.waitFor(function () {
      var note = document.querySelector('[data-block-id="n-o"]');
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
      calendarNotes: [F.calNote('n-orphan', TODAY, { title: 'Orphan note', blockDuration: 60 })],
      deadlines: []
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    await mountSchedule(page);
    const b = await page.waitFor(function () {
      var e = document.querySelector('[data-block-id="n-orphan"]');
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

  await t.test('the Home calendar draws the same two blocks', async () => {
    // Asserted separately from Progress on purpose: this surface reads
    // calendar-core.js, Progress reads its own copy of the same rules.
    const db = seedDb({
      calendarNotes: [F.calNote('n-s', TODAY, { title: 'Scheduled note', time: '09:00', blockDuration: 90 })],
      deadlines: [F.deadline('d-p', TODAY, { cautionDates: [],  time: '20:00', title: 'Prep block', blockDuration: 60 })]
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
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a Documentations calendar block draws the deadline run-up too', async () => {
    // The third surface, again asserted on its own. The block is added through
    // the real block menu rather than a hand-built record, so the test cannot
    // drift from the shape the page actually writes.
    const db = seedDb({
      docPages: [F.docPage('p-1', { title: 'Test Page' })],
      deadlines: [F.deadline('d-p', TODAY, { cautionDates: [],  time: '20:00', title: 'Prep block', blockDuration: 60 })],
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
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('changing a block writes no key progress.html does not own', async () => {
    const db = seedDb({
      deadlines: [F.deadline('d-1', TODAY, { cautionDates: [],  time: '17:00', title: 'Essay' })]
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    await mountSchedule(page);
    const FOREIGN = ['sessions', 'mms', 'kolbs', 'mgChanges', 'linChanges', 'linDayTitles',
      'pos', 'levelTemplates', 'sourceDumps', 'docPages', 'trueStorages', 'trueStoragePos', 'notes'];
    const before = await page.evaluate(function (keys) {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var s = (db.slots || [])[0] || {};
      var out = {}; keys.forEach(function (k) { out[k] = JSON.stringify(s[k]); }); return out;
    }, FOREIGN);

    await openDlnPanel(page, TODAY);
    await page.evaluate(CLICK_SEL, '[data-dln-unschedule="d-1"]');
    await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = (((db.slots || [])[0] || {}).deadlines || [])[0];
      return !!(d && d.blockOff === true);
    }, { message: 'the write landing' });

    assert.deepEqual(await page.evaluate(function (keys) {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var s = (db.slots || [])[0] || {};
      var out = {}; keys.forEach(function (k) { out[k] = JSON.stringify(s[k]); }); return out;
    }, FOREIGN), before, 'every foreign key is byte-identical');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  /* ── work scheduled on a day of its own ──────────────────────────────────
     `blockDate` on an item and `date` on a part are what let prep sit on a day
     that is not the item's own. The three rendering surfaces are asserted
     SEPARATELY, as everything else in this section is. */

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

  await t.test('PROGRESS: blockDate draws the run-up on a caution day, marker staying put', async () => {
    const due = WEEK(3), moved = WEEK(1);
    const db = seedDb({
      calendarNotes: [F.calNote('n-m', due, { title: 'Moved note', time: '15:00', blockDate: moved })],
      deadlines: [F.deadline('d-m', due, {
        cautionDates: [WEEK(0), WEEK(1), WEEK(2)], time: '17:00', title: 'Moved prep', blockDate: moved
      })]
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    await mountSchedule(page);
    // the week view shows both days at once, so one read covers the move
    const blocks = await page.evaluate(BLOCKS);
    assert.deepEqual(blocks.map(b => b.id).sort(), ['d-m', 'n-m'], 'each block is drawn exactly once');
    // THE assertion of this case: the COLUMN, not just the id. Both blocks are
    // in the DOM either way; only the day tells a moved one from an unmoved one.
    assert.deepEqual(blocks.map(b => b.day), [moved, moved],
      'both are drawn in the column they were moved to, not the due day');
    // the deadline's run-up still ENDS at the due time, on the day it moved to
    assert.equal(blocks.find(b => b.id === 'd-m').top, 16 * 64 + 'px');
    assert.equal(blocks.find(b => b.id === 'n-m').top, 15 * 64 + 'px', 'and the note keeps its own hour');
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
        cautionDates: [MDAY(10), MDAY(11), MDAY(12)], time: '20:00', title: 'Moved prep', blockDate: MDAY(11)
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
      'the block draws on the day it was moved to, still ending at 20:00 — got ' + JSON.stringify(onMoved.blocks));
    const onDue = await readDay(13);
    assert.match(onDue.text, /Moved prep/, 'the due day still lists the deadline itself');
    assert.deepEqual(onDue.blocks, [], 'but no BLOCK is drawn there any more');
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

  await t.test('a task is added on a chosen day, capped to a deadline\'s caution period', async () => {
    const TOMORROW = dayFromToday(1), YESTERDAY = dayFromToday(-1);
    const db = seedDb({
      deadlines: [F.deadline('d-1', TODAY, {
        cautionDates: [YESTERDAY], time: '17:00', title: 'Essay'
      })]
    });
    const page = await open('progress.html', { db, hash: '#schedule' });
    await mountSchedule(page);
    await openDlnPanel(page, TODAY);
    await page.evaluate(CLICK_SEL, '[data-dln-dissect="deadline:d-1"]');
    await page.waitFor(function () { return !!document.querySelector('[data-dln-part-date="deadline:d-1"]'); },
      { message: 'the task composer' });

    // the day picker is capped to the caution window at both ends
    assert.deepEqual(await page.evaluate(function () {
      var e = document.querySelector('[data-dln-part-date="deadline:d-1"]');
      return { min: e.getAttribute('min'), max: e.getAttribute('max'), value: e.value };
    }), { min: YESTERDAY, max: TODAY, value: TODAY },
      'seeded to the block\'s day and capped to the caution period');

    await page.evaluate(function (setterSrc, day) {
      var set = new Function('return ' + setterSrc)();
      set(document.querySelector('[data-dln-part-input="deadline:d-1"]'), 'Outline');
      set(document.querySelector('[data-dln-part-date="deadline:d-1"]'), day);
      return true;
    }, SET_REACT_INPUT, YESTERDAY);
    await page.evaluate(CLICK_SEL, '[data-dln-part-add="deadline:d-1"]');
    const withPart = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = (((db.slots || [])[0] || {}).deadlines || [])[0];
      return (d && d.parts && d.parts.length === 1) ? d : false;
    }, { message: 'the task reaching track_db' });
    assert.equal(withPart.parts[0].date, YESTERDAY, 'the task carries the chosen day');
    assert.equal(withPart.date, TODAY, 'and the deadline itself did NOT move');
    assert.deepEqual(withPart.cautionDates, [YESTERDAY], 'nor its chosen caution days');

    // a day outside the window is refused rather than written
    await page.evaluate(function (setterSrc, day) {
      var set = new Function('return ' + setterSrc)();
      set(document.querySelector('[data-dln-part-input="deadline:d-1"]'), 'Too late');
      set(document.querySelector('[data-dln-part-date="deadline:d-1"]'), day);
      return true;
    }, SET_REACT_INPUT, TOMORROW);
    await page.waitFor(function () {
      var b = document.querySelector('[data-dln-part-add="deadline:d-1"]');
      return !!b && b.disabled;
    }, { message: 'Add being refused for a day outside the caution period' });
    assert.equal(await page.evaluate(function () {
      return !!document.querySelector('[data-dln-part-warn="deadline:d-1"]');
    }), true, 'and the reason is shown');
    await page.evaluate(CLICK_SEL, '[data-dln-part-add="deadline:d-1"]');
    await sleep(300);
    assert.equal((await page.evaluate(READ_ITEM, 'deadlines', 'd-1')).parts.length, 1,
      'clicking anyway wrote nothing');
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
        cautionDates: [placed], time: '17:00', title: 'Essay', blockDate: placed
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

  await t.test('the handles are reachable without a hover-capable pointer', async () => {
    /* Half two of the failure. Even a working touch drag is unusable while the
       cluster is display:none, and headless Chrome reports `hover: hover`, so
       assert the RULE exists rather than emulating the medium. */
    const page = await openDocTree();
    const found = await page.evaluate(function () {
      var out = [];
      for (var i = 0; i < document.styleSheets.length; i++) {
        var rules; try { rules = document.styleSheets[i].cssRules; } catch (e) { continue; }
        for (var j = 0; j < rules.length; j++) {
          var media = rules[j];
          if (media.type !== CSSRule.MEDIA_RULE) continue;
          if (media.conditionText.replace(/\s/g, '').indexOf('hover:none') < 0) continue;
          for (var k = 0; k < media.cssRules.length; k++) {
            var r = media.cssRules[k];
            if (r.selectorText) out.push({ sel: r.selectorText, display: r.style.display });
          }
        }
      }
      return out;
    });
    assert.ok(found.some(r => r.sel.indexOf('.doc-row-acts') >= 0 && r.display === 'flex'),
      'a @media (hover: none) rule shows the row action cluster');
    // and the handles must opt out of the browser's own pan gesture
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

  /* ── the day-header buttons are REACHABLE, not merely present ────────────
     Every other case in this file clicks through `el.click()`, which ignores
     hit testing entirely and so cannot see a control that is painted under
     something else. That is exactly the shape of the bug these two cases
     exist for: in WEEK mode the day column is pinned to its minimum, the
     centre section gets what the two side strips leave it, and the four-button
     row is wider than that. Flex items paint as atomic units in document
     order, so the row spilling LEFT stays on top of the SIR strip and keeps
     working, while the same row spilling RIGHT goes under the notes strip —
     visible, because that strip has no background, and completely dead to a
     tap. Only the fourth button, `☰`, is lost.

     Each button is therefore asserted SEPARATELY through elementFromPoint. A
     single "all four are fine" assertion would let the one forgotten surface
     hide behind three passing siblings, which is this repository's recurring
     bug. */
  const HEADER_BUTTONS = function (ds) {
    var last = document.querySelector('[data-dln-open="' + ds + '"]');
    if (!last) return null;
    var row  = last.parentElement;
    var cell = row.closest('.relative');
    var scroller = row.closest('.overflow-auto');
    // row → centre section → the three-part strip row; its last child is the
    // notes-and-caution strip, the sibling painted OVER the centre's overflow.
    var strip = row.parentElement.parentElement.lastElementChild;
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
    assert.deepEqual(m.buttons.map(b => b.label), ['+', '◎', '⊕', '☰'],
      'all four buttons render on a day that is not past');

    // separately, one per button: the whole point is that three of them pass
    assert.equal(byLabel['+'].hit, 'self', 'the + task picker takes its own tap');
    assert.equal(byLabel['◎'].hit, 'self', 'the ◎ MM picker takes its own tap');
    assert.equal(byLabel['⊕'].hit, 'self', 'the ⊕ MG picker takes its own tap');
    assert.equal(byLabel['☰'].hit, 'self',
      'the ☰ day-notes browser takes its own tap (hit ' + byLabel['☰'].hit + ')');

    assert.ok(byLabel['☰'].width >= 24,
      'and is not squashed down to its glyph (' + byLabel['☰'].width + 'px)');
    assert.ok(m.row.left >= m.cell.left && m.row.right <= m.cell.right,
      'the button row stays inside its own day column (row ' + m.row.left + '–' + m.row.right +
      ', column ' + m.cell.left + '–' + m.cell.right + ')');

    // and the user's actual action: tap where the ☰ is drawn, not the element
    await page.evaluate(function (ds) {
      var b = document.querySelector('[data-dln-open="' + ds + '"]');
      var r = b.getBoundingClientRect();
      var el = document.elementFromPoint(Math.round(r.left + r.width / 2),
                                         Math.round(r.top + r.height / 2));
      if (el) el.click();
      return true;
    }, TODAY);
    await page.waitFor(function () { return !!document.querySelector('[data-dln-panel]'); },
      { message: 'the day-notes panel opening from a tap at the ☰ position' });

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('PROGRESS: a long note title cannot push a day-header button out of reach', async () => {
    /* The notes strip sizes to its content up to 110px, so a long title takes
       back the width the widened column just gave the centre. This is the case
       the row's flex-wrap exists for: it must break INSIDE its column rather
       than spill under the strip again. */
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
    assert.equal(byLabel['+'].hit, 'self', 'the + task picker still takes its own tap');
    assert.equal(byLabel['◎'].hit, 'self', 'the ◎ MM picker still takes its own tap');
    assert.equal(byLabel['⊕'].hit, 'self', 'the ⊕ MG picker still takes its own tap');
    assert.equal(byLabel['☰'].hit, 'self',
      'the ☰ day-notes browser still takes its own tap (hit ' + byLabel['☰'].hit + ')');
    assert.ok(m.row.right <= m.cell.right,
      'the row wrapped inside the column instead of spilling under the strip (row right ' +
      m.row.right + ', column right ' + m.cell.right + ')');

    assert.deepEqual(realErrors(page), []);
    await page.close();
  });
});
