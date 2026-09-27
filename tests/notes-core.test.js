/* ── tests/notes-core.test.js ──────────────────────────────────────────────
   Offline cover for notes-core.js — what a Sorted note and a Date note are.

       node --test tests/notes-core.test.js
       TZ=Pacific/Midway node --test tests/notes-core.test.js

   Swept under every timezone by tests/run.js, because dayLabel turns a stored
   'YYYY-MM-DD' into a weekday — and `new Date('2026-03-01')` is UTC midnight,
   which is still Saturday 28 February everywhere west of UTC. That bug is
   invisible on a machine running in UTC.
*/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Page order: schema.js supplies isDay, exactly as it does in the browser.
// runInThisContext for the same reason schema.test.js gives.
globalThis.window = globalThis;
for (const file of ['schema.js', 'notes-core.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'scripts', file), 'utf8'), { filename: file });
}
const N = globalThis.TrackNotes;
const S = globalThis.TrackSchema;
const TZ = process.env.TZ || '(system default)';

test('module surface', () => {
  assert.ok(N, 'notes-core.js published window.TrackNotes under TZ=' + TZ);
  for (const name of ['dateNoteText', 'withDateNote', 'datedDays', 'withSortedPatch', 'appendSent',
    'dayLabel', 'firstLine', 'isBlank']) {
    assert.equal(typeof N[name], 'function', name + ' is exported');
  }
  assert.equal(N.MAX_PANES, 4);
});

// ── withDateNote: the one writer ───────────────────────────────────────────

test('the first non-blank text creates a record under the day', () => {
  const out = N.withDateNote({}, '2026-09-27', 'first idea', 1000);
  assert.deepEqual(out, { '2026-09-27': { content: 'first idea', createdAt: 1000, updatedAt: 1000 } });
});

test('an edit spreads the record: createdAt and an unknown key survive', () => {
  const map = { '2026-09-27': { content: 'a', createdAt: 5, updatedAt: 5, laterKey: 'kept' } };
  const out = N.withDateNote(map, '2026-09-27', 'ab', 9);
  assert.deepEqual(out['2026-09-27'], { content: 'ab', createdAt: 5, updatedAt: 9, laterKey: 'kept' });
});

test('blank text DELETES the key — an empty string is never stored', () => {
  const map = { '2026-09-26': { content: 'keep' }, '2026-09-27': { content: 'draft', createdAt: 1 } };
  for (const blank of ['', '   ', '\n\t\n']) {
    const out = N.withDateNote(map, '2026-09-27', blank, 2);
    assert.equal(Object.prototype.hasOwnProperty.call(out, '2026-09-27'), false,
      JSON.stringify(blank) + ' removed the day');
    assert.deepEqual(out, { '2026-09-26': { content: 'keep' } }, 'and left every other day alone');
  }
});

test('the writer never mutates its input', () => {
  const map = { '2026-09-27': { content: 'a', createdAt: 1, updatedAt: 1 } };
  const before = JSON.stringify(map);
  N.withDateNote(map, '2026-09-27', 'changed', 2);
  N.withDateNote(map, '2026-09-27', '', 2);
  N.withDateNote(map, '2026-09-28', 'new', 2);
  assert.equal(JSON.stringify(map), before);
});

test('identity when unchanged: the SAME map comes back, so the widget writes nothing', () => {
  const map = { '2026-09-27': { content: 'same', createdAt: 1, updatedAt: 1 } };
  assert.equal(N.withDateNote(map, '2026-09-27', 'same', 99), map, 'identical text');
  assert.equal(N.withDateNote(map, '2026-09-28', '', 99), map, 'blank text on a day that holds nothing');
  assert.equal(N.withDateNote(map, '2026-02-30', 'x', 99), map, 'a day that does not exist is refused');
  assert.equal(N.withDateNote(map, 'today', 'x', 99), map, 'and so is a word');
});

test('a bare-string day is upgraded to a record on its next edit, not lost', () => {
  const out = N.withDateNote({ '2026-09-27': 'hand-written' }, '2026-09-27', 'hand-written, edited', 3);
  assert.deepEqual(out['2026-09-27'], { content: 'hand-written, edited', createdAt: 3, updatedAt: 3 });
});

test('a JSON-parsed __proto__ key survives a write as data, and changes no prototype', () => {
  const map = JSON.parse('{"__proto__": {"content": "odd"}, "2026-09-27": {"content": "a"}}');
  const out = N.withDateNote(map, '2026-09-27', 'b', 1);
  assert.equal(Object.getPrototypeOf(out), Object.prototype);
  assert.equal(Object.prototype.hasOwnProperty.call(out, '__proto__'), true, 'the key was kept');
  assert.equal(JSON.stringify(out), '{"__proto__":{"content":"odd"},"2026-09-27":{"content":"b","createdAt":1,"updatedAt":1}}');
});

// ── the reader ─────────────────────────────────────────────────────────────

test('dateNoteText is total over any map, key and value', () => {
  const map = JSON.parse('{"a":null,"b":5,"c":"bare","d":{"content":5},"e":{"content":"ok"},"f":[]}');
  assert.equal(N.dateNoteText(map, 'a'), '');
  assert.equal(N.dateNoteText(map, 'b'), '');
  assert.equal(N.dateNoteText(map, 'c'), 'bare', 'a bare string reads as content');
  assert.equal(N.dateNoteText(map, 'd'), '');
  assert.equal(N.dateNoteText(map, 'e'), 'ok');
  assert.equal(N.dateNoteText(map, 'f'), '');
  for (const inherited of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
    assert.equal(N.dateNoteText({}, inherited), '', inherited + ' is not a day this map holds');
  }
  for (const notAMap of [undefined, null, 42, 'x', []]) {
    assert.equal(N.dateNoteText(notAMap, '2026-09-27'), '');
  }
});

test('datedDays: real days with text, newest first; a bad key is skipped and LEFT in place', () => {
  const map = {
    '2026-09-25': { content: 'older' },
    '2026-09-27': { content: 'newest' },
    '2026-09-26': { content: '   ' },
    '2025-12-31': 'bare string, last year',
    'not-a-day': { content: 'hand-edited' },
    '2026-02-30': { content: 'no such day' }
  };
  assert.deepEqual(N.datedDays(map).map(e => e.day), ['2026-09-27', '2026-09-25', '2025-12-31']);
  assert.equal(N.datedDays(map)[2].text, 'bare string, last year');
  assert.equal(map['not-a-day'].content, 'hand-edited', 'listing deletes nothing');
  assert.deepEqual(N.datedDays(null), []);
  assert.deepEqual(N.datedDays([]), []);
});

// ── Sorted notes ───────────────────────────────────────────────────────────

test('withSortedPatch spreads into the ONE matching note', () => {
  const list = [{ id: 'a', topic: 'A', content: 'x', laterKey: 1 }, { id: 'b', topic: 'B', content: 'y' }];
  const r = N.withSortedPatch(list, 'a', { content: 'x2' });
  assert.equal(r.found, true);
  assert.deepEqual(r.list[0], { id: 'a', topic: 'A', content: 'x2', laterKey: 1 });
  assert.equal(r.list[1], list[1], 'the other note is the same object');
  assert.equal(list[0].content, 'x', 'the input list is not mutated');
});

test('a missing id is found:false and hands the list back untouched — never recreated', () => {
  const list = [{ id: 'a' }, null, 'junk'];
  const r = N.withSortedPatch(list, 'gone', { content: 'typed into a deleted note' });
  assert.equal(r.found, false);
  assert.equal(r.list, list);
  assert.deepEqual(N.withSortedPatch(undefined, 'a', {}), { list: [], found: false });
});

// ── send ───────────────────────────────────────────────────────────────────

test('appendSent adds on a line of its own and never replaces', () => {
  assert.equal(N.appendSent('', 'new'), 'new');
  assert.equal(N.appendSent(undefined, 'new'), 'new');
  assert.equal(N.appendSent('old', 'new'), 'old\nnew');
  assert.equal(N.appendSent('old\n', 'new'), 'old\nnew', 'no blank line when one already ends it');
  assert.equal(N.appendSent('old', ''), 'old', 'sending nothing changes nothing');
  assert.equal(N.appendSent('old', null), 'old');
});

// ── labels, swept ──────────────────────────────────────────────────────────

test('dayLabel names the weekday from components, in every timezone', () => {
  // 1 March 2026 is a Sunday. new Date('2026-03-01') would say Saturday
  // everywhere west of UTC — this is the case the sweep exists for.
  assert.equal(N.dayLabel('2026-03-01', '2026-06-15'), 'Sun 1 Mar');
  assert.equal(N.dayLabel('2026-12-31', '2026-06-15'), 'Thu 31 Dec');
  assert.equal(N.dayLabel('2024-02-29', '2026-06-15'), 'Thu 29 Feb 2024', 'a leap day, with its year');
});

test('Today / Yesterday / Tomorrow across month and year boundaries', () => {
  assert.equal(N.dayLabel('2026-09-27', '2026-09-27'), 'Today · Sun 27 Sep');
  assert.equal(N.dayLabel('2026-02-28', '2026-03-01'), 'Yesterday · Sat 28 Feb');
  assert.equal(N.dayLabel('2025-12-31', '2026-01-01'), 'Yesterday · Wed 31 Dec 2025', 'across the year, with its year');
  assert.equal(N.dayLabel('2027-01-01', '2026-12-31'), 'Tomorrow · Fri 1 Jan 2027');
  // a DST change sits between these two in Los Angeles; noon arithmetic keeps it one day
  assert.equal(N.dayLabel('2026-03-07', '2026-03-08'), 'Yesterday · Sat 7 Mar');
  assert.equal(N.dayLabel('2026-11-01', '2026-11-02'), 'Yesterday · Sun 1 Nov');
});

test('the label agrees with the local day TrackSchema stamps, at both ends of a day', () => {
  for (const at of [new Date(2026, 0, 1, 0, 15), new Date(2026, 0, 1, 23, 45)]) {
    const today = S.localToday(at);
    assert.equal(today, '2026-01-01');
    assert.equal(N.dayLabel(today, today), 'Today · Thu 1 Jan');
  }
});

test('dayLabel is total', () => {
  assert.equal(N.dayLabel('not-a-day', '2026-09-27'), 'not-a-day');
  assert.equal(N.dayLabel('2026-09-27', undefined), 'Sun 27 Sep 2026', 'no today: the year is always shown');
});

test('firstLine is the first non-blank line, capped', () => {
  assert.equal(N.firstLine('\n\n  hello  \nworld'), 'hello');
  assert.equal(N.firstLine(''), '');
  assert.equal(N.firstLine(null), '');
  assert.equal(N.firstLine('x'.repeat(100), 10), 'xxxxxxxxx…');
});

// ── structural ─────────────────────────────────────────────────────────────

test('neither notes file asks for a UTC day', () => {
  // Comments stripped first — both files explain at length why they avoid it.
  for (const file of ['notes-core.js', 'notes-widget.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:'"])\/\/[^\n]*/g, '$1 ');
    assert.equal(/toISOString|getUTC|new Date\(\s*['"]?\d{4}-/.test(src), false,
      file + ' must use local calendar days');
  }
});
