/* ── tests/quest-core.test.js ──────────────────────────────────────────────
   Offline cover for quest-core.js — the one definition of what a Quest is.

       node --test tests/quest-core.test.js

   Run once by tests/run.js rather than once per timezone, and that is a claim
   about the module rather than a convenience: nothing in quest-core.js
   constructs a Date. The routine-tick day arrives as a PARAMETER, computed by
   the page with its own local-day helper. If a `new Date()` ever appears in
   quest-core.js, this suite has moved to the wrong list — the structural case
   below is what says so. Same reasoning as doc-table-core.test.js,
   graph-layout.test.js and schedule-paste-core.test.js.

   What is being pinned here, in order of how much it would cost to get wrong:

   1. The flags TRAVEL with toLearn. learnFlagsOf/withoutLearnFlags exist for
      the three sites in progress.html that move a parent's toLearn into a new
      sub-goal. Miss them and questLearnOf's membership gate makes the quest
      DISAPPEAR — a curated entry lost as a side effect of an unrelated edit,
      with no error anywhere.

   2. Un-questing is a RESTORE, not a recomputed guess. isStarred gates on
      quest membership, so un-questing suppresses the star and deletes nothing.
      A writer that "tidied" `star` would destroy the thing re-questing puts
      back — the mistake `cautionDates` already documents.

   3. Booleans write false; lists delete when they empty. Two different rules
      on purpose, and a change that made them uniform would break one of them.

   4. starRollup emits ONE row for a starred parent. "Include all children but
      only show the parent" is the whole rule, and it is one `return`.

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
// Array.isArray, and a fresh realm would make arrays built here fail it —
// quietly testing something the browser never does.
globalThis.window = globalThis;
const SRC = path.join(__dirname, '..', 'scripts', 'quest-core.js');
vm.runInThisContext(fs.readFileSync(SRC, 'utf8'), { filename: 'quest-core.js' });
const Q = globalThis.TrackQuest;

// ── fixtures ───────────────────────────────────────────────────────────────

const node = (id, extra) => Object.assign({
  id, title: id, children: [], completed: false, createdAt: 1, scheduledDate: null
}, extra || {});

const MMS = [
  { id: 'mm1', name: 'Harmony', parentIds: [] },
  { id: 'mm2', name: 'Rhythm', parentIds: ['mm1'] }
];

// Real mind-map ids are NUMBERS — sir-ks02.html mints them from a nid() counter,
// while a goal node's id is a string from TrackStorage.newId(). The string ids
// above are convenient for reading, but a suite that only ever used them would
// pass against a module that dropped every real toLearn entry. These fixtures
// are the ones that match production.
const NUM_MMS = [
  { id: 10, name: 'Mind Map A', parentIds: [] },
  { id: 11, name: 'Mind Map B', parentIds: [10] }
];

// ── module surface ─────────────────────────────────────────────────────────

test('the module exports exactly the documented surface', () => {
  // Written out by hand on purpose: if an export is added or renamed, this is
  // the case that notices, the same way tests/schema.test.js pins SLOT_FIELDS.
  assert.deepEqual(Object.keys(Q).sort(), [
    'KEYS', 'ROUTINE_TICK_KEY', 'countQuests', 'isMilestoneNode', 'isQuest',
    'isStarred', 'learnFlagsOf', 'questLearnOf', 'questOrderOf', 'questTree',
    'reorderIds', 'routineTicks', 'starLearnOf', 'starRollup', 'toLearnOf',
    'withQuest', 'withQuestLearn', 'withQuestOrder', 'withRoutineTick',
    'withStar', 'withStarLearn', 'withoutLearnFlags', 'withoutLearnIds'
  ].sort());
  assert.deepEqual(Q.KEYS, ['quest', 'star', 'questLearn', 'starLearn', 'questOrder']);
});

test('the module constructs no Date, which is why its suite is not swept', () => {
  // A structural check, not a behavioural one. The sweep decision in
  // tests/run.js rests on this file having no date arithmetic; if that stops
  // being true, this case is the thing that says so.
  // Comments are stripped first: this file's own prose explains at length why
  // it constructs no Date, and a check that read the prose would fail on the
  // explanation rather than on the code.
  const src = fs.readFileSync(SRC, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  assert.equal(/new Date|Date\.now|getDay\(|toISOString|getTimezoneOffset/.test(src), false,
    'quest-core.js must hold no date code — move its suite to OFFLINE_FILES if it does');
});

test('the module touches no storage', () => {
  const src = fs.readFileSync(SRC, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  assert.equal(/localStorage|sessionStorage|indexedDB/.test(src), false,
    'quest-core.js is a pure data module — the pages own persistence');
});

// ── membership ─────────────────────────────────────────────────────────────

test('isQuest reads absent, false and true as two states', () => {
  assert.equal(Q.isQuest(node('a')), false);
  assert.equal(Q.isQuest(node('a', { quest: false })), false);
  assert.equal(Q.isQuest(node('a', { quest: true })), true);
});

test('isStarred gates on quest membership, and the star stays DORMANT', () => {
  // The load-bearing case for "un-questing is a restore". A node carrying a
  // star but no quest reads as not starred — and the node is UNCHANGED, so
  // re-questing puts the star back exactly as the user left it.
  const dormant = node('a', { quest: false, star: true });
  assert.equal(Q.isStarred(dormant), false);
  assert.equal(dormant.star, true, 'the star was suppressed, not cleared');
  assert.equal(Q.isStarred(node('a', { quest: true, star: true })), true);
});

test('questLearnOf drops an id absent from toLearn, dedupes, and keeps toLearn order', () => {
  const n = node('a', { toLearn: ['mm2', 'mm1'], questLearn: ['mm1', 'nope', 'mm1', 'mm2'] });
  assert.deepEqual(Q.questLearnOf(n), ['mm2', 'mm1']);
});

test('starLearnOf is a subset of questLearnOf', () => {
  const n = node('a', {
    toLearn: ['mm1', 'mm2'], questLearn: ['mm1'], starLearn: ['mm1', 'mm2']
  });
  assert.deepEqual(Q.starLearnOf(n), ['mm1'], 'mm2 is starred but not a quest');
});

test('every reader is total against malformed values', () => {
  // The claim that pays for these keys being absent from schema.js. A reader
  // that can throw would take a React render down with it.
  for (const bad of [null, undefined, 42, 'nope', [], { toLearn: 'nope' },
    { toLearn: ['mm1'], questLearn: 'nope' }, { toLearn: ['mm1'], questLearn: [null, 7] },
    { toLearn: [null, 7, 'mm1'], questLearn: ['mm1'], starLearn: 42 }]) {
    assert.doesNotThrow(() => {
      Q.isQuest(bad); Q.isStarred(bad); Q.toLearnOf(bad);
      Q.questLearnOf(bad); Q.starLearnOf(bad); Q.learnFlagsOf(bad);
    }, 'reader threw on ' + JSON.stringify(bad));
  }
  assert.deepEqual(Q.questLearnOf({ toLearn: [null, 7, 'mm1'], questLearn: ['mm1'] }), ['mm1']);
});

test('NUMERIC mind-map ids survive every reader and writer', () => {
  // The regression this exists for: a string-only id test drops every real
  // toLearn entry, and the whole feature reads as "no quests" with no error
  // anywhere. String fixtures cannot see it.
  const n = node('g', { toLearn: [10, 11], questLearn: [10], starLearn: [10] });
  assert.deepEqual(Q.toLearnOf(n), [10, 11]);
  assert.deepEqual(Q.questLearnOf(n), [10]);
  assert.deepEqual(Q.starLearnOf(n), [10]);
  assert.deepEqual(Q.learnFlagsOf(n), { questLearn: [10], starLearn: [10] });

  const rows = Q.questTree([n], NUM_MMS)[0].learn;
  assert.deepEqual(rows.map(r => r.mmId), [10]);
  assert.equal(rows[0].mm.name, 'Mind Map A', 'the mm resolved by its numeric id');

  const added = Q.withQuestLearn([n], 'g', 11, true);
  assert.deepEqual(added[0].questLearn, [10, 11]);
  const gone = Q.withQuestLearn(Q.withQuestLearn(added, 'g', 10, false), 'g', 11, false);
  assert.equal('questLearn' in gone[0], false, 'still deletes when it empties');
});

test('NUMERIC ids work through starRollup too', () => {
  const goals = [node('g', { toLearn: [10], questLearn: [10], starLearn: [10] })];
  const rows = Q.starRollup(goals, NUM_MMS);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].mmId, 10);
  assert.equal(rows[0].mm.name, 'Mind Map A');
});

test('countQuests counts nodes, learns and stars across the tree', () => {
  const goals = [node('g', {
    quest: true, star: true, toLearn: ['mm1'], questLearn: ['mm1'], starLearn: ['mm1'],
    children: [node('t1', { quest: true }), node('t2')]
  })];
  assert.deepEqual(Q.countQuests(goals), { nodes: 2, learn: 1, starred: 2 });
});

// ── writers: the two boolean rules ─────────────────────────────────────────

test('withQuest(false) writes false and does NOT delete the key', () => {
  // This repo's rule for a boolean read through `!!`: absent, false and
  // undefined are one state, so there is no third state to protect. `done` and
  // `blockOff` both write false. A change to delete-on-clear here would be a
  // deliberate divergence and needs its own argument.
  const goals = [node('a', { quest: true })];
  const out = Q.withQuest(goals, 'a', false);
  assert.equal(out[0].quest, false);
  assert.ok('quest' in out[0], 'the key is still present');
});

test('withQuest NEVER touches star, so the star survives to be restored', () => {
  const goals = [node('a', { quest: true, star: true })];
  const off = Q.withQuest(goals, 'a', false);
  assert.equal(off[0].star, true, 'the star is dormant, not cleared');
  assert.equal(Q.isStarred(off[0]), false);
  const on = Q.withQuest(off, 'a', true);
  assert.equal(Q.isStarred(on[0]), true, 're-questing RESTORED the star');
});

test('withStar refuses a non-quest and returns the ORIGINAL array', () => {
  const goals = [node('a')];
  const out = Q.withStar(goals, 'a', true);
  assert.equal(out, goals, 'nothing changed, so the caller can skip the write');
  assert.equal(Q.isStarred(out[0]), false);
});

test('a no-op write returns the ORIGINAL array by identity', () => {
  const goals = [node('a', { quest: true })];
  assert.equal(Q.withQuest(goals, 'a', true), goals);
  assert.equal(Q.withQuest(goals, 'missing', true), goals);
});

// ── writers: the two list rules ────────────────────────────────────────────

test('withQuestLearn DELETES the key when the last id goes', () => {
  // The opposite rule from the booleans, and deliberately so: nothing sits
  // behind these lists as a fallback, so absence is the default — the merges /
  // colWidths / align rule. Object.keys is asserted exactly because that is the
  // only thing that can see the difference between [] and no key.
  const goals = [node('a', { toLearn: ['mm1'], questLearn: ['mm1'] })];
  const out = Q.withQuestLearn(goals, 'a', 'mm1', false);
  assert.equal('questLearn' in out[0], false);
  assert.deepEqual(Object.keys(out[0]).sort(),
    ['children', 'completed', 'createdAt', 'id', 'scheduledDate', 'title', 'toLearn'].sort());
});

test('withQuestLearn refuses an mm the node does not link', () => {
  const goals = [node('a', { toLearn: ['mm1'] })];
  assert.equal(Q.withQuestLearn(goals, 'a', 'mm9', true), goals);
});

test('withQuestLearn stores in toLearn order regardless of pick order', () => {
  let goals = [node('a', { toLearn: ['mm1', 'mm2'] })];
  goals = Q.withQuestLearn(goals, 'a', 'mm2', true);
  goals = Q.withQuestLearn(goals, 'a', 'mm1', true);
  assert.deepEqual(goals[0].questLearn, ['mm1', 'mm2']);
});

test('withStarLearn refuses an mm that is not already a quest', () => {
  const goals = [node('a', { toLearn: ['mm1'] })];
  assert.equal(Q.withStarLearn(goals, 'a', 'mm1', true), goals);
});

test('un-questing a learn leaves starLearn dormant, and re-questing restores it', () => {
  let goals = [node('a', {
    toLearn: ['mm1'], questLearn: ['mm1'], starLearn: ['mm1']
  })];
  goals = Q.withQuestLearn(goals, 'a', 'mm1', false);
  assert.deepEqual(goals[0].starLearn, ['mm1'], 'suppressed, not cleared');
  assert.deepEqual(Q.starLearnOf(goals[0]), []);
  goals = Q.withQuestLearn(goals, 'a', 'mm1', true);
  assert.deepEqual(Q.starLearnOf(goals[0]), ['mm1'], 're-questing RESTORED the star');
});

test('withoutLearnIds prunes both lists and deletes each as it empties', () => {
  const goals = [node('a', {
    toLearn: ['mm1', 'mm2'], questLearn: ['mm1', 'mm2'], starLearn: ['mm2']
  })];
  const out = Q.withoutLearnIds(goals, 'a', ['mm2']);
  assert.deepEqual(out[0].questLearn, ['mm1']);
  assert.equal('starLearn' in out[0], false, 'starLearn emptied, so the key went');
});

// ── the transfer helpers ───────────────────────────────────────────────────

test('learnFlagsOf omits an empty key so the delete rule has one home', () => {
  assert.deepEqual(Q.learnFlagsOf(node('a')), {});
  assert.deepEqual(
    Q.learnFlagsOf(node('a', { toLearn: ['mm1'], questLearn: ['mm1'] })),
    { questLearn: ['mm1'] });
  assert.deepEqual(
    Q.learnFlagsOf(node('a', { toLearn: ['mm1'], questLearn: ['mm1'], starLearn: ['mm1'] })),
    { questLearn: ['mm1'], starLearn: ['mm1'] });
});

test('withoutLearnFlags deletes both keys and preserves every other one', () => {
  const n = node('a', {
    toLearn: ['mm1'], mmTargets: { mm1: {} }, milestones: [], notes: [{ id: 'n1' }],
    questLearn: ['mm1'], starLearn: ['mm1']
  });
  const out = Q.withoutLearnFlags(n);
  assert.equal('questLearn' in out, false);
  assert.equal('starLearn' in out, false);
  assert.deepEqual(out.toLearn, ['mm1']);
  assert.deepEqual(out.mmTargets, { mm1: {} });
  assert.deepEqual(out.notes, [{ id: 'n1' }]);

  // A node carrying neither key comes back by IDENTITY, so the three transfer
  // sites can call this unconditionally without churning objects React would
  // then have to re-render.
  const plain = node('a');
  assert.equal(Q.withoutLearnFlags(plain), plain);
});

test('GUARD: the transfer round-trips a parent into a child with nothing lost', () => {
  // The exact shape of the three sites in progress.html. This is the case that
  // would have caught the silent quest loss.
  const parent = node('p', {
    toLearn: ['mm1', 'mm2'], mmTargets: { mm1: {} }, milestones: [{ id: 'ms1' }],
    questLearn: ['mm1'], starLearn: ['mm1']
  });
  const sub = Object.assign(
    node('s', { isSubGoal: true, toLearn: [...parent.toLearn], mmTargets: parent.mmTargets,
      milestones: parent.milestones }),
    Q.learnFlagsOf(parent));
  const blanked = Object.assign(Q.withoutLearnFlags(parent),
    { toLearn: [], mmTargets: {}, milestones: [] });

  assert.deepEqual(Q.questLearnOf(sub), ['mm1'], 'the quest arrived on the sub-goal');
  assert.deepEqual(Q.starLearnOf(sub), ['mm1'], 'and so did its star');
  assert.deepEqual(Q.questLearnOf(blanked), [], 'and left no ghost on the parent');
  assert.equal('questLearn' in blanked, false);
  assert.equal('starLearn' in blanked, false);
});

// ── questTree ──────────────────────────────────────────────────────────────

test('prune keeps a non-quest ANCESTOR of a quest and drops a questless branch', () => {
  const goals = [
    node('g1', { children: [node('t1', { quest: true }), node('t2')] }),
    node('g2', { children: [node('t3')] })
  ];
  const tree = Q.questTree(goals, MMS);
  assert.equal(tree.length, 1, 'the questless goal is gone');
  assert.equal(tree[0].node.id, 'g1');
  assert.equal(tree[0].quest, false, 'the ancestor is context, not a quest');
  assert.equal(tree[0].hasQuestBelow, true);
  assert.deepEqual(tree[0].children.map(c => c.node.id), ['t1'],
    'the questless sibling is gone too');
});

test('prune:false returns the whole tree, for the picker', () => {
  const goals = [node('g1', { children: [node('t1'), node('t2')] })];
  const tree = Q.questTree(goals, MMS, { prune: false });
  assert.deepEqual(tree[0].children.map(c => c.node.id), ['t1', 't2']);
});

test('a link node is skipped: an alias owns nothing', () => {
  const goals = [node('g', {
    quest: true,
    children: [{ id: 'l1', isLink: true, linkedTaskId: 't1' }, node('t9', { quest: true })]
  })];
  assert.deepEqual(Q.questTree(goals, MMS)[0].children.map(c => c.node.id), ['t9']);
});

test('a milestone node is OMITTED and its children promoted one level', () => {
  const goals = [node('g', {
    children: [node('ms', {
      taskType: 'milestone', milestoneId: 'm1',
      children: [node('t1', { quest: true })]
    })]
  })];
  const tree = Q.questTree(goals, MMS);
  assert.deepEqual(tree[0].children.map(c => c.node.id), ['t1'],
    'the milestone row is gone but its real task survived');
  assert.equal(tree[0].children[0].depth, 1, 'promoted to the milestone node\'s own depth');
});

test('a quest to-learn whose mind map was deleted still appears, as removed', () => {
  // The two fields belong to different pages: KS02 owns mms, progress.html owns
  // toLearn. Dropping the row would make it unreachable, and this project does
  // not trade reachability for a tidier rule.
  const goals = [node('g', { toLearn: ['gone'], questLearn: ['gone'] })];
  const rows = Q.questTree(goals, MMS)[0].learn;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].mmId, 'gone');
  assert.equal(rows[0].mm, null, 'renders as "mind map removed"');
});

test('a branch kept only by a quest TO-LEARN survives the prune', () => {
  // A goal whose only quest content is a linked mind map has no quest node
  // anywhere beneath it. It must still be in the tree.
  const goals = [node('g', { toLearn: ['mm1'], questLearn: ['mm1'] })];
  const tree = Q.questTree(goals, MMS);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].quest, false);
  assert.deepEqual(tree[0].learn.map(l => l.mmId), ['mm1']);
});

test('a goals cycle terminates instead of blowing the stack', () => {
  const a = node('a', { quest: true });
  const b = node('b', { quest: true });
  a.children = [b];
  b.children = [a];
  assert.doesNotThrow(() => Q.questTree([a], MMS));
  assert.doesNotThrow(() => Q.starRollup([a], MMS));
  assert.doesNotThrow(() => Q.countQuests([a]));
  assert.doesNotThrow(() => Q.withQuest([a], 'zzz', true));
});

// ── starRollup ─────────────────────────────────────────────────────────────

test('starRollup emits ONE row for a starred parent with starred descendants', () => {
  // "If the parent is chosen include all child but only show the parent." The
  // whole rule is one `return`, and this is the case that reverses with it.
  const goals = [node('g', {
    quest: true, star: true,
    children: [
      node('t1', { quest: true, star: true }),
      node('t2', { quest: true, star: true }),
      node('t3', { quest: true, star: true })
    ]
  })];
  const rows = Q.starRollup(goals, MMS);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].node.id, 'g');
  assert.equal(rows[0].kind, 'node');
});

test('starRollup descends past an UNstarred node and collects below it', () => {
  const goals = [node('g', {
    children: [node('t1', { quest: true, star: true }), node('t2', { quest: true })]
  })];
  assert.deepEqual(Q.starRollup(goals, MMS).map(r => r.node.id), ['t1']);
});

test('starRollup emits a starred to-learn on a node that is not itself starred', () => {
  const goals = [node('g', {
    toLearn: ['mm1'], questLearn: ['mm1'], starLearn: ['mm1']
  })];
  const rows = Q.starRollup(goals, MMS);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'learn');
  assert.equal(rows[0].mmId, 'mm1');
  assert.equal(rows[0].mm.name, 'Harmony');
});

test('a starred parent swallows its own starred to-learns too', () => {
  const goals = [node('g', {
    quest: true, star: true, toLearn: ['mm1'], questLearn: ['mm1'], starLearn: ['mm1'],
    children: [node('t1', { quest: true, star: true })]
  })];
  assert.equal(Q.starRollup(goals, MMS).length, 1,
    'the subtree is what the parent row stands for');
});

// ── routine ticks ──────────────────────────────────────────────────────────

test('routineTicks reads back what withRoutineTick stored', () => {
  const v = Q.withRoutineTick(null, 's1', '2026-09-07', 'r1', true);
  assert.deepEqual(v, { slotId: 's1', day: '2026-09-07', ids: ['r1'] });
  assert.deepEqual(Q.routineTicks(JSON.stringify(v), 's1', '2026-09-07'), ['r1']);
});

test('a stale day reads as EMPTY — that is the end-of-day reset', () => {
  // Structural expiry: one stored day covers the whole set, so no timer and no
  // cleanup job exist or are needed.
  const raw = JSON.stringify({ slotId: 's1', day: '2026-09-06', ids: ['r1'] });
  assert.deepEqual(Q.routineTicks(raw, 's1', '2026-09-07'), []);
});

test('a foreign slot reads as EMPTY', () => {
  const raw = JSON.stringify({ slotId: 'other', day: '2026-09-07', ids: ['r1'] });
  assert.deepEqual(Q.routineTicks(raw, 's1', '2026-09-07'), []);
});

test('both ends are total against a corrupt stored value', () => {
  // JSON.parse does not throw on 'null' or '42', so a hand-rolled try/catch
  // around it is not a check. A view preference must never break a page.
  for (const raw of ['', 'null', '42', '[]', '{', 'nonsense', null, undefined, 42, []]) {
    assert.doesNotThrow(() => Q.routineTicks(raw, 's1', '2026-09-07'),
      'threw on ' + JSON.stringify(raw));
    assert.deepEqual(Q.routineTicks(raw, 's1', '2026-09-07'), []);
  }
  // `null` is dropped; a NUMBER is kept, because isId tolerates one everywhere
  // and a node carrying a numeric id should still be tickable. Neither can do
  // any harm — a stored id that matches no node simply never renders.
  assert.deepEqual(Q.routineTicks(JSON.stringify(
    { slotId: 's1', day: '2026-09-07', ids: [null, 7, 'r1'] }), 's1', '2026-09-07'), [7, 'r1']);
});

test('untick removes one id and leaves the rest of the day intact', () => {
  const raw = JSON.stringify({ slotId: 's1', day: '2026-09-07', ids: ['r1', 'r2'] });
  assert.deepEqual(Q.withRoutineTick(raw, 's1', '2026-09-07', 'r1', false).ids, ['r2']);
});

test('a tick on a stale day starts a fresh day rather than reviving the old one', () => {
  const raw = JSON.stringify({ slotId: 's1', day: '2026-09-06', ids: ['r1'] });
  assert.deepEqual(Q.withRoutineTick(raw, 's1', '2026-09-07', 'r2', true),
    { slotId: 's1', day: '2026-09-07', ids: ['r2'] });
});

// ── sibling order ──────────────────────────────────────────────────────────

test('questOrder sorts siblings, and an UNARRANGED one goes last', () => {
  // Absence is the default and means "wherever the goal tree puts it". An
  // unarranged sibling must not jump to the front just because 0 < undefined
  // in some comparison — it sorts after everything the user placed.
  const goals = [node('g', {
    children: [
      node('a', { quest: true, questOrder: 2 }),
      node('b', { quest: true }),
      node('c', { quest: true, questOrder: 0 })
    ]
  })];
  assert.deepEqual(
    Q.questTree(goals, MMS)[0].children.map(k => k.node.id), ['c', 'a', 'b']);
});

test('an unarranged group keeps pure goal-tree order', () => {
  const goals = [node('g', {
    children: ['x', 'y', 'z'].map(k => node(k, { quest: true }))
  })];
  assert.deepEqual(
    Q.questTree(goals, MMS)[0].children.map(k => k.node.id), ['x', 'y', 'z']);
});

test('reorderIds moves before and after, and is INERT on a foreign id', () => {
  const ids = ['a', 'b', 'c', 'd'];
  assert.deepEqual(Q.reorderIds(ids, 'd', 'b', true), ['a', 'd', 'b', 'c']);
  assert.deepEqual(Q.reorderIds(ids, 'd', 'b', false), ['a', 'b', 'd', 'c']);
  assert.deepEqual(Q.reorderIds(ids, 'a', 'c', false), ['b', 'c', 'a', 'd']);
  // A drag from another group, or onto itself, changes nothing — which is what
  // makes a cross-group drop a no-op rather than an error.
  assert.deepEqual(Q.reorderIds(ids, 'zz', 'b', true), ids);
  assert.deepEqual(Q.reorderIds(ids, 'a', 'zz', true), ids);
  assert.deepEqual(Q.reorderIds(ids, 'a', 'a', true), ids);
  assert.deepEqual(Q.reorderIds(null, 'a', 'b', true), []);
});

test('withQuestOrder writes 0..n-1 and NEVER moves the node in the tree', () => {
  // Quest order is the Quest tab's own view. The user chose that dragging a
  // quest must not restructure their goal tree, so `children` order is
  // untouched and only the key each node carries changes.
  const goals = [node('g', {
    children: [node('a', { quest: true }), node('b', { quest: true }), node('c', { quest: true })]
  })];
  const out = Q.withQuestOrder(goals, ['c', 'a', 'b']);
  assert.deepEqual(out[0].children.map(k => k.id), ['a', 'b', 'c'],
    'the goal tree itself did not move');
  assert.deepEqual(out[0].children.map(k => k.questOrder), [1, 2, 0]);
  assert.deepEqual(Q.questTree(out, MMS)[0].children.map(k => k.node.id), ['c', 'a', 'b'],
    'but the quest view reads in the chosen order');
});

test('withQuestOrder is a no-op when the order already matches', () => {
  const goals = [node('g', {
    children: [node('a', { quest: true, questOrder: 0 }), node('b', { quest: true, questOrder: 1 })]
  })];
  assert.equal(Q.withQuestOrder(goals, ['a', 'b']), goals);
  assert.equal(Q.withQuestOrder(goals, []), goals);
});

test('a malformed questOrder is ignored rather than sorting to a strange place', () => {
  for (const bad of ['2', null, NaN, Infinity, {}, []])
    assert.equal(Q.questOrderOf(node('a', { questOrder: bad })), null,
      'questOrder ' + JSON.stringify(bad) + ' must read as unarranged');
  assert.equal(Q.questOrderOf(node('a', { questOrder: 0 })), 0, 'zero is a real position');
});

test('questOrder rides the node through a nesting transfer, needing no helper', () => {
  // Unlike questLearn, this is a plain node key — it travels on the ordinary
  // spread every nesting site already does. This case is what says so.
  const n = node('a', { quest: true, questOrder: 3 });
  const moved = Object.assign({}, n, { isSubGoal: true });
  assert.equal(Q.questOrderOf(moved), 3);
});

// ── the starred count ──────────────────────────────────────────────────────

test('a starred row reports how many quests it stands for', () => {
  const goals = [node('g', {
    quest: true, star: true, toLearn: [10], questLearn: [10],
    children: [
      node('a', { quest: true, star: true }),
      node('b', { quest: true }),
      node('c')
    ]
  })];
  const rows = Q.starRollup(goals, NUM_MMS);
  assert.equal(rows.length, 1, 'still ONE row for the starred parent');
  assert.equal(rows[0].count, 4,
    'itself + its quested to-learn + its two quested children — not the unquested one');
});

test('a starred LEAF stands for exactly itself', () => {
  const goals = [node('g', { children: [node('a', { quest: true, star: true })] })];
  const rows = Q.starRollup(goals, MMS);
  assert.equal(rows[0].count, 1);
});

test('a starred to-learn row counts one', () => {
  const goals = [node('g', { toLearn: [10], questLearn: [10], starLearn: [10] })];
  const rows = Q.starRollup(goals, NUM_MMS);
  assert.equal(rows[0].kind, 'learn');
  assert.equal(rows[0].count, 1);
});

// ── guards: these must pass on BOTH sides of every baseline ────────────────

test('GUARD: withQuest leaves every other field byte-identical', () => {
  const before = node('a', {
    toLearn: ['mm1'], mmTargets: { mm1: { stage: 2 } }, milestones: [{ id: 'ms1' }],
    notes: [{ id: 'n1' }], children: [node('k')], routineDates: { '2026-09-07': {} }
  });
  const out = Q.withQuest([before], 'a', true)[0];
  for (const key of ['toLearn', 'mmTargets', 'milestones', 'notes', 'children', 'routineDates'])
    assert.deepEqual(out[key], before[key], key + ' changed');
});

test('GUARD: questTree returns the ORIGINAL node objects, not copies', () => {
  // Callers hand these straight to progress.html's isComplete/countProgress.
  const leaf = node('t1', { quest: true });
  const goals = [node('g', { children: [leaf] })];
  assert.equal(Q.questTree(goals, MMS)[0].children[0].node, leaf);
});

test('GUARD: a node that was never quested gains no quest key from any reader', () => {
  const n = node('a', { toLearn: ['mm1'] });
  Q.isQuest(n); Q.isStarred(n); Q.questLearnOf(n); Q.starLearnOf(n);
  Q.questTree([n], MMS, { prune: false }); Q.starRollup([n], MMS);
  assert.deepEqual(Object.keys(n).sort(),
    ['children', 'completed', 'createdAt', 'id', 'scheduledDate', 'title', 'toLearn'].sort());
});
