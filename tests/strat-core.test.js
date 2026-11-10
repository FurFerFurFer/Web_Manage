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

   5. A STRAT that SPREADS FROM a mind map above it (`strat.originId`, the
      user's 2026-11-10 rule) reaches that origin and everything under it,
      and only that: the writer shows it once, as its own; it takes the
      origin's one STRAT, so the picker and the writer refuse an origin that
      has one; and it is read as stored — a writer moved out from under its
      origin keeps spreading from it, a deleted origin reads as no link.

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

test('exports exactly the readers and the two writer pairs', () => {
  assert.deepEqual(Object.keys(S).sort(), ['linkChoices', 'linkRefusal', 'stratLink', 'stratText', 'stratsFor',
    'withStrat', 'withStratOrigin', 'withoutStrat', 'withoutStratOrigin']);
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

// ── spreading from a mind map above (2026-11-10) ───────────────────────────
//
// The user's case, in synthetic form: ICS (anchor) → CORE ICS (anchor) →
// ICS strategy, which holds the STRAT meant for all of ICS, beside Learning
// system (another branch under ICS) with a child of its own, a child under
// ICS strategy, Extra Brain above ICS, and Drums outside the tree.
const ICS = (strat = { text: 'Backbone before detail', createdAt: NOW, updatedAt: NOW, originId: 1 }) => [
  mm(0, 'Extra Brain', { type: 'anchor' }),
  mm(1, 'ICS', { type: 'anchor', parentIds: [0] }),
  mm(2, 'CORE ICS', { type: 'anchor', parentIds: [1] }),
  mm(3, 'ICS strategy', { parentIds: [2], strat }),
  mm(4, 'Learning system', { parentIds: [1] }),
  mm(5, 'Encoding', { parentIds: [4] }),
  mm(6, 'Strategy detail', { parentIds: [3] }),
  mm(7, 'Drums', { strat: rec('Count aloud') })
];
const unlinked = () => ICS(rec('Backbone before detail'));
const view = list => list.map(s => [s.mm.id, s.own, s.depth, s.origin ? s.origin.id : null, s.hosted]);

test('a linked STRAT reaches its origin and EVERY mind map under it, as the writer’s, from the origin’s depth', () => {
  const mms = deepFreeze(ICS());
  assert.deepEqual(view(S.stratsFor(1, mms)), [[3, false, 0, 1, true]], 'ICS shows it as the STRAT spreading from it');
  assert.deepEqual(view(S.stratsFor(2, mms)), [[3, false, 1, 1, false]], 'CORE ICS, one under ICS');
  assert.deepEqual(view(S.stratsFor(4, mms)), [[3, false, 1, 1, false]], 'Learning system — another branch under ICS');
  assert.deepEqual(view(S.stratsFor(5, mms)), [[3, false, 2, 1, false]], 'Encoding, two under ICS');
  assert.deepEqual(view(S.stratsFor(6, mms)), [[3, false, 3, 1, false]], 'a child of the writer sees it because it is under ICS');
  assert.equal(S.stratsFor(1, mms)[0].mm, mms[3], 'the entry names the mind map it is WRITTEN on');
  assert.equal(S.stratsFor(1, mms)[0].text, 'Backbone before detail');
});

test('a linked STRAT never reaches above its origin, or outside it', () => {
  const mms = ICS();
  assert.deepEqual(S.stratsFor(0, mms), [], 'Extra Brain is above ICS');
  assert.deepEqual(texts(S.stratsFor(7, mms)), ['Count aloud'], 'Drums is outside the tree');
});

test('the writer shows its linked STRAT ONCE, as its own, last — never again as spreading from above', () => {
  assert.deepEqual(view(S.stratsFor(3, ICS())), [[3, true, 0, 1, false]]);
});

test('unlinked, the same STRAT spreads from the writer as it always did', () => {
  const mms = unlinked();
  assert.deepEqual(S.stratsFor(1, mms), []);
  assert.deepEqual(S.stratsFor(4, mms), [], 'another branch under ICS sees nothing');
  assert.deepEqual(view(S.stratsFor(6, mms)), [[3, false, 1, null, false]]);
  assert.deepEqual(view(S.stratsFor(3, mms)), [[3, true, 0, null, false]]);
});

test('linked STRATs take their place among the others by the ORIGIN’s depth', () => {
  const mms = ICS();
  mms[0].strat = rec('Extra Brain first');
  mms[2].strat = rec('Core first');
  assert.deepEqual(texts(S.stratsFor(5, mms)), ['Extra Brain first', 'Backbone before detail'],
    'Encoding: Extra Brain (3 up), then ICS strategy’s from ICS (2 up)');
  assert.deepEqual(texts(S.stratsFor(6, mms)), ['Extra Brain first', 'Backbone before detail', 'Core first'],
    'Strategy detail: ICS (3 up) before CORE ICS (2 up), though it is written on its parent');
});

test('at one origin, the STRAT written there comes first, then those spreading from it in stored order', () => {
  // Two claims on one origin can only arrive from a race between tabs or a
  // hand-edited file; both are SHOWN, never one hidden behind the other.
  const mms = ICS();
  mms.push(mm(8, 'Second writer', { parentIds: [1], strat: Object.assign(rec('Second claim'), { originId: 1 }) }));
  mms[1].strat = rec('ICS’s own');
  assert.deepEqual(texts(S.stratsFor(4, mms)), ['ICS’s own', 'Backbone before detail', 'Second claim']);
  assert.deepEqual(view(S.stratsFor(1, mms)), [[3, false, 0, 1, true], [8, false, 0, 1, true], [1, true, 0, null, false]]);
});

test('a writer moved out from under its origin keeps spreading from it — the user’s choice', () => {
  const mms = ICS();
  mms[3].parentIds = [7];   // ICS strategy now sits under Drums
  assert.deepEqual(view(S.stratsFor(4, mms)), [[3, false, 1, 1, false]], 'Learning system still shows it');
  assert.deepEqual(view(S.stratsFor(3, mms)), [[7, false, 1, null, false], [3, true, 0, 1, false]],
    'the writer still lists it, as its own, wherever it spreads from');
  assert.deepEqual(texts(S.stratsFor(6, mms)), ['Count aloud'], 'its child is no longer under ICS, so it no longer sees it');
  assert.deepEqual(S.stratLink(3, mms), { originId: 1, origin: mms[1], lost: false, above: false });
});

test('an origin that names nothing reads as no link: it spreads from the writer, and the key is kept', () => {
  const mms = deepFreeze(ICS().filter(m => m.id !== 1));
  assert.deepEqual(view(S.stratsFor(6, mms)), [[3, false, 1, null, false]]);
  assert.deepEqual(view(S.stratsFor(3, mms)), [[3, true, 0, null, false]]);
  assert.deepEqual(S.stratLink(3, mms), { originId: 1, origin: null, lost: true, above: false });
  assert.equal(mms[2].strat.originId, 1, 'read, never repaired');
});

test('an origin naming the writer itself reads as no link', () => {
  const mms = ICS(Object.assign(rec('Self'), { originId: 3 }));
  assert.deepEqual(view(S.stratsFor(6, mms)), [[3, false, 1, null, false]]);
  assert.deepEqual(S.stratLink(3, mms), { originId: 3, origin: null, lost: true, above: false });
});

test('the link is ONE hop: an origin’s own link does not carry a STRAT further', () => {
  // CORE ICS's STRAT spreads from ICS; ICS strategy's, from CORE ICS. Only a
  // hand-edited file can store the second (CORE ICS has a STRAT, so the
  // writer refuses it), and it must still read without following a chain.
  const mms = ICS(Object.assign(rec('Leaf’s'), { originId: 2 }));
  mms[2].strat = Object.assign(rec('Core’s'), { originId: 1 });
  assert.deepEqual(texts(S.stratsFor(4, mms)), ['Core’s'], 'Learning system: only what spreads from ICS');
  assert.deepEqual(texts(S.stratsFor(2, mms)), ['Leaf’s', 'Core’s']);
});

test('a link loop between two writers terminates — each reads one hop', () => {
  const mms = [
    mm(1, 'A', { parentIds: [2], strat: Object.assign(rec('A'), { originId: 2 }) }),
    mm(2, 'B', { parentIds: [1], strat: Object.assign(rec('B'), { originId: 1 }) })
  ];
  assert.deepEqual(view(S.stratsFor(1, mms)), [[2, false, 0, 1, true], [1, true, 0, 2, false]]);
  assert.deepEqual(view(S.stratsFor(2, mms)), [[1, false, 0, 2, true], [2, true, 0, 1, false]]);
});

test('an origin id is compared as stored: the string "1" is not mind map 1', () => {
  const mms = ICS(Object.assign(rec('Typed'), { originId: '1' }));
  assert.deepEqual(S.stratsFor(1, mms), []);
  assert.equal(S.stratLink(3, mms).lost, true);
});

test('only a STRAT with text carries a link; null is no link; junk around it never throws', () => {
  assert.deepEqual(S.stratsFor(1, ICS({ text: '   ', originId: 1 })), [], 'blank text is no STRAT, linked or not');
  assert.equal(S.stratLink(3, ICS({ text: '  ', originId: 1 })), null);
  assert.equal(S.stratLink(3, ICS(Object.assign(rec('x'), { originId: null }))), null);
  assert.equal(S.stratLink(3, ICS(rec('x'))), null);
  assert.equal(S.stratLink(3, ICS('bare string')), null, 'a bare string has nowhere to keep one');
  assert.equal(S.stratLink(99, ICS()), null);
  for (const v of [undefined, null, 'mms', {}]) assert.equal(S.stratLink(3, v), null);
  for (const o of [{}, [], [1], true, 0, NaN])
    assert.doesNotThrow(() => S.stratsFor(1, ICS(Object.assign(rec('x'), { originId: o }))), JSON.stringify(o));
});

// ── linkRefusal / linkChoices ──────────────────────────────────────────────

test('any mind map above, at ANY depth, may be chosen while its slot is free', () => {
  const mms = unlinked();
  assert.equal(S.linkRefusal(mms, 3, 2), null, 'CORE ICS, one up');
  assert.equal(S.linkRefusal(mms, 3, 1), null, 'ICS, two up');
  assert.equal(S.linkRefusal(mms, 3, 0), null, 'Extra Brain, three up');
});

test('linkRefusal names why: none, self, missing, not-above, own, taken', () => {
  const mms = unlinked();
  assert.deepEqual(S.linkRefusal(mms, 4, 1), { code: 'none' }, 'Learning system has no STRAT to spread');
  assert.deepEqual(S.linkRefusal(mms, 99, 1), { code: 'none' });
  assert.deepEqual(S.linkRefusal(ICS('bare string'), 3, 1), { code: 'none' }, 'a bare string cannot carry a link');
  assert.deepEqual(S.linkRefusal(mms, 3, 3), { code: 'self' });
  assert.deepEqual(S.linkRefusal(mms, 3, 404), { code: 'missing' });
  assert.deepEqual(S.linkRefusal(mms, 3, '1'), { code: 'missing' }, 'the string "1" names nothing');
  assert.deepEqual(S.linkRefusal(mms, 3, 4), { code: 'not-above' }, 'a sibling branch');
  assert.deepEqual(S.linkRefusal(mms, 3, 6), { code: 'not-above' }, 'its own child');
  assert.deepEqual(S.linkRefusal(mms, 3, 7), { code: 'not-above' }, 'an unrelated mind map');
  const owned = unlinked(); owned[1].strat = rec('ICS has one');
  assert.deepEqual(S.linkRefusal(owned, 3, 1), { code: 'own', by: owned[1] });
  const taken = unlinked();
  taken.push(mm(8, 'First writer', { parentIds: [1], strat: Object.assign(rec('First'), { originId: 1 }) }));
  assert.deepEqual(S.linkRefusal(taken, 3, 1), { code: 'taken', by: taken[8] });
  for (const v of [undefined, null, 'mms', {}]) assert.deepEqual(S.linkRefusal(v, 3, 1), { code: 'none' });
});

test('an origin whose own STRAT is itself linked elsewhere still has its slot taken', () => {
  const mms = unlinked();
  mms[2].strat = Object.assign(rec('Core’s, spreading from ICS'), { originId: 1 });
  assert.deepEqual(S.linkRefusal(mms, 3, 2), { code: 'own', by: mms[2] });
  assert.deepEqual(S.linkRefusal(mms, 3, 1), { code: 'taken', by: mms[2] });
});

test('the origin it already spreads from is not refused', () => {
  assert.equal(S.linkRefusal(ICS(), 3, 1), null);
});

test('a writer moved away cannot choose its old origin anew, and keeps the link it has', () => {
  const mms = ICS(); mms[3].parentIds = [7];
  assert.deepEqual(S.linkRefusal(mms, 3, 1), { code: 'not-above' });
  assert.equal(S.withStratOrigin(mms, 3, 1), mms);
  assert.equal(S.stratsFor(4, mms).length, 1, 'still spreading from ICS');
});

test('linkChoices lists every mind map above, nearest first, each with the refusal the writer gives', () => {
  const mms = unlinked(); mms[0].strat = rec('Extra Brain’s');
  assert.deepEqual(S.linkChoices(3, mms).map(c => [c.mm.id, c.depth, c.refusal && c.refusal.code]),
    [[2, 1, null], [1, 2, null], [0, 3, 'own']]);
  assert.equal(S.linkChoices(3, mms)[0].mm, mms[2], 'the stored record');
  assert.deepEqual(S.linkChoices(1, mms).map(c => [c.mm.id, c.refusal.code]), [[0, 'none']],
    'ICS has no STRAT to spread, and its one row says so first');
  assert.deepEqual(S.linkChoices(0, mms), [], 'nothing above the top');
  assert.deepEqual(S.linkChoices(99, mms), []);
  for (const v of [undefined, null, 'mms', {}]) assert.deepEqual(S.linkChoices(3, v), []);
});

test('linkChoices terminates on a parent cycle and never offers the mind map itself', () => {
  const mms = [
    mm(36, 'Loop A', { parentIds: [37], strat: rec('A') }),
    mm(37, 'Loop B', { parentIds: [36] })
  ];
  assert.deepEqual(S.linkChoices(36, mms).map(c => [c.mm.id, c.refusal]), [[37, null]]);
});

// ── withStratOrigin / withoutStratOrigin ───────────────────────────────────

test('withStratOrigin writes originId and NOTHING else — not the text, not either time, not an unknown key', () => {
  const base = unlinked(); base[3].strat.colour = 'violet'; base[3].future = 'kept';
  const mms = deepFreeze(base);
  const next = S.withStratOrigin(mms, 3, 1);
  assert.notEqual(next, mms);
  assert.deepEqual(next[3].strat, { text: 'Backbone before detail', createdAt: NOW, updatedAt: NOW, colour: 'violet', originId: 1 });
  assert.equal(next[3].future, 'kept');
  next.forEach((m, i) => { if (i !== 3) assert.equal(m, mms[i], 'record ' + i + ' untouched'); });
  assert.equal(mms[3].strat.originId, undefined, 'the input is not mutated');
  assert.equal(typeof next[3].strat.originId, 'number', 'stored as the id is stored');
});

test('withStratOrigin REFUSES every refusal — the input comes back', () => {
  const mms = deepFreeze(unlinked());
  for (const [id, origin] of [[4, 1], [3, 3], [3, 404], [3, '1'], [3, 4], [3, 6], [3, 7], [99, 1]])
    assert.equal(S.withStratOrigin(mms, id, origin), mms, id + ' → ' + JSON.stringify(origin));
  const owned = unlinked(); owned[1].strat = rec('ICS has one'); deepFreeze(owned);
  assert.equal(S.withStratOrigin(owned, 3, 1), owned, 'an origin with its own STRAT');
  const taken = unlinked();
  taken.push(mm(8, 'First writer', { parentIds: [1], strat: Object.assign(rec('First'), { originId: 1 }) }));
  deepFreeze(taken);
  assert.equal(S.withStratOrigin(taken, 3, 1), taken, 'an origin another STRAT already spreads from');
  for (const v of [undefined, null, 'mms', {}]) assert.equal(S.withStratOrigin(v, 3, 1), v);
});

test('withStratOrigin writes nothing when it already spreads from there', () => {
  const mms = deepFreeze(ICS());
  assert.equal(S.withStratOrigin(mms, 3, 1), mms);
});

test('withStratOrigin can move a link to another free mind map above', () => {
  const next = S.withStratOrigin(deepFreeze(ICS()), 3, 2);
  assert.equal(next[3].strat.originId, 2);
  assert.deepEqual(S.stratsFor(4, next), [], 'Learning system is not under CORE ICS');
  assert.equal(S.stratsFor(2, next)[0].hosted, true);
});

test('withoutStratOrigin deletes the KEY — never null — and keeps everything else', () => {
  const base = ICS(); base[3].strat.colour = 'violet';
  const mms = deepFreeze(base);
  const next = S.withoutStratOrigin(mms, 3);
  assert.equal(Object.prototype.hasOwnProperty.call(next[3].strat, 'originId'), false);
  assert.deepEqual(next[3].strat, { text: 'Backbone before detail', createdAt: NOW, updatedAt: NOW, colour: 'violet' });
  next.forEach((m, i) => { if (i !== 3) assert.equal(m, mms[i], 'record ' + i + ' untouched'); });
  assert.equal(mms[3].strat.originId, 1, 'the input is not mutated');
  assert.deepEqual(S.stratsFor(4, next), [], 'Learning system stops showing it');
  assert.deepEqual(texts(S.stratsFor(6, next)), ['Backbone before detail'], 'it spreads from ICS strategy again');
});

test('unlinking and linking again restores exactly what was stored', () => {
  const mms = deepFreeze(ICS());
  assert.deepEqual(S.withStratOrigin(S.withoutStratOrigin(mms, 3), 3, 1), mms);
});

test('withoutStratOrigin changes nothing with no key, no such mind map, or no list — and clears a lost link', () => {
  const mms = deepFreeze(unlinked());
  assert.equal(S.withoutStratOrigin(mms, 3), mms);
  assert.equal(S.withoutStratOrigin(mms, 99), mms);
  const linked = deepFreeze(ICS());
  assert.equal(S.withoutStratOrigin(linked, '3'), linked, 'the string "3" is not mind map 3');
  for (const v of [undefined, null, 'mms', {}]) assert.equal(S.withoutStratOrigin(v, 3), v);
  const lost = ICS().filter(m => m.id !== 1);
  assert.equal(Object.prototype.hasOwnProperty.call(S.withoutStratOrigin(lost, 3)[2].strat, 'originId'), false,
    'a link to a deleted mind map can still be cleared');
});

// ── the other writers, beside a link ───────────────────────────────────────

test('withStrat REFUSES to create a STRAT on a mind map another STRAT spreads from — its one is taken', () => {
  const mms = deepFreeze(ICS());
  assert.equal(S.withStrat(mms, 1, 'ICS’s own', LATER), mms);
  assert.notEqual(S.withStrat(mms, 4, 'Learning system’s own', LATER), mms, 'a mind map merely UNDER the origin may');
});

test('withStrat edits a linked STRAT’s words and keeps its link', () => {
  const next = S.withStrat(deepFreeze(ICS()), 3, 'Backbone, then detail', LATER);
  assert.deepEqual(next[3].strat, { text: 'Backbone, then detail', createdAt: NOW, updatedAt: LATER, originId: 1 });
  assert.equal(S.stratsFor(4, next)[0].text, 'Backbone, then detail', 'the edit reaches everything under ICS at once');
});

test('deleting a linked STRAT takes it off the origin and everything under it', () => {
  const next = S.withoutStrat(ICS(), 3);
  for (const id of [1, 2, 3, 4, 5, 6]) assert.deepEqual(S.stratsFor(id, next), [], 'mind map ' + id);
  assert.notEqual(S.withStrat(next, 1, 'ICS’s own now', LATER), next, 'and ICS may hold its own again');
});
