# Track

Track is a personal learning-progress system built around three connected frameworks:

- **Marginal Gains (MG):** record and review small improvements.
- **Kolb's Learning Cycle:** capture experience, reflection, concepts, and experiments.
- **Spaced Interval Review (SIR):** schedule repeated reviews to retain learned material.

The application also combines hierarchical goals, milestones, routines, supporting actions, source material, calendar scheduling, streaks, notes, and multiple isolated workspaces.

This README is the source of truth for what the project currently contains and how work is currently performed. Proposed improvements and unimplemented architecture belong in [NOTES.md](NOTES.md). Agent-specific operating rules belong in [AGENTS.md](AGENTS.md).

## Current Status

Status reviewed: 2026-07-25

- The application renders successfully in a local Chrome smoke test.
- `index.html`, `progress.html`, and `sir-ks02.html` are the active pages.
- The Git working tree was clean before the documentation work represented by `NOTES.md` and `AGENTS.md`.
- Development currently happens on `master`; the inspected history contains no merge commits.
- The repository currently has no build step, package manifest, automated test suite, or CI workflow.
- The standalone scripts `firebase-sync.js` and `notes-widget.js` pass `node --check`.
- React pages currently compile JSX in the browser through Babel.
- Data is stored locally first and can optionally be synchronized through Firebase.

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

- Navigation to KS02 and Progress.
- Creation of named workspace slots.
- Active-slot selection.
- Slot renaming and deletion.
- Per-slot JSON export.
- Per-slot JSON import.
- Source-dump-only export and import.
- Basic workspace metadata counts.

Each slot is intended to isolate a different subject, course, project, or learning area.

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
- Source pins connected to scheduled work.
- Drag, touch, expansion, and near-edge interaction behavior.
- A locally stored priority matrix.

### Floating notes

`notes-widget.js` mounts a floating notes widget on every page. It currently supports:

- Multiple notes per active slot.
- Topic and content editing.
- Automatic local saves.
- Note deletion.
- Collapsed, list, and detail views.
- Resizable panel dimensions.
- Migration of older global notes into the active slot.

### Local and cloud data

Current data behavior includes:

- Local-first storage through `localStorage`.
- Optional Google sign-in.
- Firebase Authentication.
- Firestore synchronization.
- Remote-change notifications.
- Offline/local-only use after skipping sign-in.
- Per-slot export and import.

The current import path reconstructs a known subset of slot fields rather than performing a proven lossless round trip. Treat exports as important recovery artifacts, but consult `NOTES.md` before relying on import as a complete restore mechanism.

## Current Page and File Responsibilities

| File | Current responsibility |
| --- | --- |
| `index.html` | Home page, slot management, slot import/export, navigation |
| `progress.html` | Goals, milestones, progress, supporting actions, schedule, calendar notes |
| `sir-ks02.html` | Mind maps, Kolb, SIR, MG, LIN records, source dumps |
| `firebase-sync.js` | Firebase initialization, authentication overlay, local write interception, cloud synchronization |
| `notes-widget.js` | Floating per-slot notes widget |
| `styles.css` | Shared static styling, primarily home and shared layout styles |
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
├── firebase-sync.js
├── notes-widget.js
└── styles.css
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
  pos,
  levelTemplates
}
```

Not every constructor or importer currently initializes every field. Code must therefore continue using safe fallbacks until a canonical schema migration is implemented.

### Additional browser keys

The project also currently uses:

- `track_db_ts` for the local Firebase comparison timestamp.
- `trackPriorityMatrix` for schedule priority-matrix state.
- `fb_reloaded` in `sessionStorage` to break Firebase reload loops.
- Older legacy keys during migration, including former Progress and KS02 storage keys.

### Current cloud shape

Firebase currently stores the complete serialized `track_db` value in one user document:

```text
users/{uid}
```

with fields conceptually equivalent to:

```js
{
  data: "<serialized track_db JSON>",
  ts: 1234567890
}
```

Cloud conflict selection currently depends primarily on client-generated timestamps and whole-database replacement.

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
```

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
index.html: loaded in headless Chrome
progress.html: React root rendered in headless Chrome
sir-ks02.html: React root rendered in headless Chrome
Firebase overlay: initialized
notes widget: mounted
```

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
- Source visibility in Schedule.
- Expanded and filtered task-directory views.
- Repeated stabilization of touch schedule behavior and Firebase reload behavior.

These are implemented areas, not roadmap items. Possible follow-up work belongs in `NOTES.md`.

## Current Constraints

The following describe the project today:

- Slot schema definitions are duplicated across pages.
- Import is not yet proven to be a lossless inverse of export.
- Two pages can hold stale in-memory views of the same `track_db`.
- Firebase synchronization rewrites one serialized database document.
- Some user-visible dates are created through UTC-based helpers.
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
