# Track Concepts

The ideas Track is built on, in the user's own terms and confirmed with them. This file says
what things **mean** and **why**. [README.md](../README.md) says what the app does today, and
[NOTES.md](../NOTES.md) lists the changes still needed to make the app match this file.
Wherever the app does not match yet, the line says so.

Recorded 2026-10-08. The user is explaining the whole system in stages; the parts not covered
yet are listed at the end.

## The principle: Marginal Gains

Growth comes from many small improvements, repeated. Home says it: *"Growth is not the good
days. It is the count of them."* **MG always means Marginal Gains** — never "mindset" or
"goal".

## Words that are easy to mix up

| Word | Means | Not to be confused with |
|---|---|---|
| **Knowledge Record** | The page `sir-ks02.html`: every mind map and everything relating to it. It was the "KS02 Tracker". | the page's own **KS02** tab |
| **KS** | "Knowledge System", the old name behind KS02 and KS03 | — |
| **Declarative** / **Procedural** | The two learnable kinds of mind map. Stored as type `1` / `2`; shown as "T1" / "T2" until 2026-10-08. | SIR's review numbers T1–T5 |
| **Phase** (S1–S4) | One step of building a mind map | an SIR review |
| **Journal** | The notes widget's one free draft per day (`dateNotes`; its tab was called "Date") | a day note |
| **Day note** | A note placed on a day of the Schedule or a calendar (`calendarNotes`) | the Journal |
| **MG** | One change of focus (see below) | a goal |
| **Storage** | A source: a real place where material lives | knowledge |
| **Core Routine** | The supporting actions — the Schedule's ■ button (see below) | a **routine task**: a goal task repeated on chosen days, which belongs to **Chosen** |

Still to be renamed (NOTES, Proposal 17): the **KS02** tab, which shows mind maps by phase,
and the two screens both called **KS03** — the panel inside a mind map (phase, SIR,
connections, links, comments) and the top tab "MIND MAP STORAGE" (Multiverse and Source
Dump).

## Mind maps

- A **mind map (MM)** is how the user takes notes. One MM represents one topic.
- **Parent → child is an arrow of causation.** It means either
  - the child is **part of** the parent, or
  - the parent **has to be learned before** the child.

  Both meanings share one arrow, and an MM can have several parents.
- **Anchor** — a heading that groups other MMs. It has no phases and no MG.
- **Declarative** — knowledge to *know*: understand it and keep it. It is built through the
  four phases S1–S4, then kept by spaced review (SIR: after 1, 3, 7, 14 and 30 days).
- **Procedural** — an MM with a procedural application: knowledge to *do*. It is not learned
  in one go. It grows slowly, by gaining new information and experimenting in cycles:
  - it is built through the same phases S1–S4;
  - it has **no SIR** — spaced review does not fit learning in cycles;
  - every new **Kolb** on it brings new information, so it goes **back to S1**;
  - its progress toward a goal is its **MG level**, not its phase.

  The app works this way since 2026-10-11: a Procedural MM is kept out of SIR — one already
  stored in SIR reads as S4 and its sessions are not shown, until it is switched back to
  Declarative (README, "Spaced Interval Review") — saving a new Kolb sends it back to S1
  (README, "Kolb learning records"), and Progress judges it by its MG level alone (README,
  "Goals, tasks, and milestones"). An old Kolb moved onto a Procedural MM counts as a new one
  there and resets it too (decided 2026-10-13).

## Phases S1–S4

The phases of building an MM. Names are not chosen yet.

**A working idea, not definitive** (the user, 2026-10-19 — "a vague idea"). Each phase is
defined by what is true when it is **done**:

| Phase | Done when |
|---|---|
| S1 | The sources are managed and an overall **backbone** structure is formed |
| S2 | The approach is expanded to **three layers** |
| S3 | **All** layers are done |
| S4 | Everything has been rechecked — the **skin** |

Do not build anything that depends on this until the user confirms it. Still open: what a
"layer" is.

**A new Kolb still sends a Procedural MM back to S1** (confirmed 2026-10-19). Where new
information lands "really depends", but going all the way back to S1, rebuilding the backbone,
is the safest choice, so the app's current reset stays as it is.

## Kolb → MG (Procedural only)

```text
perform ─► Kolb ─► MG (new focus) ─► practise with that focus ─► the next Kolb …
```

1. **Experience** — what happened, and which level you are on (1–10). The level suggests a
   pre-written MG.
2. **Reflection** — the sequence of events, feelings, what was hard or went well, triggers,
   and why you acted that way.
3. **Abstract** — the habits or beliefs behind it, and where the same pattern shows up
   elsewhere.
4. **Experiment & MG** — what to try, and the **MG**.

**An MG is the change of focus that a reflected experience produces.** The app stores each
one as *old focus → new focus*. It is the focus the user will practise **no matter what**: it
is not scored or checked on its own, because the next reflection is the feedback — it says
which direction to go next. Decided 2026-10-08: do not add a "did this MG work?" field.

**Levels 1–10** follow the four stages of competence, and each level suggests what kind of MG
to look for — the pre-written MG the Kolb's step 4 offers. One level comes before the stages,
then two per stage (Low, Mid), then one at the end. Stages: **UC IC** unconscious incompetence,
**C IC** conscious incompetence, **C C** conscious competence, **UC C** unconscious competence.

The user's descriptions, sent 2026-10-19 (condensed; the full text lives in the app's level
templates):

| Level | Name | Stage | Where you are | The MG to practise |
|---|---|---|---|---|
| 1 | Underworld | before the stages | Not enough knowledge for even a slight action; cannot see the consequences. With no predictions, feedback is blind trial and error | Get information and a plan; analyse what is going on |
| 2 | Wander In Confusion | Low UC IC | Knows what actions lead to, but is not aware of what they are doing; very hard to evaluate | Dissect what you do into awareness: find the cue → response pattern, and when things fall off |
| 3 | Gather Pieces | Mid UC IC | Aware, but inconsistently; notices some patterns | List the cues, regulate, follow the scripted response; focus on the prediction |
| 4 | Eye of Judgment Activated | Low C IC | Can answer "feel and respond" in a Kolb, name the habitual response and script the cues; understands enough to judge by prediction; aims for a partly right path, not a perfect one | An atomic dose of the procedure: align with it, or try another style to get different errors |
| 5 | LongTerm Mistake Hunter | Mid C IC | Sees nothing done right, then slowly what could be right. Asks: *when do I take more theory?* | Fix the previous mistake; target it |
| 6 | Random Hit Slow Performer | Low C C | Has had one perfect run, but is easily pulled back into incompetence | Target the mistakes that repeat or form a pattern; maybe score every session |
| 7 | Locked by Locked In | Mid C C | Performs ideally when hyper locked in, and must trust that locking in works | Recall every possible mistake and keep locking in |
| 8 | Be Used to Crushing | Low UC C | Starts to feel the mistake list is not needed | Sharpen the MG to something very vague that still covers every important aspect |
| 9 | The Meditation | Mid UC C | Almost natural; needs a confidence boost | Kill the MG: deliberately go without both the MG and the guides |
| 10 | You're here... | UC C | Completely natural; crushes everything | If new mistakes turn up, make a new MG or go back to Mistake Hunter (5) |

Levels 8 and 9 are labelled "UC IC" in the app's templates; the structure puts them in UC C,
so that is read as a typo — not yet confirmed. **These descriptions are the definition.** A
checkable reading of them is in NOTES, Proposal 17. The user said it "wasn't wrong", but could
not frame the levels better than the descriptions above.

## Sources

- **Source Dump** — raw material, one title per source (a book, an article, a lecture). Under
  a title, each MM that the source informs gets a **Source & Cite** section with excerpts and
  links. An MM's **S&C** tab gathers every section written for it.
- **True Storage** — a storage is a **source**, not knowledge: a real place where material
  lives. Storages are tagged to the Source Dump sections they relate to.

## The Schedule's four kinds of work

Confirmed 2026-10-14. A day's work comes in four kinds, and each Schedule day has one add button
per kind:

- ★ **Forced** — what the day imposes: day notes, deadlines and the **timetable** — the classes
  a pasted timetable or a hand-added block puts on a day. The timetable joined Forced on
  2026-10-15: its details live on ★ Forced's Timetable tab, and each class is a block that can be
  changed, given notes and removed from a day like any other.
- ● **Learn** — mind maps to study and MGs to practise. What a milestone still needs comes first:
  - the MG of a Procedural mind map whose MG level is below the level that day's milestone asks
    for;
  - a Declarative mind map short of its milestone;
  - the SIR reviews due that day.

  "That day's milestone" is the one whose dates cover the day. Example: Guitar at level 3, with
  Chapter one asking for 5, is highlighted on every day of Chapter one until a Kolb records level
  5.
- ▲ **Chosen** — the to-do the user picked: goal tasks, routine tasks and milestone tasks.
- ■ **Core Routine** — the supporting actions.

The app works this way since 2026-10-14 (README, "Schedule and supporting actions").

**Each button ADDS its kind of work to the day** (confirmed 2026-10-21). ★ Forced works the way the
other three do: a day note or a deadline is on the hour grid only once it is picked there, and each
pick puts one block on that day — a normal block, ticked when that session is done — so a deadline
can be given several prep sessions. A deadline picked on a day it does not warn on yet makes that
day one of its caution days. Until 2026-10-21 every note and deadline had a block by itself, and
★ Forced's own buttons (`＋`, `remove from schedule`, `＋ add block back`) were the user's complaint:
they did not mean anything as "adding".

**A note or deadline can be dissected into sub-tasks — its child tasks — and the original is not
gone** (confirmed 2026-10-21 / 22): "make the original one the parent and make the ones that I name
all as child", and, correcting a build that hid the original behind them, "when I dissect it it'll
become like a child task to the original task (the original is not gone)". Dissecting is breaking
one piece of work into named steps, not renaming it. It happens in ★ Forced, where work is put on a
day: a sub-task waits off the schedule until it is put on a day, it is on one day only, and the
original is done when all its sub-tasks are.

## Not covered yet

**The theory of how learning works**, which the system is built on. It comes from the user's
program, **iCanStudy**, and the user will explain it (noted 2026-10-19). Take it from them; do
not fill the gaps from general knowledge of the program. The parts below probably rest on it.

Progress (goals, milestones, quests), the rest of the Schedule, Documentations, Home, and where
the Journal sits in the learning loop.
