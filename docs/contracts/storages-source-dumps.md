# Contract: storages, source dumps and graph traversal

**Mandatory rules, with the same authority as `AGENTS.md`.** Read this file before changing
anything it covers: `trueStorages` and its tags, **the cycle-guard rule for every parent/child graph** (mind maps, goal links, source dumps), the radial layout, the Source Dump twin pages, and a storage's `link`.

Moved out of `AGENTS.md` on 2026-11-10, word for word and with nothing deleted, because
`AGENTS.md` had reached 174KB and is loaded into every agent session. A phrase such as
"the `merges` rule" or "the `time` / `link` rule" names a rule in this file or a sibling
one; the index in `AGENTS.md` ("Feature contracts") says which file holds which key.
A new rule for this area is added HERE, not to `AGENTS.md`.

---

A `trueStorages` item is a **storage**, owned by `true-storage.html`, and it may carry `tags` — each one naming a **pair**: a source-dump leaf (`dumpId`) and one MM linked inside it (`mmId`). Four rules follow, and the first is the load-bearing one:

- The comparison that decides which storages belong to a pair has exactly **one** definition, `TrackTrueStorage.storagesForLink` in `true-storage-core.js`, and the tag record's shape has exactly one, `withTag`. `sir-ks02.html` draws an mmLink's content at **four** sites — the source-dump leaf card, the S&C tab for a leaf MM, the S&C tab for a non-leaf MM, and `DescendantSCNode` — and every one of them renders the shared `StorageTags` component through the single `renderStorageTags` helper. Never spell `t.dumpId === … && t.mmId === …` at a call site. This rule is written from a shipped bug in a different feature with the identical shape: the deadline caution predicate was spelled out at three sites, one dropped half of it, and the timeline mismarked every due day until it was found. `tests/browser.test.js` therefore asserts **negatively** at each surface — a chip must be absent under the other MM in the same dump, and absent under the same MM in another dump.
- `trueStorages` and `trueStoragePos` are owned by `true-storage.html` and must never join `sir-ks02.html`'s `_writeSlotKeys` autosave patch, which is built from that page's React snapshot. KS02 may add or remove a tag, and only through `_mutateSlotKey` — a fresh read-modify-write of that one key. `true-storage.html` is the mirror image: `sourceDumps` is KS02's, and True Storage's SOURCE DUMP tab writes it **only** through `_mutateSourceDumps` — a fresh read-modify-write of that one key, handed the **raw stored** list — and never through its autosave or from its React `dumps` (which is filtered for rendering, so writing it back would delete what the filter hides). It reads `mms` and never writes it.
- Deleting a source dump, or removing an MM link from one, must **not** touch `trueStorages`. A tag whose pair no longer resolves renders as *source removed* and stays removable by hand, exactly as a day note outlives the documentation page that authored it.
- Every traversal of a parent/child graph carries a **cycle guard**, without exception. `parentIds`
  is plural and the connections picker on both canvas pages lets a user pick a descendant as a
  parent, so a cycle is reachable through ordinary use — and it can also arrive from stored,
  synced, or hand-edited data, which is why tolerating one is mandatory and preventing one at the
  picker would not be a substitute. All guards agree on one contract, the one
  `TrackTrueStorage.buildTree` and `SrchView` already set: **a repeated node is drawn once, and its
  branch ends there.** Use a per-path `seen` (copied per branch) wherever a diamond must still be
  drawn under both parents, and a visited-at-enqueue set where a node is wanted once. A memo is
  *not* a guard: `leafCount` wrote `leafMemo[id]` only after its recursive `reduce` returned, so a
  node still on the stack was never in it, and the RangeError escaping a React render left `#root`
  empty — KS02 losing CAL/KS02/MG/KS03/KOLB/SRCH at once, recoverable only by hand-editing
  `localStorage`. Guarded reference implementations: `graph-layout.js` (`leafCount`, `layout`),
  `true-storage-core.js` `buildTree`, `source-dump-core.js` `pathTo` and `withoutEntry`,
  `strat-core.js` `stratsFor` (upward, visited-at-enqueue: the start is never its own ancestor),
  `sir-ks02.html` `getAncestors`, `getDescendants` and `SrchView.buildTree`, and in
  `progress.html` `buildToLearnTree` and `buildMMTree` (mind-map parents — both also draw a
  rootless cycle from its first member, so nothing in it vanishes). `mm-tree-core.js` is the
  newest: `roots` gives each loop nothing leads to one entry, its earliest stored member;
  `descendantIds` is visited-at-enqueue; `pathTo` walks up and never visits a mind map twice;
  and SRCH → DIRECTORY's `MMDirRow` carries a per-path `path`, drawing a mind map met again on
  its own branch once, marked `↻`. Its drag also REFUSES a move into the moving branch — the one
  place a mind-map cycle is prevented, approved for that drag alone; it is not a substitute for
  any guard above.
- **Goal-tree LINKS are the same hazard in a second graph, and are guarded AND prevented.** A
  link (`isLink`, `linkedTaskId`) can lead back up the tree. Every walker that follows one carries
  a per-path guard — `getLeaves`, `isComplete`, `GoalProgressViz`'s `collectLeaves`,
  `GoalProgressPanel`'s `collectUniqueLeaves`, `TrackMilestone.countLeaves` — and the two
  recursive renders draw a link to a node already on their branch as `LinkLoopRow` instead of
  following it: `GoalNode` through its `ancestry` prop at all three link-child sites, and
  `renderMilestoneTask` through its `path`. `documentations.html`'s Projects tab has three more
  render sites, each with a per-path `ancestry`: `GoalTreeItem` (the sidebar), `TaskDirectory`
  (a goal page's tasks) and `GoalPage`'s sub-goal cards, each drawing a loop as one `↻` row.
  A new walker or render site inherits that duty.
  `linkWouldLoop` is the **one** loop test: both pickers filter through it (their `parentId`
  prop) and both writers (`addLinkedTask`, `addLinkedSubGoal`) refuse through it. Prevention is
  not a substitute for the guards — a loop can already be stored or arrive through sync.
- The radial canvas layout has exactly **one** definition, `graph-layout.js`, loaded by
  `sir-ks02.html` and `true-storage.html` as a one-line delegate each. It was ~120 duplicated lines
  per page, which meant the cycle guard above had to be written twice — the same duplication shape
  that cost this project the deadline caution predicate. Do not re-inline it, and do not add a
  second copy for a third canvas.
- Source dumps are a **different** graph: `parentId` is singular, so a dump inside a cycle has its
  one parent inside that cycle and is nobody's descendant. Downward walks cannot reach one; only
  the upward breadcrumb walk can, because it starts wherever it is asked to. That walk is
  `TrackSourceDump.pathTo` and it has one definition — it used to be spelled twice, guarded at one
  site and unguarded 300 lines away at the other; KS02's `dumpPathTo` is now a delegate to it.
- `parentIds` and `tags` are deliberately **not** validated in `schema.js` beyond the object-item check every list field gets. `mms` carries the identical `parentIds` exposure and is not validated either, so gating one and not the other would invent an inconsistent rule. `true-storage-core.js` pays for that instead: every nested list is read through a helper that cannot throw, and `buildTree` terminates on a parent cycle.

The **Source Dump page exists twice**: `SourceDumpView` (with `TransferPicker` and `StorageTags`) in `sir-ks02.html`, under KS03, and its documented twin in `true-storage.html`, the SOURCE DUMP tab. Both edit the same `sourceDumps`. Five rules follow, and the first two are the load-bearing ones:

- **Every source-dump writer has ONE definition, in `source-dump-core.js`.** Both pages' handlers are one-line delegates that only mint ids: KS02 passes `nid()` and feeds its autosave; True Storage passes `TrackStorage.newId()` strings and goes through `_mutateSourceDumps`. Never spell a `sourceDumps` transform at a call site — two spellings of one edit is how the same click would come to store two different things. The writers return their input **unchanged** when nothing changes, which is what lets the RMW skip the write and lets React bail out of an autosave.
- **The UI is a TWIN, and a change to one copy is a change to both.** It is a copy rather than a shared file because the pages have no module system and the app is supported opened from disk, where a separately loaded JSX file cannot be fetched. The tripwire is the browser case `PARITY: the SOURCE DUMP copy draws exactly the controls KS02 draws`, which collects every control both pages draw for one seed and fails on any difference. The twin's header comment lists its only three intended differences — the MM name is a link into KS02 (`?mm=`, its S&C tab), a storage chip opens the storage in place, and tagging acts on True Storage's own state — and a fourth must be added there on purpose, not discovered by the parity case.
- **`sourceDumps` holds ids of both types.** A record minted on True Storage carries a string; KS02's carry `nid()` numbers. Every reader compares stored values with `===` and a query string with `String()`; nothing may coerce a dump, section, block or citation id with `Number()`, `parseInt` or a DOM dataset. The one numeric reader is `repairTransferredParentSCDumps`, whose `Number.isFinite` check deliberately skips string ids — correct, because its heuristic is about ids from KS02's own counter.
- `TrackSourceDump.withEntry` **refuses** a parent id that is not in the list it is handed. A parent deleted in another tab would otherwise get a child whose `parentId` names nothing — reachable from no root, so stored, synced and unreachable. It also empties only the FIRST record with the parent id, so a duplicated id cannot lose the other record's sections.
- KS02's `?mm=<id>` (with no `?dump=`) opens that MM on its S&C tab; with `?dump=` present, `mm` stays the dump card's ring. The two effects never compete for one URL, and a browser case pins the precedence.

A storage's `link` is at most **one**, and clearing it **deletes the key** rather than storing `''` — the same absence-is-meaningful rule as a day note's `time`. A storage that never had a link and one whose link was cleared must be the same state.
