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
  // Reference-schedule blocks. Slate on purpose: pink, red and indigo already
  // mean day note, deadline and task, and a backdrop that borrowed one of them
  // would read as work the user chose to do.
  const REF_COLOR = '#94a3b8';

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
    { key: 'doc', label: 'Documentation', color: '#c084fc' },
    // A pasted timetable. In FILTERS and deliberately NOT in CATS: a weekly
    // entry would put a month dot on every single weekday, which is noise
    // rather than information. It is switchable because a term grid is a
    // backdrop, and a backdrop you cannot turn off is wallpaper.
    { key: 'ref', label: 'Timetable', color: REF_COLOR }
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

  // ── local calendar day ranges ────────────────────────────────────────────

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

  // `days` before or after a 'YYYY-MM-DD', on the LOCAL calendar. Same
  // T12:00:00 anchor, so a DST change in between cannot shift the result onto
  // the neighbouring day the way a UTC-midnight parse would.
  function dayShift(ds, days) {
    if (!DAY_RE.test(ds || '')) return null;
    const t = new Date(ds + 'T12:00:00');
    t.setDate(t.getDate() + days);
    return toDateStr(t);
  }

  // ── deadlines ────────────────────────────────────────────────────────────
  // A deadline is due on `date` at `time`, and it warns on the days the user
  // CHOSE — `cautionDates`, a plain list of days, not a span with a start.
  // Same rules as progress.html, which holds a documented copy of this whole
  // family because it does not load this file.

  // THE resolver, and the only code anywhere that has heard of `startDate`.
  //
  // `cautionDates` is the stored choice, and an EMPTY LIST IS A REAL VALUE
  // meaning "no caution days". That is why `Array.isArray` decides the branch,
  // and why clearing every day writes `[]` rather than deleting the key: a
  // deleted key falls through to the legacy branch below and would resurrect
  // the span the user just cleared. This is deliberately the opposite of
  // `time` and `blockTime`, where absence is the meaningful state.
  //
  // The legacy branch expands a pre-choice `startDate` span, and it is NOT
  // dead code now that progress.html migrates stored records. An old export
  // imported later, a second device still running the previous version, a
  // hand-edited file, and a migration write the quota refused all arrive here
  // un-migrated — and none of them may lose its run-up.
  //
  // The due day is filtered out HERE rather than at each call site. It is
  // drawn red and must never also be drawn amber. That rule used to be spelled
  // `d.date !== ds` at three separate call sites; one of them forgot it, and
  // the timeline double-marked every due day until it was found.
  function dlCautionDays(d) {
    if (!d || !DAY_RE.test(d.date || '')) return [];
    const raw = Array.isArray(d.cautionDates)
      ? d.cautionDates
      : (DAY_RE.test(d.startDate || '') ? daysBetween(d.startDate, d.date) : []);
    const seen = new Set(), out = [];
    for (let i = 0; i < raw.length; i++) {
      const ds = raw[i];
      if (typeof ds !== 'string' || !DAY_RE.test(ds)) continue;
      if (ds >= d.date || seen.has(ds)) continue;
      seen.add(ds);
      out.push(ds);
    }
    return out.sort();
  }
  const dlCautionSet = d => new Set(dlCautionDays(d));
  const dlInCaution = (d, ds) => dlCautionDays(d).indexOf(ds) !== -1;
  const dlCautionCount = d => dlCautionDays(d).length;
  // The earliest day this deadline occupies: its first chosen caution day, or
  // the due day when it has chosen none. It is the `min` of a day picker, NOT
  // a period boundary — with a sparse set there is no such thing, which is why
  // membership is always tested through dlBlockDayValid and never through a
  // comparison against this.
  const dlStart = d => { const days = dlCautionDays(d); return days.length ? days[0] : (d && d.date); };

  // THE writer, mirroring TrackTrueStorage.withTag. Two rules live here and
  // nowhere else:
  //
  //   * `startDate` is deleted in the same spread, so any record this touches
  //     is migrated by the act of being edited — and progress.html's bulk
  //     migration is simply this function applied to every stored deadline.
  //   * `cautionDates` is always written, even when empty. See dlCautionDays.
  //
  // Sanitising the result through dlCautionDays means no caller can store a
  // duplicate, an unsorted list, a malformed day, or a day on or after the due
  // day. Everything else is spread through untouched, so docPageId, createdAt,
  // done, the block keys and any field a later version adds all survive.
  function dlWithCautionDays(d, days) {
    const next = Object.assign({}, d, { cautionDates: Array.isArray(days) ? days.slice() : [] });
    delete next.startDate;
    next.cautionDates = dlCautionDays(next);
    return next;
  }
  const dlToggleCautionDay = (d, ds) => {
    const days = dlCautionDays(d);
    return dlWithCautionDays(d, days.indexOf(ds) === -1 ? days.concat([ds]) : days.filter(x => x !== ds));
  };

  // Ticked: the user has handled it, so the run-up stops warning. ABSENCE is
  // "not done" and `!!` reads an absent key, false and undefined alike, so
  // there is no third state and no migration — every existing deadline is
  // already correct. The tick SUPPRESSES the chosen days, it does not alter
  // them: dlCautionDays, dlInCaution and dlCautionCount are deliberately left
  // blind to it, which is what makes unticking a restore rather than a guess.
  const dlDone = d => !!d.done;
  const dlByTime = (a, b) => String(a.time).localeCompare(String(b.time));
  const dlByDate = (a, b) => a.date.localeCompare(b.date) || dlByTime(a, b);
  // A title and a due time. There is no caution start to order any more, and
  // the whole inverted-span hazard class went with it — there is no second
  // stored date left to put out of order. Identical to dlValid in
  // progress.html.
  function dlValid(draft) {
    return !!String((draft && draft.title) || '').trim()
      && /^\d{2}:\d{2}$/.test((draft && draft.time) || '');
  }
  // A draft that carries its OWN due day, for the compose paths where the due
  // date is typed rather than taken from the calendar cell the form was opened
  // on. Identical to dlDraftValid in progress.html.
  function dlDraftValid(draft) {
    return DAY_RE.test((draft && draft.date) || '') && dlValid(draft);
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

  // A deadline's prep belongs on a day the deadline actually OCCUPIES: one of
  // the caution days the user chose, or the due day itself. With a sparse set
  // there is no window to compare against, so this is membership and never a
  // range test — a `day >= dlStart(d)` anywhere would silently re-admit the
  // gaps the user deliberately left out.
  //
  // `span` is the PROPOSED {cautionDates, date}, so an edit form can ask about
  // a change it has not committed yet; each half falls back to the stored
  // record, and a proposed `cautionDates` overrides the legacy `startDate`
  // branch for the same reason dlCautionDays does.
  function dlBlockDayValid(d, day, span) {
    if (!day) return false;
    const probe = Object.assign({}, d);
    if (span && Array.isArray(span.cautionDates)) probe.cautionDates = span.cautionDates;
    if (span && span.date) probe.date = span.date;
    return day === probe.date || dlCautionDays(probe).indexOf(day) !== -1;
  }
  // Every block day a proposed change would leave outside that set, so an edit
  // can be REFUSED rather than silently moving work the user placed by hand.
  // ONE definition: the Progress popup's Edit form and its caution picker both
  // call this instead of re-spelling the comparison, which is exactly the shape
  // that cost this project the deadline caution predicate once already.
  function dlStrandedBlockDays(d, span) {
    if (!d || !blockOn(d)) return [];
    // Block days are read off the PROPOSED record, not the stored one. An
    // absent blockDate means the block follows the item's own `date`, so it
    // MOVES WITH a due-day change and cannot be stranded by one; reading
    // blockDay(d) here would report the old due day as orphaned and refuse
    // every move of an un-anchored deadline. Only dlBlockDayValid's own probe
    // decides membership — this probe decides which days to ask about.
    const probe = Object.assign({}, d);
    if (span && span.date) probe.date = span.date;
    const parts = itemParts(probe);
    const days = parts.length ? parts.map(p => partDay(p, probe)) : [blockDay(probe)];
    const out = [];
    days.forEach(day => {
      if (!dlBlockDayValid(d, day, span) && out.indexOf(day) === -1) out.push(day);
    });
    return out.sort();
  }

  // ── reference schedules ──────────────────────────────────────────────────
  /* A pasted timetable — see schedule-paste-core.js for the text format and
     AGENTS.md for the stored shape. An entry is ONE line of a printed grid:

         { id, title, time, duration, docPageId, importId,
           date }                                   one-off, OR
           dow, from, until }                       weekly, inclusive

     EXACTLY ONE of `date` and `dow` is present. That single rule is what lets
     one paste format carry both a term timetable and a one-off day without the
     user choosing a mode, and it is why an entry carrying both is REFUSED here
     rather than resolved by whichever branch happens to run first — there is
     no defensible answer to which day such a record occupies.

     THIS IS REFERENCE DATA, NEVER WORK. Nothing here is tickable, nothing is
     draggable, and no reader may write to it. It is returned in its own array
     rather than mixed into `blocks`, which is load-bearing three times over:
     every existing consumer of `blocks` is untouched, overlapInfo never sees a
     ghost so a class can never squeeze a real task's width, and each surface
     opts in to drawing the layer rather than inheriting it by accident. */

  const refDur = e => { const m = blockMins(e && e.duration); return m === null ? DEFAULT_BLOCK_MINS : m; };

  /* Where a reference block sits, or null when it has no usable time at all.
     Unlike dlBlockSpan there is no start to compute backwards — a class starts
     at its own time — so there is nothing to clip at the top. An out-of-range
     stored hour is CLAMPED into the grid by hhmmOf rather than refused: the
     paste format already refuses '25:00' at authoring time with the line named,
     so this path is only reached by data that was hand-edited, synced from
     another version, or imported, and drawing it at the edge of the grid beats
     making it disappear. */
  function refSpan(entry) {
    if (!entry) return null;
    const start = minsOf(entry.time);
    if (start === null) return null;
    return { time: hhmmOf(start), duration: refDur(entry) };
  }

  /* THE occupancy test, and it has exactly one definition. progress.html
     carries a documented twin because it does not load this file; nothing else
     may re-spell it. Never write `entry.dow === d.getDay()` at a call site —
     this repository has already paid twice for a predicate written out per
     call site, most expensively with the deadline caution rule, which was
     spelled at three sites and dropped at one.

     The weekly arm compares the range as STRINGS, which is correct and total
     for YYYY-MM-DD, and asks the platform for the weekday through a parse at
     'T12:00:00' — the standing rule in this file, because a bare
     'YYYY-MM-DD' is UTC midnight and lands a day early west of UTC. */
  function refOccupies(entry, ds) {
    if (!entry || !DAY_RE.test(ds || '')) return false;

    const hasDate = entry.date !== undefined && entry.date !== null;
    const hasDow = entry.dow !== undefined && entry.dow !== null;
    if (hasDate === hasDow) return false;   // both, or neither: refused, never guessed

    if (hasDate) return entry.date === ds;

    const dow = entry.dow;
    if (!(dow === Math.floor(dow) && dow >= 0 && dow <= 6)) return false;
    // An absent bound is open in that direction — a term whose end is not
    // known yet is an ordinary state, not damage.
    if (DAY_RE.test(entry.from || '') && ds < entry.from) return false;
    if (DAY_RE.test(entry.until || '') && ds > entry.until) return false;
    const d = new Date(ds + 'T12:00:00');
    if (isNaN(d.getTime())) return false;
    return d.getDay() === dow;
  }

  /* Every reference block drawn on `ds`, in time order. The id is COMPOSITE
     (`entry.id@ds`) because one weekly entry appears on many days at once —
     every column of a week view is in the DOM together, so an id that repeated
     across days could not tell a React key apart, and a test could not tell a
     block drawn on the wrong day from one drawn correctly. */
  function refOn(slot, ds, opts) {
    if (!shownFn(opts)('ref')) return [];
    const list = Array.isArray(slot && slot.refSchedules) ? slot.refSchedules : [];
    const out = [];
    list.forEach(entry => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
      if (!refOccupies(entry, ds)) return;
      const span = refSpan(entry);
      if (!span) return;
      out.push({
        id: String(entry.id) + '@' + ds,
        entryId: entry.id,
        title: entry.title || 'Class',
        time: span.time,
        duration: span.duration,
        color: REF_COLOR,
        entry: entry
      });
    });
    return out.sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title));
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
      // the chosen days only, and a ticked deadline has no run-up left to warn
      // about. The due day cannot appear here at all — dlCautionDays drops it,
      // so the `d.date !== ds` clause this filter used to carry is now
      // structurally impossible to forget. That clause was once spelled at
      // three call sites, and the timeline was the one that missed it.
      deadlinesCaution: allDl.filter(d => !dlDone(d) && dlInCaution(d, ds) && show(originKey(d, 'deadline'))).sort(dlByDate),
      mgs: mgIds.map(mmName),
      mgCarried: mgIds.length > 0 && !Object.prototype.hasOwnProperty.call(mgSchedule, ds),
      // A SEPARATE array, never mixed into `blocks`. See refOn: it keeps every
      // existing consumer untouched, keeps overlapInfo from ever seeing a
      // ghost, and makes drawing the backdrop an opt-in per surface.
      refBlocks: refOn(slot, ds, opts)
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
    daysBetween, dayShift,
    // the ONE definition of the chosen-caution-day rules, and the one writer.
    // dlCautionCount replaced dlDayCount rather than being renamed into it: the
    // number changed meaning (span length including the due day → count of
    // chosen days), and a changed meaning behind an unchanged name is worse
    // than the churn.
    dlCautionDays, dlCautionSet, dlCautionCount, dlWithCautionDays, dlToggleCautionDay,
    dlStart, dlInCaution, dlByTime, dlByDate, dlValid, dlDraftValid, dlDone,
    // the ONE definition of the day-note / deadline block rules. progress.html
    // holds a second copy only because it does not load this file, the same
    // documented exception it relies on for noteTimed and dlDone; the two must
    // agree, and tests/browser.test.js asserts each surface separately.
    noteBlockDuration, dlBlockDuration, dlBlockSpan, dlBlockTime, itemParts, partSpan,
    blockOn, noteBlockSpan, noteBlockStart, blockDay, partDay,
    dlBlockDayValid, dlStrandedBlockDays,
    refSpan, refOccupies, refOn, REF_COLOR,
    DEFAULT_BLOCK_MINS, DEFAULT_NOTE_TIME,
    originKey,
    buildBuckets, buildMilestoneLanes, buildDaySchedule, overlapInfo, durLabel
  };
})(window);
