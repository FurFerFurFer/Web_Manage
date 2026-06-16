(function () {
  var state = { view: 'collapsed', activeId: null };
  var panelW = 320, panelH = 420;
  var saveTimer = null;

  function _twDB() { try { return JSON.parse(localStorage.getItem('track_db') || '{}'); } catch { return {}; } }
  function _twSlot() { var db = _twDB(), id = db.activeSlotId; return (db.slots || []).find(function(s) { return s.id === id; }) || (db.slots || [])[0] || null; }

  function loadNotes() {
    var s = _twSlot(); return (s && s.notes) ? s.notes : [];
  }

  function saveNotes(notes) {
    var db = _twDB();
    var slot = _twSlot();
    if (!slot) return;
    db.slots = (db.slots || []).map(function(s) { return s.id === slot.id ? Object.assign({}, s, { notes: notes }) : s; });
    localStorage.setItem('track_db', JSON.stringify(db));
  }

  (function migrate() {
    var old = localStorage.getItem('track_global_notes');
    if (!old) return;
    try {
      var oldNotes = JSON.parse(old).notes || [];
      if (!oldNotes.length) { localStorage.removeItem('track_global_notes'); return; }
      var db = _twDB(), id = db.activeSlotId;
      db.slots = (db.slots || []).map(function(s) {
        if (s.id !== id) return s;
        return Object.assign({}, s, { notes: (s.notes || []).concat(oldNotes) });
      });
      localStorage.setItem('track_db', JSON.stringify(db));
      localStorage.removeItem('track_global_notes');
    } catch(e) {}
  })();

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

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
      '.nw-note-row{display:flex;align-items:center;padding:8px 16px;cursor:pointer;gap:10px;transition:background 0.1s;color:#d1d5db;font-size:13px;border-bottom:1px solid #111827;}',
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
    ].join('\n');
    document.head.appendChild(s);
  }

  var panel, body, headerTitle, btn;

  function render() {
    if (state.view === 'collapsed') {
      btn.style.display = 'flex';
      panel.style.display = 'none';
      return;
    }
    btn.style.display = 'none';
    panel.style.display = 'flex';
    panel.style.width = panelW + 'px';
    panel.style.height = panelH + 'px';

    if (state.view === 'list') {
      renderList();
    } else if (state.view === 'detail') {
      renderDetail();
    }
  }

  function renderList() {
    var notes = loadNotes();
    body.style.overflow = '';
    body.style.padding  = '';
    headerTitle.innerHTML = '';
    var titleSpan = document.createElement('span');
    titleSpan.id = 'nw-header-title';
    titleSpan.textContent = 'Notes';
    headerTitle.appendChild(titleSpan);

    body.innerHTML = '';

    if (!notes.length) {
      var empty = document.createElement('div');
      empty.id = 'nw-empty';
      empty.textContent = 'No notes yet. Hit + to add one.';
      body.appendChild(empty);
    } else {
      notes.forEach(function (note) {
        var row = document.createElement('div');
        row.className = 'nw-note-row';
        row.onclick = function () { state.activeId = note.id; state.view = 'detail'; render(); };

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
      var notes = loadNotes();
      var newNote = { id: generateId(), topic: '', content: '', createdAt: Date.now() };
      notes.push(newNote);
      saveNotes(notes);
      state.activeId = newNote.id;
      state.view = 'detail';
      render();
    };
    body.appendChild(addBtn);
  }

  function renderDetail() {
    var notes = loadNotes();
    var note = notes.find(function (n) { return n.id === state.activeId; });
    if (!note) { state.view = 'list'; render(); return; }

    headerTitle.innerHTML = '';

    var backBtn = document.createElement('button');
    backBtn.id = 'nw-back-btn';
    backBtn.textContent = '←';
    backBtn.title = 'Back to list';
    backBtn.onclick = function () { state.view = 'list'; render(); };

    var topicEl = document.createElement('div');
    topicEl.id = 'nw-topic';
    topicEl.contentEditable = 'true';
    topicEl.setAttribute('data-placeholder', 'Topic name…');
    topicEl.textContent = note.topic || '';
    topicEl.onblur = function () {
      var n2 = loadNotes();
      var idx = n2.findIndex(function (x) { return x.id === state.activeId; });
      if (idx >= 0) { n2[idx].topic = topicEl.textContent.trim(); saveNotes(n2); }
    };
    topicEl.onkeydown = function (e) {
      if (e.key === 'Enter') { e.preventDefault(); topicEl.blur(); }
    };

    var delBtn = document.createElement('button');
    delBtn.className = 'nw-icon-btn';
    delBtn.title = 'Delete note';
    delBtn.textContent = '🗑';
    delBtn.onclick = function () {
      if (!window.confirm('Delete this note?')) return;
      var n2 = loadNotes().filter(function (x) { return x.id !== state.activeId; });
      saveNotes(n2);
      state.activeId = null;
      state.view = 'list';
      render();
    };

    headerTitle.appendChild(backBtn);
    headerTitle.appendChild(topicEl);
    headerTitle.appendChild(delBtn);

    body.innerHTML = '';

    var textarea = document.createElement('textarea');
    textarea.id = 'nw-content';
    textarea.placeholder = 'Write anything…';
    textarea.value = note.content || '';
    textarea.oninput = function () {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        var n2 = loadNotes();
        var idx = n2.findIndex(function (x) { return x.id === state.activeId; });
        if (idx >= 0) { n2[idx].content = textarea.value; saveNotes(n2); }
      }, 300);
    };

    body.style.padding = '0';
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.overflow = 'hidden';
    body.appendChild(textarea);

    setTimeout(function () { textarea.focus(); }, 10);
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
    btn.innerHTML = '✎';
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
    closeBtn.style.fontSize = '20px';
    closeBtn.onclick = function () { state.view = 'collapsed'; state.activeId = null; render(); };

    header.appendChild(headerTitle);
    header.appendChild(closeBtn);

    body = document.createElement('div');
    body.id = 'nw-body';

    panel.appendChild(header);
    panel.appendChild(body);
    document.body.appendChild(panel);

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountWidget);
  } else {
    mountWidget();
  }
})();
