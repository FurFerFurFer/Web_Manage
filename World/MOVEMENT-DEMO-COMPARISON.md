# Movement reference and demo comparison

The visible character and full non-combat animation target is Genshin/Aether, reaffirmed
by the user after the hand-off. Current explicit controller contracts remain authoritative. The user explicitly accepted controller
fluidity on 2026-09-13 and rejected the humanoid's body animation. The subsequent local
body-animation rewrite is playable. On September 15 the user accepted its rhythm and
reported no movement errors, while rejecting its seated-looking limb/body posture.
The posture correction is playable; model acceptance and reference parity remain open. This table records the synthetic demo's actual
behavior. Reference speeds and launch trajectories have not been measured on a common
scale, so the demo makes no exact-copy or speed-parity claim. All numbers below come from
the local implementation, not measurements of either reference game.

**Animation rejected again (2026-09-13, 20:00):** the separate
`Screencast from 2026-09-13 20-00-22.webm` shows this demo, not Genshin. The user calls
its body animation “still very weird and unrealistic”. The hand-off explicitly forbids
lowering walk 5.2, run 12 or dash boost 1.35 as an animation fix. See the observations and
measurements below. The September 14 user selection closes that hand-off gate: the current rebuild uses
the existing local procedural rig. This rejection remains the baseline to compare against.

**Sprint reviewed (2026-09-13):** the September 12 tap toggle is superseded by the user's
explicit dash/hold-to-lock/short-dash-unsprint direction. The nominated review corrected
exhaustion failing to discard a pending hold and stale toggle instructions. Other tuning
was preserved. The reference's tutorial establishes press-to-evade and hold-to-sprint; it
does **not** establish a one-second persistent lock or the unsprint rule. Those are user
instructions, not facts inferred from the tutorial. Automated results are in the
[verification log](docs/VERIFICATION-LOG.md); they are not visual acceptance.

**Rebuild direction (2026-09-13):** stop micro-adjustments. The user reports robotic
walking, running that looks like fast walking, no jogging and no convincing running
momentum, and requires the Aether-based model plus other Genshin movement, explicitly
climbing and falling. The next pass must replace body and animation treatment together
across the existing non-combat states, including the notebook. This is within the demo's
scope. It is not implemented by the controller corrections above. The production approach was selected on September 14. Missing reference motion must
remain identified; the additional local climbing clip is now inspected below.

**User review prerequisite (2026-09-12):** the shape-based placeholder was insufficient
for judging movement fluidity. The user subsequently chose **A1**: a botanical traveler
with a local articulated rig and procedural animation using the existing engine. That
humanoid is now playable with jointed limbs, blended movement poses and carried/stowed
notebook sockets. The user then supplied `Screencast from 2026-09-13 08-42-45.webm`,
requested all its non-combat movement animation, and asked for slightly faster movement.
After the Ultra gate was raised, the user paused to switch and then directed continuation.
The successor uses the selected local rebuild of the A1 rig.
Current speeds are 5.2/12/16.2; the earlier 10% increase is superseded. These are local
controller values, not measured reference speeds.

| Movement | Demo behavior | Reference comparison still needed |
| --- | --- | --- |
| Start / stop | Camera-relative walk at **5.2** units/s and run at **12**; Shift dashes at **16.2** and either settles back to the walk or locks the run. The walk was raised from 3.85 on 2026-09-13 at the user's request; the run has been 12 in `flight-core.js` and the 6.6 this table previously carried was stale. Ground exponential rates remain start 18/s, stop 24/s, sharp turn 24/s. Fixed 60 Hz collision simulation | User's judgment of the speeds and body recovery; common-scale speed parity remains unmeasured, and the reference gives no world units to measure against |
| Turn / camera | Facing eases through the shortest angle at 20/s; avatar/camera position interpolates between collision steps. Upright orbit; bounded pitch; mouse drag, Q/E and R/F; Home resets only the camera | Preserve the accepted orbit and user-reported camera drag while integrating the humanoid; reference parity remains unmeasured |
| Jump / land | 6.2 upward impulse, gravity 18, short input buffer/coyote window, bounded step-up. Running jumps preserve velocity. Body poses gather the legs, open the arms asymmetrically and extend for landing; compression recovers into the current stride | Body timing and silhouette against the recorded jumps; no jump-arc change was requested |
| Launch | Hold X in a Windseed ring for up to 1.2 s, release for 22–34 upward impulse; taps below 12% are ignored | User's particular slingshot reference and preferred charge/launch feel |
| Glide | Space deploys only with four jump heights of clearance beneath the feet (about 4.3 m); launch apex uses the same gate. An open glider persists below it. WASD steers toward 8 units/s at an 8/s response rate; descent capped at 2.4; released movement brakes at 12/s. Canopy opening blends visually; landing folds it and smoothly changes horizontal speed | Reference steering, glide angle and canopy appearance |
| Climb / let go | Space checks climbing first: detach if attached, otherwise grab a nearby wall before considering jump/glide. W/S move vertically and A/D sideways toward 2.2 units/s at an 18/s response rate; reached ledges allow stepping up. Reading holds immediately. Detach pushes away along the wall normal at 3 units/s with a small 2.2 upward impulse | Irregular surfaces, corners and full reference traversal/animation fidelity |
| Reading in flight | Input goes to the companion; inertia, gravity and weather continue; charge is cancelled; active glide descends | Physical comfort and readability; no protective relocation when a panel opens |
| Falling / recovery | No damage or reward loss; return to the last landed island or garden start | Review checkpoint placement and feel; camera is not forcibly spun by a fall |
| Dash / run / unsprint | One press of Shift is a dash at 1.35x the run, held 0.35 s and then easing over 1 s toward a walk (tap) or the run (held 1 s, which LOCKS running). Releasing the key never stops a locked run; only a short dash does. The dash is an impulse on the body, and a press that cannot dash — airborne, over a tread — is still heard so the unsprint cannot silently fail | Reviewed without retuning. The tutorial supports press/hold actions, but cannot prove the persistent lock/unsprint rule, exact timing or world speeds. Judge feel on the laptop |
| Sprint duration | A stamina budget of `2 s + 0.67 s per KS03 streak day`, capped at 8 s — one third of the first pass at the user's direction — read once from the synthetic fixture's `linChanges` and never written. A dash spends up to 1 (a smaller positive balance still buys the full burst); the locked run drains 1/s when grounded with commanded horizontal velocity; climbing, gliding, standing and walking cost nothing. Emptying clears the run and pending hold, then refuses further dashes until stamina recovers past 25%, refilling at 1.4/s after a 0.6 s delay. A slim vertical bar beside the traveler shows it | Reviewed without retuning. Partial-payment dashes and commanded-velocity drain at collisions remain explicit policy concerns. Formula, recovery and threshold are tuning; no climbing/gliding/swimming stamina is authorized |
| Swim / vault | Not implemented | Full traversal proof and rules remain in the concept draft |

The rebuilt animation observes resolved controller travel and retained events. The four
motion sets have independent contact timing, recovery paths, arm curves and pelvis/torso
patterns, blended only at transitions. The timing target is deliberate visible motion,
not a cycle sped up until root travel divides into a small number. Actual stance contacts
and the foot's reach relative to the body are measured separately from body travel per
step: running covers distance during flight as well as during contact.

| Set | Observed speed used in the fixture | Full cycles/s | Planned support fraction per foot |
| --- | ---: | ---: | ---: |
| Walk | 5.2 | 1.70 | 0.26 |
| Jog | 8 | 1.88 | 0.18 |
| Run | 12 | 2.05 | 0.12 |
| Dash | 16.2 | 2.20 | 0.085 |

Those are local tuning values, not measured world-speed parity. The run's approximately
half-second cycle follows the visible recurrence in the reference; the other sets are
adaptations around it, not recovered source animations. Jog is crossed between controller
speeds. The short support windows keep the body from leaving a planted leg behind at the
fixed high travel speeds. **The base "walk" tier includes flight intervals**, which are
also visible in the user's additional walking reference below.

**Settled on 2026-09-19 (ruling 2).** Those flight intervals are **correct, not tolerated**.
Genshin's keyboard `W` produces a run — a true walk needs an analog stick or the walk
toggle — so `21-31-32.webm`, which the user labelled *walking*, is Genshin's default `W`
locomotion, and the demo's 5.2 tier is the same thing: the game's **base locomotion, a
jog-class gait**. The user has ruled that the game contains **no slow walk at all**, so a
textbook no-flight walk is not a requirement and must never be imposed. The `walk` key in
`character-animation.js` is a **historical name for the base tier**; do not rename the four
set keys, which would ripple through the sets table, both animation suites and four
documents for no user-visible gain.

Swing trajectories match the ground tangent near lift/strike, then recover near the hips;
using that tangent through the whole swing caused the excessive leg sweep. The longer
local thigh/shin lengths are 0.49 + 0.46 u. Stopping has staggered recovery steps, turns
release contacts that would overreach, and the torso/head retain turning momentum.
Jump/land, directional climb and full-size notebook transfer remain presentation only.
No animation changes the collider, accepted controller values or Track data.

**Posture correction (2026-09-15):** cadence and planned support windows stay unchanged.
The heel now folds behind the hips before the thigh passes forward; each set has its own
recovery curve. Higher pelvis carriage and slightly longer legs retain a soft supporting
knee without the previous seated silhouette. The earlier endpoint path advanced the
recovering foot too early, and low pelvis curves let both thighs point forward together.
The new tests measure that relationship, including actual rendered bones, independently
of accurate foot contacts. Measurements and failing-first results are in the World log.
These are local posture bounds, not reference joint tracks. The inspected ground views
show alternating trailing heels and forward body carriage, but camera perspective and
clothing hide enough of the skeleton that exact 3D limb/body angles cannot be recovered
from them. Matching every angle remains unproven and requires visual review.

### Supplied walking recording: foot-ground momentum

`Screencast from 2026-09-15 21-31-32.webm` is **Genshin**, explicitly labelled **walking**
by the user. It is 14.059 seconds at 361×372. The local VP8 video was decoded at 24
samples/s, with a full-duration overview and closer side-view inspection around 6–7.25 s.
It is not a recording of the demo. The final portion includes a playback pause overlay.

| Approximate time | Visible foot/body relationship |
| --- | --- |
| 6.00–6.083 s | The receiving leg takes weight; the body passes over the planted foot |
| 6.083–6.167 s | The support leg lengthens behind the body, the heel rises toward toe-off, and the body rises |
| Around 6.25 s | Airborne interval after that push, with the rear leg folding and the other leg coming through |
| Around 6.333 s, repeating through 7.25 s | The other foot receives the body and begins the next load/push sequence |

These views clarify phase relationships and show airborne intervals even in the movement
the user calls walking. Perspective, camera motion and clothing still prevent extraction
of exact ground forces, source joint rotations or calibrated distances. No combat,
climbing, gliding or notebook handling is inferred from this clip.

**Current foot-ground correction (September 15–17):** one load/push/airborne trajectory
coordinates the pelvis with stance. The forefoot stays planted as the heel rises; the
body is already rising at release and continues into a gravity arc. Swing-leg reach
cannot pull the body downward. The walking recovery also folds the heel higher behind
the body, as in this added view. The accepted cycle rates and controller are unchanged.
Actual rendered sole contact and release velocity are tested; naturalness and exact
reference parity remain unproven. The next user review is specifically walking/running
push-off, not a general traversal checklist.

### Supplied recording: observed non-combat movement

The Genshin reference, `Screencast from 2026-09-13 08-42-45.webm`, is 19.906704 seconds at 637×579. The whole clip was inspected through
timed overview frames, then the gait, sprint-entry, jump/landing and stop/restart portions
were sampled more densely at approximately 12 samples/s. Times below are approximate
recording positions, not extracted animation clips or measured 3D joint tracks.

| Recording time | Visible evidence | Translation into this local rig |
| --- | --- | --- |
| 3.5–5.2 s; 11.2–15.5 s | Jogging/forward locomotion, opposite arm/leg swing, folded recovery leg, directional changes | Distinct slower cadence, support/recovery phases, torso counter-rotation and head/arm response |
| 5.35–5.7 s | Brief forward body dip on sprint entry, then running posture | Presentation lean/compression on sprint acceleration; the separate user-directed dash impulse now exists in the controller |
| 7.15–7.8 s and 8.9–9.6 s | Running jumps: bent legs on ascent, arms opening at different angles, legs reaching down and compression before resuming strides | Retained takeoff, progressing airborne poses, impact response and stride re-entry |
| 10.48–11.1 s | Braced staggered stop, knees bent, torso settling and feet returning under the body | Braking weight shift and a finishing recovery step, without prolonging controller travel |
| About 16 s onward | Combat/weapon actions | Excluded as requested |

The initial held image is not evidence for idle timing. This recording does not show
climbing, detachment from a wall, gliding, swimming, vaulting or a carried notebook.
Their reference motion is missing; the existing climb/glide/notebook behavior is preserved
and adapted, not described as copied from unseen footage. It also cannot establish bone
rotations, skin weights, root distances or cloth simulation from this camera view alone.

The rig uses jointed geometry and local procedural curves, not smooth skinning or imported
authored clips. Contact targets are relative to the rendered ground plane; they do not
establish terrain-adaptive foot planting. Wall/canopy grip alignment,
clipping and human-like timing still need visual review. No common-scale reference
measurement or new hardware performance claim accompanies this pass.

### Rejected demo recording: observed defects

`Screencast from 2026-09-13 20-00-22.webm` is **8.582 seconds, 350×377**. The hand-off
review used the installed GStreamer decoder at 24 samples/s into `/tmp`, then viewed a
whole-clip overview and denser sequences at 0.125-second intervals. These observations
are from this demo; they must not be attributed to the Genshin reference.

| Approximate time | Visible defect/evidence |
| --- | --- |
| 0–0.625 s | Stationary side view establishes the current segmented body and carried notebook |
| 0.75–1.375 s | Movement starts with repeated wide, low lunges alternating with tightly folded knees |
| 1.5–4.25 s | Forward lean, long trailing-leg extension, abrupt-looking compression/recovery; notebook swings widely with the carrying arm |
| 4.375–5.875 s | Direction reversals; the raised foot swings across the body during facing changes, especially around 5.375–5.5 s |
| 6–8.58 s | Repeated extended/folded strides; bushes hide several portions and the ending, limiting foot-contact inspection |

There is no key overlay or velocity readout: individual Shift presses, exact per-frame
speed and walk/run state cannot be identified reliably from the recording alone.
It supplies no climbing, gliding or notebook-stow evidence.

**Measurements from the rejected pre-rebuild code:** 120 Hz samples, one second warm-up followed by
two seconds observed at each fixed speed; thigh 0.42 + shin 0.37 = **0.79 units**.
“Step travel” is `speed / (2 × full-cycle cadence)`, not an extracted foot measurement.

| Mode | Speed (u/s) | Cycles/s | Step travel (u) | Travel / leg | Largest hip change per 1/120 s |
| --- | ---: | ---: | ---: | ---: | ---: |
| Walk | 5.2 | 1.892 | 1.374 | 1.739 | 0.186 rad |
| Run | 12 | 2.350 | 2.553 | 3.232 | 0.298 rad |
| Dash | 16.2 | 2.350 | 3.447 | 4.363 | 0.386 rad |

These supersede earlier approximate leg/step figures. The exact maximum depends on the
sample window; this run measured 0.298 at sprint, rather than the hand-off's 0.254.
The support reach is also capped at 0.47, while cadence stops increasing. Consequently
additional speed must be represented almost entirely by longer travel between contacts.
That baseline fails the old hip-continuity test and omits dash from cadence coverage.
The rebuild now tests all four sets; increasing frequency was not accepted as the remedy.

### Clip index — every recording, its usable window, and what it is for

The nine recordings below are described across several sections of this file. This table is
the index; the sections carry the detail. **Times outside a usable window contain combat,
burned-in captions, cutscenes or an entirely different video** — never read a clip whole.

**Speed** column: `1x` confirmed real time; `SPED UP` means the source video was sped by an
unknown factor and **no timing is recoverable — pose only, permanently**; `1x or 0.25x`
means real time is recoverable once the factor is classified against `11-28-38` (see the
speed section above).

| File (`Screencast from …`) | Size | Speed | Use | Establishes |
| --- | ---: | --- | --- | --- |
| `2026-09-13 08-42-45.webm` | 637x579 | 1x or 0.25x — **classify first** | whole | Ground movement, sprint entry, jump/land, stop/restart. The 2.05 Hz run rate was reasoned from this clip |
| `2026-09-13 09-05-56.webm` | 637x579 | n/a | — | Demo recording, not reference |
| `2026-09-13 16-57-19.webm` | 637x579 | 1x or 0.25x | whole | More ground movement |
| `2026-09-13 17-52-28.webm` | 272x243 | 1x or 0.25x | superseded | Climbing, different character. Superseded by `11-13-41` |
| `2026-09-13 20-00-22.webm` | 350x377 | n/a | — | **Rejected demo** recording |
| `2026-09-15 21-31-32.webm` | 361x372 | 1x or 0.25x | whole | Base-tier locomotion side-on, support/push-off/airborne |
| `2026-09-19 09-46-46.webm` | 407x409 | 1x or 0.25x | whole | Aether side-on **run**, ending in a **stop** |
| `2026-09-19 09-50-07.webm` | 216x268 | 1x or 0.25x | superseded | Climbing from behind. Superseded by `11-13-41` |
| `2026-09-19 09-51-20.webm` | 448x353 | n/a | **NONE** | **REJECTED** — winged combat hover, not a glide |
| `2026-09-19 11-09-09.webm` | 392x315 | **SPED UP** | **10.5-13.2 s** | **Glide** side-on; glide-to-landing from behind. **Pose only** |
| `2026-09-19 11-13-41.webm` | 453x380 | **SPED UP** | **0-16.5 s** | **Climbing, two side-on VAULTS, rapid climb**, side-on run, idle, roof descent. **Pose only** |
| `2026-09-19 11-14-14.webm` | 453x380 | 1x or 0.25x | **0-15 s, 20.8-29 s** | 15 s **glide**; 8 s **FREE FALL** |
| `2026-09-19 11-28-38.webm` | 453x380 | **1x — CONFIRMED** | **0-19.4 s** | **THE TIMING BASELINE.** Side-on **stop**, **walk**, **idle**, running |
| `2026-09-19 11-36-25.webm` | 453x380 | 1x or 0.25x | **0.6-4.5 s** | **LIGHT LANDING** into a run |
| `2026-09-19 11-43-26.webm` | 463x385 | 1x or 0.25x | low value | Cliff-edge run (rear); rest is combat under captions |
| `2026-09-19 11-44-03.webm` | 463x385 | 1x or 0.25x | **~4.5-6.5 s** | **Ledge takeoff**; ends in water |

**Coverage.** Referenced and buildable: base locomotion, walk, idle, stop, turns, jump,
climbing, rapid climb, **climb-to-ledge vault**, gliding, **free fall**, ledge takeoff,
**light landing**. Deliberately absent: the **heavy landing and its momentum roll**,
descoped by the user on 2026-09-19. Never referenced and never to be invented: **player
gliding with the notebook**, and notebook handling in any motion.

### Clip speed: TWO are sped up and permanently pose-only. The rest are recoverable.

**Amended twice on 2026-09-19.** The first amendment said only one clip was
speed-accurate and treated every other as suspect. The user then gave the precise position,
which is considerably better:

> "`11-13-41` and `11-09-09` are sped up originally, the others are either normal or
> normal + 0.25 youtube speed."

Four rules follow, and the first two are load-bearing:

- **`11-13-41.webm` and `11-09-09.webm` are POSE-ONLY, permanently.** Their source videos
  were sped up by an **unknown** factor, so nothing recovers a real time from them. They
  remain excellent for silhouette — `11-13-41` still holds the only footage of the
  climb-to-ledge vault — but never read a duration, a cadence or a contact window from
  either, and never average them with anything.
- **Every OTHER clip is timing-usable once its factor is identified**, because the only two
  possibilities are **1x** and **0.25x** (recorded off YouTube's quarter-speed playback).
  A 0.25x clip is not damaged, merely **scaled by a known constant**: real time is recorded
  time ÷ 4. Identify the factor, divide, and the timing is sound.
- **The factor is EMPIRICALLY DETECTABLE, so do not guess it.**
  `Screencast from 2026-09-19 11-28-38.webm` is confirmed **1x** and contains running.
  Measure a gait cadence in any other clip and compare: it will land either at roughly the
  same rate (**1x**) or at roughly a **quarter** of it (**0.25x**). A factor of four is
  unmistakable and cannot be confused with ordinary variation between a walk and a run.
  Classify each clip that way, record the verdict in this file, and only then use its
  timings.
- **A measurement is INFORMATION, NOT AN OVERRIDE.** The user accepted the demo's rhythm
  outright on 2026-09-15, and that acceptance outranks any clip. If a measured Genshin
  cadence disagrees with 1.70/1.88/2.05/2.20 Hz, **report the difference and ask** — never
  retune the accepted rates on the strength of a measurement the user has not seen.

**One specific number is now worth resolving.** The 2.05 Hz run rate was reasoned from "the
run's approximately half-second cycle" seen in `08-42-45.webm`. That clip is **not** one of
the two sped-up ones, so it is 1x or 0.25x. If 1x, the original reasoning was roughly sound.
If 0.25x, the true cycle was about **two seconds**, and the rate was derived four times too
fast. Classify `08-42-45.webm` first; it is the highest-value single classification in the
library. (Prior expectation: a quarter-speed run reads as obvious slow motion and the
observer recorded half a second, so **1x is likely** — but likely is not measured.)

### Every OTHER reference clip is a YouTube capture, and its SPEED IS NOT RELIABLE

The user does not own Genshin. Every clip in this file is a **screen recording of a
YouTube video**, confirmed by the user on 2026-09-19, who added that the latest one is
**"not speed accurate"**. Treat that as true of all of them unless a specific clip is
proven otherwise. Two rules follow, and the first is load-bearing:

- **These clips establish POSE and SILHOUETTE only. Never derive a cadence, a cycle rate,
  a contact duration or any other timing from them.** A creator's speed-up, slow-down or
  re-encode is invisible in a frame and fatal to a measurement. Where this file records a
  timing "observed" in a clip — including the run's "approximately half-second cycle" that
  the 1.70/1.88/2.05/2.20 Hz rates were reasoned from — read it as a rough impression, not
  a measurement.
- **The accepted cadence stands on the user's eye, not on any clip.** The user accepted the
  rhythm outright on 2026-09-15 ("the rhythm is good and there's no movements error"), and
  that acceptance is the authority. Do not "correct" the cycle rates against a clip; a
  future session that re-derives them from footage would be overwriting a user acceptance
  with an unreliable source.

Their other standing limits: burned-in captions from commentary videos can cover the
character completely, combat sections are out of scope by the user's own direction, and a
transient player control overlay appears in roughly the first second of each capture.

### Reference clips supplied 2026-09-19 — three accepted in part, one REJECTED

Inspected by frame extraction (`gst-launch-1.0`, no ffmpeg on this machine).

| File | Size | Length | Content | Verdict |
| --- | ---: | ---: | --- | --- |
| `Screencast from 2026-09-19 09-46-46.webm` | 407x409 | 5.24 s | **Aether, side-on run** on open grass in daylight, ending in a **stop** at a teleport waypoint | **Accepted** |
| `Screencast from 2026-09-19 09-50-07.webm` | 216x268 | 12.15 s | **Climbing**, viewed from behind: Aether on a grey rock face, then a different character later in the clip | **Accepted** |
| `Screencast from 2026-09-19 09-51-20.webm` | 448x353 | 15.48 s | Aether **hovering with black wings** during a boss fight (HP bar, Lv. 6 arena) | **REJECTED — do not use** |

**Why the third is rejected.** The user offered it as a gliding reference. It is not one.
A winged hover holds the body **vertical** with the legs hanging and the wings spread
laterally, and it produces no forward travel. The wind glider is a different motion
entirely: the body leans **forward** into the direction of travel under a glider held
overhead. Building the demo's glide from this clip would produce a pose that matches
nothing in the game. It is also combat footage, which the user's own direction excludes.
Player gliding therefore remains **unreferenced**, exactly as it was.

**Character identity does not gate the climbing clip.** Genshin shares its climb cycle
across characters rather than authoring one per character, so the mid-clip character
change costs nothing for timing or limb cycle; only costume silhouette and body-type
proportions differ. This also softens the earlier note on `17-52-28.webm`, which was set
aside for showing "a different Genshin character" — that clip's real limit is its
**272x243** size, not who is in it. Verify the shared-animation assumption against these
two clips before leaning on it for fine detail.

**Framing, for future captures.** What matters is pixels **on the character**, not the
file's resolution: the accepted run clip is only 407x409 yet the body fills roughly 300 px
of it, which is more usable than a full-screen capture of a distant character. The
climbing clip is the weakest of the three because the body occupies well under half its
268 px height.

**Fourth clip, `Screencast from 2026-09-19 11-09-09.webm` (392x315, 15.71 s) — accepted
for ONE window only.** Frame-mapped at 3 and 6 samples/s. **Use 10.5 s to 13.2 s and
nothing else.** Inside that window, in order:

| Approximate time | Content | View |
| --- | --- | --- |
| 10.5 s | Airborne, arms out, legs bent — a jump, not a sustained fall | Three-quarter |
| 11.2 s | Lands and runs along a path | Behind |
| **11.8-12.5 s** | **Wind-glider GLIDE — body angled forward, legs trailing, glider spread, descending past trees** | **Side-on** | 
| 12.8 s | Still gliding, low over grass | Behind |
| 13.0-13.2 s | Glider closes, touchdown, straight into a run | Behind |

Everything **before 10.4 s** is unusable: combat with floating damage numbers, a
full-screen elemental effect wall, and burned-in commentary captions that cover the
character entirely. Everything **after 13.3 s** is a cutscene. That is 2.7 usable seconds
out of 15.7, and the side-on glide around 12.0 s is the single most valuable frame the
user has supplied for this motion.

This clip **closes the gliding gap** and gives a first glide-to-landing transition, though
only from behind. It does **not** close falling: the 10.5 s airborne moment is a short jump,
not a sustained glider-less fall.

### Fifth and sixth clips (2026-09-19) — the strongest reference material supplied

Both are **453x380**, the largest captures so far, and the character fills most of the
frame throughout. Frame-mapped at 6 samples/s. The speed caveat above applies to both:
**poses only, never timing.**

#### `Screencast from 2026-09-19 11-13-41.webm` (19.07 s) — many mechanics. Use **0 to 16.5 s**.

| Approximate time | Mechanic | View |
| --- | --- | --- |
| 0.0-2.4 s | **Climbing** a building wall | Side, and a rear spread-eagle at ~2.2 s |
| **2.5-2.7 s** | **TOP-OUT / VAULT** over the eave onto the roof — body rotating from vertical to horizontal, one leg swinging over the lip | Side |
| 3.0-4.5 s | **Running** on a rooftop and paved road, including a clean full-flight frame | **Side-on** |
| 5.2 s | Climbing, arm reaching overhead | Side |
| 6.8-7.2 s | Running along a wall edge and through bamboo | Side |
| 7.3 s | **Glider deployed** beside a wall | Side |
| 7.7-8.5 s | **Rapid climb / climb surge** up a stone wall | Side and rear |
| **8.8 s** | **TOP-OUT / VAULT**, second instance | Side |
| 9.8 s | **Idle**, standing on a ledge | Side/rear |
| 11.5-13.0 s | Climbing a dark wall | Rear |
| 14.2 s | **Descending a steep tiled roof** | Rear |
| 15.5-16.5 s | Running down a grassy slope | Rear |

**After 16.6 s a different YouTube video begins.** Discard it.

This clip **closes the vault gap**. `NOTES.md` has carried "full reference climbing and
vault animation still need their proofs" since the climbing work began; the two top-outs at
2.5 s and 8.8 s are the first footage of that transition the project has ever had, and both
are side-on. Its climbing is also far better than `09-50-07.webm` (216x268) and
`17-52-28.webm` (272x243), which it supersedes for every purpose except a second opinion.

#### `Screencast from 2026-09-19 11-14-14.webm` (33.06 s) — free fall. Use **0-15 s** and **20.8-29 s**.

| Approximate time | Mechanic | View |
| --- | --- | --- |
| 0-15 s | **Sustained GLIDE** over a pond, steady and uninterrupted, dark glider | Front, some three-quarter |
| 16.5 s | Standing at the water's edge, glider stowed | Rear |
| 18-19 s | **Water impact** — concentric splash rings, `Wet` status appears | Front |
| **20.8-29 s** | **SUSTAINED FREE FALL, NO GLIDER** — roughly eight seconds descending a cliff face | Side and rear |
| 29.3 s onward | A freeze/crystal effect, then a shrine offering dialog | Discard |

**The free-fall pose, read off frames at 20.8, 23.2, 25.7 and 26.5 s:** the body is
**upright and tilted slightly back**; the arms are out to the sides and **raised above
shoulder height** with soft elbows; the legs are **apart, trailing and slightly bent**; and
the coat, hair and sash stream **upward**, which is the drag signature that sells the
descent. One frame near 28.5 s shows an **inverted, diving** orientation, so a dive variant
may exist — treat that as unconfirmed.

**The pose is HELD, not cycled.** Across eight seconds the limbs drift rather than repeat a
loop. Free fall is therefore a **single pose plus sway**, not a gait, which makes it the
cheapest motion in this whole list to build on the existing procedural rig — no cadence, no
contacts, no support leg. Build it as a held pose; a cycling fall would be wrong.

**Falling is now CLOSED.** The fall terminates in **water**, not on ground, so it supplies
no ground-landing recovery.

#### `Screencast from 2026-09-19 11-28-38.webm` (453x380, 21.54 s) — the TIMING reference. Use **0 to 19.4 s**.

Offered by the user as a landing clip. **It contains no landing** — the whole sequence is on
a flat puzzle plaza with no height anywhere to fall from. Its value is entirely different
and larger: it is the **one speed-accurate clip in the project**.

| Approximate time | Content | View |
| --- | --- | --- |
| 0.0-13.0 s | **Running** across a glyph-puzzle plaza, with pauses standing on lit glyphs | Rear and three-quarter |
| 14.3-15.0 s | **Running, then DECELERATING** — front leg braced, torso leaning back against the stop | **Side-on** |
| 16.2-16.6 s | **Slow WALK** — unhurried, arms swinging at the sides | **Side-on** |
| 17.8 s | **IDLE**, standing at rest | **Side-on** |
| 19.5 s onward | Black | Discard |

Because it is speed-accurate, its side-on **stop**, **walk** and **idle** are the best
material the project has for those three, and its running passages are the only footage
from which a real cadence can be measured at all.

**It also shows that Genshin has a genuine slow walk**, distinct from `W` locomotion and
clearly visible side-on at 16.2 s. That is recorded as an observation only. Ruling 2 stands:
the user decided the game contains no slow walk, and this changes nothing unless the user
reopens it.

### Seventh, eighth and ninth clips (2026-09-19) — a LIGHT landing, and a ledge takeoff

Supplied as landing footage. One of the three delivers a ground landing; the other two
terminate in **water**, which yields no ground recovery. Frame-mapped at 15 samples/s,
which is fine enough to separate touchdown from recovery. Speed unconfirmed on all three,
so **poses only** — only `11-28-38.webm` may be timed.

#### `Screencast from 2026-09-19 11-36-25.webm` (453x380, 5.14 s) — **the light landing. Use 0.6-4.5 s.**

| Approximate time | Content |
| --- | --- |
| 0.6-2.6 s | Gliding low over a flower meadow beside water, descending |
| **2.73 s** | **Glider dismissed** — wings gone, arms out to the sides, body upright, feet reaching down for the grass |
| **2.87 s** | **TOUCHDOWN** — legs gathering under the body, a shallow crouch, no deep compression |
| 3.13-4.5 s | Straight into a **run**, three-quarter rear |

This is the **light / glide landing that continues into a run** — one of the three variants
ruling 4 asked for, and the first ground landing the project has. Touchdown to running is
roughly **0.4 s** with only a shallow crouch. Do not generalise that recovery to a fall from
height: a glide arrives with its vertical speed already bled off, which is exactly why the
compression is slight. The heavy landing is a different motion and is still unfootaged.

#### `Screencast from 2026-09-19 11-44-03.webm` (463x385, 11.89 s) — **a ledge takeoff. Use ~4.5-6.5 s.**

Running along a grassy cliff edge (rear view), then a **jump off the ledge** at about 5.3 s
with the arms opening and the body pitching forward into a short descent. **The descent ends
in a water splash** at 5.9-6.7 s, so it supplies a **takeoff** and nothing else. The rest is
standing in shallow water under `Wet` and `Vaporize` combat text.

#### `Screencast from 2026-09-19 11-43-26.webm` (463x385, 7.17 s) — **low value.**

Running along the same cliff edge with a companion NPC (rear view, ~0.9 s), a water entry at
about 1.9 s, then a `Vaporize` explosion whose effect and caption cover the character
completely. No landing. Keep only if a rear-view cliff-edge run is ever wanted.

**Still missing — one thing, and it is now precisely specified:** a **HEAVY landing from
real height onto SOLID GROUND**, with the deep crouch and recovery. Two of these three fell
into water because the footage was shot on a coastline. Ruling 4 stands for that one motion.

### Step length against leg length, as shipped (2026-09-19)

Measured from the shipped constants, not sampled: `character-animation.js` sets thigh
**0.49** + shin **0.46** = **0.95 u**, stature approximately **1.90 u**. Step travel is
`speed / (2 x full-cycle rate)`, the same definition as the pre-rebuild table below.

| Tier | Speed (u/s) | Cycles/s | Support fraction | Step (u) | **Step / leg** | Airborne share |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| base ("walk") | 5.2 | 1.70 | 0.26 | 1.53 | **1.61** | 48% |
| jog | 8.0 | 1.88 | 0.18 | 2.13 | **2.24** | 64% |
| run | 12.0 | 2.05 | 0.12 | 2.93 | **3.08** | 76% |
| dash | 16.2 | 2.20 | 0.085 | 3.68 | **3.88** | 83% |

Against the human bands the hand-off itself used — walking 0.8-1.2x leg, sprinting up to
about 2.3x — every tier is long, and the two fastest are past the sprint ceiling. This is
the measured cause of the user's "leg too much on the front" and "sit walking/running", and
it is **arithmetic rather than posture**: with speed pinned and a faster limb rate rejected,
`step = speed / (2 x rate)` leaves leg length as the only free term. Ruling 3 therefore
scales the character; see the `k` table in
[draft §4](TRACK-WORLD-CONCEPT-DRAFT.md#4-player-perspective-and-movement). The airborne
share is `(0.5 - support) / 0.5` and is a property of the gait design, independent of leg
length — scaling changes the stride, not the flight.

### Additional local videos inspected after the user's timing/reach correction

The September 14 follow-up asked to inspect all `.webm` files and named two defects:
legs travelling too far from the body, and rapid, unrealistic limb movement. Discovery
across the accessible home, mounted-media and temporary locations found five screencasts
and three unrelated browser-extension image-editing tutorials. The latter add no movement
evidence. All five screencasts were decoded locally; overview frames cover their full
durations, with 12 Hz detail sampling of movement passages. No source video was copied
into this repository. Sampling is visual evidence, not recovered joint tracks.

| File (September 13) | Duration / size | Observed content and use |
| --- | --- | --- |
| `08-42-45.webm` | 19.907 s, 637×579 | Genshin: observations above verified again. Around 5.83–6.83 s, matching heel/arm phases recur at roughly 0.5 s intervals; use deliberate run timing, not rapid cycling. Combat remains excluded |
| `09-05-56.webm` | 53.303 s, 637×579 | Earlier demo: ground movement, wall climbing/detach, launch/glide and sky panel. Useful for demo defects and existing notebook behavior; never a Genshin reference |
| `16-57-19.webm` | 19.432 s, 637×579 | Additional Genshin/Aether: upright locomotion about 1.5–4.4 s; entry dip about 4.6–5.2 s; running about 5.4–7.4 s; jump/landing about 7.8–9.4 s, then locomotion. Paused playback portions and the dragon cinematic from about 15 s do not establish player movement timing |
| `17-52-28.webm` | 11.205 s, 272×243 | Another Genshin character climbing a wall: a folded-knee reach, pull, body rise and brief hold, with alternating weight support and visible pauses. This supplies climbing rhythm evidence; it does not establish Aether-specific grip geometry, side/down movement or wall detachment |
| `20-00-22.webm` | 8.582 s, 350×377 | Rejected demo: long split-leg lunges and abrupt recovery/turning, as recorded above. The requested compact foot envelope directly addresses that visible defect |

The September 15 clip above now supplies the user's walking reference; common-scale
world-speed parity, player gliding and notebook handling remain unestablished. Descending/sideways climbing, detach and
notebook transfer remain local adaptations. Static pose sheets and automated timing bounds
cannot establish that the motion looks right at playback speed. The remaining visual
review is required; no skinned asset or paid tool has been demonstrated necessary to close it.

<a id="production-options-awaiting-direction"></a>
### Production options — historical research, local path selected

The user selected the **existing local procedural rig** on September 14. The structured
question is closed; there is no paid-option blocker or pending purchase for this increment.
The table below preserves September 13 research only. Prices/licences have not been
rechecked for this rebuild and must be verified before any later decision depends on them.
No purchase, download, installation or asset import has occurred.

| Candidate | Verified price/limits | Fit and unresolved work |
| --- | --- | --- |
| Quaternius Universal Base Characters + Universal Animation Library — historical candidate for an authored route | Standard editions free. Character Source $19.99; animation Pro $9.99 or Source $14.99 USD; both Source editions total $34.98. CC0. Character pack lists ~13k triangles/model and glTF; editable .blend source is paid. Standard/Source character archives list 122/600 MB; animation Standard/Source 15/46 MB | A compatible base and distinct locomotion clips, with editable sources available without a subscription. Botanical clothing, precise free-edition contents, notebook layering, reference fidelity and runtime draw/material cost need inspection. Listed triangle count is not a laptop benchmark. [Characters](https://quaternius.itch.io/universal-base-characters), [animation features](https://quaternius.com/packs/universalanimationlibrary.html), [animation prices](https://quaternius.itch.io/universal-animation-library/purchase) |
| Mixamo animation library with a chosen humanoid | Free with an Adobe ID; no Creative Cloud subscription. Humanoid bipeds only; automatic rigging has body/appendage constraints. Royalty-free game use. [Adobe FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) | Alternative clip source, not a botanical design or proof of Genshin timing. Specific clips/model still need selection; an account and any upload/download require approval |
| Synty POLYGON Fantasy Characters | Listed $29.99 USD one-time; 12 characters with variants, FBX sources, **no animations**. Store page also displays “Sold out”, so availability is unresolved. [Product page](https://syntystore.com/products/polygon-fantasy-characters-pack) | A named paid alternative, but its angular style is a weaker match for the requested model fluidity and it still needs clips and format conversion; not recommended for this blocker |
| Existing local procedural rig | No new asset/tool purchase or installation; current geometry and engine only | Selected for this rebuild. Jointed geometry and local choreography; smooth deformation and exact appearance are not guaranteed by animation changes |

An authored route still needs an approved import/tool workflow. Babylon's glTF/GLB loader
is an additional plugin, and Blender would be a new local tool (not present on PATH in
this review). Neither is authorized by choosing a model path. Blender itself is free/open
source; adaptation labor and target-hardware performance remain unmeasured.
[Babylon loader documentation](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/importers/loadingFileTypes.md),
[Blender license](https://www.blender.org/about/license/).

If visual review still finds unacceptable shape or joint deformation, record the specific
gap before proposing a different approach; the current selection does not authorize switching. If an asset
cannot meet the laptop budget or requires an unsuitable silhouette, reject that candidate
before committing further adaptation work.

The Space priority and four-jump-height threshold are the user's 2026-09-12 playtest correction.
Clearance is relative to the actual surface below the player; absolute island altitude is
not eligibility. A rejected press is discarded, so an ordinary jump cannot deploy later
without a fresh press. Detaching and gliding never happen on the same key press.

Automated route: ordinary double-Space jump → climb a gateway pillar and push off →
charge in the garden → glide north to Cloudrest → land while editing
notes → jump and glide east to Windward Isle → leave the land → fold the glider → recover
at Windward. These tests establish controller behavior and collision, not physical input
feel or sustained graphics performance. Use the same route for the laptop playtest.

The earlier stopping regression, at the old sprint speed, measured approximately 0.45 world units of coast after a released
sprint before tuning, and 0.19 afterward (0.6-second run, 0.4-second release observation).
This is a synthetic controller measurement, not a reference-game distance or laptop frame-rate result.

For the physical comparison, repeat: tap Shift while holding W, release it, make 90° and
180° turns, tap Shift again, then run/jump/land, climb the gateway and detach, and fly the
two-island route. Report abruptness, unwanted sliding, camera judder or missed input.
Keep the same route for the [§25.13 hardware procedure](PLAN.md#2513-verification-and-performance-gates):
record power mode, browser/driver, viewport/internal resolution, quality and fixture size;
cold/warm loads, three warmed clear/heavy-rain/night measurements with Today/notebook,
then a sustained 20-minute session. Targets remain 720p/30 fps and p95 at or below 40 ms.
On 2026-09-12 the user reported that the tap-Shift sprint and double-tap camera-drag
checklist worked well. Those input interactions are accepted; this does not close the
humanoid-dependent fluidity review or the sustained hardware procedure.
