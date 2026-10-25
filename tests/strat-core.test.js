/* ── tests/strat-core.test.js ──────────────────────────────────────────────
   Offline cover for strat-core.js — the one definition of a mind map's
   STRAT (strategy) and of which STRATs a mind map shows.

       node --test tests/strat-core.test.js

   Run once by tests/run.js rather than once per timezone, and that is a claim
   about the module rather than a convenience: nothing in strat-core.js
   constructs a Date. A write's time arrives as a PARAMETER (`now`, epoch ms
   from the page). If a `new Date()` ever appears there, this suite has moved
   to the wrong list — the structural case below is what says so.

   What is being pinned here, in order of how much it would cost to get wrong:

   1. A parent's STRAT reaches EVERY descendant, however deep, and nothing
      else: not a sibling, not a parent, not an unrelated mind map. Both pages
      read that through stratsFor, so a mistake here is a mistake on the
      Knowledge Record's panel and on the Schedule at once.

   2. The walk TERMINATES on a parent cycle. `parentIds` is plural and the
      connections picker lets a user make a mind map its own ancestor; an
      unguarded walk there throws out of a React render and empties the page.

   3. A blank save can never delete. withStrat REFUSES blank text, and only
      withoutStrat removes the key — the one the panel's × calls after its
      confirm. Deleting removes the KEY, never leaving '' behind.

   4. Ids are NUMBERS in real data (KS02's nid()), and 10 is not '10'.

   Fixtures are synthetic, always (AGENTS.md, "Preserve old data").
*/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// A browser IIFE ending in `})(window)`, so `window` has to exist before it
// runs. runInThisContext, not runInNewContext: the module is built on
// Array.isArray, and a fresh realm would make arrays built here fail it.
globalThis.window = globalThis;
const SRC = path.join(__dirname, '..', 'scripts', 'strat-core.js');
vm.runInThisContext(fs.readFileSync(SRC, 'utf8'), { filename: 'strat-core.js' });
const S = globalThis.TrackStrat;

// ── fixtures ───────────────────────────────────────────────────────────────

const NOW = 1761400000000;
const LATER = NOW + 60000;

const rec = (text, at = NOW) => ({ text, createdAt: at, updatedAt: at });
const mm = (id, name, over = {}) => Object.assign({ id, name, type: '1', parentIds: [] }, over);

// Music (anchor) → Guitar → Picking → Tremolo, with Picking holding no STRAT
// of its own, beside an unrelated mind map that has one and a sibling that
// has none. Numeric ids, as nid() mints them.
const LINEAGE = () => [
  mm(30, 'Music', { type: 'anchor', strat: rec('Slow first') }),
  mm(31, 'Guitar', { type: '2', parentIds: [30], strat: rec('Chords before strumming') }),
  mm(32, 'Picking', { type: '2', parentIds: [31] }),
  mm(33, 'Tremolo', { parentIds: [32], strat: rec('Metronome at 60') }),
  mm(34, 'Drums', { strat: rec('Count aloud') }),
  mm(35, 'Strumming', { parentIds: [31] })
];

const ids = list => list.map(s => s.mm.id);
const texts = list => list.map(s => s.text);

function deepFreeze(v) {
  if (v && typeof v === 'object') { Object.values(v).forEach(deepFreeze); Object.freeze(v); }
  return v;
}

// ── structure ──────────────────────────────────────────────────────────────

test('the module constructs no Date, which is why its suite is not swept', () => {
  // Comments are stripped first: the module's own prose explains why it
  // constructs no Date, and a check that read the prose would fail on the
  // explanation rather than on the code.
  const src = fs.readFileSync(SRC, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  assert.equal(/new Date|Date\.now|getDay\(|toISOString|getTimezoneOffset/.test(src), false,
    'strat-core.js must hold no date code — move its suite to OFFLINE_FILES if it does');
});

test('the module touches no storage', () => {
  const src = fs.readFileSync(SRC, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  assert.equal(/localStorage|sessionStorage|indexedDB/.test(src), false,
    'strat-core.js is a pure data module — sir-ks02.html owns the write');
});

test('exports exactly the reader pair and the writer pair', () => {
  assert.deepEqual(Object.keys(S).sort(), ['stratText', 'stratsFor', 'withStrat', 'withoutStrat']);
});

// ── stratText ──────────────────────────────────────────────────────────────

test('stratText reads a record, trims it, and reads a bare string as its text', () => {
  assert.equal(S.stratText(mm(1, 'A', { strat: rec('  Slow first \n') })), 'Slow first');
  assert.equal(S.stratText(mm(1, 'A', { strat: '  bare  ' })), 'bare');
});

test('stratText is total: anything that is not text reads as no STRAT, never as a throw', () => {
  for (const v of [undefined, null, 42, true, 'x', [], [1]])
    assert.equal(S.stratText(v), '', 'a mind map that is ' + JSON.stringify(v));
  for (const s of [undefined, null, 0, 42, false, [], ['Slow'], {}, { text: 5 }, { text: null },
    { text: ['x'] }, { text: '   ' }, '', '   '])
    assert.equal(S.stratText(mm(1, 'A', { strat: s })), '', 'strat ' + JSON.stringify(s));
  assert.equal(S.stratText(mm(1, 'A')), '', 'no key at all');
});

// ── stratsFor: who sees what ───────────────────────────────────────────────

test('a mind map shows every ancestor’s STRAT, farthest first, and its own last', () => {
  const got = S.stratsFor(33, LINEAGE());
  assert.deepEqual(ids(got), [30, 31, 33]);
  assert.deepEqual(texts(got), ['Slow first', 'Chords before strumming', 'Metronome at 60']);
  assert.deepEqual(got.map(s => s.own), [false, false, true]);
  assert.deepEqual(got.map(s => s.depth), [3, 2, 0]);
});

test('a mind map with no STRAT of its own still shows everything above it', () => {
  const got = S.stratsFor(32, LINEAGE());
  assert.deepEqual(ids(got), [30, 31]);
  assert.equal(got.some(s => s.own), false);
});

test('a STRAT never travels up or sideways — not to a parent, a sibling, or an unrelated mind map', () => {
  const mms = LINEAGE();
  assert.deepEqual(ids(S.stratsFor(30, mms)), [30], 'the root sees only its own');
  assert.deepEqual(ids(S.stratsFor(31, mms)), [30, 31], 'Guitar does not see Tremolo below it');
  assert.deepEqual(ids(S.stratsFor(35, mms)), [30, 31], 'a sibling branch does not see Tremolo');
  assert.deepEqual(ids(S.stratsFor(34, mms)), [34], 'Drums sees only its own');
  for (const id of [31, 32, 33, 35])
    assert.equal(ids(S.stratsFor(id, mms)).includes(34), false, 'Drums reaches nothing: ' + id);
});

test('an ancestor with no STRAT is passed through, not a stopping point', () => {
  const mms = [
    mm(1, 'Root', { strat: rec('From the root') }),
    mm(2, 'Middle', { parentIds: [1] }),
    mm(3, 'Leaf', { parentIds: [2] })
  ];
  assert.deepEqual(texts(S.stratsFor(3, mms)), ['From the root']);
});

test('the lineage has no depth limit', () => {
  const mms = [mm(0, 'Root', { strat: rec('Deep root') })];
  for (let i = 1; i <= 60; i++) mms.push(mm(i, 'Level ' + i, { parentIds: [i - 1] }));
  const got = S.stratsFor(60, mms);
  assert.deepEqual(texts(got), ['Deep root']);
  assert.equal(got[0].depth, 60);
});

test('no STRAT anywhere is an empty list, and so is an unknown mind map', () => {
  const mms = [mm(1, 'A'), mm(2, 'B', { parentIds: [1] })];
  assert.deepEqual(S.stratsFor(2, mms), []);
  assert.deepEqual(S.stratsFor(99, LINEAGE()), []);
  assert.deepEqual(S.stratsFor(undefined, LINEAGE()), []);
});

test('each entry carries the stored mind-map record itself, for its name and colour', () => {
  const mms = LINEAGE();
  const got = S.stratsFor(33, mms);
  assert.equal(got[0].mm, mms[0]);
  assert.equal(got[2].mm, mms[3]);
});

// ── stratsFor: graph shapes ────────────────────────────────────────────────

test('a diamond reaches its common ancestor once', () => {
  const mms = [
    mm(1, 'Root', { strat: rec('Root') }),
    mm(2, 'Left', { parentIds: [1] }),
    mm(3, 'Right', { parentIds: [1] }),
    mm(4, 'Child', { parentIds: [2, 3], strat: rec('Child') })
  ];
  assert.deepEqual(texts(S.stratsFor(4, mms)), ['Root', 'Child']);
});

test('an ancestor reached at two depths counts at the nearer one', () => {
  // Grand is both a parent and a grandparent of Child.
  const mms = [
    mm(1, 'Grand', { strat: rec('Grand') }),
    mm(2, 'Parent', { parentIds: [1], strat: rec('Parent') }),
    mm(3, 'Other', { strat: rec('Other') }),
    mm(4, 'Far', { strat: rec('Far') }),
    mm(5, 'Near', { parentIds: [4] }),
    mm(6, 'Child', { parentIds: [2, 1, 5] })
  ];
  const got = S.stratsFor(6, mms);
  assert.deepEqual(got.map(s => [s.text, s.depth]), [['Far', 2], ['Parent', 1], ['Grand', 1]]);
});

test('equal depths keep parentIds order', () => {
  const mms = [
    mm(1, 'First', { strat: rec('First') }),
    mm(2, 'Second', { strat: rec('Second') }),
    mm(3, 'Child', { parentIds: [2, 1] })
  ];
  assert.deepEqual(texts(S.stratsFor(3, mms)), ['Second', 'First']);
});

test('a two-mind-map parent cycle terminates and draws each STRAT once', () => {
  const mms = [
    mm(36, 'Loop A', { parentIds: [37], strat: rec('A') }),
    mm(37, 'Loop B', { parentIds: [36], strat: rec('B') })
  ];
  assert.deepEqual(texts(S.stratsFor(36, mms)), ['B', 'A']);
  assert.deepEqual(texts(S.stratsFor(37, mms)), ['A', 'B']);
  assert.deepEqual(S.stratsFor(36, mms).map(s => s.own), [false, true],
    'the start never comes back as its own ancestor');
});

test('a mind map that is its own parent shows its STRAT once, as its own', () => {
  const mms = [mm(1, 'Self', { parentIds: [1], strat: rec('Mine') })];
  assert.deepEqual(S.stratsFor(1, mms).map(s => [s.text, s.own]), [['Mine', true]]);
});

test('a cycle above the mind map terminates too', () => {
  // Leaf → P → G → P: the walk starts outside the cycle and runs into it.
  const mms = [
    mm(1, 'P', { parentIds: [2], strat: rec('P') }),
    mm(2, 'G', { parentIds: [1], strat: rec('G') }),
    mm(3, 'Leaf', { parentIds: [1] })
  ];
  assert.deepEqual(texts(S.stratsFor(3, mms)), ['G', 'P']);
});

// ── stratsFor: ids and junk ────────────────────────────────────────────────

test('ids are compared as stored: the number 10 and the string "10" are two mind maps', () => {
  const mms = [
    mm(10, 'Numeric', { strat: rec('from the number') }),
    mm('10', 'Stringy', { strat: rec('from the string') }),
    mm(11, 'Child of the number', { parentIds: [10] }),
    mm(12, 'Child of the string', { parentIds: ['10'] })
  ];
  assert.deepEqual(texts(S.stratsFor(11, mms)), ['from the number']);
  assert.deepEqual(texts(S.stratsFor(12, mms)), ['from the string']);
  assert.deepEqual(texts(S.stratsFor(10, mms)), ['from the number']);
  assert.deepEqual(texts(S.stratsFor('10', mms)), ['from the string']);
});

test('junk records, a non-list parentIds and a parent naming nothing are skipped', () => {
  const mms = [
    null, 'x', 42, [], { name: 'no id at all' },
    mm('1', 'One', { strat: rec('one') }),
    mm('2', 'Two', { strat: rec('two') }),
    mm(3, 'String parents', { parentIds: '12' }),   // would substring-match if read
    mm(4, 'Ghost parent', { parentIds: [404, null, undefined, '1'] }),
    mm(5, 'Map parents', { parentIds: { 0: '1' } }),
    { name: 'No id, with a STRAT', strat: rec('unreachable') }
  ];
  assert.deepEqual(S.stratsFor(3, mms), []);
  assert.deepEqual(texts(S.stratsFor(4, mms)), ['one'], 'an undefined parent id does not reach the id-less record');
  assert.deepEqual(S.stratsFor(5, mms), []);
  assert.deepEqual(S.stratsFor(undefined, mms), [], 'an id-less record is nobody');
});

test('a list that is not a list is no STRATs, not a throw', () => {
  for (const v of [undefined, null, 'mms', 42, {}]) assert.deepEqual(S.stratsFor(1, v), []);
});

test('duplicated ids read the first record, as progress.html’s mms.find does', () => {
  const mms = [mm(1, 'First copy', { strat: rec('first') }), mm(1, 'Second copy', { strat: rec('second') })];
  assert.deepEqual(texts(S.stratsFor(1, mms)), ['first']);
});

// ── withStrat ──────────────────────────────────────────────────────────────

test('withStrat adds the one original: text, createdAt and updatedAt, nothing else', () => {
  const mms = deepFreeze(LINEAGE());
  const next = S.withStrat(mms, 32, '  Alternate strokes  ', NOW);
  assert.notEqual(next, mms);
  assert.deepEqual(next[2].strat, { createdAt: NOW, text: 'Alternate strokes', updatedAt: NOW });
  assert.deepEqual(Object.keys(next[2].strat).sort(), ['createdAt', 'text', 'updatedAt']);
  next.forEach((m, i) => { if (i !== 2) assert.equal(m, mms[i], 'record ' + i + ' untouched'); });
  assert.equal(mms[2].strat, undefined, 'the input is not mutated');
});

test('withStrat edits in place: createdAt kept, updatedAt moved, unknown keys kept', () => {
  const mms = deepFreeze([mm(1, 'A', { future: 'kept', strat: Object.assign(rec('Old', NOW), { colour: 'violet' }) })]);
  const next = S.withStrat(mms, 1, 'New', LATER);
  assert.deepEqual(next[0].strat, { createdAt: NOW, text: 'New', updatedAt: LATER, colour: 'violet' });
  assert.equal(next[0].future, 'kept');
  assert.equal(mms[0].strat.text, 'Old', 'the input is not mutated');
});

test('withStrat writes nothing when the text is already so', () => {
  const mms = deepFreeze([mm(1, 'A', { strat: rec('Same') }), mm(2, 'B', { strat: rec('  Padded  ') })]);
  assert.equal(S.withStrat(mms, 1, 'Same', LATER), mms);
  assert.equal(S.withStrat(mms, 1, '  Same \n', LATER), mms, 'compared trimmed');
  assert.equal(S.withStrat(mms, 2, 'Padded', LATER), mms, 'a padded stored text is the same text');
});

test('withStrat REFUSES blank text — a save can never delete', () => {
  const mms = deepFreeze([mm(1, 'A', { strat: rec('Keep me') }), mm(2, 'B')]);
  for (const t of ['', '   ', '\n\t', undefined, null, 0, 42, ['x'], { text: 'x' }]) {
    assert.equal(S.withStrat(mms, 1, t, LATER), mms, 'over a STRAT: ' + JSON.stringify(t));
    assert.equal(S.withStrat(mms, 2, t, LATER), mms, 'over none: ' + JSON.stringify(t));
  }
});

test('withStrat on an unknown mind map or a non-list changes nothing', () => {
  const mms = deepFreeze(LINEAGE());
  assert.equal(S.withStrat(mms, 99, 'x', NOW), mms);
  assert.equal(S.withStrat(mms, '30', 'x', NOW), mms, 'the string "30" is not mind map 30');
  for (const v of [undefined, null, 'mms', {}]) assert.equal(S.withStrat(v, 1, 'x', NOW), v);
});

test('withStrat replaces a value that is not a record with a proper one', () => {
  const mms = deepFreeze([mm(1, 'A', { strat: 'bare' }), mm(2, 'B', { strat: 42 }), mm(3, 'C', { strat: { text: 5 } })]);
  let next = S.withStrat(mms, 1, 'Proper', NOW);
  assert.deepEqual(next[0].strat, { createdAt: NOW, text: 'Proper', updatedAt: NOW });
  next = S.withStrat(mms, 2, 'Proper', NOW);
  assert.deepEqual(next[1].strat, { createdAt: NOW, text: 'Proper', updatedAt: NOW });
  next = S.withStrat(mms, 3, 'Proper', NOW);
  assert.deepEqual(next[2].strat, { createdAt: NOW, text: 'Proper', updatedAt: NOW });
});

test('withStrat writes every record with the id, as KS02’s own setMms maps do', () => {
  const mms = deepFreeze([mm(1, 'First'), mm(2, 'Other'), mm(1, 'Second')]);
  const next = S.withStrat(mms, 1, 'Both', NOW);
  assert.equal(next[0].strat.text, 'Both');
  assert.equal(next[1], mms[1]);
  assert.equal(next[2].strat.text, 'Both');
});

test('a write lands on ONE record: descendants hold no copy, and still see it', () => {
  const mms = deepFreeze(LINEAGE());
  const next = S.withStrat(mms, 30, 'Slower first', LATER);
  next.forEach((m, i) => { if (i !== 0) assert.equal(m, mms[i], 'record ' + i + ' untouched'); });
  assert.deepEqual(texts(S.stratsFor(33, next)), ['Slower first', 'Chords before strumming', 'Metronome at 60']);
});

// ── withoutStrat ───────────────────────────────────────────────────────────

test('withoutStrat removes the KEY — never leaving "" or null — and keeps every other key', () => {
  const mms = deepFreeze([mm(1, 'A', { future: 'kept', comments: [{ id: 9, text: 'c' }], strat: rec('Gone') })]);
  const next = S.withoutStrat(mms, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(next[0], 'strat'), false);
  assert.deepEqual(Object.keys(next[0]).sort(), ['comments', 'future', 'id', 'name', 'parentIds', 'type']);
  assert.equal(next[0].comments, mms[0].comments);
  assert.equal(mms[0].strat.text, 'Gone', 'the input is not mutated');
});

test('withoutStrat changes nothing when there is no key, no such mind map, or no list', () => {
  const mms = deepFreeze(LINEAGE());
  assert.equal(S.withoutStrat(mms, 32), mms, 'Picking has no STRAT of its own');
  assert.equal(S.withoutStrat(mms, 99), mms);
  assert.equal(S.withoutStrat(mms, '30'), mms, 'the string "30" is not mind map 30');
  for (const v of [undefined, null, 'mms', {}]) assert.equal(S.withoutStrat(v, 1), v);
});

test('deleting a parent’s STRAT takes it off every descendant at once', () => {
  const next = S.withoutStrat(LINEAGE(), 31);
  assert.deepEqual(ids(S.stratsFor(33, next)), [30, 33]);
  assert.deepEqual(ids(S.stratsFor(32, next)), [30]);
  assert.deepEqual(ids(S.stratsFor(31, next)), [30]);
});
