# Track World verification log

## 2026-09-13 — A1 humanoid and procedural animation

Scope: World only. The user selected **A1** after the combined appearance/production
question: a botanical traveler and a local articulated rig with procedural animation
using the existing Babylon engine. That cleared the art-production direction gate for
this increment. No package, tool or asset was installed/downloaded; no Track runtime,
stored data or cloud state was changed. Existing working-tree changes were retained.

The controller still owns the same collider, input rules and movement. The new
`character-motion.js` observes resolved simulation state; `character-rig.js` consumes
that feed and changes only decorative transforms. The rig includes articulated limbs,
spine/head motion, grounded strides, jump/fall/landing, climb/detach, charge/glide and
right-hand/belt notebook sockets. New coverage checks resolved travel, retained events,
actual joint hierarchy/poses, notebook mounts and the unchanged collider.

### Environment and run procedure

- Existing Node **v22.23.2**, Google Chrome **152.0.7977.75**, Linux
  **7.0.0-30-generic**, local Babylon **9.25.0**.
- The repository's existing CDP helper launched isolated headless Chrome with SwiftShader;
  synthetic fixtures were served on ephemeral loopback ports. Flight used **960×640**;
  camera/sky started at **1280×800**, map/general browser at **1440×900**, with those
  existing suites' additional narrow-window checks. The visual preview used **1100×800**.
- One graphics-heavy suite ran at a time. Required affected suites ran once after the
  final source/test edits. Documentation changes afterward did not trigger reruns.
- Final-run source/test hashes are in `/tmp/track-world-character-final-hashes.json`.
  Detailed console output is in `/tmp/track-world-character-final-*.log`.

### Failures and preliminary execution

The initial sandbox browser attempt could not bind its loopback server (`listen EPERM`
on `127.0.0.1`). It did not execute the scene and is not a behavioral failure/pass.
It was rerun with the required sandbox permission.

Before A1 geometry was integrated, the first animation-feed route assertion failed:
3.2583 units of forward travel plus 0.1900 units of coast were being compared with
2.7032 units of **grounded-only** stride travel. Brief airborne steps belonged to total
travel but not that stride channel. The feed now exposes total `distance` and separate
`groundDistance`, with the rig consuming the latter. The final route reported 3.4523
units of total planar travel (including small lateral collision displacement), within
the assertion's 0.03 tolerance of forward travel plus coast. The controller was not tuned.
The preliminary route passed its other seven reported cases. Its output is retained in
`/tmp/track-world-character-flight-browser.log`.

A local preview executed the humanoid before the final suites, with no browser errors.
Front, side and movement screenshots were inspected, followed by the final route's climb
and glide captures. Screenshots establish those rendered poses, not motion naturalness.

### Final affected suites

| Command from the repository root | Reported tests | Result |
| --- | ---: | --- |
| `node World/tests/character-motion.test.js` | 4 | Pass |
| `node World/tests/core.test.js` | 10 | Pass |
| `node World/tests/flight-core.test.js` | 7 | Pass |
| `node World/tests/flight.test.js` | 8 | Pass |
| `node World/tests/camera.test.js` | 5 | Pass |
| `node World/tests/map.test.js` | 5 | Pass |
| `node World/tests/sky.test.js` | 8 | Pass |
| `node World/tests/browser.test.js` | 7 | Pass |

All **21 offline** and **33 browser** reported tests passed, with no skipped or cancelled
cases. The general suite also retained the native-storage trap/sentinel, synthetic-fixture
identity, notebook identity/deletion cancellation, panel focus and unpaused weather checks.
Its final SwiftShader sample was 4 fps / 301 ms p95 at an internal 379×720 resolution;
this is a short software-renderer reading during behavior testing, not the physical
hardware procedure or evidence that its performance target passed.

`node --check` passed for both new runtime modules, `scene.js` and the changed/new tests.
The final runtime/test hashes remained unchanged across these runs. `git diff --check`,
cache queries/loading order and local documentation file targets passed. The task-only
scene/documentation diffs and final working tree were reviewed; only intended World
files were edited by this task. The root Track suite was not applicable or run.

The final flight suite covers tap-Shift toggle/repeat/typing, released-sprint coast,
running-jump momentum and hip continuity, both climbing arms/knees, notebook stow while
reading, Space's wall-first/outward detachment, ordinary/elevated-jump glide refusal,
launch/apex deployment, both island landings and checkpoint recovery. The character's
meshes are checked as non-colliding/non-pickable, with the collider still `[.35,.88,.35]`.
Camera/map/sky cases retain drag continuity, upright orbit, pin/navigation behavior,
close-camera fading and the separate grounded Grove experience.

### Limits and physical review

No physical movement-feel acceptance, reference-speed measurement or sustained hardware
benchmark was performed. SwiftShader timings are not the laptop GPU result. Automated
input is not a new touchpad playtest. Flat-ground local foot targets do not prove
terrain-adaptive foot planting; irregular wall contact, canopy grip precision, clipping,
finger motion and natural human timing still need visual/user review. This is articulated
geometry with procedural poses, not a skinned production asset or authored clips.

The new code was executed. The pending work is physical review on the existing route,
then PLAN §25.13's hardware procedure. A different production approach, external tools/
assets, spending or Track integration would need its separate direction gate; A1 does
not authorize any of those.

## 2026-09-13 — Sprint stamina, and the recorded Genshin/Aether direction

Scope: World only. Two separate pieces of work. The first records a user direction
verbatim without interpreting it — "copy all movements of Genshin Impact instead… the walk
sprint stop landing and climbing", plus Aether's character design twisted to the theme with
the notebook replacing the sword, and a supplied reference link. The second implements the
sprint stamina system the user asked for, with the budget set by the KS03 streak and the
drain scoped to sprinting only, both answered by the user in this session. The user also
directed that **"astra" must check the stamina work**, so it is recorded everywhere as
implemented and **not accepted**. No Track runtime file, stored data or cloud state was
changed; no package, tool, asset or download arrived; existing working-tree changes from
other sessions were retained untouched.

The supplied reference link was **not fetched**: retrieving it is a network call and saving
it would be an asset decision, both gated. It is recorded as a link with no description.

### What was built

`scripts/stamina-core.js` (`window.WorldStamina`) is the one definition: the streak budget
(`6 s + 2 s per active day`, capped at 24 s), the drain that only grounded sprinting pays,
recovery after a 0.6 s delay at 1.4/s, the exhaustion state with a 25% resume threshold, the
single `canSprint` gate, and `streakFrom`, which mirrors Track's LIN streak definition
(`progress.html` `computeLinActiveDays`/`calcStreak`). It holds **no date code**: the local
day and the day-shift helper are parameters, so Track's UTC `toISOString().split('T')[0]`
expression is not repeated — a structural case greps the module, comments stripped, to keep
it that way. `scene.js` advances it once per step above the climbing return, drops the
sprint toggle on exhaustion and reports it in the snapshot and the UI tick; `app.js` reads
the streak once from the synthetic fixture and drives the new bar; `demo-core.js`'s fixture
gained five consecutive synthetic LIN days and a sixth holding only a stage revert.

### Environment and run procedure

- Existing Node **v22.23.2**, Google Chrome via the repository's CDP helper, Linux
  **7.0.0-30-generic**, local Babylon **9.25.0**. Flight suite at **960×640**, SwiftShader.
- One graphics-heavy suite at a time. Machine load was read before starting (`/proc/loadavg`
  2.87 at the offline batch).

### Fail-first evidence

- **Offline:** `tests/stamina-core.test.js` was written and run **before** the module
  existed, failing with `MODULE_NOT_FOUND`. Four further failures on the first green-module
  run were genuine test defects (a helper that never passed `budget` into the input) plus one
  assertion that encoded the wrong design — it asserted a held key blocks recovery, when the
  intended behaviour is that recovery proceeds because exhaustion has already turned sprint
  off. The assertion was corrected to the intended rule, not the code to the assertion.
- **Browser:** a doctored copy of the tree in a scratch directory, differing from the
  repository in exactly one rule — the exhaustion drop-out line removed from `scene.js` —
  fails the new case on precisely the assertion it is named for: `dropped` was `true`
  (sprint stayed on with an empty bar) where the repository gives `false`. Every other
  assertion in the case still passed there, including the bar reading `empty` and the
  re-toggle refusal, so the case is load-bearing for that rule specifically rather than
  passing or failing wholesale. The doctored tree was confirmed not byte-identical to the
  repository before the run, and was never placed inside it.

### What ran

Offline, all passing: `core` (10), `stamina-core` (9), `flight-core` (7), `character-motion`
(4), `map-core` (4), `sky-core` (3). Browser: the new stamina case passes in the flight
suite; its run reports the 16-second budget from the five-day synthetic streak, a bar at
0.905 while spending, the budget reaching 0 after ~20 seconds of driving, sprint dropping
itself, `Shift` refusing to re-arm, and sprint returning part-filled after the resume
threshold. `WorldDemo.snapshot().fixtureUnchanged` was `true` throughout: the stamina budget
reads the synthetic streak and writes nothing.

### Pre-existing failures, not caused by this work

`tests/character-animation.test.js` ("a continuous stride must not snap the hip") and the
flight suite's first case (`animationProof.checks>100`) fail on this tree. Neither is in this
task's change set: that test requires only `character-animation.js`, `character-motion.js`
and `flight-core.js`, all of them untracked in-flight work from another session and none of
them touched here. The failing assertion iterates `Flight.tuning.runSpeed`, which is **12**
in `flight-core.js` while `MOVEMENT-DEMO-COMPARISON.md` documents the sprint speed as
**6.6** — an unreconciled mismatch reported to the user rather than changed here, since the
file belongs to another session's live work.

### Limits

No physical playtest, no reference-parity measurement, no hardware benchmark. Stamina's
feel — whether 16 seconds at a five-day streak is right, and whether the drop-out reads as
fair — is exactly what cannot be established by automation, and **astra's check plus the
user's playtest are both still outstanding**. Climbing and gliding exemptions are covered
offline and by the standing-still browser assertion, not by a climbing browser case. The
recorded Genshin/Aether direction is unimplemented by design; "instead" remains unresolved.

## 2026-09-13 — Sprint reworked into dash / hold-to-lock, and its bar

Scope: World only. The user replaced the tap-to-toggle sprint the same day it shipped. One
press of Shift is now a **dash**; holding it past `x` settles into **running and locks**;
releasing never stops a locked run, and a **short dash is the only unsprint**. They then
revised it twice more: durations to **one third** of the first pass, then a **faster walk and
a faster, longer dash**, then the bar **vertical and accurately positioned** beside the
traveler. Final tuning: walk **5.2** (from 3.85), dash **1.35x** the run held **0.35 s**,
`x` = **1 s**, budget `2 s + 0.67 s per streak day` capped at 8 s, dash cost 1.
Still **implemented and not accepted**: the user directed that **astra** must check it.

### The recording is the specification

`Screencast from 2026-09-13 08-42-45.webm` was decoded locally with the system GStreamer at
10 fps into a scratch directory — no download, no new dependency, no repository file. Its
own on-screen tutorial at about 5.2 s reads **"Press Left Shift / RMB to evade, hold to
sprint"**, which is exactly the model the user described and what is now implemented. The
frames establish the *shape* of the rule only: no world-unit speed is derivable from footage,
and the dash timings were not measured frame by frame. The separate reference link the user
supplied earlier remains **unfetched** — the network call was refused by this environment's
permission layer, and it is recorded as a link with no description.

### Two defects the tests caught, both real

- **The dash never reached its own speed.** Steering toward a target that was already
  decaying could not catch it from a standstill: the burst measured **9.1** against a 12
  running speed. A dash is now an **impulse** on the body, and the burst **holds** for
  `dashHold` before descending; the frame that crosses the end of that hold decays only for
  the part of itself past it, so the curve stays identical at 30/60/120 fps. Measured
  **16.2** afterwards.
- **The unsprint could silently fail.** Gating the press on `grounded` swallowed it whenever
  the traveler was briefly airborne over a tread, leaving the player stuck in a run they had
  asked to end. The burst stays grounded-only, but a press that cannot dash is now still
  *heard* (`sprintHold`): no burst, no cost, and the release still means what it means.

### What ran

Offline, all passing: `stamina-core` (18, including the dash/lock/unsprint machine and the
airborne-press case), `core` (10), `flight-core` (7), `character-motion` (4), `map-core` (4),
`sky-core` (3). Browser: `sky` (8), `browser` (7), `camera` (5), `map` (5) and the flight
suite's route and new sprint cases. The sprint case reports the 5.33 s budget from the
five-day synthetic streak, a 16.2 dash peak settling to 5.24, the lock forming only after
`x` and surviving the key release at 12.19, the short-dash unsprint decaying to 5.21, the bar
anchored **0.0002 px** from the traveler's own projection and 24 px to their side at 7x92,
exhaustion refusing the dash, and `fixtureUnchanged` true throughout.

### Fail-first evidence

The offline suite was written before the module existed (`MODULE_NOT_FOUND`). For the browser
case, a scratch copy differing from the repository in exactly one rule — the exhaustion
drop-out removed — failed on precisely the assertion it is named for while every other
assertion still passed. Both rewrites of the browser case were driven by real failures with
diagnostics, not by relaxing assertions: the one assertion that was weakened, the body's
speed after an unsprint, was replaced by a stronger pair (the decay target itself, plus "no
longer running"), because terrain can slow the body further and that is not the claim.

### Pre-existing failures, isolated and NOT caused by this work

`tests/flight.test.js` case 1 and `tests/character-animation.test.js` fail on this tree, and
both did so before this task changed a line — they were run and seen failing while
`walkSpeed` was still 3.85. Both belong to another session's untracked in-flight animation
files. This task's own edits inside case 1 were verified by relaxing **only** the
pre-existing assertion in a scratch copy: everything else in it passes, including the
rewritten dash rules and the updated `groundSpeeds`.

The cause is now isolated for whoever owns that work: the animation proof yields
**`checks: 91`** against its `>100` threshold with `maxError` at **0.0000048**, so the rig
tracks its contacts and only the sample count falls short; and the hip-continuity failure is
at **run speed 12** (`hipDelta` 0.2975 against a 0.25 limit), not at the walk (0.1864). That
is the same `runSpeed: 12` that `MOVEMENT-DEMO-COMPARISON.md` had documented as 6.6. The
stale figure has been corrected in the documentation; the code was left alone.

### Limits

No physical playtest and no hardware benchmark. Whether the dash feels "optimal" against the
recording is exactly what automation cannot decide — **astra's check and the user's playtest
both remain outstanding**, and every number above is tuning for review. Climbing and gliding
exemptions are covered offline and by the standing-still assertion, not by a climbing browser
case. The recorded Genshin/Aether direction is still unimplemented by design.

**Bar clearance (2026-09-13, same day).** The user reported the vertical bar obstructing the
character model. Its offset moved from 24 px to **46 px** (34 px on narrow screens). Verified
by a captured screenshot at 960x640, not by the numbers alone: the traveler spans roughly
x=460-510 on screen and the bar now sits at x=526-533, anchored 46 px right of the projected
body. The browser case's "beside the character" assertion was tightened from "> 0 px" to
"> 30 px" so a later change cannot slide it back over the model.

**Animation rejected again, and the bar offset made camera-aware (2026-09-13, evening).**
The user supplied `Screencast from 2026-09-13 20-00-22.webm` and reported the body animation
"still very weird and unrealistic". It was decoded locally at 10 fps with the system
GStreamer into a scratch directory (87 frames, 8.7 s); no file entered the repository.

The measurable part of the complaint comes from the code, not the footage. `gaits` in
`character-animation.js` caps cadence at **2.35 cycles/s**, so step length is speed divided
by twice the cadence: **1.41** units walking (5.2), **2.55** running (12) and **3.45**
dashing (16.2), against a thigh+shin of about **0.85** units — i.e. **1.7x, 3.0x and 4.1x
leg length**, where a human step is roughly 0.8x to 2.3x. The body can only cover ground at
those speeds by lunging. Two independent signals agree: the module's own hip-continuity case
fails at run speed 12 (`hipDelta` 0.2975 against 0.25) and passes at the walk, and the flight
animation proof yields `checks: 91` against `>100`. Both predate this task. The fix is either
cadence that scales past its sprint value with speed — which preserves the faster movement
the user asked for twice — or lower speeds. **Not attempted here:** the animation files are
another session's in-flight work and the choice is the user's.

The same frames showed the sprint bar sitting on the model when the camera was zoomed in: a
fixed 46 px offset clears a traveler 74 px tall and does not clear one 222 px tall.
`playerProjection()` now also reports the traveler's **apparent height** (projecting a second
point 0.95 units above the first), and the offset follows it at 0.62x, floored at 46 px.
Verified by screenshots at both distances: gap **46 px** at the default camera (height 74)
and **137 px** zoomed in (height 222), with the body clear in both.

## 2026-09-13 — Disk hand-off review, rejected demo and sprint corrections

The parallel editor was closed and the user made disk authoritative. Re-read World rules,
Start here, the movement comparison, draft §4 and relevant current source/tests before
editing; subsequent concept reads were limited to affected §21/§26 slices. PLAN was not
needed. Saved a read-only comparison baseline of 21 task files under
`/tmp/track-world-handoff-baseline-20260913`; no earlier in-memory runtime was restored.

### Scope and gate

The user's hand-off explicitly fixes **walk 5.2, run 12, dash boost 1.35 (16.2 peak)** and
leaves both model-production choices blank. Asked the structured local-procedural versus
skinned/authored question before gait work. It remains unanswered at **World/AGENTS.md,
Stop for direction: commit to an art/content production approach**. The animation/rig,
flight-core and stamina-core files are byte-identical to the handed-off baseline. No
animation tuning or production commitment followed the hand-off. Independent sprint
review/corrections and documentation continued.

No downloads, installs, dependencies, accounts, purchases, Track runtime/data changes or
Git mutations. Read-only candidate research is recorded with sources and limits in the
movement comparison; no stock asset is described as already matching the reference.

### Recording and numerical inspection

- **Reference:** `Screencast from 2026-09-13 08-42-45.webm`; retained the earlier timed
  non-combat observations in the comparison. This was not confused with the second clip.
- **Rejected demo:** `Screencast from 2026-09-13 20-00-22.webm`; installed
  `gst-discoverer-1.0` reports **8.582157362 s, 350×377, VP8/WebM**. Used installed
  `gst-launch-1.0` (filesrc → decodebin → videoconvert → videorate at 24/1 → pngenc →
  multifilesink) to extract 207 frames to `/tmp/track-world-rejected-demo-20260913`.
  Viewed a half-second overview and 0.125-second sequences across the clip. Timings are
  resampled recording positions, not key/velocity telemetry or a real-time playtest.
  Wide low lunges, long trailing legs, sharply folded recoveries and sideways foot sweeps
  during reversals are visible. Bush occlusion limits parts of the route. No climb/glide/
  notebook-stow reference appears. Nothing from either video was copied into the repo.
- Executed the unmodified animation module at 120 Hz, warming one second and observing
  two at each fixed speed. `/tmp/track-world-handoff-gait-measurements.json` reports
  full-cycle cadence **1.892/2.350/2.350 Hz**; travel per step **1.374/2.553/3.447 u**;
  actual hip-to-ankle segment length **0.79 u**; maximum sampled hip changes
  **0.1864/0.2975/0.3865 rad** for walk/run/dash. These correct the preceding entry's
  approximate 0.85-unit leg and walking-step figures. The sprint maximum in this run is
  0.2975, rather than the hand-off's 0.2544; the exact observation window matters.
- Proposed resolved-travel-driven cadence with bounded stride/contact duration, retaining
  distinct gait choreography. This is a mechanism for the next chosen production path,
  not a completed fix. The old <2.6 Hz test ceiling and absent dash case remain work for it.

### Failures first, corrections and review concerns

1. `node World/tests/character-animation.test.js` failed **1/8** on continuous-stride hip
   continuity; the other seven passed. Log: `/tmp/track-world-handoff-animation-before.log`.
   This failure remains open. The animation source was not edited afterward.
2. The handed-off full flight suite passed **8/9**, failing its first case's `checks>100`
   sample-count guard. The route and main sprint case passed. Log:
   `/tmp/track-world-handoff-flight-before.log`. Extended the stable NullEngine observation
   from 360 to 600 samples instead of relaxing the contact-error or count thresholds.
3. Added two browser regressions and ran them **before** the source fixes using
   `node --test --test-name-pattern='sprint handoff' World/tests/flight.test.js`.
   Both failed for their intended reasons (plus the aggregate parent): canvas/hint/help
   still described the superseded toggle; an exhausting dash at the supported zero-streak
   budget recovered into `locked:true, held:true` without a fresh press. Log:
   `/tmp/track-world-handoff-regressions-before.log`. The zero-streak fixture replaces
   synthetic LIN records with an empty list; it does not reverse an implementation rule.
   No doctored implementation was placed in the repository.
4. Fixed scene exhaustion to clear **either** a lock **or** an unfinished hold. The paid
   burst still decays under the existing rules. Corrected the three control-text surfaces,
   their cache versions (`scene` 21, `app` 20), and the durable Shift rule in World/AGENTS.
5. Additional isolated review probe:
   `/tmp/track-world-handoff-stamina-probe.js` / `...-probe.log`. A fractional balance of
   0.2 purchases the full 16.2 burst, spending only 0.2. Ground drain tests commanded
   velocity: against a synthetic barrier, commanded speed remained ~12 while the body
   accumulated only 0.231 u over 1.10 s and spent 1.10 stamina. This was **not** zero
   displacement, so it does not prove completely stationary drain on that fixture.
   The code's commanded-velocity test and partial-payment rule are explicit review
   concerns, preserved without retuning and recorded for direction. The probe also
   reproduced the exhausting-held-dash lock before correction. Browser errors were empty.
6. Read the actual Track LIN active-day/streak functions in `progress.html`. The synthetic
   projection retains the active-item/stageRevert distinction and today/yesterday rule;
   it deliberately receives local-day arithmetic instead of repeating Track's UTC code.
   No Track code was changed.

### Final execution after the last runtime/test edit

Environment: **Node v22.23.2**, **Google Chrome 152.0.7977.75**, **Linux
7.0.0-30-generic**, existing vendored **Babylon 9.25.0**. Browser suites used temporary
loopback servers and isolated headless Chrome/SwiftShader profiles, **one graphics-heavy
suite at a time**. Flight/new regressions used **960×640**; camera/sky use their
**1280×800** harnesses; map/general use **1440×900** and their existing narrow cases.
No packages were installed to run them.

| Command (repository root) | Result | Log in `/tmp/` |
| --- | --- | --- |
| `node World/tests/core.test.js` | 10/10 passed | `track-world-handoff-final-core.log` |
| `node World/tests/flight-core.test.js` | 7/7 passed | `track-world-handoff-final-flight-core.log` |
| `node World/tests/stamina-core.test.js` | 18/18 passed | `track-world-handoff-final-stamina-core.log` |
| `node World/tests/character-motion.test.js` | 4/4 passed | `track-world-handoff-final-character-motion.log` |
| `node World/tests/flight.test.js` | 12/12 passed | `track-world-handoff-final-flight.log` |
| `node World/tests/camera.test.js` | 5/5 passed | `track-world-handoff-final-camera.log` |
| `node World/tests/map.test.js` | 5/5 passed | `track-world-handoff-final-map.log` |
| `node World/tests/sky.test.js` | 8/8 passed | `track-world-handoff-final-sky.log` |
| `node World/tests/browser.test.js` | 7/7 passed | `track-world-handoff-final-browser.log` |

All final listed suites completed with no skipped/cancelled cases. The animation suite's
separate **7 passed / 1 failed** result above remains current for the unchanged animation
file; it was not re-run merely to reproduce the same known failure. An earlier review
invocation of three pure files via `node --test` reported file-level plans only; the final
commands above ran each directly and exposed the actual 10/7/4 case counts. The earlier
18-case stamina review run also passed. No root Track suite was applicable or run.

Final flight evidence: **176** measured support samples, maximum actual Babylon ankle
error **0.00000537 u**; notebook transfer/reversal maximum step **0.06853 u** with full
scale retained. The dash peaked at **16.2**, tapped decay reached **5.2371**, a held lock
survived release at **12.192**, and short-dash unsprint settled to **5.2131**. The bar
remained 7×92 px and ~46 px beside the projection at the tested view. The zero-streak
exhaustion case now recovers with **locked:false, held:false**, and a fresh press works.
Synthetic fixtures remained unchanged and the browser error checks passed. Viewed the
final 960×640 climbing/notebook screenshot; this is a static regression inspection, not
a claim about the rejected ground animation.

`node --check` passed for both changed runtime JS files and the changed flight test.
`git diff --check` passed. Checked local Markdown file targets and inspected the scoped
hand-off diff. Current behavior/concerns and corrected measurements are in README and
the comparison; concept §4/§21/§26 preserve the latest direction; NOTES Start here now
names the first unanswered gate. No user-authored sprint/dash/stamina tuning was reverted.

### Limits and next physical review

The new correction was executed in real headless Chrome; there is no newly written
runtime code left unexecuted. The controller tests do not cover every input interleaving
or establish exact Genshin rules, clip matching, human movement, clothing deformation or
sustained laptop performance. The reference tutorial does not prove the custom persistent
lock or short-dash-only unsprint; those come from the user's explicit instructions.
Actual physical touchpad delivery and the 20-minute graphics target are unproved by these
SwiftShader runs. No model, clip or Blender/loader workflow was tried or installed.

For the laptop: reload, check tap/hold/release/short-dash behavior and the updated help;
exhaust stamina with repeated dashes, keep Shift held during recovery and report any
unrequested return to running; then compare future body revisions at unchanged speeds,
reporting timestamps and the exact pose/transition. The current body is still rejected,
and its production-path answer is required before that revision begins.

**Subsequent user steering in this same session:** the user explicitly rejected further
micro-adjustment: the model walks robotically, running reads as fast walking, and jogging
and convincing running momentum are missing. They reaffirmed the Aether/Genshin model and
other non-combat motion, specifically climbing and falling. Recorded this as the visible
model/animation target in draft §4, the comparison and NOTES. Recommended replacing the
jointed model and gait with a skinned/authored approach; the structured production choice
remains unanswered. No further runtime edits followed this feedback. These documentation
changes did not trigger another game test run or a claim that the animation is fixed.


## 2026-09-14–15 — selected local body-animation rebuild

The user selected the local procedural path on the existing rig, closing the production
question. During implementation they directed inspection of all local `.webm` files and
specified excessive leg reach and rapid limb movement as the defects. The five discovered
screencasts were decoded with installed GStreamer; full-duration overview sheets and 12 Hz
movement detail are in `/tmp/track-world-video-review-20260914/`. `16-57-19` is additional
Genshin ground evidence and `17-52-28` supplies climbing on a different character.
`09-05-56` and `20-00-22` are demo recordings. Three extension tutorial videos were
classified as unrelated image-editing demonstrations. Timing estimates remain approximate;
no 3D joint tracks, root distances or source clips were recovered. The comparison records
the observations, including missing player-glide/notebook evidence.

### Failing first, with an untouched source baseline

Before runtime edits, copied the current World scripts into
`/tmp/track-world-body-rebuild-before-20260914/World/scripts/`, and stored SHA-256 hashes in
that scratch tree's `baseline-hashes.json`. New/extended test files were copied there and
run against those **unchanged pre-rebuild scripts**, never doctored repository code.
Final hash comparison confirms every scratch runtime/index file still matches its baseline.

- `node /tmp/track-world-body-rebuild-before-20260914/World/tests/character-animation.test.js`
  ended **6 passed / 6 failed** with the final cases. Failures: timing still too fast;
  dash lacks separate timing; excessive fore/aft foot reach; a turning foot crosses the
  body; speed transitions stretch a step; down-climbing repeats the upward reach.
  `/tmp/track-world-body-rebuild-before.log` contains the assertions.
- The extended flight browser case ran against the same scratch runtime. It measured
  actual Babylon support-ankle error of **0.084565 u in jog** and **0.093550 u in dash**,
  beyond the unchanged **0.025 u** tolerance. Jog is the first failing assertion;
  all four measurements were collected before it. This rendered-position mismatch is the
  **load-bearing contact failure**: an internally consistent contact planner alone could
  otherwise pass while the visible foot missed the contact.
  Log: `/tmp/track-world-body-rebuild-browser-before.log`.
- Initial scratch-browser attempts failed infrastructure setup (sandbox sockets, then
  the server refusing asset symlinks). Those are **not** counted as regression evidence.
  Copying the existing opaque local runtime dependency into the scratch fixture resolved
  the fixture; no dependency source was inspected, downloaded or changed.

An initial faster-cadence implementation was rejected as the wrong response to the user's
mid-task timing correction. The final tests bound visible cadence and actual foot reach;
`speed / (2 * cadence)` is body travel per step, including flight, and is not a foot-reach
measurement. That distinction prevents a mathematical speed-matching assertion from
forcing the very rapid cycling the user rejected.

### Final commands and results

Node **v22.23.2**, installed Chrome **152.0.7977.75**, existing Babylon **9.25.0**.
Browser suites used isolated profiles and temporary loopback servers with software
rendering, **one graphics-heavy suite at a time**. This is not a physical laptop benchmark.
All commands were run from the repository root; logs use
`/tmp/track-world-rebuild-final-<suite>.log`.

| Command | Passed |
| --- | ---: |
| `node World/tests/core.test.js` | 10/10 |
| `node World/tests/sky-core.test.js` | 3/3 |
| `node World/tests/map-core.test.js` | 4/4 |
| `node World/tests/flight-core.test.js` | 7/7 |
| `node World/tests/stamina-core.test.js` | 18/18 |
| `node World/tests/character-motion.test.js` | 4/4 |
| `node World/tests/character-animation.test.js` | 12/12 |
| `node World/tests/browser.test.js` | 7/7 |
| `node World/tests/camera.test.js` | 5/5 |
| `node World/tests/sky.test.js` | 8/8 |
| `node World/tests/map.test.js` | 5/5 |
| `node World/tests/flight.test.js` | 12/12 |

**95/95 passed**, no skipped or cancelled cases. `node --check` passed for both
changed runtime scripts and both changed test scripts. `git diff --check -- World`
passed, and local Markdown targets resolve.

Final flight checks measured the actual rendered hierarchy after two seconds of warm-up:

| Set | Support samples | Maximum ankle/contact error (u) |
| --- | ---: | ---: |
| Walk | 496 | 0.00000345 |
| Jog | 346 | 0.00000595 |
| Run | 225 | 0.00000647 |
| Dash | 162 | 0.00001065 |

Notebook transfer/reversal retained full size and the expected hand/belt mounts, with a
maximum sampled displacement of **0.078964 u**. The flight route retained jump/landing,
climb/held reading/detach, four-jump-height clearance, launch/glide/island recovery and
synthetic-data isolation. Dash peaked at **16.2**; the tapped decay reached **5.2371**;
held running remained locked after release; short-dash unsprint and exhaustion behaved as
before. These are controller evidence, not visual acceptance.

The offline suite separately covers all four sets at 30/60/144 Hz, steady contact,
continuity, 90°/180° turns driven by the existing steering helper, stopping/restarting,
all four set transitions in both directions, running jump progression, directional
climbing, held grips, reset and frozen read-only inputs. Its compact foot envelope is
**±0.62 u** in steady forward motion, **±0.70 u** through speed changes.
Measured full-cycle cadence was **1.70 / 1.88 / 2.05 / 2.20 Hz**. In a separate four-second
steady window, maximum ankle fore/aft reach was **0.482 / 0.521 / 0.564 / 0.603 u**;
maximum hip changes per 1/120 s were **0.119 / 0.186 / 0.223 / 0.290 rad** (rounded).
Measurements: `/tmp/track-world-rebuild-measurements.json`.

Final visual staging rendered **48** side-on frames across all four sets with no browser
errors; inspected pose sheets and the final shin-mounted boot cuff/leg geometry.
`/tmp/track-world-rebuild-visual-review.log`, `track-world-rebuild-visual.json`, and
`track-world-rebuild-<walk|jog|run|dash>-sheet.jpg` hold these artifacts. Static sheets do
not prove playback naturalness. The loopback demo remains available at port **8877**.

### Scope and remaining proof

Runtime hash comparison against the pre-edit snapshot finds changes only in
`character-animation.js`, `character-rig.js` and `World/index.html` (both changed script
queries **v2 → v3**). `character-motion.js`, `flight-core.js`, `stamina-core.js`, scene,
input and camera code are byte-identical to the starting snapshot. No Track runtime,
stored data, Git history, dependency, install, download, external service or art approach
was changed. Existing working-tree changes were preserved. Browser/socket sandbox
permissions were granted; no purchase/content/dependency gate was crossed. No subagents
were used, and the root verification log and PLAN were not read.

**Not proved:** naturalness, exact Genshin/Aether parity, a no-flight human walk at 5.2,
terrain-adaptive grip/contact, notebook clearance in every pose, smooth skin/cloth,
physical input feel or sustained target-hardware performance. Short contact periods leave
flight intervals in the relaxed walk. The comparison demonstrates the speed/scale/timing
constraint arithmetically; it does not prove that all local improvements are exhausted.
Visible rigid joint seams remain. No paid candidate has been demonstrated necessary or
sufficient to close these gaps, so no purchase is parked as a prerequisite or new decision.

For user review: reload the demo; judge leg reach and limb rhythm first, then
walk↔jog↔run↔dash (jog appears through acceleration/braking), 90°/180° turns,
stop/restart, running jump/landing, climb/hold/detach and notebook carry/stow clipping.
Current behavior is in README, future visual/hardware work in NOTES, and the production
selection plus timing correction in draft §4/§21/§26.

## 2026-09-15 — accepted rhythm, seated-posture correction

The user accepted the rhythm and reported no movement errors, while rejecting the model's
forward legs and “sit walking/running” silhouette. This increment changes posture and
the proportions consumed by the existing rig. The four cycle rates, planned support
windows, controller speeds and all input/traversal rules are retained. Direction is
recorded in draft §4; README describes the current body; NOTES requests posture review.

### Reference and visible diagnosis

Re-inspected the locally decoded ground-reference sequences from `08-42-45.webm` and
`16-57-19.webm`, including 12 Hz run/jog sheets and the first recording's full non-combat
overview. The existing five-video inventory remains applicable; no new screencast was
present in the screencast directory. No combat frames informed this correction.
The reference shows alternating trailing heels and forward body carriage. Its oblique
rear views and clothing do not expose exact 3D bone rotations. The angle bounds below
are local regression criteria, **not measured reference joint tracks**.

The preceding demo's side sheets show low hips and both thighs forward through much of
each cycle. Its correct ankle contacts did not detect this defect. The foot path moved
toward the next strike too early; low pelvis curves further increased hip flexion.
The new set-specific recovery paths fold behind the hips before coming through.
Thigh/shin lengths changed from **0.46 / 0.43** to **0.49 / 0.46 u** and pelvis carriage
rose, while retaining a soft supporting knee. A trial that simply raised the shorter
rig toward straight knees failed existing hip-continuity bounds; the final proportions
and reach reserve pass those bounds without loosening them or increasing cadence.

### Failing-first evidence

Before runtime edits, copied source/tests into
`/tmp/track-world-posture-before-20260915/World`. Saved SHA256 hashes for every World
runtime script and index; subsequent checks confirm the scratch runtime/index stayed
byte-identical. Updated tests only in that scratch tree, never doctored repository code.
The scratch browser used copied existing local server/assets/dependency and harness files;
no dependency source was inspected or acquired.

- New offline case `all four gaits carry the hips above the legs instead of sitting
  between two forward thighs` failed first: walk had both thighs more than **0.30 rad**
  forward for **35.8%** of the sampled cycle. All four sets were measured before asserting.
  The pre-change suite result was **12 passed / 1 failed**.
  Log: `/tmp/track-world-posture-before.log`.
- Extended the existing `ground movement` browser case to measure actual hip/knee
  positions projected into the actor's facing direction through turns. It failed first
  on walk's **34.7%** simultaneous forward-thigh fraction, while its ankle contact error
  was only **0.00000345 u**. This is the **load-bearing regression**: correct contacts
  and previously passing movement tests coexisted with the user's rejected silhouette.
  All four sets were collected before assertions. The focused scratch run was **0 passed /
  1 failed**, with no infrastructure failure.
  Log: `/tmp/track-world-posture-browser-before.log`.

The new bounds allow less than 15% simultaneous forward thighs, pelvis above 0.87 u,
and maximum forward thigh angles of 48°/50°/53°/55° across the four sets. The existing
hip continuity, foot reach, cadence, contact and transition limits remain in place;
the accepted nominal cadences now also have explicit ±0.001 Hz checks.

### Actual rendered skeleton measurements

Each set has **959** post-warm-up posture samples at 120 Hz, including gradual facing
changes. “Both forward” means both thigh projections exceed sin(0.30), normalized by
actual rendered thigh length; it is a geometric proxy for the seated pose, not an
automatic naturalness score. Distances are scene units.

| Set | Both forward, before → after | Maximum forward thigh, before → after | Lowest pelvis, before → after | Final support error / samples |
| --- | --- | --- | --- | --- |
| Walk | 34.7% → 0% | 57.5° → 44.7° | 0.834 → 0.915 | 0.00000304 u / 496 |
| Jog | 36.3% → 0% | 59.3° → 40.9° | 0.830 → 0.914 | 0.00000595 u / 346 |
| Run | 35.5% → 0% | 62.7° → 40.1° | 0.810 → 0.914 | 0.00000693 u / 225 |
| Dash | 33.5% → 0% | 61.3° → 38.8° | 0.804 → 0.925 | 0.00001070 u / 162 |

Support tolerance remains **0.025 u**. Contact sample counts match the preceding build;
cycle rates remain **1.70 / 1.88 / 2.05 / 2.20 Hz**. Full-size notebook transfer and
reversal still measured a maximum **0.078964 u** step and correct hand/belt mounts.
Raw final data are in `/tmp/track-world-posture-final-flight.log`.

Rendered and inspected **48** final side-on poses across walk/jog/run/dash, with no
browser errors. Sheets: `/tmp/track-world-posture-final-<walk|jog|run|dash>.jpg`;
pose data: `/tmp/track-world-posture-final-visual.json`;
paired review artifact: `/tmp/track-world-posture-comparison.jpg`.
These sheets demonstrate the pose change, not playback naturalness.

### Final verification

Ran every suite listed in World README against the final source. **96 tests passed**,
with no failed, cancelled or skipped cases. The five browser suites ran sequentially
using installed **Chrome 152.0.7977.75** and temporary loopback servers; offline checks
used **Node v22.23.2** and its built-in runner. No dependencies were downloaded.

| Suite | Passed |
| --- | ---: |
| core | 10 |
| sky-core | 3 |
| map-core | 4 |
| flight-core | 7 |
| stamina-core | 18 |
| character-motion | 4 |
| character-animation | 13 |
| browser | 7 |
| camera | 5 |
| sky | 8 |
| map | 5 |
| flight | 12 |

Logs: `/tmp/track-world-posture-final-<suite>.log`; runner summaries:
`/tmp/track-world-posture-pure-results.json` and
`/tmp/track-world-posture-browser-results.json`.
`node --check` passed for the changed runtime script and both changed test scripts.
`git diff --check -- World` and local links in the four behavior/direction/remaining-work
documents passed. Final runtime/index/test hashes are in
`/tmp/track-world-posture-final-hashes.json`. The existing playable server was verified
listening on **127.0.0.1:8877**; reload receives animation **v4**.

### Scope and remaining proof

Runtime/index hash comparison against this increment's baseline changes only
`scripts/character-animation.js` and `World/index.html` (**animation query v3 → v4**).
The rig reads shared dimensions, so its mesh proportions change without a second geometry
definition or source edit. Controller, motion feed, scene, input/camera, stamina and
Track runtime are unchanged. No stored Track data, Git history, dependency, installation,
download, external service or production approach was changed. The existing dirty working
tree was preserved. No subagents were used; neither vendor source nor the root verification
log was read. Sandbox approval covered local Chrome/loopback checks only.

Naturalness and exact Genshin/Aether limb/body angle parity remain **unproven**. Rigid
surface seams, notebook clearance in every pose, terrain grip/contact, the walk's flight
intervals and sustained laptop performance remain limitations. Player-gliding and notebook
reference motion are still absent, and detailed wall/detach parity is not established.
This correction does not show that the local approach is exhausted. No paid candidate
was found necessary or parked as a later purchase decision, and no user hard gate stopped
the increment. Review side-on walk/run posture first, then all four set transitions,
90°/180° turns, stop/restart, running jump/landing, climb/detach and notebook clipping.
