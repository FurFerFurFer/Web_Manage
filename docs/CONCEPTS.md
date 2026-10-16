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

The phases of building an MM. Names and descriptions for each phase are not defined yet.

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
to look for. The user will send their level descriptions so each level can be given criteria
that can be checked rather than judged by feel (NOTES, Proposal 17).

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

## Not covered yet

Progress (goals, milestones, quests), the rest of the Schedule, Documentations, Home, and where
the Journal sits in the learning loop.
