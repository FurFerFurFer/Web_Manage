# Track

Track is a personal learning-progress system built around three connected frameworks:

- **Marginal Gains (MG):** record and review small improvements.
- **Kolb's Learning Cycle:** capture experience, reflection, concepts, and experiments.
- **Spaced Interval Review (SIR):** schedule repeated reviews to retain learned material.

The application also combines hierarchical goals, milestones, routines, supporting actions, source material, calendar scheduling, streaks, notes, and multiple isolated workspaces.

This README is the source of truth for what the project currently contains and how work is currently performed. Proposed improvements and unimplemented architecture belong in [NOTES.md](NOTES.md). Agent-specific operating rules belong in [AGENTS.md](AGENTS.md).

## Current Status

Status reviewed: 2026-08-06

- The application renders successfully in a local Chrome smoke test.
- `index.html`, `progress.html`, `sir-ks02.html` and `documentations.html` are the active pages.
- Development currently happens on `master`; the inspected history contains no merge commits.
- There is still no build step and no package manifest, but there **is** now a committed test suite: `node tests/run.js`. It uses Node's built-in `node:test` and a hand-rolled DevTools-protocol driver, so it adds no dependencies. See "Running the tests".
- The standalone scripts `theme.js`, `schema.js`, `storage-guard.js`, `calendar-core.js`, `firebase-sync.js`, `notes-widget.js`, `true-storage-core.js`, and `graph-layout.js` pass `node --check`.
- React pages currently compile JSX in the browser through Babel.
- Data is stored locally first and can optionally be synchronized through Firebase.
- Every page provides persistent light and dark themes with a shared accessible switch.

The code is operational. Verification is syntax checking, the committed suite, and manual interaction checks for touch and drag behaviour the suite does not reach.

## Documentation Map

| File | Responsibility |
| --- | --- |
| `README.md` | Current product behavior, architecture, data layout, project progress, and active workflow |
| `NOTES.md` | Ideas, risks to address, possible changes, target architecture, and roadmap |
| `AGENTS.md` | Mandatory project rules and verification procedure for coding agents |

When a proposed change is implemented:

1. Update this README to describe the new current behavior.
2. Remove, revise, or mark the corresponding proposal in `NOTES.md`.
3. Update `AGENTS.md` only if the operating rules or required checks changed.

## Current Features

### Home and workspace management

`index.html` is the project hub. It currently provides:

- Navigation to KS02, Progress, Documentations, and True Storage.
- Creation of named workspace slots.
- Active-slot selection.
- Slot renaming and deletion.
- Per-slot JSON export.
- Per-slot JSON import.
- Source-dump-only export and import.
- Basic workspace metadata counts.
- A read-only **Universal calendar** aggregating the active slot's dated data by day.

Each slot is intended to isolate a different subject, course, project, or learning area.

The Universal calendar is a month grid with a legend, a today highlight, milestone period bars, per-category colored dots, and a click-to-open day detail panel. It never writes data, re-renders on slot activation and on cross-tab `storage` events, and uses local calendar dates throughout.

**The calendar always fills the screen.** It is the last section of Home, but breaks out of the page's `46rem` column to span the full viewport width and is pinned to exactly one viewport height (`100dvh`), so scrolling down to it gives the month the whole device screen on phone, tablet, and desktop. Grid rows share the remaining height (`1fr`), so cells grow with the display instead of sitting at a fixed pixel height, and day numbers, dots, and milestone bars scale with them. On viewports under 600px tall (landscape phones) the panel keeps a `min-height` and grows past one screen rather than crushing the cells, with a `2rem` row floor. Cell padding and the grid gap come from `--cal-cell-pad-x` and `--cal-gap` on `.cal-panel`, which the milestone bridge margins are derived from — change padding through those variables so the bars stay aligned.

**Milestone periods** render as thin horizontal bars rather than repeated dots. Milestones are deduplicated by id (definitions are cloned across linked goal nodes), packed greedily into lanes so each keeps one row for its whole `startDate`–`endDate` span, and coloured from the same palette the Progress Milestones tab uses. A bar bridges the gap into the next day cell so a period reads as one continuous line, with rounded caps on its real start and end days and no bridge across a week wrap. Hovering a bar shows its title, owning goal, and dates. Days carrying more than three concurrent milestones show a `+N` badge.

**Clicking a day** opens a read-only preview of that day's schedule, mirroring the Progress Schedule day view: a 00:00–24:00 timeline at 28px/hour with blocks positioned by time and duration, overlapping blocks split side by side using the same connected-component algorithm as `SchedulePanel`, plus a strip above it for MG focus (with the same 30-day carry-forward and `↑ carried` hint as Progress), SIR sessions due that day (shown on `finishDate` when done, skipped sessions excluded), calendar notes, and deadlines. The preview has no handlers or inputs and never writes to `track_db`. A `→` button beside the date opens `progress.html?date=YYYY-MM-DD#schedule`, which loads the Schedule tab in day mode focused on that date; the date rides in the query string so the existing `#hash` tab routing is untouched. A `×` button beside it closes the day again.

**Deadlines** appear in that strip as red `⏰ HH:MM Title` chips on their due day, followed by amber `! Title` chips for any caution period still running through the day (the due day itself is not repeated as a caution, and a ticked deadline contributes no `!` at all — its due chip turns green, struck through, with a `✓`). Both kinds are links to `progress.html?date=<due day>&dl=<id>#schedule`, which opens that deadline's popup in the Schedule — always the **due** day, so a `!` three weeks out still leads to the thing it is warning about rather than to the day it sits on. Hovering a note or deadline shows where it came from — "Added in the Schedule", or the documentation page that added it. The Home calendar stays read-only: it links out to where a deadline is edited rather than editing one itself, so provenance is a tooltip here while Progress and Documentations render it as a link.

The aggregation behind this calendar lives in `calendar-core.js`, shared with the calendar blocks in Documentations. Home renders all of it — it passes no filter set.

The detail appears **beside the grid above 720px** as a scrollable column, so the whole month stays visible while a day is open, and **as a fixed bottom sheet at 720px and below**, capped at `62dvh` and padded clear of the notes-widget button. Because the panel's height is definite, a long timeline scrolls inside the column instead of pushing the calendar past one screen. When no workspace exists, the "create a workspace" message renders in the empty month area rather than in the detail.

**Dots** below the day number cover only what the day schedule does not already show: Kolb records and MG changes fused into one category, LIN records (titled from `linDayTitles` when present), floating notes (by local day of `createdAt`), and source-dump creations. These are listed under the timeline in the day detail, with Kolb and MG-change rows distinguished by a meta label. Scheduled goal tasks, routine occurrences, SIR sessions, supporting-action entries, MM study entries, MG focus, and calendar notes are shown in the day timeline instead of as dots — a day note carrying a `time` sits on the hour grid, and one without stays a chip in the strip above it. MM creations, MM comments, and Documentation-page creations are not surfaced on the calendar.

### Appearance and accessibility

The shared interface currently provides:

- Coordinated light and dark palettes across Home, Progress, KS02, Firebase states, and floating notes.
- An accessible switch that follows the operating-system theme until the user makes a choice.
- Persistence of the selected appearance across pages and browser tabs through `track_theme`.
- Visible keyboard focus, reduced-motion handling, stronger text contrast, and 44px primary touch targets.
- Responsive Home cards and horizontally scrollable app navigation on narrow screens.
- A full-screen Universal calendar on every device, with its day detail as a side column above 720px and a bottom sheet at or below it.

### Mind maps and knowledge structure

`sir-ks02.html` currently supports:

- Anchor, type-1, and type-2 mind maps.
- Parent/child mind-map relationships.
- Search and sibling reordering.
- Multiverse-style visual positioning.
- Custom colors.
- Source-content links and text blocks.
- Source-dump trees.
- Transfer of source content between mind maps.
- Ratings and level templates.
- Mind-map stage tracking.
- Connections between related learning material.

### Kolb learning records

The KS02 page currently supports:

- Kolb entries connected to mind maps.
- Kolb-stage selection.
- Editing and reviewing prior entries.
- Timed learning/reflection sessions.
- Level information.
- Linked references and source material.
- Ordered Kolb records.

### Spaced Interval Review

The current SIR implementation includes:

- Review sessions associated with mind maps.
- Review scheduling at spaced intervals.
- Calendar views.
- Completion and revert behavior.
- Per-mind-map review history.
- SIR completion information used by goal progress.
- Schedule-session details distinguish the current stage derived from completed repetitions from the stage of the selected scheduled session (for example, D7 is `SIR T3`).
- Timeline day badges show each session's stage (`T1`–`T5`). Scheduled and postponed sessions are green on their current scheduled date; completed sessions move to their actual finish date, turn yellow, and show `DONE` in their details. SIR badge state refreshes when the database changes in another tab or when Progress becomes visible again.

### Marginal Gains

Current MG behavior includes:

- MG records connected to mind maps.
- Timelines and level views.
- Day-specific MG scheduling.
- MG visibility inside Progress and Schedule.
- Current-MG updates based on Kolb entries.

### Goals, tasks, and milestones

`progress.html` currently supports:

- Hierarchical goals.
- Subgoals and tasks.
- Linked tasks and linked subgoals.
- Nesting and sibling reordering.
- Completion state.
- Goal notes and task notes.
- Goal-linked mind maps through `toLearn`.
- Mind-map stage and level targets.
- Automatically calculated MM completion.
- Milestone definitions and milestone periods.
- Milestone blocks and milestone progress.
- Routine task dates.
- Task scheduling and duration.

### Progress and streaks

The Progress page currently calculates:

- Completed and total actionable work.
- Mind-map learning progress.
- Combined goal percentages.
- Streaks based on LIN activity.
- Milestone and goal visualizations.

### Schedule and supporting actions

Current scheduling behavior includes:

- Day-oriented calendar and timeline views.
- Scheduled goals and tasks.
- Routine tasks.
- Supporting actions and their entries.
- MM schedule entries.
- MG schedule entries.
- Calendar notes.
- Deadlines with caution periods.
- Source pins connected to scheduled work.
- Drag, touch, expansion, and near-edge interaction behavior.
- A locally stored priority matrix.

The timeline grid covers the whole local day, `00:00`–`24:00`, at a default 64px per hour (day mode
zooms between 32px and 256px). Dragging or top-edge resizing snaps to five minutes and clamps a block
start to the `00:00`–`23:55` range, so every hour of the day is a valid drop target. Hour labels read
`12am` through `11pm`.

**Deadlines** are a separate slot field from calendar notes. A deadline is due on one date at a
required time, and carries a required caution-period start date, a title, and an optional
description:

```js
{ id, date: 'YYYY-MM-DD', time: 'HH:MM', startDate: 'YYYY-MM-DD', title, detail, createdAt, done,
  blockOff, blockDuration, blockTime, blockDate, parts }  // all optional — see "Schedule blocks" below
```

The caution period runs `startDate` through `date` **inclusive**; `startDate` defaults to the due day,
so the minimum period is that single day and a brand-new deadline marks no run-up until one is chosen.
Because both are `'YYYY-MM-DD'` strings, membership is a plain lexicographic comparison (`inCaution` in
`SchedulePanel`) and needs no date arithmetic, so it does not drift across DST, a month boundary, or a
year boundary. A deadline with no `startDate` — for instance one hand-edited out of an export — falls
back to a one-day caution period rather than failing.

`deadlinesCautionOn(ds)` in `SchedulePanel` returns the **run-up only**: it excludes the due day, which
is already drawn as the deadline itself, and it excludes any deadline that has been ticked. It matches
`deadlinesCaution` in `calendar-core.js`, which applies the same pair. Every surface reads the run-up
through that one helper rather than filtering at each call site.

Deadlines are created in Schedule → CALENDAR, next to date notes: a `⏰` hover button in each month
day cell, and a `+` on the DEADLINES header of the selected-day panel. Both open an inline composer
carrying a `Due date` row of its own, seeded to the cell it was opened on, so a deadline can be filed
for any day without navigating there first. Save is blocked until the title, the due time, a
well-formed due date, and a caution start on or before it are all present. Filing one on another day
moves the Schedule to that day, so the new deadline is never written out of sight. In the month grid a due day shows a red `⏰ HH:MM Title` line and every other caution day
shows an amber `! Title` line. The selected-day panel lists deadlines due that day as editable rows
(double-click to edit, `×` to delete) and caution-only deadlines as read-only amber rows.

In Schedule → TIMELINE, a deadline draws a **red line across its day column at its due time**, on its
own date only, with a clickable diamond and a `HH:MM Title` label. The line paints above every block
state — normal, selected, and picked-up — so a task block can never cover it; its full-width hairline
is click-through, so only the diamond and the label take pointer events and a block underneath stays
draggable and resizable. Every other day of the caution period instead shows an amber `!` chip in the
day header, beside the 📌 note chips; the due day shows the red line alone, never both. The red line,
the `!` chips, the month-cell lines, and the caution rows all open the same deadline popup.

**Choosing the caution period.** The popup sets it directly, in its read view rather than behind
`Edit`: a `Caution from` date picker capped at the due day, `−3d` / `−7d` / `−14d` quick-sets, a
`reset` that returns the start to the due day, and a live `→ due-date · N days` readout. Each pick
writes `startDate` on its own, spreading the stored record so `docPageId`, `createdAt` and any field a
later version adds survive. The picker **refuses** rather than writes a cleared value or a start after
the due day, so `startDate` is never blank and never inverted; `reset` is what undoes a caution
period. `Edit` still exists for changing the time, title and description together, and carries the
same field.

**Moving the due day.** `Edit` also carries a `Due date` row, above `Due time`. It is the only place
an **existing** deadline's date can change: moving one has to check the prep already placed inside its
caution period, and this is the one writer that does. The two composers type a due date only while
creating, where there is no placed prep to strand; both edit forms — the day-cell composer's and the
Documentations one's — still take the day from the record. The two date fields cap each other from
opposite sides: `Due date` will not go below the caution start, `Caution from` will not go above the due day,
and because both read the draft rather than the stored record, the pair can be moved in either order
inside one edit. An out-of-order or cleared date is **refused** — Save is disabled and the form says
which — rather than repaired: the caution start is a period the user chose and is never clamped or
shifted to make room for a new due day. Saving keeps the record itself, so `createdAt`, `docPageId`,
the tick and above all the **id** survive, and every `progress.html?date=…&dl=…` link still opens the
deadline even though its `date` parameter now names the old day. The Schedule follows the move: the
timeline re-anchors and the month grid opens on the new month, and a day panel that was already open
moves to the new due day while a closed one stays closed.

That refusal is load-bearing rather than fussy. Nothing validates `startDate <= date` on a *stored*
record — `schema.js` checks each date's format on its own — and an inverted span disables the
Documentations edit form for that deadline, whose Save is gated on `dlValid` against the stored
caution start. Every writer of `date` therefore carries the ordering check itself, through one helper:
`dlDraftValid` — `TrackCalendar.dlDraftValid` in `calendar-core.js`, with the documented second copy in
`progress.html`, which does not load that file. It tests the draft's own date for format first, because
a blank date sorts below every caution start and would otherwise read as in order.

**Ticking a deadline.** A deadline carries an optional `done` flag, and ticking it makes every `!` it
puts on its run-up disappear — the month grid, the timeline day headers, the selected-day panel, the
Home calendar and any Documentations calendar block — while the deadline itself stays on its due day in
green with a `✓` and a struck-through title. Nothing is deleted and the caution period is not rewritten:
`dlDone` only suppresses the run-up's *rendering*, so unticking restores exactly the same `!` days.
Absence of the key is "not done", so no existing deadline needed a migration.

The tick is in the popup, on the selected-day panel row as a checkbox, and on a Documentations calendar
block's own rows — the same ownership gate as that block's `✎`/`✕`, because a tick is an edit. The Home
calendar stays read-only and links out to the Schedule instead. Every one of them writes `done` alone,
spreading the stored record. While a deadline is ticked, the popup's caution picker stays live and
editable but dims and reads `· hidden while ticked`, rather than promising marks that are not on screen.

The popup can also be opened straight from a link: `progress.html?date=<due day>&dl=<deadline id>#schedule`
selects the Schedule, anchors the timeline on the due day, and opens that deadline. The id has to match
a stored deadline, so a stale link opens nothing instead of erroring.

**Schedule blocks for day notes and deadlines.** Every day note and every deadline has a real block
on the hour grid, and it has one **automatically**: 60 minutes, auto-placed relative to the time it
already has. A **deadline's block ends at its due time** (it is the run-up to the deadline, not the
deadline itself) and a **day note's block starts at its time**; a note with no time of its own sits
at `08:00`. A block is a first-class block — it takes part in the side-by-side overlap layout with
goal, supporting-action and MM blocks, and it drags and resizes by mouse and by touch — unlike the
zero-height note marker and deadline hairline, which are deliberately excluded from that layout.

Nothing is written to make that happen. `blockOff` is the single switch for being on the grid and
its **absence** means the item has a block, so items stored long before any of these keys existed
are simply drawn — there is nothing to migrate because nothing needs writing. `blockDuration` is
only a remembered length, `blockTime` only a remembered start and `blockDate` only a remembered day;
each falls back to the automatic default when absent.

An item's block and its own identity are separate. **Both surfaces are always drawn**: a note keeps
its day-strip chip and its point marker whatever its block is doing, and a deadline keeps its red
due-time hairline and its amber caution run-up. Scheduling something never takes away the way it was
already visible, and taking a block off the grid never makes the item disappear.

**Work can be scheduled on any day.** `blockDate` puts an item's block on a day that is not its own,
and a `date` on a part puts that one step somewhere else again — so a deadline's prep can live on an
earlier caution day, or be split across several. The item's chip, marker, due line and caution
run-up all stay on the item's own `date` regardless. A deadline's block and every one of its parts
must sit **inside its caution period** (`startDate` through `date`): a horizontal drag is clamped to
that window, the task-day picker is capped to it, and an edit to `startDate` or `date` that would
strand already-placed prep is **refused** with the offending day named — in both the Progress popup
and the Documentations form. Nothing here moves or clamps a day the user chose; the user moves the
block and comes back. A day note's block has no such restriction and may go anywhere.

A drag therefore writes `blockDate`/`blockTime` — or a part's own `date`/`time` — and **never** the
item's `date` or `time`. That is load-bearing for a deadline: moving a *due* day remains the sole
business of its edit form, which is the one path that checks `startDate <= date`. A run-up that
would begin before `00:00` is clipped at the top of the grid and shortened, so it still ends on its
due time rather than being pushed past it.

**The `☰` button** sits beside `+ ◎ ⊕` in each timeline day header and opens a browser over **every**
day note and deadline in the slot — not only that day's — as **one flat list in chronological order**
by each item's own date and time. The rows belonging to the day the panel was opened on are tinted
and scrolled into view. `All` / `Notes` / `Deadlines` tabs and a text filter narrow it. Each row
links to that item's existing popup, shows its **own date and time as a read-out** (they are changed
from the item and nowhere else), and carries:

- `＋`, which opens a task composer: a name, a **day** and an optional time, then `Add`. Tasks are
  stored in `parts`, mirroring what `✂` already does to a scheduled goal task. A task inherits the
  parent block's start and length unless given its own, and its day is written only when it differs
  from the parent block's. On a deadline the day picker is capped to the caution period and `Add` is
  refused outside it. While an item has tasks, **the tasks replace the parent block** on the grid,
  exactly as a goal task whose child sits on the same day is represented by the child. Each task
  gets its own checkbox, and removing the last one deletes the key so the parent block returns.
- `remove from schedule`, which sets `blockOff` and **deletes nothing** — the length, day and anchor
  are all remembered, so `＋ add block back` is a restore rather than a recomputed guess. The item
  itself is untouched: its marker, chip, hairline and caution run-up all stay.
- `reset to due time` on a deadline whose block has been moved off its anchor, which deletes both
  `blockTime` and `blockDate` so the block goes back to ending at the due time on the due day.

### Floating notes

`notes-widget.js` mounts a floating notes widget on every page. It currently supports:

- Multiple notes per active slot.
- Topic and content editing.
- Automatic local saves.
- Note deletion.
- Collapsed, list, and detail views.
- Resizable panel dimensions.
- Migration of older global notes into the active slot.

Legacy `track_global_notes` adoption resolves the same slot the widget displays: the stored
`activeSlotId` when it exists, otherwise the first slot. The legacy key is removed only
after `TrackStorage.saveDB()` confirms that the merged notes landed. If there is no slot,
the write is refused (including quota or blocked-data refusal), or saving throws, the key
stays as the only recoverable copy. A valid legacy payload whose notes list is empty is
still cleaned up without requiring a slot write.

### Documentations

`documentations.html` is a Notion-style documentation workspace for recording external events and information. It currently supports:

- Nested pages in a sidebar tree (any depth, flat `parentId` structure like source dumps), with expand/collapse, add page, add sub-page, and cascade delete with a count confirmation.
- Drag to nest and drag to arrange, ported from the Progress goal tree: every sidebar row carries two handles — `⠿` (indigo) drags the page onto another page to nest it as that page's last child (auto-expanding a collapsed target), and `⇅` (green) drags it before/after a target row by vertical midpoint, adopting the target's parent so one drag can also move a page between parents or out to root level. Dropping the `⠿` handle on the "Pages" header promotes a page to top level. Drops onto the page itself or any of its own descendants are refused outright (a `parentId` cycle would make the whole subtree unreachable).
- **Both handles work by finger as well as by mouse.** The mouse path is the HTML5 drag-and-drop API, which never fires on touch; a second, parallel touch path drives the *same* three mutators (`nestPage`, `arrangePage`, `promotePageToRoot`), so the cycle refusal and the splice logic have one definition and cannot drift between pointer kinds. Pressing a handle starts the drag immediately — no arming step, because a handle is an unambiguous grab affordance — while a finger anywhere else in the row still scrolls the sidebar; `touch-action: none` on the handles is what separates the two. A ghost chip follows the finger, the row underneath lights up exactly as it does under a mouse, the list auto-scrolls when the finger nears the top or bottom edge, and `touchcancel` (which iPadOS fires instead of `touchend` when the system takes a gesture over) abandons the drag without moving anything.
- Where hover does not exist (`@media (hover: none)`), the row's `⠿ ⇅ ＋ ☆ ✕` cluster is permanently visible instead of hover-revealed, and each control is a 44px target. Five of those need 220px and the column is 240px, so on touch the cluster takes its own line under the title — rows get taller, which is the cost of reachable targets, and the full-screen mode below is the answer for browsing a long tree.
- **A `⛶` button at the top of the sidebar expands it to fill the viewport**, with 16px rows, 44px controls and a wider indent. Picking a page selects it *and* exits, so it is one tap in, one tap to a page, out; `✕` and `Escape` also exit. It is `position: fixed` at `z-index: 50`, which covers the page header and the theme toggle while staying under the notes widget and the storage/sync banners, and its bottom padding clears the notes-widget button so the last row stays tappable.
- A Favorites sidebar section toggled per page from either of two star buttons that share the same `favorite` field: the small one revealed on hover in the sidebar page row, and a large touch-sized one at the right end of the page's toolbar row.
- A per-page emoji icon chosen from a picker grid or typed freely.
- Block-based editing: H1/H2/H3/paragraph text, dividers, tables (editable cells, add/remove rows and columns, first row styled as header), images, and label + url link blocks rendered exactly like source-dump links.
- A **Reference source dump** popup that shows the active slot's source-dump tree fully expanded — every nesting level and every leaf `{label, url}` link visible at once — and inserts a picked link as a link block carrying `dumpRef: {dumpId, linkId, urlId}` provenance. The block shows a "from: <dump title>" badge that degrades to "source removed" if the source is later deleted.
- Images chosen from disk are downscaled (max dimension 1000px) and stored as compressed JPEG data-URIs inside the page, so they export, import, and cloud-sync with the slot. There is no size gate on inserting one: cloud sync gzips and chunks the workspace, so images no longer threaten it. The header instead shows a plain workspace-size readout plus a cloud sync state (`✓ synced`, `↻ syncing…`, `⚠ sync failed`, `⚠ conflict`, or `· local only`), read from `window.TrackSync`. The size turns amber only past ~4 MB, which tracks the browser's own `localStorage` quota rather than any cloud limit.
- **Calendar blocks** — see below.
- Export/share via **Export / PDF**: a print stylesheet hides all app chrome and forces light colors; the browser print dialog then saves the page as PDF (or prints it). Calendar blocks are exempt from the colour flattening, since their dots and milestone bars carry meaning in colour; their controls, filter bar and composers are hidden instead.

Pages are stored in the per-slot `docPages` field, and day notes and deadlines authored from a page go into the shared `calendarNotes` and `deadlines` fields. Every write touches exactly one slot key and is a fresh read-modify-write of `track_db`, so nothing another page or tab owns is ever rebuilt from this page's snapshot; the page also refreshes from `storage` events so other tabs' edits appear. On a completely empty install it creates a default slot; if unmigrated legacy Progress/KS02 data is detected instead, it asks the user to open those pages (or Home) first rather than risk orphaning the legacy data.

`documentations.html?page=<docPages id>` opens straight to that page — the counterpart of `progress.html?date=`, and what the origin links in the Schedule point at. An unknown id is ignored and the usual "first favorite, else first root" selection applies.

#### Calendar blocks

**🗓 Calendar** in the add-block menu drops a calendar into the page body. It behaves like any other block: several can coexist on a page, and the hover chrome moves and deletes them.

A calendar shows the same aggregation as the Universal calendar on Home — month grid, today highlight, milestone period bars, category dots, and a click-to-open day detail with the read-only day timeline — plus the two things a documentation page can author itself: **day notes** and **deadlines**. Both are written into the shared slot arrays, so they appear on the Progress Schedule and the Home calendar like any others.

**Authoring.** `+ note` and `+ deadline` on the selected day's panel open an inline composer. The deadline composer carries a `Due on` date of its own, seeded to the selected cell and capped below by the caution start, so a deadline can be filed for any day from any page; filing one on another day moves the calendar to that day. Its **edit** form has no such field — an existing deadline's due day still moves only from the Progress popup, the one writer that checks the prep placed inside its caution period. Save is gated on `TrackCalendar.dlDraftValid` while composing and on `dlValid` while editing, and an out-of-order or blank date is refused with the reason shown rather than repaired.

**Filtering.** A new calendar shows everything. The filter bar switches any of thirteen categories off: Kolb / MG change, LIN record, Floating note, Source dump, Milestones, Goal tasks & routines, Supporting actions, MM sessions, SIR sessions, MG focus, Day notes, Deadlines, and **Documentation**. Everything added from Documentations — notes *and* deadlines, from any page — answers to that single Documentation key, and correspondingly the Day notes and Deadlines keys cover only items authored in the Schedule. The block stores the switched-**off** keys (`hidden: []` means show all), so a category added later is on by default for calendars that already exist. "Show all" clears the set. Filters are per block; Home and the Schedule are unaffected.

**Ownership.** Items added from Documentations carry `docPageId`, the id of the page that added them. A calendar highlights and exclusively edits the items within its scope, which the header button toggles between **this page** and **this page + sub-pages** (the default, resolved through the same descendant walk the sidebar drag uses). Items from any other documentation page stay visible but read-only, with a `📄 <page title>` chip that opens that page. Items added in the Schedule are visible and read-only with no chip.

Days carrying an owned item get an indigo edge bar on the month grid. For a deadline that means its due day; the days of its caution run-up get the same bar in amber at reduced opacity, so a three-week run-up reads as one approaching deadline rather than as twenty-one due dates. A ticked deadline keeps its due-day bar and loses the amber ones, so the cell highlighting and the `!` rows disappear together.

Deleting a documentation page **does not** delete the notes and deadlines it authored — losing scheduled work to a page delete would be data loss. The delete confirmation says how many items will stay behind. Those items keep their `docPageId` and read as "source page removed". They are **read-only in every calendar block**, including this one: an item whose owner is gone belongs to no page, and handing it to whichever calendar happens to display it would invent an ownership the user never expressed. It stays fully editable from the Progress Schedule, which is the surface that owns these arrays.

Deadlines authored here use the same rules as the Schedule: a title, an `HH:MM` due time, and a caution start on or before the due day (defaulting to the due day itself). An owned deadline's row also carries a `✓` / `↺` tick button beside its `✎` and `✕`, which is the same `done` flag the Schedule sets; a ticked row turns green and struck through, and its caution rows vanish from the run-up days.

A caution run-up day lists the deadline as a read-only amber `!` row, and that row's text is a button leading to the deadline's **due** day — changing month if it falls in another one. Ownership is unchanged by the jump: the due day is where the page that authored the deadline gets its `✎`/`✕`, and where a stranger's deadline still shows none. The `📄` origin chip beside the row keeps its own job of opening the source page, which is why the row's text is the button rather than the whole row.

Day notes take an **optional** time. Left blank — the default, and what every existing note has — the note is a chip in the day strip, as before. Given an `HH:MM`, it is positioned on the hour grid instead and disappears from the strip, so it is never shown twice. Clearing the field removes the time again. Timed notes are positioned but not yet draggable; they are edited through the same popup as any other note.

Each `docPages` entry is:

```js
{
  id,                // string id (never collides with numeric KS02 ids)
  title, icon,       // icon is an emoji or ""
  parentId,          // null = root
  favorite,          // boolean
  createdAt,         // "YYYY-MM-DD", local calendar date
  updatedAt,         // epoch ms
  blocks: [
    { id, type: 'h1'|'h2'|'h3'|'p', text },
    { id, type: 'image', src /* jpeg data-URI */, alt },
    { id, type: 'table', rows: [[string]] },
    { id, type: 'link', label, url, dumpRef: {dumpId, linkId, urlId}|null, addedAt },
    { id, type: 'divider' },
    { id, type: 'calendar',
      hidden: [],          // switched-OFF filter keys; [] = show all
      scope: 'subtree' }   // 'subtree' = this page + sub-pages | 'page'
  ]
}
```

A **storage** (`trueStorages`) is:

```js
{
  id,                         // TrackStorage.newId() — a string, so it can never
                              // collide with the numeric nid() counter in KS02
  name,
  createdAt,                  // local calendar day
  parentIds: [],              // the same relationship shape mms use
  link: { label, url },       // optional, and at most one — absent means none
  explanation: '',
  tags: [ { id, dumpId, mmId } ],
  customColor                 // optional, from the canvas fill picker
}
```

A tag names a **pair** — one source-dump leaf and one MM linked inside it — and both halves are
slot-local ids, so a tag only means anything inside the slot that holds it. `trueStoragePos` is a
map of storage id → `{x, y}`, the canvas counterpart of `pos`.

Neither `parentIds` nor `tags` is validated beyond "a list of objects": `mms` carries the
identical `parentIds` exposure and is not validated either, so gating one and not the other would
invent an inconsistent rule. `true-storage-core.js` pays for that choice instead — every nested
list is read through a helper that cannot throw, and the tree builder terminates on a parent cycle.

A day note or deadline authored from a documentation page carries one extra field:

```js
{ ...existing calendarNotes / deadlines fields, docPageId }
```

Its absence means the item was added in the Schedule, so existing data reads exactly as before and no migration is needed. Because it is a field on an item inside an already-registered slot array, it needs no slot-constructor default and no import allow-list entry — whole-object export, the array-level import copy, and the opaque Firebase blob all carry it, and every edit path in `progress.html` spreads the item rather than rebuilding it.

Sibling order in the sidebar is the pages' relative order inside the flat `docPages` array — there is no separate order field. Drag-to-arrange therefore persists by splicing the one moved page to a new array position (and re-parenting is just a `parentId` change), so export/import, Firebase sync, and the slot constructors need no order-specific handling.

### True Storage

`true-storage.html` is the fourth workspace page. It holds **storages**: durable records that
carry their own parent/child structure, one reference link, a free-text explanation, and tags
pointing back into the source material they came from. The relationship model and arrangement
are KS03's, and the nested list is SRCH's format — the difference is that the records are
storages rather than MMs, and that opening one gives an editor rather than a KS02 stage view.

Two views, switched from the header:

- **MULTIVERSE** — the same canvas as KS03: drag a node to place it, scroll or pinch to zoom,
  drag the background to pan, `+` / `−` / `↺` to zoom and reset, `⊞` to rearrange, a fill-colour
  picker (single click opens the palette, double click toggles it on and off), right-click for
  Duplicate, and arrows from parent to child. Storages have no Anchor/T1/T2 types, so every node
  is drawn the same way; a faint outer ring means the storage carries at least one source-dump
  tag. Manual positions persist in `trueStoragePos`, exactly as MM positions persist in `pos`.
- **SRCH** — the nested-by-parent/child list, with the same filter box, indent guides, collapse
  toggles and `⇅` drag-to-arrange-among-siblings. Sibling order is the records' order inside
  `trueStorages`; there is no separate order field. A drag onto a node that is **not** a sibling
  is refused rather than applied, because it would reorder the stored array without changing
  anything the user can see.

Both canvases share one layout, `graph-layout.js`, because they draw the same shape from the
same two fields — `id` and `parentIds`. It used to be ~120 duplicated lines in each page.

### Parent cycles

`parentIds` is plural and the connections picker lets any record be made a parent of any other,
including one of its own descendants. A cycle is therefore reachable through ordinary use, and it
can also arrive from another device through sync or from hand-edited data.

Every traversal over that graph is guarded, and they all agree on one contract:

> a repeated node is drawn once, and its branch ends there.

That is what `TrackTrueStorage.buildTree` and KS02's SRCH view have always done, and the canvas
layout now matches. Concretely: `leafCount` counts a node already on the stack as one leaf, and
`layout` carries a per-path `seen` set — per-path, not global, because a diamond (two parents
sharing one child) is legal and must still be drawn under both parents. A component made
*entirely* of a cycle has no root for the walk to start from, so its nodes are fanned around the
centre by the catch-all rather than stacked on one point, which matters because `applyRepulsion`
cannot separate exactly coincident nodes — identical coordinates give the push no direction.

This is deliberately tolerance, not prevention. The picker still allows a cycle; the code survives
one. Prevention alone would not help the cycles that already exist in stored data.

Source dumps are a separate graph with a *singular* `parentId`, which changes what is reachable: a
dump inside a cycle has its one parent inside that cycle, so it is nobody's descendant and no root
leads to it. Downward walks — the tag picker, `deleteDumpEntry` — therefore cannot meet one at all.
Only the upward walk can, because it starts wherever it is asked to, so the breadcrumb path builder
`dumpPathTo` carries the guard and has exactly one definition. Nothing in the current UI creates
such a cycle; `addDumpEntry` only ever attaches a new dump to an existing parent.

Opening a storage shows, top to bottom:

1. Its name (double-click to rename), creation day, and `delete`. Deleting a storage detaches it
   from its children rather than deleting them.
2. **LINK** — exactly one. A URL with an optional label. Editing replaces it; `clear` deletes the
   key rather than storing an empty string, so a storage that never had a link and one whose link
   was cleared are the same state.
3. **CONNECTIONS** — the same parent/child editor KS02 uses on an MM: Parents ↑ and Children ↓ as
   chips with `⊗` to detach, and an edit mode with search, multi-select parents, "No parents
   (root)", and add-children.
4. **SOURCE DUMP TAGS** — see below.
5. **EXPLANATION** — a five-line, vertically resizable box with a `SAVE` button. Nothing is written
   until SAVE, so cloud sync is not re-armed on every keystroke; an unsaved draft is marked.

#### Tagging a source dump

A tag names a **pair**: one source-dump leaf and one MM linked inside it. `+ tag` opens the dump
tree fully expanded with each leaf's MM sections listed; picking a section records the pair. Pairs
already tagged are shown greyed rather than offered twice.

Each tag renders as one row — `dump title · MM name`. Clicking the row **expands it in place** to
show that MM section's text blocks and citation links, read-only, because `sourceDumps` belongs to
KS02. Clicking the row again closes it. The expanded panel's title is a link to
`sir-ks02.html?dump=<dump>&mm=<mm>#ks03`, which opens KS03 → SOURCE DUMP on that leaf and briefly
rings the MM's card.

The same tag appears on the KS02 side, under that MM's section, everywhere that section's content
is drawn: the source-dump leaf card, the S&C tab of a leaf MM, the S&C tab of a non-leaf MM, and a
descendant node inside it. Each chip links to `true-storage.html?storage=<id>`. Tags can be created
and removed from either side — KS02 has its own `+ storage` picker and an `×` on each chip.

Because an mmLink's content is drawn at four separate sites, the match that decides which storages
belong to a pair lives in exactly one place, `true-storage-core.js`, and no call site re-spells it.
That module also owns the tag record's shape, so a tag made in KS02 is identical to one made here.

Deleting a source dump, or removing an MM link from one, **does not** delete the tags that pointed
at it — losing the user's own filing to a delete somewhere else would be data loss. Such a tag reads
as *source removed* and stays removable by hand.

Adding a sub-title under a tagged leaf is the one case that is **not** a removal, and it behaves
differently. KS02's `addDumpEntry` moves the parent's whole `mmLinks` set down to the new child and
leaves the parent empty, so the content a tag names is still there, one level down. The tags move
with it: `TrackTrueStorage.repointDump` rewrites the `dumpId` half of every tag naming that dump,
keeping the tag's own id and its `mmId` half untouched. Without this the pair would stop resolving
and the row would read *source removed* while the content was merely relocated.

KS02 makes that write the only way it is allowed to touch a key it does not own — a fresh
read-modify-write of `trueStorages` alone, never its autosave snapshot. `repointDump` returns the
original array when no tag names the dump, and `_mutateSlotKey` short-circuits on that, so adding a
sub-title under an untagged dump writes nothing and arms no sync upload.

### Destructive controls

Every control that deletes or clears stored data asks first, through a native `window.confirm()`.
There is no undo anywhere in the application, so the prompt is the only thing between a misplaced
click and lost work — a `✕` on hover chrome is easy to hit by accident, and a filled table, an
embedded image or a scheduled day with its tick and notes all disappear silently without one.

Where the prompt lives follows one rule:

> in the **handler** when every path through it is destructive, at the **call site** when the
> handler also serves a non-destructive path or is a pure tree function.

The handler case is the one that matters. `removeMilestoneEntry` is reached from three buttons and
`onUnlinkTask` from four; putting the prompt in the shared handler means a fifth button added later
inherits it instead of having to remember it. This is the same duplication failure the deadline
caution predicate already cost this project — one rule spelled at several call sites and forgotten
at one. Where a call-site prompt is genuinely required, it is because a handler-level one would be
wrong: `toggleMGDay` both adds and removes, `onUpdateDate` also *sets* dates, and `deleteNode` and
`removeDissectChild` are pure tree functions that must stay pure.

Deliberately **not** confirmed, and pinned by a test so a later "make it uniform" change has to
re-decide it on purpose rather than ship friction:

- The four detach `⊗` chips. They sever one graph edge, and the connections picker puts it back in
  seconds.
- The two Marginal Gain schedule `✓` toggle-offs, which are ordinary scheduling toggles.
- The emoji icon `Clear` in Documentations, which only resets a picker.

Pure-dismiss `×` and `cancel` buttons — closing a modal, abandoning a form — are not destructive and
stay one click.

### Local and cloud data

Current data behavior includes:

- Local-first storage through `localStorage`.
- Optional Google sign-in.
- Firebase Authentication.
- Firestore synchronization.
- Remote-change notifications.
- Offline/local-only use after skipping sign-in.
- Per-slot export and import.

Slot export serializes the whole slot object and is lossless. It is deliberately not filtered through `SLOT_FIELDS` — an allow-list on the way out would discard exactly the unknown keys the importer now preserves.

Slot import goes through `schema.js` in four steps: parse, `TrackSchema.looksLikeDatabase`, `TrackSchema.validateSlot`, then `TrackSchema.normalizeSlot`. Validation runs **before** the database is read, so a refused file cannot write. Its current coverage is the canonical top-level field envelope, object items inside every canonical list, and the recursive goal tree (`children`, `toLearn`, `mmTargets`, and `milestones` at every depth). What gets refused, with the offending field named in the alert:

- A wrong-typed field. `{"goals": "hello"}` used to import cleanly and then break the calendar on the next load.
- Junk inside a correctly-typed list. `{"goals": [null]}` also used to import cleanly, then throw out of `flattenGoals` on the next render — a field being a list is not enough, because every list field holds records.
- An unsafe nested goal shape, such as a string in `children`, a non-list `toLearn` or
  `milestones`, a non-object milestone entry, or a non-object `mmTargets`. The walk is
  recursive, so malformed descendants cannot hide below a valid top-level goal.
- A whole-database file offered instead of a single workspace. It is structurally a valid but empty slot, so it would otherwise import as a blank workspace with the real data stranded under an unknown `slots` key.

This is not universal nested validation yet. Records inside mind maps, source dumps,
documentation blocks, and other domains are confirmed to be objects at the canonical list
boundary, but their full internal shapes and cross-references are still future work in
`NOTES.md` Proposal 2.

A field stored as `null` counts as **missing**, not as wrong: a null list holds no data, so filling in the default discards nothing, and refusing the whole file over an empty field would only cost the import. A file that passes is normalized: fields an older export predates are filled with safe defaults, and **keys this version has never heard of are carried through**, so a field added later is not lost by an export made before it. The slot gets a fresh id and a local-day `createdAt`; nested ids inside the slot are preserved verbatim (remapping is deferred — see `NOTES.md` Proposal 1). Adding a slot field now means adding one row to `SLOT_FIELDS`, not extending an importer allow-list.

`tests/browser.test.js` drives the real exporter and importer and asserts all of it, including the round trip of `docPageId`, a day note's optional `time`, and an unknown `futureField`.

#### Which page owns which field

Each page writes only the keys it owns, merging them into a fresh read of the stored slot, and refreshes from `storage` and `visibilitychange` events so another tab's edits appear. No page rebuilds the whole slot from its own React snapshot any more:

| Page | Keys it writes |
| --- | --- |
| `progress.html` | `goals`, `saActions`, `saEntries`, `mmEntries`, `mgSchedule`, `calendarNotes`, `deadlines` |
| `sir-ks02.html` | `sessions`, `mms`, `kolbs`, `mgChanges`, `linChanges`, `linDayTitles`, `pos`, `levelTemplates`, `sourceDumps` |
| `documentations.html` | `docPages`, plus `calendarNotes` and `deadlines` through a fresh read-modify-write |
| `true-storage.html` | `trueStorages`, `trueStoragePos` |
| `notes-widget.js` | `notes` |
| `index.html` | the slot list itself — create, rename, delete, import |

`sir-ks02.html` reads `mgSchedule` but never writes it; that key belongs to `progress.html`. It also reads `trueStorages`, and writes it in exactly one narrow case — adding or removing a source-dump tag — through a fresh single-key read-modify-write (`_mutateSlotKey`), never through its autosave patch. `true-storage.html` reads `sourceDumps` and `mms` and never writes either. Adding a key to a page's write set means adding it to this table.

Progress and KS02 also bind each React snapshot to the id of the slot it came from. A
cross-tab `storage` or `visibilitychange` refresh adopts the selected slot's data and id in
the same refresh, and autosave targets that loaded id rather than whatever the root pointer
happens to say later. Switching A → B in another tab therefore cannot send A's stale state
into B or B's refreshed state back into A; if the snapshot's slot was deleted, the write is
refused.

#### Reading the stored database

Every page reads `track_db` through one boundary, `TrackStorage.loadDB()` in `storage-guard.js`. The five readers — `getDB` (`index.html`), `_getTrackDB` (`progress.html`, `sir-ks02.html`, `documentations.html`) and `_twDB` (`notes-widget.js`) — are now one-line delegates to it. They each used to carry the same unchecked `JSON.parse(localStorage.getItem('track_db') || '{}')`, whose `catch` never fired for `'null'`, `'42'` or `'[…]'` because those parse successfully.

`loadDB()` parses once, judges the result with `TrackSchema.validateDatabase`, and returns a plain object. The verdict has four states:

| State | When | Result |
| --- | --- | --- |
| `empty` | the key is absent or `''` | `{}` — a normal first run |
| `ok` | valid, or a root with no `slots` key | the parsed object |
| `warn` | valid enough to render: a dangling `activeSlotId`, a bad `createdAt`, or an invalid calendar-item `date`/`time` | the parsed object, plus an amber banner; **still fully editable** |
| `blocked` | invalid JSON, or structural/identity damage: the root is not an object, `slots` is not a list, a slot is not an object, a slot id is missing or duplicated, a canonical field/item has the wrong kind, or a recursive goal shape is unsafe | `{}`, a red banner, and **all `track_db` writes refused** |

Validation errors carry an explicit `fatal` severity. The split is deliberate: malformed
goal recursion and missing/duplicate slot ids make traversal or write ownership unsafe, so
they block. A dangling `activeSlotId` is reachable from an ordinary cross-tab race and the
first slot remains an unambiguous display fallback, so it warns without freezing. When
Progress performs an explicit displayed-slot write through the two-argument `_writeP`
form, it saves to that fallback and realigns the root pointer to the displayed slot; a
valid active pointer is never replaced by a stale snapshot id.

While the verdict is `blocked`, `TrackStorage.saveDB()` returns `false` without writing, so no bootstrap, auto-create or edit can replace the damaged value. `TrackStorage.dbBlocked()` exposes that state, and the legacy migration IIFEs in `progress.html` and `sir-ks02.html`, plus `_bootstrapSlotIfSafe` in `documentations.html`, return early on it rather than doing work whose write would be refused anyway. The original bytes are never normalized, repaired or written back: `normalizeSlot` still runs at creation and import only. The red banner offers **Download a copy**, which saves the raw stored bytes verbatim.

Two things still recover a blocked database. Fixing the value from another tab or devtools clears the freeze on the next read, with no reload — the verdict is memoised on the raw string, not latched for the page's lifetime. And a genuine remote-newer payload from `firebase-sync.js` still applies, because that file writes through its captured `_origSet` and deliberately bypasses this guard.

A root object with **no `slots` key** is classified `ok`, not `blocked`, and handed back untouched. That covers both a bare `{}` and the pre-unified legacy shape `{progress, ks02}`, which the migration IIFEs read `db.progress` and `db.ks02` out of; `validateDatabase` legitimately rejects it for lacking a slot list, so it is classified before validation rather than by it.

#### Storage-quota handling

Every page writes the whole workspace to the single `track_db` key, so the browser's per-origin `localStorage` quota (~5-10 MB) is the binding size limit now that cloud sync gzips and chunks the payload. Every `track_db` write on every page, plus the two `trackPriorityMatrix` writes in `progress.html`, goes through `window.TrackStorage` in `storage-guard.js`:

- `TrackStorage.loadDB()` — the one parse-and-validate boundary described above.
- `TrackStorage.dbBlocked()` / `TrackStorage.dbStatus()` — the current verdict.
- `TrackStorage.saveDB(db)` — stringify and write `track_db`; returns `true` when stored, `false` when the quota rejected it **or** the stored database is unreadable.
- `TrackStorage.setItem(key, value)` — the same guard for any other key.
- `TrackStorage.clearQuotaBanner()` — dismiss the banner.

A rejected write shows a persistent red `#track-quota-banner` above the sync banners saying the change was not saved, that everything saved earlier is intact, that reloading discards the unsaved change, and how to free space. Any error that is *not* a quota error is rethrown rather than swallowed.

The guard is a plain function and deliberately does not patch `Storage.prototype.setItem`. `firebase-sync.js` patches that method and calls the captured native `_origSet` first, then marks `track_db_pending` and arms the upload debounce. Because the guard dispatches through the patch instead of replacing it, a quota throw aborts inside `_origSet` and no upload is armed for a write that never landed.

Known limitation: on a quota failure the in-memory React state still shows the user's edit even though it was not persisted, and a reload discards it. The banner says so explicitly; rolling state back at each independent call site is not implemented.

## Current Page and File Responsibilities

| File | Current responsibility |
| --- | --- |
| `index.html` | Home page, slot management, slot import/export, navigation, Universal calendar |
| `progress.html` | Goals, milestones, progress, supporting actions, schedule, calendar notes |
| `sir-ks02.html` | Mind maps, Kolb, SIR, MG, LIN records, source dumps |
| `tests/run.js` | The one test command — offline suite under five timezones, then the browser suite |
| `documentations.html` | Notion-style nested documentation pages, source-dump references, calendar blocks, PDF export |
| `true-storage.html` | Storages: KS03-style multiverse canvas, SRCH-style nested tree, one link, explanation, and source-dump tags |
| `calendar-core.js` | Shared read-only aggregation of a slot into per-day calendar data, plus the filter registry and deadline rules (`window.TrackCalendar`) |
| `theme.js` | Initial theme selection, appearance switching, persistence, and cross-tab updates |
| `schema.js` | The canonical slot definition — the `SLOT_FIELDS` table, `createEmptySlot`, `normalizeSlot`, `validateSlot`, `validateDatabase` (`window.TrackSchema`) |
| `storage-guard.js` | The one `track_db` load boundary (parse, validate, freeze writes on damage) and the `localStorage` quota guard for every whole-database write, plus both banners (`window.TrackStorage`) |
| `firebase-sync.js` | Firebase initialization, authentication overlay, local write interception, gzipped/chunked cloud synchronization, sync status surface (`window.TrackSync`) |
| `notes-widget.js` | Floating per-slot notes widget |
| `true-storage-core.js` | The one definition of the storage↔source-dump relationship — the pair matcher, the pure tag writers, and the parent/child tree (`window.TrackTrueStorage`) |
| `graph-layout.js` | The one radial canvas layout behind KS03's multiverse and the True Storage canvas — `computeLayerLayout`, `applyRepulsion`, and the cycle guards both need (`window.TrackGraphLayout`) |
| `styles.css` | Shared design tokens, light/dark palettes, responsive styling, and component states |
| `firestore.rules` | Firestore security rules, versioned for review; published by hand in the Firebase console |
| `tests/` | The committed suite — `run.js` (one command, timezone sweep), `calendar-core.test.js` and `schema.test.js` (offline), `browser.test.js` (real Chrome), and `lib/` (CDP driver, static server, synthetic fixtures) |
| `README.md` | Current project and workflow documentation |
| `NOTES.md` | Future ideas and possible changes |
| `AGENTS.md` | Agent operating instructions |

## Current Repository Shape

The active source remains intentionally small at the file level:

```text
Track-website/
├── AGENTS.md
├── README.md
├── NOTES.md
├── index.html
├── progress.html
├── sir-ks02.html
├── documentations.html
├── true-storage.html
├── calendar-core.js
├── theme.js
├── schema.js
├── storage-guard.js
├── firebase-sync.js
├── notes-widget.js
├── true-storage-core.js
├── graph-layout.js
├── styles.css
├── firestore.rules
└── tests/
    ├── run.js
    ├── calendar-core.test.js
    ├── schema.test.js
    ├── true-storage-core.test.js
    ├── graph-layout.test.js
    ├── browser.test.js
    └── lib/
        ├── cdp.js
        ├── server.js
        └── fixture.js
```

Most internal complexity is inside the two React HTML pages:

- `progress.html`: 7,322 lines and approximately 423 KB at the audit point.
- `sir-ks02.html`: 3,584 lines and approximately 235 KB at the audit point.

There is currently no generated `dist/` directory and no installed package tree.

## Current Technology Stack

- HTML5
- CSS
- Vanilla JavaScript
- React 18 development UMD build
- React DOM 18 development UMD build
- Browser-side Babel 7.25.6
- Tailwind browser CDN
- Firebase 10.12 compatibility libraries
- Firebase Authentication
- Cloud Firestore
- Browser `localStorage` and `sessionStorage`

External JavaScript and Tailwind resources are loaded at runtime. Consequently, “local-only data” does not currently mean that every main page can render without network access; the React pages still depend on their CDN resources.

## Current Data Layout

### Main local database

The principal local key is:

```text
track_db
```

Its current top-level shape is conceptually:

```js
{
  slots: [],
  activeSlotId: null
}
```

There is not yet a canonical `schemaVersion` field.

### Slot fields currently used

The pages currently read or write fields including:

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

#### Canonical slot schema

`schema.js` holds the one definition of a slot and publishes `window.TrackSchema`. It is a
classic script loaded in `<head>` on all five pages, before their own scripts, so
the bootstrap code that runs at page-script load can use it.

| Member | What it does |
| --- | --- |
| `SLOT_FIELDS`, `SLOT_KEYS` | The field table: name → kind (`text`, `date`, `list`, `map`). Frozen. **Adding a slot field means adding one row here and nothing else** — every function below derives from it |
| `createEmptySlot({id, name, createdAt})` | A complete 23-field slot, in table order, with a minted id and a local-day `createdAt` |
| `normalizeSlot(input, opts)` | Fills missing fields, replaces wrong-typed ones with their default, **keeps unknown keys**, never mutates `input`, never rewrites an id it was given |
| `validateSlot(input)`, `validateDatabase(db)` | `{ok, errors:[{field, message, fatal}]}`. Report only. Checks canonical field kinds, object items in lists, recursive goal shapes, slot identity, calendar-item dates, and an optional day-note `time`. `null` counts as missing |
| `looksLikeDatabase(input)` | True when a file is a whole database rather than one workspace — a `slots` array and no slot data of its own |
| `hasFatalErrors(report)`, `localToday(date)`, `newSlotId()`, `describeErrors(errors)`, `isList`/`isMap`/`isDay`/`isTime` | Severity and supporting helpers |

Two functions give two different answers to bad data, and the split is deliberate:
`normalizeSlot` **repairs and always succeeds**, because the legacy rescue paths need a
total function — refusing there would strand the oldest data on the machine. `validateSlot`
and `validateDatabase` **report and never repair**, so import can refuse a file before the
database is even read.

All six places that used to build a slot literal now call one of these. They previously
produced 10, 11, 13, 13, 14 and 21 fields respectively, and five of the six stamped
`createdAt` with the **UTC** day, so a workspace created after 5pm in UTC-7 was dated
tomorrow. Slot ids are now `'slot-' + TrackStorage.newId()`; `'slot-' + Date.now()` returned
the same string for two workspaces created in the same millisecond.

| Site | Now calls |
| --- | --- |
| `index.html` `createSlot()` | `createEmptySlot` |
| `index.html` `importSlot()` | `validateSlot` then `normalizeSlot` |
| `progress.html` legacy bootstrap IIFE | `normalizeSlot` |
| `sir-ks02.html` legacy bootstrap IIFE | `normalizeSlot` |
| `sir-ks02.html` on-mount auto-create | `createEmptySlot` |
| `documentations.html` `_bootstrapSlotIfSafe()` | `createEmptySlot` |
| `true-storage.html` `_bootstrapSlotIfSafe()` | `createEmptySlot` |

The two legacy bootstraps use `normalizeSlot` rather than `createEmptySlot` because the
values they harvest come from `JSON.parse` of pre-`track_db` localStorage keys. They
normalize every nonempty harvested legacy KS02 slot after merging the old Progress fields — not
only the synthesized default when the legacy slot list is empty — while preserving each
legacy id and unknown field. A corrupt top-level harvested field is repaired to its safe
default instead of crashing the one rescue that install will ever get.

Nothing rewrites data already in `track_db`: these run at creation and import only. Readers
still apply their own `slot.goals || []` fallbacks, and the per-page field-presence
migration IIFEs are unchanged — centralizing those is `NOTES.md` Proposal 2, along with
`schemaVersion`.

Six item-level fields inside `calendarNotes` and `deadlines` are optional, and
their **absence carries meaning**:

- `docPageId` names the `docPages` entry that authored the item. Absent means the
  Schedule authored it. Preserve it by spreading (`{...item, …}`), never by
  rebuilding an item from a field list.
- `time` (`calendarNotes` only) is the hour a day note belongs to. Absent means
  the note has no time of its own — it still gets a block, at `08:00` — so a
  writer must **omit the key** rather than store `''`, and clearing the field in
  the UI deletes the key. `deadlines` have always had a required `time`; this is
  the note-only addition.
- `done` (`deadlines` only) marks the deadline as handled and suppresses its
  caution `!` run-up everywhere. Absent means not done, and every reader goes
  through `dlDone`'s `!!`, so an absent key, `false` and `undefined` are
  indistinguishable — unlike `time` there is no third state, so unticking simply
  writes `false` rather than deleting the key, and no stored deadline needed a
  migration. It is not validated in `schema.js`: a malformed value cannot break a
  render the way a malformed date can.
- `blockOff` (both) takes the item's **schedule block** off the hour grid. This
  is the one on-grid switch. Absent means the item **has** a block, which is what
  puts one on every item stored before these keys existed with nothing written to
  it — the feature needs no migration because it needs no writes. Removing a
  block therefore **deletes nothing**: the length, day and anchor stay stored so
  putting it back is a restore, not a recomputed guess. Re-adding writes `false`
  rather than deleting the key — every reader goes through `blockOn`'s `!!`, so
  there is no third state to protect, exactly as for `done`.
- `blockDuration` (both) is the length in minutes of the block. Absent means the
  automatic 60, so it is only a remembered length and never a switch.
- `blockTime` (both) is the block's own start. Absent is a meaningful **third**
  state — "still anchored", i.e. a deadline's block ends at its due time and a
  note's starts at its own — so it is written only when the block is moved off
  that anchor, and `reset to due time` deletes the key rather than storing the
  value it would have computed. That is what makes reset a restore rather than a
  recomputed guess, the same reasoning that keeps a tick from rewriting
  `startDate`.
- `blockDate` (both) is the day the block is **drawn** on, which need not be the
  day the item belongs to. Absent means the item's own `date`. It is what lets a
  deadline's prep sit on an earlier caution day; the item's chip, marker, due
  line and caution run-up all stay on `date` regardless. On a deadline it must
  fall inside the caution period, enforced at every authoring path and by
  refusing an edit that would strand it.
- `parts` (both) holds the tasks an item was dissected into. Absent means not
  dissected, and removing the last one deletes the key so the parent block comes
  back rather than the item being left "dissected into nothing". A part may carry
  its own `date`, `time` and `blockDuration`; each is written only when it
  differs from what the part would inherit from its parent block.

`blockDuration`, `blockTime` and `blockDate` **are** validated in `schema.js`,
and the split from `done` and `blockOff` above is deliberate: those two are safe
by construction because every reader goes through `!!`, while these three reach
block geometry and placement — a string or a `NaN` renders `height: NaNpx`, and a
malformed day would draw the block on a day that does not exist. They are the
same class of risk as a malformed `time`, so they get the same treatment — a
warning that leaves the database editable. `parts` is checked more strictly and
**fatally**, like a goal's `children`: it holds records and is traversed, so a
stray `null` in it imports cleanly under a field-only check and then throws out
of the next render.

Ids for new records come from `TrackStorage.newId()` in `storage-guard.js`
(timestamp + random, e.g. `mshajngq-ehhoj`), which `progress.html`'s `uid()`,
`documentations.html`'s `genId()` and `notes-widget.js` all delegate to, so the
shared arrays no longer mix id shapes. `sir-ks02.html` keeps its own plain
numeric counter (`nid()`) for its own records; the two spaces cannot collide, and
no stored id is ever rewritten.

### Additional browser keys

The project also currently uses:

- `track_theme` for the explicit light/dark appearance preference.
- `track_db_ts` for the local Firebase comparison timestamp. It records when this device's data was last **confirmed** in the cloud, not when the device last edited, so it is written only after the server accepts a write.
- `track_db_pending` while this device holds edits the cloud has not accepted yet. Set synchronously on every `track_db` write and removed on confirmation, so a tab closed mid-upload still records that edits are unsent.
- `trackPriorityMatrix` for schedule priority-matrix state.
- `fb_reloaded` and `fb_reloaded_gen` in `sessionStorage` to break Firebase reload loops and record which cloud generation was reloaded into.
- Older legacy keys during migration, including former Progress and KS02 storage keys.

### Current cloud shape

Firebase stores the serialized `track_db` value gzipped and split across numbered documents, so no single document approaches Firestore's 1 MiB per-document limit:

```text
users/{uid}                  manifest
users/{uid}/blob/{0..n-1}    payload chunks
users/{uid}/backup/v1        one-time pre-migration copy
```

The manifest holds metadata only:

```js
{
  v: 2,              // format version
  enc: "gzip",       // or "raw" where CompressionStream is unavailable
  n: 1,              // chunk count
  len: 958464,       // uncompressed byte length
  hash: "37e12d52",  // FNV-1a over the uncompressed bytes
  gen: 1785914427341,
  ts: 1785914427341
}
```

Each chunk document holds up to 700,000 bytes as a Firestore `Blob`, plus the `gen` it belongs to. The manifest and every chunk are written in a single `db.batch()`, so a commit is atomic. Readers take chunk ids strictly from `manifest.n`, require every chunk's `gen` to match the manifest's, and verify `len` and `hash` after decompressing. Any mismatch is refused rather than partially applied — a corrupt or torn read never reaches `localStorage`.

Compression is what removes the practical ceiling. Prose, JSON structure, goal trees, and source dumps compress by an order of magnitude; base64 image data compresses by about 25%, which is exactly the inflation base64 added. A 936 KB workspace lands between roughly 90 KB (mostly text) and 705 KB (entirely images) — a single chunk either way. Chunking then handles anything larger without a format change.

Cloud conflict selection still depends primarily on client-generated timestamps and whole-database replacement, with one addition: when this device holds unsent edits (`track_db_pending`) and the cloud copy differs, neither side is applied automatically. A conflict banner offers *Reload cloud version* or *Keep this device — push now*, and **uploads are frozen until the user chooses** — including uploads from edits made while the banner is up. Without that freeze the debounce armed by the edit that caused the conflict would fire a moment later and push the local copy anyway, making the choice decorative.

### Security rules

The rules live in [`firestore.rules`](firestore.rules) at the repository root. **They are not deployed from this repository** — there is no `firebase.json` and no Firebase CLI here, so the file is versioned for review only. Publishing it is a manual step:

```text
Firebase console → Firestore Database → Rules → paste firestore.rules → Publish
```

Rules do **not** cascade into subcollections, so the `blob` and `backup` blocks are load-bearing. Without them the manifest read still succeeds while every chunk write is rejected, which surfaces as a persistent `permission-denied` sync error with local data intact. `firestore.rules` also rejects a legacy-shaped write once a v2 manifest exists, so a browser running cached pre-v2 JavaScript cannot overwrite the manifest and orphan the chunks; see `NOTES.md` for that rule's reasoning.

### Sync failure surface

A failed upload raises a persistent red `#fb-sync-error` banner with a *Retry now* button. It distinguishes two kinds of failure:

- **Transient** (`unavailable`, `deadline-exceeded`, network loss): the banner says it is retrying, and `_scheduleRetry` backs off through 5 s, 15 s, then 60 s.
- **Permanent** (`permission-denied`, `unauthenticated`): retrying the identical request cannot succeed until the Firestore rules change, so no retry is armed and the banner names the cause and the fix instead of promising a recovery that will not happen.

With automatic retry off, sync resumes on *Retry now*, on the next local edit, on the `online` event, or on reload. A permanent failure never clears `track_db_pending` or writes `track_db_ts` — the edits genuinely are unsent, and the local copy stays authoritative.

## Running the Current Application

### Simplest use

Open `index.html` in a browser.

This preserves the project's current no-build behavior. Some browser and authentication behavior is more reliable through an HTTP origin, so a local server is preferred for development.

### Preferred local development server

From the repository root:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8765/index.html
```

Active page URLs are:

```text
http://127.0.0.1:8765/index.html
http://127.0.0.1:8765/progress.html
http://127.0.0.1:8765/sir-ks02.html
http://127.0.0.1:8765/documentations.html
```

Stop the server with `Ctrl+C`.

## Running the tests

One command, no dependencies, no `package.json`:

```bash
node tests/run.js
```

It runs three layers:

| Layer | File | What it covers |
| --- | --- | --- |
| Offline data tests | `tests/calendar-core.test.js` | Every collector in `calendar-core.js` against a synthetic slot: local-day correctness, month and leap-year lengths, dot buckets, milestone lane packing, per-source filtering, `doc` as one key over both notes and deadlines, caution ranges, deadline validation, run-ups across month/year/DST boundaries, an inverted span being inert rather than explosive, MG 30-day carry-forward, the optional day-note time, and bare or pre-calendar-block slots returning empty rather than throwing |
| Offline schema tests | `tests/schema.test.js` | The canonical slot definition in `schema.js`: defaults and ids, legacy normalization and unknown-key survival, canonical field and recursive goal-tree validation, fatal-versus-warning classification, ambiguous slot identity, and validation reporting without repair |
| Offline storage-relationship tests | `tests/true-storage-core.test.js` | The storage↔source-dump pair in `true-storage-core.js`: the matcher including both negative directions, exact id comparison, damaged input, the pure tag writers and their identity-when-unchanged contract, `repointDump` moving a tag when its content moves, and the parent/child tree including cycles |
| Offline layout tests | `tests/graph-layout.test.js` | The radial canvas layout in `graph-layout.js`: single roots, trees, diamonds, disconnected components, dangling parent ids, custom and damaged radii — and above all **parent cycles**, which used to blow the stack and render both canvas pages blank |
| Browser tests | `tests/browser.test.js` | Page mounting and persistence regressions, per-key ownership, cross-tab active-slot identity in Progress and KS02, calendar/documentation behavior, True Storage records and per-pair source-dump tagging from both sides, import/export and legacy normalization, malformed-database write freezes across all five reader surfaces, refused-save handling for import, legacy notes, and Documentation bootstrap, and destructive-control confirmation including the Cancel path, the single-prompt guard, and a control deliberately left unconfirmed |

The first two offline files run **once per timezone** — `UTC`, `Pacific/Kiritimati`
(UTC+14), `Pacific/Midway` (UTC-11), `America/Los_Angeles` and `Asia/Kathmandu`.
That sweep is the point, not a detail: `calendar-core.js` exists to turn instants
into *local* calendar days and `schema.js` stamps a new slot with one, and the
usual way to get that wrong (`toISOString().split('T')[0]`) is invisible on a
machine running in UTC. `true-storage-core.test.js` and `graph-layout.test.js`
run **once**: neither module holds any date code, so a sweep would cost five runs
and prove the same thing.

Useful variations:

```bash
node --test tests/calendar-core.test.js         # one file, ambient timezone
TZ=Pacific/Midway node --test tests/            # both suites under one zone
node tests/run.js --offline                     # skip the browser layer
node tests/run.js --tz=UTC,Asia/Tokyo           # a different sweep
```

The browser layer drives the system Chrome (`/usr/bin/google-chrome`, or
`CHROME_PATH`) over the DevTools protocol using Node 22's built-in `WebSocket` —
no Playwright or Puppeteer in the tree. If no Chrome is found the run **fails**
rather than passing quietly, because a skipped browser layer is not a pass.

`tests/lib/cdp.js` answers every `alert`/`confirm` automatically — an unhandled
dialog wedges the renderer for the rest of the run — and records each message in
`page.dialogs`. It **accepts** by default. Set `page.rejectDialogs = true` around
a click to press Cancel instead, and reset it afterwards:

```js
page.rejectDialogs = true;
try { /* click the destructive control */ } finally { page.rejectDialogs = false; }
```

That flag is what makes a confirmation testable at all. Asserting only that a
dialog appeared proves nothing about whether it guards anything: a prompt that is
displayed and then deletes regardless is worse than no prompt, because it reads
as a guard. The Cancel path is the assertion that matters, so the destructive-
control cases check that `track_db` is byte-identical after declining.

To prove a regression test actually catches the bug it names, serve a scratch
directory instead of the repository:

```bash
TRACK_TEST_ROOT=/tmp/prefix-root node --test tests/browser.test.js
```

Fill that directory with symlinks to the repository plus the single pre-fix file
under test. Never put a baseline copy in the repository itself.

All fixtures are synthetic (`tests/lib/fixture.js`). A real personal export must
never be used as test data.

## Current Development Workflow

Until automated scripts are introduced, use the following workflow for every change.

### 1. Inspect before editing

Run:

```bash
git status --short --branch
```

Treat every existing modification as user-owned. Do not discard or overwrite unrelated work.

Read the documentation roles:

- Current behavior: `README.md`
- Proposed changes: `NOTES.md`
- Agent rules: `AGENTS.md`

### 2. Find every affected boundary

Use `rg` before editing. For a state field, search all pages and shared scripts:

```bash
rg -n "fieldName" index.html progress.html sir-ks02.html firebase-sync.js notes-widget.js
```

Classify whether the change affects:

- User interface only.
- React state.
- Slot construction.
- Old-data migration.
- Import/export.
- Local storage.
- Firebase synchronization.
- Both large pages.
- Dates.
- Mouse or touch behavior.

Changes to stored data must be treated as cross-page changes even if the visible request mentions only one page.

### 3. Make a cohesive edit

Keep the edit focused on one behavior. When a field or stored shape changes, update every applicable:

- Reader.
- Writer.
- Default.
- Migration.
- Importer.
- Exporter.
- Validation or fallback.
- Relevant documentation.

Do not perform a large unrelated cleanup in the same change.

### 4. Run fast checks

For shared standalone scripts:

```bash
node --check theme.js
node --check schema.js
node --check storage-guard.js
node --check calendar-core.js
node --check firebase-sync.js
node --check notes-widget.js
node --check true-storage-core.js
node --check graph-layout.js
```

Then the committed suite, which is the fastest way to find out whether a change
broke something (it also parses the inline JSX, by running it):

```bash
node tests/run.js
```

Check the patch:

```bash
git diff --check
git diff --stat
git diff
```

Inline JSX is not covered by `node --check`; it requires a browser render check.

For changes touching the cloud codec, run the built-in diagnostic from the browser console on any page that loads `firebase-sync.js`. It encodes, chunks, concatenates and decodes entirely in memory and writes nothing to Firestore:

```js
await TrackSync.selfTest()                          // detected encoding, real chunk size
await TrackSync.selfTest({ chunkBytes: 64 })        // force the multi-chunk path
await TrackSync.selfTest({ forceRaw: true })        // exercise the no-gzip fallback
TrackSync.getStatus()                               // current sync state
```

Each returns `{ pass, encoding, chunkBytes, results }` and prints a table. Corruption cases are expected to be *refused*, so a pass means every mangled payload threw rather than decoding.

### 5. Run browser smoke checks

Start the local server and verify:

- Home renders and slot controls are present.
- Progress produces a non-empty React root.
- KS02 produces a non-empty React root.
- Firebase reaches the sign-in/offline state.
- The notes widget mounts.
- No uncaught error causes a white page.

### 6. Run change-specific manual checks

| Change type | Minimum current check |
| --- | --- |
| Slot or schema | Create, switch, export, import, reload |
| Goals or tasks | Add, edit, nest, complete, reload |
| Schedule | Mouse and touch behavior, reload, adjacent-day behavior |
| Milestones | Create, reorder, link, schedule, reload |
| Mind maps | Create, connect, reorder, open from both pages |
| Kolb/SIR/MG | Add, edit, calculate derived state, reload |
| Notes | Create, edit, switch slot, reload |
| Sync | Local-only path, sign-in path if available, two-tab behavior |
| Date logic | Test around the local day boundary and month boundary |
| Import/export | Verify every affected field survives a round trip |

If an applicable check cannot be run, report it explicitly.

### 7. Review the final state

Run:

```bash
git status --short
```

Confirm:

- Only intended files changed.
- No temporary browser profiles or personal exports were added.
- No real credentials or private user data were added.
- Documentation describes the correct category of information.

### 8. Commit only when explicitly requested

Normal implementation work does not automatically authorize a commit, branch change, merge, tag, reset, restore, or other Git-history operation.

When a commit is requested, prefer a behavioral message:

```text
fix(import): preserve calendar notes during slot restore
```

rather than a message that records only the editing attempt.

## Current Verification Baseline

**Anything below that is not in `tests/` was run once and cannot be re-run.**
The committed suite is the part of this baseline a reader can reproduce:

```bash
node tests/run.js
```

As of 2026-08-22 that is 131 offline cases (79 in `calendar-core.test.js`, 52 in
`schema.test.js`, several hundred assertions) executed under five timezones from
UTC+14 to UTC-11, plus 17 cases in `true-storage-core.test.js` and 21 in
`graph-layout.test.js` run once — neither holds date code — plus 126 browser
subtests in headless Chrome. Every offline suite passes, as do 119 of the 126
browser subtests; the seven that do not are the TOUCH sidebar drag-to-nest cases,
written ahead of the feature they describe.

Several sets of regression cases were confirmed to **fail** before their fix,
which is what makes them evidence rather than decoration:

- The two KS02 field-ownership cases, against the pre-fix `sir-ks02.html`.
- The five movable-due-date cases, against the pre-change `progress.html`: each
  timed out waiting for a `Due date` row that did not exist, while every existing
  deadline case — including "the due day itself did not move", which guards the
  read-view caution picker — kept passing on both sides.
- Six canonical-schema cases, against the pre-change pages: the four
  `window.TrackSchema` smoke assertions, "every entry point creates a slot with
  the same canonical shape" (`index.html` built 13 of 21 fields), "Home stamps a
  new slot with the LOCAL day and a collision-free id" (both slots got the
  identical id `slot-1786180119615` with the clock frozen), "import keeps a field
  written by a later version" (the old allow-list dropped it), "import refuses a
  wrong-typed field" (`{"goals":"hello"}` imported silently), and "a legacy
  install still migrates into one canonical slot" (10 of 21 fields).

The `index.html` cases were re-confirmed against a `TRACK_TEST_ROOT` scratch
directory holding symlinks to the repository plus the single pre-change
`index.html`, with the other 20 browser cases still passing.

The storage-tag cases were proved the same way, against **two** doctored
`sir-ks02.html` baselines rather than one, because the failure they guard has two
symmetrical halves. With the MM half of the match dropped at the call site, three
cases failed — "a tag lands on its own pair and on no other" (`['ts-1']` became
`['ts-1','ts-2']`), the non-leaf/descendant case, and the KS02 read-modify-write
case — while the leaf S&C case passed, since its seed has only one tagged storage.
With the dump half dropped instead, a different three failed: the own-pair case,
the leaf S&C case (`d-2:10` returned `['ts-1']` instead of `[]`), and the
non-leaf/descendant case. The two sets overlap but neither contains the other,
which is exactly why the negative assertions are spread across every surface
rather than made once.

The 2026-08-21 block-by-default work was proved the same way, and there the two
sets are **disjoint**. Each baseline was the repository plus one file whose
`blockDay` ignored `blockDate`: doctoring `calendar-core.js` failed the Home
placement case and the Documentations refuse-to-strand case, and doctoring
`progress.html` failed the Progress placement case and the Progress
refuse-to-strand case — neither baseline failing anything the other did. That
second run also caught a defect in a case of its own: the Progress placement
case originally asserted only block ids and hours, and **passed** against the
doctored file, because the week view holds all seven columns in the DOM at once
and a block drawn on the wrong day still has the right id and the right hour.
`data-block-day` was added to the rendered block so the case can name the
column. A case that cannot fail against the bug it names proves nothing.

The older entries below record one-off audits kept for their detail:

```text
firebase-sync.js: node syntax check passed
notes-widget.js: node syntax check passed
storage-guard.js: node syntax check passed
calendar-core.js: node syntax check passed
calendar-core.js: 80 assertions passed against a synthetic slot, re-run under
  Pacific/Kiritimati (UTC+14), Pacific/Midway (UTC-11), America/Los_Angeles, Asia/Kathmandu
  and UTC with identical results — local day preserved at 00:15 and 23:30, leap-year and
  month/year lengths, dot buckets, greedy milestone lane packing, per-source filtering,
  Documentation as one key covering both notes and deadlines, caution ranges excluding the
  due day, deadline validation, run-ups spanning month/year/DST boundaries, MG 30-day
  carry-forward, and bare/legacy slots returning empty instead of throwing
documentations calendar block: 71 assertions passed in headless Chrome — all four pages
  mount a non-empty React root with the notes widget and no page errors; ?page= deep link
  selects its page; a new block persists as hidden:[] scope:'subtree' with all 13 filters on;
  authored notes and deadlines land in the shared arrays tagged with docPageId on the local
  calendar date without disturbing existing items; owned items are highlighted and are the
  only rows with edit controls; the Documentation filter hides doc notes and doc deadlines
  together while leaving schedule-authored ones, and Day notes/Deadlines do the converse;
  scope toggling changes ownership across sub-pages; unowned doc items show an origin chip;
  authored items reach the Schedule and its popup links back to the source page; an
  export→import allow-list replay preserves docPageId and calendar blocks across all 21
  fields; a docPages write does not drop a concurrent calendarNotes write from another tab;
  and deleting a page keeps every item it authored
documentations calendar block, styling and chrome: 10 assertions passed — the print flatten
  rule parses with its :not(.doc-cal) exemption and the calendar print rules are live (the
  rule has since been SPLIT in two so a parse failure can only cost the exemption; the
  committed suite asserts the split), the
  block picks up its own padding/border with 52px day cells, no horizontal overflow of the
  editor column, and the block's move/delete chrome plus sidebar drag-to-nest still work
localStorage quota guard: 43 assertions passed in headless Chrome against a synthetic slot —
  all five pages mount with window.TrackStorage present and the notes widget attached; with
  the real quota exhausted by filler keys, TrackStorage.saveDB returns false, the quota
  banner appears, the stored track_db stays byte-identical and still parses, no false
  track_db_pending is written, no React root is torn down, and the workspace is intact after
  freeing the quota and reloading; the banner is display:none under print media
hardened track_db readers: committed browser regressions cover malformed values on all five
  reader surfaces. Invalid JSON, unsafe root/slot kinds, missing or duplicate slot ids,
  wrong canonical kinds/items, and malformed recursive goal shapes block without changing
  the stored bytes; a dangling activeSlotId and semantic date/time flaws warn and remain
  editable. The banner offers the exact raw bytes, a missing key and healthy database stay
  quiet, and opening the notes widget cannot bootstrap over damaged data
slot identity and refused-save regressions: committed browser cases switch the active slot
  from another tab while Progress or KS02 is open and verify data remains with its source
  slot. Separate cases keep legacy global notes after a refused adoption and make the
  Documentations empty-slot bootstrap report refusal instead of a phantom workspace
quota guard composition with firebase-sync: 9 assertions passed — storage-guard.js leaves
  Storage.prototype.setItem owned by firebase-sync, saveDB dispatches through that patch
  rather than a captured native reference, a quota throw runs no trailing patch statement,
  and a non-quota error is rethrown instead of swallowed
index.html: loaded in headless Chrome; Universal calendar rendered, day detail opened,
  deadlines listed in the day strip after the collectors moved to calendar-core.js
Universal calendar full-screen layout: 134 assertions passed against a synthetic slot at
  390x844, 844x390, 820x1180, 1180x820 and 1440x900 in both themes — panel spans the full
  viewport width with no horizontal page scroll, is exactly one screen tall wherever there
  is room (and grows instead of crushing cells at 844x390), 7 equal columns and equal-height
  rows filling to the bottom, milestone bridges still continuous with no week-wrap bridge,
  a long day timeline scrolling inside its column without stretching the panel, side column
  above 720px and fixed bottom sheet below, close button and touch taps clearing the day
Universal calendar: 57 assertions passed against a synthetic slot — legend reduced to the
  milestone bar plus four dot categories, milestone lanes stable across each span with
  caps/bridges and no week-wrap bridge, day preview block geometry (09:00 → top 140px,
  90min → 42px, per-date routine duration honoured), four-way overlap split, SIR/MG-carry/
  calendar-note strip, parent task superseded by its same-day child, and track_db
  byte-identical after mouse, dblclick, contextmenu and touch events on every block
progress.html: React root rendered in headless Chrome; ?date=YYYY-MM-DD#schedule opened the
  Schedule tab in day mode focused on the linked date, and omitting ?date= still starts in
  week mode
sir-ks02.html: React root rendered in headless Chrome
documentations.html: inline JSX compiled by Babel; React root rendered; block edit survived reload
export→import round trip: all slot fields preserved with a synthetic fixture
invalid slot import: rejected without modifying track_db
print media: docs chrome hidden, dark text forced in both themes, PDF produced
Firebase overlay: initialized
notes widget: mounted
cloud codec: gzip and raw round trips over synthetic ASCII, Thai combining marks, CJK,
  astral-plane emoji, a 300 KB base64 data-URI and empty input, at 700,000-byte and
  64-byte chunk sizes; flipped bytes, truncation, empty chunks, extra bytes, wrong
  length, wrong checksum and unknown encodings all refused rather than partly applied
cloud sync against an in-memory Firestore double: legacy→v2 migration writing backup/v1
  exactly once, fresh-account first write, local-newer push, a 2.67 MB payload split
  into 4 chunks round-tripping exactly, stale chunk documents deleted on shrink, a
  wrong-generation chunk refused without touching localStorage, a rejected write
  leaving track_db_ts unchanged behind a visible error banner, a remote change applied
  with the reload banner, and a remote change during unsent local edits raising the
  conflict banner without clobbering the local copy
permanent vs transient sync failure: 33 assertions against the same Firestore double with
  the blob/backup subcollections rejecting permission-denied. The permanent banner names
  the code and firestore.rules and never says "Retrying…", no retry timer is armed and no
  further attempt occurs after 7 s, track_db stays byte-identical, track_db_ts is not
  written, track_db_pending stays set, and the cloud keeps only the legacy document.
  "Retry now" makes exactly one further attempt. Once the double stops rejecting, the same
  button completes the legacy→v2 migration: banner cleared, state synced, v2 manifest plus
  blob/0 plus backup/v1 holding the pre-migration payload, and track_db unchanged
  throughout. An `unavailable` rejection still says "Retrying…", still arms the 5 s timer,
  and still retries on its own
window.TrackSync.selfTest(): passed in-browser in auto/gzip and forced-raw modes, each
  also at a 64-byte chunk size to force the multi-chunk path
offline path: #fb-skip leaves sync inert — state signed-out, no banner, no Firestore calls
```

Not covered by this baseline: the live Firebase project (which needs `firestore.rules`
published in the console), real multi-device sync, and touch interaction.

This baseline should be rechecked after changes to:

- External script tags.
- Firebase initialization.
- React entry points.
- shared storage.
- the notes widget.
- page-level markup.

## Recent Implemented Progress

The latest commits before this documentation update show current work concentrated on:

- Milestone presentation and behavior.
- Routine tasks spanning schedule days.
- Kolb step-four references.
- Touch dragging for milestone learning targets.
- Kolb ordering and preservation of unsaved state.
- MG schedule layout.
- Calendar notes.
- Deadlines with caution periods, and a full 00:00–24:00 schedule timeline.
- Source visibility in Schedule.
- Expanded and filtered task-directory views.
- Repeated stabilization of touch schedule behavior and Firebase reload behavior.
- Documentations calendar blocks, and the four judgement calls recorded with them.
- Removing the last writer that could revert another page's fields (`sir-ks02.html`).
- Routing all five `track_db` readers through one validated load boundary, so a malformed stored database can no longer white-screen a page or be silently bootstrapped over.
- The first committed automated tests.
- True Storage: the fourth workspace page, and per-pair source-dump tagging shared with KS02.

These are implemented areas, not roadmap items. Possible follow-up work belongs in `NOTES.md`.

## Current Constraints

The following describe the project today:

- Slot construction, canonical field kinds, recursive goal-shape validation, and database
  reads are centralized. Historical field-presence migrations, page-level fallback reads,
  and nested validation outside the goal tree are still distributed.
- Import validates and normalizes through `schema.js`, preserves unknown keys, and covers
  the canonical envelope plus recursive goal shapes. Nested ids are preserved verbatim
  rather than remapped, and other domains are not yet universally shape-validated.
- Tabs can still hold stale values between refresh events, but Progress and KS02 now move
  snapshot identity with snapshot data when the active slot changes, and no page rebuilds
  a whole slot from that snapshot. Two tabs editing the *same owned key* remain
  last-write-wins.
- Firebase synchronization rewrites the whole serialized database on every save.
- Some user-visible dates are created through UTC-based helpers.
- A `localStorage` quota failure is reported but not rolled back: the unsaved edit stays on screen until reload.
- React, Babel, Tailwind, and Firebase are runtime CDN dependencies.
- There is no package lockfile or production build.
- There is an automated test suite (`node tests/run.js`) but no CI: nothing runs it but a person. It covers `calendar-core.js` thoroughly and the pages at the level of mounting, persistence contracts, and the specific regressions listed in "Running the tests" — it does not cover touch or drag interaction, the signed-in Firebase path, or most of the UI.
- Firebase rules and deployment configuration are not versioned here.
- The two main React pages are large monoliths.
- A missing favicon currently produces a harmless local `404`.

Detailed possible corrections, priorities, and target architecture are maintained in [NOTES.md](NOTES.md).

## Documentation Maintenance Rules

### Update README when

- A feature is implemented or removed.
- Current file ownership changes.
- The active data shape changes.
- A command or verification step becomes part of the actual workflow.
- The runtime stack changes.
- A proposal from NOTES becomes reality.

### Update NOTES when

- A new idea is proposed.
- A current limitation needs design options.
- A possible refactor or migration is being considered.
- Priorities or roadmap order changes.
- An implemented proposal should be marked complete or removed.

### Update AGENTS when

- Agent safety rules change.
- Required checks change.
- New project invariants must always be enforced.
- The documentation ownership model changes.

Keep current reality, future plans, and operational instructions separate so that each document remains trustworthy.
