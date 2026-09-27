/* ── notes-core.js ─────────────────────────────────────────────────────────
   The one definition of what a Track note is (window.TrackNotes). Pure: no
   DOM, no storage, no clock — the widget passes `now` and `today` in.

   Two kinds of note live in a slot:

     Sorted  `notes`, a list of {id, topic, content, createdAt}. The user adds
             and deletes these. Unchanged by this file except for the one
             patch writer below.
     Date    `dateNotes`, a MAP keyed by LOCAL calendar day, 'YYYY-MM-DD' →
             {content, createdAt, updatedAt}. One draft per day, fixed by its
             date: the day is the identity, so a duplicate is not a state the
             data can be in.

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

   Dates are LOCAL calendar days. A 'YYYY-MM-DD' string is never handed to the
   Date constructor, which parses it as UTC midnight and names the wrong weekday
   everywhere west of UTC; it is split into components instead. isDay comes
   from schema.js, loaded before this file on every page.
*/
(function (global) {
  'use strict';

  var MAX_PANES = 4;

  var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
  // not a real calendar day is refused the same way: the input comes back.
  function withDateNote(map, day, text, now) {
    var src = isMap(map) ? map : {};
    if (!isDay(day)) return src;
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

  // Every real day holding non-blank text, newest first. Days are 'YYYY-MM-DD',
  // so string order IS calendar order.
  function datedDays(map) {
    if (!isMap(map)) return [];
    return Object.keys(map)
      .filter(function (day) { return isDay(day) && !isBlank(dateNoteText(map, day)); })
      .sort(function (a, b) { return a < b ? 1 : a > b ? -1 : 0; })
      .map(function (day) { return { day: day, text: dateNoteText(map, day) }; });
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

  global.TrackNotes = {
    MAX_PANES: MAX_PANES,
    dateNoteText: dateNoteText,
    withDateNote: withDateNote,
    datedDays: datedDays,
    withSortedPatch: withSortedPatch,
    appendSent: appendSent,
    dayLabel: dayLabel,
    firstLine: firstLine,
    isBlank: isBlank
  };
})(typeof window !== 'undefined' ? window : globalThis);
