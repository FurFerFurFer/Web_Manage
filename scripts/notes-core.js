/* ── notes-core.js ─────────────────────────────────────────────────────────
   The one definition of what a Track note is (window.TrackNotes). Pure: no
   DOM, no storage, no clock — the widget passes `now` and `today` in.

   Two kinds of note live in a slot:

     Sorted  `notes`, a list of {id, topic, content, createdAt}. The user adds
             and deletes these. Unchanged by this file except for the one
             patch writer below.
     Date    `dateNotes`, a MAP keyed by LOCAL calendar day, 'YYYY-MM-DD' →
             {content, createdAt, updatedAt, tag?}. One draft per day, fixed by
             its date: the day is the identity, so a duplicate is not a state
             the data can be in.

   The rules, and why each lives here rather than at a call site:

   - ABSENCE IS AN EMPTY DAY. A record is written on the first non-blank text
     and its key is DELETED when the text trims to empty; '' is never stored.
     Nothing sits behind the key as a fallback, so this is the `time` / `link`
     rule and deliberately not the `cautionDates: []` one. It is also why
     opening a day writes nothing: there is nothing to write until there is text.
   - EDIT BY SPREADING. A record is rewritten as {...existing, content,
     updatedAt}, never rebuilt from a field list, so a key a later version adds
     survives this one.
   - THE READER IS TOTAL. A hand-edited, synced or imported map can hold
     anything under any key. dateNoteText never throws, and datedDays SKIPS a key
     that is not a real day without deleting it — skipping is display, deleting
     would be data loss.
   - IDENTITY WHEN UNCHANGED. withDateNote returns its input map, the same
     object, when the write would change nothing, so the widget can skip the
     write entirely rather than arm a sync upload for a no-op.

   TAGS. A written day carries one of three: unclear, cleared, Eternal. The
   rules that make "every note is red by default" true without a migration:

   - THE DEFAULT IS AN ABSENCE. A written day with no stored `tag` IS unclear,
     so every note written before tags existed reads as unclear with no byte
     written to it. Choosing unclear therefore DELETES the key — a stored
     'unclear' would be a second spelling of the default (the `head: 1` rule).
   - A TAG BELONGS TO A WRITTEN DAY. An unwritten day is uncoloured, so
     withDateTag refuses one, and blank text deletes the day exactly as before,
     its tag with it. "An empty day and an untouched day are the same state"
     stays true, and spreading the record carries the tag through a text edit.
   - CLEARED AND ETERNAL LOCK THE TEXT. A tag whose `locked` is set freezes the
     day's words: withDateNote refuses ANY change to them, emptying included,
     and hands its input back. Only the text is frozen — the tag can always be
     changed, and choosing unclear is how a day is unlocked. The rule lives in
     the writer, not only in a read-only text box, so a save from a stale tab
     cannot slip past it.
   - COLOURS ARE NOT HERE. Red, green and orchid are presentation, spelled once
     in styles.css as --color-tag-<id>. This file says what a tag IS.

   Dates are LOCAL calendar days. A 'YYYY-MM-DD' string is never handed to the
   Date constructor, which parses it as UTC midnight and names the wrong weekday
   everywhere west of UTC; it is split into components instead. The month grid
   the Date calendar draws is built the same way, at noon. isDay comes from
   schema.js, loaded before this file on every page.
*/
(function (global) {
  'use strict';

  var MAX_PANES = 4;

  var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'];

  // Display order is this list's order. The labels are the user's own words,
  // capital E included. The glyph keeps unclear and cleared apart for anyone
  // who cannot tell red from green. `locked` freezes the day's text: a day the
  // user has cleared or made Eternal is read, copied and opened beside, never
  // edited, until it is made unclear again.
  var TAGS = [
    { id: 'unclear', label: 'unclear', glyph: '?', locked: false },
    { id: 'cleared', label: 'cleared', glyph: '✓', locked: true },
    { id: 'eternal', label: 'Eternal', glyph: '∞', locked: true }
  ].map(function (t) { return Object.freeze(t); });
  Object.freeze(TAGS);
  var DEFAULT_TAG = 'unclear';
  var TAG_BY_ID = {};
  TAGS.forEach(function (t) { TAG_BY_ID[t.id] = t; });

  function isMap(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  function own(o, k) { return isMap(o) && Object.prototype.hasOwnProperty.call(o, k); }

  function isDay(v) {
    var S = global.TrackSchema;
    return !!(S && S.isDay) && S.isDay(v);
  }

  // A shallow copy that keeps EVERY own key, '__proto__' included. JSON.parse
  // makes '__proto__' an ordinary own property; assigning it with `=` or
  // Object.assign would set the copy's prototype instead and lose the key.
  function copyOwn(src) {
    var out = {};
    if (!isMap(src)) return out;
    Object.keys(src).forEach(function (k) {
      Object.defineProperty(out, k, { value: src[k], enumerable: true, writable: true, configurable: true });
    });
    return out;
  }

  function isBlank(text) { return typeof text !== 'string' || text.trim() === ''; }

  // ── Date notes ────────────────────────────────────────────────────────────

  // The text stored for `day`, or '' — for any map, any key, any value. A bare
  // string is read as the content, so a hand-written map still displays.
  function dateNoteText(map, day) {
    if (!own(map, day)) return '';
    var v = map[day];
    if (typeof v === 'string') return v;
    if (isMap(v) && typeof v.content === 'string') return v.content;
    return '';
  }

  // Pure. Returns a NEW map with `day` holding `text`, or with `day` removed when
  // `text` is blank — or the SAME map when nothing would change. A `day` that is
  // not a real calendar day is refused the same way: the input comes back. So is
  // a LOCKED day, whatever the text — emptying it included.
  function withDateNote(map, day, text, now) {
    var src = isMap(map) ? map : {};
    if (!isDay(day) || dateNoteLocked(src, day)) return src;
    var present = own(src, day);
    if (isBlank(text)) {
      if (!present) return src;
      var trimmed = copyOwn(src);
      delete trimmed[day];
      return trimmed;
    }
    var prev = present ? src[day] : undefined;
    if (isMap(prev) && prev.content === text) return src;
    var rec = copyOwn(isMap(prev) ? prev : {});
    rec.content = text;
    if (typeof rec.createdAt !== 'number') rec.createdAt = now;
    rec.updatedAt = now;
    var out = copyOwn(src);
    out[day] = rec;
    return out;
  }

  // Every real day holding non-blank text, newest first, with the tag it shows.
  // Days are 'YYYY-MM-DD', so string order IS calendar order.
  function datedDays(map) {
    if (!isMap(map)) return [];
    return Object.keys(map)
      .filter(function (day) { return isDay(day) && !isBlank(dateNoteText(map, day)); })
      .sort(function (a, b) { return a < b ? 1 : a > b ? -1 : 0; })
      .map(function (day) { return { day: day, text: dateNoteText(map, day), tag: dateNoteTag(map, day) }; });
  }

  // ── tags ──────────────────────────────────────────────────────────────────

  // An own-property test, never TAG_BY_ID[v]: truthiness inherits from
  // Object.prototype, so 'constructor' and 'toString' would pass as tags.
  function isTag(v) { return typeof v === 'string' && own(TAG_BY_ID, v); }

  function tagInfo(id) { return isTag(id) ? TAG_BY_ID[id] : null; }

  // The tag a day SHOWS. '' for a day with nothing written — an unwritten day
  // is uncoloured, whatever a hand-edited record claims. A written day with no
  // stored tag, a bare string, or a tag this version does not know shows the
  // default. Total, like dateNoteText.
  function dateNoteTag(map, day) {
    if (isBlank(dateNoteText(map, day))) return '';
    var v = map[day];
    return isMap(v) && isTag(v.tag) ? v.tag : DEFAULT_TAG;
  }

  // Whether `day`'s text is frozen: it SHOWS a tag whose `locked` is set. Read
  // through dateNoteTag, so an unwritten day is never locked — there is no text
  // to protect — and a tag this version does not know reads as unclear, which
  // leaves the day editable rather than stranded. Total.
  function dateNoteLocked(map, day) {
    var info = tagInfo(dateNoteTag(map, day));
    return !!(info && info.locked);
  }

  // Pure. Returns a NEW map with `day` showing `tag`, or the SAME map when the
  // write would change nothing or is refused: a day that is not a real day, a
  // tag that is not in TAGS, and a day with nothing written. Choosing the
  // default DELETES the key, so the default has exactly one spelling.
  function withDateTag(map, day, tag, now) {
    var src = isMap(map) ? map : {};
    if (!isDay(day) || !isTag(tag)) return src;
    var written = dateNoteText(src, day);
    if (isBlank(written)) return src;
    var prev = src[day];
    var rec;
    if (isMap(prev)) {
      if (tag === DEFAULT_TAG ? !own(prev, 'tag') : prev.tag === tag) return src;
      rec = copyOwn(prev);
    } else {
      // A bare string is a written, untagged day. Upgraded, keeping its text.
      if (tag === DEFAULT_TAG) return src;
      rec = { content: written };
    }
    if (tag === DEFAULT_TAG) delete rec.tag;
    else rec.tag = tag;
    if (typeof rec.createdAt !== 'number') rec.createdAt = now;
    rec.updatedAt = now;
    var out = copyOwn(src);
    out[day] = rec;
    return out;
  }

  // ── Sorted notes ──────────────────────────────────────────────────────────

  // Pure. Spreads `patch` into the ONE note whose id matches. A missing id is
  // reported as found:false with the list handed back untouched — the widget
  // must never recreate a note another tab deleted.
  function withSortedPatch(list, id, patch) {
    var src = Array.isArray(list) ? list : [];
    var found = false;
    var out = src.map(function (n) {
      if (found || !isMap(n) || n.id !== id) return n;
      found = true;
      var next = copyOwn(n);
      Object.keys(patch || {}).forEach(function (k) { next[k] = patch[k]; });
      return next;
    });
    return { list: found ? out : src, found: found };
  }

  // ── sending a selection ───────────────────────────────────────────────────

  // Appends `text` to `existing` on a line of its own. Never touches what is
  // already there — sending adds, it does not replace.
  function appendSent(existing, text) {
    var base = typeof existing === 'string' ? existing : '';
    if (typeof text !== 'string' || !text) return base;
    if (!base) return text;
    return base + (base.charAt(base.length - 1) === '\n' ? '' : '\n') + text;
  }

  // ── labels ────────────────────────────────────────────────────────────────

  // Noon, not midnight: a DST jump moves midnight but never noon, so the whole-day
  // difference between two noons is always an integer after rounding.
  function noonOf(day) {
    return new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), 12);
  }

  // 'Today · Sun 27 Sep', 'Yesterday · Sat 26 Sep', 'Fri 25 Sep 2025'. The year is
  // shown only when it differs from today's. English names on purpose: the app
  // is English, and toLocaleDateString would make the label machine-dependent.
  function dayLabel(day, today) {
    if (!isDay(day)) return String(day);
    var d = noonOf(day);
    var text = WEEKDAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
    if (!isDay(today)) return text + ' ' + d.getFullYear();
    if (day.slice(0, 4) !== today.slice(0, 4)) text += ' ' + d.getFullYear();
    var diff = Math.round((d - noonOf(today)) / 86400000);
    var rel = diff === 0 ? 'Today' : diff === -1 ? 'Yesterday' : diff === 1 ? 'Tomorrow' : '';
    return rel ? rel + ' · ' + text : text;
  }

  // The first non-blank line, trimmed and capped — a list row's preview.
  function firstLine(text, max) {
    var cap = max || 80;
    var line = (typeof text === 'string' ? text : '').split('\n')
      .map(function (l) { return l.trim(); })
      .filter(Boolean)[0] || '';
    return line.length > cap ? line.slice(0, cap - 1) + '…' : line;
  }

  // ── the month grid ────────────────────────────────────────────────────────
  // What the Date calendar pop-up draws. Months are 'YYYY-MM'. Every day is
  // built from local components at NOON and formatted from its own getters.

  var MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

  function isMonth(v) { return typeof v === 'string' && MONTH_RE.test(v); }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function dayOf(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

  // The 'YYYY-MM' holding `day`, or '' for anything that is not a day.
  function monthOf(day) { return isDay(day) ? day.slice(0, 7) : ''; }

  // Whole months by arithmetic on the components: no Date is involved, so no
  // timezone can move it. A malformed month comes back unchanged.
  function shiftMonth(ym, n) {
    if (!isMonth(ym)) return ym;
    var i = (+ym.slice(0, 4)) * 12 + (+ym.slice(5, 7) - 1) + Math.trunc(n || 0);
    var y = Math.floor(i / 12);
    return String(y).padStart(4, '0') + '-' + pad2(i - y * 12 + 1);
  }

  // `n` days after `day`, or before when negative. The Date constructor folds
  // day 0, -3 or 40 into the neighbouring month.
  function addDays(day, n) {
    if (!isDay(day)) return day;
    return dayOf(new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10) + Math.trunc(n || 0), 12));
  }

  // The same day of the month `n` months away, clamped to that month's length:
  // 31 January plus one month is the last day of February, never 3 March.
  function addMonths(day, n) {
    if (!isDay(day)) return day;
    var ym = shiftMonth(day.slice(0, 7), n);
    var last = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0, 12).getDate();
    return ym + '-' + pad2(Math.min(+day.slice(8, 10), last));
  }

  // 'October 2026'.
  function monthLabel(ym) {
    return isMonth(ym) ? MONTHS_LONG[+ym.slice(5, 7) - 1] + ' ' + (+ym.slice(0, 4)) : String(ym);
  }

  // The 42 days a month view draws: six whole weeks from the Sunday on or before
  // the 1st — Sunday first, the column order TrackCalendar.DOWS gives the Home
  // and Documentations calendars. Always six rows, so the pop-up keeps one
  // height from month to month.
  function monthGrid(ym) {
    if (!isMonth(ym)) return [];
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1;
    var lead = new Date(y, m, 1, 12).getDay();
    var out = [];
    for (var i = 0; i < 42; i++) {
      var d = new Date(y, m, 1 - lead + i, 12);
      out.push({ day: dayOf(d), inMonth: d.getMonth() === m });
    }
    return out;
  }

  global.TrackNotes = {
    MAX_PANES: MAX_PANES,
    TAGS: TAGS,
    DEFAULT_TAG: DEFAULT_TAG,
    WEEKDAYS: WEEKDAYS.slice(),
    dateNoteText: dateNoteText,
    withDateNote: withDateNote,
    datedDays: datedDays,
    isTag: isTag,
    tagInfo: tagInfo,
    dateNoteTag: dateNoteTag,
    dateNoteLocked: dateNoteLocked,
    withDateTag: withDateTag,
    withSortedPatch: withSortedPatch,
    appendSent: appendSent,
    dayLabel: dayLabel,
    firstLine: firstLine,
    isBlank: isBlank,
    monthOf: monthOf,
    shiftMonth: shiftMonth,
    addDays: addDays,
    addMonths: addMonths,
    monthLabel: monthLabel,
    monthGrid: monthGrid
  };
})(typeof window !== 'undefined' ? window : globalThis);
