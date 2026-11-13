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
| `docs/VERIFICATION-LOG.md` | The evidence record for completed work: what was run, what failed first, what is not covered |
| `docs/CONCEPTS.md` | The user's concept model: what each idea means and why, and which words must not be mixed up. Read it before design work. A concept the user confirms goes here; the app changes it implies go in NOTES |
| `docs/contracts/*.md` | The rules for each feature's stored keys, one file per area. Mandatory, read on demand: the "Feature contracts" index below says which file to read before touching what |
| `docs/ARCHITECTURE.md` | The full file table: every file's exact responsibility, and the current `?v=` values |
| `docs/TESTING-LESSONS.md` | The durable testing rules, and the run-time history. Mandatory before test work |

Keep their responsibilities separate:

- Do not describe an unimplemented proposal as current behavior in README.
- Keep `NOTES.md` strictly forward-looking. Do not retain completed work, implementation
  history, fixed or superseded proposals, status-update narratives, or struck-through
  "done" items there.
- When work is completed, document the resulting current behavior in `README.md` and
  remove the completed proposal or completed portion from `NOTES.md`.
- Do not put general product descriptions in AGENTS unless they affect how work must be performed.
- **Verification evidence goes in `docs/VERIFICATION-LOG.md`, never in `AGENTS.md`.** Append
  a new entry there. The log once filled two thirds of this file, which is why it moved.
- **A feature's rules go in `docs/contracts/`, never in `AGENTS.md`.** This file is loaded
  into every session and must stay **under 40,000 characters** (`wc -m AGENTS.md`), the
  size at which Claude Code warns that the file is too large. It reached 174KB on
  2026-11-10 because every shipped feature appended its own "N rules follow" block to
  "Current Data Contract". So: a new or changed feature rule is written into that feature's contract
  file (a new area gets a new file and ONE row in the "Feature contracts" index); a new
  testing lesson goes in `docs/TESTING-LESSONS.md`; a file's responsibility goes in
  `docs/ARCHITECTURE.md`. `AGENTS.md` changes only for a rule that applies to EVERY task —
  procedure, a safety gate, a required command — and a change that takes it past the limit
  moves something out in the same edit.

When implementing a proposal from `NOTES.md`:

1. Update `README.md` with the resulting current behavior.
2. Remove the completed proposal or completed portion from `NOTES.md`, leaving only work
   and ideas that remain unfinished.
3. Write any feature rule the work established into its `docs/contracts/` file, and a
   changed file responsibility into `docs/ARCHITECTURE.md`. Update `AGENTS.md` only if
   required commands, invariants that apply to every task, or safety gates changed.
4. Append the verification evidence to `docs/VERIFICATION-LOG.md`.

## Current Architecture

There is currently no package-managed build system.

This is the short map. **The full table — each file's exact responsibility, what it pins
and why — is `docs/ARCHITECTURE.md`; read a file's row there before editing it.**

| File | Responsibility |
| --- | --- |
| `index.html` | Home, workspace slots, import/export, navigation, universal calendar, Quest |
| `progress.html` | Goals, milestones, progress, supporting actions, the Schedule |
| `sir-ks02.html` | The **Knowledge Record** (displayed name only; "KS02" still means this page): mind maps, Kolb, SIR, MG, LIN, source dumps. Never rename the file, the `ks02` / `ks02_slots` / `ks02_activeSlotId` keys, `.ks02-page`, `data-tabbar="ks02"` or the `ks02` view key |
| `documentations.html` | Documentation pages (Events and Projects tabs), tables, timetable paste, print/PDF |
| `true-storage.html` | Storages canvas and tree, and the SOURCE DUMP tab (a twin of KS02's page) |
| `scripts/schema.js` | `TrackSchema`: the `SLOT_FIELDS` table, `createEmptySlot`, `normalizeSlot`, `validateSlot`, `validateDatabase` |
| `scripts/storage-guard.js` | `TrackStorage`: `loadDB`, `saveDB`, `newId`, the damage and quota banners |
| `scripts/firebase-sync.js` | Firebase auth and gzipped, chunked whole-database sync |
| `scripts/calendar-core.js` | `TrackCalendar`: a slot as per-day calendar data; the caution, block and timetable predicates |
| `scripts/theme.js`, `scripts/viewport.js` | `TrackTheme` (appearance); `TrackViewport` (what is a phone, what is touch-primary) |
| `scripts/goal-core.js`, `project-core.js`, `milestone-core.js`, `quest-core.js` | `TrackGoals`, `TrackProject`, `TrackMilestone`, `TrackQuest`: the goal tree, which goal a page belongs to, milestone status and mind-map phase, quests |
| `scripts/strat-core.js`, `mm-tree-core.js`, `kolb-core.js`, `graph-layout.js` | `TrackStrat`, `TrackMMTree`, `TrackKolb`, `TrackGraphLayout`: STRAT, the SRCH tree and its drag writers, Kolb saves and drafts, the radial canvas layout |
| `scripts/true-storage-core.js`, `source-dump-core.js` | `TrackTrueStorage`, `TrackSourceDump`: storage tags and tree; every source-dump reader and writer |
| `scripts/doc-table-core.js`, `schedule-paste-core.js` | `TrackDocTable`, `TrackSchedulePaste`: table shape and both paste formats |
| `scripts/notes-core.js`, `notes-widget.js` | `TrackNotes` and the floating notes widget (Sorted, Journal, Kolbs) |
| `scripts/journey-core.js`, `journey-book.js`, `journey-fonts.js` | The Journey book, a READER. `journey-fonts.js` is GENERATED by `tools/build-journey-fonts.js`; never edit it by hand |
| `scripts/note-to-self-core.js`, `note-to-self.js` | `TrackNoteToSelf` and the Note to self pop-up on all five pages, a READER |
| `styles/styles.css` | Shared design tokens, themes, responsive styling, component states |
| `docs/` | Paste specifications, the concept model, the feature contracts, the full architecture table, testing lessons, the verification log |
| `World/` | The Track World game project, governed by its own `AGENTS.md`. Not part of the Track runtime; nothing there may write Track data |
| `firestore.rules` | Firestore security rules, versioned for review only; published by hand in the Firebase console |
| `tests/` | The committed suite: `run.js` is the one command; offline `*-core.test.js` suites, `browser.test.js` over `lib/cdp.js`, synthetic fixtures in `lib/fixture.js` |

Two rules hold for every core module, beside "one definition per rule" below:

- **Most core modules hold NO date code and mint NO ids** — the day, `now` and new ids are
  parameters — which is why their suites run once rather than swept across timezones. Keep
  a module that way; `docs/ARCHITECTURE.md` says which ones.
- **A READER writes nothing** — not `track_db`, not a key of its own.

Current runtime dependencies are loaded through CDNs:

- React 18 development UMD.
- React DOM 18 development UMD.
- Babel 7.25.6.
- Tailwind browser CDN.
- Firebase 10.12 compatibility scripts.

Do not assume Vite, npm scripts, TypeScript, JSX modules, or CI exists until the repository actually contains them.

There **is** a test suite, and it has no dependencies and no `package.json` — Node's built-in `node:test`, plus a hand-rolled DevTools-protocol driver over Node 22's global `WebSocket`. Keep it that way: adding Playwright, Puppeteer, Jest, or a package manifest to make a test easier is a dependency decision that needs explicit approval (see "Dependencies, Network, and External Systems").

Repository-local scripts, stylesheets and the iOS icons are loaded with a `?v=N`
cache-busting query. There is no build step to hash filenames, so this query is the only
thing guaranteeing a returning visitor gets a changed asset instead of its cached copy.
**Bump the integer in every page that loads the file whenever its contents change, and keep
the value identical across pages** (`rg -n 'name\.js\?v='` finds them). The one asset no
page loads is `scripts/journey-fonts.js`: its integer is `FONTS_V` in `journey-book.js`.
The current values and the reasons are in `docs/ARCHITECTURE.md`.

The phone layout (`max-width: 720px`, `--phone-tabbar-h`), touch gating and the rule for
beating a Tailwind utility are in `docs/contracts/appearance.md`. Read it before touching
`styles.css`, a breakpoint, or anything shown or hidden on a phone.

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
  trueStoragePos,
  refSchedules,
  dateNotes,
  kolbDrafts,
  files
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

### Feature contracts

The rules for each feature's stored keys live in `docs/contracts/`, one file per area,
moved out of this file word for word on 2026-11-10. They are **as mandatory as anything
here** but are not loaded automatically: **before you change a key, a core module or a
surface in the left column, read its file in full.**

| You are about to touch | Read first |
| --- | --- |
| `calendarNotes`, `deadlines`: `time`, `cautionDates`, `done`, a due day, blocks / `parts` / sub-tasks, ★ Forced, the Schedule's hour grid, the Home or Documentations calendar | `docs/contracts/calendar-items.md` |
| `docPages`: `goalId`, the Projects tab, `goalPlace`, `table` blocks (`merges`, `colWidths`, `align`, `head`), `::: track-table` | `docs/contracts/documentations.md` |
| `refSchedules`, timetable classes, `::: track-schedule` | `docs/contracts/timetable.md` |
| Quest keys on a goal node, `track_quest_routine_ticks`, the Quest tab | `docs/contracts/quests.md` |
| Milestones (overdue, `slips`, date inputs), Procedural mind maps and SIR, mind-map targets, `strat`, SRCH → DIRECTORY, `parentIds` moves | `docs/contracts/milestones-mindmaps.md` |
| `dateNotes` and Journal tags, `kolbDrafts`, the notes widget, the Journey book, the Note to self pop-up | `docs/contracts/notes-journal.md` |
| `trueStorages`, `sourceDumps`, either Source Dump page, **any walk over a parent/child graph or goal links**, the canvas layout | `docs/contracts/storages-source-dumps.md` |
| `styles.css`, colour in a React page, `ACCENT`, the phone layout, touch reveal, `track_theme`, `track_home_cal_hidden` | `docs/contracts/appearance.md` |
| A control that deletes or clears, a `window.confirm`, a `✕` or toggle-off | `docs/contracts/destructive-controls.md` |
| `files`, the FILES tab, `track_files_v1`, Google Drive | `docs/contracts/files.md` |

Five rules recur in all of those files; the contract governs where it says otherwise.

- **One definition per rule.** Call the core module's reader, writer or predicate; never
  spell its comparison at a call site or read a stored key around its resolver.
- **Absence is usually the default, and clearing DELETES the key** — never `''`, `null` or
  `[]` — with named exceptions (`cautionDates: []` is a real value; `!!` booleans write `false`).
- **Edit a stored item by spreading it**, never by rebuilding it from a field list.
- **Every walk over a parent/child graph or goal links carries a cycle guard.**
- **Nothing is repaired or written on read**, and deleting a page, goal or dump never
  deletes the items that point at it.

### Ids, reads, writes and other browser keys

Ids for new records come from `TrackStorage.newId()` in `storage-guard.js`. `progress.html`'s `uid()`, `documentations.html`'s `genId()`, `true-storage.html`'s `genId()` and `notes-widget.js`'s `generateId()` are delegates with a local fallback; do not reintroduce a page-local id shape. `sir-ks02.html` keeps its numeric `nid()` counter for its own records — which is also why a storage id must stay a string: a tag holds one id of each kind, and the two counters must never be able to collide. A source-dump record made on True Storage's SOURCE DUMP tab is NOT one of KS02's own records and takes a `genId()` string, so `sourceDumps` holds both types (see the Source Dump twin rules). Never rewrite a stored id.

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
- `track_home_cal_hidden` — the Home calendar legend's switched-OFF categories; see the rules below
- `track_quest_routine_ticks` — a routine quest's day-scoped tick, `{slotId, day, ids}`; see the rules below
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

Before changing a stored field, use `rg` across the five pages (`index.html`,
`progress.html`, `sir-ks02.html`, `documentations.html`, `true-storage.html`) and **every
file in `scripts/`**.

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

Where each existing prompt lives, and why a handler-level one would be wrong at the
call-site ones, is in `docs/contracts/destructive-controls.md`. When you move a prompt into
a handler, **delete the call-site copy in the same edit**, or one click asks twice.

Two further rules:

- A guard that writes before it asks is not a guard. Where a write reaches
  `track_db` immediately rather than through a React autosave snapshot — KS02's
  `untagStorage` and its `_mutateSlotKey` call is the one such case — the prompt
  must gate the **call**, not a later state update.
- Prompt **after** an existing no-op guard, never before it. `− row` and `− col`
  already refuse to drop the last row or column; asking first would make a button
  that does nothing still demand an answer.

Not every `✕` is in scope. Pure-dismiss controls — closing a modal, cancelling a form —
stay one click, and so do nine deliberate exclusions, each pinned by a browser case and
listed in `docs/contracts/destructive-controls.md`. Do not "make it uniform" without
re-deciding those on purpose, and read that file before adding or removing a prompt.

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

For changes affecting shared JavaScript, syntax-check every script:

```bash
for f in scripts/*.js; do node --check "$f" || break; done
```

Then run the committed suite — it is the only automated check that sees the inline JSX, because it executes it:

```bash
node tests/run.js
```

It sweeps the suites that hold date code under five timezones (UTC+14 through UTC-11), runs every other offline suite once, then `tests/browser.test.js` in headless Chrome; `tests/run.js` is the list. Rules for working with it:

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

Run the checklist for each kind of change made — slot or schema, goals and milestones,
KS02, Schedule and drag interactions (mouse AND touch), notes, sync, dates — in
`docs/TESTING-LESSONS.md` ("Change-specific checks").

### 9. Update documentation

After implementation:

- Put resulting current behavior and commands in `README.md`.
- Keep remaining proposals and alternatives in `NOTES.md`.
- Put a feature's rules in its `docs/contracts/` file, and a testing lesson in
  `docs/TESTING-LESSONS.md`.
- Update `AGENTS.md` only for durable operating rules that apply to every task, and
  keep it under 40,000 characters.

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

The evidence record moved to [`docs/VERIFICATION-LOG.md`](docs/VERIFICATION-LOG.md) on
2026-09-12 — 32 dated entries, verbatim, nothing deleted. It had grown to 174KB inside a
file that is loaded into every agent session, including sessions that never touch the code
it describes. **Read it when you need it**: to audit what was verified and when, to pick up
work in an area whose entry records a defect or a known gap, or to check whether something
is covered by a test or only by code reading. A new entry is appended there, not here.

What a passing run looks like, as of 2026-11-13: `node tests/run.js`, **38 suites** —
`calendar-core`, `schema`, `notes-core` and `note-to-self-core` swept under five timezones
with identical results, seventeen more offline suites once each, then **602 browser
subtests** in headless Chrome. **In the last one to six days of a month, six timetable
cases fail on a date bug in the suite itself** (NOTES, Proposal 7): the Home and
Documentations twins of three cases, each timing out on its class layer while its Progress
twin passes. Any OTHER red case is not that bug. The whole run takes 21 to 52 minutes
depending on machine load; per-suite counts and the measured timings are in
`docs/TESTING-LESSONS.md` ("Baseline and run-time history").

Still unverified, across everything: real touch hardware, the live Firebase project, real
multi-device behaviour, and print output. Those gaps are permanent features of this
environment, not a backlog.

## Testing Lessons

The durable rules the verification log taught are in **`docs/TESTING-LESSONS.md`**, moved
there word for word on 2026-11-10 and still mandatory. **Read it before writing or changing
a test case, before building a fail-first baseline, before a long run, and whenever a run
fails in a way you do not understand.** The ones that must never be out of mind:

- A fix in a covered area adds a case, and the case must be **seen failing first**, against
  a doctored baseline in a scratch tree (`TRACK_TEST_ROOT=<dir>`). **Never place a doctored
  copy in the repository** — other sessions copy the repository mid-task.
- **Read the failure message, never the pass/fail**, and check the plan count, never the
  summary line.
- **A run against code that changed during it is not a run.** Another session may commit
  or edit mid-task; `md5sum` the tree before and after.
- **This machine sleeps, and on battery suspends after 15 idle minutes; a run that spans a
  sleep is void.** Check `/sys/class/power_supply/ACAD/online` before a long run.
- Mount timeouts and `CDP connection closed` are the contention or network signature, not
  a regression, unless the SAME case fails twice.

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
