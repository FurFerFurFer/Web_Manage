/* ── journey-book.js ──────────────────────────────────────────────────────
   Journey: the read-only book of every Eternal Journal day, opened full
   screen from the Journal tab (notes-widget.js) — window.TrackJourneyBook.

   A READER. It reads the slot's `dateNotes` through TrackStorage.loadDB and
   writes nothing anywhere: not track_db, not a browser key. It opens on the
   title page every time, so there is no position to remember.

   What it binds and how a day is headed are notes-core.js's
   (TrackNotes.eternalDays, journeyDayLabel). Where a page may end, which side
   of the book a page sits on, which layout fits and how a turning sheet folds
   are journey-core.js's (TrackJourney). This file measures, draws, listens.

   ONE SHEET AT A TIME. Every way of moving — a drag or a swipe, a tap or a
   click, a key, a wheel or trackpad gesture — turns exactly one sheet, and
   turns it visibly. There is no scrolling, no jump, no contents page. A mouse
   resting near a corner peels it a little; that is decided per event, on
   pointerType === 'mouse', because a finger cannot hover.

   FONTS FIRST. Pages are cut by measuring real text, so they are cut only
   once the embedded fonts (journey-fonts.js, loaded on the first open) have
   loaded or timed out — and cut again whenever a page changes size, or the
   fonts arrive late. A re-cut keeps the reader on the same passage: the
   anchor is (day, character offset), never a page number.

   LIVE. Another tab marking or unmarking a day Eternal re-reads the slot and
   rebinds the book, after any turn in progress, at the same passage.

   INK. The writing is drawn into the paper, not laid on it: two SVG filters
   live in the overlay (a CSS filter can name only an element of its own
   document), and styles.css puts them on the lettering and the ruled lines.
   Each day is written in its own rhythm of quill dips (TrackJourney.inkRuns,
   keyed by the day), so a stretch running dry is a span the stylesheet
   lightens — the same words in the same ink whichever page a cut puts them on.
*/
(function () {
  'use strict';

  var J = window.TrackJourney, N = window.TrackNotes;
  if (!J || !N || !window.TrackStorage) {
    if (window.console) console.error('journey-book.js: journey-core.js, notes-core.js or storage-guard.js is missing');
    return;
  }

  // journey-fonts.js is loaded from here, never by a page, so its cache-bust
  // lives here: bump it when tools/build-journey-fonts.js replaces a copy that
  // was already deployed (and this file's own ?v= on the five pages with it).
  var FONTS_V = 2;
  var FONTS_SRC = 'scripts/journey-fonts.js?v=' + FONTS_V;
  var FONT_TIMEOUT = 3500;

  var TURN_MS = 820, TURN_MS_REDUCED = 180;
  var SETTLE_MS = 460, SETTLE_MS_REDUCED = 110;
  var SLOP = 8;                 // px a press may wander and still be a tap
  var TAP_MS = 700;             // longer than this is a press, not a tap
  var PEEL = { x: 46, y: 34 };  // how far a hovered corner lifts
  var PEEL_ZONE = 76;           // px from a corner that a resting mouse peels

  var root = null, st = null;

  function isMap(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function reduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function easeInOut(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
  function easeOut(k) { return 1 - Math.pow(1 - k, 3); }

  // ── fonts ───────────────────────────────────────────────────────────────

  var fonts = null;

  function bytesOf(b64) {
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }

  // Resolves 'embedded' once every face in journey-fonts.js has loaded, or
  // 'fallback' — no faces (the placeholder), no FontFace, an error, or the
  // timeout. Faces that arrive after the timeout still re-cut an open book.
  function loadFonts() {
    if (fonts) return fonts;
    fonts = new Promise(function (resolve) {
      var settled = false;
      var timer = setTimeout(function () { finish('fallback'); }, FONT_TIMEOUT);
      function finish(state) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(state);
      }
      function register() {
        var F = window.TrackJourneyFonts;
        var list = F && Array.isArray(F.faces) ? F.faces : [];
        if (!list.length || typeof window.FontFace !== 'function' || !document.fonts) { finish('fallback'); return; }
        var loads = list.map(function (f) {
          try {
            var face = new FontFace(f.family, bytesOf(f.data),
              { style: 'normal', weight: '400', unicodeRange: f.unicodeRange || 'U+0-10FFFF', display: 'block' });
            document.fonts.add(face);
            return face.load();
          } catch (e) { return Promise.reject(e); }
        });
        Promise.all(loads).then(function () {
          if (settled && st && root) { root.setAttribute('data-jr-fonts', 'embedded'); relayout(true); }
          finish('embedded');
        }, function () { finish('fallback'); });
      }
      if (window.TrackJourneyFonts) { register(); return; }
      var s = document.createElement('script');
      s.src = FONTS_SRC;
      s.onload = register;
      s.onerror = function () { finish('fallback'); };
      document.head.appendChild(s);
    });
    return fonts;
  }

  // ── reading ─────────────────────────────────────────────────────────────

  // The one read. Writes nothing; loadDB is the one boundary every reader uses.
  function readDays() {
    var db = TrackStorage.loadDB();
    var slots = db && Array.isArray(db.slots) ? db.slots : [];
    var slot = slots.filter(function (s) { return isMap(s) && s.id === st.slotId; })[0] || null;
    st.days = N.eternalDays(slot ? slot.dateNotes : null);
    st.sig = JSON.stringify(st.days);
    // The ink depends on the words alone, so a re-cut never recomputes it.
    st.inks = {};
    st.days.forEach(function (d) { st.inks[d.day] = J.inkRuns(d.text, d.day); });
  }

  // ── open and close ──────────────────────────────────────────────────────

  function open(opts) {
    if (root) return false;
    var o = opts || {};
    st = {
      slotId: o.slotId, opener: o.opener || null,
      days: [], sig: '', inks: {}, layout: null, type: null, pages: [], sides: [], view: 0,
      anchor: { kind: 'title' }, turn: null, queued: null, rebuild: false, relayout: false, recut: null,
      press: null, wheel: { acc: 0, lock: false, quiet: 0 }, resizeTimer: 0, els: null
    };
    root = build();
    document.body.appendChild(root);
    document.documentElement.classList.add('nw-journey-open');
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    window.addEventListener('storage', onStorage);
    try { st.els.book.focus({ preventScroll: true }); } catch (e) { st.els.book.focus(); }
    var mine = st;
    loadFonts().then(function (state) {
      if (st !== mine) return; // closed, or closed and opened again, meanwhile
      root.setAttribute('data-jr-fonts', state);
      readDays();
      relayout(true);
    });
    return true;
  }

  function close() {
    if (!root) return false;
    var s = st, r = root;
    if (s.turn && s.turn.raf) cancelAnimationFrame(s.turn.raf);
    clearTimeout(s.resizeTimer);
    clearTimeout(s.wheel.quiet);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('storage', onStorage);
    st = null;
    root = null;
    if (r.parentNode) r.parentNode.removeChild(r);
    document.documentElement.classList.remove('nw-journey-open');
    // The list behind may have redrawn (another tab's edit) and replaced the
    // button: find the same opener again.
    var back = s.opener && s.opener.isConnected ? s.opener : document.querySelector('[data-nw-journey-open]');
    if (back) back.focus();
    return true;
  }

  // The ink, named by styles.css. jr-ink is for the lettering: it sways each
  // stroke a little, as a hand does (sway); lets its edge spread unevenly into
  // the fibre — softened, roughened with noise, cut again (soft, fibre, edge);
  // keeps less ink in the thinnest strokes (mass); pools what is left unevenly
  // (pool); and colours the result with the text's own colours, so a quill
  // dip's lighter ink and the red initial survive (hue). jr-ink-line is the
  // same hand and pooling for the drawn lines — the rules and the title page's
  // frame — which are faint on purpose and would break into dashes under the
  // cut. Sizes are CSS pixels; sRGB, because the default linearRGB washes the
  // ink out.
  var INK_FILTERS = '<svg width="0" height="0" aria-hidden="true" focusable="false">' +
    '<filter id="jr-ink" x="-3%" y="-3%" width="106%" height="106%" color-interpolation-filters="sRGB">' +
    '<feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="1" seed="9" result="sway"/>' +
    '<feDisplacementMap in="SourceGraphic" in2="sway" scale="2" xChannelSelector="R" yChannelSelector="G" result="hand"/>' +
    '<feGaussianBlur in="hand" stdDeviation="0.55" result="soft"/>' +
    '<feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="1" seed="4" result="fibre"/>' +
    '<feComposite in="soft" in2="fibre" operator="arithmetic" k2="1" k3="0.42" k4="-0.21" result="rough"/>' +
    '<feComponentTransfer in="rough" result="edge"><feFuncA type="linear" slope="3.2" intercept="-0.652"/></feComponentTransfer>' +
    '<feGaussianBlur in="hand" stdDeviation="1.2" result="mass"/>' +
    '<feComponentTransfer in="mass" result="weight"><feFuncA type="linear" slope="0.6" intercept="0.55"/></feComponentTransfer>' +
    '<feComposite in="edge" in2="weight" operator="in" result="thin"/>' +
    '<feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="7" result="pool"/>' +
    '<feColorMatrix in="pool" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.8 0.4" result="pooled"/>' +
    '<feComposite in="thin" in2="pooled" operator="in" result="cover"/>' +
    '<feColorMatrix in="soft" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 40 0" result="hue"/>' +
    '<feComposite in="hue" in2="cover" operator="in"/>' +
    '</filter>' +
    '<filter id="jr-ink-line" x="-4%" y="-25%" width="108%" height="150%" color-interpolation-filters="sRGB">' +
    '<feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="1" seed="9" result="sway"/>' +
    '<feDisplacementMap in="SourceGraphic" in2="sway" scale="2" xChannelSelector="R" yChannelSelector="G" result="hand"/>' +
    '<feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="7" result="pool"/>' +
    '<feColorMatrix in="pool" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.8 0.4" result="pooled"/>' +
    '<feComposite in="hand" in2="pooled" operator="in"/>' +
    '</filter></svg>';

  function build() {
    var r = el('div', 'jr');
    r.id = 'nw-journey';
    r.setAttribute('role', 'dialog');
    r.setAttribute('aria-modal', 'true');
    r.setAttribute('aria-label', 'Journey');
    r.setAttribute('data-jr-fonts', 'loading');

    var well = el('div', 'jr-inkwell');
    well.setAttribute('aria-hidden', 'true');
    well.innerHTML = INK_FILTERS;
    r.appendChild(well);

    var book = el('div', 'jr-book');
    book.tabIndex = 0;
    book.setAttribute('role', 'document');
    book.setAttribute('aria-roledescription', 'book');
    book.setAttribute('aria-label', 'Journey — turn the page with the arrow keys, a swipe, a drag or a tap');
    var boards = el('div', 'jr-boards');
    boards.setAttribute('aria-hidden', 'true');
    var stackL = el('div', 'jr-stack jr-stack-left'), stackR = el('div', 'jr-stack jr-stack-right');
    stackL.setAttribute('aria-hidden', 'true');
    stackR.setAttribute('aria-hidden', 'true');
    var slotL = el('div', 'jr-slot jr-slot-left'), slotR = el('div', 'jr-slot jr-slot-right');
    slotL.setAttribute('data-jr-slot', 'left');
    slotR.setAttribute('data-jr-slot', 'right');
    var spine = el('div', 'jr-spine');
    spine.setAttribute('aria-hidden', 'true');
    var flip = el('div', 'jr-flip');
    flip.setAttribute('aria-hidden', 'true');
    var measure = el('div', 'jr-measure');
    measure.setAttribute('aria-hidden', 'true');
    [boards, stackL, stackR, slotL, slotR, spine, flip, measure].forEach(function (n) { book.appendChild(n); });
    r.appendChild(book);

    var x = el('button', 'jr-close', '✕');
    x.type = 'button';
    x.title = 'Close Journey (Esc)';
    x.setAttribute('aria-label', 'Close Journey');
    x.setAttribute('data-jr-close', '');
    x.addEventListener('click', function () { close(); });
    r.appendChild(x);

    var live = el('div', 'jr-live');
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('data-jr-live', '');
    r.appendChild(live);

    // Measures env(safe-area-inset-*), which script cannot read directly.
    var safe = el('div', 'jr-safe');
    safe.setAttribute('aria-hidden', 'true');
    r.appendChild(safe);

    book.addEventListener('pointerdown', onDown);
    book.addEventListener('pointermove', onMove);
    book.addEventListener('pointerup', onUp);
    book.addEventListener('pointercancel', onCancel);
    book.addEventListener('pointerleave', onLeave);
    r.addEventListener('wheel', onWheel, { passive: false });
    r.addEventListener('contextmenu', function (e) { if (book.contains(e.target)) e.preventDefault(); });

    st.els = { book: book, slotL: slotL, slotR: slotR, flip: flip, measure: measure, close: x, live: live, safe: safe };
    return r;
  }

  // ── layout ──────────────────────────────────────────────────────────────

  function px(v) { return Math.round(v) + 'px'; }

  function roomInside() {
    var cs = getComputedStyle(st.els.safe);
    var t = parseFloat(cs.paddingTop) || 0, rt = parseFloat(cs.paddingRight) || 0;
    var b = parseFloat(cs.paddingBottom) || 0, l = parseFloat(cs.paddingLeft) || 0;
    return { x: l, y: t, w: Math.max(0, root.clientWidth - l - rt), h: Math.max(0, root.clientHeight - t - b) };
  }

  var SETTLE_FRAMES = 45; // about ¾ s: how long a re-cut waits for layout to catch up

  // Lays the book out for the room it has. A new size of page re-cuts every
  // day and puts the reader back on the passage they were reading.
  //
  // The cut measures real text, so it waits until the page it measures on is
  // laid out at the size it means. Through a change of screen, layout can lag
  // the styles that set it — Chrome reported the old width for several frames
  // through a desktop-to-phone switch — and a page cut on the old width
  // overflows the new one. So the anchor is taken once, and the cut waits a
  // frame at a time, a bounded number of times, with turning held meanwhile.
  function relayout(force) {
    if (!st || !root) return;
    if (st.turn) { st.relayout = true; return; }
    var room = roomInside();
    var L = J.chooseLayout(room.w, room.h);
    var was = st.layout;
    var resized = !was || L.mode !== was.mode || L.pageW !== was.pageW || L.pageH !== was.pageH;
    if ((resized || force) && st.recut === null) {
      if (was && st.sides.length) st.anchor = J.anchorOfView(st.sides, st.view, was.mode);
      st.recut = 0;
    }
    st.layout = L;
    st.type = J.typeFor(L);
    place(room);
    if (st.recut !== null) {
      if (!laidOut(L) && st.recut < SETTLE_FRAMES) {
        st.recut++;
        requestAnimationFrame(function () { relayout(false); });
        return;
      }
      st.recut = null;
      cut();
      st.view = J.viewOfAnchor(st.sides, st.anchor, L.mode);
    }
    renderView();
    // Ready means the first pages are cut and lying open.
    if (!root.hasAttribute('data-jr-ready')) root.setAttribute('data-jr-ready', '');
  }

  // Whether the measuring page is laid out at the layout's page size yet.
  function laidOut(L) {
    var r = st.els.measure.getBoundingClientRect();
    return Math.abs(r.width - L.pageW) < 1 && Math.abs(r.height - L.pageH) < 1;
  }

  function place(room) {
    var L = st.layout, T = st.type, spread = L.mode === J.SPREAD;
    var s = root.style, b = st.els.book.style;
    root.setAttribute('data-jr-mode', L.mode);
    b.left = px(room.x + L.left);
    b.top = px(room.y + L.top);
    b.width = px(spread ? 2 * L.pageW : L.pageW);
    b.height = px(L.pageH);
    s.setProperty('--jr-pw', px(L.pageW));
    s.setProperty('--jr-ph', px(L.pageH));
    s.setProperty('--jr-board', px(L.board));
    s.setProperty('--jr-fs', px(T.fs));
    s.setProperty('--jr-lh', px(T.lh));
    s.setProperty('--jr-pad-t', px(T.top));
    s.setProperty('--jr-pad-b', px(T.bottom));
    s.setProperty('--jr-pad-in', px(T.inner));
    s.setProperty('--jr-pad-out', px(T.outer));
    s.setProperty('--jr-text-h', px(T.textH));
  }

  // ── cutting ─────────────────────────────────────────────────────────────

  // A hidden page with the very classes a real one has, so what fits here
  // fits there. It sits inside the book, so it inherits every size above.
  function measurer() {
    var host = st.els.measure;
    host.innerHTML = '';
    var page = sideEl({ kind: 'day', day: '', text: '', first: true, part: 0, parts: 1, folio: 1 }, 1, true);
    host.appendChild(page);
    var box = page.querySelector('.jr-text'), date = page.querySelector('.jr-date'), body = page.querySelector('.jr-body');
    return function (d) {
      date.textContent = N.journeyDayLabel(d.day);
      return function (start, end, first) {
        page.classList.toggle('jr-first', !!first);
        body.textContent = d.text.slice(start, end);
        return box.scrollHeight <= box.clientHeight;
      };
    };
  }

  function cut() {
    var fitsFor = measurer();
    var guess = 0;
    st.pages = J.buildPages(st.days, function (d) {
      var ranges = J.cutText(d.text, fitsFor(d), { guess: guess });
      if (ranges.length > 1) guess = ranges[ranges.length - 2].end - ranges[ranges.length - 2].start;
      return ranges;
    });
    st.sides = J.sidesFor(st.pages, st.layout.mode);
    st.els.measure.innerHTML = '';
  }

  // ── drawing a side ──────────────────────────────────────────────────────

  var FLOURISH = '<svg viewBox="0 0 240 24" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
    '<g fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round">' +
    '<path d="M16 12h74M150 12h74"/>' +
    '<path d="M90 12c6-7 14-8 19-3 3 3 1 7-3 6-3-1-3-4 0-5"/>' +
    '<path d="M150 12c-6-7-14-8-19-3-3 3-1 7 3 6 3-1 3-4 0-5"/>' +
    '<path d="M90 12c6 7 14 8 19 3M150 12c-6 7-14 8-19 3"/></g>' +
    '<path d="M120 4.5l5 7.5-5 7.5-5-7.5z" fill="currentColor"/>' +
    '<circle cx="10" cy="12" r="1.7" fill="currentColor"/><circle cx="230" cy="12" r="1.7" fill="currentColor"/></svg>';

  function ornament(cls) {
    var o = el('div', 'jr-orn ' + cls);
    o.setAttribute('aria-hidden', 'true');
    o.innerHTML = FLOURISH;
    return o;
  }

  function pct(v) { return (v * 100).toFixed(1) + '%'; }

  // Foxing and stain positions of a page's own, stable for the same page.
  function wear(p, key) {
    var m = J.marks(key, 10);
    p.style.setProperty('--jr-f1', pct(0.08 + 0.84 * m[0]) + ' ' + pct(0.06 + 0.88 * m[1]));
    p.style.setProperty('--jr-f2', pct(0.08 + 0.84 * m[2]) + ' ' + pct(0.06 + 0.88 * m[3]));
    p.style.setProperty('--jr-f3', pct(0.08 + 0.84 * m[4]) + ' ' + pct(0.06 + 0.88 * m[5]));
    p.style.setProperty('--jr-stain', pct(0.15 + 0.7 * m[6]) + ' ' + pct(0.1 + 0.8 * m[7]));
    p.style.setProperty('--jr-np', Math.round(m[8] * 240) + 'px ' + Math.round(m[9] * 240) + 'px');
  }

  // A day page's words in the ink they were written in: a stretch the quill
  // was running dry on is a span whose --jr-wet the stylesheet mixes toward
  // --jr-ink-dry; the rest is plain text in the full ink. Only the colour
  // changes, so the page lays out exactly as the measuring page, which has
  // no spans, said it would.
  function inkInto(body, side) {
    var runs = st.inks && own(st.inks, side.day) ? st.inks[side.day] : null;
    var pieces = J.inkSlice(runs, side.start, side.end);
    if (!pieces.length) { body.textContent = side.text; return; }
    pieces.forEach(function (r) {
      var t = side.text.slice(r.start - side.start, r.end - side.start);
      if (r.ink >= 1) { body.appendChild(document.createTextNode(t)); return; }
      var dip = el('span', 'jr-dip', t);
      dip.style.setProperty('--jr-wet', Math.round(r.ink * 100) + '%');
      body.appendChild(dip);
    });
  }

  // One side of the book as an element: `index` is its place in st.sides,
  // which decides left or right in an open book.
  function sideEl(side, index, measuring) {
    var spread = st.layout && st.layout.mode === J.SPREAD;
    var kind = side && side.kind ? side.kind : 'blank';
    var p = el('div', 'jr-page ' + (spread && index % 2 === 0 ? 'jr-left' : 'jr-right') + ' jr-kind-' + kind);
    p.setAttribute('data-jr-side', String(index));
    p.setAttribute('data-jr-kind', kind);
    wear(p, kind === 'day' ? side.day + '#' + side.part : kind + '#' + index);

    if (kind === 'day') {
      p.setAttribute('data-jr-day', side.day);
      p.setAttribute('data-jr-part', String(side.part));
      // Where in its day's text this page begins and ends: what a re-cut must
      // keep the reader inside.
      p.setAttribute('data-jr-start', String(side.start));
      p.setAttribute('data-jr-end', String(side.end));
      if (side.first) p.classList.add('jr-first');
      var box = el('div', 'jr-text');
      if (side.first || measuring) {
        var head = el('div', 'jr-head');
        var date = el('h2', 'jr-date', side.day ? N.journeyDayLabel(side.day) : '');
        if (side.day) date.setAttribute('data-jr-date', side.day);
        head.appendChild(date);
        head.appendChild(ornament('jr-rule'));
        box.appendChild(head);
      }
      var body = el('div', 'jr-body');
      body.setAttribute('data-jr-body', '');
      inkInto(body, side);
      box.appendChild(body);
      p.appendChild(box);
      if (!measuring) p.appendChild(el('div', 'jr-folio', String(side.folio)));
    } else if (kind === 'title') {
      var frame = el('div', 'jr-title-page');
      frame.appendChild(ornament('jr-orn-top'));
      var h = el('h1', 'jr-title');
      h.setAttribute('data-jr-title', '');
      J.TITLE_LINES.forEach(function (line, i) {
        if (i) h.appendChild(document.createTextNode(' '));
        h.appendChild(el('span', 'jr-title-line jr-title-line-' + (i + 1), line));
      });
      frame.appendChild(h);
      frame.appendChild(ornament('jr-orn-bottom'));
      p.appendChild(frame);
    } else if (kind === 'empty') {
      var t = el('div', 'jr-text jr-empty');
      t.appendChild(el('p', 'jr-empty-line', 'These pages are still blank.'));
      t.appendChild(el('p', 'jr-empty-line', 'Mark a Journal day ∞ Eternal, and it is written into this book.'));
      p.appendChild(t);
    }
    return p;
  }

  // ── the view at rest ────────────────────────────────────────────────────

  function fill(slot, index) {
    slot.innerHTML = '';
    if (index == null || index < 0) return;
    var side = st.sides[index];
    slot.appendChild(sideEl(side || { kind: 'blank' }, index));
  }

  function renderView() {
    var L = st.layout;
    if (!L) return;
    var idx = J.sidesOfView(st.view, L.mode);
    if (L.mode === J.SPREAD) { fill(st.els.slotL, idx[0]); fill(st.els.slotR, idx[1]); }
    else { st.els.slotL.innerHTML = ''; fill(st.els.slotR, idx[0]); }
    st.els.flip.innerHTML = '';
    var n = st.sides.length, last = idx[idx.length - 1];
    root.style.setProperty('--jr-stack-l', Math.min(12, idx[0] * 0.5).toFixed(1) + 'px');
    root.style.setProperty('--jr-stack-r', Math.min(12, Math.max(0, n - 1 - last) * 0.5).toFixed(1) + 'px');
    root.setAttribute('data-jr-view', String(st.view));
    root.setAttribute('data-jr-views', String(J.viewCount(st.sides, L.mode)));
    announce(idx);
  }

  function announce(idx) {
    var shown = idx.map(function (i) { return st.sides[i]; }).filter(Boolean);
    var day = shown.filter(function (p) { return p.kind === 'day'; })[0];
    var folios = st.pages.filter(function (p) { return p.kind === 'day'; }).length;
    st.els.live.textContent = shown.some(function (p) { return p.kind === 'title'; }) ? 'Title page: ' + J.TITLE_LINES.join(' ')
      : day ? N.journeyDayLabel(day.day) + ' — page ' + day.folio + ' of ' + folios
      : shown.some(function (p) { return p.kind === 'empty'; }) ? 'No Eternal days are bound yet'
      : 'A blank page';
  }

  // ── turning ─────────────────────────────────────────────────────────────

  function canTurn(dir) {
    if (!st.layout || st.recut !== null) return false; // never on a book half re-cut
    var n = J.viewCount(st.sides, st.layout.mode);
    return dir === J.NEXT ? st.view < n - 1 : st.view > 0;
  }

  // Sets up one sheet's turn: what lies under it, its front and its back.
  // Open flat, the sheet is a real leaf — its back is the next page. Alone,
  // its back is its own ink seen through the paper (a ghost).
  function beginTurn(dir, top) {
    var L = st.layout, v = st.view, spread = L.mode === J.SPREAD;
    var front, back, ghost = !spread;
    if (spread) {
      if (dir === J.NEXT) { fill(st.els.slotL, 2 * v); fill(st.els.slotR, 2 * v + 3); front = 2 * v + 1; back = 2 * v + 2; }
      else { fill(st.els.slotL, 2 * v - 2); fill(st.els.slotR, 2 * v + 1); front = 2 * v - 1; back = 2 * v; }
    } else {
      front = dir === J.NEXT ? v : v - 1;
      back = front;
      fill(st.els.slotR, dir === J.NEXT ? v + 1 : v);
    }
    var layer = st.els.flip;
    layer.innerHTML = '';
    var under = el('div', 'jr-shade jr-shade-under');
    var frontEl = sideEl(st.sides[front] || { kind: 'blank' }, front);
    frontEl.classList.add('jr-leaf');
    var onFront = el('div', 'jr-shade jr-shade-front');
    var wrap = el('div', 'jr-flapwrap');
    var backEl = sideEl(st.sides[back] || { kind: 'blank' }, back);
    backEl.classList.add('jr-leaf', ghost ? 'jr-ghost' : 'jr-back');
    var onFlap = el('div', 'jr-shade jr-shade-flap');
    wrap.appendChild(backEl);
    wrap.appendChild(onFlap);
    [under, frontEl, onFront, wrap].forEach(function (n) { layer.appendChild(n); });
    st.turn = { dir: dir, top: !!top, ghost: ghost, front: frontEl, back: backEl, under: under, onFront: onFront,
      onFlap: onFlap, P: dir === J.NEXT ? J.corner(L.pageW, L.pageH, top) : J.turnedCorner(L.pageW, L.pageH, top),
      raf: 0, dragging: false, peel: false, from: null };
    root.setAttribute('data-jr-flipping', dir);
    drawFold(st.turn.P);
  }

  function poly(pts, ox, oy) {
    if (!pts || pts.length < 3) return 'polygon(0 0, 0 0, 0 0)';
    return 'polygon(' + pts.map(function (p) {
      return (p[0] + ox).toFixed(2) + 'px ' + (p[1] + oy).toFixed(2) + 'px';
    }).join(', ') + ')';
  }

  function matrix(m) { return 'matrix(' + m.map(function (v) { return +v.toFixed(6); }).join(', ') + ')'; }

  function gradient(g, stops) {
    return 'linear-gradient(' + g.angle.toFixed(2) + 'deg, ' + stops.map(function (s) {
      return s[1] + ' ' + ((g.at + s[0] / g.len) * 100).toFixed(3) + '%';
    }).join(', ') + ')';
  }

  function drawFold(P) {
    var t = st.turn, W = st.layout.pageW, H = st.layout.pageH;
    var f = J.fold(W, H, t.top, P);
    t.P = f.P;
    t.front.style.clipPath = poly(f.keep, 0, 0);
    if (t.ghost) { t.back.style.transform = matrix(f.reflect); t.back.style.clipPath = poly(f.folded, 0, 0); }
    else { t.back.style.transform = matrix(f.back); t.back.style.clipPath = poly(f.backClip, 0, 0); }
    if (f.flat) {
      t.under.style.background = t.onFront.style.background = t.onFlap.style.background = 'none';
      return;
    }
    // Light: shadow on the page uncovered under the lifted sheet, deepest at
    // the crease; the flap's own shadow on the front; and on the flap, the
    // shading of paper bending over — dark at the crease, a lit ridge, then
    // easing off toward its edge. Strongest mid-turn.
    var depth = Math.min(1, 0.3 + Math.sin(Math.PI * f.progress));
    var box = { x: -W, y: -H, w: 2 * W, h: 3 * H };
    var toC = f.n, toP = { x: -f.n.x, y: -f.n.y };
    var gC = J.gradientFrame(box, toC, f.M), gP = J.gradientFrame(box, toP, f.M);
    t.under.style.clipPath = poly(f.folded, W, H);
    t.under.style.background = gradient(gC, [[0, 'rgba(26, 13, 2, ' + (0.46 * depth).toFixed(3) + ')'],
      [0.07 * W, 'rgba(26, 13, 2, ' + (0.2 * depth).toFixed(3) + ')'], [0.34 * W, 'rgba(26, 13, 2, 0)']]);
    t.onFront.style.clipPath = poly(f.keep, W, H);
    t.onFront.style.background = gradient(gP, [[0, 'rgba(26, 13, 2, ' + (0.28 * depth).toFixed(3) + ')'],
      [0.12 * W, 'rgba(26, 13, 2, 0)']]);
    t.onFlap.style.clipPath = poly(f.flap, W, H);
    t.onFlap.style.background = gradient(gP, [[0, 'rgba(40, 20, 4, ' + (0.38 * depth).toFixed(3) + ')'],
      [0.05 * W, 'rgba(255, 246, 222, ' + (0.16 * depth).toFixed(3) + ')'], [0.2 * W, 'rgba(255, 246, 222, 0)'],
      [0.75 * W, 'rgba(40, 20, 4, ' + (0.12 * depth).toFixed(3) + ')']]);
  }

  function run(ms, at, done) {
    var t = st.turn, t0 = 0;
    if (t.raf) cancelAnimationFrame(t.raf);
    function frame(now) {
      if (!st || st.turn !== t) return;
      if (!t0) t0 = now;
      var k = ms > 0 ? Math.min(1, (now - t0) / ms) : 1;
      drawFold(at(k));
      if (k < 1) t.raf = requestAnimationFrame(frame);
      else { t.raf = 0; done(); }
    }
    t.raf = requestAnimationFrame(frame);
  }

  // One whole turn nobody is dragging: a tap, a key, a wheel.
  function turn(dir) {
    if (!st || !st.layout) return;
    if (st.turn && st.turn.peel && st.turn.dir === dir && !st.turn.dragging) { settle(true); return; }
    if (st.turn && st.turn.peel && !st.turn.dragging) finishTurn(false);
    if (st.turn) { if (!st.turn.dragging) st.queued = dir; return; }
    if (!canTurn(dir)) return;
    beginTurn(dir, false);
    var W = st.layout.pageW, H = st.layout.pageH;
    run(reduced() ? TURN_MS_REDUCED : TURN_MS, function (k) {
      var e = easeInOut(k);
      return J.flipPath(dir === J.NEXT ? e : 1 - e, W, H, false);
    }, function () { finishTurn(true); });
  }

  // Lets the sheet go: to fully turned or back to rest, from wherever it is.
  function settle(complete) {
    var t = st.turn, W = st.layout.pageW, H = st.layout.pageH;
    t.dragging = false;
    t.peel = false;
    root.setAttribute('data-jr-flipping', t.dir);
    root.removeAttribute('data-jr-peel');
    var turned = t.dir === J.NEXT ? complete : !complete;
    var from = { x: t.P.x, y: t.P.y };
    var left = turned ? (from.x + W) / (2 * W) : (W - from.x) / (2 * W);
    var ms = (reduced() ? SETTLE_MS_REDUCED : SETTLE_MS) * Math.max(0.25, Math.min(1, left));
    run(ms, function (k) { return J.settlePath(easeOut(k), from, W, H, t.top, turned); },
      function () { finishTurn(complete); });
  }

  function finishTurn(completed) {
    var t = st.turn;
    if (!t) return;
    if (t.raf) cancelAnimationFrame(t.raf);
    st.turn = null;
    root.removeAttribute('data-jr-flipping');
    root.removeAttribute('data-jr-peel');
    if (completed) st.view += t.dir === J.NEXT ? 1 : -1;
    if (st.rebuild) { st.rebuild = false; rebuild(); }
    else if (st.relayout) { st.relayout = false; relayout(false); }
    else renderView();
    var q = st.queued;
    st.queued = null;
    if (q && !t.peel) turn(q);
  }

  // Another tab changed which days are Eternal: cut again, same passage.
  function rebuild() {
    st.anchor = J.anchorOfView(st.sides, st.view, st.layout.mode);
    cut();
    st.view = J.viewOfAnchor(st.sides, st.anchor, st.layout.mode);
    renderView();
  }

  // ── a mouse resting near a corner peels it ──────────────────────────────

  function local(e) {
    var r = st.els.book.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
  }

  function peelWanted(e) {
    var p = local(e), L = st.layout;
    var top = p.y < PEEL_ZONE, bottom = p.y > L.pageH - PEEL_ZONE;
    if (!top && !bottom) return null;
    if (p.x > p.w - PEEL_ZONE && p.x <= p.w && canTurn(J.NEXT)) return { dir: J.NEXT, top: top };
    if (L.mode === J.SPREAD && p.x < PEEL_ZONE && p.x >= 0 && canTurn(J.PREV)) return { dir: J.PREV, top: top };
    return null;
  }

  function hover(e) {
    if (st.turn && !st.turn.peel) return;
    var want = peelWanted(e), cur = st.turn;
    if (cur && want && cur.dir === want.dir && cur.top === want.top) return;
    if (cur) finishTurn(false);
    if (!want) return;
    beginTurn(want.dir, want.top);
    var t = st.turn, W = st.layout.pageW, H = st.layout.pageH;
    t.peel = true;
    root.removeAttribute('data-jr-flipping');
    root.setAttribute('data-jr-peel', want.dir);
    var rest = want.dir === J.NEXT ? J.corner(W, H, want.top) : J.turnedCorner(W, H, want.top);
    var to = { x: rest.x + (want.dir === J.NEXT ? -PEEL.x : PEEL.x), y: rest.y + (want.top ? PEEL.y : -PEEL.y) };
    run(170, function (k) {
      var q = easeOut(k);
      return { x: rest.x + (to.x - rest.x) * q, y: rest.y + (to.y - rest.y) * q };
    }, function () {});
  }

  // ── pointers ────────────────────────────────────────────────────────────

  function velocity(pr) {
    var s = pr.samples, a = s[0], b = s[s.length - 1];
    return b && a && b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0;
  }

  function onDown(e) {
    if (!st || !st.layout || (e.button !== undefined && e.button > 0)) return;
    if (st.turn && !st.turn.peel) return; // a turn already under way finishes first
    e.preventDefault();
    var p = local(e);
    st.press = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, lx: p.x, ly: p.y, w: p.w,
      moved: false, drag: false, blocked: false, samples: [{ x: e.clientX, t: e.timeStamp }] };
    try { st.els.book.setPointerCapture(e.pointerId); } catch (err) { /* already gone */ }
  }

  function onMove(e) {
    if (!st || !st.layout) return;
    var pr = st.press;
    if (!pr || pr.id !== e.pointerId) {
      if (e.pointerType === 'mouse' && !e.buttons) hover(e);
      return;
    }
    var dx = e.clientX - pr.x0, dy = e.clientY - pr.y0;
    pr.samples.push({ x: e.clientX, t: e.timeStamp });
    while (pr.samples.length > 2 && e.timeStamp - pr.samples[0].t > 100) pr.samples.shift();
    if (!pr.drag) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      pr.moved = true;
      if (pr.blocked) return;
      var peeled = st.turn && st.turn.peel ? st.turn : null;
      if (!peeled && Math.abs(dx) < Math.abs(dy) * 0.6) return; // mostly up or down: not a turn
      var L = st.layout;
      var dir = peeled ? peeled.dir
        : L.mode === J.SPREAD ? (pr.lx < L.pageW ? J.PREV : J.NEXT) : (dx < 0 ? J.NEXT : J.PREV);
      if (!peeled && !canTurn(dir)) { pr.blocked = true; return; }
      if (peeled) {
        if (peeled.raf) cancelAnimationFrame(peeled.raf);
        peeled.raf = 0;
        peeled.peel = false;
        peeled.from = { x: peeled.P.x, y: peeled.P.y };
        root.removeAttribute('data-jr-peel');
        root.setAttribute('data-jr-flipping', dir);
      } else {
        beginTurn(dir, pr.ly < L.pageH / 2);
      }
      st.turn.dragging = true;
      pr.drag = true;
    }
    var t = st.turn;
    if (!t || !t.dragging) return;
    drawFold(J.dragPoint(t.dir, st.layout.mode, st.layout.pageW, st.layout.pageH, t.top, dx, dy, t.from));
  }

  function onUp(e) {
    var pr = st && st.press;
    if (!pr || pr.id !== e.pointerId) return;
    st.press = null;
    try { st.els.book.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
    var t = st.turn;
    if (pr.drag && t && t.dragging) {
      settle(J.releaseCompletes(t.dir, J.progressOf(t.P, st.layout.pageW), velocity(pr)));
      return;
    }
    if (pr.moved || pr.blocked || e.timeStamp - pr.t0 > TAP_MS) return;
    var dir = t && t.peel ? t.dir : J.tapIntent(pr.lx, pr.w, st.layout.mode);
    if (dir) turn(dir);
  }

  function onCancel(e) {
    var pr = st && st.press;
    if (!pr || pr.id !== e.pointerId) return;
    st.press = null;
    if (st.turn && st.turn.dragging) settle(false);
  }

  function onLeave(e) {
    if (!st || st.press || e.pointerType !== 'mouse') return;
    if (st.turn && st.turn.peel) finishTurn(false);
  }

  // ── wheel, keys, storage, resize ────────────────────────────────────────

  // One gesture, one turn: the wheel is locked after a turn until it has been
  // quiet for a moment, so a trackpad's long tail of events cannot turn twice.
  function onWheel(e) {
    e.preventDefault();
    if (!st || !st.layout) return;
    var w = st.wheel;
    clearTimeout(w.quiet);
    w.quiet = setTimeout(function () { w.acc = 0; w.lock = false; }, 260);
    if (w.lock) return;
    var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (e.deltaMode === 1) d *= 16; else if (e.deltaMode === 2) d *= 400;
    w.acc += d;
    if (Math.abs(w.acc) >= 40) { w.lock = true; turn(w.acc > 0 ? J.NEXT : J.PREV); }
  }

  var NEXT_KEYS = { ArrowRight: 1, ArrowDown: 1, PageDown: 1 };
  var PREV_KEYS = { ArrowLeft: 1, ArrowUp: 1, PageUp: 1 };

  // On the window, in the capture phase: while the book is open no page or
  // widget shortcut beneath it hears a key the book uses.
  function onKey(e) {
    if (!root || !st) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      (document.activeElement === st.els.close ? st.els.book : st.els.close).focus();
      return;
    }
    var dir = own(NEXT_KEYS, e.key) ? J.NEXT : own(PREV_KEYS, e.key) ? J.PREV
      : e.key === ' ' ? (e.shiftKey ? J.PREV : J.NEXT) : null;
    if (!dir) return;
    if ((e.key === ' ' || e.key === 'Enter') && document.activeElement === st.els.close) return;
    e.preventDefault();
    e.stopPropagation();
    turn(dir);
  }

  function onStorage(e) {
    if (!st || !st.layout || (e.key !== null && e.key !== 'track_db')) return;
    var before = st.sig;
    readDays();
    if (st.sig === before) return;
    if (st.recut !== null) return; // the re-cut under way will bind the new days
    if (st.turn && !st.turn.peel) { st.rebuild = true; return; }
    if (st.turn) finishTurn(false);
    rebuild();
  }

  function onResize() {
    if (!st) return;
    clearTimeout(st.resizeTimer);
    st.resizeTimer = setTimeout(function () { relayout(false); }, 120);
  }

  window.TrackJourneyBook = {
    open: open,
    close: close,
    isOpen: function () { return !!root; }
  };
})();
