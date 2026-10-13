/* ── tests/milestone-core.test.js ──────────────────────────────────────────
   Offline cover for milestone-core.js — the one definition of where a
   milestone stands, and of whether it is late.

       node --test tests/milestone-core.test.js

   Run once by tests/run.js rather than once per timezone, and that is a claim
   about the module rather than a convenience: nothing in milestone-core.js
   constructs a Date. "Today" arrives as a PARAMETER computed by the page, and a
   difference between two days is integer days-from-civil arithmetic. If a
   `new Date()` ever appears in milestone-core.js, this suite has moved to the
   wrong list — the structural case below is what says so.

   What is being pinned here, in order of how much it would cost to get wrong:

   1. PARITY. progress.html's countProgress, isMMTargetMet, buildSirDoneMap,
      collectMilestoneOwners and collectMilestoneBlocks are now one-line
      delegates to this module, and they feed every goal and milestone
      progress figure on that page. The verbatim pre-extraction copies below
      are the baseline: on acyclic data the module must answer exactly as they
      did. The two deliberate differences — a cycle guard, and a block reached
      twice collected once — each have their own case.

   2. The LATENESS RULE: the end day is not late, the day after is; an empty
      milestone is never late; to-learn counts, read through toLearn with
      NUMERIC mind-map ids.

   3. The SLIP RECORD: recorded only for a milestone that was already late, as
      the net effect of one day's edits from one due date, and never written
      as [].

   Fixtures are synthetic, always (AGENTS.md, "Preserve old data").
*/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Browser IIFEs, so `window` has to exist before they run. runInThisContext,
// not runInNewContext: both modules are built on Array.isArray and Set, and a
// fresh realm would make arrays built here fail them. schema.js first —
// milestone-core.js asks TrackSchema.isDay whether a string is a real day.
globalThis.window = globalThis;
const SCHEMA = path.join(__dirname, '..', 'scripts', 'schema.js');
const SRC = path.join(__dirname, '..', 'scripts', 'milestone-core.js');
vm.runInThisContext(fs.readFileSync(SCHEMA, 'utf8'), { filename: 'schema.js' });
vm.runInThisContext(fs.readFileSync(SRC, 'utf8'), { filename: 'milestone-core.js' });
const M = globalThis.TrackMilestone;
const S = globalThis.TrackSchema;
const F = require('./lib/fixture.js');

// ── the pre-extraction code, verbatim from progress.html ───────────────────
// Frozen copies of what the delegates replaced. Do not "fix" these — they are
// the baseline the module is measured against.

const OLD = (() => {
  const STAGE_ORDER = { 1:1, 2:2, 3:3, 4:4, sir:5, sir1:6, sir2:7, sir3:8, sir4:9, sir5:10, finished:11 };
  function isMilestoneNode(node) {
    return node?.taskType === 'milestone';
  }
  function findNode(goals, id) {
    for (const g of goals) {
      if (g.id === id) return g;
      if (g.children?.length) { const f = findNode(g.children, id); if (f) return f; }
    }
    return null;
  }
  function countProgress(node, resolveLink, checkSchedDone = false) {
    if (!node) return { done: 0, total: 0 };
    if (node.isLink) {
      const orig = resolveLink && resolveLink(node.linkedTaskId);
      if (!orig) return { done: 0, total: 0 };
      return countProgress(orig, resolveLink, checkSchedDone);
    }
    if (isMilestoneNode(node) && (node.children || []).length === 0)
      return { done: 0, total: 0 };
    if ((node.children || []).length === 0)
      return { done: node.completed ? 1 : 0, total: 1 };
    return (node.children || []).reduce((acc, c) => {
      const p = countProgress(c, resolveLink, checkSchedDone);
      return { done: acc.done + p.done, total: acc.total + p.total };
    }, { done: 0, total: 0 });
  }
  function collectMilestoneOwners(node, allGoals) {
    const out = [];
    const seen = new Set();
    function walk(n) {
      if (!n) return;
      if (n.isLink) {
        const orig = allGoals && findNode(allGoals, n.linkedTaskId);
        if (orig) walk(orig);
        return;
      }
      const subGoals = (n.children || []).filter(c => c.isSubGoal);
      if (subGoals.length === 0) {
        if (!seen.has(n.id)) {
          seen.add(n.id);
          out.push(n);
        }
        return;
      }
      subGoals.forEach(walk);
    }
    walk(node);
    return out;
  }
  function collectMilestoneBlocks(owner, milestoneId, allGoals) {
    const out = [];
    const seen = new Set();
    function walk(n) {
      if (!n) return;
      if (n.isLink) {
        const orig = allGoals && findNode(allGoals, n.linkedTaskId);
        if (orig && !seen.has(orig.id)) {
          seen.add(orig.id);
          walk(orig);
        }
        return;
      }
      if (isMilestoneNode(n) && n.milestoneId === milestoneId) out.push(n);
      (n.children || []).forEach(walk);
    }
    (owner.children || []).forEach(walk);
    return out;
  }
  function buildSirDoneMap(sessions) {
    const map = {};
    (sessions || []).forEach(s => { if (s.done) map[s.mmId] = (map[s.mmId] || 0) + 1; });
    return map;
  }
  function isMMTargetMet(mm, target, sirDoneMap) {
    if (!target) return true;
    const eff = (target.milestones?.length > 0)
      ? target.milestones[target.milestones.length - 1]
      : target;
    let effOrder;
    if (mm.ksStage === 'sir') {
      const done = (sirDoneMap || {})[mm.id] || 0;
      effOrder = 5 + done;
    } else {
      effOrder = STAGE_ORDER[mm.ksStage] || 0;
    }
    const stageMet = !eff.stage || effOrder >= (STAGE_ORDER[eff.stage] || 0);
    const levelMet = !eff.level || (mm.rating || 0) >= Number(eff.level);
    return stageMet && levelMet;
  }
  return { STAGE_ORDER, findNode, countProgress, collectMilestoneOwners, collectMilestoneBlocks,
    buildSirDoneMap, isMMTargetMet };
})();

// ── fixtures ───────────────────────────────────────────────────────────────

const node = (id, extra) => Object.assign({ id, title: id, children: [], completed: false }, extra || {});
const block = (id, milestoneId, children) => node(id, { taskType: 'milestone', milestoneId, children: children || [] });
const link = (id, linkedTaskId, extra) => Object.assign({ id, linkedTaskId, isLink: true }, extra || {});
const def = (id, startDate, endDate, extra) => {
  const d = Object.assign({ id, title: 'Milestone ' + id }, extra || {});
  if (startDate !== undefined) d.startDate = startDate;
  if (endDate !== undefined) d.endDate = endDate;
  return d;
};
const resolver = goals => id => OLD.findNode(goals, id);

// A tree with every shape the walkers have to handle: a goal with a sub-goal
// owner, nested blocks, a link to a task elsewhere, a link to a deleted task,
// a done task, an empty block, a routine, a parent task, and a linked
// sub-goal that makes one owner reachable from two goals.
function bigTree() {
  const shared = node('t-shared', { completed: true });
  return [
    node('g1', {
      milestones: [],
      children: [
        node('s1', {
          isSubGoal: true,
          milestones: [def('m1', '2026-03-01', '2026-03-10'), def('m2', '2026-03-05', '2026-03-20')],
          children: [
            block('b1', 'm1', [
              node('t1', { completed: true }),
              node('t2'),
              node('p1', { children: [node('t3', { completed: true }), node('t4')] }),
              link('l1', 't-shared'),
              link('l-dead', 'no-such-task'),
              node('r1', { taskType: 'routine', routineDates: { '2026-03-02': { done: true } } })
            ]),
            node('t5', { children: [block('b2', 'm1', [node('t6')]), block('b-empty', 'm2')] }),
            block('b3', 'm2', [node('t7', { completed: true })])
          ]
        }),
        node('s2', { isSubGoal: true, milestones: [def('m3', '2026-04-01', '2026-04-30')],
          children: [block('b4', 'm3', [shared])] })
      ]
    }),
    node('g2', { milestones: [], children: [link('ls1', 's1', { isSubGoal: true })] })
  ];
}

const TODAY = '2026-10-08';

// One owner with one milestone, for the status cases. `tasks` go in a block.
// `start`/`end` are read by PRESENCE, not by destructuring defaults — a
// default would turn an explicit `undefined` (the missing-date case) back into
// a date.
function oneOwner(opts = {}) {
  const has = k => Object.prototype.hasOwnProperty.call(opts, k);
  const start = has('start') ? opts.start : '2026-09-20';
  const end = has('end') ? opts.end : '2026-10-03';
  const { tasks = [node('t-a')], toLearn = [], mmTargets = {}, extra = {} } = opts;
  const owner = node('own', Object.assign({
    milestones: [def('ms', start, end)],
    toLearn, mmTargets,
    children: tasks === null ? [] : [block('blk', 'ms', tasks)]
  }, extra));
  return { goals: [owner], owner, def: owner.milestones[0] };
}

// `today` by presence too, so `{ today: undefined }` really passes no day.
const status = (o, opts = {}) => {
  const today = Object.prototype.hasOwnProperty.call(opts, 'today') ? opts.today : TODAY;
  return M.statusOf(o.owner, o.def, o.goals, opts.mms || [], opts.sirDone || {}, today);
};

// ── the module surface ─────────────────────────────────────────────────────

test('exports exactly the documented surface', () => {
  assert.deepEqual(Object.keys(M).sort(), [
    'STAGE_ORDER', 'baselineOf', 'blocksOf', 'countLeaves', 'dayDiff', 'isProcedural', 'keyOf',
    'label', 'lateById', 'lateList', 'liveSessions', 'ownersOf', 'report', 'sirDoneMap',
    'slipLabel', 'slipNotice', 'slipsOf', 'stageOf', 'statusOf', 'targetFor', 'targetMet', 'withSlip'
  ]);
});

test('STRUCTURAL: the module constructs no Date and touches no storage or DOM', () => {
  const src = fs.readFileSync(SRC, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.doesNotMatch(src, /new Date|Date\.now|getDay\(|toISOString|getTimezoneOffset|Date\(/,
    'today is a parameter; a Date in here moves this suite into the swept list');
  assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB/, 'the pages own persistence');
  assert.doesNotMatch(src, /document\.|querySelector/, 'no DOM');
});

// ── 1. parity with the pre-extraction code ────────────────────────────────

test('PARITY: countLeaves answers exactly as countProgress did, on every node of an acyclic tree', () => {
  const goals = bigTree();
  const all = [];
  (function walk(ns) { ns.forEach(n => { all.push(n); walk(n.children || []); }); })(goals);
  assert.ok(all.length > 15, 'the tree exercises enough shapes');
  for (const n of all) {
    assert.deepEqual(M.countLeaves(n, resolver(goals)), OLD.countProgress(n, resolver(goals)), 'node ' + n.id);
    assert.deepEqual(M.countLeaves(n, null), OLD.countProgress(n, null), 'node ' + n.id + ' without a resolver');
  }
  assert.deepEqual(M.countLeaves(null, null), { done: 0, total: 0 });
  assert.deepEqual(M.countLeaves(undefined), { done: 0, total: 0 });
});

test('PARITY: a routine counts by its tree checkbox, never by its per-day ticks', () => {
  const r = node('r', { taskType: 'routine', routineDates: { '2026-03-02': { done: true } } });
  assert.deepEqual(M.countLeaves(r, null), { done: 0, total: 1 });
  assert.deepEqual(M.countLeaves(Object.assign({}, r, { completed: true }), null), { done: 1, total: 1 });
});

test('PARITY: ownersOf lists exactly what collectMilestoneOwners did', () => {
  const goals = bigTree();
  for (const g of goals) {
    assert.deepEqual(M.ownersOf(g, goals).map(o => o.id), OLD.collectMilestoneOwners(g, goals).map(o => o.id), g.id);
  }
  assert.deepEqual(M.ownersOf(goals[0], goals).map(o => o.id), ['s1', 's2']);
  assert.deepEqual(M.ownersOf(goals[1], goals).map(o => o.id), ['s1'],
    'a linked sub-goal makes the same owner reachable from a second goal');
  const leaf = node('lone', { milestones: [] });
  assert.deepEqual(M.ownersOf(leaf, [leaf]).map(o => o.id), ['lone'], 'a goal with no sub-goals is its own owner');
});

test('PARITY: blocksOf collects what collectMilestoneBlocks did, when no block is reached twice', () => {
  const goals = bigTree();
  const s1 = OLD.findNode(goals, 's1');
  const s2 = OLD.findNode(goals, 's2');
  for (const [owner, ids] of [[s1, ['m1', 'm2', 'nope']], [s2, ['m3']]]) {
    for (const id of ids) {
      assert.deepEqual(M.blocksOf(owner, id, goals).map(b => b.id),
        OLD.collectMilestoneBlocks(owner, id, goals).map(b => b.id), owner.id + '/' + id);
    }
  }
  assert.deepEqual(M.blocksOf(s1, 'm1', goals).map(b => b.id), ['b1', 'b2'], 'blocks at any depth');
});

test('PARITY: targetMet answers exactly as isMMTargetMet did, across stages, levels and SIR counts', () => {
  const stages = [undefined, '1', '2', '3', '4', 'sir', 'finished'];
  const mms = [];
  stages.forEach((ks, i) => [0, 3, 7].forEach(rating =>
    mms.push(F.mm(100 + i * 10 + rating, 'mm', { ksStage: ks, rating }))));
  const sirDone = { 150: 2, 153: 6 };
  const targets = [null, {}, { stage: '3' }, { level: 5 }, { stage: 'sir2', level: 3 }, { stage: 'finished' },
    { milestones: [{ milestoneId: 'a', stage: '2' }, { milestoneId: 'b', stage: 'sir1', level: 7 }] },
    { stage: '4', milestones: [] }];
  for (const mm of mms) for (const t of targets) {
    assert.equal(M.targetMet(mm, t, sirDone), OLD.isMMTargetMet(mm, t, sirDone), JSON.stringify([mm, t]));
    assert.equal(M.targetMet(mm, t), OLD.isMMTargetMet(mm, t), 'two-argument call, as the goal ring makes');
  }
});

test('PARITY: sirDoneMap counts done sessions per mind map, as buildSirDoneMap did', () => {
  const sessions = [F.session(1, '2026-03-01', 10, { done: true }), F.session(2, '2026-03-02', 10, { done: true }),
    F.session(3, '2026-03-03', 10), F.session(4, '2026-03-04', 11, { done: true })];
  assert.deepEqual(M.sirDoneMap(sessions), OLD.buildSirDoneMap(sessions));
  assert.deepEqual(M.sirDoneMap(sessions), { 10: 2, 11: 1 });
  assert.deepEqual(M.sirDoneMap(undefined), {});
  assert.deepEqual(M.sirDoneMap([null, 'junk', { done: true, mmId: 5 }]), { 5: 1 }, 'junk is skipped, not thrown on');
});

test('STAGE_ORDER is the progress.html table, frozen', () => {
  assert.deepEqual(Object.assign({}, M.STAGE_ORDER), OLD.STAGE_ORDER);
  assert.ok(Object.isFrozen(M.STAGE_ORDER));
});

// ── 2. the deliberate differences: cycles and double-reached blocks ─────────

test('GUARD: a task linked under its own descendant terminates, and counts the rest', () => {
  // P > C > link(P): the "link existing task" picker offers ancestors.
  const goals = [node('P', { children: [node('C', { children: [link('L', 'P'), node('leaf', { completed: true })] })] })];
  assert.deepEqual(M.countLeaves(goals[0], resolver(goals)), { done: 1, total: 1 },
    'the cycle contributes nothing; the real leaf still counts');
});

test('GUARD: a link to a link to the first link terminates', () => {
  const goals = [node('root', { children: [link('A', 'B'), link('B', 'A'), node('x')] })];
  assert.deepEqual(M.countLeaves(goals[0], resolver(goals)), { done: 0, total: 1 });
});

test('GUARD: a goal and a linked sub-goal pointing back at it terminate in ownersOf and blocksOf', () => {
  const goals = [
    node('G', { children: [link('toH', 'H', { isSubGoal: true })] }),
    node('H', { children: [link('toG', 'G', { isSubGoal: true }), block('bb', 'mx', [node('t')])] })
  ];
  assert.deepEqual(M.ownersOf(goals[0], goals).map(o => o.id), [], 'every branch ends in a repeat; nothing loops');
  const owner = node('O', { children: [link('up', 'O'), block('b9', 'm9', [link('again', 'O'), node('k')])] });
  const tree = [owner];
  assert.deepEqual(M.blocksOf(owner, 'm9', tree).map(b => b.id), ['b9']);
  assert.deepEqual(M.statusOf(owner, def('m9', '2026-01-01', '2026-01-02'), tree, [], {}, TODAY).tasks,
    { done: 0, total: 1 });
});

test('GUARD: a diamond — one task linked from two places — still counts twice, as it always has', () => {
  const t = node('T');
  const goals = [node('root', { children: [link('a', 'T'), link('b', 'T')] }), node('home', { children: [t] })];
  assert.deepEqual(M.countLeaves(goals[0], resolver(goals)), OLD.countProgress(goals[0], resolver(goals)));
  assert.deepEqual(M.countLeaves(goals[0], resolver(goals)), { done: 0, total: 2 });
});

test('CHANGE: a block reached both directly and through a link is collected ONCE', () => {
  const owner = node('O', { children: [node('T', { children: [block('B', 'm', [node('k')])] }), link('L', 'T')] });
  const goals = [owner];
  assert.deepEqual(OLD.collectMilestoneBlocks(owner, 'm', goals).map(b => b.id), ['B', 'B'],
    'the old walk collected it twice, counting its tasks twice');
  assert.deepEqual(M.blocksOf(owner, 'm', goals).map(b => b.id), ['B']);
});

// ── 3. days ────────────────────────────────────────────────────────────────

test('dayDiff counts calendar days across month, year and leap boundaries', () => {
  assert.equal(M.dayDiff('2026-10-08', '2026-10-08'), 0);
  assert.equal(M.dayDiff('2026-10-03', '2026-10-08'), 5);
  assert.equal(M.dayDiff('2026-10-08', '2026-10-03'), -5);
  assert.equal(M.dayDiff('2026-01-31', '2026-02-01'), 1);
  assert.equal(M.dayDiff('2025-12-31', '2026-01-01'), 1);
  assert.equal(M.dayDiff('2028-02-28', '2028-03-01'), 2, '2028 is a leap year');
  assert.equal(M.dayDiff('2026-02-28', '2026-03-01'), 1);
  assert.equal(M.dayDiff('2026-03-07', '2026-03-09'), 2, 'across a DST change in many zones — no Date, no hour');
  assert.equal(M.dayDiff('2026-01-01', '2033-12-31'), 2921);
});

test('dayDiff refuses anything that is not a real day', () => {
  for (const bad of ['2026-13-01', '2026-02-30', '2026-10-8', '', null, undefined, 20261008, 'garbage']) {
    assert.equal(M.dayDiff(bad, '2026-10-08'), null, String(bad));
    assert.equal(M.dayDiff('2026-10-08', bad), null, String(bad));
  }
});

// ── 4. the state machine ───────────────────────────────────────────────────

test('the END DAY ITSELF is not late; the day after is, by one day', () => {
  const o = oneOwner({ end: TODAY });
  assert.equal(status(o).state, 'active');
  assert.equal(status(o).daysLate, 0);
  const y = oneOwner({ end: '2026-10-07' });
  assert.equal(status(y).state, 'overdue');
  assert.equal(status(y).daysLate, 1);
  assert.equal(status(y).drawEnd, TODAY, 'a late milestone is drawn through today');
});

test('a late milestone reports how late and what is left', () => {
  const st = status(oneOwner({ tasks: [node('a'), node('b', { completed: true }), node('c')] }));
  assert.equal(st.state, 'overdue');
  assert.equal(st.daysLate, 5);
  assert.deepEqual(st.tasks, { done: 1, total: 3 });
  assert.equal(st.complete, false);
  assert.equal(st.key, 'own|ms');
  assert.equal(st.endDate, '2026-10-03');
});

test('upcoming and active milestones are not late', () => {
  assert.equal(status(oneOwner({ start: '2026-10-09', end: '2026-10-20' })).state, 'upcoming');
  assert.equal(status(oneOwner({ start: TODAY, end: '2026-10-20' })).state, 'active');
  assert.equal(status(oneOwner({ start: '2026-10-01', end: '2026-10-20' })).drawEnd, '2026-10-20');
});

test('an EMPTY milestone is never late, however long past', () => {
  const o = oneOwner({ start: '2026-01-01', end: '2026-01-02', tasks: null });
  const st = status(o);
  assert.equal(st.state, 'empty');
  assert.equal(st.empty, true);
  assert.equal(M.label(st), 'no work attached');
  const blockOnly = oneOwner({ start: '2026-01-01', end: '2026-01-02', tasks: [] });
  assert.equal(status(blockOnly).state, 'empty', 'an empty block is still no work');
  const deadOnly = oneOwner({ start: '2026-01-01', end: '2026-01-02', tasks: [link('x', 'gone')] });
  assert.equal(status(deadOnly).state, 'empty', 'a block holding only a link to a deleted task is no work either');
});

test('a finished milestone is done, whatever its dates', () => {
  const st = status(oneOwner({ tasks: [node('a', { completed: true })] }));
  assert.equal(st.state, 'done');
  assert.equal(st.complete, true);
  assert.equal(M.label(st), 'done');
  assert.equal(status(oneOwner({ start: undefined, end: undefined, tasks: [node('a', { completed: true })] })).state, 'done');
});

test('undated: missing, malformed or inverted dates, or no valid today, never claim lateness', () => {
  for (const [start, end] of [[undefined, undefined], ['2026-09-01', undefined], [undefined, '2026-09-01'],
    ['2026-13-45', '2026-09-01'], ['2026-09-01', 'garbage'], ['2026-09-20', '2026-09-01']]) {
    const st = status(oneOwner({ start, end }));
    assert.equal(st.state, 'undated', JSON.stringify([start, end]));
    assert.equal(st.drawEnd, null);
  }
  assert.equal(status(oneOwner(), { today: 'not-a-day' }).state, 'undated');
  assert.equal(status(oneOwner(), { today: undefined }).state, 'undated');
});

test('without schema.js nothing is a valid day, so nothing is ever called late', () => {
  const saved = globalThis.TrackSchema;
  try {
    delete globalThis.TrackSchema;
    assert.equal(status(oneOwner()).state, 'undated');
    assert.equal(M.dayDiff('2026-10-01', '2026-10-08'), null);
  } finally {
    globalThis.TrackSchema = saved;
  }
  assert.equal(status(oneOwner()).state, 'overdue', 'restored');
});

// ── 5. to-learn ────────────────────────────────────────────────────────────

const MM10 = F.mm(10, 'Mind Map A', { ksStage: '1', rating: 2 });
const MM11 = F.mm(11, 'Mind Map B', { ksStage: '3', rating: 8 });

test('to-learn alone keeps a milestone late, with NUMERIC mind-map ids', () => {
  const o = oneOwner({
    tasks: [node('a', { completed: true })],
    toLearn: [10, 11],
    mmTargets: {
      10: { stage: '3', milestones: [{ milestoneId: 'ms', stage: '2' }] },
      11: { milestones: [{ milestoneId: 'ms', stage: '3', level: 5 }] }
    }
  });
  const st = status(o, { mms: [MM10, MM11] });
  assert.equal(st.state, 'overdue', 'every task is done, but MM 10 has not reached stage 2');
  assert.deepEqual(st.learn, { met: 1, total: 2, open: [10] });
  assert.equal(typeof st.learn.open[0], 'number', 'the id keeps its type');
  assert.equal(M.label(st), 'OVERDUE · 5 days · 1 to-learn left');
});

test('to-learn is judged by THIS milestone\'s waypoint, not the overall goal target', () => {
  const o = oneOwner({
    tasks: [node('a', { completed: true })],
    toLearn: [10],
    mmTargets: { 10: { milestones: [{ milestoneId: 'ms', stage: '1' }, { milestoneId: 'later', stage: '4' }] } }
  });
  assert.equal(status(o, { mms: [MM10] }).state, 'done', 'stage 1 reached; the stage-4 waypoint belongs to another milestone');
});

test('to-learn reads toLearn, never mmTargets keys: a stale target is ignored', () => {
  const o = oneOwner({
    tasks: [node('a', { completed: true })],
    toLearn: [],
    mmTargets: { 10: { milestones: [{ milestoneId: 'ms', stage: '4' }] } }
  });
  const st = status(o, { mms: [MM10] });
  assert.equal(st.learn.total, 0, 'MM 10 is no longer linked, so its leftover target is not work');
  assert.equal(st.state, 'done');
});

test('to-learn: missing mind map skipped, other milestones ignored, duplicates counted once, SIR counted', () => {
  const o = oneOwner({
    tasks: null,
    toLearn: [10, 10, 99, 12],
    mmTargets: {
      10: { milestones: [{ milestoneId: 'other', stage: '4' }] },
      99: { milestones: [{ milestoneId: 'ms', stage: '2' }] },
      12: { milestones: [{ milestoneId: 'ms', stage: 'sir2' }] }
    }
  });
  const sirMM = F.mm(12, 'In SIR', { ksStage: 'sir' });
  const late = status(o, { mms: [MM10, sirMM], sirDone: { 12: 1 } });
  assert.deepEqual(late.learn, { met: 0, total: 1, open: [12] }, '99 is deleted; 10 belongs to another milestone');
  const met = status(o, { mms: [MM10, sirMM], sirDone: { 12: 2 } });
  assert.deepEqual(met.learn, { met: 1, total: 1, open: [] }, 'two done SIR sessions reach sir2');
  assert.equal(met.state, 'done');
});

test('a waypoint with no stage and no level counts as reached', () => {
  const o = oneOwner({ tasks: null, toLearn: [10], mmTargets: { 10: { milestones: [{ milestoneId: 'ms' }] } } });
  const st = status(o, { mms: [MM10] });
  assert.deepEqual(st.learn, { met: 1, total: 1, open: [] });
  assert.equal(st.state, 'done', 'not empty — it has a waypoint — and nothing is left');
});

test('an mmTargets key of either spelling is found: numeric id, string key', () => {
  const o = oneOwner({ tasks: null, toLearn: [10], mmTargets: JSON.parse('{"10":{"milestones":[{"milestoneId":"ms","stage":"4"}]}}') });
  assert.deepEqual(status(o, { mms: [MM10] }).learn.open, [10]);
});

// ── 6. the report ──────────────────────────────────────────────────────────

test('report covers exactly the Milestones tab\'s set, keyed owner|milestone, owners counted once', () => {
  const goals = bigTree();
  const rep = M.report(goals, [], {}, TODAY);
  assert.deepEqual(Object.keys(rep), ['s1|m1', 's1|m2', 's2|m3'],
    's1 is reachable from g1 and, through a link, from g2 — one entry');
  assert.deepEqual(Object.keys(rep).map(k => rep[k].order), [0, 1, 2]);
  assert.equal(rep['s1|m1'].state, 'overdue');
  // b1: t1 ✓, t2, t3 ✓, t4, the linked shared task ✓, the unticked routine,
  // and a link to a deleted task that counts nothing; b2: t6.
  assert.deepEqual(rep['s1|m1'].tasks, { done: 3, total: 7 });
  const s1 = OLD.findNode(goals, 's1');
  const old = OLD.collectMilestoneBlocks(s1, 'm1', goals)
    .map(b => OLD.countProgress(b, resolver(goals)))
    .reduce((a, p) => ({ done: a.done + p.done, total: a.total + p.total }), { done: 0, total: 0 });
  assert.deepEqual(rep['s1|m1'].tasks, old, 'the same figure the Milestones tab computed before the extraction');
  assert.equal(rep['s1|m2'].state, 'done', 'm2: one done task, one empty block');
  assert.equal(rep['s2|m3'].state, 'done', 'm3 holds only the shared done task');
});

test('report skips a definition with no usable id, and a duplicate id on one owner counts once', () => {
  const owner = node('o', { milestones: [def('x', '2026-01-01', '2026-01-02'), def('x', '2026-05-01', '2026-05-02'),
    { title: 'no id' }, null, 'junk'], children: [block('b', 'x', [node('t')])] });
  const rep = M.report([owner], [], {}, TODAY);
  assert.deepEqual(Object.keys(rep), ['o|x']);
  assert.equal(rep['o|x'].endDate, '2026-01-02', 'first wins');
});

test('the same milestone id on two owners is two entries; lateById keeps the FIRST holder only', () => {
  const a = node('a', { milestones: [def('dup', '2026-01-01', '2026-01-02')], children: [block('ba', 'dup', [node('t1')])] });
  const b = node('b', { milestones: [def('dup', '2026-01-01', '2026-12-31')], children: [block('bb', 'dup', [node('t2')])] });
  const rep = M.report([a, b], [], {}, TODAY);
  assert.deepEqual(Object.keys(rep), ['a|dup', 'b|dup']);
  assert.equal(M.lateById(rep).get('dup').ownerId, 'a');
  const repB = M.report([b, a], [], {}, TODAY);
  assert.equal(M.lateById(repB).has('dup'), false, 'the first holder is on time, so the id is not late');
});

test('lateList: overdue only, most days late first, then tab order', () => {
  const mk = (id, end) => node(id, { milestones: [def('m-' + id, '2026-01-01', end)], children: [block('b-' + id, 'm-' + id, [node('t-' + id)])] });
  const goals = [mk('x', '2026-10-01'), mk('y', '2026-09-01'), mk('z', '2026-10-01'), mk('w', '2026-12-01')];
  assert.deepEqual(M.lateList(M.report(goals, [], {}, TODAY)).map(s => s.ownerId), ['y', 'x', 'z']);
  assert.deepEqual(M.lateList(null), []);
});

test('report never mutates what it is given', () => {
  const goals = bigTree();
  const before = JSON.stringify(goals);
  M.report(goals, [MM10], { 10: 1 }, TODAY);
  assert.equal(JSON.stringify(goals), before);
});

// ── 7. wording ─────────────────────────────────────────────────────────────

test('label: the user\'s exact wording, singulars, and zero parts omitted', () => {
  const st = (tasks, learn, daysLate) => ({ state: 'overdue', tasks, learn, daysLate });
  assert.equal(M.label(st({ done: 2, total: 5 }, { met: 1, total: 2 }, 5)), 'OVERDUE · 5 days · 3 tasks, 1 to-learn left');
  assert.equal(M.label(st({ done: 0, total: 1 }, { met: 0, total: 0 }, 1)), 'OVERDUE · 1 day · 1 task left');
  assert.equal(M.label(st({ done: 3, total: 3 }, { met: 0, total: 2 }, 12)), 'OVERDUE · 12 days · 2 to-learn left');
  assert.equal(M.label({ state: 'active' }), '');
  assert.equal(M.label(null), '');
});

// ── 8. the slip record ─────────────────────────────────────────────────────

const LATE = { endDate: '2026-10-03', overdue: true };
const ON_TIME = { endDate: '2026-10-20', overdue: false };
const moved = (endDate, extra) => Object.assign(def('ms', '2026-09-20', endDate), extra || {});

test('SLIP: a later end on a late milestone is recorded {from, to, on}', () => {
  const out = M.withSlip(moved('2026-10-15'), LATE, TODAY);
  assert.deepEqual(out.slips, [{ from: '2026-10-03', to: '2026-10-15', on: TODAY }]);
  assert.equal(out.endDate, '2026-10-15', 'the period itself is untouched');
});

test('SLIP: clearing a late milestone\'s dates is recorded with no `to`', () => {
  const cleared = def('ms', undefined, undefined);
  const out = M.withSlip(cleared, LATE, TODAY);
  assert.deepEqual(out.slips, [{ from: '2026-10-03', on: TODAY }]);
  assert.equal(Object.prototype.hasOwnProperty.call(out.slips[0], 'to'), false, 'absent, never null or ""');
});

test('SLIP: planning is not a slip — the same object back when nothing is recorded', () => {
  const later = moved('2026-11-01');
  assert.equal(M.withSlip(later, ON_TIME, TODAY), later, 'not late before the edit');
  const earlier = moved('2026-10-01');
  assert.equal(M.withSlip(earlier, LATE, TODAY), earlier, 'an earlier end is not a postponement');
  const startOnly = moved('2026-10-03');
  assert.equal(M.withSlip(startOnly, LATE, TODAY), startOnly, 'a start-only change leaves the end where it was');
  assert.equal(M.withSlip(later, null, TODAY), later, 'no baseline');
  assert.equal(M.withSlip(later, LATE, 'not-a-day'), later, 'no clock');
  assert.equal(M.withSlip(later, { endDate: null, overdue: true }, TODAY), later, 'no due day to slip from');
});

test('SLIP: one day\'s edits from one due date are ONE record — updated, then removed on a move back', () => {
  let d = M.withSlip(moved('2026-10-05'), LATE, TODAY);
  d = M.withSlip(Object.assign({}, d, { endDate: '2026-10-12' }), LATE, TODAY);
  d = M.withSlip(Object.assign({}, d, { endDate: '2026-10-20' }), LATE, TODAY);
  assert.deepEqual(d.slips, [{ from: '2026-10-03', to: '2026-10-20', on: TODAY }], 'updated in place');
  const same = M.withSlip(d, LATE, TODAY);
  assert.equal(same, d, 'writing the same move again changes nothing');
  d = M.withSlip(Object.assign({}, d, { endDate: '2026-10-02' }), LATE, TODAY);
  assert.equal(Object.prototype.hasOwnProperty.call(d, 'slips'), false, 'moved back: the key is deleted, never []');
  const cleared = M.withSlip(Object.assign(def('ms', undefined, undefined), { slips: [{ from: '2026-10-03', to: '2026-10-20', on: TODAY }] }), LATE, TODAY);
  assert.deepEqual(cleared.slips, [{ from: '2026-10-03', on: TODAY }], 'clearing after a move drops `to`');
});

test('SLIP: a record from another day or another due date is never touched', () => {
  const older = [{ from: '2026-09-01', to: '2026-10-03', on: '2026-09-05', note: 'kept' }];
  const out = M.withSlip(moved('2026-10-15', { slips: older }), LATE, TODAY);
  assert.deepEqual(out.slips, [older[0], { from: '2026-10-03', to: '2026-10-15', on: TODAY }]);
  const back = M.withSlip(Object.assign({}, out, { endDate: '2026-10-01' }), LATE, TODAY);
  assert.deepEqual(back.slips, older, 'only today\'s record for this due date goes; unknown keys survive');
});

test('SLIP: junk records are kept, unknown keys spread through, a malformed `slips` is left alone', () => {
  const junk = [null, 'junk', { from: 'bad' }];
  const out = M.withSlip(moved('2026-10-15', { slips: junk, extra: 1 }), LATE, TODAY);
  assert.deepEqual(out.slips.slice(0, 3), junk);
  assert.equal(out.extra, 1);
  const weird = moved('2026-10-15', { slips: 'not a list' });
  assert.equal(M.withSlip(weird, LATE, TODAY), weird, 'nothing is overwritten to make room');
  const proto = JSON.parse('{"id":"ms","endDate":"2026-10-15","__proto__":{"x":1}}');
  const kept = M.withSlip(proto, LATE, TODAY);
  assert.ok(Object.prototype.hasOwnProperty.call(kept, '__proto__'), 'a __proto__ key survives the copy');
});

test('slipsOf is total, and slipLabel names the count and the first due day', () => {
  const d = def('ms', '2026-01-01', '2026-11-01', { slips: [
    { from: '2026-10-01', to: '2026-10-15', on: '2026-10-05' }, 'junk',
    { from: '2026-10-15', on: '2026-10-20' }, { from: 'bad', on: '2026-10-20' }
  ] });
  assert.deepEqual(M.slipsOf(d), [{ from: '2026-10-01', to: '2026-10-15', on: '2026-10-05' },
    { from: '2026-10-15', on: '2026-10-20' }]);
  assert.equal(M.slipLabel(d, TODAY), 'slipped 2× · first due Oct 1');
  assert.equal(M.slipLabel(d, '2027-01-04'), 'slipped 2× · first due Oct 1, 2026', 'the year when it is not this one');
  assert.equal(M.slipLabel(def('ms'), TODAY), '');
  assert.deepEqual(M.slipsOf(null), []);
});

test('baselineOf and slipNotice describe the state before an edit', () => {
  const late = status(oneOwner());
  assert.deepEqual(M.baselineOf(late), { endDate: '2026-10-03', overdue: true });
  assert.deepEqual(M.baselineOf(status(oneOwner({ end: '2026-10-20' }))), { endDate: '2026-10-20', overdue: false });
  assert.deepEqual(M.baselineOf(null), { endDate: null, overdue: false });
  assert.equal(M.slipNotice(late), 'It is 5 days overdue, so clearing its dates is recorded as a slip.');
  assert.equal(M.slipNotice(status(oneOwner({ end: '2026-10-20' }))), '');
});

test('a slot carrying slips validates clean and normalizes with its goals intact', () => {
  const slot = F.emptySlot({ goals: [F.task('g', { milestones: [F.milestone('m', '2026-09-01', '2026-11-01', {
    slips: [{ from: '2026-10-01', to: '2026-11-01', on: '2026-10-05' }] })] })] });
  const res = S.validateSlot(slot);
  assert.equal(res.ok, true);
  assert.deepEqual(res.errors, [], 'slips is not a validated field');
  assert.deepEqual(S.normalizeSlot(slot).goals, slot.goals);
});

// ── a mind map's kind: a Procedural MM has no SIR (NOTES Proposal 17, item 1) ──
// Mind-map and session ids are NUMBERS from nid(), so every fixture below uses
// numbers: a string-id fixture would hide an id-type bug entirely.

test('KIND: isProcedural is stored type "2", and accepts the number 2', () => {
  assert.equal(M.isProcedural(F.mm(1, 'P', { type: '2' })), true);
  assert.equal(M.isProcedural(F.mm(1, 'P', { type: 2 })), true, 'a hand-edited number still means Procedural');
  assert.equal(M.isProcedural(F.mm(1, 'D', { type: '1' })), false);
  assert.equal(M.isProcedural(F.mm(1, 'A', { type: 'anchor' })), false);
  for (const junk of [null, undefined, '2', 2, [], { type: ['2'] }]) assert.equal(M.isProcedural(junk), false);
});

test('KIND: a Procedural MM stored in SIR or FINISHED reads as S4; nothing else moves', () => {
  const P = (ksStage) => F.mm(1, 'P', { type: '2', ksStage });
  const D = (ksStage) => F.mm(1, 'D', { type: '1', ksStage });
  assert.equal(M.stageOf(P('sir')), '4');
  assert.equal(M.stageOf(P('finished')), '4');
  for (const s of ['1', '2', '3', '4', null, undefined]) assert.equal(M.stageOf(P(s)), s, 'Procedural ' + s);
  for (const s of ['1', '4', 'sir', 'finished', null]) assert.equal(M.stageOf(D(s)), s, 'Declarative ' + s);
  assert.equal(M.stageOf(F.mm(1, 'A', { type: 'anchor', ksStage: 'sir' })), 'sir', 'only Procedural is re-read');
  assert.equal(M.stageOf(F.mm(1, 'P', { type: '2', ksStage: 3 })), 3, 'a stored number comes back as stored');
  assert.equal(M.stageOf(null), null);
});

test('KIND: stageOf never writes — the stored record is untouched, so switching back restores SIR', () => {
  const p = F.mm(1, 'P', { type: '2', ksStage: 'sir' });
  const before = JSON.stringify(p);
  assert.equal(M.stageOf(p), '4');
  assert.equal(JSON.stringify(p), before);
  assert.equal(M.stageOf({ ...p, type: '1' }), 'sir', 'the same record as Declarative is in SIR again');
});

test('KIND: liveSessions leaves out a Procedural MM\'s sessions and keeps everyone else\'s', () => {
  const mms = [F.mm(10, 'Declarative', { type: '1', ksStage: 'sir' }),
    F.mm(11, 'Procedural', { type: '2', ksStage: 'sir' })];
  const sessions = [F.session(1, '2026-03-10', 10), F.session(2, '2026-03-10', 11),
    F.session(3, '2026-03-11', 11, { repIndex: 1, done: true }), F.session(4, '2026-03-12', 99)];
  assert.deepEqual(M.liveSessions(sessions, mms).map(s => s.id), [1, 4],
    'Procedural 11 drops out; an orphan session (mm 99) is still shown, as it was before');
  assert.equal(sessions.length, 4, 'the input is not mutated');
  assert.deepEqual(M.liveSessions(sessions, [{ ...mms[1], type: '1' }]).map(s => s.id), [1, 2, 3, 4],
    'switched back to Declarative, every session is live again');
});

test('KIND: liveSessions returns its input itself when nothing is left out', () => {
  const sessions = [F.session(1, '2026-03-10', 10)];
  assert.equal(M.liveSessions(sessions, [F.mm(10, 'D')]), sessions);
  assert.equal(M.liveSessions(sessions, [F.mm(11, 'P', { type: '2' })]), sessions, 'a Procedural MM with no sessions');
  assert.equal(M.liveSessions(sessions, null), sessions);
});

test('KIND: liveSessions is total', () => {
  assert.deepEqual(M.liveSessions(null, null), []);
  assert.deepEqual(M.liveSessions('junk', [F.mm(11, 'P', { type: '2' })]), []);
  const kept = [null, 'junk', F.session(1, '2026-03-10', 11)];
  assert.deepEqual(M.liveSessions(kept, [null, F.mm(11, 'P', { type: '2' }), F.mm(undefined, 'no id', { type: '2' })]),
    [null, 'junk'], 'a junk entry is passed through untouched, exactly as callers saw it before');
});

// ── a Procedural MM's target is its level (NOTES Proposal 17, item 3) ────────
// The user's rule: a Procedural MM's progress toward a goal is its MG level,
// never its phase, and a phase-only target is NO target — not a met one. A
// stored phase target is kept, unread, so switching back restores it.

const PROC = (over = {}) => F.mm(11, 'Procedural', Object.assign({ type: '2', ksStage: '2', rating: 3 }, over));
const DECL = (over = {}) => F.mm(10, 'Declarative', Object.assign({ type: '1', ksStage: '2', rating: 3 }, over));

test('TARGET: targetFor strips the phase from a Procedural MM\'s target and every waypoint', () => {
  const t = { stage: '4', level: 3, milestones: [
    { milestoneId: 'm1', stage: '2', level: 2 }, { milestoneId: 'm2', stage: '3' }, { milestoneId: 'm3', level: 5 }] };
  assert.deepEqual(M.targetFor(PROC(), t), { level: 3, milestones: [
    { milestoneId: 'm1', level: 2 }, { milestoneId: 'm3', level: 5 }] },
    'the phase-only waypoint m2 is gone: it is no target for this MM');
  assert.equal(t.stage, '4', 'the input is not mutated');
  assert.equal(t.milestones.length, 3);
  assert.deepEqual(M.targetFor(PROC(), { stage: '3' }), {}, 'a phase-only target reads as no target at all');
  assert.deepEqual(M.targetFor(PROC(), { stage: '3', milestones: [{ milestoneId: 'm1', stage: '2' }] }), {},
    'and so does one whose waypoints are all phase-only — `milestones` goes with them');
});

test('TARGET: targetFor returns anything else itself', () => {
  const t = { stage: '4', level: 3, milestones: [{ milestoneId: 'm1', stage: '2' }] };
  assert.equal(M.targetFor(DECL(), t), t, 'a Declarative MM reads its phase as before');
  assert.equal(M.targetFor(F.mm(1, 'A', { type: 'anchor' }), t), t);
  const lvl = { level: 3, milestones: [{ milestoneId: 'm1', level: 2 }] };
  assert.equal(M.targetFor(PROC(), lvl), lvl, 'a Procedural target with nothing to strip is not copied');
  for (const junk of [null, undefined, 'x', []]) assert.equal(M.targetFor(PROC(), junk), junk);
});

test('TARGET: targetMet judges a Procedural MM by its level alone; a Declarative MM still needs both', () => {
  const t = { stage: '4', level: 3 };
  assert.equal(M.targetMet(PROC(), t), true, 'S2 of a target S4 does not hold it back');
  assert.equal(M.targetMet(PROC({ rating: 2 }), t), false, 'the level still does');
  assert.equal(M.targetMet(DECL(), t), false, 'Declarative: S2 is short of S4');
  assert.equal(M.targetMet(DECL({ ksStage: '4' }), t), true);
  assert.equal(M.targetMet(PROC({ ksStage: 'sir' }), { stage: 'sir2' }), true,
    'a phase-only target on a Procedural MM has nothing to fall short of — callers gate on targetFor');
  assert.equal(M.targetMet(PROC({ rating: 2 }), { milestoneId: 'm1', stage: '1', level: 3 }), false,
    'one waypoint judged alone, by its level');
});

test('TARGET: a Procedural MM\'s phase-only waypoint is not work, so it cannot make a milestone late', () => {
  const learn = (mm, way) => oneOwner({ tasks: null, toLearn: [mm.id], mmTargets: { [mm.id]: { milestones: [Object.assign({ milestoneId: 'ms' }, way)] } } });
  // Past its end, the only work a waypoint short of its phase.
  const proc = status(learn(PROC({ ksStage: '1' }), { stage: '4' }), { mms: [PROC({ ksStage: '1' })] });
  assert.equal(proc.state, 'empty', 'Procedural: no target, no work, never late');
  const decl = status(learn(DECL({ ksStage: '1' }), { stage: '4' }), { mms: [DECL({ ksStage: '1' })] });
  assert.equal(decl.state, 'overdue', 'the same waypoint on a Declarative MM is late, as before');
  const lvl = status(learn(PROC({ ksStage: '1', rating: 2 }), { stage: '1', level: 3 }), { mms: [PROC({ ksStage: '1', rating: 2 })] });
  assert.equal(lvl.state, 'overdue', 'a Procedural waypoint with a level is still work, judged by the level');
});
