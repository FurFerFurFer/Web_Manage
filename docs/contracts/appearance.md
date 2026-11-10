# Contract: appearance, colour and the phone layout

**Mandatory rules, with the same authority as `AGENTS.md`.** Read this file before changing
anything it covers: the phone breakpoint and `--phone-tabbar-h`, touch gating, beating a Tailwind utility, DATA versus CHROME colour and the `ACCENT` map, `track_theme`, and `track_home_cal_hidden`.

Moved out of `AGENTS.md` on 2026-11-10, word for word and with nothing deleted, because
`AGENTS.md` had reached 174KB and is loaded into every agent session. A phrase such as
"the `merges` rule" or "the `time` / `link` rule" names a rule in this file or a sibling
one; the index in `AGENTS.md` ("Feature contracts") says which file holds which key.
A new rule for this area is added HERE, not to `AGENTS.md`.

---

The phone layout lives at **`max-width: 720px`**, and `--phone-tabbar-h` is the **one
definition** of the bottom tab bar's height. It is `0px` on `:root` and set only inside
that block, so a rule reserving room for the bar — the three `h-screen-nav` utilities, the
notes widget's inset — reads the var **unconditionally** and is a no-op on a desktop by
*arithmetic*, not by a second copy of the rule inside a media query. Never re-spell 52px,
and never add a desktop/phone pair where reading the var would do.

The **one deliberate exception** is the shell's `padding-bottom`, which stays inside the
media query: `.app-page #root > div` is (1,1,1) and therefore also beats a Tailwind
utility, so an unconditional `padding-bottom: 0px` would strip the bottom padding from a
shell that sets its own — `true-storage.html`'s no-workspace screen is `min-h-screen … p-6`.
Reading a 0px var is only free where nothing else is declaring that property. Three more
rules follow:

- The **720 is a TWIN**: `styles.css` and `scripts/viewport.js` both spell it, because CSS
  cannot read a JS constant and JS cannot read an `@media` rule. `tests/viewport.test.js`
  pins the stylesheet's whole `max-width` set (`[460, 640, 720]`) rather than filtering
  for 720, so a stray 719 beside it fails too and a fourth breakpoint has to be added on
  purpose. Moving a phone rule off 720 without that file is how `isPhone()` starts lying
  to four pages with nothing on screen to say so.
- **`phoneNow()` and `useIsPhone()` are not interchangeable.** `phoneNow()` is for a lazy
  `useState` initializer — a one-shot read at mount. `useIsPhone()` follows the viewport
  live. `progress.html`'s `timelineMode` must use the first: wiring the hook in would look
  identical on screen and then overwrite a WEEK the user chose by hand, on the next
  rotation.
- A pane hidden on a phone is **hidden, not unmounted, wherever a mount-only effect binds
  to a ref.** The Schedule's timeline binds two `useEffect(…, [])` to `containerRef` (the
  scroll-to-08:00 and the non-passive Shift+wheel listener), so unmounting it once leaves
  that listener on a dead node for the rest of the session with no error anywhere — it
  toggles inline `display` instead. `GoalTabsPanel`'s and `MilestonesPanel`'s visually
  identical splits have no such effect and *are* unmounted (Milestones' one `useEffect(…, [])`
  cancels its own rAF, so nothing outlives it). A change that made the three uniform would
  break one of them, and `tests/browser.test.js` asserts the timeline stays in the DOM while
  hidden and that the other two leave it.
- **Reveal-on-touch is gated on `(pointer: coarse)`, NEVER on `isPhone()`, and never on
  `(hover: none)`.** `TrackViewport` owns both queries because they answer different
  questions: one is the screen, the other is the input. An iPad at 820px is not a phone but
  is finger-driven, so a width gate leaves its controls permanently unreachable — the exact
  bug the old blanket rule existed to fix; a laptop with a touchscreen is the mirror case,
  reports `pointer: fine`, and must keep one-click navigation. `documentations.html`'s row
  arm model (`rowTap`) is the current user, via the page-local `touchPrimary()` delegate,
  and `styles.css`'s docs-row block asks the SAME query — two spellings of "a finger" in one
  codebase is how they drift apart.
  **`(hover: none)` is not usable as a gate here, and that is measured, not preference:**
  headless Chrome reports it at every viewport with or without touch emulation, and
  `Emulation.setEmulatedMedia` does not override it. A hover gate is therefore untestable in
  BOTH directions and silently routes every desktop case down the touch path.
- **A reveal rule can have more than one home.** The documentation row cluster was shown by
  TWO rules — one in `@media (hover: none)` and one in `.docs-sidebar-full`, which governs
  the drawer at every width. Moving only the first to the armed state looked implemented and
  changed nothing on screen. When a control's visibility moves behind a new condition, grep
  every rule that sets its `display` before believing the change landed.

A rule in `styles.css` that has to **beat a Tailwind utility on the same element** needs more
than one class in its selector. The Tailwind CDN injects its `<style>` into `<head>` at runtime,
which is *after* every page's `<link rel="stylesheet" href="styles/styles.css">`, so a one-class
selector like `.docs-sidebar-full` merely **ties** `.w-60`/`.p-2`/`.hidden` and loses on source
order. Double it (`.docs-sidebar.docs-sidebar-full`) or reach the element through a descendant
or attribute selector; do not reach for `!important`, which the print block already uses for a
different reason and which would make the next override harder still. This is not theoretical —
it silently cost the full-screen sidebar its width once, and the panel simply stayed 240px with
no error anywhere.

Colour in the React pages splits in two, and the split is the whole rule. **DATA** —
`PALETTE`, `SA_COLORS`, `STAGE_COLORS_SIR`, `STAGE_COLORS_SCHED`, `STAGE_RING`,
`FILL_COLORS`, `REF_COLOR`, the Eisenhower quadrant table, and every stored `mm.color` /
`action.color` / `item.chipColor` — is categorical or user-chosen and must stay
**theme-invariant**. **CHROME** is everything else, and in `progress.html` it resolves from
the five `--color-accent*` tokens through the single `ACCENT` map declared beside `PALETTE`.
Five rules follow, and the first two are the load-bearing ones:

- **A token's Grit value IS what `styles.css` remaps the matching Tailwind class to**, and the
  Grit utility rules point *at the tokens* rather than repeating a hex — one definition per
  role and appearance. Without that, a `text-emerald-400` label and the `#10b981` bar beside it
  are two different greens under Grit, which is the defect this work existed to remove. A
  browser case asserts the token equals its class sibling for all five roles.
- **`ACCENT` holds `var()` strings and never a hex, and both of its failure modes are
  SILENT** — nothing reaches `realErrors`, so only a test can catch them. `var()` in an SVG
  *presentation attribute* is dropped by Chrome and the paint falls back to `none`: the arc
  simply vanishes. Pass colour to SVG through `style={{stroke}}` / `style={{fill}}`, never
  `stroke=` / `fill=`. And `'var(--x)' + '22'` is an invalid declaration, silently
  transparent — which is why the `mm.color || '#6366f1'`-style fallbacks stay **literal**:
  their results feed `color + '22'` concatenations downstream.
- The two appearances are **not** symmetrical, and Night is not merely "unchanged". Night kept
  the emerald, amber and cyan the JSX always used because each already cleared 4.5:1 there;
  indigo (`#6366f1`, 3.43:1) and violet (`#8b5cf6`, 3.62:1) did not, and moved one Tailwind
  shade lighter to the values their class siblings already render. Accent contrast is asserted
  in **both** appearances now, computed from the live tokens.
- **Neutral chrome reuses existing tokens** rather than gaining accent ones: a ring track is
  `--color-surface-strong`, an empty pip border `--color-border`, a muted value
  `--color-text-muted`, on-surface text `--color-text`. Judge these by whether they stay
  PERCEPTIBLE, not by 4.5:1 — a track that clears a text bar is not a track. Measured against
  the surface they sit on, the Grit ring track went **13.09:1 → 1.27:1** (it was a near-black
  ring drawn on a pale page — not a subtle track but a black donut) while Night moved
  1.17 → 1.34, i.e. slightly *more* visible; the empty pip border went 9.23 → 1.73 on Grit and
  1.66 → 1.73 on Night. The reading that actually matters for a donut is the arc against its
  own track: **6.46:1 Grit, 4.27:1 Night**.
- A goal's ring, bar and tab dot are `PALETTE[activeIdx]` and are **supposed** to be indigo for
  the first goal. Never write a sweeping "nothing in this panel computes to indigo" assertion —
  `PALETTE[0]` is `#6366f1`. Assert `[data-accent]`-hooked elements only.

`track_theme` holds `grit` or `dark`. The superseded `light` is the previous name for
`grit` and is accepted **forever on read**, never written. Four rules follow, and the
first two are the load-bearing ones:

- The pair is spelled **once**, in `theme.js`'s `GRIT`/`NIGHT` constants and its single
  `normalizeTheme`, which both the storage read and `applyTheme` go through. It used to
  be spelled at four sites — the fallback, the click handler, the system-preference
  listener and `TrackTheme.toggle` — and that is the duplication shape that has already
  cost this project a caution predicate. Missing one makes `applyTheme` a silent no-op:
  no attribute is set, and **every bare `html[data-theme]` rule** in `styles.css` dies at
  once, taking the focus rings, the notes widget, the Firebase overlay and all four
  banners with it. The smoke cases cannot see this — they assert those elements exist,
  never that they are painted.
- The alias is a **read**, never a rewrite. Rewriting the key would fire `storage` in
  every open tab, and a tab on the cached previous script does not recognise `grit`, so
  it would fall through to `matchMedia` and silently change appearance under a user who
  touched nothing. This is also why `dark` deliberately keeps its name rather than
  becoming `night`: an older tab still understands `dark`, and renaming it would break
  the one direction that still works across versions. `night` is a display name only.
- `readStoredTheme`'s accept-list and the alias must stay in the **same** function. If a
  stored canonical value made it return `null`, the system-preference listener would
  conclude the user had never chosen and let the next OS change override an explicit
  preference.
- `color-scheme` is written **inline** on `<html>`, so it beats both stylesheet
  declarations, and its grammar accepts a custom ident — a raw appearance name parses,
  sticks, and is understood by no browser, silently falling back to light. Map the name
  to a keyword (`colorSchemeFor`); never pass the name through. There are 19 date/time
  inputs across the app, and the failure looks like light scrollbars and light native
  pickers on a dark page.

`track_home_cal_hidden` holds the Home calendar legend's filter, as a JSON array of the
categories switched **OFF**. It is owned by `index.html` alone and read fresh on every
`renderCalendar()`. Four rules follow, and the first two are the load-bearing ones:

- It stores the switched-**OFF** set, per the contract in `calendar-core.js`'s `FILTERS`
  comment, so absence and `[]` are the same state and a category added to `CATS` later is
  on by default everywhere. **Never invert it to a shown set** — that would make every new
  category invisible to every existing user, silently.
- It is **clamped on read** to the keys the legend actually renders. That clamp is what
  makes an unrecoverable state impossible: every key that can hide something has a visible
  control that turns it back on. Drop it and a stray or hand-edited `"task"` reaches
  `buildDaySchedule` and hides the Home day preview's goal tasks with nothing on screen to
  undo it. Clamping on read also means a sixth legend row added later still honours what is
  already stored.
- Read it **fresh in `renderCalendar()`**, never into a module cache. The cross-tab listener
  carries no payload and must not trust `e.newValue` — the same rule `track_theme` follows,
  and the reason a cache would need a second place to be kept in step.
- It is **not slot data**: not in `SLOT_FIELDS`, not exported, not imported, not synced.
  `firebase-sync.js`'s `setItem` patch acts only on `track_db`, so writing it arms no upload
  and marks nothing pending — do not "fix" that by routing it through `TrackStorage`. Both
  ends are total on purpose (`JSON.parse` does not throw on `'null'` or `'42'`, and `getItem`
  throws outright where site data is disabled): a view preference must never be able to
  break the calendar.
