# AGENTS.md

## Scope

These instructions apply to the entire `Track-website` repository.

They are project-specific operating rules for coding agents. Follow higher-priority system or user instructions first. When instructions conflict, stop and explain the conflict rather than silently choosing a risky interpretation.

## Project Objective

Maintain and extend Track, a local-first personal learning-progress application that combines:

- Marginal Gains.
- Kolb's Learning Cycle.
- Spaced Interval Review.
- Mind maps and source material.
- Hierarchical goals and milestones.
- Supporting actions and schedules.
- Per-slot notes.
- Optional Firebase synchronization.

The highest project invariant is preservation of user data. A feature is not successful if it renders correctly but loses, overwrites, misdates, or makes existing data unreachable.

## Documentation Responsibilities

Read these files before substantial work:

| File | Source of truth |
| --- | --- |
| `README.md` | Current product behavior, current architecture, current progress, and the workflow used now |
| `NOTES.md` | Unfinished tasks, open decisions or risks, possible ideas, and the future roadmap only |
| `AGENTS.md` | Mandatory agent procedure and project safety rules |

Keep their responsibilities separate:

- Do not describe an unimplemented proposal as current behavior in README.
- Keep `NOTES.md` strictly forward-looking. Do not retain completed work, implementation
  history, fixed or superseded proposals, status-update narratives, or struck-through
  "done" items there.
- When work is completed, document the resulting current behavior in `README.md` and
  remove the completed proposal or completed portion from `NOTES.md`.
- Do not put general product descriptions in AGENTS unless they affect how work must be performed.

When implementing a proposal from `NOTES.md`:

1. Update `README.md` with the resulting current behavior.
2. Remove the completed proposal or completed portion from `NOTES.md`, leaving only work
   and ideas that remain unfinished.
3. Update `AGENTS.md` if required commands, invariants, or safety gates changed.

## Current Architecture

There is currently no package-managed build system.

Active files:

| File | Responsibility |
| --- | --- |
| `index.html` | Home, workspace slots, import/export, navigation |
| `progress.html` | Goals, milestones, progress, supporting actions, schedule |
| `sir-ks02.html` | Mind maps, Kolb, SIR, MG, LIN records, source dumps |
| `documentations.html` | Notion-style nested documentation pages, source-dump references, print/PDF export |
| `true-storage.html` | Storages: KS03-style multiverse canvas, SRCH-style nested tree, one link, an explanation, and source-dump tags |
| `calendar-core.js` | Shared read-only aggregation of a slot into per-day calendar data (`window.TrackCalendar`), used by the Home universal calendar and the Documentations calendar blocks |
| `theme.js` | Initial theme selection, persistent light/dark switching, cross-tab appearance updates |
| `schema.js` | The canonical slot definition (`window.TrackSchema`): the `SLOT_FIELDS` table, `createEmptySlot`, `normalizeSlot`, `validateSlot`, `validateDatabase` |
| `storage-guard.js` | The one `track_db` load boundary (`loadDB` — parse, validate, freeze writes on damage) and the `localStorage` quota guard for every whole-database write, both banners (`window.TrackStorage`) |
| `firebase-sync.js` | Firebase authentication, gzipped/chunked whole-database synchronization, sync status surface |
| `true-storage-core.js` | The one definition of the storage↔source-dump relationship (`window.TrackTrueStorage`): the pair matcher, the pure tag writers, and the parent/child tree |
| `graph-layout.js` | The one radial canvas layout (`window.TrackGraphLayout`): `computeLayerLayout`, `applyRepulsion`, and the cycle guards that keep a parent cycle from blowing the stack on either canvas page |
| `doc-table-core.js` | The one definition of a documentation table's shape (`window.TrackDocTable`): `mergeMap`, the pure merge writers, and the `::: track-table` paste format in both directions |
| `notes-widget.js` | Per-slot floating notes |
| `styles.css` | Shared design tokens, themes, responsive styling, and component states |
| `firestore.rules` | Firestore security rules, versioned for review only; published by hand in the Firebase console |
| `tests/` | The committed suite. `run.js` is the one command; `calendar-core.test.js`, `schema.test.js`, `true-storage-core.test.js`, `graph-layout.test.js` and `doc-table-core.test.js` are offline; `browser.test.js` drives real Chrome through `lib/cdp.js`; `lib/fixture.js` builds synthetic slots, including legacy and malformed ones |

Current runtime dependencies are loaded through CDNs:

- React 18 development UMD.
- React DOM 18 development UMD.
- Babel 7.25.6.
- Tailwind browser CDN.
- Firebase 10.12 compatibility scripts.

Do not assume Vite, npm scripts, TypeScript, JSX modules, or CI exists until the repository actually contains them.

There **is** a test suite, and it has no dependencies and no `package.json` — Node's built-in `node:test`, plus a hand-rolled DevTools-protocol driver over Node 22's global `WebSocket`. Keep it that way: adding Playwright, Puppeteer, Jest, or a package manifest to make a test easier is a dependency decision that needs explicit approval (see "Dependencies, Network, and External Systems").

Repository-local scripts and stylesheets are loaded with a `?v=N` cache-busting query (`styles.css?v=6`, `schema.js?v=6`, `calendar-core.js?v=6`, `firebase-sync.js?v=2`, `storage-guard.js?v=2`, `notes-widget.js?v=2`, `true-storage-core.js?v=2`, `graph-layout.js?v=1`, `doc-table-core.js?v=1`). There is no build step to hash filenames, so this query is the only thing guaranteeing a returning visitor gets a changed asset instead of its cached copy. Bump the integer in every page that loads the file whenever its contents change, and keep the value identical across pages. `theme.js` is the only unversioned one left.

A rule in `styles.css` that has to **beat a Tailwind utility on the same element** needs more
than one class in its selector. The Tailwind CDN injects its `<style>` into `<head>` at runtime,
which is *after* every page's `<link rel="stylesheet" href="styles.css">`, so a one-class
selector like `.docs-sidebar-full` merely **ties** `.w-60`/`.p-2`/`.hidden` and loses on source
order. Double it (`.docs-sidebar.docs-sidebar-full`) or reach the element through a descendant
or attribute selector; do not reach for `!important`, which the print block already uses for a
different reason and which would make the next override harder still. This is not theoretical —
it silently cost the full-screen sidebar its width once, and the panel simply stayed 240px with
no error anywhere.

## Current Data Contract

The main local database key is:

```text
track_db
```

Its conceptual root is:

```js
{
  slots: [],
  activeSlotId: null
}
```

Current slot fields include:

```js
{
  id,
  name,
  createdAt,
  sessions,
  mms,
  kolbs,
  mgChanges,
  linChanges,
  linDayTitles,
  goals,
  saActions,
  saEntries,
  sourceDumps,
  notes,
  mmEntries,
  mgSchedule,
  calendarNotes,
  deadlines,
  pos,
  levelTemplates,
  docPages,
  trueStorages,
  trueStoragePos
}
```

The field list, its defaults, and its validation are centralized in `schema.js`
(`window.TrackSchema`). **Adding or changing a slot field means editing the
`SLOT_FIELDS` table there and nothing else** — `createEmptySlot`, `normalizeSlot`,
`validateSlot` and `validateDatabase` all derive from that one table, and every
new-slot creation site and the whole-slot importer go through it.

Two rules follow:

- Do not reintroduce a slot literal. All seven creation sites — `index.html`
  `createSlot`, the legacy bootstrap IIFEs in `progress.html` and `sir-ks02.html`,
  `sir-ks02.html`'s on-mount auto-create, `documentations.html`'s and
  `true-storage.html`'s `_bootstrapSlotIfSafe`, and the importer — call
  `TrackSchema.createEmptySlot` or `TrackSchema.normalizeSlot`. The original six
  used to build 10, 11, 13, 13, 14 and 21 fields respectively.
- `normalizeSlot` repairs and always succeeds; `validateSlot` and
  `validateDatabase` report and never repair. Keep that split. The legacy rescue
  paths need a total function — refusing there strands the user's oldest data —
  while import must refuse without writing, so it validates *before* reading the
  database.

`normalizeSlot` preserves keys it does not know about, so a field added by a later
version survives an export/import round trip. Do not "tidy" that into an
allow-list, and do not filter export through `SLOT_FIELDS` for the same reason.
That unknown-key branch must use an **own-property** test against `SLOT_FIELDS`
(`isCanonical`), never `SLOT_FIELDS[key]` — truthiness inherits from
`Object.prototype`, so a key called `constructor` or `toString` would look
canonical and be silently dropped.

Validation checks list **items**, not just the field. A field being a list is not
enough: every list field holds records, and a stray `null` inside one imports
cleanly under a field-only check and then throws out of `flattenGoals` or
`buildBuckets` on the next render. `null` as a whole field counts as missing
rather than wrong — it holds no data, so the default loses nothing.

Goal validation is also recursive: every goal descendant must be an object;
`children`, `toLearn` and `milestones` must be lists when present; every milestone
must be an object; and `mmTargets` must be a map. This is deliberately goal-tree
coverage, not a claim that every nested shape in `mms`, `sourceDumps`, `docPages`
or the other domains is already validated. Validation errors carry severity:
structural goal damage and missing or duplicate slot ids are fatal because
traversal or write identity is ambiguous, while a dangling `activeSlotId` is a
warning because the first slot is still an unambiguous fallback.

Readers are centralized through `TrackStorage.loadDB`; migrations are **not**.
The field-presence migration IIFEs in `progress.html` and `sir-ks02.html` are
still per-page. There is no `schemaVersion` on `track_db`; adding one is gated on
the migration registry in NOTES Proposal 2. Nothing calls `normalizeSlot` over
already-stored unified slots — that would be a migration. The legacy bootstrap
may normalize candidates newly harvested from pre-`track_db` keys, including
nonempty legacy slot lists, before their first unified save.

Items inside `calendarNotes` and `deadlines` may carry an optional `docPageId` naming the `docPages` entry that authored them; its absence means the item was authored in the Schedule. Preserve it: edit these items by spreading (`{...item, …}`), never by rebuilding them from a field list, and never delete such an item as a side effect of deleting its documentation page.

A `calendarNotes` item may also carry an optional `time` (`HH:MM`). **Absence is meaningful and is the default**: without it the note has no hour of its own, so its chip carries no time and its block falls back to `TrackCalendar.DEFAULT_NOTE_TIME`. The note appears in the day strip either way — see "show both, always" below. Two rules follow: write the key only when there is a value — never `''` — and make clearing the field delete the key, or a note can never go back to being untimed. `TrackCalendar.noteTimed` is the single test for this; `progress.html` has its own copy because it does not load `calendar-core.js`, and the two must agree.

A `deadlines` item carries `cautionDates`, the list of days it warns on — days the user **chose one by one**, never a span with a start. Every entry must fall strictly **before** `date`, which is drawn red everywhere and must never also be drawn amber. Absence means the record predates the choice and falls back to the legacy `startDate` span. Five rules follow, and the first three are the load-bearing ones:

- The resolver has exactly **one** definition, `TrackCalendar.dlCautionDays`, with the documented twin in `progress.html`, which does not load `calendar-core.js`. It is the only code anywhere that has heard of `startDate`. Never read `d.cautionDates` directly at a call site: the resolver sorts, de-duplicates, drops malformed entries and drops anything on or after the due day, and skipping it re-admits every one of those. Because it drops the due day, the `d.date !== ds` clause that every caution filter used to repeat is **gone** — the rule that was once forgotten at one of three call sites is now structurally impossible to forget.
- **`cautionDates: []` is a real stored value, not an absence.** Clearing writes the empty list; deleting the key falls through to the legacy branch and resurrects the span the user just cleared. This is deliberately the OPPOSITE of `time` and `blockTime`, and the reason is precisely that a fallback sits behind it.
- **Every write of `cautionDates` deletes `startDate` in the same spread.** `TrackCalendar.dlWithCautionDays` is the one writer and does both, so a record migrates by the act of being edited; `dlToggleCautionDay` goes through it. `progress.html`'s bulk migration is that same writer applied to every stored deadline.
- The **legacy `startDate` branch is not dead code** and must not be tidied away. `progress.html` carries a one-time field-presence migration — the presence of `startDate` is its own guard, so it is idempotent and needs no `schemaVersion` — but an old export imported later, a second device on the previous version, a hand-edited file, and a migration write the quota refused all deliver a `startDate` record. None may lose its run-up, and it is what makes a refused migration write harmless rather than data loss. Retiring it means moving the migration into the importer first.
- `cautionDates` is validated in `schema.js` as a **warning**, alongside `blockDate`: a malformed entry reaches rendering, but it holds strings rather than records and nothing traverses them as objects, so it is not the fatal class `parts` is. `null` is reported rather than read as absent, matching the other warnings and unlike `parts`.

A `deadlines` item may also carry an optional `done` (boolean). Ticked means the user has handled it, and the deadline's caution `!` marks stop rendering everywhere while the deadline itself stays on its due day. Absence is "not done", and every reader goes through `dlDone`'s `!!`, so an absent key, `false` and `undefined` are one state — unlike `time` there is no third state to protect, so untick writes `false` rather than deleting the key, and no stored deadline needs a migration. Three rules follow:

- The tick **suppresses** the chosen days; it must never alter them. `dlCautionDays`, `dlInCaution` and `dlCautionCount` stay blind to `done`, which is what makes unticking a restore rather than a recomputed guess. A writer that "tidies" `cautionDates` on tick has destroyed the thing untick puts back.
- The doneness test belongs **inside** the three caution predicates, never at a call site. They are `deadlinesCautionOn` (`progress.html`), `deadlinesCaution` (`calendar-core.js`) and `ownedDates.caution` (`documentations.html`), and between them they feed five surfaces — the Progress month grid, timeline strip and day panel, the Home calendar, and a Documentations calendar block. `progress.html` holds its own copy of `dlDone` because it does not load `calendar-core.js`, exactly as it does for `noteTimed`. This rule is written from a shipped bug: `d.date !== ds` was spelled out at two of three call sites and forgotten at the third, and the timeline double-marked every due day until it was found.
- `done` is deliberately **not** validated in `schema.js`. A malformed date breaks a render, but `!!'yes'` is just `true`, so a check there would only invent a way to block a database over a field that is safe by construction.

A deadline's `date` is written by exactly three forms, and every one of them goes through `dlDraftValid`: the popup's Edit form in `progress.html`, and the two **compose** forms — the day-cell composer in `progress.html` and the `+ deadline` form in `documentations.html` — which each carry a due-date field seeded to the cell they were opened on. `dlDraftValid` has one definition per side, `TrackCalendar.dlDraftValid` in `calendar-core.js` and the documented copy in `progress.html`. It is now a **format** gate only: with `startDate` gone there is no second stored date to order `date` against, and the whole inverted-span hazard class went with it. The format test still matters — a blank date must never reach storage.

**Choosing a caution day requires holding the prep-aware refusal — by CALLING it, never by repeating it.** `TrackCalendar.dlStrandedBlockDays` is that refusal and it has one definition, so a surface qualifies by loading `calendar-core.js` and asking it, not by re-spelling the comparison. Three surfaces author caution days and they are deliberately not uniform:

- The **Progress popup's picker** writes on every click, because it has no Cancel to honour. `clear all` is destructive the moment it is pressed, so it asks.
- **Both Documentations deadline forms** — the `+ deadline` composer and the `✎` edit form — share one picker that holds picks in the DRAFT and writes them on Save. That is why its `clear all` does *not* ask: it reaches no `track_db`, and Cancel puts every day back. A browser case asserts the Cancel path is byte-identical, which is the only thing making that exemption safe.
- The **Progress composer** still sets none; a new deadline there is created with `cautionDates: []` and the days are picked in the popup a click later. That asymmetry with the Documentations composer is deliberate, not an oversight.

The refusal itself is the same everywhere and belongs at the click, not at the call site: an un-pick that would leave this deadline's prep on a day it no longer occupies is REFUSED and the day is NAMED — never moved, never dropped. `documentations.html` gates its Save on it as well, so a stranding set cannot be written even if a future edit breaks the click path.

A form that holds picks in a draft has one extra obligation: the **due day can move under an already-chosen list**, which only the composer allows. Nothing may filter that by hand — ask `dlWithCautionDays` what it would store and render that, so the readout and the stored value cannot disagree.

**Moving an existing due day is still the Progress popup's alone**, because that writer must also refuse an ORPHANED chosen day. A browser scope-guard case asserts the Documentations edit form has no date field, so adding one without that second refusal trips a test.

Moving an **existing** deadline stays the popup's alone, because that writer also has to refuse an orphaned chosen day and stranded prep; a deadline being composed has neither. Two rules follow, and they are the mirror of the tick rules above:

- Moving the due day must **never rewrite `cautionDates`**. A day the user picked is not ours to drop or shift to make room. A due day landing on or before a chosen day would silently delete it, so **refuse the edit and name the days**; the user un-picks them themselves, in the same popup.
- There is no cross-field rule left to enforce at authoring time, because a chosen-day list **cannot be inverted** — the resolver drops any entry on or after the due day rather than storing a negative span. That is a real reduction in hazard, not an omission: `tests/calendar-core.test.js` pins it in an offline guard case so a future change that reintroduces a second stored date has to confront it.

A `calendarNotes` or `deadlines` item has a real **schedule block** on the hour grid, **automatically**: a deadline's block **ends** at its due time (it is the run-up), a day note's **starts** at its time, or at `08:00` when it has none. It may carry an optional `blockOff` (boolean), `blockDuration` (minutes), `blockTime` (`HH:MM`), `blockDate` (`YYYY-MM-DD`) and `parts` list, and **every absence is the automatic default** — which is what put blocks on every stored item without writing a byte to one, so there is nothing to migrate. Seven rules follow:

- `blockOff` is the **single on-grid switch**, not `blockDuration`. Its absence means the item HAS a block. `blockDuration` is only a remembered length, `blockTime` only a remembered start, `blockDate` only a remembered day. Removing a block writes `blockOff: true` and **deletes nothing**, so putting it back RESTORES what the user chose rather than recomputing a guess — the same reasoning that already makes `reset` a restore. Re-adding writes `false` rather than deleting the key, matching `done`: every reader goes through `blockOn`'s `!!`, so there is no third state to protect.
- The block geometry has exactly **one** definition, `blockOn` / `noteBlockStart` / `noteBlockDuration` / `dlBlockDuration` / `noteBlockSpan` / `dlBlockSpan` / `blockDay` / `partDay` / `itemParts` / `partSpan` in `calendar-core.js`, with a second copy in `progress.html` for the documented reason that it does not load that file. Never re-spell `d.time - d.blockDuration` or `!item.blockOff` at a call site. Three surfaces render these blocks — the Progress grid, the Home calendar and a Documentations calendar block — and `tests/browser.test.js` asserts each one **separately**, because a rule forgotten at one of several surfaces is this repository's recurring bug and a single assertion lets the forgotten one hide behind a passing sibling. The two copies used to diverge on purpose; they no longer do, and the comment claiming a divergence was deleted along with it.
- **Show both, always.** A block never replaces the way an item was already visible: a note keeps its day-strip chip and its Progress point marker whatever its block is doing, and a deadline keeps its due-time hairline and its caution `!` marks. Scheduling something must not take a surface away, and `blockOff` must not remove the item.
- The item's own `date` and `time` are **not** block geometry. `blockDate` on the item and `date` on a part say where the block is drawn; the chip, marker, due line and caution `!` marks all stay on `date`. Blocks are therefore collected by `blockDay`/`partDay` over the whole array, while the strip and due lists still filter on `date` — that split is the feature.
- A drag writes `blockDate`/`blockTime`, or a part's own `date`/`time`, and **never** the item's `date` or `time`. This is load-bearing for a deadline: it keeps `date` editable only from the form that refuses an orphaned chosen day and stranded prep, so a drag can never slip past either refusal. A note follows the same rule for a plainer reason — its date is where the note belongs.
- A **deadline's** block and every one of its parts must sit on a day the deadline OCCUPIES: one of its chosen caution days, or the due day. That is set **membership**, not a range — a day merely falling between two chosen ones is outside it, and any `day >= dlStart(d)` comparison silently re-admits the gaps the user deliberately left out. The drag ghost SNAPS to the nearest allowed day — never pinned, or prep could not be moved onto another caution day at all — the task-day picker refuses anything outside the set, and an un-pick or a due-day move that would strand placed prep is **REFUSED** with the day named, never moved and never clamped. `dlBlockDayValid` / `dlStrandedBlockDays` are the one definition; the popup's caution calendar and its Edit form both call them rather than re-spelling the comparison, and `span` is the proposed `{cautionDates, date}`. A day note has no such restriction.
- Emptying `parts` deletes `parts`; a part's `date`, `time` and `blockDuration` are written only when they differ from what it would inherit. Never write `0`, `''` or `[]`. `blockDuration`, `blockTime` and `blockDate` are validated in `schema.js` as **warnings** because they reach geometry (`height: NaNpx`) and placement (a day that does not exist), unlike `done` and `blockOff` which are safe under `!!`; `parts` is validated **fatally** like a goal's `children`, because it holds records and is traversed.

A `docPages` block of type `table` holds a rectangular `rows: [[string]]` and may carry an optional `merges: [{r, c, rs, cs}]`, each entry naming a top-left cell and how far it spans. Five rules follow, and the first two are the load-bearing ones:

- The geometry has exactly **one** definition, `TrackDocTable.mergeMap` in `doc-table-core.js`, which returns `{rs, cs}` for a cell that is drawn and `null` for one covered by a merge. Never spell a `merges.find(…)` at a call site. Only `documentations.html` renders tables, so unlike the deadline predicates there is no second copy to keep in step — and there must not become one. The editor and the paste dialog's preview both go through this, which is what stops a preview from disagreeing with what gets inserted.
- **Absence is the default, and clearing deletes the key.** No legacy fallback sits behind `merges`, so this is the `time` / `link` rule and deliberately NOT the `cautionDates: []` rule. `withMerges` is the one writer and it does the delete. Two existing browser cases `assert.deepEqual` a whole table block, and every table stored before the field existed has no such key, so writing `merges: []` would break both for nothing.
- **Merging hides covered text; it never clears it.** `rows` stays rectangular and a covered cell keeps whatever was typed in it, so unmerging is a **restore, not a recomputed guess** — the same reasoning as `blockOff`. That is also why merge and unmerge take no `window.confirm`: nothing is deleted or cleared, so they sit outside the destructive-control rule, while `− row` and `− col` still prompt because those do drop text.
- Every row/column change goes through `withRows`, which re-normalises against the new bounds. A region that lost a row is **CLAMPED**, not dropped; one clamped down to a single cell is dropped, because a 1x1 merge is not a merge. `normalizeMerges` also drops out-of-bounds origins and overlaps, first-wins, so the result never depends on iteration luck.
- `merges` is deliberately **not** validated in `schema.js`, which checks `docPages: 'list'` and no block shape at all. Gating one block field and not the others would invent an inconsistent rule; `doc-table-core.js` pays for that instead, reading every nested value through a helper that cannot throw — a throw here escapes a React render and empties the whole page.

The `::: track-table` paste format is the other half of that file. Markers occupy **real cells** — `<<` for a cell merged leftward, `^^` for one merged upward — so the text stays rectangular and a row with the wrong cell count is **detected and refused against its line number**, never guessed at. That is the whole argument for the format, and `parseTableText` returns nothing half-parsed: `ok === false` means insert nothing. It is also lenient where leniency is free — the fence and the outer pipes are optional and a markdown separator row is skipped — so an ordinary markdown table pastes with no extra code.

A `trueStorages` item is a **storage**, owned by `true-storage.html`, and it may carry `tags` — each one naming a **pair**: a source-dump leaf (`dumpId`) and one MM linked inside it (`mmId`). Four rules follow, and the first is the load-bearing one:

- The comparison that decides which storages belong to a pair has exactly **one** definition, `TrackTrueStorage.storagesForLink` in `true-storage-core.js`, and the tag record's shape has exactly one, `withTag`. `sir-ks02.html` draws an mmLink's content at **four** sites — the source-dump leaf card, the S&C tab for a leaf MM, the S&C tab for a non-leaf MM, and `DescendantSCNode` — and every one of them renders the shared `StorageTags` component through the single `renderStorageTags` helper. Never spell `t.dumpId === … && t.mmId === …` at a call site. This rule is written from a shipped bug in a different feature with the identical shape: the deadline caution predicate was spelled out at three sites, one dropped half of it, and the timeline mismarked every due day until it was found. `tests/browser.test.js` therefore asserts **negatively** at each surface — a chip must be absent under the other MM in the same dump, and absent under the same MM in another dump.
- `trueStorages` and `trueStoragePos` are owned by `true-storage.html` and must never join `sir-ks02.html`'s `_writeSlotKeys` autosave patch, which is built from that page's React snapshot. KS02 may add or remove a tag, and only through `_mutateSlotKey` — a fresh read-modify-write of that one key. `true-storage.html` is the mirror image: it reads `sourceDumps` and `mms` and writes neither.
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
  `true-storage-core.js` `buildTree`, `sir-ks02.html` `getAncestors`, `getDescendants`,
  `dumpPathTo`, `deleteDumpEntry.collect` and `SrchView.buildTree`.
- The radial canvas layout has exactly **one** definition, `graph-layout.js`, loaded by
  `sir-ks02.html` and `true-storage.html` as a one-line delegate each. It was ~120 duplicated lines
  per page, which meant the cycle guard above had to be written twice — the same duplication shape
  that cost this project the deadline caution predicate. Do not re-inline it, and do not add a
  second copy for a third canvas.
- Source dumps are a **different** graph: `parentId` is singular, so a dump inside a cycle has its
  one parent inside that cycle and is nobody's descendant. Downward walks cannot reach one; only
  the upward breadcrumb walk can, because it starts wherever it is asked to. That walk is
  `dumpPathTo` and it has one definition — it used to be spelled twice, guarded at one site and
  unguarded 300 lines away at the other.
- `parentIds` and `tags` are deliberately **not** validated in `schema.js` beyond the object-item check every list field gets. `mms` carries the identical `parentIds` exposure and is not validated either, so gating one and not the other would invent an inconsistent rule. `true-storage-core.js` pays for that instead: every nested list is read through a helper that cannot throw, and `buildTree` terminates on a parent cycle.

A storage's `link` is at most **one**, and clearing it **deletes the key** rather than storing `''` — the same absence-is-meaningful rule as a day note's `time`. A storage that never had a link and one whose link was cleared must be the same state.

Ids for new records come from `TrackStorage.newId()` in `storage-guard.js`. `progress.html`'s `uid()`, `documentations.html`'s `genId()`, `true-storage.html`'s `genId()` and `notes-widget.js`'s `generateId()` are delegates with a local fallback; do not reintroduce a page-local id shape. `sir-ks02.html` keeps its numeric `nid()` counter for its own records — which is also why a storage id must stay a string: a tag holds one id of each kind, and the two counters must never be able to collide. Never rewrite a stored id.

Every **read** of `track_db` must go through `TrackStorage.loadDB()` from `storage-guard.js`, never a bare `JSON.parse(localStorage.getItem('track_db') …)`. All six readers — `getDB` (`index.html`), `_getTrackDB` (`progress.html`, `sir-ks02.html`, `documentations.html`, `true-storage.html`) and `_twDB` (`notes-widget.js`) — are one-line delegates. `JSON.parse` does not throw on `'null'`, `'42'` or `'[…]'`, so a hand-rolled `try/catch` around it is not a check. Three rules follow:

- `loadDB` validates; it never repairs. Nothing may run `normalizeSlot` over already-stored slots — that is a migration, and it belongs behind the `schemaVersion` that does not exist yet.
- Never write while `TrackStorage.dbBlocked()` is true, and never work around it. A malformed database must stay byte-identical and recoverable; `saveDB` enforces this, and any new bootstrap or auto-create path must return early on it rather than rely on the write being silently refused.
- A root object with no `slots` key is **not** damage — it is a bare `{}` or the pre-unified legacy `{progress, ks02}` shape, and it must reach the migration IIFEs intact. Classify it before validation, never by it.

Every write of `track_db` must go through `TrackStorage.saveDB(db)`, never a bare `localStorage.setItem('track_db', …)`. It returns `false` when the browser quota rejected the write or the stored database is unreadable, so both are a visible banner instead of an uncaught throw out of a React effect. Three more rules follow:

- Do not make `storage-guard.js` patch `Storage.prototype.setItem`. `firebase-sync.js` owns that patch and calls the captured native `_origSet` before it marks `track_db_pending` and arms the upload debounce. The guard must stay a plain function that dispatches through the patch, so a quota throw aborts before any upload is armed for a write that never landed.
- Do not route `firebase-sync.js`'s own `_origSet` calls through the guard. Those deliberately bypass its patch, and a swallowed failure there would let `_flush()` treat an unwritten value as confirmed.
- A caller whose next action is destructive or claims initialization succeeded must check
  the return value. Remove a legacy source key or mark a bootstrap ready only after
  `saveDB` returns `true`; a refusal or thrown error leaves the source and the unready UI
  intact.

Other current browser keys include:

- `track_theme`
- `track_db_ts` — when this device's data was last **confirmed** in the cloud, written only after the server accepts a write
- `track_db_pending` — set while this device holds unsent edits, cleared on confirmation
- `trackPriorityMatrix`
- `fb_reloaded` and `fb_reloaded_gen` in `sessionStorage`
- legacy Progress and KS02 keys used during migration

Firebase uploads the complete serialized database gzipped and split across `users/{uid}` (manifest) plus `users/{uid}/blob/{0..n-1}` (payload chunks), committed in one atomic batch. `users/{uid}/backup/v1` holds a one-time copy of the pre-migration legacy document. Readers verify chunk count, per-chunk generation, byte length, and checksum, and refuse a payload rather than partially applying it. See README "Current cloud shape".

Three rules follow from this:

- Never write `track_db_ts` before a cloud write is confirmed. Doing so leaves the local timestamp ahead of the remote one after a failure, which makes the resolver prefer stale local data forever.
- Never auto-apply a remote payload while `track_db_pending` is set. Surface the choice instead, and freeze uploads until the user resolves it — otherwise the debounce armed by the edit that caused the conflict fires moments later and pushes local anyway.
- Changing a Firestore path requires a matching block in `firestore.rules` **and** an explicit hand-off asking the user to publish it. Rules are versioned in this repository but are not deployed from it, and they do **not** cascade into subcollections — a path added without its own block fails every write with `permission-denied` while reads of the parent document keep succeeding, so the code looks correct and sync is silently dead. Never edit the live rules yourself; print the block and stop.

## Non-Negotiable Data-Safety Rules

### Search every persistence boundary

Before changing a stored field, use `rg` across:

```text
index.html
progress.html
sir-ks02.html
documentations.html
true-storage.html
calendar-core.js
storage-guard.js
firebase-sync.js
notes-widget.js
true-storage-core.js
graph-layout.js
doc-table-core.js
```

Inspect every applicable:

- Default constructor.
- Reader.
- Writer.
- React initialization.
- React save effect.
- Migration.
- Importer.
- Exporter.
- Cloud synchronization path.
- Derived calculation.

Do not patch only the first visible use.

### Treat schema changes as cross-page changes

Even if the visible request concerns one page, a change to `track_db` may affect all three pages and both shared scripts.

For a new or changed slot field, verify:

- New slots receive a safe default.
- Existing slots receive a safe fallback or migration.
- Export includes it.
- Import restores it.
- Other fields survive writes from both React pages.
- Firebase serialization still includes it.
- Relevant documentation is updated.

### Preserve old data

Migrations must be:

- Deterministic.
- Guarded against repeated execution.
- Non-destructive unless the user explicitly requested destructive cleanup.
- Compatible with missing or partial legacy fields.

Never use real personal exports as test fixtures. Use synthetic data with the same shape.

### Preserve unrelated fields

Do not rebuild a slot from a partial allowlist unless that is the explicitly tested normalization policy.

Every page now writes **only the keys it owns**, merged into a fresh read of the stored slot, and refreshes from `storage` and `visibilitychange`. No page rebuilds a whole slot from its own React snapshot; `README.md` holds the per-page ownership table. Two rules follow, and both are load-bearing:

- A new write must go through that page's single-key helper — `_writeP` (`progress.html`), `_writeSlotKeys` / `_writeSlotKey` / `_mutateSlotKey` (`sir-ks02.html`, `documentations.html`, `true-storage.html`). Assigning `db.slots = …` from component state reintroduces exactly the bug that cost day notes, deadlines and documentation pages.
- Writing a key the page does not own is a defect even when the value looks right, because the value came from a snapshot. If a page needs to change a foreign key, it does a fresh read-modify-write of that key alone.
- A refresh must move slot identity with the data snapshot. Progress and KS02 autosaves
  target the id whose fields are in React state, not a newly changed root `activeSlotId`;
  adopting another tab's slot means updating that loaded id in the same refresh, and a
  snapshot whose slot was deleted writes nothing. Otherwise a switch can save A's stale
  fields into B or B's refreshed fields back into A.

`tests/browser.test.js` asserts both directions for `sir-ks02.html`, including a field no page has heard of.

### Treat import/export as a contract

Any import/export change must test a round trip containing all affected user-owned fields.

At minimum, consider:

- Notes.
- Calendar notes.
- MM entries.
- Source dumps and nested IDs.
- Goals and linked tasks.
- Schedules and routines.
- Mind maps.
- Kolb records.
- SIR sessions.
- MG records and schedules.
- Layout positions.
- Level templates.

Invalid input must fail without modifying the existing database.

### Treat synchronization as concurrent

A single-tab render test is not enough for synchronization changes.

Consider:

- Two tabs with stale in-memory state.
- Progress and KS02 open simultaneously.
- A remote update arriving while local edits are pending.
- A failed Firestore write.
- A tab closing during the debounce window.
- Device clock differences.
- Offline/local-only use.

Do not describe sync as conflict-safe unless these cases are actually handled and tested.

### Confirm before deleting or clearing stored data

Every control that deletes or clears data in `track_db` must ask first, through a
native `window.confirm()`. There is no undo in this application, so the prompt is
the only barrier between a stray click and lost work.

Placement is not a style choice — it is the rule that keeps the guard from being
forgotten at one site:

- **In the handler** when every path through it is destructive. A call site added
  later inherits the prompt rather than having to remember it.
- **At the call site** when the handler also serves a non-destructive path, or is
  a pure tree function that must stay pure.

`removeMilestoneEntry` is reached from three buttons and `onUnlinkTask` from four,
which is exactly why their prompts live in the shared handler. Where a call-site
prompt is required it is because a handler-level one would be *wrong*:
`toggleMGDay` both adds and removes and also serves two deliberately unconfirmed
toggles, `onUpdateDate` also sets dates, and `deleteNode` and `removeDissectChild`
are pure tree functions with other callers. This is the deadline-caution failure
shape again — one rule spelled at several call sites and dropped at one — so when
you move a prompt into a handler, **delete the call-site copy in the same edit**
or the user gets two prompts for one click.

Two further rules:

- A guard that writes before it asks is not a guard. Where a write reaches
  `track_db` immediately rather than through a React autosave snapshot — KS02's
  `untagStorage` and its `_mutateSlotKey` call is the one such case — the prompt
  must gate the **call**, not a later state update.
- Prompt **after** an existing no-op guard, never before it. `− row` and `− col`
  already refuse to drop the last row or column; asking first would make a button
  that does nothing still demand an answer.

Not every `✕` is in scope. Pure-dismiss controls — closing a modal, cancelling a
form — stay one click. So do three deliberate exclusions, each pinned by a browser
case: the four detach `⊗` chips, the two MG schedule `✓` toggle-offs
(`progress.html`), and the emoji icon `Clear` (`documentations.html`). Do not
"make it uniform" without re-deciding those on purpose.

`tests/lib/cdp.js` answers dialogs automatically and accepts by default; set
`page.rejectDialogs = true` around a click to press Cancel. A new confirmation is
tested on its **Cancel** path — that the stored bytes are unchanged — because a
prompt that displays and then deletes anyway is worse than none.

### Use local calendar dates

For user-visible days, do not add new uses of:

```js
new Date().toISOString().split('T')[0]
```

That expression returns a UTC day. Use or introduce an explicit local calendar-date helper and test it near midnight in the user's timezone.

## Required Workflow

### 1. Preflight

Run:

```bash
git status --short --branch
```

Then:

- Identify modified and untracked files.
- Treat existing changes as user-owned.
- Read the relevant sections of README and NOTES.
- Read the relevant source before proposing edits.
- Check whether a more specific nested `AGENTS.md` exists.

Do not discard or rewrite unrelated work.

### 2. Clarify only when necessary

Make reasonable, reversible assumptions when the repository provides enough context.

If a missing choice would materially change the result or create a data risk, stop and ask a structured question:

**[Topic]** Short label.

**Question:** One clear question?

**Options:**

- **Option A (Recommended)** - Meaning and impact.
- **Option B** - Trade-off.
- **Option C** - Alternative, when useful.

Always allow the user to describe a custom preference. Do not proceed past a genuinely blocking choice.

### 3. Map the change

Classify the request:

- UI only.
- Shared style.
- React state.
- Data schema.
- Migration.
- Import/export.
- Date behavior.
- Local persistence.
- Firebase sync.
- Mouse/touch interaction.
- Documentation only.

Use `rg` for searches. Prefer targeted reads instead of repeatedly loading an entire multi-thousand-line HTML file.

#### Reading file slices

Read a line range with the `Read` tool's `offset` and `limit`. Do not shell out to:

```bash
awk 'NR>=5378 && NR<=5402' progress.html
sed -n '300,500p' progress.html
python3 -c "print(''.join(open('progress.html').readlines()[300:500]))"
```

Each of those requires a new permission rule that can only ever match one line range again, so the allowlist grows without becoming more useful. `Read` needs no rule and returns numbered lines.

Search with `Grep` or `rg`, not bespoke `perl -ne` or chained `grep -v` one-liners.

### 4. Plan risky cross-cutting work

Use a short working plan for tasks that cross multiple data or UI boundaries.

The plan should put safeguards before structural edits. For example:

```text
Capture current behavior
→ add or identify a reproducible case
→ change data logic
→ update all persistence boundaries
→ verify browser behavior
→ inspect final diff
```

Do not begin a large refactor merely because the current files are large. Refactor only within the requested scope or with explicit user direction.

### 5. Edit safely

- Use patch-based edits for source and documentation.
- Preserve existing formatting where practical.
- Keep one behavioral concern per change.
- Avoid bulk rewrites of the large HTML pages unless the task requires them.
- Do not create duplicate helpers when an equivalent one already exists.
- Do not silently change persisted meanings.
- Do not expose personal data, credentials, or local exports.

### 6. Run fast checks

For changes affecting shared JavaScript:

```bash
node --check theme.js
node --check schema.js
node --check storage-guard.js
node --check calendar-core.js
node --check firebase-sync.js
node --check notes-widget.js
node --check true-storage-core.js
node --check graph-layout.js
node --check doc-table-core.js
```

Then run the committed suite — it is the only automated check that sees the inline JSX, because it executes it:

```bash
node tests/run.js
```

It runs `tests/calendar-core.test.js` and `tests/schema.test.js` under five timezones (UTC+14 through UTC-11), then `tests/true-storage-core.test.js` once (no date code in it), then `tests/browser.test.js` in headless Chrome. Rules for working with it:

- Fixtures are synthetic, always (`tests/lib/fixture.js`). A real personal export is never test data.
- A bug fix in a covered area adds or extends a case, and **the new case must be seen failing first**. `TRACK_TEST_ROOT=<dir>` serves a scratch directory instead of the repository, so you can symlink the repo plus the one pre-fix file and watch it fail. Never put a baseline copy in the repository.
- No new dependencies, no `package.json`, no runner config.
- A missing Chrome fails the run; it is never reported as a pass.

For all source changes:

```bash
git diff --check
git diff --stat
git diff
```

Use additional targeted commands as appropriate.

`node --check` does not validate the inline JSX in the HTML pages.

### 7. Run a browser smoke test

For changes affecting runtime HTML, scripts, CDN tags, React code, storage initialization, Firebase, or the notes widget:

1. Start a local server:

   ```bash
   python3 -m http.server 8765 --bind 127.0.0.1
   ```

2. Check:

   ```text
   http://127.0.0.1:8765/index.html
   http://127.0.0.1:8765/progress.html
   http://127.0.0.1:8765/sir-ks02.html
   http://127.0.0.1:8765/documentations.html
   http://127.0.0.1:8765/true-storage.html
   ```

3. Verify:

   - Home content appears.
   - All React roots are non-empty.
   - No white screen occurs.
   - Firebase reaches a sign-in, offline, or signed-in state.
   - The notes widget mounts.

4. Stop the server and remove only task-created temporary browser profiles.

If environment restrictions prevent a browser check, report the missing verification rather than claiming success.

### 8. Run change-specific checks

#### Slot, schema, or migration

- Empty database initialization.
- Existing/legacy data loading.
- New slot creation.
- Slot switching.
- Reload.
- Export/import round trip.

#### Progress, goals, or milestones

- Add and edit.
- Nest or reorder.
- Complete and revert.
- Reload.
- Open corresponding references from KS02 when applicable.

#### KS02, mind maps, Kolb, SIR, or MG

- Add and edit.
- Connect references.
- Reorder when applicable.
- Reload.
- Confirm derived data in Progress when applicable.

#### Schedule or drag interactions

- Mouse.
- Touch.
- Expansion/collapse.
- Near-edge behavior.
- Adjacent dates.
- Persistence after reload.

#### Notes

- Create.
- Edit.
- Delete.
- Switch slot.
- Reload.

#### Sync

- Local-only/offline path.
- Two tabs.
- Progress and KS02 concurrently.
- Remote-change behavior when Firebase access is available.
- Visible failure or retry behavior when changed.

#### Dates

- Local midnight.
- Month boundary.
- Year boundary.
- Addition/subtraction of days.

### 9. Update documentation

After implementation:

- Put resulting current behavior and commands in `README.md`.
- Keep remaining proposals and alternatives in `NOTES.md`.
- Update `AGENTS.md` only for durable operating rules.

Do not copy the same long explanation into all three files.

### 10. Final review

Run:

```bash
git status --short
```

Confirm:

- Only intended files changed.
- No user changes were removed.
- No task-created temporary files remain.
- No personal fixture or credential was added.
- Checks applicable to the change passed.
- Unrun checks are explicitly identified.

Report the outcome first, then summarize changes and verification.

## Git Safety

Read-only Git commands are allowed for normal inspection.

Do not perform any of the following without explicit user approval at the point of action:

- `git commit`
- `git reset`
- `git restore`
- `git checkout`
- `git switch`
- `git clean`
- `git merge`
- `git rebase`
- branch, tag, stash, worktree, remote, or history changes

Never use broad commands such as:

```bash
git restore *
```

The local Claude settings previously authorized this pattern, but project work must still treat it as destructive.

Staging with `git add` is reversible, but do not stage unless it is useful to the requested workflow. Never imply an untracked file is part of a commit.

## Dependencies, Network, and External Systems

Ask for explicit approval immediately before:

- Installing or upgrading dependencies.
- Adding a build tool that requires package installation.
- Downloading and executing code.
- Modifying Firebase, hosting, GitHub, or another external service.
- Deploying.
- Changing Firestore rules in the live project.
- Writing outside the repository.

Read-only inspection and local verification are allowed when within the environment's permissions.

Do not treat a feature request as authorization to deploy or modify cloud state.

## File and Directory Safety

- The repository root is the active workspace.
- Do not write into neighboring repositories.
- Use `/tmp` only for task-owned temporary artifacts.
- Resolve and inspect exact targets before deletion.
- Do not delete whole project files or directories without explicit approval.
- `.claude/settings.local.json` is machine-local and should not be committed.
- Empty `.agents/` or `.codex/` directories have no Git effect; do not spend task time reorganizing them unless requested.
- Do not commit browser profiles, exports, Firebase caches, or generated build output unless the project explicitly adopts and documents them.

## Current Verification Baseline

As of 2026-08-05:

- `theme.js`, `storage-guard.js`, `firebase-sync.js`, and `notes-widget.js` passed `node --check`.
- The `localStorage` quota guard passed 43 headless assertions against a synthetic slot: all five pages mount with `window.TrackStorage` present; with the real quota exhausted, `TrackStorage.saveDB` returns `false`, the banner appears, the stored `track_db` stays byte-identical and still parses, no false `track_db_pending` is written, no React root is torn down, and the workspace survives freeing the quota and reloading. The banner is hidden under print media. A further 9 assertions confirmed the guard composes with `firebase-sync.js`'s `Storage.prototype.setItem` patch rather than replacing or bypassing it, and that a non-quota error is rethrown.
- Not verified for the quota guard: the signed-in Firebase write path, which needs a live account. The reasoning there is structural — `firebase-sync.js` calls `_origSet` before its dirty-tracking lines, so a quota throw cannot arm an upload.
- Home, Progress, KS02, Documentations, and Notifications loaded in headless Chrome with a seeded synthetic slot; every React root non-empty, no white screen, no page errors beyond the expected Tailwind/Babel CDN warnings.
- Firebase reached the authentication overlay and the offline "Skip" path left the sync code inert (`TrackSync.getStatus().state === 'signed-out'`, no banner, no Firestore requests).
- `window.TrackSync.selfTest()` passed in-browser across four configurations (auto/gzip, forced raw, and both at a 64-byte chunk size to force multi-chunk).
- The codec round-tripped synthetic ASCII, Thai combining marks, CJK, astral-plane emoji, a 300 KB base64 data-URI, and empty input, in gzip and raw mode, at 700,000-byte and 64-byte chunk sizes. Flipped bytes, truncation, empty chunks, extra bytes, wrong length, wrong checksum, and unknown encodings were all refused rather than partially applied.
- The sync write/read paths were driven against an in-memory Firestore double: legacy→v2 migration with a one-time `backup/v1`, fresh-account first write, local-newer push, a 2.67 MB payload splitting into 4 chunks and round-tripping exactly, stale chunk deletion on shrink, a wrong-generation chunk refused without touching `localStorage`, a rejected write leaving `track_db_ts` unchanged with a visible error banner, a genuine remote change applied with the reload banner, and a remote change arriving during unsent local edits raising the conflict banner without clobbering the local copy and without auto-pushing past the debounce (verified by commit count, including further edits made while the banner was up).

- Permanent-vs-transient sync failure passed 33 headless assertions against the same double, with the `blob` and `backup` subcollections rejecting `permission-denied`: the banner names the code and `firestore.rules` and never claims a retry, no retry timer is armed and no further attempt occurs after 7 seconds, `track_db` stays byte-identical, `track_db_ts` is not written, `track_db_pending` stays set, and the cloud keeps only the legacy document. "Retry now" makes exactly one further attempt; once the double stops rejecting, the same button completes the legacy→v2 migration with `backup/v1` holding the pre-migration payload. An `unavailable` rejection still says "Retrying…", still arms the 5-second timer, and still retries on its own.

Not verified: behavior against the live Firebase project, which needs `firestore.rules` published in the console and explicit user authorization. Real multi-device and touch interaction were not exercised.

This is a render-plus-sync-logic baseline, not proof of full behavioral correctness.

### Repeatable from 2026-08-06

Everything in this section that is not `node tests/run.js` was run once and cannot be re-run. The committed suite is the reproducible part:

```bash
node tests/run.js
```

132 offline cases per timezone (80 calendar and 52 schema) under five timezones (UTC,
UTC+14, UTC-11, America/Los_Angeles, Asia/Kathmandu), plus 131 headless-Chrome
subtests, across 13 suites. On 2026-08-22 a full run on an idle machine passed all
13 suites, the TOUCH sidebar cases (browser 125-131) included — they were the test
half of a feature written before its implementation, and both halves are now in the
working tree. A run overlapping another session's suite on the same machine lost
cases 123-131 to `CDP connection closed`; they passed on the idle re-run, so treat
a browser-layer failure as a resource symptom until the machine is confirmed quiet.
The original two
`sir-ks02.html` regression cases were confirmed to **fail** against the pre-fix page
served through `TRACK_TEST_ROOT`. The cross-tab active-slot, ambiguous-slot-identity,
malformed recursive-goal, and dangling-writer cases added on 2026-08-10 were also
recorded failing first.

### Hardened `track_db` readers (2026-08-08, extended 2026-08-10)

- Repeatable browser cases cover every reader surface. Invalid JSON, unsafe root/slot
  kinds, missing or duplicate slot ids, wrong canonical kinds/items, and malformed
  recursive goal shapes block while the original bytes remain untouched. A dangling
  `activeSlotId` and semantic date/time flaws warn and stay editable.
- The banner offers the exact raw bytes, a missing key and healthy database remain quiet,
  and the notes widget cannot bootstrap over damaged data.
- Repeatable cases also cover nonempty legacy-slot normalization, cross-tab active-slot
  switches in Progress and KS02, Progress realigning a dangling pointer to the slot it
  displays, legacy global notes surviving a refused adoption, and Documentations reporting
  a refused empty-slot bootstrap rather than claiming a phantom workspace.
- Not covered: a **real** legacy `{progress, ks02}` install. That shape is classified `ok`
  and passed through untouched so its migration IIFE still sees it; legacy paths use
  synthetic keys.

### Canonical slot schema (2026-08-08, extended 2026-08-10)

- `schema.js` passes `node --check`; `tests/schema.test.js` contributes 48 offline cases, identical under all five swept timezones.
- Six browser cases were seen failing against the pre-change pages before the fix: the four `window.TrackSchema` smoke assertions, canonical shape from every entry point (`index.html` built 13 of 21 fields), local-day `createdAt` and a collision-free id (with `Date.now` frozen, both workspaces got the identical id `slot-1786180119615`), unknown-key survival through import, refusal of a wrong-typed field (`{"goals":"hello"}` imported silently and would break the calendar on the next load), and a synthetic legacy install migrating into a complete slot (10 of 21 fields).
- The `index.html` cases were re-confirmed through a `TRACK_TEST_ROOT` scratch directory of symlinks plus the single pre-change `index.html`, with the other 20 browser cases still passing.
- Not covered: real touch hardware, the live Firebase project, and a **real** legacy install. The legacy rescue path is exercised only against synthetic pre-`track_db` localStorage keys — it runs once per user and can never run again, so that residual risk is real and is not claimed as covered.

### Choosable deadline caution period (2026-08-10)

- Eight new browser cases. The regression case — **the timeline must not mark a deadline as caution on its own due day** — was seen **failing first** against the untouched working tree: `1 !== 0` on the amber `!` count for a deadline due today with a two-day run-up, while the red due line rendered as expected. Its guard case (a run-up day still carries exactly one `!`) passed both before and after, so the fix narrows the set rather than emptying it.
- The cause was triplication: `d.date !== ds` was spelled out at two of the three call sites and forgotten at the third. It now lives once, inside `deadlinesCautionOn`, matching `deadlinesCaution` in `calendar-core.js`. `inCaution` has exactly one caller.
- The popup's inline caution picker: present in the **read** view rather than behind `Edit`, seeded to the due day, `max` capped at the due day. A pick writes `startDate` and leaves `docPageId`, `createdAt`, `date` and `time` untouched; the span readout updates in the same render. `''`, a date after the due day, and `'nonsense'` are each **refused** with `track_db` staying byte-identical, so `startDate` is never blank and never inverted. A quick-set writes the date named in its own tooltip, and `reset` returns the start to the due day.
- `progress.html?date=…&dl=<id>#schedule` opens that deadline's popup; `&dl=` naming no stored deadline opens nothing and raises no error.
- Home's `⏰` and `!` chips are `<a>` elements pointing at `progress.html?date=<due day>&dl=<id>#schedule` — the **due** day from a caution day, not the day the chip sits on.
- A Documentations caution row's text is a button that moves the block to the due day, where a page-owned deadline shows its `✎`/`✕` and the due day is not also listed as a caution.
- All eight pass both against a fresh browser and in the complete 2026-08-10 suite.
- Not covered: real touch hardware, the live Firebase project, and print output of the picker.

### Tickable deadlines (2026-08-10)

- Four new offline cases and six new browser cases. All six browser cases were seen **failing first** against the untouched working tree, and three of the four offline ones failed there too; the other offline case is a guard — it asserts `dlStart`, `dlDayCount` and `dlInCaution` are *unchanged* by a tick, so it must pass on both sides.
- The load-bearing check was run separately and is worth repeating for any future change here. A scratch `TRACK_TEST_ROOT` was built from symlinks to the repository plus **one** doctored `progress.html` with `!dlDone(d)` removed from `deadlinesCautionOn` and nothing else altered. Against it, the timeline case and the month-grid/day-panel case **failed** while the Home and Documentations cases **passed** — which is the proof that `progress.html` genuinely needs its own copy of the predicate (it does not load `calendar-core.js`) and that the per-surface assertions catch a forgotten one instead of letting it hide behind a passing sibling. Never place such a baseline copy in the repository.
- What the browser cases assert: the popup tick reaches `track_db` as `done: true` while `docPageId`, `createdAt`, `startDate`, `time` and `title` all survive, and untick leaves the span untouched; ticking clears the timeline `!` and unticking restores exactly one; ticking clears the month-grid and day-panel `!` **asserted separately**, leaving the deadline drawn on its due day with a `✓`; the day-panel checkbox writes the same field as the popup; Home shows no `.cal-sched-dl.caution` on a run-up and a `.cal-sched-dl.due.done` `<a>` with an unchanged `href` on the due day; a Documentations block shows no caution row and no `cal-doc-caution-day` cell bar, and its owning page's `Untick` button clears the flag with the record intact.
- `done` round-trips through export → import without either side naming it: the existing export case now seeds a ticked deadline, and it reached the other side on `normalizeSlot`'s unknown-key path.
- Not covered: real touch hardware, the live Firebase project, and print output.

### Movable deadline due date (2026-08-10)

- Five new browser cases and one new offline guard. **All five browser cases were seen failing first** against the untouched working tree, each timing out on `waitFor` for a `Due date` row that did not exist, while the other 68 subtests passed — including `assert.equal(saved.date, due, 'the due day itself did not move')`, which guards the read-view caution picker and must keep passing on both sides. Because the pre-change file *was* the working tree at that moment, this needed no `TRACK_TEST_ROOT` scratch directory.
- The offline case is a **guard**, and passes on both sides by design: it pins what an inverted span (`startDate > date`) actually does — `dlDayCount` returns `-1` rather than `NaN`, `dlInCaution` is false for every day so `deadlinesCaution` empties entirely, `daysBetween` returns `[]` instead of spinning, and `dlValid` is the single check standing between a draft and that state. It exists so the cost of dropping the ordering check stays visible rather than being rediscovered.
- What the browser cases assert: the row is seeded from the stored due day with `min` at the caution start; a move writes `date` while `startDate` stays put and `id`, `createdAt`, `docPageId`, `done`, `time` and `title` all survive the spread; a due day before the caution start disables Save, shows the reason, and leaves `track_db` byte-identical; a cleared due day does the same under its own message and does **not** also claim the caution start is out of order; the `!` run-up re-homes so the old due day becomes a run-up day and the deadline is drawn once on its new day; and a cross-month move re-anchors both the timeline day label and the month grid.
- The blank-date case earned its place immediately — it caught a real defect. The first implementation gated the ordering warning on `startDate > date` alone, on the reasoning that a blank date makes the comparison false. It does not: every non-empty string sorts above `''`, so both messages rendered at once. The ordering line is now gated on there being a due day at all.
- 50 further assertions were run once from a task-owned script and cannot be re-run: all five pages mount with a non-empty root, `TrackStorage.loadDB`, the notes widget (`#nw-btn`), a `signed-out` sync state and no page errors; a **year**-boundary move (2026-12-20 → 2027-01-05) keeps `startDate` on 2026-12-14 and moves the timeline to "Tuesday, January 5, 2027" and the grid to "Jan 2027"; an open day panel follows to `Jan 5` while a closed one stays closed; a `?date=` link built before the move still opens the popup on the current due day; and the moved record still passes `TC.dlValid` against the draft `documentations.html` seeds from it, with `dlDayCount` reading a positive 23 — the direct check that no inverted span reached storage.
- Not covered: real touch hardware, the live Firebase project, and print output of the new row.

### True Storage and per-pair source-dump tagging (2026-08-15)

- One new offline suite (`tests/true-storage-core.test.js`, 17 cases, run **once** rather than swept — the module holds no date code) and ten new browser cases. `schema.js` grew two rows, so the slot went from 21 to 23 fields; `tests/schema.test.js`'s hand-written CONTRACT, `tests/browser.test.js`'s copy of it, and `tests/lib/fixture.js` all had to follow, which is exactly what those hand-written lists are for.
- The **fail-first proof** is the important part, and it was run against two doctored baselines rather than one, because the failure this design prevents has two symmetrical halves. Each scratch `TRACK_TEST_ROOT` held symlinks to the repository plus **one** doctored `sir-ks02.html` whose `StorageTags` re-spelled the match at the call site instead of calling `TrackTrueStorage.storagesForLink`:
  - **Forgetting the MM half** (`t.dumpId===dump.id` alone): three cases failed — "a tag lands on its own pair and on no other" (`['ts-1']` became `['ts-1','ts-2']`), "the chip is drawn on the non-leaf S&C branch and inside a descendant node", and "a tag added from KS02 is a fresh read-modify-write" — while "the chip is drawn in the MM detail S&C tab, per pair" **passed**, because that case's seed has only one tagged storage and no second storage to bleed through. 80 of 84 subtests passed.
  - **Forgetting the dump half** (`t.mmId===link.mmId` alone): a different three failed — "a tag lands on its own pair and on no other", "the chip is drawn in the MM detail S&C tab, per pair" (`d-2:10` returned `['ts-1']` instead of `[]`), and "the chip is drawn on the non-leaf S&C branch and inside a descendant node". 81 of 84 passed.
  - The two sets **overlap but neither contains the other**, which is the whole argument for asserting negatively at each surface instead of once: the leaf S&C case catches only the dump half, the KS02 read-modify-write case catches only the MM half.
- Never place either doctored copy in the repository.
- What the browser cases assert: a storage created from `+Storage` is stored with a string id, `parentIds: []`, `tags: []` and a **local**-day `createdAt`, and survives a reload as the same record; the tree reorders siblings and **refuses** a drag onto a non-sibling; a tag written from True Storage appears in KS02 under its own MM and nowhere else, across two dumps and two MMs; the same chip appears in the leaf card, the leaf S&C tab, the non-leaf S&C branch and `DescendantSCNode`, each asserted separately; a tag added from the KS02 picker preserves a storage written by another writer between mount and click, which is the read-modify-write proof; a tag row expands, collapses, and links to `sir-ks02.html?dump=…&mm=…#ks03`; the single link is set, replaced, and cleared back to **no key at all**; the explanation is written on SAVE and not by typing; and `?storage=` / `?dump=` naming nothing open nothing and raise no error.
- `trueStorages` and `trueStoragePos` were added to the sentinel set in "KS02 writes no key it does not own", so an ordinary KS02 edit is asserted to leave both byte-identical.
- Export → import carries both fields, including a tag's `(dumpId, mmId)` pair and a storage's `parentIds`.
- Not covered: real touch hardware (the storage canvas's drag/pinch path and the tree's `⇅` handle were exercised only through synthetic events or not at all), the live Firebase project, and print output.

### Parent-cycle guards and the shared canvas layout (2026-08-15)

- One new offline suite (`tests/graph-layout.test.js`, 21 cases, run **once** — no date code)
  and eight new browser cases. The suite went from 13 to 14 registered suites; all 14 pass.
- The **fail-first proof for A1 is the extraction order**, and it is worth repeating for any
  future change here. `graph-layout.js` was created as a **verbatim** move of
  `sir-ks02.html:333-485` with the bug still in it, both pages were reduced to one-line
  delegates, and only then was the suite written and run. Result at that moment: **19 cases, 12
  passed, 7 failed**, and the split was exactly the predicted one — every acyclic case (single
  root, tree, diamond, disconnected components, dangling parent, custom radii) passed, which is
  what proves the extraction was faithful, while all **6** root-reachable cycle cases died with
  `RangeError: Maximum call stack size exceeded` inside `leafCount`. (The 7th failure was a
  defect in the test, not the product — see the test-authoring note below.) The guards were added
  afterwards; the suite is 21 cases now and all pass. Extracting first and guarding second is
  what made one run prove both things at once.
- One case passed on **both** sides and was expected to: a *pure* cycle with no root. Such a
  component has `roots.length === 0`, so the walk never starts and the crash never happens. Only
  a cycle **reachable from a root** enters the recursion. A test seeded with a rootless cycle
  proves nothing about this bug.
- The A1 **page-level** cases were proven separately, against a `TRACK_TEST_ROOT` scratch
  directory of symlinks to the repository plus **one** doctored `graph-layout.js` with
  `inProgress` and the `path.has(id)` guard removed and nothing else altered. Never place such a
  baseline copy in the repository.
- A2 was seen failing against the untouched working tree: `a cycle does not hang a non-leaf MM's
  S&C tab` timed out after 15s on the cyclic descendant walk, independently of the canvas.
- A3 was seen failing the same way, but only after a **test** defect was fixed first: the case
  looked for the create-title input without clicking `+ title`, so it timed out on the wrong
  step and would have "proved" the bug for the wrong reason. Its sibling guard case — a
  sub-title under an *untagged* dump leaves `trueStorages` byte-identical — passed on both
  sides by design, and is what pins `repointDump`'s same-reference short-circuit.
- Three test-authoring defects were caught in this task's own cases, all of the C-class kind
  worth naming: `applyRepulsion` was asserted to separate exactly coincident nodes (it cannot —
  identical coordinates give the push no direction, which is why the rootless-cycle catch-all
  now fans its leftovers instead of stacking them); the `+ title` interaction above; and a
  child asserted to inherit one mmLink when the fixture seeds two. In each case the product
  finding held and the assertion about it did not.
- Behaviour changed deliberately, beyond "does not crash": `getDescendants` gaining a `visited`
  set also **de-duplicates** a diamond descendant, which was previously pushed once per path and
  rendered duplicate S&C blocks. DFS pre-order is preserved, so S&C block ordering does not
  shift.
- Scope correction worth carrying forward: `TagPicker.renderEntry` and the downward dump walks
  were guarded for consistency, **not** against a reachable crash. `parentId` is singular, so a
  dump in a cycle is nobody's descendant and no root reaches it. Only the upward walk
  (`dumpPathTo`) is genuinely exposed, and nothing in the current UI creates such a cycle at
  all. The browser case asserts the unreachability explicitly, so a future re-parenting feature
  trips it instead of shipping a hang.
- Not covered: real touch hardware, the live Firebase project, and print output. Cycle
  *prevention* is deliberately not implemented — see NOTES Proposal 14.

### Day-note and deadline schedule blocks (2026-08-19)

- 16 new offline cases (`tests/calendar-core.test.js` and `tests/schema.test.js` go from 104
  to 120, swept under all five timezones) and 12 new browser cases. No `SLOT_FIELDS` row was
  added — the slot stays at **23** fields — so the hand-written CONTRACT lists and
  `tests/lib/fixture.js` needed no change, which is itself asserted.
- **Two of the offline cases are guards and pass on both sides by design.** One pins that a
  timed note with no `blockDuration` still yields the pre-field shape (`duration` 30 and a
  `metaLabel`, claiming no duration the user never entered); the other pins that adding a
  block changes neither the due list, nor the caution run-up, nor the `done` suppression, on
  any of the three days of a span. If either ever fails, the feature has stopped being
  additive.
- The **fail-first proof** was run against two doctored `TRACK_TEST_ROOT` roots, each holding
  symlinks to the repository plus **one** doctored file, because the failure this design
  prevents has two asymmetric halves:
  - `calendar-core.js` with the deadline span **re-spelled at the call site**
    (`{ time: d.time, duration: d.blockDuration }`, i.e. anchored to the wrong end) — the Home
    and Documentations cases fail while the Progress one passes, because Progress reads its
    own copy.
  - `progress.html` with the `noteTimed` guard **dropped from its copy** of
    `noteBlockDuration` — only `an untimed note carrying a stray blockDuration is still not on
    the grid` fails, while Home and Documentations pass.
  The two failure sets are disjoint, which is the whole argument for asserting each surface
  separately rather than once. Never place either doctored copy in the repository.
- **That second case exists because the first attempt at the proof failed to prove anything:**
  the doctored `progress.html` passed all 113 cases. The panel test seeds an untimed note with
  *no* `blockDuration`, so the doctored line is never reached — dropping the guard only shows
  up when a stray `blockDuration` is stored alongside a missing `time`, which is exactly what
  `documentations.html` can leave behind when it clears a note's time. A case was added for
  that and seen failing. The lesson generalises: a guard-clause test has to seed the state the
  guard is guarding *against*, or it passes on both sides and proves nothing.
- Behaviour deliberately **differs** between the two copies and is asserted that way: an
  unscheduled *timed* note is a point marker on Progress and a block on the read-only
  surfaces. Each keeps its own pre-existing behaviour; that is the invariant, not sameness.
- Drag and resize were verified from a **task-owned script**, not the suite — the committed
  suite has never simulated a drag, and adding one here would have been a new and fragile
  precedent. Confirmed by that script: a deadline block's vertical drag writes `blockTime`
  and leaves `date`, `time` and `startDate` byte-identical; its horizontal drag changes
  nothing; a note block's drag writes `time`. These cannot be re-run from `node tests/run.js`.
- Not covered: real touch hardware (the long-press-to-resize path on the new blocks was
  written to match the existing three kinds but exercised only through synthetic events),
  the live Firebase project, and print output of the new blocks and panel.

**Superseded on 2026-08-21** — blocks became automatic, the popup became one flat list, and
work became schedulable on any day. The entry above is kept because its *method* still
applies; its behavioural claims do not. See the next section.

### Blocks by default, on any day, from a flat popup (2026-08-22)

- The slot stays at **23** fields — `blockOff`, `blockDate` and a part's `date` are item-level
  keys inside two existing list fields — so the hand-written CONTRACT lists in
  `tests/schema.test.js`, `tests/browser.test.js` and `tests/lib/fixture.js` needed no change,
  which the normalize case asserts. Offline cases go from 120 to **131** (swept under all five
  timezones, identical results); the browser cases this task owns go from 113 to **119**, all
  passing. (The file also gained seven TOUCH sidebar cases from separate, in-flight work while
  this task was running; they fail because their feature is not built yet — see the repeatable
  baseline above.)
- **Fail-first evidence, part one: the eight reversed cases.** The working tree *was* the
  pre-change file, so no scratch directory was needed. The new offline semantics were written
  first and run against the untouched implementation: `tests/calendar-core.test.js` reported
  **13 of 79 failing** and `tests/schema.test.js` **1 of 52**, and the browser suite **8 of
  113**. Every guard case passed on both sides, as it must — the blockTime anchor, the midnight
  clip, `itemParts` tolerance, overlap layout, origin filtering, and the due-list/caution-run-up
  invariance case (extended here to cover `blockDate` and `blockOff` as well).
- **Fail-first evidence, part two: two doctored baselines, and their failure sets are
  DISJOINT.** Each `TRACK_TEST_ROOT` scratch directory held symlinks to the repository plus
  **one** doctored file whose `blockDay` ignored `blockDate` (`item => item.date`):
  - doctored **`calendar-core.js`** → `HOME: a block moved to another day` and
    `DOCUMENTATIONS refuses the same edit` failed; both PROGRESS cases passed.
  - doctored **`progress.html`** → `PROGRESS: blockDate draws the run-up on a caution day` and
    `PROGRESS refuses a caution period that would strand placed prep` failed; both read-only
    surfaces passed.

  Neither set contains the other, which is the whole argument for asserting each surface
  separately rather than once. Never place either doctored copy in the repository.
- **A defect in this task's own test, caught by that second baseline and worth carrying
  forward.** `PROGRESS: blockDate draws the run-up on a caution day` first asserted only the
  block **ids**, times and heights — and it **passed against the doctored file**. The week view
  has all seven columns in the DOM at once, so a block drawn on the wrong day is still in the
  list with the right id and the right hour; only the *column* distinguishes a moved block from
  an unmoved one. `data-block-day` was added to the rendered block and the case now asserts it.
  The lesson generalises and is the same one the 2026-08-19 entry records in a different shape:
  a case that cannot fail against the bug it names proves nothing, and the only reliable way to
  find that out is to run it against the bug.
- What the new browser cases assert, beyond the reversals: an item with **no block keys at all**
  is on the grid at 60 minutes on each of the three surfaces, with nothing written to storage;
  an untimed note blocks at **08:00** and never gains a `time` key; a timed note keeps its
  marker **and** its block, and a `blockOff` item keeps its marker and its due line while
  leaving the grid; `remove from schedule` writes `blockOff: true` and **deletes nothing**, so
  `＋ add block back` restores the stored length and anchor; the popup has **no**
  `data-dln-group` and lists rows flat in date-then-time order with each row showing its own
  date; a task added with a chosen day lands on that day, and a day outside a deadline's caution
  window disables `Add`, shows the reason and writes nothing when clicked anyway; and both
  refuse-to-strand cases assert the **Cancel path** — Save disabled, the offending day named,
  `track_db` byte-identical after clicking Save regardless.
- Export → import carries `blockOff`, `blockDate` and a part's own `date` on `normalizeSlot`'s
  unknown-key path, with neither side naming them.
- **Not covered, and weaker than the rest.** Drag was *not* re-verified for this change: the
  committed suite still simulates no drag, and the 2026-08-19 task-owned script that did cannot
  be re-run. So the new drag behaviour — a note block writing `blockDate`/`blockTime` instead of
  `date`/`time`, a part writing its own `date`, and a deadline ghost **clamped** to the caution
  window rather than pinned to its column — rests on code reading alone. That is the largest
  gap in this entry and it is a real one. Also not covered: real touch hardware, the live
  Firebase project, and print output.

### A full-screen sidebar, and tree drag by finger (2026-08-22)

- **No data-contract change at all.** The touch path calls the same three mutators the mouse
  path does — `nestPage`, `arrangePage`, `promotePageToRoot` — so the `docDescendantIds` cycle
  refusal and the splice logic keep one definition and cannot drift between pointer kinds. The
  slot stays at **23** fields, nothing was added to `SLOT_FIELDS`, and the new state
  (`sidebarFull`, the drag ref) is ephemeral and never reaches `track_db`. This adds **7**
  browser subtests; the offline suites are untouched and pass identically under all five
  timezones. All 13 suites passed on 2026-08-22.
- `styles.css` changed, so its `?v=4` went to `?v=5` in **all five** pages.
- **The fail-first evidence took two runs, and the first one was worthless — that is the part
  worth carrying forward.** All seven new cases were written against the untouched tree and all
  seven failed, which looked like proof and was not: every one died on the *same* message,
  `waitFor timed out — the sidebar page tree (with data-doc-row hooks)`. They were failing
  because a test hook did not exist yet, not because of the behaviour each names. The fix was to
  land the **hooks alone** as their own step — `data-doc-row`, `data-doc-handle`,
  `data-doc-root-drop`, and nothing else — and re-run. Only then did the failures become real:
  - `TOUCH: the nest handle …` → `the touch nest being saved`
  - `TOUCH: the arrange handle …` → `the touch arrange being saved`
  - `the handles are reachable …` → `a @media (hover: none) rule shows the row action cluster`
  - `the sidebar expands to full screen …` → `Cannot read properties of null (reading 'click')`

  This is the same lesson as the 2026-08-18 Supporting Actions case and the 2026-08-19
  guard-clause case, in a third shape: **read the failure message, never the pass/fail.** Seven
  identical messages are a signal that the cases are all blocked on one missing thing upstream
  of what they test.
- **Two of the seven are guards, not evidence, and they passed on both sides by design.**
  `a drag into the page's own subtree is refused` and `touchcancel abandons the drag` both
  assert `track_db` is byte-identical — which is trivially true when touch does nothing at all.
  They only became meaningful once the drag worked. `GUARD: the desktop mouse drag still nests
  and arranges` is the genuine both-sides guard: it **passed** the moment the hooks landed,
  which is what proved the hooks were right and the HTML5 path intact.
- **A defect in this task's own test, caught by the suite and not by the smoke script.** The
  full-screen case ended by asserting the picked page was open via
  `/Bravo/.test(editor.textContent)`. The editor renders a page title as an `<input>`, and an
  input's value is not part of `textContent`, so the assertion read `''` and failed against a
  page that had opened correctly. It reads `input[placeholder="Untitled"].value` now. The
  task-owned smoke script missed this because it never made that assertion — a narrower check
  passing is not evidence that a broader one will.
- **Two product defects were found by code reading before any test ran, and both would have
  shipped silently.** (1) `.docs-sidebar-full` is a single class, which *ties* the Tailwind
  utilities it has to beat on the same element (`w-60`, `p-2`, `bg-gray-900/60`, `border-r`) —
  and Tailwind's CDN injects its `<style>` into `<head>` **after** this file's `<link>`, so a tie
  goes to Tailwind and the "full screen" panel would have stayed 240px wide. The selector is
  `.docs-sidebar.docs-sidebar-full`. Any future rule in this file that overrides a Tailwind
  utility on the same element needs the same doubling. (2) React 18 registers `touchstart` at its
  root as **passive**, so a `preventDefault()` in `onTouchStart` is ignored and only logs an
  intervention. Stopping the browser's pan is `touch-action: none` on `.doc-row-handle`, which is
  declarative and applies before the first event; the `touchmove` listener is registered by hand
  with `{ passive: false }`, so `preventDefault` genuinely works there.
- Listeners are attached **imperatively inside the touchstart handler**, not from a `useEffect`
  on the drag state. An effect does not run until React has re-rendered, so a fast flick — and
  any synchronous test — would lose every `touchmove` that arrived first.
- Near-edge auto-scroll is stepped by `requestAnimationFrame`, not by `touchmove`: a finger held
  still at the edge fires no further move events, so scrolling from the move handler alone stalls
  after one nudge. The drop target is recomputed on each frame because rows slide under a
  stationary finger.
- **Reverted on request, and deliberately not to be "fixed" back.** The narrow sidebar's row
  cluster was first given 44px targets under `@media (hover: none)`, which forced the row to
  `flex-wrap` and put the buttons on a second line — five 44px targets need 220px in a 240px
  column. That doubled the height of every page row on a phone, and the user asked for the
  original one-line layout back. The cluster is therefore **visible but not enlarged** there;
  `⛶` and the "Pages" `＋` keep 44px because each is alone on its row. The 44px row targets live
  only in `.docs-sidebar-full`, whose rule is a separate block *outside* the media query — check
  that separation before touching either, since they look like one concern and are not.
- **Not covered, and weaker than the rest.** The cases synthesise `TouchEvent`s from inside the
  page, exactly as the true-storage case synthesises a `DataTransfer`. That exercises the handler
  logic and **not** real hardware: browser gesture arbitration, scroll interception, momentum,
  and iOS/iPadOS Safari's own behaviour are all still unverified, as is the near-edge auto-scroll
  and the `@media (hover: none)` layout (headless Chrome reports `hover: hover`, so only the
  *existence* of that rule is asserted, never its effect). A real iPhone and iPad pass is still
  owed and is the point of the change, so it is the largest gap here. Also not covered: the live
  Firebase project, and print output.
- **Environment note, again.** A full run reported one failure in the malformed-`track_db`
  section (`progress.html mounting` timeout) — the contention symptom the 2026-08-18 entry
  already describes. Confirm on an idle machine before believing any browser-layer failure, and
  kill leftover Chrome by explicit PID: a `pkill -f "user-data-dir=/tmp/track-cdp-"` matches its
  own shell's command line and kills the caller.

Not covered by the suite, and still requiring manual checks: touch and drag interaction on real
hardware, the signed-in Firebase path, real multi-device behaviour, print output, and most of the
UI.

### A typed due date on both compose forms (2026-08-22)

- The slot stays at **23** fields — nothing here is a new key, only a new authoring path for
  `date` — so the hand-written CONTRACT lists in `tests/schema.test.js`, `tests/browser.test.js`
  and `tests/lib/fixture.js` needed no change. Offline cases go from 131 to **132** (calendar-core
  79 → 80, swept under all five timezones with identical results); browser subtests go from 126 to
  **131**. `node tests/run.js`: all 13 suites pass.
- **Fail-first, offline.** `TC.dlDraftValid` is new, so the case was run against a scratch
  directory holding a pre-change `calendar-core.js` and a REAL copy of `tests/` — a symlinked
  `tests/` is useless here, because `require`/`__dirname` resolve through the realpath and quietly
  load the repository's own module instead. That cost one wasted run reporting a false pass, and
  `--preserve-symlinks` did not fix it. Against the true baseline: **2 of 80 failed** — the new
  case (`TC.dlDraftValid is not a function`) and `module surface`, which is what the hand-written
  export list is for.
- **Fail-first, browser: two doctored baselines, and their failure sets are DISJOINT.** Each
  `TRACK_TEST_ROOT` held symlinks to the repository plus **one** file with the feature reversed:
  - doctored **`progress.html`** → cases 36 and 37 (`the Schedule composer files a deadline on a
    TYPED due day`, `… refuses a due day before the caution start`) failed; **129 passed**,
    including both Documentations cases.
  - doctored **`documentations.html`** → cases 38 and 39 failed, the mirror pair; **129 passed**,
    including both Progress cases.

  Neither set contains the other. `progress.html` does not load `calendar-core.js` and carries its
  own `dlDraftValid`, so one assertion per surface is the only thing that catches a forgotten copy.
  Never place either doctored file in the repository.
- Case 40, `editing an existing deadline still takes its day from the record`, is a **scope guard**
  and passed against both baselines by design: it pins that the Documentations edit form shows one
  date field, not two, so a later change that adds a due date there without the stranding refusal
  trips this case instead of shipping.
- What the cases assert beyond that: the composer's due field is seeded from the cell it was
  launched from and `min`-capped at the caution start; a typed day reaches `track_db` while
  `startDate` stays where it was; and an inverted span disables the button, shows the reason, and
  leaves `track_db` **byte-identical** after clicking it anyway — the Cancel path, which is the one
  that matters.
- **Environment note, and it repeated the 2026-08-18 lesson exactly.** One full run reported nine
  failures — cases 123 to 131, all `CDP connection closed` or a 30s `waitFor` timeout — while
  another Claude session was running the whole suite on the same machine. Every one passed on an
  idle re-run. Before trusting a browser-layer failure, check
  `ps -eo cmd | grep browser.test.js` and `pgrep -fc "user-data-dir=/tmp/track-cdp-"`.
- Not covered, as ever: real touch hardware, the live Firebase project, and print output. The
  composer's date field was not exercised by hand.

### Hand-picked caution days (2026-08-22)

- The slot stays at **23** fields — `cautionDates` is an item-level key inside the existing
  `deadlines` list — so the hand-written CONTRACT lists in `tests/schema.test.js`,
  `tests/browser.test.js` and `tests/lib/fixture.js` needed no change, which the normalize case
  asserts. Offline cases go 132 → **140** (calendar-core 80 → 86, schema 52 → 54) under all five
  timezones with identical results; browser subtests go 131 → **136**. All 13 suites pass.
- **Fail-first: two doctored baselines, and their failure sets are exactly DISJOINT — zero
  overlap.** Each `TRACK_TEST_ROOT` directory held symlinks to the repository, a REAL copy of
  `tests/`, and **one** doctored file whose `dlCautionDays` ignored `cautionDates` and read only
  the legacy span:
  - doctored **`calendar-core.js`** → **5** failures, all on read-only surfaces (Documentations
    cell bars, Home chips, the Documentations caution row, and both the HOME and DOCUMENTATIONS
    gap cases). All eleven Progress caution cases passed.
  - doctored **`progress.html`** → **11** failures, all on Progress (timeline run-up, picker,
    quick-set, `clear all`, un-pick refusal, migration, both tick cases, both due-day-move cases,
    the Progress gap case). All five Home/Documentations cases passed.

  This is the cleanest instance of the per-surface argument this repository has produced, and it
  is the direct proof that `progress.html` needs its own copy. Never place either doctored file
  in the repository.
- **A real product defect the browser cases caught and code reading missed.**
  `dlStrandedBlockDays` read block days off the **stored** record. A deadline with no `blockDate`
  has its block on its own `date`, so the block MOVES WITH a due-day change and cannot be
  stranded by one — but the check compared the old block day against the new window, reported it
  orphaned, and refused every due-day move of an un-anchored deadline. That is the default shape
  of every deadline. Both copies now build a probe carrying the proposed `date` before reading
  `blockDay`/`partDay`, and an offline case pins it. **Generalise this:** when a helper takes a
  PROPOSED change, everything it derives has to be derived from the proposal, not half from the
  proposal and half from the stored record.
- **Three test defects, each found by reading the failure MESSAGE rather than the pass/fail.**
  (1) The migration case seeded its second load with `db:` instead of `raw:`; the value was
  already a serialised `track_db` string, so it was stringified twice and the byte comparison
  failed on encoding rather than on the migration. (2) The new due-day cell was titled
  `Due day — …`, and three existing cases count `!` marks with `[title^="Due "]`; the popup cell
  was counted as a second mark on the day underneath. The PRODUCT tooltip was changed, not the
  selectors, because the picker is what arrived. (3) The picker is also a `.grid.grid-cols-7` and
  renders BEFORE the month grid, so every bare month-grid selector read the picker's header;
  they now carry `:not([data-dl-caution-cal])`. **Any new UI that reuses a generic class or a
  tooltip prefix an existing case selects on will silently break that case — check both before
  adding a surface to a page the suite already reads.**
- **Not covered, and weaker than the rest.** The drag path was **not** re-verified — the
  committed suite still simulates no drag, so the nearest-allowed-day snap rests on code reading
  alone, and that is the largest gap here. Also not covered: real touch hardware, the live
  Firebase project, print output of the picker, and the multi-device window where one device has
  migrated and another has not (reasoned through the resolver's legacy branch, not tested).

### Caution days chosen from Documentations (2026-08-22)

- The slot stays at **23** fields — nothing here is a new key, only a second authoring path for
  `cautionDates` — so the hand-written CONTRACT lists in `tests/schema.test.js`,
  `tests/browser.test.js` and `tests/lib/fixture.js` needed no change. Offline cases go 140 →
  **142** (calendar-core 86 → 88), identical under all five timezones, and all 13 suites pass
  offline. This task adds **six** browser cases and rewrites one existing scope guard; no
  absolute browser total is quoted, because `tests/browser.test.js` gained seven further cases
  from separate in-flight work while this task was running and the two deltas are not this
  task's to conflate. No JS module changed, so no `?v=` was bumped and `styles.css` was not
  touched at all.
- **Both new offline cases are GUARDS and pass on both sides by design.** One pins that
  `dlStrandedBlockDays` short-circuits on a falsy record — that is what lets ONE picker serve the
  compose and the edit form with no branch, since a deadline being composed has no prep. The
  other pins `dlWithCautionDays({date}, days)` used as a draft sanitiser. If either fails, the
  picker has stopped being able to share its code between the two forms.
- **Fail-first: two doctored baselines, and their failure sets are exactly DISJOINT — zero
  overlap.** Each `TRACK_TEST_ROOT` scratch directory held symlinks to the repository, a REAL
  copy of `tests/`, and **one** doctored file with the `dlStrandedBlockDays` gate deleted:
  - doctored **`documentations.html`** → the Documentations un-pick refusal failed; every
    Progress caution check passed.
  - doctored **`progress.html`** → two Progress checks failed (the refused un-pick, and the
    follow-on that un-picking a harmless day narrows the set rather than emptying it); every
    Documentations check passed, in both themes.

  Never place either doctored copy in the repository.
- **A false pass caught before it was believed, and worth carrying forward.** The first run
  against the doctored tree reported all-green. The `sed` that was supposed to make the harness
  read `TRACK_TEST_ROOT` had failed on an unescaped `|` in its replacement, so the script served
  the *repository* and the doctored file was never loaded. The fix was not just to repair the
  substitution but to make the script **print the root it is serving** on every run, so a
  mis-set environment variable can never again read as evidence. Generalise it: when a check is
  supposed to run against a doctored tree, have it *state which tree*, because "all passed" looks
  identical whether the bug was absent or the bug was never loaded.
- Behaviour deliberately **differs** from `progress.html` and is asserted that way: this picker
  holds its picks in the DRAFT and writes on Save, because this form has a Cancel to honour.
  A browser case asserts the Cancel path leaves `track_db` byte-identical, and that is the only
  thing making its unconfirmed `clear all` safe — a draft-level clear destroys nothing. The
  Progress picker still writes per click and still asks before clearing. Do not "make it
  uniform" without re-deciding both on purpose.
- The picker is styled with inline `var(--color-*)` theme tokens rather than Tailwind's palette,
  because this page has a light theme and `progress.html` does not. Verified from a task-owned
  script in both themes: a picked day reads at luminance contrast 179 (dark, amber on near-black)
  and 164 (light, brown on near-white), and the due day is coloured distinctly from a picked day
  in both. That script cannot be re-run from `node tests/run.js`.
- No new print rule was needed: the picker sits inside `.cal-doc-form`, which
  `body.docs-page .cal-doc-form { display: none !important }` already hides under print.
- **Environment note, and it dominated this task.** The machine carried 20-41 foreign headless
  Chrome processes and up to 14 concurrent `browser.test.js` runs from other sessions throughout.
  A filtered suite run stalled at case 41 for minutes and was killed rather than trusted; the
  offline sweep and the small task-owned scripts were run instead, since each is one short-lived
  page load. Also learned: `node --test --test-name-pattern=<subtest>` **silently runs nothing**
  unless the pattern also matches the parent `browser suites` test — it reports `1..0` and
  `# pass 1`, which reads as a pass. Check the plan count, never the summary line.
- **Not covered, and weaker than the rest.** Drag was not re-verified, so the interaction between
  a dragged block and a newly un-picked day rests on `dlStrandedBlockDays` plus code reading.
  Also not covered: real touch hardware, the live Firebase project, and print output.

### Merged table cells, and a table pasted as text (2026-08-22)

- The slot stays at **23** fields — `merges` is an item-level key inside a block inside the
  existing `docPages` list — so the hand-written CONTRACT lists in `tests/schema.test.js`,
  `tests/browser.test.js` and `tests/lib/fixture.js` needed no change. One new offline suite,
  `tests/doc-table-core.test.js` (**42** cases), registered in `tests/run.js` and run **once**
  rather than swept: `doc-table-core.js` holds no date code, matching `true-storage-core.test.js`
  and `graph-layout.test.js`. Suites go 14 → **15**. This task adds **five** browser cases. No
  absolute browser total is quoted on purpose: another session was adding cases to
  `tests/browser.test.js` throughout this task, the file grew by 8 subtests *between* two of the
  runs below, and the two deltas are not this task's to conflate. `styles.css` was not touched —
  `colSpan`/`rowSpan` are HTML attributes and the existing `body.docs-page .doc-table td` print
  rule applies to a spanning cell unchanged — so no `?v=` was bumped except the new
  `doc-table-core.js?v=1`.
- **Fail-first, offline: two doctored baselines, and their failure sets are exactly DISJOINT —
  zero overlap.** Each scratch directory held a REAL copy of `tests/` (never a symlink — `require`
  and `__dirname` resolve through the realpath and would quietly load the repository's own module,
  which this file already records as having cost one run a false pass) plus **one** doctored
  `doc-table-core.js`:
  - `mergeMap` ignoring `merges` → **5** failed: the `mergeMap` span case, both `canMerge`
    refusals, `mergeCells` composing, and "mergeCells NEVER touches rows". 36 passed.
  - the rectangular-grid check dropped, short rows padded instead → **2** failed: the wrong-cell-
    count refusal and the line-number case. 39 passed.
- **Fail-first, browser: two more doctored baselines, also exactly DISJOINT.** Each
  `TRACK_TEST_ROOT` root held symlinks to the repository, a REAL copy of `tests/`, and one
  doctored `doc-table-core.js`:
  - `mergeMap` ignoring `merges` → `a pasted table reaches track_db with its merges, and the grid
    draws the spans` and `merging hides the covered cell, and unmerging restores it exactly`
    failed. The other three passed, correctly: the no-merges case has nothing to span, the
    wrong-cell-count case is pure parser, and the clamp case goes through `normalizeMerges`.
  - `normalizeMerges` dropping an out-of-bounds region instead of **clamping** it → only
    `dropping a row still asks, and clamps a merge that spanned it` failed.

  Refer to these cases by **name**, not by index: the numbering shifted between the two runs
  (102/105 became 112) purely because the other session's cases landed in between. Never place
  any of the four doctored copies in the repository.
- **A real defect found by reading the diff, which no test would have caught.** `rowsOf` filtered
  non-array rows OUT. The editor writes a cell back by the index it **rendered** at, so a single
  malformed stored row would have shifted every row after it and sent the next keystroke into the
  wrong cell — silent data loss wearing defensiveness as a hat. It now maps a bad row to an empty
  one, preserving indices, and an offline case pins it. **Generalise this:** a defensive reader
  that feeds a render whose indices are used for WRITES may normalise values but must never change
  the length or order of what it returns.
- What the browser cases assert beyond the reversals: a pasted table with nothing merged is stored
  with `Object.keys` exactly `['id','type','rows']` — no `merges` key at all, which is what keeps
  the two pre-existing whole-block `deepEqual` cases passing; a markdown separator row is skipped
  rather than stored as data; a malformed paste shows the error with its **line number**, previews
  nothing, and leaves `track_db` **byte-identical** after clicking Insert anyway; merging asserts
  `page.dialogs.length === 0` in both directions, because nothing is deleted or cleared; and the
  `− row` case asserts the **Cancel path** is byte-identical before confirming.
- Every worked example in `TABLE-PASTE.md` and the in-page `TABLE_AI_BRIEF` was fed through
  `parseTableText` from a task-owned script — all 7 parse. A spec that ships an example the parser
  rejects is worse than no example. That script cannot be re-run from `node tests/run.js`; if the
  examples change, re-check them by hand.
- **Not covered, and weaker than the rest.** No image is ever read: the recognition step happens in
  whatever AI the user hands the picture to, so the accuracy of that transcription is outside this
  repository entirely and outside every test here. Print output of a merged cell was reasoned about
  and **not** looked at. Also not covered, as ever: real touch hardware and the live Firebase
  project. The merge chrome was exercised only through `.click()` from a task-owned smoke script
  and the committed cases, never by hand on a real pointer.

### Confirmation on every destructive control (2026-08-18)

- 19 controls that deleted or cleared stored data on one unguarded click now ask
  first. One new browser case brings the file to **100 subtests, all passing**;
  13 suites pass.
- The **fail-first evidence is the point of this entry**, and it was recorded
  against the untouched product pages before a single confirm was added. The test
  half went in first as its own commit (`63055c1`), so the working tree *was* the
  pre-change file and no `TRACK_TEST_ROOT` scratch directory was needed — the same
  situation as "Movable deadline due date". Result: **99 subtests, 7 failed**, and
  every one of the seven carried the identical assertion message,
  `the control asked before writing (no dialog was raised)`:
  the documentation block delete, `− row`/`− col`, the True Storage tag remove and
  link clear, the KS02 untag, the scheduled-action day delete, and the caution
  reset. The eighth case — a detach `⊗` chip is deliberately left unconfirmed —
  **passed**, as a scope guard must on both sides.
- One case failing for the *wrong* reason was caught before it could be believed.
  The Supporting Actions case first timed out looking for a day chip that was not
  in the DOM: `expanded` initialises to `{}`, so the action row starts collapsed.
  It clicks the row's `▼` first now, and only then failed on
  `no dialog was raised`. A case that times out on its own selector proves the
  control is unreachable, not that it is unguarded — always read the message, not
  the pass/fail.
- The 9th case, added with the fix, is a **guard** and passes on both sides by
  design: the milestone-checkpoint chip must raise **exactly one** dialog. Moving
  the prompt into `removeMilestoneEntry` while leaving the call-site `confirm` at
  its chip would prompt twice for one click, and nothing else in the suite would
  have noticed. It asserts `page.dialogs.length === before + 1` after an 800 ms
  settle, so a second prompt is counted rather than missed.
- The chip's `×` is behind hover state, which React delegates from `mouseover`;
  the case re-dispatches until the button exists rather than sleeping. Two
  elements carry the milestone title — the MILESTONES row and the chip — and only
  the chip is `inline-flex`.
- Coverage is honest rather than complete: **8 of the 19 controls** are exercised
  by an automated Cancel-path case, chosen one per mechanism. The other 11 are
  **not** covered by the suite and were **not** clicked by hand either — they rest
  on code reading alone, which is weaker evidence and is recorded as such. They
  are: the two MilestoneBar tooltips, the four unlink buttons, the clear-date
  button, `clearMilestonePeriod`, the MG bullet `×`, the dissect `×`, and KS02
  `removeLink`. Of these, the tooltips and the unlink buttons at least share a
  handler with something covered (`removeMilestoneEntry` via case 100,
  `confirmUnlinkTask` via neither) — the remaining five have no automated
  evidence at all. A manual confirm-and-cancel pass over those is still owed.
- Not covered, as ever: real touch hardware, the live Firebase project, and print
  output.
- **Environment note worth carrying forward.** The first full-suite run after the
  edits reported 4 failures in the malformed-`track_db` cases, with
  `CDP connection closed` and `progress.html mounting` timeouts. All four passed
  on a re-run once the machine was quiet. Those cases load all five pages six
  times over and are the suite's heaviest section, so they are the first to break
  under contention — two other `node --test` runs and ~19 headless Chrome
  processes were live at the time. Before trusting any browser-layer failure,
  check `pgrep -fc "user-data-dir=/tmp/track-cdp-"` and re-run on an idle
  machine; a `CDP connection closed` is a resource symptom, not a regression.
  Note also that `Browser.close()` can fail with `ENOTEMPTY` while removing its
  profile directory, which is where the stray `/tmp/track-cdp-*` directories come
  from.

### Documentations calendar blocks (2026-08-06)

- `calendar-core.js` passes `node --check`, and 80 offline assertions against a synthetic slot — re-run under `Pacific/Kiritimati` (UTC+14), `Pacific/Midway` (UTC-11), `America/Los_Angeles`, `Asia/Kathmandu` and `UTC` with identical results, which is what rules out a UTC-day regression in the new date code.
- 71 headless assertions covering the block end to end: all four pages mount with the notes widget and no page errors, the `?page=` deep link, block creation and persistence, authoring notes and deadlines into the shared arrays with a `docPageId` and a local calendar date, ownership highlighting and exclusive edit controls, all three filter behaviours (Documentation covering both kinds, Day notes and Deadlines covering only schedule-authored ones), scope toggling across sub-pages, the origin chip and the Schedule's link back, an export→import allow-list replay preserving `docPageId`, a concurrent cross-tab write surviving a `docPages` write, and page deletion keeping every item the page authored.
- 10 further assertions on styling and chrome: the print flatten rule parses with its `:not(.doc-cal)` exemption, the calendar print rules are live, day cells are 52px, the block causes no horizontal overflow, and both the block's move/delete chrome and the sidebar drag-to-nest still work with a calendar on the page. That flatten rule has since been split in two so a parse failure can only cost the exemption; the committed suite asserts the split.
- Not verified: real touch hardware, and the live Firebase project.

### Re-verified after the 2026-08-05 revert and restore

The chunked format was reverted (`98995dd`, `f81a513`) and restored the same day. The assertions above were recorded against the same code before the revert and still describe it; the following were re-run after the restore, against a synthetic slot, signed out, with no Firestore contact:

- `theme.js`, `storage-guard.js`, `firebase-sync.js`, `notes-widget.js` pass `node --check`; `git diff --check` clean.
- 40 headless assertions across all five pages: containers render, no white screen, the offline "Skip" path dismisses the overlay, `window.TrackStorage` present everywhere, `window.TrackSync` present on the four Firebase pages with `state === 'signed-out'` and `limits` reading `chunkBytes=700000 maxChunks=24 debounceMs=1200`, and no page errors beyond the expected Tailwind/Babel CDN warnings.
- 27 `TrackSync.selfTest()` cases across three configurations (auto/gzip, 64-byte chunks, forced raw), all passing. Multibyte input split into 2 chunks and the 300 KB base64 fixture into 14 at the 64-byte size, so byte-level chunking does not tear UTF-8; flipped-byte, truncated, and empty-chunk payloads were all refused.
- 12 assertions that the quota guard still composes with the restored `Storage.prototype.setItem` patch: `saveDB` round-trips, every seeded slot field survives a write, a quota rejection returns `false` and raises the banner while `track_db` stays byte-identical and still parses, a non-quota error is rethrown, and the React root survives all of it.

The `selfTest` compression ratios are not predictive of real workspaces: the `base64-300k` fixture is a repeating string and compresses ~330×. Real documentation images are base64-wrapped JPEG, which is already compressed and high-entropy, so gzip mostly just recovers base64's 33% inflation.

On 2026-08-05, after `firestore.rules` was published in the console, the user confirmed the live signed-in path reaching `✓ synced` and continuing to sync normally on the real project. That closes the gap the pre-revert baseline could only reason about structurally: the legacy → v2 migration succeeds against real Firestore under the published rules.

Still unverified, and out of reach from this environment: the exact chunk count and cloud byte size of the real workspace, `backup/v1` contents, multi-device conflict behavior, and the `permission-denied` banner against the live project rather than the in-memory double.

## Definition of Done

A task is done only when all applicable statements are true:

- The requested behavior is implemented or the requested analysis is complete.
- Existing user data remains readable.
- Schema changes cover defaults, migration, import/export, and all writers.
- Independent page state does not silently erase unrelated fields.
- Local calendar behavior is used for user-facing dates.
- Applicable syntax/build checks pass.
- `node tests/run.js` passes, and a fix in a covered area added a case that was seen failing first.
- Applicable browser smoke checks pass.
- Applicable mouse and touch checks pass.
- Data changes have a round-trip or migration check.
- Sync changes have concurrent-state reasoning or tests.
- Documentation is placed in the correct file.
- Only intended files changed.
- No required work remains hidden behind an unreported limitation.

## Proposed Work Is Not Automatically Authorized

`NOTES.md` contains a roadmap and possible architecture. Its presence does not authorize implementation.

Only implement a NOTES proposal when:

- The user asks for it, or
- It is a necessary, proportionate part of the user's current task.

If a proposal would materially expand scope, require dependencies, alter cloud state, or migrate user data, stop and obtain direction or approval first.
