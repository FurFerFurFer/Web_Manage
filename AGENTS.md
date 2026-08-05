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
| `NOTES.md` | Unimplemented ideas, possible changes, risks, options, and roadmap |
| `AGENTS.md` | Mandatory agent procedure and project safety rules |

Keep their responsibilities separate:

- Do not describe an unimplemented proposal as current behavior in README.
- Do not leave an implemented feature documented only as an idea in NOTES.
- Do not put general product descriptions in AGENTS unless they affect how work must be performed.

When implementing a proposal from `NOTES.md`:

1. Update `README.md` with the resulting current behavior.
2. Update, remove, or mark the matching NOTES proposal appropriately.
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
| `theme.js` | Initial theme selection, persistent light/dark switching, cross-tab appearance updates |
| `firebase-sync.js` | Firebase authentication, gzipped/chunked whole-database synchronization, sync status surface |
| `notes-widget.js` | Per-slot floating notes |
| `styles.css` | Shared design tokens, themes, responsive styling, and component states |

Current runtime dependencies are loaded through CDNs:

- React 18 development UMD.
- React DOM 18 development UMD.
- Babel 7.25.6.
- Tailwind browser CDN.
- Firebase 10.12 compatibility scripts.

Do not assume Vite, npm scripts, TypeScript, JSX modules, a test framework, or CI exists until the repository actually contains them.

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
  docPages
}
```

The schema is not yet centralized. Defaults, migrations, readers, writers, and import logic are distributed across multiple files.

Other current browser keys include:

- `track_theme`
- `track_db_ts` — when this device's data was last **confirmed** in the cloud, written only after the server accepts a write
- `track_db_pending` — set while this device holds unsent edits, cleared on confirmation
- `trackPriorityMatrix`
- `fb_reloaded` and `fb_reloaded_gen` in `sessionStorage`
- legacy Progress and KS02 keys used during migration

Firebase uploads the complete serialized database gzipped and split across `users/{uid}` (manifest) plus `users/{uid}/blob/{0..n-1}` (payload chunks), committed in one atomic batch. `users/{uid}/backup/v1` holds a one-time copy of the pre-migration legacy document. Readers verify chunk count, per-chunk generation, byte length, and checksum, and refuse a payload rather than partially applying it. See README "Current cloud shape".

Two rules follow from this:

- Never write `track_db_ts` before a cloud write is confirmed. Doing so leaves the local timestamp ahead of the remote one after a failure, which makes the resolver prefer stale local data forever.
- Never auto-apply a remote payload while `track_db_pending` is set. Surface the choice instead, and freeze uploads until the user resolves it — otherwise the debounce armed by the edit that caused the conflict fires moments later and pushes local anyway.

## Non-Negotiable Data-Safety Rules

### Search every persistence boundary

Before changing a stored field, use `rg` across:

```text
index.html
progress.html
sir-ks02.html
documentations.html
firebase-sync.js
notes-widget.js
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

Prefer read-modify-write behavior based on the latest stored value. Be alert to stale React snapshots overwriting fields owned by another page.

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
node --check firebase-sync.js
node --check notes-widget.js
```

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

- `theme.js`, `firebase-sync.js`, and `notes-widget.js` passed `node --check`.
- Home, Progress, KS02, Documentations, and Notifications loaded in headless Chrome with a seeded synthetic slot; every React root non-empty, no white screen, no page errors beyond the expected Tailwind/Babel CDN warnings.
- Firebase reached the authentication overlay and the offline "Skip" path left the sync code inert (`TrackSync.getStatus().state === 'signed-out'`, no banner, no Firestore requests).
- `window.TrackSync.selfTest()` passed in-browser across four configurations (auto/gzip, forced raw, and both at a 64-byte chunk size to force multi-chunk).
- The codec round-tripped synthetic ASCII, Thai combining marks, CJK, astral-plane emoji, a 300 KB base64 data-URI, and empty input, in gzip and raw mode, at 700,000-byte and 64-byte chunk sizes. Flipped bytes, truncation, empty chunks, extra bytes, wrong length, wrong checksum, and unknown encodings were all refused rather than partially applied.
- The sync write/read paths were driven against an in-memory Firestore double: legacy→v2 migration with a one-time `backup/v1`, fresh-account first write, local-newer push, a 2.67 MB payload splitting into 4 chunks and round-tripping exactly, stale chunk deletion on shrink, a wrong-generation chunk refused without touching `localStorage`, a rejected write leaving `track_db_ts` unchanged with a visible error banner, a genuine remote change applied with the reload banner, and a remote change arriving during unsent local edits raising the conflict banner without clobbering the local copy and without auto-pushing past the debounce (verified by commit count, including further edits made while the banner was up).

Not verified: behavior against the live Firebase project, which needs the console rules update and explicit user authorization. Real multi-device and touch interaction were not exercised.

This is a render-plus-sync-logic baseline, not proof of full behavioral correctness.

## Definition of Done

A task is done only when all applicable statements are true:

- The requested behavior is implemented or the requested analysis is complete.
- Existing user data remains readable.
- Schema changes cover defaults, migration, import/export, and all writers.
- Independent page state does not silently erase unrelated fields.
- Local calendar behavior is used for user-facing dates.
- Applicable syntax/build checks pass.
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
