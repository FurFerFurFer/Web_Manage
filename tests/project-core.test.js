/* ── tests/project-core.test.js ────────────────────────────────────────────
   Offline cover for project-core.js — the one definition of which goal a
   documentation page belongs to, and of the sidebar moves that change it.

       node --test tests/project-core.test.js

   Run once by tests/run.js rather than once per timezone: nothing in
   project-core.js constructs a Date. A move's `updatedAt` arrives as a
   PARAMETER (`now`). The structural case below is what says so.

   What is being pinned here, in order of how much it would cost to get wrong:

   1. EVENTS PAGES BEHAVE EXACTLY AS BEFORE. nestPage, arrangePage and
      promotePage replaced three setDocPages updaters in documentations.html.
      Over trees with no `goalId` anywhere, each must return a list deep-equal
      to the verbatim copy below — key order included, since the autosave
      compares JSON strings.

   2. THE TOP PAGE DECIDES. A sub-page belongs to its top page's goal, every
      move that gives a page a parent deletes its own goalId, and arranging
      or promoting inside a goal keeps the page in that goal.

   3. A GOAL THAT GOES AWAY STRANDS NOTHING: its pages are listed as
      detached, never dropped, and the walk up terminates on a parent cycle.

   Fixtures are synthetic, always (AGENTS.md, "Preserve old data").
*/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// runInThisContext, not runInNewContext: a fresh realm would make arrays
// built there fail this realm's deepEqual prototype check.
globalThis.window = globalThis;
const SRC = path.join(__dirname, '..', 'scripts', 'project-core.js');
vm.runInThisContext(fs.readFileSync(SRC, 'utf8'), { filename: 'project-core.js' });
const P = globalThis.TrackProject;

const NOW = 1761700000000;

// ── verbatim copies of what these functions replaced ───────────────────────
// documentations.html at commit 1c111c5: docDescendantIds, and the bodies of
// the setDocPages updaters inside nestPage, arrangePage and promotePageToRoot,
// lifted to take `prev` and with Date.now() replaced by NOW. Do not "tidy"
// them — they are the baseline.

function OLD_docDescendantIds(pages, id) {
  const set = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of pages) if (!set.has(p.id) && set.has(p.parentId)) { set.add(p.id); grew = true; }
  }
  return set;
}

function OLD_nestPage(prev, draggedId, targetId) {
  if (draggedId === targetId) return prev;
  if (OLD_docDescendantIds(prev, draggedId).has(targetId)) return prev;
  const di = prev.findIndex(p => p.id === draggedId);
  if (di < 0 || !prev.some(p => p.id === targetId)) return prev;
  const arr = [...prev];
  const [moved] = arr.splice(di, 1);
  const ti = arr.findIndex(p => p.id === targetId);   // re-find AFTER the removal
  let at = ti;
  for (let i = ti + 1; i < arr.length; i++) if (arr[i].parentId === targetId) at = i;
  arr.splice(at + 1, 0, {...moved, parentId: targetId, updatedAt: NOW});
  return arr;
}

function OLD_arrangePage(prev, draggedId, targetId, insertBefore) {
  if (draggedId === targetId) return prev;
  if (OLD_docDescendantIds(prev, draggedId).has(targetId)) return prev;
  const di = prev.findIndex(p => p.id === draggedId);
  const target = prev.find(p => p.id === targetId);
  if (di < 0 || !target) return prev;
  const arr = [...prev];
  const [moved] = arr.splice(di, 1);
  const ti = arr.findIndex(p => p.id === targetId);   // re-find AFTER the removal
  arr.splice(insertBefore ? ti : ti + 1, 0,
    {...moved, parentId: target.parentId || null, updatedAt: NOW});
  return arr;
}

function OLD_promotePageToRoot(prev, id) {
  const i = prev.findIndex(p => p.id === id);
  if (i < 0 || !prev[i].parentId) return prev;
  const arr = [...prev];
  const [moved] = arr.splice(i, 1);
  arr.push({...moved, parentId: null, updatedAt: NOW});
  return arr;
}

// ── fixtures ───────────────────────────────────────────────────────────────

const page = (id, parentId = null, over = {}) =>
  Object.assign({ id, title: 'Page ' + id, icon: '', parentId, favorite: false,
    createdAt: '2026-10-29', updatedAt: 1, blocks: [] }, over);

// An Events-only tree: two roots, a nested chain, a sibling pair, and one
// page whose parent was deleted (a dangling parentId — a root by the
// sidebar's rule). No goalId anywhere.
const EVENTS = () => [
  page('a'), page('a1', 'a'), page('a2', 'a'), page('a1x', 'a1'),
  page('b'), page('b1', 'b'), page('orphan', 'gone', { futureField: 7 })
];

// A mixed tree: Events pages plus pages attached to two goals, one of them
// with a sub-page, and one page attached to a goal that no longer exists.
const MIXED = () => [
  page('e1'), page('e2'),
  page('p1', null, { goalId: 'g-alpha' }), page('p1a', 'p1'), page('p1aa', 'p1a'),
  page('p2', null, { goalId: 'g-alpha' }),
  page('q1', null, { goalId: 'g-beta' }),
  page('lost', null, { goalId: 'g-deleted' })
];

function deepFreeze(v) {
  if (v && typeof v === 'object') { Object.values(v).forEach(deepFreeze); Object.freeze(v); }
  return v;
}

const ids = list => list.map(p => p.id);

// ── 1. Events pages behave exactly as before ───────────────────────────────

test('EVENTS: nestPage equals the old updater for every pair of pages', () => {
  const tree = deepFreeze(EVENTS());
  for (const d of tree) for (const t of tree) {
    assert.deepEqual(P.nestPage(tree, d.id, t.id, NOW), OLD_nestPage(tree, d.id, t.id), `nest ${d.id} → ${t.id}`);
    assert.equal(JSON.stringify(P.nestPage(tree, d.id, t.id, NOW)), JSON.stringify(OLD_nestPage(tree, d.id, t.id)),
      `nest ${d.id} → ${t.id}, as the JSON the autosave compares`);
  }
});

test('EVENTS: arrangePage equals the old updater for every pair, before and after', () => {
  const tree = deepFreeze(EVENTS());
  for (const before of [true, false]) for (const d of tree) for (const t of tree) {
    const got = P.arrangePage(tree, d.id, t.id, before, NOW);
    const want = OLD_arrangePage(tree, d.id, t.id, before);
    assert.equal(JSON.stringify(got), JSON.stringify(want), `arrange ${d.id} ${before ? 'before' : 'after'} ${t.id}`);
  }
});

test('EVENTS: promotePage equals the old updater for every page', () => {
  const tree = deepFreeze(EVENTS());
  for (const d of tree)
    assert.equal(JSON.stringify(P.promotePage(tree, d.id, NOW)), JSON.stringify(OLD_promotePageToRoot(tree, d.id)), `promote ${d.id}`);
});

test('EVENTS: descendantIds equals the old docDescendantIds for every page', () => {
  const tree = deepFreeze(EVENTS());
  for (const p of tree)
    assert.deepEqual([...P.descendantIds(tree, p.id)].sort(), [...OLD_docDescendantIds(tree, p.id)].sort(), p.id);
});

test('a refused or unknown move returns the SAME list, not a copy', () => {
  const tree = deepFreeze(EVENTS());
  assert.equal(P.nestPage(tree, 'a', 'a1x', NOW), tree, 'into its own subtree');
  assert.equal(P.nestPage(tree, 'a', 'a', NOW), tree, 'onto itself');
  assert.equal(P.nestPage(tree, 'nope', 'a', NOW), tree, 'unknown dragged');
  assert.equal(P.arrangePage(tree, 'a', 'a1', true, NOW), tree, 'beside its own child');
  assert.equal(P.arrangePage(tree, 'a', 'nope', true, NOW), tree, 'unknown target');
  assert.equal(P.promotePage(tree, 'a', NOW), tree, 'already top');
  assert.equal(P.promotePage(tree, 'nope', NOW), tree, 'unknown page');
});

// ── 2. The top page decides ────────────────────────────────────────────────

test('a sub-page belongs to its TOP page\'s goal, however deep', () => {
  const tree = deepFreeze(MIXED());
  assert.equal(P.projectOf(tree, 'p1'), 'g-alpha');
  assert.equal(P.projectOf(tree, 'p1a'), 'g-alpha');
  assert.equal(P.projectOf(tree, 'p1aa'), 'g-alpha');
  assert.equal(P.projectOf(tree, 'q1'), 'g-beta');
  assert.equal(P.projectOf(tree, 'e1'), null, 'an Events page');
  assert.equal(P.projectOf(tree, 'nope'), null, 'an unknown id');
});

test('a goalId stored on a SUB-page is ignored — only the top page is read', () => {
  const tree = deepFreeze([page('top', null, { goalId: 'g-alpha' }), page('sub', 'top', { goalId: 'g-beta' })]);
  assert.equal(P.projectOf(tree, 'sub'), 'g-alpha');
  assert.deepEqual(ids(P.pagesForGoal(tree, 'g-beta')), [], 'the sub-page is not a page of g-beta');
});

test('pagesForGoal lists only the top pages of THAT goal, in stored order', () => {
  const tree = deepFreeze(MIXED());
  assert.deepEqual(ids(P.pagesForGoal(tree, 'g-alpha')), ['p1', 'p2']);
  assert.deepEqual(ids(P.pagesForGoal(tree, 'g-beta')), ['q1']);
  assert.deepEqual(ids(P.pagesForGoal(tree, 'g-none')), []);
  assert.deepEqual(ids(P.pagesForGoal(tree, null)), [], 'no goal is no pages, never every Events page');
  assert.deepEqual(ids(P.pagesForGoal(tree, '')), []);
});

test('eventRoots are the top pages naming no goal — a dangling parent included', () => {
  assert.deepEqual(ids(P.eventRoots(MIXED())), ['e1', 'e2']);
  assert.deepEqual(ids(P.eventRoots(EVENTS())), ['a', 'b', 'orphan']);
});

test('nesting a project top page under an Events page DELETES its goalId', () => {
  const next = P.nestPage(deepFreeze(MIXED()), 'p2', 'e1', NOW);
  const moved = next.find(p => p.id === 'p2');
  assert.equal(Object.prototype.hasOwnProperty.call(moved, 'goalId'), false, 'the key goes, not set to null');
  assert.equal(moved.parentId, 'e1');
  assert.equal(P.projectOf(next, 'p2'), null);
});

test('nesting an Events page under a project page moves it into that goal', () => {
  const next = P.nestPage(deepFreeze(MIXED()), 'e2', 'p1a', NOW);
  assert.equal(P.projectOf(next, 'e2'), 'g-alpha');
  assert.equal(Object.prototype.hasOwnProperty.call(next.find(p => p.id === 'e2'), 'goalId'), false);
});

test('arranging beside a goal\'s TOP page makes the page a top page of that goal', () => {
  const next = P.arrangePage(deepFreeze(MIXED()), 'p1aa', 'p2', true, NOW);
  const moved = next.find(p => p.id === 'p1aa');
  assert.equal(moved.parentId, null);
  assert.equal(moved.goalId, 'g-alpha');
  assert.deepEqual(ids(P.pagesForGoal(next, 'g-alpha')), ['p1', 'p1aa', 'p2']);
});

test('arranging beside an Events top page sends a project page to Events', () => {
  const next = P.arrangePage(deepFreeze(MIXED()), 'q1', 'e1', false, NOW);
  assert.equal(P.projectOf(next, 'q1'), null);
  assert.equal(Object.prototype.hasOwnProperty.call(next.find(p => p.id === 'q1'), 'goalId'), false);
  assert.deepEqual(ids(P.eventRoots(next)), ['e1', 'q1', 'e2']);
});

test('arranging beside a SUB-page gives the page that parent and no goalId', () => {
  const next = P.arrangePage(deepFreeze(MIXED()), 'q1', 'p1aa', true, NOW);
  const moved = next.find(p => p.id === 'q1');
  assert.equal(moved.parentId, 'p1a');
  assert.equal(Object.prototype.hasOwnProperty.call(moved, 'goalId'), false);
  assert.equal(P.projectOf(next, 'q1'), 'g-alpha');
});

test('arranging beside a top page with a DANGLING parent keeps that page\'s goal', () => {
  const tree = deepFreeze([page('t', 'gone', { goalId: 'g-alpha' }), page('x')]);
  const next = P.arrangePage(tree, 'x', 't', false, NOW);
  const moved = next.find(p => p.id === 'x');
  assert.equal(moved.parentId, 'gone', 'the parent is copied as stored, as the sidebar always did');
  assert.equal(moved.goalId, 'g-alpha');
  assert.equal(P.projectOf(next, 'x'), 'g-alpha');
});

test('promoting inside a goal keeps the page IN that goal', () => {
  const next = P.promotePage(deepFreeze(MIXED()), 'p1aa', NOW);
  const moved = next[next.length - 1];
  assert.equal(moved.id, 'p1aa');
  assert.equal(moved.parentId, null);
  assert.equal(moved.goalId, 'g-alpha');
});

test('attachToGoal makes a page, and everything under it, the LAST top page of the goal', () => {
  const tree = deepFreeze([page('e'), page('e-sub', 'e'), page('t', null, { goalId: 'g' })]);
  const next = P.attachToGoal(tree, 'e', 'g', NOW);
  assert.deepEqual(ids(P.pagesForGoal(next, 'g')), ['t', 'e']);
  assert.equal(P.projectOf(next, 'e-sub'), 'g', 'the sub-page comes with it');
  assert.equal(next.find(p => p.id === 'e').updatedAt, NOW);
});

test('attachToGoal lifts a SUB-page out of its parent', () => {
  const next = P.attachToGoal(deepFreeze(MIXED()), 'p1a', 'g-beta', NOW);
  assert.equal(next.find(p => p.id === 'p1a').parentId, null);
  assert.equal(P.projectOf(next, 'p1aa'), 'g-beta');
  assert.equal(P.projectOf(next, 'p1'), 'g-alpha', 'its old parent stays where it was');
});

test('attachToGoal refuses a non-id goal and is a no-op when already attached', () => {
  const tree = deepFreeze(MIXED());
  assert.equal(P.attachToGoal(tree, 'e1', '', NOW), tree);
  assert.equal(P.attachToGoal(tree, 'e1', null, NOW), tree);
  assert.equal(P.attachToGoal(tree, 'e1', { id: 'g' }, NOW), tree);
  assert.equal(P.attachToGoal(tree, 'p1', 'g-alpha', NOW), tree, 'already a top page of that goal');
  assert.equal(P.attachToGoal(tree, 'nope', 'g-alpha', NOW), tree);
});

test('detachToEvents DELETES the key, lifts a sub-page, and is a no-op on an Events top page', () => {
  const tree = deepFreeze(MIXED());
  const a = P.detachToEvents(tree, 'p1', NOW);
  assert.equal(Object.prototype.hasOwnProperty.call(a.find(p => p.id === 'p1'), 'goalId'), false);
  assert.equal(P.projectOf(a, 'p1aa'), null, 'its subtree comes with it');
  const b = P.detachToEvents(tree, 'p1a', NOW);
  assert.equal(b.find(p => p.id === 'p1a').parentId, null);
  assert.equal(P.projectOf(b, 'p1a'), null);
  assert.equal(P.detachToEvents(tree, 'e1', NOW), tree);
  assert.equal(P.detachToEvents(tree, 'nope', NOW), tree);
});

test('every move SPREADS the record — an unknown key survives', () => {
  const tree = deepFreeze([page('a'), page('b', null, { futureField: { deep: [1] }, goalId: 'g' })]);
  for (const next of [P.nestPage(tree, 'b', 'a', NOW), P.arrangePage(tree, 'b', 'a', true, NOW),
                      P.detachToEvents(tree, 'b', NOW), P.attachToGoal(tree, 'b', 'g2', NOW)])
    assert.deepEqual(next.find(p => p.id === 'b').futureField, { deep: [1] });
});

// ── 3. A goal that goes away strands nothing ───────────────────────────────

test('detachedPages lists top pages whose goal is gone, from a Set or a list', () => {
  const tree = deepFreeze(MIXED());
  assert.deepEqual(ids(P.detachedPages(tree, new Set(['g-alpha', 'g-beta']))), ['lost']);
  assert.deepEqual(ids(P.detachedPages(tree, ['g-alpha'])), ['q1', 'lost']);
  assert.deepEqual(ids(P.detachedPages(tree, null)), ['p1', 'p2', 'q1', 'lost'], 'no goals at all: every attached top page');
  assert.equal(tree.length, 8, 'listing deletes nothing');
});

test('a parent CYCLE terminates: neither tab claims a page reached from no root', () => {
  const tree = deepFreeze([page('x', 'y', { goalId: 'g' }), page('y', 'x'), page('z')]);
  assert.equal(P.topOf(tree, 'x'), null);
  assert.equal(P.projectOf(tree, 'y'), null);
  assert.deepEqual(ids(P.eventRoots(tree)), ['z']);
  assert.deepEqual(ids(P.pagesForGoal(tree, 'g')), []);
});

test('ids are compared exactly: 10 is not \'10\', and junk never throws', () => {
  const tree = deepFreeze([page('n', null, { goalId: 10 }), page('s', null, { goalId: '10' })]);
  assert.deepEqual(ids(P.pagesForGoal(tree, 10)), ['n']);
  assert.deepEqual(ids(P.pagesForGoal(tree, '10')), ['s']);
  const junk = [null, 7, 'str', [], { id: 'ok', goalId: '' }, { id: 'nan', goalId: NaN }];
  assert.doesNotThrow(() => {
    P.projectOf(junk, 'ok'); P.pagesForGoal(junk, 'g'); P.eventRoots(junk);
    P.detachedPages(junk, []); P.descendantIds(junk, 'ok');
    P.nestPage(junk, 'ok', 'nan', NOW); P.promotePage(junk, 'ok', NOW);
  });
  assert.deepEqual(ids(P.eventRoots(junk)), ['ok', 'nan'], 'a blank or NaN goalId reads as none');
  assert.equal(P.projectOf('not a list', 'ok'), null);
  assert.equal(P.nestPage('not a list', 'a', 'b', NOW), 'not a list');
});

// ── 4. a page's place on its goal's page ───────────────────────────────────
/* A goal with: two tasks with sub-tasks or none, a milestone block holding a
   task, a sub-goal (its task is the SUB-goal's directory, not this one's), a
   link, and a last task. Ids are strings, as TrackStorage.newId mints them. */
const GOAL = () => ({
  id: 'g', title: 'Goal', toLearn: [], children: [
    { id: 't1', title: 'T1', children: [{ id: 't1a', children: [] }, { id: 't1b', children: [] }] },
    { id: 'm1', taskType: 'milestone', milestoneId: 'mm', children: [{ id: 'tm', children: [] }] },
    { id: 't2', title: 'T2', children: [] },
    { id: 's1', isSubGoal: true, title: 'Sub', children: [{ id: 'st', children: [] }] },
    { id: 'l1', isLink: true, linkedTaskId: 'zz' },
    { id: 't3', title: 'T3', children: [] }
  ]
});
const FOREST = (goal = GOAL()) => [goal, { id: 'g2', title: 'Other', children: [{ id: 'o1', children: [] }] }];
const at = (parentId, afterId) => afterId === undefined ? { parentId } : { parentId, afterId };
// pages of g: pa unplaced, pb after t1, pc inside t1 first, pd after t1b,
// a sub-page of pa, a page of the sub-goal and one of the other goal
const PLACED = () => [
  page('pa', null, { goalId: 'g' }),
  page('pb', null, { goalId: 'g', goalPlace: at('g', 't1') }),
  page('pc', null, { goalId: 'g', goalPlace: at('t1') }),
  page('pd', null, { goalId: 'g', goalPlace: at('t1', 't1b') }),
  page('pa1', 'pa'),
  page('ps', null, { goalId: 's1' }),
  page('po', null, { goalId: 'g2', goalPlace: at('g2', 'o1') })
];
// one list as drawn, as compact ids: a node by its id, a page as "page:id"
const drawn = (pages, goal, parentId) => {
  const node = parentId === goal.id ? goal : P.directoryOf(goal).get(parentId);
  return P.interleave(node.children, P.placesFor(pages, goal).get(parentId) || [])
    .map(it => it.node ? it.node.id : 'page:' + it.page.id);
};

test('PLACE: the directory is the goal and its tasks and milestones — never a sub-goal, a link, or under either', () => {
  assert.deepEqual([...P.directoryOf(GOAL()).keys()].sort(), ['g', 'm1', 't1', 't1a', 't1b', 't2', 't3', 'tm']);
  assert.deepEqual([...P.directoryOf(null).keys()], []);
});

test('PLACE: every page of the goal is drawn once, where its place says, in docPages order', () => {
  const g = GOAL(), pages = deepFreeze(PLACED());
  assert.deepEqual(drawn(pages, g, 'g'), ['page:pa', 't1', 'page:pb', 'm1', 't2', 's1', 'l1', 't3'],
    'unplaced is FIRST in the goal\'s list; after a node is right after it');
  assert.deepEqual(drawn(pages, g, 't1'), ['page:pc', 't1a', 't1b', 'page:pd'], 'inside a task, first or after a sub-task');
  const all = [...P.placesFor(pages, g).values()].flat().map(s => s.page.id).sort();
  assert.deepEqual(all, ['pa', 'pb', 'pc', 'pd'], 'not a sub-page, not the sub-goal\'s page, not another goal\'s');
});

test('PLACE: a place that no longer resolves is READ as a top, never dropped', () => {
  const g = GOAL();
  const pages = [
    page('x1', null, { goalId: 'g', goalPlace: at('st') }),             // a task of the SUB-goal
    page('x2', null, { goalId: 'g', goalPlace: at('gone', 't1') }),     // a deleted parent
    page('x3', null, { goalId: 'g', goalPlace: at('t1', 'gone') }),     // a deleted anchor
    page('x4', null, { goalId: 'g', goalPlace: 'junk' }),
    page('x5', null, { goalId: 'g', goalPlace: { parentId: '', afterId: 't1' } }),
    page('x6', null, { goalId: 'g', goalPlace: at('g', 's1') })          // after the sub-goal row: legal
  ];
  assert.deepEqual(drawn(pages, g, 'g'), ['page:x1', 'page:x2', 'page:x4', 'page:x5', 't1', 'm1', 't2', 's1', 'page:x6', 'l1', 't3']);
  assert.deepEqual(drawn(pages, g, 't1'), ['page:x3', 't1a', 't1b'], 'a lost anchor is first in ITS list');
  assert.equal(pages[2].goalPlace.afterId, 'gone', 'and nothing was rewritten on read');
});

test('PLACE: interleave takes an anchor repeated among the children once, and junk never throws', () => {
  const kids = [{ id: 'a' }, null, { id: 'a' }, { id: 'b' }];
  const got = P.interleave(kids, [{ page: { id: 'p' }, afterId: 'a' }, { page: { id: 'q' }, afterId: 'nope' }, null, { afterId: 'b' }]);
  assert.deepEqual(got.map(it => it.node ? it.node.id : 'page:' + it.page.id), ['page:q', 'a', 'page:p', 'a', 'b']);
  assert.doesNotThrow(() => {
    P.interleave('x', 'y'); P.placesFor('x', null); P.placesFor([null, 7], GOAL());
    P.movePageTo('x', 'p', GOAL(), {}, NOW); P.healPlaces('x', null, null, null, NOW);
    P.healPlaces([page('z', null, { goalId: 'g', goalPlace: at('t1') })], 'x', 7, 'y', NOW);
  });
});

test('PLACE: moving to the top of the goal DELETES the key; afterId is absent, never null', () => {
  const g = GOAL(), pages = deepFreeze(PLACED());
  const top = P.movePageTo(pages, 'pb', g, { parentId: 'g', afterId: null, at: 'last' }, NOW);
  const pb = top.find(p => p.id === 'pb');
  assert.equal(Object.prototype.hasOwnProperty.call(pb, 'goalPlace'), false);
  assert.equal(pb.updatedAt, NOW);
  const inT2 = P.movePageTo(pages, 'pa', g, { parentId: 't2', afterId: null, at: 'last' }, NOW).find(p => p.id === 'pa');
  assert.deepEqual(inT2.goalPlace, { parentId: 't2' }, 'first inside a leaf task: no afterId key at all');
});

test('PLACE: a move lands exactly where it is dropped — first or last among the links there, or beside one', () => {
  const g = GOAL();
  const pages = deepFreeze([
    page('pa', null, { goalId: 'g', goalPlace: at('g', 't1') }),
    page('pb', null, { goalId: 'g', goalPlace: at('g', 't1') }),
    page('pz', null, { goalId: 'g', goalPlace: at('g', 't3') })
  ]);
  assert.deepEqual(drawn(pages, g, 'g'), ['t1', 'page:pa', 'page:pb', 'm1', 't2', 's1', 'l1', 't3', 'page:pz']);
  const first = P.movePageTo(pages, 'pz', g, { parentId: 'g', afterId: 't1', at: 'first' }, NOW);
  assert.deepEqual(drawn(first, g, 'g'), ['t1', 'page:pz', 'page:pa', 'page:pb', 'm1', 't2', 's1', 'l1', 't3']);
  const last = P.movePageTo(pages, 'pz', g, { parentId: 'g', afterId: 't1', at: 'last' }, NOW);
  assert.deepEqual(drawn(last, g, 'g'), ['t1', 'page:pa', 'page:pb', 'page:pz', 'm1', 't2', 's1', 'l1', 't3']);
  const between = P.movePageTo(pages, 'pz', g, { pageId: 'pb', before: true }, NOW);
  assert.deepEqual(drawn(between, g, 'g'), ['t1', 'page:pa', 'page:pz', 'page:pb', 'm1', 't2', 's1', 'l1', 't3']);
  assert.deepEqual(between.find(p => p.id === 'pz').goalPlace, at('g', 't1'), 'beside a link is that link\'s place');
  const after = P.movePageTo(pages, 'pa', g, { pageId: 'pb', before: false }, NOW);
  assert.deepEqual(drawn(after, g, 'g'), ['t1', 'page:pb', 'page:pa', 'm1', 't2', 's1', 'l1', 't3', 'page:pz']);
  const subgoalRow = P.movePageTo(pages, 'pa', g, { parentId: 'g', afterId: 's1', at: 'last' }, NOW);
  assert.deepEqual(drawn(subgoalRow, g, 'g'), ['t1', 'page:pb', 'm1', 't2', 's1', 'page:pa', 'l1', 't3', 'page:pz'],
    'after a sub-goal row is a place like any other');
});

test('PLACE: a move that would not change the drawing returns the SAME list', () => {
  const g = GOAL(), pages = deepFreeze(PLACED());
  assert.equal(P.movePageTo(pages, 'pb', g, { parentId: 'g', afterId: 't1', at: 'last' }, NOW), pages, 'already there');
  assert.equal(P.movePageTo(pages, 'pa', g, { parentId: 'g', afterId: null, at: 'first' }, NOW), pages, 'already first');
  assert.equal(P.movePageTo(pages, 'pb', g, { pageId: 'pb', before: true }, NOW), pages, 'beside itself');
});

test('PLACE: a move is refused — SAME list — outside the goal\'s own directory or for a page not its own', () => {
  const g = GOAL(), pages = deepFreeze(PLACED());
  const refuse = (id, target, why) => assert.equal(P.movePageTo(pages, id, g, target, NOW), pages, why);
  refuse('pa', { parentId: 's1', afterId: null }, 'into a sub-goal: that is attaching, not placing');
  refuse('pa', { parentId: 'st', afterId: null }, 'into a sub-goal\'s task');
  refuse('pa', { parentId: 'l1', afterId: null }, 'into a link');
  refuse('pa', { parentId: 'g', afterId: 'st' }, 'an anchor that is not a child of the list');
  refuse('pa', { parentId: 'nope' }, 'an unknown list');
  refuse('pa1', { parentId: 'g', afterId: 't1' }, 'a SUB-page is never placed');
  refuse('ps', { parentId: 'g', afterId: 't1' }, 'the sub-goal\'s page is not this goal\'s');
  refuse('po', { parentId: 'g', afterId: 't1' }, 'nor is another goal\'s');
  refuse('pa', { pageId: 'po', before: true }, 'beside another goal\'s link');
  refuse('nope', { parentId: 'g', afterId: 't1' }, 'an unknown page');
  assert.equal(P.movePageTo(pages, 'pa', { id: 'g2', children: [] }, { parentId: 'g2' }, NOW), pages, 'the wrong goal');
});

test('PLACE: a move SPREADS the record — an unknown key survives', () => {
  const g = GOAL();
  const pages = deepFreeze([page('pa', null, { goalId: 'g', futureField: { k: 1 } })]);
  const pa = P.movePageTo(pages, 'pa', g, { parentId: 't1', afterId: 't1a' }, NOW)[0];
  assert.deepEqual(pa.futureField, { k: 1 });
  assert.deepEqual(pa.goalPlace, at('t1', 't1a'));
});

test('PLACE: the place belongs to the goal — every move to another goal or under a page deletes it', () => {
  const pages = deepFreeze([
    page('pa', null, { goalId: 'g', goalPlace: at('t1') }),
    page('pb', null, { goalId: 'g', goalPlace: at('g', 't2') }),
    page('pq', null, { goalId: 'g2' })
  ]);
  const has = (list, id) => Object.prototype.hasOwnProperty.call(list.find(p => p.id === id), 'goalPlace');
  assert.equal(has(P.attachToGoal(pages, 'pa', 'g2', NOW), 'pa'), false, 'attached to another goal');
  assert.equal(has(P.nestPage(pages, 'pa', 'pb', NOW), 'pa'), false, 'made a sub-page');
  assert.equal(has(P.detachToEvents(pages, 'pa', NOW), 'pa'), false, 'sent to Events');
  assert.equal(has(P.arrangePage(pages, 'pa', 'pq', true, NOW), 'pa'), false, 'arranged beside another goal\'s page');
  assert.equal(has(P.arrangePage(pages, 'pa', 'pb', false, NOW), 'pa'), true, 'arranged among its OWN goal\'s pages: kept');
});

test('HEAL: a link whose anchor is deleted stands after the nearest sibling that is still there', () => {
  const before = FOREST();
  const g = JSON.parse(JSON.stringify(before[0]));
  g.children = g.children.filter(c => c.id !== 't2' && c.id !== 'm1');     // delete t2 AND the m1 before it
  const pages = deepFreeze([page('pa', null, { goalId: 'g', goalPlace: at('g', 't2') })]);
  const out = P.healPlaces(pages, before, [g, before[1]], [], NOW);
  assert.deepEqual(out[0].goalPlace, at('g', 't1'));
  assert.equal(out[0].updatedAt, NOW);
});

test('HEAL: a link does not follow a node that was MOVED — it stays between the nodes around it', () => {
  const before = FOREST();
  const g = JSON.parse(JSON.stringify(before[0]));
  const [t1, m1, ...rest] = g.children;
  g.children = [m1, ...rest, t1];                                          // t1 dragged to the end
  const pages = deepFreeze([page('pa', null, { goalId: 'g', goalPlace: at('g', 't1') }),
    page('pb', null, { goalId: 'g', goalPlace: at('g', 't2') })]);
  const out = P.healPlaces(pages, before, [g, before[1]], ['t1'], NOW);
  assert.equal(Object.prototype.hasOwnProperty.call(out[0], 'goalPlace'), false, 't1 was first: the link is now first');
  assert.equal(out[1], pages[1], 'a link after a node that did NOT move is untouched');
  assert.equal(P.healPlaces(pages, before, [g, before[1]], [], NOW)[0], pages[0],
    'without `moved` the same tree reads as t1 still in the list: the link follows it');
});

test('HEAL: a link INSIDE a node goes with it, and a link in a list that left the goal stands where it stood', () => {
  const before = FOREST();
  const pages = deepFreeze([page('in', null, { goalId: 'g', goalPlace: at('t1', 't1a') })]);
  // t1 nested into t3 — still in the goal's directory: its content goes with it
  const g = JSON.parse(JSON.stringify(before[0]));
  const t1 = g.children.shift();
  g.children[g.children.length - 1].children.push(t1);
  assert.equal(P.healPlaces(pages, before, [g, before[1]], ['t1'], NOW), pages, 'unchanged: it moved with t1');
  // t1 deleted: its link stands where t1 stood, which was first
  const gone = JSON.parse(JSON.stringify(before[0]));
  gone.children = gone.children.filter(c => c.id !== 't1');
  assert.equal(Object.prototype.hasOwnProperty.call(P.healPlaces(pages, before, [gone, before[1]], [], NOW)[0], 'goalPlace'), false);
  // t2 moved INTO the sub-goal: a link inside it climbs to where t2 stood
  const p2 = deepFreeze([page('in2', null, { goalId: 'g', goalPlace: at('t2') })]);
  const sub = JSON.parse(JSON.stringify(before[0]));
  const t2 = sub.children.splice(2, 1)[0];
  sub.children.find(c => c.id === 's1').children.push(t2);
  assert.deepEqual(P.healPlaces(p2, before, [sub, before[1]], ['t2'], NOW)[0].goalPlace, at('g', 'm1'));
});

test('HEAL: nothing to heal returns the SAME list; a Detached page and an unplaced page are never written', () => {
  const before = FOREST();
  const pages = deepFreeze(PLACED().concat([page('lost', null, { goalId: 'g-gone', goalPlace: at('x', 'y') })]));
  assert.equal(P.healPlaces(pages, before, FOREST(), [], NOW), pages, 'an equal tree');
  const noGoal = [before[1]];
  assert.equal(P.healPlaces(pages, before, noGoal, [], NOW), pages, 'the goal itself deleted: its pages are Detached, left as stored');
});

test('PLACE: a drop that leaves the drawing as it was writes nothing — whatever the array indices say', () => {
  const g = GOAL();
  // pp and pq both follow t1, with px (after t2) BETWEEN them in docPages
  const pages = deepFreeze([
    page('pp', null, { goalId: 'g', goalPlace: at('g', 't1') }),
    page('px', null, { goalId: 'g', goalPlace: at('g', 't2') }),
    page('pq', null, { goalId: 'g', goalPlace: at('g', 't1') })
  ]);
  assert.deepEqual(drawn(pages, g, 'g'), ['t1', 'page:pp', 'page:pq', 'm1', 't2', 'page:px', 's1', 'l1', 't3']);
  const same = (id, target, why) => assert.equal(P.movePageTo(pages, id, g, target, NOW), pages, why);
  same('pq', { parentId: 'g', afterId: 't1', at: 'last' }, 'already last after t1');
  same('pp', { parentId: 'g', afterId: 't1', at: 'first' }, 'already first after t1');
  same('pq', { pageId: 'pp', before: false }, 'already right after pp');
  same('pp', { pageId: 'pq', before: true }, 'already right before pq');
  const real = P.movePageTo(pages, 'pq', g, { parentId: 'g', afterId: 't1', at: 'first' }, NOW);
  assert.deepEqual(drawn(real, g, 'g').slice(0, 3), ['t1', 'page:pq', 'page:pp'], 'a real move still moves');
});

test('HEAL: a node named as moved that still stands where it stood has not moved — its link stays with it', () => {
  const before = FOREST();
  const g = JSON.parse(JSON.stringify(before[0]));        // ⇅ t2 dropped where it already stood: new arrays, same tree
  const pages = deepFreeze([page('pa', null, { goalId: 'g', goalPlace: at('g', 't2') })]);
  assert.equal(P.healPlaces(pages, before, [g, before[1]], ['t2'], NOW), pages);
});

test('HEAL: links that come to share one spot keep the order they were drawn in', () => {
  const before = FOREST();
  const g = JSON.parse(JSON.stringify(before[0]));
  g.children = g.children.filter(c => c.id !== 'm1');     // delete the milestone between t1 and t2
  // stored pq BEFORE pp, and pi inside the milestone's task: drawn t1, pp, m1, tm, pi, pq
  const pages = deepFreeze([
    page('pq', null, { goalId: 'g', goalPlace: at('g', 'm1') }),
    page('pp', null, { goalId: 'g', goalPlace: at('g', 't1') }),
    page('pi', null, { goalId: 'g', goalPlace: at('tm') })
  ]);
  const out = P.healPlaces(pages, before, [g, before[1]], [], NOW);
  assert.deepEqual(drawn(out, g, 'g').slice(0, 5), ['t1', 'page:pp', 'page:pi', 'page:pq', 't2'],
    'all three now follow t1, in the order they stood on the page');
  assert.equal(out.find(p => p.id === 'pp'), pages[1], 'the link that did not move is the same record');
});

// ── structural ─────────────────────────────────────────────────────────────

test('the module constructs no Date, which is why its suite is not swept', () => {
  // Comments stripped first: the header explains that `updatedAt` is a
  // parameter, and a scan that read the prose would fail on the explanation.
  const src = fs.readFileSync(SRC, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.equal(/new Date|Date\.now|getDay\(|toISOString|getTimezoneOffset/.test(src), false,
    'project-core.js must take time as a parameter');
});
