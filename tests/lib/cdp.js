/* ── tests/lib/cdp.js ──────────────────────────────────────────────────────
   A minimal Chrome DevTools Protocol driver: launch the system Chrome, open
   tabs, evaluate in them, wait on DOM predicates.

   No Playwright, no Puppeteer, no node_modules. Node 22 ships a global
   WebSocket and fetch, which is all CDP needs, so this stays compatible with
   the project having no package manager (AGENTS.md, "Current Architecture").

   Four traps this file exists to encode, each of which produces a silently
   hanging or falsely-passing test if you skip it:

   1. alert()/confirm() freeze the renderer. Every later Runtime.evaluate hangs
      with no error and the run looks dead. We subscribe to
      Page.javascriptDialogOpening and accept, and every send has a timeout.
   2. A freshly created target is briefly about:blank, where localStorage
      throws SecurityError. Seed through Page.addScriptToEvaluateOnNewDocument
      instead of racing the navigation.
   3. That seed script re-runs on every navigation including reloads, so an
      unguarded write restores the fixture and makes persistence assertions
      meaningless. seed() guards on the key already existing.
   4. Fixed sleeps race the in-browser Babel compile. Wait on a DOM predicate.
*/
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean);

function findChrome() {
  return CHROME_CANDIDATES.find(p => { try { return fs.statSync(p).isFile(); } catch { return false; } }) || null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitForFile(file, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const txt = fs.readFileSync(file, 'utf8');
      if (txt.includes('\n')) return txt;
    } catch { /* not written yet */ }
    await sleep(50);
  }
  throw new Error('timed out waiting for ' + file);
}

// ── one websocket connection to one target ────────────────────────────────

class Session {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    this.closed = false;

    ws.addEventListener('message', ev => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject, timer } = this.pending.get(msg.id);
        clearTimeout(timer);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message + ' (' + JSON.stringify(msg.error) + ')'));
        else resolve(msg.result);
      } else if (msg.method) {
        (this.handlers.get(msg.method) || []).forEach(fn => fn(msg.params));
      }
    });
    ws.addEventListener('close', () => {
      this.closed = true;
      this.pending.forEach(({ reject, timer }) => { clearTimeout(timer); reject(new Error('CDP connection closed')); });
      this.pending.clear();
    });
  }

  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }

  send(method, params = {}, timeoutMs = 20000) {
    if (this.closed) return Promise.reject(new Error('CDP connection closed'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('CDP timeout after ' + timeoutMs + 'ms: ' + method));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.addEventListener('open', () => resolve(new Session(ws)), { once: true });
    ws.addEventListener('error', e => reject(new Error('websocket error: ' + (e.message || wsUrl))), { once: true });
  });
}

// ── a page ────────────────────────────────────────────────────────────────

class Page {
  constructor(session, targetId, browser) {
    this.session = session;
    this.targetId = targetId;
    this.browser = browser;
    this.errors = [];   // uncaught exceptions and console error entries
    this.dialogs = [];  // every alert/confirm text, so a test can assert on them
    // Accept is the default because almost every case wants the dialog out of
    // the way. Set this true around a click to press Cancel instead — the only
    // way to assert that a confirm() actually guards a destructive control,
    // rather than merely being displayed before it happens anyway.
    this.rejectDialogs = false;
  }

  static async create(browser, targetId, wsUrl) {
    const session = await connect(wsUrl);
    const page = new Page(session, targetId, browser);

    session.on('Runtime.exceptionThrown', p => {
      const d = p.exceptionDetails || {};
      page.errors.push('exception: ' + (d.exception && (d.exception.description || d.exception.value) || d.text));
    });
    session.on('Log.entryAdded', p => {
      if (p.entry && p.entry.level === 'error') page.errors.push('console: ' + p.entry.text + ' @ ' + (p.entry.url || ''));
    });
    // Trap 1: an unhandled dialog wedges the renderer for the rest of the run.
    // Every dialog is answered either way; `rejectDialogs` only picks which button.
    session.on('Page.javascriptDialogOpening', p => {
      page.dialogs.push(p.message);
      page.session.send('Page.handleJavaScriptDialog', { accept: !page.rejectDialogs }).catch(() => {});
    });

    await session.send('Page.enable');
    await session.send('Runtime.enable');
    await session.send('Log.enable');
    return page;
  }

  /* Install a document-start script. Runs before the page's own scripts on
     EVERY navigation, which is why every caller must be idempotent. */
  async addInitScript(source) {
    await this.session.send('Page.addScriptToEvaluateOnNewDocument', { source });
  }

  /* Wipe an origin's storage. Tabs share one browser profile, so without this
     a test inherits whatever the previous test (or a page's own bootstrap)
     left behind — and because seed() is guarded, the inherited data silently
     wins and the new fixture never applies. */
  async clearStorage(origin) {
    // local_storage only: track_db lives there, and clearing IndexedDB as well
    // disturbs the Firebase auth SDK's own startup for no benefit here.
    await this.session.send('Storage.clearDataForOrigin', { origin, storageTypes: 'local_storage' });
  }

  /* Seed track_db, guarded so a reload does not restore the fixture over
     whatever the application has since written (trap 3). */
  async seed(db, extraKeys = {}) {
    return this.seedRaw(JSON.stringify(db), extraKeys);
  }

  /* Seed the RAW track_db string. seed() stringifies its argument, so it can
     never produce the case that matters most here: bytes that are not valid
     JSON at all. Everything else is identical, including the reload guard —
     the fixture must not be restored over what the page has since written. */
  async seedRaw(raw, extraKeys = {}) {
    const payload = JSON.stringify(raw);
    const extras = JSON.stringify(extraKeys);
    await this.addInitScript(
      'try {' +
      '  if (localStorage.getItem("track_db") === null) localStorage.setItem("track_db", ' + payload + ');' +
      '  var extra = ' + extras + ';' +
      '  for (var k in extra) if (!localStorage.getItem(k)) localStorage.setItem(k, extra[k]);' +
      '} catch (e) {}'
    );
  }

  async goto(url, { waitFor = null, timeout = 30000 } = {}) {
    await this.session.send('Page.navigate', { url });
    await this.waitFor(function (u) { return document.readyState !== 'loading' && location.href.indexOf(u) === 0; },
      { args: [url.split('#')[0].split('?')[0]], timeout, message: 'navigation to ' + url });
    if (waitFor) await this.waitFor(waitFor, { timeout, message: 'post-navigation predicate for ' + url });
    return this;
  }

  async reload({ waitFor = null, timeout = 30000 } = {}) {
    await this.session.send('Page.reload', {});
    await this.waitFor(function () { return document.readyState !== 'loading'; }, { timeout, message: 'reload' });
    if (waitFor) await this.waitFor(waitFor, { timeout, message: 'post-reload predicate' });
    return this;
  }

  /* fn runs in the page. It must be self-contained — it is serialised, so it
     closes over nothing. Arguments are passed by JSON value. */
  async evaluate(fn, ...args) {
    const expression = '(' + fn.toString() + ').apply(null, ' + JSON.stringify(args) + ')';
    const res = await this.session.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true, userGesture: true
    });
    if (res.exceptionDetails) {
      const d = res.exceptionDetails;
      throw new Error('evaluate failed: ' + (d.exception && (d.exception.description || d.exception.value) || d.text));
    }
    return res.result.value;
  }

  /* Trap 4: poll a predicate rather than sleeping. */
  async waitFor(fn, { args = [], timeout = 15000, interval = 60, message = '' } = {}) {
    const deadline = Date.now() + timeout;
    let last;
    while (Date.now() < deadline) {
      try {
        last = await this.evaluate(fn, ...args);
        if (last) return last;
      } catch (e) { last = 'threw: ' + e.message; }
      await sleep(interval);
    }
    throw new Error('waitFor timed out after ' + timeout + 'ms' + (message ? ' — ' + message : '') +
      ' (last value: ' + JSON.stringify(last) + ')');
  }

  /* The Firebase overlay covers the page until it is dismissed. Signed out,
     "Skip" leaves firebase-sync.js inert and makes no Firestore request. */
  async skipFirebase() {
    // #fb-skip is in the overlay markup from the start but ships display:none,
    // and its onclick is attached only once the auth SDK has resolved to
    // signed-out. Clicking it before that silently does nothing, so wait for it
    // to be shown rather than merely to exist.
    await this.waitFor(function () {
      var b = document.getElementById('fb-skip');
      return (!!b && b.style.display !== 'none') || !document.getElementById('fb-overlay');
    }, { timeout: 30000, message: 'firebase skip button becoming clickable' });
    await this.evaluate(function () {
      var b = document.getElementById('fb-skip');
      if (b) b.click();
      return true;
    });
    // hideOverlay() fades for ~270ms, and waits for #root to fill first, so the
    // element outlives the click. Later clicks are programmatic and ignore hit
    // testing, but a test that asserts the overlay is gone must wait for it.
    await this.waitFor(function () { return !document.getElementById('fb-overlay'); },
      { timeout: 20000, message: 'firebase overlay removal' });
  }

  /* Pin the viewport for a case whose subject is layout at a given width.
     Chrome's headless default happens to be 800x600, which is narrow enough to
     reproduce most of them — but a case that only tests what it means to test
     because of a default nobody chose is one harness upgrade away from silently
     testing nothing, so a width-dependent case states its width. */
  async setViewport(width, height) {
    await this.session.send('Emulation.setDeviceMetricsOverride',
      { width, height, deviceScaleFactor: 1, mobile: false });
  }

  async close() {
    try { await this.browser.closeTarget(this.targetId); } catch { /* already gone */ }
    try { this.session.ws.close(); } catch { /* already closed */ }
  }
}

// ── cleanup ───────────────────────────────────────────────────────────────

/* Chrome forks a zygote, a GPU process, a network/storage utility and one
   renderer per tab. Signalling proc.pid alone kills the browser process and
   leaves every one of those reparented to init, which is where the stray
   `chrome --type=renderer` processes came from. launch() therefore spawns
   detached so Chrome leads its own process group, and a negative pid signals
   the whole group. */
function killTree(proc, sig) {
  if (!proc || proc.pid == null) return;
  try {
    process.kill(-proc.pid, sig);
    return;
  } catch { /* no group (not detached), or already gone — fall through */ }
  try { proc.kill(sig); } catch { /* already dead */ }
}

const PROFILE_PREFIX = 'track-cdp-';
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/* The backstop for the one case no handler can cover: a SIGKILL of node
   itself, which leaves the profile directory behind with nobody to remove it.

   Bounded by BOTH a strict prefix and an age, because this is the only code
   here that deletes something the current run did not create. A day is far
   past the 11-14 minutes a full suite takes, and a live Chrome keeps its own
   profile's mtime fresh, so a concurrent run is never swept out from under
   itself. Every error is swallowed: failing to tidy up must never fail a run. */
function sweepStaleProfiles(dir = os.tmpdir(), maxAgeMs = STALE_AFTER_MS) {
  let names;
  try { names = fs.readdirSync(dir); } catch { return; }
  const cutoff = Date.now() - maxAgeMs;
  for (const name of names) {
    if (!name.startsWith(PROFILE_PREFIX)) continue;
    const full = path.join(dir, name);
    try {
      const st = fs.statSync(full);
      if (!st.isDirectory() || st.mtimeMs >= cutoff) continue;
      fs.rmSync(full, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    } catch { /* raced, or not ours to remove */ }
  }
}

/* Browsers that have been launched and not yet closed. The exit handler below
   is the only thing standing between an interrupted run (Ctrl-C, an unhandled
   throw, the shell going away) and an orphaned Chrome holding a debug port. */
const _liveBrowsers = new Set();

let _reaperInstalled = false;
function installReaper() {
  if (_reaperInstalled) return;
  _reaperInstalled = true;
  // 'exit' allows synchronous work only, which is why reap() uses process.kill
  // and fs.rmSync rather than anything awaited.
  const reap = () => {
    for (const b of _liveBrowsers) {
      killTree(b.proc, 'SIGKILL');
      try { fs.rmSync(b.profileDir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
    _liveBrowsers.clear();
  };
  process.once('exit', reap);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.once(sig, () => { reap(); process.exit(1); });
  }
}

// ── the browser ───────────────────────────────────────────────────────────

class Browser {
  constructor(proc, endpoint, profileDir) {
    this.proc = proc;
    this.endpoint = endpoint;
    this.profileDir = profileDir;
    this.pages = [];
  }

  static available() { return !!findChrome(); }

  static async launch({ timeout = 30000 } = {}) {
    const bin = findChrome();
    if (!bin) throw new Error('no Chrome found; set CHROME_PATH');

    installReaper();
    sweepStaleProfiles();

    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), PROFILE_PREFIX));
    // detached: Chrome leads its own process group, so killTree can signal the
    // zygote, GPU process and renderers along with it.
    const proc = spawn(bin, [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--remote-debugging-port=0',
      '--user-data-dir=' + profileDir,
      'about:blank'
    ], { stdio: ['ignore', 'ignore', 'pipe'], detached: true });

    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString().slice(0, 2000); });

    const browser = new Browser(proc, null, profileDir);
    _liveBrowsers.add(browser);

    let port;
    try {
      port = (await waitForFile(path.join(profileDir, 'DevToolsActivePort'), timeout)).split('\n')[0].trim();
    } catch (e) {
      _liveBrowsers.delete(browser);
      killTree(proc, 'SIGKILL');
      try { fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
      catch { /* the sweep will get it */ }
      throw new Error('Chrome did not start: ' + e.message + '\n' + stderr);
    }
    browser.endpoint = 'http://127.0.0.1:' + port;
    return browser;
  }

  /* Tabs created this way share one profile, so they share an origin's
     localStorage — which is what makes cross-tab `storage` events fire. */
  async newPage(url = 'about:blank') {
    const res = await fetch(this.endpoint + '/json/new?' + encodeURI(url), { method: 'PUT' });
    if (!res.ok) throw new Error('could not open a tab: ' + res.status + ' ' + await res.text());
    const target = await res.json();
    const page = await Page.create(this, target.id, target.webSocketDebuggerUrl);
    this.pages.push(page);
    return page;
  }

  async closeTarget(targetId) {
    await fetch(this.endpoint + '/json/close/' + targetId).catch(() => {});
  }

  /* NEVER THROWS, and that is the whole point of it.

     The caller in browser.test.js is one statement — `await browser.close();
     await server.close();` — so a throw here skipped server.close() and left an
     HTTP server listening on localhost. Node cannot exit while a server is
     listening, so the run hung forever, holding its port and its Chrome. Nine
     such processes were found alive on the dev machine, aged 32-63 hours, every
     one having already reported `# fail 0`. Failing to delete a temp directory
     is a nuisance; letting that failure escape is an immortal process. */
  async close() {
    _liveBrowsers.delete(this);
    for (const p of this.pages) { try { p.session.ws.close(); } catch { /* ignore */ } }
    if (this.endpoint) {
      try { await fetch(this.endpoint + '/json/close/browser').catch(() => {}); } catch { /* ignore */ }
    }
    killTree(this.proc, 'SIGTERM');
    await this.waitForExit(3000);
    if (this.proc.exitCode === null) killTree(this.proc, 'SIGKILL');
    // remove only what this run created — Chrome may still be flushing profile
    // files as it exits, so retry, and shrug if it still will not go. The next
    // launch()'s sweep collects whatever is left behind.
    try {
      fs.rmSync(this.profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } catch (e) {
      console.error('warning: left ' + this.profileDir + ' behind (' + (e && e.code) + ')');
    }
  }

  /* A bare Promise.race against sleep() leaves its timer armed, which keeps the
     event loop alive for the full 3s after Chrome has already gone. The
     exitCode check matters for the same reason: 'exit' has already fired for a
     process that is gone, and `once` would never resolve. */
  waitForExit(ms) {
    if (this.proc.exitCode !== null && this.proc.exitCode !== undefined) return Promise.resolve();
    return new Promise(resolve => {
      const timer = setTimeout(resolve, ms);
      this.proc.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
}

module.exports = { Browser, Page, findChrome, sleep, killTree, sweepStaleProfiles, _liveBrowsers };
