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
    'goalDone', 'mgsForDay', 'dlStart', 'dlInCaution', 'dlDayCount', 'dlValid', 'originKey',
    'buildBuckets', 'buildMilestoneLanes', 'buildDaySchedule', 'overlapInfo', 'durLabel',
    'noteTimed', 'daysBetween']) {
    assert.equal(typeof TC[name], 'function', name + ' is exported');
  }
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

test('a note without a time stays in the strip and off the grid', () => {
  const slot = F.emptySlot({ calendarNotes: [F.calNote('plain', '2026-03-10')] });
  const day = TC.buildDaySchedule(slot, '2026-03-10');
  assert.deepEqual(ids(day.calNotes), ['plain'], 'the strip lists it');
  assert.deepEqual(ids(day.calNotesAll), ['plain']);
  assert.deepEqual(ids(day.blocks), [], 'and the hour grid does not');
});

test('a note with a time moves to the hour grid and leaves the strip', () => {
  const slot = F.emptySlot({
    calendarNotes: [
      F.calNote('timed', '2026-03-10', { time: '15:00', title: 'Review at 3pm' }),
      F.calNote('plain', '2026-03-10')
    ]
  });
  const day = TC.buildDaySchedule(slot, '2026-03-10');
  assert.deepEqual(ids(day.calNotes), ['plain'], 'the strip keeps only the untimed one');
  assert.deepEqual(ids(day.calNotesAll).sort(), ['plain', 'timed'], 'calNotesAll keeps both');
  assert.deepEqual(ids(day.blocks), ['timed'], 'and exactly one note reaches the grid');

  const b = day.blocks[0];
  assert.equal(b.kind, 'Day note');
  assert.equal(b.time, '15:00');
  assert.equal(b.title, 'Review at 3pm');
  assert.equal(b.done, false);
  assert.ok(b.duration > 0, 'it needs a height');
  assert.equal(b.metaLabel, '15:00', 'but must not claim a duration the user never entered');
  assert.equal(b.item.id, 'timed', 'the whole item rides along, so docPageId is still readable');
});

test('a malformed time keeps the note in the strip rather than at midnight', () => {
  const slot = F.emptySlot({
    calendarNotes: [F.calNote('bad', '2026-03-10', { time: 'half past' }), F.calNote('empty', '2026-03-10', { time: '' })]
  });
  const day = TC.buildDaySchedule(slot, '2026-03-10');
  assert.deepEqual(ids(day.calNotes).sort(), ['bad', 'empty']);
  assert.deepEqual(day.blocks, []);
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

test('the caution run-up covers startDate..date and excludes the due day from the caution list', () => {
  const slot = F.emptySlot({ deadlines: [F.deadline('d', '2026-03-10', { startDate: '2026-03-08' })] });
  const on = ds => TC.buildDaySchedule(slot, ds);

  assert.deepEqual(ids(on('2026-03-07').deadlinesCaution), []);
  assert.deepEqual(ids(on('2026-03-08').deadlinesCaution), ['d'], 'the run-up starts on startDate');
  assert.deepEqual(ids(on('2026-03-09').deadlinesCaution), ['d']);
  assert.deepEqual(ids(on('2026-03-10').deadlines), ['d'], 'the due day lists it as due');
  assert.deepEqual(ids(on('2026-03-10').deadlinesCaution), [], 'and NOT also as caution');
  assert.deepEqual(ids(on('2026-03-11').deadlinesCaution), []);
});

test('dlStart and dlInCaution', () => {
  const withStart = { date: '2026-03-10', startDate: '2026-03-08' };
  const noStart = { date: '2026-03-10' };
  assert.equal(TC.dlStart(withStart), '2026-03-08');
  assert.equal(TC.dlStart(noStart), '2026-03-10', 'no startDate means the run-up is the due day itself');
  assert.equal(TC.dlInCaution(withStart, '2026-03-08'), true, 'inclusive at the start');
  assert.equal(TC.dlInCaution(withStart, '2026-03-10'), true, 'inclusive at the due day');
  assert.equal(TC.dlInCaution(withStart, '2026-03-07'), false);
  assert.equal(TC.dlInCaution(withStart, '2026-03-11'), false);
  assert.equal(TC.dlInCaution(noStart, '2026-03-09'), false);
});

test('deadlines sort by time on the day, and by date then time in the run-up', () => {
  const slot = F.emptySlot({
    deadlines: [
      F.deadline('late', '2026-03-10', { time: '17:00' }),
      F.deadline('early', '2026-03-10', { time: '08:00' }),
      F.deadline('far', '2026-03-12', { time: '08:00', startDate: '2026-03-01' }),
      F.deadline('near', '2026-03-11', { time: '23:00', startDate: '2026-03-01' })
    ]
  });
  assert.deepEqual(ids(TC.buildDaySchedule(slot, '2026-03-10').deadlines), ['early', 'late']);
  assert.deepEqual(ids(TC.buildDaySchedule(slot, '2026-03-09').deadlinesCaution), ['near', 'far'],
    'the nearest due date leads the caution list');
});

test('dlValid rejects every malformed draft', () => {
  const ok = { title: 'Ship it', time: '09:00', startDate: '2026-03-08' };
  assert.equal(TC.dlValid(ok, '2026-03-10'), true);
  assert.equal(TC.dlValid(Object.assign({}, ok, { startDate: '2026-03-10' }), '2026-03-10'), true,
    'a run-up may begin on the due day');

  assert.equal(TC.dlValid(Object.assign({}, ok, { title: '' }), '2026-03-10'), false);
  assert.equal(TC.dlValid(Object.assign({}, ok, { title: '   ' }), '2026-03-10'), false);
  assert.equal(TC.dlValid(Object.assign({}, ok, { title: undefined }), '2026-03-10'), false);
  assert.equal(TC.dlValid(Object.assign({}, ok, { time: '9:00' }), '2026-03-10'), false);
  assert.equal(TC.dlValid(Object.assign({}, ok, { time: '0900' }), '2026-03-10'), false);
  assert.equal(TC.dlValid(Object.assign({}, ok, { time: undefined }), '2026-03-10'), false);
  assert.equal(TC.dlValid(Object.assign({}, ok, { startDate: '2026-3-08' }), '2026-03-10'), false);
  assert.equal(TC.dlValid(Object.assign({}, ok, { startDate: undefined }), '2026-03-10'), false);
  assert.equal(TC.dlValid(Object.assign({}, ok, { startDate: '2026-03-11' }), '2026-03-10'), false,
    'a caution period may not begin after the due day');
});

test('dlDayCount survives month, year and DST boundaries', () => {
  const n = (startDate, date) => TC.dlDayCount({ startDate, date });
  assert.equal(n('2026-03-08', '2026-03-10'), 3, 'inclusive of both ends');
  assert.equal(n('2026-03-10', '2026-03-10'), 1);
  assert.equal(n('2026-02-26', '2026-03-02'), 5, 'across a non-leap February');
  assert.equal(n('2024-02-26', '2024-03-02'), 6, 'across a leap February');
  assert.equal(n('2025-12-30', '2026-01-02'), 4, 'across a year boundary');
  assert.equal(n('2026-01-01', '2026-12-31'), 365);
  assert.equal(n('2024-01-01', '2024-12-31'), 366);
  // Northern-hemisphere DST transitions. Parsing at T12:00:00 is what keeps a
  // 23- or 25-hour day from rounding into the wrong number of days.
  assert.equal(n('2026-03-07', '2026-03-09'), 3, 'across US spring-forward');
  assert.equal(n('2026-10-31', '2026-11-02'), 3, 'across US fall-back');
  assert.equal(n('2026-03-28', '2026-03-30'), 3, 'across EU spring-forward');
  assert.equal(n('2026-04-04', '2026-04-06'), 3, 'across southern-hemisphere transitions');
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
