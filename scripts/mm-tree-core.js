/* ── mm-tree-core.js ───────────────────────────────────────────────────────
   The one definition of the mind-map TREE as the Knowledge Record's SRCH
   tab draws and edits it (`window.TrackMMTree`): which mind maps sit under
   which, where the tree starts, and the three ways a drag rearranges it —
   NEST (under another mind map), TOP LEVEL (out of a parent) and ARRANGE
   (among siblings). SRCH → DIRECTORY is its main user (the user's
   2026-11-03 request); SRCH → LIST's sibling reorder is a delegate to
   `withArranged`, so "reorder" has one spelling on the page.

   The graph is `mms[].parentIds`, and it is NOT a tree:

   - `parentIds` is PLURAL. A mind map can sit under several parents, so the
     directory draws it under each (a diamond is drawn twice, never merged).
   - The Connections picker lets a user pick a descendant as a parent, so a
     LOOP is reachable through ordinary use, and stored or synced data can
     carry one. Every walk here is cycle-guarded, and `roots` gives each loop
     that no true root reaches one entry point, so no mind map is ever left
     out of the directory (SRCH → LIST's own tree still drops those).

   Moving is a MOVE, the way Documentations' ⠿ nest is: the mind map leaves
   the parent whose page it was dragged from (`fromId`) and goes under the
   target. Any OTHER parent it has stays — it leaves only the one it was
   dragged out of. A move that would put a mind map inside itself or its own
   branch is REFUSED (`moveRefusal`), because that mind map and everything
   under it would drop out of the tree: the writer is the guard, and the page
   only reads the same function to light a row red.

   Contract, shared with the other *-core.js modules:

   - Pure. Nothing here reads or writes storage, and nothing constructs a
     Date — none is needed — which is why this suite runs once, not swept.
   - Ids are of whatever type is stored. Mind-map ids are NUMBERS from KS02's
     nid(); they are compared with === and kept in Maps, so 10 and '10' are
     two ids, never one. Nothing here coerces an id.
   - Never mutates its input, and SPREADS every record it changes, so a key
     this version has not heard of survives a move.
   - Total. schema.js checks only that `mms` is a list of objects, so every
     nested value is read through a helper that cannot throw.
   - A writer returns the ORIGINAL list when nothing changed — refused, not
     found, or already so — which lets React bail out of the autosave and
     skips the sync upload a write would arm.
   - The ORDER of `mms` is the order siblings are drawn in, everywhere. A
     nest never reorders it; only `withArranged` does.

   Loaded as a classic script by sir-ks02.html.
*/
(function (global) {
  'use strict';

  function isList(v) { return Array.isArray(v); }

  // Arrays and null are both typeof 'object'.
  function isMap(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  // A mind-map id is a number (nid()) in real data; a non-empty string is
  // accepted too, because a hand-edited or imported file may carry one.
  function isId(v) {
    return (typeof v === 'number' && isFinite(v)) || (typeof v === 'string' && v !== '');
  }

  // The records, first one per id, in stored order. A record with no usable
  // id is no mind map at all for the tree.
  function records(mms) {
    var out = [];
    if (!isList(mms)) return out;
    var seen = new Set();
    mms.forEach(function (m) {
      if (!isMap(m) || !isId(m.id) || seen.has(m.id)) return;
      seen.add(m.id);
      out.push(m);
    });
    return out;
  }

  function byIdOf(list) {
    var map = new Map();
    list.forEach(function (m) { map.set(m.id, m); });
    return map;
  }

  function uniqueIds(ids) {
    var out = [];
    if (!isList(ids)) return out;
    var seen = new Set();
    ids.forEach(function (id) {
      if (!isId(id) || seen.has(id)) return;
      seen.add(id);
      out.push(id);
    });
    return out;
  }

  // ── readers ──────────────────────────────────────────────────────────────

  // A mind map's parent ids as stored, keeping only ids. A `parentIds` that
  // is not a list reads as none — a string would otherwise substring-match.
  function parentsOf(mm) {
    if (!isMap(mm) || !isList(mm.parentIds)) return [];
    return mm.parentIds.filter(isId);
  }

  // parent id → its children, each list in stored order. A parent naming no
  // stored mind map is no parent here (SRCH's rule), a mind map is never its
  // own child, and a child listed twice under one parent is drawn once.
  function childIndex(mms) {
    var list = records(mms);
    var exists = byIdOf(list);
    var index = new Map();
    list.forEach(function (m) {
      var seen = new Set();
      parentsOf(m).forEach(function (pid) {
        if (pid === m.id || seen.has(pid) || !exists.has(pid)) return;
        seen.add(pid);
        if (!index.has(pid)) index.set(pid, []);
        index.get(pid).push(m);
      });
    });
    return index;
  }

  function childrenOf(mms, id) {
    return childIndex(mms).get(id) || [];
  }

  // Where the directory starts, in stored order: every mind map with no
  // stored parent (a parent that is only itself counts as none), plus ONE
  // entry for each group that no such root reaches — a loop with nothing
  // above it. Without that second part a mind map inside a parentless loop
  // would appear nowhere, which is what SRCH → LIST does today.
  //
  // The entry point for a stranded group is found by climbing first parents
  // from its earliest member until a mind map repeats: the climb has to end
  // in a loop (every stranded mind map has a stranded parent), the loop's
  // earliest member is the entry, and walking DOWN from any loop member
  // reaches the whole loop and the chain the climb came up. So a mind map
  // hanging under a loop is never made a root of its own.
  function roots(mms) {
    var list = records(mms);
    var byId = byIdOf(list);
    var index = childIndex(mms);
    var order = new Map();
    list.forEach(function (m, i) { order.set(m.id, i); });
    function parentsIn(m) {
      return parentsOf(m).filter(function (pid) { return pid !== m.id && byId.has(pid); });
    }

    var reached = new Set();
    function mark(id) {
      if (reached.has(id)) return;
      reached.add(id);
      var queue = [id];
      for (var i = 0; i < queue.length; i++) {
        (index.get(queue[i]) || []).forEach(function (c) {
          if (reached.has(c.id)) return;
          reached.add(c.id);
          queue.push(c.id);
        });
      }
    }

    var rootIds = new Set();
    list.forEach(function (m) {
      if (parentsIn(m).length) return;
      rootIds.add(m.id);
      mark(m.id);
    });
    list.forEach(function (m) {
      if (reached.has(m.id)) return;
      var at = new Map();
      var chain = [];
      var cur = m;
      while (cur && !at.has(cur.id)) {
        at.set(cur.id, chain.length);
        chain.push(cur);
        cur = byId.get(parentsIn(cur)[0]);
      }
      // `cur` is always set here — see the comment above — but a total
      // function does not bet on a proof: fall back to the mind map itself.
      var loop = cur ? chain.slice(at.get(cur.id)) : [m];
      var entry = loop.reduce(function (a, b) { return order.get(a.id) <= order.get(b.id) ? a : b; });
      rootIds.add(entry.id);
      mark(entry.id);
    });
    return list.filter(function (m) { return rootIds.has(m.id); });
  }

  // Every mind map under `id`, however deep. Visited-at-enqueue, so a loop
  // ends and a diamond counts once. `id` itself is in the set only when a
  // loop leads back to it.
  function descendantIds(mms, id) {
    var index = childIndex(mms);
    var out = new Set();
    var queue = [id];
    for (var i = 0; i < queue.length; i++) {
      (index.get(queue[i]) || []).forEach(function (c) {
        if (out.has(c.id)) return;
        out.add(c.id);
        queue.push(c.id);
      });
    }
    return out;
  }

  // One way down from the top to `id`: its first stored parent, that one's
  // first, and so on, never visiting a mind map twice. [] for an unknown id.
  // The directory's trail falls back to this when the way the user came is
  // no longer a real path (a mind map in it was moved or deleted).
  function pathTo(mms, id) {
    var byId = byIdOf(records(mms));
    var cur = byId.get(id);
    if (!cur) return [];
    var path = [id];
    var seen = new Set([id]);
    for (;;) {
      var next = parentsOf(cur).filter(function (pid) { return byId.has(pid) && !seen.has(pid); })[0];
      if (next === undefined) break;
      path.unshift(next);
      seen.add(next);
      cur = byId.get(next);
    }
    return path;
  }

  // True when every id names a stored mind map and each one is a parent of
  // the next — the test the directory puts the user's trail through.
  function isPath(mms, path) {
    if (!isList(path) || !path.length) return false;
    var byId = byIdOf(records(mms));
    for (var i = 0; i < path.length; i++) {
      if (!byId.has(path[i])) return false;
      if (i && parentsOf(byId.get(path[i])).indexOf(path[i - 1]) < 0) return false;
    }
    return true;
  }

  // ── moving ───────────────────────────────────────────────────────────────

  // Why a move of `ids` out of `fromId` and under `targetId` must not happen,
  // or null when it may. `targetId === null` is the top level.
  //   'missing' — nothing to move, or the target is gone (deleted in another
  //               tab while the drag was in the air)
  //   'same'    — the target IS the parent they are being dragged out of:
  //               not a move, and not an error either
  //   'self'    — the target is one of the mind maps being moved
  //   'inside'  — the target is inside the branch of one of them, which would
  //               make that mind map its own ancestor
  function moveRefusal(mms, ids, fromId, targetId) {
    var byId = byIdOf(records(mms));
    var moving = uniqueIds(ids).filter(function (id) { return byId.has(id); });
    if (!moving.length) return 'missing';
    if (targetId === null || targetId === undefined) return null;
    if (!byId.has(targetId)) return 'missing';
    if (targetId === fromId) return 'same';
    if (moving.indexOf(targetId) >= 0) return 'self';
    for (var i = 0; i < moving.length; i++) {
      if (descendantIds(mms, moving[i]).has(targetId)) return 'inside';
    }
    return null;
  }

  // Move `ids` out of `fromId` and under `targetId` (null: out to the top
  // level). For each mind map: every `fromId` entry goes; the target takes
  // the place the first one held, so the order of its parents is kept; a
  // target that is already a parent is not listed twice; every OTHER parent
  // stays. Refused moves — see moveRefusal — return the input unchanged, and
  // so does a move that changes nothing. The order of `mms` is never touched.
  function withNested(mms, ids, fromId, targetId) {
    if (!isList(mms)) return mms;
    var to = targetId === undefined ? null : targetId;
    if (moveRefusal(mms, ids, fromId, to) !== null) return mms;
    var moving = new Set(uniqueIds(ids));
    var hasFrom = fromId !== null && fromId !== undefined;
    var changed = false;
    var next = mms.map(function (m) {
      if (!isMap(m) || !moving.has(m.id)) return m;
      var cur = isList(m.parentIds) ? m.parentIds : [];
      var firstAt = hasFrom ? cur.indexOf(fromId) : -1;
      var kept = hasFrom ? cur.filter(function (p) { return p !== fromId; }) : cur.slice();
      if (to !== null && kept.indexOf(to) < 0) {
        if (firstAt >= 0) kept.splice(firstAt, 0, to);
        else kept.push(to);
      }
      var same = isList(m.parentIds) && kept.length === cur.length &&
        kept.every(function (p, i) { return p === cur[i]; });
      if (same) return m;
      changed = true;
      return Object.assign({}, m, { parentIds: kept });
    });
    return changed ? next : mms;
  }

  // Siblings by SRCH's rule: both have no stored parent, or they share one.
  // A parent that is only itself still counts here — that is the rule SRCH →
  // LIST has always reordered by, and withArranged is its delegate.
  function siblings(a, b, byId) {
    var pa = parentsOf(a).filter(function (p) { return byId.has(p); });
    var pb = parentsOf(b).filter(function (p) { return byId.has(p); });
    if (!pa.length && !pb.length) return true;
    return pa.some(function (p) { return pb.indexOf(p) >= 0; });
  }

  // Move `ids` to just before (or after) `targetId` in the stored order,
  // keeping their own order. Every one of them must be a sibling of the
  // target, or nothing moves. A target that is one of `ids` is no place to
  // land. Returns the input when nothing would move.
  //
  // `listId` names the list the drop happened in — the parent whose children
  // the user was looking at. A move is then judged by what that list DRAWS,
  // never by array indices (the rule Projects' page links follow): a drop
  // that leaves that list in the same order returns the input, even when the
  // stored order around it would have shifted. That matters beyond a wasted
  // write: an uncoloured mind map's colour is its position in `mms`, so a
  // reshuffle nobody can see would still repaint mind maps across the app.
  //
  // With no `listId`, this is exactly what SRCH → LIST's inline reorder did
  // for one id, which tests/mm-tree-core.test.js pins against a verbatim copy
  // of it. Two deliberate differences: dragging a mind map onto itself
  // returns the input (the inline copy, never called that way, scrambled the
  // order), and a move that changes nothing returns the input, not a copy.
  function withArranged(mms, ids, targetId, before, listId) {
    if (!isList(mms)) return mms;
    var list = records(mms);
    var byId = byIdOf(list);
    var target = byId.get(targetId);
    if (!target) return mms;
    var want = uniqueIds(ids);
    if (want.indexOf(targetId) >= 0) return mms;
    want = want.filter(function (id) { return byId.has(id); });
    if (!want.length) return mms;
    // A named list is the actual drawn sibling set, including DIRECTORY's
    // synthetic roots for stranded cycles. An unnamed list keeps LIST's rule.
    var drawn = listId === undefined ? null : (listId === null ? roots(mms) : childrenOf(mms, listId));
    for (var i = 0; i < want.length; i++) {
      if (drawn ? !drawn.some(function (m) { return m.id === want[i]; }) ||
        !drawn.some(function (m) { return m.id === targetId; }) : !siblings(byId.get(want[i]), target, byId)) return mms;
    }
    // the FIRST stored record of each id moves, as findIndex found it inline
    var picked = new Set();
    var wanted = new Set(want);
    var taken = new Set();
    mms.forEach(function (m, idx) {
      if (isMap(m) && wanted.has(m.id) && !taken.has(m.id)) { taken.add(m.id); picked.add(idx); }
    });
    var block = [];
    var rest = [];
    mms.forEach(function (m, idx) { (picked.has(idx) ? block : rest).push(m); });
    var ti = -1;
    for (var r = 0; r < rest.length; r++) {
      if (isMap(rest[r]) && rest[r].id === targetId) { ti = r; break; }
    }
    if (ti < 0) return mms;
    var at = before ? ti : ti + 1;
    var next = rest.slice(0, at).concat(block, rest.slice(at));
    if (listId !== undefined) {
      var was = drawn;
      var now = listId === null ? roots(next) : childrenOf(next, listId);
      var drawnSame = was.length === now.length &&
        was.every(function (m, i) { return m.id === now[i].id; });
      return drawnSame ? mms : next;
    }
    for (var k = 0; k < next.length; k++) if (next[k] !== mms[k]) return next;
    return mms;
  }

  // Place ONE drawn occurrence: leave only its drawn parent, then arrange in
  // the destination's drawn list. targetId is a sibling anchor; null appends
  // (and also handles an empty destination). A stale anchor aborts both steps.
  function withPlaced(mms, id, fromId, parentId, targetId, before) {
    if (!isList(mms)) return mms;
    var to = parentId === undefined ? null : parentId;
    var why = moveRefusal(mms, [id], fromId, to);
    // 'same' is not a refused placement: it is the ordinary reorder path.
    if (why !== null && why !== 'same') return mms;
    var next = to === fromId ? mms : withNested(mms, [id], fromId, to);
    var drawn = to === null ? roots(next) : childrenOf(next, to);
    if (targetId != null && !drawn.some(function (m) { return m.id === targetId; })) return mms;
    // Leaving one of several parents for Top level keeps the others, exactly
    // as withNested does; it does not create a second, top-level occurrence.
    if (!drawn.some(function (m) { return m.id === id; })) return next;
    var others = drawn.filter(function (m) { return m.id !== id; });
    var anchor = targetId == null ? (others.length ? others[others.length - 1].id : null) : targetId;
    return anchor === null ? next : withArranged(next, [id], anchor, targetId == null ? false : before, to);
  }

  global.TrackMMTree = {
    parentsOf: parentsOf,
    childIndex: childIndex,
    childrenOf: childrenOf,
    roots: roots,
    descendantIds: descendantIds,
    pathTo: pathTo,
    isPath: isPath,
    moveRefusal: moveRefusal,
    withNested: withNested,
    withArranged: withArranged,
    withPlaced: withPlaced
  };
})(window);
