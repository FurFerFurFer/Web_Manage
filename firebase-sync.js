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

  const DB_KEY    = 'track_db';
  const DB_TS_KEY = 'track_db_ts';

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

  // ── Patch localStorage so every write to track_db syncs to Firestore ───────
  const _origSet = Storage.prototype.setItem;
  let _uid = null;
  let _writeTimer = null;
  let _lastWrittenToFirestore = null; // tracks last value we pushed, to skip own-write snapshots

  Storage.prototype.setItem = function (key, value) {
    _origSet.call(this, key, value);
    if (key === DB_KEY && _uid) {
      clearTimeout(_writeTimer);
      _writeTimer = setTimeout(() => {
        const ts = Date.now();
        _origSet.call(localStorage, DB_TS_KEY, String(ts));
        _lastWrittenToFirestore = value;
        db.collection('users').doc(_uid)
          .set({ data: value, ts })
          .catch(e => console.warn('[Track sync] write error', e));
      }, 700);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  function hideOverlay() {
    const el = document.getElementById('fb-overlay');
    if (!el) return;
    el.style.transition = 'opacity .25s';
    el.style.opacity = '0';
    setTimeout(() => { if (el.parentNode) el.remove(); }, 270);
  }

  function showSignInButton(hint) {
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

  function showSyncBanner() {
    if (document.getElementById('fb-sync-banner')) return;
    const el = document.createElement('div');
    el.id = 'fb-sync-banner';
    el.style.cssText = [
      'position:fixed', 'bottom:14px', 'right:14px',
      'background:#1e293b', 'border:1px solid #6366f1',
      'color:#a5b4fc', 'padding:9px 14px', 'border-radius:8px',
      'font-size:11px', 'font-family:monospace', 'z-index:9998',
      'cursor:pointer', 'letter-spacing:.04em'
    ].join(';');
    el.textContent = '↻ Updated from another device — tap to reload';
    el.onclick = () => location.reload();
    document.body.appendChild(el);
  }

  // ── Real-time listener (after sign-in) ────────────────────────────────────
  // knownRemote: value already seen in onSignedIn so the first snapshot is skipped
  function listenForRemoteChanges(knownRemote) {
    let lastSeen = knownRemote !== undefined ? knownRemote : localStorage.getItem(DB_KEY);
    db.collection('users').doc(_uid).onSnapshot(snap => {
      if (!snap.exists || snap.metadata.hasPendingWrites) return;
      const remote = snap.data()?.data;
      if (!remote || remote === lastSeen) return;
      lastSeen = remote;
      if (remote === _lastWrittenToFirestore) return; // confirmation of our own write — skip
      if (remote === localStorage.getItem(DB_KEY)) return;
      _origSet.call(localStorage, DB_KEY, remote);
      showSyncBanner();
    });
  }

  // ── Main: called when Firebase confirms user is signed in ──────────────────
  async function onSignedIn(user) {
    _uid = user.uid;
    $msg().textContent = 'LOADING…';
    $email().textContent = user.email;

    // Break reload loops: if this page just reloaded to apply remote data, skip re-comparison
    const RELOAD_FLAG = 'fb_reloaded';
    if (sessionStorage.getItem(RELOAD_FLAG) === location.pathname) {
      sessionStorage.removeItem(RELOAD_FLAG);
      hideOverlay();
      listenForRemoteChanges();
      return;
    }

    try {
      const snap      = await db.collection('users').doc(_uid).get();
      const remoteData = snap.exists ? snap.data()?.data : null;
      const remoteTs   = snap.exists ? (snap.data()?.ts || 0) : 0;
      const local      = localStorage.getItem(DB_KEY);
      const localTs    = parseInt(localStorage.getItem(DB_TS_KEY) || '0', 10);

      if (remoteData) {
        // Determine which version is newer
        let useRemote = !local || local === '{}';
        if (!useRemote) {
          try {
            if (remoteTs > 0 && localTs > 0) {
              // Both sides have timestamps — trust the newer one
              useRemote = remoteTs > localTs;
            } else {
              // Fallback: prefer remote only if it has strictly more slots
              const r = JSON.parse(remoteData);
              const l = JSON.parse(local);
              useRemote = (r.slots || []).length > (l.slots || []).length;
            }
          } catch { useRemote = true; }
        }

        if (useRemote && remoteData !== local) {
          _origSet.call(localStorage, DB_TS_KEY, String(remoteTs));
          sessionStorage.setItem(RELOAD_FLAG, location.pathname);
          _origSet.call(localStorage, DB_KEY, remoteData);
          location.reload();
          return;
        }

        // Pass remoteData so the initial onSnapshot for this already-seen value is skipped
        hideOverlay();
        listenForRemoteChanges(remoteData);
        return;
      } else if (local && local !== '{}') {
        // First sign-in on this device — push local data up
        const ts = localTs || Date.now();
        _origSet.call(localStorage, DB_TS_KEY, String(ts));
        db.collection('users').doc(_uid).set({ data: local, ts })
          .catch(e => console.warn('[Track sync] initial push error', e));
      }
    } catch (e) {
      console.warn('[Track sync] load error', e);
    }

    hideOverlay();
    listenForRemoteChanges();
  }

  // ── Auth state listener ────────────────────────────────────────────────────
  auth.onAuthStateChanged(user => {
    if (user) {
      onSignedIn(user);
    } else {
      showSignInButton();
    }
  });
})();
