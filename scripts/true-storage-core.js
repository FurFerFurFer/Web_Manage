/* ── true-storage-core.js ──────────────────────────────────────────────────
   The one definition of the storage↔source-dump relationship.

   A storage (slot field `trueStorages`) may carry tags, and each tag names a
   pair: one source-dump LEAF and one MM linked inside it.

       { id, dumpId, mmId }

   Two pages act on that pair. true-storage.html authors the tags; sir-ks02.html
   renders the storages back inside the dump — and it renders them at FOUR
   sites, because an mmLink's content is drawn in four places: the source-dump
   leaf card, the MM detail S&C tab for a leaf MM, the same tab for a non-leaf
   MM, and DescendantSCNode.

   That is exactly the shape of a bug this project has already paid for. The
   deadline caution predicate was spelled out at three call sites, one of them
   forgot `d.date !== ds`, and the timeline double-marked every due day until it
   was found (AGENTS.md, "Choosable deadline caution period"). So the comparison
   lives HERE, once, and no call site re-spells it:

       TrackTrueStorage.storagesForLink(storages, dumpId, mmId)

   The two writers are pure functions for the same reason: both pages create and
   remove tags, and a tag record has one shape whichever page made it.

   Nothing here reads or writes localStorage. It is a pure data module, like
   calendar-core.js — the pages own persistence, and both of them go through
   TrackStorage.saveDB.

   NOT to be confused with TrackStorage (storage-guard.js), which is the
   localStorage quota guard. This one is TrackTrueStorage.

   Loaded as a classic script by true-storage.html and sir-ks02.html.
*/
(function (global) {
  'use strict';

  function isList(v) { return Array.isArray(v); }

  // Arrays and null are both typeof 'object'.
  function isMap(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  // ── defensive readers ────────────────────────────────────────────────────
  // schema.js validates that `trueStorages` is a list of objects and stops
  // there, deliberately — `mms` carries the identical `parentIds` shape and is
  // not validated either, so gating one and not the other would invent an
  // inconsistent rule. The cost of that choice is paid here instead: every
  // nested list is read through a helper that cannot throw.

  function parentIdsOf(storage) {
    return (isMap(storage) && isList(storage.parentIds)) ? storage.parentIds : [];
  }

  function tagsOf(storage) {
    return (isMap(storage) && isList(storage.tags)) ? storage.tags : [];
  }

  function listOf(storages) {
    return isList(storages) ? storages.filter(isMap) : [];
  }

  // ── the one matcher ──────────────────────────────────────────────────────

  // Ids are compared with === and never coerced. `dumpId` and `mmId` come from
  // sir-ks02.html's numeric nid() counter and JSON.parse gives them back as
  // numbers, so both sides of every comparison are already the same type — as
  // long as no caller routes an id through a DOM dataset, which stringifies.
  function tagMatches(tag, dumpId, mmId) {
    return isMap(tag) && tag.dumpId === dumpId && tag.mmId === mmId;
  }

  // Every storage tagged to this (leaf dump, MM) pair, in stored order.
  function storagesForLink(storages, dumpId, mmId) {
    return listOf(storages).filter(function (s) {
      return tagsOf(s).some(function (t) { return tagMatches(t, dumpId, mmId); });
    });
  }

  function hasTag(storages, storageId, dumpId, mmId) {
    return listOf(storages).some(function (s) {
      return s.id === storageId &&
        tagsOf(s).some(function (t) { return tagMatches(t, dumpId, mmId); });
    });
  }

  // Every (dumpId, mmId) pair this storage is tagged to. Used by the pickers to
  // grey out a pair that is already tagged.
  function tagPairs(storage) {
    return tagsOf(storage).map(function (t) { return { dumpId: t.dumpId, mmId: t.mmId }; });
  }

  // ── the two writers ──────────────────────────────────────────────────────
  // Pure: a new array is returned and `storages` is never mutated, so a caller
  // can hand the result straight to setState or to a single-key save. Both
  // return the ORIGINAL array reference when nothing changed, which lets a
  // caller skip a needless write and the sync upload it would arm.

  function withTag(storages, storageId, dumpId, mmId, newId) {
    if (!isList(storages)) return storages;
    if (hasTag(storages, storageId, dumpId, mmId)) return storages;
    var found = false;
    var next = storages.map(function (s) {
      if (!isMap(s) || s.id !== storageId) return s;
      found = true;
      // Spread, never rebuild: a storage may carry keys this version has never
      // heard of, and normalizeSlot deliberately preserves them.
      return Object.assign({}, s, {
        tags: tagsOf(s).concat([{ id: newId, dumpId: dumpId, mmId: mmId }])
      });
    });
    return found ? next : storages;
  }

  // Remove by (dump, MM) pair rather than by tag id. sir-ks02.html untags from
  // a chip drawn next to that pair and has no tag id in hand; making it dig one
  // out would put the comparison back at a call site, which is the whole thing
  // this module exists to prevent.
  function withoutPair(storages, storageId, dumpId, mmId) {
    if (!isList(storages)) return storages;
    var changed = false;
    var next = storages.map(function (s) {
      if (!isMap(s) || s.id !== storageId) return s;
      var kept = tagsOf(s).filter(function (t) { return !tagMatches(t, dumpId, mmId); });
      if (kept.length === tagsOf(s).length) return s;
      changed = true;
      return Object.assign({}, s, { tags: kept });
    });
    return changed ? next : storages;
  }

  function withoutTag(storages, storageId, tagId) {
    if (!isList(storages)) return storages;
    var changed = false;
    var next = storages.map(function (s) {
      if (!isMap(s) || s.id !== storageId) return s;
      var kept = tagsOf(s).filter(function (t) { return !isMap(t) || t.id !== tagId; });
      if (kept.length === tagsOf(s).length) return s;
      changed = true;
      return Object.assign({}, s, { tags: kept });
    });
    return changed ? next : storages;
  }

  // Move every tag naming `fromDumpId` onto `toDumpId`, across all storages.
  //
  // This exists because adding a sub-title under a source-dump leaf MOVES that
  // leaf's mmLinks down to the new child and empties the parent's (KS02's
  // addDumpEntry). The content the tag names is still there, one level down —
  // so the tag follows it. Without this the pair stops resolving and the row
  // renders as "source removed", which is honest but tells the user nothing
  // about where their content went.
  //
  // The mmId half is deliberately untouched: the MM sections moved wholesale,
  // so only the dump half of the pair changed. Tag ids are preserved too — this
  // is the same record pointing somewhere new, not a replacement.
  function repointDump(storages, fromDumpId, toDumpId) {
    if (!isList(storages)) return storages;
    if (fromDumpId === toDumpId) return storages;
    var changed = false;
    var next = storages.map(function (s) {
      if (!isMap(s)) return s;
      var tags = tagsOf(s);
      var hit = false;
      var moved = tags.map(function (t) {
        if (!isMap(t) || t.dumpId !== fromDumpId) return t;
        hit = true;
        return Object.assign({}, t, { dumpId: toDumpId });
      });
      if (!hit) return s;
      changed = true;
      return Object.assign({}, s, { tags: moved });
    });
    return changed ? next : storages;
  }

  // ── tree ─────────────────────────────────────────────────────────────────

  // The nested-by-parent/child tree both views render, ported from SrchView in
  // sir-ks02.html. `seen` guards a parent cycle: without it a storage that is
  // its own ancestor recurses until the stack gives out.
  function buildTree(storages) {
    var list = listOf(storages);
    var byId = Object.create(null);
    list.forEach(function (s) { byId[s.id] = s; });

    function node(storage, seen) {
      if (seen[storage.id]) return { storage: storage, children: [] };
      var next = Object.assign(Object.create(null), seen);
      next[storage.id] = true;
      var kids = list.filter(function (s) { return parentIdsOf(s).indexOf(storage.id) >= 0; });
      return {
        storage: storage,
        children: kids.map(function (k) { return node(k, next); })
      };
    }

    var roots = list.filter(function (s) {
      return !parentIdsOf(s).some(function (pid) { return !!byId[pid]; });
    });
    return roots.map(function (s) { return node(s, Object.create(null)); });
  }

  global.TrackTrueStorage = {
    storagesForLink: storagesForLink,
    hasTag: hasTag,
    tagPairs: tagPairs,
    withTag: withTag,
    withoutTag: withoutTag,
    withoutPair: withoutPair,
    repointDump: repointDump,
    parentIdsOf: parentIdsOf,
    tagsOf: tagsOf,
    buildTree: buildTree
  };
})(window);
