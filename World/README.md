# Track World — playable garden and island demo

A Babylon.js garden runs locally with a third-person articulated botanical traveler, a clock plaza,
a bridge, low terrace steps, a grounded mind-map constellation and a playable flight
route across two floating islands. It uses synthetic data. Real Track integration, full
MM editing and the finished world's art and traversal remain separate unfinished work.

## Run it

From the repository root, using the existing Node installation:

```bash
node World/tools/serve.js
```

Open **http://127.0.0.1:8877** and choose **Enter the garden**. Keep the terminal running;
Ctrl+C stops the server. An optional numeric argument selects a different port.
The server binds only to this computer. Open through the server, not as a `file:` URL.

For the flight route, choose **Try island flight** on the welcome screen or in **?**.
That explicit demo shortcut takes you to the Windseed launcher. Hold **X** to charge,
release it, and hold **W** toward Cloudrest. **Space** deploys the glider once the ground
is four normal jump heights below your feet (about 4.3 m); a charged launch
also deploys it automatically at its highest point. Release movement over the island to
land. From Cloudrest's eastern edge, jump off, press Space over the gap and hold **D** to reach the lower
Windward Isle. Turn toward the garden to glide home. Both islands also have launchers.
The **?** panel includes the full route and recovery controls.

The pinned engine is already included under `vendor/babylonjs-9.25.0/`. No package
manager, build step, external font, asset download or internet connection is required
to run this copy. World uses the repository's existing `schema.js?v=7` and
`calendar-core.js?v=7`, `quest-core.js?v=1` and `graph-layout.js?v=1`, exposed by this server as
`/track-core/` modules used only for reading synthetic data.

## Controls

| Control | Action |
| --- | --- |
| W A S D or arrow keys | Walk relative to the camera's horizontal heading |
| Tap Shift | A dash, slightly faster than running, which settles back to a walk. Each dash costs stamina |
| Hold Shift ~1 s | The dash settles to the running speed and locks running; releasing the key does not stop it |
| Tap Shift while running | The only unsprint: a short dash decays back to a walk |
| Space | Let go while climbing; otherwise grab a nearby wall; otherwise jump or open/fold the glider when eligible |
| W/S and A/D while climbing | Climb up/down and move sideways along the wall |
| Hold X, then release | Charge and launch while standing inside a Windseed ring |
| Drag on the garden | Orbit horizontally and tilt up/down within upright limits |
| Q / E | Turn the camera horizontally |
| R / F | Tilt the camera within its vertical limits |
| Home | Reset the camera without moving the character |
| Mouse wheel | Move the camera closer or farther away |
| T | Today panel |
| N | Notebook |
| K | Mind maps |
| M / select the minimap | Full-screen world map |
| J / select the Quest heading below the minimap | Full-screen Quest list and selected details |
| G inside the Grove | Enter grounded MM stargazing, or return to the garden |
| V | Weather, light study, demo clock and performance readings |
| Escape | Close the open panel, then leave stargazing; ignored during IME composition |
| ? → Return to the start | Recover the initial position and camera |

Opening a panel gives it input without pausing the world: a jump finishes, gravity and
collision continue, and released walking input slows naturally. Typing does not move the
character or camera. The bottom toolbar and Today bud remain available to switch panels
directly; Tab cycles through the panel and companion buttons. Closing restores focus to
the opener (or the latest toolbar button used to switch). When focus returns to a toolbar
button, click the garden before walking. Losing focus clears held keys, pending jumps and
camera dragging.
Running is a state the body holds, not a key: once a held dash has locked it, releasing
Shift, stopping, or opening a companion all keep running, and only a short dash unsprints.
A held key's repeat events do not dash again, and Shift used while typing in a companion
does nothing. **Return to the start** and reload restore walking with a full budget.
Opening a panel or losing focus cancels a charged launch without firing it. An already
deployed glider keeps descending while reading; horizontal input slows when released.
Ground contact folds the glider and brings the notebook back into the character's hand.
Climbing stows the notebook as well. Space takes the character off the wall with a small
outward/upward impulse and never deploys the glider on that same press. A brief separation
period gives the push time to clear the wall; grabbing again requires another Space press.
Reading while climbing holds the current grip, with the environment still running.
Falling below the world returns to the last landed island, or the garden start after landing
back in the garden. **Return to the start** always restores the original garden position.
Losing pointer capture alone does not cancel a held drag or held movement keys; releasing
the pointer, cancelling the gesture or losing focus still ends the drag.

The welcome screen stays until **Enter the garden**, **Try island flight**, or the explicit
**View stars in the Grove** travel shortcut is pressed. Information panels are available from that screen as
well. If WebGL fails, the error surface offers the notebook so session notes remain
readable and editable without the scene.

## What the demo does

- Walk, run and jump with a fixed simulation step, a capped catch-up after stalls, simple
  collision, a small step-up allowance, jump buffering and a short coyote window.
  Ground contact keeps the collision body above path stones so a jump can lift off cleanly.
  Ground starts, braking and sharp turns have separate response rates. Running jumps keep
  horizontal velocity; glide entry and landing ease toward the active movement speed.
  Wall movement accelerates smoothly, while opening a reading panel still holds the grip
  immediately. Walk/run speeds are **5.2/12** world units per second. The walk was raised
  from 3.85 on 2026-09-13 at the user's request for a faster walk; the run has been 12 in
  `flight-core.js` since it was split out, though this file previously described it as 6.6 —
  the figure was stale and is corrected here rather than the code being changed.
  Ground acceleration, braking, turning, dash/hold behavior and stamina timing are unchanged.
  The avatar and following camera interpolate between fixed simulation positions.
  Collision and the four-jump-height gate use the actual simulation body.
- The fixed botanical traveler uses a **local procedural rebuild on the existing rig**.
  The **body alone** carries a **1.30× scale** (`characterScale` in `flight-core.js`).
  Model-local thigh/shin lengths stay **0.49 / 0.46**; their rendered lengths are
  **0.637 / 0.598** world units, for a **1.235-unit leg**. Overlapping torso volumes and
  shin-mounted boot cuffs form the same articulated body. What scales is the character's
  own anatomy: the collision ellipsoid (**0.455 / 1.144 / 0.455**), the feet offset below
  the collider centre, the limb reach used to probe walls and ledges, and eye/crown
  heights. What does **not** scale is everything else — scene geometry, bridge widths,
  stair heights, island spacing, camera distance **8.8**, jump impulse **6.2**, gravity
  **18** and the bounded step-up **0.24** all keep their authored values.
  Step length is `speed / (2 × cycle rate)`, so the longer leg is what cuts step/leg to
  **1.238 / 1.723 / 2.370 / 2.981**. Ground speeds stay **5.2 / 12 / 16.2**, so
  route lengths, crossing times and jump spans are exactly what they always were.
  Framing changes on purpose: the camera stayed at 8.8 while the body grew, so the
  character now sits larger in frame. The intended movement difference is reduced step
  length relative to the legs. Pose coordinates
  remain local to the model; contacts and exported ankle heights use world units.
  Four independent motion sets own heel recovery, support timing, pelvis weight transfer,
  torso lean/counter-rotation and arm phrasing. At steady observed speeds 5.2 / 8 / 12 /
  16.2, their full left/right cycles are **1.70 / 1.88 / 2.05 / 2.20 Hz**. Jog is a
  presentation state crossed during acceleration and braking, with no new control or
  selectable controller speed. Set changes blend without restarting the stride.
  The pelvis rides higher over soft supporting knees. Each set's recovery path folds
  the heel behind the hips before bringing the thigh through, instead of immediately
  drawing the recovering leg forward into a seated posture. The modest leg-length increase
  lets the higher pelvis retain knee flex without a rapid straight-knee snap.
  Each step's pelvis trajectory follows support-leg loading, toe push-off and an airborne
  arc. The body gains upward velocity before foot release and carries that velocity into
  the arc; an unweighted recovering leg adjusts its reach without pulling the body down.
  The forefoot holds its world position on the rendered ground plane while the ankle
  rises and rolls over it. Foot orientation is resolved against the actual leg hierarchy,
  so pelvis rotation cannot twist the planted toe away from its contact. Walking has a
  higher folded-heel recovery based on the user's September 15 walking recording.
  Foot recovery stays close to the hips. Lift/strike velocity is handled near the ends of the swing
  instead of stretching a long sweep behind the body. Sharp turns release an overreached
  contact, the torso/head respond at different rates, and stopping finishes two staggered
  recovery steps. Restarting captures the new lift-off velocity rather than dividing a
  new fast speed by an old slow stride clock.
  Running takeoff inherits the stride, then gathers the legs, opens the arms, reaches
  down while falling and compresses on landing. Climbing uses dwell/pull/reach phases,
  with different upward/downward/lateral reaches and a still phase while holding a grip.
  The additional `17-52-28.webm` supplies a climbing rhythm reference on a different
  Genshin character; detailed grip placement and detach remain adaptations. Charge,
  detach and glide poses remain integrated. Reset/travel/recovery clear presentation
  history; reduced motion removes idle breathing and glide sway.
  The full-size notebook follows a quieter right-arm carry and transfers between hand
  and belt for climb/glide, including a reversal during transfer. All transforms are
  decorative: animation never writes controller state or Track data.
  **Limits:** this is rigid jointed geometry, with visible joint/clothing seams, not
  smooth skinning. The walk set includes airborne intervals, also visible in the user's
  walking reference `2026-09-15 21-31-32.webm`; exact timing/force parity is not established.
  This is coordinated presentation, not animation-driven collider motion. Terrain-adaptive feet/hands,
  notebook clearance in every pose, Aether appearance fidelity, naturalness and exact
  reference parity remain unproven. Notebook handling has no supplied reference.
  Later footage supplies gliding, climbing/vault, free fall and light landing poses;
  those new motion builds are outside this scale checkpoint. No purchase, download, installation or new
  dependency was used. See the [comparison](MOVEMENT-DEMO-COMPARISON.md) and
  [verification record](docs/VERIFICATION-LOG.md).

- Face a nearby solid wall and press Space to grab it. W/S climb up/down and A/D traverse
  sideways; an upward climb can step onto a reached ledge. Space releases with a small
  push away from the wall along its outward normal. Wall interaction is resolved before jumping or gliding,
  including at a height where a glider could otherwise open. Gateway pillars provide a
  simple climbing route. The articulated pose alternates hands and bent knees while moving,
  then holds the grip during reading. This remains basic wall traversal, not completed
  reference-matched climbing, vaulting or an authored animation system.
  The avatar fades when collision brings the camera close, keeping the wall visible.
- Charge a Windseed launcher for up to 1.2 seconds, release for an upward impulse, and
  glide with a visible canopy. A brief accidental tap does not launch. Manual and launch-apex
  deployment require at least four normal jump heights of clearance beneath the feet,
  using the shared jump-speed/gravity constants. Ordinary repeated Space presses during a
  jump do nothing extra, including when jumping on an elevated island. A rejected press is
  not queued. Once open, the glider remains open below that threshold until folded or landed.
  Launch apex deployment still works while a companion owns input when clearance permits it.
  WASD steers at 8 world units/second with a 2.4 units/second maximum gliding descent.
  Cloudrest and Windward Isle have real collision surfaces and checkpoint recovery.
  Launch/glide/climb/detach keep their authored speeds and need no rescale: the islands
  stayed at their authored distance, so the unchanged **22+12** impulse reaches Cloudrest.
  The two gateway piers are **1.5 units wide and 2.2 deep**, with **2.1 × 2.8 decorative
  caps**, providing room to finish landing and brake with the enlarged collision body.
  Extra depth extends behind the original front faces, keeping the approach and grab
  positions unchanged. Pier height, the rest of the scene and all controller tuning
  retain their authored values.
  [The movement comparison](MOVEMENT-DEMO-COMPARISON.md) records the reference target and
  the limits of what has actually been measured.
- **Dash, locked running and sprint stamina, reviewed on 2026-09-13.** Shift is
  no longer a toggle. One press is a **dash** at 1.35x the running speed (16.2 units/s); it holds
  for 0.35 s and then eases toward whatever the press turns out to have meant. Released
  before **1 s** it settles to a **walk**; held to 1 s it settles to **running and locks**, and releasing
  the key does not stop it. A **short dash while running is the only unsprint**. The dash is
  an impulse on the body, so it reaches its speed from a standstill. An airborne press
  while already locked registers its hold/release without a burst or cost, so a short
  press still unsprints over a tread or during a jump. Climbing/gliding presses are ignored.
  Stamina pays for it: a dash costs 1, the locked run drains 1 per second while moving on the
  ground, and walking recovers 1.4 per second after a 0.6 second pause. The budget is bought
  by the KS03 streak — `2 s + 0.67 s per active day`, capped at 8 s, one third of the first
  pass at the user's direction — read once at load from the synthetic fixture's `linChanges`
  and never written back. An empty budget unlocks the run, discards a pending hold, and
  refuses dashes until stamina passes 25%; recovery requires a fresh press to run again.
  The current rule allows a full dash with any positive, non-exhausted balance, spending
  up to the remaining value; the nominal cost is 1. This partial-payment policy was
  identified in review and left unchanged for user direction. Ground drain currently
  tests the controller's requested horizontal velocity, so collision-blocked input can
  still spend stamina; the review has not changed that movement test.
  The bar is a slim **vertical** capsule that **rides beside the traveler**,
  anchored to their own world-to-screen projection — the same one the destination waypoint
  uses — offset far enough right to clear the character model, and it hides when the budget
  is whole or the traveler is off screen. Nothing about the collider, Space resolver or glide gate moved.
  `scripts/stamina-core.js` (`window.WorldStamina`) is the one definition of both the sprint
  state machine and its cost, and it holds **no date code**: the local day and the day-shift
  helper are parameters, so it never repeats Track's UTC streak expression.
  The nominated review found and corrected a hold surviving exhaustion at the zero-streak
  budget, and stale tap-toggle instructions. The speeds, burst, formula, drain, recovery
  and threshold were preserved. See the [verification record](docs/VERIFICATION-LOG.md)
  for executed checks and remaining concerns; this review is not visual acceptance.
- Orbit the following camera with unrestricted horizontal rotation, bounded up/down tilt,
  an upright horizon, a ray-based obstruction check and bounded zoom. There is no roll or
  flipping. This follows the corrected Genshin-style camera direction; the numeric tilt
  limits and sensitivity are demo tuning, not measured reference parity.
- Choose clear skies, rain, snow, intense rain or heavenly skies. One shared state drives
  light, wind, precipitation, fog, water, wet stone and snow cover; stone dries more slowly
  than rain clears. Snow accumulates on grass, stone and foliage, then melts. Heavenly
  skies add distant golden rings and a pastel sky. Rain and snow follow the player's altitude
  through island flight. Reduced motion stops the particles and keeps gradual material and
  light changes. Weather does not alter collision, movement or Track records.
- Use an independent daylight/night **light study**. It is explicitly separate from the
  demo clock and does not claim to implement the final world's astronomical time system.
- Read synthetic Today information through `TrackCalendar.buildDaySchedule`: authored
  notes, schedule blocks, due deadlines, chosen caution days, reviews, MG focus and a
  separate reference timetable. Untimed notes remain untimed even when their automatic
  schedule block begins at 08:00. Reference entries are not counted as tasks.
- The default clock follows the computer's local date/time, including after sleep. Optional
  fixed clock states show 17:40, 20:10 and 00:10 on the following day. After 20:00, a tomorrow
  preview appears only if tomorrow has a day note, chosen warning or deadline. Its records
  remain explicitly dated tomorrow; a review alone does not trigger it. Today also includes
  canonical milestone periods and Kolb/MG, +Lin, notebook-capture and source-capture buckets.
  MG focus includes the current MG text and opens the selected MM. Previous/Today/Next
  navigation keeps past and future records reachable, with dated-history/upcoming labels.
  The fixture starts on the local date at page load. Neither midnight nor changing the view
  moves any fixture record or invents an overdue state for informational items.
- Use the same functional notes flow as Track's `scripts/notes-widget.js`: opening the
  notebook shows note titles and **+ Add note**. Selecting or adding a note opens its
  editable topic and body. Edits are retained automatically by note ID; the topic trims
  on blur and Enter leaves its field. **Back** returns to the list. **Delete note** names
  the note and asks for confirmation; Cancel/Escape leaves it intact. The confirmation
  owns focus while physics and weather continue. There are no Keep, Cancel changes or
  Export controls in this interface. Closing and reopening starts at the list with the
  session's edits retained. Empty notebooks offer Add note; Thai and long content stays
  literal. This is still synthetic demo memory, not a live Track connection: reloading
  restores the original synthetic note and clears session edits/additions.
- Read selected-MM type/stage, connections, current MG/rating and history, all recorded Kolb
  fields, SIR sessions, +Lin records, comments, links and direct source text/URLs. Text is
  shown in full inside the panel. Separate name/observation drafts stay in memory. Inherited
  and aggregated source views, source ordering/tags, and full MM actions remain unfinished.
- Enter the overhead MM sky while grounded inside Memory Grove (the trees to the left of
  the plaza). **Mind maps → View stars in the Grove** is an explicit demo travel shortcut
  that takes the character there if needed; simply opening Mind maps never moves the
  character. Entry plays a fixed 1.6-second camera animation from the current view up into
  the sky. The stars fade in during its final portion. Esc plays a 1.1-second return,
  including when pressed before entry finishes. Walking stays locked through both
  transitions and inspection. **Reduce motion** skips the camera animation.
  Selecting an MM opens its information, with **Back to the stars** to resume the same sky
  without replaying entry. Every synthetic MM is a luminous Babylon scene mesh above the
  Grove, including those without reviews today. Connections and review petals are also
  rendered in the scene; the HTML layer supplies only controls and projected labels/hit
  targets. Stars use Track's `computeLayerLayout` plus saved `slot.pos` overrides, KS03
  colors and connections.
  The grounded viewpoint stays fixed while dragging rotates the displayed constellation
  around a spherical sky. The fitted network's longer dimension spans **40°**; a drag
  follows the pointer at **1× near the screen centre**, and held arrow keys rotate at
  **20°/second**. These are the user's selected motion settings. Zoom with the wheel or
  +/− changes field of view; **Fit all** / Home restores the initial orientation and fit.
  Search and Tab selection bring an offscreen star back into view; Enter/Space opens it.
  Labels and hit targets follow the same projected stars. Their de-overlap still uses
  flat KS03 space, so separation under projection remains a dense-network proof gate.
  Larger-parent sizing is a demo treatment: cycles share a size, and child sizes decrease
  along the condensed graph. Filled petals mean reviews due;
  outlined petals mean reviewed, with exact counts in the label. The matching ground petals
  use the same canonical calendar result, including skipped and actual finished-day rules.
  Navigation changes only the display mapping: `sky-core.js`'s canonical KS03 coordinates
  and saved `slot.pos` overrides remain unchanged, including MM 103 at **(510, 70)**.
  **Reduce motion** retains direct dragging while skipping entry/return transitions;
  the sky has no automatic drift or release coasting. A celestial rendering pass keeps
  knowledge visible through weather and foliage. There is no full-screen panel or tinted
  backdrop behind the constellation. While stargazing the sky is **drawn at night**
  whatever the clock: the darkness follows the stars' fade-in and is a rendering blend,
  so the live weather/clock state and every cue that reads it are untouched, and the
  garden returns to the real hour on exit. Behind the MM stars sits a seeded field of
  about 4,400 distant points with a faint band; it turns with the constellation, is never
  pickable and adds no HTML target. Weather and physics continue; stargazing holds the
  grounded avatar still.
  The sky spans the screen above the toolbelt, under one compact strip holding the title,
  legend key, zoom/Fit all/Find and **Return to garden**; search results overlay the sky
  so typing never reframes it. The garden-only HUD (identity, minimap, Today bud, location
  and control hints) steps aside while stargazing; the toolbelt, including Today, stays.
  At 1280x800 the constellation gets 76% of the screen (previously 42%). No star, label
  or target is drawn beneath the toolbelt. Labels are captions: the star or Find opens an
  MM, so a label covering another MM's star at density cannot open the wrong one.
  A panel closes back to that sky, and leaving restores the
  ordinary camera orientation without teleporting. The demo fixture holds 35 synthetic MMs
  with 30 connections: four parent depths, a parent cycle, disconnected groups and long
  names. The first three keep their authored Grove stations; the rest stand deeper in the
  Grove on a spiral solved for at least 2.3 m between stations, all on the garden floor.
  Label overlap at this density is visible and is the open dense-network question;
  visual acceptance of the new strip, backdrop and night treatment awaits the laptop
  playtest.
- Read the synthetic workspace's full Quest tree and starred list directly from its tab.
  `TrackQuest.questTree` preserves chosen sibling order and context ancestors, skips aliases
  and promotes milestone children. `starRollup` supplies the parent grouping and counts.
  Missing linked MMs stay labelled; available linked MMs can open their existing draft panel
  from the selected Quest details.
  Quest has no completion, daily routine ticks, star, reorder or management controls.
  The full-screen menu places the canonical list on the left and selected details on the
  right, with Show on map / Navigate actions below. Unmapped quests say **No destination
  mapped**. The compact starred rollup sits beneath a circular top-left minimap, separate
  from the active destination. Its **Quest** heading opens the full Quest popup by click,
  Enter or Space; closing returns keyboard focus to the heading. Nearby Grove instructions remain underneath. This stack
  hides during panels and stargazing. This implements the requested desktop arrangement
  as a demo; complete Genshin feature parity has not been established.
- Open a north-up geographic map of the actual garden. Terrain positions and dimensions
  are read from scene meshes before batching; landmarks identify the approach, Clock
  Plaza, Memory Grove, little bridge, north terrace, garden gateway, Windseed launcher,
  Cloudrest and Windward Isle. Fit garden includes all three landmasses. The position arrow
  follows the camera's viewing direction on both maps, including stationary camera orbit,
  and updates every rendered frame. It stays above landmark markers. Drag or use arrow keys to pan,
  scroll or use + / − to zoom, **Recenter** / Home to find the player, and **Fit garden**
  to see the whole scene. Landmarks and pins have display filters and a keyboard-accessible
  location selector. The gateway is a walk-through route to the launcher; fast travel is not implemented.
- Click the map or choose **Pin at map center** to preview a named pin with a symbol.
  A dashed **Unconfirmed** marker appears immediately at the chosen coordinate and stays
  there through pan/zoom. Another map click repositions the draft while preserving its
  name and symbol; changing the symbol updates the preview. Save confirms it, and Cancel
  removes the preview without changing a saved pin. Selecting a saved pin or landmark
  immediately abandons the current unconfirmed draft and opens that place, including
  **Show on map** from Quest. Saved pins and the active navigation target are unaffected
  by this selection. Edit and confirmed removal affect session-only game state. An unfinished pin
  draft survives companion switching; pin edits update an active locator and removal
  stops navigation to that pin. Pins and landmarks carry the actual solid surface height,
  found with the same downward ray. A point outside the garden can be previewed but
  cannot be saved without a surface. This one-layer demo chooses the highest solid
  surface at the coordinate; selecting between stacked layers remains future work.
  Reload clears pins, pin drafts and the active locator.
- Navigate to a mapped synthetic quest, landmark or pin. The full map and minimap mark
  the destination; the gameplay locator shows its name, camera-relative bearing and
  distance from the character, including height and an above/below cue when needed.
  A small marker is projected at the exact destination point in the garden, with its tip
  anchored to the surface height. It stays visible through geometry and weather, follows
  the camera each frame and never intercepts camera dragging. When the destination is
  outside the camera view, the HUD bearing remains available. Opening a companion or
  stargazing hides the world marker while retaining navigation.
  Reaching it says **At destination** and keeps the locator
  until stopped. Navigation does not move the character or change any Quest progress.
  Full-screen menus keep simulation/weather running and retain notebook/MM drafts.
  There is one garden with two adjacent sky islands and one surface per horizontal
  coordinate; region/layer switching and dense-marker
  tuning remain unfinished.
- Reduce environmental motion, adjust camera sensitivity, and choose up-to-720p or
  window-resolution world rendering. HTML panels remain at the browser's resolution.

## Data isolation

The game does not load a Track page, Firebase, the storage guard, a user export, or a
live database. Fixtures are created through the canonical schema with synthetic IDs.
Drafts never modify the fixture. There is no game persistence or synchronization.

`storage-isolation.js` runs before Babylon.js. The engine's import-time storage probe
(`setItem('test')` / `removeItem('test')`) receives document-local memory storage. The
script never obtains the browser's native storage object. `track_` keys and IndexedDB
are refused in this document. This guard affects only the demo document, not other tabs.

The loopback server exposes only the game and four named pure Track modules. Its Content
Security Policy disallows outbound connections, remote scripts and form submissions.
The browser test seeds a synthetic sentinel in the real storage of a temporary profile,
traps every native storage operation, then verifies no operation occurred and the
sentinel remained byte-identical. No personal browser profile is used for that test.

## Scale checkpoint playtest

**Review status:** foot-ground push-off/body momentum (1) is rejected; checks 2–5 were
judged “okay but not that good”. Body-animation work is stopped at the user's request,
with no fix or further review planned. The checklist below is retained as a reference
to that verdict, not a new request to test.

Reload the local demo, enter the garden, and press **Home** to reset camera framing.
The scale changes step-to-body proportions; it does not replace the rigid character model.

1. **W, then W + hold Shift for one second:** watch the foot plant, hips pass over it,
   heel lift and push-off in the base gait and locked run. Look for forward overreach,
   a seated silhouette, sliding toes or a body that drops as the foot releases.
2. **Tap Shift while moving, then release W and restart:** compare the dash and the
   jog crossed during acceleration/braking. Judge reach and continuity; cadence is fixed.
3. **While moving, change W→D and W→S:** check 90°/180° turns for foot crossing or pops.
4. **Run + Space, then walk up the terrace steps:** judge relative jump height, landing
   and clearance at the enlarged body size. Wheel zoom and Home should keep familiar framing.
5. **Face a gateway pillar, Space, W, then Space to detach:** inspect wall clearance
   and notebook carry/stow clipping. Grab again, climb onto the top and release W: the
   widened pier should support the body without sliding to recovery. Climb choreography
   itself is unchanged.

Automated geometry/contact checks cannot establish naturalness or reference parity.

## Verification

From the repository root:

```bash
node World/tests/core.test.js
node World/tests/sky-core.test.js
node World/tests/map-core.test.js
node World/tests/flight-core.test.js
node World/tests/stamina-core.test.js
node World/tests/character-motion.test.js
node World/tests/character-animation.test.js
node World/tests/browser.test.js
node World/tests/camera.test.js
node World/tests/sky.test.js
node World/tests/map.test.js
node World/tests/flight.test.js
```

The offline commands use Node's built-in test runner directly: synthetic schema/calendar
parity, Quest fixtures (numeric MM IDs, missing links, saved order and starred grouping),
local date boundaries, live-clock midnight and preview-trigger rules, gradual
rain/snow/storm/heavenly transitions and surface drying/melting, fixed-step timing and resume cap, source
isolation and the engine storage-probe guard. Sky cases compare canonical auto/manual
positions, non-due identities, colors, skipped/finished-day reviews, shared parents and cycles.
Map cases check north-up coordinate round trips, camera-relative bearings, height-aware arrival state
and explicit synthetic Quest destinations, including missing/unmapped entries.
Flight cases check acceleration, braking and steering at 30/60/120 fps, momentum across
jump/glide/landing transitions, angle wrapping, charge/release, cancellation on input loss, apex
deployment, the four-jump-height opening threshold, wall-first Space priority, manual
folding/redeployment, landing reset and bounded resume input.
Fixed-step cases also check interpolated presentation at 120 Hz without extrapolating
beyond the collision body.
Character cases cover **walk, jog, run and dash** in timing, compact foot reach, world
contacts, joint continuity and 30/60/144 Hz cadence comparisons. Posture cases bound
simultaneous forward thighs, pelvis collapse and maximum forward knee angle; nominal
cadences also pin the user-accepted rhythm. They cover transitions
through all four sets and back, 90°/180° turns with the existing controller's steering,
stopping/restarting, jump progression, directional climbing, held grips, reset and
read-only sampling. The flight browser suite also checks an off-centre gateway climb-top
landing and a one-second supported hold after release. It measures actual Babylon ankle positions
against contacts separately for all four sets, measures the rendered hips/knees in the
actor's facing direction through turns, and checks full-size notebook transfer
and mid-transfer reversal. Push-off cases require body rise and positive vertical velocity
at foot release, heel rise before release and a gravity arc while both feet are airborne.
The browser measures the visible toe mesh's sole against its planted ground point,
independently of ankle accuracy. These checks do not establish naturalness or reference parity.

The browser commands start temporary loopback servers and isolated headless Chrome via the
existing `tests/lib/cdp.js`. It checks entry, simultaneous generated camera drag and walking,
jumping with a panel opened in midair, direct pointer/keyboard panel switching,
IME Escape, companion focus containment, notebook retention, per-MM draft identity,
Quest reader parity and MM navigation, caution gaps,
handled deadlines, untimed notes, reference separation, tomorrow/midnight views,
weather/light transitions, desktop and narrow companion bounds, same-origin requests and untouched
native storage. The camera suite checks unrestricted horizontal orbit, bounded vertical
tilt, an upright rendered view, removal of roll, reset without teleporting, dragging after
actual pointer-capture release while walking, pointer release and typing isolation.
The sky suite walks the real controller
into the Grove, checks grounded entry, intermediate camera orientations and star reveal,
movement locking, actual celestial scene meshes, the upward camera without avatar obstruction,
fixed eye position/orientation through drag, spherical star/connection motion, projected hit
targets, the selected arrow speed, field-of-view zoom, Fit all/Home and Tab recovery of stars
behind the view. It also checks live rain, changed-day petals, narrow bounds and restored
camera orientation.
It also checks the ordinary MM panel's explicit Grove shortcut, rendered star silhouettes
and draft retention when opening and returning from the sky, early cancellation and
reduced-motion entry/return. Two cases cover the sky's presentation: the map's share of
the screen, the compact strip, the garden HUD stepping aside and returning, nothing drawn
beneath the toolbelt, and search never resizing the map; and the background field's
lit pixels (measured from the framebuffer with only the field toggled, because a mesh can
be visible in the scene graph and draw black), its shared rotation with every MM star, the
night rendering while the live clock is not night, and the absence of any extra target.
The map suite checks scene-derived landmark coordinates, keyboard and pointer pan/zoom,
pin creation/validation/edit/cancel/removal, literal Thai/HTML-like labels, pin/notebook
draft retention across menus, mapped/unmapped Quest navigation, distance changes while
walking, unpaused weather, untouched native storage, session reset and 390/800/1100px layouts.
It also checks live map heading during stationary camera orbit, clicked pin previews and
repositioning through pan/zoom, refusal to invent a height outside the island, bridge and
terrace elevations, and an exact projected destination behind the clock's real collision
geometry, including camera turn/tilt, off-screen retention and stopping navigation.
Selection cases click real markers over a new pin draft and a saved-pin edit, and follow
Quest's Show on map, checking that only the abandoned draft disappears.
Notebook browser cases exercise the Track-style list/Add/Back workflow, automatic
retention by identity during immediate switches, Thai/combining-mark text, declined and
confirmed deletion, Escape and unpaused physics during confirmation, empty-list capture,
long content at narrow widths and reset on reload.
The flight browser cases check a released dash's stopping distance, Shift dash/hold/lock/
unsprint, ignored repeats and typing, exhaustion and recovery at default/zero-streak
budgets, current control instructions, and a running jump's retained velocity and blended
leg pose. They check repeated Space during ordinary garden and island jumps,
wall attachment, upward climbing, ledge exits, reading with a held grip and outward
detachment above the glide threshold without glider deployment. It rotates the camera
against the climbing wall and checks that the character fades in the close view.
It drives the actual keyboard controller from the launcher to
Cloudrest, edits a notebook during descent, lands, jumps/glides to Windward Isle, and
deliberately misses the terrain to verify last-island recovery. It checks the map's actual
island heights and byte-identical synthetic fixture. The general browser suite also checks
snow/halo/rain rendering, reduced-motion particles and dated-history navigation.
The suites write review screenshots to `/tmp/track-world-*.png` and close their
browsers/servers. A local socket/browser permission may be required by the execution sandbox.

**Evidence boundary:** the browser harness disables hardware GPU rendering and reports
SwiftShader. Its frame rate is functional-test evidence only. The Ryzen 5 5500U / integrated
Radeon laptop's sustained 720p/30 fps target has **not** been established. The live metrics
panel shows a rolling frame rate and p95 frame interval, per-frame draw calls, internal
resolution, renderer and active elapsed time; it is not a complete CPU/GPU profiler.
The user accepted the current playtests, including the camera and animated sky view, on
2026-09-09. This does not establish the separate sustained hardware benchmark.
With the user's explicit approval, GNOME's touchpad `disable-while-typing` setting was
then set to `false` and read back as `false`. The desktop now permits touchpad use while
typing. On 2026-09-12, the user reported “it worked well” in response to the tap-Shift
sprint and double-tap camera-drag-while-moving checklist. This records user-reported input
acceptance; generated pointer events alone do not establish physical input delivery.

The root Track test suite is unaffected: no Track runtime, persistence helper or root test
file changed. World tests reuse the root CDP helper without modifying it.

**Movement pass evidence — 2026-09-12:** the released-sprint regression first failed at
0.4502 world units of coasting; the tuned controller measured 0.1900, with the same
0.6-second running / 0.4-second release observation. The first full flight run exposed
an automated approach that stepped just outside the gateway pillar (x=6.556; its edge
is x=6.55). The test now releases movement on a rendered frame, avoiding the CDP
round-trip overshoot; wall reach and Space priority were not expanded to accommodate it.
The subsequent full flight suite passed all eight cases, including outward detachment,
reading while climbing, ledge exit and both island landings. The four offline suites
passed 24 cases in total. New checks cover response across frame rates, presentation
interpolation, sprint toggling, and running-jump velocity/pose continuity.
All five browser suites then passed sequentially: flight 8, camera 5, map 5, sky 8 and
general browser 7 reported tests. Runtime source hashes stayed unchanged throughout that
final run. Native-storage isolation, notebook identity and unpaused companion behavior
remain covered. Syntax checks, cache-query consistency, local documentation-link targets
and `git diff --check` passed; climbing and flight screenshots were also inspected.
The runs' output is in `/tmp/track-world-fluidity-*.log`.

Hardware metadata read for the pending physical procedure: AMD Ryzen 5 5500U / Lucienne
Radeon, `amdgpu` kernel driver, Linux `7.0.0-30-generic`, Chrome `152.0.7977.75`, Balanced
power profile; touchpad disable-while-typing reads `false`. The default synthetic fixture
contains three MMs, four root goals, four calendar notes, three deadlines and one notebook
note. Browser behavior checks use a 960×640 viewport for traversal and software rendering;
they do not establish the hardware graphics-driver stack or 720p performance. Input
acceptance is recorded above; animation-based movement sign-off, warmed hardware routes
and a sustained 20-minute measurement remain pending. The A1 humanoid described above
now enables that movement review; its execution evidence is recorded in
[World's verification log](docs/VERIFICATION-LOG.md).

The input-acceptance follow-up changed documentation only. `git diff --check` and the
documentation diff were reviewed; game/browser suites were not rerun for that feedback.

## Files and dependency

| Path | Responsibility |
| --- | --- |
| `index.html`, `styles/demo.css` | Canvas, botanical information panels and keyboard-accessible controls |
| `scripts/scene.js` | Geometry, character integration, collision, camera, shared weather rendering and live metrics |
| `scripts/character-motion.js` | Read-only resolved movement feed, travel/turn channels and retained takeoff/landing/detach events |
| `scripts/character-animation.js` | Procedural gait/contact planning, body poses and transition timing; no controller writes |
| `scripts/character-rig.js` | A1 humanoid geometry, pose application and full-size carried/stowed notebook transfer |
| `scripts/demo-core.js` | Synthetic fixture using canonical date helpers, environment transition and fixed-step scheduler |
| `scripts/flight-core.js` | Charge/release, glide deployment and cancellation rules; demo tuning without Track state |
| `scripts/stamina-core.js` | The one definition of sprint: the dash/hold-to-lock/short-dash-unsprint state machine, the KS03-streak budget it spends, recovery and the single `canSprint` gate, plus the read-only streak projection. Holds no date code — the day and its arithmetic are parameters |
| `scripts/app.js` | Panel state, canonical calendar reads and memory-only drafts |
| `scripts/sky-core.js` | Read-only KS03 projection, hierarchy sizing and canonical review cues |
| `scripts/sky-motion.js` | Pure spherical display mapping and the user-selected sky control settings |
| `scripts/sky-scene.js` | Celestial scene meshes, the seeded background star field, procedural light/petal textures and world-to-screen projection |
| `scripts/sky-view.js` | Accessible sky controls and labels following the scene's projection |
| `scripts/map-core.js` | North-up coordinates, destination bearings and explicit synthetic Quest mappings |
| `scripts/map-view.js` | Geographic map/minimap, session-only pin drafts and destination locators |
| `scripts/storage-isolation.js` | Document-only storage isolation before the engine loads |
| `tools/serve.js` | Restricted loopback static server |
| `TRACK-WORLD-CONCEPT-DRAFT.md`, `PLAN.md` | The concept of record, and the proposed workflow/delivery plan split out of its Section 25 |
| `tools/fetch-engine.py` | Approved, version-specific engine retrieval with archive integrity verification |
| `vendor/babylonjs-9.25.0/receipt.json` | Download source, SHA-512 archive integrity and per-file SHA-256/size receipt |
| `tests/` | Dependency-free offline and real-browser behavior checks |
| `NOTES.md` | Remaining proof, limitations to resolve and next decisions |
| `MOVEMENT-DEMO-COMPARISON.md` | Selected movement references compared with the actual demo and unmeasured differences |
| `docs/VERIFICATION-LOG.md` | Character increment's execution evidence and automation limits |

Babylon.js **9.25.0** was downloaded with explicit dependency approval on 2026-09-06.
The npm archive was 21,129,389 bytes; the retained browser bundle is 8,316,622 bytes.
Only that bundle, its [Apache-2.0 license](vendor/babylonjs-9.25.0/license.md),
[notice](vendor/babylonjs-9.25.0/NOTICE.md) and receipt are retained. No npm lifecycle
script ran. The fetch script refuses to replace an existing vendor directory; updating
the engine is a separate dependency decision.

Reference imagery in `assets/images/` remains concept material. The runtime scene uses
local procedural scenery and the A1 articulated traveler; it does not use those images as
scenery or production assets. The wider anime art direction still needs its shader/asset proof.
