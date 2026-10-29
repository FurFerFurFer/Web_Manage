/* ── tests/goal-core.test.js ─────────────────────────────────────────────────
   Offline extraction contract. The OLD closure contains VERBATIM function
   copies from progress.html at 1c111c5. Its uid and Date.now are local stubs;
   no page, Git checkout, storage or network is needed to run this file.

   The copies intentionally stay separate from goal-core.js: deriving an
   expected answer from the extracted implementation would test nothing.
   All fixtures are synthetic. Goal ids are strings, mind-map ids NUMBERS.
*/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const F = require('./lib/fixture.js');

globalThis.window = globalThis;
for (const file of ['schema.js', 'quest-core.js', 'milestone-core.js', 'goal-core.js'])
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'scripts', file), 'utf8'), { filename: file });
const G = window.TrackGoals;
const SRC = path.join(__dirname, '..', 'scripts', 'goal-core.js');
const NEW_ID = 'new-record';
const NOW = 1793232000000;
let oldCreations = null;
let oldCreationIndex = 0;

const OLD = (() => {
  const uid = () => oldCreations ? oldCreations[oldCreationIndex++].id : NEW_ID;
  const Date = { now: () => oldCreations ? oldCreations[oldCreationIndex - 1].now : NOW };
  const MILESTONE_CAL_START = "2026-01-01";
  const MILESTONE_CAL_END   = "2033-12-31";
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

    function addMilestoneType(goals, ownerId, title) {
      return goals.map(g => {
        if (g.id === ownerId) {
          return { ...g, milestones: [...(g.milestones || []), { id: uid(), title, createdAt: Date.now() }] };
        }
        return { ...g, children: addMilestoneType(g.children || [], ownerId, title) };
      });
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

    function addLinkedTask(goals, parentId, linkedTaskId) {
      if (linkWouldLoop(goals, parentId, linkedTaskId)) return goals;
      function walk(nodes) {
        return nodes.map(g =>
          g.id === parentId
            ? { ...g, children: [...(g.children || []), { id: uid(), linkedTaskId, isLink: true }] }
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

    function nestGoalIntoGoal(goals, draggedId, targetId) {
      if (draggedId === targetId) return goals;
      const dragged = goals.find(g => g.id === draggedId);
      if (!dragged) return goals;
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
            const originalSubGoal = {
              id: uid(),
              title: 'original',
              isSubGoal: true,
              completed: false,
              createdAt: Date.now(),
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

    function nestSubGoalIntoSubGoal(goals, draggedId, targetId) {
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
              const defaultSubGoal = {
                id: uid(), title: 'default', isSubGoal: true,
                completed: false, createdAt: Date.now(),
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

    function addLinkedSubGoal(goals, parentId, linkedGoalId) {
      if (linkWouldLoop(goals, parentId, linkedGoalId)) return goals;
      function walk(nodes) {
        return nodes.map(g =>
          g.id === parentId
            ? { ...g, children: [...(g.children||[]), { id: uid(), linkedTaskId: linkedGoalId, isLink: true, isSubGoal: true }] }
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

    function computeMMAutoComplete(goal, mms, sirDoneMap) {
      const active = mmTargetEntries(goal, mms);
      if (active.length === 0) return null;
      return active.every(([mm, target]) => isMMTargetMet(mm, target, sirDoneMap));
    }
  return {
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
})();

// ── synthetic inputs and the comparison harness ────────────────────────────

const unknown = () => JSON.parse('{"future":{"keep":[1,"two",null]},"constructor":"own constructor","toString":"own toString"}');
const node = (id, extra = {}) => ({ ...F.task(id), ...unknown(), ...extra });
const block = (id, milestoneId, children = []) => node(id, { taskType: 'milestone', milestoneId, children });
const link = (id, linkedTaskId, extra = {}) => node(id, { isLink: true, linkedTaskId, ...extra });
const note = id => ({ id, content: 'Text ' + id, futureNote: { keep: true } });
const def = (id, extra = {}) => ({ ...F.milestone(id, '2026-10-01', '2026-10-20'), futureMilestone: true, ...extra });
const learn = () => ({ toLearn: [10, 11], mmTargets: { 10: { stage: '3' }, 11: { level: 4 } },
  quest: true, star: true, questLearn: [10, 11], starLearn: [11], milestones: [def('ms1'), def('ms2')] });
const mms = () => [F.mm(10, 'Declarative', { ksStage: '3', type: '1' }),
  F.mm(11, 'Procedural', { rating: 4, ksStage: '1', type: '2' }),
  F.mm(20, 'Anchor', { type: 'anchor' }), F.mm(21, 'Child', { parentIds: [20] }),
  F.mm(22, 'Grandchild', { parentIds: [21] })];
function tree() {
  return [node('g1', { ...learn(), children: [
    node('a', { notes: [note('n1'), note('n2')] }), node('b', { completed: true }),
    node('routine', { taskType: 'routine', routineDates: { '2026-10-29': { time: '12:30', done: true, duration: 45, future: true } } }),
    block('block1', 'ms1', [node('inside')]), block('block2', 'ms2'),
    node('sg', { isSubGoal: true, children: [node('deep')] }),
    link('ref', 't'), link('orphan', 'missing'),
  ] }), node('g2', { ...learn(), notes: [note('g-note')], children: [node('t', { notes: [note('t-note')] })] }),
  node('g3')];
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
}
const timedWriters = new Set(['addMilestoneType', 'nestGoalIntoGoal', 'nestSubGoalIntoSubGoal']);
const linkWriters = new Set(['addLinkedTask', 'addLinkedSubGoal']);
function parity(name, args) {
  const before = structuredClone(args);
  const expected = OLD[name](...structuredClone(args));
  const extras = timedWriters.has(name) || linkWriters.has(name)
    ? [Array.from({ length: G.flattenAll(args[0]).length }, () => ({ id: NEW_ID, now: NOW }))] : [];
  const actual = G[name](...freeze(args), ...freeze(extras));
  assert.deepEqual(actual, expected, name + ': matches the verbatim 1c111c5 function');
  assert.deepEqual(args, before, name + ': does not mutate its inputs');
  return actual;
}
function preservesUnknown(before, after) {
  const originals = new Map(G.flattenAll(before).map(n => [n.id, n]));
  for (const n of G.flattenAll(after)) {
    const orig = originals.get(n.id);
    if (!orig) continue; // Newly created records have their own declared shape.
    for (const key of ['future', 'constructor', 'toString']) {
      assert.equal(Object.hasOwn(n, key), true, n.id + ': owns ' + key);
      assert.deepEqual(n[key], orig[key], n.id + ': preserves ' + key);
    }
  }
}

// Added after the extraction, each pinned below against the inline code it
// replaced: the date input's commit test and its one-bound period move.
const ADDED = ['isMilestoneDay', 'periodWithDay'];

test('exports exactly the requested functions and the two calendar bounds', () => {
  assert.deepEqual(Object.keys(G).sort(), [...Object.keys(OLD), ...ADDED, 'MILESTONE_CAL_START', 'MILESTONE_CAL_END'].sort());
  assert.equal(G.MILESTONE_CAL_START, '2026-01-01');
  assert.equal(G.MILESTONE_CAL_END, '2033-12-31');
});

function codeOnly() {
  return fs.readFileSync(SRC, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
test('the module holds no date code or id minting, so its suite runs once', () => {
  assert.equal(/\bDate\b|\b(?:getDay|getFullYear|getMonth|toISOString|getTimezoneOffset)\s*\(/.test(codeOnly()), false);
  assert.equal(/\b(?:uid|nid|genId|generateId|newId|randomUUID|getRandomValues)\s*\(|Math\s*\.\s*random\s*\(/.test(codeOnly()), false);
});
test('the module touches no storage, DOM or confirmation dialogs', () => {
  assert.equal(/\b(?:localStorage|sessionStorage|indexedDB|document|confirm|TrackStorage)\b/.test(codeOnly()), false);
});

// ── every export compared with its pre-extraction copy ─────────────────────

const readers = {
  isMilestoneNode: g => G.flattenAll(g).map(n => [n]).concat([[null], [undefined]]),
  isCountableLeaf: g => G.flattenAll(g).map(n => [n]),
  isComplete: g => G.flattenAll(g).map(n => [n, g]).concat([[null, g], [node('empty'), null]]),
  getLeaves: g => G.flattenAll(g).map(n => [n, g]).concat([[null, g], [g[0]]]),
  findNode: g => ['g1', 'inside', 'deep', 'missing', 10].map(id => [g, id]),
  findNodePath: g => ['g1', 'inside', 'deep', 'missing'].map(id => [g, id]),
  resolveLinkedTask: g => [[G.findNode(g, 'ref'), g], [G.findNode(g, 'orphan'), g], [g[0], g], [null, g], [G.findNode(g, 'ref')]],
  containsId: g => ['g1', 'inside', 'missing', 10].map(id => [g, id]),
  flattenAll: g => [[g], [[]]],
  parentHasMilestoneChild: g => [[g[0], 'ms1', null, g], [g[0], 'ms1', 'block1', g], [g[0], 'none', null, g], [null, 'ms1']],
  linkWouldLoop: g => [[g, 'a', 'g1'], [g, 'a', 'a'], [g, 'a', 't'], [g, null, 'g1'], [g, 'a', 'missing']],
  taskParentOptions: g => [[g, g], [[], g], [null, g]],
  getSelectableTasks: g => [[g], [[]]],
  getSelectableGoals: g => ['g1', 'sg', 'missing'].map(id => [g, id]),
  mmTargetEntries: g => [[g[0], mms()], [g[2], mms()], [g[0], []]],
  computeMMAutoComplete: g => [[g[0], mms(), {}], [g[2], mms(), {}], [g[0], mms().map(m => ({ ...m, rating: 1, ksStage: '1' })), {}]],
  buildToLearnTree: () => [[[20, 21, 22, 10, 999], mms()], [[], mms()]],
  getMMDescendants: () => [[20, mms()], [22, mms()], [999, mms()]],
  expandAnchorToLearn: g => [[g, mms()], [[node('anchor-owner', { toLearn: [20, 21], children: [node('child', { toLearn: [20] })] })], mms()]],
  normalizeMilestonePeriod: () => [
    [null, null], ['', ''], ['2026-10-20', null], [null, '2026-10-20'], ['2026-10-20', '2026-10-01'],
    ['2025-12-31', '2034-01-01'], ['2026-01-01', '2033-12-31'], ['2026-02-30', '2026-03-01'],
  ],
  withMilestonePeriod: () => [[def('m'), '2026-10-10', '2026-10-21'], [def('m'), null, null], [def('m'), '2026-10-10', null]],
};
for (const [name, cases] of Object.entries(readers)) {
  test('PARITY reader: ' + name, () => {
    for (const args of cases(tree())) parity(name, args);
  });
}

// Each writer gets a successful nested edit and a missing-id path. Every
// surviving node is checked for unknown keys, including constructor, so a
// refactor into a partial allow-list cannot pass behind the parity assertions.
const writers = {
  toggleLeaf: [['a'], ['b'], ['g1'], ['block2']],
  addChild: [['a', node('added')], ['g1', block('dup', 'ms1')]],
  addChildAndTransferNotes: [['a', node('added', { notes: [note('child-note')] })], ['block1', block('bad', 'ms2')]],
  addSubGoalAndMigrateTasks: [['g1', node('new-sg', { isSubGoal: true })], ['g2', node('new-sg', { isSubGoal: true })]],
  deleteNode: [['a'], ['sg']],
  deleteNodeKeepChildren: [['sg'], ['g1']],
  updateTitle: [['a', 'New title'], ['sg', 'New subgoal']],
  updateDate: [['a', '2026-10-30'], ['a', null]],
  updateSchedule: [['a', '2026-10-30', '10:45'], ['routine', '2026-10-29', ''], ['routine', '2026-10-30', null], ['routine', null, null]],
  updateTaskProps: [['a', { duration: 75, taskType: 'routine' }]],
  addNoteToTask: [['a', note('n3')], ['g3', note('n3')]],
  updateNoteInTask: [['a', 'n1', { content: 'Edited' }], ['a', 'none', { content: 'Edited' }]],
  removeNoteFromTask: [['a', 'n1'], ['a', 'none']],
  addLinkedTask: [['a', 't'], ['inside', 'g1']],
  addLinkedSubGoal: [['a', 'g2'], ['deep', 'g1']],
  unlinkTask: [['ref'], ['orphan']],
  nestGoalIntoGoal: [['g3', 'g2'], ['g2', 'g1'], ['g2', 'g3'], ['g1', 'g1']],
  nestSubGoalIntoSubGoal: [['sg', 'g2'], ['sg', 'g1'], ['sg', 'g3'], ['sg', 'deep']],
  nestTaskIntoTask: [['t', 'a'], ['a', 'g3'], ['g1', 'inside']],
  promoteSubGoalToUltimate: [['sg']],
  reorderSibling: [['a', 'b', true], ['a', 'b', false], ['g3', 'g1', true]],
  addMilestoneType: [['sg', 'Nested milestone'], ['g1', 'Third milestone']],
  renameMilestoneType: [['g1', 'ms1', 'Renamed'], ['g1', 'missing-ms', 'Renamed']],
  deleteMilestoneType: [['g1', 'ms1'], ['g1', 'missing-ms']],
  reorderMilestoneType: [['g1', 'ms1', 1], ['g1', 'ms2', -1], ['g1', 'ms1', -1], ['g1', 'missing-ms', 1]],
  updateMilestonePeriod: [['g1', 'ms1', '2026-10-29', '2026-10-01'], ['g1', 'ms1', null, null],
    ['g1', 'ms1', '2026-10-01', '2026-11-01', { today: '2026-10-29', mms: mms(), sirDone: {} }]],
};
for (const [name, cases] of Object.entries(writers)) {
  test('PARITY writer and unknown keys: ' + name, () => {
    for (const tail of [...cases, ['missing-id', ...cases[0].slice(1)]]) {
      const g = tree();
      const actual = parity(name, [g, ...structuredClone(tail)]);
      preservesUnknown(g, actual);
    }
  });
}

test('the parity tables exercise every exported function', () => {
  assert.deepEqual([...Object.keys(readers), ...Object.keys(writers)].sort(), Object.keys(OLD).sort());
});

// ── the data-safety rules the extraction must not disturb ───────────────────

for (const name of ['addSubGoalAndMigrateTasks', 'nestGoalIntoGoal', 'nestSubGoalIntoSubGoal']) {
  test('FLAGS TRAVEL: ' + name + ' moves numeric toLearn flags and removes the old keys', () => {
    const target = node('target', { ...learn(), children: [node('task')] });
    const dragged = node('dragged', { isSubGoal: name !== 'nestGoalIntoGoal' });
    const g = name === 'nestSubGoalIntoSubGoal' ? [node('root', { children: [target, dragged] })] : [target, dragged];
    const args = name === 'addSubGoalAndMigrateTasks' ? [g, 'target', node('new-sg', { isSubGoal: true })] : [g, 'dragged', 'target'];
    const got = parity(name, args);
    const owner = G.findNode(got, 'target');
    const migrated = owner.children[0];
    assert.deepEqual(migrated.toLearn, [10, 11]);
    assert.deepEqual(migrated.questLearn, [10, 11]);
    assert.deepEqual(migrated.starLearn, [11]);
    assert.deepEqual(migrated.mmTargets, target.mmTargets);
    assert.deepEqual(migrated.milestones, target.milestones);
    assert.deepEqual(migrated.children.map(n => n.id), ['task']);
    assert.deepEqual(owner.toLearn, []);
    assert.deepEqual(owner.mmTargets, {});
    assert.deepEqual(owner.milestones, []);
    assert.equal(Object.hasOwn(owner, 'questLearn'), false);
    assert.equal(Object.hasOwn(owner, 'starLearn'), false);
    assert.equal(owner.quest, true);
    assert.equal(owner.star, true);
    if (name !== 'addSubGoalAndMigrateTasks') {
      assert.equal(migrated.title, name === 'nestGoalIntoGoal' ? 'original' : 'default');
      assert.equal(migrated.id, NEW_ID);
      assert.equal(migrated.createdAt, NOW);
      assert.equal(migrated.isSubGoal, true);
      assert.equal(migrated.completed, false);
      assert.equal(owner.children[1].id, 'dragged');
    }
    preservesUnknown(g, got);
  });
}

for (const name of ['nestGoalIntoGoal', 'nestSubGoalIntoSubGoal']) {
  test('AUTO SUBGOAL: ' + name + ' creates one for each data-only shape, never for an empty parent or one with subgoals', () => {
    for (const data of [{ toLearn: [10] }, { mmTargets: { 10: { level: 3 } } }, { milestones: [def('m')] }, { children: [node('task')] }]) {
      const g = [node('target', data), node('dragged')];
      assert.equal(G.findNode(parity(name, [g, 'dragged', 'target']), NEW_ID).createdAt, NOW);
    }
    for (const data of [{}, { ...learn(), children: [node('sub', { isSubGoal: true })] }]) {
      const g = [node('target', data), node('dragged')];
      assert.equal(G.findNode(parity(name, [g, 'dragged', 'target']), NEW_ID), null);
    }
  });
}

for (const name of ['addChild', 'addChildAndTransferNotes', 'nestTaskIntoTask']) {
  test('MILESTONE PLACEMENT: ' + name + ' refuses nesting and duplicate siblings, including a linked block', () => {
    const g = [node('owner', { children: [block('outer', 'm', [node('inside')]),
      node('parent', { children: [link('block-ref', 'outer')] }), node('ordinary')] }), block('moving', 'm')];
    for (const parent of ['outer', 'inside', 'parent']) {
      const args = name === 'nestTaskIntoTask' ? [g, 'moving', parent] : [g, parent, block('new-block', 'm')];
      assert.deepEqual(parity(name, args), g, 'refuses at ' + parent);
    }
    const args = name === 'nestTaskIntoTask' ? [g, 'moving', 'ordinary'] : [g, 'ordinary', block('new-block', 'm')];
    assert.equal(G.findNode(parity(name, args), 'ordinary').children.length, 1, 'an ordinary parent can take a block');
  });
}

test('NOTES: first added child takes parent notes; a later child keeps its own notes', () => {
  const g = [node('parent', { notes: [note('parent-note')] })];
  const child = node('child');
  const once = parity('addChildAndTransferNotes', [g, 'parent', child]);
  assert.deepEqual(once[0].notes, []);
  assert.deepEqual(once[0].children[0].notes, g[0].notes);
  const later = node('second', { notes: [note('own')] });
  const twice = parity('addChildAndTransferNotes', [once, 'parent', later]);
  assert.deepEqual(twice[0].children[1].notes, later.notes);
});

test('NOTES: first nested task keeps its own notes then takes its parent notes, once', () => {
  const g = [node('parent', { notes: [note('parent-note')] }), node('dragged', { notes: [note('own')] })];
  const once = parity('nestTaskIntoTask', [g, 'dragged', 'parent']);
  assert.deepEqual(once[0].notes, []);
  assert.deepEqual(once[0].children[0].notes.map(n => n.id), ['own', 'parent-note']);
  const twice = parity('nestTaskIntoTask', [[...once, node('later')], 'later', 'parent']);
  assert.equal(Object.hasOwn(twice[0].children[1], 'notes'), false);
});

function cyclicLinks() {
  return [node('root', { children: [node('leaf'), link('back', 'root'), link('diamond1', 'shared'), link('diamond2', 'shared')] }),
    node('shared', { completed: true }), link('alias1', 'alias2'), link('alias2', 'alias1'), link('missing-link', 'gone')];
}
test('LINK CYCLES: every goal reader terminates on stored ancestor and alias cycles', () => {
  for (const [name, cases] of Object.entries(readers)) {
    // MM readers and the calendar helpers have no link traversal.
    if (['mmTargetEntries', 'computeMMAutoComplete', 'buildToLearnTree', 'getMMDescendants',
      'expandAnchorToLearn', 'normalizeMilestonePeriod', 'withMilestonePeriod'].includes(name)) continue;
    for (const args of cases(cyclicLinks())) parity(name, args);
  }
  const g = cyclicLinks();
  assert.deepEqual(G.getLeaves(g[0], g).map(n => n.id), ['leaf', 'shared', 'shared'], 'a diamond counts twice; a back edge ends');
  assert.equal(G.isComplete(g[0], g), false);
  assert.deepEqual(G.getLeaves(g[2], g), []);
  assert.equal(G.isComplete(g[2], g), false);
  assert.equal(G.linkWouldLoop(g, 'leaf', 'root'), true);
  assert.equal(G.linkWouldLoop(g, 'shared', 'alias1'), false);
  assert.deepEqual(G.getLeaves(g[4], g), []);
});

for (const name of ['addLinkedTask', 'addLinkedSubGoal']) {
  test('LINK REFUSAL: ' + name + ' refuses a loop before writing and uses the supplied id on success', () => {
    const g = cyclicLinks();
    const unchanged = G[name](g, 'leaf', 'root', []);
    assert.equal(unchanged, g);
    assert.deepEqual(parity(name, [g, 'leaf', 'root']), g);
    const next = parity(name, [g, 'leaf', 'shared']);
    const created = G.findNode(next, 'leaf').children[0];
    assert.equal(created.id, NEW_ID);
    assert.equal(created.linkedTaskId, 'shared');
    assert.equal(created.isLink, true);
    assert.equal(Object.hasOwn(created, 'createdAt'), false);
    assert.equal(!!created.isSubGoal, name === 'addLinkedSubGoal');
  });
}

test('MM IDS: targets follow numeric toLearn, not string mmTargets keys, and dedupe membership', () => {
  const maps = mms();
  const goal = node('goal', { ...learn(), toLearn: [10, 10, 11, 999], mmTargets: {
    10: { stage: '3' }, 11: { stage: 'sir5', level: 4 }, 999: { stage: '1' }, 20: { level: 9 },
  } });
  const active = parity('mmTargetEntries', [goal, maps]);
  assert.deepEqual(active.map(([mm]) => mm.id), [10, 11]);
  assert.deepEqual(active[1][1], { level: 4 }, 'the Procedural phase is read only through TrackMilestone');
  assert.equal(parity('computeMMAutoComplete', [goal, maps, {}]), true);
  assert.deepEqual(parity('mmTargetEntries', [{ ...goal, toLearn: ['10'] }, maps]), [], '10 and string 10 are distinct');
});

test('MM TARGETS: phase-only Procedural targets vanish; a waypoint-only target uses its last waypoint', () => {
  const p = node('p', { toLearn: [11], mmTargets: { 11: { stage: 'sir5' } } });
  assert.equal(parity('computeMMAutoComplete', [p, mms(), {}]), null);
  const d = node('d', { toLearn: [10], mmTargets: { 10: { milestones: [{ milestoneId: 'm1', stage: '1' }, { milestoneId: 'm2', stage: 'sir2' }] } } });
  const maps = [F.mm(10, 'D', { ksStage: 'sir' })];
  assert.equal(parity('computeMMAutoComplete', [d, maps, { 10: 1 }]), false);
  assert.equal(parity('computeMMAutoComplete', [d, maps, { 10: 2 }]), true);
});

test('MM CYCLES: rootless cycles stay reachable and a diamond is drawn on both branches', () => {
  const maps = [F.mm(1, 'A', { type: 'anchor', parentIds: [2] }), F.mm(2, 'B', { parentIds: [1] }),
    F.mm(3, 'C'), F.mm(4, 'D'), F.mm(5, 'Shared', { parentIds: [3, 4] })];
  const built = parity('buildToLearnTree', [[1, 2, 3, 4, 5], maps]);
  assert.deepEqual(built.map(n => n.mm.id), [3, 4, 1]);
  assert.deepEqual(built[2].children.map(n => n.mm.id), [2]);
  assert.deepEqual(built[2].children[0].children, []);
  assert.equal(built[0].children[0].mm.id, 5);
  assert.equal(built[1].children[0].mm.id, 5);
  assert.deepEqual(parity('getMMDescendants', [3, maps]), [5]);
  const expanded = parity('expandAnchorToLearn', [[node('g', { toLearn: [1] })], maps]);
  assert.deepEqual(expanded[0].toLearn, [1, 2]);
});

test('MILESTONE DATES: both bounds, reversed dates, a missing endpoint and clearing preserve their old meaning', () => {
  assert.deepEqual(G.normalizeMilestonePeriod(G.MILESTONE_CAL_END, G.MILESTONE_CAL_START),
    { startDate: '2026-01-01', endDate: '2033-12-31' });
  assert.deepEqual(G.normalizeMilestonePeriod(null, '2026-10-29'), { startDate: '2026-10-29', endDate: '2026-10-29' });
  const cleared = parity('withMilestonePeriod', [def('m'), null, null]);
  assert.equal(Object.hasOwn(cleared, 'startDate'), false);
  assert.equal(Object.hasOwn(cleared, 'endDate'), false);
  assert.equal(cleared.futureMilestone, true);
});

test('SLIPS: late moves and clearing still delegate to TrackMilestone with the original baseline', () => {
  const g = [node('g', { milestones: [def('m', { endDate: '2026-10-20' })], children: [block('b', 'm', [node('open')])] })];
  const slip = { today: '2026-10-29', mms: [], sirDone: {} };
  const moved = parity('updateMilestonePeriod', [g, 'g', 'm', '2026-10-01', '2026-11-01', slip]);
  assert.deepEqual(moved[0].milestones[0].slips, [{ from: '2026-10-20', to: '2026-11-01', on: '2026-10-29' }]);
  const baseline = { endDate: '2026-10-20', overdue: true };
  const cleared = parity('updateMilestonePeriod', [moved, 'g', 'm', null, null, { ...slip, baseline }]);
  assert.deepEqual(cleared[0].milestones[0].slips, [{ from: '2026-10-20', on: '2026-10-29' }]);
  const restored = parity('updateMilestonePeriod', [cleared, 'g', 'm', '2026-10-01', '2026-10-20', { ...slip, baseline }]);
  assert.equal(Object.hasOwn(restored[0].milestones[0], 'slips'), false);
});

test('REFERENCE BEHAVIOR: refusals still return the original tree, and ordinary recursive misses still copy it', () => {
  const g = tree();
  for (const name of ['nestGoalIntoGoal', 'nestSubGoalIntoSubGoal', 'nestTaskIntoTask'])
    assert.equal(G[name](g, 'g1', 'g1', []), g);
  assert.equal(G.promoteSubGoalToUltimate(g, 'missing'), g);
  assert.equal(G.findNode(g, 'a'), g[0].children[0]);
  const missed = G.updateTitle(g, 'missing', 'ignored');
  assert.notEqual(missed, g);
  assert.deepEqual(missed, g);
});

// Caller-supplied creation records replace uid()/Date.now(), but must not
// change what repeated target ids create. Fresh records for EACH match keep
// this extraction exact even on a malformed tree. The local OLD stubs are
// deterministic here too, stepping through the same inputs in the old order.
for (const name of [...timedWriters, ...linkWriters]) {
  test('CREATION INPUTS: ' + name + ' preserves per-match ids and times, including duplicate target ids', () => {
    const g = [node('target', learn()), node('target', learn()), node('dragged')];
    const tail = name === 'addMilestoneType' ? ['target', 'New milestone']
      : linkWriters.has(name) ? ['target', 'dragged'] : ['dragged', 'target'];
    const creations = freeze([{ id: 'new-first', now: NOW }, { id: 'new-second', now: NOW + 7 }]);
    oldCreations = creations;
    oldCreationIndex = 0;
    let expected;
    try { expected = OLD[name](...structuredClone([g, ...tail])); }
    finally { oldCreations = null; oldCreationIndex = 0; }
    const got = G[name](...freeze([g, ...tail]), creations);
    assert.deepEqual(got, expected);
    const created = name === 'addMilestoneType'
      ? got.filter(n => n.id === 'target').flatMap(n => n.milestones.filter(m => m.id.startsWith('new-')))
      : G.flattenAll(got).filter(n => n.id.startsWith('new-'));
    assert.deepEqual(created.map(n => n.id), ['new-first', 'new-second']);
    if (timedWriters.has(name)) assert.deepEqual(created.map(n => n.createdAt), [NOW, NOW + 7]);
    assert.deepEqual(creations, [{ id: 'new-first', now: NOW }, { id: 'new-second', now: NOW + 7 }]);
  });
}

test('CREATION INPUTS: unused preallocations are harmless and refused branches read none', () => {
  const g = tree();
  const unread = new Proxy([], { get() { throw new Error('a refusal read a creation input'); } });
  for (const name of ['addLinkedTask', 'addLinkedSubGoal']) assert.equal(G[name](g, 'a', 'g1', unread), g);
  for (const name of ['nestGoalIntoGoal', 'nestSubGoalIntoSubGoal']) {
    assert.equal(G[name](g, 'g1', 'g1', unread), g);
    assert.equal(G.findNode(G[name](g, 'g2', 'g3', unread), 'g2').isSubGoal, true, 'an empty target creates no automatic subgoal');
  }
  assert.deepEqual(G.addMilestoneType(g, 'missing', 'Ignored', unread), g);
  const creations = freeze([{ id: NEW_ID, now: NOW }, { id: 'unused', now: NOW + 1 }]);
  assert.deepEqual(G.addMilestoneType(g, 'sg', 'Added', creations), OLD.addMilestoneType(g, 'sg', 'Added'));
});

// ── pre-existing edge behavior, recorded rather than fixed by this move ────

for (const name of ['nestGoalIntoGoal', 'nestSubGoalIntoSubGoal', 'nestTaskIntoTask']) {
  test('EXISTING EDGE: ' + name + ' drops the dragged node when the target is missing', () => {
    const g = [node('dragged'), node('keep')];
    assert.deepEqual(parity(name, [g, 'dragged', 'missing']).map(n => n.id), ['keep']);
  });
}
test('EXISTING EDGE: adding a first child replaces that child\'s pre-existing notes', () => {
  const g = [node('parent', { notes: [note('parent-note')] })];
  const got = parity('addChildAndTransferNotes', [g, 'parent', node('child', { notes: [note('child-note')] })]);
  assert.deepEqual(got[0].children[0].notes.map(n => n.id), ['parent-note']);
});
test('EXISTING EDGE: normalizeMilestonePeriod checks bounds, not whether a day exists', () => {
  assert.deepEqual(parity('normalizeMilestonePeriod', ['2026-02-30', null]), { startDate: '2026-02-30', endDate: '2026-02-30' });
});
test('EXISTING EDGE: getMMDescendants includes its starting id when a cycle leads back to it', () => {
  const maps = [F.mm(1, 'A', { parentIds: [2] }), F.mm(2, 'B', { parentIds: [1] })];
  assert.deepEqual(parity('getMMDescendants', [1, maps]), [2, 1]);
});
test('EXISTING EDGE: reordering a node before itself can change its position', () => {
  const g = [node('a'), node('b'), node('c')];
  assert.deepEqual(parity('reorderSibling', [g, 'a', 'a', true]).map(n => n.id), ['b', 'a', 'c']);
});

for (const name of ['addSubGoalAndMigrateTasks', 'nestGoalIntoGoal', 'nestSubGoalIntoSubGoal']) {
  test('EXISTING EDGE: ' + name + ' inherits TrackQuest.withoutLearnFlags losing an own __proto__ key', () => {
    const target = node('target', { ...learn(), ...JSON.parse('{"__proto__":{"future":true}}') });
    const g = [target, node('dragged')];
    const args = name === 'addSubGoalAndMigrateTasks' ? [g, 'target', node('new-sub')] : [g, 'dragged', 'target'];
    assert.equal(Object.hasOwn(target, '__proto__'), true);
    const got = parity(name, args);
    assert.equal(Object.hasOwn(G.findNode(got, 'target'), '__proto__'), false,
      'already lost by Object.assign in the dependency; not repaired in this extraction');
    preservesUnknown(g, got);
  });
}

test('UNKNOWN KEYS: other tree writers preserve an own __proto__ key as well', () => {
  const transfer = new Set(['addSubGoalAndMigrateTasks', 'nestGoalIntoGoal', 'nestSubGoalIntoSubGoal']);
  for (const [name, cases] of Object.entries(writers)) {
    if (transfer.has(name)) continue;
    const g = tree();
    for (const n of G.flattenAll(g)) Object.defineProperty(n, '__proto__', { value: { keep: n.id }, enumerable: true });
    const got = parity(name, [g, ...structuredClone(cases[0])]);
    const originals = new Set(G.flattenAll(g).map(n => n.id));
    for (const n of G.flattenAll(got)) {
      if (!originals.has(n.id)) continue;
      assert.equal(Object.hasOwn(n, '__proto__'), true, name + ': ' + n.id);
      assert.deepEqual(n.__proto__, { keep: n.id });
    }
  }
});

// ── the two date-input rules both pages now share ───────────────────────────
// Verbatim from progress.html at 1c111c5: MilestoneDateInput's onChange test
// (less its `v !== value` no-op guard, which stays at the input) and
// MilestonesPanel.handleDateInput's period arithmetic.
const OLD_DATE = (() => {
  const MILESTONE_CAL_START = "2026-01-01";
  const MILESTONE_CAL_END   = "2033-12-31";
  const commits = v => TrackSchema.isDay(v) && v >= MILESTONE_CAL_START && v <= MILESTONE_CAL_END;
  function period(milestone, field, value) {
    let startDate = field === 'start' ? value || null : milestone.startDate || null;
    let endDate = field === 'end' ? value || null : milestone.endDate || null;
    if (field === 'start' && value && endDate && value > endDate) endDate = value;
    if (field === 'end' && value && startDate && value < startDate) startDate = value;
    return { startDate, endDate };
  }
  return { commits, period };
})();

test('isMilestoneDay commits exactly what the inline date input committed', () => {
  const values = ['', null, undefined, 20260101, '2026-1-01', '0002-03-04', '0020-03-04', '0202-03-04',
    '2025-12-31', '2026-01-01', '2026-02-28', '2026-02-29', '2028-02-29', '2026-02-30', '2026-13-01',
    '2033-12-31', '2034-01-01', ' 2026-03-01', '2026-03-01T00:00'];
  for (const v of values) assert.equal(G.isMilestoneDay(v), OLD_DATE.commits(v), JSON.stringify(v));
  assert.equal(G.isMilestoneDay('2026-03-01'), true);
  assert.equal(G.isMilestoneDay('0202-03-01'), false, 'a year segment on its way to 2026 never commits');
  assert.equal(G.isMilestoneDay(''), false, 'emptying a field never commits — clear is the button');
});

test('periodWithDay moves the other bound exactly as the inline handler did', () => {
  const ms = [{}, { startDate: '2026-03-01' }, { endDate: '2026-03-10' },
    { startDate: '2026-03-01', endDate: '2026-03-10' }, { startDate: '2026-03-05', endDate: '2026-03-05' }];
  const days = ['2026-02-20', '2026-03-01', '2026-03-05', '2026-03-10', '2026-03-20', ''];
  for (const m of ms) for (const field of ['start', 'end']) for (const v of days)
    assert.deepEqual(G.periodWithDay(m, field, v), OLD_DATE.period(m, field, v), JSON.stringify([m, field, v]));
  assert.deepEqual(G.periodWithDay({ startDate: '2026-03-01', endDate: '2026-03-10' }, 'start', '2026-03-20'),
    { startDate: '2026-03-20', endDate: '2026-03-20' }, 'a start past the end drags the end');
  assert.deepEqual(G.periodWithDay(null, 'end', '2026-03-10'), { startDate: null, endDate: '2026-03-10' },
    'total on a missing milestone');
});
