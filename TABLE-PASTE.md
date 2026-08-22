# Turning a picture of a table into a real table

You have a photo or a screenshot of a table and you want it inside a Track documentation
page, laid out exactly as it looks — including cells that span more than one row or column.

The route is: **show the picture to an AI → paste what it gives you into Track.**

---

## How to do it

1. Open any AI chat that can see images — Claude, ChatGPT, Gemini, whichever you use.
2. Attach the picture and paste the instructions in [What to ask the AI](#what-to-ask-the-ai)
   below.
3. Copy the block it replies with.
4. In Track: **Documentations → open a page → `▦ Paste table`**, paste, check the preview,
   press **Insert table**.

The preview in that dialog is drawn by the same code that draws the real table, so what you
see there is exactly what you get. If a row is malformed the dialog says which line and
refuses to insert anything — it never guesses.

You can skip the AI entirely and paste an ordinary markdown table, or type the format by
hand. It is designed to be readable either way.

---

## What to ask the AI

Copy everything in this box, and attach your picture:

> Read the table in this image and reproduce it EXACTLY in this format:
>
> ```
> ::: track-table
> | Region     | Q1  | Q2  |
> | North      | 50  | 60  |
> | South      | 45  | ^^  |
> | Total: 155 | <<  | <<  |
> :::
> ```
>
> Rules:
> - One line per row. Separate cells with `|` pipes.
> - EVERY row must have the same number of cells.
> - For a cell merged with the one to its LEFT, write `<<`
> - For a cell merged with the one ABOVE it, write `^^`
> - A merged cell must fill a whole rectangle of rows and columns.
> - Write `\<<` or `\^^` if a cell really contains those characters, and `\|` for a pipe.
> - Output only the block. No explanation, no extra text.

The same text is available inside the Paste table dialog itself, with a **Copy these
instructions** button — so you never have to come back to this file.

---

## The format

```
::: track-table
| Region     | Q1  | Q2  |
| North      | 50  | 60  |
| South      | 45  | ^^  |
| Total: 155 | <<  | <<  |
:::
```

| Token | Meaning |
| --- | --- |
| `\|` | separates cells |
| `<<` | this cell is absorbed by the cell to its **left** — a column span |
| `^^` | this cell is absorbed by the cell **above** — a row span |
| `\<<` `\^^` | a cell whose text really is `<<` or `^^` |
| `\|` inside a cell | a literal pipe |

### The one rule that matters

**Every row has the same number of cells, and the markers count as cells.**

That is what makes the format safe. A merged cell does not remove pipes from the row — it
leaves a `<<` or `^^` standing in the place it took over. So the text stays a clean
rectangle, and if a row comes back with the wrong number of cells, Track *knows* something
went missing and tells you which line. It never quietly builds a wrong table that looks
plausible.

### Things you do not have to worry about

- **The `:::` fence is optional.** Copying out of a chat's code block usually drops it.
  Fine — paste the rows alone.
- **``` fences work too**, in case the AI wraps it that way.
- **Outer pipes are optional.** `a | b` and `| a | b |` are the same row.
- **Blank lines are ignored.**
- **A markdown separator row (`|---|---|`) is skipped**, so a plain markdown table with no
  merged cells pastes correctly as-is.

---

## Worked examples

### A plain grid

```
::: track-table
| Language | Paradigm    | Year |
| Lisp     | functional  | 1958 |
| Smalltalk| objects     | 1972 |
| Prolog   | logic       | 1972 |
:::
```

Nothing merges, so nothing is marked.

### A header spanning two columns

```
::: track-table
| Quarter | Sales      | <<        |
| ^^      | Units      | Revenue   |
| Q1      | 1,204      | £48,160   |
| Q2      | 1,530      | £61,200   |
:::
```

Row 1: `Sales` takes both of the last two columns, so the third cell is `<<`.
Row 2: `Quarter` continues downward, so its cell is `^^`.

The result is a two-row header with `Quarter` tall on the left and `Sales` wide on the
right.

### A total row spanning everything

```
::: track-table
| Item       | Qty | Price |
| Notebook   | 3   | 4.50  |
| Pen        | 12  | 0.90  |
| Total: £24.30 | << | <<   |
:::
```

### A cell tall and wide at once

```
::: track-table
| Photo | <<  | Caption |
| ^^    | ^^  | Date    |
| A     | B   | C       |
:::
```

`Photo` occupies a 2×2 block in the top-left. Its three covered cells are marked: the one to
its right with `<<`, the one below with `^^`, and the diagonal one with `^^` as well —
anything inside the rectangle just needs *a* marker pointing back into it.

---

## When it refuses

The dialog will not insert a table it cannot read, and it says why:

| Message | What happened |
| --- | --- |
| *This row has 2 cells; the first row has 3* | A cell went missing. Ask the AI to redo it, or add the missing `\|`. |
| *`<<` in the first column has no cell to its left* | A `<<` at the start of a row has nothing to merge into. |
| *`^^` in the first row has no cell above it* | Same, upward. |
| *The merged cell starting at row 2, column 1 is not a rectangle* | The markers describe an L-shape or a staircase. No table can draw that — the merged area has to be a full block of rows and columns. |
| *Only one row found* / *Only one column found* | A table needs at least two of each. |

Nothing is inserted while an error is showing, so a bad paste costs you nothing.

---

## After it is on the page

The table is an ordinary Track table from that point on. Hover it and the controls appear:

- `+ row` `− row` `+ col` `− col` — resize the grid. The two removals ask first, because
  they do drop text.
- Click a cell, then `⇥ merge right` / `⇩ merge down` — merge by hand, without pasting.
- `⤫ unmerge` — split a merged cell back apart.

**Unmerging always gives you your text back.** Merging hides the covered cells, it never
erases them, so nothing you typed is lost by experimenting. That is also why merging does
not ask for confirmation.

Removing a row or column that a merged cell reached into shrinks that cell to fit rather
than deleting it.
