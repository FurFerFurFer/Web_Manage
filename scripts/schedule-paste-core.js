/* ── schedule-paste-core.js ────────────────────────────────────────────────
   The one definition of the REFERENCE SCHEDULE paste format.

   A picture of a timetable — a university term grid, a gym plan, a shift
   rota — is shown to an AI, which transcribes it into the text this file
   parses. Three columns, one line per class:

       ::: track-schedule
       | Mon        | 09:00-10:30 | Mathematics    | Dr Ada · R204 |
       | Mon        | 10:45-12:00 | Physics        | Dr Bell       |
       | Wed        | 13:00-16:00 | Chemistry lab  | Lab 3         |
       | 2026-09-14 | 09:00-10:30 | Makeup lecture |               |
       :::

   The fourth cell is a DETAIL and it is optional: a paste may use three cells
   throughout instead. It exists because everything that is not the topic —
   the lecturer, the room, the mode — used to be glued onto the title, so the
   title could never be shown on its own and an hour-grid block truncated the
   topic away to make room for a room number.

   The day cell takes EITHER a weekday name or a concrete YYYY-MM-DD, and that
   single decision is what lets one format carry both cases the user actually
   has: a term timetable that repeats for months, and a one-off day. A weekday
   row repeats across a range chosen in the paste dialog; a dated row happens
   once. Neither is a mode the user has to select — the parser reads which one
   each row is.

   Four rules, three of them lifted straight from doc-table-core.js because
   they have already been proven there:

   1. EVERY ROW IN ONE PASTE HAS THE SAME NUMBER OF CELLS — three, or four
      with a detail — and a row that disagrees is REFUSED against its line
      number. This is the load-bearing property of the format. An AI that
      drops a column produces an error naming the row, never a
      plausible-looking wrong schedule — and a wrong schedule is worse than no
      schedule, because it looks like it worked.

      UNIFORMITY, not a fixed count, is what carries that property once a
      fourth cell exists. A dropped cell is still detected because it makes
      its row disagree with the rest, so nothing is given up by letting the
      detail be optional — and every three-column paste written before the
      detail existed stays legal, which is why no stored entry needed
      migrating. The width is taken from the first row that HAS a legal count,
      so a paste where every row is malformed still reports every row rather
      than adopting the first mistake as the standard.

   2. NOTHING IS RETURNED HALF-PARSED. `ok === false` means insert nothing.
      Errors accumulate within a phase so a user fixing a paste sees every bad
      line at once, but the function returns at each phase boundary rather than
      mixing a cell-count error with a time error.

   3. TOLERANT WHERE TOLERANCE IS FREE. The fence is optional and both ::: and
      ``` are accepted, outer pipes are optional, blank lines are dropped, and
      a markdown separator row is skipped wherever it appears. Copying a table
      out of a chat's rendered code block gives you the contents with no fence
      at all, which is exactly why the fence cannot be required.

   4. NO DATE ARITHMETIC LIVES HERE. This file checks the SHAPE of a day cell
      and nothing more: a weekday token becomes an index 0-6, a date string is
      format-checked and passed through as text. Every question of which
      calendar days a weekly entry actually occupies is answered by
      TrackCalendar.refOccupies in calendar-core.js, which is swept under five
      timezones for exactly that reason. That split is why this module's suite
      runs once rather than five times, and it must stay true: a `new Date()`
      appearing in this file means the suite is in the wrong list.

   Nothing here reads or writes localStorage, and nothing here renders. It is a
   pure data module like calendar-core.js and doc-table-core.js — the page owns
   persistence and goes through TrackStorage.saveDB.

   Loaded as a classic script by documentations.html.
*/
(function (global) {
  'use strict';

  /* The legal widths, narrowest first. Three is day/time/title; four adds the
     detail. Anything else is a miscount, whatever the rest of the paste does. */
  var COLUMN_COUNTS = [3, 4];

  /* A runaway paste should be refused early rather than left to the quota
     guard. A term timetable is a few dozen lines; 500 is far above anything a
     person transcribes and far below anything that would bloat track_db. */
  var MAX_ROWS = 500;

  /* The longest a single block may be. A class runs hours, not days, and a
     24-hour block would paint over an entire column. */
  var MAX_MINUTES = 24 * 60;

  /* The length a row with only a start time gets. Deliberately the same 60 as
     calendar-core.js's DEFAULT_BLOCK_MINS, which is the length every other
     kind of block starts at — a reference block that defaulted differently
     would be a second rule to remember for no gain. */
  var DEFAULT_MINUTES = 60;

  /* Identical to doc-table-core.js's. A fence line can never be confused with
     a row, because a row always contains a pipe. */
  var FENCE_RE = /^\s*(?::{3,}|`{3,})\s*[\w-]*\s*$/;
  var SEPARATOR_CELL_RE = /^:?-{2,}:?$/;

  var DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

  /* Every spelling of a weekday an AI plausibly emits, mapped to the index
     Date#getDay uses. Sunday is 0 because that is what the platform says and
     what calendar-core.js's DOWS already assumes; a table that disagreed with
     the platform would be one conversion nobody remembers to make.

     Written out rather than derived from a locale, because a locale-derived
     table would parse a different set of words depending on the machine the
     browser happens to be running on. */
  var DOW_NAMES = {
    sun: 0, sunday: 0,
    mon: 1, monday: 1,
    tue: 2, tues: 2, tuesday: 2,
    wed: 3, weds: 3, wednesday: 3,
    thu: 4, thur: 4, thurs: 4, thursday: 4,
    fri: 5, friday: 5,
    sat: 6, saturday: 6
  };

  // Short labels for formatting back out, indexed by the same 0-6.
  var DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function isList(v) { return Array.isArray(v); }
  function isMap(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  // ── cell scanning ────────────────────────────────────────────────────────

  /* Splits one line into cells. Outer pipes optional on both sides, `\|` is a
     literal pipe. A verbatim copy of doc-table-core.js's splitRow — duplicated
     rather than shared because the two formats are independent contracts that
     must be free to diverge, and this is 20 lines of scanner rather than a
     rule that could be forgotten at one site. */
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

    if (hadTrailingPipe && cells.length > 1 && cells[cells.length - 1].trim() === '') cells.pop();

    return cells.map(function (cell) { return cell.trim(); });
  }

  function isSeparatorRow(cells) {
    return cells.length > 0 && cells.every(function (cell) { return SEPARATOR_CELL_RE.test(cell); });
  }

  /* A header row an AI adds out of habit — `| Day | Time | Subject |`. Skipped
     only when the DAY cell is not a day at all, so a real row can never be
     mistaken for one: `| Mon | 09:00 | Day |` keeps its Monday. */
  function isHeaderRow(cells) {
    return parseDayCell(cells[0]) === null && /^(day|date|weekday)$/i.test(cells[0] || '');
  }

  // ── the two cell parsers ─────────────────────────────────────────────────

  /* A day cell, to {kind:'dow', dow} or {kind:'date', date}, or null.

     A bare YYYY-MM-DD is passed through as TEXT after a format check — this
     file deliberately does not construct a Date to find out whether the 31st
     of February exists. calendar-core.js parses it at 'T12:00:00' when it
     needs a weekday, and an impossible date simply occupies no day, which is
     the same outcome a refusal here would produce with more code. */
  function parseDayCell(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return null;
    if (DAY_RE.test(s)) return { kind: 'date', date: s };
    var key = s.toLowerCase().replace(/\.$/, '');
    if (Object.prototype.hasOwnProperty.call(DOW_NAMES, key)) return { kind: 'dow', dow: DOW_NAMES[key] };
    return null;
  }

  /* 'HH:MM' to minutes past midnight, or null. Accepts a single-digit hour,
     because `9:00` is what a person types and an AI copies. */
  function minutesOf(raw) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(raw == null ? '' : raw).trim());
    if (!m) return null;
    var h = Number(m[1]), mi = Number(m[2]);
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }

  function hhmm(mins) {
    var h = Math.floor(mins / 60), m = mins % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  /* A time cell, to {time, duration} or an error string.

     Every dash a timetable is printed with separates the two times: ASCII -,
     en dash, em dash, and the word "to". A range whose end is at or before its
     start is REFUSED rather than wrapped past midnight — a class that ends
     before it begins is a transcription error, and silently turning it into a
     23-hour block would draw a full-column smear the user then has to hunt
     down. */
  function parseTimeCell(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return { error: 'No time in this row. Write a start time like 09:00, or a range like 09:00-10:30.' };

    var parts = s.split(/\s*(?:[-‒–—―]|\bto\b)\s*/i);
    if (parts.length > 2) {
      return { error: 'Could not read "' + s + '" as a time. Use one start time, or a range like 09:00-10:30.' };
    }

    var start = minutesOf(parts[0]);
    if (start === null) {
      return { error: 'Could not read "' + parts[0] + '" as a time. Use 24-hour HH:MM, like 09:00 or 14:30.' };
    }
    if (parts.length === 1) return { time: hhmm(start), duration: DEFAULT_MINUTES };

    var end = minutesOf(parts[1]);
    if (end === null) {
      return { error: 'Could not read "' + parts[1] + '" as an end time. Use 24-hour HH:MM, like 10:30.' };
    }
    if (end <= start) {
      return { error: 'This block ends at ' + hhmm(end) + ', at or before it starts at ' + hhmm(start) + '.' };
    }
    return { time: hhmm(start), duration: Math.min(end - start, MAX_MINUTES) };
  }

  // ── the parser ───────────────────────────────────────────────────────────

  /* Text in, entry drafts out.

     Returns {ok, rows, errors}. A row is
         { day: {kind:'dow', dow} | {kind:'date', date}, time, duration, title }
     plus `detail` WHEN THERE IS ONE — the key is absent otherwise, never '' —
     which is everything except the ids, the range and the ownership the page
     adds when it writes. `errors` carry the 1-based line number of the PASTED
     TEXT — captured before blank lines and fences are filtered out, so it
     points at the line the user can see. */
  function parseScheduleText(text) {
    var errors = [];
    var fail = function () { return { ok: false, rows: [], errors: errors }; };

    if (typeof text !== 'string' || !text.trim()) {
      errors.push({ line: 0, message: 'Nothing to read — paste the block the AI gave you.' });
      return fail();
    }

    var lines = text.replace(/\r\n?/g, '\n').split('\n');
    var kept = [];
    lines.forEach(function (line, i) {
      if (!line.trim()) return;
      if (FENCE_RE.test(line)) return;
      kept.push({ line: i + 1, cells: splitRow(line) });
    });

    kept = kept.filter(function (row) { return !isSeparatorRow(row.cells) && !isHeaderRow(row.cells); });

    if (!kept.length) {
      errors.push({ line: 0, message: 'No schedule rows found. Each row needs three cells separated by | pipes: day, time, title.' });
      return fail();
    }
    if (kept.length > MAX_ROWS) {
      errors.push({ line: 0, message: 'That is ' + kept.length + ' rows; the limit is ' + MAX_ROWS + '.' });
      return fail();
    }

    /* The load-bearing check, and the whole argument for the format. Every row
       in a paste carries the same number of cells, so an unequal row means
       something went missing — and guessing which one is how a wrong schedule
       gets built that LOOKS right.

       The width is the first LEGAL count seen, not simply the first count: a
       paste in which every row is malformed must report every row rather than
       adopt row one's mistake as the standard and call the rest wrong. When no
       row is legal, three is assumed so the message names the ordinary shape. */
    var width = 0;
    for (var w = 0; w < kept.length; w++) {
      if (COLUMN_COUNTS.indexOf(kept[w].cells.length) !== -1) { width = kept[w].cells.length; break; }
    }
    if (!width) width = COLUMN_COUNTS[0];

    kept.forEach(function (row) {
      var n = row.cells.length;
      if (n === width) return;
      var had = 'This row has ' + n + ' cell' + (n === 1 ? '' : 's') + '; ';
      errors.push({
        line: row.line,
        message: COLUMN_COUNTS.indexOf(n) === -1
          ? had + 'every row needs 3 — day, time, then title — or 4, with a detail after the title.'
          : had + 'the rest of this paste has ' + width +
            '. Use 3 cells (day, time, title) or 4 (day, time, title, detail), but the same number in every row.'
      });
    });
    if (errors.length) return fail();

    var rows = [];
    kept.forEach(function (row) {
      var day = parseDayCell(row.cells[0]);
      if (day === null) {
        errors.push({
          line: row.line,
          message: 'Could not read "' + row.cells[0] + '" as a day. Use a weekday like Mon, or a date like 2026-09-14.'
        });
      }

      var time = parseTimeCell(row.cells[1]);
      if (time.error) errors.push({ line: row.line, message: time.error });

      var title = row.cells[2];
      if (!title) {
        errors.push({ line: row.line, message: 'This row has no title. Every block needs something to show.' });
      }

      if (day !== null && !time.error && title) {
        var out = { day: day, time: time.time, duration: time.duration, title: title };
        /* Written ONLY when there is something to write. Absence is the
           default and '' is not a detail — the same absence-is-meaningful rule
           as a day note's `time`, and deliberately not `cautionDates: []`,
           because no fallback sits behind this field. A four-column paste with
           a blank detail must therefore produce the identical draft a
           three-column paste would. */
        if (width > 3 && row.cells[3]) out.detail = row.cells[3];
        rows.push(out);
      }
    });
    if (errors.length) return fail();

    return { ok: true, rows: rows, errors: [] };
  }

  // ── formatting back out ──────────────────────────────────────────────────

  /* Stored entries back to the paste format, so an import can be copied out,
     handed to an AI to amend, and pasted in again. Round-trips through
     parseScheduleText, which the offline suite pins.

     Takes STORED entries — the shape refSchedules holds, with `dow` or `date`
     directly on the record — rather than the parser's drafts, because copying
     out is something only a stored import ever needs. */
  function formatScheduleText(entries) {
    var list = isList(entries) ? entries.filter(isMap) : [];
    if (!list.length) return '';

    /* The detail column appears only when at least one entry carries one. That
       is what keeps `⧉ copy as text` byte-identical for every import written
       before the field existed: a detail-less list must round-trip to the same
       three columns it was pasted as, not to four with a blank hanging off the
       end. */
    var wide = list.some(function (e) { return typeof e.detail === 'string' && e.detail.trim(); });

    var grid = list.map(function (e) {
      var day = DAY_RE.test(String(e.date || '')) ? String(e.date)
        : (DOW_LABELS[e.dow] || '?');
      var start = minutesOf(e.time);
      var dur = (typeof e.duration === 'number' && isFinite(e.duration)) ? Math.floor(e.duration) : DEFAULT_MINUTES;
      var when = start === null ? String(e.time || '')
        : hhmm(start) + '-' + hhmm(Math.min(start + Math.max(1, dur), MAX_MINUTES));
      var row = [day, when, escapeCell(e.title)];
      // A detail-less row in a wide list still fills its cell, so the paste
      // stays uniform and parses straight back in.
      if (wide) row.push(escapeCell(e.detail == null ? '' : e.detail));
      return row;
    });

    // Pad to a readable grid. Every writer trims, so this is cosmetic — but it
    // is what makes the text checkable against the picture by eye.
    var widths = wide ? [0, 0, 0, 0] : [0, 0, 0];
    grid.forEach(function (row) {
      row.forEach(function (cell, c) { if (cell.length > widths[c]) widths[c] = cell.length; });
    });

    var body = grid.map(function (row) {
      return '| ' + row.map(function (cell, c) {
        return cell + new Array(Math.max(0, widths[c] - cell.length) + 1).join(' ');
      }).join(' | ') + ' |';
    }).join('\n');

    return '::: track-schedule\n' + body + '\n:::';
  }

  function escapeCell(text) {
    return String(text == null ? '' : text).replace(/\|/g, '\\|');
  }

  // ── exports ──────────────────────────────────────────────────────────────

  global.TrackSchedulePaste = {
    parseScheduleText: parseScheduleText,
    formatScheduleText: formatScheduleText,
    parseDayCell: parseDayCell,
    parseTimeCell: parseTimeCell,
    DOW_LABELS: DOW_LABELS,
    COLUMN_COUNTS: COLUMN_COUNTS,
    MAX_ROWS: MAX_ROWS,
    DEFAULT_MINUTES: DEFAULT_MINUTES
  };
})(typeof window !== 'undefined' ? window : this);
