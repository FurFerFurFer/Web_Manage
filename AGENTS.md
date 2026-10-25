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

Keep their responsibilities separate:

- Do not describe an unimplemented proposal as current behavior in README.
- Keep `NOTES.md` strictly forward-looking. Do not retain completed work, implementation
  history, fixed or superseded proposals, status-update narratives, or struck-through
  "done" items there.
- When work is completed, document the resulting current behavior in `README.md` and
  remove the completed proposal or completed portion from `NOTES.md`.
- Do not put general product descriptions in AGENTS unless they affect how work must be performed.
- **Verification evidence goes in `docs/VERIFICATION-LOG.md`, never in `AGENTS.md`.** Append
  a new entry there; add to `AGENTS.md` only the durable rule the work established, and only
  when it changed an invariant, a required command, or a safety gate. This rule exists
  because the evidence log reached 174KB inside a file that loads into every session — two
  thirds of it — and grew 143KB to 261KB in sixteen days. `AGENTS.md` is what an agent must
  hold in mind; the log is what it can go and look up. Keeping that split is what stops the
  auto-loaded context from growing without bound again.

When implementing a proposal from `NOTES.md`:

1. Update `README.md` with the resulting current behavior.
2. Remove the completed proposal or completed portion from `NOTES.md`, leaving only work
   and ideas that remain unfinished.
3. Update `AGENTS.md` if required commands, invariants, or safety gates changed.
4. Append the verification evidence to `docs/VERIFICATION-LOG.md`.

## Current Architecture

There is currently no package-managed build system.

Active files:

| File | Responsibility |
| --- | --- |
| `index.html` | Home, workspace slots, import/export, navigation |
| `progress.html` | Goals, milestones, progress, supporting actions, schedule |
| `sir-ks02.html` | The **Knowledge Record** (shown to the user by that name; it was the "KS02 Tracker", and "KS02" in this file still means this page): mind maps, Kolb, SIR, MG, LIN records, source dumps. Only the DISPLAYED name changed. Never rename the file, the `ks02` / `ks02_slots` / `ks02_activeSlotId` legacy keys, `.ks02-page`, `data-tabbar="ks02"` or the `ks02` view key: the keys are a data contract, and a renamed file breaks every bookmark and `?mm=` / `?dump=` link into it. The page's inner KS02 tab (the encoding wheel) is a different thing from the page |
| `documentations.html` | Notion-style nested documentation pages, source-dump references, print/PDF export |
| `true-storage.html` | Storages: KS03-style multiverse canvas, a SOURCE DUMP tab that is a documented twin of KS02's page and edits the same `sourceDumps`, SRCH-style nested tree, one link, an explanation, and source-dump tags |
| `scripts/calendar-core.js` | Shared read-only aggregation of a slot into per-day calendar data (`window.TrackCalendar`), used by the Home universal calendar and the Documentations calendar blocks |
| `scripts/theme.js` | Initial theme selection, persistent light/dark switching, cross-tab appearance updates |
| `scripts/viewport.js` | The one definition, in JavaScript, of what counts as a phone AND of what counts as a touch-primary device (`window.TrackViewport`): `PHONE_PX`, `PHONE_QUERY`, `COARSE_POINTER_QUERY`, `isPhone`, `isTouchPrimary`, `subscribe`. Reads `window.matchMedia` and NOTHING else — no `document`, no storage, no date code — which is what keeps its suite offline and unswept |
| `scripts/schema.js` | The canonical slot definition (`window.TrackSchema`): the `SLOT_FIELDS` table, `createEmptySlot`, `normalizeSlot`, `validateSlot`, `validateDatabase` |
| `scripts/storage-guard.js` | The one `track_db` load boundary (`loadDB` — parse, validate, freeze writes on damage) and the `localStorage` quota guard for every whole-database write, both banners (`window.TrackStorage`) |
| `scripts/firebase-sync.js` | Firebase authentication, gzipped/chunked whole-database synchronization, sync status surface |
| `scripts/true-storage-core.js` | The one definition of the storage↔source-dump relationship (`window.TrackTrueStorage`): the pair matcher, the pure tag writers, and the parent/child tree |
| `scripts/source-dump-core.js` | The one definition of how a source dump is read and edited (`window.TrackSourceDump`): `pathTo` (the cycle-guarded breadcrumb), `textBlocksOf` / `isLegacyBlock`, `isLeafMM` / `canLinkMM`, `inheritsLinks`, and every writer both Source Dump pages share. Holds NO date code — a new title's `createdAt` is a parameter — which is why its suite runs once rather than swept |
| `scripts/graph-layout.js` | The one radial canvas layout (`window.TrackGraphLayout`): `computeLayerLayout`, `applyRepulsion`, and the cycle guards that keep a parent cycle from blowing the stack on either canvas page |
| `scripts/schedule-paste-core.js` | The one definition of the `::: track-schedule` paste format (`window.TrackSchedulePaste`): `parseScheduleText`, `formatScheduleText`, and the day/time cell readers. Holds NO date code, which is why its suite runs once rather than swept |
| `scripts/doc-table-core.js` | The one definition of a documentation table's shape (`window.TrackDocTable`): `mergeMap`, the pure merge writers, and the `::: track-table` paste format in both directions |
| `scripts/quest-core.js` | The one definition of what a Quest is (`window.TrackQuest`): the membership readers, the pure flag writers, the pruned tree, the starred rollup, and the day-scoped routine tick. Holds NO date code — the day is a parameter — which is why its suite runs once rather than swept |
| `scripts/milestone-core.js` | The one definition of where a milestone stands (`window.TrackMilestone`): milestone membership (owners, blocks), leaf counting, mind-map targets, the status and lateness rule, the drawn span (`drawEnd`), the wording, the `slips` writer, and `unreachedOn` — the to-learn a DAY still owes its milestone, which the Schedule's ● Learn strip pins and Progress → MG lists first — plus the phase a mind map is in and what it is judged by, `stageOf`, `liveSessions` and `targetFor` (a Procedural MM has no SIR, and its target is its level), which is why `sir-ks02.html` loads it too. `progress.html`'s `countProgress`, `isMMTargetMet`, `buildSirDoneMap`, `STAGE_ORDER`, `collectMilestoneOwners` and `collectMilestoneBlocks` are delegates to it. Holds NO date code — "today" is a parameter and day differences are integer arithmetic — which is why its suite runs once rather than swept |
| `scripts/notes-widget.js` | Per-slot floating notes: the Sorted and Journal tabs, the picker, the full-screen side-by-side view (up to four panes) and Send, and the Journal tab's `Journey` button |
| `scripts/notes-core.js` | The one definition of what a note is (`window.TrackNotes`): the total `dateNotes` reader, the delete-on-empty writer, the Date-note tags (`TAGS`, `dateNoteTag`, `dateNoteLocked`, `withDateTag`) and the lock that cleared and Eternal put on a day's text, the Sorted patch writer, `appendSent`, the local-day labels and the calendar pop-up's month grid — and what the Journey book binds (`eternalDays`) and how it heads a day (`journeyDayLabel`). Pure — the widget passes `now` and `today` in |
| `scripts/journey-core.js` | The one definition of how the Journey book is made (`window.TrackJourney`): the title, where a page may end (`breakPoints` — whitespace, Thai word and grapheme boundaries), the cutter, the book's pages and sides, the reader's anchor across a re-cut, which layout fits, the fold of a turning sheet, and the ink each stretch of a day is written in (`inkRuns`, the quill dips). Pure; holds NO date code, which is why its suite runs once rather than swept |
| `scripts/journey-book.js` | The Journey book (`window.TrackJourneyBook`): the full-screen overlay and its two ink filters, cutting pages by measuring real text once the fonts load, drawing each day in its quill dips, the page turn, pointer/key/wheel input and the live refresh. A READER — it writes nothing anywhere |
| `scripts/journey-fonts.js` | GENERATED by `tools/build-journey-fonts.js`, never edited by hand: Journey's typefaces as base64 woff2 with their SIL OFL licences (`window.TrackJourneyFonts`). The committed copy may be the empty placeholder. Loaded by `journey-book.js` on the book's first open, never by a page |
| `tools/build-journey-fonts.js` | Node-only generator for `scripts/journey-fonts.js` from Google Fonts' served subsets, unmodified. Needs the network once, writes nothing unless every download checks out. Not loaded by any page |
| `styles/styles.css` | Shared design tokens, themes, responsive styling, and component states |
| `docs/` | User-facing paste specifications for the Track application |
| `World/` | The Track World game project — concept draft, its reference imagery, and its own `AGENTS.md`, which governs every change inside that directory. Nothing there is part of the Track runtime, and nothing there may write Track data |
| `firestore.rules` | Firestore security rules, versioned for review only; published by hand in the Firebase console |
| `tests/` | The committed suite. `run.js` is the one command; `calendar-core.test.js`, `schema.test.js`, `notes-core.test.js`, `true-storage-core.test.js`, `source-dump-core.test.js`, `graph-layout.test.js`, `doc-table-core.test.js`, `schedule-paste-core.test.js`, `quest-core.test.js`, `milestone-core.test.js`, `viewport.test.js`, `journey-core.test.js` and `cdp-cleanup.test.js` are offline; `browser.test.js` drives real Chrome through `lib/cdp.js`; `lib/fixture.js` builds synthetic slots, including legacy and malformed ones |

Current runtime dependencies are loaded through CDNs:

- React 18 development UMD.
- React DOM 18 development UMD.
- Babel 7.25.6.
- Tailwind browser CDN.
- Firebase 10.12 compatibility scripts.

Do not assume Vite, npm scripts, TypeScript, JSX modules, or CI exists until the repository actually contains them.

There **is** a test suite, and it has no dependencies and no `package.json` — Node's built-in `node:test`, plus a hand-rolled DevTools-protocol driver over Node 22's global `WebSocket`. Keep it that way: adding Playwright, Puppeteer, Jest, or a package manifest to make a test easier is a dependency decision that needs explicit approval (see "Dependencies, Network, and External Systems").

Repository-local scripts and stylesheets are loaded from `scripts/` and `styles/` with a `?v=N` cache-busting query (`styles/styles.css?v=20`, `scripts/schema.js?v=9`, `scripts/calendar-core.js?v=14`, `scripts/firebase-sync.js?v=2`, `scripts/storage-guard.js?v=2`, `scripts/notes-core.js?v=4`, `scripts/notes-widget.js?v=7`, `scripts/journey-core.js?v=2`, `scripts/journey-book.js?v=2`, `scripts/true-storage-core.js?v=3`, `scripts/source-dump-core.js?v=1`, `scripts/graph-layout.js?v=1`, `scripts/doc-table-core.js?v=4`, `scripts/schedule-paste-core.js?v=2`, `scripts/quest-core.js?v=2`, `scripts/milestone-core.js?v=3`, `scripts/theme.js?v=1`, `scripts/viewport.js?v=2`). There is no build step to hash filenames, so this query is the only thing guaranteeing a returning visitor gets a changed asset instead of its cached copy. Bump the integer in every page that loads the file whenever its contents change, and keep the value identical across pages. **Every repository-local asset now carries one**; `theme.js` was the last exception and lost it when the appearance became a joint contract between the script and the stylesheet, where a stale script against fresh CSS is exactly the failure the query exists to prevent. The five iOS home-screen icons (`assets/icons/<page>-180.png?v=1`, one per page) carry one too; iOS caches a touch icon hard, so a re-rendered PNG needs its page's integer bumped. The one asset no page loads is `scripts/journey-fonts.js`: `journey-book.js` loads it, so its integer is `FONTS_V` in that file — a regenerated copy replacing a deployed one bumps `FONTS_V`, and therefore `journey-book.js`'s own `?v=` on the five pages.

The phone layout lives at **`max-width: 720px`**, and `--phone-tabbar-h` is the **one
definition** of the bottom tab bar's height. It is `0px` on `:root` and set only inside
that block, so a rule reserving room for the bar — the three `h-screen-nav` utilities, the
notes widget's inset — reads the var **unconditionally** and is a no-op on a desktop by
*arithmetic*, not by a second copy of the rule inside a media query. Never re-spell 52px,
and never add a desktop/phone pair where reading the var would do.

The **one deliberate exception** is the shell's `padding-bottom`, which stays inside the
media query: `.app-page #root > div` is (1,1,1) and therefore also beats a Tailwind
utility, so an unconditional `padding-bottom: 0px` would strip the bottom padding from a
shell that sets its own — `true-storage.html`'s no-workspace screen is `min-h-screen … p-6`.
Reading a 0px var is only free where nothing else is declaring that property. Three more
rules follow:

- The **720 is a TWIN**: `styles.css` and `scripts/viewport.js` both spell it, because CSS
  cannot read a JS constant and JS cannot read an `@media` rule. `tests/viewport.test.js`
  pins the stylesheet's whole `max-width` set (`[460, 640, 720]`) rather than filtering
  for 720, so a stray 719 beside it fails too and a fourth breakpoint has to be added on
  purpose. Moving a phone rule off 720 without that file is how `isPhone()` starts lying
  to four pages with nothing on screen to say so.
- **`phoneNow()` and `useIsPhone()` are not interchangeable.** `phoneNow()` is for a lazy
  `useState` initializer — a one-shot read at mount. `useIsPhone()` follows the viewport
  live. `progress.html`'s `timelineMode` must use the first: wiring the hook in would look
  identical on screen and then overwrite a WEEK the user chose by hand, on the next
  rotation.
- A pane hidden on a phone is **hidden, not unmounted, wherever a mount-only effect binds
  to a ref.** The Schedule's timeline binds two `useEffect(…, [])` to `containerRef` (the
  scroll-to-08:00 and the non-passive Shift+wheel listener), so unmounting it once leaves
  that listener on a dead node for the rest of the session with no error anywhere — it
  toggles inline `display` instead. `GoalTabsPanel`'s and `MilestonesPanel`'s visually
  identical splits have no such effect and *are* unmounted (Milestones' one `useEffect(…, [])`
  cancels its own rAF, so nothing outlives it). A change that made the three uniform would
  break one of them, and `tests/browser.test.js` asserts the timeline stays in the DOM while
  hidden and that the other two leave it.
- **Reveal-on-touch is gated on `(pointer: coarse)`, NEVER on `isPhone()`, and never on
  `(hover: none)`.** `TrackViewport` owns both queries because they answer different
  questions: one is the screen, the other is the input. An iPad at 820px is not a phone but
  is finger-driven, so a width gate leaves its controls permanently unreachable — the exact
  bug the old blanket rule existed to fix; a laptop with a touchscreen is the mirror case,
  reports `pointer: fine`, and must keep one-click navigation. `documentations.html`'s row
  arm model (`rowTap`) is the current user, via the page-local `touchPrimary()` delegate,
  and `styles.css`'s docs-row block asks the SAME query — two spellings of "a finger" in one
  codebase is how they drift apart.
  **`(hover: none)` is not usable as a gate here, and that is measured, not preference:**
  headless Chrome reports it at every viewport with or without touch emulation, and
  `Emulation.setEmulatedMedia` does not override it. A hover gate is therefore untestable in
  BOTH directions and silently routes every desktop case down the touch path.
- **A reveal rule can have more than one home.** The documentation row cluster was shown by
  TWO rules — one in `@media (hover: none)` and one in `.docs-sidebar-full`, which governs
  the drawer at every width. Moving only the first to the armed state looked implemented and
  changed nothing on screen. When a control's visibility moves behind a new condition, grep
  every rule that sets its `display` before believing the change landed.

A rule in `styles.css` that has to **beat a Tailwind utility on the same element** needs more
than one class in its selector. The Tailwind CDN injects its `<style>` into `<head>` at runtime,
which is *after* every page's `<link rel="stylesheet" href="styles/styles.css">`, so a one-class
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
  trueStoragePos,
  refSchedules,
  dateNotes
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

A `calendarNotes` or `deadlines` item is on the hour grid only through its **blocks**, and its blocks are its `parts` — **one record per ★ Forced pick**, on the day the panel was opened from (the user's rule since 2026-10-21). An item with no parts has **no block**. Until then every item had one automatically; nothing was migrated to take it away, the readers stopped drawing it. A block may carry its own `date`, `time`, `blockDuration` and `done`. The item keeps a **span** — a deadline's run-up ends at its due time, a note's starts at its time or `08:00` — that is never drawn: it is where a block with no `time` or `blockDuration` starts. The item-level `blockOff`, `blockDuration`, `blockTime` and `blockDate` are **legacy**: read, never written, except the `blockOff: false` a pick writes. Ten rules follow:

- **No parts, no block.** Never draw an item's span on its own, and never treat a bare `blockDate`/`blockTime` as a block — a deadline with no parts strands nothing and refuses no edit. `blockDays` is the **one** definition of which days an item's blocks sit on (`TrackCalendar.blockDays`, with the documented twin in `progress.html`); `dlStrandedBlockDays` and both caution pickers' "holds prep" sets read it. The rule it replaced — "an item without parts sits on its own day" — was spelled at four sites, and each had to change the day it stopped being true.
- **A ★ Forced pick writes one part: `{id, createdAt, done: false}`, plus `date` only when it differs from `blockDay(item)`.** No `title` (the block reads as its item and follows a rename), no `time` and no `blockDuration` (it starts where the item's span does). `withForcedBlock` in `progress.html` is the one writer, pure, called inside `patchItem`'s updater with the id minted OUTSIDE it. It is also the **one guard**: `forcedPickRefusal` refuses a malformed day, a pick on a deadline whose due day is not a real day, and a day after the due day, and the row's `pick()` deliberately does not re-check — two doors would let a browser case pass with either one broken. For the same reason a refused row is `aria-disabled`, **never `disabled`**: React drops a click on a button whose `disabled` prop is set, which would make the row a second door the writer's case cannot see past — measured, not assumed: with the writer's refusal deleted, a `disabled` row still passed its case.
- **A deadline picked on a day it does not occupy makes that day a caution day IN THE SAME WRITE**, through `dlWithCautionDays`, the one writer (which also drops `startDate`). The row says so before the click (`forcedPickAddsCaution`, the same question). The chosen days only grow, so nothing can strand, and removing the block later leaves the caution day; a day the user picked this way is a day the user picked.
- **`blockOff: true` still hides every block an item has**, the old `remove from schedule`'s meaning, and nothing writes `true` any more. A pick writes `false` (re-adding never deletes the key, matching `done`: every reader goes through `blockOn`'s `!!`), so the hidden blocks come back beside the new one — the row says how many before the click.
- The block geometry has exactly **one** definition, `blockOn` / `noteBlockStart` / `noteBlockDuration` / `dlBlockDuration` / `noteBlockSpan` / `dlBlockSpan` / `blockDay` / `partDay` / `itemParts` / `partSpan` / `blockDays` / `partIsSub` / `partScheduled` / `drawnParts` / `itemSubtasks` / `partDone` in `calendar-core.js`, with a second copy in `progress.html` for the documented reason that it does not load that file. Never re-spell `d.time - d.blockDuration`, `!item.blockOff` or "a part's day, else the item's" at a call site. Three surfaces render these blocks — the Progress grid, the Home calendar and a Documentations calendar block — and `tests/browser.test.js` asserts each one **separately**, including that an item nobody added draws nothing, because a rule forgotten at one of several surfaces is this repository's recurring bug and a single assertion lets the forgotten one hide behind a passing sibling.
- **Show both, always.** A block never replaces the way an item was already visible: a note keeps its day-strip chip and its Progress point marker whatever its blocks are doing, and a deadline keeps its due-time hairline and its caution `!` marks. Having no block takes nothing away either — those surfaces never depended on one — and `blockOff` must not remove the item.
- The item's own `date` and `time` are **not** block geometry. A part's `date` (else a legacy `blockDate`) says where the block is drawn; the chip, marker, due line and caution `!` marks all stay on `date`. Blocks are therefore collected by `partDay` over the whole array, while the strip and due lists still filter on `date` — that split is the feature.
- A drag or resize writes the part's own `date`/`time`/`blockDuration` and **never** the item's. This is load-bearing for a deadline: it keeps `date` editable only from the form that refuses an orphaned chosen day and stranded prep, so a drag can never slip past either refusal. A deadline's block and every other part must sit on a day the deadline OCCUPIES: one of its chosen caution days, or the due day — set **membership**, not a range; any `day >= dlStart(d)` comparison silently re-admits the gaps the user deliberately left out. The drag ghost SNAPS to the nearest allowed day — never pinned — and **the allowed days ride IN the ghost** (`dlDragDays`, read at drag start from the item as rendered, in both the mouse and the touch path): the pointer effect is mount-only, and its old read of the `deadlines` prop was the first render's list, so a caution day a pick added since snapped the new block onto the due day. An un-pick or a due-day move that would strand a placed block is **REFUSED** with the day named, never moved and never clamped. `dlBlockDayValid` / `dlStrandedBlockDays` are the one definition, and `span` is the proposed `{cautionDates, date}`. A day note has no such restriction.
- A block's `✕` **deletes that part, so it asks first** — the prompt lives in `removePart`, its only handler. Emptying `parts` deletes `parts`; a part's `date`, `time` and `blockDuration` are written only when they differ from what it would inherit. Never write `0`, `''` or `[]`. A block's tick writes that part's `done` and never the deadline's. `blockDuration`, `blockTime` and `blockDate` are validated in `schema.js` as **warnings** because they reach geometry (`height: NaNpx`) and placement (a day that does not exist), unlike `done` and `blockOff` which are safe under `!!`; `parts` is validated **fatally** like a goal's `children`, because it holds records and is traversed. A part needs no `title`.
- **A note or deadline has SUB-TASKS — its child tasks — made by `✂` in ★ Forced (the user's rules since 2026-10-22), and the original is NEVER hidden by them.** A sub-task is a part WITH a `title` (`partIsSub`; the old `＋` composer's titled parts are sub-tasks already on the schedule, so nothing was migrated). `✂` Add writes `{id, title, createdAt, done: false, unscheduled: true}` (`withSubtask`); clicking its row in a day's ★ Forced puts it on THAT day (`withSubtaskOn`), **deleting** `unscheduled` and **always** writing `date` — it sits where it was put and never follows the item's date — and from another day MOVES it: **one record, one date, never on two days** (a doctored copy that adds a second record instead fails the move case). Putting it on a day answers to the pick's rules through the same `forcedPickRefusal` / `forcedPickAddsCaution` — the caution day in the same write — and `withSubtaskOn` is the one guard behind an `aria-disabled` row. `drawnParts` (scheduled parts, nothing hidden for having sub-tasks) and `partDone` (an original's block, once its item has sub-tasks, has **no tick** and is done iff every sub-task is) are the one definitions, with twins in `progress.html`; `blockDays` reads `drawnParts`, so a sub-task off the schedule holds no day and strands nothing. A sub-task block's `✕` UNSCHEDULES it (`unschedulePart`, asking; `date` goes, its own `time`/`blockDuration` stay) and keeps it under its original, as a task block's `×` unschedules a task; its row `×` in ★ Forced DELETES it through `removePart`, whose one prompt says which kind of part it deletes. Both ask. One level: sub-tasks have none of their own. A `parentId` on a few parts — left by a `✂`-on-the-block build the user rejected the same day it shipped, which HID the original — is ignored, so the originals it hid come back.

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

A `refSchedules` item is one **class** of a timetable — a line of a paste, or a block added by hand in the Schedule. It carries `id`, `title`, `time`, `duration`, `createdAt`, optional `docPageId` / `importId` (a pasted class has both, a hand-added one neither), optional `detail`, `skips` and `notes`, and then **exactly one** of `date` (one-off) or `dow` + optional `from`/`until` (weekly, inclusive). Since 2026-10-16 a class is **edited on the Progress Schedule** — the user reversed the old "reference data, never work" rule on purpose. Nine rules follow, and the first three are the load-bearing ones:

- **EXACTLY ONE ARM.** That single rule is what lets one paste format carry both a multi-week term timetable and a one-off day with no mode for the user to choose, which was the whole point of the feature. An entry carrying **both** arms, or **neither**, occupies NO day and is REFUSED rather than resolved by whichever branch runs first — there is no defensible answer to which day such a record belongs to, and inventing one would draw a class on a day the user never wrote down. `schema.js` reports the same shape as a warning. Records are minted in two places — `documentations.html`'s `ScheduleBlock.insert` and `progress.html`'s `refNewBlock` (always a one-off) — and every edit goes through `refWithEdit` / `refMoved`, which keep one arm.
- **The occupancy test has exactly ONE definition**, `TrackCalendar.refOccupies`, and so has the removal test, `TrackCalendar.refSkips` / `refSkipped` — each with the documented twin in `progress.html`, which does not load `calendar-core.js`. Never re-spell `entry.dow === d.getDay()` or read `entry.skips` at a call site. The weekly arm compares the range as STRINGS (total for `YYYY-MM-DD`) and parses at `'T12:00:00'` for the weekday, per this project's standing local-day rule. The fail-first evidence for both is two doctored baselines whose failure sets are **exactly disjoint** — doctor `calendar-core.js` and only HOME and DOCUMENTATIONS fail; doctor `progress.html` and only PROGRESS does — which is the direct proof the twin is needed and that a forgotten copy cannot hide behind a passing sibling. A removal is NOT part of the occupancy rule: a class still occupies a removed day and is simply not drawn there, which is what lets ★ Forced → Timetable offer `＋ add back`.
- **`progress.html` OWNS the key**, through its `_writeP` autosave, exactly as it owns `calendarNotes`; `documentations.html` pastes and deletes **only** through a fresh read-modify-write (`mutateSlotArray`). Every Progress write is one of the pure writers beside `refBlocksFor` — `refMoved`, `refResized`, `refWithEdit`, `refWithSkip` / `refWithoutSkip`, `refWithNote` / `refWithNoteEdit` / `refWithoutNote` — mapped over the CURRENT array, and every one SPREADS the entry, so `docPageId`, `importId`, `createdAt`, `detail` and unknown keys survive. Never rebuild an entry from a field list. A class deleted in Documentations must not come back on Progress's next edit; the `storage` refresh adopting `refSchedules` is what prevents it, and a two-tab browser case pins it.
- **One block is one record** for the dated lectures a timetable mostly holds, so every edit acts on that block alone. A **weekly** entry is ONE class: a drag or an edit changes **every week** (a drag to another column changes `dow`, and the ghost only lands inside `[from, until]`), while a removal is still **per day**. The weekly landing rule rides IN the drag ghost (`refGhostFor`) because the pointer effect is mount-only and a prop read there is stale.
- **`skips` and `notes` are absence-is-default lists, and emptying either DELETES the key** — the `merges` rule, not `cautionDates: []`, because no fallback sits behind them. A one-off's removal belongs to its DAY, so `refWithDate` moves it with the date. Neither is validated in `schema.js`; both are read only through total readers (`refSkips`, `refNotes`). Notes are the shape a task's notes have, live ON the class, and are never written as a day note.
- **Still not tickable.** No reader or writer may give a class `done`. A class is armed, dragged and resized like a task block, but it carries no checkbox; that is a decision, not an omission.
- **The ✕ on a block asks, then removes THAT DAY only** — `refWithSkip`, nothing deleted. The Timetable tab's `remove from schedule` and `＋ add back` do not ask: they write `skips`, delete nothing, and undo each other (`＋ add back` is pinned by an `expectNoDialog` case). **Documentations' ✕ is the PERMANENT delete** and its prompt says so.
- **On Progress classes join the overlap ORDER, appended LAST**, so a real block is in front by default and a double-click brings a class forward. On this page that ordering decides z-index only, never a width. On Home and in Documentations, `buildDaySchedule(...).refBlocks` stays its OWN array, never mixed into `blocks`, so `overlapInfo` never sees one and each surface opts IN to drawing the layer; those two layers stay inert (`pointer-events: none`). A browser case measures a real block with and without a class behind it, and its z-order.
- An **absent** range bound is open in that direction — a term with no end date yet is an ordinary state, not damage — and a **malformed** bound reads the same way, matching `blockDay`'s treatment of a malformed `blockDate`. The alternative (occupy nothing) would make the entry INVISIBLE, and this project does not trade reachability for a tidier rule. Everything else on the item is validated as a **warning**, alongside `blockDate`. Deleting a documentation page does **not** delete the classes it pasted (the day-note rule), so any Timetable block lists orphaned entries in their own section, and lists every **hand-added** class (no `docPageId`) in an *added in the Schedule* section — without those they would be drawn on three hour grids with no way to delete them.

A `refSchedules` item's `detail` is the lecturer, room, department or mode — everything the timetable shows about a class that is **not the topic**. The `title` is the topic ALONE. Four rules follow, and the first two are the load-bearing ones:

- **The paste format's safety property is now UNIFORMITY, not a fixed count.** A paste is all-3-cell or all-4-cell, and a row that disagrees is refused against its line number. That is what still makes a dropped cell *detectable* once a cell is optional, and it is the only reason the fourth column could be added without giving up the guarantee the format exists for. Never relax it to "3 or 4 per row, independently" — a 4-column row that lost its title would then parse with the detail sitting where the topic belongs, which is exactly the plausible-looking wrong schedule this format refuses to build.
- **Absence is the default and `''` is never written.** This is the `time` / `link` rule and deliberately NOT the `cautionDates: []` rule, because no fallback sits behind it. `parseScheduleText` omits the key for a blank cell, and both places a record is minted — `documentations.html`'s `insert` and `progress.html`'s `refNewBlock` — write it only when truthy, as `refWithEdit` deletes it when blanked. A browser case asserts `Object.keys` on a blank-detail entry, and that is the guard for this half. Because absence is legal, **nothing was migrated**: every entry stored before the field existed is already valid.
- `formatScheduleText` emits the fourth column **only when at least one entry carries a detail**. That is what keeps `⧉ copy as text` byte-identical for an import that predates the field; widening unconditionally would round-trip an unchanged paste into a different shape than the one stored.
- **The block body on an hour grid stays title + time.** The detail is reachable from the Timetable list's own column, the class's card in Progress → ★ Forced → Timetable, and the tooltip on all three grids — never inside the block, where a dense day would become a wall of text. The block builders have the usual two copies (`refOn` in `calendar-core.js`, `refBlocksFor` in `progress.html`), and `detail` is `''` rather than `undefined` on both so a call site may concatenate it into a tooltip without printing the word "undefined". `tests/browser.test.js` asserts each of the three grids **separately**, and the fail-first evidence is two doctored baselines whose failure sets are disjoint.

A **goal node** may carry five optional quest keys — `quest` and `star` (booleans), `questLearn` / `starLearn` (lists of mind-map ids inside that node's `toLearn`), and `questOrder` (a number). They are item-level keys inside the existing `goals` list, so they add **no** slot field and **nothing was migrated**: absence is already correct for every stored node. `scripts/quest-core.js` (`window.TrackQuest`) is the one definition; `progress.html` authors them and `index.html` reads them. Eight rules follow, and the first two are the load-bearing ones:

- **The flags TRAVEL with `toLearn`, at four sites.** Three of them move a parent's `toLearn`/`mmTargets`/`milestones` into a new sub-goal and blank the parent's — `addSubGoalAndMigrateTasks`, `nestGoalIntoGoal`, `nestSubGoalIntoSubGoal` — and the fourth, `updateGoalToLearn`, is the ONE writer of `toLearn` and re-scopes the flags to whatever list it is handed. Because `questLearnOf` gates on `toLearn` membership, a flag left behind does not merely dangle: **the quest DISAPPEARS**, as a side effect of an unrelated edit, with no error anywhere. Never spell the transfer by hand — `learnFlagsOf` spreads the flags IN and `withoutLearnFlags` returns a copy with them DELETED, because a spread can add a key but cannot remove one. Three browser cases cover the three sites separately, and their doctored baselines are exactly disjoint singletons: that failure has three independent doors, and one case would let two stay open behind a passing sibling.
- **Ids are of TWO types and both must be accepted.** A goal node's id is a string from `TrackStorage.newId()`; a mind map's id is a **NUMBER** from `sir-ks02.html`'s `nid()` counter, so `toLearn`, `questLearn` and `starLearn` hold numbers in real data. `TrackQuest.isId` accepts both, everywhere. A string-only test drops every linked mind map and the whole feature reads as "no quests" with nothing in `realErrors` — and a string-id fixture cannot see it, which is why the offline suite carries numeric-id cases specifically.
- **The booleans write `true`/`false` and are NEVER deleted; the two lists DELETE when they empty.** Two different rules on purpose. The booleans are read through `!!`, so absent, `false` and `undefined` are one state and there is no third state to protect — the `done` and `blockOff` rule. The lists have no fallback behind them — the `merges` / `colWidths` / `align` rule. A change that made them uniform would break one of them.
- **`isStarred` gates on quest membership**, so un-questing SUPPRESSES the star and deletes nothing, and re-questing restores exactly what the user chose. `withQuest` must never touch `star`, and `withQuestLearn` must never touch `starLearn`. A writer that "tidies" either has destroyed the thing re-questing puts back — the `cautionDates` rule in a second field.
- **`toLearn` stays a flat list of bare ids.** Promoting it to `[{mmId, quest}]` is the same mistake as promoting a table's `rows: [[string]]` to objects, and it would break `updateGoalToLearn`, `expandAnchorToLearn` (which runs on EVERY load), `getMMDescendants`, `buildToLearnTree`, `MMPickerModal` and the `deduplicateToLearn` migration — with no `schemaVersion` to hang a migration on.
- **What cannot be ticked is an ABSENCE, not a guard.** A non-leaf row and a to-learn row carry no checkbox at all: `toggleLeaf` refuses a non-leaf via `isCountableLeaf`, so one there would render, click and do nothing, and MM completion is COMPUTED (`isMMTargetMet`) rather than stored. A context ancestor carries no controls either. Milestone nodes are omitted from Quest entirely and their children promoted one level, matching `renderPickerTreeNode`.
- **`questOrder` is a THIRD absence rule, and not interchangeable with the other two.** It is a number whose absence is meaningful and is the default: no key means "wherever the goal tree puts it". It is written 0..n-1 across a group the user actually dragged, so an unarranged workspace stores none of it, and an unarranged sibling sorts AFTER the arranged ones rather than jumping to the front. It is a plain node key, so unlike `questLearn` it needs no transfer helper — it rides the ordinary `{...n}` spread. **`withQuestOrder` must never touch `children`**: quest order is the Quest tab's own view, and the user chose that dragging a quest is not a structural edit to their goals. A doctored baseline that permutes `children` fails on that assertion alone.
- These keys are deliberately **not** validated in `schema.js`. The booleans are safe under `!!`, and the lists are read only through total readers that cannot throw, so a check would only invent a way to block a whole database over a field nothing traverses — the `parentIds` / `tags` reasoning. An offline guard case asserts a slot carrying all four still normalizes to exactly the canonical fields.

A routine quest's tick is **not slot data**. It lives in `track_quest_routine_ticks`, holding `{slotId, day, ids}`, beside `track_home_cal_hidden` and under the same rules. Three follow:

- **It never writes `routineDates`.** The user's rule: a routine can be ticked in Quest, the tick does not affect the real tick, and it resets at the end of the day. A browser case asserts `track_db` is byte-identical across the interaction.
- **Expiry is STRUCTURAL, not scheduled.** One stored `day` covers the whole set, so a day that is not today reads as empty — no timer, no cleanup job, no midnight edge case. A `slotId` mismatch reads as empty too, so switching workspaces cannot show another slot's ticks.
- **The day is a PARAMETER**, computed by the page with its local-day helper and passed in. That is what keeps `quest-core.js` free of date code and its suite in the unswept list, and a structural case greps the module (comments stripped first) to prove it.

A milestone is **overdue** when its end has passed and its work — the tasks under its blocks, and each `toLearn` mind map's waypoint for it — is not all done. `scripts/milestone-core.js` (`window.TrackMilestone`) is the one definition, and four surfaces draw it: the Milestones tab (row and calendar), the Home and Documentations month tails through `calendar-core.js`, and the Schedule's ⚑ rows and pickers. Seven rules follow, and the first two are the load-bearing ones:

- **One definition, and the six `progress.html` names are DELEGATES.** `countProgress`, `isMMTargetMet`, `buildSirDoneMap`, `STAGE_ORDER`, `collectMilestoneOwners` and `collectMilestoneBlocks` stay in the page only so their call sites do not move. Never re-inline one: Home cannot read `progress.html`, so a page-local copy is how the Milestones tab and the calendar tails would come to disagree about "done" — the deadline-caution shape again. `tests/milestone-core.test.js` pins the module against **verbatim copies** of the pre-extraction functions; the two deliberate differences (a link cycle terminates, a block reached twice counts once) have cases of their own.
- **Iterate `toLearn`, never `Object.entries(mmTargets)`.** Those keys are strings and mind-map ids are NUMBERS, so a key-driven loop compares `'10'` with `10` and silently finds nothing — `computeMMAutoComplete` already does exactly that (NOTES). A waypoint is judged ALONE: `targetMet(mm, waypoint, sirDone)`, the call the MM bar makes.
- **The end day is not late, and an EMPTY milestone never is.** Lateness starts the day after `endDate`; no tasks and no waypoints is `empty`, not overdue, at any date (the user's rule: nothing to chase). Missing, malformed or inverted dates are `undated`. The first two each have browser guards and doctored baselines in both suites; `undated` is pinned offline.
- **"Today" is a PARAMETER, and `opts.today` is opt-in.** The module holds no `Date` (day differences are integer days-from-civil), so its suite is unswept. `TrackCalendar.buildMilestoneLanes` draws a tail only when a caller passes `opts.today` AND the module is loaded; without either its output is byte-identical, and an on-time segment never gains a key. `drawEnd` is the one definition of the drawn span — today while late — and both `calendar-core.js` and the Milestones tab's calendar draw `[startDate, drawEnd]`.
- **Every walker in the module is cycle-guarded.** The "link existing task" picker offers a task's ancestors, so a link cycle is reachable through ordinary use, and Home and Documentations now follow links through this module. A per-path guard where a diamond must still count twice (`countLeaves`), visited-at-enqueue elsewhere.
- **What a day still owes its milestone has ONE definition, `TrackMilestone.unreachedOn(rep, mms, day, today)`**, read by the Schedule's ● Learn strip and Progress → MG — two surfaces of one page, which is exactly how a rule comes to be spelled twice. The milestone a day belongs to is the one whose dates COVER it (the user's rule since 2026-07-18), plus any already overdue; membership is `st.learn.open`, so "reached?" is `targetMet` and nothing re-asks it — a level EQUAL to the waypoint is reached. The **from-today gate lives inside it**: a past day pins nothing on either surface. Never re-spell the covering test, the overdue branch or the gate at a call site. The page splits its records by `procedural`: a Procedural MM is pinned by its MG (toggling `mgSchedule`), anything else as a mind map to study (adding `mmEntries`) — the user's T1/T2 split, so a Procedural MM on a late milestone is no longer pinned as a mind map.
- **`slips` has ONE writer, `TrackMilestone.withSlip`, called only from `updateMilestonePeriod`.** A milestone definition may carry `slips: [{from, to?, on}]`, all local days: absent when there are none, `[]` never written, `to` absent when the dates were cleared. It records only a move that pushes an ALREADY-LATE milestone's end later or clears it — the baseline is the state the edit STARTED from (captured on a date input's focus, else read from the tree before the write) — and it is the net effect of one day's edits from one due day: same `(on, from)` updates `to`, a move back removes the record and the key. It rides every writer that touches a definition by spread or move, and goes only with the definition itself. Not validated in `schema.js`; `slipsOf` is the total reader.
- **Milestone date inputs commit only a COMPLETE day inside `[MILESTONE_CAL_START, MILESTONE_CAL_END]`, never `''`** (`MilestoneDateInput`). Chrome's year segment passes through `0002`, `0020` and `0202`; committing those collapsed the period on every keystroke and would now write slips no UI can delete. Emptying a field by keyboard is therefore not a way to clear dates — the confirm-gated `clear` button is, and its message names the slip when the milestone is late.

**A Procedural mind map (stored type `'2'`) has no SIR** (docs/CONCEPTS.md). `TrackMilestone.stageOf`, `liveSessions` and `targetFor` are the one definition, and four pages read them: `sir-ks02.html`, `progress.html`, and `index.html` / `documentations.html` through `calendar-core.js`. Seven rules follow, and the first two are the load-bearing ones:

- **DRAW a phase through `stageOf`, never from `mm.ksStage`.** A Procedural MM stored in SIR or FINISHED reads as S4; only writers read the stored value. `sir-ks02.html` and `progress.html` each hold a one-line `stageOf` delegate. A raw `ksStage` read at one surface is the deadline-caution failure shape again.
- **Filter what is DRAWN, never the `sessions` STATE.** `liveSessions` feeds KS02's `sessionsByDate` / `sirSessionsMap` memos and Progress's `sessions` prop; KS02's autosave writes the raw `sessions` state back, so filtering it there would delete the very sessions switching back to Declarative must restore. Progress never writes `sessions` at all, which is why it can filter at its root. The Schedule's ● Learn strip reads sessions FRESH (`_readSessions()`) for its SIR DUE group, so it calls `liveSessions` itself — the `◎` picker it replaced did not, and listed a Procedural MM's hidden session as due.
- **Nothing stored changes on read.** Switching a Procedural MM back to Declarative restores SIR and every session; the type switch rewrites no `ksStage`.
- **Every move out of SIR that deletes sessions asks first — Procedural or Declarative.** `saveLinSession` moving an MM out of a STORED SIR/FINISHED state deletes its sessions (leaving SIR always has), so it `window.confirm`s before any write and returns `false` on Cancel; the writer decides deletion by the STORED stage (`fromStage`), not by the option's `oldValue`, which is the phase the user saw. `endingSirSessions(mm, newStage)` is the prompt's copy of that same condition — keep the two identical, or the prompt and the delete disagree. A Procedural MM gets the "hidden sessions" wording, a Declarative one a count with how many are done. A move with no sessions to delete does not ask.
- **Every SIR entry point refuses a Procedural MM** — the `+LIN` option, `saveLinSession` (at the writer too), `duplicateMM` and `addMM`.
- **A Procedural MM's target is its level alone, read through `TrackMilestone.targetFor`** — the phase stripped from the target and every waypoint, and a waypoint left with no level dropped, so a phase-only target is NO target rather than a met one. `targetMet` and `statusOf` apply it; `progress.html` has eight "does this MM have a target?" readers and each calls its `targetOf` delegate, with a browser case and a doctored baseline per site. **Never hand `targetOf`'s result to a writer**: `setTarget`, `addMilestoneEntry`, `updateMilestoneEntry` and `removeMilestoneEntry` re-read the raw `mmTargets`, which is what keeps a stored phase target, unread, for the day the MM is switched back.
- **A Kolb ARRIVING on a Procedural MM resets it to S1, through `kolbResetPlan` / `applyKolbReset` and nowhere else.** It arrives two ways: `saveKolb` (SAVE and the timer) and the KOLB tab's edit `onSave` when the Kolb's `mmId` changes to a different MM, from none included. Both call the plan BEFORE any write and return `false` on Cancel; the edit view keeps itself marked unsaved on `false`. The reset logs a `kolbReset` LIN change (`oldValue` the phase SHOWN, plus `kolbId`) that `computeLinActiveDays` must keep excluding, exactly like `stageRevert` — a new LIN change type is counted toward the streak unless it is excluded there. `duplicateKolb`, and an edit that leaves the Kolb on its MM, must not reset: both were the user's decisions.

`dateNotes` is a **map** from a local `YYYY-MM-DD` day to `{content, createdAt, updatedAt}` — one draft per day, owned by `notes-widget.js` alone, with its rules in `notes-core.js`. The user sees it as the **Journal**; its tab was "Date" until 2026-10-08, renamed so it is never mistaken for a calendar day note (`calendarNotes`). Only the visible word changed: the key, the `DATE` constant and the `data-nw-tab="date"` hooks keep theirs, and "Date note" below means a Journal day. Four rules follow, and the first two are the load-bearing ones:

- **Absence is an empty day, and emptying DELETES the key.** Never store `''`: no fallback sits behind it, so this is the `time` / `link` rule and deliberately not `cautionDates: []`. Opening the Journal tab or a day writes nothing. `withDateNote` is the one writer; it spreads the record (an unknown key survives) and returns its input **unchanged** when nothing would change, which is how the widget skips a no-op write.
- **A save lands in the note AND the slot it was opened on, and lands before the next view reads.** Each editor's saver captures `{kind, key, slotId}`; `render()` flushes every saver it is about to discard. These are two separate rules with separate doctored baselines — the capture is what keeps a closing pane out of the note still active in the panel, the flush is what keeps a note reopened within 300ms from showing stale text and then saving it over the new. Reading `state` at fire time was the original bug and cost text in three ways.
- **The reader is total and listing never deletes.** `dateNoteText` accepts any value (a bare string reads as content), and `datedDays` SKIPS a key that is not a real day without removing it.
- A Sorted note deleted in another tab is **never recreated** by a pending save: `withSortedPatch` reports `found: false` and the pane says so. A hidden panel keeps no DOM — stale picker rows under `display: none` stayed live and a selector-driven case clicked one.

A written day's record may carry `tag`: `cleared` or `eternal`. Red **`unclear` is the default and is an ABSENCE** — the user asked for every note, including every one written before tags existed, to be red until tagged otherwise, and absence is what delivers that with no migration. Five rules follow, and the first three are the load-bearing ones:

- **`unclear` is never stored.** `withDateTag` deletes the key when it is chosen — the `head: 1` rule, one spelling of the default. A writer that stored it would also make "is this day tagged?" a question with two answers. Every reader goes through `dateNoteTag`, whose test is an **own-property** lookup (`isTag`), never `TAG_BY_ID[v]` — truthiness would admit `constructor`.
- **A tag belongs to WRITTEN text.** An unwritten day has no tag and no colour (the user's rule: nothing written stays the default grey), so `withDateTag` refuses it, and blank text deletes the day exactly as before, tag included. The corollary is load-bearing: `persist` applies **content before tag** in its one write, or a tag pressed within the 300ms debounce of a day's first words meets an unwritten day and is silently lost. A doctored baseline that swaps the order fails exactly that case.
- **`cleared` and `eternal` LOCK the text, and the lock lives in the WRITER.** The user's rule: a green or purple day is read, copied, sent from and opened beside, never edited or cleared, until it is made unclear again. `TAGS[i].locked` says which tags lock, and `dateNoteLocked` is the one test; `withDateNote` refuses any change to a locked day's text, emptying included, by handing back its input. A readOnly box alone would not be the rule: an editor open in a second tab stays typeable until that tab hears of the lock, so `persist` checks the lock against its fresh read and returns `'locked'`, never folding the refusal into `'unchanged'`, and the editor freezes and keeps the refused words on screen. Three more rules hang off it. The box is `readOnly`, **never `disabled`**, because disabled also stops selection, which is the copying the user asked to keep. A locked pane is a Send **source** but never a target (`sendTargets`). The `🗑` guard reads the lock **fresh** before it prompts, as a no-op guard. The two refusals are separate doors with separate doctored baselines: with the core refusal reversed the widget still holds because `persist` checks first, so only the offline case sees it, and with `persist`'s check reversed the data stays safe but the race case never hears `'locked'`.
- The red / green / orchid pairing is spelled **once**, in `styles.css`: `--color-tag-<id>` per appearance, and `.nw-tag-<id>` setting `--nw-tag`, which every tag surface paints from. `notes-core.js` holds no colour. A browser case measures all three at 4.5:1, as text on every surface and under surface text as a fill.
- The calendar pop-up has a lifecycle of its own and **`closeTransient()` must not close it**: it opens from inside the side-by-side pick overlay that `closeTransient()` exists to close. Its root state class is `nw-cal-open` on `<html>`, and no other rule may use that class name — the opener button once shared it, and `.nw-cal-open`'s dashed border and margins landed on `<html>` itself, reflowing every page behind the pop-up with no error anywhere.

The **Journey book** (`journey-book.js`, the user's 2026-10-22 request) binds every Eternal Journal day into a full-screen, read-only book opened from the Journal tab. Nine rules follow, and the first two are the load-bearing ones:

- **It is a READER: it writes nothing — not `track_db`, not a key of its own.** It reads through `TrackStorage.loadDB` and opens on its title page every time, so there is no position to store. A remembered page would be a per-device view key like `track_home_cal_hidden`, never slot data, and is a decision for the user, not a fix. A browser case asserts `track_db` byte-identical AND the `localStorage` key set unchanged across open, turns and close; a doctored write and a doctored remembered page each fail it, at different assertions.
- **What it binds and how it heads a day each have ONE definition, in `notes-core.js`**: `TrackNotes.eternalDays` (written real days that SHOW Eternal, read through `dateNoteTag`, oldest first) and `journeyDayLabel` (`Tuesday 20/10/2026`, the weekday from components at noon, swept). Never test `tag === 'eternal'` or spell a weekday at a call site.
- **Every day starts a new page BY CONSTRUCTION**: `TrackJourney.buildPages` cuts each day on its own. Never cut the days as one flow.
- **A page ends only at a break point** — where a whitespace run starts (never at a no-break space), or a Thai word boundary from `Intl.Segmenter('th')` — and a run longer than a page falls back to grapheme clusters, so no page starts with a vowel or tone mark torn from its consonant. Never cut at a code unit. Character classes in `journey-core.js` are numeric code points, deliberately: see Testing Lessons.
- **Pages are cut by measuring real text, after the fonts load, and cut again on any change of page size**, keeping the reader on the same `(day, offset)`. The cut **waits until the measuring page is laid out at the size it means** (`laidOut`, a frame at a time, bounded), with turning held meanwhile: through an emulated desktop-to-phone switch Chrome reported the old width for several frames, and a page cut on it overflowed the new one by 364px. A browser case pins it, with a doctored baseline that skips the wait.
- **One page or two is a FIT test, not a phone test** (`TrackJourney.chooseLayout`): two pages of at least 300px that show as much paper as one. It is not a third spelling of the 720 breakpoint — `index.html` does not even load `viewport.js` — and no Journey rule in `styles.css` asks the viewport's width, so `[460, 640, 720]` stays the stylesheet's whole set. The corner peel is gated per event on `pointerType === 'mouse'`, not on a media query.
- **Its fonts are `styles.css`'s one font exception**: embedded in the generated `scripts/journey-fonts.js` (written by `tools/build-journey-fonts.js` from Google Fonts' unmodified subsets, with every OFL licence in its header), registered with `FontFace` from bytes — a `@font-face` file URL is CORS-blocked from disk in Chrome — loaded on the book's first open, and named only inside `#nw-journey`. The committed copy may be the empty placeholder, and everything must work with it. The book is theme-invariant (`--jr-*` tokens on `#nw-journey`, its own gold focus ring). Its overlay is z-index 9002, under the banners (9998), and its root state class `nw-journey-open` is used by nothing else — the `nw-cal-open` lesson.
- **The ink is paint, never layout** (the user's 2026-10-24 ask: lettering inked into the paper, not "solid" or "perfect"). Two SVG filters live in the overlay — `#jr-ink` on the lettering, `#jr-ink-line` on the drawn lines — because a CSS filter can name only an element of its own document: neither can move into `styles.css` or a data URI. A faint or translucent line takes `#jr-ink-line`, never `#jr-ink`, whose alpha cut breaks such a stroke into dashes (it did, on the title page's frame). The quill dips are spans that change `color` alone, which is what lets the measuring page, holding no spans, still cut true. `TrackJourney.inkRuns` is their one definition: keyed by the DAY, never the page, and beginning a stretch only at a break point. A copy keyed by the page fails the re-cut case, and one cut at fixed lengths fails the Thai case.
- **A turning sheet's shades are composited** (`will-change: transform` on `.jr-shade`). Painted with the pages, every frame of a turn repainted the page beneath — paper, inset shadows, ink filters — and a drag on this laptop's GPU ran at 20 fps, before the ink as after it, against 60 with the line. The software-rendered test Chrome shows no difference (see Testing Lessons), so a browser case asserts the property itself.

A `trueStorages` item is a **storage**, owned by `true-storage.html`, and it may carry `tags` — each one naming a **pair**: a source-dump leaf (`dumpId`) and one MM linked inside it (`mmId`). Four rules follow, and the first is the load-bearing one:

- The comparison that decides which storages belong to a pair has exactly **one** definition, `TrackTrueStorage.storagesForLink` in `true-storage-core.js`, and the tag record's shape has exactly one, `withTag`. `sir-ks02.html` draws an mmLink's content at **four** sites — the source-dump leaf card, the S&C tab for a leaf MM, the S&C tab for a non-leaf MM, and `DescendantSCNode` — and every one of them renders the shared `StorageTags` component through the single `renderStorageTags` helper. Never spell `t.dumpId === … && t.mmId === …` at a call site. This rule is written from a shipped bug in a different feature with the identical shape: the deadline caution predicate was spelled out at three sites, one dropped half of it, and the timeline mismarked every due day until it was found. `tests/browser.test.js` therefore asserts **negatively** at each surface — a chip must be absent under the other MM in the same dump, and absent under the same MM in another dump.
- `trueStorages` and `trueStoragePos` are owned by `true-storage.html` and must never join `sir-ks02.html`'s `_writeSlotKeys` autosave patch, which is built from that page's React snapshot. KS02 may add or remove a tag, and only through `_mutateSlotKey` — a fresh read-modify-write of that one key. `true-storage.html` is the mirror image: `sourceDumps` is KS02's, and True Storage's SOURCE DUMP tab writes it **only** through `_mutateSourceDumps` — a fresh read-modify-write of that one key, handed the **raw stored** list — and never through its autosave or from its React `dumps` (which is filtered for rendering, so writing it back would delete what the filter hides). It reads `mms` and never writes it.
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
  `true-storage-core.js` `buildTree`, `source-dump-core.js` `pathTo` and `withoutEntry`,
  `sir-ks02.html` `getAncestors`, `getDescendants` and `SrchView.buildTree`, and in
  `progress.html` `buildToLearnTree` and `buildMMTree` (mind-map parents — both also draw a
  rootless cycle from its first member, so nothing in it vanishes).
- **Goal-tree LINKS are the same hazard in a second graph, and are guarded AND prevented.** A
  link (`isLink`, `linkedTaskId`) can lead back up the tree. Every walker that follows one carries
  a per-path guard — `getLeaves`, `isComplete`, `GoalProgressViz`'s `collectLeaves`,
  `GoalProgressPanel`'s `collectUniqueLeaves`, `TrackMilestone.countLeaves` — and the two
  recursive renders draw a link to a node already on their branch as `LinkLoopRow` instead of
  following it: `GoalNode` through its `ancestry` prop at all three link-child sites, and
  `renderMilestoneTask` through its `path`. A new walker or render site inherits that duty.
  `linkWouldLoop` is the **one** loop test: both pickers filter through it (their `parentId`
  prop) and both writers (`addLinkedTask`, `addLinkedSubGoal`) refuse through it. Prevention is
  not a substitute for the guards — a loop can already be stored or arrive through sync.
- The radial canvas layout has exactly **one** definition, `graph-layout.js`, loaded by
  `sir-ks02.html` and `true-storage.html` as a one-line delegate each. It was ~120 duplicated lines
  per page, which meant the cycle guard above had to be written twice — the same duplication shape
  that cost this project the deadline caution predicate. Do not re-inline it, and do not add a
  second copy for a third canvas.
- Source dumps are a **different** graph: `parentId` is singular, so a dump inside a cycle has its
  one parent inside that cycle and is nobody's descendant. Downward walks cannot reach one; only
  the upward breadcrumb walk can, because it starts wherever it is asked to. That walk is
  `TrackSourceDump.pathTo` and it has one definition — it used to be spelled twice, guarded at one
  site and unguarded 300 lines away at the other; KS02's `dumpPathTo` is now a delegate to it.
- `parentIds` and `tags` are deliberately **not** validated in `schema.js` beyond the object-item check every list field gets. `mms` carries the identical `parentIds` exposure and is not validated either, so gating one and not the other would invent an inconsistent rule. `true-storage-core.js` pays for that instead: every nested list is read through a helper that cannot throw, and `buildTree` terminates on a parent cycle.

The **Source Dump page exists twice**: `SourceDumpView` (with `TransferPicker` and `StorageTags`) in `sir-ks02.html`, under KS03, and its documented twin in `true-storage.html`, the SOURCE DUMP tab. Both edit the same `sourceDumps`. Five rules follow, and the first two are the load-bearing ones:

- **Every source-dump writer has ONE definition, in `source-dump-core.js`.** Both pages' handlers are one-line delegates that only mint ids: KS02 passes `nid()` and feeds its autosave; True Storage passes `TrackStorage.newId()` strings and goes through `_mutateSourceDumps`. Never spell a `sourceDumps` transform at a call site — two spellings of one edit is how the same click would come to store two different things. The writers return their input **unchanged** when nothing changes, which is what lets the RMW skip the write and lets React bail out of an autosave.
- **The UI is a TWIN, and a change to one copy is a change to both.** It is a copy rather than a shared file because the pages have no module system and the app is supported opened from disk, where a separately loaded JSX file cannot be fetched. The tripwire is the browser case `PARITY: the SOURCE DUMP copy draws exactly the controls KS02 draws`, which collects every control both pages draw for one seed and fails on any difference. The twin's header comment lists its only three intended differences — the MM name is a link into KS02 (`?mm=`, its S&C tab), a storage chip opens the storage in place, and tagging acts on True Storage's own state — and a fourth must be added there on purpose, not discovered by the parity case.
- **`sourceDumps` holds ids of both types.** A record minted on True Storage carries a string; KS02's carry `nid()` numbers. Every reader compares stored values with `===` and a query string with `String()`; nothing may coerce a dump, section, block or citation id with `Number()`, `parseInt` or a DOM dataset. The one numeric reader is `repairTransferredParentSCDumps`, whose `Number.isFinite` check deliberately skips string ids — correct, because its heuristic is about ids from KS02's own counter.
- `TrackSourceDump.withEntry` **refuses** a parent id that is not in the list it is handed. A parent deleted in another tab would otherwise get a child whose `parentId` names nothing — reachable from no root, so stored, synced and unreachable. It also empties only the FIRST record with the parent id, so a duplicated id cannot lose the other record's sections.
- KS02's `?mm=<id>` (with no `?dump=`) opens that MM on its S&C tab; with `?dump=` present, `mm` stays the dump card's ring. The two effects never compete for one URL, and a browser case pins the precedence.

A storage's `link` is at most **one**, and clearing it **deletes the key** rather than storing `''` — the same absence-is-meaningful rule as a day note's `time`. A storage that never had a link and one whose link was cleared must be the same state.

Colour in the React pages splits in two, and the split is the whole rule. **DATA** —
`PALETTE`, `SA_COLORS`, `STAGE_COLORS_SIR`, `STAGE_COLORS_SCHED`, `STAGE_RING`,
`FILL_COLORS`, `REF_COLOR`, the Eisenhower quadrant table, and every stored `mm.color` /
`action.color` / `item.chipColor` — is categorical or user-chosen and must stay
**theme-invariant**. **CHROME** is everything else, and in `progress.html` it resolves from
the five `--color-accent*` tokens through the single `ACCENT` map declared beside `PALETTE`.
Five rules follow, and the first two are the load-bearing ones:

- **A token's Grit value IS what `styles.css` remaps the matching Tailwind class to**, and the
  Grit utility rules point *at the tokens* rather than repeating a hex — one definition per
  role and appearance. Without that, a `text-emerald-400` label and the `#10b981` bar beside it
  are two different greens under Grit, which is the defect this work existed to remove. A
  browser case asserts the token equals its class sibling for all five roles.
- **`ACCENT` holds `var()` strings and never a hex, and both of its failure modes are
  SILENT** — nothing reaches `realErrors`, so only a test can catch them. `var()` in an SVG
  *presentation attribute* is dropped by Chrome and the paint falls back to `none`: the arc
  simply vanishes. Pass colour to SVG through `style={{stroke}}` / `style={{fill}}`, never
  `stroke=` / `fill=`. And `'var(--x)' + '22'` is an invalid declaration, silently
  transparent — which is why the `mm.color || '#6366f1'`-style fallbacks stay **literal**:
  their results feed `color + '22'` concatenations downstream.
- The two appearances are **not** symmetrical, and Night is not merely "unchanged". Night kept
  the emerald, amber and cyan the JSX always used because each already cleared 4.5:1 there;
  indigo (`#6366f1`, 3.43:1) and violet (`#8b5cf6`, 3.62:1) did not, and moved one Tailwind
  shade lighter to the values their class siblings already render. Accent contrast is asserted
  in **both** appearances now, computed from the live tokens.
- **Neutral chrome reuses existing tokens** rather than gaining accent ones: a ring track is
  `--color-surface-strong`, an empty pip border `--color-border`, a muted value
  `--color-text-muted`, on-surface text `--color-text`. Judge these by whether they stay
  PERCEPTIBLE, not by 4.5:1 — a track that clears a text bar is not a track. Measured against
  the surface they sit on, the Grit ring track went **13.09:1 → 1.27:1** (it was a near-black
  ring drawn on a pale page — not a subtle track but a black donut) while Night moved
  1.17 → 1.34, i.e. slightly *more* visible; the empty pip border went 9.23 → 1.73 on Grit and
  1.66 → 1.73 on Night. The reading that actually matters for a donut is the arc against its
  own track: **6.46:1 Grit, 4.27:1 Night**.
- A goal's ring, bar and tab dot are `PALETTE[activeIdx]` and are **supposed** to be indigo for
  the first goal. Never write a sweeping "nothing in this panel computes to indigo" assertion —
  `PALETTE[0]` is `#6366f1`. Assert `[data-accent]`-hooked elements only.

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

`track_home_cal_hidden` holds the Home calendar legend's filter, as a JSON array of the
categories switched **OFF**. It is owned by `index.html` alone and read fresh on every
`renderCalendar()`. Four rules follow, and the first two are the load-bearing ones:

- It stores the switched-**OFF** set, per the contract in `calendar-core.js`'s `FILTERS`
  comment, so absence and `[]` are the same state and a category added to `CATS` later is
  on by default everywhere. **Never invert it to a shown set** — that would make every new
  category invisible to every existing user, silently.
- It is **clamped on read** to the keys the legend actually renders. That clamp is what
  makes an unrecoverable state impossible: every key that can hide something has a visible
  control that turns it back on. Drop it and a stray or hand-edited `"task"` reaches
  `buildDaySchedule` and hides the Home day preview's goal tasks with nothing on screen to
  undo it. Clamping on read also means a sixth legend row added later still honours what is
  already stored.
- Read it **fresh in `renderCalendar()`**, never into a module cache. The cross-tab listener
  carries no payload and must not trust `e.newValue` — the same rule `track_theme` follows,
  and the reason a cache would need a second place to be kept in step.
- It is **not slot data**: not in `SLOT_FIELDS`, not exported, not imported, not synced.
  `firebase-sync.js`'s `setItem` patch acts only on `track_db`, so writing it arms no upload
  and marks nothing pending — do not "fix" that by routing it through `TrackStorage`. Both
  ends are total on purpose (`JSON.parse` does not throw on `'null'` or `'42'`, and `getItem`
  throws outright where site data is disabled): a view preference must never be able to
  break the calendar.

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
notes-core.js
notes-widget.js
journey-book.js
true-storage-core.js
source-dump-core.js
graph-layout.js
doc-table-core.js
schedule-paste-core.js
quest-core.js
milestone-core.js
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
form — stay one click. So do five deliberate exclusions, each pinned by a browser
case: the four detach `⊗` chips, the two MG schedule `✓` toggle-offs
(`progress.html`: ● Learn's and the MG tab's), the emoji icon `Clear` (`documentations.html`), the Quest
tab's un-quest `✕` and un-star `★` (`progress.html`) — those two write `false`,
delete nothing, leave the star dormant, and are undone by pressing the same
control, so they belong beside merge/unmerge and a line move rather than under
this rule — and the Date-note tag buttons (`notes-widget.js`), a choice between
three that deletes no text: choosing `unclear` deletes the `tag` key, but pressing
the previous tag restores it exactly. Locking a day with `cleared` or `Eternal` is
covered by the same exclusion: it freezes the text and deletes nothing, and
`unclear` unfreezes it. A "clear all quests" button would NOT be
exempt. Do not "make it uniform" without re-deciding those on purpose.

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
node --check scripts/theme.js
node --check scripts/schema.js
node --check scripts/storage-guard.js
node --check scripts/calendar-core.js
node --check scripts/firebase-sync.js
node --check scripts/notes-core.js
node --check scripts/notes-widget.js
node --check scripts/true-storage-core.js
node --check scripts/source-dump-core.js
node --check scripts/graph-layout.js
node --check scripts/doc-table-core.js
node --check scripts/schedule-paste-core.js
node --check scripts/quest-core.js
node --check scripts/milestone-core.js
node --check scripts/viewport.js
node --check scripts/journey-core.js
node --check scripts/journey-book.js
node --check scripts/journey-fonts.js
```

Then run the committed suite — it is the only automated check that sees the inline JSX, because it executes it:

```bash
node tests/run.js
```

It runs `tests/calendar-core.test.js`, `tests/schema.test.js` and `tests/notes-core.test.js` under five timezones (UTC+14 through UTC-11), then `tests/true-storage-core.test.js`, `tests/source-dump-core.test.js`, `tests/graph-layout.test.js`, `tests/doc-table-core.test.js`, `tests/schedule-paste-core.test.js`, `tests/quest-core.test.js`, `tests/milestone-core.test.js`, `tests/viewport.test.js`, `tests/journey-core.test.js` and `tests/cdp-cleanup.test.js` once each (no date code in any of them), then `tests/browser.test.js` in headless Chrome. Rules for working with it:

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

The evidence record moved to [`docs/VERIFICATION-LOG.md`](docs/VERIFICATION-LOG.md) on
2026-09-12 — 32 dated entries, verbatim, nothing deleted. It had grown to 174KB inside a
file that is loaded into every agent session, including sessions that never touch the code
it describes. **Read it when you need it**: to audit what was verified and when, to pick up
work in an area whose entry records a defect or a known gap, or to check whether something
is covered by a test or only by code reading. A new entry is appended there, not here.

What a passing run looks like, as of 2026-10-25, with the "Sub-tasks in ★ Forced", "Journey",
"Journey: the lettering embedded, and the writing inked" and "A tap on a control inside a
Schedule block" entries in the repository —
`node tests/run.js`, **26 suites**: `calendar-core` (126), `schema` (68) and `notes-core` (37)
swept under five timezones (UTC, UTC+14, UTC-11, America/Los_Angeles, Asia/Kathmandu) with
identical results, then `true-storage-core` (24), `source-dump-core` (33), `graph-layout` (21),
`doc-table-core` (103), `schedule-paste-core` (35), `quest-core` (54), `milestone-core` (63),
`viewport` (10), `journey-core` (39) and `cdp-cleanup` (13) once each — they hold no date code —
then **448 browser subtests** in headless Chrome. At load ~1.5–3 the whole run took 21–27
minutes, 29.5–30 at load ~2–4.5, 36 at load ~5.5–6.5, 39 at load ~3.3–4 with 417, 35 with 424,
37 with 428 at load ~1.3, 38 with 442 at load ~3.2, 39 with 443 at load ~1.7–3, and 37 with 448
at load ~1–1.8. Treat that range as a load measurement, not a property of the suite.

Still unverified, across everything: real touch hardware, the live Firebase project, real
multi-device behaviour, and print output. Those gaps are permanent features of this
environment, not a backlog.

## Testing Lessons

These are the durable rules the verification log taught, separated from the incidents that
taught them. They are here rather than in the log because they apply to the next change, not
to a past one. Each cost this project real time at least once.

### Fail-first evidence

- A bug fix in a covered area adds or extends a case, and **the new case must be seen
  failing first**. `TRACK_TEST_ROOT=<dir>` serves a scratch directory, so you can symlink the
  repository plus the one pre-fix file and watch it fail.
- **"The control is absent" is weak evidence.** If every new case dies on the same `waitFor`
  for a selector that does not exist yet, they are blocked on a missing test hook, not
  proving the behaviour each one names. Land the **hooks alone** as their own step, run the
  suite green, and only then doctor a rule.
- A doctored baseline is **one file with one rule reversed**, in a scratch tree. **Never
  place a doctored copy in the repository.**
- Aim for failure sets that are **disjoint**, or at least where neither contains the other.
  That is the proof each per-surface case is load-bearing and that a forgotten copy cannot
  hide behind a passing sibling. Where a surface genuinely has no twin, say so rather than
  claiming a disjointness the design cannot produce.
- **Copy `tests/` for real; never symlink it.** `require` and `__dirname` resolve through the
  realpath and quietly load the repository's own module. `--preserve-symlinks` does not fix
  it. This has cost a run a false pass.
- Make the harness **print the root it serves** and **refuse a tree byte-identical to the
  repository**. "All passed" looks the same whether the bug was absent or never loaded.
- **A baseline that fails everything is a broken harness until proven otherwise** — a real
  regression fails a subset.
- **Read which failures are load-bearing before counting them.** A suite going 15-red to
  all-green is not 15 pieces of evidence; most of it is what a new export looks like. And a
  **guard** case passes on both sides *by design* — that is its job, not a weak result.
- **When a refusal has grown a second path, reversing only the first proves nothing** — and
  it reads as all-green, indistinguishable from the case being wrong.

### Reading a result

- **Read the failure message, never the pass/fail.** A case that dies on its own `waitFor`
  says the control is unreachable; it says nothing about the claim the case is named for. A
  case that fails for the wrong reason is worth as little as one that passes for the wrong
  reason, and only the message tells them apart.
- **Never wait for the right answer to appear.** Wait for the write to *land*, then assert —
  or a wrong value times out instead of reporting itself.
- **A case asserting N claims is fail-first-proven for exactly the one that fired.** Put the
  assertion the case is named for first, or run it twice.
- **When the symptom under test is a dead render**, wait on the thing that renders *before*
  it, or the evidence is a timeout that reads like a missing selector.
- **Check the plan count, never the summary line.** `node --test --test-name-pattern` runs
  nothing unless the pattern also matches the parent test, reporting `1..0` and `# pass 1`.
  It cannot narrow `tests/browser.test.js` at all — one parent, ~250 children, so it runs all
  or nothing. Narrowing needs a task-owned preload that wraps the `TestContext` in a **Proxy
  binding every method to the real context**; `Object.create(t)` throws on its private
  fields, after the browser launches and before the after-hook registers, which leaks a node
  process on a live CDP connection.
- **A case that fails before its `page.close()` leaves its tab open, and an open tab is a live
  writer.** A KS02 tab adopts every later `storage` event and its autosave writes its own
  filtered `sourceDumps` straight back, so one network blip in one case has failed a later,
  unrelated case on a plausible-looking value. Read the FIRST failure's `realErrors` before
  believing the ones after it. A Progress tab does the same to `refSchedules`: under a doctored
  refresh one leaked tab wrote its stale timetable into each later case's fresh seed and turned
  one real failure into four. A two-tab case closes BOTH tabs in `finally`.
- **A trailing `grep` for failures makes a passing run exit 1** when it matches nothing.
  Check the thing itself, not the summary you were handed — `nohup … &` likewise reports exit
  0 the moment the wrapper shell exits, while the suite is still running.

### What a green suite does not prove

- **A green suite means the cases you wrote pass, not that the feature is right.** A second
  read of the code against the file's existing helpers is a different instrument, and it has
  found real bugs — a duplicated local-day helper and a midnight rollover — after all suites
  were green.
- **Check fixture id types against the code that mints them.** Goal ids are strings from
  `TrackStorage.newId()`; mind-map ids are **numbers** from `nid()`. A convenient fixture can
  make an entire bug class invisible.
- **A layout belief that degrades silently to the current behaviour cannot be confirmed by
  the page looking unchanged.** Assert the number, and measure before choosing the mechanism.
- **"No change here" is a measurement, not a default.**
- **A run against code you have since edited is not a run**, however small the edit. `md5sum`
  the tree before a long run and check it after; check `git log --oneline -1` at both ends.
  On this machine the tree can change while a run is in flight because another session
  committed.

### Isolating a cause

- **Build the control that differs in exactly ONE variable before believing either verdict.**
  A reproducible failure is not proof of causation and a single green control is not proof of
  innocence. A control that differs in two ways — module version *and* isolation, say —
  isolates neither.
- **Strip comments before grepping source for a construct you also write prose about**, and
  scope the scan to the code you actually control. This has produced two false positives.

### Authoring a case

- **A guard-clause test must seed the state the guard guards against**, or it passes on both
  sides and proves nothing.
- **Assert the thing that actually distinguishes the two layouts.** Ids, times and heights
  were all correct on the wrong day until `data-block-day` was added; four buttons in one
  container is true of a row and a 2×2 block, and only grouping by `top` tells them apart.
- **New UI that reuses a generic class or a tooltip prefix silently breaks existing case
  selectors.** Check both before adding a surface to a page the suite already reads.
- **A test helper that finds an element by walking the DOM breaks when the product moves it**
  — and can produce a false pass rather than a failure. Add a `data-` hook, landed as its
  own step.
- **A synthetic `TouchEvent` produces no click.** A real tap ends in a browser-synthesized
  click, so a case built on dispatched touches alone never exercises the bubbling path.
- `onDragOver` sets React state and `onDrop` reads it, so a drop fired in the same
  synchronous block sees the pre-render value. Separate the `evaluate` calls and settle.
- **When an output is padded for legibility, assert what it parses back to, never its
  spelling.**
- **A drag meant to cross a column drops MID-column, and asserts its press point hits the
  block.** Pressed 20px into a block and moved one column width, the drop sat ~20px past the
  boundary, and about one run in thirty fell back into the block's own column — a no-op commit
  that writes the identical value and reads exactly like "no write".
- **A hidden tab runs no animation frames.** Opening a second tab hides the first, and an
  animation started there never ends — a Journey page turn sat mid-turn until the case timed
  out, reading exactly like a stuck feature. A two-tab case that drives anything animated in
  the first tab brings it back with `Page.bringToFront` and asserts `visibilityState` first.
- **Layout can lag style through an emulated device switch.** For several frames after a
  desktop→phone `Emulation.setDeviceMetricsOverride`, forced-layout reads (`scrollHeight`,
  `getBoundingClientRect`, a computed `width`) returned the PREVIOUS layout for a whole
  subtree, while the fixed root had already resized and the custom properties were already
  new. Neither a new inline width nor one `requestAnimationFrame` cleared it. Code that measures
  must confirm its measuring element is at the size it set (Journey's `laidOut`), and a test of
  such code runs that harsh switch, not only a resize within one device class — a plain window
  resize and a phone rotation both passed while the switch failed.
- **Never write `\uXXXX` escapes through the editing tools.** They arrive in the file as the
  literal character: U+2028 or U+2029 inside a regex literal then ends the line (a syntax error
  `node --check` does catch), and a combining mark silently fuses with its neighbour (which
  nothing catches). Write character ranges as numeric code points, as `journey-core.js` does,
  and build test strings with `String.fromCharCode`.

### This machine

- **Read `pcpu`, `time` and `/proc/loadavg`, never the process count.** Orphaned Chrome and
  node processes at 0% CPU look exactly like heavy contention; 20-41 of them have cost an
  hour of waiting when the real cause was GNOME's `tracker-extract` at 50-78%. Skip `ps`'s
  own row, which always reports ~100%.
- **`pgrep -fc` matches the calling shell, and `pkill -f` kills its caller.** List the
  matches, read them, and kill by explicit PID.
- `CDP connection closed` and a `progress.html mounting` timeout in the malformed-`track_db`
  section are the **contention signature** — it is the suite's heaviest section, mounting
  five pages six times over. **A different pair failing each run is contention; the same case
  failing twice is not**, and deserves a one-variable control.
- Every page pulls React, ReactDOM, Babel, Tailwind and Firebase from CDNs at mount, so
  **any** case can fail on a network blip and land on a plausible-looking assertion. Read the
  `realErrors` payload before believing a regression.
- **Another session may commit mid-task**, sweeping your work into its commit. A `git diff`
  missing an edit you know you made usually means that, not that it vanished — confirm with
  `git show HEAD:<file> | rg <your change>` before re-applying anything.
- `rg -rn` is **not** `rg -n`: ripgrep reads `-r` as `--replace`. Use `rg -n`.
- **This machine sleeps, and a run that spans a sleep is void.** The tell is wall time: a
  narrowed run that takes ~2 minutes reported 77,696s, and its failures were the contention
  signature (`CDP connection closed`, mounting timeouts) on cases its change could not touch.
  Run doctored baselines **one at a time**, each set behind an undoctored **CONTROL** copy
  that must pass: a failing control is what says the whole set is void rather than evidence.
  (A parallel pair run just after the resume showed the same signature; the two causes were
  not separated, so treat parallel runs as suspect, not as proven harmful.)

- **On battery it also suspends after 15 idle minutes, with no `Lid closed` line to say so** —
  logind logs only `The system will suspend now!`. On mains it never idles to sleep. Check
  `/sys/class/power_supply/ACAD/online` before a long run and ask for the charger; do not hold a
  sleep inhibitor, which drains the battery. The network here is a phone hotspot, and a drop reads
  as mount timeouts or `net::ERR_SOCKET_NOT_CONNECTED` in `realErrors` — check NetworkManager in
  the journal for the window before believing either.
- **The test Chrome paints in software (`--disable-gpu`), and its frame times mislead in both
  directions.** Journey's composited shades changed nothing there and tripled a drag's frame
  rate on the GPU (20 to 60 fps), while the ink filters halved it there and cost nothing on the
  GPU. To measure paint as a user's browser does, launch a separate headless Chrome with
  `--use-angle=vulkan --enable-features=Vulkan` (this laptop's AMD Radeon, RADV). Confirm it
  with `SystemInfo.getInfo`, sent to the BROWSER target from `/json/version`, which must report
  `rasterization: enabled_force`. A page target refuses the call, and plain
  `--use-gl=angle --use-angle=gl-egl` falls back to software here. Keep that launcher out of
  `tests/`: the suite stays software-rendered, for its speed and repeatability.
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
