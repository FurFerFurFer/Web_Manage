/* ── source-dump-core.js ───────────────────────────────────────────────────
   The one definition of how a source dump (slot field `sourceDumps`) is read
   and edited.

   TWO pages edit source dumps. sir-ks02.html owns the key and draws the page
   under KS03 → SOURCE DUMP; true-storage.html's SOURCE DUMP tab is a copy of
   that page (a documented twin — see its header comment). If each page spelled
   its own writers, the same click could store two different things, and the
   copy would quietly stop being one. That is the shape this project has paid
   for already: the deadline caution predicate was written out at three call
   sites, one forgot half of it, and the timeline mismarked every due day until
   it was found (AGENTS.md). So every writer lives HERE, once, and both pages
   delegate — KS02 through its React autosave, True Storage through a fresh
   single-key read-modify-write.

   The record shapes, all KS02's and unchanged:

       dump     { id, title, createdAt, parentId, mmLinks: [section] }
       section  { id, mmId, text, textBlocks: [block], links: [citation] }
       block    { id, title, explanation }
       citation { id, label, url }

   Contract, shared with true-storage-core.js:

   - Pure. Nothing here reads or writes storage, and nothing constructs a Date:
     a new entry's `createdAt` and every new id are PARAMETERS. KS02 mints
     numeric ids from its nid() counter; True Storage mints strings from
     TrackStorage.newId(). Both kinds reach the same list, which is fine
     because every comparison below is === on stored values and nothing is
     ever coerced — never route one through Number() or a DOM dataset.
   - Never mutates its input, and SPREADS every record it changes, so a key
     this version has not heard of survives an edit — the repair IIFE in
     sir-ks02.html stamps `restoredFromMmId` on a section, and a later version
     may add more.
   - Total. schema.js checks only that `sourceDumps` is a list of objects, so
     every nested read goes through a helper that cannot throw, and a record
     that is not an object is carried through untouched rather than dropped.
   - Returns the ORIGINAL list when nothing changed — refused, not found, or
     already so — which lets a caller skip the write and the sync upload a
     write would arm.

   Loaded as a classic script by sir-ks02.html and true-storage.html.
*/
(function (global) {
  'use strict';

  function isList(v) { return Array.isArray(v); }

  // Arrays and null are both typeof 'object'.
  function isMap(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  function str(v) { return typeof v === 'string' ? v : ''; }

  // ── defensive readers ────────────────────────────────────────────────────

  function sectionsOf(dump) { return (isMap(dump) && isList(dump.mmLinks)) ? dump.mmLinks : []; }
  function blocksOf(section) { return (isMap(section) && isList(section.textBlocks)) ? section.textBlocks : []; }
  function citationsOf(section) { return (isMap(section) && isList(section.links)) ? section.links : []; }

  function findDump(dumps, id) {
    if (!isList(dumps)) return null;
    for (var i = 0; i < dumps.length; i++) if (isMap(dumps[i]) && dumps[i].id === id) return dumps[i];
    return null;
  }

  // ── readers ──────────────────────────────────────────────────────────────

  // Every dump from the root down to `dumpId`, for the breadcrumb path.
  // `seen` is the cycle guard, and it matters here more than anywhere: the
  // walk goes UP from an arbitrary dump, so unlike the downward walks it can
  // start inside a parentId cycle (README, "Parent cycles"). Moved verbatim
  // from sir-ks02.html, which spelled it twice once — guarded at one site and
  // unguarded 300 lines away at the other.
  function pathTo(dumpId, dumps) {
    var seen = [];
    function up(id) {
      var d = findDump(dumps, id);
      if (!d || seen.indexOf(id) >= 0) return [];
      seen.push(id);
      return d.parentId ? up(d.parentId).concat([id]) : [id];
    }
    return up(dumpId);
  }

  // A section's text blocks. A section written before `textBlocks` existed
  // carries its prose in `text`; that is shown as ONE block whose id is the
  // section id plus `_m`, which is why isLegacyBlock below exists.
  function textBlocksOf(section) {
    var blocks = blocksOf(section).filter(isMap);
    if (blocks.length) return blocks;
    var legacy = isMap(section) ? str(section.text).trim() : '';
    return legacy ? [{ id: section.id + '_m', title: '', explanation: legacy }] : [];
  }

  // The synthesised legacy block lives in `text`, not in `textBlocks`, so it
  // can be neither transferred nor removed. Both Source Dump pages hide those
  // two buttons on it, and KS02's S&C tab orders it — all through this test.
  function isLegacyBlock(section, block) {
    return isMap(section) && isMap(block) && block.id === section.id + '_m';
  }

  // An MM is a leaf when no MM names it as a parent. `parentIds` that is not
  // a list is ignored rather than read — a string would substring-match.
  function isLeafMM(mmId, mms) {
    if (!isList(mms)) return true;
    return !mms.some(function (m) {
      return isMap(m) && isList(m.parentIds) && m.parentIds.indexOf(mmId) >= 0;
    });
  }

  // Which MMs a source dump offers to link, and to transfer content to: a
  // leaf, or a non-leaf whose Source Dump is activated. `=== true` exactly as
  // KS02 has always tested it.
  function canLinkMM(mm, mms) {
    return isMap(mm) && (isLeafMM(mm.id, mms) || mm.sourceDumpActivated === true);
  }

  // Whether a new title under `parentId` takes over the parent's MM sections.
  // The caller asks BEFORE writing, because a storage tag naming the parent
  // has to be re-pointed to the child in the same operation
  // (TrackTrueStorage.repointDump) — and that is a side effect, which never
  // belongs inside a state updater.
  function inheritsLinks(dumps, parentId) {
    if (!parentId) return false;
    return sectionsOf(findDump(dumps, parentId)).length > 0;
  }

  // ── writers: titles ──────────────────────────────────────────────────────

  // A new title, appended last (array order is display order). Under a dump
  // that already has MM sections, the WHOLE set moves down to the new child
  // and the parent keeps none — that is KS02's model: content lives on
  // leaves.
  //
  // A parent that no longer exists is REFUSED. It can be deleted in another
  // tab while this one's breadcrumb still stands on it, and the entry that
  // would be written then has a parentId naming nothing — nobody's child, no
  // root leading to it: stored, synced, and unreachable.
  //
  // When ids are duplicated (a re-imported dump file can do that), only the
  // FIRST record with the parent id gives up its sections — the one the page
  // is showing. Emptying every match while inheriting one would delete the
  // others' sections outright.
  function withEntry(dumps, entry) {
    if (!isList(dumps) || !isMap(entry)) return dumps;
    var title = str(entry.title).trim();
    if (!title) return dumps;
    var parentId = entry.parentId || null;
    var at = -1;
    if (parentId) {
      for (var i = 0; i < dumps.length; i++) {
        if (isMap(dumps[i]) && dumps[i].id === parentId) { at = i; break; }
      }
      if (at < 0) return dumps;
    }
    var inherited = at >= 0 ? sectionsOf(dumps[at]).slice() : [];
    var next = dumps.map(function (d, i) {
      return (i === at && inherited.length) ? Object.assign({}, d, { mmLinks: [] }) : d;
    });
    next.push({ id: entry.id, title: title, createdAt: entry.createdAt, parentId: parentId, mmLinks: inherited });
    return next;
  }

  // The dump and every descendant. Deleting a dump deliberately does NOT
  // touch any storage tag that named it — that tag reads "source removed"
  // and stays removable by hand (AGENTS.md). The walk is iterative with a
  // visited set, so a cycle ends it rather than the stack.
  function withoutEntry(dumps, dumpId) {
    if (!findDump(dumps, dumpId)) return dumps;
    var doomed = [dumpId];
    for (var k = 0; k < doomed.length; k++) {
      var id = doomed[k];
      dumps.forEach(function (d) {
        if (isMap(d) && d.parentId === id && doomed.indexOf(d.id) < 0) doomed.push(d.id);
      });
    }
    return dumps.filter(function (d) { return !(isMap(d) && doomed.indexOf(d.id) >= 0); });
  }

  function withTitle(dumps, dumpId, title) {
    if (!isList(dumps)) return dumps;
    var t = str(title).trim();
    if (!t) return dumps;
    var changed = false;
    var next = dumps.map(function (d) {
      if (!isMap(d) || d.id !== dumpId || d.title === t) return d;
      changed = true;
      return Object.assign({}, d, { title: t });
    });
    return changed ? next : dumps;
  }

  // ── writers: one section, or one item inside one ─────────────────────────

  // Apply `fn` to the sections of every dump with this id. `fn` returns the
  // next section list, or the same one to mean "no change"; the identity
  // contract falls out of that.
  function editSections(dumps, dumpId, fn) {
    if (!isList(dumps)) return dumps;
    var changed = false;
    var next = dumps.map(function (d) {
      if (!isMap(d) || d.id !== dumpId) return d;
      var before = sectionsOf(d);
      var after = fn(before);
      if (after === before) return d;
      changed = true;
      return Object.assign({}, d, { mmLinks: after });
    });
    return changed ? next : dumps;
  }

  // Apply `fn` to one section (by id) inside one dump.
  function editSection(dumps, dumpId, sectionId, fn) {
    return editSections(dumps, dumpId, function (sections) {
      var changed = false;
      var next = sections.map(function (s) {
        if (!isMap(s) || s.id !== sectionId) return s;
        var after = fn(s);
        if (after === s) return s;
        changed = true;
        return after;
      });
      return changed ? next : sections;
    });
  }

  // One section per MM per dump.
  function withMMLink(dumps, dumpId, mmId, sectionId) {
    return editSections(dumps, dumpId, function (sections) {
      if (sections.some(function (s) { return isMap(s) && s.mmId === mmId; })) return sections;
      return sections.concat([{ id: sectionId, mmId: mmId, text: '', textBlocks: [], links: [] }]);
    });
  }

  // Removing a section deliberately does NOT touch a storage tag naming the
  // pair — it reads "source removed" (AGENTS.md).
  function withoutMMLink(dumps, dumpId, sectionId) {
    return editSections(dumps, dumpId, function (sections) {
      var kept = sections.filter(function (s) { return !(isMap(s) && s.id === sectionId); });
      return kept.length === sections.length ? sections : kept;
    });
  }

  // A blank url is refused; the label defaults to the url, as KS02 always did
  // — including its quirk that a label of only spaces trims to ''.
  function withURLLink(dumps, dumpId, sectionId, citation, citationId) {
    var c = isMap(citation) ? citation : {};
    var url = str(c.url).trim();
    if (!url) return dumps;
    var label = (str(c.label) || url).trim();
    return editSection(dumps, dumpId, sectionId, function (s) {
      return Object.assign({}, s, { links: citationsOf(s).concat([{ id: citationId, label: label, url: url }]) });
    });
  }

  function withoutURLLink(dumps, dumpId, sectionId, citationId) {
    return editSection(dumps, dumpId, sectionId, function (s) {
      var list = citationsOf(s);
      var kept = list.filter(function (u) { return !(isMap(u) && u.id === citationId); });
      return kept.length === list.length ? s : Object.assign({}, s, { links: kept });
    });
  }

  // A blank explanation is refused. A block that already carries an id keeps
  // it; `blockId` is used only when it does not — KS02 minted only then.
  function withTextBlock(dumps, dumpId, sectionId, block, blockId) {
    var b = isMap(block) ? block : {};
    var explanation = str(b.explanation).trim();
    if (!explanation) return dumps;
    var nb = Object.assign({}, b, { explanation: explanation, title: str(b.title).trim(), id: b.id || blockId });
    return editSection(dumps, dumpId, sectionId, function (s) {
      return Object.assign({}, s, { textBlocks: blocksOf(s).concat([nb]) });
    });
  }

  function withoutTextBlock(dumps, dumpId, sectionId, blockId) {
    return editSection(dumps, dumpId, sectionId, function (s) {
      var list = blocksOf(s);
      var kept = list.filter(function (b) { return !(isMap(b) && b.id === blockId); });
      return kept.length === list.length ? s : Object.assign({}, s, { textBlocks: kept });
    });
  }

  // ── writers: transfers ───────────────────────────────────────────────────

  // Move one item out of a section into the section for `toMmId` in the SAME
  // dump, creating that section (id `newSectionId`) when the MM has none here.
  // `field` is 'textBlocks' or 'links'.
  //
  // A transfer onto its own section changes nothing. KS02's original handler,
  // handed its own MM as the target, removed the item and never added it back;
  // the picker has always hidden that option, and the writer now refuses it
  // outright. Only the FIRST section for the target MM receives the item.
  function transfer(field, dumps, dumpId, fromSectionId, itemId, toMmId, newSectionId) {
    return editSections(dumps, dumpId, function (sections) {
      var from = null, to = null;
      sections.forEach(function (s) {
        if (!isMap(s)) return;
        if (!from && s.id === fromSectionId) from = s;
        if (!to && s.mmId === toMmId) to = s;
      });
      if (!from || from === to) return sections;
      var items = isList(from[field]) ? from[field] : [];
      var item = null;
      for (var i = 0; i < items.length; i++) if (isMap(items[i]) && items[i].id === itemId) { item = items[i]; break; }
      if (!item) return sections;
      var without = function (s) {
        var o = {}; o[field] = items.filter(function (x) { return x !== item; });
        return Object.assign({}, s, o);
      };
      var withItem = function (s) {
        var o = {}; o[field] = (isList(s[field]) ? s[field] : []).concat([item]);
        return Object.assign({}, s, o);
      };
      var next = sections.map(function (s) {
        if (s === from) return without(s);
        if (s === to) return withItem(s);
        return s;
      });
      if (!to) {
        var fresh = { id: newSectionId, mmId: toMmId, text: '', textBlocks: [], links: [] };
        fresh[field] = [item];
        next.push(fresh);
      }
      return next;
    });
  }

  function transferTextBlock(dumps, dumpId, fromSectionId, blockId, toMmId, newSectionId) {
    return transfer('textBlocks', dumps, dumpId, fromSectionId, blockId, toMmId, newSectionId);
  }

  function transferURLLink(dumps, dumpId, fromSectionId, citationId, toMmId, newSectionId) {
    return transfer('links', dumps, dumpId, fromSectionId, citationId, toMmId, newSectionId);
  }

  global.TrackSourceDump = {
    pathTo: pathTo,
    textBlocksOf: textBlocksOf,
    isLegacyBlock: isLegacyBlock,
    isLeafMM: isLeafMM,
    canLinkMM: canLinkMM,
    inheritsLinks: inheritsLinks,
    withEntry: withEntry,
    withoutEntry: withoutEntry,
    withTitle: withTitle,
    withMMLink: withMMLink,
    withoutMMLink: withoutMMLink,
    withURLLink: withURLLink,
    withoutURLLink: withoutURLLink,
    withTextBlock: withTextBlock,
    withoutTextBlock: withoutTextBlock,
    transferTextBlock: transferTextBlock,
    transferURLLink: transferURLLink
  };
})(window);
