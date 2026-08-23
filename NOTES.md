# Track Ideas and Unfinished Work

Audit date: 2026-08-10

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
Versioned migrations and recovery
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

The whole-slot importer now validates the canonical top-level envelope and recursive goal
tree shapes through `schema.js`, refuses those malformed inputs without writing, fills
legacy gaps, and preserves unknown keys. Other nested domains are not yet universally
shape-validated. See README, "Per-slot export and import". Two import-policy pieces are
still open.

### Nested ID remapping

Import currently preserves nested IDs verbatim: goal IDs, source-dump IDs, doc-page IDs,
block IDs and storage IDs all come across unchanged. That is correct for restoring a backup
and wrong for importing a *second copy* of a workspace you already have, where the two
copies then share IDs.

Decide whether import should offer a "copy" mode that remaps every nested ID and rewrites
every internal reference to match. This is the same problem as the source-dump policy
below and should be settled once for both.

Audit references outside the exported slot before choosing that mode. In particular,
`trackPriorityMatrix` is a separate localStorage map indexed by goal/task, supporting-action
entry, and MM-entry IDs. It is neither part of a slot export nor currently scoped by slot,
so remapping only the imported object could leave priority records pointing at the original
copy or make two copies appear to share one record. Define whether copy-mode import remaps,
duplicates, discards, or deliberately leaves those external entries alone.

### Source-dump duplicate policy

The source-dump-only importer appends incoming dumps without deduplicating or remapping
IDs. Re-importing the same file can create duplicate IDs and ambiguous references.

Choose and document one behavior:

- Reject duplicate IDs.
- Deduplicate identical entries.
- Import as copies and remap every internal reference.

The **source-dump-only** path has a second gap now that storages tag dumps: it carries
`sourceDumps` and nothing else, so the tags in the receiving workspace's `trueStorages` do
not follow, and dumps imported into a different workspace arrive untagged. Both halves of a
tag are slot-local ids, so there is nothing sensible to carry across without the remapping
decision above. Settle the two together rather than special-casing tags.

### Acceptance criteria

- The chosen duplicate behavior is documented in README and enforced by a browser test
  that imports the same file twice.
- Whatever the dump-only path does about storage tags is stated in README rather than left
  as a silent consequence of what that payload happens to contain.
- Whichever mode remaps IDs rewrites every internal reference, including `mmLinks` and
  nested block IDs, so nothing points at a stale ID.
- The ID audit includes external stores such as `trackPriorityMatrix`; the chosen behavior
  is explicit and tested rather than treating the exported slot as the whole reference
  graph.

## Proposal 2: Versioned Schema and Guarded Migrations

Use the existing `schema.js` contract and shared `TrackStorage.loadDB()` boundary described
in README, "Canonical slot schema" and "Reading the stored database". The remaining work is
root versioning and one guarded migration path shared by every entry surface.

### Open problem

Migrations are still per-page. The field-presence migration IIFEs (`progress.html`,
`sir-ks02.html`) run at page-script load and only exist on the pages that declare them, so
`index.html` and `documentations.html` run none of them. They are keyed on a field being
absent rather than on a version, so there is no way to express a migration that *changes*
an existing value.

### Root metadata

The database root should gain explicit metadata such as:

```js
{
  schemaVersion: 1,
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

`validateDatabase` already checks: the root is an object, `slots` is an array, every slot
has an unambiguous id, list fields are arrays of objects, map fields are plain objects,
goal `children`, `toLearn`, `mmTargets` and `milestones` have safe shapes recursively,
`createdAt` and calendar-item dates are real `YYYY-MM-DD` days, and an optional day-note
`time` is absent or a valid `HH:MM`. Missing or duplicate slot ids and structurally unsafe
goal trees are fatal; a dangling `activeSlotId` and semantic date/time flaws are warnings.

Still to add:

- Goal and task IDs are unique within their intended scope.
- Linked task and mind-map references resolve or are intentionally marked missing.
- Source-dump IDs and nested block IDs are unique.
- Nested shapes outside the goal tree — including mind maps, source dumps,
  documentation blocks, and storage `parentIds`/`tags` — meet the contracts their
  readers assume. `mms` and `trueStorages` share a `parentIds` shape that a bad
  value turns into a `TypeError` on the next render; today only the defensive
  readers in `true-storage-core.js` stand between that and a white screen, and
  `mms` has no equivalent. Cover both together or neither, so the rule stays
  consistent.
- A storage tag names a `(dumpId, mmId)` pair, and neither half is checked to
  resolve. A dangling tag is rendered as *source removed* rather than dropped,
  which is the intended behaviour — but "intentionally marked missing" has no
  policy yet, so validation cannot currently tell it apart from damage.
- The schema version is supported.

Goal and task identity/reference checks need a shared goal-tree walker;
`flattenGoals` lives in `calendar-core.js`, which `progress.html` and `sir-ks02.html` do
not load, so that has to be resolved first. Source-dump and other nested domains need their
own bounded walkers. The policy for "intentionally marked missing" is also undefined today.

Validation currently runs during import, at every load through `TrackStorage.loadDB()`
(memoised on the raw string, and invalidated by each successful write), and in the tests. It
should also run after migrations. It still does not run *before* a write, so a page that
serialises something structurally broken is only caught when the next read validates it —
refusing at the write itself would name the page that caused it instead.

### Detailed migration plan using the shared load boundary

Extend `TrackStorage.loadDB()`'s existing shared verdict with the version states below; do
not create a second parser or a competing error surface for migrations.

The next deliverable is deliberately narrower than revision/conflict handling: introduce
root schema versioning, replace the historical page-load migration IIFEs with one ordered
registry, and make migration failure recoverable. Do not add `revision` yet. A revision
number that no writer checks would imply conflict protection that does not exist; add it
with Proposal 4 instead.

#### Proposed contract decisions

Confirm these defaults during implementation and change them if the evidence from legacy
fixtures requires it:

| Decision | Proposed default |
| --- | --- |
| Current root version | `schemaVersion: 1` |
| Missing `schemaVersion` on an otherwise valid unified database | Treat as version `0` |
| Invalid, negative, fractional, or non-numeric version | Refuse without writing |
| Version newer than this application supports | Open the same read-only recovery state as an invalid database; block page writes, Firebase remote apply, and Firebase upload so this client can neither downgrade nor replace it |
| Historical field-presence transforms | One deterministic, idempotent `0 → 1` migration |
| Future changes | One ordered migration per version step; no skipped versions |
| Migration persistence | Transform an in-memory candidate, validate it, then perform one `TrackStorage.saveDB` call |
| Root and slot keys unknown to this version | Preserve them |
| Recovery copy | Preserve the exact pre-migration `track_db` string before the first write; for a pre-`track_db` install preserve the exact source key/value set and which keys were absent. If that cannot be done, stop and leave every source untouched |
| Recovery-copy cleanup | Never delete automatically in the same migration run; define an explicit, tested retention or user-clear policy before implementation |

#### Step 1 — Inventory and freeze the historical behavior

- List every current migration, the data it reads, the keys it writes, and whether it is
  safe to run twice. The inventory must include:
  - The duplicated pre-`track_db` bootstrap in `progress.html` and `sir-ks02.html`.
  - Progress goal transforms for `toLearn`, `mmTargets`, sub-goal defaults,
    `milestones`, `children`, duplicate `toLearn` values, and the old singular
    `mmTargets[*].milestone` shape.
  - KS02 transforms for MM `rating`, `scBlocksOrder`, `scAggBlocksOrder`,
    `sourceDumpActivated`, the slot `sourceDumps` field, and the transferred-parent
    source-dump repair.
  - The `track_global_notes` adoption in `notes-widget.js`, including when its legacy key
    is removed.
- Separate simple default-filling from semantic transformations. `normalizeSlot` may fill
  absent canonical slot fields, but it must not replace a semantic migration or repair a
  database that failed validation.
- Capture each old shape with synthetic fixtures before moving code. Do not use a real
  export.
- Record which transformations are historical one-time repairs. In particular, verify the
  transferred-parent source-dump repair has a deterministic predicate and does not move
  already-repaired data on a second run.

#### Step 2 — Add fail-first migration tests

- Extend the offline schema/data tests with synthetic fixtures for:
  - A valid unversioned unified database.
  - Each historical Progress and KS02 record shape.
  - Pre-`track_db` legacy keys with no unified database.
  - A current-version database.
  - An unsupported future version.
  - A future-version local or decoded remote database attempting both Firebase apply and
    upload.
  - A migration whose output fails validation.
  - A migration that throws.
  - A recovery-copy write failure and a final `track_db` write failure.
- Add browser cases proving that opening Home, Progress, KS02, or Documentations first
  produces the same migrated result. Home matters because its notes widget is a database
  reader and currently owns the `track_global_notes` adoption path. Migration must not
  depend on which surface happened to load.
- Confirm the new regression fails against a scratch pre-change tree via
  `TRACK_TEST_ROOT`; never commit the baseline copy.
- Keep explicit byte-level assertions:
  - A current database is not rewritten merely by loading a page.
  - A refused or failed migration leaves the original `track_db` byte-identical.
  - A successful migration writes once, reaches the current version, and gives the same
    result when run again.

#### Step 3 — Introduce the version and registry surface

- Add one `CURRENT_SCHEMA_VERSION` constant and make `validateDatabase` check that a
  present version is a supported non-negative integer. Missing remains acceptable only as
  the explicitly defined version-0 legacy case.
- Extend the shared database boundary created by reader hardening, or add a small classic
  shared script if that keeps responsibilities clearer. Do not put independent registries
  in the HTML pages.
- Define migrations as pure transforms keyed by their source version. A runner should:
  1. Determine the source version.
  2. Refuse unsupported future or malformed versions.
  3. Apply every required step in order to an in-memory candidate.
  4. Set that step's target `schemaVersion` on the in-memory candidate.
  5. Validate the whole candidate against the **target version's** contract before that
     transition can count as complete; validating only against the source version proves
     the wrong thing.
  6. Return a structured result such as unchanged, migrated, refused, or failed.
- Migration functions must not call `localStorage`, `TrackStorage.saveDB`, Firebase, DOM
  APIs, alerts, or reload. Keeping transforms pure makes failure and repeat execution
  testable.
- Preserve unknown root keys as well as the unknown slot keys already protected by
  `normalizeSlot`. Never rebuild the database root or a slot from a partial allow-list.

#### Step 4 — Build the version-0 adoption path

- When `track_db` is absent, distinguish a genuinely empty installation from the old
  standalone Progress/KS02 keys.
- Treat the absence of `track_db` as source state, not as the string `'null'`. Recovery for
  this path must capture the exact legacy key/value set (including absence) so it can be
  restored without manufacturing a database that never existed.
- Move the duplicated legacy-key harvesting into one shared function so every DB-aware
  entry page can produce the same version-0 candidate.
- Normalize only the newly constructed legacy slot, then validate the complete candidate
  before it is eligible to save.
- Preserve the existing precedence rules when both Progress and KS02 legacy values exist;
  do not invent a new merge rule without a fixture and an explicit decision.
- Do not delete any legacy key until the current-version database has been written and
  read back successfully. Specify which keys remain as recovery material and which may be
  removed later.
- Fold `track_global_notes` into this flow only if its active-slot semantics can be made
  deterministic. Otherwise keep it as a separately versioned, post-database migration
  with the same backup-before-delete rule.

#### Step 5 — Port historical transforms into `0 → 1`

- Move the Progress and KS02 transformations from page-load IIFEs into the registry while
  preserving their established order.
- Use a shared pure goal-tree walker for the recursive Progress transforms. The walker
  must tolerate the legacy shapes accepted by the version-0 validator without mutating
  the input tree.
- Keep unrelated slot fields, unknown fields, and their nested values deeply equal wherever
  the migration does not own them. Parsed data cannot promise byte-for-byte equality after
  JSON serialization; only the separately preserved original source bytes can make that
  promise.
- For default-only canonical slot fields, use the `SLOT_FIELDS` contract instead of
  repeating field names. Semantic nested defaults still belong in named migration steps.
- Give every semantic transformation a focused unit case and a repeat-run case.
- Treat the transferred-parent source-dump repair as its own named step even if it shares
  version `0 → 1`; it is materially riskier than adding an absent empty list.

#### Step 6 — Make persistence failure-safe

- Before saving a migrated candidate, preserve the exact original serialized string under
  a narrowly named recovery key with enough metadata to identify source and target
  versions. Do not pass that recovery key through Firebase sync.
- Account for quota pressure: a full-size second copy may fail. A failed recovery copy
  must cancel migration, keep `track_db` untouched, and provide a user action to export or
  free space. Do not silently continue without recovery material.
- Save the fully validated candidate once through `TrackStorage.saveDB`. Never write an
  intermediate version.
- If the final save fails, leave the old database and recovery copy intact and stay in the
  visible blocked state.
- Read back and validate the saved bytes before reporting success. Do not advance or clear
  recovery state based only on the in-memory candidate.
- Ensure a successful migration follows the existing Firebase dirty/confirmation rules:
  it may schedule a normal whole-database upload, but it must not write `track_db_ts`
  before cloud confirmation or bypass `track_db_pending`.
- While migration is pending, refused, failed, or blocked on an unsupported future
  version, gate **both** sync directions. Do not upload the local candidate, and do not let
  Firebase's `_origSet` remote-apply path bypass migration/recovery state. Decode and judge
  a remote payload before it can replace local bytes; resume apply/upload only after the
  migration state is explicitly resolved.

#### Step 7 — Wire every entry point and remove the old IIFEs

- Run migration orchestration from the shared load boundary before application state is
  initialized. Opening any page first must behave identically.
- Update Home, Progress, KS02, Documentations, and the notes widget on every page to
  consume the shared result rather than starting migrations themselves.
- Remove the replaced Progress and KS02 field-presence IIFEs only after their fixture cases
  pass against the registry.
- Update Documentations' legacy-data warning/bootstrap logic to use the shared adoption
  status rather than inferring safety independently.
- Ensure the notes widget cannot write while migration is pending, refused, or failed.
- New empty databases and every new-slot path must carry the current root version, but only
  after orchestration has migrated or adopted the root. Never stamp an existing unversioned
  database as current merely because a slot is created or imported. Per-slot export remains
  a slot contract and must not masquerade as a whole database.
- If a shared script changes, bump its cache-busting integer consistently on every page
  that loads it.

#### Step 8 — Close the remaining validation gap for versioning

- Add schema-version support to `validateDatabase` error reporting with messages that
  distinguish malformed, old-migratable, and future-unsupported data.
- Keep the remaining reference-integrity work separate unless the new shared goal-tree
  walker makes it genuinely small:
  - Unique goal/task IDs within their intended scopes.
  - Resolved or explicitly missing task and mind-map references.
  - Unique source-dump and nested block IDs.
- Do not guess the policy for intentionally missing references. Define it and add fixtures
  before turning it into a load-blocking invariant.

#### Step 9 — Verify and document the completed contract

- Run the required shared-script syntax checks, the full `node tests/run.js` suite, browser
  smoke checks for all application pages, `git diff --check`, and final status/diff review.
- Exercise at least these end-to-end cases:
  - Empty installation.
  - Healthy unversioned unified database.
  - Synthetic pre-`track_db` installation.
  - Already-current database.
  - Unsupported future database.
  - Failed recovery copy.
  - Failed final save.
  - Reload and a second page opening after success.
  - Export/import after migration.
  - A decoded future-version remote payload being refused before local replacement.
  - Firebase apply and upload both staying frozen during unresolved migration state.
  - Signed-out Firebase behavior; exercise the two sync gates with an in-memory Firestore
    double, and report the live signed-in path as unverified unless explicitly authorized.
- Update README with the resulting current root shape, reader/migration behavior, recovery
  key, commands, and verified cases.
- Remove the completed migration material from this proposal, leaving unresolved
  validation and recovery-policy work only. Update AGENTS only for durable data-contract
  or verification rules.

#### Completion gate

The migration work is complete only when all of the following are true:

- Every DB-aware entry page, including the notes widget on each of them, produces the same
  migration result.
- Each migration is ordered, deterministic, idempotent, and covered by a synthetic old
  shape.
- No invalid, failed, or future-version database is overwritten locally, remote-applied,
  or uploaded by this client.
- The exact pre-migration serialization remains recoverable.
- Version advancement and database persistence occur in one validated final write.
- Page-specific historical migration IIFEs are gone.
- Current-version loads perform no migration write.
- Existing unknown keys, IDs, references, and unrelated fields survive with deep/value
  equality; exact pre-migration source bytes or key/value state remain separately
  recoverable.

After this gate, the next related data-safety task is Proposal 3 (shared local calendar
dates), followed by Proposal 4 (repository revisions and same-key conflict handling).

## Proposal 3: Use Local Calendar Dates Consistently

### Open problem

Several active paths still use UTC-derived calendar keys such as:

```js
new Date().toISOString().split('T')[0]
```

This can select the previous or next local day near midnight. Slot creation is already
local-day safe through `schema.js`; remaining uses affect export filenames, KS02 dates and
SIR calculations, and Progress date logic.

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

Centralize reads and mutations in a repository module. A revision check before a write is
necessary but not sufficient: two tabs can both read revision `N`, both accept it, and both
write `N + 1`, after which the last write silently wins. `localStorage` has no compare-and-
swap operation. The design therefore needs a tested cross-tab critical section (for
example, a per-database Web Lock where available), a defined fallback where that primitive
is unavailable, and post-write verification that the stored revision/value is still the
one this mutation produced.

The repository should:

- Acquire the cross-tab mutation lock, then re-read the latest persisted value and revision
  **inside** that critical section.
- Apply operations to the latest state rather than a captured page snapshot.
- Reject or merge an operation whose expected base revision is stale.
- Increment a database or per-domain revision, write once, then read back and verify the
  result before reporting success.
- Detect lock loss, unavailable locking, or post-write displacement and surface a conflict
  instead of claiming the edit is safe.
- Notify same-page subscribers and listen for browser `storage` events.
- Optionally use `BroadcastChannel` for faster propagation, but not as a substitute for
  mutual exclusion.
- Replace the global `Storage.prototype.setItem` patch with explicit repository-to-sync
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
- A barrier test forces two tabs to begin from the same revision and proves the lock plus
  post-write check serializes them or reports a conflict; revision-before-write alone must
  fail that test.
- The no-Web-Locks fallback has an explicit, tested behavior and is not described as
  conflict-safe unless it can provide the same guarantee.
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

- Versioned migration transforms and registry orchestration.
- Nested-shape validation outside the now-covered goal tree, including mind maps, source
  dumps, and documentation blocks.
- Import/export normalization.
- Goal-tree operations.
- Mind-map reference resolution.
- Progress streak calculations.
- SIR date calculations.
- Revision and conflict rules.

### Browser coverage still needed

- Floating notes, goals, mind maps, source dumps, and schedules survive reload.
- Duplicate source-dump import follows the selected policy.
- Same-key two-tab conflicts are visible.
- Remote conflict decisions preserve the selected version.

### Interaction matrix still needed

- Mouse and touch drag. The Documentations sidebar tree and the Progress Task
  Priority matrix are now covered by synthetic-TouchEvent cases; the Progress
  goal tree, the KS02 and True Storage trees and both canvases are still
  mouse-only in the product as well as untested, and are the obvious next
  candidates for the same parallel touch path.
- Near-edge auto-scroll — implemented for the Documentations sidebar drag and
  the Task Priority quadrant lists, and in both places it rests on code reading
  rather than on the suite or on a hand check.
- Context menus.
- Schedule block expansion and resizing.
- Milestone reordering.
- Mind-map layout movement.
- Storage canvas movement and the storage tree's sibling drag.
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
│   │   └── TrueStoragePage.jsx
│   ├── features/
│   │   ├── goals/
│   │   ├── schedule/
│   │   ├── milestones/
│   │   ├── mind-maps/
│   │   ├── kolb/
│   │   ├── sir/
│   │   ├── source-dumps/
│   │   ├── true-storage/
│   │   ├── notes/
│   │   └── documentations/
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

- Click-to-create tasks and documentation pages from calendar days.
- Deep-link KS02 calendar items into their owning record.
- Add filter toggles to the Home legend and/or Progress schedule.
- Add a week view using the shared aggregation buckets.
- Add an optional all-slots view with slot badges.

Any new write path must use a fresh read-modify-write of the single owned key and local
calendar dates. Home should remain read-only unless write ownership is explicitly designed.

### Left undone by the schedule-block work

Day-note and deadline schedule blocks are implemented — see README "Schedule blocks for day
notes and deadlines". One piece is still deliberately **not** built:

- **Folding `progress.html`'s copy of the block and caution helpers back into
  `calendar-core.js`.** The twinned set grew again with the chosen-caution-day work and now
  runs to roughly twenty helpers — `blockOn`, `noteBlockStart`, `noteBlockDuration`,
  `dlBlockDuration`, `noteBlockSpan`, `dlBlockSpan`, `blockDay`, `partDay`, `itemParts`,
  `partSpan`, `dlBlockDayValid`, `dlStrandedBlockDays`, `dlCautionDays`, `dlCautionSet`,
  `dlCautionCount`, `dlWithCautionDays`, `dlToggleCautionDay`, `daysBetween`, plus `noteTimed`,
  `dlStart`, `dlDone`, `dlValid`, `dlDraftValid` and `deadlinesCautionOn` — all duplicated for
  one reason: `progress.html` does not load `calendar-core.js`. Making it load that file would
  delete the whole duplication class, and the case is stronger every time the set grows: the
  copies no longer differ on purpose anywhere, so there is nothing a consolidation would have
  to preserve. It is still a cross-page change (script tag plus a cache-bust bump on every
  page), and the two copies must be confirmed identical in behaviour before one is deleted:
  the per-surface browser cases are what would catch a silent difference.

  Note that `dlWithCautionDays` is now a twinned **writer**, not just a reader, which raises
  the cost of a silent divergence: the migration in `progress.html` runs through its copy.
- **`documentations.html` still cannot move an existing due day.** It now chooses caution days
  in both its deadline forms — see README "Choosing the caution days" — because that needed only
  the stranded-prep refusal, and holding that meant *calling* `dlStrandedBlockDays` rather than
  repeating it. Moving a due day additionally needs the ORPHANED-chosen-day refusal, which has
  no shared definition to call: it lives inline in the Progress popup's Edit form. Extracting it
  is the prerequisite for a due-date field here, not the field itself. A scope-guard browser
  case asserts this edit form has no date field, so adding one without that refusal trips a test.
- **A note's block is unrestricted; a deadline's is not.** A note block may be dragged to any
  day at all, which is deliberate — a note has no days to belong to. If notes ever grow them,
  the deadline rule (`dlBlockDayValid` membership plus a refusal at every writer) is the shape
  to copy, not a clamp.
- **The legacy `startDate` branch in `dlCautionDays` has no retirement date.** The one-time
  migration in `progress.html` converts stored records, but the branch cannot be removed while
  a pre-choice export can still be imported — which is forever, since exports are files the
  user keeps. Removing it would silently drop the run-up on every such import. If it is ever
  retired, the migration has to move into the importer first.
- **The caution calendar is now inline on TWO pages, and the case for extracting it has grown
  rather than closed.** `progress.html` styles its picker with Tailwind utilities;
  `documentations.html` styles its own with inline `var(--color-*)` theme tokens, because that
  page's chrome is token-styled and Tailwind's hard-coded greys are unreadable on it under Grit.
  So the two copies
  are not even the same technique, and a visual change now has to be made twice, differently.

  The extraction was deliberately NOT done when the second surface arrived: it would have meant
  rewriting the Progress popup's markup — a daily-use surface — plus a `styles.css` `?v=` bump on
  all five pages, in a change whose point was elsewhere. That trade is worth revisiting on its
  own. Note what is NOT a reason to hurry: the picker sits inside `.cal-doc-form` on
  Documentations, which print already hides, so neither copy is missing a print rule. The rules
  behind the picker were never duplicated — `dlToggleCautionDay`, `dlWithCautionDays` and
  `dlStrandedBlockDays` have one definition each and both pickers call them. This is a styling
  duplication only, which is why it is a cleanup and not a correctness risk.

## Proposal 13: Memoize Documentation Day Aggregation if Needed

`buildDaySchedule` is recomputed on every Documentations render. It is currently a linear
pass over one slot and has not been measurable at realistic sizes.

Do not memoize it pre-emptively. Revisit only if profiling a large synthetic slot or a real
user report shows editor input latency attributable to this calculation.

## Proposal 14: Remaining Work Around the Canvas Cycle Guards

The parent-cycle crash is fixed and the layout now has one definition in `graph-layout.js`
(see README, "Parent cycles"). Three adjacent items were found while doing it and are
deliberately **not** done.

### KS02 still writes a byte-identical slot on mount and cross-tab refresh

`true-storage.html` compares before writing, so a mount or a `storage`-event refresh that
changes nothing performs no write. `sir-ks02.html` does not: its autosave effect writes the
same bytes back, which sets `track_db_pending` and arms a sync upload for a no-op.

Harmless to the data — the write is correct, just needless — but it costs an upload per tab
focus and makes `track_db_pending` a noisier signal than it should be. Apply the same
compare-before-write there. Check `progress.html` and `documentations.html` for the same
shape before assuming KS02 is the only one.

### The KS02 `+ storage` picker lists from a stale snapshot

The picker's list of storages comes from KS02's React copy of `trueStorages`, so a storage
created in another tab does not appear until a `storage` event lands. This is staleness in
the *menu* only — the write itself is always a fresh read-modify-write through
`_mutateSlotKey`, so nothing can be lost or overwritten by acting on the stale list.

Fix by reading the list fresh when the picker opens, if it ever proves annoying in practice.

### Cycle tolerance is not cycle prevention

The picker still lets a user make a record its own ancestor; the code now survives it rather
than refusing it. That was deliberate — tolerance is required regardless, because a cycle can
already exist in stored data or arrive through sync, and prevention alone would not help
those. But nothing currently tells a user they have built one.

Open question, needing a product decision rather than a code one: should a cyclic parent
relationship be refused at the picker, merely flagged in the canvas and SRCH views, or left
entirely alone as a legitimate way to model mutual dependence? Do not implement a refusal
without answering that — a mind map where two ideas genuinely feed each other may be exactly
what the user meant.

## Proposal 15: Extract the Duplicated `ConfirmDialog`

Every destructive control now confirms (see README, "Destructive controls"), and the
mechanism chosen was the native `window.confirm()` — it already had 21 call sites, it works
in non-React `notes-widget.js`, and it needed no new shared file.

That left a duplication in place rather than creating one. `ConfirmDialog` is a styled React
modal defined **verbatim twice**, in `sir-ks02.html` and `true-storage.html`. A third copy
was deliberately not made: expanding a verbatim duplicate to a third page is precisely the
shape the `graph-layout.js` one-definition rule forbids, and it would have had to be written
twice more to cover the pages that do not have it.

The residue is a split surface. Some deletions raise a styled in-page modal, others a browser
dialog, and which one a user sees depends on nothing they can perceive.

Proposed direction:

- Extract `ConfirmDialog` into a shared versioned script (`confirm-dialog.js?v=1`), loaded by
  every page that needs it, with the two existing copies reduced to a delegate each.
- Give it a promise-returning imperative entry point so a plain function can `await` it. The
  native `confirm()` sites are synchronous and sit inside plain handlers, so a component-only
  API would force each of them to be restructured into state.
- Migrate the native `confirm()` sites to it, page by page, keeping the message text.
- Keep `notes-widget.js` on native `confirm()` unless the shared script is made usable
  outside React, which is a separate decision.

Do not start this to "tidy" the duplication alone. The prompts work today; this is a
consistency and styling improvement, and it touches every destructive path in the
application, so it needs the full Cancel-path browser coverage re-run against the new
mechanism. `tests/lib/cdp.js`'s `page.rejectDialogs` only answers **native** dialogs — a
DOM-modal implementation makes every existing destructive-control case unable to see the
prompt at all, so those cases must be rewritten in the same change rather than after it.

## Proposal 16: Finish the Flexible Documentation Table

Documentation tables can now merge cells and be pasted in from the `::: track-table` format
(see README, "Documentations"). Three capabilities were scoped out of that change on purpose,
and none of them is started.

**Column widths.** Every column is currently equal-width with a `min-w-[90px]` floor
hard-coded in `TableBlock`. A width per column — `2fr`, `30%`, `120px`, `auto` — would be the
biggest remaining difference between a Track table and the picture it was copied from. The
data shape is the easy part: an optional `cols: [string]` on the block, absent meaning today's
behaviour. The format already has a natural place for it, a `cols:` line above the grid, which
the parser would have to start accepting; the current parser deliberately rejects any line
that is not a row, so this is an additive change to a refusal rather than a new tolerance.

**Per-cell alignment.** Left/centre/right and top/middle/bottom. Cheap once cells can carry
attributes, but they cannot today — `rows` is a grid of plain strings, and keeping it that way
is what makes the existing data forward-compatible. Adding alignment means either a parallel
list keyed by coordinate, like `merges`, or promoting cells to objects, which would break the
`rows: [[string]]` contract and every stored table with it. Prefer the parallel list.

**Configurable header rows.** Row 0 is styled as a header by index, in `TableBlock` and in the
paste preview. Real tables have two-row headers, no header at all, or a header column instead.
An optional `head: n` (and `headCol: n`) would cover it. Note the interaction with merges: a
header cell spanning two columns is the common case that motivates this, and it already works
geometrically — only the styling is index-based.

Do these together or not at all. Each one alone changes the format and the block shape, and
three separate rounds of "the paste format grew a field" would cost three migrations of the
AI-facing spec in `TABLE-PASTE.md` and three re-reads by anyone who had memorised it.

Not proposed: pasting a table by dropping an image on the page and doing the recognition
locally. That needs an OCR dependency and a model, both of which are out of scope for a
repository with no build step and no package manifest. Handing the picture to an AI the user
already has open is the deliberate alternative.

## Additional Small Ideas

### Route the React pages' hard-coded UI accents through the theme

`progress.html` (16 hex literals), `sir-ks02.html` (101) and `true-storage.html` (37) pass colour
as inline `style` values and SVG attributes from JSX, where the `styles.css` remap layer cannot
reach. Under Grit the effect is visible: the Progression donut, its percentage, the SIR pips, the
MM progress bar, the today outline and the goal bar all still paint indigo on a green page.

Two things make this a real task rather than a find-and-replace, and both are the reason it was
left out of the Grit change:

- **Separate the data from the chrome first.** `PALETTE` (`progress.html:1268`) is a categorical
  palette for distinguishing goals, and `mm.color` is a value the user picked. Those must stay
  theme-invariant, and a blanket substitution would destroy them. Only the accent *defaults* —
  the `|| '#6366f1'` fallbacks and the fixed progress/today colours — should move.
- **`var()` does not work in an SVG presentation attribute.** `stroke={color}` has to become
  `style={{stroke: color}}` before a token can be used, so every site needs reading rather than
  patching, in the two files whose geometry the browser suite measures.

Worth doing, and worth doing on its own.


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
| P0 | `schemaVersion`, guarded migrations, recovery, and sync gates | Replaces per-page field-presence IIFEs without letting failed/future data be applied or uploaded | Medium |
| P0 | Replace UTC calendar helpers | Fixes concrete day-boundary errors | Small–medium |
| P0 | Add serialized repository mutations and conflict handling | A revision alone still races; locking plus post-write detection prevents silent tab/device overwrites | Medium–large |
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

- Add `schemaVersion`, guarded migrations, recoverable source capture, and Firebase
  apply/upload gates.
- Define source-dump duplicate behavior and the nested-ID remapping policy.
- Centralize local-date utilities and replace active UTC-day helpers.

Outcome: local data and backups have one documented, tested contract.

### Phase 2: Centralize persistence

- Add a repository layer for `track_db` mutations.
- Serialize cross-tab mutations with a lock/re-read/write/verify contract, then add
  revisions and same-key conflict detection.
- Subscribe through storage events and optionally `BroadcastChannel`; neither is the lock.
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
