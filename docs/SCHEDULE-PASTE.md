# Turning a picture of a timetable into a real schedule

You have a photo or a screenshot of a timetable — a university term grid, a shift rota, a
class schedule — and you want those hours showing up on your Track schedule, behind the
work you actually plan.

The route is: **show the picture to an AI → paste what it gives you into Track.**

---

## What you get

The classes are drawn on all three hour grids — the Progress timeline, the Home calendar,
and any Documentations calendar block — as **transparent, dashed blocks behind your real
work**.

They are deliberately not tasks:

- **Not tickable.** A lecture is not something you complete; it happens whether or not you
  tick it.
- **Not draggable, not resizable.** It is a fixed external constraint. Moving it in Track
  would not move the class.
- **They never push your real blocks around.** A class takes the full width of the column
  *behind* everything else, so a task scheduled on top of one is exactly the size it would
  be with no timetable at all.

What you *can* do is click one on the Progress timeline. That opens a small read-only card
showing the class, and a **＋ day note here** button that starts a real day note on that
day, at that hour, already the length of the class.

---

## How to do it

1. Open any AI chat that can see images — Claude, ChatGPT, Gemini, whichever you use.
2. Attach a clear picture of the timetable and paste the instructions in
   [What to ask the AI](#what-to-ask-the-ai) below. For a dense grid, also attach
   overlapping close-up crops: the whole image establishes which column is which day, and
   the crops make the text readable.
3. In Track: **Documentations → open a page → `🕘 Timetable`** to add a Timetable block,
   then **`🕘 Paste a timetable`**.
4. Paste, set the **repeat range** if the AI used weekday names, check the preview, press
   **Add timetable**.

The preview is drawn by the same code that lists the stored classes, so what you see is
what you get. If a row is malformed the dialog says which line and refuses to add anything
— it never guesses.

You can skip the AI entirely and type the format by hand. It is designed to be readable
either way.

---

## The format

```
::: track-schedule
| Mon        | 09:00-10:30 | Mathematics    |
| Mon        | 10:45-12:00 | Physics        |
| Wed        | 13:00-16:00 | Chemistry lab  |
| 2026-09-14 | 09:00-10:30 | Makeup lecture |
:::
```

Three cells per row: **day**, **time**, **title**.

| Cell | What goes in it |
| --- | --- |
| day | A weekday — `Mon`, `Tuesday`, `weds`, `Thurs`, `Fri`, `Sat`, `Sun` — **or** a date, `2026-09-14` |
| time | A range, `09:00-10:30`, or just a start, `09:00` |
| title | The name of the class. `\|` if the title really contains a pipe |

### One format, both kinds of timetable

This is the part worth understanding, because it is the only choice you have to make:

- **A weekday** means *every week*. `Mon` repeats on every Monday inside the repeat range
  you set in the dialog. This is what a term timetable is.
- **A date** means *once*. `2026-09-14` happens on that day and never again. This is what a
  one-off day, a makeup lecture, or an exam is.

You can mix them freely in one paste — the example above does. You never pick a mode; each
row says which kind it is.

The repeat range only appears in the dialog when at least one row uses a weekday, and
either end can be left blank for *no limit*. A term runs `2026-09-07 → 2026-12-19`; an
open-ended routine can just start and never stop.

### Times

- `09:00-10:30` is a 90-minute block.
- `09:00` on its own is a 60-minute block — the same default length every Track block
  starts at.
- `-`, `–`, `—` and the word `to` all separate a range, so `9:00 to 10:30` works.
- 24-hour time. A single-digit hour is fine: `9:05`.

---

## What to ask the AI

Copy this and send it with the picture. It is also inside the Paste dialog, behind
**Copy these instructions**, so you never have to come back here for it.

> Read this image of a timetable and reproduce it EXACTLY in this format:
>
> ```
> ::: track-schedule
> | Mon        | 09:00-10:30 | Mathematics    |
> | Mon        | 10:45-12:00 | Physics        |
> | Wed        | 13:00-16:00 | Chemistry lab  |
> | 2026-09-14 | 09:00-10:30 | Makeup lecture |
> :::
> ```
>
> Three cells per row, in this order: day, time, title.
>
> The day cell:
> - Use a weekday name (Mon, Tue, Wed, Thu, Fri, Sat, Sun) when the class REPEATS every week.
> - Use a YYYY-MM-DD date when it happens once on a specific day.
> - If the timetable shows dates rather than weekday names, use the dates.
> - One row per class per day. A class on both Monday and Thursday is TWO rows, never "Mon/Thu".
>
> The time cell:
> - Write a range as 09:00-10:30, in 24-hour time.
> - If only a start time is shown, write just that start time.
> - Convert any 12-hour time to 24-hour: 1:30pm becomes 13:30.
> - Never invent an end time. If the end is not shown, give only the start.
>
> The title cell:
> - The name of the class as printed. Add a room or lecturer after it only if the picture shows one, like: Physics · R204
> - Never leave a title empty.
>
> Read the grid before transcribing:
> - Work out which column is which day and which row is which time slot first.
> - A block spanning several time slots is ONE row with the full range, not one row per slot.
> - An empty cell in the grid is a free period. Do not write a row for it.
> - Ignore headers, legends, week numbers, and any text outside the timetable grid itself.
>
> Rules:
> - One line per class. Separate the three cells with | pipes.
> - EVERY row must have exactly three cells.
> - Write \\| if a title really contains a pipe.
> - If any day, time, or title is unclear, DO NOT GUESS. Ask for a higher-resolution image, or a close-up of the part that is unclear.
> - Output only the block. Add no explanation, no heading, and no summary.

---

## The one rule that matters

**Every row has exactly three cells.**

That is what makes the format safe. If a row comes back with two cells or four, Track
*knows* something went wrong and tells you which line — it never quietly builds a schedule
with a class at the wrong hour. A wrong timetable is worse than no timetable, because you
plan against it.

---

## What it tolerates

You do not have to be precise about the wrapping:

- The `::: track-schedule` fence is optional, and ``` ``` ``` is accepted too — copying out
  of a chat's rendered code block often loses the fence.
- The outer `|` pipes are optional. `Mon | 09:00-10:30 | Maths` is fine.
- Blank lines are ignored.
- A markdown separator row (`--- | --- | ---`) is skipped.
- A header row (`Day | Time | Subject`) is skipped — but only when its first cell is not
  itself a day, so a real Monday row is never mistaken for a header.

So an ordinary markdown table pastes correctly with no extra work:

```
Day | Time        | Subject
--- | ---         | ---
Mon | 09:00-10:30 | Mathematics
Wed | 13:00-16:00 | Chemistry lab
```

---

## When it refuses

The dialog will not add a timetable it cannot read, and it says why:

| Message | What happened |
| --- | --- |
| *This row has 2 cells; every row needs exactly 3* | A cell went missing. Ask the AI to redo it, or add the missing `\|`. |
| *Could not read "Someday" as a day* | The day cell is neither a weekday name nor a `YYYY-MM-DD` date. |
| *Could not read "period 3" as a time* | The time cell is not `HH:MM`. Slot numbers are not times — ask for the actual clock times. |
| *This block ends at 09:00, at or before it starts at 10:00* | The range is backwards, or the two times were swapped. |
| *This row has no title* | Every block needs something to show. |
| *That range ends before it starts* | The repeat range is inverted. Nothing would ever be drawn, so it is refused. |

Nothing is added while an error is showing, so a bad paste costs you nothing.

---

## After it is on the page

The Timetable block lists everything that page pasted, grouped by import:

- **`✕`** on a single row removes that one class.
- **`✕ remove all`** on an import removes that whole paste. Both ask first — there is no
  undo in Track.
- **`⧉ copy as text`** gives you the block back in this same format, so you can hand it to
  an AI to amend and paste the corrected version in.

Classes are switchable off like anything else on a calendar: in a Documentations calendar
block, **`⚟ Filter`** has a **Timetable** entry.

### If you delete the page

Deleting a documentation page does **not** delete the classes it pasted — the same rule
that keeps day notes and deadlines alive when their page goes. They stay on your schedule,
and any Timetable block will list them in an amber *from a page that no longer exists*
section, where you can still remove them. Nothing becomes unreachable.

---

## What this does not do

**No image is ever read by Track.** The recognition happens entirely in whatever AI you
show the picture to, and how accurately it transcribes is outside Track altogether. Always
glance at the preview before pressing Add — that is the moment to catch a hallucinated
09:00.
