/* ── journey-core.js ──────────────────────────────────────────────────────
   The one definition of how the Journey book is made (window.TrackJourney):
   its title, where a page may end, which page sits on which side of the book,
   which layout fits the screen, and how a turning sheet folds. Pure: no DOM,
   no storage, no clock. journey-book.js measures and draws, and asks this
   file what its measurements mean. There is no date code here — the heading
   a day starts with is notes-core.js's journeyDayLabel — which is why its
   suite runs once rather than swept.

   THE TITLE is the user's own words, verbatim, the capital I of "FIn"
   included on purpose, set as three lines broken after each comma.

   A PAGE ENDS ONLY AT A BREAK POINT (breakPoints): where a run of whitespace
   begins, for text written with spaces; and, because Thai is written without
   them, between two Thai WORDS, which Intl.Segmenter finds with its
   dictionary. When even the first break point does not fit — one enormous
   word, a long link — the cut falls back to GRAPHEME clusters, so a page never
   begins with a vowel or tone mark torn from its consonant; and it always
   takes at least one cluster, so cutting a day always finishes.

   EVERY DAY STARTS ON A NEW PAGE BY CONSTRUCTION. buildPages cuts each day on
   its own; there is no shared flow for one day's tail to run into the next
   day's head.

   THE FOLD. A sheet W x H hinged at x = 0 (its spine edge), y down. The
   grabbed corner C — the outer bottom (W, H) or the outer top (W, 0) — is
   dragged to P, which clampCorner keeps where paper can really be: within W of
   the hinge point on the corner's own edge, and within the diagonal of the
   other one. The crease is the perpendicular bisector of C and P; the part of
   the sheet on C's side of it is folded over, reflected across the crease
   (R). What shows on that flap is the BACK of the sheet, whose own
   coordinates run mirror-wise (M: x -> W - x), so the next page is drawn by
   R∘M — two reflections, a rotation — and is never mirrored on screen. A
   one-page book has no page on the back of its sheet; there the flap shows
   the front's own ink seen through the paper, which is R alone and IS
   mirrored, as through real paper. A backward turn is the previous sheet's
   forward turn run in reverse, so one geometry serves both directions and
   both layouts.

   THE INK. A quill holds a line or so of writing: dark fresh from the well,
   thinner toward the end of the dip, dark again after the next. inkRuns says
   how much ink each stretch of a day carries. A stretch begins only at a
   break point, so no word — no Thai word, no grapheme — is written in two
   inks; and the runs are seeded by the DAY, never the page, so a re-cut that
   moves a word to another page leaves it in the same ink.
*/
(function (global) {
  'use strict';

  var TITLE_LINES = Object.freeze(['To myself,', 'For myself,', 'The Finest of FIn']);

  var SPREAD = 'spread', SINGLE = 'single';
  var NEXT = 'next', PREV = 'prev';

  function isMap(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function clamp01(v) { var n = +v; return n > 0 ? (n < 1 ? n : 1) : 0; }

  // ── characters ──────────────────────────────────────────────────────────

  // Whitespace a line may break at: tab to carriage return, the space, and the
  // Unicode spaces that are not no-break spaces. Deliberately NOT \s, which
  // admits U+00A0, U+2007 and U+202F: they exist to hold two words together.
  function breakCode(c) {
    return c === 0x20 || (c >= 0x09 && c <= 0x0d) || c === 0x1680 ||
      (c >= 0x2000 && c <= 0x2006) || (c >= 0x2008 && c <= 0x200a) ||
      c === 0x2028 || c === 0x2029 || c === 0x205f || c === 0x3000;
  }

  function breakSpace(s, i) { return breakCode(s.charCodeAt(i)); }

  function code(s, i) { return s.charCodeAt(i); }

  function isThai(c) { return c >= 0x0e00 && c <= 0x0e7f; }
  // A Thai word begins with a consonant (ก–ฮ) or a leading vowel (เ แ โ ใ ไ)…
  function thaiStarts(c) { return (c >= 0x0e01 && c <= 0x0e2e) || (c >= 0x0e40 && c <= 0x0e44); }
  // …and never ends with a leading vowel, which always comes before its consonant.
  function thaiLeading(c) { return c >= 0x0e40 && c <= 0x0e44; }

  // Marks that belong to the character before them, for when Intl.Segmenter is
  // missing: combining diacritics (Latin, Cyrillic, Hebrew, Arabic), the Thai
  // vowels above and below, SARA AM and the tone marks, joiners, variation
  // selectors and half marks. Code points rather than a class of literal
  // characters: most of these are invisible, or combine with whatever sits
  // before them in an editor.
  var JOINS_BACK = [[0x0300, 0x036f], [0x0483, 0x0489], [0x0591, 0x05bd], [0x0610, 0x061a], [0x064b, 0x065f],
    [0x0e31, 0x0e31], [0x0e33, 0x0e3a], [0x0e47, 0x0e4e], [0x1ab0, 0x1aff], [0x1dc0, 0x1dff],
    [0x200c, 0x200d], [0x20d0, 0x20ff], [0xfe00, 0xfe0f], [0xfe20, 0xfe2f]];

  function joinsBack(s, i) {
    var c = code(s, i);
    if (c >= 0xdc00 && c <= 0xdfff) return true;          // the low half of a surrogate pair
    for (var k = 0; k < JOINS_BACK.length; k++) if (c >= JOINS_BACK[k][0] && c <= JOINS_BACK[k][1]) return true;
    return i > 0 && code(s, i - 1) === 0x200d;             // whatever follows a zero-width joiner
  }

  function hasThai(s) {
    for (var i = 0; i < s.length; i++) if (isThai(code(s, i))) return true;
    return false;
  }

  // The index after the last character that is not breakable whitespace.
  function trimEnd(s) {
    var i = s.length;
    while (i > 0 && breakSpace(s, i - 1)) i--;
    return i;
  }

  // The first index at or after i that is not breakable whitespace.
  function skipSpace(s, i) {
    var n = s.length;
    while (i < n && breakSpace(s, i)) i++;
    return i;
  }

  // An Intl.Segmenter, or null. `opts.intl` stands in for the global Intl, so
  // a test can withhold the segmenter and exercise the fallback.
  function segmenter(opts, granularity) {
    var I = opts && Object.prototype.hasOwnProperty.call(opts, 'intl') ? opts.intl : global.Intl;
    var S = I && I.Segmenter;
    if (typeof S !== 'function') return null;
    try { return new S(granularity === 'word' ? 'th' : undefined, { granularity: granularity }); }
    catch (e) { return null; }
  }

  function eachSegment(seg, s, fn) {
    var it = seg.segment(s)[Symbol.iterator]();
    for (var r = it.next(); !r.done; r = it.next()) fn(r.value);
  }

  // ── where a page may end ────────────────────────────────────────────────

  // Every index a page may END at, ascending, and always the end of the text's
  // last visible character. A page ending at b hands the next one
  // skipSpace(text, b), so the whitespace it broke on starts no page.
  function breakPoints(text, opts) {
    var s = typeof text === 'string' ? text : '';
    var end = trimEnd(s);
    var out = [];
    for (var i = 1; i < end; i++) {
      if (breakSpace(s, i) && !breakSpace(s, i - 1)) out.push(i);
    }
    var words = hasThai(s) ? segmenter(opts, 'word') : null;
    if (words) {
      eachSegment(words, s.slice(0, end), function (seg) {
        var j = seg.index;
        if (j <= 0 || j >= end) return;
        var a = code(s, j - 1), b = code(s, j);
        if (isThai(a) && !thaiLeading(a) && thaiStarts(b)) out.push(j);
      });
    }
    if (end > 0) out.push(end);
    out.sort(function (x, y) { return x - y; });
    return out.filter(function (v, k) { return k === 0 || v !== out[k - 1]; });
  }

  // Every index in (a, b] that ends a grapheme cluster, ascending.
  function clusterEnds(s, a, b, opts) {
    var out = [];
    var g = segmenter(opts, 'grapheme');
    if (g) {
      eachSegment(g, s.slice(a, b), function (seg) { out.push(a + seg.index + seg.segment.length); });
    } else {
      for (var i = a + 1; i <= b; i++) if (i === b || !joinsBack(s, i)) out.push(i);
    }
    return out;
  }

  // The largest k in [lo, hi] for which ok(k), given that ok(lo): probe the
  // seed, gallop upward, then bisect. ok must be monotone, which normal line
  // breaking is — a longer slice never fits where a shorter one did not.
  function widest(lo, hi, seed, ok) {
    var good = lo, bad = hi + 1;
    if (seed > good && seed < bad) { if (ok(seed)) good = seed; else bad = seed; }
    for (var step = 1; good + step < bad; step *= 2) {
      if (ok(good + step)) good += step;
      else { bad = good + step; break; }
    }
    while (bad - good > 1) {
      var mid = (good + bad) >> 1;
      if (ok(mid)) good = mid; else bad = mid;
    }
    return good;
  }

  // The index in an ascending list of the last value <= v, or -1.
  function lastAtMost(list, v) {
    var lo = 0, hi = list.length - 1, at = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (list[mid] <= v) { at = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return at;
  }

  // Cuts `text` into pages. fits(start, end, first) is the caller's
  // measurement — does text.slice(start, end) fit one page, under the day's
  // heading when `first`? Returns [{start, end, first}]: contiguous apart from
  // the whitespace each page broke on, the first starting at the first visible
  // character and the last ending at the last one. Blank text has no pages.
  // `opts.guess` seeds the first probe with a typical page length.
  function cutText(text, fits, opts) {
    var s = typeof text === 'string' ? text : '';
    var end = trimEnd(s);
    var start = skipSpace(s, 0);
    var pages = [];
    if (start >= end || typeof fits !== 'function') return pages;
    var bps = breakPoints(s, opts);
    var guess = opts && opts.guess > 0 ? opts.guess : 0;
    var first = true;
    var lo = 0;
    while (start < end) {
      while (lo < bps.length && bps[lo] <= start) lo++;
      var from = start, head = first, stop;
      var hi = bps.length - 1;
      if (fits(from, bps[lo], head)) {
        var seed = guess ? lastAtMost(bps, from + guess) : -1;
        stop = bps[widest(lo, hi, seed, function (k) { return fits(from, bps[k], head); })];
      } else {
        // One run longer than a page: cut it between clusters, and take at
        // least the first cluster even if that does not fit, so this ends.
        var ends = clusterEnds(s, from, bps[lo], opts);
        stop = fits(from, ends[0], head)
          ? ends[widest(0, ends.length - 1, -1, function (k) { return fits(from, ends[k], head); })]
          : ends[0];
      }
      pages.push({ start: from, end: stop, first: head });
      guess = stop - from;
      first = false;
      start = skipSpace(s, stop);
    }
    return pages;
  }

  // ── the book ────────────────────────────────────────────────────────────

  // Every page of the book in reading order: the title page, then each day's
  // pages — each day cut on its own by cut(day), so each starts a fresh page —
  // or, with nothing to bind, one page saying how to bind a day. A day whose
  // cut comes back empty still gets its heading page: a day is never lost.
  // Folios count the day pages from 1.
  function buildPages(days, cut) {
    var pages = [{ kind: 'title' }];
    var folio = 0;
    (Array.isArray(days) ? days : []).forEach(function (d) {
      if (!isMap(d) || typeof d.day !== 'string' || typeof d.text !== 'string') return;
      var ranges = typeof cut === 'function' ? cut(d) : null;
      if (!Array.isArray(ranges) || !ranges.length) ranges = [{ start: 0, end: 0 }];
      ranges.forEach(function (r, i) {
        folio += 1;
        pages.push({
          kind: 'day', day: d.day, text: d.text.slice(r.start, r.end),
          start: r.start, end: r.end, first: i === 0, part: i, parts: ranges.length, folio: folio
        });
      });
    });
    if (!folio) pages.push({ kind: 'empty' });
    return pages;
  }

  // What each side of the book holds. Two pages at a time opens like a real
  // book: the inside of the front cover on the left, the title page on the
  // right; a spread is two sides, so an odd count ends on a blank page. One
  // page at a time has no cover to show and starts on the title page.
  function sidesFor(pages, mode) {
    var list = Array.isArray(pages) ? pages.slice() : [];
    if (mode !== SPREAD) return list;
    var sides = [{ kind: 'endpaper' }].concat(list);
    if (sides.length % 2) sides.push({ kind: 'blank' });
    return sides;
  }

  function viewCount(sides, mode) {
    var n = Array.isArray(sides) ? sides.length : 0;
    return mode === SPREAD ? Math.ceil(n / 2) : n;
  }

  function sidesOfView(view, mode) { return mode === SPREAD ? [2 * view, 2 * view + 1] : [view]; }

  function viewOfSide(side, mode) { return mode === SPREAD ? Math.floor(side / 2) : side; }

  // Where the reader is, in terms that survive a re-cut: the day and the offset
  // of the first visible character of the view — else the title page, else the
  // page saying there is nothing yet.
  function anchorOfView(sides, view, mode) {
    var idx = sidesOfView(view, mode).map(function (i) { return sides && sides[i]; });
    var day = idx.filter(function (p) { return p && p.kind === 'day'; })[0];
    if (day) return { day: day.day, offset: day.start };
    if (idx.some(function (p) { return p && p.kind === 'empty'; })) return { kind: 'empty' };
    return { kind: 'title' };
  }

  // The view holding an anchor in a freshly cut book: the page of that day
  // holding that offset; for a day no longer bound, the next later day, else
  // the last day page; the title page for the title, or when nothing fits.
  function viewOfAnchor(sides, anchor, mode) {
    var list = Array.isArray(sides) ? sides : [];
    var at = -1, i;
    if (anchor && typeof anchor.day === 'string') {
      var firstOfDay = -1;
      for (i = 0; i < list.length; i++) {
        var p = list[i];
        if (!p || p.kind !== 'day' || p.day !== anchor.day) continue;
        if (firstOfDay < 0) firstOfDay = i;
        if (p.start <= anchor.offset) at = i;
      }
      if (at < 0) at = firstOfDay;
      if (at < 0) {
        for (i = 0; i < list.length; i++) {
          if (list[i] && list[i].kind === 'day' && list[i].day > anchor.day) { at = i; break; }
        }
      }
      if (at < 0) {
        for (i = list.length - 1; i >= 0; i--) if (list[i] && list[i].kind === 'day') { at = i; break; }
      }
    } else if (anchor && anchor.kind === 'empty') {
      for (i = 0; i < list.length; i++) if (list[i] && list[i].kind === 'empty') { at = i; break; }
      if (at < 0) for (i = 0; i < list.length; i++) if (list[i] && list[i].kind === 'day') { at = i; break; }
    }
    if (at < 0) for (i = 0; i < list.length; i++) if (list[i] && list[i].kind === 'title') { at = i; break; }
    return at < 0 ? 0 : viewOfSide(at, mode);
  }

  // ── which layout fits ───────────────────────────────────────────────────

  var RATIO = 0.68;            // a page's width over its height, an octavo journal's
  var MIN_PAGE_W = 300;        // narrower than this and an open book is not readable
  var SINGLE_MAX_RATIO = 0.8;  // a page alone never turns into a wide scroll
  var SINGLE_EDGE = 6;         // a page alone keeps this much desk on every side…
  var SINGLE_SLIVER = 6;       // …and this much leather on its spine side

  // The open book or one page, by FIT, never by asking "is this a phone": two
  // pages side by side when each is at least MIN_PAGE_W wide at the page
  // ratio AND together they show about as much paper as one page would. A
  // landscape tablet opens flat, a portrait one shows one page, and so does a
  // narrow desktop window. vw/vh are the room left inside the safe area.
  function chooseLayout(vw, vh) {
    var w = Math.max(0, +vw || 0), h = Math.max(0, +vh || 0);
    var mh = Math.max(16, Math.round(w * 0.04)), mv = Math.max(56, Math.round(h * 0.06));
    var board = Math.max(8, Math.round(Math.min(w, h) * 0.012));
    var sH = Math.min(h - 2 * (mv + board), (w - 2 * (mh + board)) / 2 / RATIO);
    var sW = Math.floor(sH * RATIO);
    sH = Math.floor(sH);
    var oH = Math.floor(h - 2 * SINGLE_EDGE);
    var oW = Math.floor(Math.min(w - 2 * SINGLE_EDGE - SINGLE_SLIVER, oH * SINGLE_MAX_RATIO));
    var spread = sW >= MIN_PAGE_W && sH > 0 && 2 * sW * sH >= 0.9 * oW * oH;
    if (spread) {
      return { mode: SPREAD, pageW: sW, pageH: sH, board: board,
        left: Math.round((w - 2 * sW) / 2), top: Math.round((h - sH) / 2) };
    }
    return { mode: SINGLE, pageW: Math.max(0, oW), pageH: Math.max(0, oH), board: SINGLE_SLIVER,
      left: Math.round((w - oW + SINGLE_SLIVER) / 2), top: SINGLE_EDGE };
  }

  // The type and margins for a page of that size: the hand scales with the
  // page, as a printed book's does, so a line holds about the same number of
  // words on any screen. The text box is a whole number of lines tall, so no
  // page ever shows half a line. A page alone keeps room at its head for ✕.
  function typeFor(layout) {
    var W = layout.pageW, H = layout.pageH;
    var fs = Math.max(16, Math.min(23, Math.round(W * 0.046)));
    var lh = Math.round(fs * 1.62);
    var single = layout.mode !== SPREAD;
    var top = single ? Math.max(58, Math.round(H * 0.07)) : Math.round(H * 0.085);
    var bottom = single ? Math.max(46, Math.round(H * 0.08)) : Math.max(40, Math.round(H * 0.1));
    var inner = Math.round(W * (single ? 0.085 : 0.115));
    var outer = Math.round(W * (single ? 0.075 : 0.095));
    var lines = Math.max(1, Math.floor((H - top - bottom) / lh));
    return { fs: fs, lh: lh, top: top, bottom: bottom, inner: inner, outer: outer, lines: lines, textH: lines * lh };
  }

  // ── the fold ────────────────────────────────────────────────────────────

  var EPS = 1e-9;

  function corner(W, H, top) { return { x: W, y: top ? 0 : H }; }
  function turnedCorner(W, H, top) { return { x: -W, y: top ? 0 : H }; }
  function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }

  function toDisk(p, c, r) {
    var d = dist(p, c);
    if (d <= r + EPS) return p;
    return { x: c.x + (p.x - c.x) * r / d, y: c.y + (p.y - c.y) * r / d };
  }

  // Where the grabbed corner may be without tearing the sheet from its spine or
  // dipping below the table: on its own side of the page's height, within W of
  // the hinge point on its own edge, within the diagonal of the far one. The
  // two circles meet only at rest and fully turned, which is where a point
  // outside both lands.
  function clampCorner(P, W, H, top) {
    var near = { x: 0, y: top ? 0 : H }, far = { x: 0, y: top ? H : 0 };
    var y = +P.y || 0;
    var p = { x: +P.x || 0, y: top ? Math.max(0, y) : Math.min(H, y) };
    p = toDisk(p, near, W);
    var D = Math.sqrt(W * W + H * H);
    if (dist(p, far) > D + EPS) {
      var q = toDisk(p, far, D);
      p = dist(q, near) <= W + 1e-6 ? q : { x: p.x < 0 ? -W : W, y: near.y };
    }
    return p;
  }

  // How far a sheet has turned, 0 at rest to 1 lying flat on the other side.
  function progressOf(P, W) { return W > 0 ? clamp01((W - P.x) / (2 * W)) : 0; }

  // Affine maps in CSS matrix() order: x' = a x + c y + e, y' = b x + d y + f.
  function apply(m, p) { return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]; }

  function compose(A, B) { // A after B
    return [
      A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
      A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
      A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]
    ];
  }

  // The keep-side of a convex polygon: points where sign * n·(X − M) >= 0.
  function clipHalf(poly, n, M, sign) {
    var out = [];
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length];
      var da = sign * ((a[0] - M.x) * n.x + (a[1] - M.y) * n.y);
      var db = sign * ((b[0] - M.x) * n.x + (b[1] - M.y) * n.y);
      if (da >= 0) out.push(a);
      if ((da >= 0) !== (db >= 0)) {
        var t = da / (da - db);
        out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
    }
    return out;
  }

  function area(poly) {
    var s = 0;
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(s) / 2;
  }

  // The turning sheet, folded. Every polygon is [[x, y], …] in the SHEET's
  // coordinates (hinge at x = 0), so the caller draws everything in one layer
  // placed at the hinge:
  //   keep      the front still lying flat, on the spine side of the crease
  //   folded    the part lifted off, where it USED to lie
  //   flap      that part folded over: where it lies now
  //   reflect   R, the fold itself — the front's ink seen through the paper
  //   back      R∘M, the page printed on the back of the sheet
  //   backClip  the flap in that back page's own coordinates
  //   crease    the crease's two ends on the sheet's edge
  function fold(W, H, top, P) {
    var C = corner(W, H, top);
    var p = clampCorner(P, W, H, top);
    var rect = [[0, 0], [W, 0], [W, H], [0, H]];
    var dx = C.x - p.x, dy = C.y - p.y, len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) {
      return { P: p, C: C, flat: true, progress: 0, keep: rect, folded: [], flap: [], backClip: [],
        reflect: [1, 0, 0, 1, 0, 0], back: [-1, 0, 0, 1, W, 0], n: { x: 1, y: 0 }, M: C, crease: [] };
    }
    var n = { x: dx / len, y: dy / len };
    var M = { x: (C.x + p.x) / 2, y: (C.y + p.y) / 2 };
    var k = 2 * (M.x * n.x + M.y * n.y);
    var R = [1 - 2 * n.x * n.x, -2 * n.x * n.y, -2 * n.x * n.y, 1 - 2 * n.y * n.y, k * n.x, k * n.y];
    var back = compose(R, [-1, 0, 0, 1, W, 0]);
    var folded = clipHalf(rect, n, M, 1);
    var crease = folded.filter(function (v) {
      return Math.abs((v[0] - M.x) * n.x + (v[1] - M.y) * n.y) < 1e-6;
    });
    return {
      P: p, C: C, flat: false, progress: progressOf(p, W), n: n, M: M,
      keep: clipHalf(rect, n, M, -1),
      folded: folded,
      flap: folded.map(function (v) { return apply(R, v); }),
      backClip: folded.map(function (v) { return [W - v[0], v[1]]; }),
      reflect: R, back: back, crease: crease
    };
  }

  var LIFT = 0.1; // how far the corner rises mid-turn, as a share of the page's height

  // The corner's path for a turn nobody drags — a click, a key, a wheel — from
  // rest at e = 0 to fully turned at e = 1. It rises a little on the way, so
  // the sheet curls instead of swinging flat. `e` is already eased.
  function flipPath(e, W, H, top) {
    var t = clamp01(e);
    var lift = LIFT * H * Math.sin(Math.PI * t);
    var y = top ? lift : H - lift;
    return clampCorner({ x: W - 2 * W * t, y: y }, W, H, top);
  }

  // From where the corner was let go to where it is going: fully turned, or
  // back to rest. Straight; `e` is already eased.
  function settlePath(e, from, W, H, top, turned) {
    var to = turned ? turnedCorner(W, H, top) : corner(W, H, top);
    var t = clamp01(e);
    return clampCorner({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }, W, H, top);
  }

  var RISE = 0.6; // a pointer's vertical travel moves the corner this much

  // Where the grabbed corner is while a pointer drags. A forward turn starts at
  // rest, a backward one fully turned, and either way the corner moves with the
  // pointer from where it was pressed (`from`, when a peeled corner is taken
  // up). Alone, the previous sheet lies off the page's edge, a whole width
  // further than a finger can travel, so its sideways movement counts double.
  // Up and down count for less than sideways, so a careless swipe curls the
  // corner rather than folding the whole sheet over on a steep crease.
  function dragPoint(dir, mode, W, H, top, dx, dy, from) {
    var start = from || (dir === NEXT ? corner(W, H, top) : turnedCorner(W, H, top));
    var gain = dir === PREV && mode !== SPREAD ? 2 : 1;
    return clampCorner({ x: start.x + gain * (+dx || 0), y: start.y + RISE * (+dy || 0) }, W, H, top);
  }

  var COMMIT = 0.25; // a let-go sheet past a quarter turn finishes
  var FLICK = 0.35;  // px per ms: a flick decides whatever the distance

  // Whether a sheet let go of finishes its turn: past a quarter of the way, or
  // flicked the way it was going — and a flick back cancels it however far it
  // had come.
  function releaseCompletes(dir, progress, vx) {
    var v = +vx || 0, p = clamp01(progress);
    if (dir === NEXT) return v < -FLICK || (v <= FLICK && p >= COMMIT);
    return v > FLICK || (v >= -FLICK && p <= 1 - COMMIT);
  }

  // What a tap or click at x, across a book w wide, asks for. Open flat, each
  // page turns its own way; alone, the left third goes back.
  function tapIntent(x, w, mode) {
    if (!(w > 0)) return null;
    if (mode === SPREAD) return x < w / 2 ? PREV : NEXT;
    return x < w / 3 ? PREV : NEXT;
  }

  // A CSS linear-gradient across the box {x, y, w, h} (sheet coordinates)
  // along the unit direction d: its angle, the length of its gradient line, and
  // where on that line the point M falls (0..1) — so a caller can put a stop
  // exactly on the crease and the next one a measured distance from it.
  function gradientFrame(box, d, M) {
    var len = Math.abs(box.w * d.x) + Math.abs(box.h * d.y);
    var cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    return {
      angle: Math.atan2(d.x, -d.y) * 180 / Math.PI,
      len: len,
      at: len > 0 ? ((M.x - cx) * d.x + (M.y - cy) * d.y) / len + 0.5 : 0.5
    };
  }

  // ── the ink ─────────────────────────────────────────────────────────────

  var DIP_MIN = 28, DIP_MAX = 72; // visible characters one dip of the quill lasts
  var INK_HELD = 0.3;             // the share of a dip written at full strength
  var INK_FADE = 0.8;             // how much ink the very end of a dip has lost
  var INK_STEP = 0.05;            // inks are whole steps, so a page draws few of them

  // How much ink each stretch of a day's text carries: [{start, end, ink}],
  // contiguous over the whole text, ink in [1 - INK_FADE, 1] in INK_STEPs, 1
  // fresh from the well. Each stretch is a word with the whitespace before it;
  // neighbours in the same ink merge. A dip lasts DIP_MIN–DIP_MAX visible
  // characters from the word it began on, drawn from `key` — the day.
  function inkRuns(text, key, opts) {
    var s = typeof text === 'string' ? text : '';
    var n = s.length;
    if (!n) return [];
    var cuts = breakPoints(s, opts).filter(function (b) { return b > 0 && b < n; });
    var draw = marks(String(key) + '#ink', Math.ceil(n / DIP_MIN) + 2), used = 0;
    function dip() { return DIP_MIN + Math.floor((draw[used++] || 0) * (DIP_MAX - DIP_MIN + 1)); }
    var dipAt = 0, dipLen = dip();
    var out = [], from = 0;
    for (var i = 0; i <= cuts.length; i++) {
      var to = i < cuts.length ? cuts[i] : n;
      var at = skipSpace(s, from);
      var k = (at - dipAt) / dipLen;
      if (k >= 1) { dipAt = at; dipLen = dip(); k = 0; }
      var f = k > INK_HELD ? (k - INK_HELD) / (1 - INK_HELD) : 0;
      var ink = +(Math.round((1 - INK_FADE * Math.pow(f, 1.4)) / INK_STEP) * INK_STEP).toFixed(2);
      var last = out[out.length - 1];
      if (last && last.ink === ink) last.end = to;
      else out.push({ start: from, end: to, ink: ink });
      from = to;
    }
    return out;
  }

  // What one page of a day carries: the runs inside text.slice(start, end),
  // cut to it.
  function inkSlice(runs, start, end) {
    var out = [];
    (Array.isArray(runs) ? runs : []).forEach(function (r) {
      if (!isMap(r)) return;
      var a = Math.max(r.start, start), b = Math.min(r.end, end);
      if (b > a) out.push({ start: a, end: b, ink: r.ink });
    });
    return out;
  }

  // ── a page's own marks ──────────────────────────────────────────────────

  // A small, stable pseudo-random sequence from a key (FNV-1a, then
  // mulberry32), so each page wears its own foxing and keeps it.
  function marks(key, count) {
    var h = 2166136261;
    var s = String(key);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    var out = [];
    for (var j = 0; j < count; j++) {
      h = (h + 0x6d2b79f5) | 0;
      var t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      out.push(((t ^ (t >>> 14)) >>> 0) / 4294967296);
    }
    return out;
  }

  global.TrackJourney = {
    TITLE_LINES: TITLE_LINES,
    SPREAD: SPREAD, SINGLE: SINGLE, NEXT: NEXT, PREV: PREV,
    RATIO: RATIO, MIN_PAGE_W: MIN_PAGE_W, COMMIT: COMMIT, FLICK: FLICK,
    breakPoints: breakPoints,
    clusterEnds: clusterEnds,
    cutText: cutText,
    buildPages: buildPages,
    sidesFor: sidesFor,
    viewCount: viewCount,
    sidesOfView: sidesOfView,
    viewOfSide: viewOfSide,
    anchorOfView: anchorOfView,
    viewOfAnchor: viewOfAnchor,
    chooseLayout: chooseLayout,
    typeFor: typeFor,
    corner: corner,
    turnedCorner: turnedCorner,
    clampCorner: clampCorner,
    progressOf: progressOf,
    fold: fold,
    area: area,
    apply: apply,
    flipPath: flipPath,
    settlePath: settlePath,
    dragPoint: dragPoint,
    releaseCompletes: releaseCompletes,
    tapIntent: tapIntent,
    gradientFrame: gradientFrame,
    DIP_MIN: DIP_MIN, DIP_MAX: DIP_MAX, INK_FADE: INK_FADE, INK_STEP: INK_STEP,
    inkRuns: inkRuns,
    inkSlice: inkSlice,
    marks: marks
  };
})(typeof window !== 'undefined' ? window : globalThis);
