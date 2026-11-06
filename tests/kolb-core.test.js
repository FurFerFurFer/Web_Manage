/* ── tests/kolb-core.test.js ───────────────────────────────────────────────
   Offline cover for kolb-core.js — the one definition of what saving and
   editing a Kolb does, and of a Kolb draft.

       node --test tests/kolb-core.test.js

   Run once by tests/run.js rather than once per timezone: nothing in
   kolb-core.js constructs a Date. The day a Kolb is dated arrives as a
   PARAMETER, and so does a draft's `now`. The structural case below is what
   says so.

   What is pinned, in order of how much it would cost to get wrong:

   1. withNewKolb, withKolbEdit and resetPlan / resetPrompt store EXACTLY what
      sir-ks02.html's saveKolb, its KOLB tab's edit onSave and kolbResetPlan
      stored. Those three are now delegates, and the notes widget calls the
      module directly, so a difference here is the widget and the Knowledge
      Record disagreeing about one click. The originals are copied below
      VERBATIM and run through a tiny React-state stand-in: every setX applies
      at once, in call order, and every bare read sees the snapshot — which is
      what the closures saw.

   2. A draft is never a Kolb, and a draft deleted elsewhere is never brought
      back: withDraft creates only when told to, and only once something is
      written.

   3. Ids are NUMBERS in real data (KS02's nid()), and the widget's minter
      starts where KS02's counter would (nextNumericId).

   Fixtures are synthetic, always (AGENTS.md, "Preserve old data").
*/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

globalThis.window = globalThis;
for (const f of ['milestone-core.js', 'kolb-core.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'scripts', f), 'utf8'), { filename: f });
}
const K = globalThis.TrackKolb;
const TM = globalThis.TrackMilestone;
const SRC = path.join(__dirname, '..', 'scripts', 'kolb-core.js');

const clone = v => JSON.parse(JSON.stringify(v));
const DAY = '2026-11-05';

// sir-ks02.html's EMPTY_KOLB, verbatim, as it stood before the module.
const EMPTY_KOLB = {isReflectingOnPrev:false,experience:"",level:"",mgLookLike:"",sequence:"",feelings:"",difficultWell:"",challenges:"",triggers:"",whyActed:"",habits:"",otherParts:"",experiments:"",mgAdd:""};

// ── fixtures ───────────────────────────────────────────────────────────────
// Guitar (Procedural, S3), Piano (Procedural, S1), Chess (Procedural but still
// STORED in SIR, two hidden sessions), History (Declarative), Music (anchor).
// Numeric ids, as nid() mints them.
const kolb = (id, mmId, date, over = {}) => Object.assign({ id, mmId }, EMPTY_KOLB, over, { date });
const SLOT = () => ({
  mms: [
    { id: 10, name: 'Guitar', type: '2', ksStage: '3', currentMG: 'mg2', rating: 3, parentIds: [] },
    { id: 11, name: 'Piano', type: '2', ksStage: '1', currentMG: '', rating: null, parentIds: [] },
    { id: 12, name: 'Chess', type: '2', ksStage: 'sir', currentMG: 'open fast', rating: 4, parentIds: [] },
    { id: 13, name: 'History', type: '1', ksStage: '2', parentIds: [] },
    { id: 14, name: 'Music', type: 'anchor', parentIds: [] }
  ],
  sessions: [
    { id: 50, mmId: 12, date: '2026-10-02', done: true },
    { id: 51, mmId: 12, date: '2026-10-05', done: false },
    { id: 52, mmId: 13, date: '2026-10-06', done: false }
  ],
  kolbs: [
    kolb(100, 10, '2026-10-01', { experience: 'first run', level: '2', experiments: 'x1', mgAdd: 'mg1' }),
    kolb(101, null, '2026-10-03', { experience: 'free one', experiments: 'loose' }),
    kolb(102, 10, '2026-10-05', { experience: 'second run', level: '3', experiments: 'x2', mgAdd: 'mg2' })
  ],
  mgChanges: [
    { id: 200, mmId: 10, kolbId: 100, oldMG: '(none)', newMG: 'mg1', experiment: 'x1', date: '2026-10-01' },
    { id: 201, mmId: 10, kolbId: 102, oldMG: 'mg1', newMG: 'mg2', experiment: 'x2', date: '2026-10-05' }
  ],
  linChanges: [
    { id: 300, title: '2026-10-04', date: '2026-10-04', items: [{ mmId: 10, change: { type: 'stageAdvance', oldValue: '2', newValue: '3' } }] }
  ]
});
const START_ID = 400; // what nid() would hand out next

// ── a React-state stand-in, and the originals verbatim ─────────────────────

function harness(init, answer) {
  const snap = clone(init);
  const next = { sessions: snap.sessions, mms: snap.mms, kolbs: snap.kolbs, mgChanges: snap.mgChanges, linChanges: snap.linChanges };
  let uid = START_ID;
  const set = key => v => { next[key] = typeof v === 'function' ? v(next[key]) : v; };
  const prompts = [];
  return {
    snap, next, prompts,
    nid: () => uid++,
    used: () => uid - START_ID,
    set,
    confirm: msg => { prompts.push(msg); return answer !== false; }
  };
}

// sir-ks02.html, before kolb-core.js — kolbResetPlan, applyKolbReset and
// saveKolb, with the helpers they called. Only the harness wiring is new.
function ORIGINAL_save(init, form, mmIdArg, answer) {
  const H = harness(init, answer);
  const { sessions, mms } = H.snap;
  const mmMap = Object.fromEntries(mms.map(m => [m.id, m]));
  const nid = H.nid, today = () => DAY;
  const setKolbs = H.set('kolbs'), setMgChanges = H.set('mgChanges'), setMms = H.set('mms');
  const setSessions = H.set('sessions'), setLinChanges = H.set('linChanges'), setKolbModal = () => {};
  const window = { confirm: H.confirm };
  const stageOf = mm => TrackMilestone.stageOf(mm);
  const isProcedural = mm => TrackMilestone.isProcedural(mm);
  function stageLabel(s){if(!s)return"Unassigned";if(s==="sir")return"SIR";if(s==="finished")return"FINISHED";return`S${s}`;}
  function hiddenSirSessions(mm){
    if(!isProcedural(mm)||!["sir","finished"].includes(mm.ksStage)) return [];
    return sessions.filter(s=>s.mmId===mm.id);
  }
  function kolbResetPlan(mmId,lead){
    const target=mmId?mmMap[mmId]:null;
    const fromStage=target?stageOf(target):null;
    const resets=isProcedural(target)&&fromStage!=null&&fromStage!==""&&String(fromStage)!=="1";
    const hidden=resets?hiddenSirSessions(target):[];
    if(hidden.length&&!window.confirm(`${lead} "${target.name}" back to S1.\n\nIt is Procedural, so it shows as S4 — but it is still stored as ${stageLabel(target.ksStage)}, with ${hidden.length} SIR session${hidden.length===1?"":"s"} hidden from every calendar. Going back to S1 takes it out of SIR, which deletes ${hidden.length===1?"that session":"those sessions"}.\n\nSave anyway?`)) return null;
    return {mmId,resets,hidden,fromStage};
  }
  function applyKolbReset(plan,kid){
    if(!plan||!plan.resets) return;
    const {mmId,hidden,fromStage}=plan;
    setMms(p=>p.map(m=>m.id===mmId?{...m,ksStage:"1"}:m));
    if(hidden.length) setSessions(p=>p.filter(s=>s.mmId!==mmId));
    setLinChanges(p=>[...p,{id:nid(),title:today(),date:today(),items:[{mmId,change:{type:"kolbReset",oldValue:String(fromStage),newValue:"1",kolbId:kid}}]}]);
  }
  function saveKolb(form,mmId){
    const plan=kolbResetPlan(mmId,"Saving this Kolb sends");
    if(!plan) return false;
    const kid=nid();
    const mgValue=(form.mgAdd||form.experiments||"").trim();
    setKolbs(p=>[...p,{id:kid,mmId:mmId||null,...form,date:today()}]);
    applyKolbReset(plan,kid);
    if (mmId){const mm=mmMap[mmId];if (mm&&mm.type==="2"){
      if (mgValue){
        setMgChanges(p=>[...p,{id:nid(),mmId,kolbId:kid,oldMG:mm.currentMG||"(none)",newMG:mgValue,experiment:form.experiments||"",date:today()}]);
        setMms(p=>p.map(m=>m.id===mmId?{...m,currentMG:mgValue}:m));
      }
      if (form.level){setMms(p=>p.map(m=>m.id===mmId?{...m,rating:Number(form.level)}:m));}
    }}
    setKolbModal(null);
  }
  const result = saveKolb(form, mmIdArg);
  return { result, state: H.next, prompts: H.prompts, used: H.used() };
}

// The KOLB tab's edit onSave, verbatim, with kolbResetPlan / applyKolbReset.
function ORIGINAL_edit(init, kolbId, updated, answer) {
  const H = harness(init, answer);
  const { sessions, mms, kolbs, mgChanges } = H.snap;
  const mmMap = Object.fromEntries(mms.map(m => [m.id, m]));
  const nid = H.nid, today = () => DAY;
  const setKolbs = H.set('kolbs'), setMgChanges = H.set('mgChanges'), setMms = H.set('mms');
  const setSessions = H.set('sessions'), setLinChanges = H.set('linChanges'), setSelectedKolbId = () => {};
  const window = { confirm: H.confirm };
  const stageOf = mm => TrackMilestone.stageOf(mm);
  const isProcedural = mm => TrackMilestone.isProcedural(mm);
  function stageLabel(s){if(!s)return"Unassigned";if(s==="sir")return"SIR";if(s==="finished")return"FINISHED";return`S${s}`;}
  function hiddenSirSessions(mm){
    if(!isProcedural(mm)||!["sir","finished"].includes(mm.ksStage)) return [];
    return sessions.filter(s=>s.mmId===mm.id);
  }
  function kolbResetPlan(mmId,lead){
    const target=mmId?mmMap[mmId]:null;
    const fromStage=target?stageOf(target):null;
    const resets=isProcedural(target)&&fromStage!=null&&fromStage!==""&&String(fromStage)!=="1";
    const hidden=resets?hiddenSirSessions(target):[];
    if(hidden.length&&!window.confirm(`${lead} "${target.name}" back to S1.\n\nIt is Procedural, so it shows as S4 — but it is still stored as ${stageLabel(target.ksStage)}, with ${hidden.length} SIR session${hidden.length===1?"":"s"} hidden from every calendar. Going back to S1 takes it out of SIR, which deletes ${hidden.length===1?"that session":"those sessions"}.\n\nSave anyway?`)) return null;
    return {mmId,resets,hidden,fromStage};
  }
  function applyKolbReset(plan,kid){
    if(!plan||!plan.resets) return;
    const {mmId,hidden,fromStage}=plan;
    setMms(p=>p.map(m=>m.id===mmId?{...m,ksStage:"1"}:m));
    if(hidden.length) setSessions(p=>p.filter(s=>s.mmId!==mmId));
    setLinChanges(p=>[...p,{id:nid(),title:today(),date:today(),items:[{mmId,change:{type:"kolbReset",oldValue:String(fromStage),newValue:"1",kolbId:kid}}]}]);
  }
  const k = kolbs.find(k => k.id === kolbId);
  const onSave=(updated)=>{
                  const arrives=!!updated.mmId&&updated.mmId!==k.mmId;
                  const plan=arrives?kolbResetPlan(updated.mmId,"Moving this Kolb sends"):null;
                  if(arrives&&!plan) return false;
                  const mgValue=(updated.mgAdd||updated.experiments||"").trim();
                  setKolbs(p=>p.map(kb=>kb.id===k.id?{...kb,...updated}:kb));
                  if (updated.mmId!==k.mmId){
                    const hasNewMG=updated.mmId&&mmMap[updated.mmId]?.type==="2"&&mgValue;
                    const targetMM=hasNewMG?mmMap[updated.mmId]:null;
                    const affectedMmIds=new Set(mgChanges.filter(c=>c.kolbId===k.id&&c.mmId).map(c=>c.mmId));
                    if (k.mmId) affectedMmIds.add(k.mmId);
                    setMgChanges(p=>{
                      const moved=p.map(c=>c.kolbId===k.id?{...c,mmId:updated.mmId}:c);
                      return hasNewMG?[...moved,{id:nid(),mmId:updated.mmId,kolbId:k.id,oldMG:targetMM.currentMG||"(none)",newMG:mgValue,experiment:updated.experiments||"",date:k.date}]:moved;
                    });
                    if (hasNewMG) {
                      const movedChanges=mgChanges.filter(c=>c.kolbId===k.id&&c.mmId).map(c=>({...c,mmId:updated.mmId}));
                      const existingForTarget=mgChanges.filter(c=>c.mmId===updated.mmId&&c.kolbId!==k.id);
                      const allForTarget=[...existingForTarget,...movedChanges,{date:k.date,newMG:mgValue}].sort((a,b)=>b.date.localeCompare(a.date));
                      setMms(p=>p.map(m=>m.id===updated.mmId?{...m,currentMG:allForTarget[0].newMG}:m));
                    }
                    if (affectedMmIds.size){
                      setMms(p=>p.map(m=>{
                        if (!affectedMmIds.has(m.id)) return m;
                        const remaining=mgChanges.filter(c=>c.mmId===m.id&&c.kolbId!==k.id).sort((a,b)=>b.date.localeCompare(a.date));
                        if (m.id===k.mmId){
                          const remKolbs=kolbs.filter(kb=>kb.mmId===k.mmId&&kb.id!==k.id).sort((a,b)=>b.date.localeCompare(a.date));
                          return {...m,currentMG:remaining.length?remaining[0].newMG:"",rating:remKolbs.length&&remKolbs[0].level?Number(remKolbs[0].level):null};
                        }
                        return {...m,currentMG:remaining.length?remaining[0].newMG:""};
                      }));
                    }
                  } else if (updated.mmId&&mmMap[updated.mmId]?.type==="2"&&mgValue&&updated.mmId===k.mmId){
                    setMgChanges(p=>p.map(c=>c.kolbId===k.id?{...c,newMG:mgValue,experiment:updated.experiments||""}:c));
                    const mmChanges=mgChanges.filter(c=>c.mmId===updated.mmId).sort((a,b)=>b.date.localeCompare(a.date));
                    if (!mmChanges.length||mmChanges[0].kolbId===k.id)
                      setMms(p=>p.map(m=>m.id===updated.mmId?{...m,currentMG:mgValue}:m));
                  }
                  if (updated.mmId&&mmMap[updated.mmId]?.type==="2"&&updated.level){
                    setMms(p=>p.map(m=>m.id===updated.mmId?{...m,rating:Number(updated.level)}:m));
                  }
                  applyKolbReset(plan,k.id);
                  setSelectedKolbId(k.id);
                };
  const result = onSave(updated);
  return { result, state: H.next, prompts: H.prompts, used: H.used() };
}

// The module, driven the way both pages drive it: ask, then write.
function NEW_save(init, form, mmId, answer) {
  const S = clone(init);
  const prompts = [];
  const plan = K.resetPlan(S, mmId);
  const msg = K.resetPrompt(plan, 'Saving this Kolb sends');
  if (msg) { prompts.push(msg); if (answer === false) return { result: false, state: pick(S), prompts, used: 0 }; }
  let uid = START_ID;
  const out = K.withNewKolb(S, form, mmId, { mint: () => uid++, day: DAY, plan });
  return { result: undefined, state: pick(out), prompts, used: uid - START_ID, kolbId: out.kolbId };
}
function NEW_edit(init, kolbId, updated, answer) {
  const S = clone(init);
  const prompts = [];
  const k = K.findKolb(S.kolbs, kolbId);
  const arrives = !!updated.mmId && updated.mmId !== k.mmId;
  let plan = null;
  if (arrives) {
    plan = K.resetPlan(S, updated.mmId);
    const msg = K.resetPrompt(plan, 'Moving this Kolb sends');
    if (msg) { prompts.push(msg); if (answer === false) return { result: false, state: pick(S), prompts, used: 0 }; }
  }
  let uid = START_ID;
  const out = K.withKolbEdit(S, kolbId, updated, { mint: () => uid++, day: DAY, plan });
  return { result: undefined, state: pick(out), prompts, used: uid - START_ID };
}
const pick = s => ({ sessions: s.sessions, mms: s.mms, kolbs: s.kolbs, mgChanges: s.mgChanges, linChanges: s.linChanges });

function sameAsOriginal(a, b, label) {
  assert.deepEqual(b.prompts, a.prompts, label + ': the same prompt, word for word');
  assert.equal(b.result, a.result, label + ': the same return value');
  assert.deepEqual(b.state, a.state, label + ': the same five lists');
  assert.equal(b.used, a.used, label + ': the same number of ids minted');
}

const FORM = over => Object.assign({}, EMPTY_KOLB, over);

// ── 1. saveKolb ────────────────────────────────────────────────────────────

test('withNewKolb stores exactly what saveKolb stored, case by case', () => {
  const cases = [
    ['unlinked, blank', FORM(), null],
    ['unlinked, written', FORM({ experience: 'a walk', level: '4', experiments: 'go slower' }), null],
    ['Guitar at S3, MG and level: reset, MG change, currentMG, rating', FORM({ experience: 'gig', level: '5', experiments: 'x3', mgAdd: 'breathe' }), 10],
    ['Guitar, experiment only: the experiment becomes the MG', FORM({ experiments: 'count in' }), 10],
    ['Guitar, nothing to make an MG of, a level', FORM({ level: '6' }), 10],
    ['Piano at S1: no reset', FORM({ mgAdd: 'wrists loose', level: '2' }), 11],
    ['History, Declarative: no MG, no reset', FORM({ mgAdd: 'dates', level: '3' }), 13],
    ['a mind map that is gone', FORM({ mgAdd: 'nothing' }), 99],
    ['mmId as an empty string reads as none', FORM({ mgAdd: 'zero' }), '']
  ];
  for (const [label, form, mmId] of cases) {
    sameAsOriginal(ORIGINAL_save(SLOT(), form, mmId), NEW_save(SLOT(), form, mmId), label);
  }
});

test('a Procedural mind map still STORED in SIR asks first — accepting deletes its hidden sessions, Cancel writes nothing', () => {
  const form = FORM({ mgAdd: 'castle early', level: '5' });
  const yes = NEW_save(SLOT(), form, 12, true);
  sameAsOriginal(ORIGINAL_save(SLOT(), form, 12, true), yes, 'Chess, accepted');
  assert.equal(yes.prompts.length, 1);
  assert.match(yes.prompts[0], /^Saving this Kolb sends "Chess" back to S1\./);
  assert.match(yes.prompts[0], /stored as SIR, with 2 SIR sessions hidden/);
  assert.deepEqual(yes.state.sessions.map(s => s.id), [52], 'both of Chess\'s sessions went, History\'s stayed');
  assert.equal(yes.state.mms.find(m => m.id === 12).ksStage, '1');

  const no = NEW_save(SLOT(), form, 12, false);
  sameAsOriginal(ORIGINAL_save(SLOT(), form, 12, false), no, 'Chess, cancelled');
  assert.equal(no.result, false);
  assert.deepEqual(no.state, pick(SLOT()), 'Cancel: nothing at all changed');
});

test('the new Kolb takes the first id, the LIN record the next, the MG change the last', () => {
  const out = NEW_save(SLOT(), FORM({ mgAdd: 'breathe' }), 10);
  assert.equal(out.kolbId, START_ID);
  const k = out.state.kolbs[out.state.kolbs.length - 1];
  assert.deepEqual(k, Object.assign({ id: START_ID, mmId: 10 }, FORM({ mgAdd: 'breathe' }), { date: DAY }));
  const lin = out.state.linChanges[out.state.linChanges.length - 1];
  assert.deepEqual(lin, { id: START_ID + 1, title: DAY, date: DAY,
    items: [{ mmId: 10, change: { type: 'kolbReset', oldValue: '3', newValue: '1', kolbId: START_ID } }] });
  const mg = out.state.mgChanges[out.state.mgChanges.length - 1];
  assert.deepEqual(mg, { id: START_ID + 2, mmId: 10, kolbId: START_ID, oldMG: 'mg2', newMG: 'breathe', experiment: '', date: DAY });
});

test('withNewKolb never touches its input', () => {
  const S = SLOT();
  const before = clone(S);
  let n = 1;
  K.withNewKolb(S, FORM({ mgAdd: 'm', level: '7' }), 12, { mint: () => n++, day: DAY, plan: K.resetPlan(S, 12) });
  assert.deepEqual(S, before);
});

// ── 2. the edit view's onSave ──────────────────────────────────────────────

test('withKolbEdit stores exactly what the edit view stored, case by case', () => {
  const S = SLOT();
  const rec = id => clone(S.kolbs.find(k => k.id === id));
  const cases = [
    ['text only, unlinked', 101, Object.assign(rec(101), { experience: 'free, rewritten' })],
    ['the latest Kolb on Guitar: its MG change and currentMG follow', 102, Object.assign(rec(102), { mgAdd: 'mg2, sharper' })],
    ['an older Kolb on Guitar: its MG change follows, currentMG does not', 100, Object.assign(rec(100), { mgAdd: 'mg1, sharper' })],
    ['a level on Guitar sets its MG level', 100, Object.assign(rec(100), { level: '7' })],
    ['MG emptied: nothing follows', 102, Object.assign(rec(102), { mgAdd: '', experiments: '' })],
    ['moved Guitar → Piano: an arrival at S1, MG changes move, both mind maps recomputed', 102, Object.assign(rec(102), { mmId: 11 })],
    ['moved from none onto Guitar: an arrival past S1 resets it', 101, Object.assign(rec(101), { mmId: 10, mgAdd: 'new focus' })],
    ['unlinked from Guitar: its MG change leaves, Guitar falls back', 100, Object.assign(rec(100), { mmId: null })],
    ['moved onto History, Declarative', 102, Object.assign(rec(102), { mmId: 13 })],
    ['nothing changed at all', 102, rec(102)]
  ];
  for (const [label, id, updated] of cases) {
    sameAsOriginal(ORIGINAL_edit(SLOT(), id, clone(updated)), NEW_edit(SLOT(), id, clone(updated)), label);
  }
});

test('moving a Kolb with no MG change of its own still recomputes the mind map it leaves', () => {
  /* Every Kolb in SLOT that sits on a mind map also has an MG change there,
     and that change alone names the mind map. A level-only Kolb is named by
     nothing but its own mmId — the case that line exists for. */
  const seed = () => {
    const S = SLOT();
    S.kolbs.push(kolb(104, 10, '2026-10-07', { experience: 'level only', level: '6' }));
    S.mms[0].rating = 6;
    return S;
  };
  for (const to of [11, null]) {
    const updated = Object.assign(clone(seed().kolbs[3]), { mmId: to });
    const a = ORIGINAL_edit(seed(), 104, clone(updated));
    sameAsOriginal(a, NEW_edit(seed(), 104, clone(updated)), 'level-only Kolb moved to ' + to);
    assert.equal(a.state.mms.find(m => m.id === 10).rating, 3, 'Guitar falls back to its latest remaining Kolb\'s level');
  }
});

test('moving a Kolb onto a mind map stored in SIR asks first, in the move\'s words', () => {
  const updated = Object.assign(clone(SLOT().kolbs[1]), { mmId: 12, mgAdd: 'trade early' });
  const yes = NEW_edit(SLOT(), 101, clone(updated), true);
  sameAsOriginal(ORIGINAL_edit(SLOT(), 101, clone(updated), true), yes, 'onto Chess, accepted');
  assert.match(yes.prompts[0], /^Moving this Kolb sends "Chess" back to S1\./);
  const no = NEW_edit(SLOT(), 101, clone(updated), false);
  sameAsOriginal(ORIGINAL_edit(SLOT(), 101, clone(updated), false), no, 'onto Chess, cancelled');
  assert.deepEqual(no.state, pick(SLOT()));
});

test('an edit that changes nothing hands back the very lists — the widget writes nothing', () => {
  const S = SLOT();
  const out = K.withKolbEdit(S, 102, clone(S.kolbs[2]), { mint: () => { throw new Error('no id is needed'); }, day: DAY, plan: null });
  for (const key of K.STATE_KEYS) assert.equal(out[key], S[key], key + ' kept its identity');
  assert.deepEqual(K.changedKeys(S, out), {});
});

test('a text edit changes kolbs alone, and only the one record', () => {
  const S = SLOT();
  const out = K.withKolbEdit(S, 101, Object.assign(clone(S.kolbs[1]), { feelings: 'calm' }), { mint: () => 0, day: DAY, plan: null });
  assert.deepEqual(Object.keys(K.changedKeys(S, out)), ['kolbs']);
  assert.equal(out.kolbs[0], S.kolbs[0]);
  assert.equal(out.kolbs[2], S.kolbs[2]);
  assert.equal(out.kolbs[1].feelings, 'calm');
});

test('an unknown key on a Kolb survives an edit', () => {
  const S = SLOT();
  S.kolbs[1].futureKey = { keep: true };
  const out = K.withKolbEdit(S, 101, Object.assign(clone(S.kolbs[1]), { habits: 'rush' }), { mint: () => 0, day: DAY, plan: null });
  assert.deepEqual(out.kolbs[1].futureKey, { keep: true });
});

test('editing a Kolb that is not there changes nothing', () => {
  const S = SLOT();
  assert.equal(K.withKolbEdit(S, 999, { experience: 'x' }, { mint: () => 0, day: DAY, plan: null }), S);
  assert.equal(K.withKolbEdit(S, '102', { experience: 'x' }, { mint: () => 0, day: DAY, plan: null }), S,
    '102 is not "102" — a Kolb id is compared as stored');
});

// ── 3. the reset plan and its prompt ───────────────────────────────────────

test('resetPlan: who resets, and who asks', () => {
  const S = SLOT();
  assert.equal(K.resetPlan(S, 10).resets, true, 'Guitar at S3');
  assert.deepEqual(K.resetPlan(S, 10).hidden, []);
  assert.equal(K.resetPrompt(K.resetPlan(S, 10), 'Saving this Kolb sends'), null, 'nothing hidden — nothing to ask');
  assert.equal(K.resetPlan(S, 11).resets, false, 'Piano is already at S1');
  assert.equal(K.resetPlan(S, 13).resets, false, 'History is Declarative');
  assert.equal(K.resetPlan(S, 14).resets, false, 'an anchor');
  assert.equal(K.resetPlan(S, null).resets, false, 'no mind map');
  assert.equal(K.resetPlan(S, 99).resets, false, 'a mind map that is gone');
  const chess = K.resetPlan(S, 12);
  assert.equal(chess.resets, true);
  assert.equal(chess.fromStage, '4', 'Chess is SHOWN as S4 — the phase stageOf reads');
  assert.deepEqual(chess.hidden.map(s => s.id), [50, 51]);
});

test('resetPrompt says one session in the singular', () => {
  const S = SLOT();
  S.sessions = S.sessions.filter(s => s.id !== 51);
  assert.match(K.resetPrompt(K.resetPlan(S, 12), 'Saving this Kolb sends'),
    /with 1 SIR session hidden from every calendar\. Going back to S1 takes it out of SIR, which deletes that session\./);
});

// ── 4. ids ────────────────────────────────────────────────────────────────

// sir-ks02.html's _loadSlot, verbatim, before kolb-core.js.
function ORIGINAL_ceiling(slot) {
  let uid;
  const dumpLinks=(slot.sourceDumps||[]).flatMap(d=>[d,...(d.mmLinks||[]),...(d.mmLinks||[]).flatMap(l=>l.links||[])]);
  const allIds=[...(slot.sessions||[]),...(slot.mms||[]),...(slot.kolbs||[]),...(slot.mgChanges||[]),...(slot.linChanges||[]),...dumpLinks].map(x=>x.id).filter(id=>typeof id==="number");
  uid=allIds.length?Math.max(...allIds)+1:1;
  return uid;
}

test('nextNumericId is KS02\'s counter ceiling, source-dump links included, string ids skipped', () => {
  const slots = [
    {},
    SLOT(),
    Object.assign(SLOT(), { sourceDumps: [{ id: 'ts-1', mmLinks: [{ id: 'ts-2', links: [{ id: 'ts-3' }] }] }] }),
    Object.assign(SLOT(), { sourceDumps: [{ id: 30, mmLinks: [{ id: 31, links: [{ id: 950 }] }] }] }),
    { kolbs: [{ id: 'k-from-elsewhere' }], mgChanges: [{ id: 7 }] }
  ];
  for (const s of slots) assert.equal(K.nextNumericId(s), ORIGINAL_ceiling(s), JSON.stringify(s).slice(0, 60));
  assert.equal(K.nextNumericId(slots[3]), 951);
});

test('DELIBERATE DIFFERENCE: a NaN id no longer poisons the counter', () => {
  const s = { kolbs: [{ id: NaN }, { id: 5 }] };
  assert.ok(Number.isNaN(ORIGINAL_ceiling(s)), 'the original counter became NaN for good');
  assert.equal(K.nextNumericId(s), 6);
});

// ── 5. reading Kolbs ──────────────────────────────────────────────────────

test('byNewest: by day, then the one stored later first; junk dates last; never throws', () => {
  const list = [
    { id: 1, date: '2026-10-01' }, { id: 2, date: '2026-10-05' }, { id: 3 }, null,
    { id: 4, date: '2026-10-05' }, { id: 5, date: 7 }, { id: 6, date: '2026-11-01' }
  ];
  assert.deepEqual(K.byNewest(list).map(k => k.id), [6, 4, 2, 1, 5, 3]);
  assert.deepEqual(K.byNewest('nope'), []);
});

// The Kolb form's step-4 line, verbatim.
const ORIGINAL_latest = (kolbs, mmId) => { const relevantKolbs=kolbs?(mmId?kolbs.filter(k=>k.mmId===mmId):kolbs):[]; return [...relevantKolbs].sort((a,b)=>b.id-a.id)[0]?.experiments||""; };

test('latestExperiment is the Kolb form\'s own choice', () => {
  const kolbs = SLOT().kolbs.concat([{ id: 103, mmId: 11, experiments: 'piano x' }, { id: 99, mmId: 10, experiments: 'old' }]);
  for (const mmId of [10, 11, 13, null, '']) assert.equal(K.latestExperiment(kolbs, mmId), ORIGINAL_latest(kolbs, mmId), String(mmId));
  assert.equal(K.latestExperiment(kolbs, 10), 'x2');
  assert.equal(K.latestExperiment(kolbs, null), 'piano x');
});

test('formOf: every EMPTY key, normalised, and nothing a save sets itself', () => {
  assert.deepEqual(K.formOf(null), EMPTY_KOLB);
  assert.deepEqual(K.EMPTY, EMPTY_KOLB, 'the module\'s EMPTY is the Knowledge Record\'s EMPTY_KOLB');
  const f = K.formOf({ id: 4, mmId: 10, date: 'x', createdAt: 1, experience: 'e', level: 5, isReflectingOnPrev: 'yes', mgLookLike: 'old', sequence: 42 });
  assert.deepEqual(Object.keys(f), Object.keys(EMPTY_KOLB));
  assert.equal(f.level, '5');
  assert.equal(f.isReflectingOnPrev, false, 'only true is true');
  assert.equal(f.sequence, '42');
  assert.equal(f.mgLookLike, 'old', 'the legacy field is carried, not edited');
  assert.equal(K.formOf({ level: '11' }).level, '', 'a level outside 1–10 reads as none');
});

test('levelFor: a chosen mind map\'s MG level, or none', () => {
  assert.equal(K.levelFor({ rating: 4 }), '4');
  assert.equal(K.levelFor({ rating: null }), '');
  assert.equal(K.levelFor(null), '');
});

test('linkable: Procedural mind maps, as KS02\'s type2mms', () => {
  assert.deepEqual(K.linkable(SLOT().mms).map(m => m.id), [10, 11, 12]);
  assert.deepEqual(K.linkable(null), []);
});

// ── 6. drafts ─────────────────────────────────────────────────────────────

const NOW = 1762300000000;

test('a new draft is stored only once something is written', () => {
  const empty = [];
  const r0 = K.withDraft(empty, 'd-1', { experience: '' }, NOW, true);
  assert.equal(r0.list, empty, 'nothing written — nothing stored');
  assert.equal(r0.found, true, 'and that is not "missing"');
  const r1 = K.withDraft(empty, 'd-1', { experience: 'it went badly' }, NOW, true);
  assert.deepEqual(r1.list, [{ id: 'd-1', createdAt: NOW, updatedAt: NOW, experience: 'it went badly' }]);
});

test('without `create`, a missing draft is never brought back', () => {
  const list = [{ id: 'd-2', createdAt: NOW, updatedAt: NOW, experience: 'x' }];
  const r = K.withDraft(list, 'd-1', { experience: 'late keystrokes' }, NOW + 1, false);
  assert.equal(r.found, false);
  assert.equal(r.list, list);
});

test('a draft stores only what is written: emptying a field DELETES its key', () => {
  let list = K.withDraft([], 'd-1', { experience: 'e', level: '4', isReflectingOnPrev: true }, NOW, true).list;
  assert.deepEqual(list[0], { id: 'd-1', createdAt: NOW, updatedAt: NOW, experience: 'e', level: '4', isReflectingOnPrev: true });
  list = K.withDraft(list, 'd-1', { level: '', isReflectingOnPrev: false, experience: '' , feelings: 'tense' }, NOW + 5).list;
  assert.deepEqual(list[0], { id: 'd-1', createdAt: NOW, updatedAt: NOW + 5, feelings: 'tense' });
});

test('a draft\'s mind map: set and cleared by key, ids of either type', () => {
  let list = K.withDraft([], 'd-1', { mmId: 10 }, NOW, true).list;
  assert.deepEqual(list[0], { id: 'd-1', createdAt: NOW, updatedAt: NOW, mmId: 10 }, 'a link alone is something written');
  list = K.withDraft(list, 'd-1', { mmId: 'm-str' }, NOW + 1).list;
  assert.equal(list[0].mmId, 'm-str');
  list = K.withDraft(list, 'd-1', { mmId: null }, NOW + 2).list;
  assert.equal(Object.prototype.hasOwnProperty.call(list[0], 'mmId'), false, 'no mind map is an absence');
});

test('a patch that changes nothing returns the very list, updatedAt untouched', () => {
  const list = [{ id: 'd-1', createdAt: NOW, updatedAt: NOW, experience: 'e' }];
  const r = K.withDraft(list, 'd-1', { experience: 'e', level: '', id: 'other', createdAt: 0, junk: 1 }, NOW + 9);
  assert.equal(r.list, list, 'id, createdAt and unknown keys are not a draft\'s to patch');
});

test('a draft\'s unknown key survives a patch', () => {
  const list = [{ id: 'd-1', createdAt: NOW, updatedAt: NOW, experience: 'e', futureKey: 3 }];
  assert.equal(K.withDraft(list, 'd-1', { habits: 'h' }, NOW + 1).list[0].futureKey, 3);
});

test('withoutDraft removes one draft, and returns the input when it is absent', () => {
  const list = [{ id: 'd-1' }, { id: 'd-2' }];
  assert.deepEqual(K.withoutDraft(list, 'd-1'), [{ id: 'd-2' }]);
  assert.equal(K.withoutDraft(list, 'd-9'), list);
});

test('draftIsBlank: nothing written and no mind map', () => {
  assert.equal(K.draftIsBlank({ id: 'd', createdAt: 1 }), true);
  assert.equal(K.draftIsBlank({ id: 'd', level: '3' }), false);
  assert.equal(K.draftIsBlank({ id: 'd', mmId: 10 }), false);
  assert.equal(K.draftIsBlank({ id: 'd', isReflectingOnPrev: false, experience: '' }), true);
  assert.equal(K.draftIsBlank(null), true);
});

test('draftsByNewest: last edited first', () => {
  const list = [{ id: 'a', updatedAt: 5 }, { id: 'b', updatedAt: 9 }, { id: 'c', createdAt: 7 }, 'junk'];
  assert.deepEqual(K.draftsByNewest(list).map(d => d.id), ['b', 'c', 'a']);
});

test('a finished draft becomes a Kolb through withNewKolb, with every EMPTY key', () => {
  const draft = { id: 'd-1', createdAt: NOW, updatedAt: NOW, mmId: 11, experience: 'scales', mgAdd: 'wrists', level: '3' };
  const S = SLOT();
  let n = K.nextNumericId(S);
  const out = K.withNewKolb(S, K.formOf(draft), draft.mmId, { mint: () => n++, day: DAY, plan: K.resetPlan(S, 11) });
  const k = out.kolbs[out.kolbs.length - 1];
  assert.deepEqual(Object.keys(k), ['id', 'mmId'].concat(Object.keys(EMPTY_KOLB), ['date']));
  assert.equal(k.id, 301, 'one past the highest stored id (the LIN record\'s 300)');
  assert.equal(out.mms.find(m => m.id === 11).currentMG, 'wrists');
  assert.equal(out.mms.find(m => m.id === 11).rating, 3);
});

// ── 7. totality ───────────────────────────────────────────────────────────

test('junk never throws', () => {
  const junk = [null, undefined, 42, 'x', [], {}, [null, 3, 'y'], { kolbs: 'no', mms: 5, sessions: null }];
  for (const j of junk) {
    K.byNewest(j); K.kolbsOf(j); K.draftsOf(j); K.draftsByNewest(j); K.nextNumericId(j);
    K.withoutDraft(j, 'd'); K.withDraft(j, 'd', { experience: 'x' }, NOW, true);
    K.resetPlan(j, 10); K.stateOf(j); K.formOf(j); K.latestExperiment(j, 10); K.linkable(j);
    const S = K.stateOf(j);
    K.withKolbEdit(S, 1, { experience: 'x' }, { mint: () => 1, day: DAY, plan: null });
    K.withNewKolb(S, j, null, { mint: () => 1, day: DAY, plan: null });
  }
});

// ── 8. structure ──────────────────────────────────────────────────────────

test('STRUCTURE: kolb-core.js constructs no Date and mints no id', () => {
  const code = fs.readFileSync(SRC, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.equal(/\bDate\b/.test(code), false, 'no Date — the day is a parameter');
  assert.equal(/Math\.random|newId|\bnid\s*\(/.test(code), false, 'no id minting — a writer calls the mint it is handed');
  assert.equal(/localStorage|track_db/.test(code), false, 'no storage');
});
