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
    'dayLabel', 'firstLine', 'isBlank', 'isTag', 'tagInfo', 'dateNoteTag', 'dateNoteLocked', 'withDateTag',
    'monthOf', 'shiftMonth', 'addDays', 'addMonths', 'monthLabel', 'monthGrid']) {
    assert.equal(typeof N[name], 'function', name + ' is exported');
  }
  assert.equal(N.MAX_PANES, 4);
  assert.deepEqual(N.TAGS.map(t => [t.id, t.label]), [['unclear', 'unclear'], ['cleared', 'cleared'], ['eternal', 'Eternal']],
    'three tags, in the order and the words the user chose');
  assert.deepEqual(N.TAGS.map(t => [t.id, t.locked]), [['unclear', false], ['cleared', true], ['eternal', true]],
    'cleared and Eternal lock the text; unclear is the one that edits');
  assert.equal(N.DEFAULT_TAG, 'unclear');
  assert.deepEqual(N.WEEKDAYS, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], 'Sunday first, like TrackCalendar.DOWS');
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

// ── tags ───────────────────────────────────────────────────────────────────
// Red "unclear" is the DEFAULT for a written day, by absence — that is what
// makes every note written before tags existed red without a migration. An
// unwritten day shows no tag at all.

test('dateNoteTag: a written day with no tag is unclear; an unwritten day is uncoloured', () => {
  const map = JSON.parse(JSON.stringify({
    '2026-09-20': { content: 'written before tags existed', createdAt: 1, updatedAt: 1 },
    '2026-09-21': { content: 'sorted out', tag: 'cleared' },
    '2026-09-22': { content: 'keep forever', tag: 'eternal' },
    '2026-09-23': 'a bare string is written too',
    '2026-09-24': { content: 'a later version\'s tag', tag: 'pinned' },
    '2026-09-25': { content: 'a stray stored default', tag: 'unclear' },
    '2026-09-26': { tag: 'cleared' },
    '2026-09-27': { content: '   \n', tag: 'eternal' }
  }));
  assert.equal(N.dateNoteTag(map, '2026-09-20'), 'unclear', 'no tag stored: the default');
  assert.equal(N.dateNoteTag(map, '2026-09-21'), 'cleared');
  assert.equal(N.dateNoteTag(map, '2026-09-22'), 'eternal');
  assert.equal(N.dateNoteTag(map, '2026-09-23'), 'unclear', 'a bare string is a written, untagged day');
  assert.equal(N.dateNoteTag(map, '2026-09-24'), 'unclear', 'an unknown tag shows the default');
  assert.equal(N.dateNoteTag(map, '2026-09-25'), 'unclear');
  assert.equal(N.dateNoteTag(map, '2026-09-26'), '', 'nothing written: no colour, whatever the record claims');
  assert.equal(N.dateNoteTag(map, '2026-09-27'), '', 'blank text is nothing written');
  assert.equal(N.dateNoteTag(map, '2026-09-30'), '', 'a day the map does not hold');
  assert.equal(map['2026-09-24'].tag, 'pinned', 'reading deletes nothing');
});

test('dateNoteTag is total, and an inherited name is never a tag', () => {
  const map = JSON.parse('{"__proto__": {"content": "x", "tag": "cleared"}, "2026-09-27": {"content": "x", "tag": "constructor"}}');
  assert.equal(N.dateNoteTag(map, '2026-09-27'), 'unclear', '"constructor" is not a tag');
  for (const name of ['constructor', 'toString', 'hasOwnProperty', '__proto__', '', null, undefined, 5, {}]) {
    assert.equal(N.isTag(name), false, String(name) + ' is not a tag');
  }
  for (const notAMap of [undefined, null, 42, 'x', []]) {
    assert.equal(N.dateNoteTag(notAMap, '2026-09-27'), '');
  }
  assert.equal(N.tagInfo('eternal').label, 'Eternal');
  assert.equal(N.tagInfo('toString'), null);
});

test('withDateTag sets a tag by spreading: createdAt and an unknown key survive', () => {
  const map = { '2026-09-27': { content: 'draft', createdAt: 5, updatedAt: 5, laterKey: 'kept' } };
  const out = N.withDateTag(map, '2026-09-27', 'cleared', 9);
  assert.deepEqual(out['2026-09-27'], { content: 'draft', createdAt: 5, updatedAt: 9, laterKey: 'kept', tag: 'cleared' });
  assert.deepEqual(N.withDateTag(out, '2026-09-27', 'eternal', 10)['2026-09-27'].tag, 'eternal', 'one tag per day: it is replaced');
});

test('choosing unclear DELETES the key — the default is never stored', () => {
  const map = { '2026-09-27': { content: 'draft', createdAt: 5, updatedAt: 5, tag: 'eternal' } };
  const out = N.withDateTag(map, '2026-09-27', 'unclear', 9);
  assert.equal(Object.prototype.hasOwnProperty.call(out['2026-09-27'], 'tag'), false, 'no tag key at all');
  assert.deepEqual(out['2026-09-27'], { content: 'draft', createdAt: 5, updatedAt: 9 });
  assert.equal(N.dateNoteTag(out, '2026-09-27'), 'unclear', 'and the day still shows unclear');
});

test('withDateTag refuses, handing back the SAME map, wherever there is nothing to do', () => {
  const map = {
    '2026-09-26': { content: 'untagged' },
    '2026-09-27': { content: 'draft', tag: 'cleared' },
    '2026-09-28': { content: '  ' }
  };
  assert.equal(N.withDateTag(map, '2026-09-27', 'cleared', 9), map, 'the same tag again');
  assert.equal(N.withDateTag(map, '2026-09-26', 'unclear', 9), map, 'the default on an untagged day');
  assert.equal(N.withDateTag(map, '2026-09-28', 'eternal', 9), map, 'a day with nothing written cannot be tagged');
  assert.equal(N.withDateTag(map, '2026-09-29', 'eternal', 9), map, 'nor can a day the map does not hold');
  assert.equal(N.withDateTag(map, '2026-02-30', 'eternal', 9), map, 'a day that does not exist');
  assert.equal(N.withDateTag(map, '2026-09-26', 'pinned', 9), map, 'a tag that is not one of the three');
  assert.equal(N.withDateTag(map, '2026-09-26', 'constructor', 9), map, 'an inherited name');
  assert.equal(N.withDateTag(map, '2026-09-26', '', 9), map, 'blank is not a way to untag');
});

test('withDateTag never mutates its input, and keeps a JSON-parsed __proto__ as data', () => {
  const map = JSON.parse('{"__proto__": {"content": "odd"}, "2026-09-27": {"content": "a", "tag": "cleared"}}');
  const before = JSON.stringify(map);
  const out = N.withDateTag(map, '2026-09-27', 'eternal', 1);
  N.withDateTag(map, '2026-09-27', 'unclear', 1);
  assert.equal(JSON.stringify(map), before);
  assert.equal(Object.getPrototypeOf(out), Object.prototype);
  assert.equal(Object.prototype.hasOwnProperty.call(out, '__proto__'), true, 'the key was kept');
});

test('tagging a bare-string day upgrades it to a record and keeps its text', () => {
  const out = N.withDateTag({ '2026-09-27': 'hand-written' }, '2026-09-27', 'eternal', 3);
  assert.deepEqual(out['2026-09-27'], { content: 'hand-written', tag: 'eternal', createdAt: 3, updatedAt: 3 });
});

// ── the lock ───────────────────────────────────────────────────────────────
// Cleared and Eternal FREEZE a day's text: read, copied and opened beside, never
// edited or emptied, until the day is made unclear again. The rule is in the
// writer, so a save from a stale tab meets it too.

test('a cleared or Eternal day refuses ANY change to its text — the SAME map comes back, emptying included', () => {
  const map = {
    '2026-09-26': { content: 'sorted out', createdAt: 1, updatedAt: 1, tag: 'cleared' },
    '2026-09-27': { content: 'keep forever', createdAt: 1, updatedAt: 1, tag: 'eternal' }
  };
  const before = JSON.stringify(map);
  for (const day of ['2026-09-26', '2026-09-27']) {
    assert.equal(N.withDateNote(map, day, 'rewritten', 2), map, day + ': an edit is refused');
    assert.equal(N.withDateNote(map, day, map[day].content + ' and more', 2), map, day + ': so is an append');
    for (const blank of ['', '   ', '\n']) {
      assert.equal(N.withDateNote(map, day, blank, 2), map, day + ': and emptying ' + JSON.stringify(blank));
    }
  }
  assert.equal(JSON.stringify(map), before, 'nothing was mutated');
  assert.equal(N.withDateNote(map, '2026-09-28', 'a new day', 2)['2026-09-28'].content, 'a new day',
    'a lock is per day: the next day writes as ever');
});

test('dateNoteLocked: only a WRITTEN day showing cleared or Eternal is locked, and it is total', () => {
  const map = JSON.parse(JSON.stringify({
    '2026-09-20': { content: 'untagged' },
    '2026-09-21': { content: 'x', tag: 'cleared' },
    '2026-09-22': { content: 'x', tag: 'eternal' },
    '2026-09-23': 'a bare string',
    '2026-09-24': { content: 'x', tag: 'pinned' },
    '2026-09-25': { content: 'x', tag: 'constructor' },
    '2026-09-26': { tag: 'cleared' },
    '2026-09-27': { content: '  ', tag: 'eternal' }
  }));
  const locked = Object.keys(map).concat(['2026-09-30']).filter(day => N.dateNoteLocked(map, day));
  assert.deepEqual(locked, ['2026-09-21', '2026-09-22'],
    'unclear, a bare string, an unknown or inherited tag, nothing written and an absent day are all editable');
  for (const notAMap of [undefined, null, 42, 'x', []]) {
    assert.equal(N.dateNoteLocked(notAMap, '2026-09-27'), false);
  }
});

test('unclear UNLOCKS: after it the text edits and empties exactly as an untagged day\'s does', () => {
  const map = { '2026-09-27': { content: 'draft', createdAt: 1, updatedAt: 1, tag: 'eternal' } };
  const open = N.withDateTag(map, '2026-09-27', 'unclear', 2);
  assert.equal(N.dateNoteLocked(open, '2026-09-27'), false);
  assert.deepEqual(N.withDateNote(open, '2026-09-27', 'draft, edited', 3)['2026-09-27'],
    { content: 'draft, edited', createdAt: 1, updatedAt: 3 });
  assert.equal(Object.prototype.hasOwnProperty.call(N.withDateNote(open, '2026-09-27', ' ', 3), '2026-09-27'), false,
    'and emptying deletes the day — an empty day and an untouched day are the same state');
  assert.equal(N.dateNoteLocked(N.withDateTag(open, '2026-09-27', 'cleared', 4), '2026-09-27'), true,
    'and a tag locks it again');
});

test('an edit carries a tag this version does not know, and emptying deletes the day, tag and all', () => {
  // A later version's tag reads as unclear here, so it locks nothing — and the
  // spread still carries it through, so that version gets it back.
  const map = { '2026-09-27': { content: 'draft', createdAt: 1, updatedAt: 1, tag: 'pinned' } };
  assert.equal(N.withDateNote(map, '2026-09-27', 'draft, longer', 2)['2026-09-27'].tag, 'pinned');
  const emptied = N.withDateNote(map, '2026-09-27', '  ', 2);
  assert.equal(Object.prototype.hasOwnProperty.call(emptied, '2026-09-27'), false,
    'an emptied day is gone — an empty day and an untouched day are the same state');
  assert.equal(N.dateNoteTag(N.withDateNote(emptied, '2026-09-27', 'written again', 3), '2026-09-27'), 'unclear',
    'written again, it starts over at the default');
});

test('datedDays entries carry the tag each day shows', () => {
  const map = { '2026-09-25': { content: 'a' }, '2026-09-26': { content: 'b', tag: 'eternal' }, '2026-09-27': { tag: 'cleared' } };
  assert.deepEqual(N.datedDays(map), [
    { day: '2026-09-26', text: 'b', tag: 'eternal' },
    { day: '2026-09-25', text: 'a', tag: 'unclear' }
  ], 'an unwritten record is still not listed');
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

// ── the month grid, swept ──────────────────────────────────────────────────
// What the calendar pop-up draws. The sweep is the point: a grid seeded from
// `new Date('2026-03-01')` starts on the wrong Sunday everywhere west of UTC.

function nextDay(day) {
  const d = new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10) + 1, 12);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function weekday(day) { return new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), 12).getDay(); }

test('monthGrid: 42 consecutive real days from a Sunday, with the 1st in its own weekday column', () => {
  // Feb 2026 starts on a Sunday (no lead), leap Feb 2024, a Dec→Jan year turn,
  // and the two US DST months the Los Angeles sweep crosses.
  for (const [ym, first] of [['2026-02', '2026-02-01'], ['2024-02', '2024-01-28'], ['2026-12', '2026-11-29'],
    ['2027-01', '2026-12-27'], ['2026-03', '2026-03-01'], ['2026-11', '2026-11-01'], ['2026-10', '2026-09-27']]) {
    const grid = N.monthGrid(ym);
    assert.equal(grid.length, 42, ym + ': six whole weeks');
    assert.equal(grid[0].day, first, ym + ': starts on the Sunday on or before the 1st (TZ=' + TZ + ')');
    assert.equal(weekday(grid[0].day), 0, ym + ': and that is a Sunday');
    for (let i = 1; i < 42; i++) {
      assert.equal(grid[i].day, nextDay(grid[i - 1].day), ym + ': cell ' + i + ' follows the one before it');
      assert.ok(S.isDay(grid[i].day), grid[i].day + ' is a real day');
    }
    const inMonth = grid.filter(c => c.inMonth).map(c => c.day);
    assert.equal(inMonth[0], ym + '-01', ym + ': the 1st is the first day marked in the month');
    assert.ok(inMonth.every(d => d.slice(0, 7) === ym), ym + ': inMonth marks only that month');
    assert.equal(inMonth.length, new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate(), ym + ': every day of it');
  }
  assert.equal(N.monthGrid('2024-02').filter(c => c.inMonth).length, 29, 'a leap February has its 29th');
  assert.deepEqual(N.monthGrid('2026-13'), []);
  assert.deepEqual(N.monthGrid('2026-10-02'), []);
});

test('month and day steps cross year boundaries, and a month end clamps', () => {
  assert.equal(N.shiftMonth('2026-01', -1), '2025-12');
  assert.equal(N.shiftMonth('2026-12', 1), '2027-01');
  assert.equal(N.shiftMonth('2026-10', -12), '2025-10');
  assert.equal(N.shiftMonth('2026-10', 15), '2028-01');
  assert.equal(N.shiftMonth('bad', 1), 'bad', 'a malformed month comes back unchanged');
  assert.equal(N.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(N.addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(N.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(N.addDays('2026-03-07', 7), '2026-03-14', 'across the March DST change');
  assert.equal(N.addDays('2026-11-01', -7), '2026-10-25', 'and back across the November one');
  assert.equal(N.addMonths('2026-01-31', 1), '2026-02-28', 'clamped to the shorter month');
  assert.equal(N.addMonths('2024-03-31', -1), '2024-02-29');
  assert.equal(N.addMonths('2026-12-15', 1), '2027-01-15');
  assert.equal(N.monthOf('2026-10-02'), '2026-10');
  assert.equal(N.monthOf('2026-02-30'), '');
  assert.equal(N.monthLabel('2026-10'), 'October 2026');
  assert.equal(N.monthLabel('2027-01'), 'January 2027');
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
