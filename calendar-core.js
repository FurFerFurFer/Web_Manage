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
  const NOTE_BLOCK_MIN = 30;   // block height only — a note has no duration
  const NOTE_COLOR = '#e879f9';

  // ── read-only day schedule ───────────────────────────────────────────────
  // Mirrors the geometry and collectors of SchedulePanel in progress.html so
  // the preview reads the same as the real thing. Nothing here writes.
  const SCHED_START_HOUR = 0, SCHED_END_HOUR = 24, SCHED_PX_PER_HOUR = 28;

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
    dayNotes.filter(noteTimed).forEach(n => blocks.push({
      id: n.id,
      title: n.title || 'Note',
      kind: 'Day note',
      time: n.time,
      duration: NOTE_BLOCK_MIN,
      // a note is a point in time, not a span. NOTE_BLOCK_MIN only gives the
      // block a height; metaLabel keeps the surface from captioning it with a
      // duration the user never entered.
      metaLabel: n.time,
      done: false,
      color: NOTE_COLOR,
      item: n
    }));

    return {
      blocks,
      sir,
      calNotes: dayNotes.filter(n => !noteTimed(n)),
      calNotesAll: dayNotes,
      deadlines: allDl.filter(d => d.date === ds && show(originKey(d, 'deadline'))).sort(dlByTime),
      // the due day is already covered by `deadlines` — caution lists the run-up only
      deadlinesCaution: allDl.filter(d => d.date !== ds && dlInCaution(d, ds) && show(originKey(d, 'deadline'))).sort(dlByDate),
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
    dlStart, dlInCaution, dlByTime, dlByDate, dlDayCount, dlValid, daysBetween,
    originKey,
    buildBuckets, buildMilestoneLanes, buildDaySchedule, overlapInfo, durLabel
  };
})(window);
