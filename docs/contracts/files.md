# Contract: `files` and the FILES tab

**Mandatory rules, with the same authority as `AGENTS.md`.** Read this file before changing
the `files` slot field, `scripts/files-core.js`, `scripts/file-store.js`,
`scripts/files-view.js`, `true-storage.html`'s `_mutateFiles` / FILES loader, the
`track_files_v1` IndexedDB database, or anything that talks to Google Drive.

Added 2026-11-13 with the FILES tab on the Storages page; highlights and page pins the same day.
Pen strokes, text highlights, bookmarks, pin ranges and ink on a note: 2026-11-15.
Pins turned on in the Outline, the kept page, and full screen: 2026-11-18.

---

## What is stored where

| What | Where | Synced |
| --- | --- | --- |
| Folders, notes, one record per file (name, order, size, MIME, Drive id) | slot field `files` in `track_db` | yes, with the workspace |
| A note's text (≤ 256 KB, `NOTE_MAX_BYTES`) | the note's record, `text` | yes |
| A PDF's or an image's marks, page pins and bookmarks, and a note's marks (≤ 256 KB together a record, `MARKS_MAX_BYTES`) | the record, `highlights`, `pins` and `bookmarks` | yes |
| A file's bytes | Google Drive ("Track Files" folder), and a copy per device in IndexedDB `track_files_v1` | Drive only |
| The upload queue, the Drive folder id | `track_files_v1` (`queue`, `meta` stores) | never — per device |
| The Google access token | memory, and this tab's `sessionStorage` (`track_drive_token_v1`) until its expiry | never |
| Where full screen's tool strip sits | this device's `localStorage` (`track_files_tools_pos`) | never |
| Which pins are on in the Outline | the open viewer's memory only | never |

- **A file's bytes never go into `track_db` or `localStorage`.** Not as base64, not as a
  data URL, not "just for small files". The ~5 MB quota and every sync upload depend on it,
  and a browser case asserts it.
- **The access token is kept for ONE TAB, until its own expiry, and nowhere else.** Until
  2026-11-16 it was never stored at all; the user's request that Drive connect by itself
  ("make the drive autoconnect when loading in") is what changed that, and only this far:
  `sessionStorage`, key `track_drive_token_v1`, `{token, expiresAt}`. **Never `track_db`,
  never `localStorage`, never IndexedDB** — nothing that syncs, exports, outlives the tab or
  reaches another tab. An expired or malformed copy is removed and ignored; whatever forgets
  the token (a 401, Disconnect, its expiry) removes the copy in the same step
  (`forgetToken`). Widening this — `localStorage`, a refresh token, a server — is a decision
  for the user, not a fix.
- `track_files_v1` is a device cache plus a queue. Nothing in it is the only record of
  anything **except** a file whose upload has not finished, which is why "Free up" keeps those.

## Records

`{id, kind, name, createdAt, updatedAt}` plus, by kind:

- `folder` — nothing else.
- `note` — `text` (a string, possibly empty). Its name always ends `.md`. It may carry
  `highlights` (below), drawn on its Preview; never `pins` or `bookmarks`.
- `file` — `size` (bytes), `mime` (absent when the browser gave none), `driveId` (absent
  until an upload finished), and the viewer's marks, each absent when there are none:
  - `highlights` — every mark, of three kinds told apart by `tool` (`markKind`). Stored order
    is drawing order. `page` is 1-based (an image is page 1; a note's Preview is cut into
    pages `NOTE_PAGE_RATIO` tall). Every coordinate is a fraction 0–1 of the page's rendered
    box — pdf.js's viewport, which includes the page's own rotation, the image's natural
    size, or the note's fixed-width sheet.
    - no `tool`: `{id, page, color, w, pts, createdAt}` — a freehand highlighter stroke.
      `color` is one of `COLORS` (`yellow`, `green`, `blue`, `pink`); `pts` is
      `[x0, y0, x1, y1, …]`, at most 200 points.
    - `tool: 'pen'`: the same shape, `color` one of `PEN_COLORS` (`black`, `red`, `blue`,
      `green`).
    - `tool: 'text'`: `{id, page, color, tool, rects, createdAt}` — a highlight over selected
      text. `rects` is `[x, y, w, h, …]`, one box a line (`lineRects`), at most `RECTS_MAX`
      (400) boxes; `color` is one of `COLORS`.
    - any other `tool` was written by a later version: readers skip it, writers keep it.
  - `pins: [{id, page, pageEnd?, name, createdAt, updatedAt}]` — a named page, or a range
    when `pageEnd` > `page`. **A one-page pin has no `pageEnd` key** (`pinEnd` reads it, and
    reads an unusable value as one page). `updatedAt` is the pin's last edit.
  - `bookmarks: [page, …]` — page numbers, each once, in the order made (`bookmarksOf`
    reads them sorted).

A record inside a folder has `parentIds: [folderId]` — **one** parent, in the same shape as
mind maps so `TrackMMTree` can walk it. At the top level the key is **absent**, never `[]`:
a move to the top deletes it. Sibling order is the records' order in the list; there is no
order field. An unknown `kind` reads as a file. Ids are strings from `TrackStorage.newId()`.

## Rules

1. **One writer per rule.** Every change to `files` is a `files-core.js` writer (`withAdded`,
   `withRenamed`, `withText`, `withDriveId`, `withRemoved`, `withMoved`, `withArranged`, and
   the marks writers of rule 13). They
   spread records, keep unknown keys, return the input list unchanged for a no-op, and hold no
   date code and mint no ids (`now` and `id` are parameters; the structural case pins it).
2. **Only `true-storage.html` writes `files`, and only through `_mutateFiles(slotId, fn)`** — a
   fresh read-modify-write of that key alone, never an autosave and never from React state.
   It answers the stored list, `null` (nothing to write: a no-op, or the slot is gone), or
   `false` (the save was refused). The FILES tab tells `false` apart and says so.
3. **Writes are bound to the workspace they were made in.** `mutateFiles(fn, slotId)` takes
   the slot the tab was showing; an upload finishing later writes its Drive id into ITS slot
   (`onFilesUploaded`), which may not be the one on screen.
4. **An upload is ordered: bytes on the device, then the record, then the queue.** A refused
   save drops the bytes again; a tab closed between record and queue is caught by
   `ensureQueued` the next time FILES opens. So a record never points at bytes nobody has.
5. **A Drive id is never overwritten.** `onFilesUploaded` writes it only into a record that
   has none, and answers `false` — which sends that Drive copy to Drive's trash — when the
   record is gone, the save was refused (the bytes stay here and upload again), or another
   tab already recorded a different copy.
6. **Deleting a folder deletes nothing in it**: each child moves up to the nearest surviving
   ancestor, the top level when there is none (`withRemoved`, cycle-guarded).
7. **Deleting a file sends its Drive copy to Drive's TRASH** (`PATCH {trashed: true}`),
   restorable for 30 days — never `DELETE`. Its device copy and any pending upload go at once.
8. **A move cannot nest a folder in its own branch, nor anything in a file**
   (`moveRefusal`: `self`, `inside`, `not-folder`). A refused drop writes nothing and says why.
9. **Rename keeps the extension** (`renamedName`); an empty name is impossible. A file's Drive
   copy is renamed after it; a rename during an upload is carried into the finished copy.
10. **Nothing of FILES loads until the tab opens — except its pure index.** `file-store.js`
    and `files-view.js` are injected by `loadFilesScripts` (their `?v=` values live in
    `FILES_SCRIPTS`). PDF.js, marked, DOMPurify and Google's sign-in load only when first
    needed. Since 2026-11-14 `files-core.js` (and `mm-tree-core.js` under it) is loaded WITH
    the page by `true-storage.html` and `sir-ks02.html`, because a Source Dump text block's
    file chip needs a file's name on any tab; it is pure — no Drive, no IndexedDB, no viewer.
    `index.html`, `progress.html` and `documentations.html` reference none of it. A browser
    case checks all of this.
11. **A note's Preview goes through DOMPurify**, always; links open in a new tab with
    `noopener`. Never render note text, or an uploaded `.md`, as raw HTML.
12. **Highlights and pins never touch the file.** No mark changes the bytes on the device or
    in Drive, sends a Drive request, or shows on a tile or in the tree; Download and Share give
    the original. A browser case compares the device copy's SHA-256 and watches the network.
13. **Marks have their own writers and no date code**: `withHighlight`,
    `withoutHighlights`, `withHighlightsRestored`, `withPin`, `withPinEdited`,
    `withPinRenamed`, `withoutPin`, `withBookmark`, `withoutBookmark`. The highlight writers
    act on `kind: 'file'` and `kind: 'note'` records; the pin and bookmark writers on
    `kind: 'file'` only. They validate what they are given (a whole page, an even `pts` of at
    least two points all in 0–1 or `rects` in fours inside the page with a size, a colour of
    the mark's own kind, a name through `cleanName`, a `pageEnd` not before `page`), refuse a
    repeated id, spread, and keep a malformed item they did not write. **None stamps the
    record's `updatedAt`** — not a file's, because the file did not change (the rule
    `withDriveId` follows), and not a note's, because its text did not. **No mark writer
    touches a note's `text`.** Removing the last one DELETES the key; a pin made one page
    DELETES `pageEnd`.
14. **One budget per record:** 256 KB of `highlights`, `pins` and `bookmarks` together
    (`marksFit`). A writer past it returns the list unchanged; the viewer checks `marksFit`
    first and says the highlights are full. Undo is not held to it: it only returns what was
    stored.
15. **A stroke is stored simplified**: `simplifyStroke` (Ramer–Douglas–Peucker, both ends
    kept, distances measured with the page's height/width ratio so x and y count alike),
    clamped to 0–1, rounded to 4 decimals, thinned to 200 points. A stroke shorter than
    0.004 page widths is a tap and is not stored.
16. **Input:** an Apple Pencil (`pointerType 'pen'`) always draws; a finger or a mouse only
    while `🖍` or `✒` is on; with `⌫` on, every pointer erases. **With no tool on, the marks
    layer takes no pointer at all** (`pointer-events: none`), so the PDF's text under it can
    be selected and a finger scrolls; its listeners are therefore on the SURFACE under it
    (the PDF page, the image's frame, the note's sheet), and a press counts only inside the
    layer's own box. With a tool on, the text layer steps aside (`data-off`). The touch
    listeners are **native and non-passive** (React's are passive) and cancel a touch only
    for a stylus, for every touch while a tool is on, or for a palm during a Pencil stroke —
    never a finger with no tool on, which must scroll. One stroke at a time; it stays on the
    page it started on (pointer capture, clamped).
17. **Mark colours are DATA colours** (`MARK_COLORS`, `PEN_INK` and the finder's `FIND_COLOR`
    in `files-view.js`), the same in both appearances, and reach the SVG through `style`,
    never a presentation attribute (`docs/contracts/appearance.md`). A note's sheet is white
    in both appearances for the same reason: ink is drawn for a white page.
18. **A text highlight is the selection's boxes, not its words.** `selectionMarks` reads only
    text nodes inside a page's text layer; `lineRects` joins them into one box a line; one
    selection is ONE write, with one mark per page it covers. The words are not stored.
19. **The finder writes nothing and searches only what the panel's list covers.**
    `scopePages(rec, scope, total, ids)` is the one definition of each list — all pages, the
    bookmarks, the pages with marks, every pin's range, or one pin's — cut down to the pins
    turned on (`ids`) when any is, and the finder scans exactly those pages. Text is compared through `searchNorm` (NFKD, lower case, runs of
    whitespace as one space); `findRects` depends on it giving, one character at a time, what
    it gives for the whole text.
20. **Ink on a note is positioned on a sheet of one fixed width** (`PAPER_W`, 720 CSS px,
    scaled to fit a narrower pane), so a line breaks where it broke when the ink was drawn.
    It does not follow the text: an edit above a stroke leaves the stroke where it was. That
    is a stated limit (README, NOTES), not a defect to patch by moving marks.
21. **Which pins are on is viewer state, never stored** (2026-11-18). Not on the record, not in
    `localStorage`: turning a pin on or off writes nothing, and a file opens with none on.
    `shownPages(rec, ids, total)` is the one definition of the pages a PDF shows — the union of
    the chosen pins' ranges, clipped to the PDF, each page once in ascending order, or **every
    page when no stored pin is chosen** (an id naming no pin counts as not chosen, so a pin
    deleted on the other device turns itself off). The viewer, the rail (`stepPage`), the pad,
    every panel list and the finder all read that one list; `nearestPage` picks where the view
    goes when the page being read leaves it. A browser case asserts the bytes do not change.
22. **The page you are on survives every re-layout of a PDF.** Anything that changes the
    pages' width, which pages are shown, or a page's own shape (`geom` in `PdfView`) re-reads
    the page at the top of the pane BEFORE the new layout paints and puts it back after
    (`useLayoutEffect`); an explicit jump overrides that once. **Scrolled to the very end, the
    page held is the one the rail names there — the last — not the page at the top**, and the
    view stays at the end while that page is still the last shown. The PDF scroller sets
    `overflow-anchor: none` so the browser's own scroll anchoring never adds its correction to
    this one (Chrome's anchoring had been hiding the missing restore). A note's Preview keeps
    its place in the sheet the same way when its scale changes (`NotePaper`).
23. **Full screen is the same viewer, laid over the window** (2026-11-18): a fixed overlay at
    z-index 47 inside `#root` — above the phone tab bar (46) and the pages panel, **below** the
    toast and dialogs (50), so Undo and every confirm stay reachable — plus the browser's own
    Fullscreen API on `document.documentElement` where it is allowed (a refusal leaves the
    overlay working). The tools move into `ToolStrip`; its place is `{x, y}` fractions 0–1 of
    the free room in `track_files_tools_pos`, read in `try/catch`, clamped, and written only
    when a drag ends. **Its grip draws nothing and writes nothing to `track_db`**: it captures
    the pointer, sets `touch-action: none` and cancels its own `touchmove` natively. Escape
    leaves full screen only when nothing else has it — not after another handler's
    `preventDefault`, nor while a dialog, the pad or the list menu is open. Its listener is on
    **`window`**, like Note to self's (added at page load, so heard first), so whatever floats
    over the viewer closes on Escape before it. Leaving the viewer leaves the browser's full
    screen too, **including one the browser grants late** — after `✕` or after the file
    closed (`want` in `useFullView`).

## Source Dump text blocks

A text block may name one file or note in its `fileId` (inside `sourceDumps`); the rules are
in `docs/contracts/storages-source-dumps.md`, "A text block's file". For this file:

- **Nothing about a link is stored in `files`.** No writer here knows of links; deleting a
  record leaves every `fileId` naming it, and the chip reads *file removed*.
- **The viewer's "Used in N text blocks"** (`UsedIn` in `files-view.js`) is drawn from the
  page's `usesOf` prop: `files-view.js` never reads `sourceDumps` itself. A row calls
  `onOpenUse`, which opens SOURCE DUMP on that title with the MM's card ringed.
- **A link started from the file** (`+ link to a text block`, 2026-11-16) is drawn from the
  page's `linkTargets` prop, read only while the picker is open, and made by its `onLinkUse`
  prop: `files-view.js` neither reads `sourceDumps` nor decides whether a block is free.
- **Opening on request:** `FilesView`'s `openRequest` (`{id, n}`) opens one record; `n`
  changes per request. True Storage sets it from a chip and from `?file=<id>` (an id naming
  nothing opens FILES at the top) and clears it when a tab is tapped, so FILES then opens on
  its folders.

## Drive

- Scope `drive.file` only: Track sees only files it made. `CONFIG.clientId` in
  `file-store.js` is the public OAuth Web client id of the Firebase project (its "Web client
  (auto created by Google Service)", filled in 2026-11-13); empty means "not set up", and
  FILES then keeps everything on the device. Its **secret** is never needed and never goes in
  the repository. Google honours the id only from the client's authorized JavaScript
  origins, which must include `https://furferfurfer.github.io` and `http://127.0.0.1:8765`.
- **No test reaches Google.** Because the shipped id is real, `tests/browser.test.js`'s
  `open()` blanks it on every page (`NO_DRIVE`, a setter on `window.TrackFileStore`), and a
  case that stubs Drive configures its own synthetic id. Product code holds no test switch.
- Uploads are resumable, in 8 MiB chunks (a multiple of 256 KiB), sequential, and resume from
  the last confirmed byte; network, 5xx, 429 and 403 are retried three times with backoff; a
  401 drops the token and waits for **Connect Drive**; an expired session restarts once.
- `connect()` must run inside a tap (popups are blocked otherwise), which is why
  `preloadGis()` fetches Google's script ahead of it.
- **Connecting by itself (2026-11-16) is ONE automatic attempt and ONE tap attempt a page
  load, never a loop.** Google's token flow is a popup, has no silent renewal, and may never
  call back when the popup is blocked (its docs, read 2026-11-16), so nothing waits on an
  attempt. `autoConnect()`, called by the viewer when FILES opens, uses a kept token with no
  request at all — not even Google's script — and otherwise calls `requestAccessToken`
  once, with `prompt: ''` and **no `login_hint`** (a hint taken from the Firebase account
  could connect a different Google account's Drive, and uploads would land there).
  `overview().autoTap` is true from that attempt until the first of: connected, a
  `popup_closed`, any `connect()` call, `disconnect()`. The viewer's capture-phase click
  handler calls `connect()` once while it is true — never on `[data-files-connect]`, whose
  own handler connects. Each request owns its callbacks: a later one supersedes an earlier
  one, and a superseded or disconnected request's late answer is ignored.
- **A blank client id makes every one of those inert**: no storage read, no script, no
  request. That is what keeps "no test reaches Google" true now that opening FILES asks.
- **The store tells its listeners when the pass runs out** (`watchExpiry`, one timer), so the
  Drive line stops saying *connected* by itself, and the viewer fetches Google's sign-in
  whenever Drive is set up and not connected.
- **Disconnect asks nothing.** It forgets the pass and its kept copy and stops automatic
  attempts for the page load; no `track_db` key, no file and no queued upload changes, so
  there is nothing for a prompt to guard. A browser case asserts the bytes and the dialogs.

## Deliberate exclusions from "confirm before deleting"

- **Every drag** in FILES — a nest, a reorder, a move to Top level. A move deletes nothing and
  is undone by moving back; a refused move writes nothing.
- **"Free up"** (the Drive panel). It removes only device copies that are already in Drive and
  never one whose upload is pending; nothing in `track_db` changes, and opening the file
  downloads it again.
- **The highlighter's eraser `⌫`** (added 2026-11-13). One gesture is one write, with no
  prompt: a prompt on every touch would make an eraser unusable. In its place the message
  after each erase offers **Undo**, which writes back the very records at their stored
  places (`highlightEntries` → `withHighlightsRestored`), leaving `track_db` byte-identical
  to before. It erases pen strokes and text highlights the same way, on a note as on a
  file. **Deleting a pin is NOT excluded**: its name would be lost, so `deletePin` asks
  after its no-op guard and before the write.
- **Taking a bookmark off** (added 2026-11-15): the ribbon on a thumbnail and `🔖` in the
  toolbar are toggles. A bookmark holds nothing but its page number, so the same tap that
  made it puts it back exactly; a prompt would guard nothing.

All four are pinned by browser cases (`FILES drag …`, "Free up" writes no `track_db` key,
`FILES marks: the eraser asks nothing; Undo restores the identical record …`, and
`FILES bookmarks: … one tap takes one off, asking nothing …`).
