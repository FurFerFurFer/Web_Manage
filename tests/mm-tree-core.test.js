/* ── tests/mm-tree-core.test.js ────────────────────────────────────────────
   Offline cover for mm-tree-core.js — the one definition of the mind-map
   tree that SRCH draws, and of the three drags that rearrange it.

       node --test tests/mm-tree-core.test.js

   Run once by tests/run.js rather than once per timezone: nothing in
   mm-tree-core.js constructs a Date, and the structural case below is what
   says so if one ever appears.

   What is being pinned, in order of how much it would cost to get wrong:

   1. A NEST is a MOVE out of ONE parent. The mind map leaves the parent it
      was dragged out of and keeps every other parent it has. Dropping all of
      its parents would silently re-file a two-parent mind map.

   2. A move that would put a mind map inside its own branch is REFUSED by
      the writer, and a refused or empty move returns the very input, so the
      page's autosave writes nothing.

   3. Every mind map is reachable from `roots`, including one inside a loop
      that nothing above reaches — and a mind map hanging under such a loop
      is NOT made a root of its own.

   4. SRCH → LIST's sibling reorder is a delegate to withArranged, pinned
      here against a VERBATIM copy of the inline code it replaced.

   5. Ids are NUMBERS in real data (KS02's nid()), and 10 is not '10'.

   Fixtures are synthetic, always (AGENTS.md, "Preserve old data").
*/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// A browser IIFE ending in `})(window)`. runInThisContext, not a new realm:
// the module is built on Array.isArray, and arrays made here must pass it.
globalThis.window = globalThis;
const SRC = path.join(__dirname, '..', 'scripts', 'mm-tree-core.js');
vm.runInThisContext(fs.readFileSync(SRC, 'utf8'), { filename: 'mm-tree-core.js' });
const T = globalThis.TrackMMTree;

// ── fixtures ───────────────────────────────────────────────────────────────

const mm = (id, name, over = {}) => Object.assign({ id, name, type: '1', parentIds: [] }, over);

/* Chem (anchor) ─┬─ Kru Pom ─┬─ P Mon ─┬─ A1
                  │           │          ├─ A2
                  │           │          ├─ Shared ◄── also under Practice
                  │           │          └─ A3
                  │           └─ Practice ── Shared
                  └─ Bio
   Physics on its own. Numeric ids, as nid() mints them, in a stored order
   that is NOT the tree order, so a reader that sorts by id would show. */
const TREE = () => [
  mm(1, 'Chem', { type: 'anchor' }),
  mm(6, 'A1', { parentIds: [4] }),
  mm(2, 'Kru Pom', { parentIds: [1] }),
  mm(7, 'A2', { parentIds: [4], type: '2' }),
  mm(10, 'Shared', { parentIds: [4, 5] }),
  mm(4, 'P Mon', { parentIds: [2] }),
  mm(8, 'A3', { parentIds: [4] }),
  mm(5, 'Practice', { parentIds: [2] }),
  mm(3, 'Bio', { parentIds: [1] }),
  mm(9, 'Physics')
];

/* A loop with nothing above it — 20 → 21 → 22 → 20 — and Hanger under 21,
   stored BEFORE the loop so a scan in stored order meets it first. */
const LOOPED = () => [
  mm(1, 'Top'),
  mm(19, 'Hanger', { parentIds: [21] }),
  mm(21, 'Loop B', { parentIds: [20] }),
  mm(20, 'Loop A', { parentIds: [22] }),
  mm(22, 'Loop C', { parentIds: [21] }),
  mm(23, 'Under Top', { parentIds: [1] })
];

const ids = list => list.map(m => m.id);

function deepFreeze(v) {
  if (v && typeof v === 'object') { Object.values(v).forEach(deepFreeze); Object.freeze(v); }
  return v;
}

// Everything reachable downward from the roots, through the module's own
// child index — the property "nothing is left out of the directory".
function reachable(mms) {
  const index = T.childIndex(mms);
  const seen = new Set();
  const queue = T.roots(mms).map(m => m.id);
  queue.forEach(id => seen.add(id));
  for (let i = 0; i < queue.length; i++) {
    (index.get(queue[i]) || []).forEach(c => { if (!seen.has(c.id)) { seen.add(c.id); queue.push(c.id); } });
  }
  return seen;
}

/* VERBATIM, from sir-ks02.html's SRCH view before this module existed — the
   body of the `onArrange` setMms updater. Do not tidy it: it is the baseline
   withArranged is pinned against. */
function srchArrangeVerbatim(prev, draggedId, targetId, insertBefore) {
                    const byId = Object.fromEntries(prev.map(m => [m.id, m]));
                    const m1 = byId[draggedId], m2 = byId[targetId];
                    if (!m1 || !m2) return prev;
                    const vp1 = (m1.parentIds || []).filter(pid => byId[pid]);
                    const vp2 = (m2.parentIds || []).filter(pid => byId[pid]);
                    const areSiblings = (vp1.length === 0 && vp2.length === 0) || vp1.some(p => vp2.includes(p));
                    if (!areSiblings) return prev;
                    const di = prev.findIndex(m => m.id === draggedId);
                    const ti = prev.findIndex(m => m.id === targetId);
                    const arr = [...prev];
                    const [moved] = arr.splice(di, 1);
                    const newTi = arr.findIndex(m => m.id === targetId);
                    arr.splice(insertBefore ? newTi : newTi + 1, 0, moved);
                    return arr;
}

// ── structure ──────────────────────────────────────────────────────────────

const CODE = () => fs.readFileSync(SRC, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

test('the module constructs no Date, which is why its suite is not swept', () => {
  // Comments are stripped first: the prose explains why there is no Date.
  assert.equal(/new Date|Date\.now|getDay\(|toISOString|getTimezoneOffset/.test(CODE()), false,
    'mm-tree-core.js must hold no date code — move its suite to OFFLINE_FILES if it does');
});

test('the module touches no storage and coerces no id', () => {
  const src = CODE();
  assert.equal(/localStorage|sessionStorage|indexedDB/.test(src), false, 'sir-ks02.html owns the write');
  assert.equal(/Number\(|parseInt|parseFloat|String\(/.test(src), false,
    'a mind-map id is compared as stored — 10 and "10" are two ids');
});

test('exports exactly the readers and the three writers', () => {
  assert.deepEqual(Object.keys(T).sort(), ['childIndex', 'childrenOf', 'descendantIds', 'isPath', 'moveRefusal',
    'parentsOf', 'pathTo', 'roots', 'withArranged', 'withNested', 'withPlaced']);
});

// ── readers ────────────────────────────────────────────────────────────────

test('parentsOf is total: junk reads as no parents, and only ids are kept', () => {
  assert.deepEqual(T.parentsOf(null), []);
  assert.deepEqual(T.parentsOf(mm(1, 'x', { parentIds: 'oops' })), []);
  assert.deepEqual(T.parentsOf(mm(1, 'x', { parentIds: [4, null, '', 'k', {}, NaN, 5] })), [4, 'k', 5]);
});

test('childrenOf lists a parent\'s children in STORED order, never by id', () => {
  assert.deepEqual(ids(T.childrenOf(TREE(), 4)), [6, 7, 10, 8]);
  assert.deepEqual(ids(T.childrenOf(TREE(), 5)), [10], 'a two-parent mind map is a child of each');
  assert.deepEqual(ids(T.childrenOf(TREE(), 9)), []);
});

test('childIndex: no self-child, no dangling parent, no child twice under one parent', () => {
  const mms = [mm(1, 'P'), mm(2, 'Twice', { parentIds: [1, 1] }), mm(3, 'Self', { parentIds: [3, 1] }),
    mm(4, 'Dangling', { parentIds: [999] })];
  const index = T.childIndex(mms);
  assert.deepEqual(ids(index.get(1)), [2, 3]);
  assert.equal(index.has(3), false, 'a mind map is never drawn as its own child');
  assert.equal(index.has(999), false, 'a parent naming nothing is no parent');
});

test('a numeric id and its string twin are two ids', () => {
  const mms = [mm(10, 'Number'), mm('10', 'String'), mm(11, 'Under the number', { parentIds: [10] }),
    mm(12, 'Under the string', { parentIds: ['10'] })];
  assert.deepEqual(ids(T.childrenOf(mms, 10)), [11]);
  assert.deepEqual(ids(T.childrenOf(mms, '10')), [12]);
  assert.equal(T.moveRefusal(mms, [11], 10, '10'), null, 'moving between them is an ordinary move');
});

test('roots: every parentless mind map, in stored order', () => {
  assert.deepEqual(ids(T.roots(TREE())), [1, 9]);
});

test('roots: a parent that is missing, or only itself, leaves a mind map at the top', () => {
  const mms = [mm(1, 'Dangling', { parentIds: [999] }), mm(2, 'Self', { parentIds: [2] }), mm(3, 'Child', { parentIds: [2] })];
  assert.deepEqual(ids(T.roots(mms)), [1, 2]);
});

test('roots: a parentless LOOP gets one entry, its earliest member — the hanger is not a root', () => {
  // Hanger (19) is stored first, but it hangs under the loop: climbing its
  // first parent finds the loop, whose earliest stored member is Loop B (21).
  assert.deepEqual(ids(T.roots(LOOPED())), [1, 21]);
  assert.deepEqual([...reachable(LOOPED())].sort((a, b) => a - b), [1, 19, 20, 21, 22, 23],
    'every mind map, the loop and its hanger included, is reachable from a root');
});

test('roots: a loop under a loop, with nothing above either, still leaves nothing out', () => {
  // 30 ⇄ 31 is fed by 40 ⇄ 41 (31 also lists 41 as a parent).
  const mms = [mm(30, 'A', { parentIds: [31] }), mm(31, 'B', { parentIds: [30, 41] }),
    mm(40, 'C', { parentIds: [41] }), mm(41, 'D', { parentIds: [40] })];
  const all = reachable(mms);
  assert.deepEqual([...all].sort((a, b) => a - b), [30, 31, 40, 41]);
});

test('roots: every fixture leaves nothing unreachable', () => {
  for (const mms of [TREE(), LOOPED(), [], [mm(1, 'Only')], [mm(1, 'Self', { parentIds: [1] })]]) {
    const want = mms.map(m => m.id).sort((a, b) => a - b);
    assert.deepEqual([...reachable(mms)].sort((a, b) => a - b), want);
  }
});

test('the readers are total on junk', () => {
  for (const junk of [null, undefined, 'x', 42, {}, [null, 7, 'x', [], {}, { name: 'no id' }]]) {
    assert.deepEqual(T.roots(junk), []);
    assert.equal(T.childIndex(junk).size, 0);
    assert.deepEqual(T.pathTo(junk, 1), []);
    assert.equal(T.descendantIds(junk, 1).size, 0);
    assert.equal(T.isPath(junk, [1]), false);
    assert.equal(T.withNested(junk, [1], null, 2), junk);
    assert.equal(T.withArranged(junk, [1], 2, true), junk);
  }
});

test('descendantIds goes all the way down, counts a diamond once, and ends on a loop', () => {
  assert.deepEqual([...T.descendantIds(TREE(), 1)].sort((a, b) => a - b), [2, 3, 4, 5, 6, 7, 8, 10]);
  assert.deepEqual([...T.descendantIds(TREE(), 5)], [10]);
  const loop = T.descendantIds(LOOPED(), 20);
  assert.deepEqual([...loop].sort((a, b) => a - b), [19, 20, 21, 22], 'a loop leads back to its start');
});

test('pathTo climbs first parents to the top, and never visits a mind map twice', () => {
  assert.deepEqual(T.pathTo(TREE(), 10), [1, 2, 4, 10], 'first parent first: P Mon, not Practice');
  assert.deepEqual(T.pathTo(TREE(), 9), [9]);
  assert.deepEqual(T.pathTo(TREE(), 999), []);
  // 19 → 21 → 20 → 22, and 22's parent 21 is already on the path
  assert.deepEqual(T.pathTo(LOOPED(), 19), [22, 20, 21, 19], 'the climb stops where the loop closes');
});

test('isPath: only an unbroken parent → child chain of stored mind maps', () => {
  assert.equal(T.isPath(TREE(), [1, 2, 5, 10]), true, 'the second parent is a real way down too');
  assert.equal(T.isPath(TREE(), [1, 2, 4, 10]), true);
  assert.equal(T.isPath(TREE(), [1, 4, 10]), false, 'Chem is not P Mon\'s parent');
  assert.equal(T.isPath(TREE(), [2, 999]), false);
  assert.equal(T.isPath(TREE(), []), false);
});

// ── moveRefusal ────────────────────────────────────────────────────────────

test('moveRefusal: a mind map cannot go inside itself or anywhere in its own branch', () => {
  assert.equal(T.moveRefusal(TREE(), [2], 1, 2), 'self');
  assert.equal(T.moveRefusal(TREE(), [2], 1, 4), 'inside', 'a child');
  assert.equal(T.moveRefusal(TREE(), [2], 1, 10), 'inside', 'a grandchild reached through either parent');
  assert.equal(T.moveRefusal(TREE(), [3, 2], 1, 6), 'inside', 'one member of a group is enough');
  assert.equal(T.moveRefusal(TREE(), [6, 7], 4, 2), null, 'up to a grandparent is fine');
  assert.equal(T.moveRefusal(TREE(), [6], 4, 9), null, 'across to another branch is fine');
});

test('moveRefusal: the parent they came from is not a move, a gone target is missing, top level is open', () => {
  assert.equal(T.moveRefusal(TREE(), [6], 4, 4), 'same');
  assert.equal(T.moveRefusal(TREE(), [6], 4, 999), 'missing', 'deleted in another tab mid-drag');
  assert.equal(T.moveRefusal(TREE(), [999], 4, 9), 'missing', 'nothing to move');
  assert.equal(T.moveRefusal(TREE(), [], 4, 9), 'missing');
  assert.equal(T.moveRefusal(TREE(), [6], 4, null), null);
});

// ── withNested ─────────────────────────────────────────────────────────────

test('withNested MOVES: out of the parent it came from, under the target, in that parent\'s place', () => {
  const before = deepFreeze(TREE());
  const after = T.withNested(before, [6], 4, 9);
  assert.deepEqual(after.find(m => m.id === 6).parentIds, [9]);
  assert.deepEqual(ids(after), ids(before), 'a nest never reorders the stored list');
  assert.deepEqual(ids(T.childrenOf(after, 4)), [7, 10, 8], 'it left P Mon');
  assert.deepEqual(ids(T.childrenOf(after, 9)), [6], 'and is under Physics');
});

test('withNested keeps every OTHER parent: a two-parent mind map leaves only the one it was dragged out of', () => {
  const after = T.withNested(deepFreeze(TREE()), [10], 4, 3);
  assert.deepEqual(after.find(m => m.id === 10).parentIds, [3, 5], 'Bio took P Mon\'s place; Practice stays');
});

test('withNested onto a parent it already has just drops the one it came from', () => {
  const after = T.withNested(deepFreeze(TREE()), [10], 4, 5);
  assert.deepEqual(after.find(m => m.id === 10).parentIds, [5]);
});

test('withNested to the TOP LEVEL drops only the parent it came from', () => {
  const tree = deepFreeze(TREE());
  assert.deepEqual(T.withNested(tree, [6], 4, null).find(m => m.id === 6).parentIds, []);
  assert.deepEqual(T.withNested(tree, [10], 4, null).find(m => m.id === 10).parentIds, [5],
    'a two-parent mind map stays under its other parent');
});

test('withNested moves a group together, each by its own parents', () => {
  const after = T.withNested(deepFreeze(TREE()), [7, 10, 6], 4, 3);
  assert.deepEqual(after.find(m => m.id === 6).parentIds, [3]);
  assert.deepEqual(after.find(m => m.id === 7).parentIds, [3]);
  assert.deepEqual(after.find(m => m.id === 10).parentIds, [3, 5]);
  assert.deepEqual(ids(T.childrenOf(after, 3)), [6, 7, 10], 'they keep their stored order under the target');
  assert.deepEqual(ids(T.childrenOf(after, 4)), [8]);
});

test('withNested REFUSES a move into the moving branch, returning the very input', () => {
  const tree = deepFreeze(TREE());
  assert.equal(T.withNested(tree, [2], 1, 4), tree);
  assert.equal(T.withNested(tree, [2], 1, 2), tree);
  assert.equal(T.withNested(tree, [3, 2], 1, 6), tree, 'all or nothing: Bio does not move either');
  assert.equal(T.withNested(tree, [6], 4, 999), tree, 'a target gone in another tab');
});

test('withNested returns the very input when nothing changes', () => {
  const tree = deepFreeze(TREE());
  assert.equal(T.withNested(tree, [6], 4, 4), tree, 'dropped back on its own parent');
  assert.equal(T.withNested(tree, [9], null, null), tree, 'a root sent to the top level');
  assert.equal(T.withNested(tree, [], 4, 9), tree);
});

test('withNested spreads: an unknown key survives, and nothing else is touched', () => {
  const tree = deepFreeze(TREE().map(m => m.id === 6 ? Object.assign({}, m, { futureKey: { kept: true } }) : m));
  const after = T.withNested(tree, [6], 4, 9);
  assert.deepEqual(after.find(m => m.id === 6).futureKey, { kept: true });
  after.forEach((m, i) => { if (m.id !== 6) assert.equal(m, tree[i], 'untouched records are the same objects'); });
});

test('withNested rewrites a junk parentIds only on the mind map it moves', () => {
  const mms = deepFreeze([mm(1, 'P'), mm(2, 'Junk', { parentIds: 'oops' }), mm(3, 'Target')]);
  assert.deepEqual(T.withNested(mms, [2], 1, 3).find(m => m.id === 2).parentIds, [3]);
});

// ── withArranged ───────────────────────────────────────────────────────────

test('withArranged is SRCH\'s inline reorder for every single drag the old code accepted', () => {
  // Every ordered pair, both halves, over a tree that has roots, siblings,
  // non-siblings and a two-parent mind map.
  const tree = TREE();
  let compared = 0;
  for (const d of tree) for (const t of tree) for (const before of [true, false]) {
    if (d.id === t.id) continue;   // the inline caller never passed this — see the next case
    const want = srchArrangeVerbatim(tree, d.id, t.id, before);
    const got = T.withArranged(tree, [d.id], t.id, before);
    assert.deepEqual(ids(got), ids(want), `drag ${d.id} ${before ? 'before' : 'after'} ${t.id}`);
    compared++;
  }
  assert.equal(compared, tree.length * (tree.length - 1) * 2);
});

test('withArranged, deliberate differences: onto itself and a no-op both return the very input', () => {
  const tree = deepFreeze(TREE());
  assert.equal(T.withArranged(tree, [6], 6, true), tree, 'the inline code scrambled the order here');
  // A2 (stored 4th) and Shared (5th) are adjacent siblings already
  assert.equal(T.withArranged(tree, [7], 10, true), tree);
  assert.equal(T.withArranged(tree, [10], 7, false), tree);
});

test('withArranged with the LIST named is judged by what that list draws, never by array indices', () => {
  const tree = deepFreeze(TREE());
  // A1 is stored 2nd and A2 4th, with Kru Pom between them. P Mon's list
  // already draws A1 just before A2, so dropping A1 there changes nothing
  // anyone can see — but without the list named, the stored order shifts
  // (Kru Pom moves up a place, and with it every position-based colour).
  assert.notEqual(T.withArranged(tree, [6], 7, true), tree, 'unnamed: the stored order moves, as SRCH → LIST did');
  assert.equal(T.withArranged(tree, [6], 7, true, 4), tree, 'named: P Mon draws the same, so nothing is written');
  assert.equal(T.withArranged(tree, [7], 6, false, 4), tree);
  const moved = T.withArranged(tree, [6], 8, false, 4);
  assert.deepEqual(ids(T.childrenOf(moved, 4)), [7, 10, 8, 6], 'a real move in that list still moves');
});

test('withArranged moves a GROUP as one block, in its own stored order', () => {
  const tree = deepFreeze(TREE());
  // P Mon's children are stored A1, A2, Shared, A3. Move A3 and A1 after Shared.
  const after = T.withArranged(tree, [8, 6], 10, false);
  assert.deepEqual(ids(T.childrenOf(after, 4)), [7, 10, 6, 8], 'A1 before A3, as they were stored');
  const front = T.withArranged(tree, [10, 8], 6, true);
  assert.deepEqual(ids(T.childrenOf(front, 4)), [10, 8, 6, 7]);
});

test('withArranged refuses non-siblings, and a group landing on one of its own members', () => {
  const tree = deepFreeze(TREE());
  assert.equal(T.withArranged(tree, [6], 3, true), tree, 'A1 and Bio share no parent');
  assert.equal(T.withArranged(tree, [6, 3], 7, true), tree, 'all or nothing');
  assert.equal(T.withArranged(tree, [6, 7], 7, true), tree);
  assert.equal(T.withArranged(tree, [6], 999, true), tree);
});

test('withArranged: a two-parent mind map is a sibling under EITHER parent', () => {
  const tree = deepFreeze(TREE());
  // Shared (10) is under P Mon and Practice; Practice's only other child is
  // none, so arrange it against A3 (P Mon) — they share P Mon.
  const after = T.withArranged(tree, [10], 8, false);
  assert.deepEqual(ids(T.childrenOf(after, 4)), [6, 7, 8, 10]);
});

// ── withPlaced: one occurrence of a tree row, parent AND drawn position ─────

test('withPlaced reorders within the same parent', () => {
  const tree = deepFreeze(TREE());
  const after = T.withPlaced(tree, 6, 4, 4, 8, false);
  assert.deepEqual(ids(T.childrenOf(after, 4)), [7, 10, 8, 6]);
  assert.deepEqual(after.find(m => m.id === 6).parentIds, [4]);
});

for (const [where, anchor, before, expected] of [
  ['first', 6, true, [3, 6, 7, 10, 8]],
  ['middle', 7, false, [6, 7, 3, 10, 8]],
  ['last', null, false, [6, 7, 10, 8, 3]]
]) test('withPlaced moves to another parent at the ' + where + ' position', () => {
  const source = TREE();
  // Last must require a real reorder too: store Bio before P Mon's children.
  const tree = deepFreeze(where === 'last' ? [source[8], ...source.filter(m => m.id !== 3)] : source);
  const after = T.withPlaced(tree, 3, 1, 4, anchor, before);
  assert.deepEqual(ids(T.childrenOf(after, 4)), expected, 'the destination draws the chosen position');
  assert.deepEqual(after.find(m => m.id === 3).parentIds, [4]);
  assert.deepEqual(ids(T.childrenOf(after, 1)), [2]);
});

test('withPlaced moves to top level at a drawn position', () => {
  const after = T.withPlaced(deepFreeze(TREE()), 6, 4, null, 9, false);
  assert.deepEqual(ids(T.roots(after)), [1, 9, 6]);
  assert.deepEqual(after.find(m => m.id === 6).parentIds, []);
});

test('withPlaced moves from top level into a parent', () => {
  const after = T.withPlaced(deepFreeze(TREE()), 9, null, 4, 7, true);
  assert.deepEqual(ids(T.childrenOf(after, 4)), [6, 9, 7, 10, 8]);
  assert.deepEqual(after.find(m => m.id === 9).parentIds, [4]);
  assert.deepEqual(ids(T.roots(after)), [1]);
});

test('withPlaced enters a childless parent and preserves unknown keys', () => {
  const tree = deepFreeze(TREE().map(m => m.id === 6 ? { ...m, future: { keep: true } } : m));
  const after = T.withPlaced(tree, 6, 4, 9, null, false);
  assert.deepEqual(after.find(m => m.id === 6), { ...tree.find(m => m.id === 6), parentIds: [9] });
  assert.deepEqual(ids(T.childrenOf(after, 9)), [6]);
  after.forEach(m => { if (m.id !== 6) assert.equal(m, tree.find(x => x.id === m.id)); });
});

test('withPlaced keeps other parents and replaces only the drawn parent in its place', () => {
  const after = T.withPlaced(deepFreeze(TREE()), 10, 5, 1, 3, false);
  assert.deepEqual(after.find(m => m.id === 10).parentIds, [4, 1]);
  assert.deepEqual(ids(T.childrenOf(after, 1)), [2, 3, 10]);
  assert.deepEqual(ids(T.childrenOf(after, 5)), []);
  assert.equal(T.childrenOf(after, 4).some(m => m.id === 10), true);
});

test('withPlaced to top level removes just the drawn parent of a multi-parent row', () => {
  const after = T.withPlaced(deepFreeze(TREE()), 10, 4, null, 9, false);
  assert.deepEqual(after.find(m => m.id === 10).parentIds, [5]);
  assert.deepEqual(ids(T.roots(after)), [1, 9], 'its other parent still owns it; no synthetic root is made');
});

for (const [reason, parent, anchor] of [['self', 2, 4], ['inside', 4, 6], ['missing', 999, null]]) {
  test('withPlaced refuses ' + reason + ' through the same moveRefusal', () => {
    const tree = deepFreeze(TREE());
    assert.equal(T.withPlaced(tree, 2, 1, parent, anchor, true), tree);
    assert.equal(T.moveRefusal(tree, [2], 1, parent), reason);
  });
}

test('withPlaced refuses a disappeared or foreign sibling anchor atomically', () => {
  const tree = deepFreeze(TREE());
  for (const anchor of [999, 9]) assert.equal(T.withPlaced(tree, 3, 1, 4, anchor, true), tree);
});

test('withPlaced returns the very input for a drawn no-op across unrelated stored records', () => {
  const tree = deepFreeze(TREE());
  assert.equal(T.withPlaced(tree, 6, 4, 4, 7, true), tree);
  assert.equal(T.withPlaced(tree, 6, 4, 4, 6, false), tree);
  assert.equal(T.withPlaced(tree, 8, 4, 4, null, false), tree);
});

test('withPlaced root reorder is judged by roots, including a no-op with children stored between', () => {
  const tree = deepFreeze(TREE());
  assert.deepEqual(ids(T.roots(T.withPlaced(tree, 9, null, null, 1, true))), [9, 1]);
  assert.equal(T.withPlaced(tree, 1, null, null, 9, true), tree);
});

test('withPlaced preserves numeric and string ids as distinct values', () => {
  const tree = deepFreeze([mm(10, 'Number'), mm('10', 'String'),
    mm(11, 'Moving', { parentIds: [10] }), mm('11', 'Sibling', { parentIds: ['10'] })]);
  const after = T.withPlaced(tree, 11, 10, '10', '11', false);
  assert.deepEqual(after.find(m => m.id === 11).parentIds, ['10']);
  assert.deepEqual(ids(T.childrenOf(after, '10')), ['11', 11]);
});

test('withPlaced terminates on a parent cycle and can arrange its drawn root', () => {
  const tree = deepFreeze(LOOPED());
  assert.equal(T.withPlaced(tree, 21, null, 22, null, false), tree, 'own cyclic branch refused');
  const after = T.withPlaced(tree, 21, null, null, 1, true);
  assert.deepEqual(ids(T.roots(after)), [21, 1], 'a synthetic root is a drawn root for arrangement');
  assert.deepEqual(after.find(m => m.id === 21).parentIds, [20], 'root reorder does not break the loop');
});

test('withPlaced is total and refuses a missing dragged id', () => {
  for (const junk of [null, undefined, 42, {}, [], [null]]) assert.equal(T.withPlaced(junk, 999, null, null, null, false), junk);
  const tree = deepFreeze(TREE());
  assert.equal(T.withPlaced(tree, 999, 1, 4, 6, true), tree);
});
