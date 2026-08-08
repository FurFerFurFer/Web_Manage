# Track Ideas and Unfinished Work

Audit date: 2026-08-08

## Purpose

This document is the forward-looking backlog for Track. It contains only:

- Unfinished correctness work.
- Feature and refactor ideas that have not been implemented.
- Open design decisions, risks, and acceptance criteria.
- Possible future structure and workflow improvements.

Current behavior, implemented progress, repository shape, and current commands belong in
[README.md](README.md). Mandatory agent procedure belongs in [AGENTS.md](AGENTS.md).

Nothing in this file is automatically authorized for implementation. Confirm scope and
acceptance criteria before starting a proposal.

## Recommended Order

```text
Canonical schema and validation   ← done, see README
        ↓
Versioned migrations and hardened readers
        ↓
Local-date corrections
        ↓
Conflict-aware persistence
        ↓
Reproducible build and modular extraction
        ↓
Structured cloud storage and CI
```

Do not begin with a broad directory or visual rewrite. Protect the data contract before
moving the code that reads and writes it.

## Proposal 1: Remaining Import Work

The whole-slot importer is done — it validates through `schema.js`, refuses malformed
input without writing, fills legacy gaps, and preserves unknown keys. See README,
"Per-slot export and import". Two pieces are still open.

### Nested ID remapping

Import currently preserves nested IDs verbatim: goal IDs, source-dump IDs, doc-page IDs
and block IDs all come across unchanged. That is correct for restoring a backup and wrong
for importing a *second copy* of a workspace you already have, where the two copies then
share IDs.

Decide whether import should offer a "copy" mode that remaps every nested ID and rewrites
every internal reference to match. This is the same problem as the source-dump policy
below and should be settled once for both.

### Source-dump duplicate policy

The source-dump-only importer appends incoming dumps without deduplicating or remapping
IDs. Re-importing the same file can create duplicate IDs and ambiguous references.

Choose and document one behavior:

- Reject duplicate IDs.
- Deduplicate identical entries.
- Import as copies and remap every internal reference.

### Acceptance criteria

- The chosen duplicate behavior is documented in README and enforced by a browser test
  that imports the same file twice.
- Whichever mode remaps IDs rewrites every internal reference, including `mmLinks` and
  nested block IDs, so nothing points at a stale ID.

## Proposal 2: Versioned Schema and Guarded Migrations

The canonical slot model is done: `schema.js` holds the one `SLOT_FIELDS` table, and
`createEmptySlot`, `normalizeSlot`, `validateSlot` and `validateDatabase` all derive from
it. Every new-slot creation site and the whole-slot importer go through it. See README,
"Canonical slot schema". What remains is versioning and migrations.

### Open problem

Readers and migrations are still per-page. Each of `index.html`, `progress.html`,
`sir-ks02.html`, `documentations.html` and `notes-widget.js` carries its own
`JSON.parse(localStorage.getItem('track_db') || '{}')`, none of which checks that the
parsed value is an object — a stored `'null'` still white-screens every React page, and a
stored `'42'` or `'[…]'` is silently replaced by the next bootstrap write.

The field-presence migration IIFEs (`progress.html`, `sir-ks02.html`) run at page-script
load and only exist on the pages that declare them, so `index.html` and
`documentations.html` run none of them. They are keyed on a field being absent rather than
on a version, so there is no way to express a migration that *changes* an existing value.

`validateDatabase` exists but is not wired into any load path — it is used by import and
the tests only. Hardening the five parsers with it is the smallest high-value next step.

### Root metadata

The database root should gain explicit metadata such as:

```js
{
  schemaVersion: 1,
  revision: 0,
  activeSlotId,
  slots
}
```

### Versioned migrations

Replace page-specific field-presence migrations with an ordered registry. Each migration
must be deterministic, guarded against repeat execution, validated before advancing the
schema version, and tested against synthetic old-data fixtures.

Retain the original serialized data until an important migration validates successfully.
Possible recovery mechanisms include a temporary local recovery key or an automatic
downloaded backup.

### Remaining validation invariants

`validateDatabase` already checks: the root is an object, `slots` is an array,
`activeSlotId` resolves, slot IDs are unique, list fields are arrays, map fields are plain
objects, `createdAt` and calendar-item dates are real `YYYY-MM-DD` days, and an optional
day-note `time` is absent or a valid `HH:MM`.

Still to add:

- Goal and task IDs are unique within their intended scope.
- Linked task and mind-map references resolve or are intentionally marked missing.
- Source-dump IDs and nested block IDs are unique.
- The schema version is supported.

The first three need a goal-tree walker; `flattenGoals` lives in `calendar-core.js`, which
`progress.html` and `sir-ks02.html` do not load, so that has to be resolved first. The
policy for "intentionally marked missing" is also undefined today.

Validation currently runs during import and in the tests. It should also run after
migrations, in the five parsers, and optionally after writes in development mode.

## Proposal 3: Use Local Calendar Dates Consistently

### Open problem

Several active paths still use UTC-derived calendar keys such as:

```js
new Date().toISOString().split('T')[0]
```

This can select the previous or next local day near midnight. Remaining uses affect slot
creation, export filenames, KS02 dates and SIR calculations, and Progress date logic.

Parsing `new Date('YYYY-MM-DD')` is also unsafe for local calendar arithmetic because that
form is interpreted as UTC.

### Proposed direction

Create shared helpers that format and parse local calendar days explicitly:

```js
function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDateKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}
```

Do not silently change fields that are true instants, such as millisecond `createdAt`
timestamps. Classify each date before converting it.

### Acceptance criteria

- Test both ends of a local day in UTC+14 and UTC-11.
- Test month, year, leap-day, and daylight-saving boundaries.
- Test addition and subtraction of local calendar days.
- Remove active UTC-date helpers used for user-visible calendar days.
- Preserve stored meanings and existing date keys.

## Proposal 4: Add Revision and Conflict Handling

### Open problem

Pages now merge only their owned keys into a fresh database read, which protects unrelated
fields. Conflicts are still last-write-wins when two tabs edit the same owned key, such as
two Progress tabs editing `goals` or two KS02 tabs editing `mms`.

Remote changes received while there are no pending local edits are written to
`localStorage` and surfaced with a reload prompt. Until reload, a page can still hold an
older in-memory value and overwrite a remote change to the same key on its next edit.

Cloud selection also depends on client-generated timestamps. A device with a badly wrong
clock can win incorrectly.

### Proposed local repository layer

Centralize reads and mutations in a repository module that:

- Reads the latest persisted revision before every mutation.
- Applies operations to the latest state rather than a captured page snapshot.
- Increments a database or per-domain revision.
- Notifies same-page subscribers.
- Listens for browser `storage` events.
- Optionally uses `BroadcastChannel` for faster same-browser propagation.
- Detects and surfaces an edit based on an outdated revision.
- Replaces the global `Storage.prototype.setItem` patch with explicit repository-to-sync
  notification if practical.

Pages should submit mutations, not serialize snapshots. For example:

```js
repository.updateSlot(slotId, current => ({
  ...current,
  goals: nextGoals
}));
```

### Proposed cloud conflict boundary

Consider server-controlled revisions, transactions, or write preconditions. Merge
independent domains automatically only when the rule is deterministic; otherwise offer a
visible choice with an export-both escape hatch.

### Acceptance criteria

- Two tabs editing different keys preserve both changes.
- Two tabs editing the same key cannot overwrite silently.
- A remote update followed by an edit before reload cannot silently erase the remote
  change to that domain.
- Pending local edits continue to block automatic remote replacement.
- Device-clock skew is included in the conflict tests.
- Conflict resolution preserves an exportable copy of both versions when merging is
  unsafe.

## Proposal 5: Split Cloud Persistence Semantically

### Open problem

Every change still compresses and uploads the complete serialized workspace. Changing one
checkbox therefore rewrites every slot, source dump, note, and embedded image.

The opaque payload also prevents Firestore rules from validating internal fields, and
whole-database replacement leaves a large conflict boundary.

### Proposed migration path

Do not create a document for every small item immediately. A possible first split is:

```text
users/{uid}
users/{uid}/slots/{slotId}
users/{uid}/slots/{slotId}/sourceDumps/{dumpId}
```

Store structured fields where practical. Split continuously growing or image-heavy source
content first; split other domains only when size, write amplification, or conflict data
justifies it.

Before changing the cloud shape, provide:

- An export-first safety step.
- A one-time migration.
- Old-format and new-format detection.
- A tested recovery or rollback path.
- Matching `firestore.rules` blocks for every new path.
- An explicit hand-off requiring the rules to be published before the new writer ships.

### Additional sync ideas

- Decide whether more Firebase error codes have enough evidence to be classified as
  permanently non-retriable.
- Consider a very slow recovery probe for a permanent failure, balanced against repeated
  writes that cannot succeed.
- Expose the existing sync status surface consistently on pages other than
  Documentations.
- Decide whether a quota-rejected edit should roll React state back instead of remaining
  visibly unsaved until reload.

## Proposal 6: Introduce a Reproducible Build

### Open problem

The main pages load React development builds, React DOM, Babel, Tailwind, and Firebase from
CDNs at runtime. This preserves a simple static workflow but leaves runtime compilation,
network-dependent rendering, no lockfile, weak module boundaries, and no production build
that validates inline JSX before deployment.

### Proposed direction

Use a package-managed build tool such as Vite while retaining static deployment output.
The migration should not be combined with schema, synchronization, and broad UI rewrites.

Suggested order:

1. Preserve current behavior with fixtures and browser tests.
2. Extract pure data utilities.
3. Introduce the build and lockfile.
4. Move one page at a time into modules.
5. Replace runtime Babel and the Tailwind browser CDN.
6. Verify behavior after each page migration.

### Acceptance criteria

- One documented local development command.
- One production build command.
- JSX is parsed before deployment.
- Dependencies are locked reproducibly.
- The built output remains suitable for static hosting.
- Offline/local-only behavior is documented separately from network-free rendering and
  authenticated cloud sync.

## Proposal 7: Expand the Automated Test Coverage

The committed dependency-free runner is the baseline. The unfinished work is to extend it
beyond calendar aggregation and the currently covered browser regressions.

### Pure data tests still needed

- Slot construction and normalization.
- Schema validation and migrations.
- Import/export normalization.
- Goal-tree operations.
- Mind-map reference resolution.
- Progress streak calculations.
- SIR date calculations.
- Revision and conflict rules.

### Browser coverage still needed

- Add `notifications.html` to the smoke suite and verify its synthetic feed contract over
  HTTP.
- Cover all five application surfaces when shared runtime files change.
- Empty database creation produces one valid canonical slot from every entry page.
- Slot creation and switching preserve independent workspaces.
- Floating notes, goals, mind maps, source dumps, and schedules survive reload.
- Duplicate source-dump import follows the selected policy.
- Same-key two-tab conflicts are visible.
- Remote conflict decisions preserve the selected version.

### Interaction matrix still needed

- Mouse and touch drag.
- Near-edge auto-scroll.
- Context menus.
- Schedule block expansion and resizing.
- Milestone reordering.
- Mind-map layout movement.
- Print/PDF output.

### Fixtures still needed

```text
tests/fixtures/
  empty-db.json
  legacy-pre-slots.json
  legacy-milestones.json
  conflicting-revisions.json
  malformed-import.json
```

Fixtures must be synthetic. A real personal export must never become test data.

## Proposal 8: Split the Repository by Stable Responsibility

### Goal

Reduce cross-feature editing and make data ownership, page ownership, tests, and deployment
configuration visible. A flat root is not itself a defect; extract only when a stable
boundary reduces risk or enables testing.

### Possible target structure

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
│   ├── app/
│   ├── pages/
│   │   ├── HomePage.jsx
│   │   ├── ProgressPage.jsx
│   │   ├── KS02Page.jsx
│   │   ├── DocumentationsPage.jsx
│   │   └── NotificationsPage.jsx
│   ├── features/
│   │   ├── goals/
│   │   ├── schedule/
│   │   ├── milestones/
│   │   ├── mind-maps/
│   │   ├── kolb/
│   │   ├── sir/
│   │   ├── source-dumps/
│   │   ├── notes/
│   │   ├── documentations/
│   │   └── notifications/
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
├── public/
│   └── favicon.svg
├── tests/
│   ├── unit/
│   ├── browser/
│   └── fixtures/
├── scripts/
│   ├── check.mjs
│   ├── smoke.mjs
│   └── notifications-build.mjs
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

This is a direction, not a requirement to create empty directories.

### Recommended extraction order

1. Local-date utilities.
2. Schema, validation, and normalization.
3. Import/export and migrations.
4. Repository and conflict logic.
5. Firebase synchronization.
6. Pure goal, mind-map, and scheduling functions.
7. Small leaf components.
8. Large page components one page at a time.

## Proposal 9: Automate Verification and Add CI

### Proposed command surface

After a package-managed build exists, provide stable commands such as:

```bash
npm run check
npm run test
npm run test:data
npm run test:browser
npm run build
```

Keep expensive interaction tests separate from the common fast path without allowing
targeted commands to bypass mandatory data-safety checks.

### Boundary-aware checks

- `src/data/**` → migration and round-trip fixtures.
- `src/sync/**` → concurrency, failure, and offline tests.
- `src/features/schedule/**` → mouse and touch interaction tests.
- `src/features/notes/**` → slot-switch and persistence tests.
- Dependency or entry-point changes → full render smoke and production build.

### CI behavior

- Install exactly from the lockfile.
- Run unit and data-contract tests.
- Build the production application.
- Serve the built output locally.
- Run all-page browser smoke tests.
- Upload useful failure artifacts.
- Never deploy merely because verification passed.

## Proposal 10: Create a Reusable `guard-track-changes` Skill

Create this only if a reusable personal workflow adds value beyond the repository's
`AGENTS.md`. Do not duplicate the evolving data contract or test matrix in two places.

The skill's useful role would be to route Track changes to repository-owned instructions
and checks:

- Classify affected persistence and interaction boundaries.
- Load the canonical data contract when relevant.
- Route schema, sync, import, schedule, date, or UI work to the matching regression matrix.
- Require evidence that a covered bug failed before the fix.
- Report exact verification and remaining risks.

Possible structure:

```text
guard-track-changes/
├── SKILL.md
└── agents/
    └── openai.yaml
```

Keep project tests and changing reference documents in this repository so humans, CI, and
other agents use the same source of truth.

## Proposal 11: Make Firebase Deployment Reproducible

### Open work

Add or document:

```text
firebase.json
.firebaserc.example or explicit project-selection instructions
```

Do not commit credentials or service-account keys.

If the Firebase emulator becomes part of the toolchain, add rule tests for:

- A user reading and writing only their own manifest.
- The `blob` and `backup` subcollections.
- Unauthenticated access rejection.
- Legacy-to-current migration.
- Stale legacy clients being unable to replace a current manifest.

Document local/offline mode, authentication configuration, non-production project
selection, deployment, rule publication, and deployment verification. Deployment must
remain explicit and separately authorized.

## Proposal 12: Extend Universal Calendar Interactions

Remaining candidate directions:

- Drag timed day notes on the hour grid.
- Decide whether timed notes have a duration before adding resize behavior.
- Click-to-create tasks and documentation pages from calendar days.
- Deep-link KS02 calendar items into their owning record.
- Add filter toggles to the Home legend and/or Progress schedule.
- Add a week view using the shared aggregation buckets.
- Add an optional all-slots view with slot badges.

Any new write path must use a fresh read-modify-write of the single owned key and local
calendar dates. Home should remain read-only unless write ownership is explicitly designed.

## Proposal 13: Memoize Documentation Day Aggregation if Needed

`buildDaySchedule` is recomputed on every Documentations render. It is currently a linear
pass over one slot and has not been measurable at realistic sizes.

Do not memoize it pre-emptively. Revisit only if profiling a large synthetic slot or a real
user report shows editor input latency attributable to this calculation.

## Additional Small Ideas

### Add a favicon

Add a small versioned favicon to remove `/favicon.ico` 404 noise. If the build structure is
introduced first, place it under `public/`.

### Keep run documentation aligned with build changes

When the build system changes, replace no-build instructions with the real development,
test, build, and deployment commands. Continue to distinguish:

- Local-only data storage.
- Network-free rendering.
- Firebase-authenticated synchronization.

These are separate capabilities.

## Recommended Priorities

| Priority | Change | Why | Relative effort |
| --- | --- | --- | --- |
| P0 | Harden the five `track_db` parsers with `validateDatabase` | A stored `'null'` still white-screens every React page | Small |
| P0 | `schemaVersion` and a guarded migration registry | Replaces per-page field-presence IIFEs; makes value changes expressible | Medium |
| P0 | Replace UTC calendar helpers | Fixes concrete day-boundary errors | Small–medium |
| P0 | Add revision and same-key conflict handling | Prevents silent tab/device overwrites | Medium–large |
| P1 | Define source-dump duplicate behavior | Prevents ambiguous IDs on repeated import | Small–medium |
| P1 | Extend browser and interaction coverage | Protects uncovered pages and high-risk gestures | Medium |
| P1 | Add Firebase deployment config and rule tests | Makes cloud changes reproducible and reviewable | Medium |
| P1 | Introduce a reproducible build and lockfile | Enables modules and deployment-time validation | Medium |
| P2 | Split cloud data semantically | Reduces write amplification and conflict scope | Large |
| P2 | Split large pages by stable boundaries | Improves maintainability incrementally | Large |
| P2 | Add CI | Moves repeatable verification before deployment | Small–medium |
| P3 | Calendar interaction extensions | Improves authoring after data guarantees are stronger | Varies |

## Phased Roadmap

### Phase 1: Repair the data contract

- Add `schemaVersion` and guarded migrations.
- Harden the five `track_db` parsers with `validateDatabase`.
- Define source-dump duplicate behavior and the nested-ID remapping policy.
- Centralize local-date utilities and replace active UTC-day helpers.

Outcome: local data and backups have one documented, tested contract.

### Phase 2: Centralize persistence

- Add a repository layer for `track_db` mutations.
- Add revisions and same-key conflict detection.
- Subscribe through storage events and optionally `BroadcastChannel`.
- Remove page-specific persistence plumbing where the repository replaces it.
- Test same-page, cross-page, and remote conflicts.

Outcome: concurrent edits do not overwrite silently.

### Phase 3: Modernize the build

- Add the build tool, React dependencies, and lockfile.
- Move runtime Babel compilation to build time.
- Replace the Tailwind browser CDN.
- Extract data modules first.
- Migrate one page at a time while retaining static deployment.

Outcome: modular source, reproducible dependencies, and deployment-time syntax checks.

### Phase 4: Improve cloud structure

- Add reproducible Firebase deployment configuration and rule tests.
- Introduce a structured cloud schema.
- Split large source content from slot metadata.
- Migrate old cloud data safely.
- Use server-controlled revisions or transactions.

Outcome: smaller writes and narrower, auditable conflict boundaries.

### Phase 5: Continuous verification

- Add CI for data tests, production build, and browser smoke tests.
- Add targeted interaction tests for past and future regressions.
- Run the full matrix before releases.
- Keep deployment explicit and separate from verification.

Outcome: regressions are caught before release.

## Acceptance Rule

Every implemented proposal must satisfy the current Definition of Done in `AGENTS.md` plus
its proposal-specific acceptance criteria. Move implemented behavior to README and remove
the completed proposal or completed portion from this file.
