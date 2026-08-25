/* ── tests/cdp-cleanup.test.js ─────────────────────────────────────────────
   Offline cover for the parts of tests/lib/cdp.js that run AFTER the last
   assertion: killing Chrome, and removing the profile directory.

       node --test tests/cdp-cleanup.test.js

   Run once by tests/run.js rather than once per timezone: there is no date
   code in this module, so a sweep would cost five runs and prove exactly the
   same thing. Same reasoning as true-storage-core.test.js, graph-layout.test.js
   and doc-table-core.test.js.

   No Chrome is launched here. Browser's constructor takes (proc, endpoint,
   profileDir), so a stub `proc` drives close() end to end, and the fetch to a
   dead endpoint is already swallowed by close()'s own .catch.

   What is being pinned, in order of what it cost to get wrong:

   1. close() NEVER THROWS. This is the whole file's reason to exist. It used
      to let fs.rmSync's ENOTEMPTY escape, and the caller in browser.test.js
      is `await browser.close(); await server.close();` — one statement, so the
      throw skipped server.close() and left an HTTP server listening. Node then
      could not exit, and the run hung forever holding its port. Nine such
      processes were found alive on the dev machine, aged 32-63 hours, every one
      of them having already reported `# fail 0`. A leftover temp directory is a
      nuisance; a leaked listener is an immortal process.

   2. The kill targets the process GROUP, not the root process. Chrome forks a
      zygote, a GPU process, a network/storage utility and one renderer per tab.
      Signalling proc.pid alone leaves all of them reparented to init.

   3. The sweep is bounded by BOTH a strict `track-cdp-` prefix and an age. It
      is the only code in this repository that deletes something the current run
      did not create, so it gets tested for what it must NOT remove, not only
      for what it must.

   Fixtures are synthetic, always (AGENTS.md, "Preserve old data").

   A PASSING run of this file prints NOTHING. Three cases deliberately make
   fs.rmSync throw, and close() responds by warning to console.error — but
   withFailingRmSync captures that warning and asserts on it rather than
   letting it reach the terminal. Scary text in a green run is a real cost: it
   trains a reader to ignore the warning, and the warning matters, because
   outside these tests it fires only when a directory genuinely will not go.
*/
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CDP = require('./lib/cdp.js');
const { Browser } = CDP;

const DAY = 24 * 60 * 60 * 1000;

/* A stand-in for the ChildProcess of a Chrome that has already exited. A
   non-null exitCode means waitForExit() returns immediately and the SIGKILL
   escalation is not taken; `once('exit')` still fires synchronously for the
   exitCode:null case, where the wait is genuinely entered. */
function stubProc({ pid = 4242, exitCode = 0 } = {}) {
  const calls = [];
  return {
    pid,
    exitCode,
    calls,
    kill(sig) { calls.push(sig); return true; },
    once(evt, cb) { if (evt === 'exit') cb(0); }
  };
}

function scratchDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-cleanup-test-'));
  test.after(() => { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } });
  return d;
}

function enotempty(dir) {
  const e = new Error("ENOTEMPTY: directory not empty, rmdir '" + dir + "'");
  e.code = 'ENOTEMPTY';
  e.syscall = 'rmdir';
  e.path = dir;
  return e;
}

/* Runs fn with fs.rmSync throwing ENOTEMPTY, and CAPTURES the warning close()
   prints instead of letting it reach the terminal. Both halves matter:

   - Captured, so a PASSING run prints no scary ENOTEMPTY text. A warning a
     reader cannot evaluate is worse than no warning: it trains them to ignore
     the real one, which fires only when a directory genuinely will not go.
   - Returned rather than discarded, so each caller can ASSERT the warning was
     produced. That is strictly better than printing it — the reporting is now
     covered behaviour rather than decoration, and silencing it later would
     fail a test instead of quietly losing the only sign anything happened.

   Restores both globals however fn ends. */
async function withFailingRmSync(dir, fn) {
  const realRm = fs.rmSync;
  const realErr = console.error;
  const warnings = [];
  fs.rmSync = () => { throw enotempty(dir); };
  console.error = (...a) => { warnings.push(a.join(' ')); };
  try { await fn(); } finally { fs.rmSync = realRm; console.error = realErr; }
  return warnings;
}

// ── close() is total ───────────────────────────────────────────────────────

test('close() resolves even when the profile directory cannot be removed', async () => {
  const dir = scratchDir();
  const b = new Browser(stubProc(), 'http://127.0.0.1:1', dir);

  // The regression: this used to reject, and the rejection escaped the
  // caller's teardown before it could close its HTTP server.
  const warnings = await withFailingRmSync(dir, () => b.close());

  assert.equal(warnings.length, 1, 'it reported the failure exactly once');
  assert.match(warnings[0], /ENOTEMPTY/, 'the warning names the reason');
  assert.ok(warnings[0].includes(dir), 'and names the directory it gave up on');
});

test('close() has already killed Chrome by the time the removal fails', async () => {
  const dir = scratchDir();
  const proc = stubProc();
  const b = new Browser(proc, 'http://127.0.0.1:1', dir);

  await withFailingRmSync(dir, () => b.close());

  assert.ok(proc.calls.length > 0, 'the browser was signalled');
  assert.equal(proc.calls[0], 'SIGTERM', 'politely first');
});

test('close() escalates to SIGKILL when the browser has not exited', async () => {
  const dir = scratchDir();
  const proc = stubProc({ exitCode: null });
  const b = new Browser(proc, 'http://127.0.0.1:1', dir);

  await b.close();

  assert.deepEqual(proc.calls, ['SIGTERM', 'SIGKILL']);
});

test('close() removes the profile directory when it can', async () => {
  const dir = scratchDir();
  const mine = path.join(dir, 'profile');
  fs.mkdirSync(mine);
  fs.writeFileSync(path.join(mine, 'Preferences'), '{}');

  await new Browser(stubProc(), 'http://127.0.0.1:1', mine).close();

  assert.equal(fs.existsSync(mine), false, 'the directory is gone');
});

test('close() drops the browser from the live registry, even on a failed removal', async () => {
  const dir = scratchDir();
  const b = new Browser(stubProc(), 'http://127.0.0.1:1', dir);
  CDP._liveBrowsers.add(b);

  await withFailingRmSync(dir, () => b.close());

  assert.equal(CDP._liveBrowsers.has(b), false,
    'a closed browser is not left for the exit handler to kill twice');
});

// ── killTree ───────────────────────────────────────────────────────────────

test('killTree signals the whole process group, not just the root', () => {
  const real = process.kill;
  const seen = [];
  process.kill = (pid, sig) => { seen.push([pid, sig]); };
  try {
    CDP.killTree(stubProc({ pid: 4242 }), 'SIGTERM');
  } finally { process.kill = real; }

  assert.deepEqual(seen, [[-4242, 'SIGTERM']],
    'a negative pid is the process group — Chrome forks a zygote, a GPU process and one renderer per tab');
});

test('killTree falls back to the single process when there is no group', () => {
  const real = process.kill;
  const proc = stubProc({ pid: 4242 });
  process.kill = () => { const e = new Error('no such process'); e.code = 'ESRCH'; throw e; };
  try {
    CDP.killTree(proc, 'SIGKILL');
  } finally { process.kill = real; }

  assert.deepEqual(proc.calls, ['SIGKILL'], 'the child was still signalled directly');
});

test('killTree on an already-dead process is silent', () => {
  const real = process.kill;
  process.kill = () => { const e = new Error('gone'); e.code = 'ESRCH'; throw e; };
  const proc = stubProc();
  proc.kill = () => { const e = new Error('gone'); e.code = 'ESRCH'; throw e; };
  try {
    CDP.killTree(proc, 'SIGKILL'); // must not throw
  } finally { process.kill = real; }
});

// ── the stale-profile sweep ────────────────────────────────────────────────

function agedDir(root, name, ageMs) {
  const d = path.join(root, name);
  fs.mkdirSync(d);
  fs.writeFileSync(path.join(d, 'Preferences'), '{}');
  const t = new Date(Date.now() - ageMs);
  fs.utimesSync(d, t, t);
  return d;
}

test('the sweep removes a track-cdp directory older than a day', () => {
  const root = scratchDir();
  const old = agedDir(root, 'track-cdp-OLD', 2 * DAY);

  CDP.sweepStaleProfiles(root);

  assert.equal(fs.existsSync(old), false);
});

test('the sweep keeps a track-cdp directory younger than a day', () => {
  const root = scratchDir();
  // A live Chrome keeps its own profile's mtime fresh, which is what makes an
  // age test safe while another session is mid-run.
  const fresh = agedDir(root, 'track-cdp-FRESH', 5 * 60 * 1000);

  CDP.sweepStaleProfiles(root);

  assert.equal(fs.existsSync(fresh), true, 'a concurrent run is not swept out from under itself');
});

test('the sweep ignores anything not named track-cdp-, however old', () => {
  const root = scratchDir();
  const other = agedDir(root, 'important-backup', 30 * DAY);
  const near = agedDir(root, 'track-cdp', 30 * DAY);          // no trailing dash
  const nested = agedDir(root, 'not-track-cdp-thing', 30 * DAY);

  CDP.sweepStaleProfiles(root);

  assert.equal(fs.existsSync(other), true, 'an unrelated directory is untouched');
  assert.equal(fs.existsSync(near), true, 'the prefix match is exact');
  assert.equal(fs.existsSync(nested), true, 'the prefix is anchored at the start');
});

test('the sweep survives a directory it cannot read', () => {
  const root = scratchDir();
  CDP.sweepStaleProfiles(path.join(root, 'does-not-exist'));  // must not throw
});

// ── module surface ─────────────────────────────────────────────────────────

test('module surface', () => {
  assert.deepEqual(Object.keys(CDP).sort(),
    ['Browser', 'Page', '_liveBrowsers', 'findChrome', 'killTree', 'sleep', 'sweepStaleProfiles'].sort());
});
