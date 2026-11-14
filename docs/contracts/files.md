# Contract: `files` and the FILES tab

**Mandatory rules, with the same authority as `AGENTS.md`.** Read this file before changing
the `files` slot field, `scripts/files-core.js`, `scripts/file-store.js`,
`scripts/files-view.js`, `true-storage.html`'s `_mutateFiles` / FILES loader, the
`track_files_v1` IndexedDB database, or anything that talks to Google Drive.

Added 2026-11-13 with the FILES tab on the Storages page; highlights and page pins the same day.

---

## What is stored where

| What | Where | Synced |
| --- | --- | --- |
| Folders, notes, one record per file (name, order, size, MIME, Drive id) | slot field `files` in `track_db` | yes, with the workspace |
| A note's text (≤ 256 KB, `NOTE_MAX_BYTES`) | the note's record, `text` | yes |
| A PDF's or an image's highlights and page pins (≤ 256 KB together, `MARKS_MAX_BYTES`) | the file's record, `highlights` and `pins` | yes |
| A file's bytes | Google Drive ("Track Files" folder), and a copy per device in IndexedDB `track_files_v1` | Drive only |
| The upload queue, the Drive folder id | `track_files_v1` (`queue`, `meta` stores) | never — per device |
| The Google access token | memory only | never |

- **A file's bytes never go into `track_db` or `localStorage`.** Not as base64, not as a
  data URL, not "just for small files". The ~5 MB quota and every sync upload depend on it,
  and a browser case asserts it.
- **The access token is never stored**, in any key or database. It lives about an hour in
  `file-store.js`'s memory; after that the next Drive action shows **Connect Drive**.
- `track_files_v1` is a device cache plus a queue. Nothing in it is the only record of
  anything **except** a file whose upload has not finished, which is why "Free up" keeps those.

## Records

`{id, kind, name, createdAt, updatedAt}` plus, by kind:

- `folder` — nothing else.
- `note` — `text` (a string, possibly empty). Its name always ends `.md`.
- `file` — `size` (bytes), `mime` (absent when the browser gave none), `driveId` (absent
  until an upload finished), and the viewer's marks, each absent when there are none:
  - `highlights: [{id, page, color, w, pts, createdAt}]` — a freehand highlighter stroke.
    `page` is 1-based (an image is page 1); `color` is one of `COLORS` (`yellow`, `green`,
    `blue`, `pink`); `w` and every value of `pts` (`[x0, y0, x1, y1, …]`, at most 200 points)
    are fractions 0–1 of the page's rendered box — pdf.js's viewport, which includes the page's
    own rotation, or the image's natural size. Stored order is drawing order.
  - `pins: [{id, page, name, createdAt, updatedAt}]` — a named page. `updatedAt` is the
    pin's last rename.

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
    `withoutHighlights`, `withHighlightsRestored`, `withPin`, `withPinRenamed`, `withoutPin`.
    They act on `kind: 'file'` records only, validate what they are given (a whole page, an
    even `pts` of at least two points all in 0–1, a known colour, a name through
    `cleanName`), refuse a repeated id, spread, and keep a malformed item they did not write.
    **None stamps the file's `updatedAt`**, because the file did not change — the rule
    `withDriveId` follows. Removing the last one DELETES the key.
14. **One budget per file:** 256 KB of `highlights` and `pins` together (`marksFit`). A
    writer past it returns the list unchanged; the viewer checks `marksFit` first and says
    "This file's highlights are full". Undo is not held to it: it only returns what was stored.
15. **A stroke is stored simplified**: `simplifyStroke` (Ramer–Douglas–Peucker, both ends
    kept, distances measured with the page's height/width ratio so x and y count alike),
    clamped to 0–1, rounded to 4 decimals, thinned to 200 points. A stroke shorter than
    0.004 page widths is a tap and is not stored.
16. **Input:** an Apple Pencil (`pointerType 'pen'`) always draws; a finger or a mouse only
    while `🖍` is on; with `⌫` on, every pointer erases. The touch listeners on the layer are
    **native and non-passive** (React's are passive) and cancel a touch only for a stylus,
    for every touch while a tool is on, or for a palm during a Pencil stroke — never a
    finger with no tool on, which must scroll. One stroke at a time; it stays on the page it
    started on (pointer capture, clamped).
17. **Highlighter colours are DATA colours** (`MARK_COLORS` in `files-view.js`), the same in
    both appearances, and reach the SVG through `style`, never a presentation attribute
    (`docs/contracts/appearance.md`).

## Source Dump text blocks

A text block may name one file or note in its `fileId` (inside `sourceDumps`); the rules are
in `docs/contracts/storages-source-dumps.md`, "A text block's file". For this file:

- **Nothing about a link is stored in `files`.** No writer here knows of links; deleting a
  record leaves every `fileId` naming it, and the chip reads *file removed*.
- **The viewer's "Used in N text blocks"** (`UsedIn` in `files-view.js`) is drawn from the
  page's `usesOf` prop: `files-view.js` never reads `sourceDumps` itself. A row calls
  `onOpenUse`, which opens SOURCE DUMP on that title with the MM's card ringed.
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
  to before. **Deleting a pin is NOT excluded**: its name would be lost, so `deletePin` asks
  after its no-op guard and before the write.

All three are pinned by browser cases (`FILES drag …`, "Free up" writes no `track_db` key,
and `FILES marks: the eraser asks nothing; Undo restores the identical record …`).
