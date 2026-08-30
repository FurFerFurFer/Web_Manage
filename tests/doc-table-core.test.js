/* ── tests/doc-table-core.test.js ──────────────────────────────────────────
   Offline cover for doc-table-core.js — the shape of a documentation table
   and the text format an AI is asked to emit for one.

       node --test tests/doc-table-core.test.js

   Run once by tests/run.js rather than once per timezone: there is no date
   code in this module, so a sweep would cost five runs and prove exactly the
   same thing. Same reasoning as true-storage-core.test.js and
   graph-layout.test.js.

   What is actually being pinned here, in order of how much it would cost to
   get wrong:

   1. A row with the wrong cell count is REFUSED, not guessed at. The whole
      argument for markers occupying real cells is that a miscount becomes
      detectable; if this file stopped asserting it, the format would silently
      degrade into "build the most plausible table" and a wrong table that
      looks right is worse than an error message.

   2. `merges` is ABSENT when there are none. Two existing browser cases
      deepEqual a whole table block, and every table stored before this feature
      existed has no such key — writing `merges: []` would break both of those
      and invent a second spelling of "no merges".

   3. Merging never touches `rows`. Covered text is hidden, not cleared, which
      is the only reason unmerge is a restore and the only reason neither
      control prompts.

   Fixtures are synthetic, always (AGENTS.md, "Preserve old data").
*/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// doc-table-core.js is a browser IIFE ending in `})(window)`, so `window` has
// to exist before it runs. runInThisContext, not runInNewContext: the module is
// built on Array.isArray, and a fresh realm would make arrays built here fail
// it — quietly testing something the browser never does.
globalThis.window = globalThis;
vm.runInThisContext(
  fs.readFileSync(path.join(__dirname, '..', 'doc-table-core.js'), 'utf8'),
  { filename: 'doc-table-core.js' }
);
const T = globalThis.TrackDocTable;

const lines = (...ls) => ls.join('\n');
const block = (rows, merges) => (merges ? { rows, merges } : { rows });

// ── module surface ─────────────────────────────────────────────────────────

test('the module exports exactly the documented surface', () => {
  // Written out by hand on purpose: if an export is added or renamed, this is
  // the case that notices, the same way tests/schema.test.js pins SLOT_FIELDS.
  assert.deepEqual(Object.keys(T).sort(), [
    'MAX_COLS', 'MAX_ROWS', 'MIN_COL_PCT', 'canMerge', 'canMoveLine', 'colWidthsOf',
    'formatTableText', 'gridSize', 'lineBands', 'mergeAt', 'mergeCells', 'mergeMap',
    'moveLine', 'normalizeColWidths', 'normalizeMerges', 'parseTableText',
    'resizeColumn', 'rowsOf', 'unmergeCell', 'withColWidths', 'withMerges', 'withRows'
  ].sort());
});

// ── parsing: the plain case ────────────────────────────────────────────────

test('a plain grid parses with NO merges key material at all', () => {
  const r = T.parseTableText(lines('| a | b |', '| c | d |'));
  assert.equal(r.ok, true);
  assert.deepEqual(r.rows, [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(r.merges, [], 'nothing spans, so nothing is recorded');
});

test('the fence is optional, and both ::: and ``` are accepted', () => {
  const bare = T.parseTableText(lines('| a | b |', '| c | d |'));
  const colons = T.parseTableText(lines('::: track-table', '| a | b |', '| c | d |', ':::'));
  const ticks = T.parseTableText(lines('```track-table', '| a | b |', '| c | d |', '```'));
  // Copying out of a chat's rendered code block hands you the contents with no
  // fence, so refusing the bare form would break the common path.
  assert.deepEqual(bare.rows, colons.rows);
  assert.deepEqual(bare.rows, ticks.rows);
  assert.equal(ticks.ok, true);
});

test('outer pipes are optional and blank lines are ignored', () => {
  const r = T.parseTableText(lines('a | b', '', 'c | d', ''));
  assert.equal(r.ok, true);
  assert.deepEqual(r.rows, [['a', 'b'], ['c', 'd']]);
});

test('a markdown separator row is skipped, so an ordinary markdown table pastes', () => {
  const r = T.parseTableText(lines('| Name | Score |', '|------|------:|', '| Ada  | 9     |'));
  assert.equal(r.ok, true);
  assert.deepEqual(r.rows, [['Name', 'Score'], ['Ada', '9']]);
  assert.deepEqual(r.merges, []);
});

// ── parsing: merges ────────────────────────────────────────────────────────

test('<< spans columns, and a chain of them spans the whole row', () => {
  const r = T.parseTableText(lines('| a | b | c |', '| wide | << | << |'));
  assert.equal(r.ok, true);
  assert.deepEqual(r.merges, [{ r: 1, c: 0, rs: 1, cs: 3 }]);
  assert.deepEqual(r.rows, [['a', 'b', 'c'], ['wide', '', '']],
    'the covered cells are emitted empty, not left holding the marker');
});

test('^^ spans rows', () => {
  const r = T.parseTableText(lines('| a | tall |', '| b | ^^   |', '| c | ^^   |'));
  assert.equal(r.ok, true);
  assert.deepEqual(r.merges, [{ r: 0, c: 1, rs: 3, cs: 1 }]);
});

test('the two markers combine into a rectangular block', () => {
  const r = T.parseTableText(lines('| big | << | x |', '| ^^  | ^^ | y |'));
  assert.equal(r.ok, true);
  assert.deepEqual(r.merges, [{ r: 0, c: 0, rs: 2, cs: 2 }]);
  assert.deepEqual(r.rows, [['big', '', 'x'], ['', '', 'y']]);
});

test('several independent merges are all reported', () => {
  const r = T.parseTableText(lines(
    '| Region     | Q1 | Q2 |',
    '| North      | 50 | 60 |',
    '| South      | 45 | ^^ |',
    '| Total: 155 | << | << |'
  ));
  assert.equal(r.ok, true);
  assert.deepEqual(r.merges, [
    { r: 1, c: 2, rs: 2, cs: 1 },
    { r: 3, c: 0, rs: 1, cs: 3 }
  ]);
});

// ── parsing: refusals ──────────────────────────────────────────────────────

test('a row with the wrong cell count is REFUSED and the line is named', () => {
  // The load-bearing case. Markers occupy real cells, so a correct block is
  // always rectangular — guessing which cell went missing is how a wrong table
  // gets built that looks right.
  const r = T.parseTableText(lines('| a | b | c |', '| d | e |'));
  assert.equal(r.ok, false);
  assert.equal(r.rows.length, 0, 'nothing is returned half-parsed');
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].line, 2, 'the error points at the offending line of the pasted text');
  assert.match(r.errors[0].message, /2 cells.*first row has 3/);
});

test('the reported line number counts the fence and blank lines the user can see', () => {
  const r = T.parseTableText(lines('::: track-table', '| a | b |', '', '| c |', ':::'));
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].line, 4, 'line 4 of what was pasted, not row 2 of what survived filtering');
});

test('<< in the first column and ^^ in the first row are both refused', () => {
  const left = T.parseTableText(lines('| << | b |', '| c  | d |'));
  assert.equal(left.ok, false);
  assert.match(left.errors[0].message, /first column/);

  const up = T.parseTableText(lines('| ^^ | b |', '| c  | d |'));
  assert.equal(up.ok, false);
  assert.match(up.errors[0].message, /first row/);
});

test('a non-rectangular merged region is refused, naming the cell it starts at', () => {
  // An L-shape: `a` would own (0,0), (1,0) and (1,1), which no HTML table can
  // draw. Accepting it would mean silently dropping part of the region.
  const r = T.parseTableText(lines('| a  | b  |', '| ^^ | << |'));
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, /not a rectangle/);
  assert.match(r.errors[0].message, /row 1, column 1/);
});

test('empty, single-row and single-column input are each refused with a reason', () => {
  assert.equal(T.parseTableText('').ok, false);
  assert.equal(T.parseTableText('   \n  ').ok, false);
  assert.equal(T.parseTableText(null).ok, false);

  const oneRow = T.parseTableText('| a | b |');
  assert.equal(oneRow.ok, false);
  assert.match(oneRow.errors[0].message, /at least two/);

  const oneCol = T.parseTableText(lines('a', 'b'));
  assert.equal(oneCol.ok, false);
  assert.match(oneCol.errors[0].message, /one column/);
});

test('a runaway paste is refused before it reaches storage', () => {
  const wide = '| ' + new Array(T.MAX_COLS + 2).join('x | ');
  const tooWide = T.parseTableText(lines(wide, wide));
  assert.equal(tooWide.ok, false);
  assert.match(tooWide.errors[0].message, /columns; the limit is/);

  const row = '| a | b |';
  const tooTall = T.parseTableText(new Array(T.MAX_ROWS + 2).fill(row).join('\n'));
  assert.equal(tooTall.ok, false);
  assert.match(tooTall.errors[0].message, /rows; the limit is/);
});

// ── parsing: escapes ───────────────────────────────────────────────────────

test('a cell whose text is literally << or ^^ is escaped with a backslash', () => {
  const r = T.parseTableText(lines('| a   | b   |', '| \\<< | \\^^ |'));
  assert.equal(r.ok, true);
  assert.deepEqual(r.rows, [['a', 'b'], ['<<', '^^']]);
  assert.deepEqual(r.merges, [], 'the escaped markers did NOT merge anything');
});

test('<< and ^^ inside longer text are ordinary characters needing no escape', () => {
  const r = T.parseTableText(lines('| a      | b       |', '| x << y | ^^ here |'));
  assert.equal(r.ok, true);
  assert.deepEqual(r.rows, [['a', 'b'], ['x << y', '^^ here']]);
  assert.deepEqual(r.merges, []);
});

test('a literal pipe inside a cell is written \\| and does not split the row', () => {
  const r = T.parseTableText(lines('| a     | b |', '| x \\| y | z |'));
  assert.equal(r.ok, true);
  assert.deepEqual(r.rows, [['a', 'b'], ['x | y', 'z']]);
});

// ── mergeMap: the single definition of what renders ────────────────────────

test('mergeMap marks the owner with its span and every covered cell null', () => {
  const b = block([['big', '', 'x'], ['', '', 'y']], [{ r: 0, c: 0, rs: 2, cs: 2 }]);
  assert.deepEqual(T.mergeMap(b), [
    [{ rs: 2, cs: 2 }, null, { rs: 1, cs: 1 }],
    [null, null, { rs: 1, cs: 1 }]
  ]);
});

test('mergeMap on a table with no merges is a plain grid of 1x1', () => {
  assert.deepEqual(T.mergeMap(block([['a', 'b'], ['c', 'd']])), [
    [{ rs: 1, cs: 1 }, { rs: 1, cs: 1 }],
    [{ rs: 1, cs: 1 }, { rs: 1, cs: 1 }]
  ]);
});

test('rowsOf PRESERVES row indices — a malformed row is emptied, never dropped', () => {
  // The editor writes a cell back by the index it rendered at. Dropping a bad
  // row here would shift every row after it and send the next keystroke into
  // the wrong cell, which is silent data loss wearing defensiveness as a hat.
  assert.deepEqual(T.rowsOf({ rows: [['a'], 'oops', ['b']] }), [['a'], [], ['b']]);
  assert.deepEqual(T.rowsOf({ rows: [null, ['b']] }), [[], ['b']]);
  assert.deepEqual(T.rowsOf({ rows: [[1, null, 'c']] }), [['', '', 'c']],
    'a non-string cell is emptied in place, keeping the column count');
  assert.deepEqual(T.rowsOf(null), []);
  assert.deepEqual(T.rowsOf({ rows: 'nope' }), []);
});

test('mergeMap cannot throw on a malformed or hand-edited block', () => {
  // schema.js validates `docPages: 'list'` and no block shape at all, so
  // anything can arrive from an import, a sync, or a hand-edited file. A throw
  // here escapes a React render and empties the whole page.
  assert.deepEqual(T.mergeMap(null), []);
  assert.deepEqual(T.mergeMap({}), []);
  assert.deepEqual(T.mergeMap({ rows: 'nope' }), []);
  assert.deepEqual(T.mergeMap({ rows: [['a']], merges: 'nope' }), [[{ rs: 1, cs: 1 }]]);
  assert.deepEqual(T.mergeMap({ rows: [[1, null], ['c', 'd']] }), [
    [{ rs: 1, cs: 1 }, { rs: 1, cs: 1 }], [{ rs: 1, cs: 1 }, { rs: 1, cs: 1 }]
  ]);
  assert.doesNotThrow(() => T.mergeMap({ rows: [['a', 'b']], merges: [null, { r: 'x' }, {}] }));
});

// ── normalizeMerges ────────────────────────────────────────────────────────

test('normalizeMerges CLAMPS a region that runs off the grid rather than dropping it', () => {
  // Clamping is what makes `− row` non-destructive: a 3x2 that loses a row
  // becomes 2x2 and keeps its text, instead of vanishing with the layout.
  const b = block([['a', 'b'], ['c', 'd']], [{ r: 0, c: 0, rs: 3, cs: 2 }]);
  assert.deepEqual(T.normalizeMerges(b), [{ r: 0, c: 0, rs: 2, cs: 2 }]);
});

test('normalizeMerges drops a region clamped down to a single cell', () => {
  const b = block([['a', 'b'], ['c', 'd']], [{ r: 1, c: 1, rs: 4, cs: 4 }]);
  assert.deepEqual(T.normalizeMerges(b), [], 'a 1x1 merge is not a merge');
});

test('normalizeMerges drops an out-of-bounds origin and a degenerate span', () => {
  const b = block([['a', 'b'], ['c', 'd']], [
    { r: 9, c: 0, rs: 2, cs: 2 },
    { r: 0, c: 0, rs: 0, cs: 0 },
    { r: -1, c: 0, rs: 2, cs: 2 }
  ]);
  assert.deepEqual(T.normalizeMerges(b), []);
});

test('normalizeMerges resolves overlap deterministically — first wins', () => {
  const b = block([['a', 'b'], ['c', 'd']], [
    { r: 0, c: 0, rs: 1, cs: 2 },
    { r: 0, c: 1, rs: 2, cs: 1 }
  ]);
  assert.deepEqual(T.normalizeMerges(b), [{ r: 0, c: 0, rs: 1, cs: 2 }]);
});

// ── writers ────────────────────────────────────────────────────────────────

test('withMerges DELETES the key when the list empties', () => {
  // Absence is the default. There is no legacy fallback behind `merges`, so an
  // empty stored list would be a second spelling of "none" — and two existing
  // browser cases deepEqual a whole table block, which an added key breaks.
  const b = { id: 'b-1', type: 'table', rows: [['a', 'b']], merges: [{ r: 0, c: 0, rs: 1, cs: 2 }] };
  const cleared = T.withMerges(b, []);
  assert.equal('merges' in cleared, false);
  assert.deepEqual(cleared, { id: 'b-1', type: 'table', rows: [['a', 'b']] });
});

test('withMerges preserves keys it has never heard of', () => {
  const b = { id: 'b-1', type: 'table', rows: [['a', 'b']], somethingLater: 42 };
  assert.equal(T.withMerges(b, [{ r: 0, c: 0, rs: 1, cs: 2 }]).somethingLater, 42);
});

test('withRows re-normalises, so dropping the last row clamps a merge that spanned it', () => {
  const b = { id: 'b-1', type: 'table', rows: [['a', 'b'], ['c', 'd'], ['e', 'f']],
    merges: [{ r: 0, c: 0, rs: 3, cs: 1 }] };
  const shorter = T.withRows(b, b.rows.slice(0, -1));
  assert.deepEqual(shorter.merges, [{ r: 0, c: 0, rs: 2, cs: 1 }]);
  assert.deepEqual(shorter.rows, [['a', 'b'], ['c', 'd']]);
});

test('withRows drops the key entirely when the last removal leaves nothing spanning', () => {
  const b = { id: 'b-1', type: 'table', rows: [['a', 'b'], ['c', 'd']],
    merges: [{ r: 0, c: 0, rs: 2, cs: 1 }] };
  const shorter = T.withRows(b, b.rows.slice(0, -1));
  assert.equal('merges' in shorter, false);
});

test('withRows clamps a merge when the last COLUMN goes', () => {
  const b = { id: 'b-1', type: 'table', rows: [['a', 'b', 'c'], ['d', 'e', 'f']],
    merges: [{ r: 0, c: 0, rs: 1, cs: 3 }] };
  const narrower = T.withRows(b, b.rows.map(r => r.slice(0, -1)));
  assert.deepEqual(narrower.merges, [{ r: 0, c: 0, rs: 1, cs: 2 }]);
});

// ── column widths ──────────────────────────────────────────────────────────
// `colWidths` is a list of percentages, one per column, summing to 100. It
// follows the `merges` rule and deliberately NOT the `cautionDates` rule:
// absence is the default and clearing DELETES the key, because there is no
// legacy fallback sitting behind it and an empty list would be a second
// spelling of "none". Two browser cases deepEqual a whole table block.

const total = ws => Math.round(ws.reduce((a, b) => a + b, 0) * 100) / 100;

test('colWidthsOf returns [] for a table that has never been resized', () => {
  assert.deepEqual(T.colWidthsOf({ id: 'b-1', type: 'table', rows: [['a', 'b']] }), []);
});

test('colWidthsOf reads a stored list back, one entry per column', () => {
  assert.deepEqual(T.colWidthsOf({ rows: [['a', 'b']], colWidths: [70, 30] }), [70, 30]);
});

test('colWidthsOf cannot throw on a hand-edited or synced block', () => {
  // schema.js validates `docPages: 'list'` and no block shape at all, so this
  // module is the only thing standing between damaged data and a throw out of
  // a React render — which would empty the whole page, not just the table.
  const bad = [
    { rows: [['a', 'b']], colWidths: 'wide' },
    { rows: [['a', 'b']], colWidths: {} },
    { rows: [['a', 'b']], colWidths: null },
    { rows: [['a', 'b']], colWidths: ['a', 'b'] },
    { rows: [['a', 'b']], colWidths: [NaN, Infinity] },
    { rows: [['a', 'b']], colWidths: [70, -5] },
    { rows: [['a', 'b']], colWidths: [0, 0] }
  ];
  bad.forEach(b => {
    const w = T.colWidthsOf(b);
    assert.equal(Array.isArray(w), true);
    if (w.length) {
      assert.equal(w.length, 2, 'one entry per column or nothing at all');
      assert.equal(w.every(n => typeof n === 'number' && isFinite(n) && n > 0), true);
      assert.equal(total(w), 100);
    }
  });
});

test('colWidthsOf normalises a list that does not add up to 100', () => {
  // Stored data is not a promise. A list in any units at all is read as a
  // ratio, so a hand-written [2, 1] means two thirds and one third.
  assert.deepEqual(T.colWidthsOf({ rows: [['a', 'b', 'c']], colWidths: [2, 1, 1] }), [50, 25, 25]);
});

test('withColWidths DELETES the key when the list empties', () => {
  const b = { id: 'b-1', type: 'table', rows: [['a', 'b']], colWidths: [70, 30] };
  const cleared = T.withColWidths(b, []);
  assert.equal('colWidths' in cleared, false);
  assert.deepEqual(cleared, { id: 'b-1', type: 'table', rows: [['a', 'b']] });
});

test('withColWidths preserves keys it has never heard of, merges included', () => {
  const b = { id: 'b-1', type: 'table', rows: [['a', 'b']],
    merges: [{ r: 0, c: 0, rs: 1, cs: 2 }], somethingLater: 42 };
  const next = T.withColWidths(b, [70, 30]);
  assert.equal(next.somethingLater, 42);
  assert.deepEqual(next.merges, [{ r: 0, c: 0, rs: 1, cs: 2 }]);
});

test('withColWidths stores a list that sums to exactly 100', () => {
  const b = { rows: [['a', 'b', 'c']] };
  const next = T.withColWidths(b, [1, 1, 1]);
  assert.equal(total(next.colWidths), 100, 'thirds still add up, despite the rounding');
});

test('withRows TRUNCATES the widths when a column goes, and still sums to 100', () => {
  // − col computes the new rows itself and hands them to withRows, exactly as
  // it already does for merges — so neither of those four inline handlers has
  // to know this field exists.
  const b = { id: 'b-1', type: 'table', rows: [['a', 'b', 'c'], ['d', 'e', 'f']],
    colWidths: [50, 25, 25] };
  const narrower = T.withRows(b, b.rows.map(r => r.slice(0, -1)));
  assert.equal(narrower.colWidths.length, 2);
  assert.equal(total(narrower.colWidths), 100);
  assert.equal(narrower.colWidths[0] > narrower.colWidths[1], true,
    'the columns that survive keep their proportions to each other');
});

test('withRows PADS the widths when a column arrives, and still sums to 100', () => {
  const b = { id: 'b-1', type: 'table', rows: [['a', 'b'], ['c', 'd']], colWidths: [50, 50] };
  const wider = T.withRows(b, b.rows.map(r => [...r, '']));
  assert.equal(wider.colWidths.length, 3);
  assert.equal(total(wider.colWidths), 100);
});

test('withRows leaves a table that was never resized with NO colWidths key', () => {
  const b = { id: 'b-1', type: 'table', rows: [['a', 'b'], ['c', 'd']] };
  const wider = T.withRows(b, b.rows.map(r => [...r, '']));
  assert.deepEqual(Object.keys(wider), ['id', 'type', 'rows'],
    'the stored shape is exactly what it was before this feature existed');
});

test('resizeColumn moves ONE boundary and conserves the total', () => {
  const b = { rows: [['a', 'b', 'c']], colWidths: [40, 30, 30] };
  const next = T.resizeColumn(b, 0, 60);
  assert.equal(next.colWidths[0], 60);
  assert.equal(next.colWidths[1], 10, 'the neighbour paid for it');
  assert.equal(next.colWidths[2], 30, 'and nothing else moved');
  assert.equal(total(next.colWidths), 100);
});

test('resizeColumn seeds equal columns for a table that was never resized', () => {
  // table-layout: fixed with no widths draws the columns equally, so seeding
  // equal is what the user was already looking at — the first drag moves one
  // boundary rather than snapping the whole table.
  const b = { id: 'b-1', type: 'table', rows: [['a', 'b', 'c', 'd']] };
  const next = T.resizeColumn(b, 0, 40);
  assert.equal(next.colWidths[0], 40);
  assert.equal(next.colWidths[1], 10, '25 gave up 15');
  assert.deepEqual(next.colWidths.slice(2), [25, 25]);
});

test('resizeColumn refuses to push either side of the boundary below the floor', () => {
  const b = { rows: [['a', 'b']], colWidths: [50, 50] };
  assert.equal(T.resizeColumn(b, 0, 0).colWidths[0], T.MIN_COL_PCT);
  assert.equal(T.resizeColumn(b, 0, 999).colWidths[1], T.MIN_COL_PCT);
  assert.equal(total(T.resizeColumn(b, 0, 999).colWidths), 100);
});

test('resizeColumn returns the block UNCHANGED for a boundary that is not there', () => {
  // Same refuse-by-returning-unchanged contract mergeCells already uses, so a
  // caller that skipped the bounds check cannot corrupt the grid.
  const b = { id: 'b-1', type: 'table', rows: [['a', 'b']], colWidths: [50, 50] };
  assert.equal(T.resizeColumn(b, 1, 40), b, 'the last column has no boundary to its right');
  assert.equal(T.resizeColumn(b, -1, 40), b);
  assert.equal(T.resizeColumn(b, 9, 40), b);
});

test('GUARD: width and merge geometry are independent', () => {
  // Passes on both sides of this feature by design. If it ever fails, the two
  // fields have become entangled and unmerging has stopped being a restore.
  const b = { id: 'b-1', type: 'table', rows: [['a', 'b'], ['c', 'd']], colWidths: [70, 30] };
  const merged = T.mergeCells(b, 0, 0, 'right');
  assert.deepEqual(merged.colWidths, [70, 30], 'merging did not touch the widths');
  assert.deepEqual(T.unmergeCell(merged, 0, 0).colWidths, [70, 30]);

  const resized = T.resizeColumn(b, 0, 50);
  assert.equal('merges' in resized, false, 'and resizing invented no merges');
  assert.deepEqual(resized.rows, [['a', 'b'], ['c', 'd']], 'nor touched a single cell');
});

// ── canMerge / mergeCells / unmergeCell ────────────────────────────────────

test('canMerge refuses at the last row and the last column, with a reason', () => {
  const b = block([['a', 'b'], ['c', 'd']]);
  assert.equal(T.canMerge(b, 0, 1, 'right').ok, false);
  assert.match(T.canMerge(b, 0, 1, 'right').reason, /last column/);
  assert.equal(T.canMerge(b, 1, 0, 'down').ok, false);
  assert.match(T.canMerge(b, 1, 0, 'down').reason, /last row/);
  assert.equal(T.canMerge(b, 0, 0, 'right').ok, true);
  assert.equal(T.canMerge(b, 0, 0, 'down').ok, true);
});

test('canMerge refuses to absorb a neighbour that is already merged', () => {
  // Deliberately strict. Absorbing a neighbouring region would sometimes be
  // valid and sometimes silently swallow a large one; "unmerge it first" fits
  // in one sentence and is what the disabled button's title says.
  const b = block([['a', 'b', 'c'], ['d', 'e', 'f']], [{ r: 0, c: 1, rs: 2, cs: 1 }]);
  const can = T.canMerge(b, 0, 0, 'right');
  assert.equal(can.ok, false);
  assert.match(can.reason, /already merged. Unmerge it first/);
});

test('canMerge refuses on a covered cell', () => {
  const b = block([['a', 'b'], ['c', 'd']], [{ r: 0, c: 0, rs: 1, cs: 2 }]);
  assert.equal(T.canMerge(b, 0, 1, 'down').ok, false);
});

test('mergeCells composes — merging right twice spans three columns', () => {
  let b = block([['a', 'b', 'c'], ['d', 'e', 'f']]);
  b = T.mergeCells(b, 0, 0, 'right');
  assert.deepEqual(b.merges, [{ r: 0, c: 0, rs: 1, cs: 2 }]);
  b = T.mergeCells(b, 0, 0, 'right');
  assert.deepEqual(b.merges, [{ r: 0, c: 0, rs: 1, cs: 3 }]);
});

test('mergeCells NEVER touches rows — the covered text is hidden, not cleared', () => {
  // This is the whole reason unmerge is a restore rather than a guess, and the
  // reason neither control asks for confirmation.
  const b = block([['keep me', 'and me'], ['row two', 'cell']]);
  const merged = T.mergeCells(b, 0, 0, 'right');
  assert.deepEqual(merged.rows, [['keep me', 'and me'], ['row two', 'cell']]);
  assert.deepEqual(T.mergeMap(merged)[0][1], null, 'but it stops being drawn');
});

test('unmergeCell puts the covered cell back exactly as it was', () => {
  const original = block([['keep me', 'and me'], ['row two', 'cell']]);
  const merged = T.mergeCells(original, 0, 0, 'right');
  const restored = T.unmergeCell(merged, 0, 0);
  assert.deepEqual(restored, original, 'including having no merges key at all again');
  assert.deepEqual(T.mergeMap(restored)[0][1], { rs: 1, cs: 1 });
});

test('mergeCells refuses by returning the block unchanged', () => {
  // A caller that skipped canMerge must not be able to corrupt the grid.
  const b = block([['a', 'b'], ['c', 'd']]);
  assert.equal(T.mergeCells(b, 0, 1, 'right'), b);
  assert.equal(T.mergeCells(b, 0, 0, 'sideways'), b);
});

test('mergeAt finds the region a cell owns, and nothing for a plain cell', () => {
  const b = block([['a', 'b'], ['c', 'd']], [{ r: 0, c: 0, rs: 1, cs: 2 }]);
  assert.deepEqual(T.mergeAt(b, 0, 0), { r: 0, c: 0, rs: 1, cs: 2 });
  assert.equal(T.mergeAt(b, 1, 0), null);
});

// ── moving a row or a column ───────────────────────────────────────────────

test('lineBands glues the rows a merge spans and leaves plain rows alone', () => {
  const b = block([['a', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h']],
    [{ r: 1, c: 0, rs: 2, cs: 1 }]);
  assert.deepEqual(T.lineBands(b, 'row'),
    [{ start: 0, end: 1 }, { start: 1, end: 3 }, { start: 3, end: 4 }]);
  // cs is 1, so the same merge glues no COLUMN boundary.
  assert.deepEqual(T.lineBands(b, 'col'), [{ start: 0, end: 1 }, { start: 1, end: 2 }]);
});

test('lineBands is transitive — two merges sharing a row fall out as ONE band', () => {
  // Gluing per boundary rather than per region is what buys this. Rows 0-1 and
  // rows 1-2 are separate rectangles that between them tie all three together.
  const b = block([['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i']],
    [{ r: 0, c: 0, rs: 2, cs: 1 }, { r: 1, c: 1, rs: 2, cs: 1 }]);
  assert.deepEqual(T.lineBands(b, 'row'), [{ start: 0, end: 3 }]);
});

test('lineBands on a table with no merges is one band per line', () => {
  const b = block([['a', 'b', 'c'], ['d', 'e', 'f']]);
  assert.deepEqual(T.lineBands(b, 'row'), [{ start: 0, end: 1 }, { start: 1, end: 2 }]);
  assert.deepEqual(T.lineBands(b, 'col'),
    [{ start: 0, end: 1 }, { start: 1, end: 2 }, { start: 2, end: 3 }]);
});

test('moveLine swaps two plain rows', () => {
  const b = block([['a', 'b'], ['c', 'd'], ['e', 'f']]);
  assert.deepEqual(T.moveLine(b, 'row', 2, -1).rows, [['a', 'b'], ['e', 'f'], ['c', 'd']]);
  assert.deepEqual(T.moveLine(b, 'row', 0, 1).rows, [['c', 'd'], ['a', 'b'], ['e', 'f']]);
});

test('moveLine steps a plain row straight OVER a merged band, in one move', () => {
  // The whole point of bands: the row below a two-row merge lands ABOVE it, not
  // in the middle of it, so one click is one move however the table is spanned.
  const b = block([['head', 'x'], ['tall', 'a'], ['', 'b'], ['last', 'z']],
    [{ r: 1, c: 0, rs: 2, cs: 1 }]);
  const up = T.moveLine(b, 'row', 3, -1);
  assert.deepEqual(up.rows, [['head', 'x'], ['last', 'z'], ['tall', 'a'], ['', 'b']]);
  assert.deepEqual(up.merges, [{ r: 2, c: 0, rs: 2, cs: 1 }],
    'and the merge followed its own rows rather than staying at index 1');
});

test('moveLine moves a merged band as ONE piece, its span unchanged', () => {
  const b = block([['head', 'x'], ['tall', 'a'], ['', 'b'], ['last', 'z']],
    [{ r: 1, c: 0, rs: 2, cs: 1 }]);
  const up = T.moveLine(b, 'row', 1, -1);
  assert.deepEqual(up.rows, [['tall', 'a'], ['', 'b'], ['head', 'x'], ['last', 'z']]);
  assert.deepEqual(up.merges, [{ r: 0, c: 0, rs: 2, cs: 1 }], 'rs is still 2');
  // Reached from the covered row too — sel lands on the owner, but the band is
  // what is looked up, so either index finds it.
  assert.deepEqual(T.moveLine(b, 'row', 2, -1).rows, up.rows);
});

test('moveLine on the column axis permutes colWidths alongside the cells', () => {
  const b = { id: 'b-1', type: 'table', rows: [['a', 'b', 'c'], ['d', 'e', 'f']],
    colWidths: [20, 30, 50] };
  const right = T.moveLine(b, 'col', 0, 1);
  assert.deepEqual(right.rows, [['b', 'a', 'c'], ['e', 'd', 'f']]);
  assert.deepEqual(right.colWidths, [30, 20, 50], 'the width travelled with its column');
});

test('moveLine NEVER changes cell text — the same strings come back reordered', () => {
  // The analogue of "mergeCells NEVER touches rows", and the reason a move needs
  // no confirmation: it is a permutation, undone by moving back.
  const b = block([['a', 'b'], ['c', 'd'], ['e', 'f']], [{ r: 0, c: 0, rs: 2, cs: 1 }]);
  // Every CELL, sorted — not the rows joined up. A column move reorders the
  // cells inside a row, so a row-wise comparison would fail on a permutation
  // that is exactly what was asked for.
  const cells = x => x.rows.reduce((a, r) => a.concat(r), []).sort().join(',');
  assert.equal(cells(T.moveLine(b, 'row', 0, 1)), cells(b));
  assert.equal(cells(T.moveLine(b, 'col', 0, 1)), cells(b));
});

test('canMoveLine refuses at the first and last band, and with no selection', () => {
  const b = block([['a', 'b'], ['c', 'd'], ['e', 'f']], [{ r: 1, c: 0, rs: 2, cs: 1 }]);
  assert.deepEqual(T.canMoveLine(b, 'row', 0, -1),
    { ok: false, reason: 'This is already the first row.', span: 1, to: 0 });
  // Rows 1-2 are one band, so it is the LAST band even from index 1.
  assert.deepEqual(T.canMoveLine(b, 'row', 1, 1),
    { ok: false, reason: 'This is already the last row.', span: 2, to: 1 });
  assert.deepEqual(T.canMoveLine(b, 'col', 1, 1),
    { ok: false, reason: 'This is already the last column.', span: 1, to: 1 });
  assert.deepEqual(T.canMoveLine(b, 'row', 9, -1),
    { ok: false, reason: 'Click a cell first.', span: 0, to: 9 });
  // Refused, `to` is the line itself, so a caller can read it without branching.
  assert.deepEqual(T.canMoveLine(b, 'row', 0, 1), { ok: true, reason: '', span: 1, to: 2 });
});

test('a merge spanning the whole axis says so, rather than "already the first"', () => {
  // A footer like `| Total | << | << |` glues every column into one band, so no
  // column can move. "This is already the first column." would be true of a
  // one-column table and misleading here, and the user cannot act on it.
  const wide = block([['Total', '', ''], ['a', 'b', 'c']], [{ r: 0, c: 0, rs: 1, cs: 3 }]);
  assert.equal(T.canMoveLine(wide, 'col', 1, -1).reason,
    'A merged cell spans every column. Unmerge it first.');
  assert.equal(T.canMoveLine(wide, 'col', 1, 1).reason,
    'A merged cell spans every column. Unmerge it first.');
  // ROWS are untouched by it — cs glues no row boundary, so they still move.
  assert.equal(T.canMoveLine(wide, 'row', 0, 1).ok, true);

  // And a merge covering only SOME columns still leaves the rest movable.
  const part = block([['x', '', 'c', 'd'], ['a', 'b', 'e', 'f']], [{ r: 0, c: 0, rs: 1, cs: 2 }]);
  assert.equal(T.canMoveLine(part, 'col', 2, -1).ok, true, 'column 2 jumps the merged pair');
  assert.equal(T.canMoveLine(part, 'col', 0, 1).ok, true, 'and the pair moves as one');
  assert.equal(T.canMoveLine(part, 'col', 0, -1).reason, 'This is already the first column.');
});

test('canMoveLine.to reports where the moved line LANDS, jumping a whole band', () => {
  // The selection has to follow the line it moved, or a second press on the same
  // button moves whatever slid into the old coordinates. That offset is band
  // arithmetic, so it lives here rather than at the call site.
  const b = block([['head', 'x'], ['tall', 'a'], ['', 'b'], ['last', 'z']],
    [{ r: 1, c: 0, rs: 2, cs: 1 }]);
  assert.equal(T.canMoveLine(b, 'row', 3, -1).to, 1, 'the plain row clears BOTH merged rows');
  assert.equal(T.canMoveLine(b, 'row', 1, -1).to, 0, 'and the band itself steps up by one');
  // From the covered row: the band moves as one, so its covered row lands one
  // above too, and the selection stays inside the same region.
  assert.equal(T.canMoveLine(b, 'row', 2, -1).to, 1);
  // Applying the move must actually put the line where `to` said it would.
  const moved = T.moveLine(b, 'row', 3, -1);
  assert.deepEqual(moved.rows[T.canMoveLine(b, 'row', 3, -1).to], ['last', 'z']);
});

test('moveLine returns the block UNCHANGED when refused', () => {
  // A caller that skipped canMoveLine must not be able to corrupt the grid.
  const b = block([['a', 'b'], ['c', 'd']]);
  assert.equal(T.moveLine(b, 'row', 0, -1), b);
  assert.equal(T.moveLine(b, 'row', 1, 1), b);
  assert.equal(T.moveLine(b, 'row', 7, 1), b);
});

test('moveLine cannot throw on a hand-edited or synced block, and keeps row COUNT', () => {
  // Same discipline as mergeMap and colWidthsOf: a throw here escapes a React
  // render and empties the whole page. It reads through rowsOf, so a malformed
  // row is emptied rather than dropped — the row count has to survive, because
  // the editor writes a cell back by the index it rendered at.
  const bad = { id: 'b-1', type: 'table',
    rows: [['a', 'b'], 'not a row', [null, 7]],
    merges: [{ r: 0, c: 0, rs: 2, cs: 1 }, 'junk', null],
    colWidths: 'nope' };
  const out = T.moveLine(bad, 'row', 0, 1);
  assert.equal(out.rows.length, 3, 'the malformed row is emptied, never dropped');
  assert.deepEqual(T.moveLine({ id: 'x', type: 'table' }, 'row', 0, 1), { id: 'x', type: 'table' });
  assert.deepEqual(T.lineBands({}, 'row'), []);
  assert.deepEqual(T.lineBands(null, 'col'), []);
});

test('a COLUMN move squares off a ragged row rather than shifting its cells', () => {
  // The editor writes a cell back by the index it RENDERED at, and gridSize
  // takes the widest row — so a short row has to gain an empty cell, not have
  // its existing ones slide left under the header they no longer sit beneath.
  const ragged = { id: 'b-1', type: 'table', rows: [['a', 'b', 'c'], ['d', 'e']] };
  const out = T.moveLine(ragged, 'col', 0, 1);
  assert.deepEqual(out.rows, [['b', 'a', 'c'], ['e', 'd', '']]);
});

test('GUARD: a table with no merges gains no merges key from a move', () => {
  // Passes on both sides by design. withMerges deletes the key when the list is
  // empty, and three browser cases deepEqual a whole table block — a move that
  // wrote `merges: []` would break all three for nothing.
  const b = { id: 'b-1', type: 'table', rows: [['a', 'b'], ['c', 'd']] };
  const out = T.moveLine(b, 'row', 0, 1);
  assert.equal('merges' in out, false);
  assert.deepEqual(Object.keys(out), ['id', 'type', 'rows']);
});

test('GUARD: a ROW move leaves colWidths exactly as they were', () => {
  // Passes on both sides by design. Widths are per column; a row move that
  // touched them would be reaching across axes.
  const b = { id: 'b-1', type: 'table', rows: [['a', 'b'], ['c', 'd'], ['e', 'f']],
    colWidths: [70, 30] };
  assert.deepEqual(T.moveLine(b, 'row', 0, 1).colWidths, [70, 30]);
});

// ── round trip ─────────────────────────────────────────────────────────────

test('parse -> format -> parse is stable, merges and all', () => {
  const source = lines(
    '| Region     | Q1 | Q2 |',
    '| North      | 50 | 60 |',
    '| South      | 45 | ^^ |',
    '| Total: 155 | << | << |'
  );
  const first = T.parseTableText(source);
  const text = T.formatTableText({ rows: first.rows, merges: first.merges });
  const second = T.parseTableText(text);

  assert.equal(second.ok, true);
  assert.deepEqual(second.rows, first.rows);
  assert.deepEqual(second.merges, first.merges);
});

test('the round trip survives a 2x2 block and the escapes', () => {
  const first = T.parseTableText(lines('| big | << | \\<< |', '| ^^  | ^^ | x |'));
  assert.equal(first.ok, true);
  const second = T.parseTableText(T.formatTableText({ rows: first.rows, merges: first.merges }));
  assert.deepEqual(second.rows, first.rows);
  assert.deepEqual(second.merges, first.merges);
});

test('formatTableText emits the fenced form and an empty table yields nothing', () => {
  assert.equal(T.formatTableText({ rows: [] }), '');
  assert.match(T.formatTableText({ rows: [['a', 'b'], ['c', 'd']] }), /^::: track-table\n/);
});
