/* ── project-core.js ───────────────────────────────────────────────────────
   The one definition of which goal a documentation page belongs to, and of
   the moves that change it (window.TrackProject).

   documentations.html has two tabs. EVENTS holds the pages it always held.
   PROJECTS draws the goal tree — every goal and sub-goal is a page there,
   read live from `goals` — and a goal can have ordinary documentation pages
   ATTACHED under it. An attached page is a `docPages` record like any other,
   carrying one optional key:

       goalId      the goal-tree node id it hangs under

   Three rules make that safe, and the first is the load-bearing one:

   - THE TOP PAGE DECIDES. Only a top page's `goalId` is read; a sub-page
     belongs to whatever its top page belongs to, through `parentId`. So a
     subtree moves between goals by changing ONE record, and a page can never
     sit under a parent in one project while claiming another. A top page is
     one with no `parentId` or whose parent does not resolve — the sidebar's
     own definition of a root, so a page is never in one tab's tree while
     drawn as a root of the other.
   - ABSENCE IS EVENTS. No `goalId` means an Events page, and every writer
     here DELETES the key rather than storing ''/null, so "an Events page"
     has one spelling. A sub-page never carries one: every move that gives a
     page a parent deletes it. Nothing was migrated — every page stored
     before this file existed is already a valid Events page.
   - A GOAL THAT GOES AWAY STRANDS NOTHING. Deleting a goal in Progress cannot
     touch `docPages` (that page does not own it), and must not: the pages
     the user wrote are kept, and `detachedPages` lists them so the Projects
     tab can show them under "Detached" until they are attached elsewhere or
     sent to Events — the day-note rule (a note outlives the page that
     authored it).

   The goal id is a goal NODE's id: a string from TrackStorage.newId() in
   real data. Goal-tree nesting, promoting and reordering in Progress all move
   a node by spreading it, so its id — and therefore every page attached to
   it — follows the goal wherever it goes. A LINK node's id is not the goal's;
   callers attach to the resolved original. Ids are compared with ===, never
   coerced: a number is accepted as an id (isId, quest-core.js's shape) so a
   hand-edited file reads rather than throws, but 10 is not '10'.

   The three sidebar moves (nest, arrange, promote) live here rather than in
   documentations.html because each must apply the top-page rule, and an
   Events page must behave EXACTLY as it did before Projects existed:
   tests/project-core.test.js pins all three against verbatim copies of the
   functions they replaced, over trees with no `goalId` anywhere.

   Contract, shared with the other *-core.js modules:

   - Pure. Nothing here reads or writes storage, and nothing constructs a
     Date: a move's `updatedAt` is a PARAMETER (`now`), which is why this
     suite runs once rather than swept.
   - Never mutates its input, and SPREADS every record it changes, so a key
     this version has not heard of survives a move.
   - Total. schema.js checks only that `docPages` is a list of objects, so
     every read goes through a helper that cannot throw, and every upward
     walk is cycle-guarded: a `parentId` cycle can arrive from stored or
     synced data even though the sidebar refuses to make one.
   - Returns the ORIGINAL list when nothing changed — refused, not found, or
     already so — which lets React bail out of the autosave.

   Loaded as a classic script by documentations.html and progress.html (which
   only reads: a goal row's 📄 link to its pages).

   ── A PAGE'S PLACE ON ITS GOAL'S PAGE ──────────────────────────────────────
   An attached top page is also drawn as a LINK on its goal's page, in the
   goal's directory among its sub-goals, tasks and milestones. Where it sits
   is a second optional key, read only on a top page that names a goal:

       goalPlace   {parentId, afterId?}

   `parentId` is a node of the goal's DIRECTORY — the goal itself, or a task
   or milestone block under it. Never a sub-goal (a page inside a sub-goal
   belongs to that sub-goal: attach it there) and never anything under a
   link (that is another goal's work, drawn here only as a mirror).
   `afterId` is a child of `parentId` the link follows; absent, the link is
   first in that list. Pages at one place are drawn in `docPages` order,
   which is the order the sidebar lists them in. When two nodes share an id,
   only the directory's own (the first, depth-first) holds links — the page
   draws them there once, never under both.

   Five rules, and the first two are the load-bearing ones:

   - THE PLACE IS NEVER A COPY OF THE TREE. It names two node ids and nothing
     else, so a task renamed, ticked or edited in Progress needs no second
     write here, and Progress — which never writes `docPages` — cannot leave
     a stale copy behind.
   - A PLACE THAT NO LONGER RESOLVES IS READ, NEVER REPAIRED ON READ. A
     parent that left the directory reads as the top of the goal's list; an
     anchor no longer in its list reads as the top of that list. The link is
     always drawn somewhere on its goal's page, so it is never unreachable.
     An edit made on the goal's page in Documentations re-places the links
     it would have displaced (`healPlaces`); an edit made in Progress falls
     back to the reading above.
   - ABSENCE IS THE TOP OF THE GOAL'S OWN LIST, and that place is never
     stored: the writer deletes the key for it, so it has one spelling
     (the `head: 1` rule). `afterId` is likewise absent, never null.
   - THE PLACE BELONGS TO THE GOAL. Every move that changes a page's goal or
     makes it a sub-page deletes the key (`placed`), so a page attached to a
     new goal starts at the top of that goal's page.
   - A MOVE IS JUDGED BY WHAT IS DRAWN. `movePageTo` writes nothing for a
     drop that leaves the drawing as it was, whatever the array indices say;
     `healPlaces` ignores a "moved" node that still stands where it stood,
     and keeps links that come to share one spot in the order they were
     drawn.
*/
(function (global) {
  'use strict';

  function isList(v) { return Array.isArray(v); }

  // Arrays and null are both typeof 'object'.
  function isMap(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  function isId(v) {
    return (typeof v === 'string' && v !== '') || (typeof v === 'number' && isFinite(v));
  }

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function pagesOf(pages) { return isList(pages) ? pages.filter(isMap) : []; }

  function byId(pages, id) {
    for (var i = 0; i < pages.length; i++) if (isMap(pages[i]) && pages[i].id === id) return pages[i];
    return null;
  }

  // ── readers ──────────────────────────────────────────────────────────────

  // The goal a page names ITSELF, or null. An own-property read, so a page
  // whose prototype chain happens to carry the name reads as none.
  function goalIdOf(page) {
    return isMap(page) && has(page, 'goalId') && isId(page.goalId) ? page.goalId : null;
  }

  // A top page: no parent, or a parent that does not resolve. This is the
  // sidebar's `roots` filter, spelled once.
  function isTop(pages, page) {
    if (!isMap(page)) return false;
    return !page.parentId || !byId(pagesOf(pages), page.parentId);
  }

  // The top page of the subtree a page sits in, or null for an unknown id or
  // a page caught in a parent cycle — such a page is reached from no root, so
  // it is in neither tab, and reporting a top for it would invent one.
  function topOf(pages, pageId) {
    var list = pagesOf(pages);
    var cur = byId(list, pageId);
    var seen = new Set();
    while (cur) {
      if (seen.has(cur)) return null;
      seen.add(cur);
      if (!cur.parentId) return cur;
      var parent = byId(list, cur.parentId);
      if (!parent) return cur;
      cur = parent;
    }
    return null;
  }

  // The goal a page belongs to — its top page's goalId — or null for an
  // Events page. THE question every surface asks; never read `goalId` off a
  // page that might be a sub-page.
  function projectOf(pages, pageId) {
    return goalIdOf(topOf(pages, pageId));
  }

  // The top pages attached directly to one goal, in stored order.
  function pagesForGoal(pages, goalId) {
    if (!isId(goalId)) return [];
    var list = pagesOf(pages);
    return list.filter(function (p) { return goalIdOf(p) === goalId && isTop(list, p); });
  }

  // The Events tab's roots: top pages that name no goal.
  function eventRoots(pages) {
    var list = pagesOf(pages);
    return list.filter(function (p) { return isTop(list, p) && goalIdOf(p) === null; });
  }

  // Top pages whose goal no longer exists. `goalIds` is every live goal-node
  // id (a Set, or a list), built by the caller from the goal tree — this file
  // does not read `goals`. Listing never deletes or rewrites anything.
  function detachedPages(pages, goalIds) {
    var live = goalIds instanceof Set ? goalIds : new Set(isList(goalIds) ? goalIds : []);
    var list = pagesOf(pages);
    return list.filter(function (p) {
      var g = goalIdOf(p);
      return g !== null && isTop(list, p) && !live.has(g);
    });
  }

  // A page and everything under it, by id. The downward walk cannot loop —
  // it grows a set until nothing new joins — and it is what refuses a move
  // into a page's own subtree, which would leave both unreachable from every
  // root. documentations.html's docDescendantIds is a delegate to this.
  function descendantIds(pages, id) {
    var list = pagesOf(pages);
    var set = new Set([id]);
    var grew = true;
    while (grew) {
      grew = false;
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        if (!set.has(p.id) && set.has(p.parentId)) { set.add(p.id); grew = true; }
      }
    }
    return set;
  }

  // ── writers ──────────────────────────────────────────────────────────────

  // A copy placed under `parentId`, belonging to `goalId`. The one place the
  // top-page rule is applied to a record: a page with a parent never carries
  // a goalId, and "no goal" deletes the key.
  function placed(page, parentId, goalId, now) {
    var copy = Object.assign({}, page, { parentId: parentId, updatedAt: now });
    if (!parentId && isId(goalId)) copy.goalId = goalId;
    else delete copy.goalId;
    // the place on a goal's page is that goal's: kept only while the page
    // stays a top page of the goal it was placed on
    if (!(has(copy, 'goalId') && goalIdOf(page) === copy.goalId)) delete copy.goalPlace;
    return copy;
  }

  // NEST: `draggedId` becomes the LAST child of `targetId`, so it now
  // belongs to the target's project, whichever tab that is. Refuses a target
  // inside the dragged page's own subtree.
  function nestPage(pages, draggedId, targetId, now) {
    if (!isList(pages) || draggedId === targetId) return pages;
    if (descendantIds(pages, draggedId).has(targetId)) return pages;
    var di = pages.findIndex(function (p) { return isMap(p) && p.id === draggedId; });
    if (di < 0 || !pages.some(function (p) { return isMap(p) && p.id === targetId; })) return pages;
    var arr = pages.slice();
    var moved = arr.splice(di, 1)[0];
    var ti = arr.findIndex(function (p) { return isMap(p) && p.id === targetId; });   // re-find AFTER the removal
    var at = ti;
    for (var i = ti + 1; i < arr.length; i++) if (isMap(arr[i]) && arr[i].parentId === targetId) at = i;
    arr.splice(at + 1, 0, placed(moved, targetId, null, now));
    return arr;
  }

  // ARRANGE: `draggedId` lands immediately before or after `targetId` and
  // adopts its parent. Beside a TOP page it becomes a top page of the same
  // goal (or of Events), so arranging among one goal's pages keeps the page
  // in that goal. The parent is copied as stored, a dangling one included,
  // exactly as the sidebar always did.
  function arrangePage(pages, draggedId, targetId, insertBefore, now) {
    if (!isList(pages) || draggedId === targetId) return pages;
    if (descendantIds(pages, draggedId).has(targetId)) return pages;
    var di = pages.findIndex(function (p) { return isMap(p) && p.id === draggedId; });
    var target = byId(pages, targetId);
    if (di < 0 || !target) return pages;
    var goalId = isTop(pages, target) ? goalIdOf(target) : null;
    var arr = pages.slice();
    var moved = arr.splice(di, 1)[0];
    var ti = arr.findIndex(function (p) { return isMap(p) && p.id === targetId; });   // re-find AFTER the removal
    var next = placed(moved, target.parentId || null, goalId, now);
    // a dangling parent makes the page top while carrying a parentId, so the
    // goal has to be set explicitly rather than through placed's no-parent arm
    if (target.parentId && goalId !== null) {
      next.goalId = goalId;
      if (goalIdOf(moved) === goalId && has(moved, 'goalPlace')) next.goalPlace = moved.goalPlace;
    }
    arr.splice(insertBefore ? ti : ti + 1, 0, next);
    return arr;
  }

  // PROMOTE: the page leaves its parent and becomes the LAST top page — of
  // the SAME goal it was in, so promoting inside Projects never sends a page
  // to Events, and promoting an Events page is exactly what it always was.
  function promotePage(pages, id, now) {
    if (!isList(pages)) return pages;
    var i = pages.findIndex(function (p) { return isMap(p) && p.id === id; });
    if (i < 0 || !pages[i].parentId) return pages;
    var goalId = projectOf(pages, id);
    var arr = pages.slice();
    var moved = arr.splice(i, 1)[0];
    arr.push(placed(moved, null, goalId, now));
    return arr;
  }

  // ATTACH: the page (with everything under it) becomes the LAST top page of
  // `goalId`. Refuses a non-id goal; returns the input when the page is
  // already a top page of that goal.
  function attachToGoal(pages, pageId, goalId, now) {
    if (!isList(pages) || !isId(goalId)) return pages;
    var i = pages.findIndex(function (p) { return isMap(p) && p.id === pageId; });
    if (i < 0) return pages;
    if (!pages[i].parentId && goalIdOf(pages[i]) === goalId) return pages;
    var arr = pages.slice();
    var moved = arr.splice(i, 1)[0];
    arr.push(placed(moved, null, goalId, now));
    return arr;
  }

  // TO EVENTS: the page (with everything under it) becomes the LAST top
  // Events page. Returns the input when it already is one.
  function detachToEvents(pages, pageId, now) {
    if (!isList(pages)) return pages;
    var i = pages.findIndex(function (p) { return isMap(p) && p.id === pageId; });
    if (i < 0) return pages;
    if (!pages[i].parentId && goalIdOf(pages[i]) === null && !has(pages[i], 'goalId')) return pages;
    var arr = pages.slice();
    var moved = arr.splice(i, 1)[0];
    arr.push(placed(moved, null, null, now));
    return arr;
  }

  // ── a page's place on its goal's page ────────────────────────────────────

  function childrenOf(node) { return isMap(node) && isList(node.children) ? node.children : []; }

  function hasChild(node, id) {
    var kids = childrenOf(node);
    for (var i = 0; i < kids.length; i++) if (isMap(kids[i]) && kids[i].id === id) return true;
    return false;
  }

  // A goal-tree node by id, depth-first in stored order (TrackGoals.findNode's
  // order), never a link. A node object met twice is walked once.
  function findGoal(goals, id) {
    if (!isId(id)) return null;
    var stack = isList(goals) ? goals.slice().reverse() : [];
    var seen = new Set();
    while (stack.length) {
      var n = stack.pop();
      if (!isMap(n) || seen.has(n)) continue;
      seen.add(n);
      if (n.id === id && !n.isLink) return n;
      var kids = childrenOf(n);
      for (var i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
    }
    return null;
  }

  // The goal's DIRECTORY, as id -> node: the goal, and every task or
  // milestone block reached from it without entering a sub-goal or a link —
  // the lists a link may be placed in. The first node with an id wins.
  function directoryOf(goal) {
    var out = new Map();
    if (!isMap(goal) || !isId(goal.id)) return out;
    var stack = [goal];
    var seen = new Set();
    while (stack.length) {
      var n = stack.pop();
      if (seen.has(n)) continue;
      seen.add(n);
      if (!out.has(n.id)) out.set(n.id, n);
      var kids = childrenOf(n);
      for (var i = kids.length - 1; i >= 0; i--) {
        var c = kids[i];
        if (isMap(c) && isId(c.id) && !c.isSubGoal && !c.isLink) stack.push(c);
      }
    }
    return out;
  }

  // The stored place, read totally: {parentId, afterId} or null.
  function placeOf(page) {
    if (!isMap(page) || !has(page, 'goalPlace') || !isMap(page.goalPlace)) return null;
    var gp = page.goalPlace;
    if (!isId(gp.parentId)) return null;
    return { parentId: gp.parentId, afterId: isId(gp.afterId) ? gp.afterId : null };
  }

  // Where the page is DRAWN on `goal`'s page: its stored place while that
  // resolves, else the fallbacks in the header. `dir` is directoryOf(goal).
  function resolvePlace(page, goal, dir) {
    var p = placeOf(page);
    if (!p || !dir.has(p.parentId)) return { parentId: goal.id, afterId: null };
    if (p.afterId !== null && !hasChild(dir.get(p.parentId), p.afterId)) return { parentId: p.parentId, afterId: null };
    return p;
  }

  // Every page drawn on `goal`'s page, by the list it is drawn in:
  // parentId -> [{page, afterId}], in docPages order. Only the goal's own
  // top pages: a sub-goal's pages are drawn on the sub-goal's page.
  function placesFor(pages, goal) {
    var out = new Map();
    if (!isMap(goal) || !isId(goal.id)) return out;
    var dir = directoryOf(goal);
    pagesForGoal(pages, goal.id).forEach(function (page) {
      var at = resolvePlace(page, goal, dir);
      if (!out.has(at.parentId)) out.set(at.parentId, []);
      out.get(at.parentId).push({ page: page, afterId: at.afterId });
    });
    return out;
  }

  // One list as it is drawn: the parent's children in stored order, each
  // followed by the pages placed after it, and the pages placed first ahead
  // of them all. Items are {node} or {page}. `placed` is one value of
  // placesFor. An anchor that is not a child here reads as first, and an id
  // repeated among the children takes its pages once, at its first.
  function interleave(children, placed) {
    var kids = isList(children) ? children.filter(isMap) : [];
    var ids = new Set(kids.map(function (k) { return k.id; }));
    var TOP = {};
    var after = new Map();
    (isList(placed) ? placed : []).forEach(function (s) {
      if (!isMap(s) || !isMap(s.page)) return;
      var k = isId(s.afterId) && ids.has(s.afterId) ? s.afterId : TOP;
      if (!after.has(k)) after.set(k, []);
      after.get(k).push(s.page);
    });
    var out = [];
    function take(k) {
      var ps = after.get(k);
      if (!ps) return;
      after.delete(k);
      ps.forEach(function (p) { out.push({ page: p }); });
    }
    take(TOP);
    kids.forEach(function (k) { out.push({ node: k }); take(k.id); });
    return out;
  }

  // The record with its place written — or deleted, for the top of the
  // goal's own list, the place absence already means.
  function withPlace(page, goalId, parentId, afterId, now) {
    var copy = Object.assign({}, page, { updatedAt: now });
    if (parentId === goalId && !isId(afterId)) delete copy.goalPlace;
    else {
      var gp = { parentId: parentId };
      if (isId(afterId)) gp.afterId = afterId;
      copy.goalPlace = gp;
    }
    return copy;
  }

  function samePlace(a, b) {
    var ha = has(a, 'goalPlace'), hb = has(b, 'goalPlace');
    if (ha !== hb) return false;
    if (!ha) return true;
    var x = a.goalPlace, y = b.goalPlace;
    if (!isMap(x) || !isMap(y)) return x === y;
    return x.parentId === y.parentId && has(x, 'afterId') === has(y, 'afterId') && x.afterId === y.afterId;
  }

  /* MOVE a page's link on its goal's page. `target` is one of
       {pageId, before}           beside another link on the same page;
       {parentId, afterId, at}    after the node `afterId` (null: first) in
                                  `parentId`'s list, 'first' or 'last' among
                                  the links already placed there.
     Only a top page attached to `goal` moves, and only to a list of the
     goal's directory and an anchor that is a child of it — anything else
     returns the input. The page is also spliced into `docPages` beside the
     links it now sits with, since that order is theirs. */
  function movePageTo(pages, pageId, goal, target, now) {
    if (!isList(pages) || !isMap(goal) || !isId(goal.id) || !isMap(target)) return pages;
    var i = pages.findIndex(function (p) { return isMap(p) && p.id === pageId; });
    if (i < 0) return pages;
    var page = pages[i];
    if (!isTop(pages, page) || goalIdOf(page) !== goal.id) return pages;
    var dir = directoryOf(goal);
    var attached = pagesForGoal(pages, goal.id);
    var at = new Map();
    attached.forEach(function (p) { at.set(p, resolvePlace(p, goal, dir)); });
    var parentId, afterId, besideId = null, before = false, first = false;
    if (has(target, 'pageId')) {
      if (target.pageId === pageId) return pages;
      var q = byId(attached, target.pageId);
      if (!q) return pages;
      parentId = at.get(q).parentId;
      afterId = at.get(q).afterId;
      besideId = q.id;
      before = !!target.before;
    } else {
      parentId = target.parentId;
      afterId = isId(target.afterId) ? target.afterId : null;
      if (!dir.has(parentId)) return pages;
      if (afterId !== null && !hasChild(dir.get(parentId), afterId)) return pages;
      first = target.at === 'first';
    }
    var next = withPlace(page, goal.id, parentId, afterId, now);
    var arr = pages.slice();
    arr.splice(i, 1);
    var ins;
    if (besideId !== null) {
      var qi = arr.findIndex(function (p) { return isMap(p) && p.id === besideId; });
      ins = before ? qi : qi + 1;
    } else {
      var peers = [];
      arr.forEach(function (p, k) {
        var pl = at.get(p);
        if (pl && pl.parentId === parentId && pl.afterId === afterId) peers.push(k);
      });
      ins = !peers.length ? i : first ? peers[0] : peers[peers.length - 1] + 1;
    }
    arr.splice(ins, 0, next);
    // A drop that keeps the page's place AND its order among the links drawn
    // there moves nothing on screen, so it writes nothing: the SAME list,
    // with neither the page's time nor docPages' order (the sidebar's) moved.
    // Array indices are not that test — a page can sit at another index and
    // still be drawn exactly where it is.
    if (samePlace(page, next)) {
      var spot = function (list, self) {
        return JSON.stringify(list.filter(function (p) {
          var pl = p === self ? { parentId: parentId, afterId: afterId } : at.get(p);
          return !!pl && pl.parentId === parentId && pl.afterId === afterId;
        }).map(function (p) { return p.id; }));
      };
      if (spot(pages, null) === spot(arr, next)) return pages;
    }
    return arr;
  }

  // Where a node stands in a goal forest: its parent's id (null at the top)
  // and the id of the sibling before it (null when first), or null when it
  // is not there. Depth-first in stored order, never through a link.
  function positionOf(goals, id) {
    var stack = [{ kids: isList(goals) ? goals : [], i: 0, parentId: null, prev: null }];
    var seen = new Set();
    while (stack.length) {
      var f = stack[stack.length - 1];
      if (f.i >= f.kids.length) { stack.pop(); continue; }
      var n = f.kids[f.i++];
      if (!isMap(n)) continue;
      if (n.id === id && !n.isLink) return { parentId: f.parentId, prev: f.prev };
      f.prev = n.id;
      if (!n.isLink && !seen.has(n)) {
        seen.add(n);
        stack.push({ kids: childrenOf(n), i: 0, parentId: n.id, prev: null });
      }
    }
    return null;
  }

  // The order `goal`'s links are DRAWN in, top to bottom, as page -> index:
  // each list interleaved with its links, a node's own list right after it.
  // Only the directory's own node of an id holds links (directoryOf's
  // first-wins rule), which is also what the page draws.
  function drawnOrder(pages, goal) {
    var dir = directoryOf(goal), places = placesFor(pages, goal);
    var order = new Map(), seen = new Set();
    (function walk(node) {
      if (seen.has(node)) return;
      seen.add(node);
      interleave(childrenOf(node), places.get(node.id)).forEach(function (it) {
        if (it.page) { if (!order.has(it.page)) order.set(it.page, order.size); }
        else if (dir.get(it.node.id) === it.node) walk(it.node);
      });
    })(goal);
    return order;
  }

  // The directory node whose children hold `id`, or null.
  function parentIn(dir, id) {
    var found = null;
    dir.forEach(function (node, nid) { if (found === null && hasChild(node, id)) found = nid; });
    return found;
  }

  // Where a link drawn at `was` before an edit stands after it. See healPlaces.
  function standing(was, g, moved) {
    var parentId = was.parentId, afterId = was.afterId;
    var climbed = new Set();
    for (;;) {
      var cur = g.nd.get(parentId);
      if (cur) {
        if (afterId === null || (hasChild(cur, afterId) && !moved.has(afterId))) return { parentId: parentId, afterId: afterId };
        // walk back through the list as it was, to the nearest sibling that
        // stood before the anchor and still stands in this list
        var olds = childrenOf(g.od.get(parentId));
        var k = -1;
        for (var j = 0; j < olds.length; j++) if (isMap(olds[j]) && olds[j].id === afterId) { k = j; break; }
        for (var m = k - 1; m >= 0; m--) {
          var s = olds[m];
          if (isMap(s) && hasChild(cur, s.id) && !moved.has(s.id)) return { parentId: parentId, afterId: s.id };
        }
        return { parentId: parentId, afterId: null };
      }
      // the list itself left the directory: stand where it stood, one level up
      if (climbed.has(parentId)) break;
      climbed.add(parentId);
      var up = parentIn(g.od, parentId);
      if (up === null) break;
      afterId = parentId;
      parentId = up;
    }
    return { parentId: g.ng.id, afterId: null };
  }

  /* HEAL: re-place the links an edit made on the goal's page would move.
     `before` and `after` are the stored goal trees around ONE write, and
     `moved` the ids of the nodes that write moved on purpose (a drag, ↑/↓,
     Move under…). A link keeps standing where it was drawn:
     - its anchor left its list, or is a node that was moved: it now follows
       the nearest sibling that stood before the anchor and still stands in
       that list — first in the list when none does;
     - its list left the goal's directory (deleted, or moved to another
       goal): it stands where that list stood, by the same rule a level up.
     A link INSIDE a node that moved goes with it: it is that node's content.
     A node named in `moved` that still stands where it stood — same parent,
     same sibling before it: a drop in place — has not moved.
     Links that come to share one spot stand in the order they were DRAWN, so
     a link that moved up to a row lands after the links already following it.
     Only a link whose drawn place changes is written, and a page whose goal
     is in neither tree (Detached) is left exactly as stored. */
  function healPlaces(pages, before, after, moved, now) {
    if (!isList(pages)) return pages;
    var movedSet = new Set((isList(moved) ? moved : []).filter(function (id) {
      var a = positionOf(before, id), b = positionOf(after, id);
      return !(a && b && a.parentId === b.parentId && a.prev === b.prev);
    }));
    var goals = new Map();
    var healed = new Set();
    var out = pages.map(function (page) {
      if (!isMap(page) || !has(page, 'goalPlace')) return page;
      var gid = goalIdOf(page);
      if (gid === null || !isTop(pages, page)) return page;
      if (!goals.has(gid)) {
        var og = findGoal(before, gid), ng = findGoal(after, gid);
        goals.set(gid, og && ng ? { og: og, ng: ng, od: directoryOf(og), nd: directoryOf(ng) } : null);
      }
      var g = goals.get(gid);
      if (!g) return page;
      var was = resolvePlace(page, g.og, g.od);
      var spot = standing(was, g, movedSet);
      if (spot.parentId === was.parentId && spot.afterId === was.afterId) return page;
      healed.add(gid);
      return withPlace(page, gid, spot.parentId, spot.afterId, now);
    });
    if (!healed.size) return pages;
    // per goal with a re-placed link: every spot's links, re-dealt into the
    // docPages slots they already hold, in the order they were drawn
    healed.forEach(function (gid) {
      var g = goals.get(gid);
      var drawn = drawnOrder(pages, g.og);
      var spots = new Map();
      pages.forEach(function (page, k) {
        if (!isMap(page) || goalIdOf(page) !== gid || !isTop(pages, page)) return;
        var s = resolvePlace(out[k], g.ng, g.nd);
        var key = JSON.stringify([s.parentId, s.afterId]);
        if (!spots.has(key)) spots.set(key, []);
        spots.get(key).push(k);
      });
      spots.forEach(function (ks) {
        if (ks.length < 2) return;
        var members = ks.map(function (k) {
          return { rec: out[k], k: k, rank: drawn.has(pages[k]) ? drawn.get(pages[k]) : Infinity };
        });
        members.sort(function (a, b) { return (a.rank - b.rank) || (a.k - b.k); });
        ks.forEach(function (k, j) { out[k] = members[j].rec; });
      });
    });
    return out;
  }

  global.TrackProject = {
    isId: isId,
    goalIdOf: goalIdOf,
    isTop: isTop,
    topOf: topOf,
    projectOf: projectOf,
    pagesForGoal: pagesForGoal,
    eventRoots: eventRoots,
    detachedPages: detachedPages,
    descendantIds: descendantIds,
    nestPage: nestPage,
    arrangePage: arrangePage,
    promotePage: promotePage,
    attachToGoal: attachToGoal,
    detachToEvents: detachToEvents,
    findGoal: findGoal,
    directoryOf: directoryOf,
    placeOf: placeOf,
    placesFor: placesFor,
    interleave: interleave,
    movePageTo: movePageTo,
    healPlaces: healPlaces
  };
})(window);
