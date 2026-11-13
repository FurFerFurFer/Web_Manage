/* ── file-store.js ──────────────────────────────────────────────────────────
   Where a FILES record's BYTES live (`window.TrackFileStore`). Never in
   track_db: a PNG, JPEG, PDF or any other upload is kept

   1. on THIS device, in IndexedDB `track_files_v1` — device-local, never
      synced, never exported. It is what makes a file open instantly and
      offline, and what keeps an upload alive across a reload; and
   2. in the user's own Google Drive, in a folder "Track Files", once
      uploaded. That is what links the iPad and the laptop: the record in
      track_db (which already syncs) carries the Drive id, and the other
      device downloads the bytes on first open. The user chose Drive over
      Firebase Storage on 2026-11-13 because they already pay for it.

   Drive is reached with the `drive.file` permission only: Track sees the
   files it created and nothing else in the user's Drive. The access token
   comes from Google Identity Services, lasts about an hour, and is held in
   MEMORY ONLY — never written anywhere. Asking for it opens Google's popup,
   which a browser allows only inside a tap, so `connect()` must be called
   from a click handler; everything else waits for it.

   An upload is RESUMABLE, in CHUNK-sized pieces (a multiple of 256 KiB, as
   Drive requires): the session URL and the offset reached are kept in the
   queue, so a dropped connection, an expired token or a closed tab resumes
   from the last chunk that landed. Rename and delete follow the record to
   Drive the same way, queued until Drive is reachable; a delete moves the
   Drive copy to Drive's TRASH, where it can be restored for 30 days.

   The track_db side is the page's: when an upload lands, `onUploaded` is
   called with (slotId, recordId, driveId) and the page writes `driveId`
   through its own fresh read-modify-write. A record deleted meanwhile is
   answered with `false`, and the new Drive copy is trashed.

   The Drive client (`_drive`) takes its `fetch` and `sleep` as parameters so
   tests/file-store.test.js drives it against a fake Drive, offline.

   Loaded lazily by true-storage.html (the FILES tab). Nothing here runs until
   it is called: loading the file opens no database and loads no script.
*/
(function (global) {
  'use strict';

  var CONFIG = {
    // The OAuth "Web client" id of the Firebase project track-sync-2ee32.
    // Public by design (it is in every page that signs in with it); empty
    // means Drive is not set up yet, and files stay on the device they were
    // added on.
    clientId: '',
    scope: 'https://www.googleapis.com/auth/drive.file',
    folderName: 'Track Files',
    chunkSize: 8 * 1024 * 1024,
    gisSrc: 'https://accounts.google.com/gsi/client',
    api: 'https://www.googleapis.com/drive/v3',
    upload: 'https://www.googleapis.com/upload/drive/v3/files',
    onUploaded: null
  };
  var DB_NAME = 'track_files_v1';
  var FOLDER_MIME = 'application/vnd.google-apps.folder';
  var RETRIES = 3;

  // ── the Drive client ─────────────────────────────────────────────────────

  function DriveError(code, status, message) {
    this.name = 'DriveError';
    this.code = code;          // 'auth' | 'gone' | 'net' | 'http' | 'cancelled' | 'setup'
    this.status = status || 0;
    this.message = message || code;
  }
  DriveError.prototype = Object.create(Error.prototype);
  DriveError.prototype.constructor = DriveError;

  function quoteQ(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

  // Range: bytes=0-8388607  →  8388608. No header: nothing stored yet.
  function offsetFromRange(res, fallback) {
    var r = res.headers && res.headers.get ? res.headers.get('Range') : null;
    if (!r) return fallback;
    var m = /bytes=\d+-(\d+)/.exec(r);
    return m ? Number(m[1]) + 1 : fallback;
  }

  function makeDrive(fetchFn, getToken) {
    function call(url, init, noAuth) {
      var token = getToken();
      if (!token && !noAuth) return Promise.reject(new DriveError('auth', 0, 'Not connected to Google Drive'));
      var o = init || {};
      var headers = Object.assign({}, o.headers || {});
      if (token) headers.Authorization = 'Bearer ' + token;
      return Promise.resolve().then(function () {
        return fetchFn(url, Object.assign({}, o, { headers: headers }));
      }).then(null, function (e) {
        throw new DriveError('net', 0, (e && e.message) || 'The network request failed');
      });
    }
    function fail(res, what) {
      var s = res.status;
      if (s === 401) return new DriveError('auth', s, 'Google Drive asked to connect again');
      if (s === 404 || s === 410) return new DriveError('gone', s, what + ': not found');
      return new DriveError('http', s, what + ' failed (' + s + ')');
    }
    function json(res, what) {
      if (!res.ok) throw fail(res, what);
      return res.json();
    }

    return {
      findFolder: function (name) {
        var q = "name='" + quoteQ(name) + "' and mimeType='" + FOLDER_MIME + "' and trashed=false";
        return call(CONFIG.api + '/files?spaces=drive&pageSize=1&fields=files(id)&q=' + encodeURIComponent(q))
          .then(function (res) { return json(res, 'Finding the Track Files folder'); })
          .then(function (body) { return body && body.files && body.files[0] ? body.files[0].id : null; });
      },
      createFolder: function (name) {
        return call(CONFIG.api + '/files?fields=id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=UTF-8' },
          body: JSON.stringify({ name: name, mimeType: FOLDER_MIME })
        }).then(function (res) { return json(res, 'Creating the Track Files folder'); })
          .then(function (body) { return body.id; });
      },
      // Opens a resumable session; resolves to its URL.
      startSession: function (meta) {
        var headers = { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(meta.size) };
        if (meta.mime) headers['X-Upload-Content-Type'] = meta.mime;
        var body = { name: meta.name, appProperties: { trackId: String(meta.id) } };
        if (meta.folderId) body.parents = [meta.folderId];
        return call(CONFIG.upload + '?uploadType=resumable&fields=id', {
          method: 'POST', headers: headers, body: JSON.stringify(body)
        }).then(function (res) {
          if (!res.ok) throw fail(res, 'Starting the upload');
          var url = res.headers.get('Location');
          if (!url) throw new DriveError('http', res.status, 'Drive gave no upload address');
          return url;
        });
      },
      // One chunk, [start, end) of `total`. Resolves {done, id} or {offset}.
      putChunk: function (url, blob, start, end, total) {
        var range = total === 0 ? 'bytes */0' : 'bytes ' + start + '-' + (end - 1) + '/' + total;
        return call(url, {
          method: 'PUT',
          headers: { 'Content-Range': range },
          body: total === 0 ? '' : blob.slice(start, end)
        }, true).then(function (res) {
          if (res.status === 200 || res.status === 201) return res.json().then(function (b) { return { done: true, id: b.id }; });
          if (res.status === 308) return { offset: offsetFromRange(res, end) };
          throw fail(res, 'Uploading');
        });
      },
      // Where an interrupted session stands. Resolves {done, id} or {offset}.
      status: function (url, total) {
        return call(url, { method: 'PUT', headers: { 'Content-Range': 'bytes */' + total }, body: '' }, true)
          .then(function (res) {
            if (res.status === 200 || res.status === 201) return res.json().then(function (b) { return { done: true, id: b.id }; });
            if (res.status === 308) return { offset: offsetFromRange(res, 0) };
            throw fail(res, 'Resuming the upload');
          });
      },
      download: function (driveId, onProgress) {
        return call(CONFIG.api + '/files/' + encodeURIComponent(driveId) + '?alt=media').then(function (res) {
          if (!res.ok) throw fail(res, 'Downloading');
          var total = Number(res.headers.get('Content-Length')) || 0;
          if (!res.body || !res.body.getReader) return res.blob();
          var reader = res.body.getReader(), parts = [], got = 0;
          function pumpRead() {
            return reader.read().then(function (r) {
              if (r.done) return new Blob(parts);
              parts.push(r.value); got += r.value.byteLength;
              if (onProgress && total) onProgress(Math.min(1, got / total));
              return pumpRead();
            });
          }
          return pumpRead();
        });
      },
      rename: function (driveId, name) {
        return call(CONFIG.api + '/files/' + encodeURIComponent(driveId) + '?fields=id', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json; charset=UTF-8' },
          body: JSON.stringify({ name: name })
        }).then(function (res) { if (!res.ok) throw fail(res, 'Renaming in Drive'); return true; });
      },
      // To Drive's trash, restorable for 30 days. Already gone counts as done.
      trash: function (driveId) {
        return call(CONFIG.api + '/files/' + encodeURIComponent(driveId) + '?fields=id', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json; charset=UTF-8' },
          body: JSON.stringify({ trashed: true })
        }).then(function (res) {
          if (res.ok || res.status === 404) return true;
          throw fail(res, 'Moving to Drive\'s trash');
        });
      }
    };
  }

  // Upload `blob` through `drive`, resuming `state` ({sessionUrl, offset})
  // when it holds a session. hooks: onSession(url), onProgress(offset),
  // cancelled() → bool, sleep(ms) → Promise. Resolves the Drive id.
  // A network or server failure is retried RETRIES times with backoff; an
  // expired session (404/410) starts over from byte 0, once.
  function uploadBlob(drive, blob, meta, state, hooks) {
    var size = meta.size, chunk = CONFIG.chunkSize, restarted = false;
    var sleep = hooks.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    function retrying(fn) {
      var tries = 0;
      function go() {
        return fn().then(null, function (e) {
          if (e && (e.code === 'net' || (e.code === 'http' && (e.status === 0 || e.status >= 500 || e.status === 429 || e.status === 403)))
            && tries < RETRIES) {
            tries++;
            return sleep(1000 * Math.pow(2, tries - 1)).then(go);
          }
          throw e;
        });
      }
      return go();
    }
    function begin() {
      return retrying(function () { return drive.startSession(meta); }).then(function (url) {
        state.sessionUrl = url; state.offset = 0;
        return Promise.resolve(hooks.onSession && hooks.onSession(url, 0)).then(function () { return loop(); });
      });
    }
    function loop() {
      if (hooks.cancelled && hooks.cancelled()) return Promise.reject(new DriveError('cancelled', 0, 'Upload cancelled'));
      if (state.offset >= size && size > 0) {
        return retrying(function () { return drive.status(state.sessionUrl, size); }).then(function (r) {
          if (r.done) return r.id;
          throw new DriveError('http', 0, 'Drive did not finish the upload');
        });
      }
      var end = Math.min(state.offset + chunk, size);
      return retrying(function () { return drive.putChunk(state.sessionUrl, blob, state.offset, end, size); })
        .then(function (r) {
          if (r.done) return r.id;
          state.offset = r.offset;
          return Promise.resolve(hooks.onProgress && hooks.onProgress(state.offset)).then(loop);
        });
    }
    function resume() {
      return retrying(function () { return drive.status(state.sessionUrl, size); }).then(function (r) {
        if (r.done) return r.id;
        state.offset = r.offset;
        return loop();
      });
    }
    function attempt() {
      return (state.sessionUrl ? resume() : begin()).then(null, function (e) {
        if (e && e.code === 'gone' && !restarted) {
          restarted = true; state.sessionUrl = null; state.offset = 0;
          return attempt();
        }
        throw e;
      });
    }
    return attempt();
  }

  // ── the token (Google Identity Services, memory only) ────────────────────

  var token = null, tokenExp = 0, gisLoad = null, tokenClient = null, waiting = null, lastError = null;

  function getToken() { return token && Date.now() < tokenExp - 60000 ? token : null; }

  function gisReady() { return !!(global.google && global.google.accounts && global.google.accounts.oauth2); }

  // Fetched ahead of the tap, so the popup can open INSIDE it.
  function preloadGis() {
    if (!CONFIG.clientId || gisReady()) return Promise.resolve();
    if (!gisLoad) {
      gisLoad = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = CONFIG.gisSrc; s.async = true;
        s.onload = function () { resolve(); emit(); };
        s.onerror = function () { gisLoad = null; reject(new DriveError('net', 0, 'Could not load Google sign-in')); emit(); };
        document.head.appendChild(s);
      });
    }
    return gisLoad;
  }

  // Call from a click. Resolves when Drive is reachable.
  function connect() {
    if (!CONFIG.clientId) return Promise.reject(new DriveError('setup', 0, 'Google Drive is not set up yet'));
    if (getToken()) return Promise.resolve();
    if (!gisReady()) {
      preloadGis();
      return Promise.reject(new DriveError('net', 0, 'Google sign-in is still loading — tap again in a moment'));
    }
    if (!tokenClient) {
      tokenClient = global.google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.clientId,
        scope: CONFIG.scope,
        callback: function (r) {
          var w = waiting; waiting = null;
          if (r && r.access_token) {
            token = r.access_token;
            tokenExp = Date.now() + (Number(r.expires_in) || 3600) * 1000;
            lastError = null;
            if (w) w.resolve();
            emit(); pump();
          } else {
            lastError = (r && (r.error_description || r.error)) || 'Google did not connect';
            if (w) w.reject(new DriveError('auth', 0, lastError));
            emit();
          }
        },
        error_callback: function (e) {
          var w = waiting; waiting = null;
          lastError = (e && e.type === 'popup_closed') ? 'The Google window was closed' : 'Google did not connect';
          if (w) w.reject(new DriveError('auth', 0, lastError));
          emit();
        }
      });
    }
    return new Promise(function (resolve, reject) {
      waiting = { resolve: resolve, reject: reject };
      tokenClient.requestAccessToken({ prompt: '' });
    });
  }

  function forgetToken() { token = null; tokenExp = 0; }

  // ── IndexedDB: this device's copies, the queue, a little metadata ────────

  var dbOpen = null, idbBroken = null;

  function openDb() {
    if (!dbOpen) {
      dbOpen = new Promise(function (resolve, reject) {
        var req;
        try { req = global.indexedDB.open(DB_NAME, 1); } catch (e) { reject(e); return; }
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
          if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'key' });
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        };
        req.onsuccess = function () {
          var db = req.result;
          // another tab upgrading, or the database deleted under us
          db.onversionchange = function () { db.close(); dbOpen = null; };
          resolve(db);
        };
        req.onerror = function () { reject(req.error || new Error('IndexedDB would not open')); };
        req.onblocked = function () { reject(new Error('IndexedDB is busy in another tab')); };
      }).then(null, function (e) { dbOpen = null; idbBroken = (e && e.message) || 'IndexedDB is unavailable'; emit(); throw e; });
    }
    return dbOpen;
  }

  function tx(store, mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(store, mode), out;
        var r = fn(t.objectStore(store));
        if (r && 'onsuccess' in r) r.onsuccess = function () { out = r.result; };
        t.oncomplete = function () { resolve(out); };
        t.onerror = function () { reject(t.error || new Error('IndexedDB write failed')); };
        t.onabort = function () { reject(t.error || new Error('IndexedDB write was aborted')); };
      });
    });
  }

  var local = new Set(), localKnown = false, persisted = false;

  function putLocal(id, blob) {
    return tx('blobs', 'readwrite', function (s) { return s.put({ blob: blob, size: blob.size }, id); })
      .then(function () {
        local.add(id); emit();
        if (!persisted && global.navigator && navigator.storage && navigator.storage.persist) {
          persisted = true;
          navigator.storage.persist().then(null, function () {});
        }
        return true;
      });
  }
  function getLocal(id) {
    return tx('blobs', 'readonly', function (s) { return s.get(id); })
      .then(function (v) { return v && v.blob ? v.blob : null; });
  }
  function removeLocal(id) {
    return tx('blobs', 'readwrite', function (s) { return s.delete(id); })
      .then(function () { local.delete(id); emit(); });
  }
  function refreshLocal() {
    return tx('blobs', 'readonly', function (s) { return s.getAllKeys(); }).then(function (keys) {
      local = new Set(keys || []); localKnown = true; emit(); return local;
    }, function () { localKnown = true; emit(); return local; });
  }
  function localUsage() {
    return openDb().then(function (db) {
      return new Promise(function (resolve) {
        var total = 0, t = db.transaction('blobs', 'readonly');
        var c = t.objectStore('blobs').openCursor();
        c.onsuccess = function () {
          var cur = c.result;
          if (!cur) return;
          total += (cur.value && cur.value.size) || 0;
          cur.continue();
        };
        t.oncomplete = function () { resolve(total); };
        t.onerror = function () { resolve(total); };
      });
    }, function () { return 0; });
  }

  function queueAll() { return tx('queue', 'readonly', function (s) { return s.getAll(); }).then(function (v) { return v || []; }); }
  function queuePut(item) { return tx('queue', 'readwrite', function (s) { return s.put(item); }); }
  function queueDel(key) { return tx('queue', 'readwrite', function (s) { return s.delete(key); }); }
  function metaGet(k) { return tx('meta', 'readonly', function (s) { return s.get(k); }); }
  function metaPut(k, v) { return tx('meta', 'readwrite', function (s) { return s.put(v, k); }); }

  // ── status the page draws ────────────────────────────────────────────────

  var status = new Map(), listeners = new Set(), emitArmed = false, pendingUploads = new Set();

  function emit() {
    if (emitArmed) return;
    emitArmed = true;
    Promise.resolve().then(function () {
      emitArmed = false;
      listeners.forEach(function (fn) { try { fn(); } catch (e) { /* a listener's own bug */ } });
    });
  }
  function setStatus(id, state, progress, message) {
    status.set(id, { state: state, progress: progress || 0, message: message || '' });
    emit();
  }

  // ── the queue ────────────────────────────────────────────────────────────

  var drive = null, cancelled = new Set(), pumping = false, folderId = null;

  function client() {
    if (!drive) drive = makeDrive(function (u, i) { return global.fetch(u, i); }, getToken);
    return drive;
  }

  function ensureFolder() {
    if (folderId) return Promise.resolve(folderId);
    return metaGet('folderId').then(function (id) {
      if (id) { folderId = id; return id; }
      return client().findFolder(CONFIG.folderName).then(function (found) {
        return found || client().createFolder(CONFIG.folderName);
      }).then(function (made) { folderId = made; return metaPut('folderId', made).then(function () { return made; }); });
    });
  }

  function markWaiting(items) {
    items.forEach(function (it) {
      if (it.op === 'upload') {
        var cur = status.get(it.id);
        if (!cur || cur.state !== 'uploading') setStatus(it.id, 'needs-drive', it.size ? (it.offset || 0) / it.size : 0);
      }
    });
  }

  function runOne(item) {
    if (item.op === 'trash') return client().trash(item.driveId).then(function () { return queueDel(item.key); });
    if (item.op === 'rename') return client().rename(item.driveId, item.name).then(function () { return queueDel(item.key); },
      function (e) { if (e && e.code === 'gone') return queueDel(item.key); throw e; });
    // upload
    return getLocal(item.id).then(function (blob) {
      if (!blob || cancelled.has(item.id)) { status.delete(item.id); pendingUploads.delete(item.id); emit(); return queueDel(item.key); }
      return ensureFolder().then(function (fid) {
        var meta = { id: item.id, name: item.name, mime: item.mime, size: blob.size, folderId: fid };
        var state = { sessionUrl: item.sessionUrl || null, offset: item.offset || 0 };
        var nameUsed = item.name;
        setStatus(item.id, 'uploading', blob.size ? state.offset / blob.size : 0);
        return uploadBlob(client(), blob, meta, state, {
          onSession: function (url) { item.sessionUrl = url; item.offset = 0; return queuePut(item); },
          onProgress: function (off) {
            item.offset = off; setStatus(item.id, 'uploading', blob.size ? off / blob.size : 1);
            return queuePut(item);
          },
          cancelled: function () { return cancelled.has(item.id); }
        }).then(function (driveId) {
          return tx('queue', 'readonly', function (s) { return s.get(item.key); }).then(function (latest) {
            return queueDel(item.key).then(function () {
              pendingUploads.delete(item.id);
              setStatus(item.id, 'done', 1);
              var kept = typeof CONFIG.onUploaded === 'function' ? CONFIG.onUploaded(item.slotId, item.id, driveId) : true;
              if (kept === false || cancelled.has(item.id)) return enqueue({ key: 'rm:' + driveId, op: 'trash', driveId: driveId });
              // renamed while the upload was in flight: Drive gets the new name too
              if (latest && latest.name && latest.name !== nameUsed) return enqueue({ key: 'mv:' + driveId, op: 'rename', driveId: driveId, name: latest.name });
            });
          });
        }, function (e) {
          if (e && e.code === 'cancelled') { status.delete(item.id); pendingUploads.delete(item.id); emit(); return queueDel(item.key); }
          throw e;
        });
      });
    });
  }

  function enqueue(item) { return queuePut(item); }

  // Work through the queue while Drive is reachable: renames and trashing
  // first, then uploads one at a time. Stops (and says why) on the first
  // failure it cannot retry; `pump()` again resumes.
  function pump() {
    if (pumping) return Promise.resolve();
    pumping = true;
    function next() {
      return queueAll().then(function (items) {
        items.forEach(function (it) { if (it.op === 'upload') pendingUploads.add(it.id); });
        if (!items.length) return null;
        if (!CONFIG.clientId || !getToken()) { markWaiting(items); return null; }
        var order = items.filter(function (i) { return i.op !== 'upload'; }).concat(items.filter(function (i) { return i.op === 'upload'; }));
        return runOne(order[0]).then(next);
      });
    }
    return next().then(function () { pumping = false; emit(); }, function (e) {
      pumping = false;
      if (e && e.code === 'auth') forgetToken();
      lastError = (e && e.message) || 'Drive stopped';
      queueAll().then(function (items) {
        items.forEach(function (it) {
          if (it.op !== 'upload') return;
          var cur = status.get(it.id);
          if (cur && cur.state === 'uploading') setStatus(it.id, e && e.code === 'auth' ? 'needs-drive' : 'paused', cur.progress, lastError);
          else if (!cur || cur.state !== 'paused') markWaiting([it]);
        });
      }, function () {});
      emit();
    });
  }

  // ── what the page calls ──────────────────────────────────────────────────

  // An upload in two halves, so the page records the file BETWEEN them: the
  // bytes kept on this device (keepLocal), then the record written to the
  // slot, then the Drive upload queued (queueUpload). A refused save drops
  // the bytes again (dropLocal); a tab closed after the record but before
  // the queue is caught by ensureQueued the next time FILES opens.
  function keepLocal(id, blob) { return putLocal(id, blob); }
  function dropLocal(id) { return removeLocal(id).then(null, function () {}); }
  function queueUpload(slotId, id, name, mime, size) {
    pendingUploads.add(id);
    setStatus(id, CONFIG.clientId && getToken() ? 'queued' : 'needs-drive', 0);
    return enqueue({ key: 'up:' + id, op: 'upload', slotId: slotId, id: id, name: name, mime: mime || '', size: size || 0 });
  }
  function addUpload(slotId, id, fileOrBlob, name, mime) {
    return keepLocal(id, fileOrBlob).then(function () { return queueUpload(slotId, id, name, mime, fileOrBlob.size); });
  }
  // Every file record of this slot that has bytes here, no Drive id and no
  // queue entry gets one. Never touches a record or an existing entry.
  function ensureQueued(slotId, recs) {
    return queueAll().then(function (items) {
      var queued = new Set(items.filter(function (i) { return i.op === 'upload'; }).map(function (i) { return i.id; }));
      return Promise.all((recs || []).filter(function (r) {
        return r && r.kind === 'file' && !r.driveId && local.has(r.id) && !queued.has(r.id);
      }).map(function (r) { return queueUpload(slotId, r.id, r.name, r.mime, r.size); }));
    });
  }
  function startQueue() { return pump(); }

  // The bytes for a record: this device's copy, else Drive's (kept here
  // afterwards). Rejects with code 'not-uploaded' when no device has sent
  // it yet, 'needs-drive' when Drive must be connected first.
  var downloads = new Map();
  function fetchBlob(rec) {
    var id = rec && rec.id;
    return getLocal(id).then(function (blob) {
      if (blob) return blob;
      if (!rec.driveId) throw new DriveError('not-uploaded', 0, 'Not uploaded from the other device yet');
      if (!CONFIG.clientId) throw new DriveError('setup', 0, 'Google Drive is not set up yet');
      if (!getToken()) throw new DriveError('needs-drive', 0, 'Connect Google Drive to download it');
      if (downloads.has(id)) return downloads.get(id);
      setStatus(id, 'downloading', 0);
      var p = client().download(rec.driveId, function (f) { setStatus(id, 'downloading', f); }).then(function (raw) {
        var typed = rec.mime ? new Blob([raw], { type: rec.mime }) : raw;
        downloads.delete(id);
        status.delete(id);
        return putLocal(id, typed).then(function () { return typed; }, function () {
          setStatus(id, 'idle', 0, 'Not kept on this device: its storage is full');
          return typed;
        });
      }, function (e) {
        downloads.delete(id);
        if (e && e.code === 'auth') forgetToken();
        setStatus(id, 'error', 0, (e && e.message) || 'Download failed');
        throw e;
      });
      downloads.set(id, p);
      return p;
    });
  }

  // A record deleted: its copy here goes, its upload stops, and its Drive
  // copy goes to Drive's trash (now, or once Drive is reachable).
  function forget(rec) {
    var id = rec && rec.id;
    cancelled.add(id);
    pendingUploads.delete(id);
    status.delete(id);
    var jobs = [removeLocal(id).then(null, function () {}), queueDel('up:' + id).then(null, function () {})];
    if (rec && rec.driveId) jobs.push(enqueue({ key: 'rm:' + rec.driveId, op: 'trash', driveId: rec.driveId }));
    return Promise.all(jobs).then(function () { emit(); pump(); });
  }

  // A record renamed: Drive follows. A pending upload just takes the name.
  function renamed(rec, name) {
    if (rec && rec.driveId) return enqueue({ key: 'mv:' + rec.driveId, op: 'rename', driveId: rec.driveId, name: name }).then(pump);
    return tx('queue', 'readonly', function (s) { return s.get('up:' + rec.id); }).then(function (item) {
      if (!item) return null;
      item.name = name;
      return queuePut(item);
    }, function () {});
  }

  // Free this device's space: every copy that is safely in Drive goes. A
  // copy still waiting to upload is the only copy there is, and stays.
  function clearDownloaded(recs) {
    var inDrive = new Set((recs || []).filter(function (r) { return r && r.driveId; }).map(function (r) { return r.id; }));
    return queueAll().then(function (items) {
      var waiting = new Set(items.filter(function (i) { return i.op === 'upload'; }).map(function (i) { return i.id; }));
      var drop = Array.from(local).filter(function (id) { return inDrive.has(id) && !waiting.has(id); });
      return Promise.all(drop.map(function (id) { return removeLocal(id); })).then(function () { return drop.length; });
    });
  }

  function statusOf(id) {
    var s = status.get(id);
    return {
      local: local.has(id),
      localKnown: localKnown,
      pending: pendingUploads.has(id),
      state: s ? s.state : 'idle',
      progress: s ? s.progress : 0,
      message: s ? s.message : ''
    };
  }

  function overview() {
    return {
      setUp: !!CONFIG.clientId,
      connected: !!getToken(),
      gisReady: gisReady(),
      pending: pendingUploads.size,
      error: lastError,
      deviceStorage: idbBroken
    };
  }

  function configure(o) {
    Object.keys(o || {}).forEach(function (k) { if (k in CONFIG) CONFIG[k] = o[k]; });
    if ('clientId' in (o || {})) { tokenClient = null; }
    emit();
  }

  function on(fn) { listeners.add(fn); return function () { listeners.delete(fn); }; }

  global.TrackFileStore = {
    DB_NAME: DB_NAME,
    configure: configure,
    on: on,
    overview: overview,
    statusOf: statusOf,
    preloadGis: preloadGis,
    connect: connect,
    refreshLocal: refreshLocal,
    localUsage: localUsage,
    addUpload: addUpload,
    keepLocal: keepLocal,
    dropLocal: dropLocal,
    queueUpload: queueUpload,
    ensureQueued: ensureQueued,
    startQueue: startQueue,
    fetchBlob: fetchBlob,
    forget: forget,
    renamed: renamed,
    clearDownloaded: clearDownloaded,
    _drive: { makeDrive: makeDrive, uploadBlob: uploadBlob, DriveError: DriveError, CONFIG: CONFIG }
  };
})(window);
