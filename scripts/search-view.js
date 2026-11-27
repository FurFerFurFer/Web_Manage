/* ── search-view.js ────────────────────────────────────────────────────────
   window.TrackSearchView: Universal Search's panel (the user's 2026-11-26
   request). Loaded by scripts/search.js on the first open, never with the
   page. WHAT is listed and found is search-core.js (window.TrackSearch); this
   file only draws it and answers the keys.

   The way it is used, in the user's words: "search and click to go in that
   directory and search again and click again as many times as possible until
   I hit the button". So:

   - It is a FOLDER BROWSER with a search bar on top. The box searches INSIDE
     the folder you are in — everything, at the top — and an empty box lists
     the folder, like the iPad's Files. The top is the five pages, and each
     page holds its own tabs, listed in the site's order ("look real", the
     user's follow-up the same day). A SUB-TAB is a heading inside its tab's
     list, with its own Go →, never a folder to click into ("if it's just sub
     tab I don't want to click just to show it").
   - A click on a page, a tab or a folder search made goes INTO it: the
     crumbs grow, the box empties and keeps the focus, ready for the next
     search. A click on anything the user made — a mind map, a goal, a page, a
     dump — only SELECTS it: its details show beside the list with everything
     inside it opened out to the last leaf, and a click on a name in that
     tree moves the SEARCH there, never the page. While a query is typed, a
     hit with something inside still goes into it, as search always did.
     NOTHING moves you to another page except a "Go →" — on every row that
     has a page, on the folder you are in (so a bigger parent can be
     chosen), on a sub-tab heading, and in the details.
   - Hits come parents first (search-core.js `find`).

   Rules, the first three load-bearing (Note to self's, docs/contracts/search.md):

   - A READER. It reads through TrackStorage.loadDB and writes nothing — not
     track_db, not a key of its own, not the last search or folder.
   - A CLOSED panel keeps NO DOM: #tsr exists only while open.
   - A link to the page it is on still goes there: the pages read their
     `?…` and `#view` once, at mount, so a same-path, same-search Go sets the
     address and reloads.
   - A folder already on the crumbs is drawn once, marked ↻, and is not
     entered again — the per-path cycle guard, as SRCH → DIRECTORY's — in a
     list or in search results alike; and entering a hit whose path runs
     through a crumb climbs back to that crumb, so none appears twice.
   - Escape listens on `window` and skips an event already handled.
   - At most PAGE rows are drawn at a time; "Show more" draws the next.
*/
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  var PAGE = 150;
  var PHONE = '(max-width: 720px)';

  var KIND = {
    page: ['▦', 'Page'], tab: ['▭', 'Tab'], subtab: ['▫', 'Sub-tab'], section: ['▤', 'Section'],
    widget: ['✎', 'Notes widget'], folder: ['▤', 'Folder'], mm: ['◉', 'Mind map'], kolb: ['✎', 'Kolb'],
    mg: ['▲', 'MG change'], dump: ['❏', 'Source dump'], block: ['¶', 'Text block'], goal: ['◎', 'Goal'],
    task: ['☐', 'Task'], milestone: ['⚑', 'Milestone'], doc: ['▭', 'Documentation page'],
    daynote: ['◷', 'Day note'], deadline: ['⏰', 'Deadline'], 'class': ['◫', 'Timetable class'],
    action: ['■', 'Supporting action'], note: ['✎', 'Sorted note'], journal: ['❡', 'Journal day'],
    storage: ['▣', 'Storage'], file: ['▯', 'File'], filefolder: ['▤', 'Folder']
  };

  /* The site's own frame: the pages, their tabs and sub-tabs, Home's
     sections, the notes widget, and the folders search makes ("Day notes",
     "March 2026"). A click on one with something inside goes INTO it.
     Everything else is what the user made — a mind map, a goal, a dump, a
     FILES folder — and from the first one down (the user, 2026-11-26: "for MM
     specially when I click it shows the children on the right side completely
     expanded to the last leaf … then clicking on that will navigate THE
     SEARCH", "this also applies to … GOALS subgoals or even MG from MM") a
     click only shows it, with its whole tree opened out beside the list. */
  var FRAME = { page: 1, tab: 1, subtab: 1, section: 1, widget: 1, folder: 1 };
  var TREE_MAX = 400;     // rows in one opened-out tree; past it, "… and more"
  function isFrame(n) { return !!(n && FRAME[n.kind]); }

  var S = null;           // TrackSearch
  var ix = null;          // the index, rebuilt on open and on a storage change
  var root = null, els = {};
  var opener = null;
  var st = null;          // { path: [key], q, hi, rows: [node], limit, detail, slotName }
  var timer = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // TrackViewport's answer where the page loads it (four pages do); Home has no
  // copy, and the same 720px query stands in — the layout breakpoint itself.
  function isPhone() {
    try {
      if (window.TrackViewport && typeof window.TrackViewport.isPhone === 'function') return window.TrackViewport.isPhone();
      return window.matchMedia(PHONE).matches;
    } catch (e) { return false; }
  }
  function kindOf(n) { return KIND[n.kind] || ['•', n.kind]; }
  function here() { return st.path.length ? st.path[st.path.length - 1] : null; }

  function slotOf(db) {
    var slots = db && Array.isArray(db.slots) ? db.slots : [];
    return slots.filter(function (s) { return s && s.id === db.activeSlotId; })[0] || slots[0] || null;
  }

  function buildIndex() {
    var db = window.TrackStorage ? window.TrackStorage.loadDB() : {};
    var slot = slotOf(db);
    st.slotName = slot && typeof slot.name === 'string' ? slot.name : '';
    ix = S.build(slot || {}, {
      tree: window.TrackMMTree, files: window.TrackFiles, dumps: window.TrackSourceDump, project: window.TrackProject,
      kolb: window.TrackKolb, notes: window.TrackNotes,
      kindLabel: window.TrackNoteToSelf ? window.TrackNoteToSelf.mmKindLabel : null
    });
  }

  // ── going to a page ──
  function go(href) {
    var u;
    try { u = new URL(href, location.href); } catch (e) { return; }
    var samePage = u.pathname === location.pathname && u.search === location.search;
    close(true);
    location.href = u.href;
    if (samePage) location.reload();
  }

  // ── drawing ──
  function rowsNow() {
    var key = here();
    if (st.q.trim()) return S.find(ix, st.q, key);
    // In the site's own order — the pages, then each page's tabs as its bar
    // shows them — never re-sorted, so the directory looks like the site.
    return S.children(ix, key);
  }

  // The folders from `scope` down to `key`, as titles, with the sub-tab
  // heading an entry is listed under put back where the page shows it.
  function trailOf(key, scope) {
    var keys = (scope != null ? [scope] : []).concat(S.pathOf(ix, key, scope).map(function (p) { return p.key; }), [key]);
    var out = [];
    for (var i = 1; i < keys.length; i++) {
      var sec = S.sectionOf(ix, keys[i - 1], keys[i]);
      if (sec) out.push({ key: null, title: sec.title });
      if (i < keys.length - 1) out.push({ key: keys[i], title: S.node(ix, keys[i]).title });
    }
    if (scope == null && keys.length > 1) out.unshift({ key: keys[0], title: S.node(ix, keys[0]).title });
    return out;
  }
  function isHead(n) { return !!n && n.kind === 'subtab' && !st.q.trim(); }

  function goHtml(n, cls) {
    if (!n || !n.href) return '';
    return '<a class="' + cls + '" href="' + esc(n.href) + '" data-tsr-go="' + esc(n.key) + '">Go&nbsp;→</a>';
  }

  function crumbsHtml() {
    var out = '<button type="button" class="tsr-crumb" data-tsr-crumb="0">All</button>';
    st.path.forEach(function (k, i) {
      var n = S.node(ix, k);
      out += '<span class="tsr-sep" aria-hidden="true">›</span>' +
        '<button type="button" class="tsr-crumb" data-tsr-crumb="' + (i + 1) + '"' +
        (i === st.path.length - 1 ? ' aria-current="location"' : '') + '>' + esc(n ? n.title : '?') + '</button>';
    });
    return out;
  }

  function hereHtml() {
    var n = S.node(ix, here());
    if (!n) {
      return '<span class="tsr-here-title">Everything' + (st.slotName ? ' in ' + esc(st.slotName) : '') + '</span>' +
        '<span class="tsr-here-meta">Type to search, or open a folder</span>';
    }
    var k = kindOf(n);
    return '<span class="tsr-ico" aria-hidden="true">' + k[0] + '</span>' +
      '<span class="tsr-here-text"><span class="tsr-here-title">' + esc(n.title) + '</span>' +
      '<span class="tsr-here-meta">' + esc(k[1]) + (n.meta ? ' · ' + esc(n.meta) : '') + '</span></span>' +
      goHtml(n, 'tsr-go tsr-go-here');
  }

  // Whether a click on this row goes INTO it: a frame folder always; a
  // search hit with something inside, as search always did ("the search
  // still works normally"); never a crumb a loop brought back.
  function opensOnClick(n) {
    if (!n || S.count(ix, n.key) === 0 || st.path.indexOf(n.key) >= 0) return false;
    return isFrame(n) || !!st.q.trim();
  }

  function rowHtml(n, i) {
    var k = kindOf(n);
    var kids = S.count(ix, n.key);
    var searching = !!st.q.trim();
    // Already on the crumbs: only a loop can bring a crumb back inside the
    // folder you are in — browsing into it, or a search finding it there.
    var loop = st.path.indexOf(n.key) >= 0;
    var folder = opensOnClick(n);
    if (isHead(n)) return headHtml(n);
    var path = searching ? trailOf(n.key, here()).map(function (p) { return p.title; }) : [];
    var snip = searching ? S.snippet(ix, n, st.q) : null;
    return '<div class="tsr-row' + (i === st.hi ? ' is-hi' : '') + '" data-tsr-row="' + esc(n.key) + '" data-tsr-i="' + i + '"' +
      (loop ? ' data-tsr-loop=""' : '') + ' role="listitem">' +
      '<button type="button" class="tsr-pick" data-tsr-pick="' + i + '"' +
      (folder ? ' data-tsr-folder=""' : '') + '>' +
      '<span class="tsr-ico" aria-hidden="true">' + (loop ? '↻' : k[0]) + '</span>' +
      '<span class="tsr-text">' +
      (path.length ? '<span class="tsr-path">' + esc(path.join(' › ')) + '</span>' : '') +
      '<span class="tsr-title">' + esc(n.title) + '</span>' +
      '<span class="tsr-meta">' + esc(n.meta || k[1]) + (n.size ? ' · ' + n.size + ' inside' : '') +
      (loop ? ' · already on this path' : '') + '</span>' +
      (snip ? '<span class="tsr-snip"><b>' + esc(snip.label) + ':</b> ' + esc(snip.text) + '</span>' : '') +
      '</span>' +
      (folder ? '<span class="tsr-chev" aria-hidden="true">›</span>' : '') +
      '</button>' + goHtml(n, 'tsr-go') + '</div>';
  }

  // A sub-tab, as its tab's list shows it: a heading over what it shows,
  // with its own Go →. Not a row: no click goes into it, and ↑ ↓ pass it.
  function headHtml(n) {
    var note = n.hint || n.meta;
    return '<div class="tsr-sub" data-tsr-sub="' + esc(n.key) + '" role="listitem">' +
      '<span class="tsr-sub-text"><span class="tsr-sub-title">' + esc(n.title) + '</span>' +
      (note ? '<span class="tsr-sub-meta">' + esc(note) + '</span>' : '') + '</span>' +
      goHtml(n, 'tsr-go') + '</div>';
  }

  function detailHtml() {
    var n = st.hi >= 0 && st.rows[st.hi] ? st.rows[st.hi] : S.node(ix, here());
    if (!n) {
      return '<p class="tsr-help">The five pages, each with its own tabs and sub-tabs, and everything in this ' +
        'workspace filed under the tab it is shown on. Search finds it all. <b>Bigger parents come first.</b></p>' +
        '<p class="tsr-help">Click a page, tab or folder to go into it. Click a mind map, a goal or anything else you made ' +
        'to see it here with everything inside it opened out to the last leaf; click a name in that tree to go there ' +
        'in search, and search again inside it. Only <b>Go →</b> takes you to a page.</p>' +
        '<p class="tsr-help tsr-keys"><kbd>Ctrl</kbd> <kbd>K</kbd> or <kbd>/</kbd> opens · <kbd>↑</kbd> <kbd>↓</kbd> choose · ' +
        '<kbd>Enter</kbd> open folder / show · <kbd>Ctrl</kbd> <kbd>Enter</kbd> Go · <kbd>⌫</kbd> up a folder · <kbd>Esc</kbd> close</p>';
    }
    var k = kindOf(n);
    var path = trailOf(n.key, null);
    var kids = S.count(ix, n.key);
    var isHere = n.key === here();
    var html = '<div class="tsr-d-kind">' + k[0] + ' ' + esc(k[1]) + '</div>' +
      '<h3 class="tsr-d-title">' + esc(n.title) + '</h3>';
    if (path.length) {
      html += '<div class="tsr-d-path">' + path.map(function (p) {
        return p.key ? '<button type="button" class="tsr-d-crumb" data-tsr-jump="' + esc(p.key) + '">' + esc(p.title) + '</button>'
          : '<span class="tsr-d-sec">' + esc(p.title) + '</span>';
      }).join('<span aria-hidden="true"> › </span>') + '</div>';
    }
    // A meta that is only a field's first line (a Kolb's experience) is not said twice.
    var metaStem = n.meta.replace(/…$/, '');
    var repeated = n.fields.some(function (f) { return String(f.text).trim().indexOf(metaStem) === 0; });
    if (n.meta && !repeated) html += '<div class="tsr-d-meta">' + esc(n.meta) + '</div>';
    if (n.hint) html += '<p class="tsr-d-hint">' + esc(n.hint) + '</p>';
    html += '<div class="tsr-d-actions">';
    if (kids && !isHere && isFrame(n)) {
      html += '<button type="button" class="tsr-d-open" data-tsr-jump="' + esc(n.key) + '">Open · ' + (n.size || kids) + ' inside</button>';
    }
    if (n.href) html += goHtml(n, 'tsr-go tsr-go-big');
    else html += '<p class="tsr-d-nowhere">' + (n.area === 'notes'
      ? 'This lives in the notes widget (✎, bottom right) — it has no page of its own.'
      : 'This has no page of its own to open.') + '</p>';
    html += '</div>';
    st.trails = [];
    if (kids && !isFrame(n) && (isHere || st.path.indexOf(n.key) < 0)) html += treeHtml(n, isHere);
    n.fields.forEach(function (f) {
      var t = String(f.text);
      if (t.length > 4000) t = t.slice(0, 4000) + '…';
      html += '<div class="tsr-d-field"><div class="tsr-d-label">' + esc(f.label) + '</div>' +
        '<div class="tsr-d-text">' + esc(t) + '</div></div>';
    });
    return html;
  }

  /* What the user made, opened out to the last leaf. Every row is a button
     whose `trail` is the keys from the tree's top to it; a click moves the
     search there (`navTrail`) — never to a page. A row already above it on
     the trail or the crumbs is a loop: drawn ↻ and not opened again. At most
     TREE_MAX rows. The top row is the entry itself, unless it is the folder
     you are already in. */
  function treeHtml(top, isHere) {
    var out = [], shown = 0, cut = false;
    function row(n, trail, lvl, loop) {
      st.trails.push(trail);
      var k = kindOf(n);
      out.push('<button type="button" class="tsr-t-row' + (lvl === 0 ? ' is-top' : '') + '"' +
        ' data-tsr-trail="' + (st.trails.length - 1) + '" style="--tsr-lvl:' + lvl + '"' + (loop ? ' data-tsr-loop=""' : '') + '>' +
        '<span class="tsr-ico" aria-hidden="true">' + (loop ? '↻' : k[0]) + '</span>' +
        '<span class="tsr-t-text"><span class="tsr-t-title">' + esc(n.title) + '</span>' +
        (lvl && n.meta ? '<span class="tsr-t-meta">' + esc(n.meta) + '</span>' : '') + '</span></button>');
    }
    function down(key, trail, lvl) {
      S.children(ix, key).forEach(function (c) {
        if (cut) return;
        if (shown >= TREE_MAX) { cut = true; return; }
        var loop = trail.indexOf(c.key) >= 0 || st.path.indexOf(c.key) >= 0;
        var t = trail.concat([c.key]);
        row(c, t, lvl, loop);
        shown++;
        if (!loop) down(c.key, t, lvl + 1);
      });
    }
    if (!isHere) row(top, [top.key], 0, false);
    down(top.key, [top.key], isHere ? 0 : 1);
    return '<div class="tsr-tree" role="tree"><div class="tsr-d-label">Inside · click one to go there in search</div>' +
      out.join('') + (cut ? '<p class="tsr-t-more">… and more. Go into a branch to see the rest of it.</p>' : '') + '</div>';
  }

  function draw(keepScroll) {
    if (!root) return;
    st.rows = rowsNow();
    if (st.hi >= st.rows.length) st.hi = st.rows.length - 1;
    var shown = st.rows.slice(0, st.limit);
    var searching = !!st.q.trim();
    els.crumbs.innerHTML = crumbsHtml();
    els.here.innerHTML = hereHtml();
    var n = S.node(ix, here());
    els.input.placeholder = n ? 'Search in ' + n.title + '…' : 'Search everything…';
    var top = els.list.scrollTop;
    els.list.innerHTML = shown.length
      ? shown.map(rowHtml).join('') + (st.rows.length > shown.length
        ? '<button type="button" class="tsr-more" data-tsr-more="">Show ' + Math.min(PAGE, st.rows.length - shown.length) +
          ' more of ' + (st.rows.length - shown.length) + '</button>' : '')
      : '<p class="tsr-empty">' + (searching ? 'Nothing here matches “' + esc(st.q.trim()) + '”.' +
        (here() ? ' Try a folder higher up.' : '') : 'This folder is empty.') + '</p>';
    if (keepScroll) els.list.scrollTop = top;
    els.status.textContent = searching
      ? st.rows.length + (st.rows.length === 1 ? ' match' : ' matches') + (n ? ' in ' + n.title : '')
      : (function (c) { return c + (c === 1 ? ' entry' : ' entries'); })(st.rows.filter(function (r) { return !isHead(r); }).length);
    els.detail.innerHTML = detailHtml();
    root.classList.toggle('show-detail', !!st.detail);
  }

  function drawDetailOnly() {
    Array.prototype.forEach.call(els.list.querySelectorAll('.tsr-row'), function (r) {
      r.classList.toggle('is-hi', Number(r.getAttribute('data-tsr-i')) === st.hi);
    });
    els.detail.innerHTML = detailHtml();
    root.classList.toggle('show-detail', !!st.detail);
    var hi = els.list.querySelector('.tsr-row.is-hi');
    if (hi && hi.scrollIntoView) hi.scrollIntoView({ block: 'nearest' });
  }

  // ── moving ──
  // The crumbs plus `keys`, one at a time; a key already on them is climbed
  // back to rather than added again, so no crumb ever appears twice.
  function extend(path, keys) {
    return keys.reduce(function (out, k) {
      var at = out.indexOf(k);
      return at >= 0 ? out.slice(0, at + 1) : out.concat([k]);
    }, path.slice());
  }

  function enter(key) {
    // Into a folder: from where it was found, so the crumbs read as the place
    // it was met. A folder already on the crumbs is never entered (pick shows
    // it instead); one met THROUGH a loop climbs back to the crumb it repeats.
    if (st.path.indexOf(key) >= 0) return;
    var via = st.q.trim() ? S.pathOf(ix, key, here()).map(function (p) { return p.key; }) : [];
    st.path = extend(st.path, via.concat([key]));
    st.q = ''; st.hi = -1; st.limit = PAGE; st.detail = false;
    els.input.value = '';
    draw();
    els.list.scrollTop = 0;
    els.input.focus();
  }

  function jump(key) {
    // A crumb in the details: to that folder by its shallowest path.
    st.path = S.pathOf(ix, key, null).map(function (p) { return p.key; }).concat([key]);
    st.q = ''; st.hi = -1; st.limit = PAGE; st.detail = false;
    els.input.value = '';
    draw();
    els.input.focus();
  }

  function up(to) {
    st.path = st.path.slice(0, to);
    st.q = ''; st.hi = -1; st.limit = PAGE; st.detail = false;
    els.input.value = '';
    draw();
    els.input.focus();
  }

  function pick(i) {
    var n = st.rows[i];
    if (!n || isHead(n)) return;
    if (opensOnClick(n)) { enter(n.key); return; }
    st.hi = i;
    st.detail = isPhone();
    drawDetailOnly();
  }

  // A row of an opened-out tree: the search moves there. Into it when it
  // holds something; to the folder it is in, with it chosen, when it is a
  // leaf. Its trail runs from the tree's top, which is the chosen row (met
  // from where the search found it) or the folder you are in.
  function navTrail(idx) {
    var trail = st.trails && st.trails[idx];
    if (!trail || !trail.length) return;
    var via = trail[0] === here() ? [] : S.pathOf(ix, trail[0], here()).map(function (p) { return p.key; });
    var full = via.concat(trail);
    var target = trail[trail.length - 1];
    var leaf = S.count(ix, target) === 0 && st.path.indexOf(target) < 0;
    st.path = extend(st.path, leaf ? full.slice(0, -1) : full);
    st.q = ''; st.hi = -1; st.limit = PAGE; st.detail = false;
    els.input.value = '';
    draw();
    els.list.scrollTop = 0;
    if (leaf) {
      var at = st.rows.map(function (r) { return r.key; }).indexOf(target);
      if (at >= 0) {
        if (at >= st.limit) { st.limit = (Math.floor(at / PAGE) + 1) * PAGE; draw(); }
        st.hi = at;
        st.detail = isPhone();
        drawDetailOnly();
      }
    }
    els.input.focus();
  }

  // ── events ──
  function onInput() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      st.q = els.input.value;
      st.hi = st.q.trim() ? 0 : -1;
      st.limit = PAGE;
      st.detail = false;
      draw();
      els.list.scrollTop = 0;
    }, 60);
  }

  function flushInput() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (els.input.value !== st.q) {
      st.q = els.input.value; st.hi = st.q.trim() ? 0 : -1; st.limit = PAGE; draw();
    }
  }

  function onInputKey(e) {
    var k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      flushInput();
      e.preventDefault();
      if (!st.rows.length) return;
      var max = Math.min(st.rows.length, st.limit) - 1;
      var step = k === 'ArrowDown' ? 1 : -1;
      var at = st.hi + step;
      while (at >= 0 && at <= max && isHead(st.rows[at])) at += step;
      if (at > max) return;
      st.hi = Math.max(-1, at);
      drawDetailOnly();
      return;
    }
    if (k === 'Enter') {
      flushInput();
      e.preventDefault();
      var i = st.hi;
      if (i < 0) for (var f = 0; f < st.rows.length; f++) if (!isHead(st.rows[f])) { i = f; break; }
      if (e.ctrlKey || e.metaKey) {
        var target = i >= 0 && st.hi >= 0 ? st.rows[i] : S.node(ix, here());
        if (target && target.href) go(target.href);
        return;
      }
      if (i >= 0) pick(i);
      return;
    }
    if (k === 'Backspace' && !els.input.value && st.path.length) {
      e.preventDefault();
      up(st.path.length - 1);
    }
  }

  function onClick(e) {
    var t = e.target.closest ? e.target.closest('[data-tsr-go],[data-tsr-pick],[data-tsr-trail],[data-tsr-crumb],[data-tsr-jump],[data-tsr-more],[data-tsr-close],[data-tsr-back],#tsr-scrim') : null;
    if (!t) return;
    if (t.id === 'tsr-scrim' || t.hasAttribute('data-tsr-close')) { close(); return; }
    if (t.hasAttribute('data-tsr-go')) {
      // Middle- and modifier-clicks keep the browser's own new-tab behaviour.
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
      e.preventDefault();
      go(t.getAttribute('href'));
      return;
    }
    if (t.hasAttribute('data-tsr-pick')) { pick(Number(t.getAttribute('data-tsr-pick'))); return; }
    if (t.hasAttribute('data-tsr-trail')) { navTrail(Number(t.getAttribute('data-tsr-trail'))); return; }
    if (t.hasAttribute('data-tsr-crumb')) { up(Number(t.getAttribute('data-tsr-crumb'))); return; }
    if (t.hasAttribute('data-tsr-jump')) { jump(t.getAttribute('data-tsr-jump')); return; }
    if (t.hasAttribute('data-tsr-more')) { st.limit += PAGE; draw(true); return; }
    if (t.hasAttribute('data-tsr-back')) { st.detail = false; root.classList.remove('show-detail'); els.input.focus(); }
  }

  function onKey(e) {
    if (!root || e.defaultPrevented || e.key !== 'Escape') return;
    e.preventDefault();
    if (st.detail) { st.detail = false; root.classList.remove('show-detail'); els.input.focus(); return; }
    close();
  }

  function onStorage(e) {
    if (!root || (e.key && e.key !== 'track_db')) return;
    buildIndex();
    st.path = st.path.filter(function (k) { return !!S.node(ix, k); });
    draw(true);
  }

  // ── open / close ──
  function open(o) {
    if (root) { els.input.focus(); return; }
    S = window.TrackSearch;
    opener = (o && o.opener) || document.activeElement;
    st = { path: [], q: '', hi: -1, rows: [], limit: PAGE, detail: false, slotName: '' };
    buildIndex();

    root = document.createElement('div');
    root.id = 'tsr';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Search everything');
    root.innerHTML =
      '<div id="tsr-scrim"></div>' +
      '<div id="tsr-panel">' +
        '<div class="tsr-head">' +
          '<nav class="tsr-crumbs" aria-label="Folder"></nav>' +
          '<button type="button" class="tsr-x" data-tsr-close="" aria-label="Close search">✕</button>' +
        '</div>' +
        '<div class="tsr-bar">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>' +
          '<input id="tsr-q" type="search" autocomplete="off" spellcheck="false" aria-label="Search">' +
        '</div>' +
        '<div class="tsr-here"></div>' +
        '<div class="tsr-body">' +
          '<div class="tsr-list" role="list"></div>' +
          '<div class="tsr-detail">' +
            '<button type="button" class="tsr-back" data-tsr-back="">‹ Back to the list</button>' +
            '<div class="tsr-detail-body"></div>' +
          '</div>' +
        '</div>' +
        '<div class="tsr-status" aria-live="polite"></div>' +
      '</div>';
    document.body.appendChild(root);
    els = {
      crumbs: root.querySelector('.tsr-crumbs'), here: root.querySelector('.tsr-here'),
      input: root.querySelector('#tsr-q'), list: root.querySelector('.tsr-list'),
      detail: root.querySelector('.tsr-detail-body'), status: root.querySelector('.tsr-status')
    };
    els.input.addEventListener('input', onInput);
    els.input.addEventListener('keydown', onInputKey);
    root.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey);
    window.addEventListener('storage', onStorage);
    if (opener && opener.setAttribute) opener.setAttribute('aria-expanded', 'true');
    draw();
    els.input.focus();
  }

  function close(leaving) {
    if (!root) return;
    clearTimeout(timer); timer = null;
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('storage', onStorage);
    root.remove();
    root = null; els = {}; ix = null;
    if (opener && opener.setAttribute) opener.setAttribute('aria-expanded', 'false');
    if (!leaving && opener && opener.focus && document.contains(opener)) opener.focus();
    opener = null;
  }

  window.TrackSearchView = {
    open: open,
    close: function () { close(false); },
    isOpen: function () { return !!root; }
  };
})();
