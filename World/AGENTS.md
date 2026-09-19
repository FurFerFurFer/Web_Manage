# AGENTS.md — Track World

## Scope

These instructions apply to everything inside `World/`.

`World/` holds the **Track World** game project: a proposed private, third-person fantasy
world that presents the user's real Track data as places, journeys, landmarks, and gentle
daily rituals. Nothing in this directory is part of the Track web application's runtime.

The repository root's `AGENTS.md` still applies to this directory. This file **adds**
rules; it never relaxes one. Where the two appear to conflict, the stricter reading wins
and the conflict is reported rather than resolved silently.

## Status

**The first synthetic Babylon.js browser demo exists.** See [README.md](README.md) for
what runs and [NOTES.md](NOTES.md) for unfinished work. On 2026-09-06 the user chose
Babylon.js and explicitly approved its pinned 9.25.0 dependency; the user primarily
directs Codex and playtests.

- Source, fixtures, an isolated loopback server and behavior tests exist under `World/`.
- The engine is vendored locally with its license, notice and integrity receipt. There
  is no package manager, build system or production asset pipeline.
- No hosting, cloud service, store account, or subscription has been purchased or enabled.
- Headless behavior checks are not a sustained target-hardware graphics benchmark.
- The concept draft distinguishes selected demo direction from other proposals.

Ordinary demo work within the agreed boundary does not need to be asked for twice.
Changing the engine, committing to an art approach, spending money, installing additional
dependencies, and touching Track's runtime remain stop-and-ask steps — see "Stop for
direction" below. Do not ask again for the chosen Babylon.js
browser direction; a change of engine or delivery would be a new decision.

## Directory Contents

| Path | Responsibility |
| --- | --- |
| `AGENTS.md` | This file: mandatory agent procedure and safety rules for the game project |
| `README.md` | Current demo, run/test commands, controls and evidence limits |
| `NOTES.md` | Unfinished proof gates and future work only |
| `index.html`, `scripts/`, `styles/`, `tools/`, `tests/`, `vendor/` | Isolated synthetic browser demo; file responsibilities are in README |
| `TRACK-WORLD-CONCEPT-DRAFT.md` | The concept of record: intent, principles, world structure, Track-concept mapping, guardrails, open decisions, and the feasibility review |
| `PLAN.md` | The proposed workflow and tool plan, Section 25: tool research, data/interface workflows, delivery phases P0-P10, verification gates. **Proposals, not decisions** |
| `assets/images/` | Visual-development reference imagery. **Not production assets** and not runtime application assets |

Everything belonging to this project goes here — concept documents, design decisions,
research notes, reference imagery, and any future prototype. Do not scatter game material
into the repository root, `docs/`, or the Track pages.

The repository root keeps exactly one thing about this project: a **pointer**. `README.md`
names the directory in its documentation map and file tree, and `NOTES.md` carries the
Track World feasibility entry. Keep those as pointers; the substance lives here.

## Documentation Responsibilities

`TRACK-WORLD-CONCEPT-DRAFT.md` is the source of truth for the concept. Two rules:

- **Record decisions where they were made.** A decision that changes the concept is edited
  into the draft itself — into the section it affects, and into Section 20 or 21 if it
  closes an open question. A decision recorded only in a chat reply is lost.
- **Do not promote a proposal to a decision by writing it down.** The draft already
  separates confirmed, deferred, and rejected. Anything the user has not chosen stays in
  the deferred or open list, labelled as such. Section 24's review recommendations are
  explicitly proposals; do not rewrite them into settled direction.

When this project grows past one document, it takes the same three-file split the root
repository uses, scoped to `World/`:

| File | Source of truth |
| --- | --- |
| `World/README.md` | What actually exists and how to run it — created only once something exists |
| `World/NOTES.md` | Unfinished work, open decisions, and roadmap — forward-looking only |
| `World/AGENTS.md` | This file: mandatory procedure and safety rules |
| `World/PLAN.md` | The proposed workflow and tool plan — phases, gates, tool research. Proposals only |

Create `World/README.md` in the same change that lands the first thing it can describe —
not before it, and never as a place to hold plans. Plans belong in the draft's
open-decision sections until they are built.

The three-file split now exists. Keep actual run/test behavior in README and remaining
work in NOTES; the concept draft remains the authority for product direction.

Two additions on 2026-09-12, both made to cut the tokens a session spends before it starts:

- **`PLAN.md` holds the draft's Section 25**, which had grown larger than the concept it was
  appended to, so a concept question dragged the whole delivery plan with it. Its `25.N`
  numbering is unchanged, so existing "Section 25.6" references still resolve. It is
  **proposals**, and the rule above against promoting a proposal by writing it down applies
  to it exactly as it did in the draft.
- **`NOTES.md` opens with a "Start here" block** — current phase, next increment, reading
  order — rewritten at the end of every session. It is not a fourth document and not a
  session diary: it is the first thing NOTES already existed to say, moved to the top and
  kept current. NOTES stays forward-looking, so what a session *did* goes to README.

## Non-Negotiable Rules

### Track owns the data and the mutation boundary

The Track application owns `track_db`. Section 18 of the concept draft lists fourteen
data-safety guardrails and they are binding on any future implementation, not aspirational.
The load-bearing ones, restated because they are the ones an implementation forgets:

- Track remains the truthful source for goals, dates, notes, deadlines, reviews, and
  completion state. The game displays; it does not decide.
- The game never silently reschedules an item, never carries an unfinished item into a new
  date at midnight, and never turns tomorrow into today at the evening preview.
- Ordinary movement, collision, proximity, weather, and platforming never modify Track data.
- Confirmed in-world writes are **personal notebook notes** and **full MM interaction from
  a selected star in the Memory Grove**, as chosen on 2026-09-06. Section 10 of the draft
  defines the MM scope: applicable existing MM identity/structure, MG, Kolb, +Lin/SIR,
  comment/link, and source-content actions. Direct task/to-learn completion, general
  calendar/deadline editing, and structural goal editing remain deferred or excluded.
- Full MM interaction is a confirmed requirement, not permission for scene code to write
  `track_db` directly. Each action must use a scoped Track-owned command with explicit
  slot/record identity, validation, appropriate confirmation, acknowledgment, and recovery.
  Multi-record effects must be applied together and retries must not duplicate them.
  Camera motion, star selection, and inspection remain read-only. Missing command safety
  is unfinished implementation, not a reason to silently drop a confirmed MM feature.
- This concept decision does not authorize live mutations, runtime changes, or cloud
  deployment during documentation work. Those still follow the separately scoped Track
  workflow below and the root project's applicable approval gates.
- Unknown, failed, or pending synchronization is shown as such. Presentation must never
  imply a successful data change before Track has accepted it.

### Work in `World/` does not edit the Track application

The demo's `storage-isolation.js` must load before the vendored engine: Babylon performs
a storage capability probe during import. Keep it in document-local memory, never let
it obtain native storage, and retain the browser test that traps native storage access
while preserving a synthetic sentinel. Shared `schema.js`, `calendar-core.js`,
`quest-core.js` and `graph-layout.js` are loaded through the demo server for synthetic fixture creation and
read-only views; no bootstrap or synchronization script may
be exposed or loaded there.

A task scoped to this directory changes files in this directory. Editing `index.html`,
`progress.html`, `sir-ks02.html`, `documentations.html`, `true-storage.html`, `scripts/`,
`styles/`, `firestore.rules`, or `tests/` is a **Track** change: it needs the root
`AGENTS.md` workflow in full — the persistence-boundary search, the cross-page checks,
`node tests/run.js`, a case seen failing first, and the browser smoke checks — and it needs
to be raised as its own change rather than folded into game work.

Reading those files to understand Track's real behaviour is expected and encouraged. The
concept draft's accuracy depends on it: `scripts/calendar-core.js` holds the real rules for
day notes, caution days, blocks, and reference timetables, and the draft's Section 24
already records where loose wording contradicts them.

### Reuse Track's meanings; do not invent parallel ones

Where the game represents a Track concept, it uses Track's definition of it. A deadline's
caution days are individually chosen and may have gaps; an untimed note's 08:00 block is a
default, not an authored time; a reference timetable entry is reference data and is never
work. A world that draws its own version of these has created a second, conflicting truth —
which Section 18's ninth guardrail forbids.

**Functional interface parity is mandatory (user correction, 2026-09-11).** Every
Track-backed feature in the game must preserve the functional interface of its Track web
counterpart. Inspect that actual interface before implementation: use the same actions,
editing/save behavior and navigation. The botanical presentation may change; do not add
game-only Keep/Cancel/Export workflows or extra steps to ordinary Track editing. The
notebook's authority is `../scripts/notes-widget.js`. This requirement is also the target
for the live connection; a synthetic imitation must never be described as already linked.

Geographic map features are read from scene meshes before batching; avoid a second
hand-authored copy of the island. Synthetic Quest destinations are explicitly assigned
in `map-core.js`; unknown or missing entries stay unmapped. Pins, pin drafts and navigation
are session-only game state. Reaching a target never completes or changes a Quest.
Preview coordinates and saved coordinates must agree through pan/zoom; Cancel preserves
saved pins. Explicit place selection (including Quest's Show on map) abandons the pin
draft and shows the chosen place; companion switching alone retains the draft. Neither
selection path changes saved pins or active navigation.
`surfacePoint` in `scene.js` is the one height lookup for pins and landmarks.
Refresh all mesh transforms before using it during initial scene construction, or the
unrendered island's default transform falsely puts destinations two meters above ground.
Map heading and the projected world marker follow the camera every rendered frame.
The marker's screen position comes from the full 3D destination; scene occlusion must
not hide it. Keep it out of pointer hit testing and hide it behind reading/sky modes.
For map/Quest changes, run `node World/tests/map-core.test.js` and
`node World/tests/map.test.js` alongside affected existing suites; preserve native-storage
isolation and the separate Grove/KS03 sky behavior.

Launch/glide state belongs to `flight-core.js`; collision and actual surface height belong
to `scene.js`. Never treat a held charge as a launch after blur, visibility loss or panel
entry. Those cancel charge; an already deployed glider continues under gravity. Landing
folds the glider and restores the carried notebook. Ordinary flight and checkpoint
recovery never change Track data or Quest completion. New islands must preserve the
map's one-surface-per-coordinate assumption until an explicit layer selector is built.
Run `node World/tests/flight-core.test.js` and `node World/tests/flight.test.js` for traversal
changes, alongside the camera, map and sky browser checks when shared scene code changes.
Reference parity and streak-based stamina are not established by demo tuning; keep the
comparison and any missing proof explicit in `MOVEMENT-DEMO-COMPARISON.md`.

**Space priority is a user contract (2026-09-12):** detach when climbing, otherwise detect
and grab a nearby wall, then consider jump/glide. `WorldFlight.spaceAction` is the one
resolver. Detachment pushes a little away from the wall along its outward normal and never opens
the glider on the same press. Glide opening, including automatic launch-apex deployment,
requires four normal jump heights of clearance BELOW the feet. Derive the threshold from
the shared jump speed/gravity, never from absolute world altitude or duplicated numbers.
The threshold gates opening only: it must not fold an already-open glider near a landing.
A failed low-height Space press is discarded, never buffered into a later deployment.
Preserve the ordinary-jump and elevated-island regression cases and the climbing/reading/
outward-detachment browser case. Reading holds a grip; it does not mantle or detach.

**Shift dashes and holds to lock running (user correction, 2026-09-13).** This supersedes
the September 12 tap toggle. One press dashes; releasing before 1 s settles to walking,
holding at least 1 s locks running, and a short dash is the only voluntary unsprint.
Release, stopping and companion entry preserve an already locked run; key repeats never
dash again. Exhaustion clears both the lock and an unfinished hold, requiring a fresh
press after recovery. Sprint stamina reads the synthetic KS03 streak only; climbing and
gliding are exempt. Preserve the user-directed walk 5.2, run 12 and dash boost 1.35 while
correcting animation; lowering them is not an available gait fix. Companion typing still
owns input. Controller checks cannot establish movement-feel acceptance: the user judges
the humanoid body and animation by playtest.

Rendered avatar/camera interpolation is presentation only. Collision, wall probes, map
surface heights and the four-jump-height glide gate must use the simulation body.
Explicit demo travel and recovery reset interpolation so they cannot draw a flight across
the intervening terrain.

The local clock and tomorrow-preview trigger have one implementation in `demo-core.js`,
using Track's calendar reads. Preview requires a next-day note, caution or deadline after
20:00; reviews alone cannot trigger it. Date navigation and midnight only change the view.
Fantasy weather uses one interpolated environment state; rain, snow, surface cover and
lighting may not introduce independent transitions or alter traversal/data semantics.

Notebook behavior follows Track: open to the list, + Add note, editable topic and body,
automatic retention, Back, and confirmed Delete. Session edits are bound to note IDs;
switching must never lose text or retarget it. Confirm deletion with a dialog that owns
focus and Escape while the world keeps running. Cancelling it changes nothing. Live
note creation/editing/deletion are confirmed product requirements, implemented only
through the separately gated Track command/recovery boundary. The demo remains memory
only with reload reset disclosed. Retain the identity, declined-deletion and empty-list
browser cases; no explicit Save/Keep/Cancel-changes step belongs in the notebook.

### Concept imagery is reference, not specification

Images in `assets/images/` establish preferred rendering, mood, and identity. They are not
screen specifications, not production assets, and not evidence of real-time performance.
Do not treat a rendered concept image as a deliverable, a UI layout, or proof that the
target hardware can draw it.

Keep them here rather than in the repository's application asset paths, and keep the
repository free of large binaries that nothing references.

## Dependencies, Spending, and External Systems

The stated financial target is **US$0 in additional mandatory monthly subscriptions**,
using existing hardware and free tools within their limits. It is a planning target, not a
quote and not a promise that art is free.

Ask for explicit approval immediately before:

- Installing an engine, SDK, toolchain, or package manager.
- Adding a dependency, lockfile, or build system anywhere under `World/`.
- Downloading and executing code, or downloading a large asset pack.
- Enabling or changing a cloud service, hosting plan, store account, or billing setting.
- Anything with a recurring cost, a usage-based cost, or an account enrolment fee.

Cost findings in the concept draft were checked on 2026-09-05 and must be **rechecked**
before anything depends on them. Two of them exist specifically because the obvious
assumption is wrong: Firestore and Cloud Storage are different products with different
billing, and budget alerts do not cap charges.

Read-only research and local inspection are allowed.

## Ultra escalation rule

The user requires an explicit warning when work becomes advanced or would go beyond the
agreed plan. Before continuing that part, explain the specific complexity or scope change
and ask the user to switch to **Ultra**. Pause the affected work until the user confirms
the switch or gives another direction; do not claim to have changed the model or setting.
A switch does not authorize expanded scope, installations, spending, or Track runtime
changes. Routine work within the agreed demo boundary may continue while it remains
straightforward.

## Work within the context budget

Every session in this repository starts by loading the root `AGENTS.md` automatically,
before anything is read on purpose. That floor is paid on every session, so the discipline
below is not fussiness — it is what keeps a session from compacting before the work starts,
and a compacted session re-reads files, which costs more than reading them carefully once.

- **Read by slice, never whole.** `TRACK-WORLD-CONCEPT-DRAFT.md` is 113KB and `PLAN.md` is
  88KB. `grep -n '^#'` for the section, then `Read` with `offset` and `limit`. Loading
  either entire usually costs more than the change being made.
- **Never read or grep `vendor/`.** `babylon.js` alone is 8.3MB. Use Babylon's
  documentation; the local copy is there to be served, not read.
- **Do not spawn subagents for `World/` work.** Each one starts cold and re-pays the entire
  auto-loaded context before it does anything useful. Inline tool calls are strictly cheaper,
  and this project's files are small enough to reach directly.
- **Send test output to a file and read the tail.** `node tests/<suite>.test.js > /tmp/…
  2>&1`, then read the last ~40 lines and grep the file for what you need. Do **not** end a
  pipeline in `grep` — the root `AGENTS.md` records a passing run reporting exit 1 because a
  trailing `grep` matched nothing.
- **Prefer fewer, longer sessions.** The auto-loaded context is written to cache once per
  session and read cheaply after; many short sessions re-pay that write each time.
- **Keep verification proportional and visible (user feedback, 2026-09-12).** Tell the
  user when a change is playable and when only verification remains. Run the required
  affected checks once after the final relevant edit; repeat only for a new change,
  failure or unresolved concern. Run one graphics-heavy browser suite at a time on this
  laptop: overlapping SwiftShader browsers can cause contention and timeouts. Pure checks
  may run alongside it. Documentation-only feedback does not trigger game/browser suites.
  Preserve the required traversal/shared-scene coverage above; passing automation proves
  behavior, while the user's playtest judges movement feel.

## Required Workflow

1. **Preflight.** `git status --short --branch`. Treat existing changes as user-owned.
   Read this file, then the relevant sections of `TRACK-WORLD-CONCEPT-DRAFT.md`.
2. **Classify the request.** Concept revision, decision recording, research, reference
   asset, or prototype work.
3. **Clarify only a genuinely blocking choice**, using the root `AGENTS.md` structured
   question format. Most concept work is reversible; a decision the user has not made is
   not yours to make on their behalf and is not yours to defer silently either.
4. **Check the claim against the code** whenever a change describes what Track does. The
   Track pages and `scripts/` are the authority; the draft is not.
5. **Edit in place.** Patch-based edits, preserve formatting, keep one concern per change.
   Do not restructure the draft to make an addition fit.
6. **Verify what applies.** For documentation-only work: `git diff --check`,
   `git diff --stat`, and a read of the final diff. Relative links must resolve from
   `World/` — the image is `assets/images/…` and the repository root is `../`.
   For anything built: **run it**, and report what was run, on what, and what was not
   covered. Code that was written and never executed is reported as exactly that.
   `node tests/run.js` is unaffected by a `World/`-only change; if a task made it
   applicable, that task edited Track and belongs under the root workflow.
7. **Final review.** `git status --short`. Only intended files changed, no user work
   removed, no temporary artifact left behind, no personal data or credential added.
8. **Rewrite `NOTES.md`'s "Start here" block.** Current phase, the single next
   increment, and the reading order. It is the handover, and it is the reason the next
   session does not have to reconstruct the state from a forty-item backlog or read the
   concept draft to find out where the work got to. Keep it **forward-looking**: what the
   last session did belongs in `README.md` as current behaviour, never here.
9. **Ask for specific playtest feedback.** After each playable demo change, tell the
   user which actions to try and what to report (for example, preview placement,
   camera response, visibility or height alignment). Keep it a short numbered checklist
   and distinguish automated checks from the user's physical playtest. The user
   explicitly requested this for every demo update.

## Stop for direction

Implementation is authorized; the commitments inside it are not. The concept draft is a
roadmap, and a roadmap is still not a mandate — build what the user asked for, and stop for
direction when a step would:

- **Choose the engine, or browser versus native delivery.** The most expensive decision in
  the project to reverse. Recommend one with reasons and let the user pick.
- **Install anything, or reach an external service.** Not this file's to relax; the root
  `AGENTS.md` owns it. Engine choice reaches this gate too, so it cannot be made quietly.
- **Touch Track's runtime files, stored data, or cloud state.** Unchanged. That is a Track
  change under the root workflow, not game work.
- **Commit to an art or content production approach.** Taste and cost, both the user's.
- **Cost money**, once or recurring.

Creating a scaffold, an asset pipeline, or a build is no longer on that list — but the
tooling each of those needs usually is, so the install gate is where they get decided.

The draft's own suggested starting point is **one small scene on the current computer
using synthetic Track data** — camera and movement, one coherent weather transition, a
readable Today view, and notebook interaction — measured before anything larger is
committed to. Synthetic data, always: a real personal Track export is
never test data here either.

## Definition of Done

A `World/` task is done only when all applicable statements are true:

- The requested change or analysis is complete, and its scope did not quietly widen.
- Anything built was actually run, or the fact that it was not is reported plainly.
- Decisions are recorded in the draft, and proposals are still labelled as proposals.
- No claim about Track's behaviour was written without checking the code.
- No Track file, stored data, or cloud state was modified.
- No dependency, install, purchase, or external service arrived without explicit approval.
- Relative links resolve, and reference imagery is identified as reference.
- `NOTES.md`'s "Start here" block names the current phase and the next increment, and is
  still forward-looking.
- Only intended files changed.
- No required work is hidden behind an unreported limitation.
