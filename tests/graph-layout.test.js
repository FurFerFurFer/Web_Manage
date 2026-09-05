/* ── tests/graph-layout.test.js ────────────────────────────────────────────
   Offline cases for graph-layout.js, the one radial layout behind KS03's
   multiverse and true-storage.html's storage canvas.

   Run ONCE, not swept over timezones: the module holds no date code at all, so
   five runs would cost five times as long and prove exactly the same thing.
   Same reasoning as true-storage-core.test.js.

   The load-bearing cases here are the cycle ones. `parentIds` is plural and the
   ConnectionsPicker on both pages lets a user pick a descendant as a parent, so
   a cycle is reachable through ordinary use. Unguarded, the recursion blew the
   stack, and because that RangeError escapes a React render the entire page
   rendered nothing — #root empty, every KS02 view gone at once.

   These assertions are cheap here and expensive in a browser: a stack overflow
   only shows up there as an absent #root, which is the symptom of a dozen other
   faults. browser.test.js still carries the page-level cases, but THIS file is
   where the contract is pinned.
*/
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// graph-layout.js is a browser IIFE ending in `})(window)`, so `window` has to
// exist before it runs. runInThisContext, not runInNewContext: the module is
// built on Array.isArray, and a fresh realm would break cross-realm arrays.
globalThis.window = globalThis;
vm.runInThisContext(
  fs.readFileSync(path.join(__dirname, '..', 'scripts', 'graph-layout.js'), 'utf8'),
  { filename: 'graph-layout.js' }
);
const GL = globalThis.TrackGraphLayout;

// Minimal node records — the module reads `id` and `parentIds` and nothing else.
const n = (id, parentIds) => ({ id, parentIds: parentIds || [] });

const finite = p => typeof p === 'object' && p !== null &&
  Number.isFinite(p.x) && Number.isFinite(p.y);

const allPositioned = (pos, ids) => ids.every(id => finite(pos[id]));

test('module surface', () => {
  assert.equal(typeof GL, 'object');
  ['computeLayerLayout', 'applyRepulsion', 'parentIdsOf'].forEach(k =>
    assert.equal(typeof GL[k], 'function', k + ' is exported'));
});

// ── defensive readers ──────────────────────────────────────────────────────

test('parentIdsOf never throws and never returns a non-array', () => {
  assert.deepEqual(GL.parentIdsOf({ id: 'a', parentIds: ['b'] }), ['b']);
  assert.deepEqual(GL.parentIdsOf({ id: 'a' }), []);
  assert.deepEqual(GL.parentIdsOf({ id: 'a', parentIds: null }), []);
  // The shape that made KS02's inlined `(m.parentIds||[]).forEach` throw.
  assert.deepEqual(GL.parentIdsOf({ id: 'a', parentIds: 'nope' }), []);
  assert.deepEqual(GL.parentIdsOf(null), []);
  assert.deepEqual(GL.parentIdsOf(undefined), []);
  assert.deepEqual(GL.parentIdsOf([]), []);
});

test('an empty or damaged node list returns an empty layout', () => {
  assert.deepEqual(GL.computeLayerLayout([]), {});
  assert.deepEqual(GL.computeLayerLayout(null), {});
  assert.deepEqual(GL.computeLayerLayout(undefined), {});
});

// ── ordinary acyclic shapes ────────────────────────────────────────────────
// These must pass BEFORE the cycle guard exists as well as after: they are the
// proof that extracting the layout out of the two pages did not change it.

test('a single root sits at the centre', () => {
  const pos = GL.computeLayerLayout([n('root')]);
  assert.deepEqual(pos.root, { x: 360, y: 260 });
});

test('a simple tree positions every node exactly once', () => {
  const nodes = [n('root'), n('a', ['root']), n('b', ['root']), n('c', ['a'])];
  const pos = GL.computeLayerLayout(nodes);
  assert.deepEqual(Object.keys(pos).sort(), ['a', 'b', 'c', 'root']);
  assert.ok(allPositioned(pos, ['root', 'a', 'b', 'c']));
  assert.deepEqual(pos.root, { x: 360, y: 260 }, 'depth 0 is the centre');
  // Siblings share a parent but must not land on the same point.
  assert.notDeepEqual(pos.a, pos.b);
});

test('a dangling parent id is ignored, so the node is treated as a root', () => {
  const nodes = [n('root'), n('orphan', ['does-not-exist'])];
  const pos = GL.computeLayerLayout(nodes);
  assert.ok(allPositioned(pos, ['root', 'orphan']));
});

test('a diamond is legal: parentIds is plural', () => {
  // Two parents share one child. Nothing here is a cycle, and `shared` must
  // still be positioned.
  const nodes = [n('root'), n('l', ['root']), n('r', ['root']), n('shared', ['l', 'r'])];
  const pos = GL.computeLayerLayout(nodes);
  assert.ok(allPositioned(pos, ['root', 'l', 'r', 'shared']));
});

test('disconnected components are all laid out', () => {
  const nodes = [n('r1'), n('a', ['r1']), n('r2'), n('b', ['r2'])];
  const pos = GL.computeLayerLayout(nodes);
  assert.ok(allPositioned(pos, ['r1', 'a', 'r2', 'b']));
  assert.notDeepEqual(pos.r1, pos.r2, 'two components do not stack on each other');
});

test('a custom layerRadii is honoured, and a damaged one falls back', () => {
  const nodes = [n('root'), n('a', ['root'])];
  const wide = GL.computeLayerLayout(nodes, [0, 240, 460, 680, 900]);
  const narrow = GL.computeLayerLayout(nodes, [0, 180, 340, 500, 660]);
  // 'a' is a leaf, so it branches off its parent by LEAF_BRANCH either way —
  // what matters is that passing the array does not throw or empty the result.
  assert.ok(allPositioned(wide, ['root', 'a']));
  assert.ok(allPositioned(narrow, ['root', 'a']));
  assert.ok(allPositioned(GL.computeLayerLayout(nodes, null), ['root', 'a']));
  assert.ok(allPositioned(GL.computeLayerLayout(nodes, []), ['root', 'a']));
});

// ── cycles: the reason this module exists ──────────────────────────────────

test('a root-reachable cycle terminates and positions every node', () => {
  // top → m → n → m. This is the shape that white-screened both pages: the
  // component HAS a root, so the recursion actually enters the cycle.
  const nodes = [n('top'), n('m', ['top', 'n']), n('n', ['m'])];
  const pos = GL.computeLayerLayout(nodes);
  assert.ok(allPositioned(pos, ['top', 'm', 'n']),
    'every node in a cyclic component still gets a finite position');
  assert.deepEqual(pos.top, { x: 360, y: 260 });
});

test('a self-parent terminates', () => {
  const nodes = [n('root'), n('self', ['root', 'self'])];
  const pos = GL.computeLayerLayout(nodes);
  assert.ok(allPositioned(pos, ['root', 'self']));
});

test('a pure cycle with no root at all still positions its nodes', () => {
  // Neither node is a root, so nothing above lays them out — the catch-all at
  // the end of layoutComponent is what has to cover this.
  const nodes = [n('x', ['y']), n('y', ['x'])];
  const pos = GL.computeLayerLayout(nodes);
  assert.ok(allPositioned(pos, ['x', 'y']));
});

test('a long cycle terminates', () => {
  const nodes = [n('root'), n('a', ['root', 'd']), n('b', ['a']), n('c', ['b']), n('d', ['c'])];
  const pos = GL.computeLayerLayout(nodes);
  assert.ok(allPositioned(pos, ['root', 'a', 'b', 'c', 'd']));
});

test('two independent cycles in two components both terminate', () => {
  const nodes = [
    n('r1'), n('m1', ['r1', 'n1']), n('n1', ['m1']),
    n('r2'), n('m2', ['r2', 'n2']), n('n2', ['m2'])
  ];
  const pos = GL.computeLayerLayout(nodes);
  assert.ok(allPositioned(pos, ['r1', 'm1', 'n1', 'r2', 'm2', 'n2']));
});

test('a cycle deep under a legal diamond terminates', () => {
  // Mixes the two things the guard has to tell apart: a shared node that must
  // still be drawn on both branches, and a repeat that must end its branch.
  const nodes = [
    n('root'), n('l', ['root']), n('r', ['root']),
    n('shared', ['l', 'r']), n('p', ['shared', 'q']), n('q', ['p'])
  ];
  const pos = GL.computeLayerLayout(nodes);
  assert.ok(allPositioned(pos, ['root', 'l', 'r', 'shared', 'p', 'q']));
});

test('a node whose parentIds is not an array does not throw', () => {
  const nodes = [n('root'), { id: 'bad', parentIds: 'root' }];
  const pos = GL.computeLayerLayout(nodes);
  assert.ok(allPositioned(pos, ['root', 'bad']));
});

// ── applyRepulsion ─────────────────────────────────────────────────────────

test('applyRepulsion separates near nodes and copies rather than mutates', () => {
  const pos = { a: { x: 100, y: 100 }, b: { x: 101, y: 100 } };
  const out = GL.applyRepulsion(pos);
  assert.deepEqual(pos.a, { x: 100, y: 100 }, 'the input is not mutated');
  const dx = out.b.x - out.a.x, dy = out.b.y - out.a.y;
  assert.ok(Math.sqrt(dx * dx + dy * dy) >= 89, 'near nodes are pushed to minDist');
  assert.ok(finite(out.a) && finite(out.b));
});

test('applyRepulsion cannot separate EXACTLY coincident nodes', () => {
  // Not a defect to fix here, but a real constraint the layout has to respect:
  // identical coordinates give the push no direction, so nx and ny are both 0
  // and the pair stays stacked forever. That is why computeLayerLayout fans its
  // rootless-cycle leftovers around the centre rather than piling them on it.
  const out = GL.applyRepulsion({ a: { x: 100, y: 100 }, b: { x: 100, y: 100 } });
  assert.deepEqual(out.a, out.b, 'coincident stays coincident — no direction to push along');
});

test('a rootless cycle does not stack every node on one point', () => {
  // The consequence of the case above: before the leftovers were fanned, an
  // all-cycle component rendered as a single node with the rest hidden beneath.
  const pos = GL.computeLayerLayout([n('x', ['y']), n('y', ['x'])]);
  assert.ok(allPositioned(pos, ['x', 'y']));
  assert.notDeepEqual(pos.x, pos.y, 'the two nodes are distinguishable on the canvas');
});

test('applyRepulsion leaves already-distant nodes alone and handles empties', () => {
  const pos = { a: { x: 0, y: 0 }, b: { x: 1000, y: 1000 } };
  const out = GL.applyRepulsion(pos);
  assert.deepEqual(out, pos);
  assert.deepEqual(GL.applyRepulsion({}), {});
  assert.deepEqual(GL.applyRepulsion(null), {});
});

test('applyRepulsion composes with a cyclic layout without throwing', () => {
  const nodes = [n('top'), n('m', ['top', 'n']), n('n', ['m'])];
  const out = GL.applyRepulsion(GL.computeLayerLayout(nodes, [0, 240, 460, 680, 900]));
  assert.ok(allPositioned(out, ['top', 'm', 'n']));
});
