# Track World — unfinished work

## User-directed demo revisions

- Match the whole movement system to the selected Breath of the Wild reference, retaining
  the user's "exact copy" target.
- Add floating islands reached by the referenced slingshot-style upward launch, then
  gliding. Island layout, launch locations and movement tuning remain unfinished.
- Bring notes, mind maps, and Today information formats into alignment with the user's
  Track website. Provide full applicable information in each opened panel, without a
  required summary step; review the actual Track surfaces before revising the panels.
- Keep the game running while panels are open. Give the panel input focus without
  pausing character/world simulation; test typing and panel switching during traversal.
  The character is not in danger, so opening needs no protective landing or relocation.
- Deliver the confirmed "MM in sky" feature; the ground stars and current MM panel do not
  fulfill the grounded KS03 sky-view requirement below.
- Investigate the reported touchpad rotation stopping during movement. Preserve the
  preferred tap/double-tap drag control while allowing simultaneous movement.
- Implement real weather with custom control, or use the authorized random fantasy
  alternative if the live connection is too complicated. Location/provider/privacy/feed
  fallback decisions apply only to the live branch. For the fantasy branch, develop the
  invited snow, heavenly skies, intense rain, floods and other occurrences through one
  coherent environment system; test non-dangerous traversal and readable panels throughout.
- Let another bottom tab switch panels directly without closing the current panel first.
- Start with a fixed character; settle its appearance before producing the final avatar.
- Create a garden home separate from the sanctuaries; their detailed designs remain open.
- Use visual reminders with gentle sounds; settle sound design and grouping.
- Add a Quest panel and show the starred rollup in the bottom contextual popup. Track gained
  the Quest feature on 2026-09-07; the design is recorded as a **proposal** in Section 21 of
  the draft, not as settled direction. It would be read-only, and against synthetic fixture
  quests until the Section 25.6 read adapter exists — exposing `scripts/quest-core.js` as a
  third read-only module through the demo server is the natural mechanism. No reward layer:
  Section 11 already rejects one, and "quest" here is the user's word for a curated list.

## Review the first scene before expansion

- Playtest movement, camera speed/distance, jumping, steps, the bridge and notebook entry
  on the actual laptop. Report uncomfortable motion, snagging or camera obstruction.
- Complete the Section 25.13 hardware procedure: power mode, driver/browser version,
  viewport/internal resolution and fixture size; repeated warmed clear/rain/night routes,
  cold/warm loading and a sustained 20-minute session. Assess 30 fps at 720p and p95 near
  or below 40 ms. Headless SwiftShader readings do not satisfy this gate.
- Profile CPU/GPU cost and memory stability before increasing scene size or effects.
- Verify camera occlusion, side-on collision, step/slope limits, run speed and fall recovery
  over the full route; the initial browser case covers a short walk and jump only.
- Review the simple shapes and panel hierarchy with the user before production assets.

## Complete the initial proof gates

- P1: complete the sustained route and controls review, including irregular terrain.
- P2: extend synthetic fixtures to the full Section 25.13 matrix: malformed/legacy slots,
  moved/split blocks, routine occurrences, goal identity, dense/empty data, full action
  drafts, long content, browser zoom, IME composition and focus across all interaction
  paths. Add explicit context-loss and repeated load/unload tests.
- P2: replace the three-position demo clock with the proposed real local-time behavior,
  including suspend/resume and truthful dated unfinished-work/history views. Retain
  synthetic-only testing until real integration is separately authorized.
- P3: validate the runtime cel shader, coherent environment over the whole scene, audio
  layers, and one approved Blender-to-GLB asset loop. The independent night light study
  does not implement the final shared clock/environment contract.
- Verify the chosen unpaused panel behavior, input focus and passive movement across
  jumping, climbing, gliding and swimming as each is implemented. Review whether the
  current lack of pointer lock feels right. Keep advanced movement and notebook animation
  for their own proofs.

## Later confirmed requirements

- Grounded KS03 sky projection, dense-network readability, matched grove/star SIR cues,
  full selected-MM information, and all applicable MG/Kolb/SIR/+Lin/source actions.
  The current name/observation drafts are only the first interaction study.
- Stable slot worlds, natural routes, regional/landmark gateways, goal geography and
  truthful completed/reopened history through P4/P8.
- Separate Track-owned safe read/write commands, conflict/retry/recovery, then real
  integration through P5–P7. Never make the demo's memory storage into a Track writer.
- Persistent game state and draft recovery; current demo drafts reset on reload.
- Art production choices, avatar/rig/book attachments, climbing/vaulting/swimming,
  private release and recovery. Scope and approval gates remain in `AGENTS.md` and the
  concept draft; no installation or deployment follows automatically from this list.

Phone/iPad gameplay remains deferred. If work becomes advanced or leaves the agreed
plan, follow the Ultra escalation rule before continuing that part.
