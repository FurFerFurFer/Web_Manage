/* ── graph-layout.js ───────────────────────────────────────────────────────
   The one radial layout for both node canvases.

   Two pages draw a parent/child graph on an SVG canvas: sir-ks02.html's KS03
   multiverse (`mms`) and true-storage.html's storage canvas (`trueStorages`).
   Both records carry the same two fields this module reads — `id` and
   `parentIds` — and nothing else, so one layout serves both.

   It used to be two copies. true-storage.html's canvas was ported from KS03,
   which meant ~120 lines of identical geometry in two files, and a fix to one
   was a fix owed to the other. That is exactly the shape of a bug this project
   has already paid for twice: the deadline caution predicate was spelled out at
   three call sites, one forgot half of it, and the timeline mismarked every due
   day until it was found (AGENTS.md, "Choosable deadline caution period"). The
   same reasoning put the storage tag matcher in true-storage-core.js. So the
   layout lives HERE, once, and each page keeps a one-line delegate.

   CYCLE SAFETY is the load-bearing property. `parentIds` is plural and the
   ConnectionsPicker on both pages lets a user pick any record as a parent —
   including a descendant. A cycle reachable from a root used to recurse until
   the stack gave out, and because that RangeError escapes a React render, the
   page rendered NOTHING: #root empty, KS02 losing CAL/KS02/MG/KS03/KOLB/SRCH
   at once, recoverable only by hand-editing localStorage.

   Both recursions below are therefore guarded, and they agree on one contract,
   the same one TrackTrueStorage.buildTree and SrchView already draw:

       a repeated node is drawn once, and its branch ends there.

   Guarding is not optional and prevention is not a substitute: a cycle can
   already exist in stored data, or arrive from another device through cloud
   sync, so these functions must survive one however it got there.

   Nothing here reads or writes localStorage, and nothing here is a stored
   value — positions computed by this module are a rendering heuristic. It is a
   pure geometry module, like calendar-core.js.

   Loaded as a classic script by sir-ks02.html and true-storage.html.
*/
(function (global) {
  'use strict';

  // Arrays and null are both typeof 'object'.
  function isMap(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  // A deliberate local copy of true-storage-core.js's reader rather than a call
  // into it: this is a defensive type check, not a domain rule, and keeping it
  // here means graph-layout.js has no load-order dependency on that module.
  // It is also strictly safer than the `(m.parentIds||[])` KS02 used to inline,
  // which throws on a non-array truthy value.
  function parentIdsOf(node) {
    return (isMap(node) && Array.isArray(node.parentIds)) ? node.parentIds : [];
  }

  function computeLayerLayout(nodes, layerRadii) {
    if (!Array.isArray(nodes) || !nodes.length) return {};
    if (!Array.isArray(layerRadii) || !layerRadii.length) layerRadii = [0, 180, 340, 500, 660];
    const CX = 360, CY = 260;
    const byId = Object.fromEntries(nodes.map(n => [n.id, n]));

    const childMap = {};
    nodes.forEach(n => {
      childMap[n.id] = childMap[n.id] || [];
      parentIdsOf(n).forEach(pid => {
        if (!byId[pid]) return;
        childMap[pid] = childMap[pid] || [];
        if (!childMap[pid].includes(n.id)) childMap[pid].push(n.id);
      });
    });

    // Bidirectional adjacency to detect disconnected components
    const adj = {};
    nodes.forEach(n => {
      adj[n.id] = adj[n.id] || [];
      parentIdsOf(n).forEach(pid => {
        if (!byId[pid]) return;
        adj[n.id] = adj[n.id] || [];
        adj[pid] = adj[pid] || [];
        if (!adj[n.id].includes(pid)) adj[n.id].push(pid);
        if (!adj[pid].includes(n.id)) adj[pid].push(n.id);
      });
    });

    // BFS to find connected components
    const visited = {}, components = [];
    nodes.forEach(n => {
      if (visited[n.id]) return;
      const comp = [], q = [n.id]; visited[n.id] = true; let h = 0;
      while (h < q.length) {
        const id = q[h++]; comp.push(id);
        (adj[id] || []).forEach(x => { if (!visited[x]) { visited[x] = true; q.push(x); } });
      }
      components.push(comp);
    });

    // Layout one component centered at (cx, cy); writes into pos
    function layoutComponent(compIds, cx, cy, pos) {
      const compSet = new Set(compIds);
      const compNodes = compIds.map(id => byId[id]);
      const roots = compNodes.filter(n => !parentIdsOf(n).some(p => byId[p] && compSet.has(p)));

      const depth = {}, queue = [];
      roots.forEach(r => { depth[r.id] = 0; queue.push(r.id); });
      let head = 0;
      while (head < queue.length) {
        const id = queue[head++];
        (childMap[id] || []).forEach(cid => {
          if (compSet.has(cid) && depth[cid] === undefined) { depth[cid] = depth[id] + 1; queue.push(cid); }
        });
      }
      const maxDepth = Object.values(depth).length ? Math.max(...Object.values(depth)) : 0;
      compNodes.forEach(n => { if (depth[n.id] === undefined) depth[n.id] = maxDepth + 1; });

      // `inProgress` is the cycle guard, and it has to be separate from the
      // memo: leafMemo[id] is only written AFTER the recursive reduce returns,
      // so a node still on the stack is never in it. That is precisely how this
      // recursed forever. A node currently being counted contributes 1 — the
      // repeat is a leaf, which is how buildTree and SrchView already draw one.
      const leafMemo = {}, inProgress = new Set();
      function leafCount(id) {
        if (leafMemo[id] !== undefined) return leafMemo[id];
        if (inProgress.has(id)) return 1;
        inProgress.add(id);
        const ch = (childMap[id] || []).filter(c => compSet.has(c));
        // Memoising a value that was computed through a truncated cycle is
        // deliberate. leafCount only divides an angular span, so the cost is a
        // slightly uneven wedge — never a crash, and never stored data. Skipping
        // the memo here would trade that for O(n^2) on a legal diamond.
        const v = ch.length === 0 ? 1 : ch.reduce((s, c) => s + leafCount(c), 0);
        inProgress.delete(id);
        return (leafMemo[id] = v);
      }

      const LEAF_BRANCH = 150;
      // `path` carries the ids on the branch currently being drawn. It is copied
      // per branch rather than shared across the whole walk, exactly as
      // SrchView.buildTree and TrackTrueStorage.buildTree do, because parentIds
      // is plural: a diamond node legitimately appears under two parents and
      // must still be drawn under both. Only a repeat of the branch's OWN
      // ancestry is a cycle.
      function layout(id, a0, a1, parentPos, path) {
        const d = depth[id] || 0;
        const ch = (childMap[id] || []).filter(c => compSet.has(c));
        const isLeaf = ch.length === 0;
        if (d === 0) {
          pos[id] = { x: cx, y: cy };
        } else if (isLeaf && parentPos) {
          const a = (a0 + a1) / 2;
          pos[id] = { x: parentPos.x + LEAF_BRANCH * Math.cos(a), y: parentPos.y + LEAF_BRANCH * Math.sin(a) };
        } else {
          const r = layerRadii[Math.min(d, layerRadii.length - 1)];
          const a = (a0 + a1) / 2;
          pos[id] = { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
        }
        // The repeat is positioned above, then its branch ENDS here — one node
        // drawn once, no children. Same contract as buildTree.
        if (!ch.length || path.has(id)) return;
        const next = new Set(path); next.add(id);
        const total = ch.reduce((s, c) => s + leafCount(c), 0);
        let cur = a0;
        ch.forEach(cid => { const span = (leafCount(cid) / total) * (a1 - a0); layout(cid, cur, cur + span, pos[id], next); cur += span; });
      }

      if (roots.length === 1) {
        layout(roots[0].id, -Math.PI / 2, 3 * Math.PI / 2, null, new Set());
      } else {
        const total = roots.reduce((s, r) => s + leafCount(r.id), 0) || 1;
        let cur = -Math.PI / 2;
        roots.forEach(r => { const span = (leafCount(r.id) / total) * 2 * Math.PI; layout(r.id, cur, cur + span, null, new Set()); cur += span; });
      }
      // Catch-all: a component with NO roots at all — every node inside one
      // cycle — is laid out by nothing above, because `roots` is empty. Fan the
      // leftovers around the centre instead of stacking them on one point:
      // applyRepulsion cannot separate exactly coincident nodes, since identical
      // coordinates give it no direction to push along, so a stack would stay a
      // stack and the component would render as a single node.
      const leftovers = compNodes.filter(nd => !pos[nd.id]);
      const ring = leftovers.length > 1 ? layerRadii[Math.min(1, layerRadii.length - 1)] : 0;
      leftovers.forEach((nd, i) => {
        const a = (i / leftovers.length) * 2 * Math.PI - Math.PI / 2;
        pos[nd.id] = { x: cx + ring * Math.cos(a), y: cy + ring * Math.sin(a) };
      });
    }

    const pos = {};
    if (components.length === 1) {
      layoutComponent(components[0], CX, CY, pos);
    } else {
      // Estimate radius for each component, then arrange in a grid
      const radii = components.map(comp => {
        const compSet = new Set(comp);
        const maxD = comp.map(id => byId[id]).reduce((mx, n) => {
          let d = 0, cur = n;
          // rough depth: count ancestors. `seen` because this walk is over the
          // same cyclable parent graph as everything else here.
          const seen = new Set();
          while (cur && !seen.has(cur.id)) {
            seen.add(cur.id);
            const pid = parentIdsOf(cur).find(p => byId[p] && compSet.has(p));
            if (!pid) break;
            cur = byId[pid]; d++;
          }
          return Math.max(mx, d);
        }, 0);
        return layerRadii[Math.min(maxD, layerRadii.length - 1)] || layerRadii[layerRadii.length - 1];
      });
      const cols = Math.ceil(Math.sqrt(components.length));
      const rows = Math.ceil(components.length / cols);
      const GAP = 120;
      // cell size based on largest radius in each column/row
      const cellW = Math.max(...radii) * 2 + GAP, cellH = Math.max(...radii) * 2 + GAP;
      const startX = CX - (cols * cellW) / 2 + cellW / 2, startY = CY - (rows * cellH) / 2 + cellH / 2;
      components.forEach((comp, i) => {
        layoutComponent(comp, startX + (i % cols) * cellW, startY + Math.floor(i / cols) * cellH, pos);
      });
    }

    return pos;
  }

  function applyRepulsion(pos, minDist, iterations) {
    if (minDist === undefined) minDist = 90;
    if (iterations === undefined) iterations = 80;
    const ids = Object.keys(pos || {});
    const out = Object.fromEntries(ids.map(id => [id, { ...pos[id] }]));
    for (let k = 0; k < iterations; k++) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = out[ids[i]], b = out[ids[j]];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
          if (dist < minDist) { const push = (minDist - dist) / 2, nx = dx / dist * push, ny = dy / dist * push; a.x -= nx; a.y -= ny; b.x += nx; b.y += ny; }
        }
      }
    }
    return out;
  }

  global.TrackGraphLayout = {
    computeLayerLayout: computeLayerLayout,
    applyRepulsion: applyRepulsion,
    parentIdsOf: parentIdsOf
  };
})(window);
