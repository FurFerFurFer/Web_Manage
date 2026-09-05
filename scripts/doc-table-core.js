/* ── doc-table-core.js ─────────────────────────────────────────────────────
   The one definition of a documentation table's SHAPE.

   A `docPages` block of type 'table' holds a rectangular grid of strings:

       { id, type: 'table', rows: [[string]] }

   and may now also carry a list of merged regions:

       { …, merges: [{ r, c, rs, cs }] }

   and one width per column, as percentages of the table:

       { …, colWidths: [number] }

   `rows` keeps its old shape exactly — still rectangular, still strings. A
   merge is a separate record naming a top-left cell and how many rows and
   columns it spans; a width is a share of the table, not a pixel count. Five
   rules follow, the first four govern BOTH added fields, and each one is an
   existing rule in AGENTS.md applied to a new field:

   1. ABSENCE IS THE DEFAULT, and the key is DELETED when the list empties.
      Every table stored before this file existed has no `merges` key and
      renders exactly as it always did. There is no legacy fallback sitting
      behind `merges`, so this is the `time` / `link` rule and deliberately NOT
      the `cautionDates: []` rule — an empty list would be a stored value that
      means the same as absence, which is how a field grows a third state
      nobody asked for. `withMerges` is the one writer and it does the delete.

   2. COVERED CELLS KEEP THEIR TEXT. Merging hides `rows[r][c]`; it never
      clears it, so unmerging RESTORES what the user typed rather than handing
      back an empty cell. Same reasoning as `blockOff`: removing writes a flag
      and deletes nothing, so putting it back is a restore, not a recomputed
      guess. It is also why merge and unmerge take no window.confirm — nothing
      is deleted or cleared, so they sit outside the destructive-control rule.

   3. THE GRID STAYS RECTANGULAR. `+ row` / `− row` / `+ col` / `− col` keep
      operating on `rows` alone and then hand the result to `withRows`, which
      re-normalises the merges against the new bounds. A merge that lost a row
      is CLAMPED, not dropped; one clamped down to a single cell is dropped,
      because a 1x1 merge is not a merge.

   4. `mergeMap` IS THE SINGLE DEFINITION OF WHAT RENDERS. Never re-spell a
      `merges.find(…)` at a call site. This project has already paid for that
      shape twice — the deadline caution predicate was written out at three
      sites, one dropped half of it, and the Progress timeline mismarked every
      due day until it was found (AGENTS.md, "Choosable deadline caution
      period").

   5. A MOVE IS NOT A ROW/COLUMN CHANGE, and is the one thing that must NOT go
      through `withRows`. Rule 3 re-normalises against the new BOUNDS, which is
      right when a line was added or dropped and wrong for a reorder: the bounds
      do not change, the INDICES do. Sent through it, every merge would keep its
      old r/c and quietly take over whichever content had moved into those
      coordinates — text intact, rectangle intact, pointing at the wrong cells.
      `moveLine` is therefore a writer of its own: it remaps `merges`, permutes
      `colWidths`, and only then hands the result to `withMerges` /
      `withColWidths` so rule 1 keeps its single home.

      What it moves is a BAND, defined once by `lineBands`. A merge spanning
      more than one line glues the boundaries inside it, and a band is a maximal
      run with no unglued boundary. Bands are contiguous, cover every line and
      never overlap, so every merge lies entirely inside exactly one — which is
      what makes a move a permutation NO RECTANGLE CAN STRADDLE. That is the
      whole design: it is why moving needs no refusal for merges and can never
      tear one, and why a merged region can only ever travel whole.

   The other half of this file is the paste format: the text an AI is asked to
   emit when it is shown a picture of a table. See docs/TABLE-PASTE.md, which is the
   copy handed to the AI. In brief:

       ::: track-table
       | Region     | Q1  | Q2  |
       | North      | 50  | 60  |
       | South      | 45  | ^^  |
       | Total: 155 | <<  | <<  |
       :::

       <<   this cell is absorbed by the cell to its LEFT   (colspan)
       ^^   this cell is absorbed by the cell ABOVE         (rowspan)

   The grid stays rectangular in the TEXT too — markers occupy real cells, so
   every row carries the same number of pipes. That is the load-bearing
   property of the format: a row with the wrong cell count is DETECTED and
   reported against its line number, never silently guessed at. An AI that
   drops a column produces an error naming the row, not a plausible-looking
   wrong table.

   Nothing here reads or writes localStorage, and nothing here renders. It is a
   pure data module like calendar-core.js and true-storage-core.js — the page
   owns persistence and goes through TrackStorage.saveDB.

   Loaded as a classic script by documentations.html.
*/
(function (global) {
  'use strict';

  var MERGE_LEFT = '<<';
  var MERGE_UP = '^^';

  /* A runaway paste should be refused early rather than left to the quota
     guard. These are far above any table a person types and far below anything
     that would bloat track_db. */
  var MAX_ROWS = 200;
  var MAX_COLS = 50;

  /* How narrow a drag may leave a column. Applied at the DRAG and deliberately
     not inside normalizeColWidths: a 50-column table's equal share is 2%, and a
     floor above the equal share would refuse every drag on such a table. The
     effective floor is therefore min(MIN_COL_PCT, 100 / cols). */
  var MIN_COL_PCT = 3;

  /* A fence line can never be confused with a table row, because a row always
     contains a pipe. So both the opening and the closing fence fall out of one
     rule, and ``` and ::: are both accepted — copying out of a chat's rendered
     code block gives you the contents with no fence at all, which is why the
     fence is optional in the first place. */
  var FENCE_RE = /^\s*(?::{3,}|`{3,})\s*[\w-]*\s*$/;

  /* A markdown alignment row. Skipping it is what lets an ordinary markdown
     table — the thing an AI emits when the picture has no merged cells at all
     — paste correctly with no extra code. Its COLONS are read as column
     alignment, which is free: it is the standard markdown spelling and an AI
     emits it out of habit. A plain |---|---| carries none and says nothing, so
     every table that pasted before this still pastes identically. */
  var SEPARATOR_CELL_RE = /^:?-{2,}:?$/;

  /* A directive line, carrying what the grid itself cannot say. It holds NO
     pipe, which is what makes it unmistakable — every table row carries one,
     the same property the fence rule already rests on. Only these two spellings
     are consumed; any other pipe-less line is still the error it always was, so
     a stray sentence of outside text is caught rather than swallowed. */
  var DIRECTIVE_RE = /^\s*(head|headcol)\s*[:=]\s*(\d{1,3})\s*$/i;

  /* Which way a separator cell points. `:---` left, `:--:` centre, `---:`
     right, and a bare `---` says nothing at all. */
  function separatorAlign(cell) {
    var left = cell.charAt(0) === ':';
    var right = cell.charAt(cell.length - 1) === ':';
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return '';
  }

  function isList(v) { return Array.isArray(v); }
  function isMap(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  // ── defensive readers ────────────────────────────────────────────────────
  // schema.js validates `docPages: 'list'` and stops there — no block shape is
  // validated at all, by deliberate choice (AGENTS.md). The cost of that is
  // paid here: every nested read goes through a helper that cannot throw, so a
  // hand-edited or synced table cannot take the page's React render down with
  // it.

  /* A malformed row becomes an EMPTY row, never a dropped one. The editor
     writes a cell back by the index it rendered at, so filtering a bad row out
     here would shift every row after it and send the next keystroke into the
     wrong cell — silent data loss dressed up as defensiveness. Coercing a
     non-string cell to '' is safe by comparison: it only affects what is drawn,
     and React treats a null `value` as uncontrolled anyway. */
  function rowsOf(block) {
    if (!isMap(block) || !isList(block.rows)) return [];
    return block.rows.map(function (row) {
      if (!isList(row)) return [];
      return row.map(function (cell) { return typeof cell === 'string' ? cell : ''; });
    });
  }

  function rawMergesOf(block) {
    if (!isMap(block) || !isList(block.merges)) return [];
    return block.merges.filter(isMap);
  }

  function intAt(v, dflt) {
    var n = typeof v === 'number' ? v : parseInt(v, 10);
    return (typeof n === 'number' && isFinite(n)) ? Math.floor(n) : dflt;
  }

  /* Rows are allowed to be ragged here even though every writer keeps them
     rectangular, because stored data is not a promise. Width is the widest
     row; per-row length is respected everywhere it matters. */
  function gridSize(block) {
    var rows = rowsOf(block);
    var cols = 0;
    for (var i = 0; i < rows.length; i++) if (rows[i].length > cols) cols = rows[i].length;
    return { rows: rows.length, cols: cols };
  }

  // ── merge normalisation ──────────────────────────────────────────────────

  /* The one place a stored merge list is made safe to render. Clamps every
     region to the current grid, drops the ones that no longer span anything,
     and drops any that would overlap a region already kept — first wins, so
     the result is deterministic and does not depend on iteration luck.

     Clamping rather than dropping is what makes `− row` non-destructive: a 2x3
     region that loses its second row becomes 1x3 and keeps its text, instead
     of vanishing and taking the user's layout with it. */
  function normalizeMerges(block) {
    var size = gridSize(block);
    var R = size.rows, C = size.cols;
    var out = [];
    var taken = Object.create(null);

    rawMergesOf(block).forEach(function (m) {
      var r = intAt(m.r, -1), c = intAt(m.c, -1);
      if (r < 0 || c < 0 || r >= R || c >= C) return;

      var rs = Math.max(1, intAt(m.rs, 1));
      var cs = Math.max(1, intAt(m.cs, 1));
      if (r + rs > R) rs = R - r;          // clamp to the grid
      if (c + cs > C) cs = C - c;
      if (rs < 1 || cs < 1) return;
      if (rs === 1 && cs === 1) return;    // a 1x1 merge is not a merge

      for (var rr = r; rr < r + rs; rr++)
        for (var cc = c; cc < c + cs; cc++)
          if (taken[rr + ',' + cc]) return; // overlaps one already kept

      for (var rr2 = r; rr2 < r + rs; rr2++)
        for (var cc2 = c; cc2 < c + cs; cc2++)
          taken[rr2 + ',' + cc2] = true;

      out.push({ r: r, c: c, rs: rs, cs: cs });
    });

    return out;
  }

  /* THE single definition of what renders.

     Returns one entry per cell of `rows`:
        {rs, cs}  — draw this cell, spanning that far
        null      — covered by a merge above or to the left; draw NOTHING

     Sized per row rather than to the grid width, so a ragged stored row does
     not grow phantom cells. */
  function mergeMap(block) {
    var rows = rowsOf(block);
    var map = rows.map(function (row) {
      return row.map(function () { return { rs: 1, cs: 1 }; });
    });

    normalizeMerges(block).forEach(function (m) {
      if (!map[m.r] || !map[m.r][m.c]) return;
      map[m.r][m.c] = { rs: m.rs, cs: m.cs };
      for (var rr = m.r; rr < m.r + m.rs; rr++) {
        for (var cc = m.c; cc < m.c + m.cs; cc++) {
          if (rr === m.r && cc === m.c) continue;
          if (map[rr] && cc < map[rr].length) map[rr][cc] = null;
        }
      }
    });

    return map;
  }

  function mergeAt(block, r, c) {
    var found = null;
    normalizeMerges(block).forEach(function (m) {
      if (m.r === r && m.c === c) found = m;
    });
    return found;
  }

  // ── per-cell alignment ───────────────────────────────────────────────────

  /* A table may carry an alignment per cell:

         { …, align: [{ r, c, h, v }] }

     `h` is 'left' | 'center' | 'right', `v` is 'top' | 'middle' | 'bottom', and
     either may be absent meaning "inherit the surface's default for that axis".
     An entry carrying neither says nothing and is dropped.

     A PARALLEL LIST keyed by coordinate, exactly like `merges`, and deliberately
     NOT a promotion of cells to objects. `rows` keeps its `[[string]]` contract,
     so every table stored before this field existed keeps its shape byte for
     byte, the paste format keeps its cell-is-a-string property, and the browser
     cases that deepEqual a whole block keep meaning something. Promoting cells
     would have broken all three at once, for a field that DECORATES a cell
     rather than holding anything.

     Rules 1 and 4 of the header comment govern it unchanged — absence is the
     default and `withAlign` deletes the key, `alignAt` is the single reader —
     and so does rule 2, which is worth saying out loud here: an entry on a
     COVERED cell is KEPT. Merging hides that cell rather than clearing it, so
     unmerging has to hand the alignment back along with the text, or unmerge is
     a restore for one field and a recomputed guess for the other. */

  var H_ALIGN = { left: true, center: true, right: true };
  var V_ALIGN = { top: true, middle: true, bottom: true };

  function rawAlignOf(block) {
    if (!isMap(block) || !isList(block.align)) return [];
    return block.align.filter(isMap);
  }

  function alignWord(v, table) {
    return (typeof v === 'string' && table[v] === true) ? v : '';
  }

  /* The one place a stored alignment list is made safe to render. Drops a
     coordinate off the grid, a value that is not one of the six words, and an
     entry left saying nothing; first wins on a repeated coordinate, so the
     result is deterministic rather than dependent on iteration luck. Cannot
     throw — schema.js validates no block shape at all, by deliberate choice, and
     this file pays for that. */
  function normalizeAlign(block) {
    var size = gridSize(block);
    var R = size.rows, C = size.cols;
    var out = [];
    var taken = Object.create(null);

    rawAlignOf(block).forEach(function (a) {
      var r = intAt(a.r, -1), c = intAt(a.c, -1);
      if (r < 0 || c < 0 || r >= R || c >= C) return;
      if (taken[r + ',' + c]) return;

      var h = alignWord(a.h, H_ALIGN);
      var v = alignWord(a.v, V_ALIGN);
      if (!h && !v) return;

      taken[r + ',' + c] = true;
      var e = { r: r, c: c };
      if (h) e.h = h;
      if (v) e.v = v;
      out.push(e);
    });

    return out;
  }

  /* THE single definition of how a cell is aligned. Always an object, so a call
     site reads `.h` and `.v` without branching, and '' on an axis means "the
     surface decides". Never spell an `align.find(…)` instead. */
  function alignAt(block, r, c) {
    var found = { h: '', v: '' };
    normalizeAlign(block).forEach(function (a) {
      if (a.r === r && a.c === c) found = { h: a.h || '', v: a.v || '' };
    });
    return found;
  }

  /* The one writer of `align`, and the one home of its delete-when-empty rule.
     Spreads the block rather than rebuilding it from a field list, so `merges`,
     `colWidths` and any key a later version adds all survive. */
  function withAlign(block, list) {
    var next = Object.assign({}, block);
    var norm = normalizeAlign(Object.assign({}, next, { align: isList(list) ? list : [] }));
    if (norm.length) next.align = norm;
    else delete next.align;
    return next;
  }

  /* Sets ONE axis of ONE cell — or clears it, when the value asked for is
     already the one stored. That is what lets the same three buttons apply and
     remove an alignment without a separate "none" nobody would find.

     Nothing is deleted in the sense the destructive-control rule means: the
     cell's TEXT is untouched and pressing the button again puts the alignment
     back, so like merge, unmerge and a line move this asks no question.

     Refuses by returning the block unchanged, the contract mergeCells and
     resizeColumn already use. */
  function setAlign(block, r, c, axis, value) {
    var size = gridSize(block);
    if (!(r >= 0 && c >= 0 && r < size.rows && c < size.cols)) return block;

    var vertical = axis === 'v';
    var word = alignWord(value, vertical ? V_ALIGN : H_ALIGN);
    var cur = alignAt(block, r, c);
    var next = { h: cur.h, v: cur.v };
    next[vertical ? 'v' : 'h'] = (word && word === (vertical ? cur.v : cur.h)) ? '' : word;

    var kept = normalizeAlign(block).filter(function (a) {
      return !(a.r === r && a.c === c);
    });
    if (next.h || next.v) {
      var e = { r: r, c: c };
      if (next.h) e.h = next.h;
      if (next.v) e.v = next.v;
      kept.push(e);
      kept.sort(function (a, b) { return a.r - b.r || a.c - b.c; });
    }
    return withAlign(block, kept);
  }

  // ── header rows and columns ──────────────────────────────────────────────

  /* How many leading rows and columns draw as headers:

         { …, head: n, headCol: n }

     ABSENCE IS THE DEFAULT, and here the default is what the table already did:
     `head` absent means 1 — row 0 is a header, as it has been since tables
     existed — and `headCol` absent means 0. `withHead` therefore DELETES a key
     whose value is the default rather than storing it, so `head: 1` can never
     become a second spelling of absence and a table nobody has touched keeps
     `Object.keys` exactly ['id', 'type', 'rows'].

     CLAMPED ON READ, never on write, and that is the deliberate difference from
     `merges` and `colWidths`. A `head` of 3 on a table cut down to two rows
     draws two and stays 3 in storage, so `+ row` puts the third back — the same
     restore-not-guess reasoning that makes merging keep covered text. Those two
     fields clamp on write because a region pointing off the end is not
     drawable; a count carries no geometry, so nothing has to be. It is why
     `withRows` does not touch these keys at all.

     POSITIONAL, and deliberately so. Moving a row to the top MAKES it the
     header, because "the first n rows are headers" is what a header row is. The
     alternative is a flag per row, which is the promote-rows-to-objects shape
     this file rejects for cells, for the same reason. */

  function headOf(block) {
    var size = gridSize(block);
    var head = (isMap(block) && block.head !== undefined) ? intAt(block.head, 1) : 1;
    var col = (isMap(block) && block.headCol !== undefined) ? intAt(block.headCol, 0) : 0;
    return {
      head: Math.max(0, Math.min(head, size.rows)),
      headCol: Math.max(0, Math.min(col, size.cols))
    };
  }

  /* THE single definition of what draws as a header, and the reason it lives
     here rather than in the page: documentations.html renders a table TWICE, in
     the editor grid and in the paste preview, and those two disagreeing is the
     exact failure the preview exists to rule out. It used to be a literal
     `ri === 0` spelled at both sites. */
  function isHeaderCell(block, r, c) {
    var h = headOf(block);
    return r < h.head || c < h.headCol;
  }

  /* The one writer of both keys and the one home of their delete-at-default
     rule. Either argument may be null to leave that key alone. */
  function withHead(block, head, headCol) {
    var next = Object.assign({}, block);
    if (head !== null && head !== undefined) {
      var h = Math.max(0, intAt(head, 1));
      if (h === 1) delete next.head; else next.head = h;
    }
    if (headCol !== null && headCol !== undefined) {
      var c = Math.max(0, intAt(headCol, 0));
      if (c === 0) delete next.headCol; else next.headCol = c;
    }
    return next;
  }

  // ── column widths ────────────────────────────────────────────

  /* A table may carry one width per column:

         { …, colWidths: [number] }   // percentages, summing to 100

     PERCENTAGES, not pixels, and that is the load-bearing choice. The table is
     rendered at width 100%, so a ratio is resolution-independent: it prints at
     whatever the page turns out to be, it survives the sidebar being collapsed
     or thrown full-screen, and it makes horizontal overflow impossible by
     construction — widening one column narrows its neighbour rather than
     pushing the table off the page. Pixels would have printed at 96 per inch
     and overflowed A4 the moment a table got wide.

     The field follows the `merges` rule above and deliberately NOT the
     `cautionDates` rule: absence is the default and clearing DELETES the key.
     Nothing sits behind it as a fallback, so an empty stored list would be a
     second spelling of "none" — and two browser cases deepEqual a whole table
     block, which any unconditional key would break. */

  function round2(n) { return Math.round(n * 100) / 100; }

  /* Reads a candidate list — or, given none, whatever is stored — against the
     block's current grid, and returns one percentage per column summing to
     exactly 100, or [] when there is nothing usable. Cannot throw.

     Any units at all are read as a RATIO, so a hand-written [2, 1] means two
     thirds and one third. That is what lets `+ col` / `− col` hand a padded or
     truncated list straight back without doing arithmetic of their own. */
  function normalizeColWidths(block, widths) {
    var cols = gridSize(block).cols;
    if (!cols) return [];

    var raw = isList(widths) ? widths
      : (isMap(block) && isList(block.colWidths) ? block.colWidths : null);
    if (!raw || !raw.length) return [];

    // Coerce first, so one damaged entry costs one column rather than the whole
    // list. A rejected entry becomes null and is filled in below.
    var vals = [];
    var sum = 0, n = 0;
    for (var i = 0; i < raw.length && i < cols; i++) {
      var v = typeof raw[i] === 'number' ? raw[i] : parseFloat(raw[i]);
      if (isFinite(v) && v > 0) { vals.push(v); sum += v; n++; }
      else vals.push(null);
    }
    if (!n) return [];

    // A rejected entry, and a column that arrived after the widths were
    // written, both take the average of what IS there. That is the whole of
    // what `+ col` needs: the new column shows up at the average and everything
    // else keeps its proportions.
    while (vals.length < cols) vals.push(null);
    var avg = sum / n;
    for (var j = 0; j < cols; j++) if (vals[j] === null) { vals[j] = avg; sum += avg; }

    var out = vals.map(function (v) { return round2(v * 100 / sum); });

    // Rounding leaves a residual. Give it to the widest column — the one that
    // can afford it — so the stored list adds up to exactly 100 rather than to
    // 99.99. First widest wins, so the result does not depend on iteration luck.
    var diff = round2(100 - out.reduce(function (a, b) { return a + b; }, 0));
    if (diff) {
      var big = 0;
      for (var k = 1; k < out.length; k++) if (out[k] > out[big]) big = k;
      out[big] = round2(out[big] + diff);
    }
    return out;
  }

  function colWidthsOf(block) { return normalizeColWidths(block); }

  /* Moves the ONE boundary between column `index` and the next, setting the
     left side to `pct` and making the right side pay for it, so the pair's
     total — and therefore the table's — is conserved. Both sides keep the
     floor.

     A table that has never been resized seeds EQUAL columns, because that is
     exactly what table-layout: fixed with no widths was already drawing. The
     first drag therefore moves one boundary instead of snapping the whole
     table into a new shape.

     Refuses by returning the block unchanged, the same contract mergeCells
     uses, so a caller that skipped the bounds check cannot corrupt the grid. */
  function resizeColumn(block, index, pct) {
    var cols = gridSize(block).cols;
    if (!(index >= 0 && index + 1 < cols)) return block;

    var v = typeof pct === 'number' ? pct : parseFloat(pct);
    if (!isFinite(v)) return block;

    var w = colWidthsOf(block);
    if (!w.length) {
      w = [];
      for (var i = 0; i < cols; i++) w.push(round2(100 / cols));
    }
    if (index + 1 >= w.length) return block;

    var pair = w[index] + w[index + 1];
    var floor = Math.min(MIN_COL_PCT, 100 / cols);
    var left = Math.max(floor, Math.min(v, pair - floor));

    var next = w.slice();
    next[index] = round2(left);
    next[index + 1] = round2(pair - left);
    return withColWidths(block, next);
  }

  // ── writers (pure) ───────────────────────────────────────────────────────

  /* The one writer of the field, and the one place the delete-when-empty rule
     lives. Spreads the block rather than rebuilding it from a field list, so a
     key added by a later version survives (AGENTS.md, "Preserve unrelated
     fields"). */
  function withMerges(block, merges) {
    var next = Object.assign({}, block);
    if (merges && merges.length) next.merges = merges;
    else delete next.merges;
    return next;
  }

  /* The one writer of `colWidths`, and the one place the delete-when-empty rule
     lives. Spreads the block rather than rebuilding it, so `merges` and any key
     a later version adds both survive. */
  function withColWidths(block, widths) {
    var next = Object.assign({}, block);
    var norm = normalizeColWidths(next, widths);
    if (norm.length) next.colWidths = norm;
    else delete next.colWidths;
    return next;
  }

  /* Every row/column operation goes through here: set the new grid, then
     re-normalise against it. That is what clamps a merge whose last row was
     just removed instead of leaving a region pointing off the end. */
  function withRows(block, rows) {
    var next = Object.assign({}, block, { rows: rows });
    next = withMerges(next, normalizeMerges(next));
    // And the widths, for the same reason: normalizeColWidths derives the
    // column count from the new rows, so a dropped column drops its width and
    // a new one arrives at the average — without any of the four inline
    // + row / − row / + col / − col handlers having to know this field exists.
    next = withColWidths(next);
    // And the alignment, against the new BOUNDS: an entry on a row or column
    // that no longer exists is dropped. `head` and `headCol` are deliberately
    // NOT touched here — they are clamped on read instead, which is what makes
    // a removed row reversible. See the header-rows section above.
    return withAlign(next, normalizeAlign(next));
  }

  /* Whether `⇥ merge right` / `⇩ merge down` can act on the focused cell, and
     if not, why — the reason is shown as the disabled button's title rather
     than discovered by clicking and having nothing happen.

     Deliberately strict: the whole strip being absorbed must be plain,
     unmerged cells. Absorbing a neighbouring merge would sometimes be valid
     and sometimes silently swallow a large region, and "unmerge it first" is a
     mental model that fits in one sentence. */
  function canMerge(block, r, c, dir) {
    var map = mergeMap(block);
    if (!map[r] || !map[r][c]) return { ok: false, reason: 'Select a cell first.' };

    var cur = map[r][c];
    var size = gridSize(block);
    var rr, cc;

    if (dir === 'right') {
      cc = c + cur.cs;
      if (cc >= size.cols) return { ok: false, reason: 'This cell already reaches the last column.' };
      for (rr = r; rr < r + cur.rs; rr++) {
        if (!map[rr] || cc >= map[rr].length) return { ok: false, reason: 'There is no cell to merge into.' };
        var right = map[rr][cc];
        if (!right || right.rs !== 1 || right.cs !== 1)
          return { ok: false, reason: 'The cell to the right is already merged. Unmerge it first.' };
      }
      return { ok: true, reason: '' };
    }

    if (dir === 'down') {
      rr = r + cur.rs;
      if (rr >= size.rows) return { ok: false, reason: 'This cell already reaches the last row.' };
      for (cc = c; cc < c + cur.cs; cc++) {
        if (!map[rr] || cc >= map[rr].length) return { ok: false, reason: 'There is no cell to merge into.' };
        var below = map[rr][cc];
        if (!below || below.rs !== 1 || below.cs !== 1)
          return { ok: false, reason: 'The cell below is already merged. Unmerge it first.' };
      }
      return { ok: true, reason: '' };
    }

    return { ok: false, reason: '' };
  }

  /* Grows the region at (r, c) by one column or one row. Composes: merging
     right twice gives cs 3. Refuses by returning the block unchanged, so a
     caller that skipped canMerge cannot corrupt the grid. */
  function mergeCells(block, r, c, dir) {
    if (!canMerge(block, r, c, dir).ok) return block;

    var map = mergeMap(block);
    var cur = map[r][c];
    var next = { r: r, c: c, rs: cur.rs, cs: cur.cs };
    if (dir === 'right') next.cs += 1; else next.rs += 1;

    var kept = normalizeMerges(block).filter(function (m) {
      return !(m.r === r && m.c === c);
    });
    kept.push(next);
    return withMerges(block, kept);
  }

  /* Puts the covered cells back. Their text was never cleared, so this is a
     restore and not a guess — which is the entire reason merging does not
     prompt. */
  function unmergeCell(block, r, c) {
    var kept = normalizeMerges(block).filter(function (m) {
      return !(m.r === r && m.c === c);
    });
    return withMerges(block, kept);
  }

  // ── moving a row or a column ─────────────────────────────────────────────

  /* The unit a move operates on, and the reason a merge can never be torn.

     A merge that spans more than one line GLUES the boundaries inside it. A band
     is a maximal run of lines with no unglued boundary in it, so bands are
     contiguous, do not overlap, cover every line, and — the property everything
     below rests on — every merge lies entirely inside exactly ONE band. Moving a
     band is therefore a permutation that no rectangle straddles.

     Gluing per BOUNDARY rather than per region is what makes this transitive for
     free: two merges overlapping in the same rows glue an overlapping set of
     boundaries and fall out as one band, with no union-find and no second pass.

     `axis` is 'row' or 'col'. Returns [{start, end}], end exclusive. */
  function lineBands(block, axis) {
    var col = axis === 'col';
    var size = gridSize(block);
    var n = col ? size.cols : size.rows;
    if (n <= 0) return [];

    var glued = {};
    normalizeMerges(block).forEach(function (m) {
      var start = col ? m.c : m.r;
      var len = col ? m.cs : m.rs;
      for (var i = start; i < start + len - 1; i++) glued[i] = true;
    });

    var bands = [];
    var from = 0;
    for (var k = 0; k < n; k++) {
      if (k === n - 1 || !glued[k]) { bands.push({ start: from, end: k + 1 }); from = k + 1; }
    }
    return bands;
  }

  function bandIndexOf(bands, line) {
    for (var i = 0; i < bands.length; i++)
      if (line >= bands[i].start && line < bands[i].end) return i;
    return -1;
  }

  /* Whether the four move buttons can act on the focused cell, and if not, why —
     shown as the disabled button's title, the same contract canMerge uses.

     `dir` is -1 or +1, matching moveBlock in documentations.html. `span` is how
     many lines would travel, so the button can say "these 2 merged rows" rather
     than leaving the user to discover it.

     `to` is where `index` itself ends up, and it is not a convenience: the
     caller's selection has to FOLLOW the line it just moved, or a second click
     on the same button moves whatever slid into the old coordinates instead —
     one press moves your row, the next moves its new neighbour. It is computed
     here rather than at the call site because it is band arithmetic, and that
     has one home. Refused, it is `index` unchanged, so a caller can read it
     without branching. */
  function canMoveLine(block, axis, index, dir) {
    var word = axis === 'col' ? 'column' : 'row';
    var bands = lineBands(block, axis);
    var i = bandIndexOf(bands, index);
    if (i < 0) return { ok: false, reason: 'Click a cell first.', span: 0, to: index };

    var span = bands[i].end - bands[i].start;
    // One band means a merge glues the whole axis together — a footer like
    // `| Total | << | << |` spans every column, so no column can move without
    // some line leaving the rectangle. Say THAT, rather than "already the first
    // column", which is technically true of a table with one column and plainly
    // misleading here.
    if (bands.length === 1)
      return { ok: false, reason: 'A merged cell spans every ' + word + '. Unmerge it first.',
        span: span, to: index };

    var back = dir < 0;
    var j = i + (back ? -1 : 1);
    if (j < 0) return { ok: false, reason: 'This is already the first ' + word + '.', span: span, to: index };
    if (j >= bands.length) return { ok: false, reason: 'This is already the last ' + word + '.', span: span, to: index };

    // The selected line shifts by the whole LENGTH of the band it jumps.
    var jump = bands[j].end - bands[j].start;
    return { ok: true, reason: '', span: span, to: index + (back ? -jump : jump) };
  }

  /* Swaps the band holding `index` with its neighbour. A merged region moves as
     one piece, and a plain line steps straight OVER a merged band rather than
     into the middle of it — which is what keeps one click one move however the
     table happens to be spanned.

     Refuses by returning the block unchanged, the same contract mergeCells uses.

     NOT withRows, and that is the whole reason this is a writer of its own. That
     funnel re-normalises merges against the new BOUNDS, which is right for a row
     added or dropped and wrong here: the bounds do not change, the indices do.
     Sent through it, every merge would keep its old r/c and silently take over
     whichever content had moved into those coordinates. The remap below is the
     job. */
  function moveLine(block, axis, index, dir) {
    if (!canMoveLine(block, axis, index, dir).ok) return block;

    var col = axis === 'col';
    var bands = lineBands(block, axis);
    var i = bandIndexOf(bands, index);
    var j = i + (dir < 0 ? -1 : 1);

    // The permutation, as old line numbers in their new order.
    var order = [];
    for (var k = 0; k < bands.length; k++) {
      var b = k === i ? bands[j] : k === j ? bands[i] : bands[k];
      for (var x = b.start; x < b.end; x++) order.push(x);
    }
    var moved = [];
    order.forEach(function (from, to) { moved[from] = to; });

    var rows = rowsOf(block);
    var nextRows = col
      ? rows.map(function (row) { return order.map(function (o) { return o < row.length ? row[o] : ''; }); })
      : order.map(function (o) { return rows[o] || []; });

    // rs/cs are untouched: a band moves contiguously, so a span that was
    // contiguous still is. Sorted, so normalizeMerges' first-wins overlap rule
    // can never depend on the order the list happened to be built in.
    var nextMerges = normalizeMerges(block).map(function (m) {
      var to = moved[col ? m.c : m.r];
      if (to === undefined) return m;
      return col
        ? { r: m.r, c: to, rs: m.rs, cs: m.cs }
        : { r: to, c: m.c, rs: m.rs, cs: m.cs };
    }).sort(function (a, b) { return a.r - b.r || a.c - b.c; });

    // Alignment is keyed by coordinate, so it takes the same permutation the
    // merges do — against the new INDICES, and never through withRows. Miss
    // this and every alignment stays on the coordinate it used to sit at,
    // silently decorating whichever cell moved in: the exact corruption rule 5
    // exists to prevent, in a second field.
    var nextAlign = normalizeAlign(block).map(function (a) {
      var to = moved[col ? a.c : a.r];
      if (to === undefined) return a;
      var e = { r: col ? a.r : to, c: col ? to : a.c };
      if (a.h) e.h = a.h;
      if (a.v) e.v = a.v;
      return e;
    }).sort(function (a, b) { return a.r - b.r || a.c - b.c; });

    var next = Object.assign({}, block, { rows: nextRows });
    next = withMerges(next, nextMerges);
    next = withAlign(next, nextAlign);
    // Widths are per COLUMN, so only a column move disturbs them — but both
    // branches go through the one writer, so the delete-when-empty rule keeps
    // its single home either way.
    var w = colWidthsOf(next);
    return withColWidths(next, col && w.length
      ? order.map(function (o) { return w[o]; })
      : w);
  }

  // ── the paste format ─────────────────────────────────────────────────────

  function isMarkerCell(raw) { return raw === MERGE_LEFT || raw === MERGE_UP; }

  /* Only a WHOLE cell of exactly `<<` or `^^` is a marker, so those characters
     are ordinary text anywhere else and only the whole-cell case needs an
     escape. `\|` is handled in the scanner, because a pipe would otherwise
     split the row. */
  function unescapeCell(raw) {
    return (raw === '\\' + MERGE_LEFT || raw === '\\' + MERGE_UP) ? raw.slice(1) : raw;
  }

  function escapeCell(text) {
    var s = String(text == null ? '' : text).replace(/\|/g, '\\|');
    if (s === MERGE_LEFT || s === MERGE_UP) s = '\\' + s;
    return s;
  }

  /* Splits one line into cells. Outer pipes are optional on both sides, and a
     `\|` is a literal pipe rather than a separator. */
  function splitRow(line) {
    var s = line.trim();
    var hadTrailingPipe = /(^|[^\\])\|\s*$/.test(s) && s.length > 1;
    var cells = [];
    var cur = '';
    var i = s.charAt(0) === '|' ? 1 : 0;

    for (; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === '\\' && s.charAt(i + 1) === '|') { cur += '|'; i++; continue; }
      if (ch === '|') { cells.push(cur); cur = ''; continue; }
      cur += ch;
    }
    cells.push(cur);

    // A trailing pipe leaves one empty cell behind it that was never a column.
    if (hadTrailingPipe && cells.length > 1 && cells[cells.length - 1].trim() === '') cells.pop();

    return cells.map(function (cell) { return cell.trim(); });
  }

  function isSeparatorRow(cells) {
    return cells.length > 0 && cells.every(function (cell) { return SEPARATOR_CELL_RE.test(cell); });
  }

  /* Text in, block data out.

     Returns {ok, rows, merges, align, head, headCol, errors} — `align` already
     expanded per drawn cell, `head`/`headCol` null when no directive was
     given so withHead leaves the keys alone. `errors` carry the 1-based line number
     of the pasted text, so the modal can point at the offending row rather
     than saying "that did not work". Nothing is returned as partially-parsed:
     ok === false means insert nothing. */
  function parseTableText(text) {
    var errors = [];
    var fail = function () {
      return { ok: false, rows: [], merges: [], align: [], head: null, headCol: null, errors: errors };
    };

    if (typeof text !== 'string' || !text.trim()) {
      errors.push({ line: 0, message: 'Nothing to read — paste the block the AI gave you.' });
      return fail();
    }

    var lines = text.replace(/\r\n?/g, '\n').split('\n');
    var kept = [];
    var directives = Object.create(null);
    lines.forEach(function (line, i) {
      if (!line.trim()) return;
      if (FENCE_RE.test(line)) return;
      var d = DIRECTIVE_RE.exec(line);
      if (d) { directives[d[1].toLowerCase()] = parseInt(d[2], 10); return; }
      kept.push({ line: i + 1, cells: splitRow(line) });
    });

    // Drop markdown alignment rows wherever they appear, not just at index 1 —
    // this is tolerance, and a stricter rule would only reject tables that are
    // otherwise perfectly readable. The FIRST one carrying a colon also says
    // how its columns line up on the way past; it is still dropped, because it
    // was never data.
    var colAlign = null;
    kept = kept.filter(function (row) {
      if (!isSeparatorRow(row.cells)) return true;
      if (!colAlign && row.cells.some(function (c) { return c.indexOf(':') >= 0; }))
        colAlign = row.cells.map(separatorAlign);
      return false;
    });

    if (!kept.length) {
      errors.push({ line: 0, message: 'No table rows found. Each row needs cells separated by | pipes.' });
      return fail();
    }
    if (kept.length === 1) {
      errors.push({ line: kept[0].line, message: 'Only one row found — a table needs at least two.' });
      return fail();
    }
    if (kept.length > MAX_ROWS) {
      errors.push({ line: 0, message: 'That is ' + kept.length + ' rows; the limit is ' + MAX_ROWS + '.' });
      return fail();
    }

    var width = kept[0].cells.length;
    if (width < 2) {
      errors.push({ line: kept[0].line, message: 'Only one column found — a table needs at least two.' });
      return fail();
    }
    if (width > MAX_COLS) {
      errors.push({ line: kept[0].line, message: 'That is ' + width + ' columns; the limit is ' + MAX_COLS + '.' });
      return fail();
    }

    /* The load-bearing check. Markers occupy real cells, so a correct block is
       always rectangular — an unequal row means a cell went missing, and
       guessing which one is how a wrong table gets built that LOOKS right. */
    kept.forEach(function (row) {
      if (row.cells.length !== width)
        errors.push({
          line: row.line,
          message: 'This row has ' + row.cells.length + ' cells; the first row has ' + width +
                   '. Every row must have the same number, counting << and ^^ as cells.'
        });
    });
    if (errors.length) return fail();

    // ── resolve every cell to the cell that owns it ──
    // Left-to-right, top-to-bottom, so the neighbour a marker points at has
    // always been resolved already. That is what makes chains work: a row of
    // `| A | << | << |` resolves all three to A.
    var owner = [];
    kept.forEach(function (row, r) {
      owner[r] = [];
      row.cells.forEach(function (raw, c) {
        if (raw === MERGE_LEFT) {
          if (c === 0) {
            errors.push({ line: row.line, message: '<< in the first column has no cell to its left.' });
            owner[r][c] = r + ',' + c;
            return;
          }
          owner[r][c] = owner[r][c - 1];
          return;
        }
        if (raw === MERGE_UP) {
          if (r === 0) {
            errors.push({ line: row.line, message: '^^ in the first row has no cell above it.' });
            owner[r][c] = r + ',' + c;
            return;
          }
          owner[r][c] = owner[r - 1][c];
          return;
        }
        owner[r][c] = r + ',' + c;
      });
    });
    if (errors.length) return fail();

    // ── every merged region must be a rectangle ──
    // A cell's owner is always at or above-and-left of it, so a region's
    // bounding box always starts at its owner. If the box holds more cells
    // than the region does, some cell inside it belongs to someone else — an
    // L-shape or a staircase, which no HTML table can draw.
    var boxes = Object.create(null);
    var order = [];
    kept.forEach(function (row, r) {
      row.cells.forEach(function (raw, c) {
        var key = owner[r][c];
        if (!boxes[key]) {
          var parts = key.split(',');
          boxes[key] = { r: +parts[0], c: +parts[1], r1: r, c1: c, count: 0 };
          order.push(key);
        }
        var box = boxes[key];
        if (r > box.r1) box.r1 = r;
        if (c > box.c1) box.c1 = c;
        box.count++;
      });
    });

    order.forEach(function (key) {
      var box = boxes[key];
      var area = (box.r1 - box.r + 1) * (box.c1 - box.c + 1);
      if (box.count !== area)
        errors.push({
          line: kept[box.r].line,
          message: 'The merged cell starting at row ' + (box.r + 1) + ', column ' + (box.c + 1) +
                   ' is not a rectangle. A merged cell must fill a whole block of rows and columns.'
        });
    });
    if (errors.length) return fail();

    // ── emit ──
    var rows = kept.map(function (row, r) {
      return row.cells.map(function (raw, c) {
        return owner[r][c] === (r + ',' + c) ? unescapeCell(raw) : '';
      });
    });

    var merges = [];
    order.forEach(function (key) {
      var box = boxes[key];
      var rs = box.r1 - box.r + 1;
      var cs = box.c1 - box.c + 1;
      if (rs > 1 || cs > 1) merges.push({ r: box.r, c: box.c, rs: rs, cs: cs });
    });

    /* Column alignment expands to one entry per DRAWN cell, because the block's
       field is per-cell by design — the editor aligns one cell at a time, so
       storing the column case as what it MEANS beats inventing a second,
       column-shaped field that only the parser would ever write. A covered cell
       draws nothing, so it is skipped rather than decorated. */
    var align = [];
    if (colAlign) {
      rows.forEach(function (row, r) {
        row.forEach(function (_, c) {
          var h = colAlign[c];
          if (h && owner[r][c] === (r + ',' + c)) align.push({ r: r, c: c, h: h });
        });
      });
    }

    return {
      ok: true, rows: rows, merges: merges, align: align,
      head: directives.head === undefined ? null : directives.head,
      headCol: directives.headcol === undefined ? null : directives.headcol,
      errors: []
    };
  }

  /* Block data back out to the paste format. Round-trips through
     parseTableText, which is what the offline suite pins — and it is what lets
     a table already in a page be copied back out, handed to an AI to amend,
     and pasted in again. */
  function formatTableText(block) {
    var rows = rowsOf(block);
    if (!rows.length) return '';
    var map = mergeMap(block);
    var size = gridSize(block);

    // Which marker a covered cell gets: `^^` when it sits in the owner's own
    // column, `<<` otherwise. Reparsing that reproduces the same region.
    var owners = Object.create(null);
    normalizeMerges(block).forEach(function (m) {
      for (var rr = m.r; rr < m.r + m.rs; rr++)
        for (var cc = m.c; cc < m.c + m.cs; cc++)
          if (!(rr === m.r && cc === m.c)) owners[rr + ',' + cc] = (cc === m.c) ? MERGE_UP : MERGE_LEFT;
    });

    var grid = rows.map(function (row, r) {
      var out = [];
      for (var c = 0; c < size.cols; c++) {
        if (owners[r + ',' + c]) { out.push(owners[r + ',' + c]); continue; }
        if (c >= row.length || !map[r] || !map[r][c]) { out.push(''); continue; }
        out.push(escapeCell(row[c]));
      }
      return out;
    });

    // Pad to a readable grid. Every writer trims, so the padding is cosmetic —
    // but it is what makes the text checkable against the picture by eye.
    var widths = [];
    for (var c2 = 0; c2 < size.cols; c2++) {
      var w = 0;
      grid.forEach(function (row) { if (row[c2].length > w) w = row[c2].length; });
      widths.push(w);
    }

    var line = function (cells) {
      return '| ' + cells.map(function (cell, c) {
        return cell + new Array(Math.max(0, widths[c] - cell.length) + 1).join(' ');
      }).join(' | ') + ' |';
    };
    var body = grid.map(line);

    /* Column alignment travels as a markdown separator row, and ONLY for a
       column whose every drawn cell agrees. The field is per-cell while this
       format is a transcription of a picture, so a lone centred cell in an
       otherwise left column has no column-shaped spelling and does not travel —
       the same call `colWidths` already makes by not travelling at all. Nor
       does the vertical axis: a picture shows it, markdown has no word for it,
       and inventing one would cost the AI brief more than the case is worth. */
    var hAt = Object.create(null);
    normalizeAlign(block).forEach(function (a) { if (a.h) hAt[a.r + ',' + a.c] = a.h; });
    var lane = [];
    var any = false;
    for (var ci = 0; ci < size.cols; ci++) {
      var agreed = null;
      for (var ri = 0; ri < rows.length; ri++) {
        if (!map[ri] || !map[ri][ci]) continue;          // covered — draws nothing
        var h = hAt[ri + ',' + ci] || '';
        if (agreed === null) agreed = h;
        else if (agreed !== h) { agreed = ''; break; }
      }
      if (agreed) any = true;
      lane.push(agreed || '');
    }
    if (any) {
      body.splice(1, 0, line(lane.map(function (h, c) {
        var w = Math.max(3, widths[c]);
        var bar = new Array(w + 1).join('-');
        if (h === 'center') return ':' + bar.slice(2) + ':';
        if (h === 'right') return bar.slice(1) + ':';
        if (h === 'left') return ':' + bar.slice(1);
        return bar;
      })));
    }

    // The directives, and only when they are not the default — the same
    // delete-at-default rule withHead applies to storage, applied to the text.
    var h2 = headOf(block);
    var pre = [];
    if (h2.head !== 1) pre.push('head: ' + h2.head);
    if (h2.headCol !== 0) pre.push('headcol: ' + h2.headCol);

    return '::: track-table\n' + pre.concat(body).join('\n') + '\n:::';
  }

  global.TrackDocTable = {
    parseTableText: parseTableText,
    formatTableText: formatTableText,
    mergeMap: mergeMap,
    mergeAt: mergeAt,
    normalizeMerges: normalizeMerges,
    withMerges: withMerges,
    withRows: withRows,
    canMerge: canMerge,
    mergeCells: mergeCells,
    unmergeCell: unmergeCell,
    lineBands: lineBands,
    canMoveLine: canMoveLine,
    moveLine: moveLine,
    gridSize: gridSize,
    rowsOf: rowsOf,
    alignAt: alignAt,
    normalizeAlign: normalizeAlign,
    withAlign: withAlign,
    setAlign: setAlign,
    headOf: headOf,
    isHeaderCell: isHeaderCell,
    withHead: withHead,
    colWidthsOf: colWidthsOf,
    normalizeColWidths: normalizeColWidths,
    withColWidths: withColWidths,
    resizeColumn: resizeColumn,
    MAX_ROWS: MAX_ROWS,
    MAX_COLS: MAX_COLS,
    MIN_COL_PCT: MIN_COL_PCT
  };
})(window);
