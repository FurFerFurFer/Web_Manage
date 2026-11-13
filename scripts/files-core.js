/* ── files-core.js ──────────────────────────────────────────────────────────
   The one definition of a FILES record (`window.TrackFiles`): what the
   Storages page's FILES tab stores in the slot field `files`, what each kind
   of record is, how a name is cleaned and renamed, and every writer of the
   list — add, rename, a note's text, a Drive id arriving, delete, move and
   reorder. The user's 2026-11-13 request: a Notability-style library of
   folders, `.md` notes and uploaded files (PNG, JPEG, PDF, anything), laid out
   like SRCH → DIRECTORY.

   The list is a TREE drawn by `TrackMMTree` (mm-tree-core.js), which this
   module reuses rather than re-spelling: a record's parent is `parentIds`,
   holding at most ONE folder id here, and a record with no `parentIds` key is
   at the top level. The ORDER of `files` is the order siblings are drawn in,
   as it is for `mms`; only `withArranged` changes it.

   Three kinds, stored as `kind`:

   - 'folder' — {id, kind, name, createdAt, updatedAt, parentIds?}
   - 'note'   — a `.md` note whose TEXT lives in the record (`text`), so it
                syncs, exports and works offline with the rest of the slot.
                Capped at NOTE_MAX_BYTES; a bigger upload is a 'file'.
   - 'file'   — {…, mime, size, driveId?}. The BYTES are never in track_db:
                they live in Google Drive (driveId, once uploaded) and in
                each device's own IndexedDB copy (file-store.js). This is the
                whole reason the tab cannot slow Track down — the slot only
                ever grows by a few hundred bytes per file.

   A record of a kind this version does not know is kept and drawn as a file
   with no viewer, so a later version's records survive every write here.

   Contract, shared with the other *-core.js modules:

   - Pure. Nothing here reads or writes storage, constructs a Date or mints an
     id: `now` and every new `id` are parameters, which is why its suite runs
     once rather than swept across timezones.
   - Never mutates its input, and SPREADS every record it changes, so a key
     this version has not heard of survives.
   - Total. schema.js checks only that `files` is a list of objects, so every
     nested value is read through a helper that cannot throw.
   - A writer returns the ORIGINAL list when nothing changed — refused, not
     found, or already so — which lets the page skip the write and the sync
     upload it would arm.
   - Clearing deletes the key: a record moved to the top level loses
     `parentIds` rather than storing `[]`.

   Loaded lazily by true-storage.html (the FILES tab), after mm-tree-core.js.
*/
(function (global) {
  'use strict';

  var NOTE_MAX_BYTES = 256 * 1024;
  var NAME_MAX = 120;
  var KINDS = ['folder', 'note', 'file'];

  function isList(v) { return Array.isArray(v); }
  function isMap(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function isId(v) {
    return (typeof v === 'number' && isFinite(v)) || (typeof v === 'string' && v !== '');
  }
  function tree() {
    var T = global.TrackMMTree;
    if (!T) throw new Error('files-core.js needs mm-tree-core.js loaded first');
    return T;
  }

  // The records the tab can draw: objects with an id. Anything else in the
  // list is kept by every writer (they map over the raw list) but never drawn.
  function records(list) {
    return isList(list) ? list.filter(function (r) { return isMap(r) && isId(r.id); }) : [];
  }

  function byIdOf(list) {
    var m = new Map();
    records(list).forEach(function (r) { if (!m.has(r.id)) m.set(r.id, r); });
    return m;
  }

  function kindOf(rec) {
    if (!isMap(rec)) return null;
    return KINDS.indexOf(rec.kind) >= 0 ? rec.kind : 'file';
  }
  function isFolder(rec) { return kindOf(rec) === 'folder'; }

  // ── names ────────────────────────────────────────────────────────────────

  // The extension, lower-cased with its dot, or '' — a leading dot alone
  // (".env") is a name, not an extension.
  function extOf(name) {
    var s = typeof name === 'string' ? name : '';
    var i = s.lastIndexOf('.');
    return i > 0 && i < s.length - 1 ? s.slice(i).toLowerCase() : '';
  }

  function splitName(name) {
    var s = typeof name === 'string' ? name : '';
    var ext = extOf(s);
    return { base: ext ? s.slice(0, s.length - ext.length) : s, ext: ext ? s.slice(s.length - ext.length) : '' };
  }

  // What a typed name is stored as: control characters dropped (by code
  // point, never a written escape), runs of whitespace made one space, ends
  // trimmed, cut to NAME_MAX. '' means nothing usable was typed.
  function cleanName(text) {
    var s = typeof text === 'string' ? text : '';
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      out += (c < 32 || c === 127) ? ' ' : s.charAt(i);
    }
    out = out.replace(/\s+/g, ' ').trim();
    return out.length > NAME_MAX ? out.slice(0, NAME_MAX).trim() : out;
  }

  // The full name a rename stores, or null when it must be refused (blank).
  // A note or file KEEPS its extension: the user edits the part before it,
  // and typing the same extension again does not double it.
  function renamedName(rec, text) {
    var clean = cleanName(text);
    if (!clean) return null;
    if (isFolder(rec)) return clean;
    var ext = splitName(rec && rec.name).ext;
    if (!ext) return clean;
    if (clean.toLowerCase().slice(-ext.length) === ext.toLowerCase()) clean = clean.slice(0, clean.length - ext.length).trim();
    return clean ? clean + ext : null;
  }

  // "New folder", then "New folder 2", 3 … among the siblings it will join,
  // keeping an extension at the end ("Untitled 2.md").
  function uniqueName(list, parentId, wanted) {
    var taken = new Set(childrenOf(list, parentId === undefined ? null : parentId)
      .map(function (r) { return String(r.name || '').toLowerCase(); }));
    if (!taken.has(String(wanted).toLowerCase())) return wanted;
    var parts = splitName(wanted);
    for (var n = 2; n < 10000; n++) {
      var name = parts.base + ' ' + n + parts.ext;
      if (!taken.has(name.toLowerCase())) return name;
    }
    return wanted;
  }

  // ── types: which viewer opens a record ───────────────────────────────────

  var IMAGE_EXT = ['.gif', '.webp', '.bmp', '.avif', '.heic', '.heif', '.svg'];
  var TEXT_EXT = ['.txt', '.csv', '.tsv', '.json', '.log', '.xml', '.yml', '.yaml'];

  // 'png' | 'jpeg' | 'pdf' | 'md' | 'image' | 'text' | 'other'. The name
  // decides first, because an iPad hands some files over with no MIME type.
  function typeOf(name, mime) {
    var ext = extOf(name);
    var m = typeof mime === 'string' ? mime.toLowerCase() : '';
    if (ext === '.png') return 'png';
    if (ext === '.jpg' || ext === '.jpeg') return 'jpeg';
    if (ext === '.pdf') return 'pdf';
    if (ext === '.md' || ext === '.markdown') return 'md';
    if (IMAGE_EXT.indexOf(ext) >= 0) return 'image';
    if (TEXT_EXT.indexOf(ext) >= 0) return 'text';
    if (m === 'image/png') return 'png';
    if (m === 'image/jpeg') return 'jpeg';
    if (m === 'application/pdf') return 'pdf';
    if (m === 'text/markdown' || m === 'text/x-markdown') return 'md';
    if (m.indexOf('image/') === 0) return 'image';
    if (m.indexOf('text/') === 0) return 'text';
    return 'other';
  }

  function typeOfRecord(rec) {
    if (kindOf(rec) === 'note') return 'md';
    if (kindOf(rec) === 'folder') return 'folder';
    return typeOf(rec && rec.name, rec && rec.mime);
  }

  // An upload is kept as a NOTE (text in the slot, editable) when it is
  // Markdown and small enough; anything else is a file.
  function isNoteUpload(name, mime, size) {
    return typeOf(name, mime) === 'md' && typeof size === 'number' && size >= 0 && size <= NOTE_MAX_BYTES;
  }

  // UTF-8 length without TextEncoder, so this stays total everywhere.
  function textBytes(text) {
    var s = typeof text === 'string' ? text : '';
    var n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) { n += 4; i++; }
      else n += 3;
    }
    return n;
  }
  function textFits(text) { return textBytes(text) <= NOTE_MAX_BYTES; }

  function formatSize(bytes) {
    var b = typeof bytes === 'number' && isFinite(bytes) && bytes >= 0 ? bytes : 0;
    if (b < 1024) return b + ' B';
    var units = ['KB', 'MB', 'GB', 'TB'];
    var v = b, u = -1;
    do { v /= 1024; u++; } while (v >= 1024 && u < units.length - 1);
    return (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10) + ' ' + units[u];
  }

  // ── the tree (TrackMMTree's, never re-spelled) ───────────────────────────

  function parentOf(rec) {
    var p = isMap(rec) && isList(rec.parentIds) ? rec.parentIds.filter(isId) : [];
    return p.length ? p[0] : null;
  }

  // The folder a record is drawn in: its stored parent when that is a
  // folder that exists, else the top level (null).
  function folderOf(list, id) {
    var byId = byIdOf(list);
    var rec = byId.get(id);
    var p = parentOf(rec);
    return p !== null && isFolder(byId.get(p)) ? p : null;
  }

  // A folder's contents, or the top level's (null), in stored order.
  function childrenOf(list, id) {
    var recs = records(list);
    return id === null || id === undefined ? tree().roots(recs) : tree().childrenOf(recs, id);
  }

  function pathTo(list, id) { return tree().pathTo(records(list), id); }
  function descendantIds(list, id) { return tree().descendantIds(records(list), id); }

  // ── constructors (the caller passes id and now) ──────────────────────────

  function placed(rec, parentId) {
    if (parentId !== null && parentId !== undefined) rec.parentIds = [parentId];
    return rec;
  }

  function newFolder(o) {
    return placed({ id: o.id, kind: 'folder', name: cleanName(o.name) || 'New folder',
      createdAt: o.now, updatedAt: o.now }, o.parentId);
  }

  function newNote(o) {
    var name = cleanName(o.name) || 'Untitled.md';
    if (typeOf(name, '') !== 'md') name += '.md';
    return placed({ id: o.id, kind: 'note', name: name, text: typeof o.text === 'string' ? o.text : '',
      createdAt: o.now, updatedAt: o.now }, o.parentId);
  }

  function newFile(o) {
    var rec = { id: o.id, kind: 'file', name: cleanName(o.name) || 'Untitled',
      size: typeof o.size === 'number' && o.size >= 0 ? o.size : 0, createdAt: o.now, updatedAt: o.now };
    if (typeof o.mime === 'string' && o.mime) rec.mime = o.mime;
    return placed(rec, o.parentId);
  }

  // ── writers ──────────────────────────────────────────────────────────────

  function withAdded(list, recs) {
    var base = isList(list) ? list : [];
    var add = (isList(recs) ? recs : [recs]).filter(function (r) { return isMap(r) && isId(r.id); });
    if (!add.length) return list;
    var have = byIdOf(base);
    add = add.filter(function (r) { return !have.has(r.id); });
    return add.length ? base.concat(add) : list;
  }

  // Spread the one record `id` with `patch` (a key set to undefined is
  // DELETED); the original list when it is missing or nothing differs.
  function withPatched(list, id, patch, now) {
    if (!isList(list)) return list;
    var done = false, changed = false;
    var next = list.map(function (r) {
      if (done || !isMap(r) || r.id !== id) return r;
      done = true;
      var keys = Object.keys(patch);
      var differs = keys.some(function (k) {
        return patch[k] === undefined ? Object.prototype.hasOwnProperty.call(r, k) : r[k] !== patch[k];
      });
      if (!differs) return r;
      changed = true;
      var out = Object.assign({}, r);
      keys.forEach(function (k) { if (patch[k] === undefined) delete out[k]; else out[k] = patch[k]; });
      if (now !== undefined) out.updatedAt = now;
      return out;
    });
    return changed ? next : list;
  }

  function withRenamed(list, id, text, now) {
    var rec = byIdOf(list).get(id);
    if (!rec) return list;
    var name = renamedName(rec, text);
    return name === null ? list : withPatched(list, id, { name: name }, now);
  }

  // A note's text. Refused (input returned) for a non-note or text over the
  // cap — the editor keeps the draft and says why.
  function withText(list, id, text, now) {
    var rec = byIdOf(list).get(id);
    if (!rec || kindOf(rec) !== 'note' || typeof text !== 'string' || !textFits(text)) return list;
    return withPatched(list, id, { text: text }, now);
  }

  // Written once an upload finishes. No updatedAt: nothing the user made
  // changed, and the record must not look edited on the other device.
  function withDriveId(list, id, driveId) {
    var rec = byIdOf(list).get(id);
    if (!rec || kindOf(rec) === 'folder' || kindOf(rec) === 'note' || typeof driveId !== 'string' || !driveId) return list;
    return withPatched(list, id, { driveId: driveId });
  }

  // ── highlights and pins: the viewer's marks on a file ────────────────────
  //
  // The user's 2026-11-13 request: highlight while reading, and pin a page
  // under a name, both existing ONLY in the viewer. Two optional keys on a
  // 'file' record, kept in the slot so both devices see them:
  //
  //   highlights: [{id, page, color, w, pts: [x0, y0, x1, y1, …], createdAt}]
  //   pins:       [{id, page, name, createdAt, updatedAt}]
  //
  // - The file's BYTES are never touched, and nothing but the viewer draws
  //   these: not a tile, not the tree, not Drive.
  // - `page` is 1-based (an image is page 1). `pts` and `w` are fractions
  //   (0–1) of the page's rendered box, so a stroke lands in the same place at
  //   any zoom, on any screen; geometry that measures distance takes the
  //   page's `ratio` (height / width) so x and y count alike.
  // - Absent means none; removing the last one DELETES the key.
  // - No writer stamps the file's `updatedAt`: the file did not change (the
  //   rule withDriveId follows). A pin's own `updatedAt` is its rename's.

  var COLORS = ['yellow', 'green', 'blue', 'pink'];
  var MARKS_MAX_BYTES = 256 * 1024;
  var STROKE_MAX_POINTS = 200;

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function isFrac(v) { return isNum(v) && v >= 0 && v <= 1; }
  function isPage(v) { return isNum(v) && v >= 1 && Math.floor(v) === v; }

  function isHighlight(h) {
    return isMap(h) && isId(h.id) && isPage(h.page) && COLORS.indexOf(h.color) >= 0 && isFrac(h.w) && h.w > 0 &&
      isList(h.pts) && h.pts.length >= 4 && h.pts.length % 2 === 0 && h.pts.every(isFrac);
  }
  function isPin(p) {
    return isMap(p) && isId(p.id) && isPage(p.page) && typeof p.name === 'string' && p.name !== '';
  }

  // The strokes the viewer can draw, in stored order (later ones on top);
  // one page's when `page` is given. A malformed item is skipped, never
  // thrown on — and never dropped by a writer.
  function highlightsOf(rec, page) {
    var all = isMap(rec) && isList(rec.highlights) ? rec.highlights.filter(isHighlight) : [];
    return page === undefined ? all : all.filter(function (h) { return h.page === page; });
  }

  // The pins, by page, then in the order they were made.
  function pinsOf(rec) {
    var all = isMap(rec) && isList(rec.pins) ? rec.pins : [];
    return all.map(function (p, i) { return { p: p, i: i }; })
      .filter(function (x) { return isPin(x.p); })
      .sort(function (a, b) { return a.p.page - b.p.page || a.i - b.i; })
      .map(function (x) { return x.p; });
  }

  // What a file's marks weigh in the slot, and whether one more still fits
  // the budget (the same 256 KB a note may hold).
  function marksBytes(rec) {
    if (!isMap(rec)) return 0;
    return textBytes(JSON.stringify([isList(rec.highlights) ? rec.highlights : [], isList(rec.pins) ? rec.pins : []]));
  }
  function marksFit(rec, extra) {
    return marksBytes(rec) + (extra === undefined ? 0 : textBytes(JSON.stringify(extra)) + 1) <= MARKS_MAX_BYTES;
  }

  function markable(list, fileId) {
    var rec = byIdOf(list).get(fileId);
    return rec && kindOf(rec) === 'file' ? rec : null;
  }
  function hasItem(items, id) { return isList(items) && items.some(function (x) { return isMap(x) && x.id === id; }); }

  // One stroke appended, SPREAD so a key a later version wrote survives.
  // Refused (input returned): not a file, a malformed stroke, too many
  // points, an id already stored, or past the budget — which the viewer
  // tells apart with marksFit.
  function withHighlight(list, fileId, h) {
    var rec = markable(list, fileId);
    if (!rec || !isHighlight(h) || h.pts.length > STROKE_MAX_POINTS * 2 || hasItem(rec.highlights, h.id) || !marksFit(rec, h)) return list;
    var cur = isList(rec.highlights) ? rec.highlights : [];
    return withPatched(list, fileId, { highlights: cur.concat([Object.assign({}, h, { pts: h.pts.slice() })]) });
  }

  // Where each of `ids` sits in the stored list — what Undo needs to put an
  // erased stroke back exactly where it was.
  function highlightEntries(rec, ids) {
    var want = new Set((isList(ids) ? ids : [ids]).filter(isId));
    var out = [];
    (isMap(rec) && isList(rec.highlights) ? rec.highlights : []).forEach(function (h, index) {
      if (isMap(h) && want.has(h.id)) out.push({ index: index, item: h });
    });
    return out;
  }

  function withoutHighlights(list, fileId, ids) {
    var rec = markable(list, fileId);
    if (!rec || !isList(rec.highlights)) return list;
    var gone = new Set((isList(ids) ? ids : [ids]).filter(isId));
    var next = rec.highlights.filter(function (h) { return !(isMap(h) && gone.has(h.id)); });
    if (next.length === rec.highlights.length) return list;
    return withPatched(list, fileId, { highlights: next.length ? next : undefined });
  }

  // Undo: the entries highlightEntries gave, back at their stored places. A
  // stroke already there again is skipped. Not held to the budget — it only
  // returns what was stored.
  function withHighlightsRestored(list, fileId, entries) {
    var rec = markable(list, fileId);
    if (!rec || !isList(entries)) return list;
    var cur = isList(rec.highlights) ? rec.highlights.slice() : [];
    var put = entries.filter(function (e) { return isMap(e) && isHighlight(e.item) && !hasItem(cur, e.item.id); })
      .sort(function (a, b) { return (isNum(a.index) ? a.index : 0) - (isNum(b.index) ? b.index : 0); });
    if (!put.length) return list;
    put.forEach(function (e) {
      var at = isNum(e.index) && e.index >= 0 ? Math.min(e.index, cur.length) : cur.length;
      cur.splice(at, 0, e.item);
    });
    return withPatched(list, fileId, { highlights: cur });
  }

  // A pin: `{id, page, name, createdAt, updatedAt}` from the caller, its name
  // cleaned like any name. Refused for a blank name, a bad page, a repeated
  // id, a non-file, or past the budget.
  function withPin(list, fileId, pin) {
    var rec = markable(list, fileId);
    if (!rec || !isMap(pin) || !isId(pin.id) || !isPage(pin.page) || hasItem(rec.pins, pin.id)) return list;
    var name = cleanName(pin.name);
    if (!name) return list;
    var item = Object.assign({}, pin, { name: name });
    if (!marksFit(rec, item)) return list;
    return withPatched(list, fileId, { pins: (isList(rec.pins) ? rec.pins : []).concat([item]) });
  }

  function withPinRenamed(list, fileId, pinId, text, now) {
    var rec = markable(list, fileId);
    var name = cleanName(text);
    if (!rec || !isList(rec.pins) || !name) return list;
    var found = false, changed = false;
    var next = rec.pins.map(function (p) {
      if (found || !isMap(p) || p.id !== pinId) return p;
      found = true;
      if (p.name === name) return p;
      changed = true;
      var out = Object.assign({}, p, { name: name });
      if (now !== undefined) out.updatedAt = now;
      return out;
    });
    return changed ? withPatched(list, fileId, { pins: next }) : list;
  }

  function withoutPin(list, fileId, pinId) {
    var rec = markable(list, fileId);
    if (!rec || !isList(rec.pins)) return list;
    var next = rec.pins.filter(function (p) { return !(isMap(p) && p.id === pinId); });
    if (next.length === rec.pins.length) return list;
    return withPatched(list, fileId, { pins: next.length ? next : undefined });
  }

  // ── stroke geometry ──

  // Distance from point i to the segment a–b of a flat point list, in units
  // of the page's WIDTH (y scaled by `ratio`).
  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
    var t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var x = ax + t * dx - px, y = ay + t * dy - py;
    return Math.sqrt(x * x + y * y);
  }
  function round4(v) { return Math.round((v < 0 ? 0 : v > 1 ? 1 : v) * 10000) / 10000; }

  // A drawn stroke made storable: Ramer–Douglas–Peucker (both ends kept,
  // every point within `eps` of the simplified line dropped; iterative, so a
  // long stroke cannot overflow the stack), clamped to the page, rounded to 4
  // decimals, then thinned evenly to STROKE_MAX_POINTS. [] for fewer than two
  // points or anything not a number.
  function simplifyStroke(pts, eps, ratio) {
    if (!isList(pts) || pts.length < 4 || pts.length % 2 || !pts.every(isNum)) return [];
    var r = isNum(ratio) && ratio > 0 ? ratio : 1, e = isNum(eps) && eps > 0 ? eps : 0;
    var n = pts.length / 2, keep = [];
    keep[0] = true; keep[n - 1] = true;
    var stack = [[0, n - 1]];
    while (stack.length) {
      var seg = stack.pop(), a = seg[0], b = seg[1], best = -1, bestD = e;
      for (var i = a + 1; i < b; i++) {
        var d = segDist(pts[2 * i], pts[2 * i + 1] * r, pts[2 * a], pts[2 * a + 1] * r, pts[2 * b], pts[2 * b + 1] * r);
        if (d > bestD) { bestD = d; best = i; }
      }
      if (best >= 0) { keep[best] = true; stack.push([a, best], [best, b]); }
    }
    var idx = [];
    for (var k = 0; k < n; k++) if (keep[k]) idx.push(k);
    if (idx.length > STROKE_MAX_POINTS) {
      var thin = [];
      for (var j = 0; j < STROKE_MAX_POINTS; j++) thin.push(idx[Math.round(j * (idx.length - 1) / (STROKE_MAX_POINTS - 1))]);
      idx = thin;
    }
    var out = [];
    idx.forEach(function (m) { out.push(round4(pts[2 * m]), round4(pts[2 * m + 1])); });
    return out;
  }

  // Whether the point (x, y) touches a stroke: within half its width plus
  // `tol`, both in page widths. The eraser's test.
  function hitStroke(h, x, y, tol, ratio) {
    if (!isHighlight(h) || !isNum(x) || !isNum(y)) return false;
    var r = isNum(ratio) && ratio > 0 ? ratio : 1, reach = h.w / 2 + (isNum(tol) && tol > 0 ? tol : 0), p = h.pts;
    for (var i = 0; i + 3 < p.length; i += 2) {
      if (segDist(x, y * r, p[i], p[i + 1] * r, p[i + 2], p[i + 3] * r) <= reach) return true;
    }
    return false;
  }

  // Delete `ids`. Deleting a folder never deletes what is in it: each
  // surviving child moves up to the nearest surviving ancestor (the top
  // level when there is none), keeping its place in the stored order.
  // The walk up is cycle-guarded.
  function withRemoved(list, ids) {
    if (!isList(list)) return list;
    var gone = new Set((isList(ids) ? ids : [ids]).filter(isId));
    var byId = byIdOf(list);
    var any = false;
    gone.forEach(function (id) { if (byId.has(id)) any = true; });
    if (!any) return list;
    function survivor(start) {
      var seen = new Set(), cur = start;
      while (cur !== null && gone.has(cur) && !seen.has(cur)) {
        seen.add(cur);
        cur = parentOf(byId.get(cur));
        if (cur !== null && !byId.has(cur)) cur = null;
      }
      return cur !== null && gone.has(cur) ? null : cur;
    }
    var next = [];
    list.forEach(function (r) {
      if (isMap(r) && isId(r.id) && gone.has(r.id)) return;
      var p = parentOf(r);
      if (p !== null && gone.has(p)) {
        var up = survivor(p);
        var out = Object.assign({}, r);
        if (up === null) delete out.parentIds; else out.parentIds = [up];
        next.push(out);
      } else next.push(r);
    });
    return next;
  }

  // Why `ids` cannot go from `fromId` into `targetId` (null: the top level),
  // or null when they can. TrackMMTree's reasons ('missing', 'same', 'self',
  // 'inside') plus 'not-folder': only a folder holds anything.
  function moveRefusal(list, ids, fromId, targetId) {
    var to = targetId === undefined ? null : targetId;
    if (to !== null) {
      var target = byIdOf(list).get(to);
      if (target && !isFolder(target)) return 'not-folder';
    }
    return tree().moveRefusal(records(list), ids, fromId === undefined ? null : fromId, to);
  }

  // Move `ids` into `targetId` (null: the top level). A record has one
  // parent here, so the move REPLACES it. Refused or no-op moves return the
  // input; the stored order is never touched.
  function withMoved(list, ids, fromId, targetId) {
    if (!isList(list)) return list;
    var to = targetId === undefined ? null : targetId;
    if (moveRefusal(list, ids, fromId, to) !== null) return list;
    var moving = new Set((isList(ids) ? ids : [ids]).filter(isId));
    var changed = false;
    var next = list.map(function (r) {
      if (!isMap(r) || !moving.has(r.id)) return r;
      var cur = isList(r.parentIds) && r.parentIds.length ? r.parentIds : null;
      if (to === null ? cur === null : (cur && cur.length === 1 && cur[0] === to)) return r;
      changed = true;
      var out = Object.assign({}, r);
      if (to === null) delete out.parentIds; else out.parentIds = [to];
      return out;
    });
    return changed ? next : list;
  }

  // Reorder among siblings: TrackMMTree's writer, judged by the drawn list
  // of `listId` (null: the top level), so a drop that changes nothing the
  // folder draws writes nothing.
  function withArranged(list, ids, targetId, before, listId) {
    if (!isList(list)) return list;
    return tree().withArranged(list, isList(ids) ? ids : [ids], targetId, !!before,
      listId === undefined ? null : listId);
  }

  global.TrackFiles = {
    NOTE_MAX_BYTES: NOTE_MAX_BYTES,
    NAME_MAX: NAME_MAX,
    records: records,
    kindOf: kindOf,
    isFolder: isFolder,
    extOf: extOf,
    splitName: splitName,
    cleanName: cleanName,
    renamedName: renamedName,
    uniqueName: uniqueName,
    typeOf: typeOf,
    typeOfRecord: typeOfRecord,
    isNoteUpload: isNoteUpload,
    textBytes: textBytes,
    textFits: textFits,
    formatSize: formatSize,
    parentOf: parentOf,
    folderOf: folderOf,
    childrenOf: childrenOf,
    pathTo: pathTo,
    descendantIds: descendantIds,
    newFolder: newFolder,
    newNote: newNote,
    newFile: newFile,
    withAdded: withAdded,
    withRenamed: withRenamed,
    withText: withText,
    withDriveId: withDriveId,
    COLORS: COLORS,
    MARKS_MAX_BYTES: MARKS_MAX_BYTES,
    STROKE_MAX_POINTS: STROKE_MAX_POINTS,
    highlightsOf: highlightsOf,
    pinsOf: pinsOf,
    marksBytes: marksBytes,
    marksFit: marksFit,
    withHighlight: withHighlight,
    highlightEntries: highlightEntries,
    withoutHighlights: withoutHighlights,
    withHighlightsRestored: withHighlightsRestored,
    withPin: withPin,
    withPinRenamed: withPinRenamed,
    withoutPin: withoutPin,
    simplifyStroke: simplifyStroke,
    hitStroke: hitStroke,
    withRemoved: withRemoved,
    moveRefusal: moveRefusal,
    withMoved: withMoved,
    withArranged: withArranged
  };
})(window);
