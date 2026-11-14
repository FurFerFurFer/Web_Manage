# Contract: which controls ask before deleting

**Mandatory rules, with the same authority as `AGENTS.md`.** Read this file before changing
anything it covers: any control that deletes or clears stored data, or a `✕` / toggle that might: where each existing prompt lives and why, and the deliberate exclusions that stay one click. The rule itself is in `AGENTS.md`, "Confirm before deleting or clearing stored data".

Moved out of `AGENTS.md` on 2026-11-10, word for word and with nothing deleted, because
`AGENTS.md` had reached 174KB and is loaded into every agent session. A phrase such as
"the `merges` rule" or "the `time` / `link` rule" names a rule in this file or a sibling
one; the index in `AGENTS.md` ("Feature contracts") says which file holds which key.
A new rule for this area is added HERE, not to `AGENTS.md`.

---

`removeMilestoneEntry` is reached from three buttons and `onUnlinkTask` from four,
which is exactly why their prompts live in the shared handler. Where a call-site
prompt is required it is because a handler-level one would be *wrong*:
`toggleMGDay` both adds and removes and also serves two deliberately unconfirmed
toggles, `onUpdateDate` also sets dates, and `deleteNode` and `removeDissectChild`
are pure tree functions with other callers. This is the deadline-caution failure
shape again — one rule spelled at several call sites and dropped at one — so when
you move a prompt into a handler, **delete the call-site copy in the same edit**
or the user gets two prompts for one click.

Not every `✕` is in scope. Pure-dismiss controls — closing a modal, cancelling a
form — stay one click. So do nine deliberate exclusions, each pinned by a browser
case: every drag in SRCH → DIRECTORY (`sir-ks02.html`) — a nest, a move to Top level
or a reorder, of one block or a ticked group — which deletes nothing, is undone by
moving back, and writes nothing at all when refused; the four detach `⊗` chips, the two MG schedule `✓` toggle-offs
(`progress.html`: ● Learn's and the MG tab's), the emoji icon `Clear` (`documentations.html`), the Quest
tab's un-quest `✕` and un-star `★` (`progress.html`) — those two write `false`,
delete nothing, leave the star dormant, and are undone by pressing the same
control, so they belong beside merge/unmerge and a line move rather than under
this rule — and the Date-note tag buttons (`notes-widget.js`), a choice between
three that deletes no text: choosing `unclear` deletes the `tag` key, but pressing
the previous tag restores it exactly. Locking a day with `cleared` or `Eternal` is
covered by the same exclusion: it freezes the text and deletes nothing, and
`unclear` unfreezes it. A "clear all quests" button would NOT be
exempt. The last three are on the Storages page's FILES tab (`scripts/files-view.js`, rules in
`docs/contracts/files.md`): every FILES drag — a nest, a reorder, a move to Top level, one
tile or a ticked group — which deletes nothing, is undone by moving back, and writes nothing
when refused; **Free up**, which removes only this device's copies of files already in
Google Drive, never one still waiting to upload, writes no `track_db` key, and is undone by
opening the file; and the highlighter's **eraser `⌫`** (2026-11-13), where a prompt on every
touch would make the tool unusable — instead the message after each erase offers **Undo**,
which writes back the very strokes at their stored places, leaving `track_db`
byte-identical. This is the one exclusion that DOES delete; Undo is what stands in for the
prompt, and an eraser without a working Undo would have no guard at all. Do not "make it
uniform" without re-deciding those on purpose.

FILES's own prompts for records all live in ONE handler, `remove(ids)` in `files-view.js`,
reached from a note's, a file's and a folder's `🗑` and from Select mode's `🗑 Delete N`.
Every path through it deletes, so the prompt is in the handler, after the "nothing to
delete" guard and before the write. It names what goes: a folder's contents move up (to its
parent, or the top level) and are not deleted; a note's text cannot be restored; a file in
Drive goes to Drive's trash for 30 days; a file not yet uploaded cannot be restored; a file's
highlights and pins go with it. A **pin's** `🗑` asks in its own handler, `deletePin` in
`FileView` (every path deletes), after the "no such pin" guard and before the write.

A text block's file link (2026-11-14) is unlinked by the chip's `×`, and asks in the handler
on both pages — `unlinkBlockFile` in `sir-ks02.html` and in `true-storage.html` — because every
path through it removes a link. The text is one, word for word: "Unlink this file from the text
block? The file itself is not deleted." Linking asks nothing, and a block naming a deleted file
keeps its `×`. Pinned by `TEXT ↔ FILE (KS02): unlink asks; Cancel keeps every byte …`.
