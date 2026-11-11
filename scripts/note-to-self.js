/* ── note-to-self.js ───────────────────────────────────────────────────────
   The Note to self pop-up (the user's 2026-11-08 request): a long line across
   the top of every page with a `v` in the middle, which drops a panel down.

       ─────────────────────────── v ───────────────────────────

   The panel holds everything in Quest, and every ★ Forced day note and
   deadline that is in caution or due — today's, plus deadlines past due that
   nobody ticked. On top of both sits ONE block, IN PRO (the user's 2026-11-11
   request): the mind maps in progress, shut until it is clicked. WHAT the
   panel holds is decided in note-to-self-core.js (window.TrackNoteToSelf);
   this file only draws it.

   Five rules, and the first two are the load-bearing ones:

   - It is a READER. It writes nothing — not track_db, not a key of its own.
     It reads through TrackStorage.loadDB, the one load boundary, and never
     stores whether it is open: every page load starts with it shut.
   - A CLOSED panel keeps NO DOM. Its rows reuse Home's quest classes, and a
     panel full of hidden rows would be one more set of elements for every
     existing selector on every page to trip over (the notes widget learned
     the same lesson). The rows' data attributes are `data-nts-*` for the same
     reason. The IN PRO block is the same rule one level down: shut, it holds
     no rows, and whether it is open lives in a variable here and nowhere
     else — it is shut again every time the panel opens.
   - It FLOATS over the page and moves nothing (the user's choice, D3). Pages
     like progress.html are exactly one screen tall, and a strip that pushed
     them down would have meant changing every page's height rules. The tab is
     short on purpose: on Progress at every width, and on the Knowledge Record
     and True Storage on a phone, a header tab button sits right under the top
     centre (measured 2026-11-08), and a 44px tab would bury it.
   - A link to the page it is ON still goes there. Progress reads its tab and
     ?date=/&dl= once, at mount, so a link differing from the current address
     only in its #hash would change nothing on screen. Such a click sets the
     address and reloads — exactly what arriving from another page does.
   - Escape closes it only when nothing above it took the key: the listener is
     on `window`, which hears a keydown after every `document` listener, and it
     skips an event already handled — the notes widget's calendar and the
     Journey book both call preventDefault on the Escape they close with.

   "Today" is TrackCalendar.toDateStr(new Date()), read at every draw, so an
   open panel shows the new day on its next redraw after midnight.
*/
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  var root = null, toggle = null, panel = null, isOpen = false;
  // Whether the IN PRO block shows its list. Never stored (this is a READER),
  // kept across a redraw of an open panel, and reset whenever the panel opens
  // or shuts.
  var inProOpen = false;

  function today() {
    try { return window.TrackCalendar ? window.TrackCalendar.toDateStr(new Date()) : null; }
    catch (e) { return null; }
  }

  function readSlot() {
    try {
      if (!window.TrackStorage) return { slot: null, blocked: false };
      var db = window.TrackStorage.loadDB() || {};
      var blocked = typeof window.TrackStorage.dbBlocked === 'function' && window.TrackStorage.dbBlocked();
      var slots = Array.isArray(db.slots) ? db.slots : [];
      var slot = slots.filter(function (s) { return s && s.id === db.activeSlotId; })[0] || slots[0] || null;
      return { slot: slot && typeof slot === 'object' ? slot : null, blocked: !!blocked };
    } catch (e) { return { slot: null, blocked: false }; }
  }

  function routineTicks(slot, ds) {
    try {
      var Q = window.TrackQuest;
      if (!Q) return [];
      return Q.routineTicks(localStorage.getItem(Q.ROUTINE_TICK_KEY), slot.id, ds);
    } catch (e) { return []; }
  }

  function dayLabel(ds) {
    try {
      var N = window.TrackNotes;
      return N && typeof N.journeyDayLabel === 'function' ? N.journeyDayLabel(ds) : String(ds);
    } catch (e) { return String(ds); }
  }

  function draw() {
    if (!isOpen || !panel) return;
    var M = window.TrackNoteToSelf;
    var esc = M ? M.esc : function (s) { return String(s); };
    var ds = today();
    var read = readSlot();
    var html = '<div class="nts-head"><span class="nts-name">Note to self</span>' +
      (ds ? '<span class="nts-date">' + esc(dayLabel(ds)) + '</span>' : '') + '</div>';

    if (!M || !ds) {
      html += '<p class="nts-empty">Note to self could not load.</p>';
    } else if (read.blocked) {
      html += '<p class="nts-empty">Saved data could not be read — see the warning on this page.</p>';
    } else if (!read.slot) {
      html += '<p class="nts-empty">No workspace yet — create one on <a href="index.html">Home</a>.</p>';
    } else {
      var slot = read.slot;
      html += '<section class="nts-section" data-nts-section="inpro">' +
        M.inProHtml(M.inProMms(slot), inProOpen) + '</section>';

      var forced = M.forcedHtml(M.forcedFor(slot, ds), ds, { dayLabel: dayLabel });
      html += '<section class="nts-section" data-nts-section="forced">' +
        '<div class="nts-label">★ Forced — in caution or due</div>' +
        (forced || '<p class="nts-empty">Nothing in caution or due today.</p>') + '</section>';

      var q = M.questHtml(slot, routineTicks(slot, ds), { hook: 'nts-quest', href: M.QUEST_HREF });
      html += '<section class="nts-section" data-nts-section="quest">' +
        '<div class="nts-label">Quest</div>' +
        (q.starred ? '<div class="nts-quest-starred">' + q.starred + '</div>' : '') +
        (q.list || '<p class="nts-empty">No quests yet — pick some in <a href="' +
          esc(M.QUEST_HREF) + '">Progress</a>.</p>') +
        '</section>' +
        '<a class="nts-open" href="' + esc(M.QUEST_HREF) + '">Edit quests in Progress →</a>';
    }
    panel.innerHTML = html;
  }

  function setOpen(next, focusBack) {
    isOpen = !!next;
    inProOpen = false;
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    toggle.setAttribute('aria-label', isOpen ? 'Close Note to self' : 'Open Note to self');
    root.classList.toggle('is-open', isOpen);
    if (isOpen) {
      panel.hidden = false;
      draw();
    } else {
      panel.hidden = true;
      panel.innerHTML = '';
      if (focusBack) { try { toggle.focus(); } catch (e) {} }
    }
  }

  // A link to the page this is on, differing only in its #hash, would change
  // nothing on screen: set the address, then reload. See the header.
  function onPanelClick(e) {
    // The IN PRO block: its one button shows or hides its list. The redraw
    // replaces the button, so focus is handed to the new one.
    var inPro = e.target && e.target.closest ? e.target.closest('[data-nts-inpro-toggle]') : null;
    if (inPro) {
      inProOpen = !inProOpen;
      draw();
      var again = panel.querySelector('[data-nts-inpro-toggle]');
      if (again) { try { again.focus(); } catch (err) {} }
      return;
    }
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var url;
    try { url = new URL(a.getAttribute('href'), window.location.href); } catch (err) { return; }
    if (url.origin !== window.location.origin) return;
    if (url.pathname === window.location.pathname && url.search === window.location.search) {
      e.preventDefault();
      window.location.href = url.href;
      window.location.reload();
    }
  }

  function mount() {
    if (document.getElementById('nts')) return;
    root = document.createElement('div');
    root.id = 'nts';

    var line = document.createElement('div');
    line.id = 'nts-line';
    line.setAttribute('aria-hidden', 'true');

    toggle = document.createElement('button');
    toggle.id = 'nts-toggle';
    toggle.type = 'button';
    toggle.title = 'Note to self';
    toggle.setAttribute('aria-controls', 'nts-panel');
    toggle.innerHTML = '<svg viewBox="0 0 12 8" aria-hidden="true" focusable="false">' +
      '<path d="M1.5 1.75 6 6.25l4.5-4.5"/></svg>';
    toggle.addEventListener('click', function () { setOpen(!isOpen, false); });

    panel = document.createElement('div');
    panel.id = 'nts-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Note to self');
    panel.hidden = true;
    panel.addEventListener('click', onPanelClick);

    // Toggle BEFORE the panel, so Tab from the open `^` walks into the rows.
    // The stacking (tab over panel) is z-index's job, not DOM order's.
    root.appendChild(line);
    root.appendChild(toggle);
    root.appendChild(panel);
    document.body.appendChild(root);
    setOpen(false, false);

    window.addEventListener('keydown', function (e) {
      if (!isOpen || e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      setOpen(false, true);
    });
    // Capture, so a page handler that stops propagation cannot keep the panel
    // open under a click somewhere else on the page.
    document.addEventListener('pointerdown', function (e) {
      if (isOpen && root && !root.contains(e.target)) setOpen(false, false);
    }, true);
    // Another tab's edit, or the notes widget's same-tab signal, redraws an
    // open panel. The event's payload is never trusted — draw() re-reads.
    window.addEventListener('storage', function (e) {
      if (!isOpen) return;
      var Q = window.TrackQuest;
      if (e.key === null || e.key === 'track_db' || (Q && e.key === Q.ROUTINE_TICK_KEY)) draw();
    });
    document.addEventListener('visibilitychange', function () {
      if (isOpen && !document.hidden) draw();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
