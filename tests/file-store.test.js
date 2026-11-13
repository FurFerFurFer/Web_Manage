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
// Loading must touch nothing: trap the three things it could reach for.
const trap = name => new Proxy({}, { get(_, k) { touched.push(name + '.' + String(k)); return undefined; } });
globalThis.indexedDB = trap('indexedDB');
globalThis.document = trap('document');
const realFetch = globalThis.fetch;
globalThis.fetch = (...a) => { touched.push('fetch'); return realFetch(...a); };
vm.runInThisContext(SRC, { filename: 'file-store.js' });
const loadTouched = touched.slice();
delete globalThis.indexedDB; delete globalThis.document; globalThis.fetch = realFetch;

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
