# Track

Track is a personal learning-progress system built around three connected frameworks:

- **Marginal Gains (MG):** record and review small improvements.
- **Kolb's Learning Cycle:** capture experience, reflection, concepts, and experiments.
- **Spaced Interval Review (SIR):** schedule repeated reviews to retain learned material.

The application also combines hierarchical goals, milestones, routines, supporting actions, source material, calendar scheduling, streaks, notes, and multiple isolated workspaces.

This README is the source of truth for what the project currently contains and how work is currently performed. Proposed improvements and unimplemented architecture belong in [NOTES.md](NOTES.md). Agent-specific operating rules belong in [AGENTS.md](AGENTS.md).

## Current Status

Status reviewed: 2026-07-28

- The application renders successfully in a local Chrome smoke test.
- `index.html`, `progress.html`, and `sir-ks02.html` are the active pages.
- The Git working tree was clean before the documentation work represented by `NOTES.md` and `AGENTS.md`.
- Development currently happens on `master`; the inspected history contains no merge commits.
- The repository currently has no build step, package manifest, automated test suite, or CI workflow.
- The standalone scripts `theme.js`, `storage-guard.js`, `firebase-sync.js`, and `notes-widget.js` pass `node --check`.
- React pages currently compile JSX in the browser through Babel.
- Data is stored locally first and can optionally be synchronized through Firebase.
- All three pages provide persistent light and dark themes with a shared accessible switch.

The code is operational, but current verification is mainly syntax checking plus browser smoke and manual interaction checks.

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

- Navigation to KS02, Progress, Notifications, and Documentations.
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

**Clicking a day** opens a read-only preview of that day's schedule, mirroring the Progress Schedule day view: a 00:00–24:00 timeline at 28px/hour with blocks positioned by time and duration, overlapping blocks split side by side using the same connected-component algorithm as `SchedulePanel`, plus a strip above it for MG focus (with the same 30-day carry-forward and `↑ carried` hint as Progress), SIR sessions due that day (shown on `finishDate` when done, skipped sessions excluded), and calendar notes. The preview has no handlers or inputs and never writes to `track_db`. A `→` button beside the date opens `progress.html?date=YYYY-MM-DD#schedule`, which loads the Schedule tab in day mode focused on that date; the date rides in the query string so the existing `#hash` tab routing is untouched. A `×` button beside it closes the day again.

The detail appears **beside the grid above 720px** as a scrollable column, so the whole month stays visible while a day is open, and **as a fixed bottom sheet at 720px and below**, capped at `62dvh` and padded clear of the notes-widget button. Because the panel's height is definite, a long timeline scrolls inside the column instead of pushing the calendar past one screen. When no workspace exists, the "create a workspace" message renders in the empty month area rather than in the detail.

**Dots** below the day number cover only what the day schedule does not already show: Kolb records and MG changes fused into one category, LIN records (titled from `linDayTitles` when present), floating notes (by local day of `createdAt`), and source-dump creations. These are listed under the timeline in the day detail, with Kolb and MG-change rows distinguished by a meta label. Scheduled goal tasks, routine occurrences, SIR sessions, supporting-action entries, MM study entries, MG focus, and calendar notes are shown in the day timeline instead of as dots. MM creations, MM comments, and Documentation-page creations are not surfaced on the calendar.

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
{ id, date: 'YYYY-MM-DD', time: 'HH:MM', startDate: 'YYYY-MM-DD', title, detail, createdAt }
```

The caution period runs `startDate` through `date` **inclusive**; `startDate` defaults to the due day,
so the minimum period is that single day. Because both are `'YYYY-MM-DD'` strings, membership is a
plain lexicographic comparison (`inCaution` in `SchedulePanel`) and needs no date arithmetic, so it
does not drift across DST, a month boundary, or a year boundary. A deadline with no `startDate` — for
instance one hand-edited out of an export — falls back to a one-day caution period rather than
failing.

Deadlines are created in Schedule → CALENDAR, next to date notes: a `⏰` hover button in each month
day cell, and a `+` on the DEADLINES header of the selected-day panel. Both open an inline composer
whose save is blocked until the title, the due time, and a caution start on or before the due day are
all present. In the month grid a due day shows a red `⏰ HH:MM Title` line and every other caution day
shows an amber `! Title` line. The selected-day panel lists deadlines due that day as editable rows
(double-click to edit, `×` to delete) and caution-only deadlines as read-only amber rows.

In Schedule → TIMELINE, a deadline draws a **red line across its day column at its due time**, on its
own date only, with a clickable diamond and a `HH:MM Title` label. The line paints above every block
state — normal, selected, and picked-up — so a task block can never cover it; its full-width hairline
is click-through, so only the diamond and the label take pointer events and a block underneath stays
draggable and resizable. Every other day of the caution period instead shows an amber `!` chip in the
day header, beside the 📌 note chips. The red line, the `!` chips, the month-cell lines, and the
caution rows all open the same deadline popup, which shows the title, due time, caution range and day
count, and description, and can edit or delete in place.

### Floating notes

`notes-widget.js` mounts a floating notes widget on every page. It currently supports:

- Multiple notes per active slot.
- Topic and content editing.
- Automatic local saves.
- Note deletion.
- Collapsed, list, and detail views.
- Resizable panel dimensions.
- Migration of older global notes into the active slot.

### Notifications

`notifications.html` is a unified inbox for Gmail, Outlook, and Microsoft Teams. It currently supports:

- Filtering by source, by item type (email, chat, mention, calendar), by unread state, and by free-text search.
- Sorting by newest, oldest, source, or sender, with day grouping under the date sorts.
- Per-item checkboxes that persist across reloads.
- A `NEW` badge for items not yet acknowledged, cleared by "Mark all seen".
- Bulk tick, clear ticks, and manual JSON loading.

The page does not contact Gmail, Outlook, or Teams itself. Track is a static local-first site with no server and no credentials, so it cannot authenticate against those services. Instead it reads a pre-generated feed file:

```text
notifications.json
```

That file is produced outside the page and dropped into the repository root. `notifications.sample.json` is a synthetic fixture documenting the expected shape:

```js
{
  generatedAt,          // ISO timestamp of the run that produced the feed
  items: [{
    id,                 // stable, source-prefixed, used as the de-duplication key
    source,             // "gmail" | "outlook" | "teams"
    kind,               // "email" | "chat" | "mention" | "calendar"
    from, subject, preview,
    date,               // ISO timestamp
    unread,             // boolean
    url                 // http(s) deep link, or null
  }]
}
```

Unknown `source` and `kind` values fall back to safe defaults, duplicate `id` values are dropped, and non-http `url` values are rejected rather than rendered as links. An invalid manual import is refused without discarding the currently loaded feed.

Because browsers block `fetch` against `file://`, the feed only loads automatically when the folder is served over HTTP. Opening the page directly from disk shows an explanatory notice and the manual **Load JSON** fallback; ticks and filters still persist in that mode.

### Documentations

`documentations.html` is a Notion-style documentation workspace for recording external events and information. It currently supports:

- Nested pages in a sidebar tree (any depth, flat `parentId` structure like source dumps), with expand/collapse, add page, add sub-page, and cascade delete with a count confirmation.
- Drag to nest and drag to arrange, ported from the Progress goal tree: every sidebar row reveals two handles on hover — `⠿` (indigo) drags the page onto another page to nest it as that page's last child (auto-expanding a collapsed target), and `⇅` (green) drags it before/after a target row by vertical midpoint, adopting the target's parent so one drag can also move a page between parents or out to root level. Dropping the `⠿` handle on the "Pages" header promotes a page to top level. Drops onto the page itself or any of its own descendants are refused outright (a `parentId` cycle would make the whole subtree unreachable). Desktop mouse only — like the Progress tree drag, it uses the HTML5 drag-and-drop API, which does not fire on touch devices.
- A Favorites sidebar section toggled per page from either of two star buttons that share the same `favorite` field: the small one revealed on hover in the sidebar page row, and a large touch-sized one at the right end of the page's toolbar row.
- A per-page emoji icon chosen from a picker grid or typed freely.
- Block-based editing: H1/H2/H3/paragraph text, dividers, tables (editable cells, add/remove rows and columns, first row styled as header), images, and label + url link blocks rendered exactly like source-dump links.
- A **Reference source dump** popup that shows the active slot's source-dump tree fully expanded — every nesting level and every leaf `{label, url}` link visible at once — and inserts a picked link as a link block carrying `dumpRef: {dumpId, linkId, urlId}` provenance. The block shows a "from: <dump title>" badge that degrades to "source removed" if the source is later deleted.
- Images chosen from disk are downscaled (max dimension 1000px) and stored as compressed JPEG data-URIs inside the page, so they export, import, and cloud-sync with the slot. There is no size gate on inserting one: cloud sync gzips and chunks the workspace, so images no longer threaten it. The header instead shows a plain workspace-size readout plus a cloud sync state (`✓ synced`, `↻ syncing…`, `⚠ sync failed`, `⚠ conflict`, or `· local only`), read from `window.TrackSync`. The size turns amber only past ~4 MB, which tracks the browser's own `localStorage` quota rather than any cloud limit.
- Export/share via **Export / PDF**: a print stylesheet hides all app chrome and forces light colors; the browser print dialog then saves the page as PDF (or prints it).

Pages are stored in the per-slot `docPages` field. The page only ever writes that one field, always through a fresh read-modify-write of `track_db`, and refreshes from `storage` events so other tabs' edits appear. On a completely empty install it creates a default slot; if unmigrated legacy Progress/KS02 data is detected instead, it asks the user to open those pages (or Home) first rather than risk orphaning the legacy data.

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
    { id, type: 'divider' }
  ]
}
```

Sibling order in the sidebar is the pages' relative order inside the flat `docPages` array — there is no separate order field. Drag-to-arrange therefore persists by splicing the one moved page to a new array position (and re-parenting is just a `parentId` change), so export/import, Firebase sync, and the slot constructors need no order-specific handling.

### Local and cloud data

Current data behavior includes:

- Local-first storage through `localStorage`.
- Optional Google sign-in.
- Firebase Authentication.
- Firestore synchronization.
- Remote-change notifications.
- Offline/local-only use after skipping sign-in.
- Per-slot export and import.

Slot export serializes the whole slot object and is lossless. Slot import reconstructs the slot from an explicit field list that now includes `notes`, `mmEntries`, `calendarNotes`, `deadlines`, and `docPages` in addition to the previously restored fields, so a full export→import round trip preserves all currently known user-owned fields. The import allow-list must still be extended whenever a new slot field is introduced — see `NOTES.md` Proposal 1 for the remaining schema-centralization work.

#### Storage-quota handling

Every page writes the whole workspace to the single `track_db` key, so the browser's per-origin `localStorage` quota (~5-10 MB) is the binding size limit now that cloud sync gzips and chunks the payload. All 23 `track_db` writes, plus the two `trackPriorityMatrix` writes in `progress.html`, go through `window.TrackStorage` in `storage-guard.js`:

- `TrackStorage.saveDB(db)` — stringify and write `track_db`; returns `true` when stored, `false` when the quota rejected it.
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
| `notifications.html` | Unified Gmail/Outlook/Teams inbox, filtering, per-item tick state |
| `documentations.html` | Notion-style nested documentation pages, source-dump references, PDF export |
| `notifications.sample.json` | Synthetic fixture documenting the `notifications.json` feed contract |
| `theme.js` | Initial theme selection, appearance switching, persistence, and cross-tab updates |
| `storage-guard.js` | `localStorage` quota guard for every whole-database write, plus the quota banner (`window.TrackStorage`) |
| `firebase-sync.js` | Firebase initialization, authentication overlay, local write interception, gzipped/chunked cloud synchronization, sync status surface (`window.TrackSync`) |
| `notes-widget.js` | Floating per-slot notes widget |
| `styles.css` | Shared design tokens, light/dark palettes, responsive styling, and component states |
| `firestore.rules` | Firestore security rules, versioned for review; published by hand in the Firebase console |
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
├── notifications.html
├── documentations.html
├── notifications.sample.json
├── theme.js
├── storage-guard.js
├── firebase-sync.js
├── notes-widget.js
├── styles.css
└── firestore.rules
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
  docPages
}
```

Not every constructor or importer currently initializes every field. Code must therefore continue using safe fallbacks until a canonical schema migration is implemented.

### Additional browser keys

The project also currently uses:

- `track_theme` for the explicit light/dark appearance preference.
- `track_db_ts` for the local Firebase comparison timestamp. It records when this device's data was last **confirmed** in the cloud, not when the device last edited, so it is written only after the server accepts a write.
- `track_db_pending` while this device holds edits the cloud has not accepted yet. Set synchronously on every `track_db` write and removed on confirmation, so a tab closed mid-upload still records that edits are unsent.
- `trackPriorityMatrix` for schedule priority-matrix state.
- `track_notifications` for notification tick state, seen-item IDs, and filter preferences.
- `fb_reloaded` and `fb_reloaded_gen` in `sessionStorage` to break Firebase reload loops and record which cloud generation was reloaded into.
- Older legacy keys during migration, including former Progress and KS02 storage keys.

`track_notifications` is deliberately stored outside `track_db`. It therefore requires no slot default, no migration, and no import/export change, and it is not uploaded to Firestore. The trade-off is that tick state is per-device and does not follow a workspace export.

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
http://127.0.0.1:8765/notifications.html
```

`notifications.html` in particular must be checked over the local server rather than from disk, since the feed fetch is blocked under `file://`.

Stop the server with `Ctrl+C`.

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
node --check storage-guard.js
node --check firebase-sync.js
node --check notes-widget.js
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

The latest audit established:

```text
firebase-sync.js: node syntax check passed
notes-widget.js: node syntax check passed
storage-guard.js: node syntax check passed
localStorage quota guard: 43 assertions passed in headless Chrome against a synthetic slot —
  all five pages mount with window.TrackStorage present and the notes widget attached; with
  the real quota exhausted by filler keys, TrackStorage.saveDB returns false, the quota
  banner appears, the stored track_db stays byte-identical and still parses, no false
  track_db_pending is written, no React root is torn down, and the workspace is intact after
  freeing the quota and reloading; the banner is display:none under print media
quota guard composition with firebase-sync: 9 assertions passed — storage-guard.js leaves
  Storage.prototype.setItem owned by firebase-sync, saveDB dispatches through that patch
  rather than a captured native reference, a quota throw runs no trailing patch statement,
  and a non-quota error is rethrown instead of swallowed
index.html: loaded in headless Chrome; Universal calendar rendered, day detail opened
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

These are implemented areas, not roadmap items. Possible follow-up work belongs in `NOTES.md`.

## Current Constraints

The following describe the project today:

- Slot schema definitions are duplicated across pages.
- The import allow-list restores all currently known fields but must be extended by hand for every new slot field.
- Two pages can hold stale in-memory views of the same `track_db`.
- Firebase synchronization rewrites the whole serialized database on every save.
- Some user-visible dates are created through UTC-based helpers.
- A `localStorage` quota failure is reported but not rolled back: the unsaved edit stays on screen until reload.
- React, Babel, Tailwind, and Firebase are runtime CDN dependencies.
- There is no package lockfile or production build.
- There is no automated unit, browser, or CI test suite.
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
