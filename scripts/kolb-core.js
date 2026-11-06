/* ── kolb-core.js ──────────────────────────────────────────────────────────
   The one definition of what saving and editing a Kolb DOES, and of what a
   Kolb draft is (window.TrackKolb).

   A Kolb is one reflection on an experience (docs/CONCEPTS.md, "Kolb → MG"):
   experience, reflection, abstract, then an experiment and an MG. Saving one
   is not a single-record write. On a Procedural mind map it also

     - logs an MG change (`mgChanges`) and makes it the mind map's currentMG,
     - sets the mind map's MG level (`rating`) from the Kolb's level, and
     - sends a mind map past S1 back to S1, logging a `kolbReset` LIN change —
       and, when it is still STORED in SIR, deleting its hidden sessions,
       which is why that one case asks first.

   TWO surfaces save Kolbs: the Knowledge Record (sir-ks02.html — its Kolb form
   and its KOLB tab's edit view) and the notes widget's Kolbs tab
   (notes-widget.js). If each spelled those effects, one click would come to
   store two different things — the duplication shape that cost this project
   the deadline caution predicate (AGENTS.md). So the effects live HERE, once,
   and sir-ks02.html's saveKolb, the edit view's onSave and kolbResetPlan are
   delegates. tests/kolb-core.test.js pins withNewKolb, withKolbEdit and
   resetPlan against VERBATIM copies of the React code they replaced.

   A DRAFT (`kolbDrafts`, a slot field owned by the notes widget) is a Kolb
   that has not been finished: it is stored, synced and exported, but it is
   NOT a Kolb — no reader of `kolbs` ever sees it, and it has no MG, no level
   and no reset until Done turns it into one through withNewKolb. Absence is
   the default for every field it holds, so a field emptied is DELETED and a
   draft carries only what was written.

   Contract, shared with the other *-core.js modules:

   - Pure. Nothing here reads or writes storage, and nothing constructs a
     Date: the day a Kolb is dated, and a draft's `now`, are PARAMETERS. That
     is why this suite runs once rather than swept.
   - Mints NO ids. A writer that needs one calls the `mint` it is handed,
     exactly where the original called KS02's nid(), so KS02 keeps its own
     counter and the widget hands in one seeded by nextNumericId.
   - Never mutates its input, and SPREADS every record it changes, so a key
     this version has not heard of survives an edit.
   - Total. schema.js checks only that each list holds objects, so every read
     goes through a helper that cannot throw — a throw from a React render
     empties the whole page.
   - Returns the very input list when nothing changed, which lets the widget
     skip a write and React bail out of an autosave.

   Depends on milestone-core.js (window.TrackMilestone) for stageOf and
   isProcedural, read at call time. Loaded as a classic script by all five
   pages, after milestone-core.js and before notes-widget.js.
*/
(function (global) {
  'use strict';

  function isMap(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function isList(v) { return Array.isArray(v); }
  function listOf(v) { return isList(v) ? v : []; }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function str(v) { return typeof v === 'string' ? v : v == null ? '' : String(v); }
  // A Kolb or mind-map id is a NUMBER from KS02's nid() in real data; a record
  // minted on another page may carry a string. Both are ids.
  function isId(v) { return (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v !== ''); }

  function M() {
    var m = global.TrackMilestone;
    if (!m) throw new Error('kolb-core.js needs milestone-core.js loaded first');
    return m;
  }

  // ── the form ──────────────────────────────────────────────────────────────

  // sir-ks02.html's EMPTY_KOLB, which is now this object. `mgLookLike` is a
  // legacy field no editor writes any more; it stays so a Kolb keeps the shape
  // every stored one has.
  var EMPTY = Object.freeze({
    isReflectingOnPrev: false, experience: '', level: '', mgLookLike: '', sequence: '', feelings: '',
    difficultWell: '', challenges: '', triggers: '', whyActed: '', habits: '', otherParts: '',
    experiments: '', mgAdd: ''
  });

  // The questions, in the Knowledge Record's own words and order (its Kolb
  // form's steps). `short` names a field where there is no room for the
  // question — a Send menu, a toast.
  var STEPS = Object.freeze([
    Object.freeze({ n: 1, title: 'Experience' }),
    Object.freeze({ n: 2, title: 'Reflection' }),
    Object.freeze({ n: 3, title: 'Abstract' }),
    Object.freeze({ n: 4, title: 'Experiment & MG' })
  ]);
  var TEXT_FIELDS = Object.freeze([
    { key: 'experience', step: 1, label: 'What experience to reflect on?', short: 'Experience', rows: 3 },
    { key: 'sequence', step: 2, label: 'Sequence of events:', short: 'Sequence', rows: 4 },
    { key: 'feelings', step: 2, label: 'How did you feel?', short: 'Feelings', rows: 2 },
    { key: 'difficultWell', step: 2, label: 'Difficult vs went well?', short: 'Difficult vs went well', rows: 2 },
    { key: 'challenges', step: 2, label: 'Response to challenges?', short: 'Challenges', rows: 2 },
    { key: 'triggers', step: 2, label: 'Triggers?', short: 'Triggers', rows: 2 },
    { key: 'whyActed', step: 2, label: 'Why did you act that way?', short: 'Why you acted', rows: 2 },
    { key: 'habits', step: 3, label: 'Habits/beliefs/tendencies?', short: 'Habits', rows: 3 },
    { key: 'otherParts', step: 3, label: 'Similar patterns elsewhere?', short: 'Elsewhere', rows: 2 },
    { key: 'experiments', step: 4, label: '4.1 Experiment — actions to test', short: 'Experiment', rows: 3 },
    { key: 'mgAdd', step: 4, label: '4.2 MG add — the actual marginal gain', short: 'MG add', rows: 3 }
  ].map(Object.freeze));
  var TEXT_KEYS = TEXT_FIELDS.map(function (f) { return f.key; });
  // What an editor may change. mgLookLike is not here: nothing edits it.
  var FIELD_KEYS = Object.freeze(TEXT_KEYS.concat(['level', 'isReflectingOnPrev']));
  var LEVELS = Object.freeze(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);

  function isFieldKey(k) { return FIELD_KEYS.indexOf(k) >= 0; }

  // One field's value as an editor reads it — total, whatever is stored.
  function fieldValue(rec, key) {
    var v = isMap(rec) && own(rec, key) ? rec[key] : EMPTY[key];
    if (key === 'isReflectingOnPrev') return v === true;
    if (key === 'level') { var l = str(v); return LEVELS.indexOf(l) >= 0 ? l : ''; }
    return str(v);
  }

  // A whole form from any record — a draft or a Kolb — with every EMPTY key,
  // and nothing else: no id, no mmId, no date, nothing a save sets itself.
  function formOf(rec) {
    var out = {};
    Object.keys(EMPTY).forEach(function (k) {
      out[k] = k === 'mgLookLike' ? str(isMap(rec) && own(rec, k) ? rec[k] : '') : fieldValue(rec, k);
    });
    return out;
  }

  // ── reading Kolbs ─────────────────────────────────────────────────────────

  function kolbsOf(v) { return listOf(v).filter(isMap); }

  function findKolb(kolbs, id) {
    return listOf(kolbs).find(function (k) { return isMap(k) && k.id === id; }) || null;
  }

  // Newest first: by day, then — for two Kolbs of one day — the one stored
  // later first. Kolbs are only ever appended, so stored order is the order
  // they were made in. A missing or junk date sorts last rather than throwing.
  function byNewest(kolbs) {
    return kolbsOf(kolbs)
      .map(function (k, i) { return { k: k, i: i, d: typeof k.date === 'string' ? k.date : '' }; })
      .sort(function (a, b) { return a.d < b.d ? 1 : a.d > b.d ? -1 : b.i - a.i; })
      .map(function (x) { return x.k; });
  }

  // The latest experiment the Kolb form shows at step 4: of the mind map's
  // Kolbs, or of every Kolb when none is chosen. The original sorted by
  // `b.id - a.id`, and that comparison is kept exactly — a sort reads its NaN
  // (an id that is not a number) as 0, and `|| 0` only says so.
  function latestExperiment(kolbs, mmId) {
    var rel = listOf(kolbs).filter(isMap);
    if (mmId) rel = rel.filter(function (k) { return k.mmId === mmId; });
    var top = rel.slice().sort(function (a, b) { return (b.id - a.id) || 0; })[0];
    return (top && top.experiments) || '';
  }

  // KS02's mmMap — Object.fromEntries over `mms`: keyed by String(id), and the
  // LAST record of a duplicated id wins. A Kolb finds its mind map this way.
  function mmIndex(mms) {
    var out = Object.create(null);
    listOf(mms).forEach(function (m) { if (isMap(m) && isId(m.id)) out[String(m.id)] = m; });
    return out;
  }
  function lookup(idx, id) { return id == null || id === '' ? undefined : idx[String(id)]; }

  // The mind maps a Kolb may be linked to: Procedural ones, as KS02's type2mms.
  function linkable(mms) {
    return listOf(mms).filter(function (m) { return isMap(m) && m.type === '2'; });
  }

  // Choosing a mind map in a NEW Kolb starts its level at the mind map's MG
  // level, and choosing none clears it — the Kolb form's own rule.
  function levelFor(mm) {
    return isMap(mm) && mm.rating != null ? str(mm.rating) : '';
  }

  // KS02's stageLabel, which is now a delegate to this.
  function stageLabel(s) {
    if (!s) return 'Unassigned';
    if (s === 'sir') return 'SIR';
    if (s === 'finished') return 'FINISHED';
    return 'S' + s;
  }

  // ── the reset to S1 ───────────────────────────────────────────────────────
  // A Kolb ARRIVING on a Procedural mind map sends it back to S1. It arrives
  // when a new one is saved on it, and when an old one is moved onto it. One
  // still STORED in SIR holds hidden sessions that leaving SIR deletes, so that
  // case asks first: resetPrompt is the question, and the caller asks it
  // BEFORE any write and writes nothing on Cancel.

  function resetPlan(S, mmId) {
    var T = M();
    var target = mmId ? lookup(mmIndex(S && S.mms), mmId) : null;
    var fromStage = target ? T.stageOf(target) : null;
    var resets = T.isProcedural(target) && fromStage != null && fromStage !== '' && String(fromStage) !== '1';
    var hidden = [];
    if (resets && ['sir', 'finished'].indexOf(target.ksStage) >= 0) {
      hidden = listOf(S && S.sessions).filter(function (s) { return isMap(s) && s.mmId === target.id; });
    }
    return { mmId: mmId, resets: !!resets, hidden: hidden, fromStage: fromStage, target: target || null };
  }

  // null when nothing needs asking. `lead` is the start of the sentence —
  // "Saving this Kolb sends", "Moving this Kolb sends".
  function resetPrompt(plan, lead) {
    if (!plan || !plan.hidden || !plan.hidden.length || !plan.target) return null;
    var n = plan.hidden.length, t = plan.target;
    return lead + ' "' + t.name + '" back to S1.\n\nIt is Procedural, so it shows as S4 — but it is still stored as ' +
      stageLabel(t.ksStage) + ', with ' + n + ' SIR session' + (n === 1 ? '' : 's') +
      ' hidden from every calendar. Going back to S1 takes it out of SIR, which deletes ' +
      (n === 1 ? 'that session' : 'those sessions') + '.\n\nSave anyway?';
  }

  // KS02's applyKolbReset. Over {mms, sessions, linChanges}; returns the same
  // object when the plan resets nothing.
  function withReset(S, plan, kolbId, mint, day) {
    if (!plan || !plan.resets) return S;
    var mmId = plan.mmId;
    var out = Object.assign({}, S);
    out.mms = mapChanged(listOf(S.mms), function (m) {
      return isMap(m) && m.id === mmId ? Object.assign({}, m, { ksStage: '1' }) : m;
    });
    if (plan.hidden.length) {
      var kept = listOf(S.sessions).filter(function (s) { return !(isMap(s) && s.mmId === mmId); });
      out.sessions = kept.length === listOf(S.sessions).length ? S.sessions : kept;
    }
    out.linChanges = listOf(S.linChanges).concat([{
      id: mint(), title: day, date: day,
      items: [{ mmId: mmId, change: { type: 'kolbReset', oldValue: String(plan.fromStage), newValue: '1', kolbId: kolbId } }]
    }]);
    return out;
  }

  // map() that hands back the very list when no element changed identity.
  function mapChanged(list, fn) {
    var changed = false;
    var next = list.map(function (x) { var y = fn(x); if (y !== x) changed = true; return y; });
    return changed ? next : list;
  }

  // The five keys a Kolb save touches, as one snapshot.
  var STATE_KEYS = Object.freeze(['kolbs', 'mgChanges', 'mms', 'sessions', 'linChanges']);

  function stateOf(slot) {
    var out = {};
    STATE_KEYS.forEach(function (k) { out[k] = listOf(isMap(slot) ? slot[k] : null); });
    return out;
  }

  function byDateDesc(a, b) { return str(b && b.date).localeCompare(str(a && a.date)); }

  // ── saving a new Kolb ─────────────────────────────────────────────────────
  // KS02's saveKolb, after its prompt. `o` is {mint, day, plan}: plan is
  // resetPlan's answer for mmId, asked and accepted. Ids are minted in the
  // order the original called nid(): the Kolb, the LIN record, the MG change.
  // Returns the next state and the new Kolb's id as `kolbId`.
  function withNewKolb(S, form, mmId, o) {
    var kid = o.mint();
    var f = isMap(form) ? form : {};
    var mgValue = str(f.mgAdd || f.experiments || '').trim();
    var mms = listOf(S.mms), mmMap = mmIndex(mms);
    var out = Object.assign({}, S);
    out.kolbs = listOf(S.kolbs).concat([Object.assign({ id: kid, mmId: mmId || null }, f, { date: o.day })]);
    var r = withReset({ mms: mms, sessions: S.sessions, linChanges: S.linChanges }, o.plan, kid, o.mint, o.day);
    out.mms = r.mms; out.sessions = r.sessions; out.linChanges = r.linChanges;
    if (mmId) {
      var mm = lookup(mmMap, mmId);
      if (mm && mm.type === '2') {
        if (mgValue) {
          out.mgChanges = listOf(S.mgChanges).concat([{ id: o.mint(), mmId: mmId, kolbId: kid,
            oldMG: mm.currentMG || '(none)', newMG: mgValue, experiment: f.experiments || '', date: o.day }]);
          out.mms = mapChanged(out.mms, function (m) {
            return isMap(m) && m.id === mmId ? Object.assign({}, m, { currentMG: mgValue }) : m;
          });
        }
        if (f.level) {
          out.mms = mapChanged(out.mms, function (m) {
            return isMap(m) && m.id === mmId ? Object.assign({}, m, { rating: Number(f.level) }) : m;
          });
        }
      }
    }
    out.kolbId = kid;
    return out;
  }

  // ── editing a Kolb ────────────────────────────────────────────────────────
  // The KOLB tab edit view's onSave, after its prompt. `updated` is the whole
  // record as it should be — the view hands in its form, the widget the stored
  // record with its patch spread over. Moving it to another mind map moves its
  // MG changes and recomputes the currentMG (and, for the mind map it left,
  // the level) of every mind map it touched; leaving it where it is updates
  // its own MG change. `o` is {mint, day, plan}; plan is resetPlan for the
  // mind map it ARRIVES on, or null when it arrives nowhere.
  //
  // Every map keeps the identity of what it did not change, so an edit that
  // changes nothing returns S's own lists. The original always made new ones;
  // the content is the same either way.
  function withKolbEdit(S, kolbId, updated, o) {
    var kolbs = listOf(S.kolbs), mgChanges = listOf(S.mgChanges), mms = listOf(S.mms);
    var k = findKolb(kolbs, kolbId);
    if (!k || !isMap(updated)) return S;
    var mmMap = mmIndex(mms);
    var mgValue = str(updated.mgAdd || updated.experiments || '').trim();
    var out = Object.assign({}, S);

    out.kolbs = mapChanged(kolbs, function (kb) {
      if (!isMap(kb) || kb.id !== k.id) return kb;
      var next = Object.assign({}, kb, updated);
      return sameRecord(kb, next) ? kb : next;
    });

    var target = lookup(mmMap, updated.mmId);
    var nextMms = mms, nextMg = mgChanges;
    if (updated.mmId !== k.mmId) {
      var hasNewMG = updated.mmId && target && target.type === '2' && mgValue;
      var affected = new Set(mgChanges.filter(function (c) { return isMap(c) && c.kolbId === k.id && c.mmId; })
        .map(function (c) { return c.mmId; }));
      if (k.mmId) affected.add(k.mmId);
      var moved = mapChanged(mgChanges, function (c) {
        return isMap(c) && c.kolbId === k.id ? Object.assign({}, c, { mmId: updated.mmId }) : c;
      });
      nextMg = hasNewMG ? moved.concat([{ id: o.mint(), mmId: updated.mmId, kolbId: k.id,
        oldMG: target.currentMG || '(none)', newMG: mgValue, experiment: updated.experiments || '', date: k.date }]) : moved;
      if (hasNewMG) {
        var movedChanges = mgChanges.filter(function (c) { return isMap(c) && c.kolbId === k.id && c.mmId; })
          .map(function (c) { return Object.assign({}, c, { mmId: updated.mmId }); });
        var existingForTarget = mgChanges.filter(function (c) { return isMap(c) && c.mmId === updated.mmId && c.kolbId !== k.id; });
        var allForTarget = existingForTarget.concat(movedChanges, [{ date: k.date, newMG: mgValue }]).sort(byDateDesc);
        nextMms = mapChanged(nextMms, function (m) {
          return isMap(m) && m.id === updated.mmId ? Object.assign({}, m, { currentMG: allForTarget[0].newMG }) : m;
        });
      }
      if (affected.size) {
        nextMms = mapChanged(nextMms, function (m) {
          if (!isMap(m) || !affected.has(m.id)) return m;
          var remaining = mgChanges.filter(function (c) { return isMap(c) && c.mmId === m.id && c.kolbId !== k.id; }).sort(byDateDesc);
          if (m.id === k.mmId) {
            var remKolbs = kolbs.filter(function (kb) { return isMap(kb) && kb.mmId === k.mmId && kb.id !== k.id; }).sort(byDateDesc);
            return Object.assign({}, m, { currentMG: remaining.length ? remaining[0].newMG : '',
              rating: remKolbs.length && remKolbs[0].level ? Number(remKolbs[0].level) : null });
          }
          return Object.assign({}, m, { currentMG: remaining.length ? remaining[0].newMG : '' });
        });
      }
    } else if (updated.mmId && target && target.type === '2' && mgValue && updated.mmId === k.mmId) {
      nextMg = mapChanged(mgChanges, function (c) {
        if (!isMap(c) || c.kolbId !== k.id) return c;
        var next = Object.assign({}, c, { newMG: mgValue, experiment: updated.experiments || '' });
        return sameRecord(c, next) ? c : next;
      });
      var mmChanges = mgChanges.filter(function (c) { return isMap(c) && c.mmId === updated.mmId; }).sort(byDateDesc);
      if (!mmChanges.length || mmChanges[0].kolbId === k.id) {
        nextMms = mapChanged(nextMms, function (m) {
          return isMap(m) && m.id === updated.mmId && m.currentMG !== mgValue ? Object.assign({}, m, { currentMG: mgValue }) : m;
        });
      }
    }
    if (updated.mmId && target && target.type === '2' && updated.level) {
      var lvl = Number(updated.level);
      nextMms = mapChanged(nextMms, function (m) {
        return isMap(m) && m.id === updated.mmId && m.rating !== lvl ? Object.assign({}, m, { rating: lvl }) : m;
      });
    }
    out.mgChanges = nextMg;
    var r = withReset({ mms: nextMms, sessions: S.sessions, linChanges: S.linChanges }, o && o.plan, k.id, o && o.mint, o && o.day);
    out.mms = r.mms; out.sessions = r.sessions; out.linChanges = r.linChanges;
    return out;
  }

  // Shallow: the same keys holding the same values.
  function sameRecord(a, b) {
    var ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every(function (key) { return own(b, key) && a[key] === b[key]; });
  }

  // Which of the five keys a writer changed, as {key: value} — the patch to
  // write. Empty when nothing changed.
  function changedKeys(before, after) {
    var out = {};
    STATE_KEYS.forEach(function (k) { if (after[k] !== before[k]) out[k] = after[k]; });
    return out;
  }

  // ── ids ───────────────────────────────────────────────────────────────────
  // The next id KS02's nid() counter may hand out: one past the highest
  // numeric id among the records it mints, sourceDumps' links included. Its
  // _loadSlot and _bumpUid both read this, and the widget seeds its own minter
  // with it, so a Kolb made in the widget takes an id KS02 will step past as
  // soon as it hears of the write. Finite numbers only — the original let a
  // NaN id make the counter NaN for good; that is the one deliberate change.
  function nextNumericId(slot) {
    var s = isMap(slot) ? slot : {};
    var max = -Infinity;
    function see(x) { if (isMap(x) && typeof x.id === 'number' && Number.isFinite(x.id) && x.id > max) max = x.id; }
    ['sessions', 'mms', 'kolbs', 'mgChanges', 'linChanges'].forEach(function (k) { listOf(s[k]).forEach(see); });
    listOf(s.sourceDumps).forEach(function (d) {
      see(d);
      if (!isMap(d)) return;
      listOf(d.mmLinks).forEach(function (l) { see(l); if (isMap(l)) listOf(l.links).forEach(see); });
    });
    return max === -Infinity ? 1 : max + 1;
  }

  // ── drafts ────────────────────────────────────────────────────────────────
  // `kolbDrafts` holds {id, createdAt, updatedAt, mmId?, ...fields}. Times are
  // epoch ms, passed in. A field at its EMPTY value is never stored, so
  // emptying one DELETES its key; `mmId` is absent for "no mind map".

  function draftsOf(v) { return listOf(v).filter(isMap); }

  function findDraft(drafts, id) {
    return listOf(drafts).find(function (d) { return isMap(d) && d.id === id; }) || null;
  }

  // Newest-edited first. Drafts sit above every Kolb in a list: each is open
  // work, and becomes the newest Kolb the day it is finished.
  function draftsByNewest(drafts) {
    var t = function (d) { return typeof d.updatedAt === 'number' ? d.updatedAt : typeof d.createdAt === 'number' ? d.createdAt : 0; };
    return draftsOf(drafts).map(function (d, i) { return { d: d, i: i }; })
      .sort(function (a, b) { return (t(b.d) - t(a.d)) || (b.i - a.i); })
      .map(function (x) { return x.d; });
  }

  function draftIsBlank(d) {
    if (!isMap(d)) return true;
    if (isId(d.mmId)) return false;
    return FIELD_KEYS.every(function (k) { return fieldValue(d, k) === fieldValue(null, k); });
  }

  // Applies `patch` to one draft record: FIELD_KEYS and `mmId` only. Returns
  // the record itself when nothing changes.
  function patched(d, patch, now) {
    var next = Object.assign({}, d), changed = false;
    Object.keys(patch).forEach(function (k) {
      if (k === 'mmId') {
        var id = patch.mmId;
        if (isId(id)) { if (next.mmId !== id) { next.mmId = id; changed = true; } }
        else if (own(next, 'mmId')) { delete next.mmId; changed = true; }
        return;
      }
      if (!isFieldKey(k)) return;
      var probe = {}; probe[k] = patch[k];
      var v = fieldValue(probe, k);
      if (v === fieldValue(null, k)) { if (own(next, k)) { delete next[k]; changed = true; } }
      else if (next[k] !== v) { next[k] = v; changed = true; }
    });
    if (!changed) return d;
    next.updatedAt = now;
    return next;
  }

  // Writes a patch into a draft. A draft that is not in the list is CREATED
  // only when `create` is set — the widget sets it for a draft it opened as new
  // and has not stored yet — and only once the patch leaves something written,
  // so opening "+ New Kolb" and leaving stores nothing. A draft finished or
  // discarded in another tab is therefore never brought back by a pending save:
  // without `create`, a missing draft answers found:false.
  function withDraft(drafts, id, patch, now, create) {
    var list = listOf(drafts);
    var p = isMap(patch) ? patch : {};
    var idx = list.findIndex(function (d) { return isMap(d) && d.id === id; });
    if (idx < 0) {
      if (!create || !isId(id)) return { list: drafts, found: false };
      var fresh = patched({ id: id, createdAt: now }, p, now);
      if (draftIsBlank(fresh)) return { list: drafts, found: true };
      fresh = Object.assign({ id: id, createdAt: now, updatedAt: now }, fresh);
      return { list: list.concat([fresh]), found: true };
    }
    var cur = list[idx];
    var next = patched(cur, p, now);
    if (next === cur) return { list: drafts, found: true };
    var out = list.slice(); out[idx] = next;
    return { list: out, found: true };
  }

  function withoutDraft(drafts, id) {
    var list = listOf(drafts);
    var kept = list.filter(function (d) { return !(isMap(d) && d.id === id); });
    return kept.length === list.length ? drafts : kept;
  }

  global.TrackKolb = {
    EMPTY: EMPTY,
    STEPS: STEPS,
    TEXT_FIELDS: TEXT_FIELDS,
    FIELD_KEYS: FIELD_KEYS,
    LEVELS: LEVELS,
    STATE_KEYS: STATE_KEYS,
    isId: isId,
    fieldValue: fieldValue,
    formOf: formOf,
    kolbsOf: kolbsOf,
    findKolb: findKolb,
    byNewest: byNewest,
    latestExperiment: latestExperiment,
    mmIndex: mmIndex,
    linkable: linkable,
    levelFor: levelFor,
    stageLabel: stageLabel,
    resetPlan: resetPlan,
    resetPrompt: resetPrompt,
    withReset: withReset,
    stateOf: stateOf,
    withNewKolb: withNewKolb,
    withKolbEdit: withKolbEdit,
    changedKeys: changedKeys,
    nextNumericId: nextNumericId,
    draftsOf: draftsOf,
    findDraft: findDraft,
    draftsByNewest: draftsByNewest,
    draftIsBlank: draftIsBlank,
    withDraft: withDraft,
    withoutDraft: withoutDraft
  };
})(typeof window !== 'undefined' ? window : globalThis);
