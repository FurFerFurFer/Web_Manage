/* ── files-view.js ──────────────────────────────────────────────────────────
   The Storages page's FILES tab (`window.TrackFilesView.FilesView`): the
   user's 2026-11-13 request for a place to open, organize and rename files on
   the iPad and the laptop, laid out like SRCH → DIRECTORY (itself sketched
   over Notability's library).

   - LEFT: every folder and file in a fold-open tree, with a filter. A phone
     keeps it in a drawer.
   - RIGHT: the open folder's PAGE — its trail, `← back`, and its contents as
     tiles — or the open file: an image, a PDF (pdf.js, pages drawn only as
     they scroll in), a `.md` note (an editor with a Preview), text, or
     anything else with Download and Share.
   - `+` makes a New note (.md), a New folder, or uploads files (several at
     once; the laptop also takes a drop).
   - A tile is HELD about 0.4s until it rises, then dragged: between tiles to
     reorder, onto a folder (a tile's middle, or a row on the left) to move it
     there, or onto Top level. The engine is a port of MMDirectoryView's in
     sir-ks02.html — the same hold, slop, unfold, edge scroll and drawer
     spring — so the two pages feel the same. A drag deletes nothing and
     never asks; a refused drop says why and writes nothing.
   - A PDF or an image takes freehand HIGHLIGHTS (🖍, four colours, ⌫ with
     Undo) and a PDF takes named page PINS. Both are keys on the file's
     record in `files` (files-core.js), never a change to the file's bytes,
     so they sync with the rest of Track and Download gives the original.

   Plain JS (React.createElement, no Babel) on purpose: it is loaded only when
   FILES is first opened, so the page's other tabs and the other four pages
   pay nothing for it, and `node --check` sees all of it. Its CSS is injected
   on first use for the same reason.

   Writes go through ONE prop, `mutate(fn)` — the page's fresh
   read-modify-write of `files` alone — which returns the stored list, null
   for "nothing changed", or false for a save the browser refused. Every
   writer is files-core.js's; the bytes are file-store.js's.
*/
(function (global) {
  'use strict';

  var React = global.React;
  var h = React.createElement;
  var useState = React.useState, useEffect = React.useEffect, useRef = React.useRef;
  var useMemo = React.useMemo, useLayoutEffect = React.useLayoutEffect;
  var TF = global.TrackFiles, FS = global.TrackFileStore;

  var HOLD_MS = 400, SLOP_TOUCH = 10, SLOP_MOUSE = 6, UNFOLD_MS = 700, EDGE = 40, SPRING_X = 28, SPRING_MS = 700;

  // Exact pinned versions, loaded only when a viewer first needs them.
  var LIB = {
    pdf: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    pdfWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    marked: 'https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js',
    purify: 'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.6/purify.min.js'
  };

  var scriptLoads = {};
  function loadScript(src) {
    if (!scriptLoads[src]) {
      scriptLoads[src] = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = src; s.async = true;
        s.onload = function () { resolve(); };
        s.onerror = function () { delete scriptLoads[src]; reject(new Error('Could not load ' + src.split('/').slice(-3).join('/'))); };
        document.head.appendChild(s);
      });
    }
    return scriptLoads[src];
  }

  var mdReady = null;
  function loadMarkdown() {
    if (!mdReady) {
      mdReady = Promise.all([loadScript(LIB.marked), loadScript(LIB.purify)]).then(function () {
        // A link in a note opens beside Track, never in place of it.
        global.DOMPurify.addHook('afterSanitizeAttributes', function (node) {
          if (node.tagName === 'A') { node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener noreferrer'); }
        });
      }, function (e) { mdReady = null; throw e; });
    }
    return mdReady;
  }
  // Markdown → HTML that cannot run anything: DOMPurify strips scripts,
  // handlers and javascript: links from whatever marked produced.
  function renderMarkdown(text) {
    return global.DOMPurify.sanitize(global.marked.parse(String(text || ''), { gfm: true, breaks: true }));
  }

  // ── styles (injected once; tokens only, so both appearances work) ───────

  var CSS = [
    '.fdir .fdir-tile,.fdir .fdir-row{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;position:relative;',
    'transition:transform var(--motion-fast) var(--ease-ui),box-shadow var(--motion-fast) var(--ease-ui),opacity var(--motion-fast) var(--ease-ui),background-color var(--motion-fast) var(--ease-ui);}',
    '.fdir .fdir-tile{border:1px solid var(--color-border);background-color:var(--color-surface);color:var(--color-text);}',
    '.fdir [data-files-grid] .fdir-tile:hover{background-color:var(--color-surface-strong);}',
    '.fdir [data-files-grid] .fdir-tile[data-files-ticked="true"]{border-color:var(--color-primary-border);background-color:var(--color-primary-soft);}',
    '.fdir [data-files-grid] .fdir-tile[data-files-state="pressing"],.fdir .fdir-bar .fdir-row[data-files-state="pressing"]{background-color:var(--color-surface-strong);}',
    '.fdir [data-files-grid] .fdir-tile[data-files-state="lifted"],.fdir .fdir-bar .fdir-row[data-files-state="lifted"]{z-index:1;transform:translateY(-3px) scale(1.03);background-color:var(--color-surface-strong);box-shadow:var(--shadow-float);}',
    '.fdir [data-files-grid] .fdir-tile[data-files-state="placeholder"],.fdir .fdir-bar .fdir-row[data-files-state="placeholder"]{opacity:.35;}',
    '.fdir [data-files-grid] .fdir-tile[data-files-hit="before"]::before,.fdir [data-files-grid] .fdir-tile[data-files-hit="after"]::after{content:"";position:absolute;top:0;bottom:0;width:3px;border-radius:2px;background:var(--color-accent-done);pointer-events:none;}',
    '.fdir [data-files-grid] .fdir-tile[data-files-hit="before"]::before{left:-8px;}',
    '.fdir [data-files-grid] .fdir-tile[data-files-hit="after"]::after{right:-8px;}',
    '.fdir [data-files-grid] .fdir-tile[data-files-hit="nest"],.fdir .fdir-bar .fdir-row[data-files-hit="nest"]{background-color:var(--color-primary-soft);box-shadow:inset 0 0 0 1px var(--color-primary-border);}',
    '.fdir [data-files-grid] .fdir-tile[data-files-hit="refused"],.fdir .fdir-bar .fdir-row[data-files-hit="refused"]{background-color:var(--color-danger-soft);box-shadow:inset 0 0 0 1px var(--color-danger);cursor:not-allowed;}',
    '.fdir .fdir-bar .fdir-top[data-files-hit="top"]{border-style:solid;border-color:var(--color-primary-border);background-color:var(--color-primary-soft);color:var(--color-text);}',
    '.fdir .fdir-tick{border:1px solid var(--color-border-strong);color:transparent;}',
    '.fdir .fdir-tick[aria-checked="true"]{border-color:var(--color-primary-solid);background-color:var(--color-primary-solid);color:#fff;}',
    '.fdir .fdir-ghost{position:fixed;top:0;left:0;z-index:60;pointer-events:none;max-width:min(20rem,calc(100vw - 2rem));}',
    '.fdir .fdir-ghost-card{box-shadow:var(--shadow-float);background-color:var(--color-surface-strong);border:1px solid var(--color-border);color:var(--color-text);}',
    '.fdir .fdir-ghost.fdir-ghost-small{max-width:14rem;}',
    '.fdir .fdir-ghost.fdir-ghost-small .fdir-ghost-card{padding:.25rem .6rem;font-size:.75rem;}',
    '.fdir .fdir-name{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;}',
    '.fdir .fdir-md{font-family:ui-sans-serif,system-ui,sans-serif;font-size:15px;line-height:1.6;color:var(--color-text);user-select:text;-webkit-user-select:text;}',
    '.fdir .fdir-md h1{font-size:1.6em;font-weight:700;margin:.6em 0 .4em}.fdir .fdir-md h2{font-size:1.3em;font-weight:700;margin:.6em 0 .3em}',
    '.fdir .fdir-md h3{font-size:1.1em;font-weight:700;margin:.5em 0 .3em}.fdir .fdir-md p{margin:.5em 0}',
    '.fdir .fdir-md ul{list-style:disc;padding-left:1.4em;margin:.5em 0}.fdir .fdir-md ol{list-style:decimal;padding-left:1.4em;margin:.5em 0}',
    '.fdir .fdir-md a{color:var(--color-primary-text,#60a5fa);text-decoration:underline}',
    '.fdir .fdir-md code{font-family:ui-monospace,monospace;font-size:.9em;background:var(--color-surface-strong);padding:.1em .3em;border-radius:4px}',
    '.fdir .fdir-md pre{background:var(--color-surface-strong);padding:.8em;border-radius:6px;overflow-x:auto}.fdir .fdir-md pre code{background:none;padding:0}',
    '.fdir .fdir-md blockquote{border-left:3px solid var(--color-border-strong);padding-left:.8em;color:var(--color-text-muted)}',
    '.fdir .fdir-md table{border-collapse:collapse;margin:.5em 0}.fdir .fdir-md th,.fdir .fdir-md td{border:1px solid var(--color-border);padding:.3em .6em}',
    '.fdir .fdir-md img{max-width:100%}.fdir .fdir-md hr{border-color:var(--color-border);margin:1em 0}',
    '.fdir .fdir-editor{font-family:ui-monospace,monospace;font-size:14px;line-height:1.55;user-select:text;-webkit-user-select:text;}',
    '.fdir .fdir-pdf-page{margin:0 auto 12px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.25);position:relative}',
    '.fdir .fdir-pdf-page canvas{display:block;width:100%;height:100%}',
    '.fdir .fdir-img{touch-action:pinch-zoom pan-x pan-y}',
    '.fdir .fdir-img-frame{position:relative;flex:none}',
    '.fdir .fdir-img-frame img{display:block;width:100%;height:100%}',
    // the highlighter layer: multiply, so the ink under a stroke stays readable
    '.fdir .fdir-marks{position:absolute;left:0;top:0;width:100%;height:100%;mix-blend-mode:multiply;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}',
    '.fdir .fdir-marks[data-mode="draw"],.fdir .fdir-marks[data-mode="erase"]{touch-action:none}',
    '.fdir .fdir-marks[data-mode="draw"]{cursor:crosshair}.fdir .fdir-marks[data-mode="erase"]{cursor:cell}',
    '.fdir .fdir-pin-flags{position:absolute;left:6px;right:6px;top:6px;display:flex;flex-wrap:wrap;gap:4px;pointer-events:none;z-index:1}',
    '.fdir .fdir-pin-flag{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-radius:999px;padding:1px 8px;font-size:11px;',
    'background-color:var(--color-surface);color:var(--color-text);border:1px solid var(--color-border);box-shadow:var(--shadow-float)}',
    // a pressed tool: specific enough to beat the Grit remap of btn()'s classes
    '.fdir [data-files-tools] .fdir-tool[aria-pressed="true"]{background-color:var(--color-primary-soft);border-color:var(--color-primary-border);color:var(--color-text)}',
    '.fdir [data-files-tools] .fdir-swatch{width:26px;height:26px;border-radius:999px;border:2px solid var(--color-border);flex:none}',
    '.fdir [data-files-tools] .fdir-swatch[aria-pressed="true"]{border-color:var(--color-text);box-shadow:0 0 0 2px var(--color-surface) inset}',
    '.fdir .fdir-sheet{position:fixed;left:0;right:0;bottom:0;z-index:45;max-height:70vh;overflow-y:auto;border-radius:12px 12px 0 0;padding-bottom:calc(8px + var(--phone-tabbar-h, 0px))}'
  ].join('\n');
  function injectStyles() {
    if (document.querySelector('style[data-files-css]')) return;
    var s = document.createElement('style');
    s.setAttribute('data-files-css', '1');
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ── small helpers ────────────────────────────────────────────────────────

  var ICON = { folder: '📁', md: '📝', pdf: '📕', png: '🖼️', jpeg: '🖼️', image: '🖼️', text: '📄', other: '📦' };
  function iconOf(rec) { return ICON[TF.typeOfRecord(rec)] || ICON.other; }
  function q(name) { return '“' + name + '”'; }
  function pct(f) { return Math.round((f || 0) * 100) + '%'; }
  function newId() {
    return global.TrackStorage && global.TrackStorage.newId ? global.TrackStorage.newId()
      : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }
  function cls() { return Array.prototype.filter.call(arguments, Boolean).join(' '); }

  function statusLine(rec, st, ov, kids) {
    var kind = TF.kindOf(rec);
    if (kind === 'folder') return kids + (kids === 1 ? ' item' : ' items');
    if (kind === 'note') return 'Note · ' + TF.formatSize(TF.textBytes(rec.text));
    var size = TF.formatSize(rec.size);
    if (st.state === 'uploading') return 'Uploading ' + pct(st.progress);
    if (st.state === 'downloading') return 'Downloading ' + pct(st.progress);
    if (st.state === 'paused') return size + ' · upload paused';
    if (rec.driveId) return size + (st.local ? ' · in Drive · on this device' : ' · in Drive');
    if (st.local) return size + (ov.connected ? ' · waiting to upload' : ' · only on this device');
    if (!st.localKnown) return size;
    return size + ' · not uploaded yet';
  }

  function refusalText(why, names, targetName) {
    var who = names.length === 1 ? q(names[0]) : names.length + ' items';
    if (why === 'not-folder') return q(targetName) + ' is a file — only a folder can hold things.';
    if (why === 'self') return names.length === 1 ? 'Can\'t move ' + who + ' into itself.' : 'Can\'t move ' + who + ' into ' + q(targetName) + ': it is one of them.';
    if (why === 'inside') return 'Can\'t move ' + who + ' into ' + q(targetName) + ': ' + q(targetName) + ' is inside ' + (names.length === 1 ? 'it.' : 'one of them.');
    return 'That can\'t move there.';
  }

  // ── the view ─────────────────────────────────────────────────────────────

  function FilesView(props) {
    var files = Array.isArray(props.files) ? props.files : [];
    var mutate = props.mutate, slotId = props.slotId;

    var recs = useMemo(function () { return TF.records(files); }, [files]);
    var byId = useMemo(function () {
      var m = new Map(); recs.forEach(function (r) { if (!m.has(r.id)) m.set(r.id, r); }); return m;
    }, [recs]);
    // A data attribute is text; this maps it back to the id AS STORED.
    var keyMap = useMemo(function () {
      var m = new Map(); recs.forEach(function (r) { if (!m.has(String(r.id))) m.set(String(r.id), r.id); }); return m;
    }, [recs]);
    var index = useMemo(function () {
      var m = new Map();
      recs.forEach(function (r) { m.set(r.id, TF.childrenOf(files, r.id)); });
      return m;
    }, [files, recs]);

    var s1 = useState(null), openId = s1[0], setOpenId = s1[1];
    var s2 = useState(''), query = s2[0], setQuery = s2[1];
    var s3 = useState({}), collapsed = s3[0], setCollapsed = s3[1];
    var s4 = useState(function () { return !!(global.TrackViewport && global.TrackViewport.isPhone()); }), phone = s4[0], setPhone = s4[1];
    var s5 = useState(false), drawer = s5[0], setDrawer = s5[1];
    var s6 = useState(false), selectMode = s6[0], setSelectMode = s6[1];
    var s7 = useState([]), selected = s7[0], setSelected = s7[1];
    var s8 = useState(null), drag = s8[0], setDrag = s8[1];
    var s9 = useState(null), toast = s9[0], setToast = s9[1];
    var s10 = useState(null), dialog = s10[0], setDialog = s10[1];
    var s11 = useState(false), plusOpen = s11[0], setPlusOpen = s11[1];
    var s12 = useState(null), freshNote = s12[0], setFreshNote = s12[1];
    var s13 = useState(0), setTick = s13[1];
    var s14 = useState(false), dropping = s14[0], setDropping = s14[1];
    var s15 = useState(null), usage = s15[0], setUsage = s15[1];

    var toastTimer = useRef(null), inputRef = useRef(null), ghostRef = useRef(null), barRef = useRef(null);
    var suppressClickUntil = useRef(0), lastTouch = useRef(0), liveRef = useRef(null), engineRef = useRef(null);

    useEffect(function () { injectStyles(); }, []);
    useEffect(function () { return global.TrackViewport ? global.TrackViewport.subscribe(setPhone) : undefined; }, []);
    useEffect(function () { return FS.on(function () { setTick(function (t) { return t + 1; }); }); }, []);
    // On open: what this device holds, Google's sign-in fetched ahead of the
    // tap, and any upload a closed tab left halfway.
    useEffect(function () {
      FS.refreshLocal().then(function () { return FS.ensureQueued(slotId, TF.records(liveRef.current.files)); })
        .then(function () { FS.startQueue(); }, function () {});
      FS.preloadGis().then(null, function () {});
      FS.localUsage().then(setUsage);
    }, [slotId]);

    var ov = FS.overview();

    var open = openId != null ? byId.get(openId) || null : null;
    // deleted in another tab, or another workspace adopted: back to the top
    useEffect(function () { if (openId != null && !byId.has(openId)) setOpenId(null); }, [openId, byId]);
    useEffect(function () { setOpenId(null); setSelected([]); setSelectMode(false); }, [slotId]);
    // Asked by the page to open one record: a Source Dump text block's file
    // chip, or ?file=. Declared AFTER the reset above, so on mount the request
    // wins. `n` changes per request, so the same file can be asked for again.
    var req = props.openRequest;
    useEffect(function () {
      if (req && byId.has(req.id)) { setOpenId(req.id); setDrawer(false); setPlusOpen(false); }
    }, [req && req.n]);

    // The text blocks that name the open record (a READ the page answers from
    // sourceDumps: this script never sees that key), and where a tap on one
    // goes. Absent props: no list.
    var uses = open && !TF.isFolder(open) && props.usesOf ? props.usesOf(open.id) : [];

    var folderId = open ? (TF.isFolder(open) ? open.id : TF.folderOf(files, open.id)) : null;
    var folder = folderId != null ? byId.get(folderId) : null;
    var kids = folderId != null ? (index.get(folderId) || []) : TF.childrenOf(files, null);
    var kidsIds = kids.map(function (k) { return k.id; });
    var trail = open ? TF.pathTo(files, open.id) : [];

    // Ticks belong to one page.
    useEffect(function () { setSelected([]); setSelectMode(false); }, [folderId]);

    // A message, optionally with one action (the eraser's Undo), which then
    // stays long enough to reach.
    function say(text, action) {
      setToast({ text: text, action: action || null });
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(function () { setToast(null); }, action ? 7000 : 2800);
    }
    useEffect(function () { return function () { clearTimeout(toastTimer.current); }; }, []);

    function write(fn) {
      var r = mutate(fn);
      if (r === false) say('Not saved — this browser refused the write. Everything saved before is intact.');
      return r;
    }
    function nameOf(id) { var r = byId.get(id); return r ? r.name : '?'; }

    // ── create ──
    function newNote() {
      setPlusOpen(false);
      var id = newId();
      var rec = TF.newNote({ id: id, name: TF.uniqueName(files, folderId, 'Untitled.md'), parentId: folderId, now: Date.now() });
      if (Array.isArray(write(function (l) { return TF.withAdded(l, [rec]); }))) { setFreshNote(id); setOpenId(id); }
    }
    function newFolder() {
      setPlusOpen(false);
      setDialog({ kind: 'new-folder', parentId: folderId, initial: TF.uniqueName(files, folderId, 'New folder') });
    }
    function pickFiles() {
      setPlusOpen(false);
      if (inputRef.current) { inputRef.current.value = ''; inputRef.current.click(); }
    }

    // Each upload: a .md small enough becomes a note (its text in the slot);
    // anything else is kept on this device FIRST, then recorded, then queued
    // for Drive — so a refused save or a closed tab never strands a record
    // that points at bytes nobody has.
    function upload(list, parentId) {
      var picked = Array.prototype.slice.call(list || []);
      if (!picked.length) return Promise.resolve();
      var made = [], kept = [], failed = [];
      return picked.reduce(function (p, file) {
        return p.then(function () {
          var id = newId(), now = Date.now();
          if (TF.isNoteUpload(file.name, file.type, file.size)) {
            // a file that cannot be read is reported with the others, never
            // left to reject the whole batch
            return file.text().then(function (text) {
              made.push(TF.newNote({ id: id, name: file.name, text: text, parentId: parentId, now: now }));
            }, function (e) { failed.push(file.name + (e && e.message ? ' (' + e.message + ')' : '')); });
          }
          return FS.keepLocal(id, file).then(function () {
            made.push(TF.newFile({ id: id, name: file.name, mime: file.type, size: file.size, parentId: parentId, now: now }));
            kept.push({ id: id, name: TF.cleanName(file.name) || 'Untitled', mime: file.type, size: file.size });
          }, function (e) { failed.push(file.name + (e && e.message ? ' (' + e.message + ')' : '')); });
        });
      }, Promise.resolve()).then(function () {
        if (!made.length) { if (failed.length) say('Could not keep ' + failed.join(', ') + ' on this device.'); return; }
        var r = write(function (l) { return TF.withAdded(l, made); });
        if (!Array.isArray(r)) { kept.forEach(function (k) { FS.dropLocal(k.id); }); return; }
        return Promise.all(kept.map(function (k) { return FS.queueUpload(slotId, k.id, k.name, k.mime, k.size); })).then(function () {
          FS.startQueue();
          FS.localUsage().then(setUsage);
          var msg = 'Added ' + (made.length === 1 ? q(made[0].name) : made.length + ' items') + '.';
          if (failed.length) msg += ' Could not keep ' + failed.join(', ') + '.';
          say(msg);
        });
      });
    }

    // ── rename, delete, move ──
    function startRename(id) {
      var rec = byId.get(id);
      if (!rec) return;
      var parts = TF.isFolder(rec) ? { base: rec.name, ext: '' } : TF.splitName(rec.name);
      setDialog({ kind: 'rename', id: id, initial: parts.base, ext: parts.ext });
    }
    function saveDialog(text) {
      var dlg = dialog;
      if (!dlg) return;
      if (dlg.kind === 'new-folder') {
        var name = TF.cleanName(text);
        if (!name) return;
        var rec = TF.newFolder({ id: newId(), name: name, parentId: dlg.parentId, now: Date.now() });
        if (Array.isArray(write(function (l) { return TF.withAdded(l, [rec]); }))) { setDialog(null); say('Made the folder ' + q(name) + '.'); }
        return;
      }
      var cur = byId.get(dlg.id);
      if (!cur) { setDialog(null); return; }
      var full = TF.renamedName(cur, text + (dlg.ext || ''));
      if (full === null) return;
      var r = write(function (l) { return TF.withRenamed(l, dlg.id, text + (dlg.ext || ''), Date.now()); });
      if (r === false) return;
      setDialog(null);
      if (Array.isArray(r) && TF.kindOf(cur) === 'file') FS.renamed(cur, full);
    }

    // Every path through here deletes, so the prompt is HERE, after the
    // no-op guard and before any write (AGENTS.md, "Confirm before deleting").
    function remove(ids) {
      var gone = ids.map(function (id) { return byId.get(id); }).filter(Boolean);
      if (!gone.length) return;
      var lines = [];
      var fileN = gone.filter(function (r) { return TF.kindOf(r) === 'file'; });
      var noteN = gone.filter(function (r) { return TF.kindOf(r) === 'note'; });
      var dirN = gone.filter(function (r) { return TF.isFolder(r); });
      var head = gone.length === 1
        ? 'Delete ' + (dirN.length ? 'the folder ' : noteN.length ? 'the note ' : '') + q(gone[0].name) + '?'
        : 'Delete these ' + gone.length + ' items?';
      dirN.forEach(function (d) {
        var inside = (index.get(d.id) || []).filter(function (k) { return ids.indexOf(k.id) < 0; }).length;
        var up = TF.folderOf(files, d.id);
        if (inside) lines.push('The ' + inside + (inside === 1 ? ' item' : ' items') + ' inside ' + q(d.name) + ' move up to ' + (up == null ? 'the top level' : q(nameOf(up))) + ' — nothing in it is deleted.');
      });
      if (noteN.length) lines.push(noteN.length === 1 ? 'A note\'s text cannot be restored.' : 'The notes\' text cannot be restored.');
      if (fileN.some(function (r) { return r.driveId; })) lines.push('Files in Google Drive go to Drive\'s trash, where they can be restored for 30 days.');
      if (fileN.some(function (r) { return !r.driveId; })) lines.push('A file not yet uploaded to Drive cannot be restored.');
      // highlights and pins live on the record, so they go with it (Drive's
      // trash holds the file, never them)
      var hlN = 0, pinN = 0;
      fileN.forEach(function (r) { hlN += TF.highlightsOf(r).length; pinN += TF.pinsOf(r).length; });
      if (hlN || pinN) {
        var marks = [];
        if (hlN) marks.push(hlN + (hlN === 1 ? ' highlight' : ' highlights'));
        if (pinN) marks.push(pinN + (pinN === 1 ? ' pin' : ' pins'));
        lines.push((fileN.length === 1 ? 'Its ' : 'Their ') + marks.join(' and ') + (hlN + pinN === 1 ? ' goes' : ' go') +
          ' with ' + (fileN.length === 1 ? 'it.' : 'them.'));
      }
      if (!global.confirm(head + (lines.length ? '\n\n' + lines.join('\n') : ''))) return;
      var r = write(function (l) { return TF.withRemoved(l, ids); });
      if (!Array.isArray(r)) return;
      fileN.forEach(function (rec) { FS.forget(rec); });
      setSelected([]);
      if (open && ids.indexOf(open.id) >= 0) setOpenId(TF.folderOf(files, open.id));
      FS.localUsage().then(setUsage);
      say(gone.length === 1 ? 'Deleted ' + q(gone[0].name) + '.' : 'Deleted ' + gone.length + ' items.');
    }

    function move(ids, fromId, targetId) {
      var r = write(function (l) { return TF.withMoved(l, ids, fromId, targetId); });
      if (!Array.isArray(r)) return;
      setSelected(function (s) { return s.filter(function (id) { return ids.indexOf(id) < 0; }); });
      var who = ids.length === 1 ? q(nameOf(ids[0])) : ids.length + ' items';
      say(targetId == null ? 'Moved ' + who + ' to the top level.' : 'Moved ' + who + ' into ' + q(nameOf(targetId)) + '.');
    }
    function arrange(ids, targetId, before, listId) {
      write(function (l) { return TF.withArranged(l, ids, targetId, before, listId); });
    }

    function saveText(id, text) {
      return write(function (l) { return TF.withText(l, id, text, Date.now()); });
    }

    // ── the hold-to-lift engine (MMDirectoryView's, ported) ──
    liveRef.current = { files: files, byId: byId, keyMap: keyMap, index: index, folderId: folderId, kidsIds: kidsIds,
      selected: selected, selectMode: selectMode, collapsed: collapsed, query: query, move: move, arrange: arrange, say: say };

    if (!engineRef.current) engineRef.current = makeEngine(liveRef, ghostRef, barRef, setDrag, setCollapsed, setDrawer,
      suppressClickUntil, lastTouch);
    var engine = engineRef.current;
    useEffect(function () { return function () { engine.cancel(); }; }, []);
    useLayoutEffect(function () { if (drag && drag.phase === 'drag') engine.placeGhost(); }, [drag && drag.phase]);

    function clicked(e) {
      if (Date.now() < suppressClickUntil.current) { if (e) e.preventDefault(); return false; }
      return true;
    }
    function openRec(id) { setOpenId(id); setDrawer(false); setPlusOpen(false); }
    function goUp() {
      if (!open) return;
      setOpenId(TF.isFolder(open) ? TF.folderOf(files, open.id) : folderId);
    }
    function toggleFold(id) {
      setCollapsed(function (c) { var n = Object.assign({}, c), k = String(id); if (n[k]) delete n[k]; else n[k] = true; return n; });
    }
    function tickToggle(id) {
      setSelected(function (s) { return s.indexOf(id) >= 0 ? s.filter(function (x) { return x !== id; }) : s.concat([id]); });
    }

    // ── the tree ──
    var lq = query.trim().toLowerCase();
    var matchSet = useMemo(function () {
      var out = new Set();
      if (!lq) return out;
      recs.forEach(function (r) {
        if (String(r.name || '').toLowerCase().indexOf(lq) < 0) return;
        var cur = r, seen = new Set();
        while (cur && !seen.has(cur.id)) { seen.add(cur.id); out.add(cur.id); var p = TF.parentOf(cur); cur = p == null ? null : byId.get(p); }
      });
      return out;
    }, [recs, lq, byId]);
    var hit = drag && drag.phase === 'drag' ? drag.hit : null;
    var lifting = !!drag && (drag.phase === 'lift' || drag.phase === 'drag');

    function treeRows(list, depth, path) {
      var out = [];
      list.forEach(function (r) {
        if (lq && !matchSet.has(r.id)) return;
        var loop = path.indexOf(r.id) >= 0;
        var sub = loop ? [] : (index.get(r.id) || []);
        var shown = sub.filter(function (k) { return !lq || matchSet.has(k.id); });
        var folded = !lq && !!collapsed[String(r.id)];
        var isOpen = open && open.id === r.id;
        var rowHit = hit && hit.kind === 'nest' && hit.targetId === r.id ? (hit.refused ? 'refused' : 'nest') : undefined;
        var state = drag && drag.source === 'row' && drag.pressId === r.id
          ? (drag.phase === 'drag' ? 'placeholder' : drag.phase === 'lift' ? 'lifted' : 'pressing') : undefined;
        out.push(h('div', {
          key: 'r' + path.join('/') + '/' + String(r.id),
          'data-files-row': String(r.id), 'data-files-hit': rowHit, 'data-files-state': state,
          'data-files-kind': TF.kindOf(r),
          className: cls('fdir-row flex items-center gap-1.5 rounded px-1 py-1 text-xs cursor-pointer',
            isOpen ? 'bg-gray-800 text-gray-100' : 'text-gray-400'),
          style: { paddingLeft: 'calc(4px + ' + depth + ' * 14px)' },
          title: r.name,
          onMouseDown: loop ? undefined : function (e) { engine.press(e, 'mouse', r, 'row', path.length ? path[path.length - 1] : null); },
          onTouchStart: loop ? undefined : function (e) { engine.press(e, 'touch', r, 'row', path.length ? path[path.length - 1] : null); },
          onContextMenu: function (e) { if (lifting) e.preventDefault(); },
          onClick: function (e) { if (clicked(e)) openRec(r.id); }
        },
          h('button', {
            type: 'button', 'data-files-caret': String(r.id), 'aria-label': folded ? 'Unfold' : 'Fold',
            onClick: function (e) { e.stopPropagation(); toggleFold(r.id); },
            className: cls('w-3 shrink-0 text-[9px]', shown.length && !loop ? 'text-gray-500' : 'invisible')
          }, folded ? '▸' : '▾'),
          h('span', { className: 'shrink-0', 'aria-hidden': 'true' }, iconOf(r)),
          h('span', { className: 'flex-1 min-w-0 truncate' }, r.name),
          loop ? h('span', { className: 'text-[10px] text-gray-500' }, '↻') : null,
          !loop && TF.isFolder(r) && sub.length ? h('span', { className: 'text-[10px] text-gray-600' }, sub.length) : null
        ));
        if (!loop && !folded && shown.length) out = out.concat(treeRows(shown, depth + 1, path.concat([r.id])));
      });
      return out;
    }

    // ── panels ──
    var barShown = !phone || drawer;
    var dragFrom = drag ? drag.fromId : null;
    var bar = h('aside', {
      ref: barRef, 'data-files-bar': true,
      className: cls('fdir-bar flex flex-col bg-gray-900 border-r border-gray-800',
        phone ? 'fixed left-0 top-0 bottom-0 z-40 w-72 shadow-2xl' : 'w-64 shrink-0'),
      style: phone ? { display: drawer ? 'flex' : 'none', paddingBottom: 'var(--phone-tabbar-h, 0px)' } : undefined
    },
      h('div', { className: 'p-2 border-b border-gray-800' },
        lifting && dragFrom != null
          ? h('div', {
            'data-files-top': true, 'data-files-hit': hit && hit.kind === 'top' ? 'top' : undefined,
            className: 'fdir-top rounded border border-dashed border-gray-600 px-2 py-1.5 text-xs text-gray-400 text-center'
          }, '⤒ Top level')
          : h('input', {
            'data-files-filter': true, value: query, placeholder: 'Filter files',
            onChange: function (e) { setQuery(e.target.value); },
            className: 'w-full bg-gray-950 border border-gray-800 rounded px-2 py-1 text-xs text-gray-200 outline-none'
          })),
      h('div', { 'data-files-bar-scroll': true, 'data-files-scroll': true, className: 'flex-1 overflow-y-auto p-1' },
        h('div', {
          'data-files-home': true,
          className: cls('fdir-row flex items-center gap-1.5 rounded px-1 py-1 text-xs cursor-pointer', !open ? 'bg-gray-800 text-gray-100' : 'text-gray-400'),
          onClick: function () { openRec(null); }
        }, h('span', { className: 'w-3' }), h('span', null, '🗂️'), h('span', { className: 'flex-1' }, 'All files')),
        treeRows(TF.childrenOf(files, null), 1, []),
        recs.length === 0 ? h('div', { className: 'px-2 py-3 text-[11px] text-gray-600' }, 'Nothing yet.') : null),
      h(DrivePanel, { ov: ov, usage: usage, say: say, recs: recs, setUsage: setUsage })
    );

    var page;
    if (open && !TF.isFolder(open)) {
      page = TF.kindOf(open) === 'note'
        ? h(NoteView, {
          key: open.id, rec: open, fresh: freshNote === open.id, onText: saveText, uses: uses, onUse: props.onOpenUse,
          onBack: goUp, onRename: function () { startRename(open.id); }, onDelete: function () { remove([open.id]); },
          trail: trail, nameOf: nameOf, onCrumb: openRec, phone: phone, onDrawer: function () { setDrawer(true); }
        })
        : h(FileView, {
          key: open.id, rec: open, ov: ov, say: say, write: write, uses: uses, onUse: props.onOpenUse,
          onBack: goUp, onRename: function () { startRename(open.id); }, onDelete: function () { remove([open.id]); },
          trail: trail, nameOf: nameOf, onCrumb: openRec, phone: phone, onDrawer: function () { setDrawer(true); }
        });
    } else {
      page = h(FolderPage, {
        folder: folder, kids: kids, index: index, ov: ov, drag: drag, hit: hit,
        selectMode: selectMode, selected: selected, plusOpen: plusOpen, dropping: dropping,
        trail: trail, nameOf: nameOf, phone: phone,
        onDrawer: function () { setDrawer(true); },
        onCrumb: openRec, onBack: goUp,
        onPlus: function () { setPlusOpen(!plusOpen); },
        onNewNote: newNote, onNewFolder: newFolder, onUpload: pickFiles,
        onSelectMode: function (on) { setSelectMode(on); if (!on) setSelected([]); },
        onAll: function () { setSelected(kidsIds.slice()); }, onNone: function () { setSelected([]); },
        onRename: function () { if (selected.length === 1) startRename(selected[0]); else if (folder) startRename(folder.id); },
        onDelete: function () { if (selected.length) remove(selected.slice()); else if (folder) remove([folder.id]); },
        onTileClick: function (e, r) {
          if (!clicked(e)) return;
          if (selectMode) { tickToggle(r.id); return; }
          openRec(r.id);
        },
        onTick: function (e, r) { e.stopPropagation(); tickToggle(r.id); },
        onPress: function (e, kind, r) { engine.press(e, kind, r, 'tile', folderId); },
        lifting: lifting,
        onDropFiles: function (list) { setDropping(false); upload(list, folderId); },
        setDropping: setDropping
      });
    }

    var label = drag && drag.label;
    return h('div', { className: 'fdir flex flex-1 min-h-0 h-full relative', 'data-files-view': true },
      phone && drawer ? h('div', { className: 'fixed inset-0 z-30 bg-black/50', 'data-files-backdrop': true, onClick: function () { setDrawer(false); } }) : null,
      bar,
      h('main', { className: 'flex-1 min-w-0 flex flex-col min-h-0' }, page),
      h('input', {
        // Off-screen, not display:none (an iPad will not always open a hidden
        // input), and no `accept`, so it offers Photos, Camera and Files alike.
        ref: inputRef, type: 'file', multiple: true, 'data-files-input': true, tabIndex: -1, 'aria-hidden': 'true',
        style: { position: 'fixed', left: '-9999px', top: 0, width: '1px', height: '1px', opacity: 0 },
        onChange: function (e) { upload(e.target.files, folderId); }
      }),
      drag && drag.phase === 'drag' ? h('div', { ref: ghostRef, className: 'fdir-ghost', 'data-files-ghost': true },
        h('div', { className: 'fdir-ghost-card rounded-lg px-3 py-2 text-sm flex items-center gap-2' },
          h('span', null, drag.count > 1 ? '🗂️' : drag.icon),
          h('span', { className: 'truncate' }, label),
          drag.count > 1 ? h('span', { className: 'ml-1 rounded-full bg-gray-700 px-1.5 text-[10px] text-gray-100', 'data-files-count': true }, drag.count) : null)) : null,
      toast ? h('div', {
        'data-files-toast': true, role: 'status',
        className: 'fixed left-1/2 z-50 -translate-x-1/2 rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-xs text-gray-100 shadow-xl max-w-[90vw]',
        style: { bottom: 'calc(16px + var(--phone-tabbar-h, 0px))' }
      }, h('span', { 'data-files-toast-text': true }, toast.text),
        toast.action ? h('button', {
          type: 'button', 'data-files-toast-action': true,
          onClick: function () { var run = toast.action.run; clearTimeout(toastTimer.current); setToast(null); run(); },
          className: 'ml-3 font-bold underline text-gray-100'
        }, toast.action.label) : null) : null,
      dialog ? h(NameDialog, {
        dialog: dialog, onCancel: function () { setDialog(null); }, onSave: saveDialog
      }) : null
    );
  }

  // ── the drag engine ──────────────────────────────────────────────────────

  function makeEngine(liveRef, ghostRef, barRef, setDrag, setCollapsed, setDrawer, suppressClickUntil, lastTouch) {
    var d = null;

    function barShown() { var b = barRef.current; return !!b && b.getClientRects().length > 0; }
    function sameHit(a, b) {
      return (!a || !b) ? a === b : a.kind === b.kind && a.targetId === b.targetId && a.before === b.before && a.refused === b.refused;
    }
    function hitAt(x, y) {
      var live = liveRef.current;
      if (!d) return null;
      var el = document.elementFromPoint(x, y);
      if (!el) return null;
      if (el.closest('[data-files-top]')) return d.fromId == null ? null : { kind: 'top' };
      var row = el.closest('[data-files-row]');
      if (row) {
        var tid = live.keyMap.get(row.getAttribute('data-files-row'));
        if (tid === undefined) return null;
        var why = TF.moveRefusal(live.files, d.ids, d.fromId, tid);
        if (why === 'same' || why === 'missing') return null;
        return { kind: 'nest', targetId: tid, refused: why || null };
      }
      var grid = el.closest('[data-files-grid]');
      if (!grid) return null;
      var best = null;
      grid.querySelectorAll('[data-files-tile]').forEach(function (t) {
        var id = live.keyMap.get(t.getAttribute('data-files-tile'));
        if (id === undefined || d.ids.indexOf(id) >= 0) return;
        var r = t.getBoundingClientRect();
        var dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
        var dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
        var dist = Math.hypot(dx, dy);
        if (!best || dist < best.dist) best = { id: id, r: r, dist: dist };
      });
      if (!best) return null;
      var r = best.r, rec = live.byId.get(best.id);
      var inside = best.dist === 0;
      // the middle of a folder tile nests there; its edges still reorder
      if (inside && TF.isFolder(rec)) {
        var fx = (x - r.left) / r.width, fy = (y - r.top) / r.height;
        if (fx > 0.25 && fx < 0.75 && fy > 0.12 && fy < 0.88) {
          var w2 = TF.moveRefusal(live.files, d.ids, d.fromId, best.id);
          if (w2 === 'same' || w2 === 'missing') return null;
          return { kind: 'nest', targetId: best.id, refused: w2 || null, tile: true };
        }
      }
      if (d.source !== 'tile') return null;
      var before = x < r.left + r.width / 2;
      if (TF.withArranged(live.files, d.ids, best.id, before, live.folderId) === live.files) return null;
      return { kind: 'arrange', targetId: best.id, before: before };
    }
    function placeGhost() {
      var g = ghostRef.current, b = barRef.current;
      if (!d || !g) return;
      var over = !!b && barShown() && (function () { var r = b.getBoundingClientRect(); return d.x >= r.left && d.x <= r.right && d.y >= r.top && d.y <= r.bottom; })();
      g.classList.toggle('fdir-ghost-small', over);
      g.style.width = over ? 'auto' : Math.min(d.w, 320) + 'px';
      g.style.transform = over ? 'translate(' + (d.x + 14) + 'px,' + (d.y + 12) + 'px)'
        : 'translate(' + (d.x - Math.min(d.offX, 300)) + 'px,' + (d.y - d.offY) + 'px)';
    }
    function clearUnfold() { if (d && d.unfold) { clearTimeout(d.unfold.t); d.unfold = null; } }
    function apply(hit) {
      if (!d || sameHit(d.hit, hit)) return;
      d.hit = hit;
      setDrag(function (prev) { return prev && Object.assign({}, prev, { hit: hit }); });
      clearUnfold();
      if (hit && hit.kind === 'nest' && !hit.tile) {
        var live = liveRef.current, id = hit.targetId;
        if ((live.index.get(id) || []).length && live.collapsed[String(id)]) {
          d.unfold = { t: setTimeout(function () {
            setCollapsed(function (c) { var n = Object.assign({}, c); delete n[String(id)]; return n; });
            requestAnimationFrame(function () { if (d) apply(hitAt(d.x, d.y)); });
          }, UNFOLD_MS) };
        }
      }
    }
    function step() {
      if (!d || d.phase !== 'drag') return;
      if (d.edge && d.scroller) { d.scroller.scrollTop += d.edge * 10; apply(hitAt(d.x, d.y)); }
      d.raf = requestAnimationFrame(step);
    }
    function unbind() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('touchmove', onTouchMove, { passive: false });
      document.removeEventListener('touchend', onTouchEnd, { passive: false });
      document.removeEventListener('touchcancel', onTouchCancel);
      document.removeEventListener('contextmenu', onContextMenu);
    }
    function cancel() {
      if (d) { clearTimeout(d.timer); clearUnfold(); clearTimeout(d.spring); if (d.raf) cancelAnimationFrame(d.raf); }
      d = null;
      unbind();
      setDrag(null);
    }
    function lift() {
      if (!d || d.phase !== 'press') return;
      d.timer = null; d.phase = 'lift'; d.lx = d.x; d.ly = d.y;
      setDrag(function (prev) { return prev && Object.assign({}, prev, { phase: 'lift' }); });
    }
    function move(x, y, ev) {
      if (!d) return;
      d.x = x; d.y = y;
      if (d.phase === 'press') {
        // moved before it rose: a scroll (finger) or nothing (mouse), never a drag
        if (Math.hypot(x - d.x0, y - d.y0) > (d.kind === 'touch' ? SLOP_TOUCH : SLOP_MOUSE)) cancel();
        return;
      }
      if (d.kind === 'touch' && ev && ev.cancelable) ev.preventDefault();
      if (d.phase === 'lift') {
        if (Math.hypot(x - d.lx, y - d.ly) < 3) return;
        d.phase = 'drag';
        setDrag(function (prev) { return prev && Object.assign({}, prev, { phase: 'drag' }); });
        d.raf = requestAnimationFrame(step);
      }
      placeGhost();
      var under = document.elementFromPoint(x, y);
      var sc = under && under.closest('[data-files-scroll]');
      d.scroller = sc || null;
      if (sc) { var r = sc.getBoundingClientRect(); d.edge = y < r.top + EDGE ? -1 : y > r.bottom - EDGE ? 1 : 0; } else d.edge = 0;
      // a phone keeps the tree in a drawer: hold at the left edge to open it
      if (!barShown() && x < SPRING_X) {
        if (!d.spring) d.spring = setTimeout(function () {
          if (!d) return;
          d.spring = null; d.sprung = true; setDrawer(true);
          requestAnimationFrame(function () { if (d) apply(hitAt(d.x, d.y)); });
        }, SPRING_MS);
      } else if (d.spring) { clearTimeout(d.spring); d.spring = null; }
      apply(hitAt(x, y));
    }
    function commit(hit, ids, fromId) {
      var live = liveRef.current;
      if (hit.refused) {
        live.say(refusalText(hit.refused, ids.map(function (id) { var r = live.byId.get(id); return r ? r.name : '?'; }),
          (live.byId.get(hit.targetId) || {}).name || '?'));
        return;
      }
      if (hit.kind === 'arrange') { live.arrange(ids, hit.targetId, hit.before, fromId); return; }
      live.move(ids, fromId, hit.kind === 'top' ? null : hit.targetId);
    }
    function end(ev) {
      if (!d) return;
      if (d.phase === 'press') { cancel(); return; }     // a tap or a click: let it through
      suppressClickUntil.current = Date.now() + 500;      // a lift is never also a click
      if (d.kind === 'touch' && ev && ev.cancelable) ev.preventDefault();
      var hit = d.phase === 'drag' ? d.hit : null, ids = d.ids, fromId = d.fromId, sprung = d.sprung;
      cancel();
      if (sprung) setDrawer(false);
      if (hit) commit(hit, ids, fromId);
    }
    function onMouseMove(e) { move(e.clientX, e.clientY, e); }
    function onMouseUp(e) { end(e); }
    function onKey(e) { if (e.key === 'Escape' && d) { suppressClickUntil.current = Date.now() + 500; cancel(); } }
    function onTouchMove(e) { var t = e.touches[0]; if (t) move(t.clientX, t.clientY, e); }
    function onTouchEnd(e) { end(e); }
    function onTouchCancel() { cancel(); }
    function onContextMenu(e) { if (d) e.preventDefault(); }

    function press(e, kind, rec, source, fromId) {
      if (d) return;
      if (kind === 'mouse') {
        if (e.button !== 0) return;
        if (Date.now() - lastTouch.current < 800) return;   // the mouse events a tap is followed by
      }
      if (e.target.closest && e.target.closest('[data-files-tick], button, input, textarea, a')) return;
      var pt = kind === 'touch' ? e.touches[0] : e;
      if (!pt || (kind === 'touch' && e.touches.length > 1)) return;
      if (kind === 'touch') lastTouch.current = Date.now();
      var live = liveRef.current;
      if (source === 'row' && live.query.trim()) return;   // a filtered tree cannot promise a place
      var ids = source === 'tile' && live.selectMode && live.selected.indexOf(rec.id) >= 0
        ? live.kidsIds.filter(function (id) { return live.selected.indexOf(id) >= 0; }) : [rec.id];
      var r = e.currentTarget.getBoundingClientRect();
      d = { kind: kind, source: source, phase: 'press', ids: ids, fromId: fromId === undefined ? null : fromId,
        x0: pt.clientX, y0: pt.clientY, x: pt.clientX, y: pt.clientY, offX: pt.clientX - r.left, offY: pt.clientY - r.top,
        w: r.width, hit: null, timer: null, raf: null, edge: 0, scroller: null, unfold: null, spring: null, sprung: false };
      setDrag({ phase: 'press', source: source, pressId: rec.id, ids: ids, fromId: d.fromId, label: ids.length > 1 ? ids.length + ' items' : rec.name,
        icon: iconOf(rec), count: ids.length, hit: null });
      d.timer = setTimeout(lift, HOLD_MS);
      if (kind === 'mouse') {
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.addEventListener('keydown', onKey);
      } else {
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onTouchEnd, { passive: false });
        document.addEventListener('touchcancel', onTouchCancel);
        document.addEventListener('contextmenu', onContextMenu);
      }
    }
    return { press: press, cancel: cancel, placeGhost: placeGhost };
  }

  // ── the Drive line under the tree ────────────────────────────────────────

  function DrivePanel(p) {
    var ov = p.ov;
    function connect() {
      FS.connect().then(function () { p.say('Connected to Google Drive.'); }, function (e) { p.say((e && e.message) || 'Google Drive did not connect.'); });
    }
    function clear() {
      FS.clearDownloaded(p.recs).then(function (n) {
        p.say(n ? 'Removed ' + n + (n === 1 ? ' downloaded copy' : ' downloaded copies') + ' from this device. They are still in Drive.' : 'Nothing to remove: every copy here is the only one, or there are none.');
        FS.localUsage().then(p.setUsage);
      });
    }
    var line, act = null;
    if (ov.deviceStorage) line = h('span', { className: 'text-red-400' }, 'This browser can\'t keep files: ' + ov.deviceStorage);
    else if (!ov.setUp) line = 'Google Drive isn\'t set up yet — files stay on this device.';
    else if (!ov.connected) {
      line = 'Google Drive: not connected' + (ov.pending ? ' · ' + ov.pending + ' waiting to upload' : '');
      act = h('button', { type: 'button', 'data-files-connect': true, onClick: connect,
        className: 'mt-1 w-full rounded bg-indigo-700 px-2 py-1 text-[11px] font-bold text-white' }, 'Connect Drive');
    } else {
      line = 'Google Drive: connected' + (ov.pending ? ' · ' + ov.pending + ' to upload' : ' ✓');
      if (ov.error && ov.pending) act = h('button', { type: 'button', 'data-files-retry': true,
        onClick: function () { FS.startQueue(); },
        className: 'mt-1 w-full rounded border border-gray-700 px-2 py-1 text-[11px] text-gray-300' }, 'Retry upload');
    }
    return h('div', { 'data-files-drive': true, className: 'border-t border-gray-800 p-2 text-[11px] text-gray-500 space-y-1' },
      h('div', null, line),
      ov.error && ov.setUp ? h('div', { className: 'text-amber-400', 'data-files-drive-error': true }, ov.error) : null,
      act,
      p.usage != null ? h('div', { 'data-files-usage': true, className: 'flex items-center justify-between gap-2 pt-1' },
        h('span', null, 'On this device: ' + TF.formatSize(p.usage)),
        p.usage > 0 ? h('button', { type: 'button', 'data-files-clear': true, onClick: clear, title: 'Remove the copies on this device that are safely in Drive',
          className: 'text-gray-500 underline' }, 'Free up') : null) : null);
  }

  // ── the header every right-hand page shares ──────────────────────────────

  function Crumbs(p) {
    var parts = [h('button', { key: 'top', type: 'button', 'data-files-crumb': 'top', onClick: function () { p.onCrumb(null); },
      className: 'text-gray-500' }, 'All files')];
    p.trail.slice(0, -1).forEach(function (id) {
      parts.push(h('span', { key: 's' + id, className: 'text-gray-700' }, '›'));
      parts.push(h('button', { key: 'c' + id, type: 'button', 'data-files-crumb': String(id), onClick: function () { p.onCrumb(id); },
        className: 'text-gray-500 truncate max-w-[10rem]' }, p.nameOf(id)));
    });
    return h('div', { className: 'flex items-center gap-1 text-[11px] min-w-0 overflow-hidden' }, parts);
  }

  function PageHead(p) {
    return h('div', { className: 'px-3 pt-3 pb-2 border-b border-gray-800 space-y-1.5' },
      h('div', { className: 'flex items-center gap-2' },
        p.phone ? h('button', { type: 'button', 'data-files-drawer-toggle': true, onClick: p.onDrawer, 'aria-label': 'Folders',
          className: 'rounded border border-gray-700 px-2 py-1 text-xs text-gray-300' }, '☰') : null,
        p.onBack ? h('button', { type: 'button', 'data-files-back': true, onClick: p.onBack,
          className: 'text-xs text-gray-500' }, '← back') : null,
        h(Crumbs, { trail: p.trail, nameOf: p.nameOf, onCrumb: p.onCrumb })),
      h('div', { className: 'flex items-center gap-2 flex-wrap' },
        h('span', { className: 'text-xl', 'aria-hidden': 'true' }, p.icon),
        h('h2', { className: 'text-base font-bold text-gray-100 min-w-0 truncate', 'data-files-title': true }, p.title),
        p.children));
  }

  function btn(label, props, extra) {
    return h('button', Object.assign({ type: 'button',
      className: cls('rounded border border-gray-700 px-2 py-1 text-xs text-gray-300', extra) }, props), label);
  }

  // ── a folder's page ──────────────────────────────────────────────────────

  function FolderPage(p) {
    var title = p.folder ? p.folder.name : 'All files';
    var sel = p.selected;
    var tools = [];
    tools.push(h('div', { key: 'plus', className: 'relative' },
      h('button', { type: 'button', 'data-files-plus': true, onClick: p.onPlus, 'aria-expanded': p.plusOpen ? 'true' : 'false',
        className: 'rounded bg-indigo-700 px-3 py-1 text-sm font-bold text-white' }, '+'),
      p.plusOpen ? h('div', { className: 'absolute left-0 top-full mt-1 z-20 w-48 rounded-lg border border-gray-700 bg-gray-900 p-1 shadow-xl', 'data-files-plus-menu': true },
        h('button', { type: 'button', 'data-files-new-note': true, onClick: p.onNewNote, className: 'block w-full rounded px-2 py-2 text-left text-xs text-gray-200' }, '📝  New note (.md)'),
        h('button', { type: 'button', 'data-files-new-folder': true, onClick: p.onNewFolder, className: 'block w-full rounded px-2 py-2 text-left text-xs text-gray-200' }, '📁  New folder'),
        h('button', { type: 'button', 'data-files-upload': true, onClick: p.onUpload, className: 'block w-full rounded px-2 py-2 text-left text-xs text-gray-200' }, '⬆️  Upload files…')) : null));
    if (!p.selectMode) {
      if (p.kids.length) tools.push(btn('Select', { key: 'sel', 'data-files-select': true, onClick: function () { p.onSelectMode(true); } }));
      if (p.folder) {
        tools.push(btn('✎ Rename', { key: 'ren', 'data-files-rename': true, onClick: p.onRename }));
        tools.push(btn('🗑', { key: 'del', 'data-files-delete': true, onClick: p.onDelete, title: 'Delete this folder' }));
      }
    } else {
      tools.push(btn('All', { key: 'all', 'data-files-all': true, onClick: p.onAll }));
      tools.push(btn('None', { key: 'none', 'data-files-none': true, onClick: p.onNone }));
      if (sel.length === 1) tools.push(btn('✎ Rename', { key: 'ren1', 'data-files-sel-rename': true, onClick: p.onRename }));
      if (sel.length) tools.push(btn('🗑 Delete ' + sel.length, { key: 'del1', 'data-files-sel-delete': true, onClick: p.onDelete }));
      tools.push(btn('Done', { key: 'done', 'data-files-done': true, onClick: function () { p.onSelectMode(false); } }));
    }

    var tiles = p.kids.map(function (r) {
      var st = FS.statusOf(r.id);
      var state = p.drag && p.drag.source === 'tile' && p.drag.ids.indexOf(r.id) >= 0
        ? (p.drag.phase === 'drag' ? 'placeholder' : p.drag.phase === 'lift' ? 'lifted' : 'pressing') : undefined;
      var hit = p.hit && p.hit.targetId === r.id
        ? (p.hit.kind === 'arrange' ? (p.hit.before ? 'before' : 'after') : p.hit.kind === 'nest' ? (p.hit.refused ? 'refused' : 'nest') : undefined) : undefined;
      var ticked = sel.indexOf(r.id) >= 0;
      return h('div', {
        key: String(r.id), 'data-files-tile': String(r.id), 'data-files-kind': TF.kindOf(r), 'data-files-type': TF.typeOfRecord(r),
        'data-files-state': state, 'data-files-hit': hit, 'data-files-ticked': ticked ? 'true' : undefined,
        className: 'fdir-tile rounded-lg p-3 flex flex-col items-center text-center gap-1 cursor-pointer',
        onMouseDown: function (e) { p.onPress(e, 'mouse', r); },
        onTouchStart: function (e) { p.onPress(e, 'touch', r); },
        onContextMenu: function (e) { if (p.lifting) e.preventDefault(); },
        onClick: function (e) { p.onTileClick(e, r); }
      },
        p.selectMode ? h('span', {
          'data-files-tick': String(r.id), role: 'checkbox', 'aria-checked': ticked ? 'true' : 'false',
          onClick: function (e) { p.onTick(e, r); },
          className: 'fdir-tick absolute left-2 top-2 w-5 h-5 rounded text-[11px] leading-5'
        }, '✓') : null,
        h('div', { className: 'text-4xl leading-none py-1', 'aria-hidden': 'true' }, iconOf(r)),
        h('div', { className: 'fdir-name text-xs font-medium', title: r.name }, r.name),
        h('div', { className: 'text-[10px] text-gray-500', 'data-files-status': true },
          statusLine(r, st, p.ov, (p.index.get(r.id) || []).length)));
    });

    var dropHandlers = {
      onDragOver: function (e) {
        if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) {
          e.preventDefault(); if (!p.dropping) p.setDropping(true);
        }
      },
      onDragLeave: function (e) { if (e.currentTarget === e.target) p.setDropping(false); },
      onDrop: function (e) {
        if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
        e.preventDefault(); p.onDropFiles(e.dataTransfer.files);
      }
    };

    return h('div', Object.assign({ className: 'flex-1 min-h-0 flex flex-col relative', 'data-files-page': p.folder ? String(p.folder.id) : 'top' }, dropHandlers),
      h(PageHead, { phone: p.phone, onDrawer: p.onDrawer, onBack: p.folder ? p.onBack : null, trail: p.trail, nameOf: p.nameOf,
        onCrumb: p.onCrumb, icon: p.folder ? '📁' : '🗂️', title: title }, tools),
      h('div', { className: 'flex-1 min-h-0 overflow-y-auto p-3', 'data-files-scroll': true },
        p.kids.length
          ? h('div', { 'data-files-grid': true, className: 'grid gap-3',
            style: { gridTemplateColumns: 'repeat(auto-fill, minmax(' + (p.phone ? 112 : 140) + 'px, 1fr))' } }, tiles)
          : h('div', { className: 'py-16 text-center text-xs text-gray-500', 'data-files-empty': true },
            'Nothing here yet. Tap + to add a note, a folder or files', h('br'), 'PNG, JPEG, PDF, .md, or anything else.')),
      p.dropping ? h('div', { 'data-files-dropzone': true,
        className: 'absolute inset-2 z-10 rounded-xl border-2 border-dashed border-indigo-500 bg-gray-950/80 flex items-center justify-center text-sm text-gray-200 pointer-events-none' },
        'Drop to add here') : null);
  }

  // ── a note ───────────────────────────────────────────────────────────────

  // "Used in N text blocks", under a file's or a note's head: the Source Dump
  // text blocks whose `fileId` names it. Closed until tapped; a row opens
  // SOURCE DUMP on that title with the MM's card ringed. Drawn only when at
  // least one block names the record.
  function UsedIn(p) {
    var s1 = useState(false), shown = s1[0], setShown = s1[1];
    var uses = p.uses || [];
    if (!uses.length) return null;
    var n = uses.length;
    return h('div', { className: 'px-3 py-1.5 border-b border-gray-800 text-xs', 'data-files-used-in': String(n) },
      h('button', { type: 'button', 'data-files-used-in-toggle': true, 'aria-expanded': shown ? 'true' : 'false',
        onClick: function () { setShown(!shown); }, className: 'text-gray-400' },
        (shown ? '▾ ' : '▸ ') + 'Used in ' + n + ' text block' + (n === 1 ? '' : 's')),
      shown ? h('div', { className: 'mt-1 space-y-0.5' }, uses.map(function (u) {
        return h('button', { key: u.key, type: 'button', 'data-files-use': u.key,
          onClick: function () { if (p.onUse) p.onUse(u); },
          className: 'block w-full text-left rounded px-2 py-1 hover:bg-gray-800 truncate' },
          h('span', { className: 'text-gray-500' }, u.where + ' · '),
          h('span', { className: 'text-gray-200' }, u.label));
      })) : null);
  }

  function NoteView(p) {
    var rec = p.rec;
    var s1 = useState(typeof rec.text === 'string' ? rec.text : ''), draft = s1[0], setDraft = s1[1];
    var s2 = useState(p.fresh || !rec.text ? 'edit' : 'preview'), mode = s2[0], setMode = s2[1];
    var s3 = useState('saved'), saveState = s3[0], setSaveState = s3[1];
    var draftRef = useRef(draft), dirty = useRef(false), timer = useRef(null), recRef = useRef(rec), onTextRef = useRef(p.onText);
    draftRef.current = draft; recRef.current = rec; onTextRef.current = p.onText;

    function flush() {
      clearTimeout(timer.current);
      if (!dirty.current) return;
      var v = draftRef.current;
      if (!TF.textFits(v)) { setSaveState('too-big'); return; }
      var r = onTextRef.current(recRef.current.id, v);
      if (r === false) { setSaveState('refused'); return; }
      dirty.current = false;
      setSaveState('saved');
    }
    // Another tab's edit is adopted unless this one has unsaved typing.
    useEffect(function () {
      if (!dirty.current && typeof rec.text === 'string' && rec.text !== draftRef.current) setDraft(rec.text);
    }, [rec.text]);
    useEffect(function () {
      function hide() { if (document.hidden) flush(); }
      document.addEventListener('visibilitychange', hide);
      global.addEventListener('pagehide', flush);
      return function () { document.removeEventListener('visibilitychange', hide); global.removeEventListener('pagehide', flush); flush(); };
    }, []);
    function change(v) {
      setDraft(v); dirty.current = true;
      setSaveState(TF.textFits(v) ? 'saving' : 'too-big');
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 500);
    }
    var stateText = { saved: 'Saved', saving: 'Saving…', refused: 'Not saved — the browser refused it', 'too-big': 'Too long to save: a note holds up to 256 KB' }[saveState];

    return h('div', { className: 'flex-1 min-h-0 flex flex-col', 'data-files-viewer': String(rec.id), 'data-files-viewer-type': 'md' },
      h(PageHead, { phone: p.phone, onDrawer: p.onDrawer, onBack: p.onBack, trail: p.trail, nameOf: p.nameOf, onCrumb: p.onCrumb,
        icon: '📝', title: rec.name },
        h('div', { className: 'flex rounded border border-gray-700 overflow-hidden' },
          h('button', { type: 'button', 'data-files-mode': 'edit', onClick: function () { setMode('edit'); },
            className: cls('px-2 py-1 text-xs', mode === 'edit' ? 'bg-white text-gray-950' : 'text-gray-400') }, 'Edit'),
          h('button', { type: 'button', 'data-files-mode': 'preview', onClick: function () { flush(); setMode('preview'); },
            className: cls('px-2 py-1 text-xs', mode === 'preview' ? 'bg-white text-gray-950' : 'text-gray-400') }, 'Preview')),
        btn('✎ Rename', { 'data-files-rename': true, onClick: p.onRename }),
        btn('🗑', { 'data-files-delete': true, onClick: p.onDelete, title: 'Delete this note' }),
        h('span', { 'data-files-save': saveState, className: cls('text-[11px]', saveState === 'saved' || saveState === 'saving' ? 'text-gray-500' : 'text-red-400') }, stateText)),
      h(UsedIn, { uses: p.uses, onUse: p.onUse }),
      mode === 'edit'
        ? h('textarea', {
          'data-files-editor': true, value: draft, autoFocus: !!p.fresh, spellCheck: true,
          onChange: function (e) { change(e.target.value); }, onBlur: flush,
          placeholder: '# Title\n\nWrite in Markdown…',
          className: 'fdir-editor flex-1 min-h-0 w-full resize-none bg-gray-950 p-4 text-gray-100 outline-none'
        })
        : h('div', { className: 'flex-1 min-h-0 overflow-y-auto p-4', 'data-files-scroll': true },
          h(MarkdownPreview, { text: draft })));
  }

  function MarkdownPreview(p) {
    var s1 = useState(!!(global.marked && global.DOMPurify)), ready = s1[0], setReady = s1[1];
    var s2 = useState(null), err = s2[0], setErr = s2[1];
    useEffect(function () {
      if (ready) return;
      var alive = true;
      loadMarkdown().then(function () { if (alive) setReady(true); }, function (e) { if (alive) setErr(e.message); });
      return function () { alive = false; };
    }, [ready]);
    if (err) return h('div', null,
      h('div', { className: 'text-[11px] text-amber-400 mb-2' }, 'Preview needs the network (' + err + '). The text:'),
      h('pre', { className: 'fdir-editor whitespace-pre-wrap text-gray-200', 'data-files-preview': 'raw' }, p.text));
    if (!ready) return h('div', { className: 'text-xs text-gray-500' }, 'Loading preview…');
    if (!String(p.text || '').trim()) return h('div', { className: 'text-xs text-gray-500', 'data-files-preview': 'empty' }, 'This note is empty. Switch to Edit to write.');
    return h('div', { className: 'fdir-md max-w-3xl', 'data-files-preview': 'html', dangerouslySetInnerHTML: { __html: renderMarkdown(p.text) } });
  }

  // ── any other file ───────────────────────────────────────────────────────

  function FileView(p) {
    var rec = p.rec;
    var type = TF.typeOfRecord(rec);
    var s1 = useState({ phase: 'loading' }), st = s1[0], setSt = s1[1];
    var s2 = useState(0), attempt = s2[0], setAttempt = s2[1];
    // the highlighter: null (a Pencil draws, a finger scrolls), 'draw' (every
    // pointer draws) or 'erase'
    var s3 = useState(null), mode = s3[0], setMode = s3[1];
    var s4 = useState(lastColor), color = s4[0], setColorNow = s4[1];
    var recRef = useRef(rec); recRef.current = rec;

    // ── highlights and pins: keys on this record, never the file's bytes ──
    function recIn(list, id) { return TF.records(list).filter(function (r) { return r.id === id; })[0] || null; }
    var marks = {
      mode: mode, color: color,
      setMode: setMode,
      setColor: function (c) { lastColor = c; setColorNow(c); if (mode === 'erase') setMode(null); },
      addStroke: function (page, pts, ratio) {
        var cur = recRef.current;
        var simple = TF.simplifyStroke(pts, MARK_EPS, ratio);
        if (simple.length < 4) return;
        var hl = { id: newId(), page: page, color: color, w: MARK_W, pts: simple, createdAt: Date.now() };
        if (!TF.marksFit(cur, hl)) { p.say('This file\'s highlights are full (256 KB a file). Erase some to add more.'); return; }
        p.write(function (l) { return TF.withHighlight(l, cur.id, hl); });
      },
      // One gesture, one write, no prompt: Undo puts back the very records,
      // at their stored places (docs/contracts/destructive-controls.md).
      erase: function (ids) {
        var id = recRef.current.id, entries = [];
        var r = p.write(function (l) { entries = TF.highlightEntries(recIn(l, id), ids); return TF.withoutHighlights(l, id, ids); });
        if (!Array.isArray(r) || !entries.length) return;
        var n = entries.length;
        p.say(n === 1 ? 'Erased a highlight.' : 'Erased ' + n + ' highlights.', { label: 'Undo', run: function () {
          var back = p.write(function (l) { return TF.withHighlightsRestored(l, id, entries); });
          if (Array.isArray(back)) p.say(n === 1 ? 'The highlight is back.' : 'The ' + n + ' highlights are back.');
        } });
      },
      // true when the dialog may close
      addPin: function (page, text) {
        var cur = recRef.current, now = Date.now(), name = TF.cleanName(text);
        if (!name) return false;
        var pin = { id: newId(), page: page, name: name, createdAt: now, updatedAt: now };
        if (!TF.marksFit(cur, pin)) { p.say('This file\'s highlights and pins are full (256 KB a file).'); return false; }
        var r = p.write(function (l) { return TF.withPin(l, cur.id, pin); });
        if (Array.isArray(r)) p.say('Pinned page ' + page + ' as ' + q(name) + '.');
        return r !== false;
      },
      renamePin: function (pinId, text) {
        if (!TF.cleanName(text)) return false;
        return p.write(function (l) { return TF.withPinRenamed(l, recRef.current.id, pinId, text, Date.now()); }) !== false;
      },
      // the prompt is here, after the no-op guard and before the write
      deletePin: function (pinId) {
        var cur = recRef.current;
        var pin = TF.pinsOf(cur).filter(function (x) { return x.id === pinId; })[0];
        if (!pin) return;
        if (!global.confirm('Delete the pin ' + q(pin.name) + ' on page ' + pin.page + '?\n\nOnly the pin goes: the page and its highlights stay.')) return;
        var r = p.write(function (l) { return TF.withoutPin(l, cur.id, pinId); });
        if (Array.isArray(r)) p.say('Deleted the pin ' + q(pin.name) + '.');
      }
    };

    useEffect(function () {
      var alive = true, url = null;
      setSt({ phase: 'loading' });
      FS.fetchBlob(rec).then(function (blob) {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setSt({ phase: 'ready', blob: blob, url: url });
      }, function (e) {
        if (!alive) return;
        var code = e && e.code;
        setSt({ phase: code === 'needs-drive' || code === 'not-uploaded' || code === 'setup' ? code : 'error', message: (e && e.message) || 'Could not open it' });
      });
      return function () { alive = false; if (url) URL.revokeObjectURL(url); };
    }, [rec.id, attempt]);
    // Waiting on the other device's upload: try again once it lands. (A file
    // already open here is not reloaded when its own upload finishes.)
    useEffect(function () {
      if (rec.driveId && st.phase === 'not-uploaded') setAttempt(function (a) { return a + 1; });
    }, [rec.driveId]);

    function connect() {
      FS.connect().then(function () { setAttempt(function (a) { return a + 1; }); }, function (e) { p.say((e && e.message) || 'Google Drive did not connect.'); });
    }
    var shareable = st.phase === 'ready' && global.navigator && navigator.canShare && (function () {
      try { return navigator.canShare({ files: [new File([st.blob], rec.name, { type: rec.mime || st.blob.type || '' })] }); } catch (e) { return false; }
    })();
    function share() {
      var f = new File([st.blob], rec.name, { type: rec.mime || st.blob.type || '' });
      navigator.share({ files: [f], title: rec.name }).then(null, function () {});
    }

    var dl = FS.statusOf(rec.id);
    var body;
    if (st.phase === 'loading') body = h('div', { className: 'p-6 text-xs text-gray-500', 'data-files-loading': true },
      dl.state === 'downloading' ? 'Downloading from Google Drive… ' + pct(dl.progress) : 'Opening…');
    else if (st.phase === 'needs-drive') body = h('div', { className: 'p-6 text-sm text-gray-300 space-y-3', 'data-files-needs-drive': true },
      h('div', null, 'This file is in your Google Drive (' + TF.formatSize(rec.size) + '). Connect Drive to download it to this device.'),
      h('button', { type: 'button', 'data-files-connect': true, onClick: connect, className: 'rounded bg-indigo-700 px-3 py-1.5 text-xs font-bold text-white' }, 'Connect Drive'));
    else if (st.phase === 'not-uploaded') body = h('div', { className: 'p-6 text-sm text-gray-400', 'data-files-not-uploaded': true },
      'This file was added on another device and has not finished uploading to Google Drive yet. Open FILES there with Drive connected, then try again here.');
    else if (st.phase === 'setup') body = h('div', { className: 'p-6 text-sm text-gray-400' }, 'This file is on another device. Google Drive is not set up yet, so it cannot come here.');
    else if (st.phase === 'error') body = h('div', { className: 'p-6 text-sm text-red-400 space-y-3' }, h('div', null, st.message),
      btn('Try again', { onClick: function () { setAttempt(function (a) { return a + 1; }); } }));
    else if (type === 'pdf') body = h(PdfView, { url: st.url, key: st.url, rec: rec, marks: marks, phone: p.phone });
    else if (type === 'png' || type === 'jpeg' || type === 'image') body = h(ImageView, { url: st.url, name: rec.name, rec: rec, marks: marks });
    else if (type === 'md' || type === 'text') body = h(TextView, { blob: st.blob, md: type === 'md' });
    else body = h('div', { className: 'p-10 text-center space-y-2', 'data-files-other': true },
      h('div', { className: 'text-6xl' }, iconOf(rec)),
      h('div', { className: 'text-sm text-gray-200' }, rec.name),
      h('div', { className: 'text-xs text-gray-500' }, TF.formatSize(rec.size) + (rec.mime ? ' · ' + rec.mime : '')),
      h('div', { className: 'text-xs text-gray-500' }, 'Track can\'t show this kind of file. Download it or share it to an app that can.'));

    return h('div', { className: 'flex-1 min-h-0 flex flex-col', 'data-files-viewer': String(rec.id), 'data-files-viewer-type': type },
      h(PageHead, { phone: p.phone, onDrawer: p.onDrawer, onBack: p.onBack, trail: p.trail, nameOf: p.nameOf, onCrumb: p.onCrumb,
        icon: iconOf(rec), title: rec.name },
        st.phase === 'ready' ? h('a', { href: st.url, download: rec.name, 'data-files-download': true,
          className: 'rounded border border-gray-700 px-2 py-1 text-xs text-gray-300' }, '⬇ Download') : null,
        shareable ? btn('Share / Open in…', { 'data-files-share': true, onClick: share }) : null,
        btn('✎ Rename', { 'data-files-rename': true, onClick: p.onRename }),
        btn('🗑', { 'data-files-delete': true, onClick: p.onDelete, title: 'Delete this file' }),
        h('span', { className: 'text-[11px] text-gray-500' }, statusLine(rec, dl, p.ov, 0))),
      h(UsedIn, { uses: p.uses, onUse: p.onUse }),
      h('div', { className: 'flex-1 min-h-0 flex flex-col' }, body));
  }

  // ── highlights: the layer over a PDF page or an image ────────────────────
  //
  // Highlighter colours are DATA colours (docs/contracts/appearance.md): the
  // same in both appearances, like PALETTE, and given to SVG through `style`.
  // A stroke is stored in fractions of the page's box, so it keeps its place
  // at any zoom and on either device.
  var MARK_COLORS = { yellow: '#fde047', green: '#86efac', blue: '#93c5fd', pink: '#f9a8d4' };
  var MARK_NAMES = { yellow: 'Yellow', green: 'Green', blue: 'Blue', pink: 'Pink' };
  var MARK_W = 0.02;       // a stroke's width, in page widths
  var MARK_EPS = 0.0015;   // how far simplification may move a point, in page widths
  var TAP_LEN = 0.004;     // a stroke shorter than this is a tap, and is not kept
  var lastColor = 'yellow';

  function ptsAttr(pts, H) {
    var out = [];
    for (var i = 0; i + 1 < pts.length; i += 2) out.push(Math.round(pts[i] * 10000) / 10 + ',' + Math.round(pts[i + 1] * H * 10) / 10);
    return out.join(' ');
  }
  function strokeStyle(color, w) {
    return { stroke: MARK_COLORS[color] || MARK_COLORS.yellow, strokeWidth: w * 1000, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };
  }

  // The toolbar's highlighter controls, as children for a toolbar row.
  function markTools(m) {
    var out = [];
    out.push(btn('🖍', { key: 'draw', 'data-files-mark-draw': true, 'aria-pressed': m.mode === 'draw' ? 'true' : 'false',
      'aria-label': 'Highlighter',
      title: m.mode === 'draw' ? 'Highlighter on: a finger or the mouse draws. Tap again to scroll with a finger.'
        : 'Highlighter: turn on to draw with a finger or the mouse (Apple Pencil always draws)',
      onClick: function () { m.setMode(m.mode === 'draw' ? null : 'draw'); } }, 'fdir-tool'));
    out.push(h('span', { key: 'sw', className: 'flex items-center gap-1', role: 'group', 'aria-label': 'Highlighter colour' },
      TF.COLORS.map(function (c) {
        return h('button', { key: c, type: 'button', 'data-files-mark-color': c, 'aria-pressed': m.color === c ? 'true' : 'false',
          'aria-label': MARK_NAMES[c], title: MARK_NAMES[c], onClick: function () { m.setColor(c); },
          className: 'fdir-swatch', style: { backgroundColor: MARK_COLORS[c] } });
      })));
    out.push(btn('⌫', { key: 'erase', 'data-files-mark-erase': true, 'aria-pressed': m.mode === 'erase' ? 'true' : 'false',
      'aria-label': 'Eraser', title: 'Eraser: touch a highlight to remove it (Undo brings it back)',
      onClick: function () { m.setMode(m.mode === 'erase' ? null : 'erase'); } }, 'fdir-tool'));
    return out;
  }

  // One page's strokes, and the input that makes and erases them.
  //   - An Apple Pencil (pointerType 'pen') always draws; a finger or a mouse
  //     only while 🖍 is on. With ⌫ on, every pointer erases.
  //   - iPad Safari scrolls under a Pencil unless its touch is cancelled, so
  //     the touch listeners are non-passive and cancel a stylus touch (or every
  //     touch while a tool is on, or a palm during a Pencil stroke). React's
  //     own touch handlers are passive, so these are native.
  //   - Coalesced events keep a fast Pencil line smooth; pointer capture keeps
  //     a stroke on the page it started on, clamped to its edges.
  // p: hls, page, ratio (height / width), tool {mode, color}, onStroke, onErase.
  function MarkLayer(p) {
    var ref = useRef(null), liveRef = useRef(null), propsRef = useRef(p);
    propsRef.current = p;
    var s1 = useState(null), hidden = s1[0], setHidden = s1[1];

    useEffect(function () {
      var el = ref.current;
      if (!el) return;
      var g = null;
      function at(e, rect) {
        var x = (e.clientX - rect.left) / rect.width, y = (e.clientY - rect.top) / rect.height;
        return [x < 0 ? 0 : x > 1 ? 1 : x, y < 0 ? 0 : y > 1 ? 1 : y];
      }
      function acting(type) {
        var mode = propsRef.current.tool.mode;
        if (mode === 'erase') return 'erase';
        return type === 'pen' || mode === 'draw' ? 'draw' : null;
      }
      function eraseAt(pt) {
        var P = propsRef.current, tol = g.type === 'touch' ? 0.012 : 0.005, more = false;
        P.hls.forEach(function (hl) {
          if (!g.hit.has(hl.id) && TF.hitStroke(hl, pt[0], pt[1], tol, P.ratio)) { g.hit.add(hl.id); more = true; }
        });
        if (more) setHidden(new Set(g.hit));
      }
      function drawLive() {
        var H = 1000 * propsRef.current.ratio;
        if (liveRef.current) liveRef.current.setAttribute('points', ptsAttr(g.pts, H));
      }
      function clearLive() { if (liveRef.current) liveRef.current.removeAttribute('points'); }
      function down(e) {
        if (g) return;                                   // one stroke at a time: a palm is ignored
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        var what = acting(e.pointerType);
        if (!what) return;
        var rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        e.preventDefault();
        try { el.setPointerCapture(e.pointerId); } catch (x) { /* a synthetic pointer */ }
        var pt = at(e, rect);
        g = { id: e.pointerId, type: e.pointerType, erase: what === 'erase', pts: pt.slice(), len: 0, hit: new Set() };
        if (g.erase) eraseAt(pt); else drawLive();
      }
      function move(e) {
        if (!g || e.pointerId !== g.id) return;
        e.preventDefault();
        var rect = el.getBoundingClientRect(), r = propsRef.current.ratio;
        var evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : null;
        if (!evs || !evs.length) evs = [e];
        for (var i = 0; i < evs.length; i++) {
          var pt = at(evs[i], rect);
          if (g.erase) { eraseAt(pt); continue; }
          var n = g.pts.length, dx = pt[0] - g.pts[n - 2], dy = (pt[1] - g.pts[n - 1]) * r;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (!d) continue;
          g.len += d;
          g.pts.push(pt[0], pt[1]);
        }
        if (!g.erase) drawLive();
      }
      function end(e) {
        if (!g || e.pointerId !== g.id) return;
        var done = g, P = propsRef.current;
        g = null;
        try { el.releasePointerCapture(e.pointerId); } catch (x) { /* already released */ }
        if (done.erase) {
          setHidden(null);
          if (e.type !== 'pointercancel' && done.hit.size) P.onErase(Array.from(done.hit));
          return;
        }
        clearLive();
        if (e.type === 'pointercancel' || done.len < TAP_LEN) return;
        P.onStroke(P.page, done.pts, P.ratio);
      }
      function touch(e) {
        if (!e.cancelable) return;
        if (propsRef.current.tool.mode || (g && g.type === 'pen')) { e.preventDefault(); return; }
        var lists = [e.touches, e.changedTouches];
        for (var k = 0; k < lists.length; k++) {
          for (var i = 0; lists[k] && i < lists[k].length; i++) {
            if (lists[k][i].touchType === 'stylus') { e.preventDefault(); return; }
          }
        }
      }
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('touchstart', touch, { passive: false });
      el.addEventListener('touchmove', touch, { passive: false });
      return function () {
        el.removeEventListener('pointerdown', down);
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', end);
        el.removeEventListener('pointercancel', end);
        el.removeEventListener('touchstart', touch, { passive: false });
        el.removeEventListener('touchmove', touch, { passive: false });
      };
    }, []);

    var H = 1000 * p.ratio;
    return h('svg', {
      ref: ref, className: 'fdir-marks', 'data-files-marks': p.page, 'data-mode': p.tool.mode || 'off',
      viewBox: '0 0 1000 ' + H, preserveAspectRatio: 'none', 'aria-hidden': 'true'
    },
      p.hls.map(function (hl, i) {
        if (hidden && hidden.has(hl.id)) return null;
        return h('polyline', { key: i + ':' + String(hl.id), 'data-files-mark': String(hl.id), points: ptsAttr(hl.pts, H), style: strokeStyle(hl.color, hl.w) });
      }),
      h('polyline', { ref: liveRef, 'data-files-mark-live': true, style: strokeStyle(p.tool.color, MARK_W) }));
  }

  function ImageView(p) {
    var s1 = useState(true), fit = s1[0], setFit = s1[1];
    var s2 = useState(null), nat = s2[0], setNat = s2[1];
    var s3 = useState(null), pane = s3[0], setPane = s3[1];
    var paneRef = useRef(null);
    var m = p.marks;
    useEffect(function () {
      var el = paneRef.current;
      if (!el) return;
      function measure() { setPane({ w: el.clientWidth, h: el.clientHeight }); }
      measure();
      if (global.ResizeObserver) { var ro = new ResizeObserver(measure); ro.observe(el); return function () { ro.disconnect(); }; }
      global.addEventListener('resize', measure);
      return function () { global.removeEventListener('resize', measure); };
    }, []);
    // The frame is sized explicitly, as a PDF page is, so the layer lies
    // exactly on the picture: fit shrinks (never enlarges) into the pane.
    var size = null;
    if (nat && pane) {
      var s = fit ? Math.min(1, Math.max(1, pane.w - 16) / nat.w, Math.max(1, pane.h - 16) / nat.h) : 1;
      size = { w: Math.max(1, Math.round(nat.w * s)), h: Math.max(1, Math.round(nat.h * s)) };
    }
    return h('div', { className: 'flex-1 min-h-0 flex flex-col' },
      h('div', { className: 'px-3 py-1.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-500 border-b border-gray-800', 'data-files-tools': true },
        btn(fit ? '100%' : 'Fit', { 'data-files-zoom': true, onClick: function () { setFit(!fit); } }),
        markTools(m),
        h('span', { className: 'self-center' }, 'Double-tap to zoom; pinch works too.')),
      h('div', { ref: paneRef, className: cls('fdir-img flex-1 min-h-0 overflow-auto', fit ? 'flex items-center justify-center p-2' : ''), 'data-files-scroll': true },
        h('div', { className: 'fdir-img-frame', 'data-files-image-frame': true,
          style: size ? { width: size.w + 'px', height: size.h + 'px' } : undefined,
          onDoubleClick: function () { if (!m.mode) setFit(!fit); } },
          h('img', { src: p.url, alt: p.name, 'data-files-image': true, draggable: false,
            onLoad: function (e) { var im = e.currentTarget; if (im.naturalWidth && im.naturalHeight) setNat({ w: im.naturalWidth, h: im.naturalHeight }); },
            style: size ? undefined : { maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto' } }),
          size ? h(MarkLayer, { hls: TF.highlightsOf(p.rec, 1), page: 1, ratio: nat.h / nat.w,
            tool: { mode: m.mode, color: m.color }, onStroke: m.addStroke, onErase: m.erase }) : null)));
  }

  function TextView(p) {
    var s1 = useState(null), text = s1[0], setText = s1[1];
    useEffect(function () {
      var alive = true;
      var cap = 4 * 1024 * 1024;
      p.blob.slice(0, cap).text().then(function (t) { if (alive) setText(p.blob.size > cap ? t + '\n\n… (only the first 4 MB is shown)' : t); });
      return function () { alive = false; };
    }, [p.blob]);
    if (text === null) return h('div', { className: 'p-6 text-xs text-gray-500' }, 'Opening…');
    return h('div', { className: 'flex-1 min-h-0 overflow-y-auto p-4', 'data-files-scroll': true },
      p.md ? h(MarkdownPreview, { text: text })
        : h('pre', { className: 'fdir-editor whitespace-pre-wrap text-gray-200', 'data-files-text': true }, text));
  }

  // ── PDF: pages drawn only as they scroll into view ───────────────────────

  var pdfReady = null;
  function loadPdf() {
    if (!pdfReady) {
      pdfReady = loadScript(LIB.pdf).then(function () {
        global.pdfjsLib.GlobalWorkerOptions.workerSrc = LIB.pdfWorker;
        return global.pdfjsLib;
      }, function (e) { pdfReady = null; throw e; });
    }
    return pdfReady;
  }

  var ZOOMS = [0.75, 1, 1.25, 1.5, 2, 3];

  function PdfView(p) {
    var s1 = useState({ phase: 'loading' }), st = s1[0], setSt = s1[1];
    var s2 = useState(1), zoom = s2[0], setZoom = s2[1];
    var s3 = useState(0), width = s3[0], setWidth = s3[1];
    var s4 = useState(1), pageNow = s4[0], setPageNow = s4[1];
    var scrollRef = useRef(null), docRef = useRef(null);

    useEffect(function () {
      var alive = true, task = null;
      loadPdf().then(function (lib) {
        if (!alive) return;
        task = lib.getDocument({ url: p.url });
        return task.promise.then(function (doc) {
          if (!alive) { doc.destroy(); return; }
          docRef.current = doc;
          return doc.getPage(1).then(function (pg) {
            var vp = pg.getViewport({ scale: 1 });
            if (alive) setSt({ phase: 'ready', pages: doc.numPages, ratio: vp.height / vp.width });
          });
        });
      }).then(null, function (e) { if (alive) setSt({ phase: 'error', message: (e && e.message) || 'Could not read this PDF' }); });
      return function () {
        alive = false;
        if (docRef.current) { docRef.current.destroy(); docRef.current = null; } else if (task) task.destroy();
      };
    }, [p.url]);

    // the fit width follows the pane
    useEffect(function () {
      var el = scrollRef.current;
      if (!el) return;
      function measure() { setWidth(Math.max(200, el.clientWidth - 24)); }
      measure();
      if (global.ResizeObserver) { var ro = new ResizeObserver(measure); ro.observe(el); return function () { ro.disconnect(); }; }
      global.addEventListener('resize', measure);
      return function () { global.removeEventListener('resize', measure); };
    }, [st.phase]);

    // The page under the top third of the pane; scrolled to the very end,
    // the last page (which may never reach the top third).
    function onScroll() {
      var el = scrollRef.current;
      if (!el || st.phase !== 'ready') return;
      var pagesEl = el.querySelectorAll('[data-files-pdf-page]');
      if (el.scrollTop > 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - 2) { setPageNow(pagesEl.length); return; }
      var mid = el.getBoundingClientRect().top + el.clientHeight / 3;
      for (var i = 0; i < pagesEl.length; i++) {
        var r = pagesEl[i].getBoundingClientRect();
        if (r.bottom >= mid) { setPageNow(i + 1); return; }
      }
    }
    // Every page is already a placeholder of its full size, so the target's
    // place is exact before it is drawn.
    function scrollToPage(n) {
      var el = scrollRef.current, pg = el && el.querySelector('[data-files-pdf-page="' + n + '"]');
      if (!pg) return;
      el.scrollTop += pg.getBoundingClientRect().top - el.getBoundingClientRect().top - 12;
      setPageNow(n);
    }

    var m = p.marks;
    var hlBy = useMemo(function () {
      var by = {};
      TF.highlightsOf(p.rec).forEach(function (hl) { (by[hl.page] = by[hl.page] || []).push(hl); });
      return by;
    }, [p.rec.highlights]);
    var pins = useMemo(function () { return TF.pinsOf(p.rec); }, [p.rec.pins]);
    var s5 = useState(false), pinsOpen = s5[0], setPinsOpen = s5[1];
    var s6 = useState(null), dlg = s6[0], setDlg = s6[1];

    if (st.phase === 'loading') return h('div', { className: 'p-6 text-xs text-gray-500', 'data-files-pdf-loading': true }, 'Opening the PDF…');
    if (st.phase === 'error') return h('div', { className: 'p-6 text-sm text-red-400', 'data-files-pdf-error': true }, st.message);
    var w = Math.round(width * zoom);
    var tool = { mode: m.mode, color: m.color };
    var pageEls = [];
    for (var n = 1; n <= st.pages; n++) {
      pageEls.push(h(PdfPage, { key: n, n: n, doc: docRef.current, width: w, ratio: st.ratio, root: scrollRef,
        hls: hlBy[n] || NONE, pins: pins.filter(function (x) { return x.page === n; }), tool: tool, onStroke: m.addStroke, onErase: m.erase }));
    }
    var zi = ZOOMS.indexOf(zoom);

    function saveDlg(text) {
      if (!dlg) return;
      var ok = dlg.kind === 'pin' ? m.addPin(dlg.page, text) : m.renamePin(dlg.pinId, text);
      if (ok) setDlg(null);
    }
    var pinRows = pins.map(function (pin, i) {
      return h('div', { key: i + ':' + String(pin.id), 'data-files-pin-row': String(pin.id), className: 'flex items-center gap-1 rounded hover:bg-gray-800' },
        h('button', { type: 'button', 'data-files-pin-jump': String(pin.id), className: 'flex-1 min-w-0 flex items-center gap-2 px-2 py-2 text-left text-xs text-gray-200',
          onClick: function () { setPinsOpen(false); scrollToPage(pin.page); } },
          h('span', { 'aria-hidden': 'true' }, '📌'),
          h('span', { className: 'flex-1 min-w-0 truncate', 'data-files-pin-name': true }, pin.name),
          h('span', { className: 'text-[10px] text-gray-500 shrink-0' }, 'p. ' + pin.page)),
        h('button', { type: 'button', 'data-files-pin-rename': String(pin.id), 'aria-label': 'Rename ' + pin.name, className: 'px-2 py-2 text-xs text-gray-400',
          onClick: function () { setPinsOpen(false); setDlg({ kind: 'pin-rename', pinId: pin.id, initial: pin.name, title: 'Rename pin' }); } }, '✎'),
        h('button', { type: 'button', 'data-files-pin-delete': String(pin.id), 'aria-label': 'Delete ' + pin.name, className: 'px-2 py-2 text-xs text-gray-400',
          onClick: function () { m.deletePin(pin.id); } }, '🗑'));
    });
    var pinList = h('div', { 'data-files-pin-list': true, className: cls('border border-gray-700 bg-gray-900 p-1 shadow-xl',
      p.phone ? 'fdir-sheet' : 'absolute right-0 top-full mt-1 z-20 w-72 max-h-80 overflow-y-auto rounded-lg') },
      p.phone ? h('div', { className: 'px-2 pt-2 pb-1 text-xs font-bold text-gray-300' }, 'Pins') : null,
      pinRows.length ? pinRows : h('div', { className: 'px-2 py-3 text-[11px] text-gray-500', 'data-files-pin-empty': true },
        'No pins yet. 📌 Pin page pins the page you are on, under a name.'));

    return h('div', { className: 'flex-1 min-h-0 flex flex-col', 'data-files-pdf': true, 'data-files-pdf-pages': st.pages },
      h('div', { className: 'px-3 py-1.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-500 border-b border-gray-800', 'data-files-tools': true },
        btn('−', { 'data-files-zoom-out': true, disabled: zi <= 0, onClick: function () { setZoom(ZOOMS[Math.max(0, zi - 1)]); } }),
        h('span', { 'data-files-zoom-level': true }, Math.round(zoom * 100) + '%'),
        btn('+', { 'data-files-zoom-in': true, disabled: zi >= ZOOMS.length - 1, onClick: function () { setZoom(ZOOMS[Math.min(ZOOMS.length - 1, zi + 1)]); } }),
        btn('Fit', { onClick: function () { setZoom(1); } }),
        markTools(m),
        btn('📌 Pin page', { 'data-files-pin-add': true,
          onClick: function () { setPinsOpen(false); setDlg({ kind: 'pin', page: pageNow, initial: 'Page ' + pageNow, title: 'Pin page ' + pageNow, action: 'Pin' }); } }),
        h('div', { className: 'relative' },
          btn('Pins (' + pins.length + ')', { 'data-files-pins': true, 'aria-expanded': pinsOpen ? 'true' : 'false',
            onClick: function () { setPinsOpen(!pinsOpen); } }),
          pinsOpen && !p.phone ? pinList : null),
        h('span', { className: 'ml-auto', 'data-files-pdf-at': true }, 'Page ' + pageNow + ' of ' + st.pages)),
      h('div', { ref: scrollRef, onScroll: onScroll, className: 'flex-1 min-h-0 overflow-auto py-3', 'data-files-scroll': true },
        width ? pageEls : null),
      pinsOpen && p.phone ? h('div', { className: 'fixed inset-0 z-40 bg-black/50', 'data-files-pin-backdrop': true, onClick: function () { setPinsOpen(false); } }) : null,
      pinsOpen && p.phone ? pinList : null,
      dlg ? h(NameDialog, { dialog: dlg, onCancel: function () { setDlg(null); }, onSave: saveDlg }) : null);
  }
  var NONE = [];

  // One page: a placeholder of the right size until it is near the view,
  // then a canvas; let go again when it is far away, so a 300-page PDF holds
  // only the pages around the reader in memory.
  function PdfPage(p) {
    var ref = useRef(null), s1 = useState(false), near = s1[0], setNear = s1[1];
    var s2 = useState(p.ratio), ratio = s2[0], setRatio = s2[1];
    var s3 = useState(false), drawn = s3[0], setDrawn = s3[1];
    useEffect(function () {
      var el = ref.current;
      if (!el || !global.IntersectionObserver) { setNear(true); return; }
      var io = new IntersectionObserver(function (es) { es.forEach(function (e) { setNear(e.isIntersecting); }); },
        { root: p.root.current, rootMargin: '150% 0px' });
      io.observe(el);
      return function () { io.disconnect(); };
    }, []);
    useEffect(function () {
      if (!near || !p.doc || !p.width) { setDrawn(false); return; }
      var alive = true, task = null;
      p.doc.getPage(p.n).then(function (pg) {
        if (!alive) return;
        var base = pg.getViewport({ scale: 1 });
        var r = base.height / base.width;
        if (Math.abs(r - ratio) > 0.001) setRatio(r);
        var dpr = Math.min(2, global.devicePixelRatio || 1);
        var scale = (p.width / base.width) * dpr;
        // iOS Safari draws nothing on a canvas past ~16.7M pixels, which a page
        // at 300% on an iPad would pass: cap the backing store, keep the CSS size.
        var px = base.width * base.height * scale * scale;
        if (px > 16e6) scale *= Math.sqrt(16e6 / px);
        var vp = pg.getViewport({ scale: scale });
        var canvas = ref.current && ref.current.querySelector('canvas');
        if (!canvas) return;
        canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
        task = pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
        return task.promise.then(function () { if (alive) setDrawn(true); pg.cleanup(); });
      }).then(null, function () {});
      return function () { alive = false; if (task) try { task.cancel(); } catch (e) { /* already done */ } };
    }, [near, p.doc, p.width, p.n]);
    return h('div', { ref: ref, className: 'fdir-pdf-page', 'data-files-pdf-page': p.n, 'data-rendered': drawn ? 'true' : undefined,
      style: { width: p.width + 'px', height: Math.round(p.width * ratio) + 'px' } },
      near ? h('canvas', null) : null,
      !drawn ? h('div', { className: 'absolute inset-0 flex items-center justify-center text-xs text-gray-400' }, String(p.n)) : null,
      near ? h(MarkLayer, { hls: p.hls, page: p.n, ratio: ratio, tool: p.tool, onStroke: p.onStroke, onErase: p.onErase }) : null,
      p.pins.length ? h('div', { className: 'fdir-pin-flags', 'data-files-pin-flags': p.n },
        p.pins.map(function (pin, i) {
          return h('span', { key: i + ':' + String(pin.id), className: 'fdir-pin-flag', 'data-files-pin-flag': String(pin.id), title: pin.name }, '📌 ' + pin.name);
        })) : null);
  }

  // ── naming a folder, renaming anything ───────────────────────────────────

  function NameDialog(p) {
    var dlg = p.dialog;
    var s1 = useState(dlg.initial || ''), text = s1[0], setText = s1[1];
    var inputRef = useRef(null);
    useEffect(function () {
      var el = inputRef.current;
      if (el) { el.focus(); try { el.select(); } catch (e) { /* not every input selects */ } }
    }, []);
    var blank = !TF.cleanName(text);
    function save() { if (!blank) p.onSave(text); }
    return h('div', { className: 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4', 'data-files-dialog': dlg.kind,
      onMouseDown: function (e) { if (e.target === e.currentTarget) p.onCancel(); } },
      h('div', { className: 'w-full max-w-sm rounded-xl border border-gray-700 bg-gray-900 p-4 space-y-3 shadow-2xl' },
        h('div', { className: 'text-sm font-bold text-gray-100' }, dlg.title || (dlg.kind === 'new-folder' ? 'New folder' : 'Rename')),
        h('div', { className: 'flex items-center gap-1' },
          h('input', {
            ref: inputRef, value: text, 'data-files-dialog-input': true,
            onChange: function (e) { setText(e.target.value); },
            onKeyDown: function (e) { if (e.key === 'Enter') { e.preventDefault(); save(); } else if (e.key === 'Escape') { e.preventDefault(); p.onCancel(); } },
            className: 'flex-1 min-w-0 rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-gray-100 outline-none'
          }),
          dlg.ext ? h('span', { className: 'text-sm text-gray-500', 'data-files-dialog-ext': true }, dlg.ext) : null),
        blank ? h('div', { className: 'text-[11px] text-gray-500' }, 'A name can\'t be empty.') : null,
        h('div', { className: 'flex justify-end gap-2' },
          btn('Cancel', { 'data-files-dialog-cancel': true, onClick: p.onCancel }),
          h('button', { type: 'button', 'data-files-dialog-save': true, disabled: blank, onClick: save,
            className: cls('rounded px-3 py-1 text-xs font-bold text-white', blank ? 'bg-gray-700' : 'bg-indigo-700') },
            dlg.action || (dlg.kind === 'new-folder' ? 'Create' : 'Save')))));
  }

  global.TrackFilesView = { FilesView: FilesView, LIB: LIB };
})(window);
