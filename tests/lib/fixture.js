/* ── tests/lib/fixture.js ──────────────────────────────────────────────────
   Synthetic Track data, in the shape of a real `track_db` slot.

   EVERYTHING HERE IS INVENTED. A real personal export must never be used as a
   test fixture (AGENTS.md, "Preserve old data"), so these builders exist to
   make writing a synthetic one cheap.

   Dates are written as literal 'YYYY-MM-DD' strings so they mean the same
   local calendar day under every TZ the suite sweeps. Where a timestamp is
   needed (notes carry `createdAt` in milliseconds), build it with
   `localTs(y, m, d, h, min)` rather than Date.parse of a string, so the epoch
   value tracks the running timezone the way the browser's Date.now() would.
*/
'use strict';

// month is 1-based here, unlike Date's — fixtures read as calendar dates
function localTs(y, month, d, h = 12, min = 0) {
  return new Date(y, month - 1, d, h, min, 0, 0).getTime();
}

// Every canonical slot field, per AGENTS.md "Current Data Contract". Present
// and empty rather than absent, so a test that drops a field fails loudly.
function emptySlot(over = {}) {
  return Object.assign({
    id: 'slot-test-1',
    name: 'Synthetic Workspace',
    createdAt: '2026-01-01',
    sessions: [],
    mms: [],
    kolbs: [],
    mgChanges: [],
    linChanges: [],
    linDayTitles: {},
    goals: [],
    saActions: [],
    saEntries: [],
    sourceDumps: [],
    notes: [],
    mmEntries: [],
    mgSchedule: {},
    calendarNotes: [],
    deadlines: [],
    pos: {},
    levelTemplates: {},
    docPages: []
  }, over);
}

// ── item builders ────────────────────────────────────────────────────────
// Each takes only what the test cares about; the rest gets a plausible default.

const mm = (id, name, over = {}) => Object.assign({ id, name, type: '1', rating: null, parentIds: [] }, over);

const kolb = (id, date, over = {}) => Object.assign({ id, date, mmId: null }, over);

const mgChange = (id, date, mmId, newMG) => ({ id, date, mmId, newMG });

const linChange = (id, date, over = {}) => Object.assign({ id, date, title: 'LIN ' + id, items: [] }, over);

const note = (id, ts, over = {}) => Object.assign({ id, topic: 'Note ' + id, content: 'body', createdAt: ts }, over);

const dump = (id, createdAt, over = {}) =>
  Object.assign({ id, title: 'Dump ' + id, createdAt, parentId: null, mmLinks: [] }, over);

const task = (id, over = {}) =>
  Object.assign({ id, title: 'Task ' + id, children: [], completed: false }, over);

const milestone = (id, startDate, endDate, over = {}) =>
  Object.assign({ id, title: 'Milestone ' + id, startDate, endDate }, over);

const saAction = (id, over = {}) => Object.assign({ id, title: 'Action ' + id, emoji: '', color: '#fb923c' }, over);

const saEntry = (id, date, actionId, over = {}) =>
  Object.assign({ id, date, actionId, time: '09:00', duration: 60, done: false }, over);

const mmEntry = (id, date, mmId, over = {}) =>
  Object.assign({ id, date, mmId, time: '09:00', duration: 60, done: false }, over);

const session = (id, date, mmId, over = {}) =>
  Object.assign({ id, date, mmId, repIndex: 0, done: false, skipped: false }, over);

// docPageId is what makes an item doc-authored; omitting it means the Schedule
// authored it. Both shapes matter — see calendar-core originKey.
const calNote = (id, date, over = {}) =>
  Object.assign({ id, date, title: 'Day note ' + id, detail: '', createdAt: localTs(2026, 1, 1) }, over);

const deadline = (id, date, over = {}) =>
  Object.assign({ id, date, title: 'Deadline ' + id, detail: '', time: '17:00', startDate: date }, over);

const docPage = (id, over = {}) =>
  Object.assign({ id, title: 'Page ' + id, parentId: null, blocks: [], favorite: false }, over);

// ── a populated slot used by several suites ──────────────────────────────
// March 2026. Deliberately mixes schedule-authored and doc-authored items so
// origin filtering has something to separate.
function populatedSlot(over = {}) {
  return emptySlot(Object.assign({
    mms: [mm(10, 'Mind Map A'), mm(11, 'Mind Map B', { type: '2' })],
    kolbs: [kolb(1, '2026-03-05', { mmId: 10 }), kolb(2, '2026-03-05')],
    mgChanges: [mgChange(3, '2026-03-05', 10, 'lift earlier')],
    linChanges: [linChange(4, '2026-03-06', { items: [{ id: 1 }, { id: 2 }] })],
    linDayTitles: { '2026-03-06': 'Day title override' },
    notes: [note('n-1', localTs(2026, 3, 7, 23, 30))],
    sourceDumps: [dump('d-1', '2026-03-08')],
    goals: [
      task('g-1', {
        title: 'Root goal',
        milestones: [milestone('ms-1', '2026-03-01', '2026-03-10')],
        children: [task('g-1a', { scheduledDate: '2026-03-10', scheduledTime: '08:30', duration: 45 })]
      })
    ],
    saActions: [saAction('a-1', { title: 'Read', emoji: '📖' })],
    saEntries: [saEntry('e-1', '2026-03-10', 'a-1', { time: '13:00', duration: 90 })],
    mmEntries: [mmEntry('me-1', '2026-03-10', 10, { time: '14:00', duration: 30, done: true })],
    sessions: [session(20, '2026-03-10', 10)],
    mgSchedule: { '2026-03-01': [11] },
    calendarNotes: [
      calNote('cn-sched', '2026-03-10'),
      calNote('cn-doc', '2026-03-10', { docPageId: 'p-1', title: 'Written from a page' })
    ],
    deadlines: [
      deadline('dl-sched', '2026-03-10', { startDate: '2026-03-08' }),
      deadline('dl-doc', '2026-03-10', { startDate: '2026-03-09', docPageId: 'p-1', time: '10:00' })
    ],
    docPages: [docPage('p-1')]
  }, over));
}

module.exports = {
  localTs, emptySlot, populatedSlot,
  mm, kolb, mgChange, linChange, note, dump, task, milestone,
  saAction, saEntry, mmEntry, session, calNote, deadline, docPage
};
