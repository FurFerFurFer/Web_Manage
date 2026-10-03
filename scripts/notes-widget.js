/* ── notes-widget.js ───────────────────────────────────────────────────────
   The floating notes widget, mounted on every page. Two kinds of note, both
   defined in notes-core.js (window.TrackNotes):

     Sorted  the user's own list, `notes`.
     Date    one draft per local day, `dateNotes` — a "mini-Kolb": articulate
             freely under the day, then sort what survives into a Sorted note.
             A written day carries one tag — unclear (the default), cleared or
             Eternal — chosen in a radio row above its text. Cleared and
             Eternal LOCK the text: it can be selected, copied, sent from and
             opened beside, but not edited or cleared until it is unclear
             again. Days are chosen in a calendar pop-up that fills every
             written day with its colour.

   Side opening: ⧉ on any note opens another beside it, full screen, up to
   TrackNotes.MAX_PANES at once — left/right above 720px, stacked below it
   (styles.css owns that switch). Every unlocked pane is editable, and → Send
   appends the highlighted text to another open note that is not locked.

   SAVING. Every editor owns a saver that captured {kind, key, slotId} when it
   was built. That capture is the whole fix for the bug this file used to have:
   the 300ms content debounce read `state.activeId` when it FIRED, so × dropped
   the last keystrokes and ← then opening another note wrote the first note's
   text into the second. Every render() flushes the savers it is about to
   discard, so no navigation can outrun a pending save. The slot is captured
   too: a note opened in slot A keeps writing to A after another tab switches
   the active slot, and writes nothing if A is gone.

   Every write is a fresh read-modify-write of ONE key (`notes` or `dateNotes`)
   for ONE slot, through TrackStorage.saveDB. This file owns those two keys and
   writes nothing else.
*/
(function () {
  var N = window.TrackNotes;
  if (!N || !window.TrackStorage || !window.TrackSchema) {
    // A hard dependency, like TrackStorage: better no widget than one that
    // writes without the rules. The smoke cases assert the button mounts.
    if (window.console) console.error('notes-widget.js: notes-core.js, storage-guard.js or schema.js is missing');
    return;
  }

  var SORTED = 'sorted', DATE = 'date';

  var state = {
    view: 'collapsed',   // collapsed | list | detail | pick | split
    tab: SORTED,         // the list's tab
    active: null,        // {kind, key, slotId} — the note in detail / pick
    pickTab: SORTED,
    panes: [],           // [{kind, key, slotId}] — the side-by-side view
    sizes: [],           // flex-grow per pane; in memory only, never stored
    lastPane: 0
  };
  var panelW = 320, panelH = 420;

  function isMap(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  // One parse-and-validate boundary for every page — TrackStorage.loadDB in
  // storage-guard.js. This used to be a bare JSON.parse whose catch never fired for
  // valid JSON with the wrong root shape, such as 'null', '42' or '[…]'.
  function _twDB() { return TrackStorage.loadDB(); }
  function _twSlot(db) { db = db || _twDB(); var id = db.activeSlotId; return (db.slots || []).find(function(s) { return s.id === id; }) || (db.slots || [])[0] || null; }
  function slotById(db, id) {
    return id == null ? null : ((db && db.slots) || []).find(function (s) { return isMap(s) && s.id === id; }) || null;
  }
  function localToday() { return TrackSchema.localToday(); }

  (function migrate() {
    var old = localStorage.getItem('track_global_notes');
    if (!old) return;
    try {
      var oldNotes = JSON.parse(old).notes || [];
      if (!oldNotes.length) { localStorage.removeItem('track_global_notes'); return; }
      var db = _twDB(), slot = _twSlot(db);
      if (!slot) return;
      db.slots = (db.slots || []).map(function(s) {
        if (s.id !== slot.id) return s;
        return Object.assign({}, s, { notes: (s.notes || []).concat(oldNotes) });
      });
      if (TrackStorage.saveDB(db)) localStorage.removeItem('track_global_notes');
    } catch(e) {}
  })();

  // Shared shape — TrackStorage.newId in storage-guard.js. The fallback is the
  // pre-existing local form, so a load-order accident cannot leave this widget
  // without an id source.
  function generateId() {
    return window.TrackStorage && window.TrackStorage.newId
      ? window.TrackStorage.newId()
      : Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ── data ──────────────────────────────────────────────────────────────────

  var MISSING = {}, REFUSE = {}, LOCKED = {};

  // The one writer. A fresh read, ONE key, for ONE slot id. `fn` maps the stored
  // value to the next one; returning it unchanged (the same object) writes
  // nothing. Answers 'saved' | 'unchanged' | 'missing' | 'locked' | 'refused'.
  function writeSlotKey(slotId, key, fn) {
    var db = _twDB();
    var slot = slotById(db, slotId);
    if (!slot) return 'refused';
    var cur = slot[key];
    var next = fn(cur);
    if (next === MISSING) return 'missing';
    if (next === LOCKED) return 'locked';
    if (next === REFUSE) return 'refused';
    if (next === cur) return 'unchanged';
    db.slots = db.slots.map(function (s) {
      if (s !== slot) return s;
      var o = Object.assign({}, s); o[key] = next; return o;
    });
    return TrackStorage.saveDB(db) ? 'saved' : 'refused';
  }

  function sortedList(slot) { return slot && Array.isArray(slot.notes) ? slot.notes.filter(isMap) : []; }
  function dateMap(slot) { return slot && isMap(slot.dateNotes) ? slot.dateNotes : {}; }
  function findSorted(slot, id) { return sortedList(slot).find(function (n) { return n.id === id; }) || null; }
  function text(v) { return typeof v === 'string' ? v : ''; }
  function keyOf(ref) { return ref.kind + ':' + ref.key; }

  function refText(slot, ref) {
    return ref.kind === DATE ? N.dateNoteText(dateMap(slot), ref.key) : text((findSorted(slot, ref.key) || {}).content);
  }

  // A value in the wrong shape is refused rather than replaced: replacing it
  // would destroy whatever it holds. (loadDB already freezes writes over a
  // wrong-kind canonical field; this is the second lock on the same door.)
  function persist(ref, patch) {
    var now = Date.now();
    if (ref.kind === DATE) {
      var hasContent = Object.prototype.hasOwnProperty.call(patch, 'content');
      var hasTag = Object.prototype.hasOwnProperty.call(patch, 'tag');
      if (!hasContent && !hasTag) return 'unchanged';
      return writeSlotKey(ref.slotId, 'dateNotes', function (cur) {
        if (cur != null && !isMap(cur)) return REFUSE;
        var base = isMap(cur) ? cur : {};
        // A locked day refuses its text, and the refusal is SAID, never folded
        // into 'unchanged': the box only freezes in this tab, so words typed
        // before another tab locked the day must be reported as not saved. The
        // whole patch goes, tag and all — half a press is not what was asked.
        if (hasContent && N.dateNoteLocked(base, ref.key) &&
            text(patch.content) !== N.dateNoteText(base, ref.key)) return LOCKED;
        // Content FIRST. withDateTag refuses a day with nothing written, so a tag
        // pressed within the debounce of a day's first words must find those
        // words already in the map, or the press is silently lost.
        var next = hasContent ? N.withDateNote(base, ref.key, text(patch.content), now) : base;
        if (hasTag) next = N.withDateTag(next, ref.key, patch.tag, now);
        return next === base ? cur : next;
      });
    }
    return writeSlotKey(ref.slotId, 'notes', function (cur) {
      if (cur != null && !Array.isArray(cur)) return REFUSE;
      var r = N.withSortedPatch(cur, ref.key, patch);
      return r.found ? r.list : MISSING;
    });
  }

  function createSorted(slotId) {
    var note = { id: generateId(), topic: '', content: '', createdAt: Date.now() };
    var r = writeSlotKey(slotId, 'notes', function (cur) {
      if (cur != null && !Array.isArray(cur)) return REFUSE;
      return (cur || []).concat([note]);
    });
    return r === 'saved' ? note.id : null;
  }

  // ── savers ────────────────────────────────────────────────────────────────

  var editors = [];

  function makeSaver(ref, onResult) {
    var pending = null, timer = null;
    var saver = {
      ref: ref,
      queue: function (patch) {
        pending = Object.assign(pending || {}, patch);
        clearTimeout(timer);
        timer = setTimeout(saver.flush, 300);
      },
      flush: function () {
        clearTimeout(timer); timer = null;
        if (!pending) return null;
        var patch = pending; pending = null;
        var result = persist(ref, patch);
        if (onResult) onResult(result);
        return result;
      },
      cancel: function () { clearTimeout(timer); timer = null; pending = null; }
    };
    editors.push(saver);
    return saver;
  }

  function flushAll() { editors.forEach(function (s) { s.flush(); }); }

  function statusSetter(el) {
    return function (result) {
      if (result === 'unchanged') return;
      var ok = result === 'saved';
      el.setAttribute('data-nw-status', result);
      el.classList.toggle('nw-status-warn', !ok);
      el.textContent = ok ? 'Saved'
        : result === 'missing' ? '⚠ Not saved — this note was deleted elsewhere'
        : result === 'locked' ? '⚠ Not saved — this day was locked elsewhere. Your text is still here to copy.'
        : '⚠ Not saved — storage refused the write';
    };
  }

  // ── small DOM helpers ─────────────────────────────────────────────────────

  function el(tag, cls, textContent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (textContent != null) e.textContent = textContent;
    return e;
  }

  var ICONS = {
    side: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
    send: '<path d="M4 12h11M11 7l5 5-5 5"/><path d="M20 5v14"/>',
    change: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    exit: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    prev: '<path d="M15 6l-6 6 6 6"/>',
    next: '<path d="M9 6l6 6-6 6"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
  };

  function iconBtn(icon, label, hook) {
    var b = el('button', 'nw-icon-btn');
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    if (hook) b.setAttribute(hook, '');
    b.innerHTML = '<svg class="nw-icon-svg" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[icon] + '</svg>';
    return b;
  }

  function tabs(current, onChange, hook) {
    var wrap = el('div', 'nw-tabs');
    wrap.setAttribute('role', 'tablist');
    [[SORTED, 'Sorted'], [DATE, 'Date']].forEach(function (t) {
      var b = el('button', 'nw-tab', t[1]);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(current === t[0]));
      b.setAttribute(hook, t[0]);
      b.onclick = function () { if (current !== t[0]) onChange(t[0]); };
      wrap.appendChild(b);
    });
    return wrap;
  }

  function chip(kind) {
    var c = el('span', 'nw-chip nw-chip-' + kind, kind === DATE ? 'Date' : 'Sorted');
    c.setAttribute('aria-hidden', 'true');
    return c;
  }

  function emptyMsg(msg) { return el('div', 'nw-empty-msg', msg); }

  // ── tags ──────────────────────────────────────────────────────────────────
  // `.nw-tag-<id>` sets --nw-tag, and every tag surface paints from it, so the
  // red / green / orchid pairing lives once, in styles.css.

  function tagChip(id) {
    var info = N.tagInfo(id);
    var c = el('span', 'nw-tag nw-tag-' + id, info ? info.label : id);
    c.setAttribute('data-nw-tag-chip', id);
    return c;
  }

  // The word that unlocks a day, for the hints that say how.
  var UNLOCK_WORD = N.tagInfo(N.DEFAULT_TAG).label;

  function storedTag(ref) {
    return N.dateNoteTag(dateMap(slotById(_twDB(), ref.slotId)), ref.key);
  }

  // A Date note's tag as a radio group. On a written day exactly one tag is
  // checked; on an unwritten day none is and the group is disabled, because an
  // unwritten day is uncoloured. What it shows joins two sources: the STORED tag,
  // re-read after every save (a blank save deleted the day, tag and all), and
  // the LIVE text, so the group answers the moment the first character is typed
  // rather than 300ms later. A press flushes at once through the editor's own
  // saver, so it lands in the note and slot that editor was opened on.
  //
  // The bar also owns the LOCK, because the lock is a function of the tag it
  // shows: on cleared or Eternal the text box goes readOnly — never disabled,
  // which would also stop it being selected, copied and sent from — and
  // `bar.note` says why and how to undo it. `onLock(info|null)` lets the host
  // follow: the 🗑 in the single-note view, Send's targets side by side.
  function tagBar(ref, saver, textarea, onLock) {
    var wrap = el('div', 'nw-tags');
    wrap.setAttribute('role', 'radiogroup');
    wrap.setAttribute('aria-label', 'Tag this day');
    wrap.setAttribute('data-nw-tags', ref.key);
    var stored = '';
    var buttons = N.TAGS.map(function (t) {
      var b = el('button', 'nw-tag-btn nw-tag-' + t.id);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('data-nw-tag-set', t.id);
      b.appendChild(el('span', 'nw-tag-swatch'));
      b.appendChild(el('span', 'nw-tag-word', t.label));
      b.onclick = function () { choose(t.id); };
      wrap.appendChild(b);
      return b;
    });

    var note = el('div', 'nw-lock-note');
    note.setAttribute('data-nw-lock-note', ref.key);
    note.setAttribute('role', 'status');
    note.innerHTML = '<svg class="nw-icon-svg" viewBox="0 0 24 24" aria-hidden="true">' + ICONS.lock + '</svg>';
    var noteWords = el('span', 'nw-lock-words');
    note.appendChild(noteWords);
    note.hidden = true;

    function shown() { return N.isBlank(textarea.value) ? '' : (stored || N.DEFAULT_TAG); }
    function lockedInfo() { var info = N.tagInfo(shown()); return info && info.locked ? info : null; }

    function draw() {
      var cur = shown();
      wrap.setAttribute('aria-disabled', String(!cur));
      wrap.title = cur ? '' : 'Write something first — a written draft starts as unclear';
      buttons.forEach(function (b, i) {
        var id = N.TAGS[i].id;
        b.setAttribute('aria-checked', String(cur === id));
        // One tab stop for the group, on the checked radio (or the first).
        b.tabIndex = (cur ? cur === id : i === 0) ? 0 : -1;
      });
      var lock = lockedInfo();
      textarea.readOnly = !!lock;
      N.TAGS.forEach(function (t) { textarea.classList.toggle('nw-tag-' + t.id, !!lock && lock.id === t.id); });
      if (lock) textarea.setAttribute('data-nw-locked', lock.id);
      else textarea.removeAttribute('data-nw-locked');
      note.hidden = !lock;
      noteWords.textContent = lock
        ? 'Read only while “' + lock.label + '” — choose ' + UNLOCK_WORD + ' to edit.'
        : '';
      if (onLock) onLock(lock);
    }

    function choose(id) {
      var cur = shown();
      if (!cur || cur === id) return;
      saver.queue({ tag: id });
      saver.flush();
      draw();
    }

    wrap.addEventListener('keydown', function (e) {
      var dir = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
      if (!dir) return;
      var i = buttons.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      buttons[(i + dir + buttons.length) % buttons.length].focus();
    });
    textarea.addEventListener('input', draw);

    var bar = {
      el: wrap,
      note: note,
      draw: draw,
      locked: function () { return !!lockedInfo(); },
      sync: function () { stored = storedTag(ref); draw(); }
    };
    bar.sync();
    liveBars.push(bar);
    return bar;
  }

  // A saver's result handler for a Date editor: the status line, then the tag
  // bar re-reads what actually landed — or, on 'locked', the tag another tab
  // set, which freezes this box too. `getBar` because the bar is built after
  // the saver it presses through.
  function dateResult(setStatus, getBar) {
    return function (result) {
      setStatus(result);
      var bar = getBar();
      if (bar && (result === 'saved' || result === 'locked')) bar.sync();
    };
  }

  // ── the floating panel ────────────────────────────────────────────────────

  var panel, body, headerTitle, btn, split, livePanes = [], liveBars = [];

  function render() {
    // Flush with the refs each saver captured, BEFORE the DOM they belong to goes.
    var old = editors; editors = [];
    old.forEach(function (s) { s.flush(); });
    liveBars = [];
    closeTransient();
    // An open calendar outlives a redraw beneath it — the storage listener
    // redraws the list it was opened from — and repaints from a fresh read.
    if (cal) {
      if (state.view === 'collapsed') closeCalendar(false);
      else cal.refresh();
    }

    // A hidden panel keeps no DOM. Its old picker rows would otherwise stay live
    // under display:none, and anything that finds elements by selector — a test,
    // assistive tech — would reach a handler for a view that is gone.
    if (state.view === 'split' || state.view === 'collapsed') {
      headerTitle.innerHTML = '';
      body.innerHTML = '';
    }

    if (state.view === 'split') { renderSplit(); return; }
    document.documentElement.classList.remove('nw-split-open');
    split.style.display = 'none';
    split.innerHTML = '';
    livePanes = [];

    if (state.view === 'collapsed') {
      btn.style.display = 'flex';
      panel.style.display = 'none';
      return;
    }
    btn.style.display = 'none';
    panel.style.display = 'flex';
    panel.style.width = panelW + 'px';
    panel.style.height = panelH + 'px';
    body.style.cssText = '';

    if (state.view === 'list') renderList();
    else if (state.view === 'detail') renderDetail();
    else if (state.view === 'pick') renderSidePick();
  }

  function openDetail(ref) { state.active = ref; state.view = 'detail'; render(); }

  function renderList() {
    var slot = _twSlot();
    headerTitle.innerHTML = '';
    headerTitle.appendChild(tabs(state.tab, function (t) { state.tab = t; render(); }, 'data-nw-tab'));
    body.innerHTML = '';
    if (state.tab === DATE) renderDateList(slot);
    else renderSortedList(slot);
  }

  function renderSortedList(slot) {
    var notes = sortedList(slot);

    if (!notes.length) {
      var empty = document.createElement('div');
      empty.id = 'nw-empty';
      empty.textContent = 'No notes yet. Hit + to add one.';
      body.appendChild(empty);
    } else {
      notes.forEach(function (note) {
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'nw-note-row';
        row.setAttribute('data-nw-row', 'sorted:' + note.id);
        row.onclick = function () { openDetail({ kind: SORTED, key: note.id, slotId: slot.id }); };

        var dot = document.createElement('div');
        dot.className = 'nw-note-dot';

        var lbl = document.createElement('div');
        lbl.className = 'nw-note-label';
        lbl.textContent = note.topic || '(untitled)';

        row.appendChild(dot);
        row.appendChild(lbl);
        body.appendChild(row);
      });
    }

    var addBtn = document.createElement('button');
    addBtn.id = 'nw-add-btn';
    addBtn.textContent = '+ Add note';
    addBtn.onclick = function () {
      var id = slot ? createSorted(slot.id) : null;
      if (id) { openDetail({ kind: SORTED, key: id, slotId: slot.id }); return; }
      body.appendChild(emptyMsg(slot ? '⚠ Not added — storage refused the write.' : 'Create a workspace on Home first.'));
    };
    body.appendChild(addBtn);
  }

  function dateRow(day, value, tag, today, hook) {
    var row = el('button', 'nw-note-row nw-date-row');
    row.type = 'button';
    row.setAttribute(hook, 'date:' + day);
    var line = el('div', 'nw-date-line');
    line.appendChild(el('div', 'nw-date-label', N.dayLabel(day, today)));
    if (tag) line.appendChild(tagChip(tag));
    var prev = el('div', 'nw-date-preview', N.firstLine(value) || (day === today ? 'Empty — start today’s draft' : ''));
    row.appendChild(line);
    row.appendChild(prev);
    return row;
  }

  function renderDateList(slot) {
    if (!slot) { body.appendChild(emptyMsg('Create a workspace on Home first.')); return; }
    var today = localToday();
    var map = dateMap(slot);

    var todayRow = dateRow(today, N.dateNoteText(map, today), N.dateNoteTag(map, today), today, 'data-nw-row');
    todayRow.classList.add('nw-date-today');
    todayRow.onclick = function () { openDetail({ kind: DATE, key: today, slotId: slot.id }); };
    body.appendChild(todayRow);

    body.appendChild(calOpener('list', function (opener) {
      openCalendar({
        slotId: slot.id,
        onDay: function (day) { openDetail({ kind: DATE, key: day, slotId: slot.id }); }
      }, opener);
    }));

    var days = N.datedDays(map).filter(function (d) { return d.day !== today; });
    if (!days.length) {
      body.appendChild(emptyMsg('Draft freely here, then sort it into a note — open ⧉ beside any draft.'));
      return;
    }
    body.appendChild(el('div', 'nw-section-label', 'Drafts'));
    days.forEach(function (d) {
      var row = dateRow(d.day, d.text, d.tag, today, 'data-nw-row');
      row.onclick = function () { openDetail({ kind: DATE, key: d.day, slotId: slot.id }); };
      body.appendChild(row);
    });
  }

  // The button that opens the calendar pop-up — in the Date list, and in the
  // picker's Date tab. It replaced a native date input, which could choose a
  // day but could not say anything about the days it offered.
  function calOpener(context, onOpen) {
    var b = el('button', 'nw-cal-opener');
    b.type = 'button';
    b.setAttribute('data-nw-cal-open', context);
    b.title = 'Open the calendar — every written day shows its tag';
    b.innerHTML = '<svg class="nw-icon-svg" viewBox="0 0 24 24" aria-hidden="true">' + ICONS.calendar + '</svg>';
    b.appendChild(el('span', 'nw-cal-opener-label', 'Go to day'));
    b.onclick = function () { onOpen(b); };
    return b;
  }

  function renderDetail() {
    var ref = state.active;
    var slot = ref && slotById(_twDB(), ref.slotId);
    if (!slot || (ref.kind === SORTED && !findSorted(slot, ref.key))) { state.view = 'list'; render(); return; }

    headerTitle.innerHTML = '';

    var backBtn = document.createElement('button');
    backBtn.id = 'nw-back-btn';
    backBtn.textContent = '←';
    backBtn.title = 'Back to list';
    backBtn.setAttribute('aria-label', 'Back to notes list');
    backBtn.onclick = function () { state.view = 'list'; state.tab = ref.kind; render(); };
    headerTitle.appendChild(backBtn);

    var statusEl = el('div', 'nw-status');
    statusEl.setAttribute('data-nw-status', 'idle');
    var bar = null, delBtn = null;
    var saver = makeSaver(ref, ref.kind === DATE
      ? dateResult(statusSetter(statusEl), function () { return bar; })
      : statusSetter(statusEl));

    var textarea = document.createElement('textarea');
    textarea.id = 'nw-content';
    textarea.setAttribute('data-nw-text', '');
    textarea.value = refText(slot, ref);
    textarea.oninput = function () { saver.queue({ content: textarea.value }); };

    if (ref.kind === SORTED) {
      var note = findSorted(slot, ref.key);
      var topicEl = document.createElement('div');
      topicEl.id = 'nw-topic';
      topicEl.contentEditable = 'true';
      topicEl.setAttribute('data-placeholder', 'Topic name…');
      topicEl.textContent = note.topic || '';
      topicEl.oninput = function () { saver.queue({ topic: topicEl.textContent.trim() }); };
      topicEl.onblur = function () { saver.flush(); };
      topicEl.onkeydown = function (e) {
        if (e.key === 'Enter') { e.preventDefault(); topicEl.blur(); }
      };
      headerTitle.appendChild(topicEl);
      textarea.placeholder = 'Write anything…';
    } else {
      var dayEl = el('div', 'nw-day-title', N.dayLabel(ref.key, localToday()));
      dayEl.setAttribute('data-nw-day-title', ref.key);
      headerTitle.appendChild(dayEl);
      textarea.placeholder = 'Draft freely — ideas, half-thoughts, what happened…';
      // A locked day cannot be cleared either: 🗑 says so instead of asking.
      bar = tagBar(ref, saver, textarea, function (lock) {
        if (!delBtn) return;
        delBtn.setAttribute('aria-disabled', String(!!lock));
        delBtn.title = lock
          ? 'Locked while “' + lock.label + '” — choose ' + UNLOCK_WORD + ' first to clear this day'
          : 'Clear this day';
      });
    }

    var sideBtn = iconBtn('side', 'Open another note side by side', 'data-nw-side-open');
    sideBtn.onclick = function () {
      state.view = 'pick';
      state.pickTab = ref.kind === DATE ? SORTED : DATE;
      render();
    };
    headerTitle.appendChild(sideBtn);

    delBtn = iconBtn('trash', ref.kind === DATE ? 'Clear this day' : 'Delete note', ref.kind === DATE ? 'data-nw-clear-day' : 'data-nw-delete');
    delBtn.onclick = ref.kind === DATE
      ? function () {
          var map = dateMap(slotById(_twDB(), ref.slotId));
          // The no-op guards first, and both ask nothing. A day that holds
          // nothing has nothing to clear. A LOCKED day refuses — read fresh, so
          // a lock another tab set is honoured even before this bar hears of it.
          if (N.isBlank(textarea.value) && N.isBlank(N.dateNoteText(map, ref.key))) return;
          if (N.dateNoteLocked(map, ref.key)) { bar.sync(); return; }
          // Only an unlocked day reaches here, and it shows unclear: there is
          // no tag to name.
          if (!window.confirm('Clear the draft for ' + N.dayLabel(ref.key, localToday()) + '?')) return;
          textarea.value = '';
          saver.queue({ content: '' });
          saver.flush();
          bar.draw();
        }
      : function () {
          if (!window.confirm('Delete this note?')) return;
          saver.cancel();
          writeSlotKey(ref.slotId, 'notes', function (cur) {
            if (!Array.isArray(cur)) return cur;
            return cur.filter(function (x) { return !(isMap(x) && x.id === ref.key); });
          });
          state.active = null;
          state.view = 'list';
          render();
        };
    headerTitle.appendChild(delBtn);
    if (bar) bar.draw(); // the bar was drawn before 🗑 existed

    body.innerHTML = '';
    body.style.padding = '0';
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.overflow = 'hidden';
    if (bar) { body.appendChild(bar.el); body.appendChild(bar.note); }
    body.appendChild(textarea);
    body.appendChild(statusEl);

    setTimeout(function () { textarea.focus(); }, 10);
  }

  function renderSidePick() {
    var origin = state.active;
    if (!origin) { state.view = 'list'; render(); return; }
    headerTitle.innerHTML = '';
    var back = document.createElement('button');
    back.id = 'nw-back-btn';
    back.textContent = '←';
    back.title = 'Back to the note';
    back.setAttribute('aria-label', 'Back to the note');
    back.onclick = function () { state.view = 'detail'; render(); };
    headerTitle.appendChild(back);
    headerTitle.appendChild(el('span', 'nw-pick-title', 'Open beside…'));

    body.innerHTML = '';
    body.appendChild(buildPicker({
      slotId: origin.slotId,
      exclude: [keyOf(origin)],
      tab: state.pickTab,
      onTab: function (t) { state.pickTab = t; },
      onPick: function (ref) {
        state.panes = [origin, ref];
        state.sizes = [1, 1];
        state.lastPane = 1;
        state.view = 'split';
        render();
      }
    }));
  }

  // ── the picker: shared by the panel and the side-by-side view ─────────────

  function buildPicker(opts) {
    var root = el('div', 'nw-picker');
    root.setAttribute('data-nw-picker', '');
    var tab = opts.tab, filter = '';
    var bar = el('div', 'nw-picker-bar');
    var tabsHost = el('div', 'nw-picker-tabs');
    var search = el('input', 'nw-picker-filter');
    search.type = 'search';
    search.placeholder = 'Filter…';
    search.setAttribute('aria-label', 'Filter notes');
    search.setAttribute('data-nw-picker-filter', '');
    var list = el('div', 'nw-picker-list');
    var today = localToday();

    function excluded(kind, key) { return opts.exclude.indexOf(kind + ':' + key) >= 0; }
    function matches() {
      var q = filter.trim().toLowerCase();
      if (!q) return true;
      return Array.prototype.some.call(arguments, function (s) { return text(s).toLowerCase().indexOf(q) >= 0; });
    }
    function pickRow(kind, key, name, preview, tag) {
      var row = el('button', 'nw-pick-row');
      row.type = 'button';
      row.setAttribute('data-nw-pick', kind + ':' + key);
      row.appendChild(chip(kind));
      var words = el('span', 'nw-pick-words');
      words.appendChild(el('span', 'nw-pick-name', name));
      if (preview) words.appendChild(el('span', 'nw-pick-preview', preview));
      row.appendChild(words);
      if (tag) row.appendChild(tagChip(tag));
      row.onclick = function () { opts.onPick({ kind: kind, key: key, slotId: opts.slotId }); };
      return row;
    }
    // The filter finds a day by its tag word too: "eternal" lists the Eternal days.
    function tagWord(tag) { var info = N.tagInfo(tag); return info ? info.label : ''; }

    function draw() {
      tabsHost.innerHTML = '';
      tabsHost.appendChild(tabs(tab, function (t) { tab = t; if (opts.onTab) opts.onTab(t); draw(); }, 'data-nw-picker-tab'));
      list.innerHTML = '';
      var slot = slotById(_twDB(), opts.slotId);
      if (!slot) { list.appendChild(emptyMsg('This workspace no longer exists.')); return; }
      var shown = 0;
      if (tab === SORTED) {
        var add = el('button', 'nw-pick-new', '+ New sorted note');
        add.type = 'button';
        add.setAttribute('data-nw-pick-new', '');
        add.onclick = function () {
          var id = createSorted(opts.slotId);
          if (id) opts.onPick({ kind: SORTED, key: id, slotId: opts.slotId });
          else list.appendChild(emptyMsg('⚠ Not added — storage refused the write.'));
        };
        list.appendChild(add);
        sortedList(slot).forEach(function (n) {
          if (excluded(SORTED, n.id) || !matches(n.topic, n.content)) return;
          list.appendChild(pickRow(SORTED, n.id, n.topic || '(untitled)', N.firstLine(n.content)));
          shown++;
        });
      } else {
        var map = dateMap(slot);
        var todayText = N.dateNoteText(map, today);
        var todayTag = N.dateNoteTag(map, today);
        if (!excluded(DATE, today) && matches(N.dayLabel(today, today), todayText, tagWord(todayTag))) {
          list.appendChild(pickRow(DATE, today, N.dayLabel(today, today), N.firstLine(todayText) || 'Empty — start today’s draft', todayTag));
          shown++;
        }
        list.appendChild(calOpener('picker', function (opener) {
          openCalendar({
            slotId: opts.slotId,
            isDisabled: function (day) { return excluded(DATE, day); },
            onDay: function (day) {
              if (!excluded(DATE, day)) opts.onPick({ kind: DATE, key: day, slotId: opts.slotId });
            }
          }, opener);
        }));
        N.datedDays(map).forEach(function (d) {
          if (d.day === today || excluded(DATE, d.day) || !matches(N.dayLabel(d.day, today), d.text, tagWord(d.tag))) return;
          list.appendChild(pickRow(DATE, d.day, N.dayLabel(d.day, today), N.firstLine(d.text), d.tag));
          shown++;
        });
      }
      if (!shown) list.appendChild(emptyMsg(filter.trim() ? 'Nothing matches.' : tab === SORTED ? 'No other sorted notes yet.' : 'No other drafts yet.'));
    }

    search.oninput = function () { filter = search.value; draw(); };
    bar.appendChild(tabsHost);
    bar.appendChild(search);
    root.appendChild(bar);
    root.appendChild(list);
    draw();
    return root;
  }

  // ── side by side ──────────────────────────────────────────────────────────

  function resolvable(db, ref) {
    var slot = slotById(db, ref.slotId);
    return !!slot && (ref.kind === DATE || !!findSorted(slot, ref.key));
  }

  function renderSplit() {
    var db = _twDB();
    // A Sorted note deleted in another tab since the last draw is dropped here,
    // rather than drawn empty and invited to be typed into.
    var keep = state.panes.map(function (ref) { return resolvable(db, ref); });
    state.panes = state.panes.filter(function (ref, i) { return keep[i]; });
    state.sizes = state.sizes.filter(function (s, i) { return keep[i]; });
    if (state.panes.length < 2) {
      if (state.panes.length) state.active = state.panes[0];
      state.view = state.panes.length ? 'detail' : 'list';
      render();
      return;
    }
    if (state.sizes.length !== state.panes.length) state.sizes = state.panes.map(function () { return 1; });
    if (state.lastPane >= state.panes.length) state.lastPane = 0;

    btn.style.display = 'none';
    panel.style.display = 'none';
    split.innerHTML = '';
    split.style.display = 'flex';
    // The page behind stops scrolling (styles.css): its scrollbar would otherwise
    // sit beside a "full screen" view, and a wheel would scroll a page nobody sees.
    document.documentElement.classList.add('nw-split-open');

    var bar = el('div', 'nw-split-bar');
    bar.appendChild(el('span', 'nw-split-title', 'Notes'));
    var count = el('span', 'nw-split-count', state.panes.length + ' / ' + N.MAX_PANES);
    count.setAttribute('data-nw-pane-count', '');
    bar.appendChild(count);
    bar.appendChild(el('span', 'nw-split-spacer'));

    var add = el('button', 'nw-split-add', '＋ Open another');
    add.type = 'button';
    add.setAttribute('data-nw-add-pane', '');
    var full = state.panes.length >= N.MAX_PANES;
    add.disabled = full;
    add.title = full ? 'Up to ' + N.MAX_PANES + ' notes side by side' : 'Open another note beside these';
    add.onclick = function () { openPaneOverlay('add', -1); };
    bar.appendChild(add);

    var exit = iconBtn('exit', 'Exit side by side', 'data-nw-exit-split');
    exit.onclick = function () {
      state.active = state.panes[state.lastPane] || state.panes[0];
      state.view = 'detail';
      render();
    };
    bar.appendChild(exit);

    var close = iconBtn('close', 'Close notes', 'data-nw-close-split');
    close.onclick = function () { state.view = 'collapsed'; render(); };
    bar.appendChild(close);
    split.appendChild(bar);

    var paneBody = el('div', 'nw-split-body');
    livePanes = [];
    state.panes.forEach(function (ref, i) {
      if (i > 0) paneBody.appendChild(buildDivider(i - 1));
      var p = buildPane(db, ref, i);
      livePanes.push(p);
      paneBody.appendChild(p.el);
    });
    split.appendChild(paneBody);

    var toastEl = el('div', 'nw-toast');
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    toastEl.setAttribute('data-nw-toast', '');
    split.appendChild(toastEl);

    refreshSend();
    var focus = livePanes[state.lastPane];
    if (focus) setTimeout(function () { focus.textarea.focus(); }, 10);
  }

  function buildPane(db, ref, i) {
    var slot = slotById(db, ref.slotId);
    var sec = el('section', 'nw-pane nw-pane-' + ref.kind);
    sec.setAttribute('data-nw-pane', keyOf(ref));
    sec.setAttribute('data-nw-kind', ref.kind);
    sec.setAttribute('data-nw-key', ref.key);
    sec.style.flexGrow = String(state.sizes[i]);

    var head = el('div', 'nw-pane-head');
    head.appendChild(chip(ref.kind));
    var topic = null;
    if (ref.kind === DATE) {
      var t = el('span', 'nw-pane-title', N.dayLabel(ref.key, localToday()));
      t.title = ref.key;
      head.appendChild(t);
    } else {
      topic = el('input', 'nw-pane-topic');
      topic.type = 'text';
      topic.placeholder = 'Topic name…';
      topic.setAttribute('aria-label', 'Topic');
      topic.setAttribute('data-nw-topic', '');
      topic.value = text((findSorted(slot, ref.key) || {}).topic);
      head.appendChild(topic);
    }

    var send = el('button', 'nw-send-btn');
    send.type = 'button';
    send.setAttribute('data-nw-send', '');
    send.innerHTML = '<svg class="nw-icon-svg" viewBox="0 0 24 24" aria-hidden="true">' + ICONS.send + '</svg><span class="nw-send-label">Send</span>';
    head.appendChild(send);

    var change = iconBtn('change', 'Change this pane’s note', 'data-nw-pane-change');
    change.onclick = function () { openPaneOverlay('replace', i); };
    head.appendChild(change);

    var closeP = iconBtn('close', 'Close this pane', 'data-nw-pane-close');
    closeP.onclick = function () {
      state.panes.splice(i, 1);
      state.sizes.splice(i, 1);
      if (state.lastPane >= i && state.lastPane > 0) state.lastPane--;
      render();
    };
    head.appendChild(closeP);
    sec.appendChild(head);

    var ta = el('textarea', 'nw-pane-text');
    ta.setAttribute('data-nw-text', '');
    ta.setAttribute('aria-label', ref.kind === DATE ? 'Draft for ' + ref.key : 'Note text');
    ta.placeholder = ref.kind === DATE ? 'Draft freely…' : 'Sort it here…';
    ta.value = refText(slot, ref);
    sec.appendChild(ta);

    var statusEl = el('div', 'nw-status');
    statusEl.setAttribute('data-nw-status', 'idle');
    sec.appendChild(statusEl);

    var bar = null;
    var saver = makeSaver(ref, ref.kind === DATE
      ? dateResult(statusSetter(statusEl), function () { return bar; })
      : statusSetter(statusEl));
    if (ref.kind === DATE) {
      // A pane that locks or unlocks changes where every OTHER pane can send.
      bar = tagBar(ref, saver, ta, function () { refreshSend(); });
      sec.insertBefore(bar.el, ta);
      sec.insertBefore(bar.note, ta);
    }
    ta.addEventListener('input', function () { saver.queue({ content: ta.value }); refreshSend(); });
    ['select', 'keyup', 'mouseup', 'touchend', 'focus'].forEach(function (ev) { ta.addEventListener(ev, refreshSend); });
    if (topic) {
      topic.oninput = function () { saver.queue({ topic: topic.value.trim() }); };
      topic.onblur = function () { saver.flush(); };
      topic.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); ta.focus(); } };
    }
    sec.addEventListener('focusin', function () { state.lastPane = i; });

    var pane = {
      ref: ref, el: sec, textarea: ta, saver: saver, sendBtn: send, bar: bar,
      name: function () {
        return ref.kind === DATE ? N.dayLabel(ref.key, localToday()) : (topic && topic.value.trim()) || '(untitled)';
      }
    };
    // Keep the textarea's selection: without this the press would move focus
    // first, and on a touch screen the selection handles would go with it.
    send.addEventListener('mousedown', function (e) { e.preventDefault(); });
    send.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') e.preventDefault(); });
    send.onclick = function () { doSend(i, send); };
    return pane;
  }

  function selectionOf(ta) {
    var a = ta.selectionStart, b = ta.selectionEnd;
    return (typeof a === 'number' && b > a) ? ta.value.slice(a, b) : '';
  }

  // A locked Date pane can be SENT FROM — sending copies, and copying is what a
  // locked day is still for — but never sent INTO: that would edit its text.
  function paneLocked(p) { return !!(p.bar && p.bar.locked()); }

  // Sorted notes first — the draft → sorted direction is the one this is for.
  function sendTargets(i) {
    return livePanes
      .map(function (p, j) { return { p: p, j: j }; })
      .filter(function (x) { return x.j !== i && !paneLocked(x.p); })
      .sort(function (a, b) {
        var ka = a.p.ref.kind === SORTED ? 0 : 1, kb = b.p.ref.kind === SORTED ? 0 : 1;
        return ka - kb || a.j - b.j;
      })
      .map(function (x) { return x.p; });
  }

  var ALL_LOCKED = 'The other open notes are locked — choose ' + UNLOCK_WORD + ' on one to send into it.';

  // aria-disabled rather than disabled: a disabled button takes no click, and
  // the click is where a finger learns WHY it cannot send yet.
  function refreshSend() {
    livePanes.forEach(function (p, i) {
      var chosen = !N.isBlank(selectionOf(p.textarea));
      var open = sendTargets(i).length > 0;
      p.sendBtn.setAttribute('aria-disabled', String(!(chosen && open)));
      p.sendBtn.title = !chosen ? 'Highlight text in this note to send it'
        : open ? 'Send the highlighted text to another open note' : ALL_LOCKED;
    });
  }

  function doSend(i, anchor) {
    var src = livePanes[i];
    if (!src) return;
    var chosen = selectionOf(src.textarea);
    if (N.isBlank(chosen)) { toast('Highlight text in this note first, then press Send.'); return; }
    var targets = sendTargets(i);
    if (!targets.length) { toast(livePanes.length > 1 ? ALL_LOCKED : 'Open another note beside this one first.'); return; }
    if (targets.length === 1) { sendTo(targets[0], chosen); return; }
    openSendMenu(anchor, targets, chosen);
  }

  // Appends, never replaces, and saves at once — the source is left untouched.
  function sendTo(target, chosen) {
    // A menu can outlive the moment it was opened in: another tab may have
    // locked this target since.
    if (paneLocked(target)) { toast('⚠ Not sent — ' + target.name() + ' is locked'); refreshSend(); return; }
    var ta = target.textarea;
    var before = ta.value;
    ta.value = N.appendSent(before, chosen);
    target.saver.queue({ content: ta.value });
    var r = target.saver.flush();
    // Locked elsewhere before this tab heard: the sent words go back out. They
    // are still in the source pane, so taking them back loses nothing.
    if (r === 'locked') ta.value = before;
    // A value set from script fires no input event; a blank day just got words.
    if (target.bar) target.bar.draw();
    ta.scrollTop = ta.scrollHeight;
    target.el.classList.remove('nw-pane-flash');
    void target.el.offsetWidth;
    target.el.classList.add('nw-pane-flash');
    toast(r === 'saved' || r === 'unchanged' ? 'Sent to ' + target.name()
      : r === 'locked' ? '⚠ Not sent — ' + target.name() + ' was locked elsewhere'
      : '⚠ Could not save to ' + target.name());
    refreshSend();
  }

  var sendMenu = null, pickOverlay = null, toastTimer = null;

  function openSendMenu(anchor, targets, chosen) {
    closeTransient();
    sendMenu = el('div', 'nw-send-menu');
    sendMenu.setAttribute('role', 'menu');
    sendMenu.setAttribute('data-nw-send-menu', '');
    sendMenu.appendChild(el('div', 'nw-send-menu-label', 'Send to…'));
    targets.forEach(function (p) {
      var item = el('button', 'nw-send-item');
      item.type = 'button';
      item.setAttribute('role', 'menuitem');
      item.setAttribute('data-nw-send-to', keyOf(p.ref));
      item.appendChild(chip(p.ref.kind));
      item.appendChild(el('span', 'nw-send-name', p.name()));
      item.addEventListener('mousedown', function (e) { e.preventDefault(); });
      item.onclick = function () { closeTransient(); sendTo(p, chosen); };
      sendMenu.appendChild(item);
    });
    split.appendChild(sendMenu);
    var a = anchor.getBoundingClientRect(), s = split.getBoundingClientRect();
    var w = sendMenu.offsetWidth;
    sendMenu.style.top = (a.bottom - s.top + 4) + 'px';
    sendMenu.style.left = Math.max(8, Math.min(a.right - s.left - w, s.width - w - 8)) + 'px';
  }

  function openPaneOverlay(mode, index) {
    closeTransient();
    var slotId = state.panes[0].slotId;
    pickOverlay = el('div', 'nw-pick-overlay');
    pickOverlay.setAttribute('data-nw-pick-overlay', mode);
    var card = el('div', 'nw-pick-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', mode === 'add' ? 'Open another note' : 'Change this pane');
    var head = el('div', 'nw-pick-head');
    head.appendChild(el('span', 'nw-pick-title', mode === 'add' ? 'Open another note' : 'Change this pane'));
    var cancel = iconBtn('close', 'Cancel', 'data-nw-pick-cancel');
    cancel.onclick = closeTransient;
    head.appendChild(cancel);
    card.appendChild(head);
    card.appendChild(buildPicker({
      slotId: slotId,
      exclude: state.panes.map(keyOf),
      tab: mode === 'replace' ? state.panes[index].kind : SORTED,
      onPick: function (ref) {
        if (mode === 'add') {
          state.panes.push(ref);
          state.sizes = state.panes.map(function () { return 1; });
          state.lastPane = state.panes.length - 1;
        } else {
          state.panes[index] = ref;
          state.lastPane = index;
        }
        render();
      }
    }));
    pickOverlay.appendChild(card);
    pickOverlay.addEventListener('pointerdown', function (e) { if (e.target === pickOverlay) closeTransient(); });
    split.appendChild(pickOverlay);
    var f = card.querySelector('[data-nw-picker-filter]');
    if (f) setTimeout(function () { f.focus(); }, 10);
  }

  function closeTransient() {
    if (sendMenu && sendMenu.parentNode) sendMenu.parentNode.removeChild(sendMenu);
    if (pickOverlay && pickOverlay.parentNode) pickOverlay.parentNode.removeChild(pickOverlay);
    sendMenu = null;
    pickOverlay = null;
  }

  function toast(msg) {
    var t = split.querySelector('[data-nw-toast]');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('nw-toast-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('nw-toast-on'); }, 2400);
  }

  // ── the calendar pop-up ───────────────────────────────────────────────────
  // One month at a time, Sunday first. Every WRITTEN day is filled with the
  // colour of the tag it shows — red unclear unless another was chosen — and an
  // unwritten day stays plain. Choosing a day hands it to opts.onDay, exactly as
  // the date input it replaced did, so the pop-up itself writes nothing.
  //
  // It sits on <body>, above the panel and the side-by-side view, and keeps a
  // lifecycle of its own: closeTransient() must NOT close it, because it opens
  // from inside the very pick overlay closeTransient() exists to close.

  var cal = null;

  function openCalendar(opts, opener) {
    closeCalendar(false);
    var today = localToday();
    var month = N.monthOf(today);
    var focusDay = today;
    var map = {};

    var overlay = el('div', 'nw-cal-overlay');
    overlay.id = 'nw-cal';
    var card = el('div', 'nw-cal-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', 'Go to day');
    card.setAttribute('data-nw-cal', '');

    var head = el('div', 'nw-pick-head');
    head.appendChild(el('span', 'nw-pick-title', 'Go to day'));
    var x = iconBtn('close', 'Close the calendar', 'data-nw-cal-close');
    x.onclick = function () { closeCalendar(true); };
    head.appendChild(x);
    card.appendChild(head);

    var nav = el('div', 'nw-cal-nav');
    var prev = iconBtn('prev', 'Previous month', 'data-nw-cal-prev');
    var label = el('span', 'nw-cal-month');
    label.setAttribute('aria-live', 'polite');
    var next = iconBtn('next', 'Next month', 'data-nw-cal-next');
    var todayBtn = el('button', 'nw-cal-today', 'Today');
    todayBtn.type = 'button';
    todayBtn.setAttribute('data-nw-cal-today', '');
    nav.appendChild(prev);
    nav.appendChild(label);
    nav.appendChild(next);
    nav.appendChild(todayBtn);
    card.appendChild(nav);

    var dows = el('div', 'nw-cal-dows');
    dows.setAttribute('aria-hidden', 'true');
    N.WEEKDAYS.forEach(function (w) { dows.appendChild(el('span', 'nw-cal-dow', w)); });
    card.appendChild(dows);

    var grid = el('div', 'nw-cal-grid');
    card.appendChild(grid);

    var legend = el('div', 'nw-cal-legend');
    N.TAGS.forEach(function (t) {
      var k = el('span', 'nw-cal-key nw-tag-' + t.id);
      k.appendChild(el('span', 'nw-cal-swatch'));
      k.appendChild(el('span', null, t.label));
      legend.appendChild(k);
    });
    var blank = el('span', 'nw-cal-key nw-cal-key-blank');
    blank.appendChild(el('span', 'nw-cal-swatch'));
    blank.appendChild(el('span', null, 'nothing written'));
    legend.appendChild(blank);
    card.appendChild(legend);

    function load() { map = dateMap(slotById(_twDB(), opts.slotId)); }
    function off(day) { return !!(opts.isDisabled && opts.isDisabled(day)); }
    function cell(day) { return grid.querySelector('[data-nw-cal-day="' + day + '"]'); }

    function draw() {
      label.textContent = N.monthLabel(month);
      label.setAttribute('data-nw-cal-month', month);
      grid.innerHTML = '';
      N.monthGrid(month).forEach(function (c) {
        var tag = N.dateNoteTag(map, c.day);
        var b = el('button', 'nw-cal-day' + (tag ? ' nw-tag-' + tag : '') + (c.inMonth ? '' : ' nw-cal-out'));
        b.type = 'button';
        b.setAttribute('data-nw-cal-day', c.day);
        if (tag) b.setAttribute('data-nw-cal-tag', tag);
        if (c.day === today) b.setAttribute('aria-current', 'date');
        var disabled = off(c.day);
        if (disabled) b.setAttribute('aria-disabled', 'true');
        var says = N.dayLabel(c.day, today) + ' — ' + (tag ? N.tagInfo(tag).label : 'nothing written') +
          (disabled ? ' — already open' : '');
        b.setAttribute('aria-label', says);
        b.title = says;
        // One tab stop in the grid; the arrow keys move it.
        b.tabIndex = c.day === focusDay ? 0 : -1;
        b.appendChild(el('span', 'nw-cal-num', String(+c.day.slice(8, 10))));
        if (tag) {
          var g = el('span', 'nw-cal-glyph', N.tagInfo(tag).glyph);
          g.setAttribute('aria-hidden', 'true');
          b.appendChild(g);
        }
        b.onclick = function () { pick(c.day); };
        grid.appendChild(b);
      });
    }

    // The month buttons move the tab stop with them: to today when it is in
    // view, otherwise to the 1st.
    function showMonth(ym) {
      month = ym;
      focusDay = N.monthOf(today) === ym ? today : ym + '-01';
      draw();
    }

    function moveTo(day) {
      focusDay = day;
      month = N.monthOf(day);
      draw();
      var b = cell(day);
      if (b) b.focus();
    }

    function pick(day) {
      if (off(day)) return;
      var onDay = opts.onDay;
      closeCalendar(false);
      onDay(day);
    }

    prev.onclick = function () { showMonth(N.shiftMonth(month, -1)); };
    next.onclick = function () { showMonth(N.shiftMonth(month, 1)); };
    todayBtn.onclick = function () { moveTo(today); };

    grid.addEventListener('keydown', function (e) {
      var step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      var months = { PageUp: -1, PageDown: 1 }[e.key];
      if (!step && !months) return;
      e.preventDefault();
      moveTo(step ? N.addDays(focusDay, step) : N.addMonths(focusDay, e.shiftKey ? months * 12 : months));
    });

    // A modal keeps Tab inside itself.
    card.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var stops = Array.prototype.filter.call(card.querySelectorAll('button'), function (b) { return b.tabIndex >= 0; });
      if (!stops.length) return;
      var first = stops[0], last = stops[stops.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    // On click, not pointerdown: closing on the press would hand the release to
    // whatever sits under the scrim, and click it.
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeCalendar(true); });

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    // The page behind stops scrolling, as it does under side by side.
    document.documentElement.classList.add('nw-cal-open');
    cal = {
      el: overlay,
      opener: opener,
      context: opener ? opener.getAttribute('data-nw-cal-open') : '',
      refresh: function () { load(); draw(); }
    };
    cal.refresh();
    var start = cell(focusDay);
    if (start) start.focus();
  }

  // `restore` hands focus back to the button that opened the calendar. A list
  // redrawn underneath (another tab's edit) has replaced that button, so the
  // fallback is the same opener found again.
  function closeCalendar(restore) {
    if (!cal) return;
    var gone = cal;
    cal = null;
    if (gone.el.parentNode) gone.el.parentNode.removeChild(gone.el);
    document.documentElement.classList.remove('nw-cal-open');
    if (!restore) return;
    var back = gone.opener && gone.opener.isConnected ? gone.opener
      : document.querySelector('[data-nw-cal-open="' + gone.context + '"]');
    if (back) back.focus();
  }

  // Pointer events, so a mouse and a finger drive the one path. Sizes are
  // flex-grow ratios: they survive rotation into the stacked layout unchanged.
  function buildDivider(i) {
    var d = el('div', 'nw-divider');
    d.setAttribute('role', 'separator');
    d.setAttribute('tabindex', '0');
    d.setAttribute('aria-label', 'Resize notes (double-click to even out)');
    d.setAttribute('data-nw-divider', String(i));

    function stacked() { return getComputedStyle(d.parentNode).flexDirection === 'column'; }
    function apply() {
      livePanes[i].el.style.flexGrow = String(state.sizes[i]);
      livePanes[i + 1].el.style.flexGrow = String(state.sizes[i + 1]);
    }

    d.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button > 0) return;
      e.preventDefault();
      var col = stacked();
      var a = livePanes[i].el.getBoundingClientRect(), b = livePanes[i + 1].el.getBoundingClientRect();
      var sizeA = col ? a.height : a.width, total = sizeA + (col ? b.height : b.width);
      var grow = state.sizes[i] + state.sizes[i + 1];
      var start = col ? e.clientY : e.clientX;
      var MIN = Math.min(120, total / 2);
      try { d.setPointerCapture(e.pointerId); } catch (err) {}
      d.classList.add('nw-divider-active');
      function move(ev) {
        var next = Math.max(MIN, Math.min(total - MIN, sizeA + ((col ? ev.clientY : ev.clientX) - start)));
        state.sizes[i] = grow * next / total;
        state.sizes[i + 1] = grow - state.sizes[i];
        apply();
      }
      function up() {
        d.classList.remove('nw-divider-active');
        d.removeEventListener('pointermove', move);
        d.removeEventListener('pointerup', up);
        d.removeEventListener('pointercancel', up);
      }
      d.addEventListener('pointermove', move);
      d.addEventListener('pointerup', up);
      d.addEventListener('pointercancel', up);
    });
    d.addEventListener('dblclick', function () {
      state.sizes = state.panes.map(function () { return 1; });
      livePanes.forEach(function (p) { p.el.style.flexGrow = '1'; });
    });
    d.addEventListener('keydown', function (e) {
      var dir = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
      if (!dir) return;
      e.preventDefault();
      var grow = state.sizes[i] + state.sizes[i + 1];
      state.sizes[i] = Math.max(grow * 0.15, Math.min(grow * 0.85, state.sizes[i] + dir * grow * 0.05));
      state.sizes[i + 1] = grow - state.sizes[i];
      apply();
    });
    return d;
  }

  // ── mount ─────────────────────────────────────────────────────────────────

  function injectStyles() {
    var s = document.createElement('style');
    s.textContent = [
      '#nw-btn{position:fixed;right:16px;bottom:16px;z-index:9000;width:48px;height:48px;border-radius:50%;background:#6366f1;border:none;cursor:pointer;color:#fff;font-size:20px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(99,102,241,0.5);transition:background 0.15s,transform 0.1s;outline:none;}',
      '#nw-btn:hover{background:#7c3aed;transform:scale(1.07);}',
      '#nw-panel{position:fixed;right:16px;bottom:16px;z-index:9000;background:#080d18;border:1px solid #374151;border-radius:8px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.7);min-width:240px;min-height:280px;}',
      '#nw-resize-top{position:absolute;top:0;left:4px;right:0;height:4px;cursor:ns-resize;z-index:1;}',
      '#nw-resize-left{position:absolute;top:4px;left:0;width:4px;bottom:0;cursor:ew-resize;z-index:1;}',
      '#nw-header{display:flex;align-items:center;padding:10px 12px 10px 16px;border-bottom:1px solid #1f2937;gap:8px;flex-shrink:0;}',
      '#nw-header-title{flex:1;color:#f0f0f0;font-size:14px;font-weight:600;letter-spacing:0.03em;font-family:inherit;}',
      '.nw-icon-btn{background:none;border:none;cursor:pointer;color:#9ca3af;font-size:16px;padding:2px 4px;border-radius:4px;line-height:1;transition:color 0.1s,background 0.1s;flex-shrink:0;}',
      '.nw-icon-btn:hover{color:#f0f0f0;background:#1f2937;}',
      '#nw-body{flex:1;overflow-y:auto;padding:8px 0;display:flex;flex-direction:column;}',
      '#nw-body::-webkit-scrollbar{width:4px;}',
      '#nw-body::-webkit-scrollbar-thumb{background:#374151;border-radius:2px;}',
      '.nw-note-row{width:100%;display:flex;align-items:center;padding:8px 16px;cursor:pointer;gap:10px;transition:background 0.1s;color:#d1d5db;font-size:13px;background:transparent;border:0;border-bottom:1px solid #111827;text-align:left;font-family:inherit;}',
      '.nw-note-row:hover{background:#111827;color:#f0f0f0;}',
      '.nw-note-dot{width:6px;height:6px;border-radius:50%;background:#6366f1;flex-shrink:0;}',
      '.nw-note-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '#nw-add-btn{margin:10px 12px 4px;padding:7px 12px;background:transparent;border:1px dashed #374151;border-radius:6px;color:#6b7280;font-size:13px;cursor:pointer;text-align:left;transition:border-color 0.1s,color 0.1s;}',
      '#nw-add-btn:hover{border-color:#6366f1;color:#818cf8;}',
      '#nw-empty{color:#4b5563;font-size:12px;text-align:center;padding:24px 16px;}',
      '#nw-back-btn{background:none;border:none;cursor:pointer;color:#6366f1;font-size:13px;padding:2px 4px;border-radius:4px;transition:color 0.1s;flex-shrink:0;font-weight:600;}',
      '#nw-back-btn:hover{color:#818cf8;}',
      '#nw-topic{flex:1;color:#f0f0f0;font-size:14px;font-weight:600;outline:none;background:transparent;border:none;padding:0;font-family:inherit;min-width:0;}',
      '#nw-topic:empty::before{content:attr(data-placeholder);color:#4b5563;}',
      '#nw-content{flex:1;background:#0d1117;border:1px solid #1f2937;border-radius:6px;color:#d1d5db;font-size:13px;padding:10px;resize:none;outline:none;font-family:inherit;line-height:1.6;margin:0 12px 12px;}',
      '#nw-content:focus{border-color:#374151;}',
      '#nw-content::placeholder{color:#374151;}',
      '.nw-icon-svg{display:block;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;}',
      // Everything the Date tab, its tags and calendar, the picker and the
      // side-by-side view need is in styles.css, which every page loads —
      // structure and theme together.
    ].join('\n');
    document.head.appendChild(s);
  }

  function setupResize(panel) {
    var resizeTop = document.createElement('div');
    resizeTop.id = 'nw-resize-top';
    panel.appendChild(resizeTop);

    var resizeLeft = document.createElement('div');
    resizeLeft.id = 'nw-resize-left';
    panel.appendChild(resizeLeft);

    function startDrag(e, dir) {
      e.preventDefault();
      var startX = e.clientX, startY = e.clientY;
      var startW = panelW, startH = panelH;

      function onMove(ev) {
        if (dir === 'left' || dir === 'both') {
          panelW = Math.max(240, startW - (ev.clientX - startX));
          panel.style.width = panelW + 'px';
        }
        if (dir === 'top' || dir === 'both') {
          panelH = Math.max(280, startH - (ev.clientY - startY));
          panel.style.height = panelH + 'px';
        }
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }

    resizeTop.addEventListener('mousedown', function (e) { startDrag(e, 'top'); });
    resizeLeft.addEventListener('mousedown', function (e) { startDrag(e, 'left'); });
  }

  function mountWidget() {
    injectStyles();

    btn = document.createElement('button');
    btn.id = 'nw-btn';
    btn.title = 'Notes';
    btn.setAttribute('aria-label', 'Open notes');
    btn.innerHTML = '<svg class="nw-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>';
    btn.onclick = function () { state.view = 'list'; render(); };
    document.body.appendChild(btn);

    panel = document.createElement('div');
    panel.id = 'nw-panel';
    panel.style.display = 'none';

    setupResize(panel);

    var header = document.createElement('div');
    header.id = 'nw-header';

    headerTitle = document.createElement('div');
    headerTitle.style.cssText = 'display:flex;align-items:center;flex:1;gap:8px;min-width:0;';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'nw-icon-btn';
    closeBtn.textContent = '×';
    closeBtn.title = 'Close';
    closeBtn.setAttribute('aria-label', 'Close notes');
    closeBtn.style.fontSize = '20px';
    closeBtn.onclick = function () { state.view = 'collapsed'; render(); };

    header.appendChild(headerTitle);
    header.appendChild(closeBtn);

    body = document.createElement('div');
    body.id = 'nw-body';

    panel.appendChild(header);
    panel.appendChild(body);
    document.body.appendChild(panel);

    split = document.createElement('div');
    split.id = 'nw-split';
    split.setAttribute('role', 'dialog');
    split.setAttribute('aria-label', 'Notes side by side');
    split.style.display = 'none';
    document.body.appendChild(split);

    // A page going away still gets its pending text written.
    window.addEventListener('pagehide', flushAll);
    document.addEventListener('visibilitychange', function () { if (document.hidden) flushAll(); });

    // Escape closes the topmost thing only: the calendar first, which can sit
    // over a pick overlay that a second Escape then closes.
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (cal) { e.preventDefault(); closeCalendar(true); return; }
      if (sendMenu || pickOverlay) { e.preventDefault(); closeTransient(); }
    });
    document.addEventListener('pointerdown', function (e) {
      if (sendMenu && !sendMenu.contains(e.target)) closeTransient();
    });
    document.addEventListener('selectionchange', function () { if (state.view === 'split') refreshSend(); });

    // Another tab's edit shows up in a list at once. Only a list: redrawing an
    // editor would throw away the caret, the selection and unsaved text. An
    // editor's TAG does follow, though — re-reading it touches no text — so a
    // day locked in another tab freezes here too, before anything is typed
    // into it. An open calendar holds no text, so it always repaints.
    window.addEventListener('storage', function (e) {
      if (e.key !== 'track_db') return;
      if (state.view === 'list') { render(); return; }
      liveBars.forEach(function (b) { b.sync(); });
      if (cal) cal.refresh();
    });

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountWidget);
  } else {
    mountWidget();
  }
})();
