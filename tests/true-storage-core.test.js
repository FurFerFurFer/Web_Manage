/* ── tests/true-storage-core.test.js ───────────────────────────────────────
   Offline cover for true-storage-core.js — the one definition of the
   storage↔source-dump relationship.

       node --test tests/true-storage-core.test.js

   Run once by tests/run.js rather than once per timezone: there is no date code
   in this module, so a sweep would cost five runs and prove nothing. The
   timezone sweep exists for calendar-core.js and schema.js, which turn instants
   into local calendar days.

   What is actually being pinned: a tag names a PAIR — one leaf dump and one MM
   inside it — and `storagesForLink` is the only place that comparison is
   written. sir-ks02.html draws that pair's content at four separate sites, and
   the last time a predicate was spelled out at each site instead of shared, one
   copy dropped half of it and the Progress timeline mismarked every deadline
   due day (AGENTS.md, "Choosable deadline caution period"). These cases are
   what make the shared version worth keeping shared.
*/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// runInThisContext, not runInNewContext: the module is built on Array.isArray,
// and a fresh realm would make arrays built here fail it — quietly testing
// something the browser never does.
globalThis.window = globalThis;
vm.runInThisContext(
  fs.readFileSync(path.join(__dirname, '..', 'scripts', 'true-storage-core.js'), 'utf8'),
  { filename: 'true-storage-core.js' }
);
const TS = globalThis.TrackTrueStorage;

// Synthetic, always. Dump ids are strings and MM ids are numbers here on
// purpose: that is the real mix, because a dump id and an mm id both come from
// sir-ks02.html but a tag holds one of each and nothing coerces them.
const tag = (id, dumpId, mmId) => ({ id, dumpId, mmId });
const storage = (id, over = {}) =>
  Object.assign({ id, name: 'Storage ' + id, parentIds: [], explanation: '', tags: [] }, over);

const A = storage('s-a', { tags: [tag('t1', 'd-1', 10)] });
const B = storage('s-b', { tags: [tag('t2', 'd-1', 11)] });
const C = storage('s-c', { tags: [tag('t3', 'd-2', 10)] });
const D = storage('s-d', { tags: [tag('t4', 'd-1', 10), tag('t5', 'd-2', 11)] });
const LIST = [A, B, C, D];

test('module surface', () => {
  for (const name of ['storagesForLink', 'hasTag', 'tagPairs', 'withTag',
    'withoutTag', 'withoutPair', 'repointDump', 'parentIdsOf', 'tagsOf', 'buildTree']) {
    assert.equal(typeof TS[name], 'function', name + ' is exported');
  }
});

// ── the matcher ────────────────────────────────────────────────────────────

test('storagesForLink matches the PAIR, not either half of it', () => {
  assert.deepEqual(TS.storagesForLink(LIST, 'd-1', 10).map(s => s.id), ['s-a', 's-d']);

  // The two failures a per-site copy of this comparison would make: keeping the
  // dump and forgetting the MM, or the reverse. Both must exclude, not include.
  assert.ok(!TS.storagesForLink(LIST, 'd-1', 10).some(s => s.id === 's-b'),
    'same dump, different MM must not match');
  assert.ok(!TS.storagesForLink(LIST, 'd-1', 10).some(s => s.id === 's-c'),
    'same MM, different dump must not match');

  assert.deepEqual(TS.storagesForLink(LIST, 'd-2', 11).map(s => s.id), ['s-d']);
  assert.deepEqual(TS.storagesForLink(LIST, 'd-9', 99), [], 'a pair nothing is tagged to is empty');
});

test('storagesForLink returns storages in stored order', () => {
  const reordered = [D, A];
  assert.deepEqual(TS.storagesForLink(reordered, 'd-1', 10).map(s => s.id), ['s-d', 's-a']);
});

test('ids are compared exactly — a numeric MM id is not its string', () => {
  // Nothing coerces, and nothing should: the only way a string id reaches here
  // is via a DOM dataset, which would be the bug worth failing on.
  assert.deepEqual(TS.storagesForLink(LIST, 'd-1', '10'), []);
});

test('the matcher never throws on damaged input', () => {
  assert.deepEqual(TS.storagesForLink(null, 'd-1', 10), []);
  assert.deepEqual(TS.storagesForLink('nope', 'd-1', 10), []);
  assert.deepEqual(TS.storagesForLink([null, 42, 'x'], 'd-1', 10), []);
  // schema.js validates that trueStorages is a list of objects and stops there,
  // so a junk `tags` really can be stored. It must read as "no tags".
  assert.deepEqual(TS.storagesForLink([storage('s-x', { tags: 'oops' })], 'd-1', 10), []);
  assert.deepEqual(TS.storagesForLink([storage('s-y', { tags: [null, 7] })], 'd-1', 10), []);
});

test('hasTag and tagPairs read the same relationship', () => {
  assert.equal(TS.hasTag(LIST, 's-a', 'd-1', 10), true);
  assert.equal(TS.hasTag(LIST, 's-a', 'd-1', 11), false);
  assert.equal(TS.hasTag(LIST, 'missing', 'd-1', 10), false);
  assert.deepEqual(TS.tagPairs(D), [{ dumpId: 'd-1', mmId: 10 }, { dumpId: 'd-2', mmId: 11 }]);
  assert.deepEqual(TS.tagPairs(storage('s-z')), []);
  assert.deepEqual(TS.tagPairs(null), []);
});

// ── the writers ────────────────────────────────────────────────────────────

test('withTag adds one tag and leaves the input alone', () => {
  const before = JSON.stringify(LIST);
  const next = TS.withTag(LIST, 's-b', 'd-2', 10, 'new-1');
  assert.equal(JSON.stringify(LIST), before, 'the input array was not mutated');
  assert.deepEqual(next.find(s => s.id === 's-b').tags,
    [tag('t2', 'd-1', 11), tag('new-1', 'd-2', 10)]);
  // Every other record is carried through by reference, so nothing unrelated
  // looks changed to a JSON.stringify comparison or a React identity check.
  assert.equal(next.find(s => s.id === 's-a'), A);
});

test('withTag keeps keys this version has never heard of', () => {
  const odd = storage('s-odd', { futureField: { written: 'later' } });
  const next = TS.withTag([odd], 's-odd', 'd-1', 10, 'n');
  assert.deepEqual(next[0].futureField, { written: 'later' },
    'a storage is spread, never rebuilt from a field list');
});

test('withTag is identity when there is nothing to do', () => {
  // Same reference, not merely equal: the caller skips the write, and with it
  // the sync upload that write would arm.
  assert.equal(TS.withTag(LIST, 's-a', 'd-1', 10, 'dupe'), LIST, 'already tagged');
  assert.equal(TS.withTag(LIST, 'no-such-storage', 'd-1', 10, 'x'), LIST, 'no such storage');
  assert.equal(TS.withTag(null, 's-a', 'd-1', 10, 'x'), null, 'not a list');
});

test('withoutPair removes only the named pair', () => {
  const next = TS.withoutPair(LIST, 's-d', 'd-1', 10);
  assert.deepEqual(next.find(s => s.id === 's-d').tags, [tag('t5', 'd-2', 11)]);
  assert.deepEqual(next.find(s => s.id === 's-a').tags, [tag('t1', 'd-1', 10)],
    'another storage tagged to the same pair is untouched');
  assert.equal(TS.withoutPair(LIST, 's-a', 'd-9', 9), LIST, 'nothing matched: identity');
  assert.equal(TS.withoutPair(LIST, 'missing', 'd-1', 10), LIST);
});

test('withoutTag removes by tag id', () => {
  const next = TS.withoutTag(LIST, 's-d', 't5');
  assert.deepEqual(next.find(s => s.id === 's-d').tags, [tag('t4', 'd-1', 10)]);
  assert.equal(TS.withoutTag(LIST, 's-d', 'no-such-tag'), LIST);
});

test('a round trip through both writers returns the original relationship', () => {
  const added = TS.withTag(LIST, 's-b', 'd-2', 10, 'tmp');
  const removed = TS.withoutPair(added, 's-b', 'd-2', 10);
  assert.deepEqual(JSON.parse(JSON.stringify(removed)), JSON.parse(JSON.stringify(LIST)));
});

// ── repointDump ────────────────────────────────────────────────────────────
// Adding a sub-title under a leaf dump moves that leaf's mmLinks down to the
// new child, so the tag naming that content has to follow it.

test('repointDump moves every tag naming the old dump, across all storages', () => {
  const out = TS.repointDump(LIST, 'd-1', 'd-9');
  assert.deepEqual(out.map(s => s.tags.map(t => [t.id, t.dumpId, t.mmId])), [
    [['t1', 'd-9', 10]],
    [['t2', 'd-9', 11]],
    [['t3', 'd-2', 10]],
    [['t4', 'd-9', 10], ['t5', 'd-2', 11]]
  ]);
});

test('repointDump preserves the tag id and the mmId half of the pair', () => {
  const out = TS.repointDump([A], 'd-1', 'd-9');
  assert.equal(out[0].tags[0].id, 't1', 'the same record, pointed somewhere new');
  assert.equal(out[0].tags[0].mmId, 10, 'the MM half never moves — the sections moved wholesale');
});

test('repointDump returns the SAME reference when nothing changed', () => {
  // _mutateSlotKey short-circuits on this, so a sub-title added under an
  // untagged dump writes nothing and arms no sync upload.
  assert.strictEqual(TS.repointDump(LIST, 'd-nope', 'd-9'), LIST);
  assert.strictEqual(TS.repointDump(LIST, 'd-1', 'd-1'), LIST, 'a no-op move is not a write');
});

test('repointDump does not mutate its input', () => {
  const before = JSON.stringify(LIST);
  TS.repointDump(LIST, 'd-1', 'd-9');
  assert.equal(JSON.stringify(LIST), before);
});

test('repointDump leaves untouched storages by reference', () => {
  const out = TS.repointDump(LIST, 'd-2', 'd-9');
  assert.strictEqual(out[0], A, 'a storage with no matching tag is the same object');
  assert.notStrictEqual(out[2], C, 'and one with a matching tag is a fresh object');
});

test('repointDump never throws on damaged input', () => {
  assert.strictEqual(TS.repointDump(null, 'd-1', 'd-9'), null);
  assert.strictEqual(TS.repointDump(undefined, 'd-1', 'd-9'), undefined);
  const messy = [null, 'nope', { id: 'x' }, { id: 'y', tags: 'bad' },
    { id: 'z', tags: [null, tag('t', 'd-1', 1)] }];
  const out = TS.repointDump(messy, 'd-1', 'd-9');
  assert.equal(out[4].tags[1].dumpId, 'd-9');
  assert.equal(out[4].tags[0], null, 'a damaged tag is passed through untouched');
});

test('repointDump preserves unknown keys on both storage and tag', () => {
  // Same reason withTag spreads: a later version may add fields, and
  // normalizeSlot deliberately keeps keys it has never heard of.
  const s = storage('s-x', { colour: 'red', tags: [{ id: 't', dumpId: 'd-1', mmId: 1, note: 'keep' }] });
  const out = TS.repointDump([s], 'd-1', 'd-9');
  assert.equal(out[0].colour, 'red');
  assert.equal(out[0].tags[0].note, 'keep');
  assert.equal(out[0].tags[0].dumpId, 'd-9');
});

// ── defensive readers ──────────────────────────────────────────────────────

test('parentIdsOf and tagsOf answer [] for anything that is not a list', () => {
  assert.deepEqual(TS.parentIdsOf(storage('s', { parentIds: 'x' })), []);
  assert.deepEqual(TS.parentIdsOf(null), []);
  assert.deepEqual(TS.tagsOf(storage('s', { tags: null })), []);
  assert.deepEqual(TS.tagsOf(undefined), []);
});

// ── the tree ───────────────────────────────────────────────────────────────

test('buildTree nests by parentIds', () => {
  const list = [
    storage('root'),
    storage('kid', { parentIds: ['root'] }),
    storage('grandkid', { parentIds: ['kid'] }),
    storage('other')
  ];
  const tree = TS.buildTree(list);
  assert.deepEqual(tree.map(n => n.storage.id), ['root', 'other']);
  assert.deepEqual(tree[0].children.map(n => n.storage.id), ['kid']);
  assert.deepEqual(tree[0].children[0].children.map(n => n.storage.id), ['grandkid']);
});

test('a parent that no longer exists makes the child a root, not an orphan', () => {
  // Deleting a storage detaches it from its children, but a hand-edited export
  // or a half-applied sync can still leave a dangling parent id. Dropping the
  // child from the tree would make it unreachable in both views.
  const tree = TS.buildTree([storage('kid', { parentIds: ['gone'] })]);
  assert.deepEqual(tree.map(n => n.storage.id), ['kid']);
});

test('a parent cycle terminates instead of recursing forever', () => {
  const selfParent = [storage('a', { parentIds: ['a'] })];
  assert.deepEqual(TS.buildTree(selfParent).map(n => n.storage.id), []);

  const mutual = [storage('x', { parentIds: ['y'] }), storage('y', { parentIds: ['x'] })];
  // Neither is a root, so the tree is empty — but building it must return, and
  // that is the whole point of this case.
  assert.deepEqual(TS.buildTree(mutual), []);

  const reachableCycle = [
    storage('top'),
    storage('m', { parentIds: ['top', 'n'] }),
    storage('n', { parentIds: ['m'] })
  ];
  const tree = TS.buildTree(reachableCycle);
  assert.deepEqual(tree.map(n => n.storage.id), ['top']);
  assert.deepEqual(tree[0].children.map(n => n.storage.id), ['m']);
  assert.deepEqual(tree[0].children[0].children.map(n => n.storage.id), ['n']);
  // `seen` re-emits the repeated node once with no children of its own, which
  // is how SRCH has always drawn a cycle. What matters is that the branch ENDS.
  const repeated = tree[0].children[0].children[0].children;
  assert.deepEqual(repeated.map(n => n.storage.id), ['m']);
  assert.deepEqual(repeated[0].children, [], 'the cycle stops one level down');
});

test('buildTree never throws on damaged input', () => {
  assert.deepEqual(TS.buildTree(null), []);
  assert.deepEqual(TS.buildTree([null, 'x', 3]), []);
  assert.deepEqual(TS.buildTree([storage('s', { parentIds: 'nope' })]).map(n => n.storage.id), ['s']);
});
