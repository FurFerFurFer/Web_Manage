# Track World — unfinished work

## Start here

- **Phase:** P1-P3 in progress, Step 2: prove the defining experience in the small scene.
  P4 onward is untouched; real Track reads/writes remain separately gated.
- **Next increment: scope the sky interface, star atmosphere and a larger MM playtest.**
  Reclaim sky space from the interface, establish a universe-of-stars feeling, and provide
  enough MMs to judge the experience. Present concrete options before implementation;
  interface visibility, visual treatment, synthetic fixture size and topology remain open.
  Preserve **40° curve / 1× centre drag / 20°/second arrows**; the user's motion verdict is
  recorded in [draft §5.7](TRACK-WORLD-CONCEPT-DRAFT.md#57-memory-grove-and-the-ks03-sky).
  Do not queue another unchanged three-star motion-acceptance playtest.
- **Sky follow-ups await direction:** larger-fixture implementation, dense-network and
  cycle/disconnected-group fixes, appearance changes and the real-data read/export scope.
  The need for many MMs does not open the real-data gate; keep storage isolation intact.
- **Body-animation work stopped; no next increment or fix planned.** Foot-ground
  push-off/body momentum in walking and running (playtest 1) remains **rejected**.
  Playtests 2–5 are **okay but not that good**, not strong visual acceptance. The user's exact
  verdict and instruction are recorded in [draft §4](TRACK-WORLD-CONCEPT-DRAFT.md#4-player-perspective-and-movement).
  Do not resume tuning, investigate another remedy, schedule another review or propose
  a production replacement unless the user explicitly reopens the work. The motion
  backlog and unresolved timing questions below are inactive, not a queued fix plan.
  The existing local procedural production selection remains closed.
- **Do NOT do:** lower 5.2/12/16.2, retune 1.70/1.88/2.05/2.20 Hz, rename the four set
  keys, add a slow-walk control or a heavy landing/roll, or return to small adjustments
  of one shared gait. Preserve the distinct sets and the coordinated support/push trajectory.
- **Gates:** purchases, downloads, installs, dependencies, external services and any
  different production approach require an explicit answer. If the local result has an
  evidenced remaining gap, name what is visible and distinguish evidence from a guess;
  a later alternative must not block shipping the local result.
- **Preserve:** walk **5.2**, run **12**, dash **16.2**, current dash/hold/unsprint and stamina
  tuning, camera drag, Space priority and glide clearance. Preserve full-cycle rates
  **1.70 / 1.88 / 2.05 / 2.20 Hz**. Do not lower speeds for the gait. Include all four sets
  in posture, cadence/contact/continuity tests.
- **References:** Genshin `08-42-45.webm` and `16-57-19.webm` cover ground movement;
  `17-52-28.webm` shows climbing on a **different character**. `09-05-56.webm` and
  `20-00-22.webm` are demo recordings. The September 15 `21-31-32.webm` is Genshin's
  default keyboard `W` locomotion — the user called it walking, and ruling 2 settles that
  this is the game's base tier and a jog-class gait, so its airborne intervals are correct.
  The user supplied three more on 2026-09-19: `09-46-46.webm` (Aether side-on run and stop)
  and `09-50-07.webm` (climbing from behind) are **accepted**; `09-51-20.webm` is a winged
  combat hover, **REJECTED as a glide reference** and not to be used — see the comparison.
  `11-09-09.webm` is accepted for **10.5-13.2 s only** and closes **gliding** (side-on glide
  at ~12.0 s, plus a glide-to-landing from behind); the rest of it is combat, captions and a
  cutscene. `11-13-41.webm` (**0-16.5 s**) and `11-14-14.webm` (**0-15 s and 20.8-29 s**) are
  the strongest material supplied, both 453x380: side-on running, climbing, a rapid climb,
  **two side-on climb-to-ledge VAULTS** — the proof this file has wanted since climbing
  began — a 15-second glide, and **eight seconds of sustained glider-less FREE FALL**. Free
  fall is a **held pose plus sway, not a cycle**; build it as one pose. **Only a ground
  LANDING is still unfootaged** (light, heavy, into a run), so ruling 4 now blocks that alone.
  Three more followed: `11-36-25.webm` (**0.6-4.5 s**) supplies the **LIGHT landing** — glider
  dismissed, shallow crouch, running again in ~0.4 s — and `11-44-03.webm` (**~4.5-6.5 s**) a
  **ledge takeoff**; both then fall into water, and `11-43-26.webm` is combat with captions
  over the character. **Reference gathering is now FINISHED.** The user descoped the heavy
  landing and its roll — in Genshin the recovery is gated on **arrival momentum**, below a
  threshold it lands and continues, above it it rolls, and the user ruled that out of scope
  for this demo. The **light landing** is the landing this demo implements. Do not build a
  roll, gather footage for one, or report its absence as a gap.
- **Ruling 4 is CLOSED and blocks nothing.** Climbing, the **climb-to-ledge vault**, the
  rapid climb, gliding, **free fall**, the ledge takeoff and the **light landing** are all
  referenced and may now be built. The ban on **inventing** unreferenced motion stands; it
  simply has nothing left to block here. **"Core movements" means:** the four locomotion
  tiers and their transitions, starts, stops, turns, idle, jump, free fall, glide, light
  landing, climbing, rapid climb and the vault — with the notebook carry/stow throughout.
  Anything outside that list needs new direction.
  `11-28-38.webm` (**0-19.4 s**) is user-reported **1x real time**. Detailed September 19
  reinspection shows airborne jump/landing sequences and settling; the comparison records
  why it has not established a repeated running cadence. Resolve that calibration issue
  before using it to classify the other clips. On clip speed the user's precise
  position is: **`11-13-41` and `11-09-09` are SPED UP by an unknown factor and are pose-only
  permanently**; every other clip is **either 1x or 0.25x** (YouTube quarter-speed playback),
  so its real timing is recoverable once the factor is known. **The factor is empirically
  detectable** — measure a cadence and compare against `11-28-38`: same rate means 1x, a
  quarter means 0.25x, and a factor of four cannot be mistaken for variation. Classify before
  using, and record the verdict in the comparison. **Any measurement is information, NOT an
  override** — the user accepted the rhythm on 2026-09-15 and that still wins; if a measured
  cadence disagrees with 1.70/1.88/2.05/2.20 Hz, **report it and ask**, never retune.
  **Classify `08-42-45.webm` first** before using it as a real-time cadence baseline.
  The comparison records the measured recurrence and the unresolved baseline problem.
  Quarter-speed conversion divides recorded duration by four, so it multiplies cadence
  by four; do not repeat the earlier inverted conversion. Measurement remains information,
  never permission to retune.
- **After visual acceptance:** perform the physical laptop proof in **PLAN §25.13**, then
  continue the information/action inventory and dense sky/Quest/map proofs.

**Reading order:** [AGENTS.md](AGENTS.md) → this block → draft **§5.7** → README's MM-sky
paragraph → `sky-core.js`, `sky-motion.js`, `sky-scene.js`, `sky-view.js`,
`storage-isolation.js` and the sky tests. Draft §4 and the movement comparison apply only
if the user explicitly reopens the stopped body-animation work.
Read concept and PLAN by slice only; PLAN §25.13 is needed only for hardware proof.
Do not read `vendor/`, the root verification log, or spawn subagents for this increment.

## User-directed demo revisions

- **Aether/Genshin visual target:** preserve the user's exact direction below, reaffirmed
  after the hand-off with explicit requirements for jogging, running momentum, climbing
  and falling. Obtain the uninspected image/reference evidence before building details. See [draft §4](TRACK-WORLD-CONCEPT-DRAFT.md#4-player-perspective-and-movement).

  > https://pbs.twimg.com/media/FMlEsjEXIAI_HYm.jpg
  > just copy all movements of "Genshin impact" instead. the walk sprint stop landing and
  > climbing, additionally copy the character design of "Aether" but twist him to fit the
  > theme (ofc replace the sword with my book)

- **Stamina review concerns:** decide whether a full dash may spend less than its nominal
  cost of 1 when only a fractional balance remains. Also settle whether pushing into a
  collision should spend locked-run stamina: the current scene tests commanded velocity,
  not net ground travel. Do not silently retune either behavior or the numeric budget.
  Keep the zero-streak exhaustion regression and the current dash/hold/unsprint contracts.
  Extending stamina to climbing, gliding or swimming needs separate direction.
- **Rigid-body visual limits still need user review.** Inspect joint/clothing seams and
  the foot-to-body relationship without claiming that more angle tuning or a paid model
  must solve them. The selected local approach remains authoritative. The base tier's
  airborne intervals are accepted; do not impose a no-flight gait or a new slow-walk control.
- Compare the charged launch and two-island glide route with the user's slingshot
  reference on the physical laptop. Tune trajectories, controls and landing feel; design
  additional geography only after the sustained performance route passes.
- Complete Track information fidelity: real notebook commands/recovery, inherited and
  aggregated source views with saved order and storage tags, MG focus mapping, all applicable
  MM action forms and dense Today records with direct record navigation. Keep full information in opened panels;
  review the actual Track surfaces before extending the read inventory.
- Audit every Track-backed feature against its existing web interface as it is extended.
  Preserve the same actions, navigation and editing behavior; complete the live
  connection through the Track-owned read/write boundary without introducing a separate
  game workflow.
- Style the accepted notes interface to fit the world's botanical theme in a later visual
  pass, preserving Track's list/Add/automatic editing/Back/Delete behavior.
- Extend climbing proofs to irregular surfaces, corners, curved trunks, ledge clearance
  and dense collision geometry. Preserve Space's wall-first attachment/detachment and the
  small outward push; full reference climbing and vault animation still need their proofs.
- Extend unpaused reading and input-focus checks to swimming when it arrives; opening a
  panel needs no protective landing or relocation.
- Extend MM-sky proofs to dense networks, long labels, browser zoom, disconnected graphs
  and cycles in the rendered view. Tune label placement, hierarchy sizing and Grove camera
  framing against the chosen reference; preserve Track star positions and grounded entry.
  Preserve the accepted upward camera animation and scene-rendered constellation while
  extending coverage to those larger networks.
- Preserve the accepted simultaneous movement, tap/double-tap camera drag and upright
  rotation while tuning the humanoid animations; investigate only new input regressions.
- Extend the fantasy weather controls with an automatic occurrence schedule, optional
  floods and environmental audio after their behavior is settled. Review snow, intense
  rain and heavenly skies across the full laptop route. A real-weather connection still
  needs location/provider/privacy/feed-fallback decisions and its separate connection gate.
- After foot-ground acceptance, review the humanoid on the wider physical route: stride/foot sliding,
  start/stop and turn transitions, jump/land compression, wall/canopy grip alignment and
  notebook transfer/clipping. Reference footage for climbing, the **climb-to-ledge vault**,
  gliding and free fall now exists — see the comparison for the exact usable windows.
  Tune from the user's observations; controller checks do not
  count as movement-feel acceptance. Terrain-adaptive foot/hand placement, detailed fingers
  and smooth skinning stay out of scope for the selected rigid rig. A replacement approach
  needs a new user decision; no paid candidate is currently selected or required.
- Create a garden home separate from the sanctuaries; their detailed designs remain open.
- Use visual reminders with gentle sounds; settle sound design and grouping.
- Audit remaining desktop map/Quest reference differences before claiming parity,
  including exact icon inventory, pin limits, menu arrangement, region/layer selection,
  and gateway travel as the geography supports them. The linked HoYoLAB reference pages
  return a loading shell to text retrieval; obtain inspectable reference evidence for
  that comparison. Review the current map and Quest layout on the physical laptop.
- Prove dense/coincident map markers, long labels, empty/dense Quest trees, browser zoom,
  map keyboard focus across every navigation path, and a full-screen menu opened in
  mid-jump. Add remaining selected-goal details as the synthetic inventory grows.
- Add persistent game pin/draft recovery only through its separate game-state gate;
  connect real Quest destinations only through the read adapter. Extend the one-region,
  one-layer map when additional geography and gateway travel rules are established,
  including explicit layer selection for stacked walkable surfaces. Extend destination
  marker readability checks as new weather and terrain are introduced.
- Review empty/dense quest trees, long titles and map-marker crowding. Real quests require
  the [PLAN.md](PLAN.md) Section 25.6 read adapter; retain read-only Track behavior and no reward layer.

## Review the first scene before expansion

- Playtest movement, camera speed/distance, jumping, steps and the bridge
  on the actual laptop. Report uncomfortable motion, snagging or camera obstruction.
- Complete the [PLAN.md](PLAN.md) Section 25.13 hardware procedure: power mode, driver/browser version,
  viewport/internal resolution and fixture size; repeated warmed clear/rain/night routes,
  cold/warm loading and a sustained 20-minute session. Assess 30 fps at 720p and p95 near
  or below 40 ms. Headless SwiftShader readings do not satisfy this gate.
- Profile CPU/GPU cost and memory stability before increasing scene size or effects.
- Verify camera occlusion, side-on collision, step/slope limits, run speed and fall recovery
  over the full route; the initial browser case covers a short walk and jump only.
- Review the simple shapes and panel hierarchy with the user before production assets.

## Complete the initial proof gates

- P1: complete the sustained route and controls review, including irregular terrain.
- P2: extend synthetic fixtures to the full [PLAN.md](PLAN.md) Section 25.13 matrix: malformed/legacy slots,
  moved/split blocks, routine occurrences, goal identity, dense/empty data, full action
  drafts, long content, browser zoom, IME composition and focus across all interaction
  paths. Add explicit context-loss and repeated load/unload tests.
- P2: extend the dated-history navigation with a category-specific unfinished-work rollup;
  add browser-level midnight and suspend/resume cases alongside the pure clock checks.
  Retain synthetic-only testing until real integration is separately authorized.
- P3: validate the runtime cel shader, coherent environment over the whole scene, audio
  layers, and one approved Blender-to-GLB asset loop. The independent night light study
  does not implement the final shared clock/environment contract.
- Extend unpaused panel behavior, input focus and passive movement to swimming and more
  complex climbing surfaces. Review whether the
  current lack of pointer lock feels right. Keep advanced movement and notebook animation
  for their own proofs.

## Later confirmed requirements

- Complete full selected-MM information and all applicable MG/Kolb/SIR/+Lin/source actions,
  including large-network sky navigation and the separate command/recovery proofs.
- Stable slot worlds, natural routes, regional/landmark gateways, goal geography and
  truthful completed/reopened history through P4/P8.
- Separate Track-owned safe read/write commands, conflict/retry/recovery, then real
  integration through P5–P7. Never make the demo's memory storage into a Track writer.
- Persistent game state and draft recovery; current demo drafts reset on reload.
- Art production choices, avatar/rig/book attachments, complete climbing/vaulting/swimming,
  private release and recovery. Scope and approval gates remain in `AGENTS.md` and the
  concept draft; no installation or deployment follows automatically from this list.

Phone/iPad gameplay remains deferred. If work becomes advanced or leaves the agreed
plan, follow the Ultra escalation rule before continuing that part.
