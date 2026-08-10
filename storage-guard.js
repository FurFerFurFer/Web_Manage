// Track — localStorage load/save guard for the whole workspace database.
//
// Two failures, one boundary.
//
// WRITE. Every page saves the whole workspace as one `track_db` string. A full quota used
// to throw QuotaExceededError straight out of a React effect or event handler, and no page
// has an error boundary, so the tab white-screened mid-edit with no message and no sign
// that the change had not been saved.
//
// READ. Every page also parsed that string itself, with the same unchecked line:
// `JSON.parse(localStorage.getItem('track_db') || '{}')`. JSON.parse does not throw on
// 'null', '42' or '[…]', so the catch never fired and the caller got a non-object. A stored
// 'null' white-screened every React page on `db.slots`; a stored '42' or '[…]' had `.slots`
// merely undefined, so the bootstrap IIFEs fell through and REPLACED the unreadable bytes
// with a fresh empty workspace. The second one is silent and unrecoverable, which makes it
// the worse of the two. See NOTES Proposal 2.
//
// So: TrackStorage.loadDB() is the one place a stored database is parsed and judged, and
// TrackStorage.saveDB() refuses to write while that judgement is `blocked`. The original
// bytes are never normalized, bootstrapped over, or written back — recovery is the user's
// call, and the banner hands them a copy.
//
// It deliberately does NOT patch Storage.prototype.setItem. firebase-sync.js captures the
// native method as `_origSet` and installs its own patch, which calls `_origSet` FIRST and
// only then marks `track_db_pending` and arms the upload debounce. Keeping this a plain
// function preserves that order: a quota throw happens inside `_origSet`, the patch's
// dirty-tracking lines never run, and no upload is armed for a write that did not land.
// Patching the prototype ahead of firebase-sync would make `_origSet` resolve to this
// guard, so a swallowed quota error would leave the sync layer believing a write happened.
//
// firebase-sync.js's own `_origSet` calls bypass this file entirely, and that is deliberate
// on the read side too: a genuine remote-newer payload can still HEAL a corrupt local
// database, which is the one recovery route that needs no user action.
//
// window.TrackSchema is read at CALL time, never at load time, so the existing
// storage-guard.js → schema.js script order is unaffected. This is the same late-binding
// schema.js already uses in the other direction for newSlotId.

(function () {
  'use strict';

  var DB_KEY = 'track_db';
  var BANNER_ID = 'track-quota-banner';
  var DATA_BANNER_ID = 'track-data-banner';

  // Firefox and Safari report the same condition under different names and codes, and
  // Safari's private mode throws it for any write at all.
  function isQuotaError(error) {
    if (!error) return false;
    return error.name === 'QuotaExceededError'
        || error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
        || error.code === 22
        || error.code === 1014;
  }

  function bannerButton(label, onClick) {
    var b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'background:#7f1d1d;color:#fecaca;border:none;border-radius:5px;' +
      'padding:4px 10px;font-family:monospace;font-size:10px;cursor:pointer';
    b.onclick = onClick;
    return b;
  }

  // Sits above the three stacked firebase-sync banners (14 / 60 / 110), so a quota failure
  // during a sync failure or conflict stays readable. Themed in styles.css; the inline
  // styles are the dark-default fallback, matching _makeBanner in firebase-sync.js.
  function showQuotaBanner() {
    var el = document.getElementById(BANNER_ID);
    if (el) return el;

    el = document.createElement('div');
    el.id = BANNER_ID;
    el.style.cssText = [
      'position:fixed', 'bottom:160px', 'right:14px',
      'background:#1e293b', 'border:1px solid #ef4444',
      'color:#fca5a5', 'padding:9px 14px', 'border-radius:8px',
      'font-size:11px', 'font-family:monospace', 'z-index:9998',
      'letter-spacing:.04em', 'max-width:320px', 'line-height:1.5'
    ].join(';');

    var msg = document.createElement('div');
    msg.textContent = '⚠ Storage full — this change was not saved.';
    el.appendChild(msg);

    var detail = document.createElement('div');
    detail.style.cssText = 'margin-top:5px;opacity:.85';
    detail.textContent = 'Everything saved before now is intact on this device. '
      + 'Reloading will discard the unsaved change. To free space, remove large images '
      + 'in Documentations, or export a slot from Home and delete it.';
    el.appendChild(detail);

    var row = document.createElement('div');
    row.style.cssText = 'margin-top:6px';
    row.appendChild(bannerButton('Dismiss', clearQuotaBanner));
    el.appendChild(row);

    (document.body || document.documentElement).appendChild(el);
    return el;
  }

  function clearQuotaBanner() {
    var el = document.getElementById(BANNER_ID);
    if (el) el.remove();
  }

  // Returns true when the value is stored, false when the quota rejected it. Anything
  // other than a quota error is rethrown — swallowing those would hide real bugs.
  function setItem(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      if (!isQuotaError(error)) throw error;
      console.warn('[Track storage] quota exceeded writing "' + key + '" — change not saved');
      showQuotaBanner();
      return false;
    }
  }

  // ── the read boundary ─────────────────────────────────────────────────────────────

  function readRaw() {
    try { return localStorage.getItem(DB_KEY); } catch (e) { return null; }
  }

  // Which validateDatabase errors actually break a render?
  //
  // Compatibility fallback for an older cached schema.js that predates fatal severity.
  // Current schema.js is authoritative through hasFatalErrors(); this duplicate only
  // keeps a mixed-cache load conservative until the matching cache-busted file arrives.
  // Semantic date/time errors and a dangling activeSlotId may warn; ambiguous identities,
  // wrong canonical kinds and nested goal shapes must block writes.
  function isFatal(parsed) {
    var S = window.TrackSchema;
    if (!S || !S.isMap(parsed)) return true;
    if (!S.isList(parsed.slots)) return true;
    var seen = Object.create(null);

    function badGoalTree(nodes) {
      if (!S.isList(nodes)) return true;
      for (var g = 0; g < nodes.length; g++) {
        var node = nodes[g];
        if (!S.isMap(node)) return true;
        if (node.toLearn !== undefined && node.toLearn !== null && !S.isList(node.toLearn)) return true;
        if (node.milestones !== undefined && node.milestones !== null) {
          if (!S.isList(node.milestones)) return true;
          for (var m = 0; m < node.milestones.length; m++) if (!S.isMap(node.milestones[m])) return true;
        }
        if (node.mmTargets !== undefined && node.mmTargets !== null && !S.isMap(node.mmTargets)) return true;
        if (node.children !== undefined && node.children !== null && badGoalTree(node.children)) return true;
      }
      return false;
    }

    for (var i = 0; i < parsed.slots.length; i++) {
      var slot = parsed.slots[i];
      if (!S.isMap(slot)) return true;
      if (!slot.id || seen[String(slot.id)]) return true;
      seen[String(slot.id)] = true;
      for (var k = 0; k < S.SLOT_KEYS.length; k++) {
        var key = S.SLOT_KEYS[k];
        var kind = S.SLOT_FIELDS[key];
        var v = slot[key];
        // Absent is not damage, and schema.js treats null as absent rather than wrong:
        // an empty field holds no data, so the reader's `|| []` loses nothing.
        if (v === undefined || v === null) continue;
        if (kind === 'list') {
          if (!S.isList(v)) return true;
          for (var n = 0; n < v.length; n++) if (!S.isMap(v[n])) return true;
        } else if (kind === 'map') {
          if (!S.isMap(v)) return true;
        } else if ((kind === 'text' || kind === 'date') && typeof v !== 'string') {
          return true;
        }
      }
      if (slot.goals !== undefined && slot.goals !== null && badGoalTree(slot.goals)) return true;
    }
    return false;
  }

  // A root object with no `slots` is NOT damage, and must not be judged by
  // validateDatabase, which legitimately rejects it for lacking a slot list.
  //
  // Two very different things land here and both have to survive untouched:
  // a bare `{}`, and the PRE-UNIFIED legacy shape `{progress, ks02}` that the migration
  // IIFEs in progress.html and sir-ks02.html read `db.progress` and `db.ks02` out of.
  // Returning `{}` for the second would strand the oldest data this project has — the one
  // rescue an install of that age will ever get. null counts as absent here for the same
  // reason it does inside a slot.
  function isPreUnifiedRoot(S, parsed) {
    return S.isMap(parsed) && (parsed.slots === undefined || parsed.slots === null);
  }

  function inspect(raw) {
    if (raw === null || raw === undefined || raw === '') return { state: 'empty', errors: [] };

    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return { state: 'blocked', errors: [{ field: 'database',
        message: 'the saved data is not valid JSON (' + ((e && e.message) || 'parse error') + ')' }] };
    }

    var S = window.TrackSchema;

    // schema.js absent — a load failure, or a page that never got the tag. Fall back to the
    // structural minimum rather than reporting a clean bill of health on an unchecked value.
    if (!S || !S.validateDatabase) {
      var shaped = !!parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        && (parsed.slots === undefined || parsed.slots === null || Array.isArray(parsed.slots));
      return shaped ? { state: 'ok', errors: [] } : { state: 'blocked', errors: [{
        field: 'database', message: 'the saved data is not a workspace database' }] };
    }

    if (isPreUnifiedRoot(S, parsed)) return { state: 'ok', errors: [] };

    var res = S.validateDatabase(parsed);
    var fatal = S.hasFatalErrors ? S.hasFatalErrors(res) : isFatal(parsed);
    if (res.ok && !fatal) return { state: 'ok', errors: [] };
    return { state: fatal ? 'blocked' : 'warn', errors: res.errors };
  }

  // Memoised on the exact raw string. This matters: _getTrackDB() is called on every single
  // _readP — 11 to 14 call sites per page — and validateDatabase walks every slot and every
  // list item, which is the same order of work as the parse. Memoising the VERDICT means a
  // read costs one getItem, one string compare and the JSON.parse it already paid before
  // this file existed; only the validation is saved, and only writes force it again.
  // The parse itself is deliberately not memoised — see loadDB on why callers each need
  // their own object.
  var memoRaw = null;
  var memo = null;

  // `memo === null` is the "not computed yet" test, NOT `memoRaw === null`: getItem returns
  // null for an absent key, so on an empty install raw and the initial memoRaw are both
  // null, the compare says "unchanged", and nothing is ever computed. Invalidating after a
  // write sets memo back to null and reuses this same path.
  function verdict() {
    var raw = readRaw();
    if (memo === null || raw !== memoRaw) { memo = inspect(raw); memoRaw = raw; }
    return { state: memo.state, errors: memo.errors, raw: raw };
  }

  // The read-side counterpart of the quota banner, with the same two-line shape. Severity
  // matches the verdict: `blocked` means nothing can be written until the stored value is
  // readable again; `warn` means it loaded fine and is only being reported.
  function showDataBanner(v) {
    var el = document.getElementById(DATA_BANNER_ID);
    if (el) return el;
    if (!document.body && !document.documentElement) return null;

    var blocked = v.state === 'blocked';
    el = document.createElement('div');
    el.id = DATA_BANNER_ID;
    el.setAttribute('data-severity', v.state);
    el.style.cssText = [
      'position:fixed', 'bottom:210px', 'right:14px',
      'background:#1e293b', 'border:1px solid ' + (blocked ? '#ef4444' : '#f59e0b'),
      'color:' + (blocked ? '#fca5a5' : '#fcd34d'), 'padding:9px 14px', 'border-radius:8px',
      'font-size:11px', 'font-family:monospace', 'z-index:9998',
      'letter-spacing:.04em', 'max-width:320px', 'line-height:1.5'
    ].join(';');

    var msg = document.createElement('div');
    msg.textContent = blocked ? '⚠ Saved data could not be read.' : '⚠ Saved data has problems.';
    el.appendChild(msg);

    var detail = document.createElement('div');
    detail.style.cssText = 'margin-top:5px;opacity:.85';
    detail.textContent = blocked
      ? 'Your data has not been changed or deleted. Editing is disabled on this device '
        + 'until this is resolved — download a copy before you try anything else.'
      : 'Everything still loads and you can keep editing. This is a report, not a failure.';
    el.appendChild(detail);

    var S = window.TrackSchema;
    var summary = (S && S.describeErrors) ? S.describeErrors(v.errors, 4) : '';
    if (summary) {
      var why = document.createElement('div');
      why.style.cssText = 'margin-top:6px;white-space:pre-wrap;opacity:.75;font-size:10px';
      why.textContent = summary;
      el.appendChild(why);
    }

    var row = document.createElement('div');
    row.style.cssText = 'margin-top:6px;display:flex;gap:6px;flex-wrap:wrap';
    if (blocked) row.appendChild(bannerButton('Download a copy', downloadRawDB));
    row.appendChild(bannerButton('Dismiss', clearDataBanner));
    el.appendChild(row);

    (document.body || document.documentElement).appendChild(el);
    return el;
  }

  function clearDataBanner() {
    var el = document.getElementById(DATA_BANNER_ID);
    if (el) el.remove();
  }

  // Hands back the ORIGINAL bytes, never a re-serialisation of something this file parsed —
  // the whole promise is that the unreadable value is recoverable exactly as stored.
  // The filename uses the LOCAL calendar day; toISOString would name it after the UTC day,
  // which is already tomorrow for anyone east of Greenwich in the evening.
  function downloadRawDB() {
    var raw = readRaw();
    if (raw === null) return;
    var d = new Date();
    var day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
      + '-' + String(d.getDate()).padStart(2, '0');
    var url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = 'track_db-unreadable-' + day + '.json';
    (document.body || document.documentElement).appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // The one place a stored database is parsed. Returns a plain object, always — callers
  // mutate what they get back (`db.slots = …`, `db.activeSlotId = id`) and then save, so
  // this re-parses rather than handing out a shared instance whose mutations would leak
  // between call sites.
  //
  // `{}` for both empty and blocked, and NOT `{slots: []}`: `{}` is byte-for-byte what
  // every reader already synthesised for a missing key, and it is what keeps the legacy
  // rescue IIFEs running on a genuinely empty install — they are guarded by
  // `if (db.slots) return`, so `{slots: []}` would make them skip and strand old data.
  function loadDB() {
    var v = verdict();
    if (v.state === 'blocked') { showDataBanner(v); return {}; }
    if (v.state === 'warn') showDataBanner(v);
    if (v.state === 'empty') return {};
    try { return JSON.parse(v.raw); } catch (e) { return {}; }
  }

  // The one id shape for new records. progress.html and documentations.html both
  // write into calendarNotes and deadlines, and each used to mint its own shape,
  // so stored data carried a visible mix of two (NOTES Proposal 14). This file is
  // the only script besides theme.js loaded by every page, which is why the shared
  // helper lives here rather than in a page.
  //
  // Timestamp-then-random: sorts by creation, and can never collide with the plain
  // numeric counters sir-ks02.html uses (nid()), which matters because those two id
  // spaces meet inside one slot. Existing ids are never rewritten — only new ones
  // take this shape, so nothing that already points at an id stops resolving.
  function newId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  window.TrackStorage = {
    DB_KEY: DB_KEY,
    loadDB: loadDB,
    dbBlocked: function () { return verdict().state === 'blocked'; },
    dbStatus: function () { var v = verdict(); return { state: v.state, errors: v.errors }; },
    saveDB: function (db) {
      var v = verdict();
      // The load boundary said these bytes are unreadable. Anything written now would be
      // built from the empty object loadDB handed out, so it would not be a repair — it
      // would be the silent replacement this file exists to stop.
      if (v.state === 'blocked') {
        console.warn('[Track storage] refusing to write over an unreadable track_db');
        showDataBanner(v);
        return false;
      }
      var json = JSON.stringify(db);
      if (!setItem(DB_KEY, json)) return false;
      // Invalidate rather than assume the new value is clean. Asserting 'ok' here would be
      // cheaper, but it would also erase a standing `warn` the moment the user edited
      // anything, and it would let a page that wrote something structurally broken keep
      // reporting a clean bill of health until the next reload. The cost is one validation
      // per WRITE, not per read — reads are the hot path (11-14 per render) and still hit
      // the memo, and a write already pays a whole-database JSON.stringify anyway.
      memo = null;
      return true;
    },
    setItem: setItem,
    isQuotaError: isQuotaError,
    clearQuotaBanner: clearQuotaBanner,
    clearDataBanner: clearDataBanner,
    downloadRawDB: downloadRawDB,
    newId: newId
  };
})();
