# Track World — Concept Draft

**Status:** First synthetic Babylon.js demo implemented; see [README](README.md) for current behavior and [NOTES](NOTES.md) for remaining proof; unchosen concept decisions remain open\
**Concept date:** 2026-09-05\
**Plan review:** 2026-09-09; full information and unpaused panels confirmed; camera corrected to Genshin-style upright orbit and bounded tilt; Genshin-style Quest/Map positions, full-screen menus and pins/locators added; fantasy weather accepted if live integration is too complicated\
**Initial platform:** The user's current computer; phone and iPad versions deferred\
**Relationship to Track:** Proposed private game experience linked to the existing Track application

**Planning companion:** [PLAN.md — workflow, tool research, delivery gates, and remaining proposals](PLAN.md).

**Next work:** [Current baseline and revised sequence](#next-work-sequence) · [Picture placements and briefs](#picture-reference-package).

![Selected Living Botanical Clock Plaza concept](assets/images/living-botanical-clock-plaza.png)

> This image is a visual-development reference, not a final production asset or an exact
> screen specification. It establishes the preferred simplified anime rendering, the
> Verdant Astral Clock Plaza, and the Living Botanical interface identity.

## 1. Concept in one sentence

Track World is a private, synchronized, third-person fantasy world that turns the user's
real Track information into explorable places, journeys, landmarks, environmental signals,
and gentle daily rituals while remaining relaxing, convenient, and safe for the underlying
data.

## 2. Product intent

The game is intended to make Track feel alive. It is not meant to be a detached game that
occasionally grants points for productivity, and it is not meant to disguise the current
website behind arbitrary fantasy decoration.

The experience should let the user:

- See important schedules, day notes, deadlines, warnings, and SIR reviews conveniently.
- Experience major goals as journeys rather than rows in a list.
- Experience milestones as meaningful destinations and permanent landmarks.
- Move through a beautiful personal world for enjoyment and relaxation.
- Open and edit personal notes anywhere through a carried notebook.
- Return to completed journeys and see the history of prior progress.
- Explore the world on the user's current computer while keeping its information connected
  to Track. Phone and iPad gameplay can be reconsidered later.

The world should strengthen the relationship with real goals without making the user feel
punished for resting, falling behind, or having a difficult period.

## 3. Experience principles

### 3.1 Track made alive

Real Track information is the substance of the world. Goals shape geography, milestones
shape landmarks, schedule data shapes the Clock Plaza, and reminders create world signals.
The world must not invent progress or pretend that familiar user-authored information is a
mystery waiting to be discovered.

### 3.2 Relaxing before demanding

The game should be enjoyable to inhabit even when the user does not want to complete
anything. Overdue work may be visible, but it must not damage the world, drain resources,
create guilt-driven failure states, or remove past achievements.

**User clarification (2026-09-08):** the character is not in danger. Dramatic weather and
traversal are experiences, not threats requiring defensive play. Opening information does
not require a protective pause, evacuation, or survival mechanic.

**Camera correction and acceptance (2026-09-09):** the user rejected the multidirectional result and
asked to copy Genshin Impact's camera rotation. This supersedes the earlier XYZ request:
use horizontal orbit and bounded up/down tilt with an upright horizon, without roll or
flipping. Resetting the camera does not reset the character. The demo's numerical limits
are tuning values, not a claim of measured reference parity. The user accepted the
ordinary camera (“Nice camera”), then accepted all current playtests. The previously
reported touch-drag interruption received a positive user playtest follow-up on 2026-09-12,
after the separately approved desktop setting change described below.

### 3.3 Convenient before diegetically pure

Physical locations give information meaning, but essential information must also be
available through the notification control and the carried notebook. The user should never
have to cross the world or complete a platforming sequence merely to discover that a
deadline exists.

### 3.4 Deliberate writes, effortless reads

Reading information should be immediate. Any action that changes real Track data should be
explicit and difficult to trigger accidentally. Ordinary movement, collisions, proximity,
weather, and platforming must never modify Track data.

### 3.5 One coherent world system

The sky must not change above an otherwise static environment. Time and climate should
propagate through the whole world: illumination, clouds, water, plants, surfaces, particles,
distant scenery, clothing, and atmosphere should feel governed by the same conditions.

## 4. Player perspective and movement

- **Visual verdict and stop instruction (2026-09-20).** After the latest playable
  hand-back, the user said: **“2-5 is okay but not that good but 1 is as bad as always”**
  and **“just note it No plan of fixing”**. Playtest 1 is the foot-ground push-off and
  body-momentum relationship in walking/running; it remains rejected. Playtests 2–5
  cover gait transitions and stop/restart, 90°/180° turns, running jump/landing, and
  climb/top-out/detach with notebook handling; their quality is only “okay but not that
  good”. Passing automated checks does not overrule this verdict. **Record the result
  and stop: no further body-animation fix, investigation, replacement proposal or
  playtest is planned.** This supersedes the continuation/review queue below unless
  the user explicitly reopens the work.
- **Current increment — local production reaffirmed (2026-09-20).** The user's latest
  continuation explicitly selects **local procedural rebuild on the existing rig** and
  closes the production question. This supersedes the pending research direction in
  September 19 ruling 1 for this increment. Keep distinct walk/jog/run/dash sets, body
  momentum and adapted jump/fall/land/climb motion. No skinned model, authored clips,
  purchase, Blender or glTF loader. Preserve the current controller and fixed ground
  speeds; animation only observes it. Ship the local result and distinguish automated
  behavior evidence from the user's visual acceptance. The two original September 13
  clips establish no climb/glide/notebook motion; later footage is separately indexed.
  No claim that a paid tool is necessary has been demonstrated.
- **Gateway fit — Option A selected (2026-09-20).** Keep the body at 1.30× and the authored
  world/controller scale. Widen only the two gateway piers and their decorative caps so
  the existing climb-top route fits the body. The implementation uses **1.5 width × 2.2
  depth** with **2.1 × 2.8 caps**, extending rearward with the original front faces kept
  fixed: the initial 1.5-square trial did not leave enough forward landing/braking room. This is the selected local geometry fix, with no collider, input,
  speed or animation retuning.

- The world is explored from a third-person perspective.
- The initial controls use keyboard and mouse on the user's computer.
- **Movement decision (2026-09-07):** **Breath of the Wild** is the selected reference for
  the whole movement system, retaining the user's "exact copy" target.
- **Speed refinement (2026-09-09):** movement speed should be exactly like **Genshin
  Impact**, with sprint accumulating from the **KS03 streak**. This supersedes the earlier
  reference for speed; the other traversal requirements remain. The user clarified that
  longer streaks increase **sprint duration**, while walking/sprint speeds follow the
  Genshin reference. The streak-to-duration formula and recovery behavior remain open.
  Read the actual KS03 streak
  definition before implementing its synthetic projection; never create or consume Track
  streak records through movement. No numeric speed parity has been established yet.
- **Fluidity refinement (2026-09-12):** the user considers the current game good as a
  demo and explicitly requests movement fluidity like **Genshin Impact**. This extends
  the speed direction to movement feel: responsive starts/stops, turning and smooth
  transitions between running, jumping, landing, climbing and gliding. It remains a
  polish target, not a claim of implemented reference parity. Preserve the user's
  four-jump-height glide gate and Space's climb-first/outward-detachment behavior.
- **Sprint control (2026-09-12) — SUPERSEDED on 2026-09-13, kept for the record:** the user
  chose tap-to-toggle Shift, one press on and the next off. The dash/hold/lock entry below
  replaces it. Retained because it is what the demo did for a day and what the earlier
  playtest acceptance referred to; do not restore it without new direction.
- **Sprint control (2026-09-13) — dash, hold to lock, short dash to unsprint:** one press of
  Shift is a **dash**, slightly faster than the running speed, which then descends. What the
  press *meant* is decided by how long the key is held, with `x` = **1 s**:
  - **Tap** (released before `x`): the dash descends to **walking**.
  - **Hold `x` or longer:** the dash descends to the **running** speed and **LOCKS** running.
    Releasing Shift after that does **not** stop it — automatic unsprinting no longer exists.
  - **A short dash while locked is the only unsprint**, and a long one stays locked.

  The supplied Genshin recording's tutorial at about 5.2 s reads **"Press Left Shift / RMB
  to evade, hold to sprint"**. It establishes those two actions, not the persistent
  one-second lock or short-dash-only unsprint; those are the user's explicit rules above.
  It does not yield world-unit speeds or measured hold timings.

  The burst holds briefly and then eases toward the current target, so releasing the key
  mid-dash slides down continuously instead of stepping. A dash is an **impulse** on the
  body, not merely a raised target: without that, a dash from standing still never reached
  its own speed, because the controller's acceleration was chasing a target already decaying.
  Sprint is a **ground** move, so the BURST is grounded-only — but a press that cannot dash
  is still **heard** while running, because otherwise the short-dash unsprint silently fails
  on bumpy ground and the player is stuck in a run they asked to end. On 2026-09-13 the user
  called for a faster walk and a faster, longer dash: the walk rose 3.85 → **5.2**, the burst
  to **1.35x** the run, its hold to **0.35 s** and `x` to **1 s**. All of it is tuning for
  review, and the bar is a slim **vertical** capsule anchored beside the traveler.
- **Floating-island traversal (2026-09-07):** go upward using the existing "slingshot"
  idea referenced by the user, then glide to the floating islands. The synthetic demo
  implements a charged launcher and a two-island glide route; exact reference tuning
  remains unverified. See the [movement comparison](MOVEMENT-DEMO-COMPARISON.md).
- **Avatar decision (2026-09-07):** use a fixed character first; customization is not
  required. The later A1 choice below settles this increment's appearance and production.
- **Movement-review prerequisite (2026-09-12):** the user cannot judge fluidity from the
  current placeholder and needs at least a human-like body with human-like movements.
  A fixed humanoid and its movement animations must precede movement-feel acceptance.
- **Humanoid increment — user-selected A1:** a stylized adult botanical traveler with
  short hair, moss-green tunic/trousers, boots, a simple face and the notebook. Use an
  articulated rig and procedural animation built locally with the already-vendored
  Babylon engine. This authorizes that approach for this increment, without installations,
  downloads, purchased assets or a new package. Detailed identity/customization, smooth
  skin deformation and authored animation clips are not settled by this choice.
  The demo now has jointed limbs and blended idle, walk/sprint, turning, jump/landing,
  climb/detach, charge and glide poses. The notebook transfers between the right hand
  and a visible belt socket for climbing/gliding. These are presentation transforms,
  with no animation root motion or changes to the accepted controller contracts.
  Physical fluidity acceptance and reference fidelity still require the user's review.
- **Body-animation correction (2026-09-13):** the user clarified that controller movement
  is fluid and good, while the first humanoid's model animation is unacceptable. Use the
  supplied `Screencast from 2026-09-13 08-42-45.webm` as the reference for its visible
  non-combat locomotion, sprint entry, jumping/landing and stopping/restarting. The user
  paused to switch after the Ultra gate was raised, then directed continuation of the
  detailed rewrite. A1 remains the local procedural approach; no new asset/tool source,
  skinning workflow or external animation acquisition was selected. The user additionally
  requested faster movement. The earlier 3.85/6.6 description is superseded: current
  ground speeds are **5.2 walking, 12 running and 16.2 dashing**, with the separately
  user-directed dash/hold/lock rules above. The new contact/recovery gait, layered torso
  motion, progressing jump poses and full-size notebook transfer are implemented;
  visual acceptance and exact reference fidelity are not established. The clip supplies
  no climbing, gliding or notebook-handling motion. See the timed observations in the
  [movement comparison](MOVEMENT-DEMO-COMPARISON.md#supplied-recording-observed-non-combat-movement).
- **Hand-off correction (2026-09-13):** `20-00-22.webm` is the **rejected demo recording**,
  while `08-42-45.webm` is the Genshin reference. The user rejects the rewritten body as
  “still very weird and unrealistic”. At that hand-off cadence saturated while step travel
  grew with speed, and the run hip-continuity test failed. **Do not lower walk/run speed or dash
  boost to fix the animation.** The user reopened the production decision: a procedural
  rebuild of the existing local rig, or a skinned model with authored clips after named
  candidates/costs are reviewed. Neither option was selected in the hand-off; ask before
  starting gait tuning. Read-only review and independent controller corrections remain
  authorized. Appearance details from the Aether direction below and missing traversal
  reference motion must not be invented. This pending gate was closed by the September 14
  selection below. Candidate research is in the
  [movement comparison](MOVEMENT-DEMO-COMPARISON.md#production-options-awaiting-direction).
- **Model and animation direction (2026-09-13, reaffirmed after hand-off):** stop small
  adjustments to the rejected model. The user identifies robotic walking, running that
  looks like fast walking, absent jogging and absent convincing running momentum. The
  required visible character/motion target is **Genshin/Aether**, including climbing and
  falling, not just ground gait. Replace the body and animation treatment together:
  distinct walk/jog/run/sprint, starts/stops/turns, jump/fall/land, climb/detach and the
  other existing movement states with carried/stowed notebook behavior. This belongs
  within the demo; do not defer it as too much for a demo or call controller fixes a
  model fix. The current speed, dash/stamina, Space, camera and glide contracts remain
  authoritative; this direction does not request new movement rules. Obtain inspectable
  reference evidence for motions absent from the supplied Genshin clip before claiming
  to replicate them. The production-path question was closed on September 14 below.
- **Production selection (2026-09-14) — SUPERSEDED on 2026-09-19, kept for the record:
  local procedural rebuild on the existing rig.**
  The user explicitly selected this path and closed the pending structured question.
  Rebuild walk, jog, run and dash as distinct motion sets, together with body momentum,
  jump/fall/land and climb/detach; stop micro-adjusting the rejected common gait.
  Ground speeds remain **5.2 / 12 / 16.2** and animation only observes the accepted
  controller. No skinned model, authored clips, asset purchase, Blender or glTF loader.
  Downloads, installs, dependencies, external services and any different production path
  still require a separate answer. Ship the best local result for visual review; an
  evidenced remaining quality gap may become a later decision, never a blocker on this
  increment. Missing reference motion stays explicitly unreferenced.
- **Timing/reach correction during the rebuild (2026-09-14):** the user asked to inspect
  all local `.webm` videos, stressing that the model's legs reach too far from the body
  and its limbs move too rapidly compared with Genshin: “that's what i mean by copy
  everything”. Treat the actual motion timing and compact recovery as targets, rather
  than speeding up a gait to match root travel mathematically. The added `16-57-19`
  ground reference and `17-52-28` climbing clip were then inspected; the latter shows a
  different Genshin character. Neither supplies notebook handling or player gliding.
  The accepted controller remains authoritative. Current implementation and evidence
  belong in README and the World verification log; visual parity remains the user's review.
- **Posture review (2026-09-15):** the user accepts the rhythm and reports no movement
  errors, but rejects the model's limb/body angles: “the model still have leg too much
  on the front it looked like the character's sit walking/running”. Preserve the accepted
  timing and controller while correcting the actual silhouette: pelvis carriage, thigh
  direction, knee folding and foot recovery. The request to mimic every specific angle
  remains the visual target; the camera views do not establish exact 3D joint rotations.
  This continues the selected local procedural approach, without reopening its gate.
- **Foot-ground momentum first (2026-09-15, continued September 17):** the user rejects
  broader playtest requests while the model's steps still fail to convey pushing the
  body off the ground. Fix walking and running foot contact, weight acceptance and
  push-off as the immediate priority. The user explicitly labels
  `Screencast from 2026-09-15 21-31-32.webm` **walking**; it is an additional Genshin
  reference, not a demo recording. Use its side views to coordinate the planted
  forefoot, rising heel, extending support leg and resulting body rise. Preserve the
  accepted rhythm and controller. Ask the user to judge this relationship first;
  unrelated traversal/notebook checks remain internal regressions or later reviews.
- **Four rulings (2026-09-19).** The user answered four standing questions in one pass.
  These supersede the September 14 production selection above. Nothing here changes the
  accepted controller, the ground speeds or the cycle rates.

  1. **Production path REOPENED — research a skinned model, READ-ONLY.** The September 14
     "decision already made, do not re-open the gate" instruction reached this project
     through a hand-off prompt, not from the user, and it closed the recommendation made on
     September 13 without the user ever ruling on it. The user has now ruled: research
     skinned/rigged character and authored-animation sources **read-only**, and present
     named candidates with licence, real cost and laptop impact, with a recommendation.
     **Download, install and buy nothing** — every gate in [AGENTS.md](AGENTS.md) "Stop for
     direction" stands, and this ruling authorizes research and a recommendation only.
     The gate reopened for a structural reason rather than taste: the body is an assembly
     of rigid primitives with no skin deformation, so a limb is two solid capsules hinged
     at a point and reads as mechanical **at every joint angle**. Four rounds of angle work
     have not changed that and cannot. The existing procedural rig stays in place and
     playable until a path is chosen.

  2. **"Walk" is the game's BASE locomotion tier, and it is a jog-class gait — not a walk.**
     On keyboard, Genshin's `W` produces a run; a true walk needs an analog stick or the
     walk toggle. `Screencast from 2026-09-15 21-31-32.webm`, which the user labelled
     *walking*, is therefore Genshin's default `W` locomotion, and the airborne intervals
     in it are correct and expected — as are the demo's. **The user does not want a slow
     walk in the game at all.** Two consequences: the 5.2 set's flight intervals are
     settled as correct rather than merely tolerated, and the `walk` key in
     `character-animation.js` is a **historical name for the base tier**. Do not rename the
     four set keys; a rename ripples through the sets table, both animation suites and four
     documents for no user-visible gain. Describe the tier accurately in prose instead.

  3. **Step length is corrected by making the character BIGGER, never by changing speed or
     cadence.** Step length is `speed / (2 x cycle rate)`, so with the speeds pinned at
     5.2/12/16.2 and a faster limb rate rejected by the user on September 14, leg length is
     the only free term left. Measured against the shipped rig (thigh 0.49 + shin 0.46 =
     **0.95 u**, stature approximately **1.90 u**), the four tiers take steps of
     **1.61 / 2.24 / 3.08 / 3.88 x leg**, against a human walking band of 0.8-1.2x and a
     sprint ceiling near 2.3x. That is the measured cause of "leg too much on the front"
     and "sit walking/running"; it is arithmetic, not posture. A uniform character scale
     `k` divides every ratio by `k`:

     | k | leg (u) | stature (u) | base | jog | run | dash |
     | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
     | 1.00 | 0.95 | 1.90 | 1.61 | 2.24 | 3.08 | 3.88 |
     | **1.30** | **1.24** | **2.47** | **1.24** | **1.72** | **2.37** | **2.98** |
     | 1.40 | 1.33 | 2.66 | 1.15 | 1.60 | 2.20 | 2.77 |
     | 1.70 | 1.62 | 3.23 | 0.95 | 1.32 | 1.81 | 2.28 |

     **NO SINGLE k SATISFIES EVERY TIER, and that is a finding rather than a tuning
     problem.** Ruling 2 settles that the base tier is a **jog-class** gait, so its stride
     must stay in the jog band (roughly 1.2-1.6x leg) rather than drop into the walking
     band — which caps **k at 1.34**. Bringing the dash under the human sprint ceiling of
     2.3x needs **k of at least 1.69**. Those two ranges do not overlap. The cause is that
     the pinned speed spread, 5.2 to 16.2, is **3.1x**, while a human gait can only express
     about 1.9x between a jog and a sprint. A uniform scale slides that window; it cannot
     narrow it.

     **Resolve it in favour of the base tier.** Ruling 2 is a user decision and outranks a
     biomechanical band, and a **dash is a burst** — the game is already stylized where the
     user chose it to be. So target **k = 1.30**, which puts the base at 1.24x (jog band),
     the jog at 1.72x and the run at 2.37x, and leaves the **dash at 2.98x as a deliberate,
     stated exceedance** — not a defect, and not something to report as a gap. Derive the
     final value against the reference clips and **report the resulting table** rather than
     asserting a fit. ~~**The scene rescales with the character**~~ — **SUPERSEDED on 2026-09-20,
     see Option A below.** Rescaling the scene, the camera and the controller together
     with the body is a similarity transform: it renders identically and its only
     perceptible effect is that fixed speeds cover 30% less of an enlarged world.

     **This ruling collides with the frozen controller values, and that collision is the
     user's to settle.** Jump impulse 6.2, gravity 18, the bounded step-up and the camera
     distance are world-unit quantities. Left alone while the body grows by k, the jump
     becomes k times shorter *relative to the body* and the camera sits k times closer to it, so
     the accepted feel changes even though no controller number was edited. Scaling them
     together preserves the feel but edits the frozen list. Present both with a
     recommendation and **stop**; do not resolve it quietly in either direction.

     **Option A, as the user settled it on 2026-09-20 after seeing it built.** The
     first build of this ruling scaled the body, the scene, the camera, the jump and
     gravity all by k. The user's verdict on that build was that it had changed nothing
     visible except a speed decrease, and that verdict is arithmetically right: a uniform
     similarity transform of scene plus camera is invisible by construction, and the only
     term left unscaled was speed, so the sole perceptible effect was 30% longer crossings.

     **The body scales; nothing else does.** `characterScale = 1.30` lives in
     `flight-core.js` and reaches the rig, the animation's model→world conversion, the
     collider, the feet offset, limb reach and eye height — and stops there. The scene,
     the camera (8.8), jump (6.2), gravity (18) and the bounded step-up (.24) keep their
     authored values. Step length is `speed / (2 * cycle rate)`, so with the speeds pinned
     and the cadence accepted on 2026-09-15, the longer leg is what cuts step/leg to
     **1.238 / 1.723 / 2.370 / 2.981**. Those ratios depend on leg length, speed and cadence,
     not scene extent. Keeping the world and camera at their authored size preserves
     route travel times and makes the larger body visible.

     **This also dissolved the pending traversal question.** Launch, glide, climbing and
     detach speeds needed no rescale once the islands stayed at their authored distance:
     Cloudrest is reachable again with the unchanged 22+12 impulse, and no frozen
     controller value was edited in either direction.

     **Gateway clearance failure, before the local widening selected above.** The
     existing climb-top route fell from the narrow pier with the enlarged body. The
     initial explanation treated the full collider width as a required flat footprint;
     September 20's early-release control disproved that explanation. Forward landing
     and braking room also matters. The selected local widening supplies that room;
     it does not change the controller or establish animation fidelity.

  4. **Climbing, falling and gliding stay UNBUILT until the user supplies footage.** The
     user has undertaken to record Aether climbing, falling, landing and gliding in Genshin
     into `~/Videos/Screencasts`. Until those clips exist, do not invent, tune or "adapt"
     those motions and do not present them for review: the only climbing clip,
     `17-52-28.webm`, shows a different character, and there is no gliding or notebook
     footage at all. The existing climb/detach and glide poses stay exactly as they are and
     remain labelled unreferenced.

- **Ruling 4 CLOSED, and the momentum roll descoped (2026-09-19, later the same day).**
  Reference gathering is **finished**. The user supplied nine clips in one session and then
  ruled on the one motion still outstanding:

  > "It's depended on momentum if less then it'll land normally but if more then it'll roll
  > but I don't think that's important to do. We can focus on the core movements only."

  Three things follow:

  1. **The heavy landing and its roll are OUT OF SCOPE for this demo.** Do not build a roll,
     do not gather more footage for one, and do not report its absence as a gap. The
     **light landing** in `11-36-25.webm` — glider dismissed, shallow crouch, running again
     in about 0.4 s — is the landing this demo implements.
  2. **The mechanic itself is recorded so it is not lost.** Genshin gates the recovery on
     **arrival momentum**: below a threshold the character lands and continues; above it,
     the landing becomes a roll. If the demo ever wants a heavy landing, that is the shape
     it takes — a **threshold on arrival speed selecting a second recovery**, not a
     different landing pose scaled by height. It needs its own footage and its own
     direction before anyone builds it.
  3. **Ruling 4 no longer blocks anything.** Climbing, the climb-to-ledge vault, the rapid
     climb, gliding, free fall, the ledge takeoff and the light landing are all now
     referenced and may be built. The prohibition on **inventing** unreferenced motion
     stands and always will — it simply has nothing left to block in this set.

  **"Core movements" for this demo therefore means:** the four locomotion tiers and their
  transitions, starts, stops and turns, idle, jump, free fall, glide, the light landing,
  climbing, the rapid climb, and the climb-to-ledge vault. The notebook carry and stow ride
  along with all of them. Anything outside that list needs new direction.

- **Character design (2026-09-13, reaffirmed after hand-off):** copy the character
  design of **Aether**, "twist him to fit the theme", and **replace the sword with the
  notebook**. This further specifies the A1 traveler's identity, which the A1 entry above
  explicitly left open, and it is consistent with the notebook already being the carried
  object. It authorizes no art-production approach, external asset, download, package or
  install; those gates in [AGENTS.md](AGENTS.md) "Stop for direction" are untouched. The
  user supplied a reference link with it; see reference R5 below.
- **Sprint stamina (2026-09-13) — implemented and reviewed:** at the
  user's request the demo now has a sprint stamina system, with the budget set by the
  **KS03 streak** per the 2026-09-09 direction and spent by **sprinting only** — climbing and
  gliding are unaffected by the user's explicit choice. A dash costs a fixed chunk at the
  press and the **locked run** drains while moving; walking recovers after a short pause. An
  emptied budget **unlocks** the run and refuses further dashes until stamina passes a resume
  threshold. On 2026-09-13 the user set the durations to **one third** of the first pass:
  `2 s + 0.67 s per streak day`, capped at `8 s`. The user directed that **"astra"** must
  check it. That review corrected a pending hold surviving exhaustion at a short budget
  and stale control instructions, preserving every tuning value. Exhaustion now clears
  both a run lock and an unfinished hold; recovery needs a fresh press. The existing full
  dash for a fractional positive balance and commanded-velocity drain at collisions were
  flagged and preserved for direction. Formula/recovery tuning and physical acceptance
  remain open; completing a code review does not settle them.
- **Touchpad requirement (2026-09-06):** tap-and-drag camera control must work while
  moving. The user likes double-tap dragging to rotate, but reports that rotation suddenly
  stops during movement. A reproducible browser capture-loss path has been corrected.
  The laptop's desktop setting had also disabled touchpad input while typing. On
  2026-09-09 the user explicitly approved turning it off; GNOME's `disable-while-typing`
  was set to `false` and verified by readback. On 2026-09-12 the user reported that the
  tap-Shift sprint and double-tap camera-drag-while-moving checklist worked well; this is
  user-reported input acceptance, separate from animation-based fluidity and hardware performance.
- The Memory Grove has a dedicated sky-view camera for seeing the KS03 multiverse as
  stars. Grounded stargazing keeps the character safely still while the user pans and
  zooms overhead; closing restores the ordinary camera (Section 5.7).
- Movement should feel flexible, fluid, and satisfying in its own right.
- Platforming is a core pleasure and should blend naturally into the landscape.
- Routes should not be labeled or visibly segregated into an artificial easy path and hard
  path.
- Alternate paths should also feel like natural parts of the geography rather than detached
  challenge courses.
- Important information must remain accessible even when the surrounding terrain contains
  demanding movement.
- The notebook is normally visible in the character's right hand.
- The notebook stows automatically during climbing, vaulting, swimming, or any movement
  that naturally needs both hands, then returns without requiring inventory management.

**Movement clarification still needed:** Genshin speed/fluidity and streak-based sprint duration
are confirmed. The duration formula and recovery, exhaustion outside sprinting,
and weather-dependent traversal restrictions remain open. Do not infer those
mechanics from the reference name or remove them without a decision. Before implementation,
turn the target into a comparison sheet covering starts/stops, turning, camera response,
jumping/landing, climbing, swimming, launch and glide. Record observable differences and
have the user judge the feel on the same route; a passing walk/jump test cannot establish
reference fidelity. The separately requested slingshot needs its own launch behavior and
controls defined, rather than assuming the reference name specifies it.

**Playtest correction (2026-09-12):** glide opening requires at least **four normal jump
heights** above the actual ground beneath the character, so pressing Space during an
ordinary jump does not open it. The rule applies on elevated islands as well; an already
open glider stays open during landing approach. **Space also climbs and unclimbs.** Check
wall interaction first: detach if already climbing, otherwise grab a nearby climbable
wall before considering jump or glide. Unclimbing gives a slight launch opposite the wall
normal. A single press must never both detach and deploy the glider. The demo implements
this priority, a shared approximately 4.3 m opening threshold, basic wall movement and
an outward release; detailed irregular-terrain and animation fidelity remain to be proved.

<a id="ref-avatar-notebook"></a>

> **Planned reference R5 — Avatar and notebook poses.** Place the provisional front/side/back
> and carry/stow/movement sheet here. A1 selects the botanical traveler and local procedural
> rig for this increment; a production reference sheet and detailed identity remain open.
> See the [reference package](#picture-reference-package).
>
> **User-supplied reference (2026-09-13), link only:**
> `https://pbs.twimg.com/media/FMlEsjEXIAI_HYm.jpg`. It was **not retrieved or inspected**
> by the session that recorded it, so nothing here describes or captions its contents, and
> it was deliberately **not downloaded** into `assets/images/` — that is a network fetch and
> an asset decision, both gated. It arrived with the Aether character-design direction in §4
> above. Open it, or ask the user what it shows, before treating it as evidence for anything.

Combat and survival systems are not part of the current concept. They were considered
potential overload. The concept should retain enough flexibility to revisit them later, but
they must not be assumed, designed around, or allowed to dominate the relaxing purpose.

## 5. World structure

**Confirmed slot mapping:** each Track workspace slot has a separate world, with its own
garden home, sanctuaries, Clockgarden, goal regions, and history. The user explicitly switches
worlds; slots do not become territories inside one shared world. The detailed switching interface
and draft-handling flow remain to be designed.

### 5.1 Garden home and sanctuaries

**User decision (2026-09-07):** the user's home is a garden, separate from the sanctuaries.
The home should feel private and restorative. Its detailed layout and the identities of
the separate sanctuaries remain open.

The garden home may provide convenient access to important information and world travel, but
its identity should remain personal rather than becoming a calendar lobby.

### 5.2 Schedule location

The schedule has its own physical and thematic location. The current preferred direction is
the **Verdant Astral Clockgarden**, centered on a walkable **Clock Plaza**.

The Clockgarden must be clearly separate from the garden home and sanctuaries, with
convenient travel between them. It represents time, recurrence, planning, and the movement
of the day rather than rest or personal identity.

### 5.3 Goal regions

- Each major goal becomes a separately themed region or major area.
- Nested goals become branching paths inside that region.
- Milestones become destinations, structures, crossings, overlooks, or other memorable
  landmarks along the journey.
- Goal-related schedule information can appear as a smaller regional echo while retaining
  an authoritative representation in the schedule system.
- Goal regions may use distinct art direction, terrain, traversal character, and interface
  materials.
- Updated information may grow, redirect, or transform paths, but familiar landmarks should
  not move unpredictably.

### 5.4 Completed regions

Completed goal regions remain explorable. Completion transforms them rather than deleting
or closing them. They become part of the world's history and allow the user to revisit prior
journeys.

The treatment of archived goals and deliberately deleted goals is still undecided. They
must not be treated as automatically equivalent to completed goals.

### 5.5 Natural geography and long-term scale

**Confirmed direction:** places connect through natural paths in the landscape. Those
routes may cross mountains, plains, or waters, according to the character of each region.
The journey between places is part of the world experience.

**User decision (2026-09-07):** include floating islands, reached through a slingshot-style
upward launch followed by gliding. The synthetic demo uses Cloudrest and the lower
Windward Isle beyond the garden's northern edge, each with a landable surface and launcher.
This is provisional demo geography, not a decision about the final world's layout.

This choice establishes the feel of the geography, without fixing the overall landmass
shape, world size, or technical loading boundaries. A compact gateway hub is no longer the
assumed world layout. Persistent completed regions must still fit into the growing world
without making daily navigation exhausting or the landscape overcrowded.

### 5.6 Regional and landmark gateways

**Confirmed travel direction:** fast travel is accessed through gateways at regions or
landmarks. Natural traversal remains available between connected places, with these
physical destinations providing travel shortcuts. The notebook and Today view remain
accessible everywhere, independently of travel.

Gateway appearance, destination selection, whether a first visit is required, and any
separate emergency-return behavior remain open. This decision does not grant travel from
anywhere through the notebook or map.

<a id="ref-landscape-routes"></a>

> **Planned reference R3 — Connected landscape and routes.** Place the top-down blockout and
> matching third-person viewpoints here. Mark unchosen layout/loading/gateway assumptions as
> proposals. See the [reference package](#picture-reference-package).

### 5.7 Memory Grove and the KS03 sky

**Confirmed direction (2026-09-06):** SIR's physical home uses a **Memory Grove** theme.
Inside that specific location, a dedicated look camera reveals the entire current slot's
**KS03 multiverse as stars in the sky**. The grove and the celestial view form one place;
this does not add a separate observatory location.

**Demo feedback (2026-09-06):** the required "MM in sky" feature is missing from the
demo. Ground-level stars and a separate mind-map panel do not fulfill this requirement.

- The grove gives spaced reviews a botanical setting, with due information also available
  through Today and the notebook from anywhere.
- The special sky represents the full KS03 multiverse belonging to this slot's world,
  including mind maps without a review due. It does not combine other slots' knowledge.
- Stars represent the existing mind maps and preserve their identity and relationships.
  They are representations of knowledge, not earned collectibles or one star per review.
- Looking, moving the displayed sky, and inspecting a star must not rearrange KS03, change its
  saved positions, or complete a review. Full MM editing is available through deliberate
  actions in the selected star's detail view, under Section 10's interaction contract.
- Overdue reviews never make the grove wither or destroy stars. The sky's knowledge
  structure and a review's current due state are distinct meanings.

**Confirmed camera, clarified 2026-09-09:** grounded stargazing with a fixed animation
pointing the view upward, followed by stars appearing directly in the world's sky. The
character cannot move during this experience. The user can inspect, pan and zoom the
overhead multiverse; closing restores the normal third-person camera. The current demo
uses a 1.6-second upward transition and a 1.1-second return, with movement locked through
both, early Esc reversal and a reduced-motion skip. These durations are implementation
tuning, not prescribed reference timings. G still requires grounded entry inside the
Grove; the MM panel also offers an explicitly named travel shortcut.

**Confirmed stargazing motion, clarified 2026-09-20:** after entry the viewpoint stays
fixed in the Grove. Dragging or sliding rotates the displayed constellation around a
spherical sky, with a slight curve suggesting travel around the world. This supersedes
the demo's flat plane and translating sky camera. The user chose **A / A / A**:
**40°** across the fitted network's longer dimension, **1× pointer-following drag near
the screen centre**, and **20°/second** for held arrow keys. The user reported that this
motion worked in the September 21 laptop playtest; presentation and density feedback
remain open below. Zoom changes the
field of view; Fit all and Home restore the initial orientation and fit. Labels and hit
targets follow the projected stars, and keyboard/search navigation can bring a star
back into view. The canonical KS03 coordinates, including saved manual positions, stay
read-only: the spherical placement and rotation are a display mapping. Preserve the
1.6-second entry, 1.1-second Esc return, early cancellation and movement lock. Reduce
motion skips those transitions while preserving direct manipulation, without automatic
drift or release coasting. This decision does not approve changes to the sky's look,
hierarchy sizing, dense-network treatment or the real-data read boundary.

**User playtest feedback (2026-09-21):** the fixed-viewpoint motion worked. The interface
takes too much screen space, the graphics do not yet give a feeling of a universe of
stars, and the user needs many MMs to judge whether the experience works. The current
three-MM fixture cannot answer that last question. Interface footprint, star atmosphere,
and the size/topology of a larger synthetic fixture remain open choices; no specific
redesign or fixture expansion has been selected. Preserve the accepted motion settings.
Real-data reads and exported-slot loading remain separately gated.

**Confirmed sky treatment, clarified 2026-09-09:** stars and connections appear directly
in the 3D sky, rather than in an SVG chart or a separate full-screen panel. Readable labels
and inspection controls may overlay that scene. The special camera reveals the stars
over the current sky, including daylight and cloudy or rainy conditions. The grove
keeps its actual time and weather, and real time continues during inspection. Clear nights
are not a prerequisite for accessing the star network.

**Confirmed constellation design:** project the existing KS03 layout into the sky. Preserve
the recognizable arrangement of its displayed nodes and connections, including saved manual
positions, while fitting the network to the sky-view camera. Viewing does not re-layout the
Track canvas or create a second independently arranged multiverse.

Each star glows beautifully in its MM's resolved color, honoring custom colors and Track's
existing color fallbacks. **Higher-level parents have larger stars; descendants become
smaller down the hierarchy.** This is a World presentation rule, not the KS03 canvas's
current type-based node-size rule. Size communicates hierarchy, not MG rating, completion,
review urgency, or a reward. Keep a clear luminous center and a bounded colored halo so
nearby stars remain distinguishable. A cycle cannot satisfy a strictly larger parent on
every edge, so its visual exception needs an explicit rule, not just protection against
unbounded growth. No sizing rule may duplicate an MM into separate identities.

**Hierarchy exception proposal:** treat mutually reachable nodes as one group for size
calculation only, with equal-sized stars inside that group. Rank the resulting acyclic
groups by their longest parent path from a root; a shared child gets one size below its
parent groups. Use a decreasing, bounded size curve. This does not collapse visible stars,
remove connections, change their colors, or rearrange the projected KS03 positions. Exact
ratios and dense-network readability remain to be tested before adopting this treatment.

**Confirmed SIR signal direction: grove and stars.** Botanical review markers on the ground
and matching signals on the corresponding MM stars reflect the same review state. The user
delegated the visual treatment; the adopted design is a restrained bud/leaf marker in the
grove with a small petal-shaped light ring, echoed by a petal-shaped outer ring on its star.
The ring adds a recognizable review cue without replacing the MM's color or hierarchy size.
Ordinary stars keep their beautiful base glow even when no review is due.

Use few calm ground markers and group multiple due reviews for one MM into a readable
detail list, keeping one star for that MM. Exact counts and session dates remain available
in the UI; two physical representations never count as two reviews. The matched signal
may use a gentle pulse, with a steady reduced-motion alternative. It creates no additional
reminder event, required collection action, or punishment. The concept illustration uses
synthetic colors and records to demonstrate this treatment; its plant shapes and framing
remain visual-development references.

![Memory Grove ground markers and grounded KS03 stargazing concept](assets/images/memory-grove-ks03-concept.png)

> Built-in imagegen reference, 2026-09-06: ordinary grove view on the left, special grounded
> sky view on the right. Colors and graph records are synthetic; the diagram-like star
> arrangement illustrates the direction rather than reproducing a personal KS03 canvas.
> This is not a production asset, exact UI specification, or runtime performance evidence.
> [Generation prompt and reference notes](assets/images/memory-grove-ks03-concept.prompt.md).

**Confirmed information scope:** selecting a star opens the specific MM's full information
and associated feature views, including MGs. This includes what has been recorded for that
MM across Track, rather than limiting the view to a title, connections, or due SIR sessions.
The coverage inventory is:

| Area | Information available for the selected MM, where applicable |
| --- | --- |
| Identity and connections | Name, anchor/T1/T2 type, explanation, color, parent/child relationships, and navigation to connected MMs |
| Learning progression | KS02 stage, SIR sessions and their stored status/dates, and associated +Lin history |
| Marginal Gains | Current MG, rating/level, dated MG progression including old/new MG and experiments, and scheduled/carried MG focus information |
| Kolb | Linked Kolb records with their full stored reflection, experiment, and MG content |
| Comments and links | MM comments and their stored checked state, unclear status, and direct links |
| Source and collection | Source-dump references, text blocks, URL links, source activation state, inherited/aggregated content with its origin, saved ordering, and storage tags |

Applicability follows Track's existing MM-type and relationship rules: an anchor or T1 MM
does not acquire T2 MG behavior from its star. Use stored relationships to assemble the
information; similarly named records are not a link. Existing records and current status
do not constitute a complete audit history of every past edit.

**Confirmed action scope (2026-09-06): full MM interaction.** Selecting a star gives access
to the MM's existing Track features and editing actions, including MGs, Kolb, +Lin/SIR,
structure, comments, links, and sources. Section 10 defines this expanded write scope.
The concept decision is settled; the command implementation and recovery flows are still
to be built and verified.

The organization of the full MM detail view, projection/size tuning, and dense-network
readability remain open. The full network must remain representable at realistic volume;
label density and navigation need their own design rather than assuming every title fits
on screen at once.

<a id="ref-memory-grove-detail"></a>

> **Planned reference R4 — Complete MM detail and dense KS03 projection.** The ground and
> daylight sky reference already appears above. Place only its missing detail wireframes
> and synthetic layout/density comparison here, including empty and post-deletion states.
> See the [reference package](#picture-reference-package).

## 6. Mapping Track concepts into the world

| Track concept | Current world interpretation | Interaction status |
| --- | --- | --- |
| Major goal | Separately themed region or major journey | View representation confirmed; structural editing excluded |
| Nested goal | Branching path within its parent region | Representation confirmed |
| Milestone | Meaningful destination or permanent landmark | Representation confirmed |
| Task / to-do | Small marker from a shared family, with a task-specific shape | Working visual choice; exact artwork open; write access deferred |
| To-learn item | Related marker with a distinct learning shape along its goal path | Working visual choice; exact artwork open; write access deferred |
| Schedule | Clock Plaza plus notification and notebook views | Read access confirmed; write access deferred |
| Supporting-action entry | Dated schedule span and inspectable action details in the Plaza/Today/notebook | Include in complete schedule reads; this clarification adds no completion or scheduling writes |
| Scheduled MM session | Dated schedule span linked to its MM; distinct from a SIR review occurrence | Include in complete schedule reads; MM feature access does not itself authorize ticking or rescheduling this entry |
| Calendar note | Timed or untimed schedule signal | Read access confirmed |
| Deadline | Distinct due signal with separate warning language | Read access confirmed; completion/editing deferred |
| SIR review | Matched botanical ground markers and petal-ring cues on MM stars; readable due information available everywhere | Grove-and-star signals and MM-specific SIR management through the selected star confirmed |
| KS03 multiverse | Projected KS03 arrangement; stars glow in MM colors with higher-level parents larger; grounded pan/zoom and always-readable overlay; select for all MM features including MGs | Layout, visual hierarchy, full viewing and MM interaction confirmed under Sections 5.7 and 10 |
| Notes widget | Notebook carried in the right hand | View and edit anywhere confirmed |
| Completed goal | Transformed region that remains explorable | Confirmed |

This mapping is conceptual. It does not replace the existing meanings, dates, ownership, or
relationships stored by Track.

**Working marker choice (2026-09-06):** tasks and to-learn items use related, recognizable
markers with distinct shapes for each kind. Materials may adapt to a region while exact
titles and status remain inspectable. The user selected this tentatively; the precise
symbols and artwork remain open. This visual choice does not enable completion writes.

<a id="ref-marker-legend"></a>

> **Planned reference R6a — Marker legend.** Place the task/to-learn and warning/due/SIR
> shape legend here, with the same meanings shown in two regional materials. This is part
> of the interface package, not an additional art direction. See the [reference package](#picture-reference-package).

## 7. Clock Plaza schedule experience

### 7.1 Physical representation

The Clock Plaza uses a circular, ground-level representation of the current day:

- A clear ring or set of rings establishes the day's time structure.
- An unmistakable marker shows the current local time.
- Scheduled activities occupy meaningful positions or spans around the ring.
- Timed notes appear at the relevant time.
- Untimed day notes have a separate central or all-day location; the world must not assign
  them a false time for visual convenience.
- Deadlines have a visually distinct due state.
- Deadline warnings remain distinct from the due moment.
- Exact titles, times, and details are available through the interface rather than relying
  entirely on environmental symbolism.
- The center provides a readable day-ledger or focal point without blocking free movement.

The Plaza is not the only way to learn what is happening. Its purpose is to embody time and
make visiting the schedule enjoyable; it must not become a mandatory obstacle to awareness.

**Geometry proposal for the first information proof:** use a clockwise 24-hour ring, with
00:00 at a fixed labeled origin and parallel lanes for overlapping spans. Keep the due
moment distinct from a deadline's preparation span; preparation on another day belongs to
that day's geometry. Caution is a dated warning, not an invented duration around the ring.
An untimed note retains its all-day location even if its automatic block is shown at 08:00;
label that placement as a default block, never as an authored note or reminder time. Related
markers open the same item detail and count once. Confirm scale, lane density and selection
with the annotated reference and synthetic proof before adopting the geometry.

<a id="ref-clock-plaza-semantics"></a>

> **Planned reference R9 — Clock Plaza semantic schematic.** Place a ring/date-strip/Today
> crosswalk here, using matching synthetic identities for overlaps, untimed notes, gapped
> caution days, moved preparation and due/completed states. This is an annotated behavior
> proposal, not a beauty render. See the [reference package](#picture-reference-package).

### 7.2 Regional echoes

When an item belongs to a goal, its region may show a smaller echo through light, sound,
movement, a marker, or a local object. The Clock Plaza remains the complete schedule view,
while the echo connects the item to its journey.

An echo must not create a second conflicting truth. It reflects the same underlying item.

### 7.3 Complete Today view

The full contents of today are available from a compact notification button or bar. It
should not occupy substantial gameplay space while closed.

When opened:

- It provides an adaptive complete view rather than showing only an unexplained count.
- The computer layout prioritizes readable titles and enough visible rows, with scrolling
  when needed and full details immediately available.
- The world remains visible behind or beside the panel.
- Exact information is prioritized over decorative animation.

The open panel may take more space because opening it is deliberate; the closed state must
remain unobtrusive.

### 7.4 Evening transition

After **20:00 local time**:

- Unfinished items from today remain visible.
- The interface begins featuring tomorrow when tomorrow contains a day note, warning, or
  deadline.
- Tomorrow's information is presented as approaching, not as if it already belongs to today.
- The environment may gently signal the transition without forcing the panel open.

### 7.5 Midnight and overdue items

At midnight:

- Every item remains attached to its original date; midnight alone writes nothing.
- Actionable occurrences retain their canonical completion state. Unfinished ones appear
  as dated unfinished history; use an overdue label only under the category's defined
  lateness rule, never merely because a generic checkbox is absent.
- Informational calendar notes, reference timetables and descriptive goal markers become
  dated information/history, not overdue work. Automatic block-placement times do not
  create reminder times or completion obligations.
- The game never silently carries it forward, changes its date, or implies that Track was
  rescheduled.
- Any completion, edit or dismissal uses an explicitly authorized Track action. Viewing
  history does not require dismissal. Category-specific policy is recorded in Section 25.7.

## 8. Reminder behavior

**User decision (2026-09-07):** reminders use visual cues and gentle sounds.
When a scheduled time or important deadline arrives during play:

1. The compact notification control pulses.
2. The Clock Plaza or relevant regional echo produces a recognizable visual cue and
   gentle sound.

A separate brief fading message remains a presentation proposal. Exact sound design and
reminder grouping remain open.

These signals reinforce each other. Environmental signals are never the only notification
channel, because weather, camera direction, distance, visual ability, or muted audio could
make them easy to miss.

Ordinary reminders should not pause the game or demand dismissal. The exact escalation rule
for genuinely urgent or overdue information remains open, but it must stay compatible with
the no-punishment principle.

## 9. Personal notebook

The notebook is both a world object and a convenience tool.

Confirmed behavior:

- It is carried in the character's right hand during ordinary movement.
- It can be opened anywhere using a dedicated button or keybind.
- Opening it gives reading/writing controls focus while the game continues running.
  The character is not in danger; opening a panel does not pause the world (2026-09-08).
- Personal notes can be viewed and edited from anywhere.
- Notebook note changes synchronize with the Track notes widget, including Track edits
  made on other authorized devices.
- Schedule, deadline, SIR, and goal information can be viewed through the notebook.
- The notebook's non-note sections remain view-only. Full MM editing is accessed through
  the selected star in the Memory Grove (Section 10).
- It stows automatically for movement requiring both hands and returns fluidly afterward.

The notebook must not require travel to the sanctuary or Clock Plaza before the user can
work with personal notes.

**Functional parity correction (2026-09-11):** every Track-backed game feature must use
the same functional interface as Track web. The user rejected the notebook's additional
Keep/Cancel/Export workflow as too complicated. The notebook follows the actual notes
widget: list → select or **+ Add note** → edit topic/body with automatic saving → Back;
Delete requires confirmation. Opening again returns to the list. Empty notebooks offer
Add note. Note creation and deletion are part of this confirmed functional scope; live
implementation still requires Section 25.8's identity, command and recovery boundaries.
The botanical presentation can differ, but it must not add an independent editing workflow.
This parity rule applies to other Track-backed features as well, not only notes.
The user accepted the revised notes interface on 2026-09-12 and explicitly allows a later
styling pass to fit the world theme while preserving this functional behavior.

**Synthetic notebook proof:** those actions now operate on Track-shaped session notes.
Edits are retained automatically by identity. Deletion uses a focus-owning confirmation
that leaves the world running. Reload restores the original synthetic fixture. This
proves the interface, not a live connection to Track or cross-device synchronization.

## 10. Two-way connection and action safety

The two-way link covers personal notebook notes and full MM interaction from the Memory
Grove's selected-star view. Track continues to own the records and the meaning of every
action.

### Confirmed write capabilities

- View, add, edit and delete personal notebook notes using Track's functional interface,
  in synchronization with Track (functional parity confirmed 2026-09-11).
- **Full MM interaction from a selected star (2026-09-06).** Provide the applicable existing
  Track actions for that MM, including its related learning records and source content:

| MM feature family | Confirmed interaction scope |
| --- | --- |
| MM identity and structure | Existing MM creation/duplication/deletion, rename, type, explanation, color, and parent/child connection actions; deliberate layout editing where applicable |
| MG | Current-MG changes through Track's existing Kolb/MG workflow, rating/level changes, and MM-specific focus scheduling |
| Kolb | Existing creation, editing, duplication/reuse, and MM-link actions for learning records |
| +Lin and SIR | Existing stage changes and review completion, skip, postpone, finish, and revert actions, with their canonical effects on sessions and dates |
| Comments and links | Existing add/remove, checked-state, unclear-status, and direct-link actions |
| Source and collection | Existing source attachments/content actions, text and URL blocks, activation, ordering, transfers, and storage tags; shared content retains its real owner |

Actions keep their existing applicability: an MM's type and current state determine what
Track allows. The star view does not introduce a free-form replacement for Track's MG,
SIR, or source rules. Changes that affect other records must identify those effects before
confirmation where required, including shared-source edits, type changes, review-date
cascades, and deletion.

The interaction sequence is **select the star → choose a named action → edit or review its
effect → explicitly save/confirm → show the accepted result**. Ordinary inspection and
camera controls never write. Destructive actions retain confirmation, and completion or
review-management actions must not trigger from a general interaction key or a stray click.
Cancellation and failed saves preserve recoverable work; visible success follows Track's
acknowledgment, with cloud status shown separately. Exact forms, command shapes, and
recovery behavior remain implementation work.

**Entry-state proposal for the confirmed MM creation scope:** expose a named Create MM
action in the Memory Grove overlay even when no star exists or is selected. It uses the
same scoped Track command, type rules, draft recovery and acknowledgment as other MM actions;
it never creates a synthetic placeholder in Track. After accepted creation, select the new
MM. After accepted deletion of the selected MM, clear selection and return to the overlay,
showing its empty state if necessary. A failed deletion keeps its recoverable context;
remote deletion disables actions on the missing record. Ordinary viewing still writes nothing.

This is authorization for the concept's feature scope. It does not itself perform a live
edit, authorize a runtime/cloud change in this documentation task, or bypass the separate
Track implementation and verification workflow.

### Explicitly excluded

- Structural goal editing inside the game. Creating, renaming, moving, nesting, or
  reorganizing the goal hierarchy remains in Track unless this decision is deliberately
  revisited later.

### Deferred capabilities

- Completing tasks or to-learn items.
- General calendar-note, deadline, and task-schedule editing or rescheduling. MM-specific
  MG focus scheduling and SIR management are included above.
- Creating quick reminders or other Track items.

MM actions may change a linked goal's computed progress through Track's existing rules.
That consequence does not grant separate goal-tree editing or direct task/to-learn ticks.

If task or to-learn completion is enabled later, its interaction contract is already
defined:

```text
Inspect the item → intentionally tick it → explicitly confirm
```

Completion cannot be caused by walking into an object, collecting something, finishing a
jump, pressing a general interaction button once, or accidentally clicking a small control.
A clear final result and a reasonable recovery/undo path should be considered before
completion writes are allowed.

## 11. Progress feedback

World change follows layered significance:

- An individual task may produce a small sign of life or local response.
- A milestone produces a memorable landmark or meaningful regional change.
- A completed major goal transforms its region.
- The transformed region remains explorable.

This hierarchy prevents every tiny completion from permanently cluttering the world while
still ensuring that small actions feel acknowledged.

**Confirmed reward decision (2026-09-06): no extra reward system.** The local responses,
milestone landmarks, regional transformations, and retained history are the feedback.
There is no additional currency, XP, collectible reward track, or reward-based cosmetic
unlock system. Future customization remains a separate design question.

The exact visual effects and their truthful response to corrected completion state remain
open. The world must not encourage meaningless Track activity, fake entries, or excessive
fragmentation of tasks to produce more effects.

<a id="ref-progress-history"></a>

> **Planned reference R7 — Active, completed and reopened region.** Place the same-camera
> comparison here. Distinguish retained landmarks from truthful current-status effects;
> the correction treatment remains a proposal. See the [reference package](#picture-reference-package).

## 12. No-punishment model

Overdue and neglected items create **concern without punishment**:

- Clear reminders may appear.
- Environmental signals may communicate urgency.
- No region permanently decays.
- No earned landmark is removed.
- No resource is confiscated.
- No threatening encounter is created merely because the user fell behind.
- Unticking or correcting an item should restore its truthful state, not reconstruct a
  guessed state.

A temporary visual decline was discussed and rejected as unnecessarily complex and too
close to punishment.

## 13. Variety and exploration

The user already knows the information because it comes from their own application.
Exploration therefore means discovering different experiences and perspectives, not fake
informational surprises.

Confirmed sources of variety:

- Different goal regions with their own themes and traversal character.
- Real local time and varied weather/seasonal atmosphere, including the authorized fantasy
  alternative in Section 14 when real-weather integration is too complicated.
- Temporary world events that alter atmosphere or experience without punishment.
- Naturally varied platforming and routes.

Possible relaxing activities such as gardening, photography, climbing trials, or
other calm interactions remain a feasibility and value question. They should be considered
only if they make the world more enjoyable without creating a second obligation system or
distracting from Track.

Gliding is confirmed traversal for reaching floating islands (Sections 4 and 5.5).

## 14. Whole-world environmental fluidity

“Fluid environment” is a load-bearing creative requirement, not shorthand for changing the
skybox.

### Time of day

The movement of local time should affect:

- Sky color and cloud illumination.
- Direction, length, softness, and warmth of shadows.
- Light entering ruins, trees, shelters, and interiors.
- Water reflections and visibility.
- The behavior and appearance of glowing plants or celestial materials.
- Regional ambience and distant visibility.

### Wind

One coherent wind state should be perceptible across:

- Treetops, shrubs, grass, flowers, and vines.
- Hanging decorations and environmental objects.
- Waterfall spray, mist, leaves, petals, and particles.
- The character's hair, cape, clothing, and carried objects where appropriate.
- Distant foliage, so the foreground does not move against a frozen horizon.

### Rain and humidity

Rain and recent rain should influence:

- Wetness and drying patterns on stone, wood, soil, and plants.
- Water channels, pools, waterfalls, ripples, and runoff.
- Reflections and diffuse light.
- Mist, haze, spray, and distant visibility.
- Plant posture, color, and motion.
- Exterior interface edges, without compromising reading surfaces.

### Seasons and local climate

When following real weather, the world should reflect the user's local climate rather than
automatically imposing a generic four-season model. Seasonal character may affect
vegetation, rainfall, water levels, light, atmosphere, and regional materials.

**Weather direction, clarified 2026-09-08:** real-life weather was the selected default,
with selectable custom weather. The user now explicitly accepts completely random,
fantastical weather **if connecting real-life weather is too complicated**. This authorizes
an alternative to the integration requirement; it does not claim that integration has been
assessed as too complicated or that an unconditional source switch has already been chosen.
Location, provider, permissions and unavailable-feed behavior matter only if the live
connection is pursued. Choosing the fantasy alternative needs no location or weather feed.

**Synthetic demo implementation (2026-09-12):** custom fantasy controls offer clear, rain,
snow, intense rain and heavenly skies through one environment controller. Snow cover
accumulates/melts and stone dries gradually; the weather remains non-dangerous in flight.
These are local fictional conditions. The demo does not connect a live weather feed or
choose a location/provider. Automatic random occurrences, floods and environmental audio
remain unimplemented; the broader source decision is unchanged.

### Fantasy weather and occurrences

The user invited imaginative extremes: **wild snowfall, heaven-like weather, intense rain,
floods, and other fantasy occurrences**. These can depart entirely from the local climate.
The source decision above is conditional; the permission to explore this creative range
is explicit. Candidate treatments, with exact visuals still to be tested:

| Occurrence | World experience |
| --- | --- |
| Impossible snowfall | Huge slow snowflakes, luminous snowdrifts, frost-blue foliage and snow tracing the plaza rings, even in a normally tropical region |
| Heavenly skies | Vast pearl-and-gold clouds, soft shafts of light, floating petals and radiant mist around the islands |
| Fantastic downpour | Broad curtains of rain, sweeping cloud fronts, overflowing channels and a strong shared wind across vegetation and water |
| A passing flood | Water rises through the low garden and makes familiar paths look like a temporary lagoon, then recedes; landmarks and information remain available |
| Aurora or star shower | Ribbons of colored sky light and drifting star-like particles; atmospheric lights remain distinguishable from selectable MM stars |
| Petal tide | Streams of luminous petals flow through the landscape and gather around water and terraces |

Randomness chooses what arrives and how it develops; it does not require discontinuous
sky changes or unrelated effects firing independently. Let an occurrence arrive, develop
and pass through the shared environment system. Exact frequency, duration and transition
rules remain tuning work. Snow, floods and storms never damage the character, destroy
goal landmarks, demand maintenance, or create tasks. The notebook, Today and MM information
remain readable and available throughout. Fantasy atmosphere never changes Track dates,
the truthful local-time readout, or the meaning of a deadline warning.

### Gradual transitions

Environmental states should flow into one another. The user should not see a new sky placed
above unchanged lighting, dry surfaces, frozen foliage, or incompatible water. A transition
is successful only when the whole scene feels like it has entered the new condition.

Weather may alter the atmosphere and optional traversal experience, but it must not make
essential information inaccessible.

<a id="ref-environment-states"></a>

> **Planned reference R2 — Coherent environment states.** Place the same-camera clear/rain/
> wet-evening/night comparison here, including stable reading surfaces and reduced-motion
> annotations. Later engine captures and motion evidence must test the target; reference
> images cannot prove transitions or performance. See the [reference package](#picture-reference-package).

## 15. Art direction

### Confirmed rendering direction

- Stylized anime-inspired third-person 3D.
- Clean cel shading and readable silhouettes.
- Bright, expressive color with controlled contrast.
- Simplified materials and broader shapes.
- Medium-low environmental detail: alive and rich, but not hyperrealistic or covered in
  micro-ornament.
- Enough depth and material response to make the world feel inhabitable.
- No gritty photorealism.

The initial hyperrealistic concepts were rejected. A later anime pass was still judged a
little too detailed, so the preferred level was reduced modestly rather than flattened into
minimalism.

### Current Clockgarden direction

The schedule area's visual identity combines:

- Lush local vegetation.
- Pale simplified stone.
- Warm restrained gold or bronze time rings.
- Water channels and rain response.
- Celestial instruments and motifs used sparingly.
- A clear circular plaza with calm negative space.
- Surrounding terraces and geography that suggest fluid traversal.

### Other locations

The Memory Grove's botanical setting and its special KS03 star sky are confirmed in
Section 5.7. Other goal regions and functional places are expected to have varied identities.
The exact fantasy world, lore, cultures, and remaining regional aesthetics will be decided
later.

Visual variety must not make the information system incoherent. Locations may change
materials, silhouettes, animation, and motifs, while retaining recognizable interaction
hierarchy, readable text, familiar controls, and consistent meanings for warnings and
completion.

<a id="ref-style-sheet"></a>

> **Planned reference R1 — Selected style sheet.** Place annotated crops of the two existing
> images here to define silhouette, cel bands, palette, detail density and ornament limits.
> Retain those images as visual-development references. See the [reference package](#picture-reference-package).

## 16. Living Botanical interface identity

The selected interface direction for the current schedule experience is the **Living
Botanical Codex**.

### Visual language

- Organic, asymmetrical silhouettes rather than a generic rectangular dashboard.
- Layered leaves or petals that unfold into information surfaces.
- Individual leaf-like cards for schedule entries.
- A compact flower-bud or unfurled-leaf notification control.
- Sage, mint, soft cream, sky blue, and restrained warm gold.
- Simple seed, sun, book, bud, or related category symbols.
- Moderate spacing and limited ornament.
- An anime-fantasy character rather than realistic botanical illustration.

### Readability contract

- **Demo feedback (2026-09-06):** the notes, mind maps, and Today data/information formats
  do not fit the user's Track website. They need to match Track's actual information
  structure; the demo's simplified panels are not an accepted format reference.
- **User decision (2026-09-08): full information.** Present the complete applicable
  information in the opened panel, rather than requiring a summary-to-full-details step.
  Sections, tabs and scrolling may organize long content; they must not omit fields or
  replace the full MM feature scope with a simplified preview. Keep Track's meanings and
  terminology. This chooses content completeness, not an exact pixel copy of Track's layout.
- Text-bearing surfaces remain calm, opaque enough, and high contrast.
- Decorative vines, veins, droplets, and glow stay away from the text.
- Information is distinguished by shape and icon as well as color.
- The interface adapts to bright sky, night, rain, and complex scenery without becoming
  camouflaged.
- Weather and light may affect outer leaves, edges, reflections, or unfolding motion, while
  the reading surface stays stable.
- Computer interaction must support keyboard navigation and clear click targets. Essential
  controls and information must remain accessible without hover.

### Normal and expanded states

- The normal gameplay state is a small, unobtrusive botanical notification button/bar.
- The expanded Today state may occupy part of the screen because the user opened it
  deliberately.
- The expanded Today/notebook/MM companions should leave important world context visible.
  The user-selected Quest and world-map menus occupy the full screen, as specified below.
- A close action must be obvious.
- **User decision (2026-09-06):** selecting another bottom tab switches directly to that
  panel, without requiring the current panel to be closed first. The current extra close
  step was reported as inconvenient.
- **User decision (2026-09-08): panels do not pause the game.** Weather, scenery, character
  simulation, time and updates continue while information is open. Input focus belongs to
  the panel so typing and clicking controls cannot also steer the character or camera.
- Presentation can adapt to computer window sizes without changing its botanical identity.

### Genshin-style Quest and map interfaces — synthetic demo implemented

**User direction (2026-09-09):** position Quest and maps in the same places as Genshin
Impact, use its full-screen Quest/map menu arrangement, and provide the same applicable
map features, explicitly including custom pins and map destination locators. This replaces
the earlier lower-left Quest popup/right-side Quest companion. The synthetic demo now
has a top-left minimap/Quest stack, full-screen Quest list/details, a scene-derived map,
session-only named/icon pins and destination locators. This establishes a playable
implementation, not complete reference parity. Current behavior and checks are in README.

The desktop exploration interface is the working reference because the initial platform
is the user's computer. This is a layout and interaction requirement alongside Track's
existing information meanings and the selected botanical visual identity.

**Map feedback (2026-09-09):** a map click must show a temporary pin symbol at the
chosen coordinate before confirmation. Turning the viewing direction must immediately
turn the map's direction indicator, even while the character is stationary. Navigation
to both landmarks and pins must place a small marker at the destination's exact world
point, accounting for surface height and remaining visible through scenery. Keep the
existing camera-relative direction/distance cue for destinations outside the view.
Each playable revision must finish with concrete actions for the user to try and the
specific feedback needed.

**Accepted playtest and selection refinement (2026-09-11):** the user accepted pin
preview placement, live viewing-direction updates and height-aware destination markers.
Selecting a saved pin or landmark while a pin draft is open must abandon that draft and
immediately show the selected place. This includes leaving an unconfirmed edit of a saved
pin: the saved version stays intact. Ordinary companion switching still retains drafts.

| Surface | Required target |
| --- | --- |
| Gameplay minimap | Circular map at the top left, showing nearby geography, player position and orientation, relevant landmarks, pins and the active navigation target. Selecting it opens the full-screen world map. |
| Quest HUD | Quest tracking in the upper-left area below the minimap, following the reference placement. The heading reads **Quest** and opens the full Quest popup when selected (user direction, 2026-09-12). Preserve the requested starred rollup and distinguish it from the currently navigated destination; navigating is not starring or completing a quest. |
| Full-screen Quest | Quest list/categories on the left, full selected information on the right, navigation controls in the reference action area and an obvious close control. Use Track's actual quest hierarchy and membership; do not fabricate Genshin quest categories or rewards as Track data. |
| Full-screen map | Geographic map covering the viewport, with reference-positioned map controls and selected-location/pin details. Support panning, zooming, recentering on the player, identifying landmarks and selecting a destination. This is separate from the Grove's KS03 knowledge sky. |
| Custom pins | Place a pin at a chosen world coordinate; choose its symbol, name it, inspect/edit it and remove it. Make the pin identifiable on the full map and minimap. |
| Destination locator | Start/cancel navigation to a chosen pin, mapped quest or landmark. Show a consistent marker and direction/distance across map, minimap and gameplay; update from the character's actual position. |

**Reference evidence:** the [gameplay HUD screenshot](https://www.hoyolab.com/article/35256731)
shows the minimap and quest navigation area; the [Quest menu screenshot](https://www.hoyolab.com/article/24637260)
shows the left list/right details and Navigate action; and the [custom-pin screenshot](https://www.hoyolab.com/article/24360358)
shows icon/name editing in the map's right-hand detail panel. These are player screenshots
hosted on HoYoLAB, used as layout references, not a complete current-version feature audit.
The [official developer discussion](https://www.hoyolab.com/article/19475214) also describes
layered maps and quest navigation into the map. Inventory the applicable desktop behavior
before calling the implementation feature-complete; the screenshots alone do not prove parity.

**Remaining implementation details:** audit pin management and tracking, navigation start/
stop, map filters, region/layer selection and existing gateway selection against the
reference as geography is added. The exact pin icon set, limits, map rotation and detailed
menu arrangement must follow that comparison rather than an invented claim of parity.
Displaying a gateway does not settle its still-open unlock or travel rules. A quest without
an established world location remains readable and says that no destination is mapped;
do not invent a coordinate or a route to make the Navigate button appear functional.

**Behavior carried forward:** opening either full-screen menu does not pause time, weather
or character physics. The menu owns input. Close/switch restores focus and retains existing
note/MM drafts. Keep companion switching reachable within the full-screen interface.
The identity block is centered during play, clear of the minimap/quest stack. M opens
the world map, K opens Mind maps, and G retains Grove sky entry. The toolbar stays
reachable within both full-screen menus.

**Demo boundary:** first use a map of the actual synthetic scene and session-only pins/
active navigation. Pins and navigation preferences belong to game state, never to
`track_db`; selecting or reaching a destination does not change Track progress, Quest
membership, stars or routine ticks. Persistence/recovery and real-slot location mappings
remain separately gated work. This request adds navigation UI, not a reward system.

<a id="ref-interface-states"></a>

> **Planned reference R6b — Interface states.** Place closed-bud, dense Today, notebook and
> item-detail wireframes here, with synthetic Thai/English text, scrolling, focus and empty
> states. The three example rows in the cover image do not specify a complete Today view.
> Include the Genshin-positioned minimap/quest HUD, full-screen Quest list/details, full-screen
> geographic map, pin editing and active destination states, with unpaused close/switch behavior.
> See the [reference package](#picture-reference-package).

### Explored but not selected

An Astral Glass-and-Vellum interface was explored first. It used teal-and-gold celestial
filigree around a warm paper surface and offered strong separation from the environment.
The Living Botanical identity was selected because it felt more distinctive, organic, and
connected to the Verdant Clockgarden.

## 17. Privacy, synchronization, and devices

### Privacy

- The world is private and personal.
- Only the user should play it.
- Access is limited to authorized devices or the user's private identity.
- Public viewing and shared multiplayer are not part of the current concept.

### Synchronization

- The initial computer world reflects the user's current Track data. Track itself may
  still synchronize with other authorized devices, so mobile gameplay being deferred does
  not remove the need to handle competing Track edits safely.
- If game support expands to additional devices, the same personal world should remain
  consistent across them.
- Personal notebook notes must stay synchronized with the Track notes widget.
- Accepted MM edits from the star view must be reflected in Track and other World views
  through the same canonical records, including related MG, Kolb, SIR, and source changes.
- Game presentation must never imply a successful data change before Track has safely
  accepted it.
- Conflict, offline, and recovery behavior are not yet designed and must be treated as a
  core data-safety problem rather than visual polish.

### Initial device target: the current computer

- Develop and test the first version on the user's existing Linux computer, using keyboard
  and mouse.
- The current reference hardware is an AMD Ryzen 5 5500U with integrated Radeon graphics
  and approximately 14 GiB of usable RAM reported by Linux. This is the initial test target,
  not a published minimum specification or a guarantee of frame rate.
- Fit visual density, rendering resolution, and effects to this computer. Measure a
  representative playable scene before committing to graphics quality or performance.
- **First-demo decision (2026-09-06):** Babylon.js in the desktop browser. The user
  primarily directs Codex and playtests. Production suitability remains subject to the
  measured scene; exact dependencies require their own approval.

### Deferred device work

- Phone and iPad versions are outside the initial scope and have no feature-parity
  commitment.
- Touch movement and camera controls, mobile notebook layouts and text entry, safe areas,
  mobile performance and battery tuning, and native mobile packaging are deferred.
- If these devices are revisited, the desired direction is the same world, history, and
  Track data with controls and information density adapted to each device.
- Mobile feasibility is not an acceptance gate for the first computer version.

## 18. Data and product safety guardrails

These rules should survive every later design revision:

1. Track remains the truthful source for goals, dates, notes, deadlines, reviews, and
   completion state.
2. The game never silently reschedules an item.
3. Evening previews never change tomorrow into today.
4. Midnight never moves an unfinished item to the new date.
5. Ordinary movement never changes Track data.
6. Platforming success or failure never completes, deletes, or delays a real item.
7. Destructive or meaningful writes require clear intent and confirmation appropriate to
   their risk.
8. Weather and world events never make critical information unreachable.
9. A block, signal, echo, notebook page, and Clock Plaza marker must not become conflicting
   copies of the same item.
10. Unknown, unavailable, or failed synchronization must be visible rather than disguised as
    success.
11. The game must not reward fake entries, meaningless repetitions, or excessive task
    fragmentation.
12. Completed history is preserved unless the user explicitly chooses deletion under a
    future deletion policy.
13. A beautiful interface is not successful if its information cannot be read quickly.
14. A functioning world is not successful if it makes existing Track data unreachable or
    ambiguous.

## 19. Key design challenges

### 19.1 Fun versus productive avoidance

The world should make returning to Track enjoyable without becoming a more attractive way
to avoid the learning or work represented by Track. Optional activities need a clear
relationship to rest, reflection, or meaningful progress. There is no extra reward system
to maintain alongside Track.

### 19.2 Stable geography versus live data

Goals can be added, nested, reordered, completed, archived, or removed. The world must react
without turning familiar geography into an unpredictable filing system.

### 19.3 Small world versus permanent history

Keeping every completed journey explorable can make the world unbounded. The topology must
allow long-term growth while keeping the sanctuary and daily schedule convenient.

### 19.4 Regional variety versus interaction consistency

Different regions and interfaces should feel unique, but recurring actions must remain
recognizable. Style cannot force the user to relearn how to inspect, close, navigate, or
understand an urgent item in every biome.

### 19.5 Immersion versus information clarity

Environmental signals are atmospheric but can be missed. Precise interface information is
reliable but can feel pasted onto the game. The three-layer approach—world location,
environmental echo, and readable interface—must remain balanced.

### 19.6 Whole-world fluidity versus scope

Coherent weather across sky, light, water, vegetation, particles, surfaces, audio, and
distant scenery is a defining feature, but it is also broader than a cosmetic day/night
cycle. This applies to both real-weather mapping and the authorized fantasy alternative.
The concept must not promise a static world with a changing backdrop. Random fantasy
selection can remove weather-service integration work, but snow, floods and other visual
effects still need their own implementation and performance proof.

### 19.7 Computer performance and future device support

The immediate challenge is a comfortable third-person experience and readable information
on the user's existing computer. Rendering choices must be checked on that hardware.
Phone and iPad controls, performance, and feature parity can be reconsidered later.

### 19.8 Data ownership and derived world state

The boundary between canonical Track data and game-specific state—position, discovered
routes, visual transformations, customization, and world history—is not yet defined. It must
be defined before implementation so synchronization cannot overwrite either side.

## 20. Explicitly rejected or deferred directions

### Rejected for the current concept

- Hyperrealistic graphics.
- Excessive environmental and interface micro-detail.
- A generic plain productivity dashboard pasted over the game.
- Artificially separated easy and hard routes.
- Platforming that blocks awareness of important information.
- Pretending the user's own Track data is unknown discoverable lore.
- Structural goal-tree editing inside the game.
- Automatically carrying unfinished items into a new date.
- Punitive decay, lost resources, or permanent damage caused by overdue work.
- Requiring a visit to a fixed location before personal notes can be edited.
- Combat or survival as the initial defining gameplay loop.
- Pausing the game or requiring a protective relocation merely to open an information panel.
- An extra currency, XP, collectible reward track, or reward-based cosmetic unlock system.

### Deferred rather than rejected

- Direct task/to-learn completion and general calendar-note, deadline, and task-schedule
  writes from inside the world. MM-specific SIR and MG actions are confirmed in Section 10.
- Quick capture into Track domains beyond the confirmed personal-note and MM actions.
- Optional relaxing side activities.
- Combat or survival as a later optional layer.
- Exact fantasy setting and lore.
- The fixed avatar's appearance and any later customization; a fixed character first is selected.
- Phone and iPad versions, including touch controls, mobile layouts, and feature parity.
- Detailed landmass layout, gateway routing and unlock rules, and emergency-return behavior.
- Memory Grove camera tuning, full MM detail organization, hierarchy-size/projection
  tuning, and the detailed forms/recovery flows for the confirmed MM editing
  actions. The projected KS03 arrangement and matched grove/star review signals are selected.
- Styles for other functional locations and goal regions.
- Archived and deleted goal behavior.

## 21. Open decisions, prioritized

**Settled world structure:** one separate world per Track slot; natural paths through
mountains, plains, or waters; fast travel through regional or landmark gateways. See
Section 5. The remaining questions below concern details of that direction.

**Settled experience direction (2026-09-06):** SIR uses the Memory Grove; a dedicated
look camera there shows this slot's entire KS03 multiverse as stars. Grounded stargazing
and an always-readable overlay are selected, and each star exposes the MM's full
information and full existing MM interaction, including MGs. There is no extra
reward system. Related task/to-learn markers are the user's tentative visual choice.
The sky projects the existing KS03 arrangement, uses each MM's color, and makes higher-level
parent stars larger. SIR signals appear both in the grove and on the corresponding stars;
the restrained botanical/petal-ring treatment follows the user's delegated design choice.

**Camera correction and continuation (2026-09-09):** the latest user direction replaces
full three-axis rotation with Genshin-style upright orbit and bounded vertical tilt.
After the larger-work Ultra prompt, the user said “continue”; this is direction to proceed
with the discussed demo work, not evidence that a model setting changed. The current
increment includes camera rotation, expanded MM records, notebook topics, the starred
popup and a synthetic grounded KS03 sky. The sky uses canonical auto/manual positions and
calendar review cues. Cycle sizing and label placement are implementation treatments to
review. Full MM actions, source inheritance, climbing/swimming and the remaining atmosphere
proofs remain unfinished. The subsequent launch/glide and fantasy controls are documented
in [the demo README](README.md), with their verification limits.

**Latest playtest feedback (2026-09-09):** the user accepted test 3 (panel switching,
unpaused reading and retained drafts), still reported rotation stopping, and saw only
the ordinary MM panel rather than the star interface. The MM panel now offers an explicit
**View stars in the Grove** travel shortcut; stars have radiant silhouettes and retain
the grounded Grove-only viewing contract. This improves access, but does not substitute
for user confirmation of the visual result. Tests 2 and 5 were unclear: future instructions
should say “check for getting stuck on the steps or bridge” and “check whether text is
readable and movement stutters,” respectively.

**Subsequent feedback (2026-09-09):** the ordinary camera is accepted; touch-dragging
while moving still fails. The user specified a fixed upward camera animation with stars
appearing directly in the world sky and no character movement. The demo now renders
celestial meshes and connections in Babylon, with animated entry/reveal/return; the old
SVG star picture and full-screen backdrop have been replaced.

**Current acceptance (2026-09-09):** the user said all current tests are good and explicitly
approved disabling the desktop's touchpad suppression while typing. The setting was
changed and read back as `false`. The current camera, panels and animated sky experience
are accepted; repeat playtest requests for those unchanged behaviors are unnecessary.
The subsequent 2026-09-12 user playtest accepted the tap-Shift sprint and camera-drag
checklist. On 2026-09-13 the user explicitly accepted controller fluidity and rejected the
first humanoid animation, then also rejected its rewrite in the 20:00 demo recording.
The current ground speeds and dash boost are fixed for the animation correction (§4).
The user selected the local procedural rebuild on September 14 (§4); its visual review
remains open. The sustained
hardware benchmark remains open. This acceptance does not mark unimplemented features complete.

The user also questioned why work was delivered as small feature subsets and why a demo
was needed. The demo is an implementation and verification stage of the same project,
not a reduced feature contract or a requirement to request feedback after every small
change. The complete confirmed scope remains required; sequential implementation reflects
dependencies and verification, and must not silently remove or indefinitely defer features.

**Demo completion request (2026-09-12):** the user directed finishing the demo. The existing
synthetic boundary is retained. A charged Windseed launch, deployable glider, two floating
islands and last-landing recovery now form a continuous playable route. The demo shortcut
is explicit, while normal exploration reaches the launcher through the gateway. Launch
controls and numeric tuning are provisional implementation choices for playtesting, not
claims of exact reference parity or a settled stamina formula. The local clock, dated Today
history and manual fantasy weather controls are integrated. This does not mark the full
world, real Track connection, full MM actions or sustained hardware proof complete.

**Quest: current prototype and new Genshin interface direction (2026-09-09).** Track gained a Quest feature on
2026-09-07 — a curated side list the user assembles from their existing goal tree and its
linked mind maps, with a starred subset. See [the root README](../README.md). The user asked for it to
appear in this world as a quest tab, with the starred subset in the default popup. That
request is now represented by a read-only Quest tab and compact starred gameplay list.
The current lower-left popup hides during panels/stargazing and places nearby instructions
underneath the starred rollup. The user has now superseded that target placement: use
Genshin's Quest position below a top-left minimap, full-screen Quest/map menus and matching
map-pin/destination-locator features. These changes are confirmed requirements, not yet
implemented; Section 16 holds their detailed scope and reference links.

- **Current prototype.** A `Quest` entry joins the existing toolbelt beside Today, Notebook, Mind maps
  and Weather, opening the single panel with the quest tree drawn in goal hierarchy. The
  gameplay popup shows the **starred rollup** — one line per
  topmost starred ancestor, never its descendants, because that row already stands for the
  whole subtree. The demo tab already shows that rollup and the complete pruned tree using
  `TrackQuest.starRollup` and `questTree`, including the latter's chosen `questOrder`.
- **Read-only, without exception.** *The game displays; it does not decide.* Direct
  task/to-learn completion is deferred by the data rule in `AGENTS.md`, so no quest may be
  ticked, added, starred, reordered or removed from inside the world. That includes the routine tick,
  which in Track is a day-scoped view preference rather than real completion — drawing it as
  if it were progress would be the second conflicting truth Section 18 forbids.
- **Synthetic data only, today.** This world reads four pure Track modules through the demo
  server and builds a synthetic slot; it holds no connection to a real `track_db`, by binding
  rule and enforced test. The Quest panel shows fixture quests. Real ones need
  the read adapter sketched in Section 25.6, which does not exist.
  [`scripts/quest-core.js`](../scripts/quest-core.js) is the third pure module on the demo
  server's allow-list; `graph-layout.js` is the fourth, for the sky projection.
  Only World files changed; Track's source and stored data were untouched.
- **No reward layer.** Section 11 already rejects XP, currency, collectible tracks and
  reward-based unlocks, and Section 12 rejects punishment. "Quest" here is the user's word
  for a curated list, not a quest *system*: no acceptance, no turn-in, no completion reward.
  A future reader taking the game meaning of the word would contradict a settled decision.
- **Navigation requirement.** The requested map and destination locators establish a
  navigation surface for quests with known world locations. Exact HUD density, selected
  navigation versus starred-row presentation, marker symbols and location mappings remain
  implementation work. Placement and full-screen expansion are now chosen, not open.
  The current Quest readers take one slot's goals and MMs. Under the one-world-per-slot rule, this design
  shows that world's quests; a missing linked MM remains identifiable as missing, never
  resolved by looking for the same ID in another slot. Cross-slot quest aggregation would
  be additional scope, not an unresolved requirement of this panel.

### Concept-critical

**Resolved by the 2026-09-08 clarification:** panels provide full information and keep the
game running; the character is not in danger. Random fantasy weather is an authorized
alternative if real-weather integration is too complicated. See Sections 3, 14 and 16.

1. The explicit interface for switching between separate slot worlds, including handling
   an open notebook draft and returning to the prior world's saved location.
2. How canonical Track data is separated from game-only world state.
3. The detailed landmass layout and growth policy for naturally connected regions, keeping
   completed regions explorable and daily travel convenient.
4. The forms, command contracts, and recovery behavior for confirmed full MM interaction;
   its empty-overlay creation and post-deletion entry states; and safe automatic notebook
   saves and confirmed creation/deletion matching Track. Additional write scope remains deferred.
5. How conflicts, offline changes, and cross-device synchronization are communicated and
   recovered safely.

### Experience-defining

6. Grounded sky-camera tuning and activation safety, KS03 projection and hierarchy-size
   tuning including the cyclic-group exception proposed in Section 5.7, dense-network
   readability, and organization of the full MM feature views.
7. The exact symbols, regional materials, and status presentation for the provisionally
   selected related task/to-learn marker family.
8. Regional/landmark gateway appearance, destination selection, first-visit requirements,
   and any emergency-return behavior.
9. The exact task responses, milestone changes, and region transformations, including
   truthful correction/reopening behavior; no additional reward system is planned.
10. How temporary world events affect movement without creating obligation.

### Art and content

11. The wider fantasy setting, history, cultures, and tone.
12. The garden home's detailed layout and the separate sanctuaries' identities.
13. The visual and interface identity of each additional functional place.
14. The degree of regional art-direction variation.
15. Detailed avatar identity and any later customization. The user selected **A1** for the
    humanoid increment: the fixed botanical traveler and a local articulated rig with
    procedural animation, using the existing engine. Its right-hand carry and automatic
    stow remain the notebook relationship defined in §4. The September 13 continuation
    cleared the raised Ultra gate for the reference-based local animation rewrite, while
    the body animation was subsequently rejected again. On September 14 the user selected
    a local procedural rebuild on the existing rig, closing the hand-off production gate. The user reaffirmed the
    Aether-based botanical model and full non-combat animation target in §4; detailed
    appearance translation needs visual review. External asset/clip acquisition,
    installation and spending retain their separate approval gates.

### Device and accessibility

16. Practical graphics/performance target and production suitability after the first
    Babylon.js browser demo; the first-demo delivery choice is settled in Section 17.
17. Breath of the Wild traversal with the Genshin movement-speed/fluidity direction and KS03-streak
    sprint duration; duration formula/recovery, slingshot launch and glide controls; keyboard/mouse
    and touchpad controls, camera, platforming assistance, and notebook text entry.
    Review the proposed panel/input state matrix in Section 25.5 before implementing forms.
18. Reduced-motion alternatives for environmental fluidity and interface unfolding.
19. Contrast and non-color signals across every weather and region.
20. Whether to pursue the real-weather connection or use the authorized random fantasy
    alternative if that connection is too complicated. Location/provider/privacy/feed
    fallback decisions apply only to the live branch; fantasy event tuning applies to the
    alternative. Section 14 records the user's conditional choice.

Phone and iPad support is deferred as described in Section 17.

## 22. Concept acceptance checks

These are acceptance checks for the full intended experience. An incremental synthetic demo
reports which checks it covers and which remain unfinished; it does not claim complete
concept delivery by passing only movement or screenshot checks.

The concept remains internally consistent only if future versions can answer yes to all of
the following:

- Can the first version be played comfortably with keyboard and mouse on the user's
  current computer?
- Can the user discover today's important information without traveling anywhere?
- Can the user open the notebook and edit personal notes from anywhere?
- Do opened panels provide complete applicable information without a required summary step?
- Does the game keep running behind every panel while text input and UI navigation avoid
  issuing gameplay commands, with no danger to the character?
- Does the Memory Grove's dedicated sky camera represent the current slot's full KS03
  multiverse, including mind maps without due reviews, without changing Track data?
- Can the user pan/zoom while grounded, read the star overlay in daylight and bad weather,
  and return to the normal camera without changing the grove's time or weather?
- Does selecting a star provide all applicable MM information, including current MG and
  its history, Kolb, SIR, +Lin, comments, connections, and source content?
- Is the projected KS03 arrangement recognizable, with each MM's color preserved and
  larger higher-level parent stars, independent of review status and MG rating?
- Do grove and star review cues identify the same due information without double-counting,
  changing base star colors/sizes, or requiring movement to discover a review?
- Can the user perform the applicable existing MM actions through that star, with clear
  intent, truthful cross-record effects, recoverable failures, and no writes from browsing?
- Do tasks and to-learn items remain distinguishable within their related marker family?
- Does progress receive the agreed world feedback without an extra reward system?
- Can the user distinguish a schedule item, day note, SIR review, warning, and deadline
  without relying only on color?
- After 20:00, are today's unfinished items still visible while tomorrow is previewed
  truthfully?
- After midnight, has no date changed automatically?
- Can an accidental movement or single stray click never complete a real task?
- Does completing a task feel acknowledged without permanently cluttering the world?
- Does completing a milestone or goal create a proportionately meaningful change?
- Does a completed goal region remain explorable?
- Can the user ignore the game for a difficult period without returning to lost progress or
  a damaged world?
- When weather changes, does the whole environment respond coherently rather than only the
  sky?
- If the fantasy alternative is used, can snow, heavenly skies, downpours and floods vary
  the experience without damage, obligations, hidden information or false calendar signals?
- Can every ornate information surface remain readable against every region and weather
  state?
- Do differently themed locations preserve familiar information behavior?
- Can the world grow for years without making daily navigation exhausting?
- Does the computer world reflect Track edits, including edits from other authorized
  devices, without hiding sync uncertainty?

## 23. Draft boundary

Sections 1–22 record the concept. The document does **not** establish approved commitments for:

- Production engine suitability beyond the selected Babylon.js browser demo.
- A production repository architecture.
- A network or synchronization implementation.
- A production database schema.
- An approved implementation backlog.
- A committed budget or delivery schedule.

Those implementation commitments remain open. Building the game **is** authorized — see
`AGENTS.md` — but that authorization settles none of the choices listed above, and does not
authorize spending, installing, or any change to Track. Section 24 records the feasibility
review, budget constraints, and suggested checks to inform the remaining concept decisions.
Section 25 adds researched recommendations and a proposed delivery workflow; it does not
turn its recommended engine, architecture, tools, or estimates into user decisions.

## 24. Feasibility review and next-session notes

**Recorded:** 2026-09-05. Review recommendations below remain proposals unless explicitly
identified as user decisions. Implementation is authorized in general; these particular
choices are not settled by that, and none of them authorizes spending.

### Settled direction and budget constraint

- **Computer first:** the user chose to build for their current computer and put phone and
  iPad use aside. Section 17 is the device contract; mobile controls, layouts, packaging,
  and feature parity must not become requirements for the initial version.
- **Limited budget, especially subscriptions:** no exact spending ceiling was specified.
  Identify a concrete need before recommending a paid service or asset. No purchase,
  subscription, hardware upgrade, or paid cloud plan was authorized.
- The proposed financial target is **US$0 in additional mandatory monthly subscriptions**,
  using existing hardware and free tools/services within their limits. This is a planning
  target, not a quote for a finished game or a promise that custom artwork is free. It
  excludes hired development, custom art/animation, new hardware, and existing paid tools.
- The inspected Ryzen 5 5500U computer with integrated Radeon graphics and approximately
  14 GiB of usable RAM looks suitable for an initial prototype. This is an assessment from
  its hardware specifications, not a performance benchmark. No need for a new computer
  has been established. A suggested 30 fps starting target remains untested and undecided.
- The selected stylized anime appearance, Clockgarden, Living Botanical interface,
  enjoyable third-person movement, coherent environment, and no-punishment principles
  remain the creative direction. The cost review did not replace them with a different
  product concept.
- Personal notebook notes and full MM interaction from the selected star are confirmed
  in-world write capabilities (Section 10, expanded 2026-09-06). Other Track editing remains
  deferred or excluded. Computer-only gameplay still needs safe handling of Track edits
  made from other tabs or devices.
- Separate worlds per slot, natural landscape paths, and regional/landmark gateways are
  now confirmed in Section 5. Detailed layout and gateway rules remain open. Babylon.js
  browser delivery was selected for the first demo on 2026-09-06; Godot remains an
  alternative if measured results justify revisiting that choice.
- **Memory Grove decision (2026-09-06):** SIR has a botanical home with a special look
  camera revealing the current slot's entire KS03 multiverse as stars. Related markers
  are the tentative task/to-learn direction, and no extra reward system is planned.
  Grounded stargazing, an always-readable overlay, and full MM information including MGs
  are also confirmed, together with full MM interaction. Detailed presentation, command
  handling, and recovery remain open in Sections 5–6, 10, and 21.
- **Star presentation:** the user selected projection of the existing KS03 arrangement,
  glowing MM colors, and larger higher-level parent stars. SIR cues are mirrored between
  grove and stars, with the restrained botanical/petal-ring treatment adopted under the
  user's delegated design judgment. Exact projection/size tuning still needs validation.

### Cost findings to recheck before spending

- [Godot](https://godotengine.org/license/) has no required engine subscription.
  [Firebase](https://firebase.google.com/pricing) offers no-cost Hosting and Firestore quotas,
  and [Open-Meteo](https://open-meteo.com/en/terms) offers noncommercial weather access within
  limits and with attribution. Whether a built project stays within those limits must be
  measured. Weather needs cached/manual fallback behaviour.
- **Firestore and Cloud Storage are different products.**
  [Cloud Storage requires a billing-enabled Blaze plan](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024).
  This is usage-based billing, and
  [budget alerts do not cap charges](https://firebase.google.com/docs/hosting/usage-quotas-pricing).
  Do not assume a storage or hosting choice requires a paid subscription without checking
  the specific service and actual need.
- Native Apple mobile distribution was discussed at
  [US$99 per membership year](https://developer.apple.com/programs/enroll/), with
  [Mac/Xcode access also needed for Godot iOS builds](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_ios.html).
  It is outside the current computer scope.
- These service findings were checked during this conversation. Recheck prices and terms
  if a later implementation depends on them. No runtime AI service or multiplayer server
  has been identified as essential to the described private world.

### Important unresolved risks

1. **Notebook and MM conflicts.** Current notes writes replace the notes array, while cloud sync
   uploads the whole database. Existing conflict handling is not automatic text merging.
   Two competing note edits need a recovery path preserving both versions and distinct
   local-save, pending-sync, synced, and conflict states. Full MM interaction adds commands
   that affect several records/arrays together, so a safe note writer alone is insufficient.
   See `scripts/notes-widget.js`,
   `scripts/firebase-sync.js`, and [NOTES Proposal 4](../NOTES.md#proposal-4-add-revision-and-conflict-handling).
2. **World-state ownership.** Define compact game-only saves separately from canonical
   Track data. Do not place models, textures, or continuous movement/weather writes into
   Track's whole-database save path. Browser storage belongs to an origin; a separately
   hosted or native game needs an explicit integration rather than assumed access.
3. **Calendar truthfulness.** Preserve Section 7.5's category distinction:
   informational calendar notes and reference timetables are not automatically overdue
   tasks. An untimed note's default 08:00 block is not an authored note time. Supporting
   actions and scheduled MM sessions also need explicit occurrence/reminder treatment;
   their fallback block times are not authored reminder times. Deadline prep
   and due moments can occupy different days; caution days are individually chosen and may
   have gaps. Routine and SIR occurrence/completion rules differ. Reuse
   `scripts/calendar-core.js` rules and distinguish unique items from their multiple visual
   representations when counting or notifying. Also resolve whether tomorrow's SIR/tasks
   alone should trigger the 20:00 preview; the present wording names only notes, warnings,
   and deadlines.
4. **Stable geography and content production.** Arbitrary goal trees do not supply
   attractive terrain or enjoyable platforming. Nesting does not necessarily imply a work
   dependency or completion order. Reusable region/route modules and separately loaded
   landscape sections remain suggested budget options; they must support the confirmed
   natural-path geography and regional/landmark gateways. Places need
   stable slot/record identities, and remote edits must not move terrain beneath a player.
5. **Truthful history.** Ordinary completion toggles do not record a complete event history.
   Reopening, correcting, archiving, or deleting goals needs a rule reconciling current
   truth with persistent landmarks. Never invent a past completion date or deleted history.
6. **Weather, movement, and art effort.** Coordinated visual effects may satisfy the
   whole-world response requirement affordably; physical runoff, cloth, and plant
   simulation should not be assumed necessary. Climbing, vaulting, swimming, camera
   behaviour, and book stowing each add animation/interaction work. The concept image is
   not a usable 3D asset set or evidence of real-time performance.
7. **Reminder intensity and input focus.** Many simultaneous gentle signals can still
   become stressful. Quiet/rest controls, grouping, and a catch-up summary are suggested.
   Background/locked-screen alerts are outside the current "during play" promise. The user
   settled unpaused panels and no character danger on 2026-09-08. Test input focus and
   continued simulation during a jump, climb, glide or swim; a panel must not require a
   protective landing first or turn typed keys into movement.
8. **Other unresolved meanings.** Decide which Track calculation defines goal/milestone
   completion, which explicit relationships permit regional echoes, whether local time
   follows the device or a chosen home timezone, and what "private" promises. Live Firebase
   permissions and multi-device behaviour were not verified in this review.

### Suggested starting point when work resumes

The original recommendation was one small synthetic scene testing camera/movement,
coherent weather, Today and notebook interaction. Babylon.js browser delivery is now chosen
and that first increment exists. Resume with the recorded demo feedback and the revised
[near-term sequence](#next-work-sequence), rather than repeating engine selection or treating
the initial demo as a passed feasibility gate. Measure sustained performance before
committing to a larger world or purchases.
Safe competing-edit recovery needs separate proof before enabling real notebook or MM
writes, including the complete write set of each MM action.

At the initial feasibility review, no game implementation, device benchmark, live-cloud
test, installation or deployment had been performed. That review was concept/source review,
hardware inspection, pricing research and documentation. The subsequent first demo is
documented in [README](README.md); unchosen review recommendations remain proposals.

## 25. Proposed workflow and tool plan

Moved to [PLAN.md](PLAN.md) on 2026-09-12: the tool research, data and interface workflows,
delivery phases P0-P10, verification gates and remaining suggestions. It had grown larger
than the concept it was appended to, so a concept question carried the whole delivery plan
with it. **The `25.N` numbering is kept**, so every existing reference to "Section 25.6" or
"Section 25.13" still resolves by name. They remain **proposals**, not decisions.

## 26. Current baseline and next work sequence

<a id="next-work-sequence"></a>

**Planning review (updated 2026-09-13):** build on the existing synthetic demo. The original
documentation pass and first scene exist; the scene has not passed the full movement,
information, atmosphere or sustained-hardware gates. The following baseline comes from
the current local source, recorded user feedback and isolated browser behavior checks;
it is not an actual-laptop playtest or graphics benchmark.

| Area | Existing evidence / discrepancy | What the next proof must establish |
| --- | --- | --- |
| Controls | Camera drag is accepted and touchpad suppression is off. The September 13 user-directed dash/hold-to-lock/short-dash-unsprint replaces the earlier tap toggle; its code review corrected pending-hold exhaustion | Preserve the current Shift contract, speeds, camera drag, Space priority and glide clearance while correcting animation; retain physical review and hardware proof |
| Panel switching | The toolbar and Today bud remain available while a companion panel is open; Tab includes both panel and toolbar; the user accepted test 3 | Retain this accepted behavior; future nested confirmation dialogs must still own focus |
| Track information | Today uses canonical calendar reads; the notebook follows Track's list/Add/automatic editing/Back/Delete flow in synthetic memory; MM information includes identity, connections, MG/Kolb/SIR/+Lin records, comments, links and direct source content | Complete real notebook commands/recovery, source inheritance/aggregation/order/tags and full MM actions through their separate command boundary; preserve Track's functional interface throughout |
| Unpaused panels | Panels suppress gameplay input while inertia, gravity, collision and environment continue; browser checks cover mid-jump reading, holding a climbing grip, gliding onto an island while editing notes, and cancellation of a held launch | Extend this contract to swimming and additional nested dialogs; no protective pause |
| Traversal | Controller fluidity is accepted; the September 14 local procedural rebuild is selected and playable for visual review. Walk 5.2, run 12 and dash 16.2 remain fixed | Judge the four motion sets, compact reach and reference timing against the inspected ground/climb clips. Player glide/notebook references, complete grip geometry, speed/scale parity, stamina policy concerns and hardware proof remain open |
| Evening and midnight | Default local clock, optional fixed test times, full dated Today buckets and Previous/Today/Next history; preview uses the after-20:00 note/caution/deadline trigger, with pure boundary tests | Extend browser suspend/resume and midnight coverage and add a category-specific unfinished-work rollup; no record rescheduling |
| Memory Grove | The user accepted the fixed upward camera animation and Babylon celestial meshes in the live sky; projected labels support inspection, matched review petals, displayed-sky rotation/FOV zoom, search and animated return; movement stays locked throughout | Preserve the accepted experience while proving dense/long/empty rendered networks and completing selected-MM fidelity/actions; the small fixture does not close the full sky gate |
| Quest and geographic map | Top-left minimap and starred HUD; full-screen canonical Quest list/details; scene-derived map; session pins with edit/cancel/removal; mapped Quest/landmark/pin navigation with bearing and distance | Prove reference coverage, dense/empty states, pin recovery and the separate real read adapter; add region/layer/gateway travel only with corresponding geography and rules |
| Atmosphere | Clear/rain/snow/intense-rain/heavenly controls share precipitation, light, fog, wetness and snow cover; reduced motion stops particles; daylight/night is still an independent visual control | Prove sustained laptop rendering, add automatic occurrences and settle audio/flood behavior; a live connection retains separate provider/privacy decisions |
| Data and performance | Isolated fixtures, memory-only drafts and behavior checks exist | Preserve isolation and report reset-on-reload; neither safe real edits nor sustained target-laptop performance has been proved |

Source anchors: [demo panels and clock](scripts/app.js), [movement and scene](scripts/scene.js),
[server read allow-list](tools/serve.js), [Track Quest readers](../scripts/quest-core.js),
and [current verification limits](README.md#verification). This review does not refresh
the historical external tool, pricing or service findings in Sections 24–25.4.

**Revised three-step sequence — current implementation ordering, later gates remain open:**

**Resumed demo increment (updated 2026-09-13):** following the request to continue, the demo
now includes direct unpaused panel switching, corrected upright camera orbit, Quest and its starred
popup, expanded MM records and a grounded synthetic KS03 sky, plus launch/glide traversal,
two islands, coherent fantasy weather controls and a local clock with dated Today history.
The earlier A1 body was rejected in physical review. The September 14 local procedural
selection closes the reopened production gate; judge the rebuilt body while preserving
the current movement speeds.
After visual acceptance, continue the hardware/reference proofs and
remaining information/action inventory. The
[movement comparison](MOVEMENT-DEMO-COMPARISON.md) keeps unmeasured parity explicit.
This sequence does not mark P1–P3 complete; current
behavior and verification limits live in [README](README.md).

| Step | Work | Status / evidence needed |
| --- | --- | --- |
| **1 — Preserve accepted interactions and complete remaining information evidence** | Retain the current dash/hold sprint, camera drag, panels and sky; complete the Today/notebook/MM content inventory | Input acceptance and September 13 user-directed sprint revisions are separate from body-animation acceptance; remaining information fidelity needs its own evidence |
| **2 — Prove the defining experience in the small scene** | Complete information and KS03 sky proofs; build the confirmed Genshin-style Quest/map interfaces with pins and navigation. Then test the selected movement/launch/glide behavior and coherent atmosphere as focused increments | Each feature has its own user playtest and stated missing coverage; repeat the same route and complete P1–P3 evidence, including sustained laptop measurements. No requirement to finish a large art package first |
| **3 — Expand and connect through separate gates** | Grow one goal region and stable travel/history behavior; prove an asset loop when its production approach is chosen; separately prepare safe real reads and then confirmed note/MM writes | P4 proves geography; P6 proves read isolation/identity; P5 + P6 gate P7 writes. P8 completes the full requirement inventory and P9 governs private release. A synthetic increment remains useful while integration is unfinished |

**Proposed representative playthrough:** enter the current slot's world → check Today
without travel → move while looking around → open the notebook and retain a draft across
panel switches → reach the Grove → inspect the sky and an MM's information → close back to
the same safe world context. Follow the gateway path to the launcher, glide to Cloudrest
and Windward Isle, then return to the garden. Run the same sequence in daylight and rain.
This connects the feature proofs into
one ordinary use session without turning the sequence into mandatory daily work.

Use R9 for schedule meanings and R4/R6 for sky detail and interface behavior. These should
resolve a specific unanswered layout or behavior question; decorative variants and extra
biomes are not prerequisites. Further installations and production art choices retain
their existing approval gates.

**Clarification status (updated 2026-09-09):** full information, unpaused panels and corrected
Genshin-style upright camera rotation are confirmed, as are Genshin-positioned Quest/map UI, full-screen menus and pins/
locators. The fantasy-weather alternative is authorized conditionally below. The user
directed continued work; remaining movement-mechanics choices have not been silently settled.

| Choice | Decision or remaining alternatives | Work affected |
| --- | --- | --- |
| Next-demo emphasis | **Current sequence:** the user directed demo completion; island flight, fantasy controls and dated Today history are integrated with the existing panels/sky/map | Complete remaining action fidelity and measured hardware/reference proofs; ordering does not remove confirmed requirements |
| Movement reference scope | **Confirmed:** Genshin movement speed and fluidity, with longer KS03 streaks increasing sprint duration. **Open:** duration formula/recovery and remaining traversal restrictions | Keep the earlier traversal requirements outside the speed/feel refinement; no character danger is confirmed, and exact speed parity still requires measurement; fluidity needs the user's playtest |
| Quest and maps | **Confirmed, synthetic demo implemented:** Genshin HUD positions, full-screen Quest/world-map menus and pins/locators; detailed scope in Section 16 | Preserve canonical Quest meanings, unpaused menus and separate game-only pin/navigation state while proving reference coverage and later geography |
| Track panel fidelity | **Confirmed:** full applicable information in the opened panel; no required summary step | Complete content with sections/tabs/scrolling as needed; no exact pixel-layout requirement was added |
| Reading during traversal | **Confirmed:** the game does not pause, and the character is not in danger | Panel input ownership remains necessary; simulation, weather and time continue; no protective relocation on open |
| Weather source | **Conditional alternative authorized:** completely random fantasy occurrences if the real-weather connection is too complicated; snow, heavenly weather, heavy rain and floods are expressly invited | Do not require location/provider choices for the fantasy branch; record the implementation branch honestly and retain coherent, non-dangerous effects |

**Later decisions, when their work begins:** compare and refine the provisional charged
slingshot controller; choose avatar appearance and asset production before final art; settle gateway
unlock/return rules and goal retention before stable geography; settle slot/draft switching
and privacy before real integration. These remain necessary decisions, but they need not
be answered together to repair the current demo.

**Existing proof constraints and later commitments:**

- **Engine/delivery — decided 2026-09-06:** Babylon.js browser demo, with Codex implementing
  and the user directing/playtesting. Native Godot is a fallback requiring new direction.
- **Proof size/performance:** recommended one small traversable Clockgarden-adjacent scene,
  synthetic data, draft-only notebook, coherent weather and provisional 720p/30 fps target;
  alternatively a stricter 60 fps movement-first proof before richer effects.
- **Art-production approach:** recommended Blender-authored modular kit with licensed
  placeholders; alternatively a carefully selected existing stylized kit with adaptation.
  Do not buy or produce many assets before one rig and one environmental module work.

**World direction now confirmed:** separate worlds per slot, natural landscape paths, and
regional/landmark gateways (Section 5).

**Original first-increment brief (2026-09-06; retained as the baseline):** the user
approved starting the demo. The first increment is one small traversable scene
beside Clockgarden, using Babylon.js in the browser with WebGL 2 and live HTML/CSS panels.
Keep the initial scope concrete; further installations retain their separate approval gate:

- **Movement:** a placeholder avatar, walk/run/jump, third-person camera, simple collision,
  and a return-to-start control on one repeatable route.
- **Atmosphere:** one gradual clear-to-rain transition coordinating light, wind, rain and
  surface wetness through shared state. Use simple geometry to test the behavior; these
  placeholders do not settle the production asset approach.
- **Information:** a readable Today panel with synthetic timed/untimed notes, a deadline
  with gapped caution days, a completed deadline, review examples and a reference schedule.
  Reuse Track's applicable read definitions without importing a live database or its
  bootstrap/sync scripts. Show notebook and selected-MM controls as clearly labelled
  synthetic drafts; they do not complete the later command-safety or full-MM phases.
- **Isolation:** keep implementation and fixtures under `World/`, use an isolated browser
  context, and never read or write the user's real `track_db`. Draft controls remain in
  demo memory for this first increment, with their reset-on-reload limitation visible.
- **Approved demo tooling:** Babylon.js 9.25.0 browser bundle, license/notice and integrity
  receipt, retrieved with explicit dependency approval on 2026-09-06; plain JavaScript,
  HTML/CSS and existing local serving/testing tools. Later dependency changes require
  their own exact source/version/file-effects approval. No package manager, Blender
  installation or asset pack was added; the Blender-to-GLB loop remains a later P3 check.
- **Evidence:** run the scene, verify controls and panel focus, exercise the synthetic
  states and weather transition, and report errors and limitations. Assess the provisional
  720p/30 fps target on the actual laptop through the Section 25.13 procedure; a short run
  or headless test does not satisfy the sustained graphical-performance gate.

This historical brief defines the implemented starting scope; the revised sequence above
addresses its gaps and subsequent user feedback. It does not mark P1–P3 complete or replace
their remaining exit checks. The user's Overcapability rule is recorded in
[`World/AGENTS.md`](AGENTS.md#overcapability-rule).

**Experience direction now recorded (2026-09-06):** Memory Grove with grounded stargazing,
an always-readable KS03 star overlay, and full information and interaction for a selected MM
including MGs; related task/to-learn markers as the tentative visual choice; no extra reward
system (Sections 5–6, 10–11). MM editing is confirmed; its forms, commands, and recovery need design.
The star view projects KS03's existing arrangement with MM-color glow and larger higher-level
parents. SIR signals appear in both grove and stars using the adopted botanical/petal-ring
treatment.

**Decide as the relevant phase approaches:** explicit world-switch behavior; detailed
landmass layout, gateway routing/unlocks and emergency return; precise region completion
calculation; archived/deleted history; MM action forms and recovery, grounded camera tuning,
full MM detail organization, projection/hierarchy-size tuning and dense-network readability; exact
task/to-learn symbols; acceptable movement assistance and passive traversal while panels own input;
fixed-avatar appearance; garden-home layout and separate sanctuary identities; regional palette range; optional calm
activities; reminder grouping and gentle-sound design; tomorrow's SIR/task trigger; home/device timezone;
fantasy event tuning or location disclosure if the live-weather branch is pursued; and
private delivery versus private data. Personal notes and full MM interaction are the
confirmed writes; additional domains require a new deliberate
product decision.

## 27. Picture and reference package

<a id="picture-reference-package"></a>

**Useful picture/reference package — placement plan; new references not yet produced:**

This reconciles the original eight-reference package with the existing Plaza and Grove
images and adds one missing semantic schematic, R9. Named slots are the placement authority;
they remain valid when line numbers change. R6 has three placements within one coordinated
interface package. Do not add image links until the referenced asset exists.

| Reference / priority | Exact placement and current coverage | What it should resolve / appropriate medium |
| --- | --- | --- |
| **R1 — Selected style sheet / high** | [End of §15, after regional consistency](#ref-style-sheet). Reuse the existing Plaza and Grove images; annotated sheet still needed | Annotated crops for silhouettes, cel bands, stone/metal/foliage palette, surface-detail density and ornament limits. Preserve the cover; no additional hero illustration is needed |
| **R2 — Environment states / high** | [End of §14, after gradual transitions](#ref-environment-states). Comparison still needed | Identical camera/objects/panel position across clear, rainy, wet-evening and night states. Annotate coordinated wind, shadows, wetness/drying, water and stable reading surfaces; include reduced-motion treatment. Visual targets first, actual engine captures and a transition clip during P3 |
| **R3 — Connected landscape and routes / high** | [End of §5.6, before Memory Grove](#ref-landscape-routes). Blockout still needed | Top-down plan plus matching third-person viewpoints locating the garden home, separate sanctuaries, Clockgarden, Grove, one active and one retained region, natural paths and gateways. Show scale, camera clearance and growth space; distinguish proposed loading boundaries from physical paths. Label unchosen layout/gateway assumptions as proposals |
| **R4 — Memory Grove and full MM interaction / highest** | Existing ground/daylight-sky image stays in §5.7. Add the missing material [at the end of §5.7](#ref-memory-grove-detail) | Selected-MM wireframes with type-appropriate MG/Kolb/+Lin/SIR/source views, ownership and named actions; empty/create and post-deletion states. Add a deterministic synthetic KS03-to-sky comparison with manual positions, dense labels/navigation, shared parents/cycles and weather readability. Preserve the existing botanical/petal-ring direction; do not regenerate the grove merely to repeat it |
| **R5 — Avatar and notebook / medium** | [§4, after carry/stow behavior](#ref-avatar-notebook). Pose/rig sheet still needed | Front/side/back proportions and right-hand carry, stowed, climbing/vaulting/swimming and return poses. Annotate attachment points and transition obligations. Use the selected A1 traveler for this increment; detailed identity/turnaround and unimplemented traversal still need their own direction |
| **R6 — Interface, markers and recovery / highest** | [R6a: end of §6 marker choice](#ref-marker-legend); [R6b: §16 after normal/expanded states](#ref-interface-states); [R6c: §25.8 after conflict alternatives](PLAN.md#ref-save-recovery). All three sheets still needed | R6a: task/to-learn and due/caution/SIR shape legend in two regional materials. R6b: closed bud, dense Today, notebook and item detail with long synthetic Thai/English text, empty states, scrolling, focus and narrow/wide windows. R6c: note AND MM save/conflict/failure/export storyboard, separate local/cloud status and slot switching with drafts. Use real-text wireframes, then rendered UI captures |
| **R7 — Active/completed/reopened region / high** | [End of §11, after progress-feedback constraints](#ref-progress-history). Comparison still needed | Extend the original pair to three identical-camera states: active → completed → corrected/reopened. Distinguish retained architecture/history from current completion labels/effects. Annotated concept treatment remains a proposal until chosen; validate later in-engine |
| **R8 — Traversal motion / high before detailed terrain** | [§25.9, after advanced-movement scope](PLAN.md#ref-traversal-motion). Clips/keyframes still needed | Attributed short clips plus keyframes for acceleration/braking, jump arc, camera distance/obstruction, landing and notebook entry/stow. Describe desired motion precisely. Existing inspiration can inform Step 2; later prototype footage repeats one route and records what was actually measured |
| **R9 — Clock Plaza semantic schematic / highest; added** | [End of §7.1, after the physical-geometry proposal](#ref-clock-plaza-semantics). Schematic still needed | Annotated ring + multi-day strip + matching Today rows using the same synthetic identities. Include overlaps, untimed note and default 08:00 block, gapped caution days, preparation on another allowed day, distinct due moment and completed-warning suppression. Multiple representations count as one item. Use a precise schematic, not generated concept art |

Use a few annotated references with a clear purpose. Record their source/permission and
whether they are inspiration, a selected target or an actual licensed asset. Generated
variants should preserve the existing simplified anime direction and should be judged in
the prototype, not treated as proof of deliverable game quality.

For each future image, use the existing Markdown-image followed by reference-blockquote
convention: state source/date, synthetic-data status, purpose, whether the treatment is a
proposal or selected direction, and that concept art is not a production asset or exact
screen specification. Retain generation prompts/reference notes alongside generated images.
Engine captures instead identify the actual build/settings and measured scope; still images
alone cannot prove movement quality, coherent transitions or frame rate. The ownership
diagram already in §25.6 is sufficient; no duplicate generic architecture picture is planned.

**Initial planning verification (2026-09-05):** that pass performed concept/code inspection, tool and
skill-source research, reference-image inspection, a local UX-guidance search, and the
pinned `frontend-design` skill installation. It did not build or benchmark a game, run a
live-cloud test, install development dependencies, change Track runtime/data, or deploy.

**Step 1 review (2026-09-06):** the follow-up inspected the full concept, existing references,
relevant Track calendar/graph code, installed skill content/hash and upstream tool/skill
sources. This draft records the resulting clarifications, capability assessments, reference
placements and proposed Steps 2–3. No new image, installation, runtime implementation,
benchmark, live-cloud test or deployment was performed in this documentation update.
