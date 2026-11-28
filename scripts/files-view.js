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
   - Since 2026-11-15, copied from two Notability screen recordings the user
     sent: a PEN (✒) beside the highlighter, on a PDF, an image and a note's
     Preview; a PDF's typed text can be SELECTED, then copied or highlighted;
     a PAGE RAIL on the PDF's right edge (▲, the page, the total, ▼ — the
     page number opens a number pad); and a PAGES PANEL (▦): thumbnails of
     All pages, Bookmarks (a ribbon on a page), Notes (pages written or
     highlighted on) or the Outline (pins, which now cover a RANGE of pages),
     with a finder that searches only the pages the list is showing, and a
     full-screen grid.

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
  var WRITE_REFUSED = 'Not saved — this browser refused the write. Everything saved before is intact.';

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
    // With no tool on it lets every pointer through, so the text under it can
    // be selected; its input is heard on the page, not on the layer (MarkLayer).
    '.fdir .fdir-marks{position:absolute;left:0;top:0;width:100%;height:100%;mix-blend-mode:multiply;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;pointer-events:none}',
    '.fdir .fdir-marks[data-mode="draw"],.fdir .fdir-marks[data-mode="erase"]{touch-action:none;pointer-events:auto}',
    // pdf.js's text layer: invisible text laid exactly over the drawn page
    '.fdir .fdir-text{position:absolute;left:0;top:0;overflow:hidden;line-height:1;transform-origin:0 0;text-align:initial;-webkit-text-size-adjust:none;text-size-adjust:none;forced-color-adjust:none;-webkit-user-select:text;user-select:text}',
    '.fdir .fdir-text span,.fdir .fdir-text br{color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0% 0%}',
    '.fdir .fdir-text span.markedContent{top:0;height:0}',
    '.fdir .fdir-text ::selection{background:rgba(37,99,235,.3);color:transparent}',
    '.fdir .fdir-text[data-main-rotation="90"]{transform:rotate(90deg) translateY(-100%)}',
    '.fdir .fdir-text[data-main-rotation="180"]{transform:rotate(180deg) translate(-100%,-100%)}',
    '.fdir .fdir-text[data-main-rotation="270"]{transform:rotate(270deg) translateX(-100%)}',
    '.fdir .fdir-text[data-off="true"]{-webkit-user-select:none;user-select:none;pointer-events:none}',
    '.fdir .fdir-find{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;mix-blend-mode:multiply}',
    '.fdir .fdir-find i{position:absolute;border-radius:2px}',
    '.fdir .fdir-marks[data-mode="draw"]{cursor:crosshair}.fdir .fdir-marks[data-mode="erase"]{cursor:cell}',
    '.fdir .fdir-pin-flags{position:absolute;left:6px;right:6px;top:6px;display:flex;flex-wrap:wrap;gap:4px;pointer-events:none;z-index:1}',
    '.fdir .fdir-pin-flag{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-radius:999px;padding:1px 8px;font-size:11px;',
    'background-color:var(--color-surface);color:var(--color-text);border:1px solid var(--color-border);box-shadow:var(--shadow-float)}',
    // a pressed tool: specific enough to beat the Grit remap of btn()'s classes
    '.fdir [data-files-tools] .fdir-tool[aria-pressed="true"]{background-color:var(--color-primary-soft);border-color:var(--color-primary-border);color:var(--color-text)}',
    '.fdir [data-files-tools] .fdir-tool[data-armed="true"]{box-shadow:inset 0 -2px 0 var(--color-primary-border)}',
    '.fdir [data-files-tools] .fdir-swatch,.fdir .fdir-selpop .fdir-swatch{width:26px;height:26px;border-radius:999px;border:2px solid var(--color-border);flex:none}',
    '.fdir [data-files-tools] .fdir-swatch[aria-pressed="true"]{border-color:var(--color-text);box-shadow:0 0 0 2px var(--color-surface) inset}',
    // the page rail and its number pad
    '.fdir .fdir-rail{position:absolute;right:10px;top:50%;transform:translateY(-50%);z-index:5;display:flex;flex-direction:column;align-items:center;gap:1px;padding:4px 3px;border-radius:999px;',
    'background-color:var(--color-surface);border:1px solid var(--color-border);box-shadow:var(--shadow-float);color:var(--color-text);font-size:11px;line-height:1.2}',
    '.fdir .fdir-rail>button{min-width:30px;min-height:28px;border-radius:999px;color:var(--color-text)}',
    '.fdir .fdir-rail>button:disabled{opacity:.35}',
    '.fdir .fdir-rail>[data-files-rail-page]{font-weight:700;border-radius:6px;border-bottom:1px solid var(--color-border-strong)}',
    '.fdir .fdir-rail>[data-files-rail-total]{color:var(--color-text-muted);padding:2px 0}',
    '.fdir .fdir-pad{position:absolute;right:calc(100% + 8px);top:50%;transform:translateY(-50%);width:184px;padding:8px;border-radius:14px;background-color:var(--color-surface);border:1px solid var(--color-border);box-shadow:var(--shadow-float)}',
    '.fdir .fdir-pad input{width:100%;border-radius:8px;border:1px solid var(--color-border);background-color:var(--color-surface-strong);color:var(--color-text);padding:6px 8px;font-size:15px;text-align:center;outline:none}',
    '.fdir .fdir-pad-keys{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:8px 0}',
    '.fdir .fdir-pad-keys button{height:38px;border-radius:10px;background-color:var(--color-surface-strong);font-size:15px;color:var(--color-text)}',
    '.fdir .fdir-pad-go{width:100%;height:34px;border-radius:10px;background-color:var(--color-primary-solid);color:#fff;font-weight:700;font-size:13px}',
    '.fdir .fdir-pad-go:disabled{opacity:.4}',
    // the pages panel: thumbnails, ribbons, the finder
    '.fdir .fdir-pages{background-color:var(--color-surface);color:var(--color-text);display:flex;flex-direction:column;min-height:0}',
    '.fdir .fdir-pages[data-files-pages="side"]{width:15.5rem;flex:none;border-left:1px solid var(--color-border)}',
    '.fdir .fdir-pages[data-files-pages="full"]{position:fixed;left:0;right:0;top:0;bottom:var(--phone-tabbar-h,0px);z-index:40}',
    '.fdir .fdir-pages-grid{display:grid;gap:14px;padding:12px;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));align-content:start}',
    '.fdir .fdir-pages[data-files-pages="side"] .fdir-pages-grid{grid-template-columns:1fr;padding:12px 22px}',
    '.fdir .fdir-thumb{position:relative}',
    '.fdir .fdir-thumb-page{display:block;position:relative;width:100%;background:#fff;border-radius:6px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.25);outline:2px solid transparent;outline-offset:1px}',
    '.fdir .fdir-thumb[data-current="true"] .fdir-thumb-page{outline-color:var(--color-primary-solid)}',
    '.fdir .fdir-thumb-page canvas{display:block;width:100%;height:100%}',
    '.fdir .fdir-thumb-marks{position:absolute;left:0;top:0;width:100%;height:100%;mix-blend-mode:multiply;pointer-events:none}',
    '.fdir .fdir-thumb-n{text-align:center;font-size:11px;color:var(--color-text-muted);padding-top:3px}',
    '.fdir .fdir-thumb-count{position:absolute;left:6px;bottom:6px;border-radius:999px;padding:0 7px;font-size:11px;font-weight:700;line-height:18px;background:#fb923c;color:#1f2937}',
    '.fdir .fdir-ribbon{position:absolute;right:4px;top:0;width:30px;height:34px;display:flex;align-items:flex-start;justify-content:center;color:#6b7280}',
    '.fdir .fdir-ribbon svg{width:16px;height:22px;overflow:visible}',
    '.fdir .fdir-ribbon path{fill:rgba(255,255,255,.85);stroke:currentColor;stroke-width:1.5;stroke-linejoin:round}',
    '.fdir .fdir-ribbon[aria-pressed="true"]{color:#dc2626}',
    '.fdir .fdir-ribbon[aria-pressed="true"] path{fill:currentColor}',
    '.fdir .fdir-scope-menu{position:absolute;left:0;top:100%;margin-top:4px;z-index:6;min-width:11rem;border-radius:12px;padding:4px;background-color:var(--color-surface);border:1px solid var(--color-border);box-shadow:var(--shadow-float)}',
    '.fdir .fdir-scope-menu button{display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:7px 8px;border-radius:8px;font-size:13px;color:var(--color-text)}',
    '.fdir .fdir-scope-menu button:hover{background-color:var(--color-surface-strong)}',
    '.fdir .fdir-find-box{display:flex;align-items:center;gap:6px;border-radius:999px;border:1px solid var(--color-border);background-color:var(--color-surface-strong);padding:5px 10px}',
    '.fdir .fdir-find-box input{flex:1;min-width:0;background:transparent;outline:none;color:var(--color-text);font-size:13px;-webkit-user-select:text;user-select:text}',
    // what a text selection offers
    '.fdir .fdir-selpop{position:fixed;z-index:45;display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:999px;background-color:var(--color-surface);border:1px solid var(--color-border);box-shadow:var(--shadow-float)}',
    // a note's Preview as PAPER: white in both appearances, as a PDF page is,
    // because ink is drawn with multiply and would vanish on a dark sheet
    '.fdir .fdir-paper{position:relative;transform-origin:0 0;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.25);border-radius:4px;',
    '--color-text:#111827;--color-text-muted:#4b5563;--color-surface-strong:#f3f4f6;--color-border:#d1d5db;--color-border-strong:#9ca3af;--color-primary-text:#2563eb}',
    '.fdir .fdir-paper-body{padding:28px 36px}',
    '.fdir .fdir-paper-page{position:absolute;left:0;width:100%;pointer-events:none}',
    '.fdir .fdir-paper-page+.fdir-paper-page{border-top:1px dashed #d1d5db}',
    '.fdir .fdir-sheet{position:fixed;left:0;right:0;bottom:0;z-index:45;max-height:70vh;overflow-y:auto;border-radius:12px 12px 0 0;padding-bottom:calc(8px + var(--phone-tabbar-h, 0px))}',
    // the PDF view keeps its own place when pages change size (PdfView), so
    // the browser's scroll anchoring must not move it as well
    '.fdir .fdir-pdf-scroll{overflow-anchor:none}',
    // an Outline pin that is on glows
    '.fdir .fdir-pin-row{transition:box-shadow var(--motion-fast) var(--ease-ui),background-color var(--motion-fast) var(--ease-ui)}',
    '.fdir .fdir-pin-row[data-on="true"]{background-color:var(--color-primary-soft);box-shadow:0 0 0 1px var(--color-primary-border),0 0 10px 1px var(--color-primary-border)}',
    // full screen: the viewer over the whole window (over the phone tab bar,
    // 46; under the toast and dialogs, 50), and its tools in a strip
    '.fdir .fdir-full{position:fixed;left:0;top:0;right:0;bottom:0;z-index:47;background-color:var(--color-app-bg)}',
    '.fdir .fdir-full .fdir-pages[data-files-pages="full"]{bottom:0}',
    '.fdir .fdir-strip{position:fixed;z-index:35;display:flex;flex-direction:column;align-items:center;gap:4px;padding:4px 5px 6px;max-height:calc(100vh - 16px);max-height:calc(100dvh - 16px);',
    'border-radius:14px;background-color:var(--color-surface);border:1px solid var(--color-border);box-shadow:var(--shadow-float);color:var(--color-text);font-size:11px}',
    '.fdir .fdir-strip-tools{display:flex;flex-direction:column;align-items:center;gap:4px;min-height:0;overflow-y:auto;overscroll-behavior:contain}',
    '.fdir .fdir-strip-tools [role="group"]{flex-direction:column}',
    '.fdir .fdir-strip [data-files-pdf-at]{display:none}',
    '.fdir .fdir-strip .fdir-tool,.fdir .fdir-strip-tools>button{min-width:34px;min-height:32px}',
    '.fdir .fdir-grip{cursor:grab;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;padding:2px 10px 4px;font-size:16px;line-height:1;color:var(--color-text-muted)}',
    '.fdir .fdir-grip:active{cursor:grabbing}',
    '.fdir .fdir-strip-exit{min-width:34px;min-height:30px;border-radius:8px;border:1px solid var(--color-border);font-size:13px;color:var(--color-text)}'
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
    // Drive connects by itself (the user's 2026-11-16 request), as far as a
    // browser lets it. Opening FILES asks the store to connect: a token kept
    // for this tab is used with no window at all; otherwise Google's window
    // is asked for once, which a browser allows without a tap only where
    // pop-ups are allowed for the site. Where it is blocked, the store says
    // so through `overview().autoTap`, and the FIRST tap anywhere in FILES
    // connects — a tap is what lets the window open. One attempt each, never
    // a loop: the store drops `autoTap` after it. Once a page load.
    useEffect(function () {
      try {
        var r = typeof FS.autoConnect === 'function' ? FS.autoConnect() : null;
        if (r && typeof r.then === 'function') r.then(null, function () {});
      } catch (e) {}
    }, []);
    // A kept pass needs nothing from Google, so the store fetches Google's
    // sign-in only without one. When the pass runs out with FILES still open,
    // fetch it then — or the Connect Drive tap would only say "still loading".
    var ovSetUp = FS.overview().setUp, ovConnected = FS.overview().connected;
    useEffect(function () {
      if (ovSetUp && !ovConnected) FS.preloadGis().then(null, function () {});
    }, [ovSetUp, ovConnected]);
    function onFirstTap(e) {
      var ovNow = FS.overview();
      if (!ovNow.autoTap || ovNow.connected) return;
      // The Connect button connects by itself; two requests would be two windows.
      if (e.target && e.target.closest && e.target.closest('[data-files-connect]')) return;
      FS.connect().then(function () { say('Connected to Google Drive.'); }, function () {});
    }

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
    // The same link, started from this side: the page links the open record
    // to the text block picked (its one writer, over a fresh read) and
    // answers whether it landed. Absent props: no button.
    var openRecId = open ? open.id : null;
    var linkUse = props.onLinkUse && props.linkTargets
      ? function (t) { return openRecId != null && !!props.onLinkUse(openRecId, t); } : null;

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

    function write(fn, reportRefusal) {
      var r = mutate(fn);
      if (r === false && reportRefusal !== false) say(WRITE_REFUSED);
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
      var hlN = 0, penN = 0, pinN = 0, bmN = 0;
      var marked = fileN.concat(noteN.filter(function (r) { return TF.highlightsOf(r).length; }));
      marked.forEach(function (r) {
        TF.highlightsOf(r).forEach(function (m) { if (TF.markKind(m) === 'pen') penN++; else hlN++; });
        pinN += TF.pinsOf(r).length; bmN += TF.bookmarksOf(r).length;
      });
      if (hlN || penN || pinN || bmN) {
        var marks = [];
        if (hlN) marks.push(hlN + (hlN === 1 ? ' highlight' : ' highlights'));
        if (penN) marks.push(penN + (penN === 1 ? ' pen stroke' : ' pen strokes'));
        if (pinN) marks.push(pinN + (pinN === 1 ? ' pin' : ' pins'));
        if (bmN) marks.push(bmN + (bmN === 1 ? ' bookmark' : ' bookmarks'));
        var said = marks.length > 2 ? marks.slice(0, -1).join(', ') + ' and ' + marks[marks.length - 1] : marks.join(' and ');
        lines.push((marked.length === 1 ? 'Its ' : 'Their ') + said + (hlN + penN + pinN + bmN === 1 ? ' goes' : ' go') +
          ' with ' + (marked.length === 1 ? 'it.' : 'them.'));
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
          key: open.id, rec: open, fresh: freshNote === open.id, onText: saveText, say: say, write: write, uses: uses, onUse: props.onOpenUse, linkTargets: props.linkTargets, onLink: linkUse,
          onBack: goUp, onRename: function () { startRename(open.id); }, onDelete: function () { remove([open.id]); },
          trail: trail, nameOf: nameOf, onCrumb: openRec, phone: phone, onDrawer: function () { setDrawer(true); }
        })
        : h(FileView, {
          key: open.id, rec: open, ov: ov, say: say, write: write, uses: uses, onUse: props.onOpenUse, linkTargets: props.linkTargets, onLink: linkUse,
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
    return h('div', { className: 'fdir flex flex-1 min-h-0 h-full relative', 'data-files-view': true, onClickCapture: onFirstTap },
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
    function disconnect() {
      FS.disconnect();
      p.say('Disconnected from Google Drive on this tab. Files stay where they are.');
    }
    var line, act = null, disc = null;
    if (ov.deviceStorage) line = h('span', { className: 'text-red-400' }, 'This browser can\'t keep files: ' + ov.deviceStorage);
    else if (!ov.setUp) line = 'Google Drive isn\'t set up yet — files stay on this device.';
    else if (!ov.connected) {
      line = (ov.autoTap ? 'Google Drive: connects on your next tap' : 'Google Drive: not connected') +
        (ov.pending ? ' · ' + ov.pending + ' waiting to upload' : '');
      act = h('button', { type: 'button', 'data-files-connect': true, onClick: connect,
        className: 'mt-1 w-full rounded bg-indigo-700 px-2 py-1 text-[11px] font-bold text-white' }, 'Connect Drive');
    } else {
      line = 'Google Drive: connected' + (ov.pending ? ' · ' + ov.pending + ' to upload' : ' ✓');
      if (ov.error && ov.pending) act = h('button', { type: 'button', 'data-files-retry': true,
        onClick: function () { FS.startQueue(); },
        className: 'mt-1 w-full rounded border border-gray-700 px-2 py-1 text-[11px] text-gray-300' }, 'Retry upload');
      // Forgets the pass kept for this tab. It deletes nothing: files, the
      // queue and track_db stay as they are, and Connect Drive brings it back.
      disc = typeof FS.disconnect === 'function' ? h('button', { type: 'button', 'data-files-disconnect': true, onClick: disconnect,
        title: 'Forget the Google Drive pass kept for this tab', className: 'text-gray-500 underline' }, 'Disconnect') : null;
    }
    return h('div', { 'data-files-drive': true, className: 'border-t border-gray-800 p-2 text-[11px] text-gray-500 space-y-1' },
      // Disconnect sits under the line: beside it, the narrow sidebar wrapped the ✓.
      h('div', null, line),
      disc ? h('div', null, disc) : null,
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

  // The links bar under a file's or a note's head. Two things, side by side:
  //
  // - "Used in N text blocks": the Source Dump text blocks whose `fileId`
  //   names the record. Closed until tapped; a row opens SOURCE DUMP on that
  //   title with the MM's card ringed. Drawn only when a block names it.
  // - "+ link to a text block" (the user's 2026-11-16 request: a link can
  //   start from the file too). It opens a picker of every text block, read
  //   from the page's `targets` prop only while it is open: this script never
  //   sees `sourceDumps`. A row calls `onLink`, which is the page's ONE writer
  //   for a link (TrackSourceDump.withBlockFile) — so a block that already has
  //   a file, drawn grey, is refused by that writer and not by a second test
  //   here. Nothing is stored on the file.
  //
  // With neither a use nor a way to link, nothing is drawn.
  function UsedIn(p) {
    var s1 = useState(false), shown = s1[0], setShown = s1[1];
    var s2 = useState(false), picking = s2[0], setPicking = s2[1];
    var s3 = useState(''), q = s3[0], setQ = s3[1];
    var uses = p.uses || [];
    var n = uses.length;
    var canLink = typeof p.onLink === 'function' && typeof p.targets === 'function';
    if (!n && !canLink) return null;

    var all = picking && canLink ? (p.targets() || []) : [];
    var needle = q.trim().toLowerCase();
    var options = all.filter(function (t) {
      return !needle || (String(t.where || '') + ' ' + String(t.label || '')).toLowerCase().indexOf(needle) >= 0;
    });
    function pick(t) {
      var ok = p.onLink(t);
      if (ok) {
        setPicking(false); setQ(''); setShown(true);
        if (p.say) p.say('Linked to "' + t.label + '".');
      } else if (p.say) {
        p.say(t.taken ? 'That text block already has a file. Unlink it there first.'
          : 'Not linked: that text block already has a file, or the link could not be saved.');
      }
    }

    return h('div', { className: 'px-3 py-1.5 border-b border-gray-800 text-xs', 'data-files-links': true },
      h('div', { className: 'flex flex-wrap items-center gap-x-3 gap-y-1' },
        n ? h('span', { 'data-files-used-in': String(n) },
          h('button', { type: 'button', 'data-files-used-in-toggle': true, 'aria-expanded': shown ? 'true' : 'false',
            onClick: function () { setShown(!shown); }, className: 'text-gray-400' },
            (shown ? '▾ ' : '▸ ') + 'Used in ' + n + ' text block' + (n === 1 ? '' : 's'))) : null,
        canLink ? h('button', { type: 'button', 'data-files-link-add': true, 'aria-expanded': picking ? 'true' : 'false',
          onClick: function () { setPicking(!picking); setQ(''); },
          className: 'text-gray-500 hover:text-gray-300' }, '+ link to a text block') : null),
      shown && n ? h('div', { className: 'mt-1 space-y-0.5' }, uses.map(function (u) {
        return h('button', { key: u.key, type: 'button', 'data-files-use': u.key,
          onClick: function () { if (p.onUse) p.onUse(u); },
          className: 'block w-full text-left rounded px-2 py-1 hover:bg-gray-800 truncate' },
          h('span', { className: 'text-gray-500' }, u.where + ' · '),
          h('span', { className: 'text-gray-200' }, u.label));
      })) : null,
      picking && canLink ? h('div', { className: 'mt-1 rounded border border-gray-700 bg-gray-900 p-2', 'data-files-link-picker': true },
        !all.length
          ? h('div', { className: 'py-2 text-center text-gray-600', 'data-files-link-none': true },
            'No text blocks yet. Write one in SOURCE DUMP, under a mind map.')
          : h(React.Fragment, null,
            h('input', { autoFocus: true, value: q, placeholder: 'search text blocks...', 'data-files-link-search': true,
              onChange: function (e) { setQ(e.target.value); },
              className: 'mb-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200 outline-none' }),
            h('div', { className: 'max-h-56 overflow-y-auto space-y-0.5' },
              !options.length ? h('div', { className: 'py-2 text-center text-gray-600' }, 'No matches.') : null,
              options.map(function (t) {
                // aria-disabled, never `disabled`: a grey row still answers a
                // tap — with the reason — and still reaches the writer.
                return h('button', { key: t.key, type: 'button', 'data-files-link-option': t.key,
                  'aria-disabled': t.taken ? 'true' : undefined,
                  onClick: function () { pick(t); },
                  className: cls('block w-full text-left rounded px-2 py-1 min-h-[2rem]', t.taken ? 'opacity-50' : 'hover:bg-gray-800') },
                  h('div', { className: 'truncate' },
                    h('span', { className: 'text-gray-500' }, t.where + ' · '),
                    h('span', { className: 'text-gray-200' }, t.label)),
                  t.taken ? h('div', { className: 'truncate text-[10px] text-gray-500', 'data-files-link-taken': true },
                    'already has ' + t.taken) : null);
              }))),
        h('button', { type: 'button', 'data-files-link-cancel': true, onClick: function () { setPicking(false); },
          className: 'mt-1 text-gray-500 hover:text-gray-300' }, 'cancel')) : null);
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
    // Ink on the Preview: the same marks a PDF page takes, on the note's record.
    var m = useMarks(rec, p);
    var inked = TF.highlightsOf(rec).length > 0;
    // A phone reads a note as flowing text; it becomes the fixed-width paper
    // (scaled to fit) only once there is ink to keep in place, or a tool is on.
    var paper = !p.phone || inked || !!m.mode;
    // Full screen is the Preview's: Edit has no tools to put in a strip.
    var full = useFullView();
    var isFull = full.on && mode === 'preview';

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
      h(UsedIn, { uses: p.uses, onUse: p.onUse, targets: p.linkTargets, onLink: p.onLink, say: p.say }),
      // the tools and the sheet share one stage, which is what full screen lays over the window
      h('div', { className: cls('flex-1 min-h-0 flex flex-col', isFull ? 'fdir-full' : ''), 'data-files-stage': true, 'data-files-full': isFull ? 'true' : undefined },
        mode === 'preview' ? toolBar({ on: isFull, exit: full.exit }, markTools(m).concat(isFull ? [] : [fullButton(full)])) : null,
        mode === 'edit'
          ? h('textarea', {
            'data-files-editor': true, value: draft, autoFocus: !!p.fresh, spellCheck: true,
            onChange: function (e) { change(e.target.value); }, onBlur: flush,
            placeholder: '# Title\n\nWrite in Markdown…',
            className: 'fdir-editor flex-1 min-h-0 w-full resize-none bg-gray-950 p-4 text-gray-100 outline-none'
          })
          : paper ? h(NotePaper, { text: draft, rec: rec, marks: m })
            : h('div', { className: 'flex-1 min-h-0 overflow-y-auto p-4', 'data-files-scroll': true },
              h(MarkdownPreview, { text: draft }))));
  }

  // A note's Preview as a sheet of PAPER the marks layer can lie on. The text
  // is laid out at one fixed width (PAPER_W) on every screen and SCALED to
  // fit a narrower pane, so a line breaks where it broke when the ink was
  // drawn. The sheet is cut into virtual pages of TF.NOTE_PAGE_RATIO, each
  // with its own MarkLayer, so a mark is stored exactly as a PDF's is: a page
  // and fractions of it. Ink does not follow the text: edit a line above a
  // stroke and the stroke stays where it was drawn.
  var PAPER_W = 720;
  function NotePaper(p) {
    var paneRef = useRef(null), paperRef = useRef(null), bodyRef = useRef(null);
    var s1 = useState(0), paneW = s1[0], setPaneW = s1[1];
    var s2 = useState(0), bodyH = s2[0], setBodyH = s2[1];
    var m = p.marks;
    // The sheet is scaled to the pane, so a wider or narrower pane (full
    // screen, a turned iPad) would leave the same scrollTop over another part
    // of the note: keep the place in the sheet's own units instead.
    var scaleRef = useRef(1), holdRef = useRef(null), lastW = useRef(0);
    useEffect(function () {
      var pane = paneRef.current, body = bodyRef.current;
      if (!pane || !body) return;
      function measure() {
        var cw = pane.clientWidth;
        if (cw !== lastW.current) {
          if (lastW.current) holdRef.current = pane.scrollTop / scaleRef.current;
          lastW.current = cw;
        }
        setPaneW(cw); setBodyH(body.offsetHeight);
      }
      measure();
      if (global.ResizeObserver) {
        var ro = new ResizeObserver(measure); ro.observe(pane); ro.observe(body);
        return function () { ro.disconnect(); };
      }
      global.addEventListener('resize', measure);
      return function () { global.removeEventListener('resize', measure); };
    }, []);
    var R = TF.NOTE_PAGE_RATIO, pageH = Math.round(PAPER_W * R);
    var by = useMemo(function () {
      var o = {};
      TF.highlightsOf(p.rec).forEach(function (hl) { (o[hl.page] = o[hl.page] || []).push(hl); });
      return o;
    }, [p.rec.highlights]);
    var last = Object.keys(by).reduce(function (a, k) { return Math.max(a, Number(k)); }, 0);
    var pages = Math.max(1, Math.ceil(bodyH / pageH), last);
    var scale = paneW ? Math.min(1, Math.max(0.2, (paneW - 24) / PAPER_W)) : 1;
    useLayoutEffect(function () {
      var pane = paneRef.current, at = holdRef.current;
      holdRef.current = null;
      if (pane && at !== null && scale !== scaleRef.current) pane.scrollTop = at * scale;
      scaleRef.current = scale;
    }, [paneW]);
    var H = pages * pageH, tool = { mode: m.mode, kind: m.kind, color: m.color };
    var layers = [];
    for (var k = 1; k <= pages; k++) {
      layers.push(h('div', { key: k, className: 'fdir-paper-page', 'data-files-note-page': k, style: { top: (k - 1) * pageH + 'px', height: pageH + 'px' } },
        h(MarkLayer, { hls: by[k] || NONE, page: k, ratio: pageH / PAPER_W, tool: tool, onStroke: m.addStroke, onErase: m.erase, surface: paperRef })));
    }
    return h('div', { ref: paneRef, className: 'flex-1 min-h-0 overflow-auto p-3', 'data-files-scroll': true },
      h('div', { style: { width: Math.round(PAPER_W * scale) + 'px', height: Math.round(H * scale) + 'px', margin: '0 auto' } },
        h('div', { ref: paperRef, className: 'fdir-paper', 'data-files-paper': true, 'data-files-paper-pages': pages,
          style: { width: PAPER_W + 'px', height: H + 'px', transform: scale < 1 ? 'scale(' + scale + ')' : undefined } },
          h('div', { ref: bodyRef, className: 'fdir-paper-body' }, h(MarkdownPreview, { text: p.text })),
          layers)));
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
    var marks = useMarks(rec, p);

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
    else if (type === 'pdf') body = h(PdfView, { url: st.url, key: st.url, rec: rec, marks: marks, phone: p.phone, say: p.say });
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
      h(UsedIn, { uses: p.uses, onUse: p.onUse, targets: p.linkTargets, onLink: p.onLink, say: p.say }),
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
  // The pen's inks: data colours too, dark enough to read as writing.
  var PEN_INK = { black: '#111827', red: '#dc2626', blue: '#2563eb', green: '#15803d' };
  var PEN_NAMES = { black: 'Black', red: 'Red', blue: 'Blue', green: 'Green' };
  var FIND_COLOR = '#fdba74'; // a finder hit on the page
  var MARK_W = 0.02;       // a highlighter stroke's width, in page widths
  var PEN_W = 0.004;       // a pen stroke's
  var MARK_EPS = 0.0015;   // how far simplification may move a point, in page widths
  var PEN_EPS = 0.0006;    // …of a pen stroke, which is handwriting
  var TAP_LEN = 0.004;     // a stroke shorter than this is a tap: nothing for the highlighter, a dot for the pen
  var lastColor = 'yellow', lastPenColor = 'black', lastKind = 'hl';

  function ptsAttr(pts, H) {
    var out = [];
    for (var i = 0; i + 1 < pts.length; i += 2) out.push(Math.round(pts[i] * 10000) / 10 + ',' + Math.round(pts[i + 1] * H * 10) / 10);
    return out.join(' ');
  }
  function strokeStyle(ink, w) {
    return { stroke: ink, strokeWidth: w * 1000, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };
  }
  function inkOf(hl) {
    return hl.tool === 'pen' ? (PEN_INK[hl.color] || PEN_INK.black) : (MARK_COLORS[hl.color] || MARK_COLORS.yellow);
  }
  // The stored marks as SVG, in a 1000-wide box H tall: a stroke is a
  // polyline, a text highlight a group of boxes. `attr` names each one — the
  // page's layer and a thumbnail's must not answer to the same selector.
  function markShapes(hls, H, hidden, attr) {
    return hls.map(function (hl, i) {
      if (hidden && hidden.has(hl.id)) return null;
      var props = { key: i + ':' + String(hl.id) };
      props[attr] = String(hl.id);
      if (hl.tool === 'text') {
        var kids = [];
        for (var k = 0; k + 3 < hl.rects.length; k += 4) {
          kids.push(h('rect', { key: k, x: hl.rects[k] * 1000, y: hl.rects[k + 1] * H, width: hl.rects[k + 2] * 1000, height: hl.rects[k + 3] * H }));
        }
        props['data-files-mark-kind'] = 'text';
        props.style = { fill: inkOf(hl), stroke: 'none' };
        return h('g', props, kids);
      }
      if (hl.tool === 'pen') props['data-files-mark-kind'] = 'pen';
      props.points = ptsAttr(hl.pts, H);
      props.style = strokeStyle(inkOf(hl), hl.w);
      return h('polyline', props);
    });
  }

  // What a viewer's marks can do, and the tool that is on. One per open file
  // or note; every write is a files-core.js writer through the page's `write`.
  //   mode: null (a Pencil draws, a finger scrolls and selects), 'draw'
  //         (every pointer draws) or 'erase'
  //   kind: 'hl' (the highlighter) or 'pen' — what draws, Pencil included
  function useMarks(rec, p) {
    var s1 = useState(null), mode = s1[0], setMode = s1[1];
    var s2 = useState(lastKind), kind = s2[0], setKindNow = s2[1];
    var s3 = useState(lastColor), hlColor = s3[0], setHlColor = s3[1];
    var s4 = useState(lastPenColor), penColor = s4[0], setPenColor = s4[1];
    var recRef = useRef(rec); recRef.current = rec;
    function recIn(list, id) { return TF.records(list).filter(function (r) { return r.id === id; })[0] || null; }
    function what() { return TF.kindOf(recRef.current) === 'note' ? 'note' : 'file'; }
    function writePin(change) {
      var result, id = recRef.current.id;
      var saved = p.write(function (list) {
        result = change(list, id);
        return result.list;
      }, false);
      if (saved === false) return WRITE_REFUSED;
      if (!result) return 'This workspace is unavailable. Your pin draft is still here.';
      switch (result.refusal) {
        case 'full': return 'Highlights, pins and bookmarks share a 256 KB limit per file. Shorten the pin name or remove a mark.';
        case 'file-missing': return 'This file is no longer available.';
        case 'pin-missing': return 'This pin is no longer available.';
        case 'invalid': return 'This pin could not be saved. Check its name and pages and try again.';
        default: return null;
      }
    }
    return {
      mode: mode, kind: kind, color: kind === 'pen' ? penColor : hlColor,
      setMode: setMode,
      // 🖍 / ✒: the tool that is on turns drawing off; the other one takes over
      pick: function (k) {
        if (mode === 'draw' && kind === k) { setMode(null); return; }
        lastKind = k; setKindNow(k); setMode('draw');
      },
      setColor: function (c) {
        if (kind === 'pen') { lastPenColor = c; setPenColor(c); } else { lastColor = c; setHlColor(c); }
        if (mode === 'erase') setMode(null);
      },
      addStroke: function (page, pts, ratio) {
        var cur = recRef.current, pen = kind === 'pen';
        var simple = TF.simplifyStroke(pts, pen ? PEN_EPS : MARK_EPS, ratio);
        if (simple.length < 4) return;
        var hl = { id: newId(), page: page, color: pen ? penColor : hlColor, w: pen ? PEN_W : MARK_W, pts: simple, createdAt: Date.now() };
        if (pen) hl.tool = 'pen';
        if (!TF.marksFit(cur, hl)) { p.say('This ' + what() + '\'s highlights are full (256 KB a ' + what() + '). Erase some to add more.'); return; }
        p.write(function (l) { return TF.withHighlight(l, cur.id, hl); });
      },
      // A text selection highlighted: `pages` is {page: [x, y, w, h, …]} in
      // fractions of each page, as the browser gave them. One write.
      addTextMarks: function (pages, color) {
        var cur = recRef.current, now = Date.now(), items = [];
        Object.keys(pages).forEach(function (k) {
          var rects = TF.lineRects(pages[k]);
          if (rects.length) items.push({ id: newId(), page: Number(k), color: color, tool: 'text', rects: rects, createdAt: now });
        });
        if (!items.length) return false;
        if (!TF.marksFit(cur, items)) { p.say('This file\'s highlights are full (256 KB a file). Erase some to add more.'); return false; }
        var r = p.write(function (l) { return items.reduce(function (acc, it) { return TF.withHighlight(acc, cur.id, it); }, l); });
        return Array.isArray(r);
      },
      // One gesture, one write, no prompt: Undo puts back the very records,
      // at their stored places (docs/contracts/destructive-controls.md).
      erase: function (ids) {
        var id = recRef.current.id, entries = [];
        var r = p.write(function (l) { entries = TF.highlightEntries(recIn(l, id), ids); return TF.withoutHighlights(l, id, ids); });
        if (!Array.isArray(r) || !entries.length) return;
        var n = entries.length;
        var pens = entries.filter(function (e) { return TF.markKind(e.item) === 'pen'; }).length;
        var one = pens === n ? 'pen stroke' : pens ? 'mark' : 'highlight';
        p.say(n === 1 ? 'Erased a ' + one + '.' : 'Erased ' + n + ' ' + one + 's.', { label: 'Undo', run: function () {
          var back = p.write(function (l) { return TF.withHighlightsRestored(l, id, entries); });
          if (Array.isArray(back)) p.say(n === 1 ? 'The ' + one + ' is back.' : 'The ' + n + ' ' + one + 's are back.');
        } });
      },
      // An error remains in the dialog, where the draft can be revised or retried.
      addPin: function (page, pageEnd, text) {
        var now = Date.now(), name = TF.cleanName(text);
        var pin = { id: newId(), page: page, name: name, createdAt: now, updatedAt: now };
        if (pageEnd > page) pin.pageEnd = pageEnd;
        var error = writePin(function (list, id) { return TF.addPinResult(list, id, pin); });
        if (!error) p.say('Pinned ' + (pageEnd > page ? 'pages ' + page + '–' + pageEnd : 'page ' + page) + ' as ' + q(name) + '.');
        return error;
      },
      // the Edit pin dialog: its name and its pages together
      editPin: function (pinId, change) {
        return writePin(function (list, id) { return TF.editPinResult(list, id, pinId, change, Date.now()); });
      },
      // the prompt is here, after the no-op guard and before the write
      deletePin: function (pinId) {
        var cur = recRef.current;
        var pin = TF.pinsOf(cur).filter(function (x) { return x.id === pinId; })[0];
        if (!pin) return;
        var end = TF.pinEnd(pin);
        if (!global.confirm('Delete the pin ' + q(pin.name) + ' on ' + (end > pin.page ? 'pages ' + pin.page + '–' + end : 'page ' + pin.page) +
          '?\n\nOnly the pin goes: the page and its highlights stay.')) return;
        var r = p.write(function (l) { return TF.withoutPin(l, cur.id, pinId); });
        if (Array.isArray(r)) p.say('Deleted the pin ' + q(pin.name) + '.');
      },
      // A ribbon: one tap on, one tap off, no prompt — a bookmark holds
      // nothing but its page (docs/contracts/destructive-controls.md).
      toggleBookmark: function (page) {
        var cur = recRef.current;
        if (TF.bookmarksOf(cur).indexOf(page) >= 0) { p.write(function (l) { return TF.withoutBookmark(l, cur.id, page); }); return; }
        if (!TF.marksFit(cur, page)) { p.say('This file\'s highlights and pins are full (256 KB a file).'); return; }
        p.write(function (l) { return TF.withBookmark(l, cur.id, page); });
      }
    };
  }

  // The toolbar's drawing controls, as children for a toolbar row.
  function markTools(m) {
    var out = [], pen = m.kind === 'pen';
    out.push(btn('🖍', { key: 'draw', 'data-files-mark-draw': true, 'aria-pressed': m.mode === 'draw' && !pen ? 'true' : 'false',
      'data-armed': !pen ? 'true' : undefined, 'aria-label': 'Highlighter',
      title: m.mode === 'draw' && !pen ? 'Highlighter on: a finger or the mouse draws. Tap again to scroll with a finger.'
        : 'Highlighter: turn on to draw with a finger or the mouse (Apple Pencil always draws)',
      onClick: function () { m.pick('hl'); } }, 'fdir-tool'));
    out.push(btn('✒', { key: 'pen', 'data-files-mark-pen': true, 'aria-pressed': m.mode === 'draw' && pen ? 'true' : 'false',
      'data-armed': pen ? 'true' : undefined, 'aria-label': 'Pen',
      title: m.mode === 'draw' && pen ? 'Pen on: a finger or the mouse writes. Tap again to scroll with a finger.'
        : 'Pen: turn on to write with a finger or the mouse (Apple Pencil always writes with the tool underlined)',
      onClick: function () { m.pick('pen'); } }, 'fdir-tool'));
    out.push(h('span', { key: 'sw', className: 'flex items-center gap-1', role: 'group', 'aria-label': pen ? 'Pen colour' : 'Highlighter colour' },
      (pen ? TF.PEN_COLORS : TF.COLORS).map(function (c) {
        var name = pen ? PEN_NAMES[c] : MARK_NAMES[c];
        return h('button', { key: c, type: 'button', 'data-files-mark-color': c, 'aria-pressed': m.color === c ? 'true' : 'false',
          'aria-label': name, title: name, onClick: function () { m.setColor(c); },
          className: 'fdir-swatch', style: { backgroundColor: pen ? PEN_INK[c] : MARK_COLORS[c] } });
      })));
    out.push(btn('⌫', { key: 'erase', 'data-files-mark-erase': true, 'aria-pressed': m.mode === 'erase' ? 'true' : 'false',
      'aria-label': 'Eraser', title: 'Eraser: touch a highlight or a pen stroke to remove it (Undo brings it back)',
      onClick: function () { m.setMode(m.mode === 'erase' ? null : 'erase'); } }, 'fdir-tool'));
    return out;
  }

  // One page's marks, and the input that makes and erases them.
  //   - An Apple Pencil (pointerType 'pen') always draws; a finger or a mouse
  //     only while 🖍 or ✒ is on. With ⌫ on, every pointer erases.
  //   - The layer itself takes no pointer while no tool is on (CSS), so the
  //     text under it can be selected. Its listeners are therefore on the
  //     SURFACE it lies on — its parent (a PDF page, an image's frame) or
  //     `p.surface` (a note's paper, which several layers share) — and a
  //     press counts only when it lands inside this layer's own box.
  //   - iPad Safari scrolls under a Pencil unless its touch is cancelled, so
  //     the touch listeners are non-passive and cancel a stylus touch (or every
  //     touch while a tool is on, or a palm during a Pencil stroke). React's
  //     own touch handlers are passive, so these are native.
  //   - Coalesced events keep a fast Pencil line smooth; pointer capture keeps
  //     a stroke on the page it started on, clamped to its edges.
  // p: hls, page, ratio (height / width), tool {mode, kind, color}, onStroke,
  //    onErase, surface (a ref, optional).
  function MarkLayer(p) {
    var ref = useRef(null), liveRef = useRef(null), propsRef = useRef(p);
    propsRef.current = p;
    var s1 = useState(null), hidden = s1[0], setHidden = s1[1];

    useEffect(function () {
      var el = ref.current;
      var root = el && ((p.surface && p.surface.current) || el.parentNode);
      if (!el || !root) return;
      var g = null;
      function at(e, rect) {
        var x = (e.clientX - rect.left) / rect.width, y = (e.clientY - rect.top) / rect.height;
        return [x < 0 ? 0 : x > 1 ? 1 : x, y < 0 ? 0 : y > 1 ? 1 : y];
      }
      function inside(e, rect) {
        return e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
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
        if (!rect.width || !rect.height || !inside(e, rect)) return;
        e.preventDefault();
        try { root.setPointerCapture(e.pointerId); } catch (x) { /* a synthetic pointer */ }
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
        try { root.releasePointerCapture(e.pointerId); } catch (x) { /* already released */ }
        if (done.erase) {
          setHidden(null);
          if (e.type !== 'pointercancel' && done.hit.size) P.onErase(Array.from(done.hit));
          return;
        }
        clearLive();
        if (e.type === 'pointercancel') return;
        if (done.len < TAP_LEN) {
          // a tap: nothing for the highlighter, the dot of an i for the pen
          if (P.tool.kind !== 'pen') return;
          var x = done.pts[0], y = done.pts[1];
          P.onStroke(P.page, [x, y, x > 0.999 ? x - 0.0006 : x + 0.0006, y], P.ratio);
          return;
        }
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
      root.addEventListener('pointerdown', down);
      root.addEventListener('pointermove', move);
      root.addEventListener('pointerup', end);
      root.addEventListener('pointercancel', end);
      root.addEventListener('touchstart', touch, { passive: false });
      root.addEventListener('touchmove', touch, { passive: false });
      return function () {
        root.removeEventListener('pointerdown', down);
        root.removeEventListener('pointermove', move);
        root.removeEventListener('pointerup', end);
        root.removeEventListener('pointercancel', end);
        root.removeEventListener('touchstart', touch, { passive: false });
        root.removeEventListener('touchmove', touch, { passive: false });
      };
    }, []);

    var H = 1000 * p.ratio, pen = p.tool.kind === 'pen';
    return h('svg', {
      ref: ref, className: 'fdir-marks', 'data-files-marks': p.page, 'data-mode': p.tool.mode || 'off',
      viewBox: '0 0 1000 ' + H, preserveAspectRatio: 'none', 'aria-hidden': 'true'
    },
      markShapes(p.hls, H, hidden, 'data-files-mark'),
      h('polyline', { ref: liveRef, 'data-files-mark-live': true,
        style: strokeStyle(pen ? (PEN_INK[p.tool.color] || PEN_INK.black) : (MARK_COLORS[p.tool.color] || MARK_COLORS.yellow), pen ? PEN_W : MARK_W) }));
  }

  function ImageView(p) {
    var s1 = useState(true), fit = s1[0], setFit = s1[1];
    var s2 = useState(null), nat = s2[0], setNat = s2[1];
    var s3 = useState(null), pane = s3[0], setPane = s3[1];
    var paneRef = useRef(null);
    var m = p.marks;
    var full = useFullView();
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
    var tools = [btn(fit ? '100%' : 'Fit', { key: 'zoom', 'data-files-zoom': true, onClick: function () { setFit(!fit); } })].concat(markTools(m),
      full.on ? [] : [fullButton(full), h('span', { key: 'tip', className: 'self-center' }, 'Double-tap to zoom; pinch works too.')]);
    return h('div', { className: cls('flex-1 min-h-0 flex flex-col', full.on ? 'fdir-full' : ''), 'data-files-full': full.on ? 'true' : undefined },
      toolBar(full, tools),
      h('div', { ref: paneRef, className: cls('fdir-img flex-1 min-h-0 overflow-auto', fit ? 'flex items-center justify-center p-2' : ''), 'data-files-scroll': true },
        h('div', { className: 'fdir-img-frame', 'data-files-image-frame': true,
          style: size ? { width: size.w + 'px', height: size.h + 'px' } : undefined,
          onDoubleClick: function () { if (!m.mode) setFit(!fit); } },
          h('img', { src: p.url, alt: p.name, 'data-files-image': true, draggable: false,
            onLoad: function (e) { var im = e.currentTarget; if (im.naturalWidth && im.naturalHeight) setNat({ w: im.naturalWidth, h: im.naturalHeight }); },
            style: size ? undefined : { maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto' } }),
          size ? h(MarkLayer, { hls: TF.highlightsOf(p.rec, 1), page: 1, ratio: nat.h / nat.w,
            tool: { mode: m.mode, kind: m.kind, color: m.color }, onStroke: m.addStroke, onErase: m.erase }) : null)));
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

  // ── full screen: the file over the whole window, its tools in a strip ────
  //
  // The viewer's own root is laid over the window (`.fdir-full`), so the very
  // same component goes on — its page, zoom, Find, marks tool and pages panel
  // are not rebuilt — and the browser's own full screen is asked for on the
  // whole document as well where it allows it (an iPad does, an iPhone does
  // not). The document, not the viewer: the floating notes and Note to self
  // live outside the viewer and would otherwise vanish. Leaving: ✕ on the
  // strip, Escape (after any open dialog or pad has had it), or the browser
  // leaving its full screen.
  var STRIP_KEY = 'track_files_tools_pos';   // this device's place for the strip: {x, y}, each 0–1
  var STRIP_M = 8;                            // the strip keeps this far inside the window

  function fullElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  function leaveNative() {
    var x = document.exitFullscreen || document.webkitExitFullscreen;
    if (!x || !fullElement()) return;
    try { var r = x.call(document); if (r && r.then) r.then(null, function () {}); } catch (e) { /* already left */ }
  }
  function useFullView() {
    var s1 = useState(false), on = s1[0], setOn = s1[1];
    var native = useRef(false);
    // Still wanted: false once left or unmounted. The browser's own full
    // screen arrives LATER than the request (a promise, or an event in older
    // Safari); one that arrives after the viewer left is left again at once.
    var want = useRef(false);
    function settled() { if (!want.current) leaveNative(); }
    function enter() {
      want.current = true;
      setOn(true);
      var root = document.documentElement, req = root.requestFullscreen || root.webkitRequestFullscreen;
      if (!req || fullElement()) return;
      try {
        native.current = true;
        var r = req.call(root);
        if (r && r.then) r.then(settled, function () { native.current = false; });
        else {
          var once = function () { document.removeEventListener('webkitfullscreenchange', once); settled(); };
          document.addEventListener('webkitfullscreenchange', once);
        }
      } catch (e) { native.current = false; }
    }
    function exit() {
      want.current = false;
      setOn(false);
      if (native.current) leaveNative();
      native.current = false;
    }
    useEffect(function () {
      if (!on) return;
      function changed() { if (native.current && !fullElement()) { native.current = false; want.current = false; setOn(false); } }
      // On WINDOW, like Note to self's: a keydown reaches window after every
      // document listener, and Note to self's window listener was added at
      // page load, before this one. So whatever sits above the viewer — Note
      // to self, the notes widget's calendar, the Journey book — closes on
      // Escape first and marks the key handled, and full screen waits for the
      // next one.
      function key(e) {
        if (e.key !== 'Escape' || e.defaultPrevented) return;
        if (document.querySelector('.fdir [data-files-dialog], .fdir [data-files-pad], .fdir [data-files-scope-menu]')) return;
        e.preventDefault();
        exit();
      }
      document.addEventListener('fullscreenchange', changed);
      document.addEventListener('webkitfullscreenchange', changed);
      window.addEventListener('keydown', key);
      return function () {
        document.removeEventListener('fullscreenchange', changed);
        document.removeEventListener('webkitfullscreenchange', changed);
        window.removeEventListener('keydown', key);
      };
    }, [on]);
    // the file closed while full screen: the browser's full screen goes with it
    useEffect(function () { return function () { want.current = false; if (native.current) leaveNative(); }; }, []);
    return { on: on, enter: enter, exit: exit };
  }
  function fullButton(full) {
    return btn('⤢ Full screen', { key: 'full', 'data-files-full-enter': true, title: 'Show the file over the whole window, with its tools in a strip you can move',
      onClick: full.enter });
  }
  // The toolbar row, or — full screen — the strip holding the same tools.
  function toolBar(full, tools) {
    if (full.on) return h(ToolStrip, { key: 'strip', onExit: full.exit }, tools);
    return h('div', { key: 'row', className: 'px-3 py-1.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-500 border-b border-gray-800', 'data-files-tools': true }, tools);
  }

  function readStripPos() {
    try {
      var v = JSON.parse(global.localStorage.getItem(STRIP_KEY) || 'null');
      if (v && typeof v.x === 'number' && typeof v.y === 'number' && isFinite(v.x) && isFinite(v.y)) {
        return { x: Math.min(1, Math.max(0, v.x)), y: Math.min(1, Math.max(0, v.y)) };
      }
    } catch (e) { /* no storage, or not ours */ }
    return { x: 0, y: 0.5 };   // the left edge, half way down: clear of the rail, the notes button and Note to self
  }
  // A vertical strip of the viewer's tools that its grip drags anywhere in
  // the window — with a mouse, a finger or a Pencil. Its place is kept on
  // this device, as fractions of the room it has, so it stays inside the
  // window when that turns or shrinks. It lies over the page, never in it:
  // the marks layer's listeners are on the page, so no drag here can draw.
  function ToolStrip(p) {
    var ref = useRef(null), gripRef = useRef(null), drag = useRef(null);
    var s1 = useState(readStripPos), pos = s1[0], setPos = s1[1];
    var s2 = useState(null), size = s2[0], setSize = s2[1];
    var s3 = useState(0), setTick = s3[1];
    var posRef = useRef(pos); posRef.current = pos;
    useLayoutEffect(function () {
      var el = ref.current;
      if (el && (!size || size.w !== el.offsetWidth || size.h !== el.offsetHeight)) setSize({ w: el.offsetWidth, h: el.offsetHeight });
    });
    useEffect(function () {
      function again() { setTick(function (t) { return t + 1; }); }
      global.addEventListener('resize', again);
      // iPad Safari scrolls the page under a finger on the grip unless the touch is cancelled (React's are passive)
      var g = gripRef.current;
      function hold(e) { e.preventDefault(); }
      if (g) g.addEventListener('touchmove', hold, { passive: false });
      return function () { global.removeEventListener('resize', again); if (g) g.removeEventListener('touchmove', hold); };
    }, []);
    var vw = global.innerWidth || 800, vh = global.innerHeight || 600;
    var w = size ? size.w : 0, ht = size ? size.h : 0;
    var roomX = Math.max(0, vw - w - 2 * STRIP_M), roomY = Math.max(0, vh - ht - 2 * STRIP_M);
    function save() { try { global.localStorage.setItem(STRIP_KEY, JSON.stringify(posRef.current)); } catch (e) { /* a private window */ } }
    function down(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      var b = ref.current.getBoundingClientRect();
      drag.current = { id: e.pointerId, dx: e.clientX - b.left, dy: e.clientY - b.top };
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) { /* a synthetic pointer */ }
    }
    function move(e) {
      var d = drag.current;
      if (!d || e.pointerId !== d.id) return;
      e.preventDefault();
      setPos({ x: roomX ? Math.min(1, Math.max(0, (e.clientX - d.dx - STRIP_M) / roomX)) : 0,
        y: roomY ? Math.min(1, Math.max(0, (e.clientY - d.dy - STRIP_M) / roomY)) : 0 });
    }
    function up(e) {
      var d = drag.current;
      if (!d || e.pointerId !== d.id) return;
      drag.current = null;
      save();
    }
    return h('div', { ref: ref, className: 'fdir-strip', 'data-files-tools': true, 'data-files-strip': true, role: 'toolbar', 'aria-label': 'Tools',
      style: { left: Math.round(STRIP_M + pos.x * roomX) + 'px', top: Math.round(STRIP_M + pos.y * roomY) + 'px', visibility: size ? undefined : 'hidden' } },
      h('div', { ref: gripRef, className: 'fdir-grip', 'data-files-strip-grip': true, role: 'button', tabIndex: -1,
        'aria-label': 'Move the tools', title: 'Drag to move the tools',
        onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up, onLostPointerCapture: up }, '⠿'),
      h('div', { className: 'fdir-strip-tools' }, p.children),
      h('button', { type: 'button', className: 'fdir-strip-exit', 'data-files-full-exit': true, 'aria-label': 'Leave full screen', title: 'Leave full screen (Esc)',
        onClick: p.onExit }, '✕'));
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
  var THUMB_PX = 360;   // a thumbnail's drawn width, whatever size its cell is
  // The pages panel's lists: key, label, icon.
  var SCOPES = [['all', 'All pages', '▢'], ['bookmarks', 'Bookmarks', '🔖'], ['notes', 'Notes', '✍'], ['outline', 'Outline', '☰']];

  // A page's typed text, made comparable (TF.searchNorm) and remembered in
  // `cache` for as long as the document is open. A line end reads as a space.
  function pageText(doc, n, cache) {
    if (cache[n] !== undefined) return Promise.resolve(cache[n]);
    return doc.getPage(n).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
      var s = '';
      (tc.items || []).forEach(function (it) { if (typeof it.str === 'string') s += it.str + (it.hasEOL ? ' ' : ''); });
      return (cache[n] = TF.searchNorm(s));
    });
  }

  // Where `needle` (already TF.searchNorm'd) shows on a drawn page: a flat
  // [x, y, w, h, …] in fractions of `pageEl`, one box per line of each hit.
  // The text layer `box` is read one character at a time, each normalised as
  // the query was, so a hit maps back to the very characters it covers.
  function findRects(box, pageEl, needle) {
    var hay = '', at = [];
    var walk = document.createTreeWalker(box, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null), node;
    while ((node = walk.nextNode())) {
      if (node.nodeType === 1) {
        if (node.tagName === 'BR' && hay && hay.charAt(hay.length - 1) !== ' ') { hay += ' '; at.push(null); }
        continue;
      }
      var text = node.nodeValue || '';
      for (var i = 0; i < text.length; i++) {
        var norm = TF.searchNorm(text.charAt(i));
        for (var k = 0; k < norm.length; k++) {
          var c = norm.charAt(k);
          if (c === ' ' && (!hay || hay.charAt(hay.length - 1) === ' ')) continue;
          hay += c; at.push([node, i]);
        }
      }
    }
    var pb = pageEl.getBoundingClientRect(), flat = [];
    if (!pb.width || !pb.height) return NONE;
    TF.searchHits(hay, needle).forEach(function (start) {
      var a = start, b = start + needle.length - 1;
      while (a <= b && !at[a]) a++;
      while (b >= a && !at[b]) b--;
      if (a > b) return;
      var range = document.createRange();
      range.setStart(at[a][0], at[a][1]);
      range.setEnd(at[b][0], at[b][1] + 1);
      var rects = range.getClientRects();
      for (var r = 0; r < rects.length; r++) {
        if (rects[r].width && rects[r].height) {
          flat.push((rects[r].left - pb.left) / pb.width, (rects[r].top - pb.top) / pb.height, rects[r].width / pb.width, rects[r].height / pb.height);
        }
      }
    });
    return flat.length ? TF.lineRects(flat) : NONE;
  }

  // What a selection covers of the PDF's typed text: {any, pages: {page:
  // [x, y, w, h, …]}, x, y}, the boxes in fractions of each page and (x, y)
  // the screen point its last box ends at. Read text node by text node, so
  // nothing but text inside a page's text layer counts — a range that runs
  // across two pages also "contains" their canvases and layers.
  function selectionMarks(range) {
    var out = { any: false, pages: {}, x: 0, y: 0 };
    var top = range.commonAncestorContainer;
    if (top.nodeType !== 1) top = top.parentNode;
    if (!top) return out;
    var walk = document.createTreeWalker(top, NodeFilter.SHOW_TEXT, null), node;
    while ((node = walk.nextNode())) {
      if (!range.intersectsNode(node)) continue;
      var layer = node.parentNode && node.parentNode.closest ? node.parentNode.closest('.fdir-text') : null;
      var pageEl = layer && layer.parentNode;
      if (!pageEl || !pageEl.getAttribute) continue;
      var n = Number(pageEl.getAttribute('data-files-pdf-page'));
      if (!n) continue;
      var r = document.createRange();
      r.setStart(node, node === range.startContainer ? range.startOffset : 0);
      r.setEnd(node, node === range.endContainer ? range.endOffset : (node.nodeValue || '').length);
      if (r.collapsed) continue;
      var pb = pageEl.getBoundingClientRect(), rects = r.getClientRects();
      if (!pb.width || !pb.height) continue;
      for (var i = 0; i < rects.length; i++) {
        var b = rects[i];
        if (!b.width || !b.height) continue;
        (out.pages[n] = out.pages[n] || []).push((b.left - pb.left) / pb.width, (b.top - pb.top) / pb.height, b.width / pb.width, b.height / pb.height);
        out.any = true; out.x = b.right; out.y = b.bottom;
      }
    }
    return out;
  }

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

    var selPoke = useRef(null);
    // The page under the top third of the pane; scrolled to the very end,
    // the last page drawn (which may never reach the top third). Pages are
    // read by their number: while pins are chosen, not every page is drawn.
    function atEnd(el) { return el.scrollTop > 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - 2; }
    function pageNum(e) { return Number(e.getAttribute('data-files-pdf-page')); }
    function readPageNow() {
      var el = scrollRef.current;
      if (!el) return;
      var pagesEl = el.querySelectorAll('[data-files-pdf-page]');
      if (!pagesEl.length) return;
      if (atEnd(el)) { setPageNow(pageNum(pagesEl[pagesEl.length - 1])); return; }
      var mid = el.getBoundingClientRect().top + el.clientHeight / 3;
      for (var i = 0; i < pagesEl.length; i++) {
        var r = pagesEl[i].getBoundingClientRect();
        if (r.bottom >= mid) { setPageNow(pageNum(pagesEl[i])); return; }
      }
    }
    function onScroll() {
      if (st.phase !== 'ready') return;
      if (selPoke.current) selPoke.current();
      readPageNow();
    }
    // What is at the top of the pane: the first page reaching below its top
    // edge, and how far down that page the edge is — or, when the edge is in
    // the gap above a page, that gap in pixels. Scrolled to the very end, the
    // page the rail names there instead (`end`): the page at the top is then
    // NOT the one being read, and holding it would push the last page out.
    function readAnchor() {
      var el = scrollRef.current;
      if (!el) return null;
      var top = el.getBoundingClientRect().top, pagesEl = el.querySelectorAll('[data-files-pdf-page]');
      if (pagesEl.length && atEnd(el)) return { page: pageNum(pagesEl[pagesEl.length - 1]), end: true };
      for (var i = 0; i < pagesEl.length; i++) {
        var r = pagesEl[i].getBoundingClientRect();
        if (r.bottom > top && r.height) {
          var n = Number(pagesEl[i].getAttribute('data-files-pdf-page'));
          return r.top >= top ? { page: n, gap: r.top - top } : { page: n, frac: (top - r.top) / r.height };
        }
      }
      return null;
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
    var booked = useMemo(function () { return TF.bookmarksOf(p.rec); }, [p.rec.bookmarks]);
    var s5 = useState(null), panel = s5[0], setPanel = s5[1];        // the pages panel: null, 'side' or 'full'
    var s6 = useState(null), dlg = s6[0], setDlg = s6[1];
    var s7 = useState({ kind: 'all' }), scope = s7[0], setScope = s7[1];
    var s8 = useState(''), query = s8[0], setQuery = s8[1];
    var s9 = useState(''), needle = s9[0], setNeedle = s9[1];
    var s10 = useState(null), found = s10[0], setFound = s10[1];
    var s11 = useState(null), sel = s11[0], setSel = s11[1];
    // The pins tapped on in the Outline (they glow). None: every page is
    // shown. Any: only their pages — in the viewer, on the rail, in the
    // panel's lists and to the finder. The viewer's own state: never stored.
    var s12 = useState(NONE), chosen = s12[0], setChosen = s12[1];
    // each page's own height/width, once it has been read (page 1's until then)
    var s13 = useState({ m: {}, v: 0 }), ratios = s13[0], setRatios = s13[1];
    var full = useFullView();
    var textCache = useRef({});
    var total = st.phase === 'ready' ? st.pages : 0;
    var shownOnly = useMemo(function () { return TF.shownPages(p.rec, chosen, total); }, [p.rec.pins, chosen, total]);
    // a chosen pin whose pages this PDF does not have shows nothing: show all
    var filtering = shownOnly.length > 0 && TF.chosenPins(p.rec, chosen).length > 0;
    var shown = filtering ? shownOnly : TF.shownPages(p.rec, NONE, total);
    var shownKey = filtering ? shown.join(',') : 'all:' + total;
    // the pages the panel's list — and so the finder — covers
    var scopeList = useMemo(function () { return TF.scopePages(p.rec, scope, total, filtering ? chosen : NONE); },
      [p.rec.highlights, p.rec.pins, p.rec.bookmarks, scope.kind, total, shownKey]);
    var scopeKey = scope.kind === 'all' && !filtering ? 'all:' + total : scopeList.join(',');

    // The view stays on what it was showing whenever the pages change size or
    // which pages are drawn: ✕ or ▦ giving or taking the pane's room, zoom,
    // full screen, a page found to be another shape, pins chosen. Read here,
    // in render — the DOM is still the last commit's layout — and put back
    // in the layout effect below, before the browser paints. A jump asked for
    // (`jumpTo`) goes there instead.
    var w = Math.round(width * zoom);
    var geom = w + '|' + shownKey + '|' + ratios.v;
    var geomRef = useRef(''), anchorRef = useRef(null), jumpTo = useRef(null);
    if (geom !== geomRef.current) {
      if (geomRef.current && !anchorRef.current) anchorRef.current = readAnchor();
      geomRef.current = geom;
    }
    useLayoutEffect(function () {
      var el = scrollRef.current, a = anchorRef.current, to = jumpTo.current;
      anchorRef.current = null; jumpTo.current = null;
      if (!el) return;
      if (to !== null) { scrollToPage(to); return; }
      if (!a) return;
      var pg = el.querySelector('[data-files-pdf-page="' + a.page + '"]');
      if (!pg) { var n = TF.nearestPage(shown, a.page); if (n !== null) scrollToPage(n); return; }
      if (a.end) {
        // still the last page shown: stay at the end; pages added after it: it goes to the top
        if (shown[shown.length - 1] === a.page) { el.scrollTop = el.scrollHeight; readPageNow(); } else scrollToPage(a.page);
        return;
      }
      var r = pg.getBoundingClientRect(), top = el.getBoundingClientRect().top;
      el.scrollTop += r.top - (a.gap !== undefined ? top + a.gap : top - a.frac * r.height);
      readPageNow();
    }, [geom]);
    function onRatio(n, r) {
      setRatios(function (o) {
        if (o.m[n] && Math.abs(o.m[n] - r) < 0.001) return o;
        var m2 = Object.assign({}, o.m); m2[n] = r;
        return { m: m2, v: o.v + 1 };
      });
    }
    // An Outline row tapped: on, or off again. Where the page being read is
    // still shown, the view stays on it; otherwise a pin turned on opens at
    // its first page, and one turned off at the nearest page still shown.
    function togglePin(pin) {
      var on = chosen.indexOf(pin.id) >= 0;
      var next = on ? chosen.filter(function (id) { return id !== pin.id; }) : chosen.concat([pin.id]);
      var nextShown = TF.shownPages(p.rec, next, total);
      if (!nextShown.length) nextShown = TF.shownPages(p.rec, NONE, total);
      // (the page being read is always one that is shown, so a page not in
      // the next set means the set changes, and the layout effect runs)
      if (nextShown.indexOf(pageNow) < 0 && nextShown.join(',') !== shown.join(',')) jumpTo.current = TF.nearestPage(nextShown, on ? pageNow : pin.page);
      setChosen(next);
    }

    // the query, settled and made comparable
    useEffect(function () {
      var t = setTimeout(function () { setNeedle(TF.searchNorm(query).trim()); }, 250);
      return function () { clearTimeout(t); };
    }, [query]);

    // The finder: each page the list covers is read once (and remembered),
    // one after another, so a long PDF answers as it goes and a new query or
    // a new list abandons the old scan.
    useEffect(function () {
      var doc = docRef.current;
      if (st.phase !== 'ready' || !doc || !needle) { setFound(null); return; }
      var alive = true, counts = {}, chars = 0, i = 0, list = scopeList;
      function report(done) { setFound({ needle: needle, counts: Object.assign({}, counts), scanned: i, done: done, chars: chars }); }
      function step() {
        if (!alive) return;
        if (i >= list.length) { report(true); return; }
        var n = list[i];
        pageText(doc, n, textCache.current).then(function (text) {
          var c = TF.searchHits(text, needle).length;
          if (c) counts[n] = c;
          chars += text.length;
        }, function () { /* a page that cannot be read has no hits */ }).then(function () {
          i++;
          if (alive && i % 8 === 0 && i < list.length) report(false);
          step();
        });
      }
      report(false);
      step();
      return function () { alive = false; };
    }, [st.phase, needle, scopeKey]);

    // a chosen pin deleted (here or on the other device) is no longer chosen
    useEffect(function () {
      var keep = chosen.filter(function (id) { return pins.some(function (x) { return x.id === id; }); });
      if (keep.length !== chosen.length) setChosen(keep);
    }, [pins]);

    // A selection of the PDF's typed text offers Copy and Highlight. It is
    // read a moment after it settles; what it covered is kept, so the offer
    // still works if tapping it clears the selection (iPad Safari does).
    useEffect(function () {
      if (st.phase !== 'ready') return;
      var timer = null;
      function read() {
        var root = scrollRef.current, s = global.getSelection ? global.getSelection() : null;
        if (!root || !s || s.isCollapsed || !s.rangeCount) { setSel(null); return; }
        var range = s.getRangeAt(0);
        if (!root.contains(range.commonAncestorContainer)) { setSel(null); return; }
        var got = selectionMarks(range), text = String(s);
        if (!got.any || !text.trim()) { setSel(null); return; }
        setSel({ text: text, pages: got.pages, x: got.x, y: got.y });
      }
      function changed() { clearTimeout(timer); timer = setTimeout(read, 220); }
      selPoke.current = changed;
      document.addEventListener('selectionchange', changed);
      return function () { clearTimeout(timer); selPoke.current = null; document.removeEventListener('selectionchange', changed); };
    }, [st.phase]);

    if (st.phase === 'loading') return h('div', { className: 'p-6 text-xs text-gray-500', 'data-files-pdf-loading': true }, 'Opening the PDF…');
    if (st.phase === 'error') return h('div', { className: 'p-6 text-sm text-red-400', 'data-files-pdf-error': true }, st.message);
    var tool = { mode: m.mode, kind: m.kind, color: m.color };
    var pageEls = shown.map(function (n) {
      return h(PdfPage, { key: n, n: n, doc: docRef.current, width: w, ratio: ratios.m[n] || st.ratio, onRatio: onRatio, root: scrollRef,
        hls: hlBy[n] || NONE, pins: pins.filter(function (x) { return x.page === n; }), tool: tool, onStroke: m.addStroke, onErase: m.erase,
        find: needle });
    });
    var zi = ZOOMS.indexOf(zoom);
    var mode = panel ? (p.phone ? 'full' : panel) : null;   // a phone has no room for a side panel

    // a page that is not shown goes to the nearest one that is
    function jump(n) {
      var to = TF.nearestPage(shown, n < 1 ? 1 : n > st.pages ? st.pages : n);
      if (to !== null) scrollToPage(to);
    }
    function saveDlg(v) {
      var error = dlg.kind === 'pin' ? m.addPin(v.page, v.pageEnd, v.name) : m.editPin(dlg.pinId, v);
      if (!error) setDlg(null);
      return error;
    }
    function dropSel() {
      var s = global.getSelection ? global.getSelection() : null;
      if (s && s.removeAllRanges) s.removeAllRanges();
      setSel(null);
    }
    function copySel() {
      var text = sel.text;
      function ok() { p.say('Copied.'); }
      function old() {
        var done = false;
        try { done = document.execCommand('copy'); } catch (e) { done = false; }
        p.say(done ? 'Copied.' : 'This browser did not allow the copy — use its own Copy.');
      }
      if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, old); else old();
    }
    var marked = booked.indexOf(pageNow) >= 0;
    var f = full.on;   // the strip has room for icons, not words
    var tools = [
      btn('−', { key: 'zo', 'data-files-zoom-out': true, 'aria-label': 'Zoom out', disabled: zi <= 0, onClick: function () { setZoom(ZOOMS[Math.max(0, zi - 1)]); } }),
      h('span', { key: 'zl', 'data-files-zoom-level': true }, Math.round(zoom * 100) + '%'),
      btn('+', { key: 'zi', 'data-files-zoom-in': true, 'aria-label': 'Zoom in', disabled: zi >= ZOOMS.length - 1, onClick: function () { setZoom(ZOOMS[Math.min(ZOOMS.length - 1, zi + 1)]); } }),
      btn('Fit', { key: 'fit', 'data-files-zoom-fit': true, onClick: function () { setZoom(1); } })
    ].concat(markTools(m), [
      btn('🔖', { key: 'bm', 'data-files-bookmark-now': true, 'aria-pressed': marked ? 'true' : 'false',
        'aria-label': (marked ? 'Remove the bookmark from page ' : 'Bookmark page ') + pageNow,
        title: marked ? 'Page ' + pageNow + ' is bookmarked. Tap to remove the bookmark.' : 'Bookmark page ' + pageNow,
        onClick: function () { m.toggleBookmark(pageNow); } }, 'fdir-tool'),
      btn(f ? '📌' : '📌 Pin', { key: 'pin', 'data-files-pin-add': true, 'aria-label': 'Pin pages', title: 'Pin this page, or a range of pages, under a name',
        onClick: function () { setDlg({ kind: 'pin', from: pageNow, to: pageNow, total: st.pages, title: 'Pin pages', action: 'Pin' }); } }),
      btn(f ? '▦' : '▦ Pages', { key: 'pages', 'data-files-pages-toggle': true, 'aria-expanded': panel ? 'true' : 'false', 'aria-label': 'Pages',
        title: 'Thumbnails of every page, your bookmarks, the pages you wrote on, your pins, and Find',
        onClick: function () { setPanel(panel ? null : 'side'); } }, 'fdir-tool'),
      f ? null : fullButton(full),
      h('span', { key: 'at', className: 'ml-auto', 'data-files-pdf-at': true },
        'Page ' + pageNow + (filtering ? ' · ' + shown.length + ' of ' + st.pages + ' shown' : ' of ' + st.pages))
    ]);

    return h('div', { className: cls('flex-1 min-h-0 flex flex-col', f ? 'fdir-full' : ''), 'data-files-pdf': true, 'data-files-pdf-pages': st.pages,
      'data-files-full': f ? 'true' : undefined },
      toolBar(full, tools),
      h('div', { className: 'flex-1 min-h-0 flex' },
        h('div', { className: 'flex-1 min-w-0 min-h-0 relative flex flex-col' },
          h('div', { ref: scrollRef, onScroll: onScroll, className: 'fdir-pdf-scroll flex-1 min-h-0 overflow-auto py-3', 'data-files-scroll': true },
            width ? pageEls : null),
          h(PageRail, { page: pageNow, total: st.pages, onJump: jump,
            prev: TF.stepPage(shown, pageNow, -1), next: TF.stepPage(shown, pageNow, 1),
            shown: filtering ? shown : null })),
        mode ? h(PagesPanel, { mode: mode, phone: p.phone, rec: p.rec, doc: docRef.current, total: st.pages, ratio: st.ratio, pageNow: pageNow,
          scope: scope, setScope: setScope, scopeList: scopeList, query: query, setQuery: setQuery, needle: needle, found: found,
          pins: pins, hlBy: hlBy, booked: booked, marks: m, chosen: chosen, filtering: filtering, shownCount: shown.length, onTogglePin: togglePin,
          onJump: function (n2) { jump(n2); if (mode === 'full') setPanel(null); },
          onEditPin: function (pin) { setDlg({ kind: 'pin-rename', pinId: pin.id, from: pin.page, to: TF.pinEnd(pin), total: st.pages, initial: pin.name, title: 'Edit pin' }); },
          onAddPin: function () { setDlg({ kind: 'pin', from: pageNow, to: pageNow, total: st.pages, title: 'Pin pages', action: 'Pin' }); },
          onExpand: function () { setPanel(mode === 'full' ? 'side' : 'full'); },
          onClose: function () { setPanel(null); } }) : null),
      sel ? h('div', { className: 'fdir-selpop', 'data-files-sel': true, role: 'toolbar', 'aria-label': 'Selected text',
        style: { left: Math.max(8, Math.min(sel.x - 110, (global.innerWidth || 800) - 230)) + 'px', top: Math.min(sel.y + 10, (global.innerHeight || 600) - 52) + 'px' },
        // pressing an offer must not clear the selection it acts on
        onMouseDown: function (e) { e.preventDefault(); } },
        btn('Copy', { 'data-files-sel-copy': true, onClick: copySel }),
        TF.COLORS.map(function (c) {
          return h('button', { key: c, type: 'button', 'data-files-sel-color': c, className: 'fdir-swatch',
            'aria-label': 'Highlight in ' + MARK_NAMES[c].toLowerCase(), title: 'Highlight in ' + MARK_NAMES[c].toLowerCase(),
            style: { backgroundColor: MARK_COLORS[c] },
            onClick: function () { if (m.addTextMarks(sel.pages, c)) dropSel(); } });
        }),
        btn('✕', { 'data-files-sel-close': true, 'aria-label': 'Dismiss', onClick: dropSel })) : null,
      dlg ? h(PinDialog, { dialog: dlg, onCancel: function () { setDlg(null); }, onSave: saveDlg }) : null);
  }
  var NONE = [];

  // The rail on a PDF's right edge, after Notability's: ▲, the page you are
  // on, the total, ▼. The page number opens a pad to type one into — its own
  // keys on a touch screen (the system keyboard would cover half an iPad),
  // the keyboard on a laptop.
  //   While pins are chosen (`shown`, the pages drawn), ▲ / ▼ step to the
  //   next page shown (`prev`, `next`) and the pad goes only to one of them.
  function PageRail(p) {
    var s1 = useState(false), open = s1[0], setOpen = s1[1];
    var s2 = useState(''), text = s2[0], setText = s2[1];
    var inputRef = useRef(null);
    var touch = !!(global.TrackViewport && global.TrackViewport.isTouchPrimary && global.TrackViewport.isTouchPrimary());
    var typed = TF.pageFromText(text, p.total);
    var hidden = typed !== null && !!p.shown && p.shown.indexOf(typed) < 0;
    var target = hidden ? null : typed;
    useEffect(function () { if (open && !touch && inputRef.current) inputRef.current.focus(); }, [open]);
    function close() { setOpen(false); setText(''); }
    function go() { if (target === null) return; p.onJump(target); close(); }
    function key(d) { setText(function (t) { return d === 'back' ? t.slice(0, -1) : (t + d).slice(0, 7); }); }
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0'];
    return h('div', { className: 'fdir-rail', 'data-files-rail': true },
      open ? h('div', { className: 'fdir-pad', 'data-files-pad': true, role: 'dialog', 'aria-label': 'Go to a page' },
        h('input', { ref: inputRef, value: text, readOnly: touch, inputMode: touch ? 'none' : 'numeric', 'data-files-pad-input': true,
          placeholder: '1–' + p.total, 'aria-label': 'Page number',
          onChange: function (e) { setText(String(e.target.value).replace(/[^0-9]/g, '').slice(0, 7)); },
          onKeyDown: function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } else if (e.key === 'Escape') { e.preventDefault(); close(); } } }),
        h('div', { className: 'fdir-pad-keys' }, keys.map(function (d) {
          return h('button', { key: d, type: 'button', 'data-files-pad-key': d, 'aria-label': d === 'back' ? 'Delete' : d,
            style: d === '0' ? { gridColumn: '2' } : (d === 'back' ? { gridColumn: '3', gridRow: '4' } : undefined),
            onClick: function () { key(d); } }, d === 'back' ? '⌫' : d);
        })),
        h('button', { type: 'button', className: 'fdir-pad-go', 'data-files-pad-go': true, disabled: target === null, onClick: go },
          hidden ? 'Page ' + typed + ' is not shown' : target === null ? (text ? 'No page ' + text : 'Go') : 'Go to page ' + target)) : null,
      h('button', { type: 'button', 'data-files-rail-prev': true, 'aria-label': 'Previous page', disabled: p.prev === null,
        onClick: function () { if (p.prev !== null) p.onJump(p.prev); } }, '▲'),
      h('button', { type: 'button', 'data-files-rail-page': true, 'aria-expanded': open ? 'true' : 'false',
        'aria-label': 'Page ' + p.page + ' of ' + p.total + '. Go to a page', title: 'Go to a page',
        onClick: function () { if (open) close(); else setOpen(true); } }, String(p.page)),
      h('span', { 'data-files-rail-total': true }, String(p.total)),
      h('button', { type: 'button', 'data-files-rail-next': true, 'aria-label': 'Next page', disabled: p.next === null,
        onClick: function () { if (p.next !== null) p.onJump(p.next); } }, '▼'));
  }

  // The pages panel (▦), after Notability's: a finder, one of four lists —
  // All pages, Bookmarks, Notes (pages with marks), Outline (pins) — as
  // thumbnails, and ⤢ for the same thing as a full-screen grid. The finder
  // searches only the pages the list covers. State lives in PdfView, so a
  // query and its hits on the pages outlast the panel being closed.
  //   The Outline's rows are switches: a pin tapped on glows, and while any
  //   glows only the chosen pins' pages are shown (PdfView's `chosen`).
  function PagesPanel(p) {
    var full = p.mode === 'full', scope = p.scope, m = p.marks;
    var s1 = useState(false), menu = s1[0], setMenu = s1[1];
    var listRef = useRef(null);
    var searching = !!p.needle;
    var showPins = scope.kind === 'outline' && !searching;
    var f = p.found && p.found.needle === p.needle ? p.found : null;
    var counts = (f && f.counts) || {};
    var shown = searching ? p.scopeList.filter(function (n) { return counts[n]; }) : p.scopeList;
    var hits = 0;
    shown.forEach(function (n) { hits += counts[n] || 0; });
    var label = SCOPES.filter(function (sc) { return sc[0] === scope.kind; })[0][1];
    var onCount = p.pins.filter(function (x) { return p.chosen.indexOf(x.id) >= 0; }).length;

    // on opening, and when the list changes, the page being read comes into view
    useEffect(function () {
      var list = listRef.current, el = list && list.querySelector('[data-files-thumb="' + p.pageNow + '"]');
      if (!el) return;
      var a = el.getBoundingClientRect(), b = list.getBoundingClientRect();
      list.scrollTop += a.top - b.top - Math.max(0, (b.height - a.height) / 2);
    }, [scope.kind, p.mode]);

    var countText;
    if (searching) {
      countText = !f || !f.done ? 'Searching… ' + (f ? f.scanned : 0) + ' / ' + p.scopeList.length
        : hits ? hits + (hits === 1 ? ' result' : ' results') + ' on ' + shown.length + (shown.length === 1 ? ' page' : ' pages') : 'No results';
    } else if (showPins) {
      countText = p.pins.length + (p.pins.length === 1 ? ' pin' : ' pins') +
        (onCount ? ' · ' + onCount + ' on, showing ' + p.shownCount + (p.shownCount === 1 ? ' page' : ' pages') : '');
    } else countText = shown.length + (shown.length === 1 ? ' page' : ' pages');

    var empty = null;
    if (searching && f && f.done && !shown.length) {
      empty = scope.kind === 'all' && !f.chars ? 'This PDF has no typed text to search — it is probably a scan.'
        : 'Nothing in ' + label + (p.filtering ? ' on the pins you chose' : '') + ' matches.';
    } else if (!searching && !showPins && !shown.length) {
      empty = scope.kind === 'bookmarks' ? (p.filtering ? 'No bookmarks on the pins you chose.' : 'No bookmarks yet. Tap the ribbon on a page here, or 🔖 above the page, to bookmark it.')
        : scope.kind === 'notes' ? (p.filtering ? 'Nothing written or highlighted on the pins you chose.' : 'No pages written or highlighted on yet.') : 'No pages.';
    }

    var findBox = h('label', { className: cls('fdir-find-box', full ? 'flex-1 max-w-xl mx-auto' : '') },
      h('span', { 'aria-hidden': 'true' }, '🔍'),
      h('input', { type: 'text', value: p.query, 'data-files-find': true, placeholder: 'Find', 'aria-label': 'Find text in ' + label,
        autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false, enterKeyHint: 'search',
        onChange: function (e) { p.setQuery(e.target.value); } }),
      p.query ? h('button', { type: 'button', 'data-files-find-clear': true, 'aria-label': 'Clear the search',
        onClick: function () { p.setQuery(''); } }, '✕') : null);
    var scopeBtn = h('div', { className: 'relative flex-none' },
      h('button', { type: 'button', 'data-files-scope': scope.kind, 'aria-expanded': menu ? 'true' : 'false', 'aria-haspopup': 'true',
        className: 'flex items-center gap-1 text-sm font-bold max-w-[13rem]', onClick: function () { setMenu(!menu); } },
        h('span', { className: 'truncate', 'data-files-scope-label': true }, label), h('span', { 'aria-hidden': 'true' }, '▾')),
      menu ? h('div', { className: 'fdir-scope-menu', 'data-files-scope-menu': true, role: 'menu' },
        SCOPES.map(function (sc) {
          return h('button', { key: sc[0], type: 'button', role: 'menuitemradio', 'aria-checked': scope.kind === sc[0] ? 'true' : 'false',
            'data-files-scope-item': sc[0], onClick: function () { setMenu(false); p.setScope({ kind: sc[0] }); } },
            h('span', { className: 'w-4 text-center', 'aria-hidden': 'true' }, scope.kind === sc[0] ? '✓' : ''),
            h('span', { className: 'w-5 text-center', 'aria-hidden': 'true' }, sc[2]),
            h('span', null, sc[1]));
        })) : null);
    var closeBtn = h('button', { type: 'button', 'data-files-pages-close': true, className: 'text-sm font-bold flex-none', onClick: p.onClose },
      full ? 'Close' : '✕');

    var body;
    if (showPins) {
      body = h('div', { 'data-files-pin-list': true, className: cls('p-1', full ? 'max-w-xl mx-auto' : '') },
        p.pins.length ? p.pins.map(function (pin, i) {
          var end = TF.pinEnd(pin), on = p.chosen.indexOf(pin.id) >= 0, pages = 'p. ' + pin.page + (end > pin.page ? '–' + end : '');
          return h('div', { key: i + ':' + String(pin.id), 'data-files-pin-row': String(pin.id), 'data-on': on ? 'true' : undefined,
            className: 'fdir-pin-row flex items-center gap-1 rounded hover:bg-gray-800' },
            h('button', { type: 'button', 'data-files-pin-jump': String(pin.id), 'aria-pressed': on ? 'true' : 'false',
              'aria-label': pin.name + ', ' + pages + (on ? ': shown. Tap to stop showing only it' : '. Tap to show only its pages'),
              title: on ? 'On: only the pins that glow are shown. Tap to turn it off.' : 'Tap to show only this pin\'s pages (and any other pin that glows)',
              className: 'flex-1 min-w-0 flex items-center gap-2 px-2 py-2 text-left text-xs text-gray-200',
              onClick: function () { p.onTogglePin(pin); } },
              h('span', { 'aria-hidden': 'true' }, '📌'),
              h('span', { className: 'flex-1 min-w-0 truncate', 'data-files-pin-name': true }, pin.name),
              h('span', { className: 'text-[10px] text-gray-500 shrink-0', 'data-files-pin-range': true }, pages)),
            h('button', { type: 'button', 'data-files-pin-rename': String(pin.id), 'aria-label': 'Edit ' + pin.name, className: 'px-2 py-2 text-xs text-gray-400',
              onClick: function () { p.onEditPin(pin); } }, '✎'),
            h('button', { type: 'button', 'data-files-pin-delete': String(pin.id), 'aria-label': 'Delete ' + pin.name, className: 'px-2 py-2 text-xs text-gray-400',
              onClick: function () { m.deletePin(pin.id); } }, '🗑'));
        }) : h('div', { className: 'px-2 py-3 text-[11px] text-gray-500', 'data-files-pin-empty': true },
          'No pins yet. 📌 Pin names the page you are on, or a range of pages, and lists it here.'),
        p.pins.length ? h('div', { className: 'px-2 pt-2 text-[10px] text-gray-500', 'data-files-pin-hint': true },
          onCount ? 'Only the pins that glow are shown. Tap one to turn it off; with none on, every page shows.'
            : 'Tap a pin to show only its pages. Tap more to add theirs.') : null);
    } else if (empty) {
      body = h('div', { className: 'p-4 text-xs text-gray-500', 'data-files-pages-empty': true }, empty);
    } else {
      body = h('div', { className: 'fdir-pages-grid', 'data-files-pages-grid': true },
        shown.map(function (n) {
          return h(PdfThumb, { key: n, n: n, doc: p.doc, ratio: p.ratio, root: listRef, current: n === p.pageNow,
            booked: p.booked.indexOf(n) >= 0, count: counts[n] || 0, hls: p.hlBy[n] || NONE,
            onJump: p.onJump, onBookmark: m.toggleBookmark });
        }));
    }

    return h('aside', { className: 'fdir-pages', 'data-files-pages': p.mode, 'aria-label': 'Pages' },
      full
        // pt-8: the page's own handle (Note to self) hangs 24px down the top centre, over this row
        ? h('div', { className: 'flex items-center gap-3 px-4 pt-8 pb-3 border-b border-gray-800' }, scopeBtn, findBox, closeBtn)
        : h('div', { className: 'p-2 space-y-2 border-b border-gray-800' }, findBox,
          h('div', { className: 'flex items-center justify-between gap-2' }, scopeBtn, closeBtn)),
      h('div', { className: 'flex items-center gap-2 px-3 py-1.5 text-[11px] text-gray-500' },
        h('span', { 'data-files-find-count': true, 'data-done': !searching || (f && f.done) ? 'true' : 'false' }, countText)),
      h('div', { ref: listRef, className: 'flex-1 min-h-0 overflow-y-auto', 'data-files-pages-scroll': true }, body),
      // both on the LEFT: the floating notes button sits over the right corner
      h('div', { className: 'flex items-center gap-2 px-3 py-2 border-t border-gray-800' },
        p.phone ? null : h('button', { type: 'button', 'data-files-pages-expand': true,
          className: 'rounded border border-gray-700 px-2 py-1 text-xs text-gray-300',
          // "Grid", not "Full screen": that name is the viewer's ⤢, which lays the FILE over the window
          'aria-label': full ? 'Back to the side panel' : 'Pages as a grid over the viewer', title: full ? 'Back to the side panel' : 'Pages as a grid over the viewer',
          onClick: p.onExpand }, full ? '⤡ Side panel' : '⤢ Grid'),
        scope.kind === 'outline' ? btn('📌 Pin pages', { 'data-files-pages-pin': true, onClick: p.onAddPin }) : null));
  }

  // One thumbnail: drawn only while it is near the panel's view, with the
  // page's marks over it, a ribbon to bookmark it, and its number.
  function PdfThumb(p) {
    var ref = useRef(null), s1 = useState(false), near = s1[0], setNear = s1[1];
    var s2 = useState(p.ratio), ratio = s2[0], setRatio = s2[1];
    var s3 = useState(false), drawn = s3[0], setDrawn = s3[1];
    useEffect(function () {
      var el = ref.current;
      if (!el || !global.IntersectionObserver) { setNear(true); return; }
      var io = new IntersectionObserver(function (es) { es.forEach(function (e) { setNear(e.isIntersecting); }); },
        { root: p.root.current, rootMargin: '100% 0px' });
      io.observe(el);
      return function () { io.disconnect(); };
    }, []);
    useEffect(function () {
      if (!near || !p.doc) { setDrawn(false); return; }
      var alive = true, task = null;
      p.doc.getPage(p.n).then(function (pg) {
        if (!alive) return;
        var base = pg.getViewport({ scale: 1 });
        var r = base.height / base.width;
        if (Math.abs(r - ratio) > 0.001) setRatio(r);
        var vp = pg.getViewport({ scale: THUMB_PX / base.width });
        var canvas = ref.current && ref.current.querySelector('canvas');
        if (!canvas) return;
        canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
        task = pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
        return task.promise.then(function () { if (alive) setDrawn(true); });
      }).then(null, function () {});
      return function () { alive = false; if (task) try { task.cancel(); } catch (e) { /* already done */ } };
    }, [near, p.doc, p.n]);
    return h('div', { ref: ref, className: 'fdir-thumb', 'data-files-thumb': p.n, 'data-current': p.current ? 'true' : undefined,
      'data-rendered': drawn ? 'true' : undefined },
      h('button', { type: 'button', className: 'fdir-thumb-page', 'data-files-thumb-jump': p.n, 'aria-label': 'Go to page ' + p.n,
        'aria-current': p.current ? 'page' : undefined, style: { aspectRatio: '1 / ' + ratio }, onClick: function () { p.onJump(p.n); } },
        near ? h('canvas', null) : null,
        near && p.hls.length ? h('svg', { className: 'fdir-thumb-marks', viewBox: '0 0 1000 ' + 1000 * ratio, preserveAspectRatio: 'none', 'aria-hidden': 'true' },
          markShapes(p.hls, 1000 * ratio, null, 'data-files-thumb-mark')) : null,
        p.count ? h('span', { className: 'fdir-thumb-count', 'data-files-thumb-count': p.n }, String(p.count)) : null),
      h('button', { type: 'button', className: 'fdir-ribbon', 'data-files-bookmark': p.n, 'aria-pressed': p.booked ? 'true' : 'false',
        'aria-label': (p.booked ? 'Remove the bookmark from page ' : 'Bookmark page ') + p.n,
        onClick: function () { p.onBookmark(p.n); } },
        h('svg', { viewBox: '0 0 16 22', 'aria-hidden': 'true' }, h('path', { d: 'M2 0h12v20l-6-4.5L2 20z' }))),
      h('div', { className: 'fdir-thumb-n' }, String(p.n)));
  }

  // One page: a placeholder of the right size until it is near the view,
  // then a canvas with pdf.js's TEXT LAYER over it (invisible text, so the
  // typed words can be selected and the finder can show where it hit); let
  // go again when it is far away, so a 300-page PDF holds only the pages
  // around the reader in memory.
  //   A page's own shape is reported up (`onRatio`) rather than kept here, so
  //   PdfView can keep the view where it was when the page changes height.
  function PdfPage(p) {
    var ref = useRef(null), textRef = useRef(null), s1 = useState(false), near = s1[0], setNear = s1[1];
    var ratio = p.ratio;
    var s3 = useState(false), drawn = s3[0], setDrawn = s3[1];
    var s4 = useState(0), textV = s4[0], setTextV = s4[1];
    var s5 = useState(NONE), hits = s5[0], setHits = s5[1];
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
        if (Math.abs(r - ratio) > 0.001 && p.onRatio) p.onRatio(p.n, r);
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
    // The text layer, rebuilt at each width. pdf.js sizes it and its glyphs
    // from --scale-factor: CSS pixels per PDF unit.
    useEffect(function () {
      var box = textRef.current, lib = global.pdfjsLib;
      if (!near || !p.doc || !p.width || !box || !lib || !lib.renderTextLayer) return;
      var alive = true, task = null;
      p.doc.getPage(p.n).then(function (pg) {
        if (!alive) return;
        var base = pg.getViewport({ scale: 1 }), scale = p.width / base.width;
        return pg.getTextContent().then(function (tc) {
          if (!alive) return;
          box.textContent = '';
          box.style.setProperty('--scale-factor', String(scale));
          task = lib.renderTextLayer({ textContentSource: tc, container: box, viewport: pg.getViewport({ scale: scale }), textDivs: [] });
          return task.promise.then(function () {
            if (!alive) return;
            box.setAttribute('data-files-text', tc.items && tc.items.length ? 'ready' : 'none');
            setTextV(function (v) { return v + 1; });
          });
        });
      }).then(null, function () {});
      return function () { alive = false; if (task && task.cancel) try { task.cancel(); } catch (e) { /* already done */ } };
    }, [near, p.doc, p.width, p.n]);
    // where the finder's query shows on this page
    useEffect(function () {
      var box = textRef.current, el = ref.current;
      if (!near || !box || !el || !p.find || !textV) { setHits(NONE); return; }
      setHits(findRects(box, el, p.find));
    }, [near, textV, p.find, p.width]);
    var boxes = [];
    for (var k = 0; k + 3 < hits.length; k += 4) {
      boxes.push(h('i', { key: k, style: { left: hits[k] * 100 + '%', top: hits[k + 1] * 100 + '%', width: hits[k + 2] * 100 + '%', height: hits[k + 3] * 100 + '%', backgroundColor: FIND_COLOR } }));
    }
    return h('div', { ref: ref, className: 'fdir-pdf-page', 'data-files-pdf-page': p.n, 'data-rendered': drawn ? 'true' : undefined,
      style: { width: p.width + 'px', height: Math.round(p.width * ratio) + 'px' } },
      near ? h('canvas', null) : null,
      near ? h('div', { ref: textRef, className: 'fdir-text', 'data-off': p.tool.mode ? 'true' : undefined }) : null,
      boxes.length ? h('div', { className: 'fdir-find', 'data-files-find-hits': p.n }, boxes) : null,
      !drawn ? h('div', { className: 'absolute inset-0 flex items-center justify-center text-xs text-gray-400 pointer-events-none' }, String(p.n)) : null,
      near ? h(MarkLayer, { hls: p.hls, page: p.n, ratio: ratio, tool: p.tool, onStroke: p.onStroke, onErase: p.onErase }) : null,
      p.pins.length ? h('div', { className: 'fdir-pin-flags', 'data-files-pin-flags': p.n },
        p.pins.map(function (pin, i) {
          var end = TF.pinEnd(pin);
          return h('span', { key: i + ':' + String(pin.id), className: 'fdir-pin-flag', 'data-files-pin-flag': String(pin.id), title: pin.name },
            '📌 ' + pin.name + (end > pin.page ? ' · p. ' + pin.page + '–' + end : ''));
        })) : null);
  }

  // Naming a pin and choosing its pages: one page, or From … To.
  function PinDialog(p) {
    var dlg = p.dialog, total = dlg.total;
    function auto(a, b) { return a === null ? '' : (b !== null && b > a ? 'Pages ' + a + '–' + b : 'Page ' + a); }
    var s1 = useState(dlg.initial || auto(dlg.from, dlg.to)), name = s1[0], setName = s1[1];
    var s2 = useState(String(dlg.from)), from = s2[0], setFrom = s2[1];
    var s3 = useState(String(dlg.to)), to = s3[0], setTo = s3[1];
    var s4 = useState(null), saveError = s4[0], setSaveError = s4[1];
    // until the user types a name or a last page, both follow the first page
    var own = useRef({ name: !!dlg.initial, to: dlg.to !== dlg.from });
    var inputRef = useRef(null);
    useEffect(function () {
      var el = inputRef.current;
      if (el) { el.focus(); try { el.select(); } catch (e) { /* not every input selects */ } }
    }, []);
    var a = TF.pageFromText(from, total), b = TF.pageFromText(to, total);
    var why = !TF.cleanName(name) ? 'A name can\'t be empty.'
      : a === null || b === null ? 'A page is a number from 1 to ' + total + '.'
        : b < a ? 'The last page can\'t come before the first.' : null;
    function digits(v) { return String(v).replace(/[^0-9]/g, '').slice(0, 7); }
    function typedFrom(v) {
      var t = digits(v), nextTo = own.current.to ? to : t;
      setSaveError(null);
      setFrom(t);
      if (!own.current.to) setTo(t);
      if (!own.current.name) setName(auto(TF.pageFromText(t, total), TF.pageFromText(nextTo, total)));
    }
    function typedTo(v) {
      var t = digits(v);
      setSaveError(null);
      own.current.to = true; setTo(t);
      if (!own.current.name) setName(auto(a, TF.pageFromText(t, total)));
    }
    function save() { if (!why) setSaveError(p.onSave({ name: name, page: a, pageEnd: b })); }
    function keys(e) { if (e.key === 'Enter') { e.preventDefault(); save(); } else if (e.key === 'Escape') { e.preventDefault(); p.onCancel(); } }
    var box = 'w-16 rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-gray-100 outline-none text-center';
    return h('div', { className: 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4', 'data-files-dialog': dlg.kind,
      onMouseDown: function (e) { if (e.target === e.currentTarget) p.onCancel(); } },
      h('div', { className: 'w-full max-w-sm rounded-xl border border-gray-700 bg-gray-900 p-4 space-y-3 shadow-2xl' },
        h('div', { className: 'text-sm font-bold text-gray-100' }, dlg.title),
        h('input', { ref: inputRef, value: name, 'data-files-dialog-input': true, 'aria-label': 'Pin name',
          onChange: function (e) { own.current.name = true; setName(e.target.value); setSaveError(null); }, onKeyDown: keys,
          className: 'w-full rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-gray-100 outline-none' }),
        h('div', { className: 'flex items-center gap-2 text-xs text-gray-400' },
          h('span', null, 'Pages'),
          h('input', { value: from, inputMode: 'numeric', 'data-files-pin-from': true, 'aria-label': 'First page', className: box,
            onChange: function (e) { typedFrom(e.target.value); }, onKeyDown: keys }),
          h('span', null, 'to'),
          h('input', { value: to, inputMode: 'numeric', 'data-files-pin-to': true, 'aria-label': 'Last page', className: box,
            onChange: function (e) { typedTo(e.target.value); }, onKeyDown: keys }),
          h('span', null, 'of ' + total)),
        why || saveError ? h('div', { className: 'text-[11px] text-gray-400', 'data-files-pin-why': true,
          role: saveError ? 'alert' : undefined }, why || saveError) : null,
        h('div', { className: 'flex justify-end gap-2' },
          btn('Cancel', { 'data-files-dialog-cancel': true, onClick: p.onCancel }),
          h('button', { type: 'button', 'data-files-dialog-save': true, disabled: !!why, onClick: save,
            className: cls('rounded px-3 py-1 text-xs font-bold text-white', why ? 'bg-gray-700' : 'bg-indigo-700') },
            dlg.action || 'Save'))));
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
