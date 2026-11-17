/* ── tests/file-store.test.js ──────────────────────────────────────────────
   The Google Drive client in scripts/file-store.js (`TrackFileStore._drive`),
   driven against a FAKE Drive — a fetch function that keeps sessions and
   files in memory — so every case runs offline and deterministically.

   What this pins:

   1. An upload goes in CHUNK-sized pieces, a multiple of 256 KiB as Drive
      requires, each with the right Content-Range, and arrives byte-exact.
   2. It RESUMES: a failed chunk is retried; an upload stopped mid-way (a
      closed tab) carries on from the offset Drive reports, re-sending
      nothing; an expired session starts over once.
   3. A 401 stops at once (the token expired) — no retries against it.
   4. Delete is a move to Drive's TRASH; rename is a PATCH of the name.
   5. Loading the file does nothing: no database, no script, no request.

   The IndexedDB half and the page are covered by tests/browser.test.js.
*/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

globalThis.window = globalThis;
const SRC = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'file-store.js'), 'utf8');
let touched = [];
// Loading must touch nothing, including either kind of browser storage.
const trap = name => new Proxy({}, { get(_, k) { touched.push(name + '.' + String(k)); return undefined; } });
globalThis.indexedDB = trap('indexedDB');
globalThis.document = trap('document');
globalThis.sessionStorage = trap('sessionStorage');
globalThis.localStorage = trap('localStorage');
const realFetch = globalThis.fetch;
globalThis.fetch = () => { touched.push('fetch'); throw new Error('Loading must not reach the network'); };
vm.runInThisContext(SRC, { filename: 'file-store.js' });
const loadTouched = touched.slice();
delete globalThis.indexedDB; delete globalThis.document; globalThis.fetch = realFetch;
delete globalThis.sessionStorage; delete globalThis.localStorage;

const FS = globalThis.TrackFileStore;
const { makeDrive, uploadBlob, CONFIG } = FS._drive;

const KIB = 1024, MIB = 1024 * KIB;

// ── the fake Drive ─────────────────────────────────────────────────────────

function fakeDrive({ rangeHeader = true } = {}) {
  const d = {
    calls: [], sessions: new Map(), files: new Map(), nextId: 1,
    fail: [],             // queued failures: {match, status} or {match, network:true}
    putBytes: 0,
    expire(url) { d.sessions.delete(url); }
  };
  const res = (status, body, headers = {}) => new Response(body == null ? null : JSON.stringify(body),
    { status, headers: Object.assign({ 'Content-Type': 'application/json' }, headers) });
  d.fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    const headers = init.headers || {};
    d.calls.push({ url, method, headers, body: typeof init.body === 'string' ? init.body : null });
    const f = d.fail.findIndex(x => url.includes(x.match) && (!x.method || x.method === method));
    if (f >= 0) {
      const x = d.fail.splice(f, 1)[0];
      if (x.network) throw new TypeError('Failed to fetch');
      return res(x.status, { error: { code: x.status } });
    }
    if (url.includes('/upload/drive/v3/files?uploadType=resumable')) {
      const url2 = 'https://fake.upload/session/' + (d.nextId++);
      d.sessions.set(url2, { meta: JSON.parse(init.body), size: Number(headers['X-Upload-Content-Length']),
        mime: headers['X-Upload-Content-Type'], parts: [] });
      return res(200, null, { Location: url2 });
    }
    if (url.startsWith('https://fake.upload/session/')) {
      const s = d.sessions.get(url);
      if (!s) return res(404, { error: 'gone' });
      const have = s.parts.reduce((n, p) => n + p.length, 0);
      const range = headers['Content-Range'];
      const finish = () => {
        const id = 'drive-' + (d.nextId++);
        const bytes = Buffer.concat(s.parts);
        d.files.set(id, { meta: s.meta, bytes, mime: s.mime });
        d.sessions.delete(url);
        return res(200, { id });
      };
      const partial = n => res(308, null, rangeHeader && n > 0 ? { Range: 'bytes=0-' + (n - 1) } : {});
      if (/^bytes \*\//.test(range)) return have === s.size ? finish() : partial(have);
      const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range);
      assert.ok(m, 'Content-Range is well formed: ' + range);
      const start = Number(m[1]), end = Number(m[2]) + 1;
      assert.equal(start, have, 'a chunk starts exactly where Drive stopped');
      const buf = Buffer.from(await init.body.arrayBuffer());
      assert.equal(buf.length, end - start, 'the body is the range it claims');
      d.putBytes += buf.length;
      s.parts.push(buf);
      return end === s.size ? finish() : partial(end);
    }
    if (url.includes('/files?spaces=drive')) return res(200, { files: d.folder ? [{ id: d.folder }] : [] });
    if (method === 'POST' && url.includes('/drive/v3/files?fields=id')) {
      d.folder = 'folder-' + (d.nextId++);
      return res(200, { id: d.folder });
    }
    const pm = /\/drive\/v3\/files\/([^?]+)\?/.exec(url);
    if (pm && method === 'PATCH') {
      const id = decodeURIComponent(pm[1]);
      if (!d.files.has(id)) return res(404, { error: 'not found' });
      Object.assign(d.files.get(id).meta, JSON.parse(init.body));
      return res(200, { id });
    }
    if (pm && url.endsWith('alt=media')) {
      const id = decodeURIComponent(pm[1]);
      const f2 = d.files.get(id);
      return f2 ? new Response(f2.bytes, { status: 200, headers: { 'Content-Length': String(f2.bytes.length) } })
        : res(404, { error: 'not found' });
    }
    return res(400, { error: 'unexpected ' + method + ' ' + url });
  };
  return d;
}

// deterministic bytes, so a misplaced chunk cannot pass
function bytes(n) {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = (i * 31 + (i >> 8)) & 255;
  return b;
}
const noSleep = () => Promise.resolve();
const META = (blob, over = {}) => Object.assign({ id: 'f-1', name: 'limbs.pdf', mime: 'application/pdf',
  size: blob.size, folderId: 'folder-x' }, over);

// Each page has its own realm and memory, optionally sharing this tab's
// session map across a reload. No fake ever falls through to a live API.
const TOKEN_KEY = 'track_drive_token_v1';
const NOW = 1800000000000;
const settle = () => new Promise(resolve => setImmediate(resolve));
function authPage({ session = new Map(), clientId = 'synthetic-client', ready = true, storageDenied = false,
  fetch = async () => { throw new Error('Unexpected fake network request'); } } = {}) {
  const a = { session, storage: [], scripts: [], requests: [], network: [], idbWrites: [], timers: [], clock: NOW };
  const stores = { blobs: new Map(), queue: new Map(), meta: new Map() };
  const db = { transaction(name) {
    const t = {}, pending = [];
    t.objectStore = () => {
      const req = result => { const r = { result, onsuccess: null }; pending.push(r); return r; };
      return {
        get: key => req(stores[name].get(key)), getAll: () => req([...stores[name].values()]),
        getAllKeys: () => req([...stores[name].keys()]),
        put(value, key) { a.idbWrites.push({ name, value }); stores[name].set(key ?? value.key, value); return req(key); },
        delete(key) { stores[name].delete(key); return req(undefined); }
      };
    };
    queueMicrotask(() => { pending.forEach(r => r.onsuccess?.()); t.oncomplete?.(); });
    return t;
  } };
  // Timers are recorded, never run: a case fires one by hand.
  const ctx = { Promise, Map, Set, Blob, Response, Date: { now: () => a.clock },
    setTimeout: (fn, ms) => { a.timers.push({ fn, ms, cleared: false }); return a.timers.length; },
    clearTimeout: id => { if (a.timers[id - 1]) a.timers[id - 1].cleared = true; },
    sessionStorage: {
      getItem(key) { a.storage.push(['get', key]); if (storageDenied) throw new Error('denied'); return session.get(key) ?? null; },
      setItem(key, value) { a.storage.push(['set', key, value]); if (storageDenied) throw new Error('denied'); session.set(key, value); },
      removeItem(key) { a.storage.push(['remove', key]); if (storageDenied) throw new Error('denied'); session.delete(key); }
    },
    localStorage: new Proxy({}, { get() { throw new Error('localStorage must never be touched'); } }),
    document: { createElement: () => ({}), head: { appendChild: script => a.scripts.push(script) } },
    indexedDB: { open() { const r = {}; queueMicrotask(() => { r.result = db; r.onsuccess(); }); return r; } },
    fetch: (...args) => { a.network.push(args); return fetch(...args); }
  };
  ctx.window = ctx;
  a.ready = () => { ctx.google = { accounts: { oauth2: { initTokenClient(options) {
    return { requestAccessToken(args) { a.requests.push({ options, args }); if (a.requestThrows) throw new Error('popup blocked'); } };
  } } } }; };
  if (ready) a.ready();
  vm.runInNewContext(SRC, ctx, { filename: 'file-store.js' });
  a.FS = ctx.TrackFileStore;
  a.FS.configure({ clientId });
  a.reply = (index, data = { access_token: 'synthetic-token', expires_in: 3600 }) => a.requests[index].options.callback(data);
  a.error = (index, type) => a.requests[index].options.error_callback({ type });
  return a;
}

test('AUTH: no client id means no storage read, script, OAuth request or network', async () => {
  const a = authPage({ clientId: '', ready: false, session: new Map([[TOKEN_KEY, '{"token":"kept","expiresAt":9999999999999}']]) });
  await a.FS.autoConnect();
  await a.FS.preloadGis();
  assert.equal(a.FS.overview().connected, false);
  assert.equal(a.FS.overview().autoTap, false);
  await assert.rejects(a.FS.connect(), e => e.code === 'setup');
  await settle();
  assert.deepEqual(a.storage, []);
  assert.deepEqual(a.scripts, []);
  assert.deepEqual(a.requests, []);
  assert.deepEqual(a.network, []);
});

test('AUTH: a successful click keeps one session token with its actual expiry and reload restores its last minute', async () => {
  const a = authPage();
  const connected = a.FS.connect();
  a.reply(0, { access_token: 'synthetic-token', expires_in: 30 });
  await connected; await settle();
  assert.deepEqual([...a.session.keys()], [TOKEN_KEY]);
  assert.deepEqual(JSON.parse(a.session.get(TOKEN_KEY)), { token: 'synthetic-token', expiresAt: NOW + 30000 });
  const b = authPage({ session: a.session, ready: false });
  b.clock += 29000;
  assert.equal(b.FS.overview().connected, true, 'an unexpired token stays valid even in its last minute');
  const preloaded = b.FS.preloadGis();
  assert.deepEqual(b.scripts, [], 'preloading skips Google too when the token is kept');
  await preloaded; await b.FS.autoConnect(); await b.FS.connect(); await settle();
  assert.deepEqual(b.scripts, [], 'no sign-in script for a kept token');
  assert.deepEqual(b.requests, []);
  assert.deepEqual(b.network, []);
  assert.equal(b.FS.overview().autoTap, false);
  assert.equal(JSON.stringify(a.idbWrites).includes('synthetic-token'), false);
});

test('AUTH: expired or malformed session copies are removed and ignored', async () => {
  const invalid = ['{', 'null', '42', '[]', '{}', JSON.stringify({ token: 'old', expiresAt: NOW }),
    JSON.stringify({ token: 'old', expiresAt: NOW - 1 }), JSON.stringify({ token: 'x', expiresAt: String(NOW + 1000) }),
    JSON.stringify({ token: 42, expiresAt: NOW + 1000 }), JSON.stringify({ token: '  ', expiresAt: NOW + 1000 })];
  for (const raw of invalid) {
    const a = authPage({ session: new Map([[TOKEN_KEY, raw], ['unrelated', 'kept']]) });
    assert.equal(a.FS.overview().connected, false, raw);
    assert.equal(a.session.has(TOKEN_KEY), false, 'bad copy removed: ' + raw);
    assert.equal(a.session.get('unrelated'), 'kept');
    await a.FS.autoConnect(); await settle();
    assert.equal(a.requests.length, 1, 'bad copy does not suppress automatic connection');
  }
});

test('AUTH: a token expiring in memory removes its kept copy too', async () => {
  const a = authPage();
  const p = a.FS.connect(); a.reply(0, { access_token: 'short-lived', expires_in: 1 }); await p;
  a.clock += 1000;
  assert.equal(a.FS.overview().connected, false);
  assert.equal(a.session.has(TOKEN_KEY), false);
  await settle();
});

test('AUTH: a pass running out tells the listeners at that moment — a new one and a kept one; forgetting it cancels the notice', async () => {
  const a = authPage();
  const p = a.FS.connect(); a.reply(0, { access_token: 'short-lived', expires_in: 30 }); await p; await settle();
  const live = a.timers.filter(t => !t.cleared);
  assert.deepEqual(live.map(t => t.ms), [30050], 'one notice, just past the expiry');
  let told = 0; a.FS.on(() => { told++; });
  a.clock += 30000; live[0].fn(); await settle();
  assert.equal(told, 1, 'the listeners are told, so the Drive line can stop saying connected');
  assert.equal(a.FS.overview().connected, false);
  assert.equal(a.session.has(TOKEN_KEY), false);

  const b = authPage({ session: new Map([[TOKEN_KEY, JSON.stringify({ token: 'kept', expiresAt: NOW + 5000 })]]) });
  assert.equal(b.FS.overview().connected, true);
  assert.deepEqual(b.timers.filter(t => !t.cleared).map(t => t.ms), [5050], 'a kept pass is watched from the moment it is read');
  b.FS.disconnect();
  assert.deepEqual(b.timers.filter(t => !t.cleared), [], 'and a forgotten pass leaves no notice behind');
});

test('AUTH: denied session storage still permits an in-memory connection', async () => {
  const a = authPage({ storageDenied: true });
  const p = a.FS.connect(); a.reply(0); await p; await settle();
  assert.equal(a.FS.overview().connected, true);
  a.FS.disconnect();
  assert.equal(a.FS.overview().connected, false);
});

test('AUTO: waits for the script, starts only once without a hint, and does not wait for an OAuth callback', async () => {
  const a = authPage({ ready: false });
  await a.FS.autoConnect(); await a.FS.autoConnect();
  assert.equal(a.scripts.length, 1);
  assert.equal(a.requests.length, 0);
  assert.equal(a.FS.overview().autoTap, false, 'not until a request starts');
  a.ready(); a.scripts[0].onload(); await settle();
  assert.equal(a.requests.length, 1);
  assert.equal(a.requests[0].options.client_id, 'synthetic-client');
  assert.equal(a.requests[0].options.scope, 'https://www.googleapis.com/auth/drive.file');
  assert.deepEqual({ ...a.requests[0].args }, { prompt: '' });
  assert.equal('login_hint' in a.requests[0].options, false);
  assert.equal(a.FS.overview().autoTap, true, 'callback deliberately never invoked');
  await a.FS.autoConnect(); await settle();
  assert.equal(a.requests.length, 1);
});

test('AUTO: success connects and keeps the token without a tap', async () => {
  const a = authPage();
  await a.FS.autoConnect(); await settle(); a.reply(0); await settle();
  assert.equal(a.FS.overview().connected, true);
  assert.equal(a.FS.overview().autoTap, false);
  assert.equal(JSON.parse(a.session.get(TOKEN_KEY)).token, 'synthetic-token');
});

test('AUTO: blocked or unknown popup errors retain one tap fallback; a failed tap consumes it permanently', async () => {
  for (const type of ['popup_failed_to_open', 'unknown']) {
    const a = authPage();
    await a.FS.autoConnect(); await settle(); a.error(0, type);
    assert.equal(a.FS.overview().autoTap, true, type);
    const p = a.FS.connect();
    assert.equal(a.requests.length, 2);
    assert.equal(a.FS.overview().autoTap, false, 'consumed as soon as the tap starts');
    a.error(1, type); await assert.rejects(p, e => e.code === 'auth');
    await a.FS.autoConnect(); await settle();
    assert.equal(a.FS.overview().autoTap, false);
    assert.equal(a.requests.length, 2, 'no repeated automatic popups');
    const retry = a.FS.connect(); a.reply(2); await retry;
    assert.equal(a.FS.overview().connected, true, 'an explicit Connect can retry');
    await settle();
  }
});

test('AUTO: closing the chooser stops the tap fallback for this load', async () => {
  const a = authPage();
  await a.FS.autoConnect(); await settle(); a.error(0, 'popup_closed');
  assert.equal(a.FS.overview().autoTap, false);
  await a.FS.autoConnect(); await settle();
  assert.equal(a.requests.length, 1);
  assert.match(a.FS.overview().error, /closed/);
  const p = a.FS.connect(); a.reply(1); await p; await settle();
  assert.equal(a.FS.overview().connected, true, 'explicit Connect remains available');
});

test('AUTO: a click works when the automatic callback never arrives; stale callbacks cannot settle it', async () => {
  const a = authPage();
  await a.FS.autoConnect(); await settle();
  let resolved = false;
  const p = a.FS.connect().then(() => { resolved = true; });
  assert.equal(a.requests.length, 2, 'the click makes its own request immediately');
  a.reply(0, { access_token: 'stale-auto', expires_in: 3600 }); await settle();
  assert.equal(a.FS.overview().connected, false, 'superseded automatic success is ignored');
  assert.equal(resolved, false);
  a.reply(1); await p; await settle();
  assert.equal(a.FS.overview().connected, true);
  assert.equal(JSON.parse(a.session.get(TOKEN_KEY)).token, 'synthetic-token');
});

test('AUTO: a click while the script loads prevents a later automatic popup', async () => {
  const a = authPage({ ready: false });
  await a.FS.autoConnect();
  await assert.rejects(a.FS.connect(), e => e.code === 'net');
  a.ready(); a.scripts[0].onload(); await settle();
  assert.equal(a.requests.length, 0);
  assert.equal(a.FS.overview().autoTap, false);
  const p = a.FS.connect(); a.reply(0); await p; await settle();
});

test('AUTO: script failure and synchronous popup errors settle without unhandled rejection', async () => {
  const a = authPage({ ready: false });
  await a.FS.autoConnect(); a.scripts[0].onerror(); await settle();
  assert.match(a.FS.overview().error, /Could not load/);
  assert.equal(a.FS.overview().autoTap, false);
  const b = authPage(); b.requestThrows = true;
  await b.FS.autoConnect(); await settle();
  assert.equal(b.FS.overview().autoTap, true);
  await assert.rejects(b.FS.connect(), e => e.code === 'auth');
  assert.equal(b.FS.overview().autoTap, false);
});

test('AUTH: disconnect removes the kept token and stops automatic attempts, including pending script loads', async () => {
  const a = authPage();
  const p = a.FS.connect(); a.reply(0); await p; await settle();
  a.FS.disconnect();
  assert.equal(a.session.has(TOKEN_KEY), false);
  assert.equal(a.FS.overview().connected, false);
  await a.FS.autoConnect(); await settle();
  assert.equal(a.requests.length, 1);
  assert.equal(a.FS.overview().autoTap, false);
  const b = authPage({ ready: false });
  await b.FS.autoConnect(); b.FS.disconnect(); b.ready(); b.scripts[0].onload(); await settle();
  assert.equal(b.requests.length, 0);
});

test('AUTH: disconnect invalidates in-flight callbacks and rejects a pending click', async () => {
  const a = authPage();
  await a.FS.autoConnect(); await settle(); a.FS.disconnect(); a.reply(0); await settle();
  assert.equal(a.FS.overview().connected, false);
  assert.equal(a.session.has(TOKEN_KEY), false);
  const p = a.FS.connect(); a.FS.disconnect();
  await assert.rejects(p, e => e.code === 'cancelled');
  a.reply(1); await settle();
  assert.equal(a.FS.overview().connected, false);
});

test('AUTH: a second click cancels its predecessor and stale error callbacks cannot reject it', async () => {
  const a = authPage();
  const first = a.FS.connect();
  const second = a.FS.connect();
  assert.equal(a.requests.length, 2, 'the second click starts a separate request');
  await assert.rejects(first, e => e.code === 'cancelled');
  a.error(0, 'popup_closed');
  assert.equal(a.FS.overview().error, null, 'old error ignored');
  a.reply(1); await second; await settle();
  assert.equal(a.FS.overview().connected, true);
});

test('AUTH: a download 401 forgets both token copies and a reload cannot restore it', async () => {
  const a = authPage({ fetch: async () => new Response(null, { status: 401 }) });
  const p = a.FS.connect(); a.reply(0); await p; await settle();
  await assert.rejects(a.FS.fetchBlob({ id: 'file', driveId: 'remote' }), e => e.code === 'auth');
  assert.equal(a.session.has(TOKEN_KEY), false);
  assert.equal(a.FS.overview().connected, false);
  assert.equal(authPage({ session: a.session }).FS.overview().connected, false);
});

test('AUTH: a queued Drive operation returning 401 removes the kept token too', async () => {
  const a = authPage({ fetch: async () => new Response(null, { status: 401 }) });
  const p = a.FS.connect(); a.reply(0); await p; await settle();
  await a.FS.renamed({ id: 'file', driveId: 'remote' }, 'renamed.pdf'); await settle();
  assert.equal(a.session.has(TOKEN_KEY), false);
  assert.equal(a.FS.overview().connected, false);
  assert.match(a.FS.overview().error, /connect again/);
});

// ── cases ──────────────────────────────────────────────────────────────────

test('loading file-store.js opens no database, loads no script, makes no request', () => {
  assert.deepEqual(loadTouched, []);
  assert.equal(typeof FS.connect, 'function');
});

test('the chunk is a multiple of 256 KiB, as Drive requires', () => {
  assert.equal(CONFIG.chunkSize % (256 * KIB), 0);
  assert.ok(CONFIG.chunkSize >= 256 * KIB);
});

test('a 20 MiB upload goes in three chunks and arrives byte-exact, in the Track Files folder', async () => {
  const d = fakeDrive();
  const drive = makeDrive(d.fetch, () => 'tok');
  const src = bytes(20 * MIB);
  const blob = new Blob([src], { type: 'application/pdf' });
  const offsets = [];
  const id = await uploadBlob(drive, blob, META(blob), {}, { onProgress: o => offsets.push(o), sleep: noSleep });
  const file = d.files.get(id);
  assert.ok(file, 'Drive has the file');
  assert.deepEqual(Buffer.compare(file.bytes, Buffer.from(src)), 0, 'byte-exact');
  assert.deepEqual(file.meta.parents, ['folder-x']);
  assert.deepEqual(file.meta.appProperties, { trackId: 'f-1' }, 'the Drive copy names its record');
  assert.equal(file.mime, 'application/pdf');
  const puts = d.calls.filter(c => c.method === 'PUT').map(c => c.headers['Content-Range']);
  assert.deepEqual(puts, ['bytes 0-8388607/20971520', 'bytes 8388608-16777215/20971520', 'bytes 16777216-20971519/20971520']);
  assert.deepEqual(offsets, [8 * MIB, 16 * MIB], 'progress after each chunk that did not finish it');
  assert.equal(d.calls.find(c => c.method === 'PUT').headers.Authorization, 'Bearer tok');
});

test('a failed chunk is retried and the upload completes; nothing is sent twice', async () => {
  const d = fakeDrive();
  const drive = makeDrive(d.fetch, () => 'tok');
  const blob = new Blob([bytes(12 * MIB)]);
  d.fail.push({ match: 'fake.upload/session', method: 'PUT', network: true });
  d.fail.push({ match: 'fake.upload/session', method: 'PUT', status: 503 });
  const slept = [];
  const id = await uploadBlob(drive, blob, META(blob), {}, { sleep: ms => { slept.push(ms); return Promise.resolve(); } });
  assert.ok(d.files.get(id));
  assert.equal(d.putBytes, 12 * MIB, 'every byte landed once');
  assert.deepEqual(slept, [1000, 2000], 'backoff doubles');
});

test('a stopped upload resumes from where Drive stopped, re-sending nothing', async () => {
  const d = fakeDrive();
  const drive = makeDrive(d.fetch, () => 'tok');
  const src = bytes(20 * MIB);
  const blob = new Blob([src]);
  const state = {};
  let stop = false;
  await assert.rejects(uploadBlob(drive, blob, META(blob), state, {
    onProgress: () => { stop = true; }, cancelled: () => stop, sleep: noSleep
  }), e => e.code === 'cancelled');
  assert.ok(state.sessionUrl, 'the session was kept');
  assert.equal(state.offset, 8 * MIB);
  // a later page load: a fresh state object built from what the queue kept
  const resumed = { sessionUrl: state.sessionUrl, offset: state.offset };
  const id = await uploadBlob(drive, blob, META(blob), resumed, { sleep: noSleep });
  assert.equal(Buffer.compare(d.files.get(id).bytes, Buffer.from(src)), 0);
  assert.equal(d.putBytes, 20 * MIB, 'no byte was uploaded twice');
  const status = d.calls.filter(c => c.method === 'PUT' && c.headers['Content-Range'] === 'bytes */20971520');
  assert.equal(status.length, 1, 'it asked Drive where it stood');
});

test('an expired session starts over from byte 0, once', async () => {
  const d = fakeDrive();
  const drive = makeDrive(d.fetch, () => 'tok');
  const blob = new Blob([bytes(3 * MIB)]);
  const state = { sessionUrl: 'https://fake.upload/session/old', offset: MIB };
  const id = await uploadBlob(drive, blob, META(blob), state, { sleep: noSleep });
  assert.ok(d.files.get(id));
  assert.notEqual(state.sessionUrl, 'https://fake.upload/session/old');
});

test('a 308 with no Range header means the chunk landed', async () => {
  const d = fakeDrive({ rangeHeader: false });
  const drive = makeDrive(d.fetch, () => 'tok');
  const src = bytes(17 * MIB);
  const blob = new Blob([src]);
  const id = await uploadBlob(drive, blob, META(blob), {}, { sleep: noSleep });
  assert.equal(Buffer.compare(d.files.get(id).bytes, Buffer.from(src)), 0);
});

test('a 401 stops at once: the token expired, and retrying cannot help', async () => {
  const d = fakeDrive();
  const drive = makeDrive(d.fetch, () => 'tok');
  const blob = new Blob([bytes(MIB)]);
  d.fail.push({ match: 'uploadType=resumable', status: 401 });
  const slept = [];
  await assert.rejects(uploadBlob(drive, blob, META(blob), {}, { sleep: ms => { slept.push(ms); return Promise.resolve(); } }),
    e => e.code === 'auth');
  assert.deepEqual(slept, [], 'no retries');
});

test('with no token nothing is sent', async () => {
  const d = fakeDrive();
  const drive = makeDrive(d.fetch, () => null);
  await assert.rejects(drive.findFolder('Track Files'), e => e.code === 'auth');
  assert.equal(d.calls.length, 0);
});

test('an empty file is a single zero-length upload', async () => {
  const d = fakeDrive();
  const drive = makeDrive(d.fetch, () => 'tok');
  const blob = new Blob([]);
  const id = await uploadBlob(drive, blob, META(blob), {}, { sleep: noSleep });
  assert.equal(d.files.get(id).bytes.length, 0);
  assert.deepEqual(d.calls.filter(c => c.method === 'PUT').map(c => c.headers['Content-Range']), ['bytes */0']);
});

test('delete moves the Drive copy to the trash; rename patches the name; both survive a vanished file', async () => {
  const d = fakeDrive();
  const drive = makeDrive(d.fetch, () => 'tok');
  const blob = new Blob([bytes(KIB)]);
  const id = await uploadBlob(drive, blob, META(blob), {}, { sleep: noSleep });
  await drive.rename(id, 'Upper limb.pdf');
  assert.equal(d.files.get(id).meta.name, 'Upper limb.pdf');
  await drive.trash(id);
  assert.equal(d.files.get(id).meta.trashed, true, 'trashed, not deleted: restorable from Drive for 30 days');
  assert.equal(d.calls.filter(c => c.method === 'DELETE').length, 0, 'never a hard delete');
  assert.equal(await drive.trash('drive-missing'), true, 'already gone counts as done');
  await assert.rejects(drive.rename('drive-missing', 'x'), e => e.code === 'gone');
});

test('the folder is looked up before it is made, and the name is quoted safely', async () => {
  const d = fakeDrive();
  const drive = makeDrive(d.fetch, () => 'tok');
  assert.equal(await drive.findFolder("Kru's files"), null);
  const q = decodeURIComponent(d.calls[0].url.split('&q=')[1]);
  assert.match(q, /^name='Kru\\'s files' and mimeType='application\/vnd\.google-apps\.folder' and trashed=false$/);
  const made = await drive.createFolder('Track Files');
  assert.equal(await drive.findFolder('Track Files'), made);
});

test('download streams the bytes back with progress', async () => {
  const d = fakeDrive();
  const drive = makeDrive(d.fetch, () => 'tok');
  const src = bytes(3 * MIB);
  const blob = new Blob([src]);
  const id = await uploadBlob(drive, blob, META(blob), {}, { sleep: noSleep });
  const seen = [];
  const got = await drive.download(id, f => seen.push(f));
  assert.equal(Buffer.compare(Buffer.from(await got.arrayBuffer()), Buffer.from(src)), 0);
  assert.equal(seen[seen.length - 1], 1, 'progress reaches 1');
  await assert.rejects(drive.download('drive-missing'), e => e.code === 'gone');
});
