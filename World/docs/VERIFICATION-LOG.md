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

## 2026-09-19 — evidence closure for the September 15–17 foot-ground push-off increment

This entry records the previously shipped push-off code, before any character-scale
change. The starting tree was clean at `5e247de`. No runtime or test source was changed
for this verification. The current files already contain animation **v5**, rig **v4**,
the push-off cases and the README description.

### Reproduced failing-first evidence

Ran `node /tmp/track-world-push-before-20260915/World/tests/character-animation.test.js`:
**13 passed, 1 failed**. The scratch runtime and index still match every SHA-256 in
`/tmp/track-world-push-before-20260915/baseline-hashes.json`; the test file is identical
to the current test. This is the preserved pre-change code, not a doctored repository copy.
The load-bearing failure is **body velocity at foot release**, in
`grounded loading and push-off give the body upward momentum before either foot releases`:
the base tier is falling at **−2.466811 u/s** instead of rising. Its diagnostic also
measures downward release in jog/run/dash, and zero load-to-release rise in all four.

Ran `node World/tests/character-animation.test.js`: **14 passed**. Its new case checks
each set's body rise, positive release velocity, heel rise, supporting-knee extension
and airborne gravity arc. Existing cadence/contact/continuity and transition cases still
cover all four historical set keys. These are kinematic constraints, not a naturalness test.

| Set | Pre-change minimum release velocity (u/s) | Current minimum release velocity (u/s) | Current load-to-release rise (u) | Current heel rise (u) |
| --- | ---: | ---: | ---: | ---: |
| walk (base) | −2.466811 | 0.813637 | 0.089024 | 0.053382 |
| jog | −3.579092 | 1.124094 | 0.081173 | 0.053553 |
| run | −4.936562 | 1.225173 | 0.080321 | 0.053119 |
| dash | −6.020634 | 1.225312 | 0.081082 | 0.052229 |

The implementation ties pelvis loading/push/flight to support, holds the forefoot while
the heel rises, and prevents a recovering swing leg from lowering the pelvis. The rig
counters parent rotations to maintain the requested foot orientation. Animation observes
the controller; it supplies no movement impulse to it.

### Sequential browser rerun and verdict

Ran the following separately, waiting for each process to exit before starting the next,
using **Node v22.23.2 / Google Chrome 152.0.7977.75** and the existing isolated CDP harness:

| Command | Passed | Failed | TAP duration |
| --- | ---: | ---: | ---: |
| `node World/tests/sky.test.js` | 8 | 0 | 28.83 s |
| `node World/tests/map.test.js` | 5 | 0 | 73.77 s |
| `node World/tests/flight.test.js` | 12 | 0 | 106.13 s |

The previously interrupted map selection and flight climb/detach cases both pass.
**No product regression was reproduced. The historical CDP closure's cause remains
unproven.** In particular, the preserved `/tmp/track-world-push-browser-suites.py`
uses blocking `subprocess.run` inside a loop, and its result JSON contains the same
sky/map/flight failures. That last recorded attempt was sequential; its existence
contradicts treating parallel execution as an established cause. The old logs contain
`CDP connection closed`, without a browser crash reason. The current passing rerun
closes the verification debt, but does not retrospectively diagnose those disconnects.

The flight suite also measures the actual Babylon hierarchy, independently of the
pure solver. In the nominal cadence fixture, the visible toe sole remains on its
planted ground point while the ankle rises:

| Set | Sole-contact samples | Maximum sole error (u) | Complete pushes | Minimum rendered release velocity (u/s) | Minimum rendered rise (u) |
| --- | ---: | ---: | ---: | ---: | ---: |
| walk (base) | 496 | 0.000003887 | 13 | 0.813639 | 0.089024 |
| jog | 346 | 0.000007197 | 15 | 1.120691 | 0.081173 |
| run | 225 | 0.000008350 | 16 | 1.225176 | 0.080321 |
| dash | 162 | 0.000010951 | 17 | 1.225319 | 0.081082 |

Logs: `/tmp/track-world-debt-20260919-{sky,map,flight}.log` and
`/tmp/track-world-debt-20260919-animation-{before,current}.log`.
The September 17–18 interrupted logs remain at `/tmp/track-world-push-final-<suite>.log`.
`node --check` passed for `character-animation.js`, `character-rig.js` and both changed
test scripts (`character-animation.test.js`, `flight.test.js`). Comparing current
runtime/index hashes with the push-off baseline changes only animation, rig and index;
scene, controller, motion feed, input/camera and stamina source are unchanged.

This is a fresh **three-browser-suite baseline plus the animation suite**, not a claim
that all twelve README suites ran today. The full sequential run belongs after the
separately gated scale implementation. No new dependency, download, purchase, external
service, Track runtime/data change, commit or push occurred. Naturalness, exact reference
parity and sustained hardware performance remain unverified. The later September 19
rulings govern subsequent work; this evidence does not reopen joint-angle tuning.

## 2026-09-19 — scale decision preparation and reference-timing inspection

Task 1 above was recorded before beginning this work. Runtime and tests remain unchanged
at `5e247de`; **no scale change has been implemented**. The proposed k=1.30 step/leg
table and the pending jump/gravity/step-up/camera choice are in the comparison and draft.
Production-path research and new traversal animation have not begun.

Used the installed GStreamer `matroskademux`, `vp8dec`, `videorate` and `pngenc` to
decode local clips at 30 samples/s into `/tmp/track-world-scale-reference-20260919`.
The first classified-target inspection was `08-42-45`; the next was the user-reported
1x `11-28-38`. Only non-combat/allowed windows were viewed. Side-view comparisons also
inspected `09-46-46` and `21-31-32`. No video, asset or dependency was fetched externally.
The frame batches contain 597, 643, 148 and 418 samples respectively. Sampling is not
source-frame timing recovery; manual event locations have a one/two-sample uncertainty.

Inspection artifacts include `original-run-detail.jpg`, `original-phase-identity.png`,
`baseline-cycle-detail.jpg`, `baseline-later.jpg`, `baseline-airborne-evidence.jpg`,
`baseline-end-ground.jpg`, `side-run-cycle-detail.jpg` and `base-tier-cycle-detail.jpg`
under that temporary directory. The last two side views show approximate same-leg
recurrences at 1.00/1.67/2.33 s and 6.00/6.67/7.33 s respectively (~1.5 recorded cycles/s).
The original sprint passage repeats around 6.07/6.50/6.93 s (~2.3 recorded cycles/s).

**Absolute playback-speed classification remains unresolved.** The proposed timing
baseline contains visible airborne rise/descent and held leg poses, including the
9.1→9.6→10.6→11.6 s sequence captured in `baseline-airborne-evidence.jpg`. The later
side view is settling, without an established full slow-walk cycle. Treating those
sequences as steady running would create a false comparison. An initial coarse
fourfold-rate impression was withdrawn for that reason. A trial image-mask diagnostic
also failed to isolate the legs and supplied no measurement; none of its correlation
output is used. No reliable real-time full-cycle rate is claimed for this baseline,
and its user-reported 1x status has not been silently changed.

The comparison's clip index records the unresolved verdicts and retains both permanently
pose-only clips. It also corrects the inverted quarter-speed arithmetic: recorded time
is divided by four, while cadence is multiplied by four. The demo's 1.70/1.88/2.05/2.20
Hz rates remain untouched. Task 2b is therefore **partly measured, not complete**; a
trustworthy running timing baseline or confirmation of the usable source timing is
still needed. This finding does not authorize retuning.

The required gate is the user's September 19 scale ruling and hand-off: growing the body
and scene conflicts with frozen world-unit jump, gravity, step-up and camera quantities.
Both concrete choices are prepared for the user, and implementation is held for the
answer. The projected table is not a shipped measurement or a claimed reference fit.
No new naturalness, reference-parity or hardware-performance claim is made.

Final documentation review: `git diff --check -- World` passed and relative file links
in all four edited documents resolved. `git status --short --branch` showed only those
four World documents modified; no runtime, test, index or Track file changed in this run.


## 2026-09-20 — uniform 1.30 scale, Option A

**Scope:** uniform character/scene scale, approved jump/gravity/step-up/camera scaling,
with fixed ground speeds and accepted cadence. No new gait curves, clip timing retune,
newly referenced traversal choreography or production-source research. The separate
launch/glide/climb/detach scaling question remains pending; those speeds are untouched.

**Failing first:** copied pre-change World runtime/index into
`/tmp/track-world-scale-before-20260920`, with SHA-256 receipts for all 15 runtime/index
files. Added only the new tests to that tree. All 15 hashes still match after testing.
The pure flight case failed on `approved jump impulse must scale with the body`
(`/tmp/track-world-scale-before-core.log`). The rendered Chrome case failed on the actual
hip→knee→ankle chain: **0.9500000183**, expected **1.235**
(`/tmp/track-world-scale-before-browser.log`). **That rendered-bone failure is load-bearing:**
changing a metadata label or camera alone cannot pass it. An earlier scratch attempt had
only a load timeout because the server rejects symlinked files; copying the local engine
and shared modules into scratch resolved that setup error before the meaningful failure.
No production source was doctored, and no dependency was fetched.

**Focused after checks:** animation **14/14**; rendered scale + ground checks **2/2**.
Measured rendered leg **1.2349999274**, collider **[0.455,1.144,0.455]**, camera distance
**11.44**. Bridge x/z **12.35/6.5**, deck **0.5525**; Cloudrest z **72.8**, pad **25.064**.
Rendered forefoot errors for base/jog/run/dash stayed below **0.000019 u** on the flat
fixture, with positive body velocity at release in all four sets. Accepted full-cycle
rates remain **1.70/1.88/2.05/2.20 Hz**; contact and continuity checks cover all four.
Notebook transfer retains local scale 1 under the uniformly scaled root; maximum sampled
world displacement per 1/60 s transfer frame was **0.1027 u**. These are geometric checks,
not proof of naturalness, terrain adaptation or notebook clearance in every pose.

**Test maintenance:** expected world-space dimensions/route coordinates scale with k;
model-space posture and angular continuity bounds stay unchanged. One camera case compared
snapshots across separate protocol calls and failed on a **1.1e-14 u** collision-settling
change. It now compares immediately before/after Home in one event turn, preserving its
strict no-teleport assertion without changing the controller or widening its tolerance.
The first suite output is `/tmp/track-world-scale-final-camera.log`.

**Syntax/cache:** Node checks passed for all six changed runtime scripts and the changed
animation, flight-core, flight, map, sky and camera tests. Cache queries: flight-core **6**,
character-animation **6**, character-rig **5**, sky-scene **2**, map-view **5**, scene **22**.
`git diff --check -- World` passed. Track runtime files already dirty in another session
were left untouched; no Track data, download, dependency, install, purchase, commit or push.

**Limits:** side-view clips establish pose sequence but not a world-unit leg length.
k=1.30 applies the user's base-tier priority, not an asserted recovered reference scale.
The timing-calibration problem remains as recorded in the preceding entry. Automated
checks cannot establish naturalness or Genshin parity. The same rigid model and its seams
remain visible. Physical laptop performance and the user's scale acceptance are unproven.

**Sequential required-suite run:** all twelve README suites ran in order, one browser at
a time, via `/tmp/track-world-rebuild-browser-suites.py`; results are in
`/tmp/track-world-scale-suite-results.json` and `/tmp/track-world-scale-final-*.log`.
Core **10/10**, sky-core **3/3**, map-core **4/4**, flight-core **8/8**, stamina-core
**18/18**, character-motion **4/4**, character-animation **14/14**, browser **7/7**,
sky **8/8**, map **5/5**. Camera initially **3/5** (one failed child plus its parent);
after the same-event sampling correction it passed **5/5** in
`/tmp/track-world-scale-camera-rerun.log`.

The full flight suite reported **8/10**, with two failures: the charged launch height,
and a hold-to-lock test beginning after a fixed-duration tap without ensuring a grounded
press. The latter test now explicitly waits for the body to settle on the floor before
starting a grounded-only dash; no input or stamina runtime changed. The route's ordinary
jump, wall-first grab, climb while reading, outward detach, ledge top-out, charge cancel,
rendered body/contact, exhaustion and instruction checks all passed before the launch
failure. The route stopped at launch: **Cloudrest/Windward landing, airborne notebook
reading there, elevated-island clearance and last-island recovery were not reached** in
this scale run. They are not claimed green from the earlier pre-scale run.

**Open gate:** Option A changed normal jump/gravity, step-up and camera only. The separately
asked launch/glide/climb/detach rescale still has no answer. With the current 34 maximum
launch impulse and 23.4 gravity, even the continuous-time apex of the feet is only
`0.234 + 34²/(2×23.4) = 24.93485`, below Cloudrest's **25.064** pad. The simulation's
finite-step apex is lower. The failed height assertion is consistent with this concrete
unreachable route, not evidence of a mysterious animation defect. The gate is recorded
in NOTES and disclosed beside the ground-playable build; no silent retune was made.

## 2026-09-20 — the scale narrowed to the body alone; the scene reverted

**Why.** The user reviewed the uniform 1.30 build recorded in the entry above and
reported that it had changed nothing visible except a speed decrease. That verdict is
arithmetically correct and the build was doing what it was told: scaling the body, the
scene AND the camera by the same factor is a similarity transform, so it renders
identically frame for frame — jump included, since `2v/g` is unchanged when impulse and
gravity scale together. The one term left unscaled was speed, so the only perceptible
effect of the whole increment was that fixed speeds covered 30% less of an enlarged
world. The user chose to keep the 1.30 body and return everything else to its authored
size.

**What changed.** `worldScale` became `characterScale` and now reaches the character's
own anatomy only: the rig root, the animation's model↔world conversion, the collision
ellipsoid, the feet offset below the collider centre, the limb reach used to probe walls
and ledges, and eye/crown heights. `scene.js`, `map-view.js`, `sky-scene.js` and
`flight-core.js` were restored from `HEAD` and the body scaling re-applied to 28 sites in
`scene.js` rather than un-picking ~50 world sites by hand; the whole of the reverted diff
was verified scaling-only first, so no behavioural fix was dropped. Jump **6.2**, gravity
**18**, step-up **0.24**, camera **8.8** and every traversal speed are back at their
authored values — the frozen list was un-edited, not edited again. The separately pending
launch/glide/climb/detach rescale is **dissolved**: with the islands at their authored
distance the unchanged 22+12 impulse reaches Cloudrest, and `height means clearance above
the island` passes.

**Failing first.** Two doctored baselines in a scratch tree, `scripts/` and `tests/`
copied for real, never symlinked, each differing from the repository in exactly one line.
**A** set `characterScale` to 1.00; **B** restored `jumpSpeed:6.2*characterScale,
gravity:18*characterScale`. Their failure sets are **disjoint**: A fails `ruling 3 scales
the body by 1.30` and `a 1.30x body is what cuts step length against leg length`, B fails
`the character scale reaches the body alone`. Reaching disjointness required splitting the
first flight-core case in two — as one case it asserted two independent claims and B's
failure set was a strict subset of A's, which proves neither case load-bearing on its own.

**Results.** Offline suites, all green: core 10, sky-core 3, map-core 4, flight-core **9**,
stamina-core 18, character-motion 4, character-animation **15**. Browser suites run
sequentially, one at a time: browser 7/7, camera 5/5, sky 8/8, map 5/5. `map` and `sky`
had also been scaled by the previous session and their world coordinates were reverted;
`sky` had been passing only through its `++frames>500` escape hatch, so that was a false
pass rather than a real one.

**flight 11/13 — the two failures are real, isolated, and NOT flakiness.**
`Space grabs the wall first, climbing owns input, and Space detaches outward without
gliding` and its parent route case fail. A one-variable control — the whole tree copied
with `characterScale` 1.00 and nothing else touched — passes both, failing only the two
body-scale assertions it is designed to fail. That control was initially invalid: the
repository run was at load 20.14 and the control at 9.94, two variables rather than one,
so the repository suite was re-run at load 8.17 and failed the same case a third time.
The control also failed *everything* on its first attempt, which is a broken harness
rather than a regression — `World/tools/serve.js` maps `/track-core/` to a sibling
`scripts/` the scratch tree lacked.

**The cause, measured.** Stepping the failing subtest by hand showed every mechanic
working with the 1.30 body: the grab succeeds (`climbing: true`, normal `[0,0,-1]`), the
yaw wait, the close-camera probe and the climb to `y > 5.25` all pass. It is the **ledge
top-out** that fails, and the state at failure is `[0, 1.177, -6]` — the spawn point,
i.e. checkpoint recovery after a fall. The gateway pier top is **1.1** wide against a
**0.91**-wide collider, so the usable landing window fell from **±0.200** to **±0.095**
off centre while the route's own approach lands **0.169** off centre: it overhangs by
0.074 and falls. This is geometry, and it is the predicted cost of a larger body in an
unchanged world. **The case was not loosened to go green**; the decision is open in NOTES
with three named options.

**Not verified.** Naturalness, reference parity and the user's acceptance of the size are
not established by any of this — only a playtest can settle them. Real touch hardware,
the live Firebase project, multi-device behaviour and print output remain outside this
environment. Two earlier probes of the pier approach were discarded as unfaithful before
the third reproduced the suite's own frame-accurate `walkTo`: the first polled every
150 ms, which at 5.2 u/s walks 0.78 units between samples and produced an overshoot that
was an artifact of the probe rather than a property of the build.

**Grounded-hold rerun:** **1/1** in `/tmp/track-world-scale-sprint-rerun.log`.
The diagnostic reproduced the missing precondition: before the hold the body was airborne,
vertical velocity **−6.5**, after stepping off a tread. After settling, holding locked the
run, release retained it, a short dash unlocked it, and exhaustion refused another burst.
Peak dash speed was **16.2**. The on-screen stamina bar remained **46 px** to the side
with anchor error below **0.001 px**. This fixes the test setup, not the dash controller.


## 2026-09-20 — local-production continuation and gateway landing clearance

**Scope and decisions.** The latest user instruction explicitly reselected the local
procedural rig and closed the intervening production research question. The user then
chose **A**, the local gateway geometry fix. This continuation preserves the existing
four independent gait sets, coordinated forefoot/heel/body push-off and 1.30 character
scale. Its runtime edit is limited to the two gateway piers and caps: **1.5 × 2.2** tops,
**2.1 × 2.8** caps, centred at z **18.55** so their original front faces stay fixed.
The accepted controller, speeds 5.2/12/16.2, cadence, jump/gravity and camera were unchanged.
The draft records the selections; README describes the resulting build; NOTES now points
to visual review. The comparison's stale whole-world scaling numbers were corrected.

**Load-bearing failure, before the final fix.** A fresh physical copy at
`/tmp/track-world-pier-before-20260920` contains the untouched pre-change runtime and
index, with **15 SHA-256 hashes** recorded and rechecked. Only the new test was copied in;
the final test is byte-identical in scratch and repository. In
`/tmp/track-world-pier-before.log`, `gateway top-out supports the enlarged body after an
off-centre approach and release` fails at **“climbing must reach a grounded pier top”**.
The approach is x **6.168567**, z **17.067405**; no supported top is reached, and the body
returns to the garden checkpoint **[0, 1.176667, -6]**. This is the load-bearing failure,
not a static assertion of a chosen pier dimension and not a doctored runtime.

**Diagnosis corrected during verification.** The first probe exceeded the protocol's
20-second evaluation wait; that harness timeout was discarded, and observation moved to
frame callbacks with an independently polled result. A **1.5-square** top reaches a
landing but falls after release. An early-release control on the original 1.1-square top
*passes*: `/tmp/track-world-pier-early-release-control.log`. Therefore the previous entry's
claim that the entire collider width must fit flat on the pier was not an adequate causal
explanation. The trace shows forward travel during the landing and subsequent braking
need room too (`/tmp/track-world-pier-1.5-depth-trace.log`). A centred depth extension also
blocked the old approach coordinate; the final geometry extends **rearward** instead.
No controller tuning or existing route assertions were loosened.

With the final geometry, the same new case passes in `/tmp/track-world-pier-after.log`
and again in the full suite. It lands at **[6.168567, 6.856667, 18.904386]**, then remains
**grounded**, out of climb/glide, at **[6.168567, 6.856667, 19.078998]** after one second
with forward input released. The original wall-grab/read/detach/top-out route also passes.

**Final verification.** Node **22.23.2**, Chrome **152.0.7977.75**, existing local Babylon
engine. All twelve README suites ran **sequentially**, with one graphics browser at a
time. `/tmp/track-world-local-suite-results.json` records exits/durations and
`/tmp/track-world-local-final-*.log` holds their output:

core **10/10**, sky-core **3/3**, map-core **4/4**, flight-core **9/9**, stamina-core **18/18**, character-motion **4/4**, character-animation **15/15**, browser **7/7**, camera **5/5**, sky **8/8**, map **5/5**, flight **14/14**. **102 passing tests**, zero failures.

The full route includes ordinary double-Space refusal, wall-first grab, held reading grip,
outward detach, gateway top-out, charge cancellation, both island landings, notebook
reading in flight, elevated-island clearance and checkpoint recovery. The existing dash,
hold/lock/unsprint, exhaustion and stamina-bar checks pass unchanged.

Rendered gait samples cover **walk/jog/run/dash** separately. Maximum visible forefoot
sole error is below **0.000012 world units**; minimum upward hip velocity at release is
**0.697 / 1.016 / 1.113 / 1.106 u/s**, with body rise greater than **0.097 u** in all four.
Notebook transfer/reversal's largest sampled step is **0.1027 u**; this is continuity
coverage, not an intersection/clearance guarantee. Offline cases cover the accepted
cadences, foot contact, transitions, 90°/180° turns, stopping/restarting and frame rates.

`node --check` passed for all six runtime scripts and six tests touched across this
increment, including the final scene and regression. `scene.js` loads as **?v=24**;
the retained body-scale cache queries are flight-core **7**, character-animation **7**,
character-rig **6**, sky-scene **3**, map-view **6**. No new dependency, download, install,
purchase, external service, Track runtime/data edit, commit or push was made.

**Visual inspection and limits.** A fresh local real-rig stage captured **24 side views**
(six phases per set), with **no browser errors**; metadata is
`/tmp/track-world-body-current-visual.json`, images `/tmp/track-world-body-current-*.png`.
Inspected walk phases 0/1, jog 3, run 1 and dash 3, plus the actual gateway-top screenshot
`/tmp/track-world-climb-ledge.png`. Heel folding, differing torso/arm poses and the supported
gateway landing are visible. Rigid knee/elbow/clothing seams remain visible too. The
original reference's decoded overview, run detail and jump sequence, plus the September 15
side-on load/push sequence, were re-inspected. These establish phase relationships, not
exact 3D joint angles or forces. Absolute clip-speed calibration remains unresolved.

Automated checks and these static captures **do not establish naturalness, reference
parity, notebook clearance in every pose or sustained laptop performance**. Climb/glide
and notebook handling are adaptations, not motions copied from the two original clips;
additional traversal footage is separately indexed, and the later vault/free-fall motion
builds are still outside this checkpoint. No evidence demonstrates that only a paid asset
or new tool can close the remaining visual gap; no paid decision is parked as a blocker.

**Final scope review:** `git diff --check -- World` passed. Against this continuation's
15-file runtime/index snapshot, only `scene.js` and its `index.html` cache query differ.
Concurrent Track-only working-tree edits appeared during verification; they were left
untouched and are not part of this World hand-back.


## 2026-09-20 — user verdict recorded; body-animation work stopped

Documentation only: recorded the user's visual verdict and stop instruction in draft §4,
removed the active review/fix queue from NOTES, and labelled the README checklist as
historical review context. No runtime or test changes. `git diff --check` passed for the
changed World documentation; game/browser suites were not rerun for this note.
