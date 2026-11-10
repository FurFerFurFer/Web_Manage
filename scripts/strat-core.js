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

   And one the user added on 2026-11-10, for a STRAT whose detail lives in a
   mind map BELOW the one it is meant for (ICS's strategy, written out in the
   mind map "ICS strategy" two levels under ICS):

   - A STRAT MAY SPREAD FROM A MIND MAP ABOVE IT. `strat.originId` names that
     mind map — its ORIGIN. The STRAT is still written, edited and deleted in
     the mind map that holds it (the WRITER), but it spreads from the origin
     ALONE: the origin and everything under the origin show it, and the
     writer's own descendants see it only because they are under the origin
     too. It takes the origin's one STRAT, so a mind map that already has a
     STRAT — its own, or one spreading from it — cannot be chosen, and a
     mind map one spreads from cannot add its own.

         strat { text, createdAt, updatedAt, originId? }

     Absence is the default — it spreads from the writer — and unlinking
     DELETES the key, never null. The link is ONE hop: an origin's own STRAT
     being linked somewhere else does not carry this one further, so no
     chain is followed and no chain can loop. It is READ as stored, never
     repaired: a writer moved out from under its origin keeps spreading from
     it (the user's choice), and an origin that names nothing — deleted —
     reads as no link, so the STRAT spreads from the writer again until the
     key is cleared by hand.

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

  // Ids are looked up in a Map, never an object: a mind map's id is a NUMBER
  // from KS02's nid(), and an object key would make 10 and '10' one id. A
  // record that is not an object or has no id is skipped. When ids are
  // duplicated the FIRST record is read, as progress.html's `mms.find` does.
  function indexOf(mms) {
    var byId = new Map();
    mms.forEach(function (m) {
      if (isMap(m) && m.id !== undefined && m.id !== null && !byId.has(m.id)) byId.set(m.id, m);
    });
    return byId;
  }

  // Every mind map above `self`, nearest first:  [{ mm, depth }].
  //
  // The walk is breadth-first over `parentIds`, and `seen` is the cycle
  // guard: a mind map is marked when it is QUEUED, so a parent cycle — which
  // the connections picker lets a user build — ends the walk rather than the
  // stack, and the start can never come back as its own ancestor. Breadth
  // first also gives each ancestor its SHORTEST distance, so a diamond is
  // counted once, at the nearer depth. getAncestors in sir-ks02.html has the
  // same shape; ties keep breadth-first order, which is `parentIds` order. A
  // `parentIds` that is not a list and a parent id that names no mind map
  // are skipped.
  function ancestorsOf(self, byId) {
    var seen = new Set([self.id]);
    var queue = [{ mm: self, depth: 0 }];
    for (var i = 0; i < queue.length; i++) {
      var node = queue[i];
      var pids = isList(node.mm.parentIds) ? node.mm.parentIds : [];
      pids.forEach(function (pid) {
        if (seen.has(pid) || !byId.has(pid)) return;
        seen.add(pid);
        queue.push({ mm: byId.get(pid), depth: node.depth + 1 });
      });
    }
    return queue.slice(1);
  }

  // The `originId` a mind map's STRAT CARRIES, as stored, or undefined. Only
  // a STRAT that has text carries one, and only a record can: a bare string
  // has nowhere to keep it. null reads as absent, like undefined.
  function originIdOf(mm) {
    if (!stratText(mm) || !isMap(mm.strat)) return undefined;
    var o = mm.strat.originId;
    return o === null ? undefined : o;
  }

  // The mind map a STRAT spreads FROM: its origin when it names one that is
  // stored and is not the writer itself, else the writer. One hop — the
  // origin's own link is never followed.
  function hostOf(mm, byId) {
    var o = originIdOf(mm);
    if (o === undefined || o === mm.id) return mm;
    var h = byId.get(o);
    return h || mm;
  }

  // Every STRAT that applies to `mmId`, in the order both pages draw them:
  // the ones spreading from above first, FARTHEST first, then its own last —
  // general to specific, which puts the one the panel edits where its add
  // box was.
  //
  //     [{ mm, text, own, depth, origin, hosted }]
  //
  //   mm      the mind map the STRAT is WRITTEN on — the one it came from,
  //           whose name every surface draws
  //   own     written on `mmId` itself: the one its panel may edit
  //   depth   how far above `mmId` it spreads from; 0 is `mmId` itself
  //   origin  the mind map it spreads from when that is not `mm`, else null
  //   hosted  it spreads from `mmId` but is written on another mind map —
  //           the origin's view of a linked STRAT, and what takes its slot
  //
  // A STRAT applies when the mind map it spreads from is `mmId` or above it.
  // Equal depths keep the walk's order; at one mind map, the STRAT written
  // there comes before any spreading from it, then those in `mms` order.
  // The mind map's own STRAT is ALWAYS listed, last, wherever it spreads
  // from: it is the one its panel edits, unlinks and deletes, so a writer
  // moved out from under its origin must still reach it.
  function stratsFor(mmId, mms) {
    if (!isList(mms)) return [];
    var byId = indexOf(mms);
    var self = byId.get(mmId);
    if (!self) return [];
    var place = new Map([[self.id, { depth: 0, order: 0 }]]);
    ancestorsOf(self, byId).forEach(function (n, i) { place.set(n.mm.id, { depth: n.depth, order: i + 1 }); });
    var found = [];
    var written = 0;
    byId.forEach(function (w) {
      written++;
      if (w === self) return;
      var t = stratText(w);
      if (!t) return;
      var host = hostOf(w, byId);
      var at = place.get(host.id);
      if (!at) return;
      found.push({
        entry: { mm: w, text: t, own: false, depth: at.depth, origin: host === w ? null : host, hosted: host === self },
        key: [-at.depth, at.order, host === w ? 0 : 1, written]
      });
    });
    found.sort(function (a, b) {
      for (var k = 0; k < a.key.length; k++) if (a.key[k] !== b.key[k]) return a.key[k] - b.key[k];
      return 0;
    });
    var out = found.map(function (f) { return f.entry; });
    var own = stratText(self);
    if (own) {
      var h = hostOf(self, byId);
      out.push({ mm: self, text: own, own: true, depth: 0, origin: h === self ? null : h, hosted: false });
    }
    return out;
  }

  // Where a mind map's OWN STRAT spreads from, for the panel that edits it:
  //
  //     null                                  no STRAT, or no link stored
  //     { originId, origin, lost, above }
  //
  //   originId  as stored
  //   origin    the mind map it names, or null when it names nothing
  //   lost      it names nothing (deleted) or names the writer itself, so the
  //             STRAT spreads from the writer until the key is cleared
  //   above     the origin is still above the writer. False after a move —
  //             it keeps spreading from there all the same (the user's
  //             choice), and the panel says so
  function stratLink(mmId, mms) {
    if (!isList(mms)) return null;
    var byId = indexOf(mms);
    var self = byId.get(mmId);
    if (!self) return null;
    var o = originIdOf(self);
    if (o === undefined) return null;
    var host = hostOf(self, byId);
    if (host === self) return { originId: o, origin: null, lost: true, above: false };
    var above = ancestorsOf(self, byId).some(function (n) { return n.mm === host; });
    return { originId: o, origin: host, lost: false, above: above };
  }

  // Is some OTHER mind map's STRAT spreading from `target`? The first such
  // writer, in `mms` order, or null.
  function hostedBy(target, byId) {
    var by = null;
    byId.forEach(function (w) {
      if (by || w === target || !stratText(w)) return;
      if (hostOf(w, byId) === target) by = w;
    });
    return by;
  }

  // Why the STRAT on `mmId` may NOT spread from `originId`, or null when it
  // may. The picker greys a row by this and the writer refuses by it — one
  // test, so a row that lights up is a row the write accepts.
  //
  //     { code, by? }
  //
  //   none       `mmId` has no STRAT of its own to spread
  //   self       `originId` is `mmId`
  //   missing    `originId` names no mind map
  //   not-above  `originId` is not above `mmId` — only a mind map above may
  //              be chosen; one that was above and is no longer keeps its
  //              link, but cannot be chosen anew
  //   own        `originId` has a STRAT of its own (`by` is that mind map)
  //   taken      another mind map's STRAT already spreads from `originId`
  //              (`by` is that mind map)
  //
  // Choosing the origin it already spreads from is not refused; the writer
  // writes nothing for it.
  function linkRefusal(mms, mmId, originId) {
    if (!isList(mms)) return { code: 'none' };
    var byId = indexOf(mms);
    var self = byId.get(mmId);
    // A bare string reads as a STRAT but has nowhere to keep a link; an edit
    // (✎) turns it into a record, and then it may spread.
    if (!self || !stratText(self) || !isMap(self.strat)) return { code: 'none' };
    if (originId === self.id) return { code: 'self' };
    var target = byId.get(originId);
    if (!target) return { code: 'missing' };
    if (!ancestorsOf(self, byId).some(function (n) { return n.mm === target; })) return { code: 'not-above' };
    if (stratText(target)) return { code: 'own', by: target };
    var by = hostedBy(target, byId);
    if (by && by !== self) return { code: 'taken', by: by };
    return null;
  }

  // The picker's rows: every mind map above `mmId`, nearest first, each with
  // the refusal the writer would give it.   [{ mm, depth, refusal }]
  function linkChoices(mmId, mms) {
    if (!isList(mms)) return [];
    var byId = indexOf(mms);
    var self = byId.get(mmId);
    if (!self) return [];
    return ancestorsOf(self, byId).map(function (n) {
      return { mm: n.mm, depth: n.depth, refusal: linkRefusal(mms, mmId, n.mm.id) };
    });
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
  // heard of, on the record and on the mind map — `originId` included, so an
  // edit never unlinks. A value that is not a record (a bare string, a
  // number) is replaced by a proper one, created `now`. Every record with
  // this id is written, as KS02's own setMms maps are.
  //
  // CREATING one is refused on a mind map another mind map's STRAT spreads
  // from: that STRAT is its one, and its panel draws no add box. The writer
  // refuses too, so a box drawn by a stale render cannot make a second.
  function withStrat(mms, mmId, text, now) {
    if (!isList(mms)) return mms;
    var t = str(text).trim();
    if (!t) return mms;
    var byId = indexOf(mms);
    var self = byId.get(mmId);
    if (self && !stratText(self) && hostedBy(self, byId)) return mms;
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

  // Make the STRAT on `mmId` spread from `originId`. REFUSED — the input
  // comes back — whenever linkRefusal gives a reason, so the writer is the
  // guard and the picker only asks it. Nothing else on the record moves:
  // not `text`, not `createdAt`, not `updatedAt` (a link is not an edit of
  // the words), and no key this version has not heard of. Already spreading
  // from there writes nothing.
  function withStratOrigin(mms, mmId, originId) {
    if (!isList(mms) || linkRefusal(mms, mmId, originId)) return mms;
    var changed = false;
    var next = mms.map(function (m) {
      if (!isMap(m) || m.id !== mmId || !isMap(m.strat) || m.strat.originId === originId) return m;
      changed = true;
      return Object.assign({}, m, { strat: Object.assign({}, m.strat, { originId: originId }) });
    });
    return changed ? next : mms;
  }

  // Stop the STRAT on `mmId` spreading from another mind map: it spreads
  // from `mmId` again. The KEY goes — never null — because absence is the
  // one spelling of "no link". Nothing is deleted with it: the STRAT, its
  // text and its times stay, so linking again restores exactly what this
  // took away. Returns the input when no record with this id has the key.
  function withoutStratOrigin(mms, mmId) {
    if (!isList(mms)) return mms;
    var changed = false;
    var next = mms.map(function (m) {
      if (!isMap(m) || m.id !== mmId || !isMap(m.strat) || !Object.prototype.hasOwnProperty.call(m.strat, 'originId')) return m;
      changed = true;
      var s = Object.assign({}, m.strat);
      delete s.originId;
      return Object.assign({}, m, { strat: s });
    });
    return changed ? next : mms;
  }

  global.TrackStrat = {
    stratText: stratText,
    stratsFor: stratsFor,
    stratLink: stratLink,
    linkRefusal: linkRefusal,
    linkChoices: linkChoices,
    withStrat: withStrat,
    withoutStrat: withoutStrat,
    withStratOrigin: withStratOrigin,
    withoutStratOrigin: withoutStratOrigin
  };
})(window);
