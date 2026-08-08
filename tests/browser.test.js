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

const PAGES = ['index.html', 'progress.html', 'sir-ks02.html', 'documentations.html'];

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
  const open = async (file, { db = null, hash = '', fresh = true, extra = null } = {}) => {
    const page = await browser.newPage();
    if (fresh) await page.clearStorage(server.origin);
    if (db || extra) await page.seed(db || {}, extra || {});
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
      notes: [{ id: 'w-x' }], futureField: { written: 'by a later version' } };
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

  // ── 3. export → import ──────────────────────────────────────────────────

  await t.test('export → import preserves docPageId and every canonical field', async () => {
    const page = await open('index.html', { db: seedDb() });
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

    // every canonical user-owned field survives, value for value
    for (const key of ['sessions', 'mms', 'kolbs', 'mgChanges', 'linChanges', 'linDayTitles',
      'goals', 'saActions', 'saEntries', 'sourceDumps', 'notes', 'mmEntries', 'mgSchedule',
      'calendarNotes', 'deadlines', 'pos', 'levelTemplates', 'docPages']) {
      assert.deepEqual(imported[key], original[key], key + ' round-tripped unchanged');
    }

    // The allow-list must not silently shrink back.
    assert.equal(Object.keys(imported).length, 21, 'the imported slot carries all 21 canonical fields');

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
    'levelTemplates', 'docPages'
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
        file + ' builds the full 21-field contract, not its own subset');
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
});
