/* ── calendar-core.js ──────────────────────────────────────────────────────
   Shared, read-only aggregation of one Track slot into per-day calendar data.

   Nothing in this file writes. Every function takes a plain slot object and
   returns fresh data, so the same collectors back the universal calendar on
   index.html and the calendar blocks embedded in documentations.html.

   Loaded as a classic script before the page's own script; publishes
   window.TrackCalendar.

   Dates are LOCAL calendar days throughout. toISOString is never used: it
   returns the UTC day, which is off by one for most of the day west of UTC.
   Day strings are 'YYYY-MM-DD', which compares correctly with < and >, so
   ranges need no Date arithmetic and cannot drift across DST or a month or
   year boundary. Where a string must become a Date, it is parsed at
   'T12:00:00' so a DST shift can never push it onto the neighbouring day.
*/
(function (global) {
  'use strict';

  // ── local calendar dates ─────────────────────────────────────────────────

  function toDateStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  const dim = (y, m) => new Date(y, m + 1, 0).getDate();
  const firstDay = (y, m) => new Date(y, m, 1).getDay();
  const dStr = (y, m, d) => y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DOWS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // ── categories ───────────────────────────────────────────────────────────

  // Dots cover only what the day schedule does not already show. Schedule
  // items (tasks, routines, SIR, supporting actions, MM sessions, MG focus,
  // day notes, deadlines) render in the day timeline instead, and milestones
  // render as spanning lane bars — see buildMilestoneLanes.
  const CATS = [
    { key: 'kolbmg', label: 'Kolb / MG change', color: '#38bdf8' },
    { key: 'lin', label: 'LIN record', color: '#2dd4bf' },
    { key: 'note', label: 'Floating note', color: '#e879f9' },
    { key: 'dump', label: 'Source dump', color: '#a8a29e' }
  ];

  // Every switchable category, in display order. A caller that offers a filter
  // renders one control per entry and passes the switched-off keys back as
  // opts.hidden; the collectors below do the filtering, so every caller filters
  // identically. Adding an entry here makes it visible by default everywhere,
  // because callers persist the hidden set rather than the shown set.
  const FILTERS = CATS.concat([
    { key: 'milestone', label: 'Milestones', color: '#6366f1' },
    { key: 'task', label: 'Goal tasks & routines', color: '#6366f1' },
    { key: 'sa', label: 'Supporting actions', color: '#fb923c' },
    { key: 'mm', label: 'MM sessions', color: '#818cf8' },
    { key: 'sir', label: 'SIR sessions', color: '#22d3ee' },
    { key: 'mg', label: 'MG focus', color: '#facc15' },
    { key: 'daynote', label: 'Day notes', color: '#e879f9' },
    { key: 'deadline', label: 'Deadlines', color: '#f87171' },
    { key: 'doc', label: 'Documentation', color: '#c084fc' }
  ]);

  // milestone bar colours — same palette progress.html uses for chipColor
  const MS_PALETTE = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#14b8a6', '#f97316', '#06b6d4', '#a3e635'];
  const MS_MAX_LANES = 3;

  // opts.hidden may be an array or a Set; omitting it shows everything
  function shownFn(opts) {
    const h = (opts || {}).hidden;
    if (!h) return function () { return true; };
    const set = h instanceof Set ? h : new Set(h);
    if (!set.size) return function () { return true; };
    return function (key) { return !set.has(key); };
  }

  // A day note or deadline authored from a Documentations page carries that
  // page's id. Absence means it was authored in the Schedule. The origin is
  // therefore also the filter key: everything from Documentations shares one.
  function originKey(item, ownKey) { return item && item.docPageId ? 'doc' : ownKey; }

  // ── goals ────────────────────────────────────────────────────────────────

  function flattenGoals(goals) {
    const out = [];
    (function walk(list) { (list || []).forEach(g => { out.push(g); walk(g.children); }); })(goals);
    return out;
  }

  // same fallback chain as goalDurationFor in progress.html
  function goalDuration(t, ds) {
    const perDate = t.taskType === 'routine' ? (t.routineDates && t.routineDates[ds] || {}).duration : undefined;
    return (perDate != null ? perDate : t.duration) || 60;
  }

  function goalDone(node, ds) {
    if (!node) return false;
    if (node.taskType === 'routine') return !!((node.routineDates || {})[ds] || {}).done;
    const kids = node.children || [];
    if (!kids.length) return !!node.completed;
    return kids.every(c => goalDone(c, ds));
  }

  // ── MG focus ─────────────────────────────────────────────────────────────

  // same semantics as progress.html getMGsForDay: exact key, else walk back ≤30 days
  function mgsForDay(ds, mgSchedule) {
    if (Object.prototype.hasOwnProperty.call(mgSchedule, ds)) return mgSchedule[ds] || [];
    const d = new Date(ds + 'T12:00:00');
    for (let i = 1; i <= 30; i++) {
      d.setDate(d.getDate() - 1);
      const prev = toDateStr(d);
      if (Object.prototype.hasOwnProperty.call(mgSchedule, prev)) return mgSchedule[prev] || [];
    }
    return [];
  }

  // ── deadlines ────────────────────────────────────────────────────────────
  // A deadline is due on `date` at `time`; its caution period runs from
  // `startDate` through `date` inclusive. Same rules as progress.html.

  const dlStart = d => d.startDate || d.date;
  const dlInCaution = (d, ds) => ds >= dlStart(d) && ds <= d.date;
  // Ticked: the user has handled it, so the run-up stops warning. ABSENCE is
  // "not done" and `!!` reads an absent key, false and undefined alike, so
  // there is no third state and no migration — every existing deadline is
  // already correct. The tick SUPPRESSES the caution period, it does not alter
  // it: dlStart, dlInCaution and dlDayCount are deliberately left blind to it,
  // which is what makes unticking a restore rather than a guess.
  const dlDone = d => !!d.done;
  const dlByTime = (a, b) => String(a.time).localeCompare(String(b.time));
  const dlByDate = (a, b) => a.date.localeCompare(b.date) || dlByTime(a, b);
  const dlDayCount = d => Math.round(
    (new Date(d.date + 'T12:00:00') - new Date(dlStart(d) + 'T12:00:00')) / 86400000
  ) + 1;
  // title, HH:MM, a well-formed start date, and a caution period that does not
  // begin after the due day — identical to dlValid in progress.html
  function dlValid(draft, dueDate) {
    return !!String(draft.title || '').trim()
      && /^\d{2}:\d{2}$/.test(draft.time)
      && /^\d{4}-\d{2}-\d{2}$/.test(draft.startDate)
      && draft.startDate <= dueDate;
  }

  // Every local calendar day from `from` through `to`, inclusive. Stepping a
  // Date anchored at noon means a 23- or 25-hour DST day can neither skip nor
  // repeat a date, which plain +86400000 arithmetic would. Both ends must be
  // well-formed day strings: a malformed `to` would otherwise compare in a way
  // that never terminates, so the format check is load-bearing, not decorative.
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  function daysBetween(from, to) {
    const out = [];
    if (!DAY_RE.test(from || '') || !DAY_RE.test(to || '') || from > to) return out;
    const d = new Date(from + 'T12:00:00');
    while (out.length < 4000) {
      const ds = toDateStr(d);
      if (ds > to) break;
      out.push(ds);
      d.setDate(d.getDate() + 1);
    }
    return out;
  }

  // ── month dots ───────────────────────────────────────────────────────────

  function buildBuckets(slot, y, m, opts) {
    const show = shownFn(opts);
    const buckets = {};
    const first = dStr(y, m, 1), last = dStr(y, m, dim(y, m));
    const add = (ds, cat, label, meta) => {
      if (!ds || ds < first || ds > last) return;
      (buckets[ds] = buckets[ds] || {});
      (buckets[ds][cat] = buckets[ds][cat] || []).push({ label, meta });
    };
    const mms = slot.mms || [];
    const mmName = id => { const mm = mms.find(x => x.id === id); return mm ? mm.name : 'MM ' + id; };

    // Kolb records and MG changes share one dot — they almost always land together.
    if (show('kolbmg')) {
      (slot.kolbs || []).forEach(k => add(k.date, 'kolbmg', k.mmId != null ? mmName(k.mmId) : 'Free Kolb', 'Kolb'));
      (slot.mgChanges || []).forEach(c => add(c.date, 'kolbmg', mmName(c.mmId) + (c.newMG ? ': ' + c.newMG : ''), 'MG change'));
    }
    if (show('lin')) {
      (slot.linChanges || []).forEach(r => add(r.date, 'lin', ((slot.linDayTitles || {})[r.date]) || r.title || r.date, (r.items || []).length + ' change(s)'));
    }
    if (show('note')) {
      (slot.notes || []).forEach(n => { if (n.createdAt) add(toDateStr(new Date(n.createdAt)), 'note', n.topic || String(n.content || '').slice(0, 40) || 'Note'); });
    }
    if (show('dump')) {
      (slot.sourceDumps || []).forEach(dp => { if (dp.createdAt) add(dp.createdAt, 'dump', dp.title || 'Untitled'); });
    }

    return buckets;
  }

  // ── milestone lanes ──────────────────────────────────────────────────────
  // Milestones are periods, so they render as thin bars spanning their days
  // rather than as a repeated dot. Lane index is stable across the month so a
  // bar stays on the same row from its start day to its end day.
  function buildMilestoneLanes(slot, y, m, opts) {
    if (!shownFn(opts)('milestone')) return { lanesByDate: {}, laneCount: 0 };
    const first = dStr(y, m, 1), last = dStr(y, m, dim(y, m));

    // milestone definitions are cloned across linked goal nodes — dedupe by id
    const seenMs = new Set();
    const items = [];
    flattenGoals(slot.goals || []).forEach(g => (g.milestones || []).forEach(mst => {
      if (seenMs.has(mst.id)) return;
      seenMs.add(mst.id);
      if (!mst.startDate || !mst.endDate) return;
      if (mst.endDate < first || mst.startDate > last) return;
      items.push({ id: mst.id, title: mst.title || 'Milestone', owner: g.title || '', startDate: mst.startDate, endDate: mst.endDate });
    }));

    items.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate));

    // greedy lane packing: lowest lane whose intervals do not overlap
    const laneEnds = [];
    items.forEach((it, idx) => {
      it.color = MS_PALETTE[idx % MS_PALETTE.length];
      let lane = 0;
      while (lane < laneEnds.length && laneEnds[lane] >= it.startDate) lane++;
      laneEnds[lane] = it.endDate;
      it.lane = lane;
    });

    const lanesByDate = {};
    items.forEach(it => {
      for (let d = 1; d <= dim(y, m); d++) {
        const ds = dStr(y, m, d);
        if (ds < it.startDate || ds > it.endDate) continue;
        (lanesByDate[ds] = lanesByDate[ds] || []).push({
          lane: it.lane, color: it.color, title: it.title, owner: it.owner,
          startDate: it.startDate, endDate: it.endDate,
          isStart: ds === it.startDate, isEnd: ds === it.endDate
        });
      }
    });

    return { lanesByDate, laneCount: laneEnds.length };
  }

  // ── day notes ────────────────────────────────────────────────────────────
  // `time` is optional on a calendarNotes item. Absent, empty or malformed all
  // mean "no time", which is the pre-existing behaviour and stays the default;
  // only a well-formed HH:MM puts a note on the hour grid.
  const TIME_RE = /^\d{2}:\d{2}$/;
  const noteTimed = n => TIME_RE.test((n && n.time) || '');
  const NOTE_COLOR = '#e879f9';
  const DL_BLOCK_COLOR = '#f87171';

  // ── read-only day schedule ───────────────────────────────────────────────
  // Mirrors the geometry and collectors of SchedulePanel in progress.html so
  // the preview reads the same as the real thing. Nothing here writes.
  const SCHED_START_HOUR = 0, SCHED_END_HOUR = 24, SCHED_PX_PER_HOUR = 28;

  // ── schedule blocks for day notes and deadlines ───────────────────────────
  // Every day note and every deadline is a real span on the hour grid, and it
  // is so AUTOMATICALLY. A deadline's block ENDS at its due time — it is the
  // run-up to the deadline, not the deadline itself — while a day note's block
  // STARTS at its time.
  //
  // ABSENCE IS THE AUTOMATIC DEFAULT, four times over, and that is precisely
  // what puts a block on every item stored long before any of these keys
  // existed without writing a single byte to one of them. There is nothing to
  // migrate because nothing needs to be written:
  //   * no `blockOff`      → the item HAS a block. THIS is the on-grid switch,
  //     not `blockDuration`. Removing a block therefore writes `blockOff` and
  //     deletes nothing, so putting it back RESTORES the length, day and anchor
  //     the user chose rather than guessing them again — the same reasoning
  //     that already makes `reset to due time` a restore.
  //   * no `blockDuration` → DEFAULT_BLOCK_MINS. It is only a remembered
  //     length now, never a switch.
  //   * no `blockTime`     → still anchored: a deadline's block ends at its due
  //     time, a note's starts at its own time. Reset DELETES the key rather
  //     than storing the value it would have computed.
  //   * no `blockDate`     → the block sits on the item's own `date`.
  //
  // The item's own `date` and `time` are NOT block geometry. They are where the
  // note or deadline belongs, and its strip chip, due line and caution run-up
  // stay there however far the block is moved — which is why a drag writes
  // `blockDate`/`blockTime` and never `date`/`time`.
  const MIN_BLOCK = 5;
  const DEFAULT_BLOCK_MINS = 60;      // the length every block starts at
  const DEFAULT_NOTE_TIME = '08:00';  // where a note with no time of its own sits
  // Any positive finite number, matching what schema.js accepts. The reader must
  // not silently discard a value validation let through: the UI cannot author a
  // block shorter than the 5-minute snap, but an import or a hand edit can, and
  // dropping it would render the item at a length nobody chose while the key
  // sat in storage.
  const blockMins = v => (typeof v === 'number' && isFinite(v) && v > 0) ? v : null;
  const minsOf = t => { const m = TIME_RE.exec(String((t == null ? '' : t))); return m ? Number(m[0].slice(0, 2)) * 60 + Number(m[0].slice(3)) : null; };
  const hhmmOf = mins => {
    const c = Math.max(0, Math.min(SCHED_END_HOUR * 60 - MIN_BLOCK, Math.round(mins)));
    return String(Math.floor(c / 60)).padStart(2, '0') + ':' + String(c % 60).padStart(2, '0');
  };

  // The one on-grid switch. Never spell `!item.blockOff` at a call site — this
  // repository has paid twice for a predicate written out per call site.
  const blockOn = item => !(item && item.blockOff);
  const blockLen = item => { const m = blockMins(item && item.blockDuration); return m === null ? DEFAULT_BLOCK_MINS : m; };
  // Where a note's block sits when it has no `blockTime` of its own. An UNTIMED
  // note has nothing to anchor to, so it uses the default hour instead of being
  // kept off the grid. That is what makes clearing a note's time in
  // documentations.html harmless: there is no longer a block to strand.
  const noteBlockStart = n => (noteTimed(n) ? n.time : DEFAULT_NOTE_TIME);

  const noteBlockDuration = n => (blockOn(n) ? blockLen(n) : null);
  const dlBlockDuration = d => (blockOn(d) ? blockLen(d) : null);

  function noteBlockSpan(n) {
    if (!blockOn(n)) return null;
    const stored = minsOf(n && n.blockTime);
    const start = stored !== null ? stored : minsOf(noteBlockStart(n));
    return { time: hhmmOf(start), duration: blockLen(n) };
  }

  // The deadline block's span, or null when it has been taken off the grid. A
  // run-up that would start before 00:00 is clipped at the top rather than
  // pushed past its due time, so the end stays where the user put it. A due
  // time that cannot be read leaves nothing to end at, so it falls back to the
  // note default rather than producing NaN geometry.
  function dlBlockSpan(d) {
    if (!blockOn(d)) return null;
    const mins = blockLen(d);
    const stored = minsOf(d && d.blockTime);
    const due = minsOf(d && d.time);
    let start = stored !== null ? stored
      : (due !== null ? due - mins : minsOf(DEFAULT_NOTE_TIME));
    let dur = mins;
    if (start < 0) { dur = Math.max(MIN_BLOCK, dur + start); start = 0; }
    return { time: hhmmOf(start), duration: dur };
  }
  const dlBlockTime = d => { const s = dlBlockSpan(d); return s ? s.time : null; };

  // The day a block is DRAWN on, which need not be the day its item belongs to.
  // A malformed value reads as absent for the same reason a malformed blockTime
  // does: a block must never be lost to a day that does not exist.
  const blockDay = item => (item && DAY_RE.test(item.blockDate || '')) ? item.blockDate : (item && item.date);
  const partDay = (p, item) => (p && DAY_RE.test(p.date || '')) ? p.date : blockDay(item);

  // Dissecting an item stores its steps in `parts`, mirroring a goal task's
  // `children`. Never throws on a malformed stored value: a nested list is
  // exactly where hand-edited, imported or synced data goes wrong.
  function itemParts(item) {
    const raw = item && item.parts;
    return Array.isArray(raw) ? raw.filter(p => p && typeof p === 'object' && !Array.isArray(p)) : [];
  }
  // A part resolves its own start and length, falling back to the parent
  // block's. Null when neither yields a time, so a part can never be drawn at
  // a position nobody chose.
  function partSpan(p, fbTime, fbDur) {
    const own = TIME_RE.test((p && p.time) || '') ? p.time : null;
    const time = own !== null ? own : (TIME_RE.test(fbTime || '') ? fbTime : null);
    if (time === null) return null;
    const dur = blockMins(p && p.blockDuration);
    return { time, duration: dur !== null ? dur : fbDur };
  }

  // A deadline's prep belongs INSIDE its caution period: the run-up is work for
  // the deadline, so it can neither start before the period the user chose nor
  // fall after the day the thing is due. `span` is the proposed
  // {startDate, date}, so an edit form can ask about a period it has not
  // committed yet.
  function dlBlockDayValid(d, day, span) {
    const from = (span && span.startDate) || dlStart(d);
    const to = (span && span.date) || (d && d.date);
    return !!day && day >= from && day <= to;
  }
  // Every block day a proposed span would leave outside that window, so an edit
  // can be REFUSED rather than silently moving work the user placed by hand.
  // ONE definition: both writers of `startDate`/`date` — the Progress popup's
  // Edit form and documentations.html — call this instead of re-spelling the
  // comparison, which is exactly the shape that cost this project the deadline
  // caution predicate once already.
  function dlStrandedBlockDays(d, span) {
    if (!d || !blockOn(d)) return [];
    const parts = itemParts(d);
    const days = parts.length ? parts.map(p => partDay(p, d)) : [blockDay(d)];
    const out = [];
    days.forEach(day => {
      if (!dlBlockDayValid(d, day, span) && out.indexOf(day) === -1) out.push(day);
    });
    return out.sort();
  }

  function buildDaySchedule(slot, ds, opts) {
    const show = shownFn(opts);
    const mms = slot.mms || [];
    const mmName = id => { const mm = mms.find(x => x.id === id); return mm ? mm.name : 'MM ' + id; };
    const blocks = [];

    if (show('task')) flattenGoals(slot.goals || []).forEach(t => {
      if (t.isLink) return;
      const kids = t.children || [];
      const scheduled = t.taskType === 'routine'
        ? (t.routineDates ? Object.prototype.hasOwnProperty.call(t.routineDates, ds) : t.scheduledDate === ds)
        : t.scheduledDate === ds;
      if (!scheduled) return;
      if (t.taskType === 'milestone' && !kids.length) return;
      // a parent whose child sits on the same day is represented by the child
      if (kids.some(c => c.scheduledDate === ds)) return;
      const rd = (t.routineDates || {})[ds] || {};
      blocks.push({
        id: t.id,
        title: t.title || 'Untitled',
        kind: t.taskType === 'routine' ? 'Routine' : 'Goal task',
        time: (t.taskType === 'routine' ? rd.time || t.scheduledTime : t.scheduledTime) || '09:00',
        duration: goalDuration(t, ds),
        done: goalDone(t, ds),
        color: '#6366f1'
      });
    });

    if (show('sa')) (slot.saEntries || []).filter(e => e.date === ds).forEach(e => {
      const a = (slot.saActions || []).find(x => x.id === e.actionId);
      blocks.push({
        id: e.id,
        title: a ? ((a.emoji ? a.emoji + ' ' : '') + a.title) : 'Action ' + e.actionId,
        kind: 'Supporting action',
        time: e.time || '09:00',
        duration: e.duration || 60,
        done: !!e.done,
        color: (a && a.color) || '#fb923c'
      });
    });

    if (show('mm')) (slot.mmEntries || []).filter(e => e.date === ds).forEach(e => {
      const mm = mms.find(x => x.id === e.mmId);
      blocks.push({
        id: e.id,
        title: mm ? mm.name : mmName(e.mmId),
        kind: 'MM session',
        time: e.time || '09:00',
        duration: e.duration || 60,
        done: !!e.done,
        color: (mm && mm.color) || '#6366f1'
      });
    });

    const sir = show('sir')
      ? (slot.sessions || [])
        .filter(s => !s.skipped && (s.done && s.finishDate ? s.finishDate : s.date) === ds)
        .map(s => ({ label: mmName(s.mmId) + ' · rep ' + ((s.repIndex || 0) + 1), done: !!s.done }))
      : [];

    const mgSchedule = slot.mgSchedule || {};
    const mgIds = show('mg') ? mgsForDay(ds, mgSchedule) : [];

    // Day notes and deadlines are filtered by origin, not by kind: anything
    // authored from Documentations answers to the single 'doc' key instead of
    // to 'daynote' / 'deadline'. Each item is returned whole so the caller can
    // still read docPageId to decide highlighting and edit rights.
    const allDl = slot.deadlines || [];

    // A day note's `time` is optional and its ABSENCE is meaningful: a note
    // without one has no position on an hour grid, so it stays a chip in the
    // day strip — exactly how every day note behaved before the field existed.
    // One WITH a time joins `blocks`, which buys it hour placement and overlap
    // layout on every surface for free.
    // `calNotes` is therefore the strip's list and `calNotesAll` is the whole
    // day's, for callers that list notes for editing rather than by position.
    const dayNotes = (slot.calendarNotes || []).filter(n => n.date === ds && show(originKey(n, 'daynote')));

    // Blocks are collected by the day the BLOCK sits on, which is not
    // necessarily the day its item belongs to: `blockDate` on the item and
    // `date` on a part each move work elsewhere without moving the note or the
    // deadline. So this scans the WHOLE array rather than the day's items,
    // while the strip and due lists below keep filtering on the item's own
    // date — that split is what leaves a chip where the user left it.
    (slot.calendarNotes || []).filter(n => n && show(originKey(n, 'daynote'))).forEach(n => {
      const span = noteBlockSpan(n);
      if (!span) return;
      // Dissected: the parts stand in for the parent, exactly as a goal task's
      // scheduled children hide the parent block in progress.html.
      const parts = itemParts(n);
      if (parts.length) {
        parts.forEach(p => {
          if (partDay(p, n) !== ds) return;
          const s = partSpan(p, span.time, span.duration);
          if (!s) return;
          blocks.push({
            id: n.id + ':' + p.id, title: p.title || 'Part', kind: 'Day note part',
            time: s.time, duration: s.duration, done: !!p.done,
            color: NOTE_COLOR, item: n, part: p
          });
        });
        return;
      }
      if (blockDay(n) !== ds) return;
      blocks.push({
        id: n.id,
        title: n.title || 'Note',
        kind: 'Day note',
        time: span.time,
        duration: span.duration,
        done: false,
        color: NOTE_COLOR,
        item: n
      });
    });

    // A deadline's run-up block, on whichever caution day it was placed.
    // `deadlines` and `deadlinesCaution` below are deliberately blind to all of
    // it, because the due-time hairline and the caution run-up are a different
    // concern from where the work sits.
    allDl.filter(d => d && show(originKey(d, 'deadline'))).forEach(d => {
      const span = dlBlockSpan(d);
      if (!span) return;
      const parts = itemParts(d);
      if (parts.length) {
        parts.forEach(p => {
          if (partDay(p, d) !== ds) return;
          const s = partSpan(p, span.time, span.duration);
          if (!s) return;
          blocks.push({
            id: d.id + ':' + p.id, title: p.title || 'Part', kind: 'Deadline part',
            time: s.time, duration: s.duration, done: !!p.done,
            color: DL_BLOCK_COLOR, item: d, part: p
          });
        });
        return;
      }
      if (blockDay(d) !== ds) return;
      blocks.push({
        id: d.id, title: d.title || 'Deadline', kind: 'Deadline prep',
        time: span.time, duration: span.duration, done: dlDone(d),
        color: DL_BLOCK_COLOR, item: d
      });
    });

    return {
      blocks,
      sir,
      // The strip lists EVERY note that belongs to this day, timed or not, and
      // whether or not its block is on the grid. Scheduling something must
      // never take away the way it was already visible — a note used to leave
      // the strip the moment it had a time, and that is the behaviour this
      // reverses. `calNotesAll` is the same list, kept because callers that
      // list notes for editing rather than by position ask for it by name.
      calNotes: dayNotes,
      calNotesAll: dayNotes,
      deadlines: allDl.filter(d => d.date === ds && show(originKey(d, 'deadline'))).sort(dlByTime),
      // the due day is already covered by `deadlines` — caution lists the run-up
      // only, and a ticked deadline has no run-up left to warn about. Both tests
      // belong HERE rather than at a call site: this predicate has one twin in
      // progress.html and one in documentations.html, and the last time a rule
      // was written per call site instead, the timeline was the one that missed it.
      deadlinesCaution: allDl.filter(d => !dlDone(d) && d.date !== ds && dlInCaution(d, ds) && show(originKey(d, 'deadline'))).sort(dlByDate),
      mgs: mgIds.map(mmName),
      mgCarried: mgIds.length > 0 && !Object.prototype.hasOwnProperty.call(mgSchedule, ds)
    };
  }

  // port of computeOverlapInfo in progress.html: connected components over
  // intersecting [top, top+height) ranges, so overlaps sit side by side
  function overlapInfo(blocks) {
    const n = blocks.length;
    const adj = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (blocks[i].top < blocks[j].top + blocks[j].height &&
          blocks[j].top < blocks[i].top + blocks[i].height) { adj[i].push(j); adj[j].push(i); }
      }
    }
    const visited = new Set(), info = {};
    for (let i = 0; i < n; i++) {
      if (visited.has(i)) continue;
      const group = [], stack = [i];
      while (stack.length) {
        const v = stack.pop();
        if (visited.has(v)) continue;
        visited.add(v); group.push(v);
        adj[v].forEach(u => stack.push(u));
      }
      if (group.length < 2) continue;
      const orderedIds = group.sort((a, b) => a - b).map(idx => blocks[idx].id);
      orderedIds.forEach(id => { info[id] = orderedIds; });
    }
    return info;
  }

  function durLabel(min) {
    if (min < 60) return min + 'min';
    const h = Math.floor(min / 60), r = min % 60;
    return h + 'h' + (r ? ' ' + r + 'min' : '');
  }

  global.TrackCalendar = {
    toDateStr, dim, firstDay, dStr, MONTHS, DOWS,
    CATS, FILTERS, MS_PALETTE, MS_MAX_LANES,
    SCHED_START_HOUR, SCHED_END_HOUR, SCHED_PX_PER_HOUR,
    flattenGoals, goalDuration, goalDone, mgsForDay, noteTimed,
    dlStart, dlInCaution, dlByTime, dlByDate, dlDayCount, dlValid, dlDone, daysBetween,
    // the ONE definition of the day-note / deadline block rules. progress.html
    // holds a second copy only because it does not load this file, the same
    // documented exception it relies on for noteTimed and dlDone; the two must
    // agree, and tests/browser.test.js asserts each surface separately.
    noteBlockDuration, dlBlockDuration, dlBlockSpan, dlBlockTime, itemParts, partSpan,
    blockOn, noteBlockSpan, noteBlockStart, blockDay, partDay,
    dlBlockDayValid, dlStrandedBlockDays,
    DEFAULT_BLOCK_MINS, DEFAULT_NOTE_TIME,
    originKey,
    buildBuckets, buildMilestoneLanes, buildDaySchedule, overlapInfo, durLabel
  };
})(window);
