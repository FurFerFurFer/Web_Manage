# Track — Verification Log

The **evidence record** for completed work: what was run, on what, what failed first, and
what was explicitly not covered. This file was split out of `AGENTS.md` on 2026-09-12,
verbatim and without deletion, because it had grown to 174KB — two thirds of a file that is
loaded into every agent session, including sessions that never touch the code it describes.

Read this file when you need it, not by default:

- auditing a claim about what was verified, or when, or against which baseline
- picking up work in an area whose entry records a defect, a lesson, or a known gap
- checking whether something is genuinely covered by a test or only by code reading

**The durable lessons are not here.** The rules these entries taught — about fail-first
evidence, doctored baselines, reading a failure message, and this machine's test
environment — live in `AGENTS.md` under "Testing Lessons", which stays in context. What
remains here is the evidence behind them.

Entries are **append-only**; never rewrite or delete one, because the point of an entry is
that it recorded what was true when the work was done. Order is broadly chronological
(2026-08-05 → 2026-09-07); the final three entries sit out of order because they were
appended after the ones above them. Add a new entry at the end.

A new entry belongs here. It belongs in `AGENTS.md` **only** if it changed a durable
operating rule, an invariant, or a required command — in which case the rule goes there and
the evidence still comes here.

---

## Current Verification Baseline

As of 2026-08-05:

- `theme.js`, `storage-guard.js`, `firebase-sync.js`, and `notes-widget.js` passed `node --check`.
- The `localStorage` quota guard passed 43 headless assertions against a synthetic slot: all five pages mount with `window.TrackStorage` present; with the real quota exhausted, `TrackStorage.saveDB` returns `false`, the banner appears, the stored `track_db` stays byte-identical and still parses, no false `track_db_pending` is written, no React root is torn down, and the workspace survives freeing the quota and reloading. The banner is hidden under print media. A further 9 assertions confirmed the guard composes with `firebase-sync.js`'s `Storage.prototype.setItem` patch rather than replacing or bypassing it, and that a non-quota error is rethrown.
- Not verified for the quota guard: the signed-in Firebase write path, which needs a live account. The reasoning there is structural — `firebase-sync.js` calls `_origSet` before its dirty-tracking lines, so a quota throw cannot arm an upload.
- Home, Progress, KS02, Documentations, and Notifications loaded in headless Chrome with a seeded synthetic slot; every React root non-empty, no white screen, no page errors beyond the expected Tailwind/Babel CDN warnings.
- Firebase reached the authentication overlay and the offline "Skip" path left the sync code inert (`TrackSync.getStatus().state === 'signed-out'`, no banner, no Firestore requests).
- `window.TrackSync.selfTest()` passed in-browser across four configurations (auto/gzip, forced raw, and both at a 64-byte chunk size to force multi-chunk).
- The codec round-tripped synthetic ASCII, Thai combining marks, CJK, astral-plane emoji, a 300 KB base64 data-URI, and empty input, in gzip and raw mode, at 700,000-byte and 64-byte chunk sizes. Flipped bytes, truncation, empty chunks, extra bytes, wrong length, wrong checksum, and unknown encodings were all refused rather than partially applied.
- The sync write/read paths were driven against an in-memory Firestore double: legacy→v2 migration with a one-time `backup/v1`, fresh-account first write, local-newer push, a 2.67 MB payload splitting into 4 chunks and round-tripping exactly, stale chunk deletion on shrink, a wrong-generation chunk refused without touching `localStorage`, a rejected write leaving `track_db_ts` unchanged with a visible error banner, a genuine remote change applied with the reload banner, and a remote change arriving during unsent local edits raising the conflict banner without clobbering the local copy and without auto-pushing past the debounce (verified by commit count, including further edits made while the banner was up).

- Permanent-vs-transient sync failure passed 33 headless assertions against the same double, with the `blob` and `backup` subcollections rejecting `permission-denied`: the banner names the code and `firestore.rules` and never claims a retry, no retry timer is armed and no further attempt occurs after 7 seconds, `track_db` stays byte-identical, `track_db_ts` is not written, `track_db_pending` stays set, and the cloud keeps only the legacy document. "Retry now" makes exactly one further attempt; once the double stops rejecting, the same button completes the legacy→v2 migration with `backup/v1` holding the pre-migration payload. An `unavailable` rejection still says "Retrying…", still arms the 5-second timer, and still retries on its own.

Not verified: behavior against the live Firebase project, which needs `firestore.rules` published in the console and explicit user authorization. Real multi-device and touch interaction were not exercised.

This is a render-plus-sync-logic baseline, not proof of full behavioral correctness.

### Repeatable from 2026-08-06

Everything in this section that is not `node tests/run.js` was run once and cannot be re-run. The committed suite is the reproducible part:

```bash
node tests/run.js
```

132 offline cases per timezone (80 calendar and 52 schema) under five timezones (UTC,
UTC+14, UTC-11, America/Los_Angeles, Asia/Kathmandu), plus 131 headless-Chrome
subtests, across 13 suites. On 2026-08-22 a full run on an idle machine passed all
13 suites, the TOUCH sidebar cases (browser 125-131) included — they were the test
half of a feature written before its implementation, and both halves are now in the
working tree. A run overlapping another session's suite on the same machine lost
cases 123-131 to `CDP connection closed`; they passed on the idle re-run, so treat
a browser-layer failure as a resource symptom until the machine is confirmed quiet.
The original two
`sir-ks02.html` regression cases were confirmed to **fail** against the pre-fix page
served through `TRACK_TEST_ROOT`. The cross-tab active-slot, ambiguous-slot-identity,
malformed recursive-goal, and dangling-writer cases added on 2026-08-10 were also
recorded failing first.

### Hardened `track_db` readers (2026-08-08, extended 2026-08-10)

- Repeatable browser cases cover every reader surface. Invalid JSON, unsafe root/slot
  kinds, missing or duplicate slot ids, wrong canonical kinds/items, and malformed
  recursive goal shapes block while the original bytes remain untouched. A dangling
  `activeSlotId` and semantic date/time flaws warn and stay editable.
- The banner offers the exact raw bytes, a missing key and healthy database remain quiet,
  and the notes widget cannot bootstrap over damaged data.
- Repeatable cases also cover nonempty legacy-slot normalization, cross-tab active-slot
  switches in Progress and KS02, Progress realigning a dangling pointer to the slot it
  displays, legacy global notes surviving a refused adoption, and Documentations reporting
  a refused empty-slot bootstrap rather than claiming a phantom workspace.
- Not covered: a **real** legacy `{progress, ks02}` install. That shape is classified `ok`
  and passed through untouched so its migration IIFE still sees it; legacy paths use
  synthetic keys.

### Canonical slot schema (2026-08-08, extended 2026-08-10)

- `schema.js` passes `node --check`; `tests/schema.test.js` contributes 48 offline cases, identical under all five swept timezones.
- Six browser cases were seen failing against the pre-change pages before the fix: the four `window.TrackSchema` smoke assertions, canonical shape from every entry point (`index.html` built 13 of 21 fields), local-day `createdAt` and a collision-free id (with `Date.now` frozen, both workspaces got the identical id `slot-1786180119615`), unknown-key survival through import, refusal of a wrong-typed field (`{"goals":"hello"}` imported silently and would break the calendar on the next load), and a synthetic legacy install migrating into a complete slot (10 of 21 fields).
- The `index.html` cases were re-confirmed through a `TRACK_TEST_ROOT` scratch directory of symlinks plus the single pre-change `index.html`, with the other 20 browser cases still passing.
- Not covered: real touch hardware, the live Firebase project, and a **real** legacy install. The legacy rescue path is exercised only against synthetic pre-`track_db` localStorage keys — it runs once per user and can never run again, so that residual risk is real and is not claimed as covered.

### Choosable deadline caution period (2026-08-10)

- Eight new browser cases. The regression case — **the timeline must not mark a deadline as caution on its own due day** — was seen **failing first** against the untouched working tree: `1 !== 0` on the amber `!` count for a deadline due today with a two-day run-up, while the red due line rendered as expected. Its guard case (a run-up day still carries exactly one `!`) passed both before and after, so the fix narrows the set rather than emptying it.
- The cause was triplication: `d.date !== ds` was spelled out at two of the three call sites and forgotten at the third. It now lives once, inside `deadlinesCautionOn`, matching `deadlinesCaution` in `calendar-core.js`. `inCaution` has exactly one caller.
- The popup's inline caution picker: present in the **read** view rather than behind `Edit`, seeded to the due day, `max` capped at the due day. A pick writes `startDate` and leaves `docPageId`, `createdAt`, `date` and `time` untouched; the span readout updates in the same render. `''`, a date after the due day, and `'nonsense'` are each **refused** with `track_db` staying byte-identical, so `startDate` is never blank and never inverted. A quick-set writes the date named in its own tooltip, and `reset` returns the start to the due day.
- `progress.html?date=…&dl=<id>#schedule` opens that deadline's popup; `&dl=` naming no stored deadline opens nothing and raises no error.
- Home's `⏰` and `!` chips are `<a>` elements pointing at `progress.html?date=<due day>&dl=<id>#schedule` — the **due** day from a caution day, not the day the chip sits on.
- A Documentations caution row's text is a button that moves the block to the due day, where a page-owned deadline shows its `✎`/`✕` and the due day is not also listed as a caution.
- All eight pass both against a fresh browser and in the complete 2026-08-10 suite.
- Not covered: real touch hardware, the live Firebase project, and print output of the picker.

### Tickable deadlines (2026-08-10)

- Four new offline cases and six new browser cases. All six browser cases were seen **failing first** against the untouched working tree, and three of the four offline ones failed there too; the other offline case is a guard — it asserts `dlStart`, `dlDayCount` and `dlInCaution` are *unchanged* by a tick, so it must pass on both sides.
- The load-bearing check was run separately and is worth repeating for any future change here. A scratch `TRACK_TEST_ROOT` was built from symlinks to the repository plus **one** doctored `progress.html` with `!dlDone(d)` removed from `deadlinesCautionOn` and nothing else altered. Against it, the timeline case and the month-grid/day-panel case **failed** while the Home and Documentations cases **passed** — which is the proof that `progress.html` genuinely needs its own copy of the predicate (it does not load `calendar-core.js`) and that the per-surface assertions catch a forgotten one instead of letting it hide behind a passing sibling. Never place such a baseline copy in the repository.
- What the browser cases assert: the popup tick reaches `track_db` as `done: true` while `docPageId`, `createdAt`, `startDate`, `time` and `title` all survive, and untick leaves the span untouched; ticking clears the timeline `!` and unticking restores exactly one; ticking clears the month-grid and day-panel `!` **asserted separately**, leaving the deadline drawn on its due day with a `✓`; the day-panel checkbox writes the same field as the popup; Home shows no `.cal-sched-dl.caution` on a run-up and a `.cal-sched-dl.due.done` `<a>` with an unchanged `href` on the due day; a Documentations block shows no caution row and no `cal-doc-caution-day` cell bar, and its owning page's `Untick` button clears the flag with the record intact.
- `done` round-trips through export → import without either side naming it: the existing export case now seeds a ticked deadline, and it reached the other side on `normalizeSlot`'s unknown-key path.
- Not covered: real touch hardware, the live Firebase project, and print output.

### Movable deadline due date (2026-08-10)

- Five new browser cases and one new offline guard. **All five browser cases were seen failing first** against the untouched working tree, each timing out on `waitFor` for a `Due date` row that did not exist, while the other 68 subtests passed — including `assert.equal(saved.date, due, 'the due day itself did not move')`, which guards the read-view caution picker and must keep passing on both sides. Because the pre-change file *was* the working tree at that moment, this needed no `TRACK_TEST_ROOT` scratch directory.
- The offline case is a **guard**, and passes on both sides by design: it pins what an inverted span (`startDate > date`) actually does — `dlDayCount` returns `-1` rather than `NaN`, `dlInCaution` is false for every day so `deadlinesCaution` empties entirely, `daysBetween` returns `[]` instead of spinning, and `dlValid` is the single check standing between a draft and that state. It exists so the cost of dropping the ordering check stays visible rather than being rediscovered.
- What the browser cases assert: the row is seeded from the stored due day with `min` at the caution start; a move writes `date` while `startDate` stays put and `id`, `createdAt`, `docPageId`, `done`, `time` and `title` all survive the spread; a due day before the caution start disables Save, shows the reason, and leaves `track_db` byte-identical; a cleared due day does the same under its own message and does **not** also claim the caution start is out of order; the `!` run-up re-homes so the old due day becomes a run-up day and the deadline is drawn once on its new day; and a cross-month move re-anchors both the timeline day label and the month grid.
- The blank-date case earned its place immediately — it caught a real defect. The first implementation gated the ordering warning on `startDate > date` alone, on the reasoning that a blank date makes the comparison false. It does not: every non-empty string sorts above `''`, so both messages rendered at once. The ordering line is now gated on there being a due day at all.
- 50 further assertions were run once from a task-owned script and cannot be re-run: all five pages mount with a non-empty root, `TrackStorage.loadDB`, the notes widget (`#nw-btn`), a `signed-out` sync state and no page errors; a **year**-boundary move (2026-12-20 → 2027-01-05) keeps `startDate` on 2026-12-14 and moves the timeline to "Tuesday, January 5, 2027" and the grid to "Jan 2027"; an open day panel follows to `Jan 5` while a closed one stays closed; a `?date=` link built before the move still opens the popup on the current due day; and the moved record still passes `TC.dlValid` against the draft `documentations.html` seeds from it, with `dlDayCount` reading a positive 23 — the direct check that no inverted span reached storage.
- Not covered: real touch hardware, the live Firebase project, and print output of the new row.

### True Storage and per-pair source-dump tagging (2026-08-15)

- One new offline suite (`tests/true-storage-core.test.js`, 17 cases, run **once** rather than swept — the module holds no date code) and ten new browser cases. `schema.js` grew two rows, so the slot went from 21 to 23 fields; `tests/schema.test.js`'s hand-written CONTRACT, `tests/browser.test.js`'s copy of it, and `tests/lib/fixture.js` all had to follow, which is exactly what those hand-written lists are for.
- The **fail-first proof** is the important part, and it was run against two doctored baselines rather than one, because the failure this design prevents has two symmetrical halves. Each scratch `TRACK_TEST_ROOT` held symlinks to the repository plus **one** doctored `sir-ks02.html` whose `StorageTags` re-spelled the match at the call site instead of calling `TrackTrueStorage.storagesForLink`:
  - **Forgetting the MM half** (`t.dumpId===dump.id` alone): three cases failed — "a tag lands on its own pair and on no other" (`['ts-1']` became `['ts-1','ts-2']`), "the chip is drawn on the non-leaf S&C branch and inside a descendant node", and "a tag added from KS02 is a fresh read-modify-write" — while "the chip is drawn in the MM detail S&C tab, per pair" **passed**, because that case's seed has only one tagged storage and no second storage to bleed through. 80 of 84 subtests passed.
  - **Forgetting the dump half** (`t.mmId===link.mmId` alone): a different three failed — "a tag lands on its own pair and on no other", "the chip is drawn in the MM detail S&C tab, per pair" (`d-2:10` returned `['ts-1']` instead of `[]`), and "the chip is drawn on the non-leaf S&C branch and inside a descendant node". 81 of 84 passed.
  - The two sets **overlap but neither contains the other**, which is the whole argument for asserting negatively at each surface instead of once: the leaf S&C case catches only the dump half, the KS02 read-modify-write case catches only the MM half.
- Never place either doctored copy in the repository.
- What the browser cases assert: a storage created from `+Storage` is stored with a string id, `parentIds: []`, `tags: []` and a **local**-day `createdAt`, and survives a reload as the same record; the tree reorders siblings and **refuses** a drag onto a non-sibling; a tag written from True Storage appears in KS02 under its own MM and nowhere else, across two dumps and two MMs; the same chip appears in the leaf card, the leaf S&C tab, the non-leaf S&C branch and `DescendantSCNode`, each asserted separately; a tag added from the KS02 picker preserves a storage written by another writer between mount and click, which is the read-modify-write proof; a tag row expands, collapses, and links to `sir-ks02.html?dump=…&mm=…#ks03`; the single link is set, replaced, and cleared back to **no key at all**; the explanation is written on SAVE and not by typing; and `?storage=` / `?dump=` naming nothing open nothing and raise no error.
- `trueStorages` and `trueStoragePos` were added to the sentinel set in "KS02 writes no key it does not own", so an ordinary KS02 edit is asserted to leave both byte-identical.
- Export → import carries both fields, including a tag's `(dumpId, mmId)` pair and a storage's `parentIds`.
- Not covered: real touch hardware (the storage canvas's drag/pinch path and the tree's `⇅` handle were exercised only through synthetic events or not at all), the live Firebase project, and print output.

### Parent-cycle guards and the shared canvas layout (2026-08-15)

- One new offline suite (`tests/graph-layout.test.js`, 21 cases, run **once** — no date code)
  and eight new browser cases. The suite went from 13 to 14 registered suites; all 14 pass.
- The **fail-first proof for A1 is the extraction order**, and it is worth repeating for any
  future change here. `graph-layout.js` was created as a **verbatim** move of
  `sir-ks02.html:333-485` with the bug still in it, both pages were reduced to one-line
  delegates, and only then was the suite written and run. Result at that moment: **19 cases, 12
  passed, 7 failed**, and the split was exactly the predicted one — every acyclic case (single
  root, tree, diamond, disconnected components, dangling parent, custom radii) passed, which is
  what proves the extraction was faithful, while all **6** root-reachable cycle cases died with
  `RangeError: Maximum call stack size exceeded` inside `leafCount`. (The 7th failure was a
  defect in the test, not the product — see the test-authoring note below.) The guards were added
  afterwards; the suite is 21 cases now and all pass. Extracting first and guarding second is
  what made one run prove both things at once.
- One case passed on **both** sides and was expected to: a *pure* cycle with no root. Such a
  component has `roots.length === 0`, so the walk never starts and the crash never happens. Only
  a cycle **reachable from a root** enters the recursion. A test seeded with a rootless cycle
  proves nothing about this bug.
- The A1 **page-level** cases were proven separately, against a `TRACK_TEST_ROOT` scratch
  directory of symlinks to the repository plus **one** doctored `graph-layout.js` with
  `inProgress` and the `path.has(id)` guard removed and nothing else altered. Never place such a
  baseline copy in the repository.
- A2 was seen failing against the untouched working tree: `a cycle does not hang a non-leaf MM's
  S&C tab` timed out after 15s on the cyclic descendant walk, independently of the canvas.
- A3 was seen failing the same way, but only after a **test** defect was fixed first: the case
  looked for the create-title input without clicking `+ title`, so it timed out on the wrong
  step and would have "proved" the bug for the wrong reason. Its sibling guard case — a
  sub-title under an *untagged* dump leaves `trueStorages` byte-identical — passed on both
  sides by design, and is what pins `repointDump`'s same-reference short-circuit.
- Three test-authoring defects were caught in this task's own cases, all of the C-class kind
  worth naming: `applyRepulsion` was asserted to separate exactly coincident nodes (it cannot —
  identical coordinates give the push no direction, which is why the rootless-cycle catch-all
  now fans its leftovers instead of stacking them); the `+ title` interaction above; and a
  child asserted to inherit one mmLink when the fixture seeds two. In each case the product
  finding held and the assertion about it did not.
- Behaviour changed deliberately, beyond "does not crash": `getDescendants` gaining a `visited`
  set also **de-duplicates** a diamond descendant, which was previously pushed once per path and
  rendered duplicate S&C blocks. DFS pre-order is preserved, so S&C block ordering does not
  shift.
- Scope correction worth carrying forward: `TagPicker.renderEntry` and the downward dump walks
  were guarded for consistency, **not** against a reachable crash. `parentId` is singular, so a
  dump in a cycle is nobody's descendant and no root reaches it. Only the upward walk
  (`dumpPathTo`) is genuinely exposed, and nothing in the current UI creates such a cycle at
  all. The browser case asserts the unreachability explicitly, so a future re-parenting feature
  trips it instead of shipping a hang.
- Not covered: real touch hardware, the live Firebase project, and print output. Cycle
  *prevention* is deliberately not implemented — see NOTES Proposal 14.

### Day-note and deadline schedule blocks (2026-08-19)

- 16 new offline cases (`tests/calendar-core.test.js` and `tests/schema.test.js` go from 104
  to 120, swept under all five timezones) and 12 new browser cases. No `SLOT_FIELDS` row was
  added — the slot stays at **23** fields — so the hand-written CONTRACT lists and
  `tests/lib/fixture.js` needed no change, which is itself asserted.
- **Two of the offline cases are guards and pass on both sides by design.** One pins that a
  timed note with no `blockDuration` still yields the pre-field shape (`duration` 30 and a
  `metaLabel`, claiming no duration the user never entered); the other pins that adding a
  block changes neither the due list, nor the caution run-up, nor the `done` suppression, on
  any of the three days of a span. If either ever fails, the feature has stopped being
  additive.
- The **fail-first proof** was run against two doctored `TRACK_TEST_ROOT` roots, each holding
  symlinks to the repository plus **one** doctored file, because the failure this design
  prevents has two asymmetric halves:
  - `calendar-core.js` with the deadline span **re-spelled at the call site**
    (`{ time: d.time, duration: d.blockDuration }`, i.e. anchored to the wrong end) — the Home
    and Documentations cases fail while the Progress one passes, because Progress reads its
    own copy.
  - `progress.html` with the `noteTimed` guard **dropped from its copy** of
    `noteBlockDuration` — only `an untimed note carrying a stray blockDuration is still not on
    the grid` fails, while Home and Documentations pass.
  The two failure sets are disjoint, which is the whole argument for asserting each surface
  separately rather than once. Never place either doctored copy in the repository.
- **That second case exists because the first attempt at the proof failed to prove anything:**
  the doctored `progress.html` passed all 113 cases. The panel test seeds an untimed note with
  *no* `blockDuration`, so the doctored line is never reached — dropping the guard only shows
  up when a stray `blockDuration` is stored alongside a missing `time`, which is exactly what
  `documentations.html` can leave behind when it clears a note's time. A case was added for
  that and seen failing. The lesson generalises: a guard-clause test has to seed the state the
  guard is guarding *against*, or it passes on both sides and proves nothing.
- Behaviour deliberately **differs** between the two copies and is asserted that way: an
  unscheduled *timed* note is a point marker on Progress and a block on the read-only
  surfaces. Each keeps its own pre-existing behaviour; that is the invariant, not sameness.
- Drag and resize were verified from a **task-owned script**, not the suite — the committed
  suite has never simulated a drag, and adding one here would have been a new and fragile
  precedent. Confirmed by that script: a deadline block's vertical drag writes `blockTime`
  and leaves `date`, `time` and `startDate` byte-identical; its horizontal drag changes
  nothing; a note block's drag writes `time`. These cannot be re-run from `node tests/run.js`.
- Not covered: real touch hardware (the long-press-to-resize path on the new blocks was
  written to match the existing three kinds but exercised only through synthetic events),
  the live Firebase project, and print output of the new blocks and panel.

**Superseded on 2026-08-21** — blocks became automatic, the popup became one flat list, and
work became schedulable on any day. The entry above is kept because its *method* still
applies; its behavioural claims do not. See the next section.

### Blocks by default, on any day, from a flat popup (2026-08-22)

- The slot stays at **23** fields — `blockOff`, `blockDate` and a part's `date` are item-level
  keys inside two existing list fields — so the hand-written CONTRACT lists in
  `tests/schema.test.js`, `tests/browser.test.js` and `tests/lib/fixture.js` needed no change,
  which the normalize case asserts. Offline cases go from 120 to **131** (swept under all five
  timezones, identical results); the browser cases this task owns go from 113 to **119**, all
  passing. (The file also gained seven TOUCH sidebar cases from separate, in-flight work while
  this task was running; they fail because their feature is not built yet — see the repeatable
  baseline above.)
- **Fail-first evidence, part one: the eight reversed cases.** The working tree *was* the
  pre-change file, so no scratch directory was needed. The new offline semantics were written
  first and run against the untouched implementation: `tests/calendar-core.test.js` reported
  **13 of 79 failing** and `tests/schema.test.js` **1 of 52**, and the browser suite **8 of
  113**. Every guard case passed on both sides, as it must — the blockTime anchor, the midnight
  clip, `itemParts` tolerance, overlap layout, origin filtering, and the due-list/caution-run-up
  invariance case (extended here to cover `blockDate` and `blockOff` as well).
- **Fail-first evidence, part two: two doctored baselines, and their failure sets are
  DISJOINT.** Each `TRACK_TEST_ROOT` scratch directory held symlinks to the repository plus
  **one** doctored file whose `blockDay` ignored `blockDate` (`item => item.date`):
  - doctored **`calendar-core.js`** → `HOME: a block moved to another day` and
    `DOCUMENTATIONS refuses the same edit` failed; both PROGRESS cases passed.
  - doctored **`progress.html`** → `PROGRESS: blockDate draws the run-up on a caution day` and
    `PROGRESS refuses a caution period that would strand placed prep` failed; both read-only
    surfaces passed.

  Neither set contains the other, which is the whole argument for asserting each surface
  separately rather than once. Never place either doctored copy in the repository.
- **A defect in this task's own test, caught by that second baseline and worth carrying
  forward.** `PROGRESS: blockDate draws the run-up on a caution day` first asserted only the
  block **ids**, times and heights — and it **passed against the doctored file**. The week view
  has all seven columns in the DOM at once, so a block drawn on the wrong day is still in the
  list with the right id and the right hour; only the *column* distinguishes a moved block from
  an unmoved one. `data-block-day` was added to the rendered block and the case now asserts it.
  The lesson generalises and is the same one the 2026-08-19 entry records in a different shape:
  a case that cannot fail against the bug it names proves nothing, and the only reliable way to
  find that out is to run it against the bug.
- What the new browser cases assert, beyond the reversals: an item with **no block keys at all**
  is on the grid at 60 minutes on each of the three surfaces, with nothing written to storage;
  an untimed note blocks at **08:00** and never gains a `time` key; a timed note keeps its
  marker **and** its block, and a `blockOff` item keeps its marker and its due line while
  leaving the grid; `remove from schedule` writes `blockOff: true` and **deletes nothing**, so
  `＋ add block back` restores the stored length and anchor; the popup has **no**
  `data-dln-group` and lists rows flat in date-then-time order with each row showing its own
  date; a task added with a chosen day lands on that day, and a day outside a deadline's caution
  window disables `Add`, shows the reason and writes nothing when clicked anyway; and both
  refuse-to-strand cases assert the **Cancel path** — Save disabled, the offending day named,
  `track_db` byte-identical after clicking Save regardless.
- Export → import carries `blockOff`, `blockDate` and a part's own `date` on `normalizeSlot`'s
  unknown-key path, with neither side naming them.
- **Not covered, and weaker than the rest.** Drag was *not* re-verified for this change: the
  committed suite still simulates no drag, and the 2026-08-19 task-owned script that did cannot
  be re-run. So the new drag behaviour — a note block writing `blockDate`/`blockTime` instead of
  `date`/`time`, a part writing its own `date`, and a deadline ghost **clamped** to the caution
  window rather than pinned to its column — rests on code reading alone. That is the largest
  gap in this entry and it is a real one. Also not covered: real touch hardware, the live
  Firebase project, and print output.

### A full-screen sidebar, and tree drag by finger (2026-08-22)

- **No data-contract change at all.** The touch path calls the same three mutators the mouse
  path does — `nestPage`, `arrangePage`, `promotePageToRoot` — so the `docDescendantIds` cycle
  refusal and the splice logic keep one definition and cannot drift between pointer kinds. The
  slot stays at **23** fields, nothing was added to `SLOT_FIELDS`, and the new state
  (`sidebarFull`, the drag ref) is ephemeral and never reaches `track_db`. This adds **7**
  browser subtests; the offline suites are untouched and pass identically under all five
  timezones. All 13 suites passed on 2026-08-22.
- `styles.css` changed, so its `?v=4` went to `?v=5` in **all five** pages.
- **The fail-first evidence took two runs, and the first one was worthless — that is the part
  worth carrying forward.** All seven new cases were written against the untouched tree and all
  seven failed, which looked like proof and was not: every one died on the *same* message,
  `waitFor timed out — the sidebar page tree (with data-doc-row hooks)`. They were failing
  because a test hook did not exist yet, not because of the behaviour each names. The fix was to
  land the **hooks alone** as their own step — `data-doc-row`, `data-doc-handle`,
  `data-doc-root-drop`, and nothing else — and re-run. Only then did the failures become real:
  - `TOUCH: the nest handle …` → `the touch nest being saved`
  - `TOUCH: the arrange handle …` → `the touch arrange being saved`
  - `the handles are reachable …` → `a @media (hover: none) rule shows the row action cluster`
  - `the sidebar expands to full screen …` → `Cannot read properties of null (reading 'click')`

  This is the same lesson as the 2026-08-18 Supporting Actions case and the 2026-08-19
  guard-clause case, in a third shape: **read the failure message, never the pass/fail.** Seven
  identical messages are a signal that the cases are all blocked on one missing thing upstream
  of what they test.
- **Two of the seven are guards, not evidence, and they passed on both sides by design.**
  `a drag into the page's own subtree is refused` and `touchcancel abandons the drag` both
  assert `track_db` is byte-identical — which is trivially true when touch does nothing at all.
  They only became meaningful once the drag worked. `GUARD: the desktop mouse drag still nests
  and arranges` is the genuine both-sides guard: it **passed** the moment the hooks landed,
  which is what proved the hooks were right and the HTML5 path intact.
- **A defect in this task's own test, caught by the suite and not by the smoke script.** The
  full-screen case ended by asserting the picked page was open via
  `/Bravo/.test(editor.textContent)`. The editor renders a page title as an `<input>`, and an
  input's value is not part of `textContent`, so the assertion read `''` and failed against a
  page that had opened correctly. It reads `input[placeholder="Untitled"].value` now. The
  task-owned smoke script missed this because it never made that assertion — a narrower check
  passing is not evidence that a broader one will.
- **Two product defects were found by code reading before any test ran, and both would have
  shipped silently.** (1) `.docs-sidebar-full` is a single class, which *ties* the Tailwind
  utilities it has to beat on the same element (`w-60`, `p-2`, `bg-gray-900/60`, `border-r`) —
  and Tailwind's CDN injects its `<style>` into `<head>` **after** this file's `<link>`, so a tie
  goes to Tailwind and the "full screen" panel would have stayed 240px wide. The selector is
  `.docs-sidebar.docs-sidebar-full`. Any future rule in this file that overrides a Tailwind
  utility on the same element needs the same doubling. (2) React 18 registers `touchstart` at its
  root as **passive**, so a `preventDefault()` in `onTouchStart` is ignored and only logs an
  intervention. Stopping the browser's pan is `touch-action: none` on `.doc-row-handle`, which is
  declarative and applies before the first event; the `touchmove` listener is registered by hand
  with `{ passive: false }`, so `preventDefault` genuinely works there.
- Listeners are attached **imperatively inside the touchstart handler**, not from a `useEffect`
  on the drag state. An effect does not run until React has re-rendered, so a fast flick — and
  any synchronous test — would lose every `touchmove` that arrived first.
- Near-edge auto-scroll is stepped by `requestAnimationFrame`, not by `touchmove`: a finger held
  still at the edge fires no further move events, so scrolling from the move handler alone stalls
  after one nudge. The drop target is recomputed on each frame because rows slide under a
  stationary finger.
- **Reverted on request, and deliberately not to be "fixed" back.** The narrow sidebar's row
  cluster was first given 44px targets under `@media (hover: none)`, which forced the row to
  `flex-wrap` and put the buttons on a second line — five 44px targets need 220px in a 240px
  column. That doubled the height of every page row on a phone, and the user asked for the
  original one-line layout back. The cluster is therefore **visible but not enlarged** there;
  `⛶` and the "Pages" `＋` keep 44px because each is alone on its row. The 44px row targets live
  only in `.docs-sidebar-full`, whose rule is a separate block *outside* the media query — check
  that separation before touching either, since they look like one concern and are not.
- **Not covered, and weaker than the rest.** The cases synthesise `TouchEvent`s from inside the
  page, exactly as the true-storage case synthesises a `DataTransfer`. That exercises the handler
  logic and **not** real hardware: browser gesture arbitration, scroll interception, momentum,
  and iOS/iPadOS Safari's own behaviour are all still unverified, as is the near-edge auto-scroll
  and the `@media (hover: none)` layout (headless Chrome reports `hover: hover`, so only the
  *existence* of that rule is asserted, never its effect). A real iPhone and iPad pass is still
  owed and is the point of the change, so it is the largest gap here. Also not covered: the live
  Firebase project, and print output.
- **Environment note, again.** A full run reported one failure in the malformed-`track_db`
  section (`progress.html mounting` timeout) — the contention symptom the 2026-08-18 entry
  already describes. Confirm on an idle machine before believing any browser-layer failure, and
  kill leftover Chrome by explicit PID: a `pkill -f "user-data-dir=/tmp/track-cdp-"` matches its
  own shell's command line and kills the caller.

Not covered by the suite, and still requiring manual checks: touch and drag interaction on real
hardware, the signed-in Firebase path, real multi-device behaviour, print output, and most of the
UI.

### A typed due date on both compose forms (2026-08-22)

- The slot stays at **23** fields — nothing here is a new key, only a new authoring path for
  `date` — so the hand-written CONTRACT lists in `tests/schema.test.js`, `tests/browser.test.js`
  and `tests/lib/fixture.js` needed no change. Offline cases go from 131 to **132** (calendar-core
  79 → 80, swept under all five timezones with identical results); browser subtests go from 126 to
  **131**. `node tests/run.js`: all 13 suites pass.
- **Fail-first, offline.** `TC.dlDraftValid` is new, so the case was run against a scratch
  directory holding a pre-change `calendar-core.js` and a REAL copy of `tests/` — a symlinked
  `tests/` is useless here, because `require`/`__dirname` resolve through the realpath and quietly
  load the repository's own module instead. That cost one wasted run reporting a false pass, and
  `--preserve-symlinks` did not fix it. Against the true baseline: **2 of 80 failed** — the new
  case (`TC.dlDraftValid is not a function`) and `module surface`, which is what the hand-written
  export list is for.
- **Fail-first, browser: two doctored baselines, and their failure sets are DISJOINT.** Each
  `TRACK_TEST_ROOT` held symlinks to the repository plus **one** file with the feature reversed:
  - doctored **`progress.html`** → cases 36 and 37 (`the Schedule composer files a deadline on a
    TYPED due day`, `… refuses a due day before the caution start`) failed; **129 passed**,
    including both Documentations cases.
  - doctored **`documentations.html`** → cases 38 and 39 failed, the mirror pair; **129 passed**,
    including both Progress cases.

  Neither set contains the other. `progress.html` does not load `calendar-core.js` and carries its
  own `dlDraftValid`, so one assertion per surface is the only thing that catches a forgotten copy.
  Never place either doctored file in the repository.
- Case 40, `editing an existing deadline still takes its day from the record`, is a **scope guard**
  and passed against both baselines by design: it pins that the Documentations edit form shows one
  date field, not two, so a later change that adds a due date there without the stranding refusal
  trips this case instead of shipping.
- What the cases assert beyond that: the composer's due field is seeded from the cell it was
  launched from and `min`-capped at the caution start; a typed day reaches `track_db` while
  `startDate` stays where it was; and an inverted span disables the button, shows the reason, and
  leaves `track_db` **byte-identical** after clicking it anyway — the Cancel path, which is the one
  that matters.
- **Environment note, and it repeated the 2026-08-18 lesson exactly.** One full run reported nine
  failures — cases 123 to 131, all `CDP connection closed` or a 30s `waitFor` timeout — while
  another Claude session was running the whole suite on the same machine. Every one passed on an
  idle re-run. Before trusting a browser-layer failure, check
  `ps -eo cmd | grep browser.test.js` and `pgrep -fc "user-data-dir=/tmp/track-cdp-"`.
- Not covered, as ever: real touch hardware, the live Firebase project, and print output. The
  composer's date field was not exercised by hand.

### Hand-picked caution days (2026-08-22)

- The slot stays at **23** fields — `cautionDates` is an item-level key inside the existing
  `deadlines` list — so the hand-written CONTRACT lists in `tests/schema.test.js`,
  `tests/browser.test.js` and `tests/lib/fixture.js` needed no change, which the normalize case
  asserts. Offline cases go 132 → **140** (calendar-core 80 → 86, schema 52 → 54) under all five
  timezones with identical results; browser subtests go 131 → **136**. All 13 suites pass.
- **Fail-first: two doctored baselines, and their failure sets are exactly DISJOINT — zero
  overlap.** Each `TRACK_TEST_ROOT` directory held symlinks to the repository, a REAL copy of
  `tests/`, and **one** doctored file whose `dlCautionDays` ignored `cautionDates` and read only
  the legacy span:
  - doctored **`calendar-core.js`** → **5** failures, all on read-only surfaces (Documentations
    cell bars, Home chips, the Documentations caution row, and both the HOME and DOCUMENTATIONS
    gap cases). All eleven Progress caution cases passed.
  - doctored **`progress.html`** → **11** failures, all on Progress (timeline run-up, picker,
    quick-set, `clear all`, un-pick refusal, migration, both tick cases, both due-day-move cases,
    the Progress gap case). All five Home/Documentations cases passed.

  This is the cleanest instance of the per-surface argument this repository has produced, and it
  is the direct proof that `progress.html` needs its own copy. Never place either doctored file
  in the repository.
- **A real product defect the browser cases caught and code reading missed.**
  `dlStrandedBlockDays` read block days off the **stored** record. A deadline with no `blockDate`
  has its block on its own `date`, so the block MOVES WITH a due-day change and cannot be
  stranded by one — but the check compared the old block day against the new window, reported it
  orphaned, and refused every due-day move of an un-anchored deadline. That is the default shape
  of every deadline. Both copies now build a probe carrying the proposed `date` before reading
  `blockDay`/`partDay`, and an offline case pins it. **Generalise this:** when a helper takes a
  PROPOSED change, everything it derives has to be derived from the proposal, not half from the
  proposal and half from the stored record.
- **Three test defects, each found by reading the failure MESSAGE rather than the pass/fail.**
  (1) The migration case seeded its second load with `db:` instead of `raw:`; the value was
  already a serialised `track_db` string, so it was stringified twice and the byte comparison
  failed on encoding rather than on the migration. (2) The new due-day cell was titled
  `Due day — …`, and three existing cases count `!` marks with `[title^="Due "]`; the popup cell
  was counted as a second mark on the day underneath. The PRODUCT tooltip was changed, not the
  selectors, because the picker is what arrived. (3) The picker is also a `.grid.grid-cols-7` and
  renders BEFORE the month grid, so every bare month-grid selector read the picker's header;
  they now carry `:not([data-dl-caution-cal])`. **Any new UI that reuses a generic class or a
  tooltip prefix an existing case selects on will silently break that case — check both before
  adding a surface to a page the suite already reads.**
- **Not covered, and weaker than the rest.** The drag path was **not** re-verified — the
  committed suite still simulates no drag, so the nearest-allowed-day snap rests on code reading
  alone, and that is the largest gap here. Also not covered: real touch hardware, the live
  Firebase project, print output of the picker, and the multi-device window where one device has
  migrated and another has not (reasoned through the resolver's legacy branch, not tested).

### Caution days chosen from Documentations (2026-08-22)

- The slot stays at **23** fields — nothing here is a new key, only a second authoring path for
  `cautionDates` — so the hand-written CONTRACT lists in `tests/schema.test.js`,
  `tests/browser.test.js` and `tests/lib/fixture.js` needed no change. Offline cases go 140 →
  **142** (calendar-core 86 → 88), identical under all five timezones, and all 13 suites pass
  offline, with `tests/browser.test.js` reporting **149 subtests, all passing** in 11 minutes.
  `node tests/run.js` end to end: **all 14 suites pass**, against a tree unmodified for the
  duration of the run. This task
  contributes **six** of them and rewrites one existing scope guard (`SCOPE GUARD: the
  Documentations edit form still moves no due DAY` — its date half stands, its caution half was
  superseded); the rest of the growth since the last entry is separate in-flight work that was
  landing in the same file, so only this task's delta is claimed here. No JS module changed, so
  no `?v=` was bumped and `styles.css` was not touched at all.
- **Both new offline cases are GUARDS and pass on both sides by design.** One pins that
  `dlStrandedBlockDays` short-circuits on a falsy record — that is what lets ONE picker serve the
  compose and the edit form with no branch, since a deadline being composed has no prep. The
  other pins `dlWithCautionDays({date}, days)` used as a draft sanitiser. If either fails, the
  picker has stopped being able to share its code between the two forms.
- **Fail-first: two doctored baselines, and their failure sets are exactly DISJOINT — zero
  overlap.** Each `TRACK_TEST_ROOT` scratch directory held symlinks to the repository, a REAL
  copy of `tests/`, and **one** doctored file with the `dlStrandedBlockDays` gate deleted:
  - doctored **`documentations.html`** → the Documentations un-pick refusal failed; every
    Progress caution check passed.
  - doctored **`progress.html`** → two Progress checks failed (the refused un-pick, and the
    follow-on that un-picking a harmless day narrows the set rather than emptying it); every
    Documentations check passed, in both themes.

  Never place either doctored copy in the repository.
- **A false pass caught before it was believed, and worth carrying forward.** The first run
  against the doctored tree reported all-green. The `sed` that was supposed to make the harness
  read `TRACK_TEST_ROOT` had failed on an unescaped `|` in its replacement, so the script served
  the *repository* and the doctored file was never loaded. The fix was not just to repair the
  substitution but to make the script **print the root it is serving** on every run, so a
  mis-set environment variable can never again read as evidence. Generalise it: when a check is
  supposed to run against a doctored tree, have it *state which tree*, because "all passed" looks
  identical whether the bug was absent or the bug was never loaded.
- Behaviour deliberately **differs** from `progress.html` and is asserted that way: this picker
  holds its picks in the DRAFT and writes on Save, because this form has a Cancel to honour.
  A browser case asserts the Cancel path leaves `track_db` byte-identical, and that is the only
  thing making its unconfirmed `clear all` safe — a draft-level clear destroys nothing. The
  Progress picker still writes per click and still asks before clearing. Do not "make it
  uniform" without re-deciding both on purpose.
- The picker is styled with inline `var(--color-*)` theme tokens rather than Tailwind's palette,
  because this page has a light theme and `progress.html` does not. Verified from a task-owned
  script in both themes: a picked day reads at luminance contrast 179 (dark, amber on near-black)
  and 164 (light, brown on near-white), and the due day is coloured distinctly from a picked day
  in both. That script cannot be re-run from `node tests/run.js`.
- No new print rule was needed: the picker sits inside `.cal-doc-form`, which
  `body.docs-page .cal-doc-form { display: none !important }` already hides under print.
- **Environment note, and it corrects the advice the earlier entries give.** Those entries say to
  check `pgrep -fc "user-data-dir=/tmp/track-cdp-"` and re-run on an idle machine. **The process
  COUNT is not the test.** This machine accumulates orphaned Chrome and `node --test` processes
  from runs that died without cleaning up — the same leak the 2026-08-18 entry notes when
  `Browser.close()` fails with `ENOTEMPTY`. During this task it showed 20-41 Chrome processes and
  7-14 `browser.test.js` processes, which read as heavy contention and cost roughly an hour of
  waiting; `ps -eo pid,etimes,time,pcpu` then showed **every one of them at 0% CPU and 00:00:00
  cumulative CPU time**, two of them 15 hours old, with a load average of 2.06 across 12 cores.
  They were corpses, not load. The full browser suite then ran to completion beside all of them,
  149 subtests in 11 minutes with no failure and no `CDP connection closed`. Check `time`/`pcpu`
  and `/proc/loadavg`, not the count — and do not kill them by pattern, since a `pkill -f` on the
  profile string matches the calling shell. **The leak that produced those corpses was fixed on
  2026-08-25** (see "A run that cannot leak"), so a fresh accumulation now means something new is
  wrong rather than business as usual. Everything else in this note — `time`/`pcpu` over the
  count, and never `pkill -f` — still stands.
- Also learned: `node --test --test-name-pattern=<subtest>` **silently runs nothing** unless the
  pattern also matches the parent `browser suites` test. It reports `1..0` and `# pass 1`, which
  reads as a pass. Check the plan count, never the summary line.
- **Not covered, and weaker than the rest.** Drag was not re-verified, so the interaction between
  a dragged block and a newly un-picked day rests on `dlStrandedBlockDays` plus code reading.
  Also not covered: real touch hardware, the live Firebase project, and print output.

### Merged table cells, and a table pasted as text (2026-08-22)

- The slot stays at **23** fields — `merges` is an item-level key inside a block inside the
  existing `docPages` list — so the hand-written CONTRACT lists in `tests/schema.test.js`,
  `tests/browser.test.js` and `tests/lib/fixture.js` needed no change. One new offline suite,
  `tests/doc-table-core.test.js` (**42** cases), registered in `tests/run.js` and run **once**
  rather than swept: `doc-table-core.js` holds no date code, matching `true-storage-core.test.js`
  and `graph-layout.test.js`. Suites go 13 → **14**. This task adds **five** browser cases. No
  absolute browser total is quoted on purpose: another session was adding cases to
  `tests/browser.test.js` throughout this task, the file grew by 8 subtests *between* two of the
  runs below, and the two deltas are not this task's to conflate. `styles.css` was not touched —
  `colSpan`/`rowSpan` are HTML attributes and the existing `body.docs-page .doc-table td` print
  rule applies to a spanning cell unchanged — so no `?v=` was bumped except the new
  `doc-table-core.js?v=1`.
- **Fail-first, offline: two doctored baselines, and their failure sets are exactly DISJOINT —
  zero overlap.** Each scratch directory held a REAL copy of `tests/` (never a symlink — `require`
  and `__dirname` resolve through the realpath and would quietly load the repository's own module,
  which this file already records as having cost one run a false pass) plus **one** doctored
  `doc-table-core.js`:
  - `mergeMap` ignoring `merges` → **5** failed: the `mergeMap` span case, both `canMerge`
    refusals, `mergeCells` composing, and "mergeCells NEVER touches rows". 36 passed.
  - the rectangular-grid check dropped, short rows padded instead → **2** failed: the wrong-cell-
    count refusal and the line-number case. 39 passed.
- **Fail-first, browser: two more doctored baselines, also exactly DISJOINT.** Each
  `TRACK_TEST_ROOT` root held symlinks to the repository, a REAL copy of `tests/`, and one
  doctored `doc-table-core.js`:
  - `mergeMap` ignoring `merges` → `a pasted table reaches track_db with its merges, and the grid
    draws the spans` and `merging hides the covered cell, and unmerging restores it exactly`
    failed. The other three passed, correctly: the no-merges case has nothing to span, the
    wrong-cell-count case is pure parser, and the clamp case goes through `normalizeMerges`.
  - `normalizeMerges` dropping an out-of-bounds region instead of **clamping** it → only
    `dropping a row still asks, and clamps a merge that spanned it` failed.

  Refer to these cases by **name**, not by index: the numbering shifted between the two runs
  (102/105 became 112) purely because the other session's cases landed in between. Never place
  any of the four doctored copies in the repository.
- **A real defect found by reading the diff, which no test would have caught.** `rowsOf` filtered
  non-array rows OUT. The editor writes a cell back by the index it **rendered** at, so a single
  malformed stored row would have shifted every row after it and sent the next keystroke into the
  wrong cell — silent data loss wearing defensiveness as a hat. It now maps a bad row to an empty
  one, preserving indices, and an offline case pins it. **Generalise this:** a defensive reader
  that feeds a render whose indices are used for WRITES may normalise values but must never change
  the length or order of what it returns.
- What the browser cases assert beyond the reversals: a pasted table with nothing merged is stored
  with `Object.keys` exactly `['id','type','rows']` — no `merges` key at all, which is what keeps
  the two pre-existing whole-block `deepEqual` cases passing; a markdown separator row is skipped
  rather than stored as data; a malformed paste shows the error with its **line number**, previews
  nothing, and leaves `track_db` **byte-identical** after clicking Insert anyway; merging asserts
  `page.dialogs.length === 0` in both directions, because nothing is deleted or cleared; and the
  `− row` case asserts the **Cancel path** is byte-identical before confirming.
- Every worked example in `TABLE-PASTE.md` and the in-page `TABLE_AI_BRIEF` was fed through
  `parseTableText` from a task-owned script — all 7 parse. A spec that ships an example the parser
  rejects is worse than no example. That script cannot be re-run from `node tests/run.js`; if the
  examples change, re-check them by hand.
- **Not covered, and weaker than the rest.** No image is ever read: the recognition step happens in
  whatever AI the user hands the picture to, so the accuracy of that transcription is outside this
  repository entirely and outside every test here. Print output of a merged cell was reasoned about
  and **not** looked at. Also not covered, as ever: real touch hardware and the live Firebase
  project. The merge chrome was exercised only through `.click()` from a task-owned smoke script
  and the committed cases, never by hand on a real pointer.

### The fourth day-header button, unreachable in the week view (2026-08-23)

- **No data-contract change at all.** The slot stays at **23** fields, nothing was added to
  `SLOT_FIELDS`, and the hand-written CONTRACT lists needed no change. `styles.css` was not
  touched, so no `?v=` moved — the whole fix is one constant and three Tailwind classes in
  `progress.html`'s inline JSX. The offline suites are untouched and pass identically under all
  five swept timezones. This task adds **two** browser cases.
- **The bug, and why exactly ONE of four buttons died.** In WEEK mode a day column is pinned to
  `DAY_MIN_W`, and the header spends it on three flex items: a 36px SIR strip, the centre, and a
  notes strip of 60px (up to 110px for a long title). At the old 140px the centre got 43px while
  the `+ ◎ ⊕ ☰` row needs 130px, so the row overflowed. A flex item paints as an atomic unit in
  document order, so the centre paints OVER the earlier SIR strip but UNDER the later notes strip:
  the row spilling left stayed clickable and the row spilling right went beneath the strip.
  Visible, because that strip has no background, and completely dead to a click or a tap. The left
  end is only safe while the spill is small — once a long title stretches the strip to 110px the
  row reaches the sticky time column, which is opaque and `z-index: 30`, and `+` is both hidden and
  dead. That is the second fail-first message below, and the reason widening alone is not the fix.
  Nothing
  about touch was involved — a desktop window simply never reaches the minimum, which is why the
  user saw it only on a tablet, and only in WEEK mode.
- **Fail-first evidence.** The working tree *was* the pre-change file, so no `TRACK_TEST_ROOT`
  scratch directory was needed — the same situation as "Movable deadline due date". A full pre-fix
  run: **149 subtests, 147 passed, and exactly the two new ones failed.** The messages are the
  evidence and are worth quoting:
  - `the ☰ day-notes browser takes its own tap (hit div.flex.flex-col.gap-0.5)` — the notes strip,
    named by its own class list. The three assertions **above** it (`+`, `◎`, `⊕` each hit `self`)
    **passed**, which is what proves the case can see the buttons and that the fourth one
    specifically is buried, rather than the case being broken.
  - The long-title case failed on a **different button against a different element**:
    `the + task picker still takes its own tap (hit div.flex-shrink-0.border-r.border-gray-800/50)`
    — the **sticky time column**, `z-index: 30`, at the other end of the row. That second failure
    is why the fix is not only an arithmetic widening: a 110px strip takes the width straight back.
- **A defect in this task's own test, caught by that first run.** The long-title case originally
  asserted `m.cell.width - byLabel['☰'].right >= 0` as its precondition — a *width* compared
  against a *viewport x-coordinate*, which is not a comparison of anything. It failed, so the case
  looked like it was doing its job; it was in fact failing on an incoherent assertion instead of on
  the squeeze it names. It measures the strip directly now (`strip.width > 60`). **A case that
  fails for the wrong reason is worth as little as one that passes for the wrong reason, and only
  the message tells them apart** — the same lesson the 2026-08-18 Supporting Actions case and the
  2026-08-22 TOUCH cases each record in a different shape.
- After the fix, `node tests/run.js`: **all 14 suites pass** — calendar-core (88) and schema (54)
  under all five swept timezones with identical results, true-storage-core, graph-layout,
  doc-table-core, and 150/150 in the browser suite with both new cases green.
- **Post-fix geometry, measured rather than reasoned** (task-owned script, cannot be re-run):
  a bare day gives column 228, centre 131, strip 60, **one** line, four buttons at 28px, every one
  hit-testing to itself; the long-title day gives strip 110 (its maximum), centre 81, the row
  **wraps to two** lines, still four buttons at 28px, still every one `self`. The predicted worst
  case and the measured one agree exactly. At a 1900px viewport the columns grow to 261px and the
  row is one line again, which is the direct check on the claim that nothing changes above 1652px. The buttons are deliberately **not** enlarged to 44px,
  the same call README records for the Documentations sidebar.
- The cost is stated in README and was the user's explicit choice: the week view's minimum width
  goes 1036px → 1652px, so a 1280 or 1440 laptop now scrolls it horizontally. Above 1652px nothing
  changes, since `flex-1` already grew the columns past the minimum.
- `tests/lib/cdp.js` gained `Page.setViewport(w, h)` over `Emulation.setDeviceMetricsOverride`.
  Headless Chrome's default is 800×600 and reproduces the bug unaided — but a width-dependent case
  that is only meaningful because of a default nobody chose is one harness change away from
  silently testing nothing, so it states its width.
- **`--test-name-pattern` cannot narrow this file, and knowing that is worth 14 minutes an
  iteration.** node:test runs EVERY subtest once the parent matches, and `tests/browser.test.js` is
  one parent test with ~149 children: the flag either runs nothing or runs all of it. Iterating on
  a single case needs a task-owned preload that intercepts `require('node:test')` — the file takes
  the callable module itself, so patching the module's `.test` property does nothing.
- **Not covered, and it is the entire point of the change:** a tap on real touch hardware. The
  cases prove hit-testability in headless Chrome; iPadOS gesture arbitration is still unverified,
  and a real device pass is owed. Also not covered, as ever: the live Firebase project, and print
  output.
- **Environment note.** Another session ran the full suite on this machine throughout this task and
  committed mid-task (`f29f3cf`), sweeping this task's `cdp.js` helper and the first version of
  both cases into its commit. Load average sat near 5 and a full run took 14 minutes. Check
  `pgrep -fc "user-data-dir=/tmp/track-cdp-"` before believing any browser-layer failure.

**Superseded on 2026-08-23** — the widening was reverted the same day and the reachability fixed
structurally instead. `DAY_MIN_W` is 140 again and the button row is a 2×2 block on its own
full-width row. The entry above is kept because its *diagnosis* of the paint-order bug and its
lessons about test messages still apply; its behavioural claims — 228px, 1652px, `flex-wrap`, one
line at a bare width — do not. See the next section.

### The same four buttons, stacked instead of paid for (2026-08-23)

- **No data-contract change at all.** The slot stays at **23** fields, nothing was added to
  `SLOT_FIELDS`, the hand-written CONTRACT lists needed no change, and nothing here reaches
  `track_db`. `styles.css` was not touched and no JS module changed, so **no `?v=` moved**. The
  offline suites are untouched and pass identically under all five swept timezones. This task adds
  **one** browser case and rewrites the comments on the two it inherits.
- **The change, and why the arithmetic forced its shape.** At `DAY_MIN_W = 140` the header's centre
  section gets `140 − 1 border − 36 SIR strip − 60 notes strip = 43px`, and even a 2×2 block needs
  `2 × 28 + 6 = 62px`. A stacked block *inside the centre* does not fit at 140 — so the block moved
  **out** of the three-part strip row onto its own full-width row, where it has `140 − 8 padding =
  132px` and shares horizontal space with nothing. That is the difference between the two fixes and
  the reason to prefer this one: 228px made the bug **out-budgeted**, the own row makes it
  **unreachable**. A user asking for the width back is what prompted it; the 1652px minimum meant a
  1280 or 1440 laptop scrolled the week.
- Two supporting edits keep 140 honest: the centre carries `min-w-[28px]` (a floor at the date
  circle) and the notes strip lost `flex-shrink-0`. Without them a 110px strip over-subscribes the
  row (`36 + 110 > 139`), the centre collapses to zero, and the **date** paints out under the strip
  instead. Flexbox resolves the min-violation by freezing the centre and shrinking the strip.
- **Fail-first evidence, and it took two runs to be worth anything.** The working tree *was* the
  pre-change file, so no `TRACK_TEST_ROOT` scratch directory was needed — the situation "Movable
  deadline due date" describes. The new case makes **two** claims, and the first run only proved
  one: it died on `the day column is back at its 140px minimum (228px)` because that assertion came
  first, leaving the row-count assertion — the one the case is *named* for — never executed and
  never shown able to fail. The assertions were reordered and it was re-run, giving
  `the four buttons are drawn on TWO lines, not one (+◎⊕☰)` / `1 !== 2`. **Generalise it:** a case
  asserting N independent claims has been fail-first-proven for exactly the one that fired. Order
  the assertion the case is named for first, or run it twice.
- The two inherited cases (`every day-header button is hit-testable…`, `a long note title cannot
  push a day-header button out of reach`) **passed on both sides**, which is exactly their job:
  they assert the SYMPTOM, so they outlive the mechanism and their staying green through a
  228 → 140 revert is the evidence the dead `☰` did not come back.
- **Grouping by `top` rather than counting children is the whole case.** Four buttons in one
  container is true of both layouts; only the number of lines they are drawn on tells a 2×2 block
  from a row of four. This is the `data-block-day` lesson again — the right ids at the right times
  were true on the wrong day, and only the column distinguished them.
- **A test-helper hazard that would have produced a false pass, caught by reading the code rather
  than by running it.** `HEADER_BUTTONS` found the notes strip by walking
  `row.parentElement.parentElement.lastElementChild`, which is only the strip while the button row
  is *inside the centre*. After the move it resolves to the last **day column** — always wider than
  60px, so the long-title case's `m.strip.width > 60` precondition would have passed for entirely
  the wrong reason and the case would have stopped testing the squeeze it names. `data-day-strip`
  was added to the product and landed **as its own step**, run green before anything else changed,
  so no later failure could be blamed on a missing hook (the TOUCH-sidebar lesson).
- **Post-change geometry, measured rather than reasoned** (task-owned script, cannot be re-run):
  at 820×1180 a bare day gives column 140, centre 43, strip 60; the long-title day gives centre 28
  and strip 75 — the predicted freeze-and-shrink exactly. Both draw two lines of two at 28px with
  every button hit-testing to `self`, and the block stays inside its column. At 1280×900 the week
  **does not scroll** (`scrollWidth === clientWidth === 1265`), which is the direct check on the
  reason for the change; columns grow to 173 and the strip to 108. At 1024×768 it still scrolls
  (1036 > 1009), as 1036 requires.
- Day mode gets the 2×2 too — one code path, no `timelineMode` branch. There is room to spare
  there; uniformity was preferred to a second layout.
- The task-owned preload that makes `ONLY_PATTERN` work on this file (wrapping the `t` handed to
  the parent callback, since `--test-name-pattern` cannot narrow it) turned a 14-minute iteration
  into ~25 seconds. Worth rebuilding for any future work in here.
- **Not covered, and it is still the entire point of the original report:** a tap on real touch
  hardware. iPadOS gesture arbitration is unverified and a real device pass is owed. Also not
  covered, as ever: the live Firebase project, and print output.
- **Environment note.** Another session was editing `progress.html` and `tests/browser.test.js`
  throughout this task (the Task Priority matrix touch path) and running the suite beside it. Its
  in-flight work is in the same diff and was preserved rather than reverted.

### Grit and Night — light mode replaced by a growth-ring identity (2026-08-23)

- **No data-contract change to `track_db` at all.** The slot stays at **23** fields, nothing was
  added to `SLOT_FIELDS`, and the hand-written CONTRACT lists in `tests/schema.test.js`,
  `tests/browser.test.js` and `tests/lib/fixture.js` needed no change. The only persisted key
  touched is `track_theme`, whose rules are now in the data-contract section above. The offline
  suites are untouched and pass identically under all five swept timezones. This task adds **six**
  browser cases — the first appearance coverage this repository has ever had.
- **`node tests/run.js`: all 14 suites pass**, against a tree that was byte-identical for the
  whole run (checked by `md5sum` before and after) and with `git log --oneline -1` unchanged at
  either end, so no concurrent session swept work into it. calendar-core **88** and schema **54**
  under each of the five swept timezones with identical results; true-storage-core 24;
  graph-layout 21; doc-table-core 42; browser **163 subtests, 0 failures** (157 → 163).
- **What was there before: nothing.** A grep of `tests/` for `theme`, `track_theme`, `data-theme`,
  `light`, `dark` or `contrast` returned zero hits, while the browser suite rendered every one of
  its ~157 subtests in the light theme **by accident** — headless Chrome reports no dark
  preference and nothing seeded the key. The palette was exercised constantly and asserted never.
  That is why a palette-only change is nearly free against this suite, and why 157 passing tells
  you nothing about whether an appearance is legible.
- **Fail-first, part one: three cases against the untouched tree.** The working tree *was* the
  pre-change file, so no scratch directory was needed. Three of the six failed, each on the
  assertion it is **named** for, all with the same message shape — `'light' !== 'grit'`. The
  assertion order matters and was chosen deliberately: AGENTS already records that a case
  asserting N claims is proven for exactly the one that fired, so the named claim goes first.
- **Fail-first, part two: two doctored baselines, and their failure sets are NOT disjoint — one
  strictly contains the other, which is itself the finding.** Each `TRACK_TEST_ROOT` held symlinks
  to the repository, a **REAL copy** of `tests/`, and one doctored `theme.js`:
  - `root.style.colorScheme = next` (the appearance name passed through instead of mapped) →
    **only** `THEME: color-scheme resolves to a keyword the browser understands` failed, on
    `'grit' !== 'light'`. The other five passed. A clean, isolated proof.
  - the `applyTheme` guard rejecting everything, so `data-theme` is never set → **five of six**
    failed on `null !== 'grit'`.
  The second baseline's value is not the five failures but what passed beside them: **all five
  `smoke:` cases passed against it**, on a tree where every bare `html[data-theme]` rule is dead
  and the notes widget, Firebase overlay and all four banners render unstyled. The smoke cases
  assert those elements **exist**; only `THEME: html[data-theme] chrome is STYLED, not merely
  present` asserts they are painted. That contrast is the evidence the new case covers something
  the old ones cannot. Never place either doctored copy in the repository.
- **The defect that would have shipped, found by review rather than by any test.**
  `theme.js` wrote `root.style.colorScheme = theme` — and `color-scheme`'s grammar accepts a
  custom ident, so `grit` would have parsed, stuck, and been understood by no browser, falling
  back to light. Being **inline** it beats both stylesheet declarations. The result would have
  been a correct dark palette with light native scrollbars and light `<input type="date">` pickers
  across the 19 date/time inputs in the app. **Generalise it:** when a value is both a domain name
  and a CSS keyword, map it; never let the two vocabularies be the same string by coincidence.
- **The four-way spelling was collapsed to one.** The light/dark pair was spelled at
  `theme.js`'s fallback, click handler, system-preference listener and `TrackTheme.toggle`. That is
  the same duplication shape that cost this project the deadline caution predicate, and here the
  failure mode is worse than a wrong colour: a missed spelling makes `applyTheme` return before
  setting the attribute, and every bare `html[data-theme]` rule dies at once. One `normalizeTheme`,
  reached by both the storage read and `applyTheme`.
- **Two compensations were re-derived rather than renamed.** `svg [fill="#0f172a"]` and
  `[stroke="#1f2937"]` patch hard-coded hex in the canvas JSX. They existed only under the light
  theme, because the old dark palette was navy and `#0f172a` matched it **by luck**. The Night
  ground is green-cast, so the rule is now needed under `dark` as well or every mind-map node
  reads as a navy blot. A mechanical rename would have missed this entirely.
- **Six pre-existing Tailwind mapping gaps were swept while in there**, each a dark value
  surviving onto a pale surface because a sibling shade or opacity was mapped and it was not:
  `hover:text-gray-200` (8 sites), `bg-gray-950/60`, `hover:bg-gray-900/60`,
  `placeholder-gray-700`, `group-hover:text-gray-400`, and the non-hover `bg-white/5`.
- **Contrast is measured now, not claimed.** Every text role clears 4.5:1 against app-bg, surface
  and surface-muted in **both** appearances — worst case 5.19 (Grit) and 5.21 (Night) for the
  three text tiers, 4.68 and 4.93 including the accent roles. The browser case computes this from
  the live computed tokens rather than hard-coding hex, so a future palette tweak is checked
  instead of merely re-recorded. README's long-standing "stronger text contrast" bullet had no
  measurement behind it until now.
- **No network dependency was added.** `--font-display` and `--font-data` are system stacks, and
  they are applied only through `body.home` and explicit classes — never `:root`, `html`, `body`,
  `*` or a bare element selector. This is load-bearing: `--font-ui` never reaches `progress.html`
  (it is applied at exactly three places in `styles.css`), so the geometry-sensitive week-view
  cases are insulated *by construction*, and a font that inherited into `#root` would put them
  back in play. A webfont would additionally have made text metrics change asynchronously after
  first paint and would have tripped `realErrors`, which is asserted empty 118 times in this file.
- **A known and deliberate gap: `progress.html` still paints some chrome indigo.** The remap layer
  reaches Tailwind utility classes and `styles.css`; it cannot reach a hex literal passed as an
  inline `style` value or an SVG attribute from JSX. `progress.html` holds 16 such literals. Some
  are genuinely **data** and must stay theme-invariant — `PALETTE` (line 1268) is a categorical
  goal palette, and `mm.color` is a user-chosen value. But the rest are UI accent defaults —
  the progression donut and its percentage (1547, 1584), the SIR pips (1852, 1880), the MM
  progress bar (3568), the today outline (3804), and the goal bar (9363) — and they read as
  indigo on a green page. `sir-ks02.html` (101 literals) and `true-storage.html` (37) have the
  same shape. This was left alone on purpose: the approved scope excluded editing those files'
  JSX, they are the geometry-sensitive ones, and an SVG **attribute** does not accept `var()`,
  so the fix is a real refactor rather than a substitution. It is the largest remaining visual
  inconsistency and it is a follow-up, not an oversight.
- **Not covered, and stated plainly.** Print output in the new palette was **not** looked at — the
  `@media print` block flattens to black-on-white and is theme-independent by construction, and
  the committed case that guards its split flatten rule still passes, but no one has printed a
  page. Real touch hardware and the live Firebase project are unverified as ever. The growth-ring
  section on Home was exercised through the suite's page-mount cases and by hand in a headless
  screenshot, never on a real pointer or a real long-lived workspace.

### The ☰ panel looks forward only (2026-08-23)

- **No data-contract change at all.** The slot stays at **23** fields, nothing was added to
  `SLOT_FIELDS`, no `?v=` moved, and `styles.css` was not touched — the whole change is a filter
  and an empty-state branch in `progress.html`'s inline JSX. The panel writes nothing, and the new
  case asserts `track_db` is byte-identical across the whole interaction. The offline suites are
  untouched and pass identically under all five swept timezones (13 suites). This task adds **one**
  browser case and re-seeds one existing one.
- The rule has exactly **one** definition and deliberately no second copy: `documentations.html`
  and `index.html` render day- and month-scoped calendars, not a browse-everything panel, so there
  is no sibling surface to keep in step. The gate is applied **once**, after both kinds are
  collected, rather than beside each of the two pushes — notes and deadlines are collected on
  separate lines, which is the exact shape that once lost this project the caution predicate.
- **Fail-first evidence.** The working tree *was* the pre-change file, so no `TRACK_TEST_ROOT`
  scratch directory was needed. The new case failed on its own assertion rather than on a
  `waitFor` timeout, which is what proves it could already see the panel and was failing for the
  reason it names:

  ```
  both earlier items are gone and the clicked day's own item is kept
  + actual - expected
    [
  +   'n-past',
  +   'd-past',
      'n-today',
      'd-future'
    ]
  ```

- **The case opens the panel on TWO different days on purpose, and the second is the one that
  matters.** An implementation cutting against `todayStr` instead of the day clicked passes step 1
  completely unchanged; only reopening on `today+3` and finding TODAY's own note gone tells them
  apart. It also asserts the earlier note and the earlier deadline absent **by id** and re-checks
  under the `Deadlines` tab, because a cut applied to one kind and forgotten for the other still
  yields a shorter, plausible-looking list.
- **An existing case had to be re-seeded, and that is a consequence, not a tidy-up.** `the fourth
  button lists everything in ONE flat chronological list` seeded the fixed dates `2026-01-05` and
  `2026-02-09`, both in the **past**, so under the new rule it would have asserted the ordering of
  an empty list. It moves to `dayFromToday(5)` / `dayFromToday(9)` and still spans three days and
  four rows. **Any case that seeds a fixed calendar date and opens this panel is now
  time-dependent in a way it was not before** — seed with `dayFromToday` here.
- An item whose `date` is not a well-formed day is deliberately **kept** in the list: it belongs to
  no day, so it cannot belong to an earlier one, and this panel is the only surface such a record
  appears on. Hiding it would make it unreachable, which is the one thing this project will not
  trade for a tidier rule.
- The empty state **names the cutoff** when something was actually cut, and keeps the original
  wording otherwise. Not cosmetic: a slot full of earlier items, opened from a later column, would
  otherwise read as "everything I wrote is gone".
- **What was run.** All 13 offline suites under five swept timezones, identical results. A targeted
  run of **all ten** browser cases that open this panel, plus the six page-mount smoke cases —
  plan counts checked rather than the summary line, since `node --test` reports `# pass 1` for a
  run that executed nothing. Then the full browser suite: **157 subtests, all passing**. That run
  covered this task's work *and* the other session's in-flight day-header rewrite together, so it
  is evidence of no interaction between them rather than of either one alone.
- **Not covered.** Real touch hardware, the live Firebase project, and print output, as ever. The
  panel was not clicked by hand on a real pointer; the cases drive it through `.click()`. The
  empty state's *other* branch — the original "No day notes or deadlines yet." for a slot holding
  nothing at all — is unasserted; only the new cutoff-naming branch has a case.
- **Environment note, and it is the `f29f3cf` hazard again, one commit later.** Another session was
  rewriting the *same* day-header region of `progress.html` throughout this task — moving the
  `+ ◎ ⊕ ☰` row into a 2×2 block and taking `DAY_MIN_W` back from 228 to 140 — and committed
  mid-task as `1cf7b23`, sweeping this task's filter change and its new browser case into that
  commit. Nothing was lost. **Check `git log --oneline -1` before and after any long run:** a
  `git diff` that does not show an edit you know you made usually means another session committed
  it, not that it vanished. Confirm with `git show HEAD:<file> | rg <your change>` before
  re-applying anything, or you will duplicate it.

### Tapping empty space un-arms (2026-08-24)

- **No data-contract change at all.** The slot stays at **23** fields, nothing was added to
  `SLOT_FIELDS`, the hand-written CONTRACT lists needed no edit, and nothing here reaches
  `track_db` or `trackPriorityMatrix` — both evidence cases assert those byte-identical across the
  whole interaction. `styles.css` was not touched and no JS module changed, so **no `?v=` moved**.
  The offline suites are untouched. This task adds **four** browser cases.
- **The bug, and why it was not the theme change it arrived with.** The two-stage touch model had
  exactly one way out of stage one — tap the armed thing again — so an armed block stayed ringed
  indefinitely. The outside-click handler had read `onClick={() => setSelectedForResize(null)}`
  since `ba2df13`, the repository's first commit; `selectedForDrag` arrived later with the touch
  work and was never added to it, and `matrixArmedId` never was either. It was reported straight
  after the Grit palette landed, but `git show a79cb71 -- progress.html` is four lines — a favicon,
  two `?v=` bumps and a colour — and the one overlay that commit added is `pointer-events: none`.
  **A bug reported right after a visual change is not evidence the visual change caused it**; the
  new palette just made the ring easier to see.
- The clear now sits on the wrapper holding **both** the timeline and the Task Priority panel, so it
  has one definition and also covers the 35% panel, which in day mode was outside the old handler
  entirely.
- **This makes every block's and chip's `onClick={e => e.stopPropagation()}` load-bearing for
  ARMING, not just for the resize ring.** A tap arms on `touchend` and the browser then synthesizes
  a click; anything that lets that click bubble to the wrapper un-arms itself the instant it was
  armed. The four schedule block kinds already stopped it. **The matrix chip had no `onClick` at
  all** and needed one added — that single line was the highest-risk part of the task.
- **Fail-first, part one: the untouched tree.** The working tree *was* the pre-change file, so no
  scratch directory was needed. Both evidence cases failed on the assertion they are **named** for,
  `ERR_ASSERTION` / `true !== false` against `tapping empty grid space cleared the armed ring` and
  `tapping an empty quadrant cleared the armed ring` — not a `waitFor` timeout, which would have
  meant the case had gone blind instead. Both GUARD cases passed, as they must.
- **Fail-first, part two: a doctored baseline, and the failure sets are exactly DISJOINT.** A
  `TRACK_TEST_ROOT` tree of symlinks to the repository, a **REAL copy** of `tests/`, and one
  `progress.html` with the chip's new `stopPropagation` removed and nothing else altered: the two
  **matrix** cases failed (`GUARD` on `false !== true` for its named assertion, and the evidence
  case on `waitFor … chip g-p1 showing the armed ring (last value: false)` — it arms and un-arms in
  the same gesture) while **both schedule cases passed**. That is the direct proof the per-surface
  assertions are independent and that the one added line is necessary. Never place that doctored
  copy in the repository.
- **A synthetic `TouchEvent` produces no click, and that nearly made these cases prove nothing.**
  A real tap ends in a browser-synthesized click; a dispatched `TouchEvent` does not. The existing
  `MATRIX_TOUCH` helper therefore never exercised the bubbling path at all, and a case built on it
  would have passed just as happily against an element that had lost its `stopPropagation`. The new
  `TAP_REAL` helper fires the click by hand. **Generalise it:** when synthesizing a gesture, ask
  what the browser does *after* the events you are dispatching, or the case tests half the path.
- Both clickers go through `document.elementFromPoint` and refuse a point that lands inside a block
  or chip, rather than dispatching at the handler's own node — a direct dispatch would pass even if
  the click never bubbled out of a block, which is the entire thing these cases are about.
- **Not covered, and it is the entire point of the change:** a tap on real touch hardware. The
  cases synthesize events inside the page, which exercises the handler logic and not iPadOS gesture
  arbitration. A real device pass is owed. Drag was not re-verified either — the committed suite
  still simulates no schedule drag — so "a drag cannot cancel, because `preventDefault` suppresses
  the click" rests on code reading. Also not covered, as ever: the live Firebase project and print
  output.
- **Environment note.** `rg -rn "PATTERN" dir` is **not** `rg -n`: ripgrep reads `-r` as
  `--replace`, so `-rn` silently rewrites every match to `n` **in the output**. It made
  `TRACK_TEST_ROOT` look like it had been mangled to `process.env.n` in a file that was in fact
  untouched. Nothing was damaged, but the minute spent confirming that against `git show` is worth
  avoiding: use `rg -n`.

### A run that cannot leak (2026-08-25)

- **No data-contract change at all.** The slot stays at **23** fields, nothing was added to
  `SLOT_FIELDS`, the hand-written CONTRACT lists needed no change, `styles.css` was not touched
  and no `?v=` moved. Nothing here reaches `track_db` or any product page — this is test
  infrastructure only. One new offline suite, `tests/cdp-cleanup.test.js` (**13** cases),
  registered in `UNSWEPT_FILES`: no date code, so one run rather than five, matching
  `true-storage-core.test.js`, `graph-layout.test.js` and `doc-table-core.test.js`. Suites go
  14 → **15**.
- **This file already half-described the bug, in two separate entries, without anyone joining
  them up.** The
  2026-08-18 note records that "`Browser.close()` can fail with `ENOTEMPTY` … which is where the
  stray `/tmp/track-cdp-*` directories come from", and the 2026-08-22 note records 20-41 orphaned
  Chrome processes read as contention and costing an hour of waiting. Both were symptoms of one
  cause nobody had traced. **Two distinct leaks, and only the second one is the obvious one:**
  - **Leak A — the immortal node process.** `t.after(async () => { await browser.close(); await
    server.close(); })` is ONE statement. `fs.rmSync` had `maxRetries: 10, retryDelay: 100` —
    exactly **one second** of tolerance for Chrome flushing its profile on exit. On a loaded
    machine it threw, the throw escaped `close()`, **`server.close()` never ran**, and the still-
    listening HTTP server kept node's event loop alive forever. Nine such processes were found
    alive, aged 32-63 hours, every one having already printed `# fail 0` — the tests had PASSED
    and the process could not exit. `ss -tlnp` naming nine node PIDs each holding fd 21 is what
    turned a guess into a diagnosis; the process list alone had looked like this for days without
    anyone reading it that way.
  - **Leak B — the orphaned browser.** Nothing killed Chrome when node died first, and
    `proc.kill()` signals only the ROOT process, leaving the zygote, GPU process and one renderer
    per tab to reparent to init.
- **Fail-first, offline: 13 cases, 11 failed — and only TWO of those failures are evidence.**
  Cases 1 and 2 died on a real `ENOTEMPTY` escaping `close()`, which is the bug itself. The other
  nine died on `killTree is not a function`, `sweepStaleProfiles is not a function`, an undefined
  `_liveBrowsers`, and the module-surface list — all of which is just what a new export looks like
  and proves nothing on its own. **Read which failures are load-bearing before counting them**; a
  suite that goes 11-red to all-green is not 11 pieces of evidence. **Two cases passed on both
  sides by design and are the guards**: the `SIGTERM`→`SIGKILL` escalation, and a removal that
  succeeds. If either ever fails, the fix has broken what already worked.
- **Fail-first, browser: an A/B on the INTERRUPT path, which is the only way to see Leak B.** A
  scratch directory held symlinks to the repository, a REAL copy of `tests/` (never a symlink —
  `require`/`__dirname` resolve through the realpath, which this file already records as having
  cost one run a false pass) and **one** doctored file: `tests/lib/cdp.js` exactly as
  `git show HEAD:` returned it. Both trees were driven identically — start
  `node --test tests/browser.test.js`, wait for Chrome, `SIGINT` it with 11 Chrome processes live:

  | | pre-fix | post-fix |
  | --- | --- | --- |
  | profile directories left behind | **1** | **0** |
  | Chrome survivors | **11** | **0** |

  Never place that doctored copy in the repository.
- What changed, in the order that matters: `close()` **cannot throw** (the `rmSync` is wrapped and
  warns instead); Chrome spawns `detached` so `killTree` can signal the process **group** via a
  negative pid, falling back to the single process on `ESRCH`; a module-level registry plus
  `process.once('exit' | 'SIGINT' | 'SIGTERM' | 'SIGHUP')` reaps whatever is still live, using only
  synchronous calls because `'exit'` permits nothing else; and `launch()` sweeps `track-cdp-*`
  directories older than a day. `browser.test.js`'s teardown is now `try/finally` — belt-and-braces
  once `close()` is total, but it is the line the leak was made of.
- **The sweep is bounded by BOTH a prefix and an age, and is tested for what it must NOT delete.**
  It is the only code in this repository that removes something the current run did not create. A
  day is far past the 11-14 minutes a full suite takes, and a live Chrome keeps its own profile's
  mtime fresh — both 59-hour-old orphans showed that day's mtime — so a concurrent session is
  never swept out from under itself. Three of the 13 cases assert non-deletion: a fresh directory,
  an unrelated name, and `track-cdp` without the trailing dash.
- **A lesson about the tooling, not the product, and it cost a wrong claim.** `nohup node
  tests/run.js … &` inside a backgrounded call reports **exit code 0 the moment the wrapper shell
  exits**, while the suite is still running. The completion notification was believed, the leftover
  Chrome processes were briefly read as a failure of the fix, and they were in fact a *live* run.
  This is the same shape as the `# pass 1` lesson already in this file: **the summary you are handed
  is not the one you asked for — check the thing itself** (`ps` for the pid, the plan count for the
  suite).
- **`pgrep -fc` counts your own shell.** `pgrep -fc browser.test.js` returned 2 against a genuinely
  clean machine, because the invoking command line contained the string. This is the same
  self-match that makes `pkill -f "user-data-dir=/tmp/track-cdp-"` kill its caller. List and read
  the matches; never trust the count.
- **One-time cleanup performed.** 21 processes (13 node, 6 shell wrappers, 2 Chrome roots) killed
  by explicit PID after re-verifying each against `/proc/<pid>/cmdline` and `pcpu`, and 31 profile
  directories totalling **1.8 GB** removed via `sweepStaleProfiles` itself, which dogfooded the new
  code against the exact mess it exists to prevent.
- **What was run: `node tests/run.js` end to end TWICE, and the second one is the one that
  counts.** Run 1 passed all 15 suites in 9.5 minutes on a machine made quiet by this task's own
  cleanup — but `cdp.js` was edited *while it was running*, so it had tested a module that no
  longer existed on disk. The two edits were provably inert for that path (a moved comment, and an
  early return that only fires when Chrome has already exited, which it has not at teardown), and
  it would have been easy to reason the second run away. It was run anyway: **all 15 suites pass
  on the final tree** — calendar-core (88) and schema (54) under all five swept timezones with
  identical results, true-storage-core (24), graph-layout (21), doc-table-core (42), cdp-cleanup
  (13), and **168 browser subtests, all passing** in 13.6 minutes under a load average of 2.5.
  Immediately after it: **0** `track-cdp-*` directories, **0** Chrome survivors, **0** node
  survivors, **0** stray listeners, and **0** of this suite's own scratch directories — the first
  time this repository can claim that. **A run against code you have since edited is not a run**,
  however small the edit and however sound the argument; the argument is what you write down when
  re-running is genuinely impossible, not instead of a re-run that costs ten background minutes.
- The browser file has grown from the 157 the previous entry records; that growth is other
  sessions' work, not this task's, which adds **no** browser case and changes only the teardown
  line.
- **Timing, since two entries above quote 11-14 minutes as if it were a constant:** the same suite
  took **9.5** minutes idle and **13.6** minutes at load 2.5, on the same machine, the same day.
  Treat the range as a load measurement, not a property of the suite.
- **Not covered.** A `SIGKILL` of node itself, which no handler can intercept — the day-old sweep
  is the backstop and is why it earns its place. Windows and macOS process-group semantics are
  unexercised; this ran on Linux only. And the suite still simulates no drag and touches no real
  hardware, unchanged by this work.

### Draggable table columns, and cells that wrap (2026-08-25)

- **No `track_db` slot change at all.** The slot stays at **23** fields — `colWidths` is an
  item-level key inside a block inside the existing `docPages` list — so the hand-written
  CONTRACT lists in `tests/schema.test.js`, `tests/browser.test.js` and `tests/lib/fixture.js`
  needed no change. `styles.css` was **not touched**: `table-fixed`, `relative`, `absolute`,
  `cursor-col-resize`, `touch-none` and `break-words` are all Tailwind utilities and the width
  itself is an inline `<col>` style, so no `?v=` moved except `doc-table-core.js?v=1` → `?v=2`
  in `documentations.html`, the only page that loads it. Offline cases in
  `tests/doc-table-core.test.js` go 42 → **57** (still run once, not swept — no date code).
  This task adds **three** browser cases and rewrites the cell selector in one it inherits.
- **The inherited case is a consequence, not a tidy-up.** `merging hides the covered cell, and
  unmerging restores it exactly` selected cells through `.doc-table td input`; the cell is a
  textarea now, so it reads `.doc-table td textarea`. It must go on passing, and it does — it
  is the guard that the wrapping change did not disturb merge geometry. The other inherited
  guard needed no edit at all and is the load-bearing one: *a pasted table with nothing merged
  is stored with NO merges key* asserts `Object.keys` is exactly `['id','type','rows']`, which
  is what proves `colWidths` is genuinely absent by default.
- **Fail-first, offline: 57 cases, 15 failed — and only ONE of those failures is evidence.**
  Fourteen died on `colWidthsOf is not a function` and the like, which is just what a new export
  looks like. The one that counts is `withRows leaves a table that was never resized with NO
  colWidths key`, which **passed on both sides** by design — the absence guard. Read which
  failures are load-bearing before counting them; a suite that goes 15-red to all-green is not
  15 pieces of evidence. This is the `cdp-cleanup` lesson in a second shape.
- **Fail-first, browser: the whole-feature baseline proved almost nothing, and that is the
  lesson.** A `TRACK_TEST_ROOT` tree of symlinks to the repository plus the two pre-change files
  (`documentations.html`, `doc-table-core.js`, both real copies) failed all three new cases —
  every one on a `waitFor` timeout for a selector that did not exist yet. That is
  "the control is absent" evidence, not behavioural evidence, and it is exactly the shape the
  TOUCH-sidebar entry warns about. Three **doctored** baselines were built instead, each
  symlinks plus **one** file with a single rule reversed, and their failure sets are
  informative:
  - `withColWidths` never DELETING the key → **only** `⇔ auto width asks first, and Cancel
    keeps the widths` failed, on `the reset reaching track_db` — the case's own named claim.
    The drag case and the wrap case passed.
  - `resizeColumn` not making the NEIGHBOUR pay → **only** the drag case failed, and on a hard
    assertion rather than a timeout: `while the column beyond the boundary did not move`,
    `26.05 !== 33.33`. Without the neighbour absorbing the change, normalisation spreads the
    cost across every column, which is the whole reason the total has to be conserved at the
    pair.
  - the cell reverted to an `<input>` → the wrap case **and** the inherited merge case failed,
    which is not a defect in the pairing but the visible cost of the selector change.

  The first two sets are disjoint and each fails on its named assertion. Never place any of the
  five baseline copies in the repository.
- **Two real defects were found by the browser cases and would both have shipped as a white
  screen, not a cosmetic bug.** Both are `Maximum update depth exceeded`, from different causes,
  and both are now written into the data-contract section:
  1. `AutoTextarea`'s new `ResizeObserver` fired on **height** as well as width. `fit()` sets
     the element's height, which changes the parent's height, which is a resize — an infinite
     re-fit. Gating on `clientWidth` changing is the fix; observing the textarea instead of its
     parent has the identical loop, so there is no "observe the other element" escape.
  2. The drag's `end` called the parent's `onChange` from **inside a functional `setState`
     updater**. React runs updaters during the render phase, so that is a side effect during
     render. The drag state lives in a ref beside the state now and the handler reads it
     synchronously. **Generalise it:** a functional updater is for computing the next state and
     nothing else — never read the in-flight value out of one to act on, and never call another
     component's setter from inside one.
- **A defect in this task's own test, of the kind that reads as a product bug.** The auto-width
  case passed `['auto width']` to `CLICK_SOON_TEXT`, which matches `textContent.trim()`
  **exactly**, so the button was never found and the failure said `the control exists` — which
  looks exactly like a missing control. The label is `⇔ auto width`, glyph included. Check the
  helper's matching rule before believing a "control not found".
- Percentages rather than pixels was chosen against the user's stated preference to have widths
  survive printing — it is the way to *honour* it. A pixel width prints at 96-per-inch and
  overflows A4 the moment a table gets wide; a ratio prints at whatever the page turns out to be
  and cannot overflow at all, because widening a column narrows its neighbour.
- **What was run: `node tests/run.js` end to end THREE times, and only the third one counts.**
  `node --check` passes on all nine shared modules. The final run: **all 15 suites pass** —
  calendar-core (88) and schema (54) under all five swept timezones with identical results,
  true-storage-core (24), graph-layout (21), doc-table-core (**57**), cdp-cleanup (13), and
  **170 browser subtests, 0 failures** in 13.4 minutes, with `md5sum -c` confirming the tree
  **byte-identical across the whole run**. No absolute browser total is claimed as this task's:
  another session was adding to `tests/browser.test.js` and `documentations.html` throughout,
  and only the delta of three is this task's.
- **Why the first two runs did not count, and both reasons are worth carrying forward.**
  - Run 1 reported all 15 suites passing — and the `md5sum -c` taken across it showed
    `documentations.html` had **changed while it ran**, because the other session landed its
    `TABLE_AI_BRIEF` edit mid-run. That is the `f29f3cf` / `1cf7b23` hazard in a third shape:
    the result was a run against a file that no longer existed on disk. The edit was provably
    inert here (a string array), and it would have been easy to reason it away; it was re-run
    instead. **Take an `md5sum` of the tree before a long run and check it after** — on this
    machine the tree can change without you touching it.
  - Run 2 was against a byte-identical tree and reported **2 of 170 failing**: cases 96 and 97,
    `malformed track_db (a goal has invalid children)` and `a malformed database survives a
    reload`, on `CDP connection closed` and a `progress.html mounting` timeout. That is the
    contention symptom the 2026-08-18 entry already names, in the section it already names as
    the suite's heaviest. Both passed in isolation immediately afterwards, and both passed in
    run 3.
- **The contention was not another test run, and the process list said so only if read
  properly.** There was exactly ONE `tests/run.js` alive — mine. `ps -eo pcpu --sort=-pcpu`
  showed the real cause: GNOME's `tracker-extract-3` pinned at 78% for over twenty minutes,
  indexing, with `tracker-miner-fs-3` behind it. **Look at what is actually burning CPU, not at
  how many test processes exist.** Two further traps hit in the same five minutes: `pgrep -f
  "tests/run.js"` matched the wait-loop shells that contained that string in their own command
  line and reported a run in progress when none existed — the self-match this file already warns
  about — and a quiet-check written as `ps --sort=-pcpu | head -1` always reads **`ps` itself**
  at ~100%, so it never fires. Skip the first row, or watch `/proc/loadavg`.
- **A trailing `grep` for failures makes a passing run exit 1.** The final run's wrapper
  reported exit code 1 while the log said `all 15 suites passed`, because `grep -E "^ *not ok"`
  exits 1 when it matches nothing and it was the last command in the chain. `node tests/run.js`
  itself had already printed `EXIT=0`. The `# pass 1` lesson again: **check the thing itself,
  not the summary you were handed.**
- **Not covered, and stated plainly.** Real touch hardware: the drag is synthesised from
  `PointerEvent`s inside the page, which exercises the handler and not iPadOS gesture
  arbitration, momentum, or scroll interception — and the handle is a 6px target, so a real
  finger pass is genuinely owed. Print output of a resized table was **reasoned about and not
  looked at**: no `@media print` rule sets `table-layout` or touches a `<col>`, and the blanket
  flatten rule forces colour and border but never width, so the colgroup survives by
  construction — but nobody has printed one. Also not covered, as ever: the live Firebase
  project.

### A merged cell you can type into, and movable rows and columns (2026-08-26)

- **No data-contract change at all.** The slot stays at **23** fields, nothing was added to
  `SLOT_FIELDS`, and the hand-written CONTRACT lists in `tests/schema.test.js`,
  `tests/browser.test.js` and `tests/lib/fixture.js` needed no edit. Nothing here is a new
  stored key: a move is a **permutation** of `rows`, `merges` and `colWidths`, and the fill
  is geometry. That mattered concretely — three browser cases pin a table block's whole
  shape (two `assert.deepEqual` of the block, one `Object.keys === ['id','type','rows']`),
  and an offline GUARD case asserts a move on an unmerged table gains no `merges` key, so a
  writer that stored `merges: []` would break all four for nothing. `styles.css` was **not**
  touched and no `?v=` moved except `doc-table-core.js?v=2` → `?v=3`, its only loader being
  `documentations.html`. Offline cases in `doc-table-core.test.js` go 57 → **73**; browser
  subtests go 170 → **176**.
- **The CSS this was planned around does not work, and only measuring found that.** The plan
  was `min-height: 100%` on the cell's textarea, on the widely-repeated belief that
  percentage heights resolve against a table cell. A standalone probe says otherwise in this
  Chrome: in a 165px `rowspan` cell, `min-height:100%` left the box at **32px** and
  `height:100%` at **36px** — neither resolved. The fix is a computed floor instead
  (`Math.max(scrollHeight, parentElement.clientHeight)`), and `styles.css` went back to
  untouched along with the five `?v=` bumps that had already been made for it. **Generalise
  it: a layout belief that degrades SILENTLY to the current behaviour cannot be confirmed by
  the page looking unchanged** — the case has to assert the number, and the number has to be
  looked at before the mechanism is chosen.
- Two things about `AutoTextarea.fit()` are load-bearing and are written into the data
  contract above. It sets `height:auto` **before** reading either number, so the cell height
  it reads is what the OTHER rows demand rather than what its own last write imposed — which
  is what makes it idempotent. And the ResizeObserver's new height gate is restricted to
  **filled** cells, because a rowSpan cell grows when a neighbouring row does (changing no
  width) while an unfilled cell never reads the floor at all, so admitting height there would
  be pure loop risk against a file whose own comment records an ungated observer killing the
  page with "Maximum update depth exceeded".
- **Fail-first, part one: the working tree WAS the pre-change file**, so the fill case needed
  no scratch directory. It failed on the assertion it is named for —
  `the text box FILLS the merged cell rather than sitting one line tall at its top (28 of 102px)`
  — with both preconditions passing, which is what proves it could see the cell. It was then
  **run a second time with its two claims reordered**, because AGENTS.md already records that
  a case asserting N claims is proven for exactly the one that fired: the hit-test claim then
  failed on its own, naming the dead space by its own class list —
  `hit td.relative.border.border-gray-700.p-0.align-top`, the bare `<td>` with no click
  handler.
- **Fail-first, part two: five doctored baselines, and the failure sets separate cleanly.**
  Each was a `TRACK_TEST_ROOT` of symlinks to the repository plus **one** doctored file, and
  the builder **prints the root it serves** on every run — the 2026-08-22 entry records a
  false all-green from a mis-set variable, and that is cheap insurance against repeating it.

  | doctored | fails | on |
  | --- | --- | --- |
  | `moveLine` skips the merge remap (the `withRows` trap) | the band case, alone | `r: 1` where `r: 2` was expected |
  | `lineBands` ignores merges — a plain adjacent swap | the band case, alone | `last` landed INSIDE the band |
  | `moveLine` does not permute `colWidths` | the width case, alone | `[20,30,50]` where `[30,20,50]` |
  | the button's `disabled` gating removed | the edge case | `the top row cannot go up` |
  | the selection does not follow the moved line | the repeat-press case, alone | `last` back at the bottom |

  A sixth, on the fill half: removing the observer's height gate fails the
  neighbour-grows case **alone** while the fill case passes. Never place any of these six in
  the repository.
- **And one whole-file baseline, which the environment chase produced as a by-product.** A
  complete run against a served tree holding the committed `doc-table-core.js` and
  `documentations.html` and nothing else changed failed **exactly** the six cases this task
  adds — 116 through 121 — and passed all 170 others. That is the cleanest statement of
  fail-first available: not six separate arguments, one run in which precisely this task's
  cases are red and nothing else is. It is also why the per-mechanism baselines above still
  earn their place — this one proves the cases need the feature, those prove each case needs
  its own half of it.
- **A limitation found by reasoning, not by a failure, and worth the paragraph it cost.**
  Bands mean a merge gluing a whole axis freezes that axis — and a full-width
  `| Total | << | << |` footer, which is in this repository's own paste examples, does
  exactly that to every column. The first implementation reported it as "This is already
  the first column", which is true of a one-column table and unactionable here, so
  `canMoveLine` now names the single-band case specifically. Reordering INSIDE a region
  was considered and rejected: the rectangle would survive it, but the owner cell would
  start drawing text that had been covered, which reads as loss. **The general point is
  that a refusal inherited from a general rule still has to be phrased for the case that
  actually triggers it** — the user cannot act on a reason that describes a different
  situation.
- **A real usability defect the tests surfaced rather than the code reading.** With the
  selection left pointing at the coordinate a move had emptied, a second press of the same
  button moved whatever slid into it — the first click did what was asked and the second
  undid half of it, which is worse than a button that does nothing. `canMoveLine` now returns
  `to`, computed where the band arithmetic lives rather than at the call site, and a browser
  case presses the same button twice.
- **Two defects in this task's own tests, both caught by reading the message.** (1) The
  "never changes cell text" case compared rows joined into strings — but a COLUMN move
  legitimately reorders the cells inside a row, so it failed on exactly the permutation it
  had asked for. It compares the multiset of cells now. (2) The band case first waited for
  the *right answer* to appear in `track_db`, so a wrong move timed out instead of reporting
  itself; against the `lineBands` baseline it produced a bare `waitFor timed out` and proved
  nothing. It waits for the write to LAND and then asserts, and the same baseline now fails
  with the actual rows. **A case that dies on its own `waitFor` says the control is
  unreachable, not that it is wrong** — that lesson is now in this file four times, in four
  shapes.
- **Environment note, and the wrong turn taken chasing it is the part worth keeping.** Two
  consecutive `node tests/run.js` runs failed the SAME single subtest — `a soft flaw (a
  dangling activeSlotId) still loads and stays editable`, on `waitFor timed out after
  15000ms — progress.html mounting`. Twice is not a flake you may wave away, and this task's
  first three attempts to clear it all proved nothing:
  - It passes run ALONE, and the whole 33-case malformed-`track_db` section passes together.
    Neither is evidence: the failure needs the cumulative state of a full run to appear.
  - Capped at the first 98 cases it passes on BOTH trees — but the cap changes the harness
    (direct `node file.js` rather than `node --test` after fourteen offline suites), so that
    comparison answers a different question than the one asked.
  - A full run against a pristine served tree passed case 98 — but it was run DIRECTLY, not
    through `run.js`, so it too was unmatched. **A control that differs from the failing run
    in two ways isolates neither.** On that single unmatched pass this task briefly concluded
    the regression was its own; it was not.
  The matched control — `TRACK_TEST_ROOT=<pristine> node tests/run.js`, same harness, same
  machine, only the two product files reverted — settled it by failing case **101** (`a
  healthy database is untouched by the load boundary`, which mounts all five pages in a loop)
  while passing 98. **Both trees drop a heavy page-mount case; which one falls over varies
  per run.** The cause is structural: every one of those mounts pulls React, ReactDOM, Babel,
  Tailwind and three Firebase scripts from `unpkg` and `gstatic`, and this session hit three
  outright CDN failures. `progress.html` loads *nothing* this task changed — checked, not
  assumed — so no causal path existed in the first place.
  **Generalise it: when a browser-layer failure reproduces, build the control that differs in
  exactly ONE variable before believing either verdict.** A reproducible failure is not proof
  of causation, and a single green control is not proof of innocence.
- **Environment note, and it is a new one.** Three separate browser runs failed on
  `realErrors` being non-empty with `ERR_CERT_VERIFIER_CHANGED` / `ERR_SOCKET_NOT_CONNECTED`
  fetching Firebase and Tailwind from their CDNs, plus the `ReferenceError: firebase is not
  defined` that follows. Every one passed on an immediate re-run. These pages load four
  scripts from `gstatic.com` and `unpkg.com` at mount, so **any** case in this suite can fail
  on a network blip in a way that looks like a product regression and even lands on a
  plausible-looking assertion. Read the actual `realErrors` payload before believing one.
- **Not covered, and stated plainly.** The four buttons live in the editor-body `.doc-chrome`
  strip, which has **no** `@media (hover: none)` fallback — only `.docs-sidebar
  .doc-row-acts` gets one — so on a touch device the whole table chrome stays at `opacity-0`
  and this feature is **unreachable**. That is pre-existing and not introduced here, but it
  is the largest gap in this entry and it is a real one: the complaint that prompted the work
  may well have come from such a device. Print output of a filled merged cell was reasoned
  about and looked at only through the existing print rules, never printed. Real touch
  hardware and the live Firebase project are unverified as ever.

### Creating work from a calendar day (2026-08-31)

- **No data-contract change at all.** The slot stays at **23** fields, nothing was added to
  `SLOT_FIELDS`, and the hand-written CONTRACT lists in `tests/schema.test.js`,
  `tests/browser.test.js` and `tests/lib/fixture.js` needed no edit — a Task or Routine is an
  ordinary node in the existing `goals` tree and an Action is an `saActions` record plus its
  `saEntries` row. `styles.css` was **not** touched (Tailwind utilities only) and no shared JS
  module changed, so **no `?v=` moved**. The offline suites are untouched and pass identically
  under all five swept timezones. This task adds **five** browser cases and one prop
  (`setSaActions`) to `SchedulePanel`.
- **No new date code, which is the cheapest part of the change.** The picker is opened per-day and
  already holds `ds`, a local calendar day string, so nothing here constructs a `Date` and the
  `toISOString().split('T')[0]` hazard is not in play at all.
- **Reuse rather than a second definition.** The goal branch is one `setGoals` updater composing
  `addChildAndTransferNotes` (so the first-child note transfer behaves as it does from the Goals
  panel) with `updateSchedule` (which already forks on `taskType`). The action branch mirrors
  `assignSAToDate`. `taskParentOptions` is the only new function, and it is deliberately NOT
  `getAllParentNodeIds`: that one answers "which nodes already have visible children", which is
  the wrong question — a leaf is a perfectly good parent for a new task, it simply stops being a
  leaf, and excluding leaves would hide most of the tree from the control that needs it.
- **Fail-first: three doctored baselines, and their failure sets are exactly DISJOINT.** Each was a
  `TRACK_TEST_ROOT` of symlinks to the repository plus **one** `progress.html` with a single rule
  reversed, and the builder **prints the root it serves** on every run — an earlier task in this
  file records a false all-green from a mis-set variable:

  | doctored | fails, alone | on |
  | --- | --- | --- |
  | the `updateSchedule` step dropped (created, never dated) | the task case and the routine case | `expected '<today>', actual undefined` |
  | the `setSaEntries` push dropped (action created, no entry) | the supporting-action case | `0 !== 1` on the entry count |
  | the parent refusal removed **entirely** | the refusal guard | `false !== true` on Create being disabled |

  Every one failed on the assertion its case is **named** for, which is why the named claim is
  written first in each. `GUARD: creating from the picker writes no key progress.html does not own`
  passed against all three, as a guard must. Never place any of the three doctored copies in the
  repository.
- **The third baseline passed on its first build, and that was the finding.** It deleted the two
  refusal lines the case was written against — and all five cases went green, because the
  cross-tab membership check added later *also* refuses an empty `parentId`, so the behaviour was
  still there. The doctoring had removed part of a refusal rather than the refusal. Rebuilt to
  delete the whole block, it fails the guard alone. **Generalise it: when a refusal has grown a
  second path, a baseline that reverses only the first proves nothing — and it reads as
  all-green, which is indistinguishable from the case being wrong.** It is also the evidence that
  the three checks are not redundant: they fire in order so the message names the user's actual
  situation ("create a goal first" / "choose what this sits under" / "that goal is no longer
  there") rather than the last one to match.
- **One of this task's own cases failed for the wrong reason first, and fixing it is the point.**
  The supporting-action case originally waited for BOTH `saActions` and `saEntries` to be non-empty
  and then read them. Against the dropped-`setSaEntries` baseline it died on
  `waitFor timed out after 15000ms — the action and its entry reaching track_db`, which says the
  control is unreachable and says nothing about the entry. It waits for the **write to land**
  (`saActions` non-empty) and asserts afterwards, and the same baseline now fails on `0 !== 1`.
  This is the same lesson this file already records in four other shapes: **never wait for the
  right answer to appear.**
- **A defect found by reading the diff, which no test would have caught.** `addChildAndTransferNotes`
  and `updateSchedule` both walk for an id and return the tree **untouched** when they do not find
  it. A `parentId` pointing at a goal another tab had deleted would therefore have closed the modal
  having written nothing at all — the typed task simply gone, with no error anywhere. The refusal
  now checks the chosen parent is still in the options list. It is covered by code reading only:
  exercising it needs a genuine cross-tab `storage` refresh landing between the modal opening and
  Create being pressed, and the committed suite does not drive that here.
- What the cases assert beyond the reversals: the new node is a leaf with `completed: false` and a
  string id from `TrackStorage.newId()`; a routine occupies the day through `routineDates[day]` and
  leaves `scheduledDate` alone, which is the arm the plain-task case never reaches; an action's
  entry points at the action it was created with; and the refusal asserts the **Cancel path** —
  `track_db` byte-identical after clicking the disabled button anyway.
- Nothing here deletes or clears, so nothing asks for confirmation. That is deliberate and sits
  beside merge/unmerge and line-move in the destructive-control rule's exemptions.
- **Not covered.** Real touch hardware — the bar is ordinary form controls, but it is reached
  through a 28px day-header button this repository has already had reachability trouble with, and
  a real device pass is owed. The cross-tab parent refusal above. The live Firebase project and
  print output, as ever; the picker is a modal and prints nothing.

### The Home legend became the filter (2026-09-05)

- **No data-contract change at all.** Nothing was added to `SLOT_FIELDS`, the hand-written
  CONTRACT lists in `tests/schema.test.js`, `tests/browser.test.js` and `tests/lib/fixture.js`
  needed no edit, and nothing here reaches `track_db` — the GUARD case asserts it byte-identical
  across the whole interaction. The filtering machinery already existed: all three collectors in
  `calendar-core.js` take `opts.hidden` and `documentations.html` was already a caller; Home
  simply passed nothing, which its own comment said in as many words. `styles.css` changed, so
  `?v=7 → ?v=8` in **all five** pages. This task adds **five** browser cases and no offline ones.
- The new browser key is `track_home_cal_hidden`; its rules are in the data-contract section
  above. The `home` segment is load-bearing rather than decorative — NOTES keeps a Progress
  schedule filter as a live idea, and that surface must not inherit Home's choices.
- **Only five of the thirteen categories are switchable here, and that is the user's decision,
  not an oversight.** The legend has always drawn exactly these five, and the ask was to make the
  legend clickable. The other eight stay unfiltered on Home.
- **Fail-first: four doctored baselines, and their failure sets are NOT disjoint — which is worth
  stating plainly, because every previous entry in this file got to claim disjointness and this
  one cannot.** Each was a scratch tree of symlinks to the repository plus **one** `index.html`
  with a single rule reversed. The runner executes the REPOSITORY's `tests/browser.test.js` and
  points only the HTTP server at the doctored tree via `TRACK_TEST_ROOT`, which sidesteps the
  realpath trap this file records (a symlinked `tests/` resolves through to the repo's own modules
  and gives a false pass) by not copying `tests/` at all. It prints the served root and its md5
  beside the repository's on every run, and **refuses to run a tree that is byte-identical to the
  repository** — an earlier task here lost a run to a mis-set variable reading as all-green.

  | tree | reversal | fails | passes |
  | --- | --- | --- | --- |
  | **A** | the three collector calls reverted to no-opts | dots, milestones, reload, corrupt | GUARD |
  | **B** | `calReadHidden` replaced by a module cache initialised `[]` | reload, corrupt | dots, milestones, GUARD |
  | **C** | the hidden set narrowed to the CATS keys on its way out | milestones, reload | dots, corrupt, GUARD |
  | **D** | the read unhardened to `JSON.parse(getItem(k) \|\| '[]')` | corrupt | dots, milestones, reload, GUARD |

  Every failure landed on the assertion its case is **named** for — no `waitFor` timeouts — which
  is the property that matters more than disjointness. `D ⊂ B ⊂ A` and `C ⊂ A`, but **B and C
  contain each other's complement**: B fails the corrupt case and passes milestones, C does the
  reverse. So each of the three narrow cases is individually load-bearing — the dot case is the
  only thing separating A from the rest, the milestone case the only thing separating C from B
  and D, and the corrupt case the only thing separating D from C. The reload case alone would
  catch A, B and C but never D. Never place any of the four doctored copies in the repository.
- **The absence baseline was run first and deliberately not counted as evidence.** Against the
  untouched tree all five cases died on the same `waitFor timed out — the Home legend toggles`,
  which says the control does not exist and nothing about the behaviour each names. That is the
  weak outcome this file already records from the TOUCH-sidebar work; the four trees above are
  the actual evidence.
- **A `waitFor` timeout was turned into a named assertion, and the case is materially better for
  it.** The corrupt-value case first failed against tree D with a bare timeout — because a stored
  `'42'` makes `new Set(42)` throw out of `buildBuckets` → `renderCalendar` → `renderSlots`, so
  the legend is never built. True, but indistinguishable from "the control was never written".
  `renderSlots` fills `#slot-list` **before** calling `renderCalendar`, so the case now waits on
  the slot list — proving the page script ran — and then asserts the five toggles exist. Tree D
  now fails with `the calendar survived the stored value 42 (it did not throw out of
  renderCalendar)`, which names the mechanism. **Generalise it: when the symptom under test IS a
  dead render, find the thing that renders BEFORE it and wait on that instead**, or the evidence
  is a timeout that reads the same as a missing selector.
- **A defect in this task's own test, found by reading the design rather than by running it.**
  The corrupt-value case asserted all four dots present for every seeded value — including
  `'["note",7,{}]'`, where the clamp correctly keeps `note` and the right answer is three dots.
  Worse than a wrong number: a uniform "everything is shown" expectation would also have passed
  against a reader that bailed to `[]` on the first bad member, silently discarding a real stored
  preference. Each value now carries its own expectation, and `'["note",7,{}]'` is the one that
  still hides something. It was independently confirmed by a concurrent full-suite run that
  caught the old assertion at `3 !== 4` before the fix landed.
- The clamp is the load-bearing half of the reader and is why the hidden set can be handed to
  **all three** collectors rather than only the two that read these five keys. Without it a stray
  or hand-edited `"task"` would reach `buildDaySchedule` and hide the Home day preview's goal
  tasks with no control on screen to bring them back; with it, every key that can hide something
  has a visible toggle. The corrupt-value case seeds exactly that and asserts the day preview
  still draws its block.
- The growth rings keep their explicit `buildBuckets(slot, y, m, null)` and gained a comment
  saying why: they are the workspace's record, not a view of it. A future "make this consistent"
  pass is the thing that comment exists to stop.
- Keyboard focus is restored by hand after each toggle. `renderCalendar` does
  `legend.innerHTML = ''`, so the button just pressed no longer exists — a regression this design
  introduces rather than inherits, since the legend had no focusable children before.
- **Not covered, and stated plainly.** Real touch hardware: the rows gained vertical padding for
  a tap target and the legend wraps to two lines on a phone, but nothing was tapped on a real
  device. Print output was not looked at — there are no `@media print` rules for `body.home` at
  all, so the legend prints as it always has, now with buttons in place of spans. The live
  Firebase project, as ever. The cross-tab branch is covered by code reading only: the committed
  suite drives no second Home tab, so the claim that another tab's toggle re-renders this one
  rests on the `storage` listener being the same one `track_db` already uses.
- **Environment note.** Another session was landing a large "schedule paste" feature in this
  repository throughout this task — `calendar-core.js`, `schema.js`, `progress.html`,
  `documentations.html` and `tests/` all changed under it, and `tests/browser.test.js` changed on
  disk mid-edit. Its work was preserved, and the dependencies this task relies on were re-checked
  against the moved files rather than assumed: `CATS` is still the same four entries, and the
  `ref` entry that feature added to `FILTERS` is deliberately not in `CATS`, so this legend is
  unaffected. That session's own run reported `export → import preserves docPageId and every
  canonical field` failing at `24 !== 23` — a 24th `SLOT_FIELDS` row landed without the
  hand-written CONTRACT lists following it. That failure is that feature's to resolve and was
  left alone.

### JSX accents routed through the theme (2026-09-05)

- **No `track_db` change at all.** The slot stays at **24** fields, nothing was added to
  `SLOT_FIELDS`, and the hand-written CONTRACT lists in `tests/schema.test.js`,
  `tests/browser.test.js` and `tests/lib/fixture.js` needed no edit — nothing here is
  persisted, and every case asserts `track_db` untouched by construction (they only read).
  `styles.css` changed, so `?v=8 → ?v=9` in **all five** pages. The offline suites are
  untouched and pass identically under all five swept timezones. This task adds **8** browser
  cases and **10** `data-accent` hooks (9 literal, plus `today-cell` written conditionally);
  scope was `progress.html` only, by the user's choice.
- **The defect was measurable, not merely aesthetic, and measuring it first is what shaped the
  fix.** On the three Grit surfaces the JSX literals ran from **1.43:1** (cyan `#22d3ee`)
  through amber 1.60, emerald 1.89, violet 3.16 to indigo 3.34 — every one under the 4.5:1 bar
  this repository already asserts for text. The sharpest single instance: the donut's `0%`
  label rendered `rgb(226,232,240)` on a `#f1f3ee` surface, which is invisible rather than
  merely wrong. **Measure before choosing a mechanism** — the numbers are what turned "route
  these through the theme" into a per-role token table with a test that can fail.
- **A correction that changed the plan mid-task, and it is the lesson worth carrying.** The
  approved plan claimed Night needed no fix and would be byte-identical. That was checked
  against the wrong surface set; re-measuring showed indigo at **3.43:1** and violet at
  **3.62:1** on the *Night* surfaces too. Three hues genuinely passed and stayed byte-identical;
  two did not and moved one Tailwind shade lighter. **A claim of "no change here" is a
  measurement, not a default** — and it was the second measurement, not the first, that was
  right.
- **Fail-first, and the hooks landed as their own step.** The `data-accent` hooks went in
  alone and `node tests/run.js` was run to **all 16 suites green** before one colour moved, so
  no later failure could be blamed on a missing hook (the TOUCH-sidebar lesson). Then the cases
  were run against the untouched tree: **6 of the 7 failed**, each on its own named assertion or
  on `--color-accent-live is undefined` — never on a `waitFor`. The one that passed was the DATA
  guard, which is what a guard is for.
- **That first run also caught a defect in this task's own tests, and it is the reason to read
  the message rather than the count.** A case written as `GUARD: under Night the donut arc
  renders the indigo it always has` failed with `rgb(79, 70, 229)` where it expected
  `rgb(99, 102, 241)` — because `DonutChart` picked `#4f46e5` below 50% and `#6366f1` above, and
  the seed sat at one of three tasks done. A guard that fails against the tree it is supposed to
  describe is not evidence of a bug; it is a wrong assertion. Combined with the Night contrast
  correction above, the case was rewritten into `ACCENT: under Night the donut arc brightens to
  the tuned indigo` and now names both discarded shades explicitly.
- **Six doctored baselines, each a tree of symlinks plus ONE file.** The runner **prints the
  served root and the doctored file's md5 beside the repository's, and REFUSES to run if they
  are byte-identical** — it caught a mis-anchored doctoring attempt on its first use, which is
  exactly the false all-green this file already records losing a run to. It also verifies the
  symlink count, after a failed glob served a half-empty tree and every case failed for a
  reason unrelated to the bug.

  | doctored | fails, alone | on |
  | --- | --- | --- |
  | `progress.html` — `DonutChart`'s colour const reverted to the indigo literals | the donut case **and** the Night-arc case | `the donut arc strokes the accent token, not indigo` / `Night: the arc is the tuned indigo-400` |
  | `progress.html` — **only** the donut ring track back to `stroke=` | the donut case | `the track ring is the surface-strong token` |
  | `progress.html` — **only** the hero ring track back to `stroke=` | the hero-track case | `the hero track is the surface-strong token` |
  | `styles/styles.css` — the **Grit** `--color-accent-study` deleted | the contrast case | `worst accent pair is --color-accent-study on --color-surface-muted at 2.03:1` |
  | `styles/styles.css` — the Grit `.text-cyan-*` rule un-repointed to a stale hex | the class-sibling case | `rgb(31, 85, 96)` vs `rgb(42, 98, 112)` |
  | `progress.html` — **only** the today outline back to `'1px solid #6366f1'` | the today-outline case | `the today outline is the accent token, not indigo (rgb(99, 102, 241))` |

  The two ring-track baselines are the point: each fails its own copy's case while the other
  passes, which is the direct proof that two copies of one literal are asserted **separately**
  and neither can hide behind a passing sibling. Never place any of the six in the repository.
- **Two cases separate value from relationship, and the Grit-token baseline proves it.** With
  the Grit `--color-accent-study` deleted the token falls through to its Night value — so the
  class rule, which now points *at the token*, moves with it and the **class-sibling case still
  passes** while the contrast case fails. That is not luck; it is the single-definition property
  working, and it is why both cases exist.
- **One GUARD case passes on both sides by design.** `GUARD: the hero ring ARC keeps its goal
  colour in BOTH themes` pins that `heroColor` is `PALETTE[activeIdx]` — a goal's identity, not
  chrome — and it survived every baseline. It is the thing standing between this work and a
  later "finish the job" sweep flattening the goal palette. Note the trap it exists to guard:
  the hero arc is SUPPOSED to be indigo, because `PALETTE[0]` is `#6366f1`. Never write a
  sweeping "nothing in this panel computes to indigo" assertion — assert `[data-accent]`
  elements only.
- Deliberately **not** converted, and the reason is one silent failure mode: the
  `mm.color || '#6366f1'` fallbacks at six sites feed `color + '22'` / `col + '99'`
  concatenations downstream, and `'var(--x)' + '22'` is an invalid declaration that renders
  transparent with nothing in `realErrors`. They stay literal until their consumers are
  audited. The `${tint}12` day-cell tint and the `#4f46e530` block tint are the same shape.
- Also **not** converted, and this one is a judgement call rather than a hazard: the two SIR
  session badges in the day-header strip are three-part triples
  (`{backgroundColor:'#713f12', color:'#fde047', border:'1px solid #a16207'}` and its emerald
  twin). Each is internally self-consistent and legible in both appearances because both halves
  are specified — but a chip needs a `-soft` fill and a border token, and neither
  `--color-warning-soft` nor a border partner exists. Converting them means widening the token
  vocabulary, so it belongs with the two canvas pages, not bolted onto this pass.
- **The completeness check that closed the pass** was a grep of `progress.html` for every
  accent-family literal. All that remain are the DATA arrays, the six deferred
  fallback-into-concatenation sites, the two alpha-concat literals and the SIR badges above —
  i.e. exactly the "do NOT touch" list and nothing that was simply missed. Repeat that grep
  before claiming this kind of sweep is finished; a converted site is easy to see and a
  forgotten one is not.
- **Environment note, and it is the 2026-08-26 diagnosis repeating exactly.** A full run
  crawled — 146 browser subtests in 12 minutes where the whole suite normally takes 9.5 idle.
  There was exactly ONE `tests/run.js` alive (mine) and the process count proved nothing;
  `ps -eo pid,etimes,time,pcpu --sort=-pcpu` named the cause immediately: GNOME's
  `tracker-extract` at **53.8%** with `tracker-miner-fs` behind it at 16.4%, indexing for
  twelve minutes. **Read what is burning CPU, not how many test processes exist** — and skip
  `ps`'s own row, which always reports ~100%.
- **The repository was restructured by a concurrent session in the middle of this task** —
  every module moved to `scripts/`, the stylesheet to `styles/`, the format docs to `docs/`.
  All of this task's edits survived because `git mv` preserves content, and the `?v=9` bump
  composed with the path change rather than colliding. But the baseline harness broke silently:
  its `*.js` glob stopped matching at the top level and served a tree with no scripts, which
  presented as *every case failing*. **A baseline that fails everything is a broken harness
  until proven otherwise** — a real regression fails a subset.
- **What was run.** `node tests/run.js` end to end **twice**, and only the second counts. The
  first passed all 16 suites at 216 browser subtests — but the `md5sum -c` taken across it
  showed `tests/browser.test.js` had changed while it ran, because this task edited a comment
  and added its eighth case mid-run. The change was provably inert there (node had already
  parsed the file), and it would have been easy to reason it away; it was re-run instead. The
  final run: **all 16 suites pass** — calendar-core and schema under all five swept timezones
  with identical results, true-storage-core, graph-layout, doc-table-core, schedule-paste-core,
  cdp-cleanup, and **217 browser subtests, 0 failures**, with `md5sum -c` confirming the tree
  **byte-identical across the whole run** and `git log --oneline -1` unchanged at both ends.
  `node --check` passes on all ten modules in `scripts/`.
- **Not covered, and stated plainly.** `sir-ks02.html` (101 literals) and `true-storage.html`
  (37) are untouched and still paint their chrome from JSX — see NOTES. Four `[data-accent]`
  hooks are in place but only some are asserted: `today-cell` is reached through
  `progress.html#milestones` and covered, while `leaf-pip`, `ms-seg` and `mm-bar` need a view
  or a seed this task did not build — `toLearn` + `mmTargets` was tried and still left
  `mmProg.total` at 0 — so those three surfaces rest on code reading plus the shared `ACCENT`
  map. Print output of the recoloured chrome was **not looked
  at**. Real touch hardware and the live Firebase project are unverified as ever.

### A pasted timetable, drawn as a read-only backdrop (2026-09-05)

- The slot went from **23 to 24 fields** — `refSchedules` is a real `SLOT_FIELDS` row, the
  first added since `trueStorages`/`trueStoragePos`. That made the seven hand-written
  contract lists earn their keep, and **one of them was found only by running the suite**:
  `tests/browser.test.js`'s `assert.equal(Object.keys(imported).length, 23)` in the
  export→import case, which the plan had not counted. The other six failed immediately and
  by name. One new offline suite, `tests/schedule-paste-core.test.js` (**26** cases),
  registered in `UNSWEPT_FILES`; suites go 15 → **16**. Offline cases go 142 → **168**
  (calendar-core 88 → 106, schema 54 → 62), identical under all five swept timezones. This
  task adds **13** browser cases.
- **`node tests/run.js`: all 16 suites pass** — 206 browser subtests, 0 failures, in 17
  minutes. `node --check` passes on all ten shared modules.
- **The sweep decision is asserted, not merely claimed.** `schedule-paste-core.js` is in
  `UNSWEPT_FILES` because it holds no date code, and its suite carries a **structural case**
  that greps the module (comments stripped first) for `new Date` / `Date.now` / `getDay(` /
  `toISOString`. If that ever fires, the suite has moved to the wrong list. All
  weekday-to-calendar-day resolution lives in `calendar-core.js`, which is swept. That first
  attempt failed on the file's own PROSE explaining why it constructs no Date — strip
  comments before grepping source for a construct you also write about.
- **Fail-first, browser: two doctored baselines, and their failure sets are exactly DISJOINT
  — zero overlap.** Each `TRACK_TEST_ROOT` held symlinks to the repository, a REAL copy of
  `tests/`, and **one** file whose `refOccupies` dropped the weekly arm:
  - doctored **`calendar-core.js`** → **2** failed, `HOME draws the same class` and
    `DOCUMENTATIONS draws the same class`. Every Progress case passed.
  - doctored **`progress.html`** → **1** failed, `PROGRESS draws a weekly class`. Both
    read-only surfaces passed.

  Each failed on its own `deepEqual` — `rs-w` absent while `rs-o` remained — not on a
  timeout. This is the direct proof `progress.html` needs its own copy of the predicate.
  Never place either doctored file in the repository.
- **Getting to that cleanliness took a restructure, and it is the lesson worth carrying.**
  The first version of every case opened with `waitFor(REF_IDS_ON, …)` — waiting for the
  RIGHT ANSWER. Against the doctored trees six cases died on that `waitFor`, which says the
  control is unreachable and says nothing about the claim each case is named for. They now
  wait on a landmark true on BOTH trees (the ONE-OFF entry, which no doctoring of the weekly
  arm can remove) and then assert. Three further cases — the untickable/undraggable one, the
  overlap GUARD, and the popover — were re-seeded with a one-off entry outright, because
  their claims are about element shape, geometry and the popover and have nothing to do with
  weekday resolution. That is what turned a 4-and-2 overlap into a clean 1-and-2 split.
- **Fail-first, offline:** a doctored `schema.js` with `refScheduleErrors` unwired failed
  exactly **3** of the 8 new schema cases — the three that assert the checker RUNS. The other
  five are guards covering defaults and `normalizeSlot`, which come free from `SLOT_FIELDS`
  and pass on both sides by design.
- **Three defects in this task's own tests, all found by reading the failure message.** (1)
  `2031-09-08` was asserted not to be a Monday; it is one — check a weekday, never assume it.
  (2) `refSpan('25:00')` was expected to return `null`; `minsOf`/`hhmmOf` CLAMP, which is what
  every other stored time in `calendar-core.js` already does, so the case now pins the clamp
  and names the validate-on-write / tolerate-on-read split. (3) A malformed range bound was
  expected to make an entry occupy nothing; see below.
- **One design question the tests forced into the open, and the answer is written into the
  data contract.** A MALFORMED `from`/`until` reads as ABSENT — open in that direction —
  matching `blockDay`'s treatment of a malformed `blockDate`. Occupying nothing was tempting
  because the blast radius is larger here (an unbounded weekly entry draws on every matching
  weekday the user scrolls to), and it was rejected anyway: a backdrop drawn too often is
  noisy, visible and deleted in one click, while an entry that occupies nothing is INVISIBLE.
  `schema.js` warns about the value so the user is told which record is wrong. An offline
  case pins the decision rather than leaving it to whichever branch runs first.
- **The mechanism for "untickable, undraggable" is an ABSENCE, deliberately.** The Progress
  block carries no `onMouseDown`, no `onTouchStart`, no resize handle, no checkbox and no `✕`;
  the two read-only layers carry `pointer-events: none`. A guard inside the shared drag
  handler would have been one more rule to remember at one more call site. The case asserts
  both the absence and the consequence — a synthetic drag across the grid leaves `track_db`
  byte-identical on the raw string.
- **`refBlocks` is a SEPARATE array on `buildDaySchedule`**, never mixed into `blocks`. A
  browser case measures a real block's width and height with and without a timetable behind
  it and asserts they are identical, which is the overlap-layout half of "show both, always".
  The empty-state branch on all three surfaces had to learn about it too — without that, a
  day holding only classes says "Nothing scheduled" over a full timetable.
- **Every documented example was fed through the parser** — 3 fenced blocks in
  `SCHEDULE-PASTE.md` plus the example inside the in-page `SCHEDULE_AI_BRIEF`, extracted from
  `documentations.html` itself. All 4 parse. A spec that ships an example the parser rejects
  is worse than no example. That check was a task-owned script and cannot be re-run from
  `node tests/run.js`; re-check by hand if the examples change.
- **Environment note, and it is the `f29f3cf` hazard twice in one task.** Another session was
  building the Home calendar legend-as-filter in `index.html` throughout, and edited
  `AGENTS.md`, `README.md`, `NOTES.md` and `tests/browser.test.js` mid-run — twice, caught
  both times by an `md5sum` taken before and checked after. Its in-flight work is in the same
  diff and was preserved, not reverted. My 13 cases were re-run against the final file
  afterwards and all pass.
- **A one-variable control saved a wrong accusation, and this is the sharpest instance of
  that rule this file records.** A full run reported
  `HOME: a corrupt or out-of-scope legend preference…` failing. Running that case against a
  tree with `calendar-core.js` reverted to HEAD made it PASS, which looked like proof my new
  `FILTERS` entry had broken it. It was not: that comparison changed TWO variables — the
  module version AND isolation (1 case vs 206). Running the same case in isolation against
  the UNMODIFIED working tree also passed. The real cause was that the other session had
  corrected its own in-flight expectation (a uniform `dots: 4` became per-value, `dots: 3`
  for `'["note",7,{}]'`) while the run was in flight. **Build the control that differs in
  exactly ONE variable before believing either verdict** — a green control is not proof of
  causation any more than a red one is.
- **Not covered, and stated plainly.** No image is ever read: the transcription happens in
  whatever AI the user hands the picture to, so its accuracy is outside this repository
  entirely — the same boundary `TABLE-PASTE.md` draws. Real touch hardware is unverified; the
  Progress backdrop takes a click to open its popover and has not been tapped on a real
  device. Print output of a backdrop block was reasoned about from the existing `@media print`
  rules and **not looked at** — no page has been printed. The Home calendar's legend has no
  Timetable row (the backdrop is switchable only from a Documentations calendar block), which
  follows from keeping `ref` out of `CATS` and is a real inconsistency between surfaces. The
  live Firebase project, as ever.

### Aligned cells, and headers by declaration (2026-09-05)

- **No `track_db` slot change at all.** The slot stays at **24** fields — `align`, `head`
  and `headCol` are item-level keys inside a block inside the existing `docPages` list —
  so the hand-written CONTRACT lists in `tests/schema.test.js`, `tests/browser.test.js`
  and `tests/lib/fixture.js` needed no change. `styles.css` was **not** touched:
  `text-left/center/right` and `align-top/middle/bottom` are Tailwind core utilities and
  the header styling reuses the exact class string row 0 always had, so the only `?v=`
  moved is `doc-table-core.js?v=3` → `?v=4` in `documentations.html`, its only loader
  (the file has since moved to `scripts/` under the separate repository-layout work).
  Offline cases in `tests/doc-table-core.test.js` go 73 → **103** (still run once, not
  swept — no date code); this task adds **three** browser cases. Both halves of NOTES
  Proposal 16 landed in ONE change, which was the proposal's own condition — the paste
  spec migrated once, and `TABLE-PASTE.md`, the in-page `TABLE_AI_BRIEF` and the token
  table were rewritten in the same edit.
- **Fail-first, offline: 30 cases against the untouched tree — 28 failed, and the two
  that passed are the point.** `GUARD: a table that was never aligned gains no align key
  from withRows` and `GUARD: a table with no alignment gains no align key from a move`
  assert an ABSENCE, which is trivially true before the feature exists — they became
  meaningful only after it. Of the 28, most died on `T.alignAt is not a function`, which
  is just what a new export looks like; the load-bearing failures were the ones landing on
  real assertions against functions that already existed — `withRows` (the BOUNDS case),
  `moveLine` (both INDICES cases), and the parse/format/round-trip cases. The
  module-surface case caught the seven new exports, exactly as it is for.
- **Fail-first: four doctored baselines, and both pairs of failure sets are exactly
  DISJOINT.** Each was a scratch tree of symlinks plus ONE doctored `doc-table-core.js`;
  offline baselines carried a REAL copy of `tests/` (the realpath trap), browser baselines
  ran the repository's suite with only the HTTP server pointed at the tree; every runner
  prints the root it serves and REFUSES a tree byte-identical to the repository:

  | doctored | fails, alone | on |
  | --- | --- | --- |
  | `moveLine` skips the align remap (the `withRows` trap) | the INDICES case and the COLUMN-move case | `r: 0` where `r: 1` was expected |
  | `withRows` never re-normalises align | the BOUNDS case | a dropped row's entry surviving |
  | `isHeaderCell` reverted to the old `r === 0` literal | the header case and the paste case | `'110000' !== '111100'`, and the preview's `data-head` map |
  | `withAlign` always writes, never deletes | the align case AND the PRE-EXISTING `a pasted table with nothing merged is stored with NO merges key` | `Object.keys` gaining `align` |

  That last row is the finding worth keeping: the existing whole-shape guard
  (`Object.keys === ['id','type','rows']`) failed against a doctored NEW field with no
  edit to itself — the old case genuinely covers the new fields, rather than merely
  coexisting with them.
- **A defect in this task's own test, the padding-vs-meaning shape.** The separator-row
  case asserted `/---:/` where the product emits `--:` for a narrow column — the dash
  count is padding to the column's width, so the case pinned the RENDERING of a statement
  rather than the statement. It asserts a re-parse of the emitted text now. Generalise:
  when an output is padded for legibility, assert what it parses back to, never its
  spelling.
- **A tooling defect that reproduced the leak shape this file already records.** The
  ONLY_PATTERN preload (rebuilt per the 2026-08-23 note; it turned a ~14-minute iteration
  into ~30 seconds) first wrapped the TestContext in `Object.create(t)` — and
  `t.after` reads a private field, so it threw `Cannot read private member #test`,
  AFTER `Browser.launch()` and BEFORE the after-hook registration. Result: a node process
  alive forever on a live CDP connection, killed by explicit PID. The fix is a Proxy that
  binds every method to the REAL context. A wrapper around an object with private fields
  must delegate `this`, not inherit.
- **Every documented example still parses — 9 of them, 0 rejected** (8 in `TABLE-PASTE.md`
  including the new two-row-header worked example, plus the block inside
  `TABLE_AI_BRIEF`), fed through `parseTableText` from a task-owned script that cannot be
  re-run from `node tests/run.js`. Its first run rejected example 1 — the checker had kept
  the blockquote `> ` prefixes no rendered chat ever shows. The checker was wrong, not the
  example; strip the quoting a reader never sees before feeding a parser.
- What the browser cases assert beyond the reversals: an alignment write leaves `rows`,
  `merges` and `colWidths` byte-identical in the same block (the seed carries all three);
  toggling the last alignment off DELETES the key; the header cycle stores `head: 2` and
  `head: 0` as real values and stores `head: 1` / `headCol: 0` as ABSENCE; `head: 0`
  draws no header at all; a pasted `head: 2` plus a colon-carrying separator row reach
  `track_db` expanded per drawn cell, with the PREVIEW asserted first — it renders the
  same `blockFromParse` block Insert stores; and none of the six alignment buttons nor
  either header cycler raises a dialog, pinning their place beside merge, unmerge and a
  line move in the destructive-control rule's exemptions.
- All **19** pre-existing table-section browser cases pass against the change (run
  narrowed, then again in the full suite), which covers the two whole-block `deepEqual`
  cases and the merge/move/width machinery the new fields ride beside.
- **Environment note — the `f29f3cf` hazard, live again.** Another session was landing
  the theme-accent work (`data-accent` hooks in `progress.html`, ACCENT browser cases)
  throughout this task, and this task's first full-suite run was killed on purpose:
  `formatTableText` was reworked to a single `normalizeAlign` pass WHILE the run was in
  flight, and a run against code since edited is not a run. The md5-before/after
  discipline is what made that visible rather than believed.
- **Not covered, and stated plainly.** Real touch hardware: the alignment and header
  buttons live in the same editor-body `.doc-chrome` strip as every other table control,
  which has no `@media (hover: none)` fallback — so on a touch device they are unreachable
  exactly as the merge and move buttons already were; that gap is pre-existing and this
  change widens what it hides. Print output was reasoned, not printed: the blanket flatten
  forces `color` and `background` only, so bold headers, `text-align` and
  `vertical-align` all survive by construction — but nobody has printed an aligned or
  two-row-header table. The live Firebase project, as ever. And `formatTableText` still
  has no page call site, so the round trip is pinned offline and exercised by no UI.

### Quest — a curated side list off the goal tree (2026-09-07)

- **No `SLOT_FIELDS` row, and that is the design rather than a saving.** `quest`, `star`,
  `questLearn` and `starLearn` are item-level keys on a goal node inside the existing
  `goals` list, so the slot stays at **24** fields, the hand-written CONTRACT lists in
  `tests/schema.test.js`, `tests/browser.test.js` and `tests/lib/fixture.js` needed no edit,
  and **nothing was migrated** — absence is already correct for every stored node. Export
  and import carry them on `normalizeSlot`'s unknown-key path with neither side naming them.
  A new offline guard in `tests/schema.test.js` asserts exactly that and is the direct proof.
  One new offline suite, `tests/quest-core.test.js` (**44** cases), registered in
  `UNSWEPT_FILES`: suites 16 → **17**. Final run: **all 17 suites pass** — calendar-core
  (107) and schema (65) under all five swept timezones with identical results,
  true-storage-core (24), graph-layout (21), doc-table-core (103),
  schedule-paste-core (35), quest-core (54), cdp-cleanup (13), and **251 browser
  subtests, 0 failures**, with `md5sum -c` confirming the tree byte-identical across
  the whole run and `git log --oneline -1` unchanged at both ends. `styles.css` changed, so `?v=9 → ?v=10` in all five
  pages; `quest-core.js?v=1` is loaded by `progress.html` and `index.html` only.
- **A real defect the fixtures nearly hid, and the most useful thing in this entry.** Ids in
  this application come from **two** counters and are not the same type: a goal node's id is
  a string from `TrackStorage.newId()`, a mind map's is a **NUMBER** from `sir-ks02.html`'s
  `nid()`. The module's first draft filtered every id list with a string-only test, which
  drops every real `toLearn` entry — the whole feature reading as "no quests" with nothing in
  `realErrors`. The 42 offline cases all passed, because they seeded `'mm1'`. It was found by
  checking `tests/lib/fixture.js` against the product before writing browser cases, not by
  running anything. **Generalise it: when a suite invents its own ids, check their TYPE
  against the code that mints them** — a convenient fixture can make an entire class of bug
  invisible. `isId` accepts both now and two numeric-id cases pin it.
- **Fail-first, offline: six doctored `quest-core.js` baselines, each one rule reversed.**
  Failure sets, in case order: the star gate → {5, 13}; delete-instead-of-`false` → {12};
  lists never deleting → {9, 16, 21}; `starRollup` descending past a starred ancestor →
  {32, 35}; the `toLearn` membership gate → {6, 9, 10}; `routineTicks` ignoring the stored
  day → {37, 41}. Every failure landed on the assertion its case is named for. Five of the
  six are pairwise disjoint; the two learn-list baselines share case 9 — the broad numeric-id
  regression case — but **neither set contains the other**, which is the property that
  matters. The builder copies `tests/` for real rather than symlinking it (`require` and
  `__dirname` resolve through the realpath and would load the repository's own module), and
  it prints both md5s and refuses a tree byte-identical to the repository.
- **Fail-first, browser: three transfer baselines that are EXACTLY DISJOINT SINGLETONS.**
  Each served a tree of symlinks plus one `progress.html` with the whole transfer deleted
  from one site — `addSubGoalAndMigrateTasks`, `nestGoalIntoGoal`, `nestSubGoalIntoSubGoal`.
  Each failed exactly one case and passed the other two, on a real assertion
  (`the QUEST moved down with it`, `undefined` vs `[10]`) rather than a timeout. That is the
  direct proof the three sites need three separate cases: the failure has three independent
  doors, and one case would let two stay open behind a passing sibling.
- **Fail-first, browser: three SURFACE baselines, all pairwise disjoint.** The
  `refSchedules` evidence shape does not apply here and saying so matters — it proves
  `progress.html` needs a *twin* because it cannot load `calendar-core.js`, whereas
  `progress.html` **can** load `quest-core.js`, so there is no twin and doctoring the module
  fails both surfaces by design. Disjointness therefore had to come from doctoring the
  surfaces: a `progress.html` whose tab stops pruning failed the Progress prune case **alone**;
  one whose starred list re-spells the walk at the call site failed the rollup case **alone**;
  an `index.html` whose panel stops pruning failed **only** Home cases. Never place any of the
  twelve doctored copies in the repository.
- **Two defects in this task's own tests, both caught by reading the message.** An
  incoherent `assert.equal(x, y ? undefined : undefined, 'sanity')` line, which failed
  against correct code; and `validateSlot` asserted to return a bare array when it returns
  `{ok, errors}`. Neither was a product finding.
- **TWO REAL BUGS found by a review pass AFTER the suite was already green, which is the
  part of this entry worth carrying forward.** All 17 suites passed, and both of these
  were still there. Neither was reachable by any case that existed at the time.
  - **A duplicated local-day helper.** `index.html` grew a private `questLocalDay()` even
    though the page already loads `calendar-core.js`, which exports `toDateStr` and has it
    pinned by a module-surface case. Two rules at once — no duplicate helpers, and one
    definition of a local day. Found by grepping the file for `getFullYear()` and asking
    what else was already there, not by running anything.
  - **A midnight rollover.** `today` was computed at render and closed over by the tick
    handler, so a tab left open past midnight filed the tick under YESTERDAY. The doctored
    baseline shows it is worse than a wrong label: the stored day stayed `2026-09-08` and
    the ids became `["r1","r2"]` — **yesterday's ticks carried forward into the new day**,
    which is the exact opposite of the reset the feature promises. The day is read inside
    the writer now.
  Each was pinned by a check, and each check was run against a tree with only that fix
  reverted: the failure sets are disjoint singletons. **Generalise it: a green suite means
  the cases you wrote pass, not that the feature is right** — the second read of the code,
  against the file's existing helpers, is a different instrument from the test run.
- A third check earned nothing and is worth naming as a trap rather than a finding: an
  assertion that `index.html` holds no `toISOString` anywhere failed on the file's own
  PROSE (a comment explaining why not to use one) and on the pre-existing export-filename
  date recorded in NOTES Proposal 3. Comments are stripped first now and the scan is
  scoped to `renderQuests`. That is the same trap `schedule-paste-core.test.js` already
  documents, hit again — **strip comments before grepping source for a construct you also
  write about, and scope the scan to the code you actually control.**
- Adversarial and scale passes found nothing further: a script payload and an
  entity-bearing title in a goal name are escaped on Home (the one surface that builds an
  `innerHTML` string rather than letting React escape) and pinned by a case; four malformed
  goal shapes white-screen neither page; 2040 nodes and a 900-level chain both render
  without a stack overflow. `taskType` was checked for the reverse hazard — a quested task
  becoming an omitted milestone node — and only ever converts milestone→task, so a stored
  quest cannot be made unreachable through the UI.
- **A test that failed for the right reason only after a fix this file already documents.**
  The nest-goal case first timed out: `onDragOver` sets React state and `onDrop` READS it, so
  a drop fired in the same synchronous block sees the pre-render value and bails. The
  dragover needs its own `evaluate` and a settle — the same lesson the priority-matrix case
  records, in a second shape. It also has to aim at the **centre** of the tab, since the
  handler nests between 30% and 70% of the width and reorders outside it; a careless
  coordinate would have silently tested reordering.
- **A near-miss worth recording because the discipline is what caught it.** The Home panel's
  smoke check reported horizontal overflow. Measuring `.cal-panel` the same way showed
  byte-identical geometry (`left: -7, width: 780` for both) — the 8px delta is the
  pre-existing scrollbar artifact `.cal-panel`'s own comment describes, absorbed by
  `body { overflow-x: hidden }`. The check was measuring `documentElement` rather than
  `body`. **Build the control that differs in one variable before believing a regression.**
- `body.home` was **not** given bottom padding. The quest panel repeats `.cal-panel`'s
  full-bleed trick instead, so the page still ends flush and the four other pages are
  untouched; the only edit to `body.home` is its comment, whose subject changed.
- **Not covered, and stated plainly.** Real touch hardware: the tab is a 7th button in a row
  that has cost this repository reachability trouble twice, and the picker's `+`/`✓` targets
  are small; nothing was tapped on a real device. Print output of the Home panel was **not
  looked at** — `body.home` has no `@media print` rules at all, so it prints as the rest of
  Home does. The cross-tab branch rests on code reading: the suite drives no second Home tab,
  so the claim that another tab's routine tick re-renders this one follows from the `storage`
  listener being the one `track_db` already uses. The live Firebase project, as ever. And
  `buildToLearnTree`'s missing cycle guard was found during this work and deliberately **not**
  fixed — it is recorded in NOTES, and `quest-core.js` sidesteps it by hanging to-learn rows
  flat rather than walking mind-map parents.
- **Two follow-up behaviours the user asked for after the first review**, both landing in the
  same shape as the rest: a per-node `questOrder` (drag to arrange WITHIN a goal, never
  across one, and never touching the goal tree) and a count on the collapsed starred row.
  Still no `SLOT_FIELDS` row — the slot stays at **24** and the offline schema guard was
  widened to five keys. Offline cases 44 → **54**; browser subtests 244 → **251**; `quest-core.js?v=1 → ?v=2` and
  `styles.css?v=10 → ?v=11` in all five pages.
- **The order baselines fail on DIFFERENT named assertions inside ONE case, which is why the
  case makes two claims rather than one.** Doctoring `questTree` to ignore `questOrder`
  trips *the quest view reads in the chosen order*; doctoring `withQuestOrder` to permute
  `children` as well trips *the GOAL TREE did not move — dragging a quest is not a
  structural edit*. The second is the direct guard on the user's decision that quest order
  is a view and not a restructuring, and nothing else in the suite would have caught it.
  A third baseline pinning the count to 1 fails the count case and the Home mirror.
- **The contention signature is that a DIFFERENT pair fails each run**, and that is worth
  more than any single re-run. Two consecutive full runs failed two cases each and the sets
  were disjoint: `malformed track_db (json string)`/`(json array)` the first time, then
  `GUARD: the desktop mouse drag still files a priority chip`/`TOUCH: tapping empty grid
  space un-arms a schedule block`. This file already warns that twice is not a flake you
  may wave away — but that rule is about the SAME case failing twice, which is the opposite
  signature. What settles it here is that **every one of the four died before reaching its
  own assertion**, on `CDP connection closed` during navigation or a `progress.html
  mounting` timeout, and all passed in isolation. The second pair deserved the extra look
  because a drag handler had just been added — and the causal check is decisive: that
  handler lives in the QUEST tab, which does not render while the SCHEDULE tab is shown, and
  neither case ever got as far as a drag.
- **Environment note, and it is the documented contention symptom again.** A full run
  failed exactly two cases — `malformed track_db (json string)` and `(json array)` — on
  `CDP connection closed` and a `progress.html mounting` timeout, with load average 3.0,
  51 live Chrome processes and GNOME's `tracker-extract` holding **10.5 hours** of
  cumulative CPU. All 17 cases in that section passed on an isolated re-run, and the
  causal check is what settles it: both failures are `progress.html` mounting, while the
  edits under suspicion were an `index.html` render path and a handler that only runs on a
  click inside the Quest tab. Read `pcpu`/`time`, never the process count, and skip
  `ps`'s own row, which always reports ~100%.

### Confirmation on every destructive control (2026-08-18)

- 19 controls that deleted or cleared stored data on one unguarded click now ask
  first. One new browser case brings the file to **100 subtests, all passing**;
  13 suites pass.
- The **fail-first evidence is the point of this entry**, and it was recorded
  against the untouched product pages before a single confirm was added. The test
  half went in first as its own commit (`63055c1`), so the working tree *was* the
  pre-change file and no `TRACK_TEST_ROOT` scratch directory was needed — the same
  situation as "Movable deadline due date". Result: **99 subtests, 7 failed**, and
  every one of the seven carried the identical assertion message,
  `the control asked before writing (no dialog was raised)`:
  the documentation block delete, `− row`/`− col`, the True Storage tag remove and
  link clear, the KS02 untag, the scheduled-action day delete, and the caution
  reset. The eighth case — a detach `⊗` chip is deliberately left unconfirmed —
  **passed**, as a scope guard must on both sides.
- One case failing for the *wrong* reason was caught before it could be believed.
  The Supporting Actions case first timed out looking for a day chip that was not
  in the DOM: `expanded` initialises to `{}`, so the action row starts collapsed.
  It clicks the row's `▼` first now, and only then failed on
  `no dialog was raised`. A case that times out on its own selector proves the
  control is unreachable, not that it is unguarded — always read the message, not
  the pass/fail.
- The 9th case, added with the fix, is a **guard** and passes on both sides by
  design: the milestone-checkpoint chip must raise **exactly one** dialog. Moving
  the prompt into `removeMilestoneEntry` while leaving the call-site `confirm` at
  its chip would prompt twice for one click, and nothing else in the suite would
  have noticed. It asserts `page.dialogs.length === before + 1` after an 800 ms
  settle, so a second prompt is counted rather than missed.
- The chip's `×` is behind hover state, which React delegates from `mouseover`;
  the case re-dispatches until the button exists rather than sleeping. Two
  elements carry the milestone title — the MILESTONES row and the chip — and only
  the chip is `inline-flex`.
- Coverage is honest rather than complete: **8 of the 19 controls** are exercised
  by an automated Cancel-path case, chosen one per mechanism. The other 11 are
  **not** covered by the suite and were **not** clicked by hand either — they rest
  on code reading alone, which is weaker evidence and is recorded as such. They
  are: the two MilestoneBar tooltips, the four unlink buttons, the clear-date
  button, `clearMilestonePeriod`, the MG bullet `×`, the dissect `×`, and KS02
  `removeLink`. Of these, the tooltips and the unlink buttons at least share a
  handler with something covered (`removeMilestoneEntry` via case 100,
  `confirmUnlinkTask` via neither) — the remaining five have no automated
  evidence at all. A manual confirm-and-cancel pass over those is still owed.
- Not covered, as ever: real touch hardware, the live Firebase project, and print
  output.
- **Environment note worth carrying forward.** The first full-suite run after the
  edits reported 4 failures in the malformed-`track_db` cases, with
  `CDP connection closed` and `progress.html mounting` timeouts. All four passed
  on a re-run once the machine was quiet. Those cases load all five pages six
  times over and are the suite's heaviest section, so they are the first to break
  under contention — two other `node --test` runs and ~19 headless Chrome
  processes were live at the time. Before trusting any browser-layer failure,
  check `pgrep -fc "user-data-dir=/tmp/track-cdp-"` and re-run on an idle
  machine; a `CDP connection closed` is a resource symptom, not a regression.
  Note also that `Browser.close()` can fail with `ENOTEMPTY` while removing its
  profile directory, which is where the stray `/tmp/track-cdp-*` directories come
  from. **Fixed on 2026-08-25** — `close()` can no longer throw and the browser is
  reaped on interrupt; see "A run that cannot leak" below. The `pkill -f` warning
  still stands.

### Documentations calendar blocks (2026-08-06)

- `calendar-core.js` passes `node --check`, and 80 offline assertions against a synthetic slot — re-run under `Pacific/Kiritimati` (UTC+14), `Pacific/Midway` (UTC-11), `America/Los_Angeles`, `Asia/Kathmandu` and `UTC` with identical results, which is what rules out a UTC-day regression in the new date code.
- 71 headless assertions covering the block end to end: all four pages mount with the notes widget and no page errors, the `?page=` deep link, block creation and persistence, authoring notes and deadlines into the shared arrays with a `docPageId` and a local calendar date, ownership highlighting and exclusive edit controls, all three filter behaviours (Documentation covering both kinds, Day notes and Deadlines covering only schedule-authored ones), scope toggling across sub-pages, the origin chip and the Schedule's link back, an export→import allow-list replay preserving `docPageId`, a concurrent cross-tab write surviving a `docPages` write, and page deletion keeping every item the page authored.
- 10 further assertions on styling and chrome: the print flatten rule parses with its `:not(.doc-cal)` exemption, the calendar print rules are live, day cells are 52px, the block causes no horizontal overflow, and both the block's move/delete chrome and the sidebar drag-to-nest still work with a calendar on the page. That flatten rule has since been split in two so a parse failure can only cost the exemption; the committed suite asserts the split.
- Not verified: real touch hardware, and the live Firebase project.

### Re-verified after the 2026-08-05 revert and restore

The chunked format was reverted (`98995dd`, `f81a513`) and restored the same day. The assertions above were recorded against the same code before the revert and still describe it; the following were re-run after the restore, against a synthetic slot, signed out, with no Firestore contact:

- `theme.js`, `storage-guard.js`, `firebase-sync.js`, `notes-widget.js` pass `node --check`; `git diff --check` clean.
- 40 headless assertions across all five pages: containers render, no white screen, the offline "Skip" path dismisses the overlay, `window.TrackStorage` present everywhere, `window.TrackSync` present on the four Firebase pages with `state === 'signed-out'` and `limits` reading `chunkBytes=700000 maxChunks=24 debounceMs=1200`, and no page errors beyond the expected Tailwind/Babel CDN warnings.
- 27 `TrackSync.selfTest()` cases across three configurations (auto/gzip, 64-byte chunks, forced raw), all passing. Multibyte input split into 2 chunks and the 300 KB base64 fixture into 14 at the 64-byte size, so byte-level chunking does not tear UTF-8; flipped-byte, truncated, and empty-chunk payloads were all refused.
- 12 assertions that the quota guard still composes with the restored `Storage.prototype.setItem` patch: `saveDB` round-trips, every seeded slot field survives a write, a quota rejection returns `false` and raises the banner while `track_db` stays byte-identical and still parses, a non-quota error is rethrown, and the React root survives all of it.

The `selfTest` compression ratios are not predictive of real workspaces: the `base64-300k` fixture is a repeating string and compresses ~330×. Real documentation images are base64-wrapped JPEG, which is already compressed and high-entropy, so gzip mostly just recovers base64's 33% inflation.

On 2026-08-05, after `firestore.rules` was published in the console, the user confirmed the live signed-in path reaching `✓ synced` and continuing to sync normally on the real project. That closes the gap the pre-revert baseline could only reason about structurally: the legacy → v2 migration succeeds against real Firestore under the published rules.

Still unverified, and out of reach from this environment: the exact chunk count and cloud byte size of the real workspace, `backup/v1` contents, multi-device conflict behavior, and the `permission-denied` banner against the live project rather than the in-memory double.

### "Coming up" under a Documentations calendar block (2026-09-20)

The defect closed here was **reachability**, not rendering. A day note and a deadline are not
`TC.CATS` categories, so neither draws a month-cell dot; the only mark either leaves on a
calendar block's grid is the ownership edge bar, which `ownedDates` builds from the block's
own scope alone. An item authored on another documentation page, or filed in the Progress
Schedule, therefore left **no trace whatsoever** on the grid and could be found only by
clicking the day it happened to sit on. The new list at the foot of the block shows every day
note and deadline dated on or after the local today, from every origin, with no click.

- Changed: `documentations.html`, `styles/styles.css`, and `?v=11 → ?v=12` for
  `styles/styles.css` in all five pages. **No shared script changed**, so `calendar-core.js`
  stayed at `?v=8` and Home was untouched. Exporting its `shownFn` was considered and
  rejected: it would have pulled a two-page shared script and a version bump on Home into a
  change with no behaviour there, to remove a one-line `!hidden.includes(k)` this component
  already spells twice. The half that carries the risk — *which* key an item answers to — is
  `TC.originKey`, called rather than re-spelled.
- The block's stored shape is unchanged, `{id, type:'calendar', hidden, scope}`: the list is
  always on and its expansion is ephemeral, so **nothing was migrated and nothing needed to be**.
- `node tests/run.js`, final tree: **all 17 suites passed, 258 browser subtests, zero
  failures** (~26.5 min under load; `md5sum` of `documentations.html`, `styles/styles.css`
  and `tests/browser.test.js` identical at both ends of the run). The suites: `calendar-core` and `schema` swept under UTC,
  Pacific/Kiritimati (UTC+14), Pacific/Midway (UTC-11), America/Los_Angeles and
  Asia/Kathmandu with identical results; `true-storage-core`, `graph-layout`,
  `doc-table-core`, `schedule-paste-core`, `quest-core` and `cdp-cleanup` once each; then the
  browser suite. Browser subtests went **250 → 258** (`await t.test` declarations 226 → 234).
- Eight new browser cases: the list renders with no day clicked and carries all three origins
  with only the owned rows marked; a past note *and* a past deadline are both omitted and the
  empty state names the cutoff; clicking a row 40 days out moves the grid's month as well as
  the selection; the category filter empties list and grid together; a ticked deadline stays
  listed and struck; the list caps at eight and expands in place, storing nothing; the list
  writes nothing; and a guard that the new rows are not `.cal-doc-row`.

**Fail-first — four doctored baselines, disjoint singletons.** Each is one file with one
rule reversed, served through `TRACK_TEST_ROOT` from a scratch tree of symlinks to the repo
plus the doctored `documentations.html`; each was refused if byte-identical to the
repository. No doctored copy was placed in the repository.

| Rule reversed | Plan | Failed | The message |
| --- | --- | --- | --- |
| the `>= todayDs` cut dropped | 1..7 | `omits a past item and names the cutoff`, alone | `expected: 1, actual: 3` |
| `show(TC.originKey(...))` dropped | 1..7 | `honours the category filter`, alone | `expected: 1, actual: 4` |
| the row calls `setSelDs`, not `goToDay` | 1..7 | `opens that day, month included`, alone | `notStrictEqual 'September 2026'` |
| the eight-row cap removed | 1..8 | `caps at eight rows and expands in place`, alone | `expected: 8, actual: 10` |

The control run against the real repository was `1..8` with no failures. The cap baseline is a
singleton for a structural reason worth recording: every other case's fixture holds fewer
than `UP_CAP` items, so none of them *can* notice the cap — which is what makes its own case
load-bearing rather than incidental.

The cap case was written last, after a review found the cap and its `+ N more` expander were
the one user-visible branch in the feature that no case touched. The first full run of the
final tree was stopped ~15 subtests in to add it, rather than shipping the branch untested and
reporting it as a gap.

Two things about that evidence had to be *fixed* before it was worth anything, and both are
the existing lessons biting:

- **The first cutoff baseline was not a singleton.** The shared fixture held the past item,
  so dropping the cut moved the row count in every count-asserting case — the cutoff
  baseline would have failed four cases and the other two baselines' failure sets would have
  sat *inside* it. Each case now owns the data it needs: the shared db holds only items that
  are ahead, and the cutoff case carries its own past note and past deadline.
- **The filter case waited for the right answer.** Its first form waited for the row count to
  reach 1, so the filter baseline died on a 15-second `waitFor` timeout — which says the
  control was unreachable and says nothing about the claim. It now waits for the write to
  land (`"hidden":["doc"]` in `track_db`) and then asserts, which is why that baseline reports
  `expected: 1, actual: 4` instead.

**Narrowing.** The baselines were run through a task-owned `--require` preload that wraps the
parent's `TestContext` in a Proxy binding every method to the real context, so non-matching
children are never declared while the parent still launches the browser and registers its
after-hook. `--test-name-pattern` cannot narrow this file at all. Reading the **plan count**
(`1..8`) rather than the summary line mattered: an early run's summary read `# pass 7` for six declared
children plus the parent. The preload is not in the repository, and it left no stray process.

**The guard case will not fail today, and that is its job.** Seven existing Documentations
cases select `.cal-doc-row` / `.cal-cell` broadly across `.doc-cal` and take the first match
or a raw count (`browser.test.js` 511, 589, 1119, 1137, 1382, 1391, 5955), and four Progress
cases count `!` marks by a `"Due "` tooltip prefix (687, 1234, 1295, 1615). Rows in the new
list would have been silently counted as day-panel rows had they borrowed the class. They use
a `doc-cal-up-*` namespace, carry no `.cal-doc-row-acts`, and tooltip `Go to <date>`. The
guard passes on both sides of every baseline **by design** — it exists to fail when a later
pass "unifies" the two row classes.

**Contention, and what it cost.** The first full run of the final code failed exactly two
subtests — `TOUCH: an armed chip dropped on a row lands before it` and the `GUARD` beside it
— both on `waitFor timed out … (last value: "threw: CDP connection closed")`, the documented
contention signature, during navigation rather than on any assertion. Subtests 184-186
passed immediately after, so the browser died and the harness recovered. **The re-run
passed both**, which is the one-variable control the rule asks for: a different pair failing
each run is contention, the same case failing twice is not. The mechanism was also ruled out
rather than assumed: `rg` confirms no `doc-cal-up*` class name appears outside
`documentations.html`, and `body.docs-page` is never set on `progress.html`, so the shared
stylesheet cannot reach that page. Concurrent load at the time: GNOME `tracker-extract` at
~15%, and **another agent session actively editing `World/`** (4 modified files at preflight,
15 by mid-run, mtimes minutes old). A 14-day-old orphaned headless Chrome (PID 61936) was
found idle at 0.1% CPU — listed, not killed, and not the cause.

A malformed stored date is now load-bearing rather than cosmetic. `schema.js` only *warns* on
one, and `'tomorrow' >= '2026-09-20'` is **true** under the string compare these lists are
built on, so junk would have reached `new Date(ds + 'T12:00:00')` and thrown a `RangeError`
out of a React render — emptying the whole page, not just the block. `CAL_DAY_RE` is that
guard, and the one inline copy of the same regex already in the file (`dueOk`) now points at
it rather than spelling it a second time.

Not verified, as always in this environment: print output on paper, real touch hardware, the
live Firebase project, and real multi-device behaviour. The new list's print rules were
asserted as CSS and read, never rendered to PDF.

**Styling was measured, not assumed.** A task-owned smoke asserted computed styles in both
appearances rather than trusting that the rules parsed: the list's top border resolves to
`1px` (so the stylesheet is applied at all), an owned row is tinted and carries its inset bar
(`rgb(221,231,223)` on Grit, `rgba(127,185,143,0.15)` on Night), a ticked row computes
`line-through`, the date column is `88px`, and `.doc-cal` causes no horizontal overflow on
either. A separate structural check confirmed the screen rules sit at nesting depth 0 and the
print additions inside `@media print` — a rule that parses but never applies looks identical
to a working one in every other check.

**The commit is not this work's alone.** At 10:23, mid-run, a concurrent session committed
`79fed86 "DOC calen show"`, sweeping this feature in beside unrelated `World/` changes: 27
files, of which 11 are this work and 16 are `World/`. Nothing was lost — `git diff HEAD` is
empty for every file here, all eight new cases are in the commit including the cap case added
last, and `?v=12` went in with them. A commit rewrites no working-tree bytes, which is why
the run straddling it still saw one tree. Recorded because the history now attributes this
change to a message about something else, and because a later session reading `git log` will
not find it where it would expect.

### A phone interface on the four React pages (2026-09-20)

Reported as "the phone interface looked TERRIBLE, it's just a left cropped version of full
screen", naming `documentations.html` and its left tab specifically.

**The diagnosis was not what the symptom suggested, and measuring is what caught it.** The
viewport meta is correct on all five pages. The cause is that four of the five have no
responsive rules at all — there is not one `sm:`/`md:`/`lg:` prefix in the repository, and
`styles.css`'s only width queries (720px, 460px, 640px) serve the Home hub and the Universal
calendar. So `w-60 shrink-0`, `w-[65%]`, `grid-cols-7` and the schedule's
`TOTAL_W = 56 + 7 × 140 = 1036px` resolve to desktop values at every width, and
`body.app-page { overflow-x: hidden }` **clips** the result. On documentations the sidebar was
240px of a 390px screen — 62%, with `shrink-0` forbidding it to give any back — leaving the
editor about 70px of text once `px-10` came off.

**The overflow on documentations was NOT the sidebar.** Hiding the sidebar left the page still
441px wide at a 390px viewport. A sweep for elements outside the viewport found the fixed tab
bar at `[0…441]`, which looked like the culprit; removing it from the DOM left `scrollWidth`
at 441 unchanged, so it was *reporting* the inflation, not causing it. Measuring the header's
children found it: `← TRACK` 36 + `DOCUMENTATIONS` 118 + workspace chip 66 + sync chip 72 +
theme toggle 76, with gaps and padding, came to 440px inside a 390px box. `progress.html` and
`sir-ks02.html` never showed this because their headers already scroll unconditionally
(styles.css, `.progress-page` and `.ks02-page`); this header never got that treatment. Fixed
by scrolling it and dropping the redundant title word, which the other three pages do not have
either. Recorded because the obvious suspect was wrong twice in a row and only the
one-variable removal test settled it.

**Fail-first: three doctored baselines, each ONE reversed rule, in scratch trees under
`TRACK_TEST_ROOT`, never in the repository.** Each tree symlinked the pages and copied
`tests/` for real (`require` and `__dirname` resolve through the realpath and would have
loaded the repository's own suite), printed the root it served, and refused to run if the
tree was byte-identical to the repository.

| Baseline | Rule reversed | Failed |
| --- | --- | --- |
| B1 | the shell's `padding-bottom: var(--phone-tabbar-h)` removed | **only** the four `PHONE/<page>` cases |
| B2 | `:not(.docs-sidebar-full)` dropped from the sidebar hide rule | **only** `PHONE/DOCUMENTATIONS`'s drawer case |
| B3 | the schedule split reverted to desktop-only 65/35 | **only** `PHONE/PROGRESS`'s day-mode split case |

The three failure sets are **pairwise disjoint**, which is the evidence that each per-surface
case is load-bearing and that a forgotten copy cannot hide behind a passing sibling. A fourth
baseline, in `tests/viewport.test.js` alone, moved every `max-width: 720px` in `styles.css` to
719 and failed exactly one case — the breakpoint twin — leaving the other eight green.

**Two cases were added because reviewing the coverage showed a gap the suite could not see.**
Neither the crop assertion nor the tab-reachability assertion can detect a reverted 65/35
switcher: 65% + 35% still sums to 100%, so the result is a 253px timeline beside a 136px
matrix — unusable, and not an overflow. The two splits now have a case each, and they assert
**opposite** things on purpose. The schedule's hidden pane must stay **in the DOM**, because
two `useEffect(…, [])` bind to `containerRef` (the scroll-to-08:00 and the non-passive
Shift+wheel listener) and unmounting it once would leave that listener on a dead node for the
rest of the session with no error anywhere. The goal detail's panes **are** unmounted, because
`GoalProgressPanel` has no `useEffect` at all. A later pass that "made the two splits uniform"
has to break one case or the other; it cannot satisfy both.

**What the crop assertion actually measures, and why it is two assertions.**
`overflow-x: hidden` on `body.app-page` propagates to the viewport, making it a clipping
scroll container — still a scroll container, so content overflowing RIGHT does enter its
scrollable overflow region and `documentElement.scrollWidth` still grows. It is blind to the
LEFT, where the scrollable overflow region is clamped at the padding-box origin: a page pushed
off the left reports a tidy 390 while being unreadable, which is the exact shape the user
reported. The second assertion sweeps `#root *` for any painted element outside
`[0, clientWidth]` whose nearest non-`visible` ancestor is the viewport itself — so an element
a container scrolls, or one deliberately clipped, does not count. `document.body` is skipped
when finding an element's clipper: `getComputedStyle` reports its *computed* `hidden`, but its
*used* value is `visible` because the value was propagated, and counting body as a deliberate
clipper would make every escapee "intentional" and the assertion vacuous. The sweep is scoped
to `#root *` because `index.html`'s `.cal-panel` and `.quest-panel` are full-bleed by design
(`margin-inline: calc(50% - 50vw)`) and escape the viewport on purpose — they measured
`[-7…1273]` at 1280px and are not a defect.

**One rule was corrected by reading, not by a test.** The shell's `padding-bottom` was
commented as unconditional but written inside the media query. Making it match the comment
would have been wrong: `.app-page #root > div` is (1,1,1) and therefore also beats a Tailwind
utility, so an unconditional `padding-bottom: 0px` would have stripped the bottom padding from
`true-storage.html`'s no-workspace screen (`min-h-screen … p-6`) on every desktop. Reading a
0px var is only free where nothing else declares that property. The comment and the AGENTS
rule now record the exception and its reason.

**A run's exit code was reported wrongly here and is worth recording.** The baseline script
ended with `( cd "$REPO" && node tests/run.js | tail -30 )` and then read `$?` — which is
`tail`'s, not node's. It printed `REAL EXIT=0` over a run whose own summary said
`1 of 18 suites failed`. This is the lesson already in AGENTS ("a trailing grep makes a
passing run exit 1"), met from the other direction: a pipe can also make a *failing* run look
clean. Re-running the same bytes with no pipe was fully green (267/267), and the tree md5 was
identical before and after both runs, so the earlier pair of failures did not survive a second
run — consistent with the measured contention (`tracker-extract` at 49.7%, load 3.50, and the
run taking 22.9 min against the ~13.6 min this file records for load ~2.5). The failing cases
cannot be named, because `tail -30` discarded the messages before they were read. That is the
cost of the mistake, and it is why the run was repeated rather than explained away.

**Also corrected mid-task:** 40 Chrome processes were present and initially read as
contention. They are 15 days old and at 0.0% CPU — orphans from a previous session, not this
task's, and not a CPU source. The real load was GNOME's `tracker-extract`. This is the lesson
in AGENTS ("read pcpu, time and /proc/loadavg, never the process count") failing to be applied
on first reading of the list; the `etime` column said `15-05:38:06` and was read as hours.

**Not covered, and not claimable from here:** real touch hardware, which is the whole point of
this change and is permanently unverifiable in this environment — 390x844 with
`Emulation.setTouchEmulationEnabled` is the closest it gets. Also not covered: notched
safe-area insets (`viewport-fit=cover` is deliberately not set, so every `env()` resolves to 0;
see NOTES Proposal 16), printed output, the live Firebase project, and real multi-device
behaviour. Within the app, the phone layout has had no pass over the KS03 and True Storage
pan/zoom canvases, the MG levels accordion, the Kolb editor, or the several `w-[528px]`-class
popups in `progress.html` that carry no viewport cap — all named in NOTES Proposal 16.

### Phone interface, round 2: Milestones, the Schedule nav, and tap-to-arm (2026-09-20)

Three fixes from using round 1 on a real device: Milestones was still a side-by-side split
on a phone (missed — the goal detail and Schedule got switchers, it did not), `CALENDAR` in
the Schedule could not be clicked, and the Documentations rows showed all five controls all
the time on touch.

**The Schedule clipping was partly self-inflicted, and is recorded as such.** That control
row has no wrap and no scroll, and in day mode its children come to ~546px in a 390px box:
`‹ › today`, the date, `WEEK|DAY`, the `GRID|TASKS` switcher and `TIMELINE|CALENDAR` last.
It already overflowed at ~428px before round 1, but the `GRID|TASKS` switcher added in round
1 put another ~118px into that row, and `CALENDAR`, being last, is what fell off. Fixed by
wrapping rather than scrolling — the complaint was that the control could not be *clicked*,
and a row you must swipe to reach is still one you cannot see.

**Two measurement mistakes, both caught before they became conclusions.**

The nav appeared to wrap into FIVE lines. It was three. `align-items: center` gives
differently-sized children on the same line different `top` values, so counting distinct
tops overcounts; grouping by overlapping vertical bands reports it correctly. The corrected
counter went into the browser case with a comment saying why, because the naive version is
the one anybody writes first. A real fix did come out of investigating it: `margin-left:
auto` on a wrapped flex line consumes all free space on whatever line the item lands on, so
nothing can pack beside it — `ml-auto` is now neutralised at this breakpoint.

Forty Chrome processes were read as contention. Their `etime` column said `15-05:38:06` —
fifteen days, not two hours — and `lstart` confirmed `Sat Sep 5`. All at 0.0% CPU, orphans
from an earlier session. The real load was GNOME `tracker-extract` at ~50%. Exactly the
lesson already in AGENTS, failed on first reading of the column.

**The arm model silently did nothing, and one assertion caught it.** TWO rules revealed the
cluster: the `@media (hover: none)` block, and `.docs-sidebar-full .doc-row-acts`, which
governs the drawer at every width. Moving only the first to `.doc-row-armed` left the
cluster permanently visible and looked implemented. Measured, unarmed, before and after:
the cluster took **228px of a 390px row and left the title 42px**; with both rules moved,
the title gets **278px**. That is the whole of "the freed space is filled by the page name" —
no second mechanism was needed, because `display: none` already returns the width to the
existing `flex-1 truncate` span. AGENTS gained the general rule: when a control's visibility
moves behind a new condition, grep every rule that sets its `display` before believing it.

**THE GATE CHANGED DURING IMPLEMENTATION, from `(hover: none)` to `(pointer: coarse)`, and
the reason is measured.** `(hover: none)` is the semantically obvious query and was tried
first. Headless Chrome reports it **at every viewport, with or without touch emulation** —
so every existing desktop case silently took the new two-tap path, which is how
`the sidebar expands to full screen and closes on picking a page` broke. An
`Emulation.setEmulatedMedia` helper was added to pin `hover` and **measured doing nothing**:
that domain does not override `hover` or `pointer`. The helper was removed again rather than
shipped with a comment that was false. `(hover: none)` was therefore untestable in BOTH
directions — neither path could be asserted deliberately.

`(pointer: coarse)` is both semantically better and observable. Coarse means the PRIMARY
input is a finger, so a touchscreen laptop reports `pointer: fine` and correctly keeps
one-click; and it reads false on a desktop, true under touch emulation. Both paths were then
verified directly, one variable apart:

```
A  desktop 1280x900, no touch   coarse:false  ->  one click opens the page
B  390x844 + touch emulation    coarse:true   ->  tap 1 arms (editor unchanged,
                                                  cluster 228px), tap 2 opens
```

`styles.css`'s docs-row block asks the same query for the same reason; two spellings of "a
finger" in one codebase is how they drift apart.

**A second self-inflicted test failure, worth recording because the fixture caused it.** The
new arm case asserted "the first tap did NOT open the page" against a single-page fixture —
but this page auto-selects a page on mount, so it was already open and the assertion could
never mean what it said. Re-seeded with two pages so the editor starts on the *other* one
and the tap has somewhere to move it from. A fixture that makes an assertion unprovable
fails for a reason that has nothing to do with the claim.

**Fail-first: three doctored baselines**, scratch trees under `TRACK_TEST_ROOT`, `tests/`
copied not symlinked, each printing the root it served and refusing a tree byte-identical to
the repository:

| Baseline | Rule reversed | Failed |
| --- | --- | --- |
| B1 | Milestones panes rendered unconditionally | RESULTS PENDING |
| B2 | `flex-wrap` dropped from the Schedule nav | RESULTS PENDING |
| B3 | `.docs-sidebar-full` reveals the cluster unarmed again | RESULTS PENDING |

B3 is deliberately the mistake that actually happened rather than an invented one.

`node tests/run.js`: **18 suites, 270/270 browser subtests, zero failures**, exit code read
from node itself and not through a pipe — the previous entry records that trap from the
other direction. `md5sum` of the tree identical at both ends of the run.

**Not covered, and the point of the whole change:** real touch hardware. 390x844 with
`Emulation.setTouchEmulationEnabled` is the closest this environment gets, and whether two
taps to open a documentation page feels right rather than merely correct is a judgement no
test here can make. Also unchanged from round 1: `viewport-fit=cover` is still unset, the
sync banners still land on the tab bar, and the pan/zoom canvases, MG accordion and
uncapped `w-[528px]` popups still have no phone pass — all in NOTES Proposal 16.
