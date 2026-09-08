# Track World — first playable demo

A small Babylon.js garden now runs locally with a third-person placeholder avatar,
a clock plaza, a bridge, low terrace steps and three selectable mind-map stars.
It is an early movement and information study using synthetic data. It is not the
finished world or a connection to the user's Track database.

## Run it

From the repository root, using the existing Node installation:

```bash
node World/tools/serve.js
```

Open **http://127.0.0.1:8877** and choose **Enter the garden**. Keep the terminal running;
Ctrl+C stops the server. An optional numeric argument selects a different port.
The server binds only to this computer. Open through the server, not as a `file:` URL.

The pinned engine is already included under `vendor/babylonjs-9.25.0/`. No package
manager, build step, external font, asset download or internet connection is required
to run this copy. World uses the repository's existing `schema.js?v=7` and
`calendar-core.js?v=7`, exposed by this server as `/track-core/` readers.

## Controls

| Control | Action |
| --- | --- |
| W A S D or arrow keys | Walk relative to the camera |
| Shift | Run |
| Space | Jump |
| Drag on the garden | Turn and tilt the camera |
| Q / E | Turn the camera with the keyboard |
| Mouse wheel | Move the camera closer or farther away |
| T | Today panel |
| N | Notebook |
| M | Mind maps |
| V | Weather, light study, demo clock and performance readings |
| Escape | Close the open panel; ignored during IME composition |
| ? → Return to the start | Recover the initial position and camera |

Opening a panel pauses movement. Tab stays within the panel, and closing it restores
focus to its opener. When focus returns to a toolbar button, click the garden before
walking. Losing browser focus clears held movement keys. Walking off the island returns
the character to the start without a penalty.

The welcome screen stays until **Enter the garden** is pressed. Information panels are
available from that screen as well. If WebGL fails, the error surface offers the notebook
so an in-memory draft can still be exported before reloading.

## What the demo does

- Walk, run and jump with a fixed simulation step, a capped catch-up after stalls, simple
  collision, a small step-up allowance, jump buffering and a short coyote window.
- Orbit a following camera with a ray-based obstruction check and bounded zoom.
- Change between clear skies and rain. One shared state drives light, wind, rain streaks,
  water color and surface wetness; stone dries more slowly than the rain clears.
- Use an independent daylight/night **light study**. It is explicitly separate from the
  demo clock and does not claim to implement the final world's astronomical time system.
- Read synthetic Today information through `TrackCalendar.buildDaySchedule`: authored
  notes, schedule blocks, due deadlines, chosen caution days, reviews, MG focus and a
  separate reference timetable. Untimed notes remain untimed even when their automatic
  schedule block begins at 08:00. Reference entries are not counted as tasks.
- Choose demo-clock states at 17:40, 20:10 with tomorrow's review preview, and 00:10 on
  the following day. The fixture starts on the local date at page load. Changing the
  view never moves fixture records to another date.
- Keep a notebook draft in memory, cancel back to its last kept draft, or export a text
  copy. Closing/reopening the panel preserves the draft; reloading clears it.
- Select any of three synthetic mind maps through a star or a button, and keep separate
  name/observation drafts for each. These are draft controls, not canonical MM edits.
- Reduce environmental motion, adjust camera sensitivity, and choose up-to-720p or
  window-resolution world rendering. HTML panels remain at the browser's resolution.

## Data isolation

The game does not load a Track page, Firebase, the storage guard, a user export, or a
live database. Fixtures are created through the canonical schema with synthetic IDs.
Drafts never modify the fixture. There is no game persistence or synchronization.

`storage-isolation.js` runs before Babylon.js. The engine's import-time storage probe
(`setItem('test')` / `removeItem('test')`) receives document-local memory storage. The
script never obtains the browser's native storage object. `track_` keys and IndexedDB
are refused in this document. This guard affects only the demo document, not other tabs.

The loopback server exposes only the game and two named pure Track readers. Its Content
Security Policy disallows outbound connections, remote scripts and form submissions.
The browser test seeds a synthetic sentinel in the real storage of a temporary profile,
traps every native storage operation, then verifies no operation occurred and the
sentinel remained byte-identical. No personal browser profile is used for that test.

## Verification

From the repository root:

```bash
node World/tests/core.test.js
node World/tests/browser.test.js
```

The first command uses Node's built-in test runner directly: synthetic schema/calendar
parity, local date boundaries, gradual weather/drying, fixed-step timing and resume cap,
source isolation and the engine storage-probe guard.

The second starts a temporary loopback server and isolated headless Chrome via the
existing `tests/lib/cdp.js`. It checks entry, walking and jumping, panel reading safety,
IME Escape, focus containment, notebook retention, per-MM draft identity, caution gaps,
handled deadlines, untimed notes, reference separation, tomorrow/midnight views,
weather/light transitions, narrower-window bounds, same-origin requests and untouched
native storage. It writes review screenshots to `/tmp/track-world-*.png` and closes its
browser/server. A local socket/browser permission may be required by the execution sandbox.

**Evidence boundary:** the browser harness disables hardware GPU rendering and reports
SwiftShader. Its frame rate is functional-test evidence only. The Ryzen 5 5500U / integrated
Radeon laptop's sustained 720p/30 fps target has **not** been established. The live metrics
panel shows a rolling frame rate and p95 frame interval, per-frame draw calls, internal
resolution, renderer and active elapsed time; it is not a complete CPU/GPU profiler.

The root Track test suite is unaffected: no Track runtime, persistence helper or root test
file changed. World tests reuse the root CDP helper without modifying it.

## Files and dependency

| Path | Responsibility |
| --- | --- |
| `index.html`, `styles/demo.css` | Canvas, botanical information panels and keyboard-accessible controls |
| `scripts/scene.js` | Geometry, avatar, collision, camera, shared weather rendering and live metrics |
| `scripts/demo-core.js` | Synthetic fixture using canonical date helpers, environment transition and fixed-step scheduler |
| `scripts/app.js` | Panel state, canonical calendar reads and memory-only drafts |
| `scripts/storage-isolation.js` | Document-only storage isolation before the engine loads |
| `tools/serve.js` | Restricted loopback static server |
| `tools/fetch-engine.py` | Approved, version-specific engine retrieval with archive integrity verification |
| `vendor/babylonjs-9.25.0/receipt.json` | Download source, SHA-512 archive integrity and per-file SHA-256/size receipt |
| `tests/` | Dependency-free offline and real-browser behavior checks |
| `NOTES.md` | Remaining proof, limitations to resolve and next decisions |

Babylon.js **9.25.0** was downloaded with explicit dependency approval on 2026-09-06.
The npm archive was 21,129,389 bytes; the retained browser bundle is 8,316,622 bytes.
Only that bundle, its [Apache-2.0 license](vendor/babylonjs-9.25.0/license.md),
[notice](vendor/babylonjs-9.25.0/NOTICE.md) and receipt are retained. No npm lifecycle
script ran. The fetch script refuses to replace an existing vendor directory; updating
the engine is a separate dependency decision.

Reference imagery in `assets/images/` remains concept material. The runtime scene uses
procedural placeholder geometry; it does not use those images as scenery or production
assets. The selected anime art direction still needs its shader/asset proof.
