# Turning a picture of a table into a real table

You have a photo or a screenshot of a table and you want it inside a Track documentation
page, laid out exactly as it looks — including cells that span more than one row or column.

The route is: **show the picture to an AI → paste what it gives you into Track.**

---

## How to do it

1. Open any AI chat that can see images — Claude, ChatGPT, Gemini, whichever you use.
2. Attach a clear picture of the whole table and paste the instructions in
   [What to ask the AI](#what-to-ask-the-ai) below. For a dense or small table, also attach
   overlapping close-up crops: the whole image establishes the grid and the crops make the
   text readable.
3. If the reply includes an **Outside text** list, keep that separate. Copy only the
   `::: track-table` block into Track.
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

> Read this image, separate any text outside the table, and reproduce the table EXACTLY in this format:
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
> Separate surrounding text BEFORE building the grid:
> - The table begins and ends at its complete outside border.
> - Any heading, caption, note, or paragraph beyond that border is OUTSIDE TEXT, not a table cell.
> - Never turn outside text into a table row or merged cell.
> - Preserve each distinct outside-text item in reading order; join lines that are only visual wrapping.
>
> Determine the structure BEFORE transcribing the text:
> - Use a full-table image to count the smallest underlying columns and rows.
> - Trace every internal horizontal and vertical border segment.
> - Treat cells as merged only when their shared border is clearly absent along the entire edge: vertical for a column merge, horizontal for a row merge.
> - Never infer a merge from centered text, an empty cell, text wrapping, or row height.
> - A blank cell is still a real cell unless a missing border proves it is merged.
> - If close-up images are also supplied, use the full image for structure and the close-ups for text.
>
> Rules:
> - One line per row. Separate cells with `|` pipes.
> - EVERY row must have the same number of cells.
> - For a cell merged with the one to its LEFT, write `<<`
> - For a cell merged with the one ABOVE it, write `^^`
> - A merged cell must fill a whole rectangle of rows and columns.
> - Write `\<<` or `\^^` if a cell really contains those characters, and `\|` for a pipe.
> - If any border, merge, or text is unclear, DO NOT GUESS. Ask for a higher-resolution full-table image plus overlapping close-up crops.
> - If outside text exists, write `Outside text:` before the block and list each distinct item with a dash. Then write `Table paste:` and the block.
> - If no outside text exists, output only the block.
> - Add no explanation beyond the outside-text list and the block.

The same text is available inside the Paste table dialog itself, with a **Copy these
instructions** button — so you never have to come back to this file.

### Image quality matters

Keep the complete outside border and every internal grid line visible in the full-table
image. Prefer the original screenshot, scan, or PDF export over a messaging-app thumbnail;
for a photo, shoot straight on and avoid glare across the lines. Close-up crops should
overlap so no row boundary disappears between them. Do not send only close-ups: they improve
the transcription, but they cannot prove how a merge connects across the complete table.

This separates two jobs that need different views. The full image is authoritative for cell
geometry; the close-ups are authoritative for small text. If either remains ambiguous, the
brief tells the AI to ask for a clearer image instead of silently inventing a plausible cell.

### Text outside the border

A heading above the table, a caption below it, or a note beside it is not table data. When
the AI detects any of these, its response keeps them out of the fence and lists them in
reading order:

```text
Outside text:
- Nisit will receive an S grade when every criterion below is met.

Table paste:
::: track-table
| Criterion 1 | Attend every activity |
| Criterion 2 | Score at least 80%    |
:::
```

Copy only the fenced block into Track. A long outside paragraph that merely wraps across
several image lines stays one list item; genuinely separate headings, captions, or notes get
separate items. This preserves all visible text without falsifying the table's geometry.

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
- Click a cell, then `↑ row` `↓ row` `← col` `→ col` — move that whole row or column one
  step. A merged region moves as one piece, and a plain row beside one steps clear over
  the whole thing rather than into the middle of it, so one press is always one line.
  Nothing is dropped, so these do not ask. The first row is still drawn as the header, so
  a row moved to the top **becomes** the header.
- `⇔ auto width` — put every column back to an equal share. This one asks, because it
  clears widths you dragged.

**Unmerging always gives you your text back.** Merging hides the covered cells, it never
erases them, so nothing you typed is lost by experimenting. That is also why merging does
not ask for confirmation.

Removing a row or column that a merged cell reached into shrinks that cell to fit rather
than deleting it.
