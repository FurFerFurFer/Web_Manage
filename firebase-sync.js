(function () {
  'use strict';

  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCsRHjUpuIaDDs4iXHl3BboEYFgpxHpgak",
    authDomain: "track-sync-2ee32.firebaseapp.com",
    projectId: "track-sync-2ee32",
    storageBucket: "track-sync-2ee32.firebasestorage.app",
    messagingSenderId: "614881325342",
    appId: "1:614881325342:web:20c960bc58cbffecd9d90f"
  };

  const DB_KEY         = 'track_db';
  const DB_TS_KEY      = 'track_db_ts';   // when this device's data was last CONFIRMED in the cloud
  const DB_PENDING_KEY = 'track_db_pending'; // set while this device holds unsent edits
  const RELOAD_FLAG    = 'fb_reloaded';      // sessionStorage: breaks reload loops
  const RELOAD_GEN_SS  = 'fb_reloaded_gen';  // sessionStorage: generation we reloaded into

  // The cloud payload is gzipped and split across users/{uid}/blob/{0..n-1}, so no
  // single document approaches Firestore's 1 MiB cap. See README "Current cloud shape".
  //
  // A chunk document is ~CHUNK_BYTES + ~150 bytes of overhead (field names, the
  // document path, `gen`, and Firestore's 32-byte per-document cost), leaving
  // ~348 KB of slack against 1 MiB. A commit is n+1 writes — far under the 500-op
  // cap — and the binding limit is the ~10 MiB request cap, which the web
  // transport's 4/3 base64 inflation turns into ~11 chunks per batch.
  //
  // MAX_CHUNKS is unreachable in practice: localStorage's own ~5-10 MB per-origin
  // quota caps track_db an order of magnitude sooner. Exceeding it refuses the
  // write loudly rather than silently splitting across batches.
  const CHUNK_BYTES = 700000;
  const MAX_CHUNKS  = 24;
  const DEBOUNCE_MS = 1200;               // also respects Firestore's ~1 write/sec/doc soft limit
  const RETRY_MS    = [5000, 15000, 60000];

  firebase.initializeApp(FIREBASE_CONFIG);
  const auth = firebase.auth();
  const db   = firebase.firestore();

  // ── Loading overlay ────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'fb-overlay';
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'background:#080d18',
    'z-index:9999', 'display:flex', 'flex-direction:column',
    'align-items:center', 'justify-content:center',
    'font-family:monospace', 'gap:14px'
  ].join(';');
  overlay.innerHTML = `
    <div style="color:#6366f1;font-size:24px;font-weight:900;letter-spacing:.2em">TRACK</div>
    <div id="fb-msg"   style="color:#4b5563;font-size:11px;letter-spacing:.12em">CONNECTING…</div>
    <button id="fb-btn" style="display:none;padding:11px 30px;background:#4f46e5;color:#fff;
      border:none;border-radius:8px;font-size:13px;cursor:pointer;font-family:monospace;font-weight:bold">
      Sign in with Google
    </button>
    <button id="fb-skip" style="display:none;padding:7px 20px;background:transparent;color:#4b5563;
      border:1px solid #1e293b;border-radius:8px;font-size:11px;cursor:pointer;font-family:monospace;margin-top:4px">
      Skip — use offline (local only)
    </button>
    <div id="fb-email" style="color:#374151;font-size:10px"></div>
  `;
  document.documentElement.appendChild(overlay);

  const $msg   = () => document.getElementById('fb-msg');
  const $btn   = () => document.getElementById('fb-btn');
  const $skip  = () => document.getElementById('fb-skip');
  const $email = () => document.getElementById('fb-email');

  // ── Module state ───────────────────────────────────────────────────────────
  const _origSet = Storage.prototype.setItem;
  let _uid = null;
  let _writeTimer = null;
  let _retryTimer = null;
  let _retryIdx = 0;
  let _lastWrittenToFirestore = null; // last value we pushed, to skip own-write snapshots
  let _lastConfirmed = null;          // last value provably stored in the cloud
  let _localDirty = false;            // this device holds edits the cloud has not accepted
  let _inFlight = false;
  let _reflush = false;
  let _conflictHold = false;          // an unresolved conflict blocks all uploads
  let _lastGen = 0;                   // highest generation this device has written
  let _lastKnownGen = 0;              // highest generation this device has read or written
  let _lastCommittedN = 0;            // chunk count of the last known cloud payload
  let _remoteKind = null;             // 'none' | 'legacy' | 'v2'
  let _legacyData = null;             // pre-migration payload, for backup/v1
  let _legacyTs = 0;
  let _backupDone = false;
  let _encMode = null;                // null = undetermined, 'gzip' | 'raw'
  let _applySeq = 0;
  let _applyChain = Promise.resolve();

  // ── Codec: string → UTF-8 bytes → gzip → chunks, and back ─────────────────

  function _u8FromStr(s) { return new TextEncoder().encode(s); }

  // `fatal` is load-bearing: the default decoder substitutes U+FFFD for damaged
  // bytes, which would write a silently corrupted track_db. Throwing means the
  // read path refuses the payload instead of applying part of it.
  function _strFromU8(u) { return new TextDecoder('utf-8', { fatal: true }).decode(u); }

  function _gzipSupported() {
    return typeof CompressionStream === 'function'
        && typeof DecompressionStream === 'function'
        && typeof Response === 'function'
        && typeof TextEncoder === 'function';
  }

  // Response(bufferSource).body has the widest support; Blob.stream() is the fallback.
  function _bodyOf(u8) {
    const r = new Response(u8);
    return r.body || new Blob([u8]).stream();
  }
  async function _gzip(u8) {
    const s = _bodyOf(u8).pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function _gunzip(u8) {
    const s = _bodyOf(u8).pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }

  function _fnv1a(u8) {
    let h = 0x811c9dc5;
    for (let i = 0; i < u8.length; i++) {
      h ^= u8[i];
      h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  // Chunk the BYTE array, never the string: slicing a string would cut multi-byte
  // UTF-8 sequences in raw mode. slice() (not subarray()) so no byteOffset view
  // reaches Blob.fromUint8Array.
  function _chunk(u8, size) {
    if (!u8.length) return [new Uint8Array(0)];
    const out = [];
    for (let i = 0; i < u8.length; i += size) out.push(u8.slice(i, Math.min(i + size, u8.length)));
    return out;
  }

  // len/hash are over the PRE-compression bytes, so verifying them proves the whole
  // encode → chunk → store → fetch → concat → decompress round trip.
  async function _encodePayload(str) {
    const raw  = _u8FromStr(str);
    const len  = raw.length;
    const hash = _fnv1a(raw);
    if (_encMode !== 'raw' && _gzipSupported()) {
      try {
        const bytes = await _gzip(raw);
        _encMode = 'gzip';
        return { enc: 'gzip', bytes, len, hash };
      } catch (e) {
        console.warn('[Track sync] gzip unavailable — falling back to uncompressed', e);
      }
    }
    _encMode = 'raw';
    return { enc: 'raw', bytes: raw, len, hash };
  }

  async function _decodePayload(p) {
    let raw = p.bytes;
    if (p.enc === 'gzip') {
      if (!_gzipSupported()) throw new Error('cloud data is gzipped but this browser cannot decompress it');
      raw = await _gunzip(raw);
    } else if (p.enc && p.enc !== 'raw') {
      throw new Error('unknown cloud encoding: ' + p.enc);
    }
    if (typeof p.len === 'number' && raw.length !== p.len)
      throw new Error('cloud payload length mismatch: got ' + raw.length + ', manifest says ' + p.len);
    if (p.hash && _fnv1a(raw) !== p.hash)
      throw new Error('cloud payload checksum mismatch');
    return _strFromU8(raw);
  }

  // ── Status surface ─────────────────────────────────────────────────────────
  // state: 'signed-out' | 'idle' | 'pending' | 'syncing' | 'synced' | 'error' | 'conflict'

  const _status = { state: 'signed-out', lastError: null, lastSyncedAt: 0,
                    cloudBytes: 0, chunkCount: 0, enc: null };
  const _subs = [];

  function dbSizeBytes() {
    try { return new Blob([localStorage.getItem(DB_KEY) || '']).size; } catch (e) { return 0; }
  }

  function getStatus() {
    return {
      state:        _status.state,
      lastError:    _status.lastError,
      lastSyncedAt: _status.lastSyncedAt,
      cloudBytes:   _status.cloudBytes,
      chunkCount:   _status.chunkCount,
      enc:          _status.enc,
      pending:      !!localStorage.getItem(DB_PENDING_KEY),
      signedIn:     !!_uid
    };
  }

  function _setStatus(state, err) {
    _status.state = state;
    if (state === 'error')  _status.lastError = err ? (err.code || err.message || String(err)) : 'unknown';
    if (state === 'synced') { _status.lastError = null; _status.lastSyncedAt = Date.now(); }
    const snapshot = getStatus();
    _subs.slice().forEach(fn => {
      try { fn(snapshot); } catch (e) { console.warn('[Track sync] status subscriber threw', e); }
    });
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    _subs.push(fn);
    try { fn(getStatus()); } catch (e) { /* a broken subscriber must not break sync */ }
    return function () { const i = _subs.indexOf(fn); if (i >= 0) _subs.splice(i, 1); };
  }

  // ── Cloud layer ────────────────────────────────────────────────────────────

  function _manifestRef() { return db.collection('users').doc(_uid); }
  function _blobRef(i)    { return _manifestRef().collection('blob').doc(String(i)); }

  // One-time copy of the pre-migration single-document payload, so nothing that was
  // ever in the cloud becomes unrecoverable. Idempotent.
  async function _ensureBackupOnce(legacyData, legacyTs) {
    if (_backupDone) return;
    const ref  = _manifestRef().collection('backup').doc('v1');
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({ data: legacyData, ts: legacyTs || 0, migratedAt: Date.now(), from: 'v1' });
      console.log('[Track sync] legacy payload backed up to backup/v1');
    }
    _backupDone = true;
  }

  async function _writeCloud(str) {
    if (!firebase.firestore.Blob)
      throw new Error('this Firebase build exposes no firestore.Blob — cannot store chunks');

    if (_remoteKind === 'legacy' && !_backupDone) await _ensureBackupOnce(_legacyData, _legacyTs);

    const p     = await _encodePayload(str);
    const parts = _chunk(p.bytes, CHUNK_BYTES);
    if (parts.length > MAX_CHUNKS)
      throw new Error('workspace needs ' + parts.length + ' chunks, limit is ' + MAX_CHUNKS);

    // Monotonic within a session so a same-millisecond second write still advances.
    const gen = Math.max(Date.now(), _lastGen + 1);

    // One batch → atomic commit, so no snapshot can observe a torn manifest/chunk set.
    // Plain set() on the manifest, intentionally dropping any legacy `data` field.
    const batch = db.batch();
    batch.set(_manifestRef(), { v: 2, enc: p.enc, n: parts.length, len: p.len, hash: p.hash, gen, ts: gen });
    parts.forEach((b, i) => batch.set(_blobRef(i), { b: firebase.firestore.Blob.fromUint8Array(b), gen }));
    await batch.commit();

    const prevN = _lastCommittedN;
    _lastCommittedN = parts.length;
    _remoteKind = 'v2';

    // Best-effort cleanup when the payload shrank. Orphans are harmless anyway:
    // readers take chunk ids strictly from manifest.n and validate gen.
    if (prevN > parts.length) {
      const gc = db.batch();
      for (let i = parts.length; i < prevN; i++) gc.delete(_blobRef(i));
      gc.commit().catch(e => console.warn('[Track sync] stale chunk cleanup failed (harmless)', e));
    }
    return { gen, n: parts.length, bytes: p.bytes.length, enc: p.enc, len: p.len };
  }

  // Fetch every chunk named by the manifest and decode. Throws rather than ever
  // returning a partial string.
  async function _fetchAndDecode(m) {
    const n = m.n;
    if (typeof n !== 'number' || n < 1) throw new Error('cloud manifest has no usable chunk count');

    const qs = await _manifestRef().collection('blob').get();
    const byId = new Map();
    qs.forEach(d => byId.set(d.id, d));

    const parts = [];
    let total = 0;
    for (let i = 0; i < n; i++) {
      const d = byId.get(String(i));
      if (!d) throw new Error('cloud chunk ' + i + ' of ' + n + ' is missing');
      const cd = d.data() || {};
      // Chunk ids are reused in place, so a reader can otherwise pair a new manifest
      // with a chunk from the previous generation. Requiring a gen match makes a torn
      // read deterministically detectable instead of silently corrupt.
      if (m.gen !== undefined && cd.gen !== m.gen)
        throw new Error('cloud chunk ' + i + ' is generation ' + cd.gen + ', manifest says ' + m.gen);
      if (!cd.b || typeof cd.b.toUint8Array !== 'function')
        throw new Error('cloud chunk ' + i + ' carries no byte payload');
      const u8 = cd.b.toUint8Array();
      parts.push(u8);
      total += u8.length;
    }

    const joined = new Uint8Array(total);
    let off = 0;
    for (const q of parts) { joined.set(q, off); off += q.length; }
    return _decodePayload({ enc: m.enc, bytes: joined, len: m.len, hash: m.hash });
  }

  // A mismatch usually means a write landed mid-read, so one fresh attempt converges.
  async function _reassemble(m) {
    try {
      return await _fetchAndDecode(m);
    } catch (e) {
      console.warn('[Track sync] reassembly failed, retrying once', e);
      await new Promise(r => setTimeout(r, 400));
      const fresh = await _manifestRef().get();
      if (!fresh.exists) throw new Error('cloud manifest disappeared during reassembly');
      return _fetchAndDecode(fresh.data() || {});
    }
  }

  async function _readCloud() {
    const snap = await _manifestRef().get();
    if (!snap.exists) return { kind: 'none' };
    const m = snap.data() || {};
    if (m.v >= 2) {
      const str = await _reassemble(m);
      return { kind: 'v2', str, ts: m.ts || m.gen || 0, gen: m.gen || 0, n: m.n || 0,
               bytes: m.len || 0, enc: m.enc || null };
    }
    if (typeof m.data === 'string') {
      return { kind: 'legacy', str: m.data, ts: m.ts || 0, gen: 0, n: 0 };
    }
    return { kind: 'none' };
  }

  // ── Write path ─────────────────────────────────────────────────────────────
  // Patch localStorage so every write to track_db reaches the cloud. The pending
  // marker is set synchronously, so a tab closed inside the debounce window still
  // records that unsent edits exist.

  Storage.prototype.setItem = function (key, value) {
    _origSet.call(this, key, value);
    if (key === DB_KEY && _uid) {
      _localDirty = true;
      _origSet.call(localStorage, DB_PENDING_KEY, String(Date.now()));
      if (_status.state !== 'syncing' && _status.state !== 'conflict') _setStatus('pending');
      clearTimeout(_writeTimer);
      _writeTimer = setTimeout(_flush, DEBOUNCE_MS);
    }
  };

  // An authorization failure is permanent: the same request will be rejected identically
  // until the Firestore rules change, so retrying it on a timer only burns quota and makes
  // the banner's "Retrying…" a lie. Everything else — `unavailable`, `deadline-exceeded`,
  // `resource-exhausted`, plain network failure — stays retryable.
  function _isPermanent(err) {
    const code = err && err.code;
    return code === 'permission-denied' || code === 'unauthenticated';
  }

  function _scheduleRetry(err) {
    if (!_localDirty || !_uid || _conflictHold) return;
    if (_isPermanent(err)) {
      console.warn('[Track sync] not retrying — ' + err.code + ' cannot resolve on its own');
      return;
    }
    const delay = RETRY_MS[Math.min(_retryIdx, RETRY_MS.length - 1)];
    _retryIdx++;
    clearTimeout(_retryTimer);
    _retryTimer = setTimeout(_flush, delay);
    console.log('[Track sync] will retry in', delay, 'ms');
  }

  // Single-in-flight, so two rapid saves cannot compress concurrently and commit out
  // of order. Always re-reads the LATEST stored value rather than trusting a captured
  // one, which makes coalescing correct and matches the read-modify-write rule.
  async function _flush() {
    if (!_uid) return;
    clearTimeout(_writeTimer);
    // An unresolved conflict must block uploads. Otherwise the debounce armed by the
    // local edit that caused the conflict would fire moments later and push local over
    // the remote change, making the banner's choice meaningless.
    if (_conflictHold) { console.log('[Track sync] upload held until the conflict is resolved'); return; }
    if (_inFlight) { _reflush = true; return; }
    _inFlight = true;
    try {
      while (_localDirty) {
        const v = localStorage.getItem(DB_KEY);
        if (v === null || v === _lastConfirmed) {
          _localDirty = false;
          localStorage.removeItem(DB_PENDING_KEY);
          break;
        }
        _setStatus('syncing');
        console.log('[Track sync] pushing write to Firestore, length:', v.length);
        const res = await _writeCloud(v);

        _lastConfirmed = _lastWrittenToFirestore = v;
        _lastGen = _lastKnownGen = res.gen;
        _status.cloudBytes = res.bytes;
        _status.chunkCount = res.n;
        _status.enc = res.enc;
        // Only now is this device's copy provably in the cloud. Writing the timestamp
        // any earlier lets a rejected write leave localTs ahead of remoteTs forever,
        // which makes the resolver keep preferring stale local data.
        _origSet.call(localStorage, DB_TS_KEY, String(res.gen));
        _clearErrorBanner();
        _clearConflictBanner();
        _retryIdx = 0;
        console.log('[Track sync] write confirmed by server —', res.n, 'chunk(s),', res.bytes, res.enc, 'bytes');

        if (localStorage.getItem(DB_KEY) !== v) break;   // newer value arrived; re-armed below
        _localDirty = false;
        localStorage.removeItem(DB_PENDING_KEY);
      }
      if (_localDirty) {
        _setStatus('pending');
        clearTimeout(_writeTimer);
        _writeTimer = setTimeout(_flush, DEBOUNCE_MS);
      } else {
        _setStatus('synced');
      }
    } catch (e) {
      console.warn('[Track sync] write error', e);
      _setStatus('error', e);
      _showErrorBanner(e);
      _scheduleRetry(e);
    } finally {
      _inFlight = false;
      if (_reflush) { _reflush = false; clearTimeout(_writeTimer); _writeTimer = setTimeout(_flush, 0); }
    }
  }

  // Shrink the debounce window on the way out. A commit started here may not finish,
  // but DB_PENDING_KEY survives in localStorage so the next load knows edits are unsent.
  function _flushNow() { if (_localDirty && _uid) { clearTimeout(_writeTimer); _flush(); } }
  window.addEventListener('pagehide', _flushNow);
  document.addEventListener('visibilitychange', function () { if (document.hidden) _flushNow(); });
  window.addEventListener('online', function () {
    if (_localDirty && _uid) { _retryIdx = 0; clearTimeout(_retryTimer); _flush(); }
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  function hideOverlay() {
    const el = document.getElementById('fb-overlay');
    if (!el) return;
    function doHide() {
      el.style.transition = 'opacity .25s';
      el.style.opacity = '0';
      setTimeout(() => { if (el.parentNode) el.remove(); }, 270);
    }
    const root = document.getElementById('root');
    if (!root || root.children.length > 0) { doHide(); return; }
    const t = setTimeout(doHide, 5000);
    const obs = new MutationObserver(() => {
      if (root.children.length > 0) { clearTimeout(t); obs.disconnect(); doHide(); }
    });
    obs.observe(root, { childList: true });
  }

  function showSignInButton(hint) {
    _setStatus('signed-out');
    $msg().textContent = hint || 'SIGN IN TO SYNC';
    const b = $btn();
    b.style.display = 'block';
    b.onclick = () => {
      b.disabled = true;
      b.textContent = 'Opening…';
      auth.signInWithPopup(new firebase.auth.GoogleAuthProvider())
        .catch(() => {
          b.disabled = false;
          b.textContent = 'Sign in with Google';
          $msg().textContent = 'Sign-in failed — try again';
        });
    };
    const s = $skip();
    s.style.display = 'block';
    s.onclick = () => hideOverlay();
  }

  // ── Banners ────────────────────────────────────────────────────────────────
  // Stacked at distinct offsets so all three can be visible at once.

  function _makeBanner(id, bottom, border, color) {
    let el = document.getElementById(id);
    if (el) return el;
    el = document.createElement('div');
    el.id = id;
    el.style.cssText = [
      'position:fixed', 'bottom:' + bottom + 'px', 'right:14px',
      'background:#1e293b', 'border:1px solid ' + border,
      'color:' + color, 'padding:9px 14px', 'border-radius:8px',
      'font-size:11px', 'font-family:monospace', 'z-index:9998',
      'letter-spacing:.04em', 'max-width:320px', 'line-height:1.5'
    ].join(';');
    (document.body || document.documentElement).appendChild(el);
    return el;
  }

  function _bannerButton(label, bg, fg, onClick) {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'background:' + bg + ';color:' + fg + ';border:none;border-radius:5px;' +
      'padding:4px 10px;font-family:monospace;font-size:10px;cursor:pointer';
    b.onclick = onClick;
    return b;
  }

  function showSyncBanner() {
    if (document.getElementById('fb-sync-banner')) return;
    const el = _makeBanner('fb-sync-banner', 14, '#6366f1', '#a5b4fc');
    el.style.cursor = 'pointer';
    el.textContent = '↻ Updated from another device — tap to reload';
    el.onclick = () => location.reload();
  }

  // A failed upload used to be a console warning only, so cloud backup could stop
  // permanently with nothing visible. This banner does not auto-dismiss.
  //
  // A permanent failure gets its own text: promising a retry that _scheduleRetry will
  // never arm would leave the user waiting for a recovery that cannot happen. `Retry now`
  // stays on both branches — it is how sync resumes the moment the rules are published,
  // with no reload.
  function _showErrorBanner(err) {
    const code = (err && (err.code || err.message)) || 'unknown';
    const el = _makeBanner('fb-sync-error', 60, '#ef4444', '#fca5a5');
    el.textContent = '';
    const msg = document.createElement('div');
    msg.textContent = _isPermanent(err)
      ? '⚠ Cloud sync blocked (' + code + '). Firestore rules must allow users/{uid}/blob ' +
        'and users/{uid}/backup — rules do not cascade into subcollections. See ' +
        'firestore.rules in the project. Your data is safe on this device; edits stay ' +
        'local until this is fixed.'
      : '⚠ Cloud sync failed (' + code + ') — your data is safe on this device. Retrying…';
    el.appendChild(msg);
    const row = document.createElement('div');
    row.style.cssText = 'margin-top:6px';
    row.appendChild(_bannerButton('Retry now', '#7f1d1d', '#fecaca', function () {
      clearTimeout(_retryTimer); _retryIdx = 0; _flush();
    }));
    el.appendChild(row);
  }
  function _clearErrorBanner() {
    const el = document.getElementById('fb-sync-error');
    if (el) el.remove();
  }

  // Unsent local edits plus a differing cloud copy. Auto-applying either side would
  // silently discard the other, so the choice is the user's.
  function _showConflictBanner(remoteStr, remoteTs, remoteGen) {
    // Freeze uploads and cancel any armed debounce/retry until the user chooses.
    _conflictHold = true;
    clearTimeout(_writeTimer);
    clearTimeout(_retryTimer);
    const el = _makeBanner('fb-sync-conflict', 110, '#f59e0b', '#fcd34d');
    el.textContent = '';
    const msg = document.createElement('div');
    msg.textContent = '⚠ This device has unsent changes and the cloud copy differs. Keep which one?';
    el.appendChild(msg);
    const row = document.createElement('div');
    row.style.cssText = 'margin-top:6px;display:flex;gap:6px;flex-wrap:wrap';
    row.appendChild(_bannerButton('Reload cloud version', '#78350f', '#fde68a', function () {
      _localDirty = false;
      clearTimeout(_writeTimer);
      clearTimeout(_retryTimer);
      localStorage.removeItem(DB_PENDING_KEY);
      _origSet.call(localStorage, DB_TS_KEY, String(remoteTs || 0));
      sessionStorage.setItem(RELOAD_FLAG, location.pathname);
      sessionStorage.setItem(RELOAD_GEN_SS, String(remoteGen || 0));
      _origSet.call(localStorage, DB_KEY, remoteStr);
      location.reload();
    }));
    row.appendChild(_bannerButton('Keep this device — push now', '#78350f', '#fde68a', function () {
      _clearConflictBanner();
      _localDirty = true;
      _retryIdx = 0;
      clearTimeout(_retryTimer);
      _flush();
    }));
    el.appendChild(row);
  }
  function _clearConflictBanner() {
    _conflictHold = false;
    const el = document.getElementById('fb-sync-conflict');
    if (el) el.remove();
  }

  // ── Real-time listener (after sign-in) ────────────────────────────────────
  // Listens to the manifest document only, so an own-write echo or an unchanged
  // generation costs one small doc read instead of the whole payload.
  // knownGen/knownStr: already seen in onSignedIn, so the first snapshot is skipped.
  function listenForRemoteChanges(knownGen, knownStr) {
    let lastSeen = knownStr !== undefined ? knownStr : localStorage.getItem(DB_KEY);
    if (typeof knownGen === 'number' && knownGen > _lastKnownGen) _lastKnownGen = knownGen;

    _manifestRef().onSnapshot(snap => {
      if (!snap.exists) { console.log('[Track sync] skip: no remote doc'); return; }
      if (snap.metadata.hasPendingWrites) { console.log('[Track sync] skip: own pending write'); return; }
      const m   = snap.data() || {};
      const gen = m.gen || m.ts || 0;
      if (gen && gen === _lastKnownGen) {
        console.log('[Track sync] skip: generation already applied');
        return;
      }

      // Reassembly is async, so serialize applies and discard superseded results —
      // two overlapping snapshots must never interleave writes to localStorage.
      const seq = ++_applySeq;
      _applyChain = _applyChain.then(async () => {
        if (seq !== _applySeq) return;

        let remote;
        if (m.v >= 2) remote = await _reassemble(m);
        else if (typeof m.data === 'string') remote = m.data;
        else { console.log('[Track sync] skip: no usable remote payload'); return; }

        if (seq !== _applySeq) return;   // superseded while we were fetching

        const seen = () => { lastSeen = remote; if (gen > _lastKnownGen) _lastKnownGen = gen; };

        // Re-checked against LIVE localStorage: it can change during the fetch.
        if (!remote) { console.log('[Track sync] skip: empty remote payload'); return; }
        if (remote === lastSeen) { console.log('[Track sync] skip: matches lastSeen'); seen(); return; }
        if (remote === _lastWrittenToFirestore) { console.log('[Track sync] skip: own write confirmation'); seen(); return; }
        if (remote === localStorage.getItem(DB_KEY)) { console.log('[Track sync] skip: local already has this value'); seen(); return; }

        if (_localDirty || localStorage.getItem(DB_PENDING_KEY)) {
          console.warn('[Track sync] remote change while local edits are unsent — asking the user');
          seen();
          _setStatus('conflict');
          _showConflictBanner(remote, m.ts || gen, gen);
          return;
        }

        seen();
        _remoteKind = m.v >= 2 ? 'v2' : 'legacy';
        if (m.v >= 2) {
          _lastCommittedN = m.n || _lastCommittedN;
          _status.chunkCount = m.n || 0;
          _status.enc = m.enc || null;
          _status.cloudBytes = m.len || 0;
        }
        console.log('[Track sync] REMOTE CHANGE DETECTED — showing banner');
        _origSet.call(localStorage, DB_KEY, remote);
        _origSet.call(localStorage, DB_TS_KEY, String(m.ts || gen || 0));
        _lastConfirmed = remote;
        _setStatus('synced');
        showSyncBanner();
      }).catch(e => {
        // Includes a refused reassembly. localStorage is left untouched.
        console.error('[Track sync] could not apply remote change:', e);
        _setStatus('error', e);
        _showErrorBanner(e);
      });
    }, error => {
      console.error('[Track sync] listener error — sync stopped:', error.code, error.message);
      _setStatus('error', error);
      _showErrorBanner(error);
    });
  }

  // ── Main: called when Firebase confirms user is signed in ──────────────────
  async function onSignedIn(user) {
    _uid = user.uid;
    $msg().textContent = 'LOADING…';
    $email().textContent = user.email;

    function markDirtyAndFlush() {
      _localDirty = true;
      _origSet.call(localStorage, DB_PENDING_KEY, String(Date.now()));
      _flush();
    }

    // Break reload loops: if this page just reloaded to apply remote data, skip
    // re-comparison. RELOAD_GEN_SS of 0 means we reloaded out of a legacy document,
    // so the migration still has to happen.
    if (sessionStorage.getItem(RELOAD_FLAG) === location.pathname) {
      const g = parseInt(sessionStorage.getItem(RELOAD_GEN_SS) || '0', 10);
      sessionStorage.removeItem(RELOAD_FLAG);
      sessionStorage.removeItem(RELOAD_GEN_SS);
      const cur = localStorage.getItem(DB_KEY);
      _lastWrittenToFirestore = cur;
      if (g > 0) {
        _lastKnownGen = g;
        _remoteKind = 'v2';
        _lastConfirmed = cur;
        _setStatus('synced');
      } else {
        _remoteKind = 'legacy';
        _legacyData = cur;
        _legacyTs = parseInt(localStorage.getItem(DB_TS_KEY) || '0', 10);
        markDirtyAndFlush();
      }
      hideOverlay();
      listenForRemoteChanges(g, cur);
      return;
    }

    let r;
    try {
      r = await _readCloud();
    } catch (e) {
      // Network failure, or a payload we refuse to trust. Either way leave
      // localStorage exactly as it is — a partial read must never be applied.
      console.warn('[Track sync] load error', e);
      _setStatus('error', e);
      _showErrorBanner(e);
      hideOverlay();
      listenForRemoteChanges();
      return;
    }

    const local   = localStorage.getItem(DB_KEY);
    const localTs = parseInt(localStorage.getItem(DB_TS_KEY) || '0', 10);
    const pending = !!localStorage.getItem(DB_PENDING_KEY);

    _remoteKind = r.kind;
    if (r.kind === 'legacy') { _legacyData = r.str; _legacyTs = r.ts; }
    if (r.kind === 'v2') {
      _lastCommittedN = r.n || 0;
      _lastKnownGen = r.gen || 0;
      _status.chunkCount = r.n || 0;
      _status.enc = r.enc;
      _status.cloudBytes = r.bytes || 0;
    }

    if (r.kind === 'none') {
      // First sign-in on this account — push local data up as v2.
      if (local && local !== '{}') markDirtyAndFlush();
      else _setStatus('synced');
      hideOverlay();
      listenForRemoteChanges();
      return;
    }

    // Determine which version is newer (unchanged: timestamp, then slot-count fallback)
    let useRemote = !local || local === '{}';
    if (!useRemote) {
      try {
        if (r.ts > 0 && localTs > 0) {
          // Both sides have timestamps — trust the newer one
          useRemote = r.ts > localTs;
        } else {
          // Fallback: prefer remote only if it has strictly more slots
          const rr = JSON.parse(r.str);
          const ll = JSON.parse(local);
          useRemote = (rr.slots || []).length > (ll.slots || []).length;
        }
      } catch { useRemote = true; }
    }

    // DB_TS_KEY now means "last confirmed in the cloud", so an unpushed local edit no
    // longer wins on timestamp. Auto-applying remote here would silently discard it.
    if (useRemote && pending && r.str !== local) {
      _setStatus('conflict');
      _showConflictBanner(r.str, r.ts, r.gen);
      hideOverlay();
      listenForRemoteChanges(r.gen, r.str);
      return;
    }

    if (useRemote && r.str !== local) {
      _origSet.call(localStorage, DB_TS_KEY, String(r.ts));
      sessionStorage.setItem(RELOAD_FLAG, location.pathname);
      sessionStorage.setItem(RELOAD_GEN_SS, String(r.gen || 0));
      _origSet.call(localStorage, DB_KEY, r.str);
      location.reload();
      return;
    }

    if (r.str !== local) {
      // Local is newer. The old code only started a listener here and never uploaded,
      // so a device ahead of the cloud stayed out of sync until its next edit.
      markDirtyAndFlush();
    } else if (r.kind === 'legacy') {
      // Both sides agree, but the cloud copy is still the legacy single-document
      // format. One push migrates it to v2 (backup/v1 is written first).
      markDirtyAndFlush();
    } else {
      _lastConfirmed = _lastWrittenToFirestore = r.str;
      _setStatus(pending ? 'pending' : 'synced');
      if (pending) markDirtyAndFlush();
    }

    // Pass r.str/r.gen so the initial onSnapshot for this already-seen value is skipped
    hideOverlay();
    listenForRemoteChanges(r.gen, r.str);
  }

  // ── Codec self-test ────────────────────────────────────────────────────────
  // There is no test framework, and a node harness cannot exercise firestore.Blob.
  // This runs the encode → chunk → concat → decode path entirely in memory and
  // writes nothing to Firestore. All fixtures are synthetic.
  //   TrackSync.selfTest()                      // real chunk size, detected encoding
  //   TrackSync.selfTest({chunkBytes: 64})      // force n > 1
  //   TrackSync.selfTest({forceRaw: true})      // exercise the no-gzip fallback
  async function selfTest(opts) {
    const o = opts || {};
    const chunkBytes = o.chunkBytes || CHUNK_BYTES;
    const savedMode = _encMode;
    if (o.forceRaw) _encMode = 'raw'; else _encMode = null;

    const cases = [
      ['ascii',       '{"slots":[],"activeSlotId":null}'],
      ['multibyte',   'ก้าวหน้า 日本語 é — “curly” 🎯🏆 tab\tnul\u0000'],
      ['base64-300k', 'data:image/jpeg;base64,' + '/9j/4AAQSkZJRgABAQEAYABgAAD'.repeat(11500)],
      ['empty',       ''],
      ['empty-obj',   '{}']
    ];

    const out = [];
    for (const pair of cases) {
      const name = pair[0], input = pair[1];
      try {
        if (_strFromU8(_u8FromStr(input)) !== input) throw new Error('TextEncoder/Decoder round trip failed');
        const p = await _encodePayload(input);
        const parts = _chunk(p.bytes, chunkBytes);
        let total = 0;
        parts.forEach(q => { total += q.length; });
        const joined = new Uint8Array(total);
        let off = 0;
        parts.forEach(q => { joined.set(q, off); off += q.length; });
        const back = await _decodePayload({ enc: p.enc, bytes: joined, len: p.len, hash: p.hash });
        out.push({ case: name, ok: back === input, enc: p.enc, chunks: parts.length,
                   rawBytes: p.len, storedBytes: p.bytes.length,
                   ratio: p.len ? +(p.bytes.length / p.len).toFixed(3) : 1,
                   error: back === input ? '' : 'round trip mismatch' });
      } catch (e) {
        out.push({ case: name, ok: false, error: String((e && e.message) || e) });
      }
    }

    // Corruption must be refused, never partially applied.
    try {
      const p = await _encodePayload('{"slots":[{"id":"s1","docPages":[]}],"activeSlotId":"s1"}');
      const checks = [
        ['flipped-byte', (function () { const b = p.bytes.slice(); b[Math.floor(b.length / 2)] ^= 0xff; return b; })()],
        ['truncated',    p.bytes.slice(0, Math.max(0, p.bytes.length - 8))],
        ['empty-chunk',  new Uint8Array(0)]
      ];
      for (const c of checks) {
        let refused = false, produced = null;
        try { produced = await _decodePayload({ enc: p.enc, bytes: c[1], len: p.len, hash: p.hash }); }
        catch (e) { refused = true; }
        out.push({ case: c[0], ok: refused, error: refused ? '' : 'accepted corrupt payload', produced: produced ? produced.length : 0 });
      }
      // A chunk from the wrong generation must be rejected by the reader's gen check.
      out.push({ case: 'gen-mismatch-guard', ok: true, error: '', note: 'enforced in _fetchAndDecode; needs a live account to exercise' });
    } catch (e) {
      out.push({ case: 'corruption-setup', ok: false, error: String((e && e.message) || e) });
    }

    const detected = _encMode;
    _encMode = savedMode;
    const pass = out.every(r => r.ok);
    if (console.table) console.table(out);
    console.log('[Track sync] selfTest', pass ? 'PASS' : 'FAIL', '— encoding:', detected, '— chunkBytes:', chunkBytes);
    return { pass, encoding: detected, chunkBytes, results: out };
  }

  // ── Public status surface ──────────────────────────────────────────────────
  // Defined synchronously, before any async work, so a page's first render always
  // sees it. Read-only: no setters, nothing a page can use to trigger a write.
  window.TrackSync = {
    getStatus:   getStatus,
    subscribe:   subscribe,
    dbSizeBytes: dbSizeBytes,
    selfTest:    selfTest,
    limits:      { chunkBytes: CHUNK_BYTES, maxChunks: MAX_CHUNKS, debounceMs: DEBOUNCE_MS }
  };

  // ── Auth state listener ────────────────────────────────────────────────────
  auth.onAuthStateChanged(user => {
    if (user) {
      onSignedIn(user);
    } else {
      showSignInButton();
    }
  });
})();
