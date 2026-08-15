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
      detail: '', startDate: '2026-03-10', docPageId: 'p-1' };
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
    assert.equal(slot.deadlines[0].startDate, '2026-03-10', 'with its caution period intact');
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
        F.deadline('mine', thisMonthDay(22), { startDate: thisMonthDay(20), docPageId: 'p-1' }),
        F.deadline('theirs', thisMonthDay(17), { startDate: thisMonthDay(16), docPageId: 'p-other' })
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
      deadlines: [F.deadline('dl-today', due, { startDate: dayFromToday(-2), title: 'Ship the thing' })]
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
      deadlines: [F.deadline('dl-soon', due, { startDate: dayFromToday(-1), title: 'Ship the thing' })]
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

  // ── 2c. the caution period is choosable, and its "!" leads back ─────────

  /* A doc-authored deadline with a one-day caution period: the default every
     creation path produces, and the state in which the feature is invisible. */
  const cautionDb = () => {
    const due = dayFromToday(3);
    return {
      due,
      db: seedDb({
        calendarNotes: [],
        docPages: [F.docPage('p-1')],
        deadlines: [F.deadline('dl-pick', due,
          { startDate: due, title: 'Ship the thing', docPageId: 'p-1', createdAt: 1771000000000 })]
      })
    };
  };
  const openDlPopup = async ({ db, due }) => {
    const page = await open('progress.html', { db, hash: '?date=' + due + '&dl=dl-pick#schedule' });
    await page.waitFor(function () { return !!document.getElementById('dl-caution-from'); },
      { message: 'the deadline popup, opened by ?dl=, showing the caution picker in its READ view' });
    return page;
  };
  const storedDeadline = page => page.evaluate(function () {
    var db = JSON.parse(localStorage.getItem('track_db') || '{}');
    return (((db.slots || [])[0] || {}).deadlines || [])[0] || null;
  });

  await t.test('?dl= opens the deadline popup, and the caution start is set from the read view', async () => {
    const { db, due } = cautionDb();
    const page = await openDlPopup({ db, due });

    const shown = await page.evaluate(function () {
      var pop = document.getElementById('dl-caution-from').closest('div.fixed');
      return {
        readView: Array.prototype.some.call(pop.querySelectorAll('button'),
          function (b) { return b.textContent.trim() === 'Edit'; }),
        title: /Ship the thing/.test(pop.textContent),
        value: document.getElementById('dl-caution-from').value,
        max: document.getElementById('dl-caution-from').getAttribute('max')
      };
    });
    assert.equal(shown.readView, true, 'the picker is in the read view, not behind Edit');
    assert.equal(shown.title, true, '?dl= opened the deadline it names');
    assert.equal(shown.value, due, 'and starts on the documented default, the due day');
    assert.equal(shown.max, due, 'the input cannot be dragged past the due day');

    const start = dayFromToday(-1);
    await page.evaluate(function (setterSrc, v) {
      var set = new Function('return ' + setterSrc)();
      set(document.getElementById('dl-caution-from'), v);
      return true;
    }, SET_REACT_INPUT, start);

    const saved = await page.waitFor(function (v) {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = (((db.slots || [])[0] || {}).deadlines || [])[0];
      return d && d.startDate === v ? d : false;
    }, { args: [start], message: 'the new caution start reaching track_db' });

    assert.equal(saved.startDate, start);
    assert.equal(saved.docPageId, 'p-1', 'the doc page that authored it is untouched');
    assert.equal(saved.createdAt, 1771000000000, 'and so is createdAt');
    assert.equal(saved.date, due, 'the due day itself did not move');
    assert.equal(saved.time, '17:00');

    const readout = await page.waitFor(function () {
      var pop = document.getElementById('dl-caution-from').closest('div.fixed');
      return /5 days/.test(pop.textContent) ? pop.textContent : false;
    }, { message: 'the popup readout updating to the new span' });
    assert.match(readout, /5 days/, 'the span readout reflects the pick immediately');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('the caution picker refuses a cleared or out-of-range value instead of writing it', async () => {
    const { db, due } = cautionDb();
    const page = await openDlPopup({ db, due });
    const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });

    for (const bad of ['', dayFromToday(9), 'nonsense']) {
      await page.evaluate(function (setterSrc, v) {
        var set = new Function('return ' + setterSrc)();
        set(document.getElementById('dl-caution-from'), v);
        return true;
      }, SET_REACT_INPUT, bad);
      await sleep(120);
      assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }), before,
        'a caution start of "' + bad + '" leaves the stored bytes byte-identical');
    }

    const still = await storedDeadline(page);
    assert.equal(still.startDate, due, 'startDate is never blanked and never lands after the due day');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a quick-set picks a caution start, and reset undoes it', async () => {
    const { db, due } = cautionDb();
    const page = await openDlPopup({ db, due });

    const clicked = await page.evaluate(function () {
      var b = Array.prototype.find.call(document.querySelectorAll('button'),
        function (x) { return /^Start the caution period on /.test(x.getAttribute('title') || ''); });
      if (!b) return null;
      b.click();
      return b.getAttribute('title').replace('Start the caution period on ', '');
    });
    assert.ok(clicked, 'the quick-set buttons are present');

    const set = await page.waitFor(function (v) {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = (((db.slots || [])[0] || {}).deadlines || [])[0];
      return d && d.startDate === v ? d : false;
    }, { args: [clicked], message: 'the quick-set caution start reaching track_db' });
    assert.equal(set.startDate, clicked);
    assert.notEqual(set.startDate, due, 'which is a real run-up, not the due day again');

    await page.evaluate(function () {
      Array.prototype.find.call(document.querySelectorAll('button'),
        function (x) { return x.textContent.trim() === 'reset'; }).click();
      return true;
    });
    const undone = await page.waitFor(function (v) {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = (((db.slots || [])[0] || {}).deadlines || [])[0];
      return d && d.startDate === v ? d : false;
    }, { args: [due], message: 'reset returning the caution start to the due day' });
    assert.equal(undone.startDate, due, 'a caution period can always be undone');
    assert.equal(undone.docPageId, 'p-1');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('a ?dl= that names nothing opens nothing, without an error', async () => {
    const { db, due } = cautionDb();
    const page = await open('progress.html', { db, hash: '?date=' + due + '&dl=no-such-deadline#schedule' });
    await page.waitFor(function () {
      var el = document.querySelector('#root'); return !!el && el.children.length > 0;
    }, { message: 'progress.html mounting' });
    await sleep(300);
    assert.equal(await page.evaluate(function () { return !!document.getElementById('dl-caution-from'); }),
      false, 'a stale or hand-typed link opens no popup');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('the Home calendar links both halves of a deadline to the deadline itself', async () => {
    const due = thisMonthDay(22);
    const db = seedDb({
      calendarNotes: [],
      deadlines: [F.deadline('dl-home', due, { startDate: thisMonthDay(20), title: 'Ship the thing' })]
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
        { startDate: thisMonthDay(20), title: 'Ship the thing', docPageId: 'p-1' })]
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
      db: seedDb({
        calendarNotes: [],
        docPages: [F.docPage('p-1')],
        deadlines: [F.deadline('dl-tick', due, Object.assign({
          startDate: thisMonthDay(20), title: 'Ship the thing',
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
    const { db, due, start } = tickDb();
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
    assert.equal(ticked.startDate, start, 'and the caution start, so unticking restores the same run-up');
    assert.equal(ticked.time, before.time);
    assert.equal(ticked.title, 'Ship the thing');

    await clickTick(page);
    const unticked = await page.waitFor(function () {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = (((db.slots || [])[0] || {}).deadlines || [])[0];
      return d && !d.done ? d : false;
    }, { message: 'the tick being cleared again' });
    assert.equal(unticked.startDate, start, 'and the round trip leaves the span untouched');
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
      return document.querySelectorAll('#root .grid.grid-cols-7').length > 0;
    }, { message: 'the month grid' });
    // select the run-up day so the day panel lists it too
    await page.evaluate(function () {
      var cells = document.querySelectorAll('#root .grid.grid-cols-7 > div');
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
      return document.querySelectorAll('#root .grid.grid-cols-7').length > 0;
    }, { message: 'the month grid' });
    await page.evaluate(function () {
      var cells = document.querySelectorAll('#root .grid.grid-cols-7 > div');
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
    assert.equal(ticked.startDate, thisMonthDay(20), 'writing done alone, through the same spread');
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

  // ── 2e. the due day is movable, and the caution start does not follow ───

  /* Moving a deadline used to mean deleting and re-creating it, which threw
     away createdAt, docPageId, and the id every ?dl= link points at. The
     popup's Edit form now carries the due day too, under one rule: it may not
     land before the caution start, and the caution start is never rewritten to
     make room.

     That rule is load-bearing, not cosmetic. Nothing validates
     startDate <= date on a STORED record — schema.js checks each date's format
     independently — and an inverted span soft-locks the documentations.html
     edit form, whose Save is gated on dlValid against the stored startDate.
     The popup is the only writer that could reach that state, so refusing at
     the source is what keeps the invariant true everywhere else. */

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
      db: seedDb({
        calendarNotes: [],
        docPages: [F.docPage('p-1')],
        deadlines: [F.deadline('dl-move', due, Object.assign({
          startDate: thisMonthDay(15), title: 'Ship the thing',
          docPageId: 'p-1', createdAt: 1771000000000
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
    await page.waitFor(function () { return !!document.getElementById('dl-caution-from'); },
      { message: 'the deadline popup in its READ view' });
    return page;
  };
  // the due-date row lives behind Edit, beside the time it has always shown
  const openMoveEdit = async page => {
    await page.evaluate(function () {
      var pop = document.getElementById('dl-caution-from').closest('div.fixed');
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

  await t.test('the popup Edit form moves the due day and leaves the caution start where it was', async () => {
    const { db, due, start } = moveDb({ done: true });
    const page = await openMovePopup({ db, due });
    await openMoveEdit(page);

    const seeded = await page.evaluate(function () {
      return {
        date: document.getElementById('dl-due-date').value,
        min: document.getElementById('dl-due-date').getAttribute('min')
      };
    });
    assert.equal(seeded.date, due, 'the row is seeded from the stored due day');
    assert.equal(seeded.min, start, 'and cannot be dragged before the caution start');

    const moved = thisMonthDay(22);
    await setDue(page, moved);
    await clickMoveSave(page);

    const saved = await page.waitFor(function (v) {
      var db = JSON.parse(localStorage.getItem('track_db') || '{}');
      var d = (((db.slots || [])[0] || {}).deadlines || [])[0];
      return d && d.date === v ? d : false;
    }, { args: [moved], message: 'the new due day reaching track_db' });

    assert.equal(saved.date, moved, 'the due day moved');
    assert.equal(saved.startDate, start, 'and the caution start did NOT follow it');
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

  await t.test('a due day before the caution start is refused, leaving track_db byte-identical', async () => {
    const { db, due, start } = moveDb();
    const page = await openMovePopup({ db, due });
    await openMoveEdit(page);
    const before = await page.evaluate(function () { return localStorage.getItem('track_db'); });

    // one day before the caution start: the whole point of the constraint
    await setDue(page, thisMonthDay(14));
    const blocked = await page.waitFor(function () {
      var pop = document.getElementById('dl-due-date').closest('div.fixed');
      var save = Array.prototype.find.call(pop.querySelectorAll('button'),
        function (b) { return b.textContent.trim() === 'Save'; });
      return save.disabled ? { disabled: true, text: pop.textContent } : false;
    }, { message: 'Save going disabled on an inverted span' });
    assert.equal(blocked.disabled, true, 'Save is disabled');
    assert.match(blocked.text, /Caution start must be on or before the deadline/,
      'and the form says why');

    await clickMoveSave(page);
    await sleep(250);
    const after = await page.evaluate(function () { return localStorage.getItem('track_db'); });
    assert.equal(after, before, 'a refused move writes nothing at all');
    const stored = await storedMove(page);
    assert.equal(stored.date, due, 'the due day did not move');
    assert.equal(stored.startDate, start, 'and neither did the caution start');
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
    // a blank date must not ALSO raise the ordering warning — one fault, one message
    assert.doesNotMatch(blocked.text, /Caution start must be on or before/,
      'and does not also claim the caution start is out of order');

    await clickMoveSave(page);
    await sleep(250);
    assert.equal(await page.evaluate(function () { return localStorage.getItem('track_db'); }),
      before, 'nothing is written');
    assert.equal((await storedMove(page)).date, due, 'and date is never blanked');
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });

  await t.test('the run-up re-homes with the due day, keeping its stored length', async () => {
    // start 15, due 18 → after moving to 22 the "!" days are 15..21
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
    assert.deepEqual(asNums(marks.caution), [15, 16, 17, 18, 19, 20, 21],
      'the "!" days are startDate..the day before the NEW due day — the old due day is now just a run-up day');
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
      var el = document.querySelector('#root .grid.grid-cols-7');
      return el ? el.parentElement.querySelector('span.font-bold').textContent.trim() : false;
    }, { message: 'the month grid header' });
    assert.equal(month, MONTHS_SHORT[nextMonth.getMonth()] + ' ' + nextMonth.getFullYear(),
      'and the month grid opens on the month the deadline moved to');
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
    const page = await open('index.html', {
      db: seedDb({
        deadlines: [
          F.deadline('dl-sched', '2026-03-10', { startDate: '2026-03-08' }),
          F.deadline('dl-doc', '2026-03-10',
            { startDate: '2026-03-09', docPageId: 'p-1', time: '10:00', done: true })
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
    assert.equal(dl.startDate, '2026-03-09', 'and its caution period');
    assert.equal(dl.done, true, 'and its tick, which no allow-list in the importer names');

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
});
