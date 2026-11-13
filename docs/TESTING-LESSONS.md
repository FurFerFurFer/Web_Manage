# Track — Testing Lessons

**Mandatory rules, with the same authority as `AGENTS.md`.** Read this file before writing
or changing a test case, before building a fail-first baseline, before a long run, and
whenever a run fails in a way you do not understand.

Moved out of `AGENTS.md` on 2026-11-10, word for word and with nothing deleted. A new
lesson is added HERE, not to `AGENTS.md`. The evidence behind each lesson is in
`docs/VERIFICATION-LOG.md`.

---

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
- **A background headless tab fires no focus events.** `el.focus()` and `el.blur()` there move
  `document.activeElement` but dispatch no `focusin` / `focusout`, so React's `onFocus` /
  `onBlur` never run: a commit-on-blur case "fails" on a working product, and a baseline
  captured on focus (a milestone's slip baseline) is silently never captured, so the case
  tests a different path than its name says. Dispatch `new FocusEvent('focusin', {bubbles:
  true})` (and `focusout`) explicitly, as the Projects helpers do — and prefer a close path
  that does not depend on blur at all.
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

---

## Change-specific checks

Step 8 of `AGENTS.md`'s Required Workflow, verbatim. Run the list for each kind of change made.

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

---

## Baseline and run-time history

The paragraph `AGENTS.md` carried until 2026-11-10, verbatim. `AGENTS.md` now keeps only
the totals; append later timings here.

What a passing run looks like, as of 2026-11-10, with the STRAT spread-from entry in the
repository and another session's uncommitted SRCH → DIRECTORY change in the tree beside it —
`node tests/run.js`, **36 suites**: `calendar-core` (126), `schema` (68), `notes-core` (37) and
`note-to-self-core` (14) swept under five timezones (UTC, UTC+14, UTC-11, America/Los_Angeles, Asia/Kathmandu) with
identical results, then `true-storage-core` (24), `source-dump-core` (33), `graph-layout` (21),
`doc-table-core` (103), `schedule-paste-core` (35), `quest-core` (54), `milestone-core` (63),
`goal-core` (89), `project-core` (46), `viewport` (10), `journey-core` (39), `strat-core` (63),
`mm-tree-core` (51), `kolb-core` (32) and `cdp-cleanup` (13) once each — they hold no date code — then **569
browser subtests** in headless Chrome. **In the last one to six days of a month, six timetable cases fail on a date
bug in the suite itself** (NOTES, Proposal 7): the Home and Documentations twins of three cases,
each timing out on its class layer while its Progress twin passes. That is the 2026-10-29 runs —
476 of 482, then 486 of 492 one case before the task window's date-field case made it 493 — and a pristine HEAD failed the same six. Any OTHER red case is not that bug. At
load ~1.5–3 the whole run took 21–27 minutes, 29.5–30 at load ~2–4.5, 36 at load ~5.5–6.5, 39 at
load ~3.3–4 with 417, 35 with 424, 37 with 428 at load ~1.3, 38 with 442 at load ~3.2, 39 with
443 at load ~1.7–3, 37 with 448 at load ~1–1.8, 38.5 with 463 at load ~1.4–2.1, 45 with 492 at load ~2.4–3.4, 44 with 482
at load ~2.4–3.2, 42.5 with 505 at load ~1.7–1.8, 42 with 517 at load ~1.3–1.7, 45 with 529 at load ~2.3–2.6, 51.5 with 569 at load ~3.8–4.2, and 47 with 572 at load ~1.4–2.3 (2026-11-11, when `note-to-self-core` became 21), and 48 with 602 at a 15-minute load of ~2.1 at its end (2026-11-13, 38 suites: FILES added `files-core` (27) and `file-store` (13), and `schema` became 71). Treat that range as a load measurement, not a property of the suite.
