/* ── tests/calendar-core.test.js ───────────────────────────────────────────
   Offline tests for calendar-core.js: no browser, no network, no dependencies
   beyond Node's built-in node:test and node:assert.

   Run this file alone:      node --test tests/calendar-core.test.js
   Run it under every TZ:    node tests/run.js

   The timezone sweep is the point of this file, not a detail of it. Most of
   what calendar-core does is turn instants into *local* calendar days, and the
   classic way to get that wrong (toISOString().split('T')[0]) is invisible in
   UTC. Anything asserted here holds from UTC+14 to UTC-11 or the suite fails.
*/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const F = require('./lib/fixture.js');

// calendar-core.js is a classic browser script — an IIFE ending in `})(window)`
// that publishes window.TrackCalendar. It needs a `window`, and it must run in
// THIS realm rather than a fresh vm context: shownFn does `h instanceof Set`,
// and a Set built by this file would fail that check across a realm boundary,
// so a vm context would quietly test something the browser never does.
globalThis.window = globalThis;
vm.runInThisContext(
  fs.readFileSync(path.join(__dirname, '..', 'calendar-core.js'), 'utf8'),
  { filename: 'calendar-core.js' }
);
const TC = globalThis.TrackCalendar;

const TZ = process.env.TZ || '(system default)';
const ids = list => list.map(x => x.id);

// ───────────────────────────────────────────────────────────────────────────

test('module surface', () => {
  assert.ok(TC, 'calendar-core.js published window.TrackCalendar under TZ=' + TZ);
  for (const name of ['toDateStr', 'dim', 'firstDay', 'dStr', 'flattenGoals', 'goalDuration',
    'goalDone', 'mgsForDay', 'dlStart', 'dlInCaution', 'dlValid', 'dlDraftValid', 'dlDone', 'originKey',
    'dlCautionDays', 'dlCautionSet', 'dlCautionCount', 'dlWithCautionDays', 'dlToggleCautionDay',
    'buildBuckets', 'buildMilestoneLanes', 'buildDaySchedule', 'overlapInfo', 'durLabel',
    'noteTimed', 'daysBetween', 'dayShift',
    'noteBlockDuration', 'dlBlockDuration', 'dlBlockSpan', 'dlBlockTime', 'itemParts', 'partSpan',
    'blockOn', 'noteBlockSpan', 'noteBlockStart', 'blockDay', 'partDay',
    'dlBlockDayValid', 'dlStrandedBlockDays',
    'refSpan', 'refOccupies', 'refOn']) {
    assert.equal(typeof TC[name], 'function', name + ' is exported');
  }
  // dlDayCount was REMOVED rather than renamed: the number it returned changed
  // meaning (span length including the due day → count of chosen days), and a
  // changed meaning behind an unchanged name is worse than the churn.
  assert.equal(TC.dlDayCount, undefined, 'dlDayCount is gone, replaced by dlCautionCount');
  // the two automatic defaults are values, not functions
  assert.equal(TC.DEFAULT_BLOCK_MINS, 60, 'every item starts with a 60-minute block');
  assert.equal(TC.DEFAULT_NOTE_TIME, '08:00', 'and an untimed note starts at 08:00');
  assert.equal(TC.MONTHS.length, 12);
  assert.equal(TC.DOWS.length, 7);
  assert.equal(TC.MS_MAX_LANES, 3);
  // every filter entry is renderable, and CATS is a prefix of FILTERS
  TC.FILTERS.forEach(f => {
    assert.equal(typeof f.key, 'string');
    assert.ok(f.label && f.color, f.key + ' has a label and a colour');
  });
  assert.deepEqual(TC.FILTERS.slice(0, TC.CATS.length), TC.CATS);
  const keys = TC.FILTERS.map(f => f.key);
  assert.ok(keys.includes('doc'), 'doc is a filter key');
  assert.equal(new Set(keys).size, keys.length, 'filter keys are unique');
});

// ── local calendar days ────────────────────────────────────────────────────

test('toDateStr returns the LOCAL day at both ends of the day', () => {
  assert.equal(TC.toDateStr(new Date(2026, 0, 1, 0, 15)), '2026-01-01');
  assert.equal(TC.toDateStr(new Date(2026, 0, 1, 23, 30)), '2026-01-01');
  assert.equal(TC.toDateStr(new Date(2026, 0, 1, 0, 0, 0)), '2026-01-01');
  assert.equal(TC.toDateStr(new Date(2026, 0, 1, 23, 59, 59)), '2026-01-01');
  // month, year and single-digit padding boundaries
  assert.equal(TC.toDateStr(new Date(2026, 1, 28, 23, 30)), '2026-02-28');
  assert.equal(TC.toDateStr(new Date(2024, 1, 29, 0, 15)), '2024-02-29');
  assert.equal(TC.toDateStr(new Date(2026, 11, 31, 23, 30)), '2026-12-31');
  assert.equal(TC.toDateStr(new Date(2027, 0, 1, 0, 15)), '2027-01-01');
  assert.equal(TC.toDateStr(new Date(2026, 8, 9, 5, 5)), '2026-09-09');
});

test('the sweep is meaningful: outside UTC the UTC day really does disagree', () => {
  const probes = [new Date(2026, 0, 1, 0, 15), new Date(2026, 0, 1, 23, 30)];
  const offset = probes[0].getTimezoneOffset();
  const disagreements = probes.filter(d => TC.toDateStr(d) !== d.toISOString().slice(0, 10));
  if (offset === 0) {
    assert.equal(disagreements.length, 0, 'in UTC the two agree, which is why UTC alone proves nothing');
  } else {
    assert.ok(disagreements.length > 0,
      'TZ=' + TZ + ' must expose at least one day where toISOString() is the wrong day');
  }
});

test('month and year lengths, including leap years', () => {
  assert.deepEqual([0,1,2,3,4,5,6,7,8,9,10,11].map(m => TC.dim(2026, m)),
    [31,28,31,30,31,30,31,31,30,31,30,31]);
  assert.equal(TC.dim(2024, 1), 29, '2024 is a leap year');
  assert.equal(TC.dim(2026, 1), 28);
  assert.equal(TC.dim(2000, 1), 29, '2000 is a leap year (divisible by 400)');
  assert.equal(TC.dim(1900, 1), 28, '1900 is not (divisible by 100, not 400)');
  const total = y => [0,1,2,3,4,5,6,7,8,9,10,11].reduce((n, m) => n + TC.dim(y, m), 0);
  assert.equal(total(2026), 365);
  assert.equal(total(2024), 366);
});

test('firstDay and dStr', () => {
  assert.equal(TC.firstDay(2026, 0), 4, '2026-01-01 is a Thursday');
  assert.equal(TC.firstDay(2026, 1), 0, '2026-02-01 is a Sunday');
  assert.equal(TC.dStr(2026, 0, 1), '2026-01-01');
  assert.equal(TC.dStr(2026, 11, 31), '2026-12-31');
  assert.equal(TC.dStr(2026, 8, 9), '2026-09-09', 'month and day are both zero-padded');
});

// ── month dots ─────────────────────────────────────────────────────────────

test('buildBuckets groups each source into its category', () => {
  const b = TC.buildBuckets(F.populatedSlot(), 2026, 2);

  assert.equal(b['2026-03-05'].kolbmg.length, 3, 'two Kolbs and one MG change share the kolbmg dot');
  const labels = b['2026-03-05'].kolbmg.map(x => x.label);
  assert.ok(labels.includes('Mind Map A'), 'a linked Kolb is labelled with its MM');
  assert.ok(labels.includes('Free Kolb'), 'a Kolb with no mmId is a Free Kolb');
  assert.ok(labels.includes('Mind Map A: lift earlier'), 'an MG change carries its new MG');
  assert.deepEqual(b['2026-03-05'].kolbmg.map(x => x.meta).sort(), ['Kolb', 'Kolb', 'MG change']);

  assert.equal(b['2026-03-06'].lin.length, 1);
  assert.equal(b['2026-03-06'].lin[0].label, 'Day title override', 'linDayTitles wins over the record title');
  assert.equal(b['2026-03-06'].lin[0].meta, '2 change(s)');

  assert.equal(b['2026-03-08'].dump.length, 1);
});

test('buildBuckets buckets a note timestamp on its LOCAL day', () => {
  // 23:30 on the 7th. Under UTC+14 the UTC day is the 8th; under UTC-11 a
  // 00:15 timestamp would be the 6th. Both must still land on their local day.
  const slot = F.emptySlot({
    notes: [F.note('late', F.localTs(2026, 3, 7, 23, 30)), F.note('early', F.localTs(2026, 3, 7, 0, 15))]
  });
  const b = TC.buildBuckets(slot, 2026, 2);
  assert.equal(b['2026-03-07'].note.length, 2, 'both timestamps belong to 2026-03-07 locally');
  assert.equal(b['2026-03-06'], undefined);
  assert.equal(b['2026-03-08'], undefined);
});

test('buildBuckets excludes days outside the requested month', () => {
  const slot = F.emptySlot({
    kolbs: [F.kolb(1, '2026-02-28'), F.kolb(2, '2026-03-01'), F.kolb(3, '2026-03-31'), F.kolb(4, '2026-04-01')]
  });
  const b = TC.buildBuckets(slot, 2026, 2);
  assert.deepEqual(Object.keys(b).sort(), ['2026-03-01', '2026-03-31'], 'both edges included, neighbours not');
});

test('buildBuckets tolerates missing dates and unknown MM ids', () => {
  const slot = F.emptySlot({
    kolbs: [F.kolb(1, undefined), F.kolb(2, '2026-03-05', { mmId: 999 })],
    notes: [F.note('no-date', undefined)],
    sourceDumps: [F.dump('d', undefined)]
  });
  const b = TC.buildBuckets(slot, 2026, 2);
  assert.equal(b['2026-03-05'].kolbmg[0].label, 'MM 999', 'an unresolved MM falls back to its id');
  assert.equal(Object.keys(b).length, 1, 'undated items are dropped, not crashed on');
});

test('buildBuckets honours the hidden set', () => {
  const slot = F.populatedSlot();
  assert.equal(TC.buildBuckets(slot, 2026, 2, { hidden: ['kolbmg'] })['2026-03-05'], undefined);
  assert.ok(TC.buildBuckets(slot, 2026, 2, { hidden: ['lin'] })['2026-03-05'], 'other categories survive');
  assert.equal(TC.buildBuckets(slot, 2026, 2, { hidden: ['lin'] })['2026-03-06'], undefined);
  assert.equal(TC.buildBuckets(slot, 2026, 2, { hidden: ['dump'] })['2026-03-08'], undefined);
  assert.equal(TC.buildBuckets(slot, 2026, 2, { hidden: ['note'] })['2026-03-07'], undefined);

  const all = ['kolbmg', 'lin', 'note', 'dump'];
  assert.deepEqual(TC.buildBuckets(slot, 2026, 2, { hidden: all }), {}, 'hiding every category empties the month');
});

test('hidden accepts an array or a Set, and an empty one shows everything', () => {
  const slot = F.populatedSlot();
  const full = TC.buildBuckets(slot, 2026, 2);
  assert.deepEqual(TC.buildBuckets(slot, 2026, 2, { hidden: new Set(['kolbmg']) })['2026-03-05'], undefined);
  assert.deepEqual(TC.buildBuckets(slot, 2026, 2, { hidden: [] }), full, 'an empty array shows everything');
  assert.deepEqual(TC.buildBuckets(slot, 2026, 2, { hidden: new Set() }), full, 'an empty Set shows everything');
  assert.deepEqual(TC.buildBuckets(slot, 2026, 2, {}), full, 'omitting hidden shows everything');
  assert.deepEqual(TC.buildBuckets(slot, 2026, 2, undefined), full, 'omitting opts shows everything');
});

// ── milestone lanes ────────────────────────────────────────────────────────

const laneSlot = () => F.emptySlot({
  goals: [
    F.task('g1', { milestones: [F.milestone('A', '2026-03-01', '2026-03-10')] }),
    F.task('g2', {
      children: [F.task('g2a', { milestones: [F.milestone('B', '2026-03-05', '2026-03-15')] })]
    }),
    F.task('g3', { milestones: [F.milestone('C', '2026-03-20', '2026-03-25')] })
  ]
});

test('overlapping milestones get their own lane, a gap reuses lane 0', () => {
  const { lanesByDate, laneCount } = TC.buildMilestoneLanes(laneSlot(), 2026, 2);
  const laneOf = (ds, id) => lanesByDate[ds].find(x => x.title === 'Milestone ' + id).lane;
  assert.equal(laneOf('2026-03-01', 'A'), 0);
  assert.equal(laneOf('2026-03-05', 'B'), 1, 'B overlaps A, so it packs onto the next lane');
  assert.equal(laneOf('2026-03-20', 'C'), 0, 'C starts after A ends, so lane 0 is free again');
  assert.equal(laneCount, 2);
  assert.equal(lanesByDate['2026-03-05'].length, 2, 'both bars are present on a shared day');
  assert.equal(lanesByDate['2026-03-16'], undefined, 'a day with no milestone has no entry');
});

test('a milestone bar spans every day between its ends, and marks them', () => {
  const { lanesByDate } = TC.buildMilestoneLanes(laneSlot(), 2026, 2);
  const bar = ds => lanesByDate[ds].find(x => x.title === 'Milestone A');
  assert.ok(bar('2026-03-01').isStart && !bar('2026-03-01').isEnd);
  assert.ok(!bar('2026-03-05').isStart && !bar('2026-03-05').isEnd, 'a middle day is neither');
  assert.ok(bar('2026-03-10').isEnd && !bar('2026-03-10').isStart);
  const days = Object.keys(lanesByDate).filter(ds => lanesByDate[ds].some(x => x.title === 'Milestone A'));
  assert.equal(days.length, 10, '01 through 10 inclusive');
});

test('milestones touching end-to-start do not share a lane', () => {
  const slot = F.emptySlot({
    goals: [F.task('g', {
      milestones: [F.milestone('A', '2026-03-01', '2026-03-10'), F.milestone('B', '2026-03-10', '2026-03-20')]
    })]
  });
  const { lanesByDate, laneCount } = TC.buildMilestoneLanes(slot, 2026, 2);
  assert.equal(laneCount, 2);
  assert.deepEqual(lanesByDate['2026-03-10'].map(x => x.lane).sort(), [0, 1],
    'they share 03-10, so they must not share a row');
});

test('a milestone cloned across linked goal nodes is drawn once', () => {
  const shared = F.milestone('dup', '2026-03-01', '2026-03-03');
  const slot = F.emptySlot({
    goals: [
      F.task('g1', { milestones: [shared] }),
      F.task('g2', { milestones: [Object.assign({}, shared)] , isLink: true })
    ]
  });
  const { lanesByDate, laneCount } = TC.buildMilestoneLanes(slot, 2026, 2);
  assert.equal(laneCount, 1);
  assert.equal(lanesByDate['2026-03-01'].length, 1, 'deduped by milestone id');
});

test('milestones are clipped to the month and skipped when unusable', () => {
  const slot = F.emptySlot({
    goals: [F.task('g', { milestones: [
      F.milestone('spans-in', '2026-02-20', '2026-03-03'),
      F.milestone('spans-out', '2026-03-29', '2026-04-05'),
      F.milestone('before', '2026-01-01', '2026-02-10'),
      F.milestone('after', '2026-04-01', '2026-04-10'),
      F.milestone('no-end', '2026-03-05', undefined),
      F.milestone('no-start', undefined, '2026-03-05')
    ] })]
  });
  const { lanesByDate } = TC.buildMilestoneLanes(slot, 2026, 2);
  const titles = new Set(Object.values(lanesByDate).flat().map(x => x.title));
  assert.deepEqual([...titles].sort(), ['Milestone spans-in', 'Milestone spans-out']);
  assert.equal(lanesByDate['2026-02-28'], undefined, 'nothing is emitted outside the month');
  assert.ok(!lanesByDate['2026-03-01'].find(x => x.title === 'Milestone spans-in').isStart,
    'a bar entering from the previous month is not marked as starting');
  assert.equal(lanesByDate['2026-03-03'].find(x => x.title === 'Milestone spans-in').isEnd, true);
  assert.equal(lanesByDate['2026-03-31'].find(x => x.title === 'Milestone spans-out').isEnd, false,
    'a bar leaving into the next month is not marked as ending');
});

test('milestone bars carry a stable colour and their owning goal', () => {
  const { lanesByDate } = TC.buildMilestoneLanes(laneSlot(), 2026, 2);
  const a = lanesByDate['2026-03-01'][0];
  assert.equal(a.color, TC.MS_PALETTE[0]);
  assert.equal(a.owner, 'Task g1', 'the bar names the goal that owns the milestone');
  const b = lanesByDate['2026-03-15'][0];
  assert.equal(b.color, TC.MS_PALETTE[1], 'colour follows start-date order, not array order');
});

test('hiding milestones empties the lanes entirely', () => {
  assert.deepEqual(TC.buildMilestoneLanes(laneSlot(), 2026, 2, { hidden: ['milestone'] }),
    { lanesByDate: {}, laneCount: 0 });
});

// ── day schedule ───────────────────────────────────────────────────────────

test('buildDaySchedule collects goal tasks and routines', () => {
  const slot = F.emptySlot({
    goals: [
      F.task('t1', { title: 'Plain task', scheduledDate: '2026-03-10', scheduledTime: '08:30', duration: 45 }),
      F.task('t2', { title: 'Defaults', scheduledDate: '2026-03-10' }),
      F.task('r1', {
        title: 'Routine', taskType: 'routine',
        routineDates: { '2026-03-10': { time: '07:00', duration: 20, done: true } }
      }),
      F.task('lnk', { isLink: true, scheduledDate: '2026-03-10' }),
      F.task('ms', { taskType: 'milestone', scheduledDate: '2026-03-10' }),
      F.task('other-day', { scheduledDate: '2026-03-11' })
    ]
  });
  const day = TC.buildDaySchedule(slot, '2026-03-10');
  assert.deepEqual(ids(day.blocks).sort(), ['r1', 't1', 't2']);

  const t1 = day.blocks.find(b => b.id === 't1');
  assert.equal(t1.time, '08:30');
  assert.equal(t1.duration, 45);
  assert.equal(t1.kind, 'Goal task');

  const t2 = day.blocks.find(b => b.id === 't2');
  assert.equal(t2.time, '09:00', 'an unscheduled time defaults to 09:00');
  assert.equal(t2.duration, 60, 'an unset duration defaults to 60 minutes');

  const r1 = day.blocks.find(b => b.id === 'r1');
  assert.equal(r1.kind, 'Routine');
  assert.equal(r1.time, '07:00');
  assert.equal(r1.duration, 20, 'a routine takes its per-date duration');
  assert.equal(r1.done, true, 'a routine is done per date');
});

test('a parent whose child sits on the same day is represented by the child', () => {
  const child = F.task('c', { title: 'Child', scheduledDate: '2026-03-10', scheduledTime: '11:00', completed: true });
  const slot = F.emptySlot({
    goals: [
      F.task('p', { title: 'Parent', scheduledDate: '2026-03-10', children: [child] }),
      F.task('p2', { title: 'Parent elsewhere', scheduledDate: '2026-03-10',
        children: [F.task('c2', { scheduledDate: '2026-03-11' })] })
    ]
  });
  const day = TC.buildDaySchedule(slot, '2026-03-10');
  assert.deepEqual(ids(day.blocks).sort(), ['c', 'p2'],
    'the parent is dropped only when a child shares the day');
  assert.equal(day.blocks.find(b => b.id === 'c').done, true);
});

test('goalDone walks children, goalDuration falls back per date', () => {
  const done = F.task('p', { children: [F.task('a', { completed: true }), F.task('b', { completed: true })] });
  const partial = F.task('p', { children: [F.task('a', { completed: true }), F.task('b')] });
  assert.equal(TC.goalDone(done, '2026-03-10'), true);
  assert.equal(TC.goalDone(partial, '2026-03-10'), false);
  assert.equal(TC.goalDone(F.task('leaf', { completed: true }), '2026-03-10'), true);
  assert.equal(TC.goalDone(null, '2026-03-10'), false);

  const routine = F.task('r', { taskType: 'routine', duration: 15, routineDates: { '2026-03-10': {} } });
  assert.equal(TC.goalDuration(routine, '2026-03-10'), 15, 'no per-date duration falls back to the task');
  assert.equal(TC.goalDuration(F.task('x'), '2026-03-10'), 60);
});

test('buildDaySchedule collects supporting actions, MM entries and SIR reps', () => {
  const slot = F.emptySlot({
    mms: [F.mm(10, 'Mind Map A', { color: '#123456' })],
    saActions: [F.saAction('a-1', { title: 'Read', emoji: '📖', color: '#abcdef' })],
    saEntries: [
      F.saEntry('e-1', '2026-03-10', 'a-1', { time: '13:00', duration: 90 }),
      F.saEntry('e-2', '2026-03-10', 'gone')
    ],
    mmEntries: [F.mmEntry('me-1', '2026-03-10', 10, { done: true })],
    sessions: [
      F.session(1, '2026-03-10', 10),
      F.session(2, '2026-03-01', 10, { done: true, finishDate: '2026-03-10', repIndex: 2 }),
      F.session(3, '2026-03-10', 10, { skipped: true }),
      F.session(4, '2026-03-11', 10)
    ]
  });
  const day = TC.buildDaySchedule(slot, '2026-03-10');

  const e1 = day.blocks.find(b => b.id === 'e-1');
  assert.equal(e1.title, '📖 Read');
  assert.equal(e1.kind, 'Supporting action');
  assert.equal(e1.color, '#abcdef');
  assert.equal(day.blocks.find(b => b.id === 'e-2').title, 'Action gone', 'a missing action degrades to its id');

  const me = day.blocks.find(b => b.id === 'me-1');
  assert.equal(me.title, 'Mind Map A');
  assert.equal(me.kind, 'MM session');
  assert.equal(me.color, '#123456');

  assert.equal(day.sir.length, 2, 'a rep finished today counts, a skipped one does not');
  assert.deepEqual(day.sir.map(s => s.label).sort(),
    ['Mind Map A · rep 1', 'Mind Map A · rep 3']);
  assert.deepEqual(day.sir.map(s => s.done).sort(), [false, true]);
});

test('each schedule family can be hidden independently', () => {
  const slot = F.populatedSlot();
  const day = k => TC.buildDaySchedule(slot, '2026-03-10', { hidden: [k] });
  assert.ok(!ids(day('task').blocks).includes('g-1a'));
  assert.ok(!ids(day('sa').blocks).includes('e-1'));
  assert.ok(!ids(day('mm').blocks).includes('me-1'));
  assert.equal(day('sir').sir.length, 0);
  assert.equal(day('mg').mgs.length, 0);
  // hiding one family leaves the others alone
  assert.ok(ids(day('sa').blocks).includes('g-1a'));
  assert.ok(TC.buildDaySchedule(slot, '2026-03-10', { hidden: ['task'] }).sir.length > 0);
});

// ── origin: 'doc' is one key covering both notes and deadlines ──────────────

test('originKey maps by authorship, not by kind', () => {
  assert.equal(TC.originKey({ id: 'x' }, 'daynote'), 'daynote');
  assert.equal(TC.originKey({ id: 'x', docPageId: 'p-1' }, 'daynote'), 'doc');
  assert.equal(TC.originKey({ id: 'x' }, 'deadline'), 'deadline');
  assert.equal(TC.originKey({ id: 'x', docPageId: 'p-1' }, 'deadline'), 'doc');
  assert.equal(TC.originKey(null, 'daynote'), 'daynote');
  assert.equal(TC.originKey({ docPageId: '' }, 'daynote'), 'daynote', 'an empty id is not authorship');
});

test('hiding doc hides doc-authored notes AND deadlines together', () => {
  const slot = F.populatedSlot();
  const day = TC.buildDaySchedule(slot, '2026-03-10', { hidden: ['doc'] });
  assert.deepEqual(ids(day.calNotes), ['cn-sched']);
  assert.deepEqual(ids(day.deadlines), ['dl-sched']);
});

test('hiding daynote or deadline leaves the doc-authored ones visible', () => {
  const slot = F.populatedSlot();
  const noNotes = TC.buildDaySchedule(slot, '2026-03-10', { hidden: ['daynote'] });
  assert.deepEqual(ids(noNotes.calNotes), ['cn-doc'], 'daynote covers only schedule-authored notes');
  assert.equal(noNotes.deadlines.length, 2, 'deadlines are untouched');

  const noDl = TC.buildDaySchedule(slot, '2026-03-10', { hidden: ['deadline'] });
  assert.deepEqual(ids(noDl.deadlines), ['dl-doc']);
  assert.equal(noDl.calNotes.length, 2);

  const none = TC.buildDaySchedule(slot, '2026-03-10', { hidden: ['daynote', 'deadline', 'doc'] });
  assert.equal(none.calNotes.length, 0);
  assert.equal(none.deadlines.length, 0);
});

test('items are returned whole, so a caller can still read docPageId', () => {
  const day = TC.buildDaySchedule(F.populatedSlot(), '2026-03-10');
  assert.equal(day.calNotes.find(n => n.id === 'cn-doc').docPageId, 'p-1');
  assert.equal(day.deadlines.find(d => d.id === 'dl-doc').docPageId, 'p-1');
  assert.equal(day.calNotes.find(n => n.id === 'cn-sched').docPageId, undefined);
});

// ── day notes: the optional time ───────────────────────────────────────────

test('noteTimed accepts only a well-formed HH:MM', () => {
  assert.equal(TC.noteTimed({ time: '09:00' }), true);
  assert.equal(TC.noteTimed({ time: '00:00' }), true);
  assert.equal(TC.noteTimed({ time: '23:59' }), true);
  assert.equal(TC.noteTimed({}), false, 'absent means untimed — the default');
  assert.equal(TC.noteTimed({ time: '' }), false, 'cleared means untimed');
  assert.equal(TC.noteTimed({ time: '9:00' }), false);
  assert.equal(TC.noteTimed({ time: 'later' }), false);
  assert.equal(TC.noteTimed(null), false);
});

test('a note without a time is in the strip AND on the grid at the default hour', () => {
  const slot = F.emptySlot({ calendarNotes: [F.calNote('plain', '2026-03-10')] });
  const day = TC.buildDaySchedule(slot, '2026-03-10');
  assert.deepEqual(ids(day.calNotes), ['plain'], 'the strip lists it');
  assert.deepEqual(ids(day.calNotesAll), ['plain']);
  assert.deepEqual(ids(day.blocks), ['plain'], 'and so does the hour grid');
  assert.equal(day.blocks[0].time, '08:00');
});

test('a note with a time is on the hour grid and stays in the strip', () => {
  const slot = F.emptySlot({
    calendarNotes: [
      F.calNote('timed', '2026-03-10', { time: '15:00', title: 'Review at 3pm' }),
      F.calNote('plain', '2026-03-10')
    ]
  });
  const day = TC.buildDaySchedule(slot, '2026-03-10');
  assert.deepEqual(ids(day.calNotes).sort(), ['plain', 'timed'], 'the strip keeps both');
  assert.deepEqual(ids(day.calNotesAll).sort(), ['plain', 'timed']);
  assert.deepEqual(ids(day.blocks).sort(), ['plain', 'timed'], 'and both reach the grid');

  const b = day.blocks.find(x => x.id === 'timed');
  assert.equal(b.kind, 'Day note');
  assert.equal(b.time, '15:00');
  assert.equal(b.title, 'Review at 3pm');
  assert.equal(b.done, false);
  assert.equal(b.duration, 60, 'at the automatic default length');
  assert.equal(b.item.id, 'timed', 'the whole item rides along, so docPageId is still readable');
});

test('a malformed time puts the note at the default hour, never at midnight', () => {
  const slot = F.emptySlot({
    calendarNotes: [F.calNote('bad', '2026-03-10', { time: 'half past' }), F.calNote('empty', '2026-03-10', { time: '' })]
  });
  const day = TC.buildDaySchedule(slot, '2026-03-10');
  assert.deepEqual(ids(day.calNotes).sort(), ['bad', 'empty']);
  assert.deepEqual(ids(day.blocks).sort(), ['bad', 'empty']);
  day.blocks.forEach(b => assert.equal(b.time, '08:00', b.id + ' falls back rather than to 00:00'));
});

test('a timed note is filtered by origin like any other note', () => {
  const slot = F.emptySlot({
    calendarNotes: [
      F.calNote('sched', '2026-03-10', { time: '09:00' }),
      F.calNote('doc', '2026-03-10', { time: '10:00', docPageId: 'p-1' })
    ]
  });
  assert.deepEqual(ids(TC.buildDaySchedule(slot, '2026-03-10', { hidden: ['doc'] }).blocks), ['sched']);
  assert.deepEqual(ids(TC.buildDaySchedule(slot, '2026-03-10', { hidden: ['daynote'] }).blocks), ['doc']);
  assert.deepEqual(TC.buildDaySchedule(slot, '2026-03-10', { hidden: ['daynote', 'doc'] }).blocks, []);
});

test('a timed note takes part in overlap layout with real schedule blocks', () => {
  const slot = F.emptySlot({
    goals: [F.task('t', { scheduledDate: '2026-03-10', scheduledTime: '15:00', duration: 60 })],
    calendarNotes: [F.calNote('timed', '2026-03-10', { time: '15:00' })]
  });
  const day = TC.buildDaySchedule(slot, '2026-03-10');
  const laid = day.blocks.map(b => {
    const [h, m] = b.time.split(':').map(Number);
    return { id: b.id, top: h * 60 + m, height: b.duration };
  });
  const info = TC.overlapInfo(laid);
  assert.deepEqual(info.timed.sort(), ['t', 'timed'], 'they share the same hour and are grouped');
});

// ── day-note and deadline schedule blocks ──────────────────────────────────
/* Every note and every deadline is on the hour grid by DEFAULT, at
   DEFAULT_BLOCK_MINS. `blockOff` is the switch that takes one off again;
   `blockDuration` is only a remembered length, `blockDate` only a remembered
   day. All three absences mean "the automatic default", which is what puts
   blocks on items stored long before these keys existed without writing
   anything to them. */

test('a note with no block keys at all still gets the automatic block', () => {
  const slot = F.emptySlot({ calendarNotes: [F.calNote('timed', '2026-03-10', { time: '15:00' })] });
  const b = TC.buildDaySchedule(slot, '2026-03-10').blocks[0];
  assert.equal(b.time, '15:00', 'anchored to the note time');
  assert.equal(b.duration, 60, 'at the automatic default length');
  assert.equal(b.metaLabel, undefined, 'and it is a real span, so it may be captioned');
  assert.equal(b.kind, 'Day note');
});

test('a note with a blockDuration keeps the length the user chose', () => {
  const slot = F.emptySlot({
    calendarNotes: [F.calNote('sched', '2026-03-10', { time: '15:00', blockDuration: 90 })]
  });
  const b = TC.buildDaySchedule(slot, '2026-03-10').blocks[0];
  assert.equal(b.time, '15:00', 'a note block STARTS at the note time');
  assert.equal(b.duration, 90);
});

test('an UNTIMED note blocks at 08:00 and keeps its chip as well', () => {
  const slot = F.emptySlot({ calendarNotes: [F.calNote('bare', '2026-03-10')] });
  const day = TC.buildDaySchedule(slot, '2026-03-10');
  assert.deepEqual(ids(day.blocks), ['bare'], 'no stored time still means a block');
  assert.equal(day.blocks[0].time, '08:00', 'at the default hour');
  assert.equal(TC.noteBlockStart(slot.calendarNotes[0]), '08:00');
  assert.deepEqual(ids(day.calNotes), ['bare'], 'and the strip chip is NOT taken away for it');
});

test('a TIMED note shows in the strip as well as on the grid', () => {
  // "show both, always": scheduling something must never remove the way it was
  // already visible. Before this change a timed note left the strip entirely.
  const slot = F.emptySlot({
    calendarNotes: [F.calNote('t', '2026-03-10', { time: '15:00', blockDuration: 30 })]
  });
  const day = TC.buildDaySchedule(slot, '2026-03-10');
  assert.deepEqual(ids(day.blocks), ['t']);
  assert.deepEqual(ids(day.calNotes), ['t'], 'the chip stays');
  assert.deepEqual(ids(day.calNotesAll), ['t']);
});

test('a deadline block ends at the due time, automatically', () => {
  const slot = F.emptySlot({
    deadlines: [
      F.deadline('bare', '2026-03-10', { startDate: '2026-03-08', time: '17:00' }),
      F.deadline('prep', '2026-03-10', { startDate: '2026-03-08', time: '17:00', blockDuration: 120 })
    ]
  });
  const day = TC.buildDaySchedule(slot, '2026-03-10');
  assert.deepEqual(ids(day.blocks), ['bare', 'prep'], 'both are on the grid, no opting in');
  assert.equal(day.blocks[0].time, '16:00', 'the default run-up ENDS at the due time');
  assert.equal(day.blocks[0].duration, 60);
  assert.equal(day.blocks[0].kind, 'Deadline prep');
  assert.equal(day.blocks[1].time, '15:00', 'and a longer one still ends there');
  assert.deepEqual(TC.dlBlockSpan(slot.deadlines[1]), { time: '15:00', duration: 120 });
});

test('blockOff takes an item off the grid and remembers everything else', () => {
  const n = F.calNote('n', '2026-03-10', { time: '15:00', blockDuration: 90, blockOff: true });
  const d = F.deadline('d', '2026-03-10',
    { startDate: '2026-03-08', time: '17:00', blockDuration: 45, blockTime: '08:00', blockOff: true });
  const day = TC.buildDaySchedule(F.emptySlot({ calendarNotes: [n], deadlines: [d] }), '2026-03-10');
  assert.deepEqual(day.blocks, [], 'neither is on the hour grid');
  assert.equal(TC.blockOn(n), false);
  assert.equal(TC.noteBlockSpan(n), null);
  assert.equal(TC.dlBlockSpan(d), null);
  // the strip chip and the due line are untouched — removing a block never
  // removes the item
  assert.deepEqual(ids(day.calNotes), ['n']);
  assert.deepEqual(ids(day.deadlines), ['d']);
  // and nothing was thrown away, so putting the block back is a restore
  assert.deepEqual(TC.noteBlockSpan({ ...n, blockOff: false }), { time: '15:00', duration: 90 });
  assert.deepEqual(TC.dlBlockSpan({ ...d, blockOff: false }), { time: '08:00', duration: 45 });
});

test('blockDate moves the block to another day, alone', () => {
  const slot = F.emptySlot({
    calendarNotes: [F.calNote('n', '2026-03-10', { time: '15:00', blockDate: '2026-03-12' })],
    deadlines: [F.deadline('d', '2026-03-10',
      { startDate: '2026-03-08', time: '17:00', blockDate: '2026-03-09' })]
  });
  const own = TC.buildDaySchedule(slot, '2026-03-10');
  assert.deepEqual(own.blocks, [], 'the block has left the item\'s own day');
  assert.deepEqual(ids(own.calNotes), ['n'], 'but the chip stays on the original date');
  assert.deepEqual(ids(own.deadlines), ['d'], 'and so does the due line');

  const moved = TC.buildDaySchedule(slot, '2026-03-12');
  assert.deepEqual(ids(moved.blocks), ['n'], 'the note block draws on its chosen day');
  assert.equal(moved.blocks[0].time, '15:00');
  assert.deepEqual(ids(moved.calNotes), [], 'without dragging the chip along');

  const runUp = TC.buildDaySchedule(slot, '2026-03-09');
  assert.deepEqual(ids(runUp.blocks), ['d'], 'prep sits on a caution day');
  assert.equal(runUp.blocks[0].time, '16:00', 'still ending at the due TIME');
  assert.deepEqual(ids(runUp.deadlinesCaution), ['d'], 'and the run-up marker is unaffected');
  assert.equal(TC.blockDay(slot.deadlines[0]), '2026-03-09');
  assert.equal(TC.blockDay(slot.calendarNotes[0]), '2026-03-12');
});

test('a malformed blockDate falls back to the item\'s own day', () => {
  for (const v of ['', 'nonsense', '2026-3-1', 7, null, {}, []]) {
    const n = F.calNote('n', '2026-03-10', { time: '15:00', blockDate: v });
    assert.equal(TC.blockDay(n), '2026-03-10', 'fallback for ' + JSON.stringify(v));
    assert.deepEqual(ids(TC.buildDaySchedule(F.emptySlot({ calendarNotes: [n] }), '2026-03-10').blocks),
      ['n'], 'so the block is never lost to a day that does not exist');
  }
});

test('blockTime moves the block off the due-time anchor without touching it', () => {
  const d = F.deadline('moved', '2026-03-10',
    { startDate: '2026-03-08', time: '17:00', blockDuration: 60, blockTime: '08:00' });
  assert.deepEqual(TC.dlBlockSpan(d), { time: '08:00', duration: 60 });
  assert.equal(d.date, '2026-03-10', 'the due day is untouched');
  assert.equal(d.time, '17:00', 'and so is the due time');
  // absence is the third state: deleting the key restores the anchor rather
  // than storing whatever it happened to compute
  const { blockTime, ...reset } = d;
  assert.deepEqual(TC.dlBlockSpan(reset), { time: '16:00', duration: 60 });
});

test('a run-up clipped by midnight keeps its end on the due time', () => {
  const d = F.deadline('early', '2026-03-10', { startDate: '2026-03-10', time: '00:30', blockDuration: 60 });
  assert.deepEqual(TC.dlBlockSpan(d), { time: '00:00', duration: 30 },
    'clipped at the top, not pushed past the deadline');
});

test('GUARD: a block changes neither the due list nor the caution run-up', () => {
  const base = { cautionDates: ['2026-03-08', '2026-03-09'], time: '17:00' };
  const plain = F.emptySlot({ deadlines: [F.deadline('d', '2026-03-10', { ...base })] });
  const withBlock = F.emptySlot({ deadlines: [F.deadline('d', '2026-03-10', { ...base, blockDuration: 60 })] });
  const moved = F.emptySlot({ deadlines: [F.deadline('d', '2026-03-10', { ...base, blockDate: '2026-03-09' })] });
  const off = F.emptySlot({ deadlines: [F.deadline('d', '2026-03-10', { ...base, blockOff: true })] });
  const ticked = F.emptySlot({ deadlines: [F.deadline('d', '2026-03-10', { ...base, blockDuration: 60, done: true })] });

  for (const ds of ['2026-03-08', '2026-03-09', '2026-03-10']) {
    const a = TC.buildDaySchedule(plain, ds);
    for (const [label, slot] of [['duration', withBlock], ['blockDate', moved], ['blockOff', off]]) {
      const b = TC.buildDaySchedule(slot, ds);
      assert.deepEqual(ids(a.deadlines), ids(b.deadlines), 'due list unchanged by ' + label + ' on ' + ds);
      assert.deepEqual(ids(a.deadlinesCaution), ids(b.deadlinesCaution), 'run-up unchanged by ' + label + ' on ' + ds);
    }
    // the chosen days themselves are blind to all of it
    assert.equal(TC.dlInCaution(moved.deadlines[0], ds), TC.dlInCaution(plain.deadlines[0], ds));
  }
  assert.equal(TC.dlCautionCount(moved.deadlines[0]), TC.dlCautionCount(plain.deadlines[0]));
  assert.deepEqual(TC.dlCautionDays(moved.deadlines[0]), ['2026-03-08', '2026-03-09'],
    'and blockDate never rewrites the chosen days');
  // and the tick still suppresses the run-up, block or no block
  assert.deepEqual(ids(TC.buildDaySchedule(ticked, '2026-03-09').deadlinesCaution), []);
  assert.deepEqual(ids(TC.buildDaySchedule(ticked, '2026-03-10').deadlines), ['d'],
    'while the deadline itself stays on its due day');
});

test('blockTime moves the block off the due-time anchor without touching it', () => {
  const d = F.deadline('moved', '2026-03-10',
    { startDate: '2026-03-08', time: '17:00', blockDuration: 60, blockTime: '08:00' });
  assert.deepEqual(TC.dlBlockSpan(d), { time: '08:00', duration: 60 });
  assert.equal(d.date, '2026-03-10', 'the due day is untouched');
  assert.equal(d.time, '17:00', 'and so is the due time');
  // absence is the third state: deleting the key restores the anchor rather
  // than storing whatever it happened to compute
  const { blockTime, ...reset } = d;
  assert.deepEqual(TC.dlBlockSpan(reset), { time: '16:00', duration: 60 });
});

test('a run-up clipped by midnight keeps its end on the due time', () => {
  const d = F.deadline('early', '2026-03-10', { startDate: '2026-03-10', time: '00:30', blockDuration: 60 });
  assert.deepEqual(TC.dlBlockSpan(d), { time: '00:00', duration: 30 },
    'clipped at the top, not pushed past the deadline');
});

test('GUARD: a block changes neither the due list nor the caution run-up', () => {
  const base = { startDate: '2026-03-08', time: '17:00' };
  const plain = F.emptySlot({ deadlines: [F.deadline('d', '2026-03-10', { ...base })] });
  const withBlock = F.emptySlot({ deadlines: [F.deadline('d', '2026-03-10', { ...base, blockDuration: 60 })] });
  const ticked = F.emptySlot({ deadlines: [F.deadline('d', '2026-03-10', { ...base, blockDuration: 60, done: true })] });

  for (const ds of ['2026-03-08', '2026-03-09', '2026-03-10']) {
    const a = TC.buildDaySchedule(plain, ds), b = TC.buildDaySchedule(withBlock, ds);
    assert.deepEqual(ids(a.deadlines), ids(b.deadlines), 'due list unchanged on ' + ds);
    assert.deepEqual(ids(a.deadlinesCaution), ids(b.deadlinesCaution), 'run-up unchanged on ' + ds);
  }
  // and the tick still suppresses the run-up, block or no block
  assert.deepEqual(ids(TC.buildDaySchedule(ticked, '2026-03-09').deadlinesCaution), []);
  assert.deepEqual(ids(TC.buildDaySchedule(ticked, '2026-03-10').deadlines), ['d'],
    'while the deadline itself stays on its due day');
});

test('a malformed blockDuration or blockTime is inert, never NaN geometry', () => {
  const mk = v => F.emptySlot({ calendarNotes: [F.calNote('n', '2026-03-10', { time: '09:00', blockDuration: v })] });
  for (const v of ['60', NaN, Infinity, 0, -30, null, {}, []]) {
    const b = TC.buildDaySchedule(mk(v), '2026-03-10').blocks[0];
    assert.equal(b.duration, 60, 'falls back to the automatic default for ' + JSON.stringify(v));
  }
  // A positive value below the 5-minute UI snap is still the user's: the reader
  // must not discard what schema.js accepted, or an imported note would render
  // at a length nobody chose while the key sat in storage.
  assert.equal(TC.buildDaySchedule(mk(4), '2026-03-10').blocks[0].duration, 4,
    'a sub-snap duration is honoured, matching schema.js');
  // a malformed blockTime falls back to the anchor rather than to 00:00
  const d = F.deadline('d', '2026-03-10', { startDate: '2026-03-08', time: '17:00', blockDuration: 60, blockTime: '9am' });
  assert.deepEqual(TC.dlBlockSpan(d), { time: '16:00', duration: 60 });
  // a malformed note `time` has no anchor at all, so it uses the untimed default
  assert.equal(TC.noteBlockStart({ time: '9am' }), '08:00');
  // and a deadline whose due time is unreadable must not produce NaN geometry
  assert.deepEqual(TC.dlBlockSpan({ id: 'x', date: '2026-03-10', time: 'noon' }),
    { time: '08:00', duration: 60 });
});

test('parts stand in for the parent block, as a goal task\'s children do', () => {
  const slot = F.emptySlot({
    deadlines: [F.deadline('essay', '2026-03-10', {
      startDate: '2026-03-08', time: '17:00', blockDuration: 60,
      parts: [{ id: 'a', title: 'Outline' }, { id: 'b', title: 'Proofread', time: '13:00', blockDuration: 45 }]
    })]
  });
  const day = TC.buildDaySchedule(slot, '2026-03-10');
  assert.deepEqual(ids(day.blocks), ['essay:a', 'essay:b'], 'the parent block is replaced by its parts');
  assert.equal(day.blocks[0].time, '16:00', 'a part with no time of its own inherits the parent block start');
  assert.equal(day.blocks[0].duration, 60);
  assert.equal(day.blocks[1].time, '13:00', 'and one with its own keeps it');
  assert.equal(day.blocks[1].duration, 45);
  assert.equal(day.blocks[0].kind, 'Deadline part');
  assert.deepEqual(ids(day.deadlines), ['essay'], 'the due-day entry is untouched by dissection');
});

test('parts of a blockOff item draw nothing — blockOff is the one switch', () => {
  const slot = F.emptySlot({
    deadlines: [F.deadline('d', '2026-03-10',
      { startDate: '2026-03-08', time: '17:00', blockOff: true, parts: [{ id: 'a', title: 'x' }] })],
    calendarNotes: [F.calNote('n', '2026-03-10', { blockOff: true, parts: [{ id: 'b', title: 'y' }] })]
  });
  assert.deepEqual(TC.buildDaySchedule(slot, '2026-03-10').blocks, []);
  // …while the same items WITHOUT blockOff draw their parts and nothing else
  const on = F.emptySlot({
    deadlines: [F.deadline('d', '2026-03-10',
      { startDate: '2026-03-08', time: '17:00', parts: [{ id: 'a', title: 'x' }] })],
    calendarNotes: [F.calNote('n', '2026-03-10', { parts: [{ id: 'b', title: 'y' }] })]
  });
  assert.deepEqual(ids(TC.buildDaySchedule(on, '2026-03-10').blocks).sort(), ['d:a', 'n:b']);
});

test('a part\'s own date splits one item across several days', () => {
  const slot = F.emptySlot({
    deadlines: [F.deadline('essay', '2026-03-10', {
      startDate: '2026-03-08', time: '17:00', blockDuration: 60,
      parts: [
        { id: 'a', title: 'Outline', date: '2026-03-08', time: '09:00', blockDuration: 90 },
        { id: 'b', title: 'Draft', date: '2026-03-09' },
        { id: 'c', title: 'Proofread' }
      ]
    })]
  });
  const d8 = TC.buildDaySchedule(slot, '2026-03-08');
  assert.deepEqual(ids(d8.blocks), ['essay:a'], 'a part with its own date draws there');
  assert.deepEqual(d8.blocks[0], Object.assign({}, d8.blocks[0], { time: '09:00', duration: 90 }));
  assert.deepEqual(ids(TC.buildDaySchedule(slot, '2026-03-09').blocks), ['essay:b'],
    'a dated part with no time of its own still inherits the parent block start');
  assert.equal(TC.buildDaySchedule(slot, '2026-03-09').blocks[0].time, '16:00');
  assert.deepEqual(ids(TC.buildDaySchedule(slot, '2026-03-10').blocks), ['essay:c'],
    'and an undated part stays on the parent block\'s day');
  assert.equal(TC.partDay({ date: '2026-03-08' }, slot.deadlines[0]), '2026-03-08');
  assert.equal(TC.partDay({}, slot.deadlines[0]), '2026-03-10', 'absence means the parent block\'s day');
  assert.equal(TC.partDay({ date: 'junk' }, slot.deadlines[0]), '2026-03-10');
  // the due line and the caution run-up are untouched by any of it
  assert.deepEqual(ids(TC.buildDaySchedule(slot, '2026-03-10').deadlines), ['essay']);
  assert.deepEqual(ids(TC.buildDaySchedule(slot, '2026-03-09').deadlinesCaution), ['essay']);
});

test('a part follows a moved parent block rather than the item\'s own date', () => {
  const slot = F.emptySlot({
    calendarNotes: [F.calNote('n', '2026-03-10',
      { time: '15:00', blockDate: '2026-03-12', parts: [{ id: 'p', title: 'step' }] })]
  });
  assert.deepEqual(TC.buildDaySchedule(slot, '2026-03-10').blocks, [], 'not on the note\'s own day');
  assert.deepEqual(ids(TC.buildDaySchedule(slot, '2026-03-12').blocks), ['n:p']);
});

test('dlStrandedBlockDays names every block day an un-pick or a move would orphan', () => {
  const all = ['2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09'];
  const d = F.deadline('d', '2026-03-10', {
    cautionDates: all, time: '17:00', blockDate: '2026-03-06',
    parts: [{ id: 'a', title: 'x', date: '2026-03-07' }, { id: 'b', title: 'y' }]
  });
  // the set it is stored with strands nothing
  assert.deepEqual(TC.dlStrandedBlockDays(d, null), []);
  assert.deepEqual(TC.dlStrandedBlockDays(d, { cautionDates: all, date: '2026-03-10' }), []);

  // UN-PICKING a day that holds a block, and one that holds a part. This is
  // the case the old contiguous span could not express: 03-06 is un-picked
  // while 03-05 and 03-07 stay, so the orphaned day is in the MIDDLE of the
  // remaining set rather than off one end.
  assert.deepEqual(TC.dlStrandedBlockDays(d, { cautionDates: all.filter(x => x !== '2026-03-06') }),
    ['2026-03-06']);
  assert.deepEqual(TC.dlStrandedBlockDays(d, { cautionDates: ['2026-03-05', '2026-03-08', '2026-03-09'] }),
    ['2026-03-06', '2026-03-07']);
  assert.deepEqual(TC.dlStrandedBlockDays(d, { cautionDates: [] }),
    ['2026-03-06', '2026-03-07'], 'clearing every day strands both');

  // pulling the due day back past the undated part, which sits on the block day
  assert.deepEqual(TC.dlStrandedBlockDays(d, { cautionDates: ['2026-03-05'], date: '2026-03-05' }),
    ['2026-03-06', '2026-03-07']);

  // a blockOff deadline has no block to strand, so no edit is ever refused
  assert.deepEqual(TC.dlStrandedBlockDays({ ...d, blockOff: true }, { cautionDates: [] }), []);

  // THE case that a due-day move depends on. With no blockDate and no parts the
  // block sits on the item's OWN date, so it MOVES WITH a due-day change and
  // cannot be stranded by one. Reading the stored blockDay here instead would
  // report the old due day as orphaned and refuse every move of an un-anchored
  // deadline — which is exactly what it did until a browser case caught it.
  const unanchored = F.deadline('u', '2026-03-10', { cautionDates: ['2026-03-08'], time: '17:00' });
  assert.deepEqual(TC.dlStrandedBlockDays(unanchored, { date: '2026-03-22' }), [],
    'moving the due day carries the automatic block with it');
  assert.deepEqual(TC.dlStrandedBlockDays(unanchored, { date: '2026-03-09' }), [],
    'in either direction');
  assert.deepEqual(TC.dlStrandedBlockDays(unanchored, { cautionDates: [] }), [],
    'and un-picking every caution day cannot strand it either — it is on the due day');
  // ...while an ANCHORED block is still checked against the proposed due day
  const anchored = F.deadline('a', '2026-03-10',
    { cautionDates: ['2026-03-08'], time: '17:00', blockDate: '2026-03-08' });
  assert.deepEqual(TC.dlStrandedBlockDays(anchored, { date: '2026-03-22' }), [],
    '03-08 is still a chosen day, so the move is fine');
  assert.deepEqual(TC.dlStrandedBlockDays(anchored, { cautionDates: [] }), ['2026-03-08'],
    'but un-picking the day it sits on strands it');

  // and the plain deadline every form starts from — no chosen days at all —
  // strands nothing, because its block sits on the due day it always occupies
  assert.deepEqual(
    TC.dlStrandedBlockDays(F.deadline('p', '2026-03-10', { cautionDates: [] }), { cautionDates: [] }), []);

  // MEMBERSHIP, not a range: 03-04 is outside, 03-11 is outside, and so is a
  // day that merely falls BETWEEN two chosen ones.
  assert.equal(TC.dlBlockDayValid(d, '2026-03-06', null), true);
  assert.equal(TC.dlBlockDayValid(d, '2026-03-10', null), true, 'the due day is always allowed');
  assert.equal(TC.dlBlockDayValid(d, '2026-03-04', null), false);
  assert.equal(TC.dlBlockDayValid(d, '2026-03-11', null), false);
  assert.equal(TC.dlBlockDayValid(d, '', null), false);
  const gapped = F.deadline('g', '2026-03-10', { cautionDates: ['2026-03-05', '2026-03-09'] });
  assert.equal(TC.dlBlockDayValid(gapped, '2026-03-07', null), false,
    'a day inside the old span but outside the chosen set is REFUSED — the whole point');
  // a legacy record is gated through the same door, on its expanded span
  const legacy = F.legacyDeadline('l', '2026-03-10', '2026-03-08');
  assert.equal(TC.dlBlockDayValid(legacy, '2026-03-08', null), true);
  assert.equal(TC.dlBlockDayValid(legacy, '2026-03-07', null), false);
});

test('itemParts tolerates every malformed stored value', () => {
  assert.deepEqual(TC.itemParts({ parts: [{ id: 'a' }, null, 'junk', 7, [], undefined] }).map(p => p.id), ['a']);
  for (const v of [undefined, null, 'x', 7, {}, true]) assert.deepEqual(TC.itemParts({ parts: v }), []);
  assert.deepEqual(TC.itemParts(null), []);
  assert.deepEqual(TC.itemParts(undefined), []);
});

test('note and deadline blocks join overlap layout with real schedule blocks', () => {
  const slot = F.emptySlot({
    goals: [F.task('t', { scheduledDate: '2026-03-10', scheduledTime: '16:00', duration: 60 })],
    calendarNotes: [F.calNote('n', '2026-03-10', { time: '16:00', blockDuration: 60 })],
    deadlines: [F.deadline('d', '2026-03-10', { startDate: '2026-03-08', time: '17:00', blockDuration: 60 })]
  });
  const day = TC.buildDaySchedule(slot, '2026-03-10');
  const laid = day.blocks.map(b => {
    const [h, m] = b.time.split(':').map(Number);
    return { id: b.id, top: h * 60 + m, height: b.duration };
  });
  const info = TC.overlapInfo(laid);
  assert.deepEqual(info.d.sort(), ['d', 'n', 't'],
    'all three share 16:00–17:00 and are laid out side by side');
});

test('a block is filtered by origin like the item that owns it', () => {
  const slot = F.emptySlot({
    deadlines: [
      F.deadline('sched', '2026-03-10', { startDate: '2026-03-10', time: '17:00', blockDuration: 60 }),
      F.deadline('doc', '2026-03-10', { startDate: '2026-03-10', time: '12:00', blockDuration: 30, docPageId: 'p-1' })
    ]
  });
  assert.deepEqual(ids(TC.buildDaySchedule(slot, '2026-03-10', { hidden: ['doc'] }).blocks), ['sched']);
  assert.deepEqual(ids(TC.buildDaySchedule(slot, '2026-03-10', { hidden: ['deadline'] }).blocks), ['doc']);
  assert.deepEqual(TC.buildDaySchedule(slot, '2026-03-10', { hidden: ['deadline', 'doc'] }).blocks, []);
});

// ── daysBetween ────────────────────────────────────────────────────────────

test('daysBetween walks local calendar days inclusively', () => {
  assert.deepEqual(TC.daysBetween('2026-03-08', '2026-03-11'),
    ['2026-03-08', '2026-03-09', '2026-03-10', '2026-03-11']);
  assert.deepEqual(TC.daysBetween('2026-03-10', '2026-03-10'), ['2026-03-10']);
  assert.deepEqual(TC.daysBetween('2026-03-11', '2026-03-10'), [], 'an inverted range is empty');
});

test('daysBetween crosses month, year, leap-day and DST boundaries', () => {
  assert.deepEqual(TC.daysBetween('2026-02-27', '2026-03-01'), ['2026-02-27', '2026-02-28', '2026-03-01']);
  assert.deepEqual(TC.daysBetween('2024-02-28', '2024-03-01'), ['2024-02-28', '2024-02-29', '2024-03-01']);
  assert.deepEqual(TC.daysBetween('2025-12-31', '2026-01-01'), ['2025-12-31', '2026-01-01']);
  // a 23-hour and a 25-hour local day: stepping from a noon anchor cannot skip
  // or repeat one, which plain +86400000 arithmetic would
  assert.deepEqual(TC.daysBetween('2026-03-07', '2026-03-09'), ['2026-03-07', '2026-03-08', '2026-03-09']);
  assert.deepEqual(TC.daysBetween('2026-10-31', '2026-11-02'), ['2026-10-31', '2026-11-01', '2026-11-02']);
  assert.equal(TC.daysBetween('2026-01-01', '2026-12-31').length, 365);
  assert.equal(TC.daysBetween('2024-01-01', '2024-12-31').length, 366);
});

test('daysBetween refuses malformed input instead of spinning', () => {
  assert.deepEqual(TC.daysBetween('garbage', '2026-03-10'), []);
  assert.deepEqual(TC.daysBetween('2026-03-10', 'garbage'), []);
  assert.deepEqual(TC.daysBetween('2026-3-10', '2026-03-12'), [], 'an unpadded day is not a day string');
  assert.deepEqual(TC.daysBetween(null, undefined), []);
  assert.deepEqual(TC.daysBetween('', ''), []);
});

// ── deadlines ──────────────────────────────────────────────────────────────

test('the caution list holds exactly the chosen days, and never the due day', () => {
  const slot = F.emptySlot({
    deadlines: [F.deadline('d', '2026-03-10', { cautionDates: ['2026-03-06', '2026-03-09'] })]
  });
  const on = ds => TC.buildDaySchedule(slot, ds);

  assert.deepEqual(ids(on('2026-03-06').deadlinesCaution), ['d'], 'the first chosen day');
  assert.deepEqual(ids(on('2026-03-07').deadlinesCaution), [],
    'a GAP between two chosen days is not a caution day — this is the whole feature');
  assert.deepEqual(ids(on('2026-03-08').deadlinesCaution), [], 'nor is the second gap day');
  assert.deepEqual(ids(on('2026-03-09').deadlinesCaution), ['d'], 'the second chosen day');
  assert.deepEqual(ids(on('2026-03-10').deadlines), ['d'], 'the due day lists it as due');
  assert.deepEqual(ids(on('2026-03-10').deadlinesCaution), [], 'and NOT also as caution');
  assert.deepEqual(ids(on('2026-03-11').deadlinesCaution), []);
});

test('dlCautionDays: the chosen list wins, and an empty one is a real answer', () => {
  const chosen = { date: '2026-03-10', cautionDates: ['2026-03-09', '2026-03-06'] };
  assert.deepEqual(TC.dlCautionDays(chosen), ['2026-03-06', '2026-03-09'], 'sorted, whatever the order stored');

  // An EMPTY list is a value, not an absence: it must short-circuit the legacy
  // branch, or clearing every day on a record that still carries `startDate`
  // would resurrect the span the user just cleared.
  const clearedLegacy = { date: '2026-03-10', startDate: '2026-03-05', cautionDates: [] };
  assert.deepEqual(TC.dlCautionDays(clearedLegacy), [],
    'cautionDates: [] beats a leftover startDate rather than falling through to it');

  // ...and a list that is present but not empty beats it too.
  const bothKeys = { date: '2026-03-10', startDate: '2026-03-05', cautionDates: ['2026-03-08'] };
  assert.deepEqual(TC.dlCautionDays(bothKeys), ['2026-03-08']);

  assert.deepEqual(TC.dlCautionDays({ date: '2026-03-10' }), [],
    'no key at all means no caution days');
});

/* The legacy branch is NOT dead code, and this case is why it must stay. The
   migration converts records already in storage, but an old export imported
   later, a second device still running the previous version, and a migration
   write the quota refused all deliver a `startDate` span to this resolver. */
test('dlCautionDays expands a legacy startDate span, minus the due day', () => {
  const legacy = F.legacyDeadline('d', '2026-03-10', '2026-03-08');
  assert.deepEqual(TC.dlCautionDays(legacy), ['2026-03-08', '2026-03-09'],
    'every day of the old span except the due day itself');

  const zero = F.legacyDeadline('z', '2026-03-10', '2026-03-10');
  assert.deepEqual(TC.dlCautionDays(zero), [],
    'the old zero-length default becomes no caution days, which is the same thing');

  // An inverted legacy span used to silently erase the run-up; it still does,
  // and still cannot throw. daysBetween bails on from > to.
  const inverted = F.legacyDeadline('i', '2026-03-08', '2026-03-10');
  assert.deepEqual(TC.dlCautionDays(inverted), []);

  const slot = F.emptySlot({ deadlines: [legacy] });
  assert.deepEqual(ids(TC.buildDaySchedule(slot, '2026-03-09').deadlinesCaution), ['d'],
    'and an un-migrated record still renders its run-up on every surface');
});

test('dlCautionDays sanitises anything a hand edit or an import can deliver', () => {
  const due = '2026-03-10';
  const of = cautionDates => TC.dlCautionDays({ date: due, cautionDates });

  assert.deepEqual(of(['2026-03-09', '2026-03-09', '2026-03-08']), ['2026-03-08', '2026-03-09'],
    'duplicates collapse');
  assert.deepEqual(of(['2026-03-10']), [], 'the due day can never be a caution day');
  assert.deepEqual(of(['2026-03-11']), [], 'nor can a day after it');
  assert.deepEqual(of(['2026-3-08', 'nonsense', '', null, 42, {}, ['2026-03-08']]), [],
    'a malformed entry is dropped rather than rendered on a day that does not exist');
  assert.deepEqual(of(['2026-03-08', 'nonsense']), ['2026-03-08'],
    'and one bad entry does not poison the good ones');
  assert.deepEqual(of('2026-03-08'), [], 'a non-array with no startDate behind it yields nothing');
  assert.deepEqual(TC.dlCautionDays({ date: 'nonsense', cautionDates: ['2026-03-08'] }), [],
    'a malformed DUE day yields nothing — there is nothing to be before');
  assert.deepEqual(TC.dlCautionDays(null), []);
  assert.deepEqual(TC.dlCautionDays(undefined), []);
});

test('dlCautionSet, dlCautionCount and dlInCaution read the same list', () => {
  const d = { date: '2026-03-10', cautionDates: ['2026-03-06', '2026-03-09'] };
  assert.equal(TC.dlCautionCount(d), 2);
  assert.ok(TC.dlCautionSet(d).has('2026-03-06'));
  assert.ok(!TC.dlCautionSet(d).has('2026-03-07'));
  assert.equal(TC.dlInCaution(d, '2026-03-06'), true);
  assert.equal(TC.dlInCaution(d, '2026-03-07'), false, 'a gap day is not in caution');
  assert.equal(TC.dlInCaution(d, '2026-03-10'), false,
    'and neither is the due day — it is red, never amber');
  assert.equal(TC.dlCautionCount({ date: '2026-03-10' }), 0);
});

test('dlStart is the earliest day the deadline occupies, not a period boundary', () => {
  assert.equal(TC.dlStart({ date: '2026-03-10', cautionDates: ['2026-03-09', '2026-03-06'] }), '2026-03-06');
  assert.equal(TC.dlStart({ date: '2026-03-10', cautionDates: [] }), '2026-03-10',
    'with nothing chosen the deadline occupies its due day alone');
  assert.equal(TC.dlStart({ date: '2026-03-10' }), '2026-03-10');
  assert.equal(TC.dlStart(F.legacyDeadline('d', '2026-03-10', '2026-03-08')), '2026-03-08');
});

/* THE writer. Both of its rules are load-bearing and neither is obvious, so
   they are pinned here rather than left to the picker that calls it. */
test('dlWithCautionDays deletes startDate and always stores a list', () => {
  const legacy = F.legacyDeadline('d', '2026-03-10', '2026-03-05',
    { docPageId: 'p-1', done: true, blockDuration: 90, createdAt: 12345 });

  const out = TC.dlWithCautionDays(legacy, ['2026-03-09', '2026-03-06', '2026-03-06']);
  assert.deepEqual(out.cautionDates, ['2026-03-06', '2026-03-09'], 'sorted and de-duplicated');
  assert.ok(!('startDate' in out),
    'the legacy key is DELETED, so a record migrates by the act of being edited');
  // everything else is spread through — rebuilding from a field list is the bug
  // that cost this project day notes and deadlines before
  assert.equal(out.id, 'd');
  assert.equal(out.docPageId, 'p-1');
  assert.equal(out.done, true);
  assert.equal(out.blockDuration, 90);
  assert.equal(out.createdAt, 12345);
  assert.equal(out.date, '2026-03-10');
  assert.equal(out.time, '17:00');

  const cleared = TC.dlWithCautionDays(legacy, []);
  assert.deepEqual(cleared.cautionDates, [], 'clearing STORES [] rather than deleting the key');
  assert.ok('cautionDates' in cleared,
    'because a deleted key would fall back to the span that was just cleared');
  assert.ok(!('startDate' in cleared));
  assert.deepEqual(TC.dlCautionDays(cleared), [], 'and the resolver agrees it is empty');

  assert.deepEqual(TC.dlWithCautionDays(legacy, ['2026-03-10', '2026-03-11', 'junk']).cautionDates, [],
    'a caller cannot store the due day, a later day, or a malformed one');
  assert.deepEqual(TC.dlWithCautionDays(legacy, null).cautionDates, []);

  // pure: the record handed in is never touched
  assert.equal(legacy.startDate, '2026-03-05', 'the input is left alone');
});

test('dlToggleCautionDay adds then removes the same day', () => {
  const d = F.deadline('d', '2026-03-10', { cautionDates: ['2026-03-08'] });
  const added = TC.dlToggleCautionDay(d, '2026-03-06');
  assert.deepEqual(added.cautionDates, ['2026-03-06', '2026-03-08']);
  const removed = TC.dlToggleCautionDay(added, '2026-03-06');
  assert.deepEqual(removed.cautionDates, ['2026-03-08'], 'toggling twice is a no-op');
  assert.deepEqual(TC.dlToggleCautionDay(removed, '2026-03-08').cautionDates, [],
    'and the last one leaves a stored empty list');
  // toggling a legacy record materialises the span first, then edits it
  const legacy = TC.dlToggleCautionDay(F.legacyDeadline('l', '2026-03-10', '2026-03-08'), '2026-03-05');
  assert.deepEqual(legacy.cautionDates, ['2026-03-05', '2026-03-08', '2026-03-09']);
  assert.ok(!('startDate' in legacy));
});

test('dlDone reads an absent, false, and true tick alike', () => {
  assert.equal(TC.dlDone({ date: '2026-03-10' }), false, 'an untouched deadline is not done');
  assert.equal(TC.dlDone({ date: '2026-03-10', done: false }), false);
  assert.equal(TC.dlDone({ date: '2026-03-10', done: true }), true);
});

test('a ticked deadline drops out of the caution list but stays on its due day', () => {
  const slot = F.emptySlot({
    deadlines: [F.deadline('d', '2026-03-10', { cautionDates: ['2026-03-08', '2026-03-09'], done: true })]
  });
  const on = ds => TC.buildDaySchedule(slot, ds);

  // EVERY chosen day, not just the first: a stray "!" left on one day is the
  // whole failure mode this feature exists to prevent.
  assert.deepEqual(ids(on('2026-03-08').deadlinesCaution), [], 'no "!" on the first chosen day');
  assert.deepEqual(ids(on('2026-03-09').deadlinesCaution), [], 'nor on the second');
  assert.deepEqual(ids(on('2026-03-10').deadlines), ['d'], 'the deadline itself is left');
});

test('GUARD: ticking suppresses the chosen days without altering them', () => {
  // This is what makes unticking a pure restore rather than a guess: `done`
  // changes what is RENDERED, never what is stored about the days.
  const dl = F.deadline('d', '2026-03-10', { cautionDates: ['2026-03-06', '2026-03-09'], done: true });
  assert.deepEqual(TC.dlCautionDays(dl), ['2026-03-06', '2026-03-09'], 'the days survive the tick');
  assert.equal(TC.dlCautionCount(dl), 2, 'and so does the count');
  assert.equal(TC.dlStart(dl), '2026-03-06');
  assert.equal(TC.dlInCaution(dl, '2026-03-09'), true,
    'the day is still chosen — only deadlinesCaution declines to show it');

  const unticked = Object.assign({}, dl, { done: false });
  const slot = F.emptySlot({ deadlines: [unticked] });
  assert.deepEqual(ids(TC.buildDaySchedule(slot, '2026-03-09').deadlinesCaution), ['d'],
    'unticking brings the same days back');
  assert.deepEqual(ids(TC.buildDaySchedule(slot, '2026-03-07').deadlinesCaution), [],
    'and brings back only those — the gaps stay gaps');
});

test('a ticked deadline is still filtered by origin like any other', () => {
  const slot = F.emptySlot({
    deadlines: [F.deadline('dl-doc', '2026-03-10',
      { cautionDates: ['2026-03-08'], docPageId: 'p-1', done: true })]
  });
  const hidden = TC.buildDaySchedule(slot, '2026-03-10', { hidden: ['doc'] });
  assert.deepEqual(ids(hidden.deadlines), [], 'hiding doc still hides a ticked doc-authored one');
  assert.deepEqual(ids(TC.buildDaySchedule(slot, '2026-03-10').deadlines), ['dl-doc']);
});

test('deadlines sort by time on the day, and by date then time in the caution list', () => {
  const slot = F.emptySlot({
    deadlines: [
      F.deadline('late', '2026-03-10', { time: '17:00' }),
      F.deadline('early', '2026-03-10', { time: '08:00' }),
      F.deadline('far', '2026-03-12', { time: '08:00', cautionDates: ['2026-03-09'] }),
      F.deadline('near', '2026-03-11', { time: '23:00', cautionDates: ['2026-03-09'] })
    ]
  });
  assert.deepEqual(ids(TC.buildDaySchedule(slot, '2026-03-10').deadlines), ['early', 'late']);
  assert.deepEqual(ids(TC.buildDaySchedule(slot, '2026-03-09').deadlinesCaution), ['near', 'far'],
    'the nearest due date leads the caution list');
});

test('dlValid rejects every malformed draft', () => {
  const ok = { title: 'Ship it', time: '09:00' };
  assert.equal(TC.dlValid(ok), true, 'a title and a due time are the whole contract now');

  assert.equal(TC.dlValid(Object.assign({}, ok, { title: '' })), false);
  assert.equal(TC.dlValid(Object.assign({}, ok, { title: '   ' })), false);
  assert.equal(TC.dlValid(Object.assign({}, ok, { title: undefined })), false);
  assert.equal(TC.dlValid(Object.assign({}, ok, { time: '9:00' })), false);
  assert.equal(TC.dlValid(Object.assign({}, ok, { time: '0900' })), false);
  assert.equal(TC.dlValid(Object.assign({}, ok, { time: undefined })), false);
  assert.equal(TC.dlValid(null), false, 'and it never throws on a missing draft');
});

/* The compose forms on both authoring pages type the due day rather than
   taking it from the calendar cell they were opened on, which makes each of
   them a writer of `date`. The format check is what stops a blank field
   reaching storage; there is no second date left to order it against. */
test('dlDraftValid gates a draft that carries its own due day', () => {
  const ok = { title: 'Ship it', time: '09:00', date: '2026-03-10' };
  assert.equal(TC.dlDraftValid(ok), true);

  assert.equal(TC.dlDraftValid(Object.assign({}, ok, { date: '' })), false,
    'a blank due day is refused');
  assert.equal(TC.dlDraftValid(Object.assign({}, ok, { date: undefined })), false);
  assert.equal(TC.dlDraftValid(Object.assign({}, ok, { date: '2026-3-10' })), false);
  assert.equal(TC.dlDraftValid(Object.assign({}, ok, { date: 'nonsense' })), false);

  // everything dlValid already refuses, it still refuses through this door
  assert.equal(TC.dlDraftValid(Object.assign({}, ok, { title: '  ' })), false);
  assert.equal(TC.dlDraftValid(Object.assign({}, ok, { time: '9:00' })), false);
  assert.equal(TC.dlDraftValid(null), false);
});

test('dayShift crosses month, year, leap-day and DST boundaries', () => {
  assert.equal(TC.dayShift('2026-03-10', -3), '2026-03-07');
  assert.equal(TC.dayShift('2026-03-02', -4), '2026-02-26', 'across a non-leap February');
  assert.equal(TC.dayShift('2024-03-02', -5), '2024-02-26', 'across a leap February');
  assert.equal(TC.dayShift('2026-01-02', -3), '2025-12-30', 'across a year boundary');
  assert.equal(TC.dayShift('2026-03-09', -2), '2026-03-07', 'across US spring-forward');
  assert.equal(TC.dayShift('2026-11-02', -2), '2026-10-31', 'across US fall-back');
  assert.equal(TC.dayShift('2026-03-30', -2), '2026-03-28', 'across EU spring-forward');
  assert.equal(TC.dayShift('2026-04-06', -2), '2026-04-04', 'across southern-hemisphere transitions');
  assert.equal(TC.dayShift('2026-03-10', 0), '2026-03-10');
  assert.equal(TC.dayShift('nonsense', -1), null, 'and a malformed day yields null, never a Date');
  assert.equal(TC.dayShift('', -1), null);
});

/* A guard, and the reason the whole inverted-span hazard class is gone. The
   old contract had TWO stored dates with an ordering rule between them, which
   nothing validated on a stored record; an inverted pair silently erased the
   run-up on all five surfaces and soft-locked an edit form. A chosen day list
   cannot be inverted — there is no second date — and any entry that would have
   been out of order is dropped by the resolver instead. */
test('GUARD: nothing a caution list can hold reproduces the inverted span', () => {
  const backwards = { date: '2026-03-08', cautionDates: ['2026-03-10', '2026-03-09'] };
  const slot = F.emptySlot({ deadlines: [F.deadline('d', '2026-03-08', { cautionDates: ['2026-03-10'] })] });

  assert.deepEqual(TC.dlCautionDays(backwards), [],
    'days at or after the due day are dropped, not stored as a negative span');
  assert.equal(TC.dlCautionCount(backwards), 0, 'a count, never a negative number');
  assert.equal(TC.dlStart(backwards), '2026-03-08', 'and the due day is still the earliest day');
  for (const ds of ['2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10', '2026-03-11']) {
    assert.equal(TC.dlInCaution(backwards, ds), false);
    assert.deepEqual(ids(TC.buildDaySchedule(slot, ds).deadlinesCaution), []);
  }
  assert.deepEqual(ids(TC.buildDaySchedule(slot, '2026-03-08').deadlines), ['d'],
    'the deadline itself is still drawn on its due day');
  // and the writer cannot put one back
  assert.deepEqual(TC.dlWithCautionDays(backwards, ['2026-03-10']).cautionDates, []);
});

// ── MG focus carry-forward ─────────────────────────────────────────────────

test('mgsForDay carries the last set focus forward for up to 30 days', () => {
  const sched = { '2026-03-01': [10, 11] };
  assert.deepEqual(TC.mgsForDay('2026-03-01', sched), [10, 11], 'an exact hit');
  assert.deepEqual(TC.mgsForDay('2026-03-02', sched), [10, 11], 'one day later');
  assert.deepEqual(TC.mgsForDay('2026-03-31', sched), [10, 11], 'exactly 30 days later still carries');
  assert.deepEqual(TC.mgsForDay('2026-04-01', sched), [], '31 days later has expired');
  assert.deepEqual(TC.mgsForDay('2026-02-28', sched), [], 'it never carries backwards');
});

test('MG carry-forward crosses month and year boundaries', () => {
  assert.deepEqual(TC.mgsForDay('2026-01-05', { '2025-12-28': [1] }), [1], 'across new year');
  assert.deepEqual(TC.mgsForDay('2026-03-02', { '2026-02-28': [2] }), [2], 'across a non-leap February');
  assert.deepEqual(TC.mgsForDay('2024-03-01', { '2024-02-29': [3] }), [3], 'across a leap day');
  assert.deepEqual(TC.mgsForDay('2026-03-10', {}), [], 'an empty schedule carries nothing');
});

test('an explicitly emptied day stops the carry', () => {
  const sched = { '2026-03-01': [10], '2026-03-05': [] };
  assert.deepEqual(TC.mgsForDay('2026-03-04', sched), [10]);
  assert.deepEqual(TC.mgsForDay('2026-03-05', sched), [], 'the empty entry is an answer, not a miss');
  assert.deepEqual(TC.mgsForDay('2026-03-06', sched), [], 'and it carries forward as empty');
});

test('buildDaySchedule flags a carried MG focus but not a set one', () => {
  const slot = F.emptySlot({ mms: [F.mm(11, 'Mind Map B')], mgSchedule: { '2026-03-01': [11] } });
  const set = TC.buildDaySchedule(slot, '2026-03-01');
  assert.deepEqual(set.mgs, ['Mind Map B']);
  assert.equal(set.mgCarried, false, 'the day it was set is not carried');

  const carried = TC.buildDaySchedule(slot, '2026-03-04');
  assert.deepEqual(carried.mgs, ['Mind Map B']);
  assert.equal(carried.mgCarried, true);

  const expired = TC.buildDaySchedule(slot, '2026-04-05');
  assert.deepEqual(expired.mgs, []);
  assert.equal(expired.mgCarried, false, 'nothing carried means nothing to flag');

  const hidden = TC.buildDaySchedule(slot, '2026-03-04', { hidden: ['mg'] });
  assert.deepEqual(hidden.mgs, []);
  assert.equal(hidden.mgCarried, false);
});

// ── geometry helpers ───────────────────────────────────────────────────────

test('overlapInfo groups intersecting blocks into connected components', () => {
  const info = TC.overlapInfo([
    { id: 'a', top: 0, height: 30 },
    { id: 'b', top: 20, height: 30 },
    { id: 'c', top: 100, height: 10 }
  ]);
  assert.deepEqual(info.a, ['a', 'b']);
  assert.deepEqual(info.b, ['a', 'b']);
  assert.equal(info.c, undefined, 'a block that overlaps nothing is not in the map');
});

test('overlapInfo joins a chain transitively and ignores touching edges', () => {
  const chain = TC.overlapInfo([
    { id: 'a', top: 0, height: 20 },
    { id: 'b', top: 15, height: 20 },
    { id: 'c', top: 30, height: 20 }
  ]);
  assert.deepEqual(chain.a, ['a', 'b', 'c'], 'a and c never touch but share a component through b');

  const touching = TC.overlapInfo([
    { id: 'a', top: 0, height: 20 },
    { id: 'b', top: 20, height: 10 }
  ]);
  assert.deepEqual(touching, {}, 'a block starting exactly where another ends does not overlap');
  assert.deepEqual(TC.overlapInfo([]), {});
});

test('durLabel', () => {
  assert.equal(TC.durLabel(0), '0min');
  assert.equal(TC.durLabel(30), '30min');
  assert.equal(TC.durLabel(59), '59min');
  assert.equal(TC.durLabel(60), '1h');
  assert.equal(TC.durLabel(90), '1h 30min');
  assert.equal(TC.durLabel(125), '2h 5min');
  assert.equal(TC.durLabel(1440), '24h');
});

// ── legacy and malformed slots ─────────────────────────────────────────────

test('a bare slot returns empty structures rather than throwing', () => {
  for (const slot of [{}, { goals: [] }, F.emptySlot()]) {
    assert.deepEqual(TC.buildBuckets(slot, 2026, 2), {});
    assert.deepEqual(TC.buildMilestoneLanes(slot, 2026, 2), { lanesByDate: {}, laneCount: 0 });
    const day = TC.buildDaySchedule(slot, '2026-03-10');
    assert.deepEqual(day.blocks, []);
    assert.deepEqual(day.sir, []);
    assert.deepEqual(day.calNotes, []);
    assert.deepEqual(day.calNotesAll, []);
    assert.deepEqual(day.deadlines, []);
    assert.deepEqual(day.deadlinesCaution, []);
    assert.deepEqual(day.mgs, []);
    assert.equal(day.mgCarried, false);
  }
});

test('a pre-calendar-block slot works without calendarNotes, deadlines or docPages', () => {
  // the shape stored before those fields existed — they must be absent, not empty
  const legacy = {
    id: 'slot-legacy', name: 'Legacy', createdAt: '2025-01-01',
    sessions: [F.session(1, '2026-03-10', 10)],
    mms: [F.mm(10, 'Mind Map A')],
    kolbs: [F.kolb(2, '2026-03-05')],
    mgChanges: [], goals: [], saActions: [], saEntries: []
  };
  assert.equal(Object.prototype.hasOwnProperty.call(legacy, 'calendarNotes'), false);
  const day = TC.buildDaySchedule(legacy, '2026-03-10');
  assert.equal(day.sir.length, 1, 'the data it does have still renders');
  assert.deepEqual(day.calNotes, []);
  assert.deepEqual(day.deadlines, []);
  assert.equal(TC.buildBuckets(legacy, 2026, 2)['2026-03-05'].kolbmg.length, 1);
});

test('collectors never mutate the slot they are given', () => {
  const slot = F.populatedSlot();
  const before = JSON.stringify(slot);
  TC.buildBuckets(slot, 2026, 2);
  TC.buildMilestoneLanes(slot, 2026, 2);
  TC.buildDaySchedule(slot, '2026-03-10');
  TC.buildDaySchedule(slot, '2026-03-10', { hidden: ['doc'] });
  assert.equal(JSON.stringify(slot), before, 'calendar-core.js is read-only by contract');
});

/* ── what the Documentations caution picker leans on ───────────────────────
   Both cases below are GUARDS: they pass before and after that picker exists,
   and they are here so the two properties it depends on cannot be tidied away
   without something failing. Neither is fail-first evidence; the browser cases
   are. */

test('GUARD: dlStrandedBlockDays short-circuits on a record that does not exist yet', () => {
  // This is what lets ONE picker serve both the compose and the edit form with
  // no branch: a deadline being composed has no prep, so there is nothing a
  // pick could strand. Remove the `!d` half of the guard and the compose form
  // throws on its first render instead.
  for (const missing of [undefined, null, false, 0, '']) {
    assert.deepEqual(TC.dlStrandedBlockDays(missing, { cautionDates: [] }), [],
      String(missing) + ' has no prep to strand');
    assert.deepEqual(TC.dlStrandedBlockDays(missing, null), []);
  }
});

test('GUARD: dlWithCautionDays doubles as the draft sanitiser for a typed due day', () => {
  // The compose form holds picks in a draft while the due day is still being
  // typed, so the due day can move BELOW an already-chosen day. Nothing filters
  // that by hand — THE writer is asked what it would store, and the readout and
  // the stored value therefore cannot disagree.
  const draft = ['2026-03-16', '2026-03-14', '2026-03-16', 'nonsense', '2026-03-20'];
  assert.deepEqual(TC.dlWithCautionDays({ date: '2026-03-18' }, draft).cautionDates,
    ['2026-03-14', '2026-03-16'],
    'sorted, de-duplicated, malformed dropped, and nothing on or after the due day');
  assert.deepEqual(TC.dlWithCautionDays({ date: '2026-03-15' }, draft).cautionDates,
    ['2026-03-14'],
    'pulling the due day back drops the days no longer before it');
  assert.deepEqual(TC.dlWithCautionDays({ date: '' }, draft).cautionDates, [],
    'and a due day not typed yet yields nothing rather than throwing');
  // the empty list is a REAL value, never an absent key — a deleted key falls
  // through to the legacy startDate branch and resurrects a cleared span
  assert.equal(Object.prototype.hasOwnProperty.call(
    TC.dlWithCautionDays({ date: '2026-03-18' }, []), 'cautionDates'), true);
});

// ── reference schedules: a pasted timetable ────────────────────────────────
// SWEPT under five timezones on purpose, and this is the half of the feature
// that needs it. schedule-paste-core.js reads the SHAPE of a day cell and is
// run once; everything that turns a weekday into an actual calendar day is
// here, and a weekday is exactly the kind of thing that regresses to a UTC day
// invisibly on a machine running in UTC.

const weekly = (over = {}) => Object.assign(
  { id: 'r-w', dow: 1, time: '09:00', duration: 90, title: 'Mathematics',
    from: '2026-09-07', until: '2026-12-14' }, over);
const oneOff = (over = {}) => Object.assign(
  { id: 'r-o', date: '2026-09-14', time: '13:00', duration: 60, title: 'Makeup' }, over);
const refSlot = (...entries) => ({ refSchedules: entries });

test('a weekly entry occupies EVERY matching weekday inside its range', () => {
  const e = weekly();
  // 2026-09-07 is a Monday; so are the 14th and 21st.
  assert.equal(TC.refOccupies(e, '2026-09-07'), true, 'the first Monday, TZ=' + TZ);
  assert.equal(TC.refOccupies(e, '2026-09-14'), true);
  assert.equal(TC.refOccupies(e, '2026-09-21'), true);
  assert.equal(TC.refOccupies(e, '2026-09-08'), false, 'Tuesday is not Monday');
});

test('a weekly entry stops at both ends of its range, inclusive', () => {
  const e = weekly({ from: '2026-09-14', until: '2026-09-21' });
  assert.equal(TC.refOccupies(e, '2026-09-07'), false, 'before the range');
  assert.equal(TC.refOccupies(e, '2026-09-14'), true, 'the first day is IN');
  assert.equal(TC.refOccupies(e, '2026-09-21'), true, 'the last day is IN');
  assert.equal(TC.refOccupies(e, '2026-09-28'), false, 'after the range');
});

test('an absent bound is open in that direction — a term with no end yet', () => {
  const noEnd = weekly({ until: undefined });
  assert.equal(TC.refOccupies(noEnd, '2031-09-09'), false, 'still only Mondays (the 9th is a Tuesday)');
  assert.equal(TC.refOccupies(noEnd, '2031-09-01'), true, 'a Monday years later');
  const noStart = weekly({ from: undefined, until: '2026-09-14' });
  assert.equal(TC.refOccupies(noStart, '2020-09-07'), true, 'a Monday years earlier');
});

test('a one-off entry occupies its own day and no other', () => {
  const e = oneOff();
  assert.equal(TC.refOccupies(e, '2026-09-14'), true);
  assert.equal(TC.refOccupies(e, '2026-09-21'), false, 'it does NOT repeat weekly');
  assert.equal(TC.refOccupies(e, '2026-09-13'), false);
});

test('an entry carrying BOTH arms, or NEITHER, occupies nothing', () => {
  // Refused rather than resolved by whichever branch runs first. There is no
  // defensible answer to which day such a record belongs to, and inventing one
  // would draw a class on a day the user never wrote down. schema.js reports
  // the same shape as a warning.
  assert.equal(TC.refOccupies({ date: '2026-09-14', dow: 1, time: '09:00' }, '2026-09-14'), false);
  assert.equal(TC.refOccupies({ date: '2026-09-14', dow: 1, time: '09:00' }, '2026-09-21'), false);
  assert.equal(TC.refOccupies({ time: '09:00', title: 'nowhere' }, '2026-09-14'), false);
});

test('refOccupies tolerates anything stored, because stored data is not a promise', () => {
  for (const bad of [null, undefined, 42, 'nope', [], { dow: 7 }, { dow: -1 }, { dow: 1.5 },
    { dow: '1' }, { date: 'someday' }]) {
    assert.equal(TC.refOccupies(bad, '2026-09-14'), false, JSON.stringify(bad) + ' must not occupy a day');
  }
  // and a malformed DAY is refused rather than parsed
  assert.equal(TC.refOccupies(weekly(), 'someday'), false);
  assert.equal(TC.refOccupies(weekly(), ''), false);
});

test('a MALFORMED range bound is read as OPEN, not as "occupies nothing"', () => {
  // A decision worth stating rather than leaving to whichever branch runs
  // first. The house rule for a malformed value that reaches geometry is to
  // fall back to the DEFAULT behaviour, not to vanish — blockDate does exactly
  // this, falling back to the item's own day. Absence of a bound means "open",
  // so damage to a bound means "open" too.
  //
  // The alternative was tempting because the blast radius is bigger here: an
  // unbounded weekly entry draws on every matching weekday the user scrolls
  // to. It was rejected anyway. A backdrop drawn too often is noisy, visible,
  // and deleted in one click; an entry that occupies nothing is INVISIBLE, and
  // the user cannot act on what they cannot see. schema.js warns about the
  // malformed value, so they are told which record is wrong.
  const broken = weekly({ from: 'x', until: 'y' });
  assert.equal(TC.refOccupies(broken, '2026-09-14'), true, 'still drawn, still a Monday');
  assert.equal(TC.refOccupies(broken, '2026-09-15'), false, 'and still only on Mondays');
});

test('SUNDAY IS ZERO and is not mistaken for absent', () => {
  // The classic falsy-zero trap: `if (entry.dow)` would make every Sunday
  // class fall through to the "neither arm" refusal and vanish.
  const sun = weekly({ dow: 0, from: '2026-09-01', until: '2026-09-30' });
  assert.equal(TC.refOccupies(sun, '2026-09-06'), true, '2026-09-06 is a Sunday, TZ=' + TZ);
  assert.equal(TC.refOccupies(sun, '2026-09-07'), false);
});

test('a weekly entry crosses a MONTH boundary without drifting', () => {
  const e = weekly({ from: '2026-09-28', until: '2026-10-12' });
  assert.deepEqual(
    ['2026-09-28', '2026-10-05', '2026-10-12'].map(ds => TC.refOccupies(e, ds)),
    [true, true, true], 'consecutive Mondays across the month end, TZ=' + TZ);
});

test('a weekly entry crosses a YEAR boundary without drifting', () => {
  const e = weekly({ from: '2026-12-21', until: '2027-01-11' });
  assert.deepEqual(
    ['2026-12-21', '2026-12-28', '2027-01-04', '2027-01-11'].map(ds => TC.refOccupies(e, ds)),
    [true, true, true, true], 'consecutive Mondays across the year end, TZ=' + TZ);
});

test('a weekly entry crosses a DST transition without drifting', () => {
  // America/Los_Angeles springs forward on 2026-03-08 and falls back on
  // 2026-11-01, both Sundays. A Monday entry spanning either must still land
  // on Mondays — this is the case a naive +7*86400000 loop gets wrong.
  const e = weekly({ from: '2026-03-02', until: '2026-03-16' });
  assert.deepEqual(
    ['2026-03-02', '2026-03-09', '2026-03-16'].map(ds => TC.refOccupies(e, ds)),
    [true, true, true], 'Mondays across the spring-forward, TZ=' + TZ);
  const f = weekly({ from: '2026-10-26', until: '2026-11-09' });
  assert.deepEqual(
    ['2026-10-26', '2026-11-02', '2026-11-09'].map(ds => TC.refOccupies(f, ds)),
    [true, true, true], 'Mondays across the fall-back, TZ=' + TZ);
});

test('refSpan floors a missing or malformed duration at the shared default', () => {
  assert.deepEqual(TC.refSpan(weekly()), { time: '09:00', duration: 90 });
  assert.deepEqual(TC.refSpan(weekly({ duration: undefined })), { time: '09:00', duration: TC.DEFAULT_BLOCK_MINS });
  assert.deepEqual(TC.refSpan(weekly({ duration: 'ninety' })), { time: '09:00', duration: TC.DEFAULT_BLOCK_MINS });
  assert.deepEqual(TC.refSpan(weekly({ duration: 0 })), { time: '09:00', duration: TC.DEFAULT_BLOCK_MINS });
  // no usable time at all means no block, rather than one at midnight
  assert.equal(TC.refSpan(weekly({ time: undefined })), null);
  assert.equal(TC.refSpan(weekly({ time: 'period 3' })), null);
  assert.equal(TC.refSpan(null), null);
  // An out-of-range time is CLAMPED rather than refused, which is what every
  // other stored time in this file already does. The split is deliberate and
  // is the ordinary validate-on-write / tolerate-on-read one:
  // schedule-paste-core.js REFUSES '25:00' at paste time with the line named,
  // so this path is only ever reached by data that was hand-edited, synced
  // from another version, or imported — and for that, drawing it at the edge
  // of the grid beats making it disappear.
  assert.deepEqual(TC.refSpan(weekly({ time: '25:00' })), { time: '23:55', duration: 90 });
});

test('refOn sorts by time and gives every block a day-qualified id', () => {
  // The id is COMPOSITE because one weekly entry appears on many days at once,
  // and every column of a week view is in the DOM together. A bare entry id
  // could not tell a block drawn on the wrong day from one drawn correctly —
  // the same lesson data-block-day already records for real blocks.
  const slot = refSlot(oneOff(), weekly());
  const got = TC.refOn(slot, '2026-09-14');
  assert.deepEqual(got.map(b => b.id), ['r-w@2026-09-14', 'r-o@2026-09-14']);
  assert.deepEqual(got.map(b => b.time), ['09:00', '13:00'], 'sorted by time');
  assert.equal(got[0].entryId, 'r-w', 'the underlying record is still reachable');
});

test('refOn drops an entry with no usable time rather than drawing it at midnight', () => {
  const slot = refSlot(weekly(), weekly({ id: 'r-bad', time: 'period 3' }));
  assert.deepEqual(TC.refOn(slot, '2026-09-14').map(b => b.entryId), ['r-w']);
});

test('refOn tolerates a missing or malformed refSchedules field', () => {
  // Every slot stored before this field existed has no refSchedules at all.
  for (const slot of [{}, { refSchedules: null }, { refSchedules: 'nope' }, { refSchedules: [null, 7] }]) {
    assert.deepEqual(TC.refOn(slot, '2026-09-14'), [], JSON.stringify(slot));
  }
});

test('the Timetable filter hides reference blocks and nothing else', () => {
  const slot = refSlot(weekly(), oneOff());
  assert.equal(TC.refOn(slot, '2026-09-14', { hidden: ['ref'] }).length, 0);
  assert.equal(TC.refOn(slot, '2026-09-14', { hidden: ['deadline'] }).length, 2, 'another key must not hide these');
  assert.equal(TC.refOn(slot, '2026-09-14', {}).length, 2);
});

test('buildDaySchedule returns reference blocks in their OWN array', () => {
  // Load-bearing. Mixed into `blocks` they would reach overlapInfo and squeeze
  // a real task's width, and every existing consumer would start drawing them
  // by accident rather than opting in.
  const day = TC.buildDaySchedule(refSlot(weekly(), oneOff()), '2026-09-14');
  assert.deepEqual(day.refBlocks.map(b => b.entryId), ['r-w', 'r-o']);
  assert.deepEqual(day.blocks, [], 'not one of them reached the real block list');
});

test('GUARD: reference blocks change nothing about a real day', () => {
  // Passes on both sides by design. If this ever fails, the backdrop has
  // stopped being additive and has started taking a surface away — the "show
  // both, always" rule.
  const base = {
    calendarNotes: [{ id: 'n-1', date: '2026-09-14', title: 'Note', time: '10:00' }],
    deadlines: [{ id: 'd-1', date: '2026-09-14', time: '17:00', title: 'Essay', cautionDates: ['2026-09-13'] }]
  };
  const without = TC.buildDaySchedule(base, '2026-09-14');
  const withRef = TC.buildDaySchedule(Object.assign({}, base, { refSchedules: [weekly(), oneOff()] }), '2026-09-14');

  assert.deepEqual(withRef.blocks, without.blocks, 'the real blocks are byte-for-byte what they were');
  assert.deepEqual(withRef.calNotes, without.calNotes);
  assert.deepEqual(withRef.deadlines, without.deadlines);
  assert.deepEqual(withRef.deadlinesCaution, without.deadlinesCaution);
  assert.deepEqual(withRef.sir, without.sir);
  assert.equal(without.refBlocks.length, 0, 'and a slot with no timetable has an empty array, not undefined');
});
