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
| `tests/` | The committed suite. `run.js` is the one command; `calendar-core.test.js`, `schema.test.js`, `true-storage-core.test.js`, `graph-layout.test.js`, `doc-table-core.test.js` and `cdp-cleanup.test.js` are offline; `browser.test.js` drives real Chrome through `lib/cdp.js`; `lib/fixture.js` builds synthetic slots, including legacy and malformed ones |

Current runtime dependencies are loaded through CDNs:

- React 18 development UMD.
- React DOM 18 development UMD.
- Babel 7.25.6.
- Tailwind browser CDN.
- Firebase 10.12 compatibility scripts.

Do not assume Vite, npm scripts, TypeScript, JSX modules, or CI exists until the repository actually contains them.

There **is** a test suite, and it has no dependencies and no `package.json` — Node's built-in `node:test`, plus a hand-rolled DevTools-protocol driver over Node 22's global `WebSocket`. Keep it that way: adding Playwright, Puppeteer, Jest, or a package manifest to make a test easier is a dependency decision that needs explicit approval (see "Dependencies, Network, and External Systems").

Repository-local scripts and stylesheets are loaded with a `?v=N` cache-busting query (`styles.css?v=7`, `schema.js?v=6`, `calendar-core.js?v=6`, `firebase-sync.js?v=2`, `storage-guard.js?v=2`, `notes-widget.js?v=2`, `true-storage-core.js?v=2`, `graph-layout.js?v=1`, `doc-table-core.js?v=1`, `theme.js?v=1`). There is no build step to hash filenames, so this query is the only thing guaranteeing a returning visitor gets a changed asset instead of its cached copy. Bump the integer in every page that loads the file whenever its contents change, and keep the value identical across pages. **Every repository-local asset now carries one**; `theme.js` was the last exception and lost it when the appearance became a joint contract between the script and the stylesheet, where a stale script against fresh CSS is exactly the failure the query exists to prevent.

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

A form that holds picks in a draft has one extra obligation: the **due day can move under an already-chosen list**, which BOTH Documentations forms allow. Nothing may filter that by hand — ask `dlWithCautionDays` what it would store and render that, so the readout and the stored value cannot disagree.

**An existing due day moves from two places, and they answer the same move DIFFERENTLY on purpose.** The difference follows from how each surface writes, and making them uniform would be a regression in one direction or the other:

- The **Progress popup** commits every caution pick to `track_db` as it is clicked. It therefore cannot afford to drop one, so a due day landing on or before a chosen day is **REFUSED and the days are NAMED**; the user un-picks them in the same popup. This is the only writer that holds that refusal, and it is inline (`dlDraftOrphanedDays` / `dlDraftSavable`) rather than in `calendar-core.js` — deliberately, because nothing else needs it.
- **`documentations.html`'s edit form** holds its picks in the DRAFT until Save and has a Cancel to honour, so the same move **DROPS** the days that no longer fit — through `dlWithCautionDays`, the one resolver, which is also what the picker reads, so the count falls and the cells lock as the date changes. Nothing is committed until Save and Cancel restores all of it.

A browser scope guard (`SCOPE GUARD: Progress still REFUSES the move Documentations drops`) drives the same seed and the same move on both and asserts the two different answers, so a later "make it uniform" pass trips a test instead of silently destroying picks on one surface or blocking a legal move on the other.

Two rules follow, and they are the mirror of the tick rules above:

- **The Progress popup** must **never rewrite `cautionDates`** while moving a due day. A day the user picked is not ours to drop or shift to make room, and that writer's picks are already stored — so a due day landing on or before a chosen day would silently delete committed data. Refuse and name them. The Documentations form is exempt only because its picks are not committed yet; a future writer that commits picks eagerly inherits the popup's rule, not the exemption.
- **Placed prep is never dropped on EITHER surface.** `dlStrandedBlockDays` is the one definition and it must be asked about the **PROPOSED** record — `{date, cautionDates}`, both halves. `documentations.html` carries the date at all four of its call sites; ask without it and the check compares the block against the OLD due day, concludes it is fine, and waves through a move that strands work the user placed by hand. That is the case its `refuses un-picking the OLD due day once the due day has moved past it` browser case exists for.
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
- **A MOVE is not a row/column change, and must never go through `withRows`.** That funnel re-normalises merges against the new *bounds*, which is exactly right for a row added or dropped and exactly wrong for a reorder: the bounds do not change, the **indices** do. Sent through it, every merge keeps its old `r`/`c` and silently takes over whichever content moved into those coordinates — text intact, rectangle intact, and pointing at the wrong cells, which is the quietest kind of corruption this file exists to prevent. `TrackDocTable.moveLine` is the one positional writer; it remaps `merges` and permutes `colWidths` itself, then hands the result to `withMerges` / `withColWidths` so the delete-when-empty rule keeps its single home. A browser case is pinned against a doctored `moveLine` that skips the remap.
- **What moves is a BAND, defined once by `lineBands`.** A merge spanning more than one line glues the boundaries inside it; a band is a maximal run with no unglued boundary. Bands are contiguous, cover every line and never overlap, so every merge lies entirely inside exactly one — which is what makes a move a permutation **no rectangle can straddle**, and why a merged region can only travel whole. That property is the whole design: it is why moving needs no refusal for merges and can never tear one. Glue per **boundary**, not per region, and transitivity is free — two merges overlapping in the same rows fall out as one band with no union-find and no second pass. Never re-derive a band at a call site. Reordering **inside** a region is deliberately not offered even though the rectangle would survive it: the extent would hold while the owner cell started drawing text that had been covered, which reads as loss. The cost is that a merge gluing a whole axis — a full-width `| Total | << | << |` footer does exactly that to every column — freezes that axis until it is unmerged, and `canMoveLine` names that case specifically rather than reporting "already the first column", which is true of a one-column table and unactionable here.
- **A move writes nothing away, so it asks nothing** — it is a permutation, undone by moving back, and sits outside the destructive-control rule beside merge and unmerge. `canMoveLine` returns `canMerge`'s `{ok, reason}` shape plus `span` and `to`. **`to` is load-bearing, not a convenience:** the caller's selection must follow the line it moved, or the second press of the same button moves whatever slid into the old coordinates — one press does what was asked and the next undoes half of it. Compute it in `canMoveLine`, never at the call site; it is band arithmetic.
- **A cell merged downward FILLS with its text box, and that height is computed rather than declared.** Chrome resolves neither `height: 100%` nor `min-height: 100%` against a table cell — measured, not assumed: a 165px cell left the box at 32px — so `AutoTextarea` floors its own measured content height at `parentElement.clientHeight`, gated on a `fill` prop that `TableGrid` already supplies via the span it passes to `cell(text, ri, ci, span)`. Two things about that function are load-bearing. It sets `height:auto` **before** reading either number, so the cell height it reads is what the OTHER rows demand rather than what its own last write imposed — that is what makes it idempotent, and idempotence is what lets the ResizeObserver admit height at all. And the observer's height gate is restricted to **filled** cells: a rowSpan cell grows when a neighbouring row does, which changes no width, so the original width-only gate would put the dead space straight back — but for an unfilled cell the floor is never read and a height re-fit would be pure loop risk. The file's own comment records an ungated observer taking the page down with "Maximum update depth exceeded"; do not widen that gate. A filled box is also `display: block`, because a textarea is inline-block and its baseline leading would leave the floor permanently a few pixels short.
- `merges` is deliberately **not** validated in `schema.js`, which checks `docPages: 'list'` and no block shape at all. Gating one block field and not the others would invent an inconsistent rule; `doc-table-core.js` pays for that instead, reading every nested value through a helper that cannot throw — a throw here escapes a React render and empties the whole page.

A `table` block may also carry `colWidths` — one **percentage** per column, summing to 100.
Four rules follow, and the first is the load-bearing one:

- **Percentages, never pixels.** The table is drawn at width 100%, so a ratio prints at
  whatever the page turns out to be, survives the sidebar changing width, and makes
  horizontal overflow *impossible by construction* — widening a column narrows its
  neighbour rather than pushing the table off the page. A pixel width would print at
  96-per-inch and overflow A4 the moment a table got wide. Do not "simplify" this into
  pixels because a drag delta arrives in them; convert at the drag.
- **Absence is the default and clearing DELETES the key** — the `merges` rule, not the
  `cautionDates: []` rule, because nothing sits behind it as a fallback. `withColWidths`
  is the one writer and it does the delete. A browser case asserts `Object.keys` is
  exactly `['id','type','rows']` for a table nobody has resized, and it is the guard for
  this half.
- `withRows` re-normalises the widths as well as the merges, which is what lets the four
  inline `+ row` / `− row` / `+ col` / `− col` handlers stay ignorant of the field: a
  dropped column drops its width, a new one arrives at the average, and the list still
  sums to 100. `resizeColumn` is the only thing that moves a boundary and it makes the
  NEIGHBOUR pay, so the total is conserved and no other column shifts.
- `colWidths` is layout, not content, so it deliberately does **not** travel through
  `formatTableText` / `parseTableText`. That format is a transcription of a picture and
  has no business carrying widths.

A table cell is a growing **textarea**, not an `<input>`, because an input is single-line
by construction and clipped anything longer than its column — on screen and in the printed
PDF, since this page has no separate print DOM. It goes through the shared `AutoTextarea`,
whose `ResizeObserver` is gated on **width only**: `fit()` sets the element's height, which
changes its parent's height, which is a resize, so an ungated observer re-fits forever and
React dies on "Maximum update depth exceeded" — taking the whole page down, not just the
table. Observing the textarea rather than the parent has the identical loop.

The column drag holds its widths in a **ref** beside the state and commits once on
`pointerup`. Both halves are load-bearing: a write per `pointermove` would put hundreds of
whole-database writes through `TrackStorage.saveDB` and arm the sync debounce on each, and
reading or writing through a functional `setState` updater is a side effect during React's
render phase — which is the same "Maximum update depth exceeded" crash by a different road.

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

- `track_theme` — the appearance preference; see the rules below
- `track_db_ts` — when this device's data was last **confirmed** in the cloud, written only after the server accepts a write
- `track_db_pending` — set while this device holds unsent edits, cleared on confirmation
- `trackPriorityMatrix`
- `fb_reloaded` and `fb_reloaded_gen` in `sessionStorage`
- legacy Progress and KS02 keys used during migration

`track_theme` holds `grit` or `dark`. The superseded `light` is the previous name for
`grit` and is accepted **forever on read**, never written. Four rules follow, and the
first two are the load-bearing ones:

- The pair is spelled **once**, in `theme.js`'s `GRIT`/`NIGHT` constants and its single
  `normalizeTheme`, which both the storage read and `applyTheme` go through. It used to
  be spelled at four sites — the fallback, the click handler, the system-preference
  listener and `TrackTheme.toggle` — and that is the duplication shape that has already
  cost this project a caution predicate. Missing one makes `applyTheme` a silent no-op:
  no attribute is set, and **every bare `html[data-theme]` rule** in `styles.css` dies at
  once, taking the focus rings, the notes widget, the Firebase overlay and all four
  banners with it. The smoke cases cannot see this — they assert those elements exist,
  never that they are painted.
- The alias is a **read**, never a rewrite. Rewriting the key would fire `storage` in
  every open tab, and a tab on the cached previous script does not recognise `grit`, so
  it would fall through to `matchMedia` and silently change appearance under a user who
  touched nothing. This is also why `dark` deliberately keeps its name rather than
  becoming `night`: an older tab still understands `dark`, and renaming it would break
  the one direction that still works across versions. `night` is a display name only.
- `readStoredTheme`'s accept-list and the alias must stay in the **same** function. If a
  stored canonical value made it return `null`, the system-preference listener would
  conclude the user had never chosen and let the next OS change override an explicit
  preference.
- `color-scheme` is written **inline** on `<html>`, so it beats both stylesheet
  declarations, and its grammar accepts a custom ident — a raw appearance name parses,
  sticks, and is understood by no browser, silently falling back to light. Map the name
  to a keyword (`colorSchemeFor`); never pass the name through. There are 19 date/time
  inputs across the app, and the failure looks like light scrollbars and light native
  pickers on a dark page.

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

It runs `tests/calendar-core.test.js` and `tests/schema.test.js` under five timezones (UTC+14 through UTC-11), then `tests/true-storage-core.test.js`, `tests/graph-layout.test.js`, `tests/doc-table-core.test.js` and `tests/cdp-cleanup.test.js` once each (no date code in any of them), then `tests/browser.test.js` in headless Chrome. Rules for working with it:

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
  offline, with `tests/browser.test.js` reporting **149 subtests, all passing** in 11 minutes.
  `node tests/run.js` end to end: **all 14 suites pass**, against a tree unmodified for the
  duration of the run. This task
  contributes **six** of them and rewrites one existing scope guard (`SCOPE GUARD: the
  Documentations edit form still moves no due DAY` — its date half stands, its caution half was
  superseded); the rest of the growth since the last entry is separate in-flight work that was
  landing in the same file, so only this task's delta is claimed here. No JS module changed, so
  no `?v=` was bumped and `styles.css` was not touched at all.
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
- **Environment note, and it corrects the advice the earlier entries give.** Those entries say to
  check `pgrep -fc "user-data-dir=/tmp/track-cdp-"` and re-run on an idle machine. **The process
  COUNT is not the test.** This machine accumulates orphaned Chrome and `node --test` processes
  from runs that died without cleaning up — the same leak the 2026-08-18 entry notes when
  `Browser.close()` fails with `ENOTEMPTY`. During this task it showed 20-41 Chrome processes and
  7-14 `browser.test.js` processes, which read as heavy contention and cost roughly an hour of
  waiting; `ps -eo pid,etimes,time,pcpu` then showed **every one of them at 0% CPU and 00:00:00
  cumulative CPU time**, two of them 15 hours old, with a load average of 2.06 across 12 cores.
  They were corpses, not load. The full browser suite then ran to completion beside all of them,
  149 subtests in 11 minutes with no failure and no `CDP connection closed`. Check `time`/`pcpu`
  and `/proc/loadavg`, not the count — and do not kill them by pattern, since a `pkill -f` on the
  profile string matches the calling shell. **The leak that produced those corpses was fixed on
  2026-08-25** (see "A run that cannot leak"), so a fresh accumulation now means something new is
  wrong rather than business as usual. Everything else in this note — `time`/`pcpu` over the
  count, and never `pkill -f` — still stands.
- Also learned: `node --test --test-name-pattern=<subtest>` **silently runs nothing** unless the
  pattern also matches the parent `browser suites` test. It reports `1..0` and `# pass 1`, which
  reads as a pass. Check the plan count, never the summary line.
- **Not covered, and weaker than the rest.** Drag was not re-verified, so the interaction between
  a dragged block and a newly un-picked day rests on `dlStrandedBlockDays` plus code reading.
  Also not covered: real touch hardware, the live Firebase project, and print output.

### Merged table cells, and a table pasted as text (2026-08-22)

- The slot stays at **23** fields — `merges` is an item-level key inside a block inside the
  existing `docPages` list — so the hand-written CONTRACT lists in `tests/schema.test.js`,
  `tests/browser.test.js` and `tests/lib/fixture.js` needed no change. One new offline suite,
  `tests/doc-table-core.test.js` (**42** cases), registered in `tests/run.js` and run **once**
  rather than swept: `doc-table-core.js` holds no date code, matching `true-storage-core.test.js`
  and `graph-layout.test.js`. Suites go 13 → **14**. This task adds **five** browser cases. No
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

### The fourth day-header button, unreachable in the week view (2026-08-23)

- **No data-contract change at all.** The slot stays at **23** fields, nothing was added to
  `SLOT_FIELDS`, and the hand-written CONTRACT lists needed no change. `styles.css` was not
  touched, so no `?v=` moved — the whole fix is one constant and three Tailwind classes in
  `progress.html`'s inline JSX. The offline suites are untouched and pass identically under all
  five swept timezones. This task adds **two** browser cases.
- **The bug, and why exactly ONE of four buttons died.** In WEEK mode a day column is pinned to
  `DAY_MIN_W`, and the header spends it on three flex items: a 36px SIR strip, the centre, and a
  notes strip of 60px (up to 110px for a long title). At the old 140px the centre got 43px while
  the `+ ◎ ⊕ ☰` row needs 130px, so the row overflowed. A flex item paints as an atomic unit in
  document order, so the centre paints OVER the earlier SIR strip but UNDER the later notes strip:
  the row spilling left stayed clickable and the row spilling right went beneath the strip.
  Visible, because that strip has no background, and completely dead to a click or a tap. The left
  end is only safe while the spill is small — once a long title stretches the strip to 110px the
  row reaches the sticky time column, which is opaque and `z-index: 30`, and `+` is both hidden and
  dead. That is the second fail-first message below, and the reason widening alone is not the fix.
  Nothing
  about touch was involved — a desktop window simply never reaches the minimum, which is why the
  user saw it only on a tablet, and only in WEEK mode.
- **Fail-first evidence.** The working tree *was* the pre-change file, so no `TRACK_TEST_ROOT`
  scratch directory was needed — the same situation as "Movable deadline due date". A full pre-fix
  run: **149 subtests, 147 passed, and exactly the two new ones failed.** The messages are the
  evidence and are worth quoting:
  - `the ☰ day-notes browser takes its own tap (hit div.flex.flex-col.gap-0.5)` — the notes strip,
    named by its own class list. The three assertions **above** it (`+`, `◎`, `⊕` each hit `self`)
    **passed**, which is what proves the case can see the buttons and that the fourth one
    specifically is buried, rather than the case being broken.
  - The long-title case failed on a **different button against a different element**:
    `the + task picker still takes its own tap (hit div.flex-shrink-0.border-r.border-gray-800/50)`
    — the **sticky time column**, `z-index: 30`, at the other end of the row. That second failure
    is why the fix is not only an arithmetic widening: a 110px strip takes the width straight back.
- **A defect in this task's own test, caught by that first run.** The long-title case originally
  asserted `m.cell.width - byLabel['☰'].right >= 0` as its precondition — a *width* compared
  against a *viewport x-coordinate*, which is not a comparison of anything. It failed, so the case
  looked like it was doing its job; it was in fact failing on an incoherent assertion instead of on
  the squeeze it names. It measures the strip directly now (`strip.width > 60`). **A case that
  fails for the wrong reason is worth as little as one that passes for the wrong reason, and only
  the message tells them apart** — the same lesson the 2026-08-18 Supporting Actions case and the
  2026-08-22 TOUCH cases each record in a different shape.
- After the fix, `node tests/run.js`: **all 14 suites pass** — calendar-core (88) and schema (54)
  under all five swept timezones with identical results, true-storage-core, graph-layout,
  doc-table-core, and 150/150 in the browser suite with both new cases green.
- **Post-fix geometry, measured rather than reasoned** (task-owned script, cannot be re-run):
  a bare day gives column 228, centre 131, strip 60, **one** line, four buttons at 28px, every one
  hit-testing to itself; the long-title day gives strip 110 (its maximum), centre 81, the row
  **wraps to two** lines, still four buttons at 28px, still every one `self`. The predicted worst
  case and the measured one agree exactly. At a 1900px viewport the columns grow to 261px and the
  row is one line again, which is the direct check on the claim that nothing changes above 1652px. The buttons are deliberately **not** enlarged to 44px,
  the same call README records for the Documentations sidebar.
- The cost is stated in README and was the user's explicit choice: the week view's minimum width
  goes 1036px → 1652px, so a 1280 or 1440 laptop now scrolls it horizontally. Above 1652px nothing
  changes, since `flex-1` already grew the columns past the minimum.
- `tests/lib/cdp.js` gained `Page.setViewport(w, h)` over `Emulation.setDeviceMetricsOverride`.
  Headless Chrome's default is 800×600 and reproduces the bug unaided — but a width-dependent case
  that is only meaningful because of a default nobody chose is one harness change away from
  silently testing nothing, so it states its width.
- **`--test-name-pattern` cannot narrow this file, and knowing that is worth 14 minutes an
  iteration.** node:test runs EVERY subtest once the parent matches, and `tests/browser.test.js` is
  one parent test with ~149 children: the flag either runs nothing or runs all of it. Iterating on
  a single case needs a task-owned preload that intercepts `require('node:test')` — the file takes
  the callable module itself, so patching the module's `.test` property does nothing.
- **Not covered, and it is the entire point of the change:** a tap on real touch hardware. The
  cases prove hit-testability in headless Chrome; iPadOS gesture arbitration is still unverified,
  and a real device pass is owed. Also not covered, as ever: the live Firebase project, and print
  output.
- **Environment note.** Another session ran the full suite on this machine throughout this task and
  committed mid-task (`f29f3cf`), sweeping this task's `cdp.js` helper and the first version of
  both cases into its commit. Load average sat near 5 and a full run took 14 minutes. Check
  `pgrep -fc "user-data-dir=/tmp/track-cdp-"` before believing any browser-layer failure.

**Superseded on 2026-08-23** — the widening was reverted the same day and the reachability fixed
structurally instead. `DAY_MIN_W` is 140 again and the button row is a 2×2 block on its own
full-width row. The entry above is kept because its *diagnosis* of the paint-order bug and its
lessons about test messages still apply; its behavioural claims — 228px, 1652px, `flex-wrap`, one
line at a bare width — do not. See the next section.

### The same four buttons, stacked instead of paid for (2026-08-23)

- **No data-contract change at all.** The slot stays at **23** fields, nothing was added to
  `SLOT_FIELDS`, the hand-written CONTRACT lists needed no change, and nothing here reaches
  `track_db`. `styles.css` was not touched and no JS module changed, so **no `?v=` moved**. The
  offline suites are untouched and pass identically under all five swept timezones. This task adds
  **one** browser case and rewrites the comments on the two it inherits.
- **The change, and why the arithmetic forced its shape.** At `DAY_MIN_W = 140` the header's centre
  section gets `140 − 1 border − 36 SIR strip − 60 notes strip = 43px`, and even a 2×2 block needs
  `2 × 28 + 6 = 62px`. A stacked block *inside the centre* does not fit at 140 — so the block moved
  **out** of the three-part strip row onto its own full-width row, where it has `140 − 8 padding =
  132px` and shares horizontal space with nothing. That is the difference between the two fixes and
  the reason to prefer this one: 228px made the bug **out-budgeted**, the own row makes it
  **unreachable**. A user asking for the width back is what prompted it; the 1652px minimum meant a
  1280 or 1440 laptop scrolled the week.
- Two supporting edits keep 140 honest: the centre carries `min-w-[28px]` (a floor at the date
  circle) and the notes strip lost `flex-shrink-0`. Without them a 110px strip over-subscribes the
  row (`36 + 110 > 139`), the centre collapses to zero, and the **date** paints out under the strip
  instead. Flexbox resolves the min-violation by freezing the centre and shrinking the strip.
- **Fail-first evidence, and it took two runs to be worth anything.** The working tree *was* the
  pre-change file, so no `TRACK_TEST_ROOT` scratch directory was needed — the situation "Movable
  deadline due date" describes. The new case makes **two** claims, and the first run only proved
  one: it died on `the day column is back at its 140px minimum (228px)` because that assertion came
  first, leaving the row-count assertion — the one the case is *named* for — never executed and
  never shown able to fail. The assertions were reordered and it was re-run, giving
  `the four buttons are drawn on TWO lines, not one (+◎⊕☰)` / `1 !== 2`. **Generalise it:** a case
  asserting N independent claims has been fail-first-proven for exactly the one that fired. Order
  the assertion the case is named for first, or run it twice.
- The two inherited cases (`every day-header button is hit-testable…`, `a long note title cannot
  push a day-header button out of reach`) **passed on both sides**, which is exactly their job:
  they assert the SYMPTOM, so they outlive the mechanism and their staying green through a
  228 → 140 revert is the evidence the dead `☰` did not come back.
- **Grouping by `top` rather than counting children is the whole case.** Four buttons in one
  container is true of both layouts; only the number of lines they are drawn on tells a 2×2 block
  from a row of four. This is the `data-block-day` lesson again — the right ids at the right times
  were true on the wrong day, and only the column distinguished them.
- **A test-helper hazard that would have produced a false pass, caught by reading the code rather
  than by running it.** `HEADER_BUTTONS` found the notes strip by walking
  `row.parentElement.parentElement.lastElementChild`, which is only the strip while the button row
  is *inside the centre*. After the move it resolves to the last **day column** — always wider than
  60px, so the long-title case's `m.strip.width > 60` precondition would have passed for entirely
  the wrong reason and the case would have stopped testing the squeeze it names. `data-day-strip`
  was added to the product and landed **as its own step**, run green before anything else changed,
  so no later failure could be blamed on a missing hook (the TOUCH-sidebar lesson).
- **Post-change geometry, measured rather than reasoned** (task-owned script, cannot be re-run):
  at 820×1180 a bare day gives column 140, centre 43, strip 60; the long-title day gives centre 28
  and strip 75 — the predicted freeze-and-shrink exactly. Both draw two lines of two at 28px with
  every button hit-testing to `self`, and the block stays inside its column. At 1280×900 the week
  **does not scroll** (`scrollWidth === clientWidth === 1265`), which is the direct check on the
  reason for the change; columns grow to 173 and the strip to 108. At 1024×768 it still scrolls
  (1036 > 1009), as 1036 requires.
- Day mode gets the 2×2 too — one code path, no `timelineMode` branch. There is room to spare
  there; uniformity was preferred to a second layout.
- The task-owned preload that makes `ONLY_PATTERN` work on this file (wrapping the `t` handed to
  the parent callback, since `--test-name-pattern` cannot narrow it) turned a 14-minute iteration
  into ~25 seconds. Worth rebuilding for any future work in here.
- **Not covered, and it is still the entire point of the original report:** a tap on real touch
  hardware. iPadOS gesture arbitration is unverified and a real device pass is owed. Also not
  covered, as ever: the live Firebase project, and print output.
- **Environment note.** Another session was editing `progress.html` and `tests/browser.test.js`
  throughout this task (the Task Priority matrix touch path) and running the suite beside it. Its
  in-flight work is in the same diff and was preserved rather than reverted.

### Grit and Night — light mode replaced by a growth-ring identity (2026-08-23)

- **No data-contract change to `track_db` at all.** The slot stays at **23** fields, nothing was
  added to `SLOT_FIELDS`, and the hand-written CONTRACT lists in `tests/schema.test.js`,
  `tests/browser.test.js` and `tests/lib/fixture.js` needed no change. The only persisted key
  touched is `track_theme`, whose rules are now in the data-contract section above. The offline
  suites are untouched and pass identically under all five swept timezones. This task adds **six**
  browser cases — the first appearance coverage this repository has ever had.
- **`node tests/run.js`: all 14 suites pass**, against a tree that was byte-identical for the
  whole run (checked by `md5sum` before and after) and with `git log --oneline -1` unchanged at
  either end, so no concurrent session swept work into it. calendar-core **88** and schema **54**
  under each of the five swept timezones with identical results; true-storage-core 24;
  graph-layout 21; doc-table-core 42; browser **163 subtests, 0 failures** (157 → 163).
- **What was there before: nothing.** A grep of `tests/` for `theme`, `track_theme`, `data-theme`,
  `light`, `dark` or `contrast` returned zero hits, while the browser suite rendered every one of
  its ~157 subtests in the light theme **by accident** — headless Chrome reports no dark
  preference and nothing seeded the key. The palette was exercised constantly and asserted never.
  That is why a palette-only change is nearly free against this suite, and why 157 passing tells
  you nothing about whether an appearance is legible.
- **Fail-first, part one: three cases against the untouched tree.** The working tree *was* the
  pre-change file, so no scratch directory was needed. Three of the six failed, each on the
  assertion it is **named** for, all with the same message shape — `'light' !== 'grit'`. The
  assertion order matters and was chosen deliberately: AGENTS already records that a case
  asserting N claims is proven for exactly the one that fired, so the named claim goes first.
- **Fail-first, part two: two doctored baselines, and their failure sets are NOT disjoint — one
  strictly contains the other, which is itself the finding.** Each `TRACK_TEST_ROOT` held symlinks
  to the repository, a **REAL copy** of `tests/`, and one doctored `theme.js`:
  - `root.style.colorScheme = next` (the appearance name passed through instead of mapped) →
    **only** `THEME: color-scheme resolves to a keyword the browser understands` failed, on
    `'grit' !== 'light'`. The other five passed. A clean, isolated proof.
  - the `applyTheme` guard rejecting everything, so `data-theme` is never set → **five of six**
    failed on `null !== 'grit'`.
  The second baseline's value is not the five failures but what passed beside them: **all five
  `smoke:` cases passed against it**, on a tree where every bare `html[data-theme]` rule is dead
  and the notes widget, Firebase overlay and all four banners render unstyled. The smoke cases
  assert those elements **exist**; only `THEME: html[data-theme] chrome is STYLED, not merely
  present` asserts they are painted. That contrast is the evidence the new case covers something
  the old ones cannot. Never place either doctored copy in the repository.
- **The defect that would have shipped, found by review rather than by any test.**
  `theme.js` wrote `root.style.colorScheme = theme` — and `color-scheme`'s grammar accepts a
  custom ident, so `grit` would have parsed, stuck, and been understood by no browser, falling
  back to light. Being **inline** it beats both stylesheet declarations. The result would have
  been a correct dark palette with light native scrollbars and light `<input type="date">` pickers
  across the 19 date/time inputs in the app. **Generalise it:** when a value is both a domain name
  and a CSS keyword, map it; never let the two vocabularies be the same string by coincidence.
- **The four-way spelling was collapsed to one.** The light/dark pair was spelled at
  `theme.js`'s fallback, click handler, system-preference listener and `TrackTheme.toggle`. That is
  the same duplication shape that cost this project the deadline caution predicate, and here the
  failure mode is worse than a wrong colour: a missed spelling makes `applyTheme` return before
  setting the attribute, and every bare `html[data-theme]` rule dies at once. One `normalizeTheme`,
  reached by both the storage read and `applyTheme`.
- **Two compensations were re-derived rather than renamed.** `svg [fill="#0f172a"]` and
  `[stroke="#1f2937"]` patch hard-coded hex in the canvas JSX. They existed only under the light
  theme, because the old dark palette was navy and `#0f172a` matched it **by luck**. The Night
  ground is green-cast, so the rule is now needed under `dark` as well or every mind-map node
  reads as a navy blot. A mechanical rename would have missed this entirely.
- **Six pre-existing Tailwind mapping gaps were swept while in there**, each a dark value
  surviving onto a pale surface because a sibling shade or opacity was mapped and it was not:
  `hover:text-gray-200` (8 sites), `bg-gray-950/60`, `hover:bg-gray-900/60`,
  `placeholder-gray-700`, `group-hover:text-gray-400`, and the non-hover `bg-white/5`.
- **Contrast is measured now, not claimed.** Every text role clears 4.5:1 against app-bg, surface
  and surface-muted in **both** appearances — worst case 5.19 (Grit) and 5.21 (Night) for the
  three text tiers, 4.68 and 4.93 including the accent roles. The browser case computes this from
  the live computed tokens rather than hard-coding hex, so a future palette tweak is checked
  instead of merely re-recorded. README's long-standing "stronger text contrast" bullet had no
  measurement behind it until now.
- **No network dependency was added.** `--font-display` and `--font-data` are system stacks, and
  they are applied only through `body.home` and explicit classes — never `:root`, `html`, `body`,
  `*` or a bare element selector. This is load-bearing: `--font-ui` never reaches `progress.html`
  (it is applied at exactly three places in `styles.css`), so the geometry-sensitive week-view
  cases are insulated *by construction*, and a font that inherited into `#root` would put them
  back in play. A webfont would additionally have made text metrics change asynchronously after
  first paint and would have tripped `realErrors`, which is asserted empty 118 times in this file.
- **A known and deliberate gap: `progress.html` still paints some chrome indigo.** The remap layer
  reaches Tailwind utility classes and `styles.css`; it cannot reach a hex literal passed as an
  inline `style` value or an SVG attribute from JSX. `progress.html` holds 16 such literals. Some
  are genuinely **data** and must stay theme-invariant — `PALETTE` (line 1268) is a categorical
  goal palette, and `mm.color` is a user-chosen value. But the rest are UI accent defaults —
  the progression donut and its percentage (1547, 1584), the SIR pips (1852, 1880), the MM
  progress bar (3568), the today outline (3804), and the goal bar (9363) — and they read as
  indigo on a green page. `sir-ks02.html` (101 literals) and `true-storage.html` (37) have the
  same shape. This was left alone on purpose: the approved scope excluded editing those files'
  JSX, they are the geometry-sensitive ones, and an SVG **attribute** does not accept `var()`,
  so the fix is a real refactor rather than a substitution. It is the largest remaining visual
  inconsistency and it is a follow-up, not an oversight.
- **Not covered, and stated plainly.** Print output in the new palette was **not** looked at — the
  `@media print` block flattens to black-on-white and is theme-independent by construction, and
  the committed case that guards its split flatten rule still passes, but no one has printed a
  page. Real touch hardware and the live Firebase project are unverified as ever. The growth-ring
  section on Home was exercised through the suite's page-mount cases and by hand in a headless
  screenshot, never on a real pointer or a real long-lived workspace.

### The ☰ panel looks forward only (2026-08-23)

- **No data-contract change at all.** The slot stays at **23** fields, nothing was added to
  `SLOT_FIELDS`, no `?v=` moved, and `styles.css` was not touched — the whole change is a filter
  and an empty-state branch in `progress.html`'s inline JSX. The panel writes nothing, and the new
  case asserts `track_db` is byte-identical across the whole interaction. The offline suites are
  untouched and pass identically under all five swept timezones (13 suites). This task adds **one**
  browser case and re-seeds one existing one.
- The rule has exactly **one** definition and deliberately no second copy: `documentations.html`
  and `index.html` render day- and month-scoped calendars, not a browse-everything panel, so there
  is no sibling surface to keep in step. The gate is applied **once**, after both kinds are
  collected, rather than beside each of the two pushes — notes and deadlines are collected on
  separate lines, which is the exact shape that once lost this project the caution predicate.
- **Fail-first evidence.** The working tree *was* the pre-change file, so no `TRACK_TEST_ROOT`
  scratch directory was needed. The new case failed on its own assertion rather than on a
  `waitFor` timeout, which is what proves it could already see the panel and was failing for the
  reason it names:

  ```
  both earlier items are gone and the clicked day's own item is kept
  + actual - expected
    [
  +   'n-past',
  +   'd-past',
      'n-today',
      'd-future'
    ]
  ```

- **The case opens the panel on TWO different days on purpose, and the second is the one that
  matters.** An implementation cutting against `todayStr` instead of the day clicked passes step 1
  completely unchanged; only reopening on `today+3` and finding TODAY's own note gone tells them
  apart. It also asserts the earlier note and the earlier deadline absent **by id** and re-checks
  under the `Deadlines` tab, because a cut applied to one kind and forgotten for the other still
  yields a shorter, plausible-looking list.
- **An existing case had to be re-seeded, and that is a consequence, not a tidy-up.** `the fourth
  button lists everything in ONE flat chronological list` seeded the fixed dates `2026-01-05` and
  `2026-02-09`, both in the **past**, so under the new rule it would have asserted the ordering of
  an empty list. It moves to `dayFromToday(5)` / `dayFromToday(9)` and still spans three days and
  four rows. **Any case that seeds a fixed calendar date and opens this panel is now
  time-dependent in a way it was not before** — seed with `dayFromToday` here.
- An item whose `date` is not a well-formed day is deliberately **kept** in the list: it belongs to
  no day, so it cannot belong to an earlier one, and this panel is the only surface such a record
  appears on. Hiding it would make it unreachable, which is the one thing this project will not
  trade for a tidier rule.
- The empty state **names the cutoff** when something was actually cut, and keeps the original
  wording otherwise. Not cosmetic: a slot full of earlier items, opened from a later column, would
  otherwise read as "everything I wrote is gone".
- **What was run.** All 13 offline suites under five swept timezones, identical results. A targeted
  run of **all ten** browser cases that open this panel, plus the six page-mount smoke cases —
  plan counts checked rather than the summary line, since `node --test` reports `# pass 1` for a
  run that executed nothing. Then the full browser suite: **157 subtests, all passing**. That run
  covered this task's work *and* the other session's in-flight day-header rewrite together, so it
  is evidence of no interaction between them rather than of either one alone.
- **Not covered.** Real touch hardware, the live Firebase project, and print output, as ever. The
  panel was not clicked by hand on a real pointer; the cases drive it through `.click()`. The
  empty state's *other* branch — the original "No day notes or deadlines yet." for a slot holding
  nothing at all — is unasserted; only the new cutoff-naming branch has a case.
- **Environment note, and it is the `f29f3cf` hazard again, one commit later.** Another session was
  rewriting the *same* day-header region of `progress.html` throughout this task — moving the
  `+ ◎ ⊕ ☰` row into a 2×2 block and taking `DAY_MIN_W` back from 228 to 140 — and committed
  mid-task as `1cf7b23`, sweeping this task's filter change and its new browser case into that
  commit. Nothing was lost. **Check `git log --oneline -1` before and after any long run:** a
  `git diff` that does not show an edit you know you made usually means another session committed
  it, not that it vanished. Confirm with `git show HEAD:<file> | rg <your change>` before
  re-applying anything, or you will duplicate it.

### Tapping empty space un-arms (2026-08-24)

- **No data-contract change at all.** The slot stays at **23** fields, nothing was added to
  `SLOT_FIELDS`, the hand-written CONTRACT lists needed no edit, and nothing here reaches
  `track_db` or `trackPriorityMatrix` — both evidence cases assert those byte-identical across the
  whole interaction. `styles.css` was not touched and no JS module changed, so **no `?v=` moved**.
  The offline suites are untouched. This task adds **four** browser cases.
- **The bug, and why it was not the theme change it arrived with.** The two-stage touch model had
  exactly one way out of stage one — tap the armed thing again — so an armed block stayed ringed
  indefinitely. The outside-click handler had read `onClick={() => setSelectedForResize(null)}`
  since `ba2df13`, the repository's first commit; `selectedForDrag` arrived later with the touch
  work and was never added to it, and `matrixArmedId` never was either. It was reported straight
  after the Grit palette landed, but `git show a79cb71 -- progress.html` is four lines — a favicon,
  two `?v=` bumps and a colour — and the one overlay that commit added is `pointer-events: none`.
  **A bug reported right after a visual change is not evidence the visual change caused it**; the
  new palette just made the ring easier to see.
- The clear now sits on the wrapper holding **both** the timeline and the Task Priority panel, so it
  has one definition and also covers the 35% panel, which in day mode was outside the old handler
  entirely.
- **This makes every block's and chip's `onClick={e => e.stopPropagation()}` load-bearing for
  ARMING, not just for the resize ring.** A tap arms on `touchend` and the browser then synthesizes
  a click; anything that lets that click bubble to the wrapper un-arms itself the instant it was
  armed. The four schedule block kinds already stopped it. **The matrix chip had no `onClick` at
  all** and needed one added — that single line was the highest-risk part of the task.
- **Fail-first, part one: the untouched tree.** The working tree *was* the pre-change file, so no
  scratch directory was needed. Both evidence cases failed on the assertion they are **named** for,
  `ERR_ASSERTION` / `true !== false` against `tapping empty grid space cleared the armed ring` and
  `tapping an empty quadrant cleared the armed ring` — not a `waitFor` timeout, which would have
  meant the case had gone blind instead. Both GUARD cases passed, as they must.
- **Fail-first, part two: a doctored baseline, and the failure sets are exactly DISJOINT.** A
  `TRACK_TEST_ROOT` tree of symlinks to the repository, a **REAL copy** of `tests/`, and one
  `progress.html` with the chip's new `stopPropagation` removed and nothing else altered: the two
  **matrix** cases failed (`GUARD` on `false !== true` for its named assertion, and the evidence
  case on `waitFor … chip g-p1 showing the armed ring (last value: false)` — it arms and un-arms in
  the same gesture) while **both schedule cases passed**. That is the direct proof the per-surface
  assertions are independent and that the one added line is necessary. Never place that doctored
  copy in the repository.
- **A synthetic `TouchEvent` produces no click, and that nearly made these cases prove nothing.**
  A real tap ends in a browser-synthesized click; a dispatched `TouchEvent` does not. The existing
  `MATRIX_TOUCH` helper therefore never exercised the bubbling path at all, and a case built on it
  would have passed just as happily against an element that had lost its `stopPropagation`. The new
  `TAP_REAL` helper fires the click by hand. **Generalise it:** when synthesizing a gesture, ask
  what the browser does *after* the events you are dispatching, or the case tests half the path.
- Both clickers go through `document.elementFromPoint` and refuse a point that lands inside a block
  or chip, rather than dispatching at the handler's own node — a direct dispatch would pass even if
  the click never bubbled out of a block, which is the entire thing these cases are about.
- **Not covered, and it is the entire point of the change:** a tap on real touch hardware. The
  cases synthesize events inside the page, which exercises the handler logic and not iPadOS gesture
  arbitration. A real device pass is owed. Drag was not re-verified either — the committed suite
  still simulates no schedule drag — so "a drag cannot cancel, because `preventDefault` suppresses
  the click" rests on code reading. Also not covered, as ever: the live Firebase project and print
  output.
- **Environment note.** `rg -rn "PATTERN" dir` is **not** `rg -n`: ripgrep reads `-r` as
  `--replace`, so `-rn` silently rewrites every match to `n` **in the output**. It made
  `TRACK_TEST_ROOT` look like it had been mangled to `process.env.n` in a file that was in fact
  untouched. Nothing was damaged, but the minute spent confirming that against `git show` is worth
  avoiding: use `rg -n`.

### A run that cannot leak (2026-08-25)

- **No data-contract change at all.** The slot stays at **23** fields, nothing was added to
  `SLOT_FIELDS`, the hand-written CONTRACT lists needed no change, `styles.css` was not touched
  and no `?v=` moved. Nothing here reaches `track_db` or any product page — this is test
  infrastructure only. One new offline suite, `tests/cdp-cleanup.test.js` (**13** cases),
  registered in `UNSWEPT_FILES`: no date code, so one run rather than five, matching
  `true-storage-core.test.js`, `graph-layout.test.js` and `doc-table-core.test.js`. Suites go
  14 → **15**.
- **This file already half-described the bug, in two separate entries, without anyone joining
  them up.** The
  2026-08-18 note records that "`Browser.close()` can fail with `ENOTEMPTY` … which is where the
  stray `/tmp/track-cdp-*` directories come from", and the 2026-08-22 note records 20-41 orphaned
  Chrome processes read as contention and costing an hour of waiting. Both were symptoms of one
  cause nobody had traced. **Two distinct leaks, and only the second one is the obvious one:**
  - **Leak A — the immortal node process.** `t.after(async () => { await browser.close(); await
    server.close(); })` is ONE statement. `fs.rmSync` had `maxRetries: 10, retryDelay: 100` —
    exactly **one second** of tolerance for Chrome flushing its profile on exit. On a loaded
    machine it threw, the throw escaped `close()`, **`server.close()` never ran**, and the still-
    listening HTTP server kept node's event loop alive forever. Nine such processes were found
    alive, aged 32-63 hours, every one having already printed `# fail 0` — the tests had PASSED
    and the process could not exit. `ss -tlnp` naming nine node PIDs each holding fd 21 is what
    turned a guess into a diagnosis; the process list alone had looked like this for days without
    anyone reading it that way.
  - **Leak B — the orphaned browser.** Nothing killed Chrome when node died first, and
    `proc.kill()` signals only the ROOT process, leaving the zygote, GPU process and one renderer
    per tab to reparent to init.
- **Fail-first, offline: 13 cases, 11 failed — and only TWO of those failures are evidence.**
  Cases 1 and 2 died on a real `ENOTEMPTY` escaping `close()`, which is the bug itself. The other
  nine died on `killTree is not a function`, `sweepStaleProfiles is not a function`, an undefined
  `_liveBrowsers`, and the module-surface list — all of which is just what a new export looks like
  and proves nothing on its own. **Read which failures are load-bearing before counting them**; a
  suite that goes 11-red to all-green is not 11 pieces of evidence. **Two cases passed on both
  sides by design and are the guards**: the `SIGTERM`→`SIGKILL` escalation, and a removal that
  succeeds. If either ever fails, the fix has broken what already worked.
- **Fail-first, browser: an A/B on the INTERRUPT path, which is the only way to see Leak B.** A
  scratch directory held symlinks to the repository, a REAL copy of `tests/` (never a symlink —
  `require`/`__dirname` resolve through the realpath, which this file already records as having
  cost one run a false pass) and **one** doctored file: `tests/lib/cdp.js` exactly as
  `git show HEAD:` returned it. Both trees were driven identically — start
  `node --test tests/browser.test.js`, wait for Chrome, `SIGINT` it with 11 Chrome processes live:

  | | pre-fix | post-fix |
  | --- | --- | --- |
  | profile directories left behind | **1** | **0** |
  | Chrome survivors | **11** | **0** |

  Never place that doctored copy in the repository.
- What changed, in the order that matters: `close()` **cannot throw** (the `rmSync` is wrapped and
  warns instead); Chrome spawns `detached` so `killTree` can signal the process **group** via a
  negative pid, falling back to the single process on `ESRCH`; a module-level registry plus
  `process.once('exit' | 'SIGINT' | 'SIGTERM' | 'SIGHUP')` reaps whatever is still live, using only
  synchronous calls because `'exit'` permits nothing else; and `launch()` sweeps `track-cdp-*`
  directories older than a day. `browser.test.js`'s teardown is now `try/finally` — belt-and-braces
  once `close()` is total, but it is the line the leak was made of.
- **The sweep is bounded by BOTH a prefix and an age, and is tested for what it must NOT delete.**
  It is the only code in this repository that removes something the current run did not create. A
  day is far past the 11-14 minutes a full suite takes, and a live Chrome keeps its own profile's
  mtime fresh — both 59-hour-old orphans showed that day's mtime — so a concurrent session is
  never swept out from under itself. Three of the 13 cases assert non-deletion: a fresh directory,
  an unrelated name, and `track-cdp` without the trailing dash.
- **A lesson about the tooling, not the product, and it cost a wrong claim.** `nohup node
  tests/run.js … &` inside a backgrounded call reports **exit code 0 the moment the wrapper shell
  exits**, while the suite is still running. The completion notification was believed, the leftover
  Chrome processes were briefly read as a failure of the fix, and they were in fact a *live* run.
  This is the same shape as the `# pass 1` lesson already in this file: **the summary you are handed
  is not the one you asked for — check the thing itself** (`ps` for the pid, the plan count for the
  suite).
- **`pgrep -fc` counts your own shell.** `pgrep -fc browser.test.js` returned 2 against a genuinely
  clean machine, because the invoking command line contained the string. This is the same
  self-match that makes `pkill -f "user-data-dir=/tmp/track-cdp-"` kill its caller. List and read
  the matches; never trust the count.
- **One-time cleanup performed.** 21 processes (13 node, 6 shell wrappers, 2 Chrome roots) killed
  by explicit PID after re-verifying each against `/proc/<pid>/cmdline` and `pcpu`, and 31 profile
  directories totalling **1.8 GB** removed via `sweepStaleProfiles` itself, which dogfooded the new
  code against the exact mess it exists to prevent.
- **What was run: `node tests/run.js` end to end TWICE, and the second one is the one that
  counts.** Run 1 passed all 15 suites in 9.5 minutes on a machine made quiet by this task's own
  cleanup — but `cdp.js` was edited *while it was running*, so it had tested a module that no
  longer existed on disk. The two edits were provably inert for that path (a moved comment, and an
  early return that only fires when Chrome has already exited, which it has not at teardown), and
  it would have been easy to reason the second run away. It was run anyway: **all 15 suites pass
  on the final tree** — calendar-core (88) and schema (54) under all five swept timezones with
  identical results, true-storage-core (24), graph-layout (21), doc-table-core (42), cdp-cleanup
  (13), and **168 browser subtests, all passing** in 13.6 minutes under a load average of 2.5.
  Immediately after it: **0** `track-cdp-*` directories, **0** Chrome survivors, **0** node
  survivors, **0** stray listeners, and **0** of this suite's own scratch directories — the first
  time this repository can claim that. **A run against code you have since edited is not a run**,
  however small the edit and however sound the argument; the argument is what you write down when
  re-running is genuinely impossible, not instead of a re-run that costs ten background minutes.
- The browser file has grown from the 157 the previous entry records; that growth is other
  sessions' work, not this task's, which adds **no** browser case and changes only the teardown
  line.
- **Timing, since two entries above quote 11-14 minutes as if it were a constant:** the same suite
  took **9.5** minutes idle and **13.6** minutes at load 2.5, on the same machine, the same day.
  Treat the range as a load measurement, not a property of the suite.
- **Not covered.** A `SIGKILL` of node itself, which no handler can intercept — the day-old sweep
  is the backstop and is why it earns its place. Windows and macOS process-group semantics are
  unexercised; this ran on Linux only. And the suite still simulates no drag and touches no real
  hardware, unchanged by this work.

### Draggable table columns, and cells that wrap (2026-08-25)

- **No `track_db` slot change at all.** The slot stays at **23** fields — `colWidths` is an
  item-level key inside a block inside the existing `docPages` list — so the hand-written
  CONTRACT lists in `tests/schema.test.js`, `tests/browser.test.js` and `tests/lib/fixture.js`
  needed no change. `styles.css` was **not touched**: `table-fixed`, `relative`, `absolute`,
  `cursor-col-resize`, `touch-none` and `break-words` are all Tailwind utilities and the width
  itself is an inline `<col>` style, so no `?v=` moved except `doc-table-core.js?v=1` → `?v=2`
  in `documentations.html`, the only page that loads it. Offline cases in
  `tests/doc-table-core.test.js` go 42 → **57** (still run once, not swept — no date code).
  This task adds **three** browser cases and rewrites the cell selector in one it inherits.
- **The inherited case is a consequence, not a tidy-up.** `merging hides the covered cell, and
  unmerging restores it exactly` selected cells through `.doc-table td input`; the cell is a
  textarea now, so it reads `.doc-table td textarea`. It must go on passing, and it does — it
  is the guard that the wrapping change did not disturb merge geometry. The other inherited
  guard needed no edit at all and is the load-bearing one: *a pasted table with nothing merged
  is stored with NO merges key* asserts `Object.keys` is exactly `['id','type','rows']`, which
  is what proves `colWidths` is genuinely absent by default.
- **Fail-first, offline: 57 cases, 15 failed — and only ONE of those failures is evidence.**
  Fourteen died on `colWidthsOf is not a function` and the like, which is just what a new export
  looks like. The one that counts is `withRows leaves a table that was never resized with NO
  colWidths key`, which **passed on both sides** by design — the absence guard. Read which
  failures are load-bearing before counting them; a suite that goes 15-red to all-green is not
  15 pieces of evidence. This is the `cdp-cleanup` lesson in a second shape.
- **Fail-first, browser: the whole-feature baseline proved almost nothing, and that is the
  lesson.** A `TRACK_TEST_ROOT` tree of symlinks to the repository plus the two pre-change files
  (`documentations.html`, `doc-table-core.js`, both real copies) failed all three new cases —
  every one on a `waitFor` timeout for a selector that did not exist yet. That is
  "the control is absent" evidence, not behavioural evidence, and it is exactly the shape the
  TOUCH-sidebar entry warns about. Three **doctored** baselines were built instead, each
  symlinks plus **one** file with a single rule reversed, and their failure sets are
  informative:
  - `withColWidths` never DELETING the key → **only** `⇔ auto width asks first, and Cancel
    keeps the widths` failed, on `the reset reaching track_db` — the case's own named claim.
    The drag case and the wrap case passed.
  - `resizeColumn` not making the NEIGHBOUR pay → **only** the drag case failed, and on a hard
    assertion rather than a timeout: `while the column beyond the boundary did not move`,
    `26.05 !== 33.33`. Without the neighbour absorbing the change, normalisation spreads the
    cost across every column, which is the whole reason the total has to be conserved at the
    pair.
  - the cell reverted to an `<input>` → the wrap case **and** the inherited merge case failed,
    which is not a defect in the pairing but the visible cost of the selector change.

  The first two sets are disjoint and each fails on its named assertion. Never place any of the
  five baseline copies in the repository.
- **Two real defects were found by the browser cases and would both have shipped as a white
  screen, not a cosmetic bug.** Both are `Maximum update depth exceeded`, from different causes,
  and both are now written into the data-contract section:
  1. `AutoTextarea`'s new `ResizeObserver` fired on **height** as well as width. `fit()` sets
     the element's height, which changes the parent's height, which is a resize — an infinite
     re-fit. Gating on `clientWidth` changing is the fix; observing the textarea instead of its
     parent has the identical loop, so there is no "observe the other element" escape.
  2. The drag's `end` called the parent's `onChange` from **inside a functional `setState`
     updater**. React runs updaters during the render phase, so that is a side effect during
     render. The drag state lives in a ref beside the state now and the handler reads it
     synchronously. **Generalise it:** a functional updater is for computing the next state and
     nothing else — never read the in-flight value out of one to act on, and never call another
     component's setter from inside one.
- **A defect in this task's own test, of the kind that reads as a product bug.** The auto-width
  case passed `['auto width']` to `CLICK_SOON_TEXT`, which matches `textContent.trim()`
  **exactly**, so the button was never found and the failure said `the control exists` — which
  looks exactly like a missing control. The label is `⇔ auto width`, glyph included. Check the
  helper's matching rule before believing a "control not found".
- Percentages rather than pixels was chosen against the user's stated preference to have widths
  survive printing — it is the way to *honour* it. A pixel width prints at 96-per-inch and
  overflows A4 the moment a table gets wide; a ratio prints at whatever the page turns out to be
  and cannot overflow at all, because widening a column narrows its neighbour.
- **What was run: `node tests/run.js` end to end THREE times, and only the third one counts.**
  `node --check` passes on all nine shared modules. The final run: **all 15 suites pass** —
  calendar-core (88) and schema (54) under all five swept timezones with identical results,
  true-storage-core (24), graph-layout (21), doc-table-core (**57**), cdp-cleanup (13), and
  **170 browser subtests, 0 failures** in 13.4 minutes, with `md5sum -c` confirming the tree
  **byte-identical across the whole run**. No absolute browser total is claimed as this task's:
  another session was adding to `tests/browser.test.js` and `documentations.html` throughout,
  and only the delta of three is this task's.
- **Why the first two runs did not count, and both reasons are worth carrying forward.**
  - Run 1 reported all 15 suites passing — and the `md5sum -c` taken across it showed
    `documentations.html` had **changed while it ran**, because the other session landed its
    `TABLE_AI_BRIEF` edit mid-run. That is the `f29f3cf` / `1cf7b23` hazard in a third shape:
    the result was a run against a file that no longer existed on disk. The edit was provably
    inert here (a string array), and it would have been easy to reason it away; it was re-run
    instead. **Take an `md5sum` of the tree before a long run and check it after** — on this
    machine the tree can change without you touching it.
  - Run 2 was against a byte-identical tree and reported **2 of 170 failing**: cases 96 and 97,
    `malformed track_db (a goal has invalid children)` and `a malformed database survives a
    reload`, on `CDP connection closed` and a `progress.html mounting` timeout. That is the
    contention symptom the 2026-08-18 entry already names, in the section it already names as
    the suite's heaviest. Both passed in isolation immediately afterwards, and both passed in
    run 3.
- **The contention was not another test run, and the process list said so only if read
  properly.** There was exactly ONE `tests/run.js` alive — mine. `ps -eo pcpu --sort=-pcpu`
  showed the real cause: GNOME's `tracker-extract-3` pinned at 78% for over twenty minutes,
  indexing, with `tracker-miner-fs-3` behind it. **Look at what is actually burning CPU, not at
  how many test processes exist.** Two further traps hit in the same five minutes: `pgrep -f
  "tests/run.js"` matched the wait-loop shells that contained that string in their own command
  line and reported a run in progress when none existed — the self-match this file already warns
  about — and a quiet-check written as `ps --sort=-pcpu | head -1` always reads **`ps` itself**
  at ~100%, so it never fires. Skip the first row, or watch `/proc/loadavg`.
- **A trailing `grep` for failures makes a passing run exit 1.** The final run's wrapper
  reported exit code 1 while the log said `all 15 suites passed`, because `grep -E "^ *not ok"`
  exits 1 when it matches nothing and it was the last command in the chain. `node tests/run.js`
  itself had already printed `EXIT=0`. The `# pass 1` lesson again: **check the thing itself,
  not the summary you were handed.**
- **Not covered, and stated plainly.** Real touch hardware: the drag is synthesised from
  `PointerEvent`s inside the page, which exercises the handler and not iPadOS gesture
  arbitration, momentum, or scroll interception — and the handle is a 6px target, so a real
  finger pass is genuinely owed. Print output of a resized table was **reasoned about and not
  looked at**: no `@media print` rule sets `table-layout` or touches a `<col>`, and the blanket
  flatten rule forces colour and border but never width, so the colgroup survives by
  construction — but nobody has printed one. Also not covered, as ever: the live Firebase
  project.

### A merged cell you can type into, and movable rows and columns (2026-08-26)

- **No data-contract change at all.** The slot stays at **23** fields, nothing was added to
  `SLOT_FIELDS`, and the hand-written CONTRACT lists in `tests/schema.test.js`,
  `tests/browser.test.js` and `tests/lib/fixture.js` needed no edit. Nothing here is a new
  stored key: a move is a **permutation** of `rows`, `merges` and `colWidths`, and the fill
  is geometry. That mattered concretely — three browser cases pin a table block's whole
  shape (two `assert.deepEqual` of the block, one `Object.keys === ['id','type','rows']`),
  and an offline GUARD case asserts a move on an unmerged table gains no `merges` key, so a
  writer that stored `merges: []` would break all four for nothing. `styles.css` was **not**
  touched and no `?v=` moved except `doc-table-core.js?v=2` → `?v=3`, its only loader being
  `documentations.html`. Offline cases in `doc-table-core.test.js` go 57 → **73**; browser
  subtests go 170 → **176**.
- **The CSS this was planned around does not work, and only measuring found that.** The plan
  was `min-height: 100%` on the cell's textarea, on the widely-repeated belief that
  percentage heights resolve against a table cell. A standalone probe says otherwise in this
  Chrome: in a 165px `rowspan` cell, `min-height:100%` left the box at **32px** and
  `height:100%` at **36px** — neither resolved. The fix is a computed floor instead
  (`Math.max(scrollHeight, parentElement.clientHeight)`), and `styles.css` went back to
  untouched along with the five `?v=` bumps that had already been made for it. **Generalise
  it: a layout belief that degrades SILENTLY to the current behaviour cannot be confirmed by
  the page looking unchanged** — the case has to assert the number, and the number has to be
  looked at before the mechanism is chosen.
- Two things about `AutoTextarea.fit()` are load-bearing and are written into the data
  contract above. It sets `height:auto` **before** reading either number, so the cell height
  it reads is what the OTHER rows demand rather than what its own last write imposed — which
  is what makes it idempotent. And the ResizeObserver's new height gate is restricted to
  **filled** cells, because a rowSpan cell grows when a neighbouring row does (changing no
  width) while an unfilled cell never reads the floor at all, so admitting height there would
  be pure loop risk against a file whose own comment records an ungated observer killing the
  page with "Maximum update depth exceeded".
- **Fail-first, part one: the working tree WAS the pre-change file**, so the fill case needed
  no scratch directory. It failed on the assertion it is named for —
  `the text box FILLS the merged cell rather than sitting one line tall at its top (28 of 102px)`
  — with both preconditions passing, which is what proves it could see the cell. It was then
  **run a second time with its two claims reordered**, because AGENTS.md already records that
  a case asserting N claims is proven for exactly the one that fired: the hit-test claim then
  failed on its own, naming the dead space by its own class list —
  `hit td.relative.border.border-gray-700.p-0.align-top`, the bare `<td>` with no click
  handler.
- **Fail-first, part two: five doctored baselines, and the failure sets separate cleanly.**
  Each was a `TRACK_TEST_ROOT` of symlinks to the repository plus **one** doctored file, and
  the builder **prints the root it serves** on every run — the 2026-08-22 entry records a
  false all-green from a mis-set variable, and that is cheap insurance against repeating it.

  | doctored | fails | on |
  | --- | --- | --- |
  | `moveLine` skips the merge remap (the `withRows` trap) | the band case, alone | `r: 1` where `r: 2` was expected |
  | `lineBands` ignores merges — a plain adjacent swap | the band case, alone | `last` landed INSIDE the band |
  | `moveLine` does not permute `colWidths` | the width case, alone | `[20,30,50]` where `[30,20,50]` |
  | the button's `disabled` gating removed | the edge case | `the top row cannot go up` |
  | the selection does not follow the moved line | the repeat-press case, alone | `last` back at the bottom |

  A sixth, on the fill half: removing the observer's height gate fails the
  neighbour-grows case **alone** while the fill case passes. Never place any of these six in
  the repository.
- **And one whole-file baseline, which the environment chase produced as a by-product.** A
  complete run against a served tree holding the committed `doc-table-core.js` and
  `documentations.html` and nothing else changed failed **exactly** the six cases this task
  adds — 116 through 121 — and passed all 170 others. That is the cleanest statement of
  fail-first available: not six separate arguments, one run in which precisely this task's
  cases are red and nothing else is. It is also why the per-mechanism baselines above still
  earn their place — this one proves the cases need the feature, those prove each case needs
  its own half of it.
- **A limitation found by reasoning, not by a failure, and worth the paragraph it cost.**
  Bands mean a merge gluing a whole axis freezes that axis — and a full-width
  `| Total | << | << |` footer, which is in this repository's own paste examples, does
  exactly that to every column. The first implementation reported it as "This is already
  the first column", which is true of a one-column table and unactionable here, so
  `canMoveLine` now names the single-band case specifically. Reordering INSIDE a region
  was considered and rejected: the rectangle would survive it, but the owner cell would
  start drawing text that had been covered, which reads as loss. **The general point is
  that a refusal inherited from a general rule still has to be phrased for the case that
  actually triggers it** — the user cannot act on a reason that describes a different
  situation.
- **A real usability defect the tests surfaced rather than the code reading.** With the
  selection left pointing at the coordinate a move had emptied, a second press of the same
  button moved whatever slid into it — the first click did what was asked and the second
  undid half of it, which is worse than a button that does nothing. `canMoveLine` now returns
  `to`, computed where the band arithmetic lives rather than at the call site, and a browser
  case presses the same button twice.
- **Two defects in this task's own tests, both caught by reading the message.** (1) The
  "never changes cell text" case compared rows joined into strings — but a COLUMN move
  legitimately reorders the cells inside a row, so it failed on exactly the permutation it
  had asked for. It compares the multiset of cells now. (2) The band case first waited for
  the *right answer* to appear in `track_db`, so a wrong move timed out instead of reporting
  itself; against the `lineBands` baseline it produced a bare `waitFor timed out` and proved
  nothing. It waits for the write to LAND and then asserts, and the same baseline now fails
  with the actual rows. **A case that dies on its own `waitFor` says the control is
  unreachable, not that it is wrong** — that lesson is now in this file four times, in four
  shapes.
- **Environment note, and the wrong turn taken chasing it is the part worth keeping.** Two
  consecutive `node tests/run.js` runs failed the SAME single subtest — `a soft flaw (a
  dangling activeSlotId) still loads and stays editable`, on `waitFor timed out after
  15000ms — progress.html mounting`. Twice is not a flake you may wave away, and this task's
  first three attempts to clear it all proved nothing:
  - It passes run ALONE, and the whole 33-case malformed-`track_db` section passes together.
    Neither is evidence: the failure needs the cumulative state of a full run to appear.
  - Capped at the first 98 cases it passes on BOTH trees — but the cap changes the harness
    (direct `node file.js` rather than `node --test` after fourteen offline suites), so that
    comparison answers a different question than the one asked.
  - A full run against a pristine served tree passed case 98 — but it was run DIRECTLY, not
    through `run.js`, so it too was unmatched. **A control that differs from the failing run
    in two ways isolates neither.** On that single unmatched pass this task briefly concluded
    the regression was its own; it was not.
  The matched control — `TRACK_TEST_ROOT=<pristine> node tests/run.js`, same harness, same
  machine, only the two product files reverted — settled it by failing case **101** (`a
  healthy database is untouched by the load boundary`, which mounts all five pages in a loop)
  while passing 98. **Both trees drop a heavy page-mount case; which one falls over varies
  per run.** The cause is structural: every one of those mounts pulls React, ReactDOM, Babel,
  Tailwind and three Firebase scripts from `unpkg` and `gstatic`, and this session hit three
  outright CDN failures. `progress.html` loads *nothing* this task changed — checked, not
  assumed — so no causal path existed in the first place.
  **Generalise it: when a browser-layer failure reproduces, build the control that differs in
  exactly ONE variable before believing either verdict.** A reproducible failure is not proof
  of causation, and a single green control is not proof of innocence.
- **Environment note, and it is a new one.** Three separate browser runs failed on
  `realErrors` being non-empty with `ERR_CERT_VERIFIER_CHANGED` / `ERR_SOCKET_NOT_CONNECTED`
  fetching Firebase and Tailwind from their CDNs, plus the `ReferenceError: firebase is not
  defined` that follows. Every one passed on an immediate re-run. These pages load four
  scripts from `gstatic.com` and `unpkg.com` at mount, so **any** case in this suite can fail
  on a network blip in a way that looks like a product regression and even lands on a
  plausible-looking assertion. Read the actual `realErrors` payload before believing one.
- **Not covered, and stated plainly.** The four buttons live in the editor-body `.doc-chrome`
  strip, which has **no** `@media (hover: none)` fallback — only `.docs-sidebar
  .doc-row-acts` gets one — so on a touch device the whole table chrome stays at `opacity-0`
  and this feature is **unreachable**. That is pre-existing and not introduced here, but it
  is the largest gap in this entry and it is a real one: the complaint that prompted the work
  may well have come from such a device. Print output of a filled merged cell was reasoned
  about and looked at only through the existing print rules, never printed. Real touch
  hardware and the live Firebase project are unverified as ever.

### Creating work from a calendar day (2026-08-31)

- **No data-contract change at all.** The slot stays at **23** fields, nothing was added to
  `SLOT_FIELDS`, and the hand-written CONTRACT lists in `tests/schema.test.js`,
  `tests/browser.test.js` and `tests/lib/fixture.js` needed no edit — a Task or Routine is an
  ordinary node in the existing `goals` tree and an Action is an `saActions` record plus its
  `saEntries` row. `styles.css` was **not** touched (Tailwind utilities only) and no shared JS
  module changed, so **no `?v=` moved**. The offline suites are untouched and pass identically
  under all five swept timezones. This task adds **five** browser cases and one prop
  (`setSaActions`) to `SchedulePanel`.
- **No new date code, which is the cheapest part of the change.** The picker is opened per-day and
  already holds `ds`, a local calendar day string, so nothing here constructs a `Date` and the
  `toISOString().split('T')[0]` hazard is not in play at all.
- **Reuse rather than a second definition.** The goal branch is one `setGoals` updater composing
  `addChildAndTransferNotes` (so the first-child note transfer behaves as it does from the Goals
  panel) with `updateSchedule` (which already forks on `taskType`). The action branch mirrors
  `assignSAToDate`. `taskParentOptions` is the only new function, and it is deliberately NOT
  `getAllParentNodeIds`: that one answers "which nodes already have visible children", which is
  the wrong question — a leaf is a perfectly good parent for a new task, it simply stops being a
  leaf, and excluding leaves would hide most of the tree from the control that needs it.
- **Fail-first: three doctored baselines, and their failure sets are exactly DISJOINT.** Each was a
  `TRACK_TEST_ROOT` of symlinks to the repository plus **one** `progress.html` with a single rule
  reversed, and the builder **prints the root it serves** on every run — an earlier task in this
  file records a false all-green from a mis-set variable:

  | doctored | fails, alone | on |
  | --- | --- | --- |
  | the `updateSchedule` step dropped (created, never dated) | the task case and the routine case | `expected '<today>', actual undefined` |
  | the `setSaEntries` push dropped (action created, no entry) | the supporting-action case | `0 !== 1` on the entry count |
  | the parent refusal removed **entirely** | the refusal guard | `false !== true` on Create being disabled |

  Every one failed on the assertion its case is **named** for, which is why the named claim is
  written first in each. `GUARD: creating from the picker writes no key progress.html does not own`
  passed against all three, as a guard must. Never place any of the three doctored copies in the
  repository.
- **The third baseline passed on its first build, and that was the finding.** It deleted the two
  refusal lines the case was written against — and all five cases went green, because the
  cross-tab membership check added later *also* refuses an empty `parentId`, so the behaviour was
  still there. The doctoring had removed part of a refusal rather than the refusal. Rebuilt to
  delete the whole block, it fails the guard alone. **Generalise it: when a refusal has grown a
  second path, a baseline that reverses only the first proves nothing — and it reads as
  all-green, which is indistinguishable from the case being wrong.** It is also the evidence that
  the three checks are not redundant: they fire in order so the message names the user's actual
  situation ("create a goal first" / "choose what this sits under" / "that goal is no longer
  there") rather than the last one to match.
- **One of this task's own cases failed for the wrong reason first, and fixing it is the point.**
  The supporting-action case originally waited for BOTH `saActions` and `saEntries` to be non-empty
  and then read them. Against the dropped-`setSaEntries` baseline it died on
  `waitFor timed out after 15000ms — the action and its entry reaching track_db`, which says the
  control is unreachable and says nothing about the entry. It waits for the **write to land**
  (`saActions` non-empty) and asserts afterwards, and the same baseline now fails on `0 !== 1`.
  This is the same lesson this file already records in four other shapes: **never wait for the
  right answer to appear.**
- **A defect found by reading the diff, which no test would have caught.** `addChildAndTransferNotes`
  and `updateSchedule` both walk for an id and return the tree **untouched** when they do not find
  it. A `parentId` pointing at a goal another tab had deleted would therefore have closed the modal
  having written nothing at all — the typed task simply gone, with no error anywhere. The refusal
  now checks the chosen parent is still in the options list. It is covered by code reading only:
  exercising it needs a genuine cross-tab `storage` refresh landing between the modal opening and
  Create being pressed, and the committed suite does not drive that here.
- What the cases assert beyond the reversals: the new node is a leaf with `completed: false` and a
  string id from `TrackStorage.newId()`; a routine occupies the day through `routineDates[day]` and
  leaves `scheduledDate` alone, which is the arm the plain-task case never reaches; an action's
  entry points at the action it was created with; and the refusal asserts the **Cancel path** —
  `track_db` byte-identical after clicking the disabled button anyway.
- Nothing here deletes or clears, so nothing asks for confirmation. That is deliberate and sits
  beside merge/unmerge and line-move in the destructive-control rule's exemptions.
- **Not covered.** Real touch hardware — the bar is ordinary form controls, but it is reached
  through a 28px day-header button this repository has already had reachability trouble with, and
  a real device pass is owed. The cross-tab parent refusal above. The live Firebase project and
  print output, as ever; the picker is a modal and prints nothing.

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
  from. **Fixed on 2026-08-25** — `close()` can no longer throw and the browser is
  reaped on interrupt; see "A run that cannot leak" below. The `pkill -f` warning
  still stands.

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
