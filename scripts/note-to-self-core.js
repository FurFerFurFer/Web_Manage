/* ── note-to-self-core.js ──────────────────────────────────────────────────
   The one definition of what the Note to self pop-up holds
   (window.TrackNoteToSelf), and the one renderer of a Quest row list, which
   Home's Quest panel and the pop-up both draw through.

   The pop-up (scripts/note-to-self.js) is the long line across the top of
   every page that drops down when its `v` is clicked (the user's 2026-11-08
   request). It holds two things, and decides neither of them itself:

   - EVERYTHING IN QUEST. questTree and starRollup are TrackQuest's; the rows
     are drawn by questHtml below, which is the code Home's renderQuests used
     to spell inline, moved here so the two surfaces cannot draw a quest two
     ways. With no options it returns Home's markup byte for byte —
     tests/note-to-self-core.test.js pins it against a verbatim copy of the
     inline code it replaced.
   - ★ FORCED, as far as it is in caution or due. Today's due deadlines, the
     deadlines today is a chosen caution day of, and today's day notes are
     the three lists TrackCalendar.buildDaySchedule already returns for the
     Home day strip — so the caution rule, the ticked-deadline rule and the
     day-note rule each keep their single home in calendar-core.js. The one
     list that is new is OVERDUE (the user's choice, D1 "B"): a deadline whose
     due day has passed and which nobody ticked. overdueDeadlines is its only
     definition.

   Four rules, the same ones every read-only surface here lives under:

   - It is a READER. Nothing here writes anything, anywhere.
   - It cannot throw. Every reader is total, and a slot in the wrong shape
     reads as an empty list rather than an error, because the pop-up is on
     every page and an error here would be on every page too.
   - Every value reaching markup goes through esc(). The rows are innerHTML
     strings, so this is the one place a title could become markup.
   - NO DATE CODE. "Today" is a PARAMETER, computed by the widget with
     TrackCalendar.toDateStr; a day label is passed in as a function. Day
     strings compare correctly as strings, so `d.date < today` needs no Date.

   Every row is a LINK into progress.html (the user's choice, D2): a deadline
   to its own popup in the Schedule, always on its DUE day — the link Home's
   strip already uses — a day note to its day, and a quest to the Quest tab.
*/
(function (global) {
  'use strict';

  var DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  var QUEST_HREF = 'progress.html#quest';

  function isList(v) { return Array.isArray(v); }
  function isRecord(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function isDayStr(v) { return typeof v === 'string' && DAY_RE.test(v); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── links ────────────────────────────────────────────────────────────────

  // Always the DUE day, never the caution day a row sits on: a "!" three
  // weeks out opens the thing it warns about. Identical to Home's dlHref.
  function dlHref(d) {
    return 'progress.html?date=' + d.date + '&dl=' + encodeURIComponent(d.id) + '#schedule';
  }
  function dayHref(ds) { return 'progress.html?date=' + ds + '#schedule'; }

  // ── ★ Forced ─────────────────────────────────────────────────────────────

  /* A deadline is OVERDUE when its due day is a day before today and it is not
     ticked. Ticked is read through TrackCalendar.dlDone — the `!!` every
     reader uses — so an absent key, false and undefined are one state. A due
     day that is not a day at all is not overdue: it occupies no day, so there
     is nothing it could be late for. Oldest first, by TrackCalendar.dlByDate. */
  function overdueDeadlines(deadlines, today) {
    var C = global.TrackCalendar;
    if (!C || !isList(deadlines) || !isDayStr(today)) return [];
    return deadlines.filter(function (d) {
      return isRecord(d) && isDayStr(d.date) && d.date < today && !C.dlDone(d);
    }).sort(C.dlByDate);
  }

  /* Everything ★ Forced that is in caution or due today. Three of the four
     lists are buildDaySchedule's own, unfiltered — the same lists Home's day
     strip draws — which is why this file holds no caution or due rule. */
  function forcedFor(slot, today) {
    var empty = { overdue: [], due: [], caution: [], notes: [] };
    var C = global.TrackCalendar;
    if (!C || !isRecord(slot) || !isDayStr(today)) return empty;
    var day;
    try { day = C.buildDaySchedule(slot, today); } catch (e) { return empty; }
    return {
      overdue: overdueDeadlines(slot.deadlines, today),
      due: isList(day.deadlines) ? day.deadlines : [],
      caution: isList(day.deadlinesCaution) ? day.deadlinesCaution : [],
      notes: isList(day.calNotes) ? day.calNotes : []
    };
  }

  function forcedCount(f) {
    return f ? f.overdue.length + f.due.length + f.caution.length + f.notes.length : 0;
  }

  // 'YYYY-MM-DD' → '12/11', with the year only when it is not today's.
  function shortDay(ds, today) {
    if (!isDayStr(ds)) return String(ds == null ? '' : ds);
    var s = ds.slice(8, 10) + '/' + ds.slice(5, 7);
    return (isDayStr(today) && today.slice(0, 4) === ds.slice(0, 4)) ? s : s + '/' + ds.slice(0, 4);
  }

  /* The ★ Forced rows, most urgent first: overdue, due today, caution, then
     today's day notes. `opts.dayLabel` names a day in full for a tooltip
     (TrackNotes.journeyDayLabel in the widget); without it a tooltip carries
     the day string. Returns '' when there is nothing, so the caller chooses
     its own empty line. */
  function forcedHtml(f, today, opts) {
    var o = opts || {};
    var label = typeof o.dayLabel === 'function' ? o.dayLabel : function (ds) { return String(ds); };
    var C = global.TrackCalendar;
    var timed = function (n) { return !!(C && C.noteTimed(n)); };
    if (!f) return '';
    var rows = [];

    function row(kind, id, href, mark, time, title, meta, tip, extraClass) {
      return '<a class="nts-row is-' + kind + (extraClass ? ' ' + extraClass : '') + '" href="' + esc(href) +
        '" data-nts-' + kind + '="' + esc(id) + '" title="' + esc(tip) + '">' +
        '<span class="nts-mark" aria-hidden="true">' + mark + '</span>' +
        (time ? '<span class="nts-time">' + esc(time) + '</span>' : '') +
        '<span class="nts-title">' + esc(title) + '</span>' +
        '<span class="nts-meta">' + esc(meta) + '</span></a>';
    }

    (f.overdue || []).forEach(function (d) {
      rows.push(row('overdue', d.id, dlHref(d), '⏰', d.time, d.title || 'Deadline',
        'overdue · due ' + shortDay(d.date, today),
        'Overdue — was due ' + label(d.date) + (d.time ? ' at ' + d.time : '') +
        (d.detail ? '\n' + d.detail : '') + '\nOpen in the Schedule'));
    });
    (f.due || []).forEach(function (d) {
      var done = !!(C && C.dlDone(d));
      rows.push(row('due', d.id, dlHref(d), done ? '✓' : '⏰', d.time, d.title || 'Deadline',
        done ? 'done · due today' : 'due today',
        (done ? 'Ticked · was due today at ' : 'Due today at ') + d.time +
        (d.detail ? '\n' + d.detail : '') + '\nOpen in the Schedule', done ? 'is-done' : ''));
    });
    (f.caution || []).forEach(function (d) {
      rows.push(row('caution', d.id, dlHref(d), '!', '', d.title || 'Deadline',
        'caution · due ' + shortDay(d.date, today),
        'Caution — due ' + label(d.date) + (d.time ? ' at ' + d.time : '') +
        (d.detail ? '\n' + d.detail : '') + '\nOpen in the Schedule'));
    });
    (f.notes || []).forEach(function (n) {
      rows.push(row('note', n.id, dayHref(today), '📌', timed(n) ? n.time : '',
        n.title || n.detail || 'Note', 'day note',
        (n.detail ? n.detail + '\n' : '') + 'Open the day in the Schedule'));
    });
    return rows.join('');
  }

  // ── Quest ────────────────────────────────────────────────────────────────

  /* The Quest rows, for Home's panel and for the pop-up. Moved verbatim from
     index.html's renderQuests; with no options the output is byte-identical
     to what Home drew before, and an offline case pins exactly that.

     `ticks` is the routine-tick id list for TODAY, read by the caller with
     TrackQuest.routineTicks — the day is the caller's, which is what keeps
     this file free of date code.

     Two options, both for the pop-up:
       hook — the data-attribute prefix. The pop-up passes 'nts-quest', so its
              rows can never be mistaken for Home's by a `[data-quest-row]`
              selector on a page that draws both.
       href — when set, every row is a LINK there instead of a div.

     Returns {starred, list}; `list` is '' when no quest exists, and the
     caller draws its own empty line. */
  function questHtml(slot, ticks, opts) {
    var o = opts || {};
    var hook = typeof o.hook === 'string' && o.hook ? o.hook : 'quest';
    var href = typeof o.href === 'string' && o.href ? o.href : null;
    var Q = global.TrackQuest;
    var out = { starred: '', list: '' };
    if (!Q || !isRecord(slot)) return out;

    var tick = isList(ticks) ? ticks : [];
    var mms = slot.mms || [];
    var tree = Q.questTree(slot.goals || [], mms);
    var rollup = Q.starRollup(slot.goals || [], mms);

    var tag = href ? 'a' : 'div';
    var open = function (cls, attr, val, style) {
      return '<' + tag + ' class="' + cls + '"' + (href ? ' href="' + esc(href) + '"' : '') +
        ' data-' + hook + '-' + attr + '="' + esc(val) + '"' + (style ? ' style="' + style + '"' : '') + '>';
    };
    var shut = '</' + tag + '>';

    out.starred = rollup.length ? (
      '<div class="quest-section-label">★ Starred</div>' +
      rollup.map(function (row) {
        return open('quest-star-row', 'star-row',
          row.kind === 'learn' ? row.node.id + ':' + row.mmId : row.node.id) +
          '<span class="quest-star">★</span><span class="quest-title">' +
          esc(row.kind === 'learn'
            ? (row.mm ? row.mm.name : 'mind map removed')
            : (row.node.title || 'Untitled')) + '</span>' +
          // Only when the row stands for more than itself — a starred leaf
          // saying "1 quest" is noise. Same rule as the Progress tab, and the
          // number comes from the same starRollup rather than a second walk.
          (row.count > 1
            ? '<span class="quest-count" data-' + hook + '-star-count="' + esc(row.node.id) + '">' +
              row.count + ' quests</span>'
            : '') +
          (row.kind === 'learn' ? '<span class="quest-kind">to learn</span>' : '') +
          shut;
      }).join('')
    ) : '';

    function rowsFor(entry) {
      var n = entry.node;
      var routine = n.taskType === 'routine';
      var done = routine ? tick.indexOf(n.id) >= 0 : !!n.completed;
      var kind = n.isSubGoal ? 'sub-goal'
        : (n.children || []).length ? 'goal'
        : routine ? 'routine' : 'task';
      var html = open('quest-row' + (entry.quest ? '' : ' is-context') + (done ? ' is-done' : ''),
        'row', n.id, '--depth:' + entry.depth) +
        '<span class="quest-mark">' + (entry.quest ? (done ? '✓' : '·') : '') + '</span>' +
        '<span class="quest-title">' + esc(n.title || 'Untitled') + '</span>' +
        (entry.star ? '<span class="quest-star">★</span>' : '') +
        '<span class="quest-kind">' + kind + '</span>' + shut;
      html += entry.learn.map(function (row) {
        return open('quest-row is-learn', 'learn-row', n.id + ':' + row.mmId, '--depth:' + (entry.depth + 1)) +
          '<span class="quest-mark"></span><span class="quest-title">' +
          esc(row.mm ? row.mm.name : 'mind map removed') + '</span>' +
          (row.star ? '<span class="quest-star">★</span>' : '') +
          '<span class="quest-kind">to learn</span>' + shut;
      }).join('');
      return html + entry.children.map(rowsFor).join('');
    }

    out.list = tree.map(rowsFor).join('');
    return out;
  }

  global.TrackNoteToSelf = {
    QUEST_HREF: QUEST_HREF,
    esc: esc, dlHref: dlHref, dayHref: dayHref, shortDay: shortDay,
    overdueDeadlines: overdueDeadlines, forcedFor: forcedFor, forcedCount: forcedCount,
    forcedHtml: forcedHtml, questHtml: questHtml
  };
})(window);
