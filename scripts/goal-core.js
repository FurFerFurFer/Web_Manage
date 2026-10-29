/* ── goal-core.js ──────────────────────────────────────────────────────────
   The shared goal tree: readers and pure writers moved from progress.html.

   Projects in Documentations needs the same tree edits as Progress. Keeping
   them here gives each rule ONE definition — especially the quest flags that
   travel with toLearn, milestone placement, and the refusal of a link loop.
   TrackQuest and TrackMilestone remain the definitions of their own rules;
   load quest-core.js and milestone-core.js before this classic script.

   This is an extraction, not a normalization. The existing defaults, absent
   keys, refusal results and reference behavior are retained. Callers supply
   a goal tree with the same shape Progress uses; these helpers do not turn
   malformed inputs into a new tree. Stored link cycles terminate in the
   readers that follow links, while ordinary tree walks do not follow them.

   Nothing here reads storage, prompts, constructs a Date or mints an id.
   The five writers that create records take `creations`, a list of {id, now}
   supplied by the caller (`now` is epoch ms and unused for links). Entries
   are consumed in creation order, including when
   malformed data repeats a target id. Supply one per matching node; unused
   entries are harmless. No entry is consumed on a refused branch.
   Destructive controls still confirm at the page boundary. Changed nodes
   keep the old spreads and TrackQuest calls, including their edge behavior;
   the offline suite pins them against verbatim copies from commit 1c111c5.
*/
(function (global) {
  'use strict';

  const TrackQuest = global.TrackQuest;
  const TrackMilestone = global.TrackMilestone;

  const MILESTONE_CAL_START = "2026-01-01";
  const MILESTONE_CAL_END   = "2033-12-31";

  // Read preallocated identities without mutating the caller's list. A scalar
  // id would be reused if a stored tree repeated the target id; the old writer
  // minted once per match, so each creation still needs its own input here.
  function creationReader(creations) {
    let index = 0;
    return () => creations[index++];
  }

  // These stay delegates: leaf counting and mind-map targets have their one
  // definition in milestone-core.js, shared with the other calendar surfaces.
  function countProgress(node, resolveLink) {
    return TrackMilestone.countLeaves(node, resolveLink);
  }

  function targetOf(mm, target) {
    return TrackMilestone.targetFor(mm, target);
  }

  function isMMTargetMet(mm, target, sirDoneMap) {
    return TrackMilestone.targetMet(mm, target, sirDoneMap);
  }

  function isMilestoneNode(node) {
    return node?.taskType === 'milestone';
  }

  function isCountableLeaf(node) {
    return !node?.isLink && !isMilestoneNode(node) && (node.children || []).length === 0;
  }

  // `_path` guards a link that resolves to a link that resolves back — only
  // hand-edited or synced data can build one, but a stack overflow here is a
  // white screen. Anything with children is counted by countProgress, which
  // carries its own guard.
  function isComplete(node, allGoals, _path = []) {
    if (!node || _path.includes(node)) return false;
    if (node.isLink) {
      const orig = resolveLinkedTask(node, allGoals);
      return orig ? isComplete(orig, allGoals, [..._path, node]) : false;
    }
    if (isMilestoneNode(node) && (node.children || []).length === 0) return true;
    if ((node.children || []).length === 0) return !!node.completed;
    const progress = countProgress(node, allGoals ? id => findNode(allGoals, id) : null);
    if (progress.total === 0) return false;
    return progress.done >= progress.total;
  }

  function toggleLeaf(goals, id) {
    return goals.map(g =>
      g.id === id && isCountableLeaf(g)
        ? { ...g, completed: !g.completed }
        : { ...g, children: toggleLeaf(g.children || [], id) }
    );
  }

  function addChild(goals, parentId, child) {
    function walk(nodes, insideMilestone = false) {
      return nodes.map(g => {
        const nextInsideMilestone = insideMilestone || isMilestoneNode(g);
        if (g.id === parentId) {
          if (
            isMilestoneNode(child) &&
            (nextInsideMilestone || parentHasMilestoneChild(g, child.milestoneId, child.id, goals))
          ) return g;
          return { ...g, children: [...(g.children || []), child] };
        }
        return { ...g, children: walk(g.children || [], nextInsideMilestone) };
      });
    }
    return walk(goals);
  }

  function addSubGoalAndMigrateTasks(goals, parentId, subGoal) {
    return goals.map(g => {
      if (g.id === parentId) {
        const existingTasks    = (g.children || []).filter(c => !c.isSubGoal);
        const existingSubGoals = (g.children || []).filter(c =>  c.isSubGoal);
        // questLearn/starLearn are in the same key space as mmTargets and
        // MUST travel with toLearn. TrackQuest.questLearnOf gates on toLearn
        // membership, so leaving them behind does not strand the quest — it
        // silently DELETES it, as a side effect of adding a sub-goal.
        const newSubGoal = {
          ...subGoal,
          children:  [...existingTasks],
          toLearn:   [...(g.toLearn   || [])],
          mmTargets: { ...(g.mmTargets || {}) },
          milestones: [...(g.milestones || [])],
          ...TrackQuest.learnFlagsOf(g),
        };
        return {
          // withoutLearnFlags, not a spread: a spread can add a key but
          // cannot delete one, and `questLearn: []` is not the same stored
          // state as no key at all.
          ...TrackQuest.withoutLearnFlags(g),
          children:  [...existingSubGoals, newSubGoal],
          toLearn:   [],
          mmTargets: {},
          milestones: [],
        };
      }
      return { ...g, children: addSubGoalAndMigrateTasks(g.children || [], parentId, subGoal) };
    });
  }

  function deleteNode(goals, id) {
    return goals
      .filter(g => g.id !== id)
      .map(g => ({ ...g, children: deleteNode(g.children || [], id) }));
  }

  function deleteNodeKeepChildren(goals, id) {
    const result = [];
    for (const g of goals) {
      if (g.id === id) {
        result.push(...(g.children || []));
      } else {
        result.push({ ...g, children: deleteNodeKeepChildren(g.children || [], id) });
      }
    }
    return result;
  }

  function updateTitle(goals, id, title) {
    return goals.map(g =>
      g.id === id ? { ...g, title }
                  : { ...g, children: updateTitle(g.children || [], id, title) }
    );
  }

  function updateDate(goals, id, date) {
    return goals.map(g =>
      g.id === id ? { ...g, scheduledDate: date }
                  : { ...g, children: updateDate(g.children || [], id, date) }
    );
  }

  function flattenAll(goals) {
    const out = [];
    const walk = ns => ns.forEach(n => { out.push(n); walk(n.children || []); });
    walk(goals);
    return out;
  }

  // A PER-PATH cycle guard, as TrackMilestone.countLeaves has: the "link
  // existing task" picker used to offer a task's own ancestors, so a link
  // back up the tree can be in stored data, and following it recursed until
  // the stack gave out. A node already on the current path ends its branch;
  // a diamond (one task linked from two places) still yields its leaves
  // twice, because callers read `.length` and always have.
  function getLeaves(node, allGoals = null, _path = []) {
    if (!node || _path.includes(node)) return [];
    const path = [..._path, node];
    if (node.isLink) {
      const orig = resolveLinkedTask(node, allGoals);
      return orig ? getLeaves(orig, allGoals, path) : [];
    }
    if (isMilestoneNode(node) && (node.children || []).length === 0) return [];
    if ((node.children || []).length === 0) return [node];
    return (node.children || []).flatMap(c => getLeaves(c, allGoals, path));
  }

  function parentHasMilestoneChild(parent, milestoneId, excludeId = null, allGoals = null) {
    const seen = new Set();
    return (parent?.children || []).some(child => {
      if (!child || child.id === excludeId) return false;
      let node = child;
      if (child.isLink) {
        node = allGoals && findNode(allGoals, child.linkedTaskId);
        if (!node || seen.has(node.id)) return false;
        seen.add(node.id);
      }
      return node.id !== excludeId && isMilestoneNode(node) && node.milestoneId === milestoneId;
    });
  }

  function findNodePath(nodes, id, path = []) {
    for (const n of nodes) {
      const next = [...path, n];
      if (n.id === id) return next;
      const found = findNodePath(n.children || [], id, next);
      if (found) return found;
    }
    return null;
  }

  function addMilestoneType(goals, ownerId, title, creations) {
    const nextCreation = creationReader(creations);
    function walk(nodes) {
      return nodes.map(g => {
        if (g.id === ownerId) {
          const { id, now } = nextCreation();
          return { ...g, milestones: [...(g.milestones || []), { id, title, createdAt: now }] };
        }
        return { ...g, children: walk(g.children || []) };
      });
    }
    return walk(goals);
  }

  function renameMilestoneType(goals, ownerId, milestoneId, title) {
    function updateBlockTitles(nodes) {
      return nodes.map(n => ({
        ...n,
        title: isMilestoneNode(n) && n.milestoneId === milestoneId ? title : n.title,
        children: updateBlockTitles(n.children || []),
      }));
    }
    return goals.map(g => {
      if (g.id === ownerId) {
        return {
          ...g,
          milestones: (g.milestones || []).map(m => m.id === milestoneId ? { ...m, title } : m),
          children: updateBlockTitles(g.children || []),
        };
      }
      return { ...g, children: renameMilestoneType(g.children || [], ownerId, milestoneId, title) };
    });
  }

  function deleteMilestoneType(goals, ownerId, milestoneId) {
    function convertBlocks(nodes) {
      return nodes.map(n => {
        const converted = isMilestoneNode(n) && n.milestoneId === milestoneId;
        return {
          ...n,
          taskType: converted ? 'task' : n.taskType,
          milestoneId: converted ? null : n.milestoneId,
          children: convertBlocks(n.children || []),
        };
      });
    }
    return goals.map(g => {
      if (g.id === ownerId) {
        return {
          ...g,
          milestones: (g.milestones || []).filter(m => m.id !== milestoneId),
          children: convertBlocks(g.children || []),
        };
      }
      return { ...g, children: deleteMilestoneType(g.children || [], ownerId, milestoneId) };
    });
  }

  function reorderMilestoneType(goals, ownerId, milestoneId, dir) {
    return goals.map(g => {
      if (g.id === ownerId) {
        const milestones = [...(g.milestones || [])];
        const idx = milestones.findIndex(m => m.id === milestoneId);
        const nextIdx = idx + dir;
        if (idx < 0 || nextIdx < 0 || nextIdx >= milestones.length) return g;
        const [moved] = milestones.splice(idx, 1);
        milestones.splice(nextIdx, 0, moved);
        return { ...g, milestones };
      }
      return { ...g, children: reorderMilestoneType(g.children || [], ownerId, milestoneId, dir) };
    });
  }

  function normalizeMilestonePeriod(startDate, endDate) {
    const clean = d => d && d >= MILESTONE_CAL_START && d <= MILESTONE_CAL_END ? d : null;
    const start = clean(startDate);
    const end = clean(endDate);
    if (!start && !end) return { startDate: null, endDate: null };
    if (start && !end) return { startDate: start, endDate: start };
    if (!start && end) return { startDate: end, endDate: end };
    return start <= end
      ? { startDate: start, endDate: end }
      : { startDate: end, endDate: start };
  }

  /* What a milestone date input may commit: a COMPLETE, real day inside the
     calendar's range. Never '' — emptying a field by keyboard does not clear
     a date; the confirm-gated clear button does — and never a year segment
     passing through 0002, 0020 and 0202 on its way to 2026, each of which
     used to be written, collapsing the period on every keystroke and, for a
     late milestone, writing slip records nothing could delete. Asked by both
     pages' date inputs (Progress's Milestones tab, Documentations' Projects
     tab). TrackSchema.isDay is the one definition of a real day; schema.js
     loads before this file on both pages. */
  function isMilestoneDay(v) {
    return !!(global.TrackSchema && global.TrackSchema.isDay(v))
      && v >= MILESTONE_CAL_START && v <= MILESTONE_CAL_END;
  }

  /* The period a date input asks for when ONE bound changes: a start past
     the end drags the end with it, an end before the start drags the start —
     the other bound moves rather than the pair inverting. `field` is 'start'
     or 'end'. Both pages' date inputs go through it, so a typed day lands
     the same way wherever it was typed. */
  function periodWithDay(milestone, field, value) {
    const m = milestone || {};
    let startDate = field === 'start' ? value || null : m.startDate || null;
    let endDate = field === 'end' ? value || null : m.endDate || null;
    if (field === 'start' && value && endDate && value > endDate) endDate = value;
    if (field === 'end' && value && startDate && value < startDate) startDate = value;
    return { startDate, endDate };
  }

  function withMilestonePeriod(milestone, startDate, endDate) {
    const next = { ...milestone };
    if (startDate && endDate) {
      next.startDate = startDate;
      next.endDate = endDate;
    } else {
      delete next.startDate;
      delete next.endDate;
    }
    return next;
  }

  /* The one writer of a milestone's dates. `slip` — {today, mms, sirDone,
     baseline} — is what records a late milestone's moved end in `slips`
     (TrackMilestone.withSlip, the one writer of that key). The baseline is
     the state the edit STARTED from: a focused date input captures it on
     focus, because a typed date passes through other days on the way and
     must not move it; anything else — the clear button — is judged against
     this tree as it stands before the write. `today` arrives from the
     caller, so the updater stays a pure function of `goals` and what it was
     handed. */
  function updateMilestonePeriod(goals, ownerId, milestoneId, startDate, endDate, slip) {
    const period = normalizeMilestonePeriod(startDate, endDate);
    let base = slip ? slip.baseline : null;
    if (slip && !base) {
      const owner = findNode(goals, ownerId);
      const def = owner && (owner.milestones || []).find(m => m && m.id === milestoneId);
      base = def
        ? TrackMilestone.baselineOf(TrackMilestone.statusOf(owner, def, goals, slip.mms, slip.sirDone, slip.today))
        : null;
    }
    function walk(nodes) {
      return nodes.map(g => {
        if (g.id === ownerId) {
          return {
            ...g,
            milestones: (g.milestones || []).map(m => {
              if (m.id !== milestoneId) return m;
              const next = withMilestonePeriod(m, period.startDate, period.endDate);
              return slip ? TrackMilestone.withSlip(next, base, slip.today) : next;
            }),
          };
        }
        return { ...g, children: walk(g.children || []) };
      });
    }
    return walk(goals);
  }

  function updateSchedule(goals, id, date, time) {
    return goals.map(g => {
      if (g.id === id) {
        if (g.taskType === 'routine') {
          if (date === null) return { ...g, routineDates: {} };
          const prev = (g.routineDates || {})[date];
          return { ...g, routineDates: {
            ...(g.routineDates || {}),
            [date]: { ...(prev || {}), time: time || prev?.time || '09:00', done: prev?.done || false }
          }};
        }
        return { ...g, scheduledDate: date, scheduledTime: time };
      }
      return { ...g, children: updateSchedule(g.children || [], id, date, time) };
    });
  }

  function updateNoteInTask(nodes, taskId, noteId, fields) {
    return nodes.map(n =>
      n.id === taskId
        ? { ...n, notes: (n.notes || []).map(nt => nt.id === noteId ? { ...nt, ...fields } : nt) }
        : { ...n, children: updateNoteInTask(n.children || [], taskId, noteId, fields) }
    );
  }

  function addNoteToTask(nodes, id, note) {
    return nodes.map(n =>
      n.id === id
        ? { ...n, notes: [...(n.notes || []), note] }
        : { ...n, children: addNoteToTask(n.children || [], id, note) }
    );
  }

  function removeNoteFromTask(nodes, id, noteId) {
    return nodes.map(n =>
      n.id === id
        ? { ...n, notes: (n.notes || []).filter(nt => nt.id !== noteId) }
        : { ...n, children: removeNoteFromTask(n.children || [], id, noteId) }
    );
  }

  function addChildAndTransferNotes(goals, parentId, child) {
    function walk(nodes, insideMilestone = false) {
      return nodes.map(g => {
        const nextInsideMilestone = insideMilestone || isMilestoneNode(g);
        if (g.id === parentId) {
          if (
            isMilestoneNode(child) &&
            (nextInsideMilestone || parentHasMilestoneChild(g, child.milestoneId, child.id, goals))
          ) return g;
          const isFirst = (g.children || []).length === 0;
          const parentNotes = g.notes || [];
          const newChild = isFirst && parentNotes.length > 0
            ? { ...child, notes: [...parentNotes] } : child;
          return {
            ...g,
            children: [...(g.children || []), newChild],
            ...(isFirst && parentNotes.length > 0 ? { notes: [] } : {}),
          };
        }
        return { ...g, children: walk(g.children || [], nextInsideMilestone) };
      });
    }
    return walk(goals);
  }

  // Every node a newly typed task or routine could be filed under, flattened
  // in tree order with its depth so one <select> can render the whole shape.
  //
  // This is deliberately NOT `getAllParentNodeIds`, which answers a different
  // question — that one returns nodes which ALREADY have visible children, so
  // the picker knows what to expand. A leaf is a perfectly good parent for a
  // new task (the Goals panel's own `commitKid` adds a child to any node), it
  // simply stops being a leaf, so excluding leaves here would hide most of the
  // tree from the very control that needs it.
  //
  // The exclusions match `renderPickerTreeNode`: a link node is an alias and
  // owns no children of its own, and a completed branch is finished work that
  // new work does not belong under. A milestone node is INCLUDED — a task
  // under one is a milestone task, which is meaningful, and only a milestone
  // CHILD is refused (by `addChildAndTransferNotes`, not by us). The guard is
  // a per-path `seen` set: `goals` is a tree, but a hand-edited or synced file
  // is not obliged to be one, and a cycle here would hang the render.
  function taskParentOptions(nodes, allGoals) {
    const out = [];
    function walk(list, depth, seen) {
      (list || []).forEach(n => {
        if (!n || n.isLink || seen.has(n.id)) return;
        if (isComplete(n, allGoals)) return;
        out.push({ id: n.id, title: n.title || 'Untitled', depth, isMilestone: isMilestoneNode(n) });
        walk(n.children || [], depth + 1, new Set([...seen, n.id]));
      });
    }
    walk(nodes, 0, new Set());
    return out;
  }

  function updateTaskProps(goals, id, props) {
    return goals.map(g =>
      g.id === id
        ? { ...g, ...props }
        : { ...g, children: updateTaskProps(g.children || [], id, props) }
    );
  }

  function findNode(goals, id) {
    for (const g of goals) {
      if (g.id === id) return g;
      if (g.children?.length) { const f = findNode(g.children, id); if (f) return f; }
    }
    return null;
  }

  function resolveLinkedTask(node, allGoals) {
    if (!node?.isLink) return node || null;
    return allGoals ? findNode(allGoals, node.linkedTaskId) : null;
  }

  // Would putting a link to `targetId` under `parentId` make a loop? True
  // when the parent is the target, or can be reached from it through its
  // children and the links among them: the new link would then lead back to
  // itself, and every walker following it would go round forever. This is
  // the ONE test — both link pickers leave such targets out, and both link
  // writers refuse them. It prevents a new loop only; one already stored, or
  // arriving through sync, is still drawn once by the guarded walkers.
  function linkWouldLoop(goals, parentId, targetId) {
    if (parentId == null || targetId == null) return false;
    if (parentId === targetId) return true;
    const start = findNode(goals || [], targetId);
    if (!start) return false;
    const visited = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const n = queue.shift();
      if (n.id === parentId) return true;
      const next = n.isLink ? [findNode(goals || [], n.linkedTaskId)] : (n.children || []);
      for (const c of next) {
        if (c && !visited.has(c)) { visited.add(c); queue.push(c); }
      }
    }
    return false;
  }

  function getSelectableTasks(goals) {
    const out = [];
    function walk(nodes, isTop) {
      for (const n of nodes) {
        if (n.isLink) continue;
        if (isMilestoneNode(n)) { walk(n.children || [], false); continue; }
        if (!isTop && !n.isSubGoal) out.push(n);
        walk(n.children || [], false);
      }
    }
    walk(goals, true);
    return out;
  }

  // `goals` is the whole tree: the loop test needs all of it, so the walk
  // below is an inner function rather than this one recursing on a subtree.
  function addLinkedTask(goals, parentId, linkedTaskId, creations) {
    if (linkWouldLoop(goals, parentId, linkedTaskId)) return goals;
    const nextCreation = creationReader(creations);
    function walk(nodes) {
      return nodes.map(g =>
        g.id === parentId
          ? { ...g, children: [...(g.children || []), { id: nextCreation().id, linkedTaskId, isLink: true }] }
          : { ...g, children: walk(g.children || []) }
      );
    }
    return walk(goals);
  }

  function unlinkTask(goals, linkRefId) {
    return goals
      .filter(g => g.id !== linkRefId)
      .map(g => ({ ...g, children: unlinkTask(g.children || [], linkRefId) }));
  }

  function getSelectableGoals(goals, excludeId) {
    const excluded = new Set();
    function markExcluded(n) { excluded.add(n.id); (n.children||[]).forEach(markExcluded); }
    function findAndMark(nodes) {
      for (const n of nodes) {
        if (n.id === excludeId) { markExcluded(n); return; }
        findAndMark(n.children || []);
      }
    }
    findAndMark(goals);
    const out = [];
    function walk(nodes, depth) {
      for (const n of nodes) {
        if (n.isLink || excluded.has(n.id)) continue;
        if (depth === 0 || n.isSubGoal) out.push({ ...n, _depth: depth === 0 ? 0 : 1 });
        walk(n.children || [], depth + 1);
      }
    }
    walk(goals, 0);
    return out;
  }

  function nestGoalIntoGoal(goals, draggedId, targetId, creations) {
    if (draggedId === targetId) return goals;
    const dragged = goals.find(g => g.id === draggedId);
    if (!dragged) return goals;
    const nextCreation = creationReader(creations);
    return goals
      .filter(g => g.id !== draggedId)
      .map(g => {
        if (g.id !== targetId) return g;
        const existingSubGoals = (g.children || []).filter(c => c.isSubGoal);
        const existingTasks    = (g.children || []).filter(c => !c.isSubGoal);
        const hasData = (g.toLearn || []).length > 0
          || Object.keys(g.mmTargets || {}).length > 0
          || (g.milestones || []).length > 0
          || existingTasks.length > 0;

        if (existingSubGoals.length === 0 && hasData) {
          const { id, now } = nextCreation();
          const originalSubGoal = {
            id,
            title: 'original',
            isSubGoal: true,
            completed: false,
            createdAt: now,
            children: [...existingTasks],
            toLearn: [...(g.toLearn || [])],
            mmTargets: { ...(g.mmTargets || {}) },
            milestones: [...(g.milestones || [])],
            // The quest flags travel with toLearn — see
            // addSubGoalAndMigrateTasks for why leaving them deletes a quest.
            ...TrackQuest.learnFlagsOf(g),
          };
          return {
            ...TrackQuest.withoutLearnFlags(g),
            children: [originalSubGoal, { ...dragged, isSubGoal: true }],
            toLearn: [],
            mmTargets: {},
            milestones: [],
          };
        }

        return { ...g, children: [...(g.children || []), { ...dragged, isSubGoal: true }] };
      });
  }

  function promoteSubGoalToUltimate(goals, subGoalId) {
    let promoted = null;
    function remove(nodes) {
      return nodes
        .filter(n => { if (n.id === subGoalId) { promoted = { ...n, isSubGoal: false }; return false; } return true; })
        .map(n => ({ ...n, children: remove(n.children || []) }));
    }
    const updated = remove(goals);
    return promoted ? [...updated, promoted] : goals;
  }

  function containsId(nodes, id) {
    for (const n of nodes) {
      if (n.id === id) return true;
      if (containsId(n.children || [], id)) return true;
    }
    return false;
  }

  function nestSubGoalIntoSubGoal(goals, draggedId, targetId, creations) {
    if (draggedId === targetId) return goals;
    const draggedNode = (function find(nodes) {
      for (const n of nodes) { if (n.id === draggedId) return n; const f = find(n.children||[]); if (f) return f; }
    })(goals);
    if (draggedNode && containsId(draggedNode.children || [], targetId)) return goals;
    let dragged = null;
    function removeDragged(nodes) {
      return nodes
        .filter(n => { if (n.id === draggedId) { dragged = n; return false; } return true; })
        .map(n => ({ ...n, children: removeDragged(n.children || []) }));
    }
    const withoutDragged = removeDragged(goals);
    if (!dragged) return goals;
    const nextCreation = creationReader(creations);
    function insertIntoTarget(nodes) {
      return nodes.map(n => {
        if (n.id === targetId) {
          const existingSubGoals = (n.children || []).filter(c => c.isSubGoal);
          const existingTasks    = (n.children || []).filter(c => !c.isSubGoal);
          const hasData = (n.toLearn || []).length > 0
            || Object.keys(n.mmTargets || {}).length > 0
            || (n.milestones || []).length > 0
            || existingTasks.length > 0;
          if (existingSubGoals.length === 0 && hasData) {
            const { id, now } = nextCreation();
            const defaultSubGoal = {
              id, title: 'default', isSubGoal: true,
              completed: false, createdAt: now,
              children: [...existingTasks],
              toLearn: [...(n.toLearn || [])],
              mmTargets: { ...(n.mmTargets || {}) },
              milestones: [...(n.milestones || [])],
              // The quest flags travel with toLearn — see
              // addSubGoalAndMigrateTasks for why leaving them deletes a quest.
              ...TrackQuest.learnFlagsOf(n),
            };
            return { ...TrackQuest.withoutLearnFlags(n), children: [defaultSubGoal, { ...dragged, isSubGoal: true }], toLearn: [], mmTargets: {}, milestones: [] };
          }
          return { ...n, children: [...(n.children || []), { ...dragged, isSubGoal: true }] };
        }
        return { ...n, children: insertIntoTarget(n.children || []) };
      });
    }
    return insertIntoTarget(withoutDragged);
  }

  function nestTaskIntoTask(goals, draggedId, targetId) {
    if (draggedId === targetId) return goals;
    const draggedPath = findNodePath(goals, draggedId);
    const targetPath = findNodePath(goals, targetId);
    const draggedNode = draggedPath?.[draggedPath.length - 1];
    const targetNode = targetPath?.[targetPath.length - 1];
    if (isMilestoneNode(draggedNode)) {
      if ((targetPath || []).some(isMilestoneNode)) return goals;
      if (targetNode && parentHasMilestoneChild(targetNode, draggedNode.milestoneId, draggedNode.id, goals)) return goals;
    }
    if (draggedNode && containsId(draggedNode.children || [], targetId)) return goals;
    let dragged = null;
    function removeDragged(nodes) {
      return nodes
        .filter(n => { if (n.id === draggedId) { dragged = n; return false; } return true; })
        .map(n => ({ ...n, children: removeDragged(n.children || []) }));
    }
    const withoutDragged = removeDragged(goals);
    if (!dragged) return goals;
    function insertIntoTarget(nodes) {
      return nodes.map(n => {
        if (n.id === targetId) {
          const existingChildren = n.children || [];
          const targetNotes = n.notes || [];
          const isFirstChild = existingChildren.length === 0 && targetNotes.length > 0;
          const newDragged = isFirstChild
            ? { ...dragged, notes: [...(dragged.notes || []), ...targetNotes] }
            : dragged;
          return {
            ...n,
            children: [...existingChildren, newDragged],
            ...(isFirstChild ? { notes: [] } : {}),
          };
        }
        return { ...n, children: insertIntoTarget(n.children || []) };
      });
    }
    return insertIntoTarget(withoutDragged);
  }

  function reorderSibling(nodes, draggedId, targetId, insertBefore) {
    const di = nodes.findIndex(n => n.id === draggedId);
    const ti = nodes.findIndex(n => n.id === targetId);
    if (di !== -1 && ti !== -1) {
      const arr = [...nodes];
      const [moved] = arr.splice(di, 1);
      const newTi = arr.findIndex(n => n.id === targetId);
      arr.splice(insertBefore ? newTi : newTi + 1, 0, moved);
      return arr;
    }
    return nodes.map(n => ({ ...n, children: reorderSibling(n.children || [], draggedId, targetId, insertBefore) }));
  }

  // As addLinkedTask: a goal linked under its own sub-goal would loop.
  function addLinkedSubGoal(goals, parentId, linkedGoalId, creations) {
    if (linkWouldLoop(goals, parentId, linkedGoalId)) return goals;
    const nextCreation = creationReader(creations);
    function walk(nodes) {
      return nodes.map(g =>
        g.id === parentId
          ? { ...g, children: [...(g.children||[]), { id: nextCreation().id, linkedTaskId: linkedGoalId, isLink: true, isSubGoal: true }] }
          : { ...g, children: walk(g.children||[]) }
      );
    }
    return walk(goals);
  }

  function getMMDescendants(mmId, mms, _visited = new Set()) {
    const children = mms.filter(m => (m.parentIds || []).includes(mmId));
    return children.flatMap(c => {
      if (_visited.has(c.id)) return [];
      _visited.add(c.id);
      return [c.id, ...getMMDescendants(c.id, mms, _visited)];
    });
  }

  // `parentIds` is plural and the canvas pickers let a mind map take its own
  // descendant as a parent, so a cycle is reachable through ordinary use.
  // The guard is per path, as TrackTrueStorage.buildTree's: a mind map
  // already on the branch is not drawn again under itself, while one with
  // two parents is still drawn under both. And a cycle with no root above it
  // is reached from no root at all, so it would vanish from the list — its
  // first member in toLearn order is drawn as a root instead, which keeps
  // every linked mind map on screen.
  function buildToLearnTree(toLearnIds, mms) {
    const set = new Set(toLearnIds);
    const placed = new Set();
    function entry(mm, seen) {
      placed.add(mm.id);
      return { mm, children: buildChildren(mm.id, new Set([...seen, mm.id])) };
    }
    function buildChildren(parentId, seen) {
      return toLearnIds
        .map(id => mms.find(m => m.id === id))
        .filter(mm => mm && !seen.has(mm.id) && (mm.parentIds || []).includes(parentId))
        .map(mm => entry(mm, seen));
    }
    const roots = toLearnIds
      .map(id => mms.find(m => m.id === id))
      .filter(mm => mm && !(mm.parentIds || []).some(pid => set.has(pid)))
      .map(mm => entry(mm, new Set()));
    toLearnIds.forEach(id => {
      if (placed.has(id)) return;
      const mm = mms.find(m => m.id === id);
      if (mm) roots.push(entry(mm, new Set()));
    });
    return roots;
  }

  function expandAnchorToLearn(goals, mms) {
    function walk(nodes) {
      return nodes.map(n => {
        const updated = { ...n, children: walk(n.children || []) };
        const tl = n.toLearn || [];
        if (tl.length === 0) return updated;
        const existing = new Set(tl);
        const extraSet = new Set(existing);
        const extra = tl
          .filter(id => { const mm = mms.find(m => m.id === id); return mm && mm.type === 'anchor'; })
          .flatMap(id => getMMDescendants(id, mms))
          .filter(id => {
            if (extraSet.has(id)) return false;
            extraSet.add(id);
            return true;
          });
        if (extra.length === 0) return updated;
        return { ...updated, toLearn: [...tl, ...extra] };
      });
    }
    return walk(goals);
  }

  // A goal's mind-map targets as [mm, target] pairs — the one reading that
  // the auto-complete test and its ring both use, so the two cannot disagree.
  // It iterates `toLearn`, NEVER Object.entries(mmTargets): those keys are
  // strings and a mind map's id is a NUMBER from nid(), so a key-driven loop
  // compared '10' with 10, found no mind map, and left every such goal
  // undone with its ring at 0/N. A mind map that no longer exists is skipped,
  // as TrackMilestone.statusOf does.
  function mmTargetEntries(goal, mms) {
    const out = [];
    const seen = new Set();
    (goal.toLearn || []).forEach(mmId => {
      if (seen.has(mmId)) return;
      seen.add(mmId);
      const mm = (mms || []).find(m => m.id === mmId);
      if (!mm) return;
      const t = targetOf(mm, (goal.mmTargets || {})[mmId]);
      if (t && (t.stage || t.level || (t.milestones || []).length > 0)) out.push([mm, t]);
    });
    return out;
  }

  // Returns null (no active targets), true (all met), or false (some unmet)
  function computeMMAutoComplete(goal, mms, sirDoneMap) {
    const active = mmTargetEntries(goal, mms);
    if (active.length === 0) return null;
    return active.every(([mm, target]) => isMMTargetMet(mm, target, sirDoneMap));
  }

  global.TrackGoals = {
    MILESTONE_CAL_START, MILESTONE_CAL_END,
    isMilestoneNode,
    isCountableLeaf,
    isComplete,
    getLeaves,
    findNode,
    findNodePath,
    resolveLinkedTask,
    containsId,
    flattenAll,
    parentHasMilestoneChild,
    linkWouldLoop,
    taskParentOptions,
    getSelectableTasks,
    getSelectableGoals,
    mmTargetEntries,
    computeMMAutoComplete,
    buildToLearnTree,
    getMMDescendants,
    expandAnchorToLearn,
    normalizeMilestonePeriod,
    isMilestoneDay,
    periodWithDay,
    withMilestonePeriod,
    toggleLeaf,
    addChild,
    addChildAndTransferNotes,
    addSubGoalAndMigrateTasks,
    deleteNode,
    deleteNodeKeepChildren,
    updateTitle,
    updateDate,
    updateSchedule,
    updateTaskProps,
    addNoteToTask,
    updateNoteInTask,
    removeNoteFromTask,
    addLinkedTask,
    addLinkedSubGoal,
    unlinkTask,
    nestGoalIntoGoal,
    nestSubGoalIntoSubGoal,
    nestTaskIntoTask,
    promoteSubGoalToUltimate,
    reorderSibling,
    addMilestoneType,
    renameMilestoneType,
    deleteMilestoneType,
    reorderMilestoneType,
    updateMilestonePeriod,
  };
})(typeof window !== 'undefined' ? window : globalThis);
