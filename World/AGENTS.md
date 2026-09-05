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

**Implementation is authorized. Nothing has been built yet.**

Those are two separate facts and both matter. The barrier is gone; the starting point has
not moved:

- No engine has been chosen. No engine has been installed.
- No code, project scaffold, asset pipeline, or build exists.
- No hosting, cloud service, store account, or subscription has been purchased or enabled.
- No benchmark has been run on the target hardware.
- The feasibility review in the concept draft records **proposals**, not approved decisions.

So building may begin, and it begins from zero with the open decisions still open. A
prototype, a scaffold, synthetic-data plumbing, and throwaway experiments inside `World/`
no longer need to be asked for twice. Choosing the engine, committing to an art approach,
spending money, installing anything, and touching Track's runtime remain stop-and-ask
steps — see "Stop for direction" below.

## Directory Contents

| Path | Responsibility |
| --- | --- |
| `AGENTS.md` | This file: mandatory agent procedure and safety rules for the game project |
| `TRACK-WORLD-CONCEPT-DRAFT.md` | The concept of record: intent, principles, world structure, Track-concept mapping, guardrails, open decisions, and the feasibility review |
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

Create `World/README.md` in the same change that lands the first thing it can describe —
not before it, and never as a place to hold plans. Plans belong in the draft's
open-decision sections until they are built.

## Non-Negotiable Rules

### Track data is not this project's to write

The Track application owns `track_db`. Section 18 of the concept draft lists fourteen
data-safety guardrails and they are binding on any future implementation, not aspirational.
The load-bearing ones, restated because they are the ones an implementation forgets:

- Track remains the truthful source for goals, dates, notes, deadlines, reviews, and
  completion state. The game displays; it does not decide.
- The game never silently reschedules an item, never carries an unfinished item into a new
  date at midnight, and never turns tomorrow into today at the evening preview.
- Ordinary movement, collision, proximity, weather, and platforming never modify Track data.
- The only write capability confirmed in the concept is **personal notebook notes**.
  Everything else — task completion, SIR, deadlines, calendar entries, and all structural
  goal editing — is deferred or excluded. Do not design around a write the concept has not
  granted.
- Unknown, failed, or pending synchronization is shown as such. Presentation must never
  imply a successful data change before Track has accepted it.

### Work in `World/` does not edit the Track application

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
- Only intended files changed.
- No required work is hidden behind an unreported limitation.
