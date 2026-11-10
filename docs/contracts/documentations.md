# Contract: documentation pages, Projects and tables

**Mandatory rules, with the same authority as `AGENTS.md`.** Read this file before changing
anything it covers: `docPages` — `goalId` and the Projects tab, `goalPlace` (where a page link sits), and `table` blocks: `merges`, `colWidths`, `align`, `head` / `headCol`, moves, the cell textarea, the column drag and the `::: track-table` paste format.

Moved out of `AGENTS.md` on 2026-11-10, word for word and with nothing deleted, because
`AGENTS.md` had reached 174KB and is loaded into every agent session. A phrase such as
"the `merges` rule" or "the `time` / `link` rule" names a rule in this file or a sibling
one; the index in `AGENTS.md` ("Feature contracts") says which file holds which key.
A new rule for this area is added HERE, not to `AGENTS.md`.

---

A `docPages` item may carry `goalId`, naming a goal node. It puts the page, and every page under it, in Documentations' **Projects** tab under that goal (the user's 2026-10-29 request); `scripts/project-core.js` (`window.TrackProject`) is the one definition. It adds **no** slot field and **nothing was migrated**: absence is Events, so every page stored before it is already right. Eight rules follow, and the first three are the load-bearing ones:

- **Only the TOP page's `goalId` is read.** A sub-page belongs to whatever its top page belongs to, through `TrackProject.projectOf`; never read `p.goalId` at a call site, because a sub-page that happens to carry one would then sit in two places. Every move keeps that true by construction — `nestPage` deletes the moved page's own key, `promotePage` writes its top's goal onto it — and `tests/project-core.test.js` pins the three sidebar moves against **verbatim copies** of the Events-only functions they replaced, so an Events page still moves exactly as before.
- **Absence is Events, and sending a page back DELETES the key** — the `time` / `link` rule, not `cautionDates: []`, because no fallback sits behind it. `detachToEvents` is the writer and does the delete; never store `''` or `null`.
- **A goal's page IS the goal, found by its id in `goals`; nothing about it is copied into `docPages`.** That is why nesting, promoting or reordering a sub-goal — in either page — needs no second write and cannot leave a page behind. Do not add a `docPages` record per goal "for convenience": it would be a copy, and a copy is what drifts.
- **`documentations.html` writes `goals` only through `_mutateGoals`, a fresh read-modify-write, and every edit is a `TrackGoals` writer.** Never write `goals` from that page's React snapshot, and never spell a goal transform in the page — two spellings of one edit is how the same click comes to store two things. A drop is re-checked against the FRESH read (`goalDropValid`): a target deleted in another tab is refused there, where the nesting writers on their own would drop the dragged node. Progress owns `goals` and adopts the change on its `storage` refresh; a browser case asserts a task another tab added survives a Projects edit, and a doctored snapshot write fails exactly that case.
- **`progress.html`'s goal-tree functions are DELEGATES to `goal-core.js`**, kept only so their call sites do not move — the `milestone-core.js` rule. Never re-inline one: Projects calls the module directly, so a page-local copy is how the two pages would come to store different things for the same edit. A creating writer takes `creations`, minted by each page's `goalCreations` — **one `{id, now}` per node carrying the target id**, matching the per-node `uid()` the inline writers called, so a duplicated id still gets a record each.
- **Deleting a goal never deletes or rewrites a page.** A page whose goal is gone is listed under *Detached — goal deleted* (`detachedPages`, computed from the live goal ids), until it is attached to another goal or sent to Events; the delete prompt counts the pages. This is the day-note rule: a record outlives what it was filed under.
- **Every way out of the task window saves first.** `TaskModal`'s `close` runs `flushRef` — the pending title and length drafts — before `onClose`, for `✕`, Escape, the backdrop and `done`. Escape and a backdrop click fire no `blur`, so a commit-on-blur alone lost what was typed. Delete paths call `onClose` directly; there is nothing left to save.
- **Progress reads `docPages` and never writes it.** Its `📄` link goes through `TrackProject.pagesForGoal`; a doctored reader that drew the link whenever any page carried a `goalId` fails the chip case, which asserts it absent on a goal with no pages. The sidebar's disarm-on-click excludes `[data-goal-row]` beside `[data-doc-row]` — without it a goal row's first tap armed and disarmed in one click, and the phone case pins it.

A `docPages` top page may also carry `goalPlace: {parentId, afterId}` — where its **link** is drawn on its goal's page (the user's 2026-10-29 request: move a page's hyperlink anywhere on the goal's page, between tasks too). `project-core.js` is the one definition; it adds no slot field and nothing was migrated. Seven rules follow, and the first three are the load-bearing ones:

- **Absence is the default at both levels, and is never stored.** No key is the top of the goal's own list — where every page attached before this existed is drawn — and no `afterId` is the top of the named list. `withPlace` deletes the key for the first and never writes `afterId: null`: the `time` / `link` rule, because no fallback sits behind it.
- **A place means something only on the goal it was set on, so every move that changes the page's goal or makes it a sub-page DELETES it** — in `placed()`, which every page move goes through, never at a call site. A doctored `placed()` that keeps it fails the case that moves a page to a sub-goal.
- **A place is READ, never repaired.** `resolvePlace` reads a list that is not in the goal's directory as the top of the goal, and an `afterId` that is not a child of its list as the top of that list; `interleave` does the same for an unknown anchor and takes a repeated id's pages once. Nothing rewrites a stored place on read — an edit in Progress routinely leaves one stale, and a repair on read would be a write from a render.
- **The directory (`directoryOf`) never enters a sub-goal or a link.** A sub-goal's tasks are drawn on the sub-goal's page, and a link's subtree is the original's, elsewhere — a place inside either would be drawn on another page or nowhere. `findGoal` likewise never resolves a link.
- **Every goal write from Projects that MOVES a node names it, and the heal reads `docPages` FRESH.** `mutateGoals(fn, moved)` heals in the same call (`TrackProject.healPlaces`) over a fresh read of `docPages`, writes that one key, and adopts the stored list — never `setDocPages(prev => …)`: the autosave writes React's whole list, so healing this tab's state wrote it back over a page another tab had just edited or added (Astra's review; the browser case `healed from what is STORED` pins it). The heal: a link whose anchor moved or went walks back to the nearest surviving, unmoved sibling before it, a link inside a list that left the directory climbs to where that list stood, and links inside a moved node go with it. The sidebar's `nestGoal` / `arrangeGoal` / `promoteGoal`, the goal page's drops and the task window's `↑` / `↓` / `move` each pass the moved id. A new moving writer that forgets it leaves links following their anchor across the page: a doctored `healPlaces` that ignores `moved` fails exactly the case that reorders a milestone past its link. Progress does not heal (it does not own `docPages`); see NOTES.
- **A move is judged by what is DRAWN, never by array indices or by being named.** `movePageTo` returns its input for a drop that keeps the page's place and its order among the links there, whatever its `docPages` index; `healPlaces` ignores a node named in `moved` that still stands where it stood (same parent, same sibling before it — `reorderSibling` returns new arrays for a drop in place), and re-deals links that come to share one spot in the order they were drawn (`drawnOrder`). And only the directory's own node of an id holds links (`placedIn` in `documentations.html` compares the node with `directoryOf`'s by identity), so two nodes sharing an id never draw one link twice. Each has an offline or browser case with a doctored baseline that fails it alone.
- **The To learn list is the second kind of place: `goalPlace: {area: 'learn', afterId?}`** (the user's 2026-11-01 request). `afterId` is a mind-map id in the goal's `toLearn` — a NUMBER in real data, compared with `===` — and absent is the top of the list. `withPlace` writes it from a spot `{learn, parentId, afterId}`, so a move back to the directory writes a directory place and the `area` goes with it. It is read like a directory place (an anchor gone from `toLearn` reads as the top of the list, never repaired) and `healPlaces` leaves it exactly as stored, because Projects never edits `toLearn`. `placesFor` excludes it; `learnPlacesFor` lists it. A to-learn row's `data-proj-row` is `mm:<index>` into `learnRows(goal, mms)` — the one flattening both the list and `commitProjDrop` read — and takes only a page link's `⇅`.
- **One validity rule answers both the indicator and the commit.** `projDropValid` decides whether a row lights up, by mouse and by finger, and `commitProjDrop` acts only on a hit it returned; a node's drop then re-asks `projNestValid` / `projArrangeValid` of the FRESH read inside `mutateGoals`, so a tree changed in another tab since the drag began refuses rather than half-moves. The task window's **Move under…** asks `projNestValid` of the fresh read too: `nestTaskIntoTask` DROPS the dragged node when its target is gone, so an unguarded move to a destination deleted in another tab deleted the task. Nothing drops onto a page link, and a page link's `⠿` onto a task or milestone puts it last in that list. A page link's `⠿` is also the sidebar's, by mouse AND by finger: onto a sidebar goal row it attaches the page, onto a page row it nests — `touchDropAt`'s `'proj'` branch falls through to those two targets only for that drag. The handles are `hidden group-hover:flex`, shown outright under `(pointer: coarse)` by a `.proj-dir .proj-handles` rule — two classes, so it beats Tailwind's `.hidden` (the `.docs-sidebar-full` lesson).

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

A `table` block may also carry `align` — per-cell alignment, `[{r, c, h, v}]` with `h` ∈
`left|center|right` and `v` ∈ `top|middle|bottom`, either absent — and `head` / `headCol`,
how many leading rows and columns draw as headers. Five rules follow, and the first two
are the load-bearing ones:

- **`align` is the `merges` shape exactly**: a parallel list keyed by coordinate, never a
  promotion of cells to objects — `rows: [[string]]` is a contract every stored table and
  both whole-block `deepEqual` browser cases rest on. Absence is the default and
  `withAlign` deletes the key when the list empties; `alignAt` is the one reader, and no
  call site spells an `align.find(…)`. An entry on a covered cell is KEPT, so unmerge
  restores the alignment along with the text — rule 2 applied to a second field.
- **The two positional funnels treat `align` DIFFERENTLY, on purpose.** `withRows`
  re-normalises it against the new BOUNDS — a dropped row takes its alignment with it,
  because a later row at that index is a different row whose text is not coming back.
  `moveLine` remaps it against the new INDICES, exactly as it does `merges`. Sending a
  move through `withRows` leaves every alignment on the coordinate it used to sit at,
  silently decorating whatever moved in — rule 5's corruption in a second field. Doctored
  baselines for the two directions fail exactly disjoint case sets.
- **`head` absent means 1, `headCol` absent means 0** — what tables always drew — and
  `withHead` DELETES a key at its default, so `head: 1` never becomes a second spelling of
  absence. Both are clamped **on read** (`headOf`), never on write: a `head: 3` on a table
  cut to two rows draws two and stays 3, so `+ row` restores it. That is the deliberate
  difference from `merges`/`colWidths`, which clamp on write because a region pointing off
  the grid is not drawable; a count carries no geometry. `withRows` therefore does not
  touch these keys.
- **`isHeaderCell` is the one definition of what draws bold**, feeding the editor grid and
  the paste preview through the same `TableGrid` — it replaced a literal `ri === 0`
  spelled at both sites. Headers are positional by declaration: a row moved to the top
  BECOMES a header because "the first N rows are headers" is what the field means; per-row
  identity flags would be the promote-to-objects shape again.
- The paste format carries both: a pipe-less `head: N` / `headcol: N` directive line
  inside the fence (any other pipe-less line is still refused, so outside text stays
  caught), and a markdown separator row's colons set column alignment, expanded to one
  `align` entry per **drawn** cell. A plain `|---|` row still says nothing, so every
  pre-existing paste stores the identical bytes. `formatTableText` emits a separator row
  only for a column whose drawn cells all agree; a lone off-column cell and the whole
  vertical axis deliberately do not travel — `colWidths`' "transcription of a picture"
  rule. `blockFromParse` (`documentations.html`) is the one place a parse becomes a block,
  used by the preview and by Insert, which is what keeps the two from drifting. Neither
  `align` nor the header counts are validated in `schema.js`, like every other block
  field; `doc-table-core.js` reads them through helpers that cannot throw.

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
