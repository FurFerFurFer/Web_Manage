/* ── quest-core.js ─────────────────────────────────────────────────────────
   The one definition of what a Quest is.

   A quest is a POINTER TO WORK THAT ALREADY EXISTS — a node in the goal tree,
   or a mind map linked under a goal through `toLearn`. It is not new work, and
   that single property is what makes the whole feature cheap: the flags live on
   the goal nodes themselves, so no slot field was added, there is nothing to
   migrate, and a quest travels free through nesting, reordering, deletion,
   export and import.

   Five keys, all optional, all on a goal node:

       { quest: true,          // in the quest list
         star:  true,          // starred (only meaningful while quest)
         questLearn: [10],     // ids inside this node's toLearn that are quests
         starLearn:  [10],     // subset of questLearn
         questOrder: 2 }       // chosen place among its quest siblings

   Those two lists hold MIND MAP ids, which are NUMBERS — see isId below.

   Three different absence rules, one per shape, and they are not interchangeable:

   - The two BOOLEANS write true/false and are NEVER deleted. Every reader goes
     through `!!`, so absent, false and undefined are one state and there is no
     third state to protect — the rule `done` and `blockOff` already follow.
   - The two LISTS delete when they empty, because nothing sits behind them as a
     fallback — the rule `merges` and `align` already follow.
   - `questOrder` is a NUMBER whose absence is meaningful and is the default:
     no key means "wherever the goal tree puts it". It is written only across a
     group the user has actually dragged, so an unarranged workspace stores none
     of it, and an unarranged sibling sorts after the arranged ones rather than
     jumping to the front.

   `toLearn` stays a flat list of bare ids. Promoting it to `[{mmId, quest}]` is
   the same mistake as promoting a table's `rows: [[string]]` to objects, and it would
   break updateGoalToLearn, expandAnchorToLearn (which runs on EVERY load),
   getMMDescendants, buildToLearnTree, MMPickerModal and the deduplicateToLearn
   migration — with no schemaVersion to hang a migration on.

   Two pages read this module — progress.html authors quests, index.html shows
   them read-only below the universal calendar. That is exactly the shape of a
   bug this project has already paid for: the deadline caution predicate was
   spelled out at three call sites, one forgot half of it, and the timeline
   mismarked every due day until it was found. So every rule lives HERE, once,
   and no call site re-spells it.

   Nothing here reads or writes localStorage, and nothing here constructs a
   Date — the routine-tick day arrives as a PARAMETER. Both are deliberate:
   the pages own persistence, and the absence of date code is what keeps this
   file's suite out of the swept list. tests/quest-core.test.js asserts it
   structurally.

   NOT to be confused with TrackStorage (storage-guard.js), the localStorage
   quota guard. This one is TrackQuest.

   Loaded as a classic script by progress.html and index.html.
*/
(function (global) {
  'use strict';

  function isList(v) { return Array.isArray(v); }

  // Arrays and null are both typeof 'object'.
  function isMap(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  function isText(v) { return typeof v === 'string'; }

  // Ids in this application come from TWO counters and are NOT the same type.
  // A goal node's id is a string from TrackStorage.newId(); a mind map's id is
  // a NUMBER from sir-ks02.html's nid() counter. `toLearn` therefore holds
  // numbers in real data, and a string-only test here would silently drop every
  // linked mind map — a whole feature reading as "no quests" with no error
  // anywhere. Accept both, everywhere an id is read.
  function isId(v) {
    return typeof v === 'string' || (typeof v === 'number' && isFinite(v));
  }

  // ── defensive readers ────────────────────────────────────────────────────
  // schema.js validates `goals` is a list and recurses into children/toLearn/
  // milestones/mmTargets, and stops there — the four quest keys are deliberately
  // NOT validated. The booleans are safe under `!!`, and the two lists are read
  // only through the helpers below, which cannot throw. Gating them would only
  // invent a way to block a whole database over a field nothing traverses.
  // The cost of that choice is paid here instead.

  function isMilestoneNode(node) {
    return isMap(node) && node.taskType === 'milestone';
  }

  function toLearnOf(node) {
    return (isMap(node) && isList(node.toLearn)) ? node.toLearn.filter(isId) : [];
  }

  function idSet(ids) {
    var set = Object.create(null);
    (isList(ids) ? ids : []).forEach(function (id) { if (isId(id)) set[id] = true; });
    return set;
  }

  // ── membership ───────────────────────────────────────────────────────────

  function isQuest(node) {
    return isMap(node) && !!node.quest;
  }

  // starred ⊆ quests. The gate is what makes un-questing a RESTORE rather than
  // a recomputed guess: it suppresses the star and deletes nothing, so
  // re-questing puts back exactly what the user chose. A writer that "tidied"
  // `star` on un-quest would have destroyed the thing re-questing puts back.
  function isStarred(node) {
    return isQuest(node) && !!node.star;
  }

  // Returned in toLearn ORDER and deduped, so a caller never has to sort and
  // the stored order can never leak into the render. An id absent from toLearn
  // names a mind map this node no longer links, so it is dropped — that is what
  // makes the transfer sites in progress.html load-bearing rather than cosmetic.
  function questLearnOf(node) {
    var learn = toLearnOf(node);
    if (!learn.length) return [];
    var want = idSet(isMap(node) ? node.questLearn : null);
    var seen = Object.create(null);
    return learn.filter(function (id) {
      if (!want[id] || seen[id]) return false;
      seen[id] = true;
      return true;
    });
  }

  function starLearnOf(node) {
    var quest = questLearnOf(node);
    if (!quest.length) return [];
    var want = idSet(isMap(node) ? node.starLearn : null);
    return quest.filter(function (id) { return want[id]; });
  }

  // A quest's chosen place among its siblings. Absence means "wherever the goal
  // tree puts it", which is what every unarranged group keeps — so a workspace
  // nobody has dragged in stores no ordering at all.
  //
  // This is a plain node key like `quest`, NOT a parallel list like questLearn,
  // so it needs no transfer helper: it rides the node through every nesting and
  // reordering site on the ordinary `{...n}` spread.
  function questOrderOf(node) {
    var v = isMap(node) ? node.questOrder : null;
    return (typeof v === 'number' && isFinite(v)) ? v : null;
  }

  // Arranged siblings first, in their chosen order; anything unarranged keeps
  // its goal-tree position after them. Array.prototype.sort is stable, so ties
  // never shuffle and a newly-quested sibling simply appends.
  function bySiblingOrder(a, b) {
    var ao = questOrderOf(a.node), bo = questOrderOf(b.node);
    if (ao === null && bo === null) return 0;
    if (ao === null) return 1;
    if (bo === null) return -1;
    return ao - bo;
  }

  // Pure list arithmetic for a drag. Returns the ORIGINAL list unchanged when
  // the move is a no-op or either end is missing — which is what makes a
  // cross-group drag inert rather than an error.
  function reorderIds(ids, movedId, targetId, before) {
    var list = (isList(ids) ? ids : []).filter(isId);
    if (!isId(movedId) || !isId(targetId) || movedId === targetId) return list;
    var from = list.indexOf(movedId);
    if (from < 0 || list.indexOf(targetId) < 0) return list;
    var out = list.slice();
    out.splice(from, 1);
    var to = out.indexOf(targetId);
    out.splice(before ? to : to + 1, 0, movedId);
    return out;
  }

  // Writes 0..n-1 across one sibling group. Quest order is the Quest tab's own
  // view: it must never move the node in the goal tree, so nothing here touches
  // `children` order — only the key each node carries.
  function withQuestOrder(goals, orderedIds) {
    var pos = Object.create(null), any = false;
    (isList(orderedIds) ? orderedIds : []).forEach(function (id, i) {
      if (isId(id)) { pos[id] = i; any = true; }
    });
    if (!any) return goals;

    function walk(nodes, seen) {
      if (!isList(nodes)) return nodes;
      var hit = false;
      var out = nodes.map(function (n) {
        if (!isMap(n)) return n;
        var next = n;
        if (isId(n.id) && Object.prototype.hasOwnProperty.call(pos, n.id)
            && n.questOrder !== pos[n.id]) {
          next = Object.assign({}, n, { questOrder: pos[n.id] });
          hit = true;
        }
        if (isId(n.id) && seen[n.id]) return next;
        var deeper = seen;
        if (isId(n.id)) {
          deeper = Object.assign(Object.create(null), seen);
          deeper[n.id] = true;
        }
        var kids = walk(next.children, deeper);
        if (kids === next.children) return next;
        hit = true;
        return Object.assign({}, next, { children: kids });
      });
      return hit ? out : nodes;
    }
    return walk(goals, Object.create(null));
  }

  function countQuests(goals) {
    var total = { nodes: 0, learn: 0, starred: 0 };
    function walk(list, seen) {
      (isList(list) ? list : []).forEach(function (n) {
        if (!isMap(n) || n.isLink) return;
        if (isId(n.id) && seen[n.id]) return;
        var next = seen;
        if (isId(n.id)) {
          next = Object.assign(Object.create(null), seen);
          next[n.id] = true;
        }
        if (!isMilestoneNode(n)) {
          if (isQuest(n)) total.nodes++;
          if (isStarred(n)) total.starred++;
          total.learn += questLearnOf(n).length;
          total.starred += starLearnOf(n).length;
        }
        walk(n.children, next);
      });
    }
    walk(goals, Object.create(null));
    return total;
  }

  // ── pure tree writers ────────────────────────────────────────────────────
  // Every writer returns the ORIGINAL array when nothing changed, so a caller
  // can compare by identity and skip a write entirely. The walk carries a
  // per-path cycle guard: `goals` is a tree, but a synced or hand-edited file
  // is not obliged to be one, and the same reasoning is already written at
  // taskParentOptions in progress.html.

  function mapNode(goals, nodeId, fn) {
    function walk(nodes, seen) {
      if (!isList(nodes)) return nodes;
      var hit = false;
      var out = nodes.map(function (n) {
        if (!isMap(n)) return n;
        if (isId(n.id) && n.id === nodeId) {
          var next = fn(n);
          if (next !== n) hit = true;
          return next;
        }
        if (isId(n.id) && seen[n.id]) return n;
        var deeper = seen;
        if (isId(n.id)) {
          deeper = Object.assign(Object.create(null), seen);
          deeper[n.id] = true;
        }
        var kids = walk(n.children, deeper);
        if (kids === n.children) return n;
        hit = true;
        return Object.assign({}, n, { children: kids });
      });
      return hit ? out : nodes;
    }
    return walk(goals, Object.create(null));
  }

  // A spread cannot delete a key, which is why the list writers go through this
  // rather than assigning an empty array. `questLearn: []` is not the same
  // state as no key at all: two whole-node comparisons and every node stored
  // before these keys existed depend on the absence.
  function setLearnKey(node, key, ids) {
    var next = Object.assign({}, node);
    if (ids.length) next[key] = ids;
    else delete next[key];
    return next;
  }

  function withQuest(goals, nodeId, on) {
    return mapNode(goals, nodeId, function (node) {
      var want = !!on;
      if (!!node.quest === want) return node;
      // Writes false rather than deleting, and NEVER touches `star` — the star
      // stays dormant so re-questing restores it.
      return Object.assign({}, node, { quest: want });
    });
  }

  function withStar(goals, nodeId, on) {
    return mapNode(goals, nodeId, function (node) {
      // A non-quest cannot BECOME starred. The Quest tab gives it no row to
      // star from, so this is the belt-and-braces half of that rule rather than
      // the only barrier. Un-starring is always allowed.
      if (on && !isQuest(node)) return node;
      var want = !!on;
      if (!!node.star === want) return node;
      return Object.assign({}, node, { star: want });
    });
  }

  // Stored in toLearn order so the stored bytes match what questLearnOf reads
  // back, and deduped by construction.
  function withLearnKey(node, key, gate, mmId, on) {
    if (!isId(mmId)) return node;
    var current = gate(node);
    var has = current.indexOf(mmId) >= 0;
    if (!!on === has) return node;
    var want = idSet(current);
    if (on) want[mmId] = true; else delete want[mmId];
    var ids = toLearnOf(node).filter(function (id) { return want[id]; });
    return setLearnKey(node, key, ids);
  }

  function withQuestLearn(goals, nodeId, mmId, on) {
    return mapNode(goals, nodeId, function (node) {
      // Refuse an mm this node does not link: questLearn is a parallel list
      // keyed into toLearn, and an id outside it names nothing.
      if (on && toLearnOf(node).indexOf(mmId) < 0) return node;
      // Un-questing a learn deliberately leaves `starLearn` alone — starLearnOf
      // gates on questLearnOf, so the star is suppressed and restored, exactly
      // as it is for a node.
      return withLearnKey(node, 'questLearn', questLearnOf, mmId, on);
    });
  }

  function withStarLearn(goals, nodeId, mmId, on) {
    return mapNode(goals, nodeId, function (node) {
      if (on && questLearnOf(node).indexOf(mmId) < 0) return node;
      return withLearnKey(node, 'starLearn', starLearnOf, mmId, on);
    });
  }

  // For ToLearnRow's remove handler, which prunes toLearn and mmTargets by a
  // descendant set. These two keys are in the same key space and must be pruned
  // in the same edit, or a removed mind map leaves unreachable quest ids behind.
  function withoutLearnIds(goals, nodeId, ids) {
    var drop = idSet(ids);
    return mapNode(goals, nodeId, function (node) {
      var next = node;
      ['questLearn', 'starLearn'].forEach(function (key) {
        if (!isList(node[key])) return;
        var kept = node[key].filter(function (id) { return isId(id) && !drop[id]; });
        if (kept.length === node[key].length) return;
        next = setLearnKey(next, key, kept);
      });
      return next;
    });
  }

  // ── the transfer helpers ─────────────────────────────────────────────────
  // Three sites in progress.html move a parent's toLearn/mmTargets/milestones
  // into a new sub-goal and blank the parent's. These two keys are in the same
  // key space and MUST travel with them.
  //
  // Miss it and the failure is silent and expensive: the sub-goal gets toLearn
  // with no questLearn, the parent keeps questLearn against an empty toLearn,
  // and because questLearnOf gates on toLearn membership the quest simply
  // DISAPPEARS. A curated entry lost as a side effect of adding a sub-goal,
  // with no error anywhere.
  //
  // Two functions rather than one because a spread can add but cannot delete:
  // the child side spreads flags IN, the parent side needs a copy with them
  // taken OUT.

  function learnFlagsOf(node) {
    var out = {};
    var quest = questLearnOf(node);
    if (quest.length) out.questLearn = quest;
    var star = starLearnOf(node);
    if (star.length) out.starLearn = star;
    return out;
  }

  function withoutLearnFlags(node) {
    if (!isMap(node)) return node;
    if (!('questLearn' in node) && !('starLearn' in node)) return node;
    var next = Object.assign({}, node);
    delete next.questLearn;
    delete next.starLearn;
    return next;
  }

  // ── derived structure ────────────────────────────────────────────────────

  function mmIndex(mms) {
    var by = Object.create(null);
    (isList(mms) ? mms : []).forEach(function (m) {
      if (isMap(m) && isId(m.id)) by[m.id] = m;
    });
    return by;
  }

  // The tree, chunked in branch hierarchy by the GOAL structure.
  //
  //   opts.prune !== false  → quest branches only (the Quest tab and Home)
  //   opts.prune === false  → the whole tree (the + quest picker)
  //
  // Each entry carries the ORIGINAL node object, never a copy, so a caller can
  // hand it straight to progress.html's own isComplete/countProgress. This
  // module computes no completion of its own on purpose: isComplete depends on
  // resolveLinkedTask/countProgress/findNode, and copying those here would
  // create exactly the twin this file exists to prevent.
  //
  // To-learn rows hang FLAT off their goal node, in toLearn order, because the
  // requirement is a hierarchy by goal structure. That also means no mind-map
  // parent walk happens here at all, which keeps a cyclic mm.parentIds graph
  // out of the hot path entirely.
  function questTree(goals, mms, opts) {
    var prune = !(isMap(opts) && opts.prune === false);
    var by = mmIndex(mms);

    function learnRows(node) {
      var quest = idSet(questLearnOf(node));
      var star = idSet(starLearnOf(node));
      var ids = prune ? questLearnOf(node) : toLearnOf(node);
      var seen = Object.create(null);
      return ids.filter(function (id) {
        if (seen[id]) return false;
        seen[id] = true;
        return true;
      }).map(function (id) {
        // A mind map deleted in KS02 leaves its id behind in toLearn — the two
        // fields belong to different pages. It renders as "mind map removed"
        // and stays removable by hand; dropping it would make it unreachable.
        return { mmId: id, mm: by[id] || null, quest: !!quest[id], star: !!star[id] };
      });
    }

    function walk(nodes, depth, seen) {
      var out = [];
      (isList(nodes) ? nodes : []).forEach(function (n) {
        if (!isMap(n)) return;
        // An alias owns nothing. Questing it would put one quest on two rows,
        // and toggling one would not move the other.
        if (n.isLink) return;
        if (isId(n.id) && seen[n.id]) return;
        var deeper = seen;
        if (isId(n.id)) {
          deeper = Object.assign(Object.create(null), seen);
          deeper[n.id] = true;
        }
        // A milestone node is omitted entirely and its children are promoted
        // one level — the same flattening the schedule picker already does. It
        // cannot tick (isCountableLeaf refuses it) so it is not a quest target,
        // but its children are real tasks and must stay reachable.
        if (isMilestoneNode(n)) {
          out.push.apply(out, walk(n.children, depth, deeper));
          return;
        }
        var kids = walk(n.children, depth + 1, deeper);
        var learn = learnRows(n);
        var quest = isQuest(n);
        var below = quest
          || learn.some(function (l) { return l.quest; })
          || kids.some(function (k) { return k.hasQuestBelow; });
        if (prune && !below) return;
        out.push({
          node: n,
          depth: depth,
          quest: quest,
          star: isStarred(n),
          learn: learn,
          children: kids,
          hasQuestBelow: below
        });
      });
      // Sorted AFTER the milestone flattening above, so a promoted child is
      // arranged alongside its new siblings rather than inside a group that no
      // longer exists.
      out.sort(bySiblingOrder);
      return out;
    }

    return walk(goals, 0, Object.create(null));
  }

  // The one definition of "include all children but only show the parent".
  //
  // A starred node emits ONE row and the walk does not descend, because the
  // subtree is what that row stands for. Anything below it — including its own
  // starred to-learns — is inside what the row already represents.
  function starRollup(goals, mms) {
    var by = mmIndex(mms);
    var out = [];

    function walk(nodes, seen) {
      (isList(nodes) ? nodes : []).forEach(function (n) {
        if (!isMap(n) || n.isLink) return;
        if (isId(n.id) && seen[n.id]) return;
        var deeper = seen;
        if (isId(n.id)) {
          deeper = Object.assign(Object.create(null), seen);
          deeper[n.id] = true;
        }
        if (isMilestoneNode(n)) { walk(n.children, deeper); return; }
        if (isStarred(n)) {
          // `count` is how many quests this ONE row stands for — itself, its
          // quested to-learns, and everything quested beneath it. It is what
          // lets the collapsed row say how much it represents without the
          // caller re-walking the subtree and inventing a second answer.
          var c = countQuests([n]);
          out.push({
            kind: 'node', node: n, mmId: null, mm: null,
            count: c.nodes + c.learn
          });
          return;
        }
        starLearnOf(n).forEach(function (id) {
          out.push({ kind: 'learn', node: n, mmId: id, mm: by[id] || null, count: 1 });
        });
        walk(n.children, deeper);
      });
    }

    walk(goals, Object.create(null));
    return out;
  }

  // ── routine ticks ────────────────────────────────────────────────────────
  // A routine quest ticks in the Quest tab ONLY. It never writes routineDates,
  // so it never touches the real completion, and it resets at the end of the
  // day.
  //
  // Expiry is STRUCTURAL rather than scheduled: one stored `day` covers the
  // whole set, so a day that is not today reads as empty. No timer, no cleanup
  // job, no midnight edge case. A slotId mismatch reads as empty too, so
  // switching workspaces cannot show another slot's ticks.
  //
  // This is NOT slot data — not in SLOT_FIELDS, not exported, not imported,
  // not synced. It lives in its own browser key beside track_home_cal_hidden.
  //
  // The day arrives as a PARAMETER, which is what keeps this file free of date
  // code. The page computes the LOCAL day with its own helper; never
  // toISOString().split('T')[0], which is a UTC day.
  //
  // Both ends are total on purpose: JSON.parse does not throw on 'null' or
  // '42', and a view preference must never be able to break a page.
  function routineTicks(raw, slotId, todayStr) {
    var parsed = raw;
    if (isText(raw)) {
      try { parsed = JSON.parse(raw); } catch (e) { return []; }
    }
    if (!isMap(parsed)) return [];
    if (!isText(todayStr) || parsed.day !== todayStr) return [];
    if (parsed.slotId !== slotId) return [];
    return isList(parsed.ids) ? parsed.ids.filter(isId) : [];
  }

  function withRoutineTick(raw, slotId, todayStr, nodeId, on) {
    var empty = { slotId: slotId, day: isText(todayStr) ? todayStr : '', ids: [] };
    if (!isText(todayStr) || !isId(nodeId)) return empty;
    var current = routineTicks(raw, slotId, todayStr);
    var has = current.indexOf(nodeId) >= 0;
    var ids = current;
    if (on && !has) ids = current.concat([nodeId]);
    else if (!on && has) ids = current.filter(function (id) { return id !== nodeId; });
    return { slotId: slotId, day: todayStr, ids: ids };
  }

  global.TrackQuest = {
    KEYS: ['quest', 'star', 'questLearn', 'starLearn', 'questOrder'],
    ROUTINE_TICK_KEY: 'track_quest_routine_ticks',
    isQuest: isQuest,
    isStarred: isStarred,
    isMilestoneNode: isMilestoneNode,
    toLearnOf: toLearnOf,
    questLearnOf: questLearnOf,
    questOrderOf: questOrderOf,
    reorderIds: reorderIds,
    withQuestOrder: withQuestOrder,
    starLearnOf: starLearnOf,
    countQuests: countQuests,
    withQuest: withQuest,
    withStar: withStar,
    withQuestLearn: withQuestLearn,
    withStarLearn: withStarLearn,
    withoutLearnIds: withoutLearnIds,
    learnFlagsOf: learnFlagsOf,
    withoutLearnFlags: withoutLearnFlags,
    questTree: questTree,
    starRollup: starRollup,
    routineTicks: routineTicks,
    withRoutineTick: withRoutineTick
  };
})(window);
