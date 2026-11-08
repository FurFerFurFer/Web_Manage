/* ── tests/note-to-self-core.test.js ───────────────────────────────────────
   Offline cover for note-to-self-core.js — what the Note to self pop-up holds,
   and the one Quest renderer Home's panel and the pop-up share.

       node --test tests/note-to-self-core.test.js

   SWEPT under every timezone by tests/run.js, although the module itself holds
   no date code (the structural case below says so): three of its four ★ Forced
   lists come from calendar-core.js's buildDaySchedule, which is swept because
   it turns days into weekdays, and this suite runs it for real rather than
   against a stub. Cheap, and it means a local-day regression there cannot pass
   here by luck of the machine's zone.

   What is pinned, in order of how much it would cost to get wrong:

   1. questHtml with no options returns Home's markup BYTE FOR BYTE — pinned
      against a verbatim copy of the inline code it replaced in index.html.
      That is what makes moving it a refactor rather than a change.
   2. OVERDUE has one definition: due day before today, not ticked, read
      through TrackCalendar.dlDone. The due day itself is due, not overdue.
   3. The other three lists are buildDaySchedule's, so the caution rule (the
      chosen days, the legacy startDate span, the tick suppressing it) is the
      calendar's and is merely observed here.
   4. Every value reaching markup is escaped, and every row is a link: a
      deadline to its DUE day, a day note to today, a quest to the Quest tab.

   Fixtures are synthetic, always (AGENTS.md, "Preserve old data").
*/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Page order, as every page loads them. runInThisContext so arrays built here
// pass the modules' Array.isArray (see quest-core.test.js).
globalThis.window = globalThis;
for (const file of ['milestone-core.js', 'calendar-core.js', 'quest-core.js', 'note-to-self-core.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'scripts', file), 'utf8'), { filename: file });
}
const M = globalThis.TrackNoteToSelf;
const Q = globalThis.TrackQuest;
const SRC = path.join(__dirname, '..', 'scripts', 'note-to-self-core.js');
const TZ = process.env.TZ || '(system default)';

// ── fixtures ───────────────────────────────────────────────────────────────

const node = (id, over = {}) => Object.assign({
  id, title: id, children: [], completed: false, createdAt: 1, scheduledDate: null,
  toLearn: [], mmTargets: {}, milestones: []
}, over);

// Mind-map ids are NUMBERS in real data (sir-ks02.html's nid()); goal ids are
// strings. A string-only fixture would hide a whole class of bug.
const MMS = [{ id: 10, name: 'Harmony', parentIds: [] }, { id: 11, name: 'Rhythm', parentIds: [10] }];

const QUEST_TREE = () => [
  node('root', {
    title: 'Guitar', toLearn: [10, 11, 99], questLearn: [10, 99], starLearn: [10],
    children: [
      node('t1', { title: 'Travis picking', quest: true, star: true }),
      node('t2', { title: 'Thumb independence', quest: true, completed: true }),
      node('r1', { title: 'Daily warmup', quest: true, taskType: 'routine' }),
      node('t3', { title: 'Not a quest' }),
      node('sg', { title: 'Theory', isSubGoal: true, quest: true, star: true, children: [
        node('s1', { title: 'Modes', quest: true }),
        node('s2', { title: 'Cadences', quest: true })
      ] })
    ]
  }),
  node('other', { title: 'Questless goal', children: [node('t9', { title: 'nope' })] })
];

const slotWith = over => Object.assign({
  id: 'slot-1', goals: [], mms: MMS, deadlines: [], calendarNotes: [],
  sessions: [], saActions: [], saEntries: [], mmEntries: [], mgSchedule: {}, mgChanges: [],
  refSchedules: []
}, over);

const dl = (id, date, over = {}) => Object.assign({ id, date, title: 'Deadline ' + id, time: '17:00' }, over);
const note = (id, date, over = {}) => Object.assign({ id, date, title: 'Day note ' + id }, over);

/* VERBATIM copy of index.html's renderQuests row-building, as it stood before
   it moved into note-to-self-core.js (HEAD a883f1d). Only the wrapper is new:
   the inline code wrote straight into two innerHTMLs, so it returns them. */
function homeOld(slot, ticks) {
  const out = {};
  const mms = slot.mms || [];
  const tree = TrackQuest.questTree(slot.goals || [], mms);
  const rollup = TrackQuest.starRollup(slot.goals || [], mms);

        const esc = s => String(s == null ? '' : s)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');

        out.starred = rollup.length ? (
          '<div class="quest-section-label">★ Starred</div>' +
          rollup.map(row => '<div class="quest-star-row" data-quest-star-row="' +
            esc(row.kind === 'learn' ? row.node.id + ':' + row.mmId : row.node.id) + '">' +
            '<span class="quest-star">★</span><span class="quest-title">' +
            esc(row.kind === 'learn'
              ? (row.mm ? row.mm.name : 'mind map removed')
              : (row.node.title || 'Untitled')) + '</span>' +
            (row.count > 1
              ? '<span class="quest-count" data-quest-star-count="' + esc(row.node.id) + '">' +
                row.count + ' quests</span>'
              : '') +
            (row.kind === 'learn' ? '<span class="quest-kind">to learn</span>' : '') +
            '</div>').join('')
        ) : '';

        function rowsFor(entry) {
          const n = entry.node;
          const routine = n.taskType === 'routine';
          const done = routine ? ticks.indexOf(n.id) >= 0 : !!n.completed;
          const kind = n.isSubGoal ? 'sub-goal'
            : (n.children || []).length ? 'goal'
            : routine ? 'routine' : 'task';
          let html = '<div class="quest-row' + (entry.quest ? '' : ' is-context') +
            (done ? ' is-done' : '') + '" data-quest-row="' + esc(n.id) +
            '" style="--depth:' + entry.depth + '">' +
            '<span class="quest-mark">' + (entry.quest ? (done ? '✓' : '·') : '') + '</span>' +
            '<span class="quest-title">' + esc(n.title || 'Untitled') + '</span>' +
            (entry.star ? '<span class="quest-star">★</span>' : '') +
            '<span class="quest-kind">' + kind + '</span></div>';
          html += entry.learn.map(row =>
            '<div class="quest-row is-learn" data-quest-learn-row="' +
            esc(n.id + ':' + row.mmId) + '" style="--depth:' + (entry.depth + 1) + '">' +
            '<span class="quest-mark"></span><span class="quest-title">' +
            esc(row.mm ? row.mm.name : 'mind map removed') + '</span>' +
            (row.star ? '<span class="quest-star">★</span>' : '') +
            '<span class="quest-kind">to learn</span></div>').join('');
          return html + entry.children.map(rowsFor).join('');
        }

        out.list = tree.length ? tree.map(rowsFor).join('') : '';
  return out;
}

// ── module surface ─────────────────────────────────────────────────────────

test('module surface', () => {
  assert.ok(M, 'note-to-self-core.js published window.TrackNoteToSelf under TZ=' + TZ);
  assert.deepEqual(Object.keys(M).sort(), [
    'QUEST_HREF', 'dayHref', 'dlHref', 'esc', 'forcedCount', 'forcedFor', 'forcedHtml',
    'overdueDeadlines', 'questHtml', 'shortDay'
  ].sort());
  assert.equal(M.QUEST_HREF, 'progress.html#quest');
});

test('the module constructs no Date: "today" is a parameter', () => {
  // Comments stripped first — this file explains in prose why it holds no
  // date code, and a check that read the prose would fail on the explanation.
  const src = fs.readFileSync(SRC, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  assert.equal(/new Date|Date\.now|getDay\(|getDate\(|toISOString|getTimezoneOffset|toDateStr/.test(src), false,
    'note-to-self-core.js must hold no date code — the widget computes today');
  assert.equal(/localStorage|setItem|saveDB/.test(src), false, 'and it writes nothing anywhere');
});

// ── 1. the Quest renderer is Home's, byte for byte ──────────────────────────

test('questHtml with no options is byte-identical to the inline Home code it replaced', () => {
  const cases = [
    ['the quest tree, numeric mind maps, a removed one, a starred sub-goal', slotWith({ goals: QUEST_TREE() }), []],
    ['a routine ticked today', slotWith({ goals: QUEST_TREE() }), ['r1']],
    ['no quests at all', slotWith({ goals: [node('g', { children: [node('x')] })] }), []],
    ['no goals key', slotWith({ goals: undefined }), []],
    ['markup in titles', slotWith({ goals: [node('<b>', { title: '<img src=x onerror=1>', quest: true, star: true,
      children: [node('q"&', { title: 'He said "hi" & <b>bold</b>', quest: true })] })] }), []],
    ['an arranged group', slotWith({ goals: [node('root', { quest: true, children: [
      node('a', { quest: true, questOrder: 1 }), node('b', { quest: true, questOrder: 0 })] })] }), []]
  ];
  for (const [name, slot, ticks] of cases) {
    const got = M.questHtml(slot, ticks);
    const want = homeOld(slot, ticks);
    assert.equal(got.starred, want.starred, name + ': the starred rows');
    assert.equal(got.list, want.list, name + ': the quest rows');
  }
  // …and the fixture really exercises what it claims to.
  const full = M.questHtml(slotWith({ goals: QUEST_TREE() }), ['r1']);
  assert.match(full.list, /data-quest-learn-row="root:99"[^>]*>.*mind map removed/);
  assert.match(full.starred, /data-quest-star-count="sg">3 quests</);
  assert.match(full.list, /quest-row is-done" data-quest-row="r1"/);
});

test('questHtml for the pop-up: every row is a link, and no row answers to Home\'s hooks', () => {
  const got = M.questHtml(slotWith({ goals: QUEST_TREE() }), [], { hook: 'nts-quest', href: M.QUEST_HREF });
  const html = got.starred + got.list;
  assert.equal(/data-quest-/.test(html), false, 'a [data-quest-row] selector never finds a pop-up row');
  assert.equal(/<div class="quest-(row|star-row)/.test(html), false, 'no row is a div');
  const rows = html.match(/<a class="quest-(?:row|star-row)[^"]*" href="progress\.html#quest" data-nts-quest-[a-z-]+="[^"]*"/g) || [];
  // 5 tree rows (root, t1, t2, r1, sg, s1, s2 = 7) + 2 learn rows + 3 starred.
  assert.equal(rows.length, 7 + 2 + 3, 'every quest row, learn row and starred row links to the Quest tab');
  assert.match(html, /data-nts-quest-star-count="sg"/);
});

test('questHtml is total', () => {
  for (const slot of [null, undefined, 42, 'x', [], {}]) {
    assert.deepEqual(M.questHtml(slot, null), { starred: '', list: '' }, String(slot));
  }
  assert.doesNotThrow(() => M.questHtml(slotWith({ goals: QUEST_TREE() }), 'not a list'));
});

// ── 2. overdue ──────────────────────────────────────────────────────────────

test('overdue: a due day before today, not ticked — oldest first', () => {
  const list = [
    dl('future', '2026-11-20'),
    dl('today', '2026-11-08'),
    dl('late2', '2026-11-03', { time: '09:00' }),
    dl('ticked', '2026-11-01', { done: true }),
    dl('late1', '2026-10-30'),
    dl('late2b', '2026-11-03', { time: '08:00' }),
    dl('legacy', '2026-11-05', { startDate: '2026-11-01' }),
    dl('truthy', '2026-11-02', { done: 'yes' }),
    dl('falsy', '2026-11-04', { done: false }),
    dl('baddate', '2026/11/01'), dl('nodate', undefined), null, 42, 'x'
  ];
  assert.deepEqual(M.overdueDeadlines(list, '2026-11-08').map(d => d.id),
    ['late1', 'late2b', 'late2', 'falsy', 'legacy'],
    'today is DUE, not overdue; ticked (any truthy done) is never overdue; a day that is not a day is never late');
  assert.deepEqual(M.overdueDeadlines(list, '2026-11-08').map(d => d.id),
    M.overdueDeadlines(list.slice().reverse(), '2026-11-08').map(d => d.id), 'order does not depend on storage order');
});

test('overdue moves with the day it is asked about', () => {
  const list = [dl('a', '2026-12-31')];
  assert.deepEqual(M.overdueDeadlines(list, '2026-12-31'), [], 'on its due day it is due');
  assert.deepEqual(M.overdueDeadlines(list, '2027-01-01').map(d => d.id), ['a'], 'the next day — across a year — it is late');
});

test('overdue is total', () => {
  for (const v of [null, undefined, 42, 'x', {}]) assert.deepEqual(M.overdueDeadlines(v, '2026-11-08'), []);
  assert.deepEqual(M.overdueDeadlines([dl('a', '2026-01-01')], 'today'), [], 'a today that is not a day finds nothing');
  assert.deepEqual(M.overdueDeadlines([dl('a', '2026-01-01')], undefined), []);
});

// ── 3. the other three lists are the calendar's ─────────────────────────────

test('forcedFor: due today, caution today, today\'s day notes — and overdue', () => {
  const slot = slotWith({
    deadlines: [
      dl('due', '2026-11-08', { time: '14:00' }),
      dl('dueDone', '2026-11-08', { time: '09:00', done: true }),
      dl('chosen', '2026-11-12', { cautionDates: ['2026-11-06', '2026-11-08'] }),
      dl('notToday', '2026-11-12', { cautionDates: ['2026-11-09'] }),
      dl('tickedRunup', '2026-11-12', { cautionDates: ['2026-11-08'], done: true }),
      dl('legacy', '2026-11-10', { startDate: '2026-11-07' }),
      dl('late', '2026-11-01')
    ],
    calendarNotes: [
      note('n1', '2026-11-08', { time: '09:00' }),
      note('n2', '2026-11-08'),
      note('n3', '2026-11-09')
    ]
  });
  const f = M.forcedFor(slot, '2026-11-08');
  assert.deepEqual(f.overdue.map(d => d.id), ['late']);
  assert.deepEqual(f.due.map(d => d.id), ['dueDone', 'due'], 'buildDaySchedule\'s list: a ticked deadline keeps its due day, by time');
  assert.deepEqual(f.caution.map(d => d.id).sort(), ['chosen', 'legacy'],
    'a chosen caution day and a legacy startDate span; a ticked run-up does not warn');
  assert.deepEqual(f.notes.map(n => n.id), ['n1', 'n2'], 'timed and untimed, today only');
  assert.equal(M.forcedCount(f), 1 + 2 + 2 + 2);
});

test('forcedFor: the same deadline is caution on one day and due on another', () => {
  const slot = slotWith({ deadlines: [dl('d', '2026-11-12', { cautionDates: ['2026-11-10'] })] });
  assert.deepEqual(M.forcedFor(slot, '2026-11-10').caution.map(d => d.id), ['d']);
  assert.deepEqual(M.forcedFor(slot, '2026-11-10').due, []);
  assert.deepEqual(M.forcedFor(slot, '2026-11-12').due.map(d => d.id), ['d']);
  assert.deepEqual(M.forcedFor(slot, '2026-11-12').caution, [], 'the due day is never also a caution day');
  assert.deepEqual(M.forcedFor(slot, '2026-11-13').overdue.map(d => d.id), ['d']);
});

test('forcedFor is total', () => {
  const empty = { overdue: [], due: [], caution: [], notes: [] };
  for (const slot of [null, undefined, 42, [], 'x']) assert.deepEqual(M.forcedFor(slot, '2026-11-08'), empty);
  assert.deepEqual(M.forcedFor(slotWith({}), 'not a day'), empty);
  assert.deepEqual(M.forcedFor(slotWith({ deadlines: [null] }), '2026-11-08'), empty,
    'a list the calendar cannot read is empty, never a throw');
  assert.equal(M.forcedCount(null), 0);
});

// ── 4. the rows: links, order and escaping ──────────────────────────────────

test('forcedHtml: most urgent first, every row a link to where it is edited', () => {
  const f = {
    overdue: [dl('o', '2026-11-01')],
    due: [dl('d', '2026-11-08', { time: '14:00' }), dl('dd', '2026-11-08', { done: true })],
    caution: [dl('c', '2026-11-12')],
    notes: [note('n', '2026-11-08', { time: '09:00' }), note('u', '2026-11-08', { time: '' })]
  };
  const html = M.forcedHtml(f, '2026-11-08', { dayLabel: ds => 'L(' + ds + ')' });
  const order = (html.match(/data-nts-[a-z]+="[^"]*"/g) || []);
  assert.deepEqual(order, ['data-nts-overdue="o"', 'data-nts-due="d"', 'data-nts-due="dd"',
    'data-nts-caution="c"', 'data-nts-note="n"', 'data-nts-note="u"']);
  assert.match(html, /href="progress\.html\?date=2026-11-01&amp;dl=o#schedule" data-nts-overdue="o"/);
  assert.match(html, /href="progress\.html\?date=2026-11-12&amp;dl=c#schedule" data-nts-caution="c"/,
    'a caution row opens its DUE day, never the caution day it sits on');
  assert.match(html, /href="progress\.html\?date=2026-11-08#schedule" data-nts-note="n"/, 'a day note opens today');
  assert.match(html, /is-due is-done" href="[^"]*" data-nts-due="dd"/, 'a ticked due deadline is drawn done');
  assert.match(html, /overdue · due 01\/11/);
  assert.match(html, /caution · due 12\/11/);
  assert.match(html, /title="Caution — due L\(2026-11-12\) at 17:00/, 'the tooltip names the day in full');
  assert.match(html, /<span class="nts-time">09:00<\/span><span class="nts-title">Day note n</);
  assert.equal(/data-nts-note="u"[^>]*><span class="nts-mark"[^>]*>[^<]*<\/span><span class="nts-time">/.test(html), false,
    'an untimed note shows no time');
  assert.equal(M.forcedHtml({ overdue: [], due: [], caution: [], notes: [] }, '2026-11-08'), '', 'nothing → empty string');
  assert.equal(M.forcedHtml(null, '2026-11-08'), '');
});

test('forcedHtml: a title, a detail and an id are TEXT, never markup', () => {
  const evil = '<img src=x onerror="window.__p=1">';
  const html = M.forcedHtml({
    overdue: [], caution: [],
    due: [dl('"><b>', '2026-11-08', { title: evil, detail: '</a><i>' })],
    notes: [note('n', '2026-11-08', { title: '', detail: 'A & "B" <c>' })]
  }, '2026-11-08');
  assert.equal(/<img|<b>|<i>|<c>/.test(html), false, 'no element smuggled in through any value');
  assert.match(html, /&lt;img src=x onerror=&quot;window.__p=1&quot;&gt;/);
  assert.match(html, /dl=%22%3E%3Cb%3E#schedule/, 'the id is URL-encoded inside the link');
  assert.match(html, /<span class="nts-title">A &amp; &quot;B&quot; &lt;c&gt;<\/span>/, 'a note with no title falls back to its detail');
});

test('shortDay shows the year only when it is not today\'s', () => {
  assert.equal(M.shortDay('2026-11-12', '2026-11-08'), '12/11');
  assert.equal(M.shortDay('2025-12-30', '2026-01-02'), '30/12/2025');
  assert.equal(M.shortDay('nope', '2026-11-08'), 'nope');
});
