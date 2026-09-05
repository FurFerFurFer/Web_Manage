/* ── tests/schedule-paste-core.test.js ─────────────────────────────────────
   Offline cover for schedule-paste-core.js — the text format an AI is asked to
   emit when it is shown a picture of a timetable.

       node --test tests/schedule-paste-core.test.js

   Run once by tests/run.js rather than once per timezone, and that is a claim
   about the module rather than a convenience: this file parses the SHAPE of a
   day cell and never constructs a Date. Every question of which calendar days
   a weekly entry occupies belongs to TrackCalendar.refOccupies, which IS swept
   under five zones. If a `new Date()` ever appears in schedule-paste-core.js,
   this suite has moved to the wrong list. Same reasoning as
   doc-table-core.test.js and graph-layout.test.js.

   What is being pinned here, in order of how much it would cost to get wrong:

   1. A row with the wrong cell count is REFUSED against its line number, not
      guessed at. This is the whole argument for a fixed three-column format.
      A schedule built from a miscounted row looks right and is wrong, and a
      wrong timetable is worse than no timetable — the user plans against it.

   2. NOTHING comes back half-parsed. `ok === false` must mean `rows` is empty,
      so a caller cannot insert the good half of a bad paste.

   3. One format carries BOTH a weekday and a concrete date. That is the whole
      reason the user does not have to choose a mode, and a change that made
      the day cell mean only one of them would break the case it was built for.

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
vm.runInThisContext(
  fs.readFileSync(path.join(__dirname, '..', 'scripts', 'schedule-paste-core.js'), 'utf8'),
  { filename: 'schedule-paste-core.js' }
);
const T = globalThis.TrackSchedulePaste;

const lines = (...ls) => ls.join('\n');

// ── module surface ─────────────────────────────────────────────────────────

test('the module exports exactly the documented surface', () => {
  // Written out by hand on purpose: if an export is added or renamed, this is
  // the case that notices, the same way tests/schema.test.js pins SLOT_FIELDS.
  assert.deepEqual(Object.keys(T).sort(), [
    'COLUMN_COUNTS', 'DEFAULT_MINUTES', 'DOW_LABELS', 'MAX_ROWS',
    'formatScheduleText', 'parseDayCell', 'parseScheduleText', 'parseTimeCell'
  ].sort());
});

test('the module constructs no Date, which is why its suite is not swept', () => {
  // A structural check, not a behavioural one. The sweep decision in
  // tests/run.js rests on this file having no date arithmetic; if that stops
  // being true, this case is the thing that says so.
  // Comments are stripped first: this file's own prose explains at length why
  // it constructs no Date, and a check that read the prose would fail on the
  // explanation rather than on the code.
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'schedule-paste-core.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  assert.equal(/new Date|Date\.now|getDay\(|toISOString|getTimezoneOffset/.test(src), false,
    'schedule-paste-core.js must hold no date code — move its suite to OFFLINE_FILES if it does');
});

// ── the day cell: one format, both cases ───────────────────────────────────

test('a weekday and a concrete date are BOTH read by the same cell', () => {
  // The case the whole format exists for. A term timetable and a one-off day
  // paste through one parser with no mode for the user to choose.
  const r = T.parseScheduleText(lines(
    '| Mon        | 09:00-10:30 | Mathematics    |',
    '| 2026-09-14 | 09:00-10:30 | Makeup lecture |'
  ));
  assert.equal(r.ok, true);
  assert.deepEqual(r.rows[0].day, { kind: 'dow', dow: 1 });
  assert.deepEqual(r.rows[1].day, { kind: 'date', date: '2026-09-14' });
});

test('every weekday spelling an AI plausibly emits maps to the platform index', () => {
  // Sunday is 0 because Date#getDay says so and calendar-core.js's DOWS
  // already assumes it. A table that disagreed with the platform would be one
  // conversion nobody remembers to make.
  const got = ['Sun', 'monday', 'TUE', 'Tues', 'Wed', 'Thurs', 'thu', 'Fri.', 'Saturday']
    .map(s => T.parseDayCell(s));
  assert.deepEqual(got.map(d => d && d.dow), [0, 1, 2, 2, 3, 4, 4, 5, 6]);
});

test('a day cell that is neither is REFUSED, and the line is named', () => {
  const r = T.parseScheduleText(lines('| Mon | 09:00 | Physics |', '| Someday | 10:00 | Ghost |'));
  assert.equal(r.ok, false);
  assert.equal(r.rows.length, 0, 'nothing is returned half-parsed');
  assert.equal(r.errors[0].line, 2);
  assert.match(r.errors[0].message, /Someday/);
});

test('an impossible date is passed through rather than refused here', () => {
  // Deliberate: this file checks shape, not existence. calendar-core.js parses
  // it when it needs a weekday, and a date that is not a real day simply
  // occupies no day — the same outcome a refusal here would reach with more
  // code and a second place to keep a calendar.
  assert.deepEqual(T.parseDayCell('2026-02-31'), { kind: 'date', date: '2026-02-31' });
});

// ── the time cell ──────────────────────────────────────────────────────────

test('a range becomes a duration, and a bare start falls back to the default', () => {
  const r = T.parseScheduleText(lines('| Mon | 09:00-10:30 | Maths |', '| Tue | 13:00 | Study |'));
  assert.equal(r.ok, true);
  assert.deepEqual(
    r.rows.map(x => [x.time, x.duration]),
    [['09:00', 90], ['13:00', T.DEFAULT_MINUTES]]
  );
});

test('every dash a timetable is printed with separates the two times', () => {
  for (const sep of ['-', '–', '—', ' - ', ' – ', ' to ', ' TO ']) {
    const got = T.parseTimeCell('09:00' + sep + '10:00');
    assert.equal(got.error, undefined, JSON.stringify(sep) + ' should separate');
    assert.equal(got.duration, 60, JSON.stringify(sep) + ' should give 60 minutes');
  }
});

test('a single-digit hour is read, because that is what a person types', () => {
  assert.deepEqual(T.parseTimeCell('9:05-10:05'), { time: '09:05', duration: 60 });
});

test('an end at or before the start is REFUSED, never wrapped past midnight', () => {
  // Silently wrapping would turn a transcription slip into a 23-hour block
  // smeared down the whole column, which the user then has to hunt for.
  assert.match(T.parseTimeCell('10:00-09:00').error, /at or before/);
  assert.match(T.parseTimeCell('10:00-10:00').error, /at or before/);
});

test('a time that is not a time is refused with the offending text quoted', () => {
  assert.match(T.parseTimeCell('period 3').error, /period 3/);
  assert.match(T.parseTimeCell('25:00').error, /25:00/);
  assert.match(T.parseTimeCell('09:60').error, /09:60/);
  assert.match(T.parseTimeCell('').error, /No time/);
});

// ── the load-bearing refusal ───────────────────────────────────────────────

test('a row with the wrong cell count is REFUSED and the line is named', () => {
  // The load-bearing case. A UNIFORM cell count is what makes a miscount
  // detectable; guessing which cell went missing is how a wrong schedule gets
  // built that LOOKS right, and the user plans against it.
  const r = T.parseScheduleText(lines('| Mon | 09:00-10:30 | Maths |', '| Tue | 13:00 |'));
  assert.equal(r.ok, false);
  assert.equal(r.rows.length, 0, 'nothing is returned half-parsed');
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].line, 2, 'the error points at the offending line of the pasted text');
  assert.match(r.errors[0].message, /has 2 cells; every row needs 3/);
});

// ── the fourth cell: a detail, kept apart from the title ───────────────────

test('a fourth cell is the DETAIL, and it is stored apart from the title', () => {
  // The whole point of the column. Before it, a lecturer and a room had to be
  // glued onto the title, so nothing could ever show the topic on its own.
  const r = T.parseScheduleText(lines(
    '| Mon        | 09:00-10:30 | Epithelial tissue | Dr Wanida · R305 |',
    '| 2026-09-14 | 13:00-16:00 | Gross anatomy lab | Anatomy staff |'
  ));
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.rows.map(x => [x.title, x.detail]), [
    ['Epithelial tissue', 'Dr Wanida · R305'],
    ['Gross anatomy lab', 'Anatomy staff']
  ]);
});

test('a blank fourth cell stores NO detail at all — absence is the default', () => {
  // The time / link rule, deliberately NOT the cautionDates: [] rule: no
  // fallback sits behind `detail`, so '' must never be written. A four-column
  // paste with an empty detail must produce the identical draft a
  // three-column one would, or every stored entry gains a useless key.
  const four = T.parseScheduleText(lines('| Mon | 09:00-10:30 | Maths |  |'));
  const three = T.parseScheduleText(lines('| Mon | 09:00-10:30 | Maths |'));
  assert.equal(four.ok, true, JSON.stringify(four.errors));
  assert.equal(three.ok, true);
  assert.equal(Object.prototype.hasOwnProperty.call(four.rows[0], 'detail'), false,
    'a blank detail cell must not write the key');
  assert.deepEqual(four.rows, three.rows, 'a blank detail is byte-identical to no detail column');
});

test('a paste is uniformly 3 or uniformly 4, and a row that disagrees is NAMED', () => {
  // This is what replaces "exactly three cells" as the load-bearing property.
  // A dropped cell is still DETECTED, because it breaks uniformity — which is
  // the whole reason the fourth column could be added at all.
  const dropped = T.parseScheduleText(lines(
    '| Mon | 09:00 | Maths   | Dr A |',
    '| Tue | 13:00 | Physics |'
  ));
  assert.equal(dropped.ok, false);
  assert.equal(dropped.rows.length, 0, 'nothing is returned half-parsed');
  assert.equal(dropped.errors[0].line, 2);
  assert.match(dropped.errors[0].message, /the rest of this paste has 4/);

  // and the other way round — a stray extra cell in a three-column paste
  const added = T.parseScheduleText(lines(
    '| Mon | 09:00 | Maths   |',
    '| Tue | 13:00 | Physics | Dr B |'
  ));
  assert.equal(added.ok, false);
  assert.equal(added.errors[0].line, 2);
  assert.match(added.errors[0].message, /the rest of this paste has 3/);
});

test('a cell count that is neither 3 nor 4 is refused whatever the paste', () => {
  for (const [row, n] of [['| Mon | 09:00 |', 2], ['| Mon | 09:00 | a | b | c |', 5]]) {
    const r = T.parseScheduleText(row);
    assert.equal(r.ok, false, row + ' must not parse');
    assert.match(r.errors[0].message, new RegExp('has ' + n + ' cells; every row needs 3'));
    assert.match(r.errors[0].message, /or 4/, 'the message must name the legal shapes, not just the wrong one');
  }
});

test('a detail may contain a pipe, escaped', () => {
  const r = T.parseScheduleText(lines('| Mon | 09:00 | Maths | R12 \\| R13 |'));
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.rows[0].detail, 'R12 | R13');
});

test('the reported line number counts the fence and blank lines the user can see', () => {
  const r = T.parseScheduleText(lines(
    '::: track-schedule',
    '| Mon | 09:00 | Maths |',
    '',
    '| Tue | 13:00 |',
    ':::'
  ));
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].line, 4, 'line 4 of what was pasted, not row 2 of what survived filtering');
});

test('every bad row in one paste is reported at once', () => {
  // Errors accumulate WITHIN a phase, so fixing a paste is one pass rather
  // than one round trip per mistake.
  const r = T.parseScheduleText(lines('| Mon | 09:00 |', '| Tue | 13:00 |', '| Wed | 14:00 |'));
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors.map(e => e.line), [1, 2, 3]);
});

test('a row with no title is refused — a block needs something to show', () => {
  const r = T.parseScheduleText(lines('| Mon | 09:00 | Maths |', '| Tue | 13:00 |  |'));
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].line, 2);
  assert.match(r.errors[0].message, /no title/);
});

test('empty input is refused, and says what to do about it', () => {
  for (const bad of ['', '   ', null, undefined, 42, {}]) {
    const r = T.parseScheduleText(bad);
    assert.equal(r.ok, false, JSON.stringify(bad) + ' must not parse');
    assert.deepEqual(r.rows, []);
    assert.equal(r.errors[0].line, 0);
  }
});

test('a fence with no rows inside it is refused', () => {
  const r = T.parseScheduleText(lines('::: track-schedule', ':::'));
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, /No schedule rows/);
});

test('a runaway paste is refused rather than left to the quota guard', () => {
  const many = new Array(T.MAX_ROWS + 1).fill('| Mon | 09:00 | x |');
  const r = T.parseScheduleText(lines(...many));
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, new RegExp('limit is ' + T.MAX_ROWS));
});

// ── tolerance, where it is free ────────────────────────────────────────────

test('the fence is optional and both ::: and ``` are accepted', () => {
  const rows = '| Mon | 09:00-10:30 | Maths |';
  for (const src of [rows, lines('::: track-schedule', rows, ':::'), lines('```track-schedule', rows, '```')]) {
    const r = T.parseScheduleText(src);
    assert.equal(r.ok, true, 'should parse: ' + JSON.stringify(src));
    assert.equal(r.rows.length, 1);
  }
});

test('outer pipes are optional, and a markdown table pastes with no extra code', () => {
  const r = T.parseScheduleText(lines(
    'Day | Time | Subject',
    '--- | --- | ---',
    'Mon | 09:00-10:30 | Maths'
  ));
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.rows.length, 1, 'the separator row and the header row are both skipped');
  assert.equal(r.rows[0].title, 'Maths');
});

test('a header row is skipped only when its day cell is not a day', () => {
  // `| Mon | 09:00 | Day |` must keep its Monday — the guard reads the DAY
  // cell, so a real row can never be mistaken for a header.
  const r = T.parseScheduleText(lines('| Mon | 09:00-10:00 | Day |'));
  assert.equal(r.ok, true);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].title, 'Day');
});

test('a title may contain a pipe, escaped', () => {
  const r = T.parseScheduleText(lines('| Mon | 09:00 | Maths \\| Room 12 |'));
  assert.equal(r.ok, true);
  assert.equal(r.rows[0].title, 'Maths | Room 12');
});

// ── formatting back out ────────────────────────────────────────────────────

test('stored entries format back into the paste format', () => {
  const text = T.formatScheduleText([
    { id: 'a', dow: 1, time: '09:00', duration: 90, title: 'Mathematics' },
    { id: 'b', date: '2026-09-14', time: '13:00', duration: 60, title: 'Makeup' }
  ]);
  assert.match(text, /^::: track-schedule\n/);
  assert.match(text, /\n:::$/);
  assert.match(text, /\| Mon\s+\| 09:00-10:30 \| Mathematics \|/);
  assert.match(text, /\| 2026-09-14 \| 13:00-14:00 \| Makeup\s+\|/);
});

test('format -> parse -> format is stable, both arms', () => {
  const stored = [
    { id: 'a', dow: 1, time: '09:00', duration: 90, title: 'Mathematics' },
    { id: 'b', dow: 3, time: '13:00', duration: 180, title: 'Chemistry lab' },
    { id: 'c', date: '2026-09-14', time: '09:00', duration: 90, title: 'Makeup' }
  ];
  const first = T.parseScheduleText(T.formatScheduleText(stored));
  assert.equal(first.ok, true, JSON.stringify(first.errors));
  assert.deepEqual(
    first.rows.map(r => [r.day, r.time, r.duration, r.title]),
    [
      [{ kind: 'dow', dow: 1 }, '09:00', 90, 'Mathematics'],
      [{ kind: 'dow', dow: 3 }, '13:00', 180, 'Chemistry lab'],
      [{ kind: 'date', date: '2026-09-14' }, '09:00', 90, 'Makeup']
    ]
  );

  // and again, so the second pass cannot drift from the first
  const second = T.parseScheduleText(T.formatScheduleText(stored));
  assert.deepEqual(second.rows, first.rows);
});

test('GUARD: formatScheduleText emits THREE columns when nothing carries a detail', () => {
  // Passes on both sides of the detail column by design, and it is the guard
  // for the whole absence half: `⧉ copy as text` must return byte-identical
  // text for every import that predates the field, or an unchanged paste
  // round-trips into a different shape than the one that was stored.
  const text = T.formatScheduleText([
    { id: 'a', dow: 1, time: '09:00', duration: 90, title: 'Mathematics' },
    { id: 'b', date: '2026-09-14', time: '13:00', duration: 60, title: 'Makeup' }
  ]);
  for (const line of text.split('\n').filter(l => l.indexOf('|') !== -1)) {
    assert.equal(line.split('|').length - 1, 4,
      'three cells means four pipes, and no empty fourth column: ' + line);
  }
});

test('formatScheduleText widens to four columns as soon as ONE entry has a detail', () => {
  const text = T.formatScheduleText([
    { id: 'a', dow: 1, time: '09:00', duration: 90, title: 'Mathematics', detail: 'Dr A · R12' },
    { id: 'b', date: '2026-09-14', time: '13:00', duration: 60, title: 'Makeup' }
  ]);
  assert.match(text, /\| Mon\s+\| 09:00-10:30 \| Mathematics \| Dr A · R12 \|/);
  // the detail-less row still fills its cell, so the paste stays uniform
  assert.match(text, /\| 2026-09-14 \| 13:00-14:00 \| Makeup\s+\|\s+\|/);
  const back = T.parseScheduleText(text);
  assert.equal(back.ok, true, JSON.stringify(back.errors));
  assert.equal(back.rows[0].detail, 'Dr A · R12');
  assert.equal(Object.prototype.hasOwnProperty.call(back.rows[1], 'detail'), false,
    'the padded blank cell comes back as no detail, not as an empty string');
});

test('format -> parse -> format is stable with details', () => {
  const stored = [
    { id: 'a', dow: 1, time: '09:00', duration: 90, title: 'Mathematics', detail: 'Dr A' },
    { id: 'b', date: '2026-09-14', time: '13:00', duration: 60, title: 'Makeup' }
  ];
  const once = T.formatScheduleText(stored);
  const parsed = T.parseScheduleText(once);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.errors));
  assert.equal(T.formatScheduleText(stored), once, 'a second pass cannot drift from the first');
});

test('a detail containing a pipe survives the round trip', () => {
  const text = T.formatScheduleText([{ dow: 1, time: '09:00', duration: 60, title: 'Maths', detail: 'R12 | R13' }]);
  const back = T.parseScheduleText(text);
  assert.equal(back.ok, true, JSON.stringify(back.errors));
  assert.equal(back.rows[0].detail, 'R12 | R13');
});

test('a title containing a pipe survives the round trip', () => {
  const text = T.formatScheduleText([{ dow: 1, time: '09:00', duration: 60, title: 'Maths | R12' }]);
  const back = T.parseScheduleText(text);
  assert.equal(back.ok, true);
  assert.equal(back.rows[0].title, 'Maths | R12');
});

test('formatting tolerates anything stored, because stored data is not a promise', () => {
  assert.equal(T.formatScheduleText([]), '');
  assert.equal(T.formatScheduleText(null), '');
  assert.equal(T.formatScheduleText('nope'), '');
  assert.equal(T.formatScheduleText([null, 7, 'x']), '');
  // a record with nothing usable still renders a line rather than throwing
  assert.match(T.formatScheduleText([{ title: 'orphan' }]), /orphan/);
});
