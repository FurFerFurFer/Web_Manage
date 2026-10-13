/* ── milestone-core.js ─────────────────────────────────────────────────────
   The one definition of where a milestone stands (window.TrackMilestone), and
   of the phase a mind map is in — a Procedural MM has no SIR (see "a mind
   map's kind" below).

   A milestone is a DEFINITION on an owner node — `owner.milestones[i] =
   {id, title, createdAt, startDate?, endDate?, slips?}` — and the work that
   belongs to it is found structurally, never by a key on the work itself:

     - TASKS: everything under the owner's milestone blocks (a node with
       `taskType: 'milestone'` and `milestoneId === def.id`), links resolved.
     - TO-LEARN: each mind map in `owner.toLearn` whose
       `owner.mmTargets[mmId].milestones` carries a waypoint for this milestone,
       reached when `targetMet(mm, thatWaypoint, sirDone)`.

   A milestone is OVERDUE when its end date has passed and that work is not all
   done. Three pages draw that state — progress.html (the Milestones tab, its
   calendar, the Schedule and its pickers), index.html and documentations.html
   (the month calendars, through calendar-core.js) — and that is exactly the
   shape of a bug this project has already paid for: the deadline caution
   predicate was spelled out at three call sites, one forgot half of it, and the
   timeline mismarked every due day until it was found. So the rule lives HERE,
   once, and no surface re-spells it. progress.html's own countProgress,
   isMMTargetMet, buildSirDoneMap, STAGE_ORDER, collectMilestoneOwners and
   collectMilestoneBlocks are one-line delegates to this file for the same
   reason: the Milestones tab and the calendar tails must not be able to
   disagree about what "done" means.

   Five rules are load-bearing:

   - An EMPTY milestone — no tasks, no to-learn waypoints — is never late. The
     user's rule is about unfinished work, and an empty one has none to chase.
   - The end day itself is NOT late. `endDate` is the last day of the period;
     lateness starts the day after.
   - To-learn iterates `owner.toLearn`, NEVER `Object.entries(mmTargets)`. Those
     keys are strings, while a mind map's id is a NUMBER from sir-ks02.html's
     nid() counter, so a key-driven loop compares '10' with 10 and finds nothing.
   - Every walker carries a cycle guard. The "link existing task" picker offers
     a task's own ancestors, so a link cycle is reachable through ordinary use,
     and a RangeError out of a render empties the whole page.
   - `slips` has exactly one writer, withSlip, and is only ever appended to by
     moving the end of a milestone that was ALREADY late. Re-planning before a
     milestone is late is planning, not a slip.

   Nothing here reads or writes localStorage, and nothing here constructs a
   Date — "today" arrives as a PARAMETER, a local YYYY-MM-DD the page computed,
   and day arithmetic is integer days-from-civil. That is what keeps this file's
   suite out of the swept list; tests/milestone-core.test.js asserts it
   structurally. Day VALIDITY is asked of schema.js (TrackSchema.isDay) at call
   time, as notes-core.js does — with schema.js absent nothing is a valid day,
   so every milestone reads as undated and nothing is ever wrongly called late.

   Loaded as a classic script by progress.html, index.html,
   documentations.html and sir-ks02.html.
*/
(function (global) {
  'use strict';

  function isList(v) { return Array.isArray(v); }

  // Arrays and null are both typeof 'object'.
  function isMap(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  function own(o, k) { return isMap(o) && Object.prototype.hasOwnProperty.call(o, k); }

  // Goal ids are strings from TrackStorage.newId(); mind-map ids are NUMBERS
  // from nid(). Accept both, everywhere an id is read.
  function isId(v) {
    return (typeof v === 'string' && v !== '') || (typeof v === 'number' && isFinite(v));
  }

  function listOf(v) { return isList(v) ? v : []; }

  function kidsOf(n) { return isMap(n) ? listOf(n.children) : []; }

  function isBlock(n) { return isMap(n) && n.taskType === 'milestone'; }

  function isDay(v) {
    var S = global.TrackSchema;
    return !!(S && S.isDay) && S.isDay(v);
  }

  // A shallow copy that keeps EVERY own key, '__proto__' included. JSON.parse
  // makes '__proto__' an ordinary own property; Object.assign would set the
  // copy's prototype instead and lose the key. Same helper as notes-core.js.
  function copyOwn(src) {
    var out = {};
    if (!isMap(src)) return out;
    Object.keys(src).forEach(function (k) {
      Object.defineProperty(out, k, { value: src[k], enumerable: true, writable: true, configurable: true });
    });
    return out;
  }

  function withKey(src, k, v) {
    var out = copyOwn(src);
    Object.defineProperty(out, k, { value: v, enumerable: true, writable: true, configurable: true });
    return out;
  }

  function withoutKey(src, k) {
    var out = copyOwn(src);
    delete out[k];
    return out;
  }

  // ── stages and mind-map targets ──────────────────────────────────────────
  // Moved verbatim from progress.html. A target (or a single milestone
  // waypoint) is { stage?, level? }; a target that carries `milestones` is
  // judged by its LAST waypoint, which is the overall goal target. Passing ONE
  // waypoint makes that waypoint the effective target — that is the
  // per-milestone check, and it is the same call the MM progress bar makes.

  var STAGE_ORDER = Object.freeze({ 1: 1, 2: 2, 3: 3, 4: 4, sir: 5, sir1: 6, sir2: 7, sir3: 8, sir4: 9, sir5: 10, finished: 11 });

  // Own-property lookup, so a stage called `constructor` reads as unknown
  // rather than as Object.prototype.constructor.
  function stageOrder(k) { return own(STAGE_ORDER, k) ? STAGE_ORDER[k] : 0; }

  // ── a mind map's kind ────────────────────────────────────────────────────
  // docs/CONCEPTS.md: a PROCEDURAL mind map (stored type '2') is built through
  // the phases S1–S4 and has NO SIR — spaced review does not fit knowledge that
  // grows in Kolb cycles. Two readers carry that rule, and no surface re-spells
  // it:
  //
  //   - stageOf(mm) is the phase an MM is IN. A Procedural MM whose STORED
  //     ksStage is 'sir' or 'finished' — one that entered SIR before the rule
  //     existed, or a Declarative one switched to Procedural — reads as '4'.
  //   - liveSessions(sessions, mms) is the SIR sessions that are drawn and
  //     counted. A Procedural MM's sessions are left out.
  //
  // Neither rewrites anything stored, and that is the point: switching the
  // type back to Declarative restores SIR and its sessions exactly as they
  // were. Every surface that draws a phase or a session reads through these —
  // the Knowledge Record, Progress, and, through calendar-core.js, Home and
  // Documentations — because a copy at one surface is how the deadline caution
  // predicate came to disagree with itself.

  // '2' or 2 exactly: String(['2']) is also '2', and a junk type must not
  // switch SIR off.
  function isProcedural(mm) { return isMap(mm) && (mm.type === '2' || mm.type === 2); }

  // Anything else comes back exactly as stored, so a reader that tested
  // `mm.ksStage` for truthiness or looked it up in a colour table behaves as
  // it always did.
  function stageOf(mm) {
    if (!isMap(mm)) return null;
    var s = mm.ksStage;
    return isProcedural(mm) && (s === 'sir' || s === 'finished') ? '4' : s;
  }

  // A Procedural MM's progress toward a goal is its MG LEVEL, never its phase:
  // every new Kolb sends it back to S1, so a phase target would be lost and won
  // again with each reflection. targetFor(mm, target) is the target as it is
  // READ for this MM. For a Procedural MM, `stage` is gone from the target and
  // from every waypoint, and a waypoint left with no level is gone too — a
  // phase-only target is NO target, not a met one. Anything else comes back
  // itself. Nothing stored changes: progress.html's target writers re-read the
  // raw target, so a phase target stays stored, unread, and switching the type
  // back to Declarative restores it. targetMet and statusOf apply it, and
  // progress.html's "does this MM have a target?" readers call it.
  function targetFor(mm, target) {
    if (!isProcedural(mm) || !isMap(target)) return target;
    var ms = target.milestones;
    var dropsWaypoint = function (e) { return !isMap(e) || !e.level; };
    var touched = own(target, 'stage') ||
      (isList(ms) && ms.some(function (e) { return dropsWaypoint(e) || own(e, 'stage'); }));
    if (!touched) return target;
    var out = withoutKey(target, 'stage');
    if (isList(ms)) {
      var kept = ms.filter(function (e) { return !dropsWaypoint(e); })
        .map(function (e) { return own(e, 'stage') ? withoutKey(e, 'stage') : e; });
      out = kept.length ? withKey(out, 'milestones', kept) : withoutKey(out, 'milestones');
    }
    return out;
  }

  // Returns its input itself when nothing is left out, so a React memo built
  // on it does not change identity for a workspace with no Procedural MMs.
  function liveSessions(sessions, mms) {
    var list = listOf(sessions);
    var hidden = new Set();
    listOf(mms).forEach(function (m) { if (isProcedural(m) && isId(m.id)) hidden.add(m.id); });
    if (!hidden.size) return list;
    var out = list.filter(function (s) { return !(isMap(s) && hidden.has(s.mmId)); });
    return out.length === list.length ? list : out;
  }

  function sirDoneMap(sessions) {
    var map = {};
    listOf(sessions).forEach(function (s) {
      if (isMap(s) && s.done) map[s.mmId] = (map[s.mmId] || 0) + 1;
    });
    return map;
  }

  // `sirDone` defaults to an empty map: progress.html's goal ring calls the
  // original with two arguments.
  function targetMet(mm, target, sirDone) {
    if (!target) return true;
    if (!isMap(mm)) return false;
    target = targetFor(mm, target);   // a Procedural MM: its level alone
    var ms = isMap(target) ? target.milestones : null;
    var eff = (isList(ms) && ms.length > 0) ? ms[ms.length - 1] : target;
    if (!isMap(eff)) return true;
    var stage = stageOf(mm);
    var effOrder = stage === 'sir'
      ? 5 + ((isMap(sirDone) ? sirDone[mm.id] : 0) || 0)
      : stageOrder(stage);
    var stageMet = !eff.stage || effOrder >= stageOrder(eff.stage);
    var levelMet = !eff.level || (mm.rating || 0) >= Number(eff.level);
    return stageMet && levelMet;
  }

  // ── the goal tree ────────────────────────────────────────────────────────

  // Preorder, first match wins — progress.html's findNode, guarded. A stored
  // tree is acyclic by construction, but this also runs over trees a page is
  // still holding in memory, and a guard is cheaper than the argument.
  function findNode(goals, id) {
    var seen = new Set();
    function walk(nodes) {
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (!isMap(n) || seen.has(n)) continue;
        seen.add(n);
        if (n.id === id) return n;
        var f = walk(kidsOf(n));
        if (f) return f;
      }
      return null;
    }
    return walk(listOf(goals));
  }

  // progress.html's countProgress, which delegates here: an empty milestone
  // block counts nothing, a leaf counts by `completed` (a routine included —
  // its per-day ticks live in routineDates and never complete it), and a link
  // counts as the task it points at. Plus a PER-PATH cycle guard: a node already
  // on the current path contributes nothing and its branch ends there. A
  // diamond — one task linked from two places — still counts twice, exactly as
  // it always has; only a cycle, which used to recurse until the stack blew,
  // is cut.
  function countLeaves(node, resolve) {
    var path = [];
    function walk(n) {
      if (!isMap(n) || path.indexOf(n) !== -1) return { done: 0, total: 0 };
      path.push(n);
      try {
        if (n.isLink) {
          var orig = typeof resolve === 'function' ? resolve(n.linkedTaskId) : null;
          return orig ? walk(orig) : { done: 0, total: 0 };
        }
        var kids = kidsOf(n);
        if (isBlock(n) && kids.length === 0) return { done: 0, total: 0 };
        if (kids.length === 0) return { done: n.completed ? 1 : 0, total: 1 };
        return kids.reduce(function (acc, c) {
          var p = walk(c);
          return { done: acc.done + p.done, total: acc.total + p.total };
        }, { done: 0, total: 0 });
      } finally {
        path.pop();
      }
    }
    return walk(node);
  }

  // The leaf goal-like nodes under `goal` — the nodes that own milestones.
  // progress.html's collectMilestoneOwners, which delegates here, plus a
  // visited set: a linked sub-goal makes one owner reachable from several
  // goals, and a link back up the tree must end rather than recurse.
  function ownersOf(goal, allGoals) {
    var out = [];
    var ids = Object.create(null);
    var visited = new Set();
    function walk(n) {
      if (!isMap(n) || visited.has(n)) return;
      visited.add(n);
      if (n.isLink) {
        var orig = findNode(allGoals, n.linkedTaskId);
        if (orig) walk(orig);
        return;
      }
      var subGoals = kidsOf(n).filter(function (c) { return isMap(c) && c.isSubGoal; });
      if (subGoals.length === 0) {
        if (!ids[n.id]) { ids[n.id] = true; out.push(n); }
        return;
      }
      subGoals.forEach(walk);
    }
    walk(goal);
    return out;
  }

  // Every block of milestone `milestoneId` at any depth under `owner`, links
  // followed. progress.html's collectMilestoneBlocks, which delegates here.
  // Visited-at-enqueue over every node, the owner included, so a block reached
  // both directly and through a link is collected ONCE — the old walk guarded
  // links only and collected such a block twice, counting its tasks twice.
  function blocksOf(owner, milestoneId, allGoals) {
    var out = [];
    var visited = new Set();
    function walk(n) {
      if (!isMap(n) || visited.has(n)) return;
      visited.add(n);
      if (n.isLink) {
        var orig = findNode(allGoals, n.linkedTaskId);
        if (orig) walk(orig);
        return;
      }
      if (isBlock(n) && n.milestoneId === milestoneId) out.push(n);
      kidsOf(n).forEach(walk);
    }
    if (isMap(owner)) {
      visited.add(owner);
      kidsOf(owner).forEach(walk);
    }
    return out;
  }

  // ── days ─────────────────────────────────────────────────────────────────
  // Integer days-from-civil (Howard Hinnant), so a difference between two
  // calendar days needs no Date and cannot be moved by a timezone or a DST
  // change. NOT named daysBetween: calendar-core.js already exports that name,
  // and it returns a LIST of days.

  function civil(ds) {
    var y = +ds.slice(0, 4), m = +ds.slice(5, 7), d = +ds.slice(8, 10);
    if (m <= 2) y -= 1;
    var era = Math.floor(y / 400);
    var yoe = y - era * 400;
    var doy = Math.floor((153 * (m > 2 ? m - 3 : m + 9) + 2) / 5) + d - 1;
    var doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
    return era * 146097 + doe - 719468;
  }

  function dayDiff(a, b) {
    return isDay(a) && isDay(b) ? civil(b) - civil(a) : null;
  }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // 'Oct 1', or 'Oct 1, 2025' when the year is not today's.
  function shortDay(ds, today) {
    var y = ds.slice(0, 4);
    var out = MONTHS[+ds.slice(5, 7) - 1] + ' ' + (+ds.slice(8, 10));
    return isDay(today) && today.slice(0, 4) === y ? out : out + ', ' + y;
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  // ── status ───────────────────────────────────────────────────────────────

  function keyOf(ownerId, milestoneId) { return String(ownerId) + '|' + String(milestoneId); }

  // Where milestone `def` on `owner` stands on `today`. First match wins:
  //
  //   empty     no tasks and no to-learn waypoints — never late, at any date
  //   done      every task done and every waypoint reached
  //   undated   a date missing, malformed or inverted, or `today` not a day —
  //             a lateness claim needs both dates and a clock
  //   upcoming  today is before the start
  //   active    start <= today <= end; the END DAY ITSELF is not late
  //   overdue   end < today; daysLate >= 1
  //
  // `drawEnd` is the one definition of the drawn span: TODAY while late, the
  // end day otherwise, null when undated. calendar-core.js and the Milestones
  // tab's calendar both draw [startDate, drawEnd].
  function statusOf(owner, def, allGoals, mms, sirDone, today) {
    var goals = listOf(allGoals);
    var resolve = function (id) { return findNode(goals, id); };
    var blocks = blocksOf(owner, def.id, goals);
    var tasks = blocks.reduce(function (acc, b) {
      var p = countLeaves(b, resolve);
      return { done: acc.done + p.done, total: acc.total + p.total };
    }, { done: 0, total: 0 });

    var byId = new Map();
    listOf(mms).forEach(function (m) { if (isMap(m) && !byId.has(m.id)) byId.set(m.id, m); });
    var targets = isMap(owner) && isMap(owner.mmTargets) ? owner.mmTargets : {};
    var learn = { met: 0, total: 0, open: [] };
    var seen = new Set();
    listOf(isMap(owner) ? owner.toLearn : null).forEach(function (mmId) {
      if (!isId(mmId) || seen.has(mmId)) return;
      seen.add(mmId);
      var mm = byId.get(mmId);
      if (!mm) return;
      // Read through targetFor: a Procedural MM's phase-only waypoint is no
      // target, so it is not work and cannot make a milestone late.
      var target = targetFor(mm, own(targets, mmId) ? targets[mmId] : null);
      var waypoint = listOf(isMap(target) ? target.milestones : null)
        .filter(function (e) { return isMap(e) && e.milestoneId === def.id; })[0];
      if (!waypoint) return;
      learn.total++;
      if (targetMet(mm, waypoint, sirDone)) learn.met++;
      else learn.open.push(mmId);
    });

    var empty = tasks.total === 0 && learn.total === 0;
    var complete = !empty && tasks.done >= tasks.total && learn.open.length === 0;
    var start = def.startDate, end = def.endDate;
    var dated = isDay(start) && isDay(end) && start <= end;

    var state, daysLate = 0, drawEnd = dated ? end : null;
    if (empty) state = 'empty';
    else if (complete) state = 'done';
    else if (!dated || !isDay(today)) state = 'undated';
    else if (today < start) state = 'upcoming';
    else if (today <= end) state = 'active';
    else { state = 'overdue'; daysLate = dayDiff(end, today); drawEnd = today; }

    return {
      key: keyOf(isMap(owner) ? owner.id : '', def.id),
      ownerId: isMap(owner) ? owner.id : null,
      ownerTitle: (isMap(owner) && owner.title) || '',
      milestoneId: def.id,
      title: def.title || '',
      owner: owner,
      def: def,
      blocks: blocks,
      order: 0,
      startDate: start,
      endDate: end,
      dated: dated,
      tasks: tasks,
      learn: learn,
      empty: empty,
      complete: complete,
      state: state,
      daysLate: daysLate,
      drawEnd: drawEnd
    };
  }

  // Every milestone the Milestones tab lists, keyed owner|milestone — the
  // tab's own enumeration: each top-level goal's owners, an owner reachable
  // through several links counted once. So every warning anywhere has a row
  // where it can be fixed. Within one owner a duplicated milestone id is listed
  // once, first wins. `order` is the enumeration index.
  function report(goals, mms, sirDone, today) {
    var list = listOf(goals);
    var rep = Object.create(null);
    var owners = Object.create(null);
    var order = 0;
    list.forEach(function (goal) {
      ownersOf(goal, list).forEach(function (owner) {
        if (owners[owner.id]) return;
        owners[owner.id] = true;
        listOf(owner.milestones).forEach(function (def) {
          if (!isMap(def) || !isId(def.id)) return;
          var k = keyOf(owner.id, def.id);
          if (k in rep) return;
          var st = statusOf(owner, def, list, mms, sirDone, today);
          st.order = order++;
          rep[k] = st;
        });
      });
    });
    return rep;
  }

  function entries(rep) {
    return isMap(rep) ? Object.keys(rep).map(function (k) { return rep[k]; }) : [];
  }

  // Late milestones, most days late first, then in tab order.
  function lateList(rep) {
    return entries(rep)
      .filter(function (st) { return st.state === 'overdue'; })
      .sort(function (a, b) { return (b.daysLate - a.daysLate) || (a.order - b.order); });
  }

  // milestone id -> late status, for the surfaces that draw a milestone once
  // by id (calendar-core.js dedupes definitions by id, first wins). The FIRST
  // holder of an id decides, and it is included only if that holder is late.
  function lateById(rep) {
    var out = new Map();
    var seen = Object.create(null);
    entries(rep)
      .sort(function (a, b) { return a.order - b.order; })
      .forEach(function (st) {
        if (seen[st.milestoneId]) return;
        seen[st.milestoneId] = true;
        if (st.state === 'overdue') out.set(st.milestoneId, st);
      });
    return out;
  }

  // The one wording every surface uses:
  //   'OVERDUE · 5 days · 3 tasks, 1 to-learn left'
  // with zero parts omitted. 'done' and 'no work attached' for the two
  // finished states, '' for the rest.
  function label(st) {
    if (!isMap(st)) return '';
    if (st.state === 'empty') return 'no work attached';
    if (st.state === 'done') return 'done';
    if (st.state !== 'overdue') return '';
    var parts = [];
    var tasksLeft = st.tasks.total - st.tasks.done;
    var learnLeft = st.learn.total - st.learn.met;
    if (tasksLeft > 0) parts.push(plural(tasksLeft, 'task', 'tasks'));
    if (learnLeft > 0) parts.push(learnLeft + ' to-learn');
    return 'OVERDUE · ' + plural(st.daysLate, 'day', 'days')
      + (parts.length ? ' · ' + parts.join(', ') + ' left' : '');
  }

  // ── the slip record ──────────────────────────────────────────────────────
  // `slips: [{from, to?, on}]` on a milestone definition: `from` is the end
  // day that had already passed, `to` the new end day — ABSENT when the dates
  // were cleared — and `on` the local day the move was made. The key is absent
  // when there are none, and [] is never written.
  //
  // The date inputs commit every complete day they pass through, so one edit
  // can arrive as several writes. The record is therefore the NET effect of
  // one day's edits from one due date: a write for the same (on, from) updates
  // that record's `to`, and a write that undoes the slip removes it again.

  // What withSlip compares against: the state before the edit began.
  function baselineOf(st) {
    return {
      endDate: isMap(st) && st.dated ? st.endDate : null,
      overdue: isMap(st) && st.state === 'overdue'
    };
  }

  // `nextDef` is the definition with its new period already applied. Returns
  // it UNCHANGED (the same object) when nothing is to be recorded — not late
  // at the baseline, a start-only change, or an end moved earlier.
  function withSlip(nextDef, baseline, today) {
    if (!isMap(nextDef) || !isMap(baseline) || !baseline.overdue) return nextDef;
    var from = baseline.endDate;
    if (!isDay(from) || !isDay(today)) return nextDef;
    // A malformed `slips` (not a list) is left exactly as it is: recording
    // would mean overwriting it, and this writer deletes nothing.
    if (own(nextDef, 'slips') && !isList(nextDef.slips)) return nextDef;
    var list = listOf(nextDef.slips);
    var to = isDay(nextDef.endDate) ? nextDef.endDate : null;
    var slipped = to === null || to > from;

    var at = -1;
    for (var i = list.length - 1; i >= 0; i--) {
      if (isMap(list[i]) && list[i].on === today && list[i].from === from) { at = i; break; }
    }

    if (slipped) {
      if (at === -1) {
        var rec = { from: from };
        if (to !== null) rec.to = to;
        rec.on = today;
        return withKey(nextDef, 'slips', list.concat([rec]));
      }
      var cur = list[at];
      if (to === null ? !own(cur, 'to') : cur.to === to) return nextDef;
      var upd = to === null ? withoutKey(cur, 'to') : withKey(cur, 'to', to);
      var copy = list.slice();
      copy[at] = upd;
      return withKey(nextDef, 'slips', copy);
    }

    if (at === -1) return nextDef;
    var rest = list.slice(0, at).concat(list.slice(at + 1));
    return rest.length ? withKey(nextDef, 'slips', rest) : withoutKey(nextDef, 'slips');
  }

  // Total reader: the valid records, as copies, in stored order. Anything
  // malformed is skipped, never deleted.
  function slipsOf(def) {
    return listOf(isMap(def) ? def.slips : null)
      .filter(function (r) {
        return isMap(r) && isDay(r.from) && isDay(r.on) && (!own(r, 'to') || isDay(r.to));
      })
      .map(function (r) {
        var out = { from: r.from };
        if (own(r, 'to')) out.to = r.to;
        out.on = r.on;
        return out;
      });
  }

  // 'slipped 2× · first due Oct 1' — `first due` is the end day the first slip
  // moved away from, which is the date the milestone was originally due.
  function slipLabel(def, today) {
    var s = slipsOf(def);
    if (!s.length) return '';
    return 'slipped ' + s.length + '× · first due ' + shortDay(s[0].from, today);
  }

  // The line the clear-dates confirm gains for a milestone that is late.
  function slipNotice(st) {
    if (!isMap(st) || st.state !== 'overdue') return '';
    return 'It is ' + plural(st.daysLate, 'day', 'days') + ' overdue, so clearing its dates is recorded as a slip.';
  }

  global.TrackMilestone = {
    STAGE_ORDER: STAGE_ORDER,
    isProcedural: isProcedural,
    stageOf: stageOf,
    targetFor: targetFor,
    liveSessions: liveSessions,
    sirDoneMap: sirDoneMap,
    targetMet: targetMet,
    countLeaves: countLeaves,
    ownersOf: ownersOf,
    blocksOf: blocksOf,
    dayDiff: dayDiff,
    keyOf: keyOf,
    statusOf: statusOf,
    report: report,
    lateList: lateList,
    lateById: lateById,
    label: label,
    baselineOf: baselineOf,
    withSlip: withSlip,
    slipsOf: slipsOf,
    slipLabel: slipLabel,
    slipNotice: slipNotice
  };
})(typeof window !== 'undefined' ? window : globalThis);
