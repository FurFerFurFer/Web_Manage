/* ── tests/source-dump-core.test.js ────────────────────────────────────────
   Offline cover for source-dump-core.js — the one definition of how a source
   dump is edited.

       node --test tests/source-dump-core.test.js

   Run once by tests/run.js rather than once per timezone, and that is a claim
   about the module rather than a convenience: nothing in source-dump-core.js
   constructs a Date. A new entry's `createdAt` arrives as a PARAMETER, computed
   by the page with its own day helper. If a `new Date()` ever appears there,
   this suite has moved to the wrong list — the structural case below says so.

   Why the module exists, which is also what these cases pin: TWO pages now
   edit `sourceDumps` — sir-ks02.html, which owns the key, and true-storage.html,
   whose SOURCE DUMP tab is a copy of KS02's page. If each page spelled its own
   writers, the same click could store two different things, and the "copy"
   would quietly stop being one. So every writer lives here once, and both
   pages delegate.

   In order of how much it would cost to get wrong:

   1. Adding a sub-title under a dump MOVES the parent's MM sections down to the
      new child and empties the parent's — and a parent that no longer exists
      is REFUSED, because the orphan it would create is reachable from no root.
   2. Nothing is ever mutated, every record is SPREAD (an unknown key — the
      repair IIFE's `restoredFromMmId`, a later version's field — survives an
      edit), and a writer that changes nothing hands back its input so the page
      can skip the write and the sync upload it would arm.
   3. Ids are of TWO types. KS02 mints numbers from nid(); True Storage mints
      strings from TrackStorage.newId(). Both reach the same list, and every
      comparison is === on stored values. The fixtures below mix them on
      purpose: a suite that used one type could pass against a module that
      coerced the other.

   Fixtures are synthetic, always (AGENTS.md, "Preserve old data").
*/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// A browser IIFE ending in `})(window)`. runInThisContext, not runInNewContext:
// the module is built on Array.isArray, and a fresh realm would make arrays
// built here fail it — quietly testing something the browser never does.
globalThis.window = globalThis;
const SRC = path.join(__dirname, '..', 'scripts', 'source-dump-core.js');
vm.runInThisContext(fs.readFileSync(SRC, 'utf8'), { filename: 'source-dump-core.js' });
const SD = globalThis.TrackSourceDump;

// ── fixtures ───────────────────────────────────────────────────────────────

const link = (id, mmId, over = {}) =>
  Object.assign({ id, mmId, text: '', textBlocks: [], links: [] }, over);
const dump = (id, over = {}) =>
  Object.assign({ id, title: 'Dump ' + id, createdAt: '2026-03-08', parentId: null, mmLinks: [] }, over);
const block = (id, over = {}) => Object.assign({ id, title: 'T' + id, explanation: 'E' + id }, over);
const url = (id, over = {}) => Object.assign({ id, label: 'L' + id, url: 'https://example.com/' + id }, over);

// Deep-freeze: a writer that mutates anything it was handed throws here
// instead of passing.
function freeze(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    Object.keys(v).forEach(k => freeze(v[k]));
  }
  return v;
}

// The real mix. 'd-1' is how True Storage's string ids look (TrackStorage.newId
// is base36-dash, but any string will do); 7 is how KS02's look. Link 90 lives
// inside a string-id dump, and link 'l-s' inside a numeric one.
const LIST = () => freeze([
  dump('d-1', {
    mmLinks: [
      link(90, 10, { textBlocks: [block(500), block(501)], links: [url(600)] }),
      link(91, 11)
    ]
  }),
  dump(7, { mmLinks: [link('l-s', 10, { textBlocks: [block('b-s')] })] }),
  dump('d-2', { parentId: 'd-1' }),
  dump('d-3', { parentId: 'd-2' })
]);

const byId = (list, id) => list.find(d => d && d.id === id);

// ── module surface ─────────────────────────────────────────────────────────

test('the module exports exactly the documented surface', () => {
  // Written out by hand on purpose: if an export is added or renamed, this is
  // the case that notices.
  assert.deepEqual(Object.keys(SD).sort(), [
    'canLinkMM', 'inheritsLinks', 'isLeafMM', 'isLegacyBlock', 'pathTo',
    'textBlocksOf', 'transferTextBlock', 'transferURLLink',
    'withEntry', 'withMMLink', 'withTextBlock', 'withTitle', 'withURLLink',
    'withoutEntry', 'withoutMMLink', 'withoutTextBlock', 'withoutURLLink'
  ].sort());
  for (const k of Object.keys(SD)) assert.equal(typeof SD[k], 'function', k + ' is a function');
});

test('the module constructs no Date, which is why its suite is not swept', () => {
  // Comments are stripped first: this file's own prose explains why it holds
  // no date code, and a check that read the prose would fail on the
  // explanation rather than on the code.
  const src = fs.readFileSync(SRC, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  assert.equal(/new Date|Date\.now|getDay\(|toISOString|getTimezoneOffset/.test(src), false,
    'source-dump-core.js must hold no date code — move its suite to OFFLINE_FILES if it does');
});

test('the module touches no storage', () => {
  const src = fs.readFileSync(SRC, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  assert.equal(/localStorage|sessionStorage|TrackStorage|saveDB|loadDB/.test(src), false,
    'persistence belongs to the pages — this module only computes the next list');
});

// ── readers ────────────────────────────────────────────────────────────────

test('pathTo walks from the root down to the dump, for the breadcrumb', () => {
  const L = LIST();
  assert.deepEqual(SD.pathTo('d-3', L), ['d-1', 'd-2', 'd-3']);
  assert.deepEqual(SD.pathTo('d-1', L), ['d-1']);
  assert.deepEqual(SD.pathTo(7, L), [7], 'a numeric id is found by ===, not coerced');
  assert.deepEqual(SD.pathTo('7', L), [], "the STRING '7' is a different id");
  assert.deepEqual(SD.pathTo('nope', L), []);
  assert.deepEqual(SD.pathTo('d-1', null), []);
});

test('pathTo terminates inside a parentId cycle', () => {
  // The walk goes UP from wherever it is asked to start, so unlike the
  // downward walks it can begin inside a cycle (README, "Parent cycles").
  const L = freeze([dump('a', { parentId: 'b' }), dump('b', { parentId: 'a' })]);
  const p = SD.pathTo('a', L);
  assert.ok(Array.isArray(p) && p.length <= 2, 'it returned instead of recursing forever');
  assert.equal(p[p.length - 1], 'a', 'and still ends on the dump it was asked for');
});

test('textBlocksOf reads textBlocks, and falls back to legacy `text`', () => {
  assert.deepEqual(SD.textBlocksOf(link(90, 10, { textBlocks: [block(1)] })), [block(1)]);
  // An mmLink written before textBlocks existed carries its prose in `text`.
  assert.deepEqual(SD.textBlocksOf(link(90, 10, { text: '  old prose  ' })),
    [{ id: '90_m', title: '', explanation: 'old prose' }]);
  assert.deepEqual(SD.textBlocksOf(link('l-s', 10, { text: 'x' }))[0].id, 'l-s_m');
  assert.deepEqual(SD.textBlocksOf(link(90, 10)), []);
  // Total: nothing it can be handed makes it throw.
  for (const bad of [null, undefined, 5, 'x', [], { textBlocks: 'no' }, { text: 7 }]) {
    assert.deepEqual(SD.textBlocksOf(bad), []);
  }
  assert.deepEqual(SD.textBlocksOf(link(90, 10, { textBlocks: [null, block(2), 'junk'] })), [block(2)],
    'a non-record inside textBlocks is skipped rather than drawn');
});

test('isLegacyBlock is the one `_m` test', () => {
  const l = link(90, 10, { text: 'old' });
  assert.equal(SD.isLegacyBlock(l, SD.textBlocksOf(l)[0]), true);
  assert.equal(SD.isLegacyBlock(l, block(500)), false);
  assert.equal(SD.isLegacyBlock(link('l-s', 10), { id: 'l-s_m' }), true);
  assert.equal(SD.isLegacyBlock(null, { id: 'x_m' }), false);
  assert.equal(SD.isLegacyBlock(l, null), false);
});

test('isLeafMM and canLinkMM: which MMs a source dump offers', () => {
  const MMS = freeze([
    { id: 10, name: 'A', parentIds: [] },
    { id: 11, name: 'B', parentIds: [10] },          // 11 is a child of 10
    { id: 12, name: 'C', parentIds: [], sourceDumpActivated: true },
    { id: 13, name: 'D', parentIds: [] },
    { id: 14, name: 'E', parentIds: [12, 13] }        // makes 12 and 13 non-leaf
  ]);
  assert.equal(SD.isLeafMM(11, MMS), true);
  assert.equal(SD.isLeafMM(10, MMS), false);
  assert.equal(SD.isLeafMM('10', MMS), true, "the string '10' is nobody's parent");
  assert.equal(SD.canLinkMM(MMS[1], MMS), true, 'a leaf can be linked');
  assert.equal(SD.canLinkMM(MMS[0], MMS), false, 'a plain non-leaf cannot');
  assert.equal(SD.canLinkMM(MMS[2], MMS), true, 'a non-leaf with Source Dump activated can');
  assert.equal(SD.canLinkMM(MMS[3], MMS), false);
  assert.equal(SD.canLinkMM(Object.assign({}, MMS[3], { sourceDumpActivated: 'yes' }), MMS), false,
    'activation is === true, exactly as KS02 always tested it');
  // Malformed parentIds are not a list and are ignored, never substring-matched.
  assert.equal(SD.isLeafMM(10, [{ id: 99, parentIds: '110' }]), true);
  assert.equal(SD.isLeafMM(10, null), true);
  assert.equal(SD.canLinkMM(null, MMS), false);
});

test('inheritsLinks is true only for a parent that has MM sections', () => {
  const L = LIST();
  assert.equal(SD.inheritsLinks(L, 'd-1'), true);
  assert.equal(SD.inheritsLinks(L, 'd-2'), false);
  assert.equal(SD.inheritsLinks(L, null), false, 'a root title inherits nothing');
  assert.equal(SD.inheritsLinks(L, 'gone'), false);
});

// ── adding and removing titles ─────────────────────────────────────────────

test('withEntry adds a root title in KS02\'s record shape', () => {
  const L = LIST();
  const next = SD.withEntry(L, { id: 'n-1', title: '  New  ', parentId: null, createdAt: '2026-10-04' });
  assert.notEqual(next, L);
  assert.equal(next.length, L.length + 1);
  assert.deepEqual(next[next.length - 1],
    { id: 'n-1', title: 'New', createdAt: '2026-10-04', parentId: null, mmLinks: [] },
    'appended last, trimmed, with exactly the five keys KS02 writes');
  assert.deepEqual(Object.keys(next[next.length - 1]), ['id', 'title', 'createdAt', 'parentId', 'mmLinks']);
  next.slice(0, -1).forEach((d, i) => assert.equal(d, L[i], 'every other record is the same object'));
});

test('withEntry under a dump with MM sections MOVES them to the new child', () => {
  const L = LIST();
  const next = SD.withEntry(L, { id: 42, title: 'Sub', parentId: 'd-1', createdAt: '2026-10-04' });
  const parent = byId(next, 'd-1');
  const child = byId(next, 42);
  assert.deepEqual(parent.mmLinks, [], 'the parent keeps none');
  assert.deepEqual(child.mmLinks, L[0].mmLinks, 'the child carries the whole set, ids and content intact');
  assert.equal(child.parentId, 'd-1');
  assert.equal(parent.title, L[0].title, 'and the parent is otherwise untouched');
});

test('withEntry under a dump with no MM sections leaves the parent alone', () => {
  const L = LIST();
  const next = SD.withEntry(L, { id: 'n-2', title: 'Sub', parentId: 'd-2', createdAt: '2026-10-04' });
  assert.equal(byId(next, 'd-2'), L[2], 'the same object — nothing to move');
  assert.deepEqual(byId(next, 'n-2').mmLinks, []);
});

test('withEntry REFUSES a parent that no longer exists', () => {
  // A parent deleted in another tab, with the breadcrumb still on it. The
  // orphan this would create has a parentId that names nothing, so it is
  // nobody's child and no root leads to it: stored, synced, and unreachable.
  const L = LIST();
  assert.equal(SD.withEntry(L, { id: 'n-3', title: 'Sub', parentId: 'deleted', createdAt: 'x' }), L);
});

test('withEntry refuses a blank title', () => {
  const L = LIST();
  assert.equal(SD.withEntry(L, { id: 'n-4', title: '   ', parentId: null, createdAt: 'x' }), L);
  assert.equal(SD.withEntry(L, { id: 'n-4', title: null, parentId: null, createdAt: 'x' }), L);
});

test('withEntry moves links from ONE parent when two records share its id', () => {
  // A re-imported dump file can duplicate ids (NOTES Proposal 1). Emptying
  // every record with the id while inheriting only the first one's links
  // would delete the second record's sections outright.
  const L = freeze([dump('dup', { mmLinks: [link(1, 10)] }), dump('dup', { mmLinks: [link(2, 11)] })]);
  const next = SD.withEntry(L, { id: 'c', title: 'Sub', parentId: 'dup', createdAt: 'x' });
  const all = next.flatMap(d => d.mmLinks.map(l => l.id)).sort();
  assert.deepEqual(all, [1, 2], 'no MM section was lost');
});

test('withoutEntry removes the dump and every descendant, and nothing else', () => {
  const L = LIST();
  const next = SD.withoutEntry(L, 'd-1');
  assert.deepEqual(next.map(d => d.id), [7], 'd-1, its child d-2 and grandchild d-3 are gone');
  assert.equal(next[0], L[1], 'the survivor is the same object');
  assert.deepEqual(SD.withoutEntry(L, 'd-3').map(d => d.id), ['d-1', 7, 'd-2']);
  assert.equal(SD.withoutEntry(L, 'nope'), L, 'an id that names nothing changes nothing');
});

test('withoutEntry terminates when the walk meets a parentId cycle', () => {
  // A downward walk from a ROOT cannot reach a cycle (README, "Parent
  // cycles"), but this walk starts wherever it is asked to — and a duplicated
  // id from a re-imported file can splice a cycle into an ordinary subtree.
  const L = freeze([dump('a', { parentId: 'b' }), dump('b', { parentId: 'a' }), dump('keep')]);
  assert.deepEqual(SD.withoutEntry(L, 'a').map(d => d.id), ['keep']);
  const spliced = freeze([dump('top'), dump('a', { parentId: 'top' }), dump('b', { parentId: 'a' }),
    Object.assign(dump('dup'), { id: 'a', parentId: 'b' })]);
  assert.deepEqual(SD.withoutEntry(spliced, 'top'), []);
});

test('withoutEntry keeps a non-record entry it was not asked to remove', () => {
  const L = freeze([dump('x'), null, dump('y')]);
  const next = SD.withoutEntry(L, 'x');
  assert.deepEqual(next, [null, dump('y')], 'a writer never drops data it did not target');
});

test('withTitle renames, trims, and refuses blank or unchanged', () => {
  const L = LIST();
  const next = SD.withTitle(L, 7, '  Renamed  ');
  assert.equal(byId(next, 7).title, 'Renamed');
  assert.deepEqual(byId(next, 7).mmLinks, L[1].mmLinks);
  assert.equal(SD.withTitle(L, 7, '   '), L);
  assert.equal(SD.withTitle(L, 7, L[1].title), L, 'the same title is no change, so no write');
  assert.equal(SD.withTitle(L, 'nope', 'X'), L);
});

// ── MM sections ────────────────────────────────────────────────────────────

test('withMMLink adds a section in KS02\'s shape, once per MM', () => {
  const L = LIST();
  const next = SD.withMMLink(L, 'd-2', 10, 'l-new');
  assert.deepEqual(byId(next, 'd-2').mmLinks,
    [{ id: 'l-new', mmId: 10, text: '', textBlocks: [], links: [] }]);
  assert.equal(SD.withMMLink(L, 'd-1', 10, 'l-x'), L, 'an MM already linked here is not linked twice');
  assert.equal(SD.withMMLink(L, 'nope', 10, 'l-x'), L);
  // A dump with no mmLinks at all — KS02 used to throw on `...d.mmLinks` here.
  const bare = freeze([{ id: 'b', title: 'bare', parentId: null }]);
  assert.deepEqual(SD.withMMLink(bare, 'b', 10, 'l-y')[0].mmLinks.map(l => l.id), ['l-y']);
});

test('withoutMMLink removes one section and leaves its neighbour', () => {
  const L = LIST();
  const next = SD.withoutMMLink(L, 'd-1', 90);
  assert.deepEqual(byId(next, 'd-1').mmLinks.map(l => l.id), [91]);
  assert.equal(byId(next, 'd-1').mmLinks[0], L[0].mmLinks[1]);
  assert.equal(SD.withoutMMLink(L, 'd-1', 999), L);
  assert.equal(SD.withoutMMLink(L, 'd-1', '90'), L, "the string '90' is not link 90");
});

// ── citation links ─────────────────────────────────────────────────────────

test('withURLLink adds a citation, trimmed, label defaulting to the url', () => {
  const L = LIST();
  const next = SD.withURLLink(L, 'd-1', 91, { label: '  Paper ', url: ' https://x.test/a ' }, 'u-1');
  assert.deepEqual(byId(next, 'd-1').mmLinks[1].links, [{ id: 'u-1', label: 'Paper', url: 'https://x.test/a' }]);
  const unlabeled = SD.withURLLink(L, 'd-1', 91, { label: '', url: 'https://x.test/b' }, 'u-2');
  assert.equal(byId(unlabeled, 'd-1').mmLinks[1].links[0].label, 'https://x.test/b');
  assert.equal(SD.withURLLink(L, 'd-1', 91, { label: 'x', url: '   ' }, 'u-3'), L, 'a blank url is refused');
  assert.equal(SD.withURLLink(L, 'd-1', 999, { url: 'https://x.test' }, 'u-4'), L);
  assert.equal(SD.withURLLink(L, 'nope', 91, { url: 'https://x.test' }, 'u-5'), L);
});

test('withoutURLLink removes one citation', () => {
  const L = LIST();
  const next = SD.withoutURLLink(L, 'd-1', 90, 600);
  assert.deepEqual(byId(next, 'd-1').mmLinks[0].links, []);
  assert.deepEqual(byId(next, 'd-1').mmLinks[0].textBlocks, L[0].mmLinks[0].textBlocks,
    'the text blocks beside it are untouched');
  assert.equal(SD.withoutURLLink(L, 'd-1', 90, 601), L);
});

// ── text blocks ────────────────────────────────────────────────────────────

test('withTextBlock adds a block, trimmed, and refuses a blank explanation', () => {
  const L = LIST();
  const next = SD.withTextBlock(L, 'd-1', 91, { title: ' Why ', explanation: ' Because. ' }, 'b-1');
  assert.deepEqual(byId(next, 'd-1').mmLinks[1].textBlocks,
    [{ title: 'Why', explanation: 'Because.', id: 'b-1' }]);
  assert.equal(SD.withTextBlock(L, 'd-1', 91, { title: 'x', explanation: '  ' }, 'b-2'), L);
  assert.equal(SD.withTextBlock(L, 'd-1', 999, { explanation: 'x' }, 'b-3'), L);
  // A block that already carries an id keeps it — KS02 minted only when absent.
  const kept = SD.withTextBlock(L, 'd-1', 91, { id: 'own', explanation: 'x' }, 'b-4');
  assert.equal(byId(kept, 'd-1').mmLinks[1].textBlocks[0].id, 'own');
});

test('withoutTextBlock removes one block, and a legacy `_m` block is not removable', () => {
  const L = LIST();
  const next = SD.withoutTextBlock(L, 'd-1', 90, 500);
  assert.deepEqual(byId(next, 'd-1').mmLinks[0].textBlocks.map(b => b.id), [501]);
  const legacy = freeze([dump('d', { mmLinks: [link(5, 10, { text: 'old' })] })]);
  assert.equal(SD.withoutTextBlock(legacy, 'd', 5, '5_m'), legacy,
    'the legacy block is synthesised from `text`, so there is nothing to remove');
});

// ── transfers ──────────────────────────────────────────────────────────────

test('transferTextBlock moves a block into the target MM\'s existing section', () => {
  const L = LIST();
  const next = SD.transferTextBlock(L, 'd-1', 90, 500, 11, 'unused');
  const [from, to] = byId(next, 'd-1').mmLinks;
  assert.deepEqual(from.textBlocks.map(b => b.id), [501]);
  assert.deepEqual(to.textBlocks, [block(500)], 'the block arrives whole');
  assert.equal(byId(next, 'd-1').mmLinks.length, 2, 'no section was created');
});

test('transferTextBlock creates the target section when the MM has none here', () => {
  const L = LIST();
  const next = SD.transferTextBlock(L, 'd-1', 90, 500, 12, 'l-new');
  const links = byId(next, 'd-1').mmLinks;
  assert.equal(links.length, 3);
  assert.deepEqual(links[2], { id: 'l-new', mmId: 12, text: '', textBlocks: [block(500)], links: [] });
});

test('a transfer onto its own section, or of a missing block, changes nothing', () => {
  // KS02's original handler, given its own MM as the target, removed the block
  // from the source and never added it back — the picker hides that option,
  // and the writer now refuses it outright.
  const L = LIST();
  assert.equal(SD.transferTextBlock(L, 'd-1', 90, 500, 10, 'x'), L);
  assert.equal(SD.transferTextBlock(L, 'd-1', 90, 999, 11, 'x'), L);
  assert.equal(SD.transferTextBlock(L, 'nope', 90, 500, 11, 'x'), L);
  const legacy = freeze([dump('d', { mmLinks: [link(5, 10, { text: 'old' }), link(6, 11)] })]);
  assert.equal(SD.transferTextBlock(legacy, 'd', 5, '5_m', 11, 'x'), legacy,
    'a legacy block is not in textBlocks, so it cannot be transferred');
});

test('transferURLLink moves a citation, and creates the section when needed', () => {
  const L = LIST();
  const into = SD.transferURLLink(L, 'd-1', 90, 600, 11, 'unused');
  assert.deepEqual(byId(into, 'd-1').mmLinks[0].links, []);
  assert.deepEqual(byId(into, 'd-1').mmLinks[1].links, [url(600)]);
  const fresh = SD.transferURLLink(L, 'd-1', 90, 600, 12, 'l-new');
  assert.deepEqual(byId(fresh, 'd-1').mmLinks[2],
    { id: 'l-new', mmId: 12, text: '', textBlocks: [], links: [url(600)] });
  assert.equal(SD.transferURLLink(L, 'd-1', 90, 600, 10, 'x'), L, 'onto its own section: no change');
  assert.equal(SD.transferURLLink(L, 'd-1', 90, 999, 11, 'x'), L);
});

test('transfers work inside a numeric-id dump too', () => {
  const L = freeze([dump(7, { mmLinks: [link('l-s', 10, { textBlocks: [block('b-s')] }), link(8, 11)] })]);
  const next = SD.transferTextBlock(L, 7, 'l-s', 'b-s', 11, 'x');
  assert.deepEqual(next[0].mmLinks[1].textBlocks.map(b => b.id), ['b-s']);
});

// ── contract shared by every writer ────────────────────────────────────────

test('every writer spreads: unknown keys on the dump and the section survive', () => {
  const L = freeze([dump('d', {
    futureKey: { from: 'a later version' },
    mmLinks: [link(5, 10, { restoredFromMmId: 3, textBlocks: [block(1)], links: [url(2)] }), link(6, 11)]
  })]);
  const runs = [
    SD.withTitle(L, 'd', 'Renamed'),
    SD.withMMLink(L, 'd', 12, 'l'),
    SD.withURLLink(L, 'd', 5, { url: 'https://x.test' }, 'u'),
    SD.withoutURLLink(L, 'd', 5, 2),
    SD.withTextBlock(L, 'd', 5, { explanation: 'x' }, 'b'),
    SD.withoutTextBlock(L, 'd', 5, 1),
    SD.transferTextBlock(L, 'd', 5, 1, 11, 'x'),
    SD.transferURLLink(L, 'd', 5, 2, 11, 'x'),
    SD.withEntry(L, { id: 'c', title: 'Sub', parentId: null, createdAt: 'x' })
  ];
  runs.forEach((next, i) => {
    assert.notEqual(next, L, 'run ' + i + ' changed something');
    const d = byId(next, 'd');
    assert.deepEqual(d.futureKey, { from: 'a later version' }, 'run ' + i + ': the dump kept its unknown key');
    const s = d.mmLinks.find(l => l.id === 5);
    assert.equal(s.restoredFromMmId, 3, 'run ' + i + ': the section kept restoredFromMmId');
  });
});

test('every writer is total over damaged input', () => {
  const junk = [null, undefined, 5, 'x', {}, [null], [{ id: 'd', mmLinks: 'no' }],
    [{ id: 'd', mmLinks: [null, { id: 5, textBlocks: 'no', links: 7 }] }]];
  for (const j of junk) {
    assert.doesNotThrow(() => {
      SD.withEntry(j, { id: 'n', title: 'x', parentId: null, createdAt: 'x' });
      SD.withEntry(j, { id: 'n', title: 'x', parentId: 'd', createdAt: 'x' });
      SD.withoutEntry(j, 'd');
      SD.withTitle(j, 'd', 'x');
      SD.withMMLink(j, 'd', 10, 'l');
      SD.withoutMMLink(j, 'd', 5);
      SD.withURLLink(j, 'd', 5, { url: 'https://x.test' }, 'u');
      SD.withoutURLLink(j, 'd', 5, 1);
      SD.withTextBlock(j, 'd', 5, { explanation: 'x' }, 'b');
      SD.withoutTextBlock(j, 'd', 5, 1);
      SD.transferTextBlock(j, 'd', 5, 1, 11, 'x');
      SD.transferURLLink(j, 'd', 5, 1, 11, 'x');
      SD.pathTo('d', j);
      SD.inheritsLinks(j, 'd');
    }, 'input ' + JSON.stringify(j));
  }
  assert.equal(SD.withTitle('not a list', 'd', 'x'), 'not a list', 'a non-list comes back as it came');
});

test('a write that lands is a NEW list; the input is never mutated', () => {
  // LIST() is deep-frozen, so a mutating writer would already have thrown in
  // every case above. This one makes the claim explicit for the biggest one.
  const L = LIST();
  const snapshot = JSON.stringify(L);
  SD.withEntry(L, { id: 'n', title: 'Sub', parentId: 'd-1', createdAt: 'x' });
  SD.withoutEntry(L, 'd-1');
  assert.equal(JSON.stringify(L), snapshot);
});
