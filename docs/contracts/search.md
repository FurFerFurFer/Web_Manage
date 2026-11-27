# Contract: Universal Search

**Mandatory rules, with the same authority as `AGENTS.md`.** Read this file before changing
`scripts/search.js`, `scripts/search-core.js`, `scripts/search-view.js`, the `#tsr-btn` /
`#tsr` styles, anything that changes what an entry's link opens on another page (a page's
`?mm=`, `?dump=`, `?goal=`, `?page=`, `?date=`, `&dl=`, `?storage=`, `?file=` or `#view`), or a
page's tab bar (`progress.html`'s `TABS`, `sir-ks02.html`'s and `true-storage.html`'s `VIEWS`, a
sub-tab table, Documentations' Events / Projects, the notes widget's tabs).

Added 2026-11-26, the user's request, in their words: "UNIVERSAL SEARCH — make sure it
doesn't make the website even slower and make me able to search in directory type way",
"make it its own interface of choosing (like directory folder) and also with a search bar",
"make sure I can choose the specifics before it transfers me to the page, and I can also
choose just bigger parents or folder … a separate '→' button", "for what it searches the
bigger parents always come first on top", and "search and click to go in that directory and
search again and click again as many times as possible until I hit the button". The same
evening: "I want the search directory to look real so also put the tabs and subtabs into the
search too", "divided to 5 parts", "the key is that it reflected the exact
arrangement/management … for MM specially when I click it shows the children on the right side
completely expanded to the last leaf children then clicking on that will navigate THE SEARCH
(which is not '->')", "these also include DOC, source dump etc.", and "if it's just sub tab I
don't want to click just to show it so make it go under the tab normally". The shape below is
the draft the user approved ("approve do it").

It adds **no slot field and no browser key**.

---

## Three files, three jobs

| File | Loaded | Job |
| --- | --- | --- |
| `scripts/search.js` | with every page, after `note-to-self.js` | the 🔍 button, Ctrl/⌘ K and `/`, and loading the other two on the first open |
| `scripts/search-core.js` | on the first open | `window.TrackSearch`: WHAT is listed, WHERE, and what a query finds |
| `scripts/search-view.js` | on the first open | `window.TrackSearchView`: the panel, its clicks and keys |

## The rules — the first four are the load-bearing ones

1. **Nothing of search loads with the page but `search.js`.** The user's first condition. The
   core, the view, and any of `mm-tree-core.js`, `files-core.js`, `source-dump-core.js` and
   `project-core.js` the page lacks are fetched by `search.js` on the first open, in that order, each only when its
   global is missing. Their `?v=` values live in `search.js`'s `PARTS` list as well as on the
   pages: **bump a shared module's `?v=` there too** (`rg -n 'files-core\.js\?v='` finds both).
   No JSX anywhere in search: nothing waits for Babel. The browser suite asserts, on all five
   pages, that neither part is fetched or defined before the button is pressed.
2. **A READER.** It reads `track_db` only through `TrackStorage.loadDB()`, only the active
   workspace (`activeSlotId`, else the first slot), and writes nothing — not `track_db`, not a
   key of its own. The last search, the folder you were in and whether the panel was open are
   stored nowhere; every page load starts closed at the top. The browser suite asserts the
   stored bytes and the key set unchanged on all five pages.
3. **Only a Go → leaves the page.** Two kinds of click, decided by `FRAME` in `search-view.js`:
   - A **page, tab, Home section, the notes widget, or a folder search makes** (Day notes, a
     month, Storage tags) goes INTO it on a click: the crumbs grow, the box empties and keeps
     the focus.
   - **Anything the user made** — a mind map (from SRCH down), Kolb, MG change, goal, sub-goal,
     task, milestone, documentation page, source dump, text block, storage, FILES folder or
     file, day note, deadline, class, action, note, journal day — is only **selected** by a
     click. Its details show its whole tree, opened out to the last leaf. A click on a name in
     that tree moves the SEARCH (`navTrail`): into it when it holds something, or to the folder
     it is in with it chosen when it is a leaf. Never to a page.
   - **While a query is typed**, a hit with something inside is entered on a click, whatever
     its kind ("the search still works normally").

   A Go → sits on every row that has a page, on each sub-tab heading, on the folder you are in
   (the "bigger parent" the user asked to be able to choose), and in the details. Enter never
   leaves either; only Ctrl/⌘ Enter does. Do not make a row click, or a tree click, navigate.
4. **A closed panel keeps NO DOM.** `#tsr` exists only while open; closing removes it, its
   listeners and its index.

5. **Bigger parents first.** `find` sorts by depth, then by whether the TITLE holds every
   word, then by directory order. Depth and the shown path follow where an entry LIVES before
   anywhere it is also shown: `link(parent, key, also)` marks the second kind, and `walk`
   follows every primary link before any `also` one. So a Kolb listed directly under KOLB is
   still ranked one below its mind map, not at KOLB's level. Inside a folder, depth is counted
   **from that folder** (`within`), and so is the path a result shows (`pathOf` with a scope),
   so a mind map that is also under some other parent is not ranked or labelled by a place
   outside the folder searched.
6. **A query searches the folder you are in and everything under it**; at the top, everything.
   It matches when the entry's text holds EVERY word, compared through `TrackFiles.searchNorm`
   (accents and case ignored, Thai kept). Its text is its title, its meta and its fields.
7. **One definition per rule.** The trees are `TrackMMTree`'s (`roots`, `childIndex`) — the
   mind maps', the storages' and the FILES tree; a source dump's or a page's single `parentId`
   is walked as `parentIds: [parentId]` through the same functions. Blocks come from
   `TrackSourceDump.textBlocksOf`, a Kolb's questions from `TrackKolb.TEXT_FIELDS`, a journal
   day from `TrackNotes.dateNoteText` / `dateNoteTag`, a mind map's kind from
   `TrackNoteToSelf.mmKindLabel`. They arrive in `deps`, so the offline suite runs the real ones.
8. **Every walk carries a cycle guard.** The index walk visits each entry once. A mind map
   under two parents is listed under both. A goal subtree has a per-path guard and a depth cap,
   and a goal-tree LINK is not followed: its original is listed where it lives. In the panel, a
   folder already on the crumbs is drawn `↻`, says "already on this path", and is not entered
   again — clicking it shows its details, with no tree — whether a list or a search result
   brought it back; and entering a hit or a tree row whose path runs through a crumb climbs
   back to that crumb (`extend`), so no crumb appears twice. The opened-out tree has a
   per-path guard of its own: a row already above it on its branch, or on the crumbs, is drawn
   `↻` and not opened, and the tree stops at `TREE_MAX` (400) rows with "… and more".
9. **`search-core.js` holds no date code, mints no ids, reads no storage** — a month folder is
   the stored day string's first seven characters — which is why its suite runs once. Its
   structural case enforces all three.
10. **Links are the ones the pages already read**, never new ones: a tab's `#view` key
    (`progress.html#actions`, `sir-ks02.html#srch`, `true-storage.html#files`, …),
    `documentations.html?goal=<first goal>` for the Projects tab (it has no address of its own;
    with no goal, the page and a "press Projects" hint), `sir-ks02.html?mm=<id>`
    (a Kolb or MG change opens its mind map), `sir-ks02.html?dump=<id>&mm=<id>` for a text
    block, `documentations.html?goal=<owner>` for a goal, task or milestone,
    `documentations.html?page=<id>`, `progress.html?date=<day>#schedule`, the deadline popup's
    `progress.html?date=<due>&dl=<id>#schedule`, `progress.html#actions`,
    `true-storage.html?storage=<id>`, `true-storage.html?file=<id>#files`. A page that changes
    what one of those reads changes `search-core.js` in the same edit. **Notes and Journal days
    have no page** — they live in the notes widget — so they have no Go →, and the details
    say where they are.
11. **A Go → to the page it is on reloads there** (the pages read `?…` and `#view` once, at
    mount): same path and same search → set the address, then `location.reload()`. Note to
    self's rule, for the same reason.
12. **Escape** listens on `window` and skips an event already handled; on a phone it first goes
    back from the details to the list. `/` never opens search while the focus is in a field.
13. **An edit in another tab reaches an open panel**: a `storage` event for `track_db` rebuilds
    the index, keeps the crumbs that still exist, and re-runs the query.
14. **Layers and the phone.** The button is z 45 at right 16, bottom 76 — 12px above the notes
    button, lifted over the phone tab bar by the same `body.app-page` rule. The panel is one
    stacking context at z 49, under every modal. While it is open the notes button is
    `visibility: hidden` (`body:has(> #tsr) #nw-btn`), because on a phone it floats over a row's
    Go →. At 720px and under the details REPLACE the list, with "‹ Back to the list"; under a
    finger (`(pointer: coarse)`) every row and Go → is at least 44px. Neither prints.
15. **At most 150 rows are drawn at a time**; "Show more" draws the next 150. An opened-out
    tree draws at most 400.
16. **It looks like the site.** The top is the five pages in the site's order. Under each page
    are the tabs its own bar draws, with the bar's own labels, in `PAGES` in `search-core.js`.
    `tests/search-core.test.js` reads every page's tab table back (`TABS`, `VIEWS` and
    `HIDDEN_VIEWS`, the inline sub-tab tables, Documentations' tabs, Home's panel titles, the
    notes widget's tabs) and fails on a difference. **A change to a page's tab bar changes
    `PAGES` in the same edit.** The guard has one gap: a sub-tab bar added to a tab that has
    none on the Knowledge Record is not detected, because that page has other two-label tables
    that are not tab bars.
17. **A sub-tab is a heading, never a level** ("if it's just sub tab I don't want to click just
    to show it"). `link()` given a sub-tab files the entry under the sub-tab's TAB and records
    the heading (`sectionOf`). The tab's list is what it holds of its own, then each heading
    followed by what that sub-tab shows, in the bar's order. A heading has its own Go →, is not
    a row (no click enters it, ↑ ↓ pass it, the status count skips it), and is found by name in
    a search, where it is an ordinary row. A sub-tab with no address of its own opens its tab
    and says, in `hint`, which button to press. SRCH (LIST, DIRECTORY) and KOLB (ALL, UNLINKED)
    have no headings: both their sub-tabs show the same things, so each is one list. If either
    bar changes, the drift guard asks for that decision to be made again.
18. **Where each thing lives** (its primary link; the `also` places in brackets): a mind map in
    SRCH, nested as stored; a Kolb or MG change under its mind map, or with none in KOLB or MG →
    TIMELINE (also KOLB, MG → TIMELINE, the notes widget's Kolbs); a source dump in KS03 →
    SOURCE DUMP, nested, holding its text blocks (also Storages → SOURCE DUMP); a goal in
    Documentations → Projects, holding its sub-goals and tasks, its milestones, then its pages
    (also ▲ PROJECT → PROGRESSION; a milestone also ▲ PROJECT → MILESTONES); a page with no
    goal in Events; dated Schedule things in month folders under SCHEDULE (day notes and
    deadlines also under ★ CALENDAR); actions in ■ ACTIONS; Sorted notes and Journal months in
    the notes widget; storages in a Storage tags folder on Storages → SOURCE DUMP; FILES in
    FILES. Anything no walk reaches is listed straight under its page.

## What it does not search (yet)

PDF and image contents, Kolb drafts, other workspaces. See NOTES, "Universal
Search: found along the way, and left out".
