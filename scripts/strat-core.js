/* ── strat-core.js ─────────────────────────────────────────────────────────
   The one definition of a mind map's STRAT — its strategy (docs/CONCEPTS.md).

   A mind map may carry `strat`, ONE record:

       strat { text, createdAt, updatedAt }        both times epoch ms

   Two rules make it what the user asked for (2026-10-25):

   - ONE PER MIND MAP, BY CONSTRUCTION. It is a single key, never a list, so
     "a mind map has only one original" cannot be broken by a writer that
     forgot to check: there is no second place to write one. The panel offers
     its add box only while the mind map has none of its own.
   - INHERITED BY EVERY DESCENDANT, however deep. A STRAT written on a parent
     shows on all its children, the way an activated ancestor's S&C content
     shows in each descendant. So a mind map can show several STRATs, and at
     most one of them is its own.

   TWO pages read that rule. sir-ks02.html draws a mind map's STRATs in its
   detail panel and writes the key (it owns `mms`); progress.html puts a STRAT
   button on every ◎ block whose mind map has at least one, and only reads.
   If each spelled its own ancestor walk, the panel and the Schedule could
   disagree about which strategies apply — the shape that cost this project
   the deadline caution predicate (AGENTS.md). So the walk lives HERE, once.

   Contract, shared with the other *-core.js modules:

   - Pure. Nothing here reads or writes storage, and nothing constructs a
     Date: a write's time is a PARAMETER (`now`), which is why this suite runs
     once rather than swept.
   - Never mutates its input, and SPREADS every record it changes, so a key
     this version has not heard of survives an edit.
   - Total. schema.js checks only that `mms` is a list of objects, so every
     read goes through a helper that cannot throw.
   - Returns the ORIGINAL list when nothing changed — refused, not found, or
     already so — which lets React bail out of the autosave and skips the sync
     upload a write would arm.

   Loaded as a classic script by sir-ks02.html and progress.html.
*/
(function (global) {
  'use strict';

  function isList(v) { return Array.isArray(v); }

  // Arrays and null are both typeof 'object'.
  function isMap(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  function str(v) { return typeof v === 'string' ? v : ''; }

  // ── readers ──────────────────────────────────────────────────────────────

  // The STRAT a mind map carries ITSELF, trimmed; '' when it has none. A bare
  // string reads as its text (a hand-edited file); anything else — a number,
  // a list, a record whose text is not a string — reads as none, never as a
  // throw.
  function stratText(mm) {
    if (!isMap(mm)) return '';
    var s = mm.strat;
    return (isMap(s) ? str(s.text) : str(s)).trim();
  }

  // Every STRAT that applies to `mmId`, in the order both pages draw them:
  // its ancestors' first, FARTHEST first, then its own last — general to
  // specific, which puts the one the panel edits where its add box was.
  //
  //     [{ mm, text, own, depth }]        depth 0 is the mind map itself
  //
  // The walk is breadth-first over `parentIds`, and `seen` is the cycle
  // guard: a mind map is marked when it is QUEUED, so a parent cycle — which
  // the connections picker lets a user build — ends the walk rather than the
  // stack, and the start can never come back as its own ancestor. Breadth
  // first also gives each ancestor its SHORTEST distance, so a diamond is
  // counted once, at the nearer depth. getAncestors in sir-ks02.html has the
  // same shape; ties keep breadth-first order, which is `parentIds` order.
  //
  // Ids are looked up in a Map, never an object: a mind map's id is a NUMBER
  // from KS02's nid(), and an object key would make 10 and '10' one id. A
  // record that is not an object or has no id, a `parentIds` that is not a
  // list, and a parent id that names no mind map are skipped. When ids are
  // duplicated the FIRST record is read, as progress.html's `mms.find` does.
  function stratsFor(mmId, mms) {
    if (!isList(mms)) return [];
    var byId = new Map();
    mms.forEach(function (m) {
      if (isMap(m) && m.id !== undefined && m.id !== null && !byId.has(m.id)) byId.set(m.id, m);
    });
    var self = byId.get(mmId);
    if (!self) return [];
    var seen = new Set([mmId]);
    var queue = [{ mm: self, depth: 0 }];
    function visit(node) {
      var pids = isList(node.mm.parentIds) ? node.mm.parentIds : [];
      pids.forEach(function (pid) {
        if (seen.has(pid) || !byId.has(pid)) return;
        seen.add(pid);
        queue.push({ mm: byId.get(pid), depth: node.depth + 1 });
      });
    }
    for (var i = 0; i < queue.length; i++) visit(queue[i]);
    var out = [];
    // queue[0] is the mind map itself. Array sort is stable, so equal depths
    // keep the order the walk found them in.
    queue.slice(1).sort(function (a, b) { return b.depth - a.depth; }).forEach(function (n) {
      var t = stratText(n.mm);
      if (t) out.push({ mm: n.mm, text: t, own: false, depth: n.depth });
    });
    var own = stratText(self);
    if (own) out.push({ mm: self, text: own, own: true, depth: 0 });
    return out;
  }

  // ── writers ──────────────────────────────────────────────────────────────

  // The ONE writer that adds or edits a STRAT. `now` is epoch ms.
  //
  // Blank text is REFUSED — the input comes back unchanged — so no save can
  // delete: deleting is withoutStrat, and only the panel's confirm-gated ×
  // calls it. A STRAT that already reads this text is "already so", so an
  // unchanged SAVE writes nothing and leaves updatedAt where it was.
  //
  // `createdAt` survives an edit, and so does any key this version has not
  // heard of, on the record and on the mind map. A value that is not a record
  // (a bare string, a number) is replaced by a proper one, created `now`.
  // Every record with this id is written, as KS02's own setMms maps are.
  function withStrat(mms, mmId, text, now) {
    if (!isList(mms)) return mms;
    var t = str(text).trim();
    if (!t) return mms;
    var changed = false;
    var next = mms.map(function (m) {
      if (!isMap(m) || m.id !== mmId || stratText(m) === t) return m;
      changed = true;
      var old = isMap(m.strat) ? m.strat : {};
      return Object.assign({}, m, { strat: Object.assign({ createdAt: now }, old, { text: t, updatedAt: now }) });
    });
    return changed ? next : mms;
  }

  // Delete a mind map's own STRAT. The KEY goes — never '' or null, because
  // absence is the one spelling of "none". Its descendants stop showing it at
  // once, since they never held a copy. Returns the input when no record with
  // this id has the key.
  function withoutStrat(mms, mmId) {
    if (!isList(mms)) return mms;
    var changed = false;
    var next = mms.map(function (m) {
      if (!isMap(m) || m.id !== mmId || !Object.prototype.hasOwnProperty.call(m, 'strat')) return m;
      changed = true;
      var copy = Object.assign({}, m);
      delete copy.strat;
      return copy;
    });
    return changed ? next : mms;
  }

  global.TrackStrat = {
    stratText: stratText,
    stratsFor: stratsFor,
    withStrat: withStrat,
    withoutStrat: withoutStrat
  };
})(window);
