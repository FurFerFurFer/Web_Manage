# Track Ideas and Possible Changes

Audit date: 2026-07-25

## Purpose

This document is the backlog and design space for Track. It contains:

- Problems that may need correction.
- Possible features and refactors.
- Alternative implementation approaches.
- Proposed tests and acceptance criteria.
- A target directory and module structure.
- A possible project-specific Codex skill.
- A phased roadmap.

Current product behavior, implemented progress, repository shape, and the active development workflow belong in [README.md](README.md). Mandatory agent procedure belongs in [AGENTS.md](AGENTS.md).

Nothing in this file is automatically authorized for implementation. Treat each section as a proposal until the user selects it or it becomes a necessary part of an explicitly requested change.

## How to Use This Backlog

Use the priorities near the end of this file to choose work. Before implementing a proposal:

1. Confirm that the proposal still matches the current behavior in README and source.
2. Decide the exact scope and acceptance criteria.
3. Protect existing data before structural changes.
4. Follow the workflow and safety gates in AGENTS.
5. After implementation, move the resulting current behavior into README.
6. Revise or remove the completed proposal so this file remains a future-facing backlog.

The recommended general order is:

```text
Protect backups and stored data
        ↓
Define and test the data contract
        ↓
Centralize persistence and conflicts
        ↓
Introduce a reproducible build
        ↓
Split UI modules incrementally
```

Do not start with a broad directory rewrite. The structure that reads existing data should only move after the data contract has tests.

## Proposal 1: Make Export and Import Lossless

> **Status update (2026-08-02):** the immediate data-loss bug is fixed. The importer in
> `index.html` now also restores `notes`, `mmEntries`, `calendarNotes`, `deadlines`,
> and the new
> `docPages`, and an export→import round trip covering all known slot fields was
> verified with a synthetic fixture. What remains open from this proposal is the
> structural work: a canonical `normalizeSlot` shared by creation and import,
> type validation instead of a hand-maintained allow-list, and the source-dump
> importer ID-deduplication issue below.

### Problem this would address

`index.html` exports the entire slot object:

```js
JSON.stringify(slot, null, 2)
```

However, import does not restore that same object. It creates a new object by copying only a manually listed set of fields:

```js
const slot = {
  id: 'slot-' + Date.now(),
  name: (data.name || 'Imported') + ' (import)',
  createdAt,
  sessions: data.sessions || [],
  mms: data.mms || [],
  kolbs: data.kolbs || [],
  mgChanges: data.mgChanges || [],
  goals: data.goals || [],
  saActions: data.saActions || [],
  saEntries: data.saEntries || [],
  sourceDumps: data.sourceDumps || [],
  linChanges: data.linChanges || [],
  linDayTitles: data.linDayTitles || {},
  pos: data.pos || {},
  levelTemplates: data.levelTemplates || {},
  mgSchedule: data.mgSchedule || {}
};
```

Known slot fields omitted by this importer include at least:

- `notes`
- `calendarNotes`
- `mmEntries`

Any future field will also be silently dropped until someone remembers to update this import list.

### Impact

The README describes JSON export/import as backup and restore, but importing an exported slot can lose real user data. This is a high-priority correctness bug because users reasonably assume that a backup includes all of their content.

The problem can remain unnoticed because the import reports success and the restored slot still contains most major fields.

### Recommended correction

Create one canonical `normalizeSlot` function in the data layer. Both new-slot creation and import should pass through it.

The import flow should:

1. Parse the JSON.
2. Validate that it represents a supported slot object.
3. Preserve every supported field.
4. Supply defaults for missing fields from older exports.
5. Assign a fresh slot ID when importing as a copy.
6. Preserve or explicitly rewrite internal IDs according to a documented policy.
7. Report validation errors clearly instead of accepting malformed arrays or objects.

The simplest safe pattern is conceptually:

```js
const slot = normalizeSlot({
  ...data,
  id: createSlotId(),
  name: `${data.name || 'Imported'} (import)`,
  createdAt: localDateKey()
});
```

`normalizeSlot` must explicitly validate types. Spreading arbitrary data is useful for forward compatibility, but it should not bypass validation.

### Required tests

Add a round-trip test:

```text
original slot
  → export
  → import
  → normalize
  → compare all user-owned fields
```

At minimum, the fixture should contain:

- One floating note.
- One calendar note.
- One MM entry.
- One source dump with links and text blocks.
- One goal hierarchy.
- One scheduled routine.
- One Kolb entry.
- One SIR session.
- One MG schedule entry.
- Manual multiverse positions.
- Level templates.

The assertion should prove that all user-owned information survives.

### Related source-dump issue

The source-dump-only importer appends incoming dumps without deduplicating or remapping IDs. Re-importing the same file can create duplicate IDs and ambiguous references.

The importer should choose and document one behavior:

- Reject duplicates.
- Deduplicate identical items.
- Import as copies and remap all internal references.

Silently appending conflicting IDs should not remain the default.

## Proposal 2: Prevent Tabs and Devices from Overwriting Each Other

### Problem this would address

The Progress page and KS02 page both maintain their own React state snapshots while writing to the same `track_db` key.

The Progress page initializes several fields independently and writes them back through separate effects:

```js
useEffect(() => { _writeP('goals', goals); }, [goals]);
useEffect(() => { _writeP('saActions', saActions); }, [saActions]);
useEffect(() => { _writeP('saEntries', saEntries); }, [saEntries]);
useEffect(() => { _writeP('mmEntries', mmEntries); }, [mmEntries]);
useEffect(() => { _writeP('mgSchedule', mgSchedule); }, [mgSchedule]);
useEffect(() => { _writeP('calendarNotes', calendarNotes); }, [calendarNotes]);
useEffect(() => { _writeP('deadlines', deadlines); }, [deadlines]);
```

KS02 keeps a full slot array in `slotsRef` and rewrites the active slot whenever one of its major state values changes:

```js
const updated = slotsRef.current.map(
  s => s.id === activeSlotId
    ? { ...s, sessions, mms, kolbs, mgChanges, linChanges, ... }
    : s
);
_setSlots(updated);
```

There is no `storage` event listener that reloads or merges state when another browser tab updates `track_db`.

### Example failure

1. Open Progress in tab A.
2. Open KS02 in tab B.
3. Both tabs load revision 10.
4. Tab A adds a calendar note, producing revision 11.
5. Tab B still has an in-memory revision-10 slot.
6. Tab B adds a mind map and writes its whole stale slot.
7. The calendar note from revision 11 can be overwritten.

Firebase does not automatically solve this because each tab may upload its own full serialized snapshot.

### Remote-change behavior

The Firebase snapshot listener writes remote data directly into `localStorage` and displays a reload banner. The React application can still hold older data in memory until a reload occurs.

If the user continues editing before reloading, a stale React state update may overwrite parts or all of the newly downloaded remote data.

### Recommended short-term correction

Centralize reads and writes in one repository module:

```text
src/data/repository.js
```

The repository should:

- Read the latest persisted revision before every mutation.
- Apply mutations to the latest state rather than an old page snapshot.
- Increment a revision number.
- Notify all page subscribers.
- Listen for browser `storage` events.
- Optionally use `BroadcastChannel` for immediate same-browser synchronization.
- Refuse or surface writes based on an outdated revision.

Pages should call operations such as:

```js
repository.updateSlot(slotId, current => ({
  ...current,
  goals: nextGoals
}));
```

They should not independently serialize the entire database.

### Recommended long-term correction

Use conflict-aware cloud storage:

- Store a server-controlled revision or update timestamp.
- Use Firestore transactions or preconditions when replacing a version.
- Detect when the remote revision differs from the revision the edit was based on.
- Merge independent domains when possible.
- Show an explicit conflict-resolution UI when automatic merging is unsafe.

For a personal single-user application, the conflict UI can be simple:

```text
Cloud data changed while this page was open.

[Reload cloud version]
[Keep this device version]
[Export both before choosing]
```

The important property is that the choice is visible. Data should not be silently overwritten based only on which device wrote last.

## Proposal 3: Split and Strengthen Cloud Persistence

**Partly implemented.** The size limit and the silent-failure problem are solved: the payload is now gzipped and chunked across `users/{uid}/blob/{0..n-1}`, failures raise a visible banner, and `track_db_ts` is written only after the server confirms. See README "Current cloud shape". The remaining parts below — a *semantic* split into per-slot and per-dump documents, structured fields instead of one opaque string, and server timestamps — are still future work.

### Problem this would address

Every change to `track_db` re-uploads the complete serialized database.

### Risks

#### Size limit — resolved

Cloud Firestore documents have a maximum size of 1 MiB. See the official Firebase documentation:

- <https://firebase.google.com/docs/firestore/quotas>

This is a **per-document** limit, not an account limit; the free tier allows 1 GiB in total. The old code hit the per-document limit only because it packed the whole database into one document.

The current implementation gzips the serialized value and splits it across chunk documents of 700,000 bytes, committed with the manifest in a single atomic batch. Compression alone buys roughly 10x on text and about 25% on base64 image data (exactly the inflation base64 adds), and chunking removes the ceiling beyond that. Readers verify chunk count, per-chunk generation, uncompressed length, and an FNV-1a checksum, and refuse rather than partially apply.

A rejected write now raises a non-dismissing `#fb-sync-error` banner with the error code and retries with backoff, so cloud backup can no longer stop silently.

#### Expensive full rewrites — still open

Changing one checkbox still uploads every slot, note, source dump, and history entry again, just compressed. This is now the dominant cost and the main argument for the semantic split below.

Currently mitigated only by: a 1200 ms debounce, an exact-value comparison against the last confirmed payload, and listening to the manifest document alone so an own-write echo costs one small document read instead of the whole payload.

#### Weak rules and validation

Because the data is one opaque JSON string, Firestore security rules cannot validate the internal fields or restrict individual operations effectively.

#### Client clock dependence

The code uses `Date.now()` from each client and selects the newer version by comparing those timestamps. A device with an incorrect clock can incorrectly win a conflict.

### Recommended migration path

Do not jump immediately to a document for every tiny item. A practical first split is:

```text
users/{uid}
users/{uid}/slots/{slotId}
users/{uid}/slots/{slotId}/sourceDumps/{dumpId}
```

The main slot document can hold smaller structured fields. Large, continuously growing source dumps should be separate documents. If goal or history data later becomes large, those can be split further.

Store structured Firestore fields rather than an opaque JSON string where practical. This enables:

- Partial writes.
- Better conflict boundaries.
- Better rules.
- Easier debugging.
- Easier migrations.

Before changing the cloud schema, provide:

- An export-first safety step.
- A one-time migration.
- A way to detect whether cloud data is old or new format.
- A tested rollback or recovery path.

### Firestore rules for the current chunked layout

Rules are not versioned in this repository, so this must be pasted into the Firebase console. Rules do **not** cascade into subcollections, so without the `blob` and `backup` blocks every chunk write fails with `permission-denied`.

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read: if request.auth != null && request.auth.uid == uid;

      // Once a v2 manifest exists, reject any non-v2 write. This is what stops a
      // stale pre-v2 client from replacing the manifest with a legacy {data, ts}
      // document and orphaning the blob chunks.
      allow write: if request.auth != null && request.auth.uid == uid
                   && (resource == null
                       || !('v' in resource.data)
                       || (request.resource.data.v is int
                           && request.resource.data.v >= 2));

      match /blob/{chunkId} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
      match /backup/{backupId} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
    }
  }
}
```

`!('v' in resource.data)` deliberately permits legacy → legacy and legacy → v2, so the migration itself is allowed.

Without the `v` guard the stale-client hazard is bounded but real: a browser running cached pre-v2 JavaScript reads `snap.data()?.data`, gets `undefined`, and plain-`set`s a legacy document over the manifest. The chunks and `backup/v1` survive, a v2 reader still reads the legacy shape, and because the stale push carries that device's older timestamp the next write from any current device restores v2. Residual loss is confined to edits that existed only in the chunks and on no device's `localStorage`.

### Implemented: localStorage quota is guarded

Removing the Firestore ceiling made the browser's own per-origin quota (~5-10 MB) the binding limit. It was unhandled — every writer called `setItem` with no `try`/`catch`, so a `QuotaExceededError` propagated out of a React effect with no error boundary and white-screened the page mid-edit.

This is now done. `storage-guard.js` exposes `window.TrackStorage`, and all 23 `track_db` writes plus the two `trackPriorityMatrix` writes in `progress.html` go through it. A quota rejection returns `false` and raises a persistent banner instead of throwing; any other error is rethrown. See README "Storage-quota handling" for the current behavior and for why the guard is a plain function rather than a second `Storage.prototype.setItem` patch.

Still open, deliberately: the guard reports the failure but does not roll the React state back, so the unsaved edit stays on screen until reload. Rolling back would mean giving each of the 25 call sites its own undo path. The better fix is to stop the quota being reachable at all — see Proposal 13 on documentation images.

## Proposal 4: Introduce a Canonical, Versioned Data Schema

### Problem this would address

There are multiple definitions of what a slot looks like:

- New slot creation in `index.html`.
- Default slot creation in `progress.html`.
- Default slot creation in `sir-ks02.html`.
- Import reconstruction in `index.html`.
- Independent fallback reads throughout the large pages.

These definitions do not contain exactly the same fields.

### Impact

Schema drift creates several classes of bugs:

- A newly created slot behaves differently depending on which page created it.
- A backup can lose fields that import does not know about.
- One page may write a field another page never reloads.
- A new feature must update several distant constructors and migrations.
- Old data may be partly migrated depending on which page opens first.

### Recommended canonical model

Create a single function:

```js
createEmptySlot({
  id,
  name,
  createdAt
})
```

The canonical slot should explicitly define at least:

```js
{
  id,
  name,
  createdAt,
  sessions: [],
  mms: [],
  kolbs: [],
  mgChanges: [],
  linChanges: [],
  linDayTitles: {},
  goals: [],
  saActions: [],
  saEntries: [],
  sourceDumps: [],
  notes: [],
  mmEntries: [],
  mgSchedule: {},
  calendarNotes: [],
  deadlines: [],
  pos: {},
  levelTemplates: {}
}
```

This list should be confirmed against every current read/write path before implementation.

The database root should also contain explicit metadata:

```js
{
  schemaVersion: 1,
  revision: 0,
  activeSlotId,
  slots
}
```

### Versioned migrations

Replace page-specific, field-presence-only migration chains with a registry:

```js
const migrations = {
  1: migrateLegacyStoresToUnifiedDatabase,
  2: addSourceDumps,
  3: addGoalMilestones,
  4: normalizeMmTargets
};
```

Migration should proceed one version at a time:

```text
version 1 → version 2 → version 3 → current version
```

Each migration must be:

- Deterministic.
- Idempotent or guarded by version.
- Tested against a real old-data fixture.
- Validated after execution.
- Followed by a schema-version update only after success.

Before an important migration, retain the original serialized data until the migrated version passes validation. This can be a temporary recovery key or an automatic downloaded backup.

### Useful invariants

Add a `validateDatabase` function that checks:

- `activeSlotId` references an existing slot.
- Slot IDs are unique.
- Goal and task IDs are unique within their intended scope.
- Every linked task ID resolves.
- Every MM reference resolves or is intentionally marked missing.
- Source-dump IDs and nested block IDs are unique.
- Required list fields are arrays.
- Required map fields are plain objects.
- Dates have the expected `YYYY-MM-DD` shape.
- The current schema version is supported.

Validation should run:

- During import.
- After migrations.
- In unit tests.
- Optionally in development mode after writes.

## Proposal 5: Use Local Calendar Dates Consistently

### Problem this would address

The application contains patterns such as:

```js
new Date().toISOString().split('T')[0]
```

This produces the UTC date, not the user's local date.

In the `Asia/Bangkok` timezone, local time is seven hours ahead of UTC. Between local midnight and 06:59, this expression can return the previous calendar day.

This affects areas including:

- KS02's `today()` helper.
- SIR date calculations.
- Progress streak calculations.
- Some creation and export dates.

### Impact

Possible symptoms include:

- A session appearing under yesterday shortly after midnight.
- A streak not recognizing today's activity.
- A spaced-review date being one day off.
- Export or creation dates showing the prior day.

### Recommended correction

Create one local-date utility:

```js
export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
```

When converting a stored key back into a date, avoid relying on:

```js
new Date('2026-07-25')
```

That syntax is interpreted as UTC in JavaScript. Parse the parts explicitly:

```js
export function parseLocalDateKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}
```

Add tests around:

- `00:30` in Bangkok.
- The final day of a month.
- The first day of a year.
- Day addition and subtraction.
- A daylight-saving timezone, even though Bangkok does not use DST.

## Proposal 6: Introduce Reproducible Build and Dependency Management

### Problem this would address

The project loads:

- React development builds from a CDN.
- React DOM from a CDN.
- Babel in the browser.
- Tailwind's browser CDN.
- Firebase compatibility scripts from a CDN.

The README states that the user can open `index.html` directly and that there is no build step.

### Benefits of the current approach

- Very low initial setup.
- Easy static hosting.
- No local package installation.
- Files are directly inspectable.

### Costs now visible in this project

- Runtime Babel compilation.
- Network dependency before the React pages can render.
- No lockfile for the complete dependency graph.
- No normal module boundaries.
- No simple JSX syntax check in CI.
- No tree-shaken production bundle.
- Tailwind CSS is generated in the browser.
- A CDN version-resolution problem has already caused a white screen.

Tailwind documents its Play CDN as development-only:

- <https://tailwindcss.com/docs/installation/play-cdn>

React's current build-from-scratch guidance recommends using a build tool such as Vite, Parcel, or Rsbuild:

- <https://react.dev/learn/build-a-react-app-from-scratch>

### Recommended direction

Use Vite with React while retaining static output.

This would provide:

- Local development server.
- Fast refresh.
- JSX parsing before deployment.
- ES modules.
- Production React builds.
- Dependency locking.
- A normal test environment.
- A static `dist/` output suitable for the same type of hosting.

The migration does not need to happen before the data-safety fixes. A safe order is:

1. Add data fixtures and tests around current behavior.
2. Extract pure data functions.
3. Introduce Vite.
4. Move one page at a time into modules.
5. Verify behavior after each move.

Do not combine the build migration, complete UI restructuring, sync rewrite, and schema rewrite in one commit.

## Proposal 7: Build an Automated Testing Strategy

The project needs a layered test strategy rather than only end-to-end browser tests.

### Layer 1: Zero-dependency data tests

After extracting pure `.mjs` modules, the built-in Node test runner can test:

- Slot construction.
- Schema normalization.
- Export/import round trips.
- Migration fixtures.
- Goal-tree operations.
- MM-reference resolution.
- Streak calculation.
- Local date functions.
- SIR date calculation.
- Conflict and revision rules.

These tests are fast and should run on every change.

### Layer 2: Static and build checks

Run:

- JavaScript/JSX parsing.
- Production build.
- Optional ESLint.
- Optional formatting verification.
- A check for accidentally committed generated or local files.

The production build is important because development rendering alone may not expose all deployment failures.

### Layer 3: Browser smoke tests

At minimum:

1. Start a local static server.
2. Open `index.html`.
3. Verify the Track heading and slot controls.
4. Open Progress and verify its React root is non-empty.
5. Open KS02 and verify its React root is non-empty.
6. Verify the Firebase overlay appears and can be skipped.
7. Verify the notes button mounts.
8. Confirm there are no uncaught browser errors.

This directly protects against the white-screen class of regression.

### Layer 4: Critical-flow browser tests

Automate the following:

- Empty database creates one valid default slot.
- New slot creation includes every canonical field.
- Slot switching preserves each workspace independently.
- A floating note survives reload.
- A calendar note survives reload.
- A goal and child task survive reload.
- A mind map and source dump survive reload.
- Export followed by import preserves all user-owned data.
- Invalid JSON import is rejected without changing current data.
- Duplicate source-dump imports are handled according to policy.
- Progress changes become visible in KS02.
- KS02 changes become visible in Progress.
- Two tabs do not silently overwrite one another.
- Remote-change conflict behavior is explicit.

### Layer 5: Interaction matrix

High-regression interactions need both desktop and touch coverage:

- Click.
- Mouse drag.
- Touch drag.
- Near-edge auto-scroll.
- Context menus.
- Schedule block expansion.
- Milestone reordering.
- Mind-map layout movement.

Every bug fix in these areas should add or extend one reproducible case.

### Test fixtures

Store versioned fixtures under:

```text
tests/fixtures/
  empty-db.json
  legacy-pre-slots.json
  legacy-milestones.json
  current-complete-slot.json
  conflicting-revisions.json
  malformed-import.json
```

Fixtures should be synthetic and must not contain personal production data.

## Proposal 8: Split the Repository by Stable Responsibility

### Goal

Keep the simple static-deployment model while making data ownership, feature ownership, tests, and deployment configuration visible in the directory structure.

The flat root does not need changing merely because it is flat. The reason to introduce directories is that the two main HTML files now contain multiple independent data and UI domains. Module extraction should reduce cross-feature editing and make verification more targeted.

### Supporting cleanup ideas

- Add a repository `.gitignore` for local settings, browser profiles, test artifacts, and future build output.
- Keep `.claude/settings.local.json` machine-local.
- Remove the broad local authorization for `git restore *`.
- Replace one-off command permissions with stable rules in `AGENTS.md`.
- Leave empty `.agents/` and `.codex/` directories alone unless they receive a defined purpose.
- Add a favicon under `public/` when the build structure exists.

### Proposed target structure

After the build and module migration, a reasonable target is:

```text
Track-website/
├── AGENTS.md
├── README.md
├── NOTES.md
├── package.json
├── package-lock.json
├── vite.config.js
├── index.html
├── src/
│   ├── main.jsx
│   ├── app/
│   │   ├── App.jsx
│   │   └── routes.js
│   ├── pages/
│   │   ├── HomePage.jsx
│   │   ├── ProgressPage.jsx
│   │   └── KS02Page.jsx
│   ├── features/
│   │   ├── goals/
│   │   ├── schedule/
│   │   ├── milestones/
│   │   ├── mind-maps/
│   │   ├── kolb/
│   │   ├── sir/
│   │   ├── source-dumps/
│   │   └── notes/
│   ├── data/
│   │   ├── schema.js
│   │   ├── migrations.js
│   │   ├── validation.js
│   │   ├── repository.js
│   │   ├── import-export.js
│   │   └── dates.js
│   ├── sync/
│   │   ├── firebase.js
│   │   └── conflicts.js
│   └── styles/
│       └── index.css
├── public/
│   └── favicon.svg
├── tests/
│   ├── unit/
│   ├── e2e/
│   └── fixtures/
├── scripts/
│   ├── check.mjs
│   └── smoke.mjs
├── docs/
│   ├── data-contract.md
│   ├── migration-guide.md
│   └── regression-matrix.md
├── firestore.rules
├── firebase.json
└── .github/
    └── workflows/
        └── verify.yml
```

This is a target, not a requirement to create every directory immediately.

### Recommended extraction order

1. `src/data/dates.js`
2. `src/data/schema.js`
3. `src/data/validation.js`
4. `src/data/import-export.js`
5. `src/data/migrations.js`
6. `src/data/repository.js`
7. `src/sync/firebase.js`
8. Pure goal/MM scheduling functions.
9. Small leaf UI components.
10. Large page components.

This order attacks correctness and shared behavior before cosmetic organization.

## Proposal 9: Automate and Enforce the Verification Workflow

The active manual workflow now lives in README and AGENTS. A future improvement is to encode that workflow in repository scripts and CI so the same stages run consistently for every feature or fix.

### Possible command surface

After a package-managed build is introduced, provide a small stable command surface:

```bash
npm run check
npm run test
npm run test:data
npm run test:browser
npm run build
```

`npm run check` could compose:

- Formatting or lint verification.
- JavaScript/JSX parsing.
- Unit tests.
- Production build.
- A lightweight browser render smoke test.

Keep expensive interaction tests separate so targeted development remains fast.

### Boundary-aware checks

Possible scripts can map changed paths to additional checks:

- `src/data/**` → migration and round-trip fixtures.
- `src/sync/**` → concurrency and offline tests.
- `src/features/schedule/**` → mouse/touch browser suite.
- `src/features/notes/**` → slot-switch and persistence suite.
- dependency or entry-point changes → complete render smoke and production build.

This mapping should optimize feedback, not skip mandatory correctness checks.

### CI behavior

Add a workflow that:

- Installs dependencies from the lockfile.
- Runs unit and data-contract tests.
- Builds the production application.
- Starts the built application locally.
- Runs browser smoke tests.
- Uploads useful failure artifacts such as screenshots or browser logs.
- Never deploys merely because verification ran.

Deployment should remain an explicit, separately authorized action.

### Acceptance criteria

- One documented command verifies the common path.
- Data-contract failures stop the command.
- A white-screen regression fails browser smoke.
- CI uses the same commands as local development.
- Temporary servers and browser profiles are cleaned up.
- Failed checks explain the affected behavior rather than only returning an unexplained exit code.

## Proposal 10: Create a `guard-track-changes` Codex Skill

### Name

`guard-track-changes`

This is better than a generic “frontend builder” skill because Codex already understands general React and JavaScript development. The valuable knowledge is specific to this application:

- The `track_db` contract.
- Cross-page state ownership.
- Data migration rules.
- Import/export guarantees.
- Firebase conflict risks.
- Touch and desktop regression cases.
- Required verification before handoff.

### Trigger description

A suitable `SKILL.md` frontmatter description is:

```yaml
---
name: guard-track-changes
description: Safely implement, refactor, diagnose, or review changes in the Track learning-progress application while preserving the track_db data contract, versioned migrations, import/export round trips, Firebase synchronization, cross-page state, and mouse/touch behavior. Use for any Track feature, bug fix, data migration, sync change, schedule interaction, mind-map change, or release verification.
---
```

The trigger information belongs in the description because that is what Codex sees before deciding whether to load the full skill.

### Suggested skill structure

```text
guard-track-changes/
├── SKILL.md
├── agents/
│   └── openai.yaml
└── references/
    ├── data-contract.md
    └── regression-matrix.md
```

If the evolving data contract is stored in this repository under `docs/`, avoid maintaining a second competing copy. The skill can instruct Codex to read the repository documents. Bundled references are most useful when the skill must work independently of the repository.

Project test scripts should normally live in the repository, not only inside the skill, because:

- CI must run them.
- Humans must run them.
- The scripts must evolve with the application.
- Keeping one executable source avoids drift.

### Skill workflow

The skill should instruct Codex to:

1. Read repository `AGENTS.md`.
2. Inspect `git status` and preserve unrelated changes.
3. Classify the task by affected boundaries.
4. Read the canonical data contract when persistence is involved.
5. Read the relevant regression-matrix section.
6. Search all readers, writers, importers, exporters, and migrations for affected fields.
7. Add or update a failing test before risky logic changes.
8. Make a cohesive implementation.
9. Run the repository's fast checks.
10. Run browser smoke tests.
11. Run cross-tab, import/export, touch, or migration checks when triggered by the task.
12. Inspect the final diff.
13. Report exact verification and remaining risks.

### Guardrails the skill should include

- Never use broad `git restore`, `reset`, `clean`, or checkout operations without explicit approval.
- Never use production personal data as a test fixture.
- Never change the slot schema without updating normalization, migrations, validation, import/export, and tests.
- Never claim cloud synchronization is correct after only a single-tab test.
- Never treat a rendered page as proof that user data is preserved.
- Never combine a schema migration with a large unrelated UI rewrite.
- Always use local calendar-date helpers for user-visible days.
- Always keep migrations compatible with known fixtures.
- Always report when Firebase rules cannot be inspected.

### Regression-matrix routing

The skill should load only the relevant section:

- Import/export task → backup round-trip matrix.
- Sync task → two-tab and two-device matrix.
- Schema task → migration fixtures and invariants.
- Schedule task → desktop/touch drag matrix.
- Date task → timezone boundary matrix.
- UI-only task → render and targeted interaction checks.
- Release task → complete matrix.

This keeps the skill concise while preserving detailed, task-specific checks.

### What not to put in the skill

Do not add:

- A separate README.
- A changelog.
- General explanations of React.
- Copies of entire source files.
- Machine-specific absolute paths.
- Long command permission lists.
- Duplicate schema documentation that will become stale.

The skill should contain only non-obvious project procedure and routing guidance.

### Suggested default prompt

The `agents/openai.yaml` default prompt can be based on:

```text
Use $guard-track-changes to implement this Track change safely. Preserve data compatibility, update every affected schema and persistence boundary, run the relevant regression checks, and report verification evidence.
```

### Where to create the skill

When it is implemented, choose the location explicitly.

For automatic personal discovery, use the Codex skills directory:

```text
${CODEX_HOME:-$HOME/.codex}/skills/guard-track-changes
```

Keep the changing project contract and executable test suite versioned inside this repository. The global skill should orchestrate those project-owned resources rather than silently fork them.

### Relationship Between Repository `AGENTS.md` and the Skill

These have different responsibilities.

#### `AGENTS.md`

Use it for rules that should always apply when an agent operates in this repository:

- Safe Git behavior.
- Required commands.
- Working-tree preservation.
- Project paths.
- Test entry points.
- Approval boundaries.
- Data/privacy restrictions.

#### `guard-track-changes`

Use it for a workflow that should activate specifically when making or reviewing Track changes:

- Boundary classification.
- Schema/migration analysis.
- Data-safety workflow.
- Regression-matrix routing.
- Verification and reporting.

This separation keeps the always-loaded repository instructions focused while allowing the specialized workflow to load only when useful.

## Proposal 11: Make Firebase and Deployment Reproducible

The repository currently contains client Firebase setup but not the rules or deployment definition.

Add and version:

```text
firebase.json
firestore.rules
.firebaserc.example or documented project-selection instructions
```

Do not commit credentials or private service-account keys.

Firestore rules should at least ensure that:

- A user can only read and write their own data path.
- Unauthenticated users cannot read cloud data.
- Unexpected document shapes or excessive field sizes are rejected where feasible.

Add emulator-based rule tests if the Firebase emulator becomes part of the toolchain.

Document:

- How local offline mode works.
- How to run the site locally.
- How Firebase authentication is configured.
- How to select a non-production Firebase project for testing.
- How to deploy.
- How to verify a deployment.

## Proposal 12: Universal Calendar v2 Interactions

The Universal calendar on `index.html` is a read-only aggregation of the active slot (see README for current behavior). The day-detail preview, milestone period bars, and the deep link into the Progress schedule day view are now implemented. Remaining candidate directions:

- Click-to-create entries (calendar notes, tasks, doc pages) directly from a day cell.
- Per-category filter toggles in the legend so noisy categories (for example MG focus carry-forward) can be hidden.
- Deep links from a day-detail item into the owning KS02 record or Documentations page. (The Progress schedule day-view link is done — `progress.html?date=YYYY-MM-DD#schedule`; the same query-param pattern would extend to the other two pages.)
- A week view sharing the same aggregation buckets.
- An "all slots merged" mode with slot badges (explicitly deferred when the calendar was built — the current scope decision was active slot only).
- Sharing the day-schedule geometry between `index.html` and `progress.html`. The preview currently re-implements `goalDurationFor`, `computeOverlapInfo`, and the top/height formula in vanilla JS because `SchedulePanel` is a ~2,600-line React component that cannot be mounted on the non-React home page. Extracting the pure collectors and geometry into a shared script would remove that duplication, at the cost of a new shared file the three pages must load.

Any write path added here must follow the read-modify-write single-key pattern and the local-date rules; the current implementation deliberately contains no writes.

## Proposal 13: Documentation Images Versus the 1 MiB Cloud Document

**Superseded.** The premise no longer holds. `firebase-sync.js` gzips the database and splits it across chunk documents, so there is no single-document ceiling for images to breach. Measured: base64 of incompressible JPEG data gzips to about 0.75, which recovers exactly the 33% inflation base64 introduced, so even a workspace consisting entirely of images fits one 700,000-byte chunk at the sizes reached in practice.

The `~900 KB` header warning and the `~950 KB` insert confirmation have been removed — they described a limit that no longer exists. `documentations.html` now shows a plain size readout plus a `window.TrackSync` sync state, and image insertion has no size gate. 1000px/0.8-quality downscaling stays, for render performance and `localStorage` headroom rather than for Firestore.

Moving media into IndexedDB or Firebase Storage is therefore no longer needed for sync to work. It would still be worth doing for a different reason — write amplification, since every keystroke currently re-uploads every image — but that is the Proposal 3 semantic split, not a size fix. Note that IndexedDB specifically is **not** an option while images must sync across devices: it is per-origin, per-device.

## Recommended Priorities

| Priority | Change | Why | Relative effort |
| --- | --- | --- | --- |
| P0 | Make slot import/export lossless | Existing backups can silently lose data | Small–medium |
| P0 | Create canonical schema and validation | Prevents new drift and supports every later fix | Medium |
| P0 | Add migration and round-trip fixtures | Protects real stored data during refactors | Medium |
| P0 | Add conflict/revision handling | Prevents silent tab/device overwrites | Medium–large |
| P1 | Replace UTC calendar helpers | Fixes concrete timezone errors | Small |
| P1 | Add one-command browser smoke test | Prevents white-screen deployments | Small–medium |
| P1 | Version Firebase rules and deployment config | Makes security and releases reviewable | Medium |
| P1 | Introduce Vite and a lockfile | Enables modules, builds, and reliable testing | Medium |
| P2 | Split large pages by data and feature boundaries | Improves maintainability and agent accuracy | Large, incremental |
| P2 | Add CI and structured commit conventions | Moves verification before deployment | Small–medium |
| P2 | Clean local agent permission sprawl | Reduces accidental destructive behavior | Small |

## Phased Roadmap

### Phase 0: Preserve the current baseline

- Add the current browser smoke test as a repeatable script.
- Add synthetic current-state and old-state fixtures.
- Extract the current data contract into a dedicated `docs/data-contract.md`.
- Add an explicit `.gitignore`.
- Remove broad destructive permissions from local agent settings.

Outcome: the current application remains structurally unchanged, but future work has a baseline.

### Phase 1: Repair data guarantees

- Implement `createEmptySlot`.
- Implement `normalizeSlot`.
- Implement `validateDatabase`.
- Add `schemaVersion`.
- Make import/export round trips lossless.
- Define source-dump duplicate behavior.
- Centralize local-date utilities.
- Test all known migrations.

Outcome: local data and backups have a documented, tested contract.

### Phase 2: Centralize persistence

- Add a repository layer for all `track_db` mutations.
- Remove page-specific direct database writes.
- Add revisions.
- Subscribe to `storage` or `BroadcastChannel` changes.
- Test Progress and KS02 concurrently.
- Add visible conflict handling.

Outcome: pages no longer overwrite one another silently.

### Phase 3: Modernize the build

- Add Vite, React, and a lockfile.
- Move runtime Babel compilation to build time.
- Move Tailwind to a production build path.
- Extract data modules first.
- Migrate one page at a time.
- Keep static deployment.

Outcome: modular source, reproducible dependencies, and deploy-time syntax validation.

### Phase 4: Improve cloud structure

- Version and test Firestore rules.
- Introduce a new structured cloud schema.
- Split large source dumps from slot metadata.
- Migrate old single-document cloud data.
- Use server-controlled revisions or transactions.
- Add a sync-health indicator visible to the user.

Outcome: scalable and auditable synchronization.

### Phase 5: Continuous verification

- Add CI for unit tests, build, and smoke tests.
- Add targeted browser interactions for past regressions.
- Run the full matrix before releases.
- Replace empty deployment commits with an explicit deployment workflow.

Outcome: regressions are caught before reaching the deployed application.

## Roadmap Acceptance Rule

Every implemented proposal must satisfy the current Definition of Done in `AGENTS.md` plus the proposal-specific tests and acceptance criteria in this file. If implementation changes the required workflow, update AGENTS; if it changes current behavior, update README.

## Additional Small Ideas

These are lower priority than the data issues but should be tracked.

### Missing favicon

The local smoke-test server received `404` requests for `/favicon.ico`. This does not break functionality, but a small versioned favicon would remove the noise.

### Shallow import validation

Import checks that the top-level value is an object, but it does not verify that individual fields have correct types. For example, malformed `goals` or `mms` values can be persisted and fail later in unrelated UI code.

### Global `Storage.prototype` patch

`firebase-sync.js` replaces `Storage.prototype.setItem` globally. Although it forwards non-Track writes, modifying a platform prototype is surprising and makes behavior harder to test. A centralized repository can call sync explicitly and remove this monkey patch.

### Debounced cloud writes

Cloud writes wait approximately 700 ms. Closing the page before the timer fires can leave the cloud behind local storage. Local data may sync on a future open, but the UI should not present the previous cloud state as definitely current.

Consider:

- A visible pending/synced/error indicator.
- A durable local pending revision.
- A best-effort flush on `visibilitychange` or `pagehide`.
- Explicit retry after a failed write.

### Console-only synchronization failures

Many Firebase errors are written only to the developer console. A normal user may believe data is backed up when synchronization has stopped.

Provide a small status indicator:

```text
Local only
Syncing…
Synced
Conflict
Sync failed — retry
```

### Development React build in deployment

Both main pages load `react.development.js`. This is useful for debugging but not the intended production artifact. A production build will resolve this naturally.

### Keep run documentation aligned with build changes

README now distinguishes direct file use from the preferred local HTTP server. If a build system is introduced, replace the current no-build instructions with the actual package commands and deployment output.

Continue to distinguish:

- Local offline storage.
- Network-free operation.
- Firebase-authenticated synchronization.

These are not currently the same thing.

## Final Recommendation

Do not begin with a full visual or directory rewrite.

The highest-return sequence is:

1. Fix backup round trips.
2. Establish the canonical schema.
3. Add fixture tests and browser smoke tests.
4. Centralize persistence and resolve concurrent writes.
5. Then modularize through Vite.

This order protects the user's existing information before changing the structure that currently reads it. It also turns future agent-assisted work from a manual repair loop into a repeatable workflow with explicit safety boundaries.
