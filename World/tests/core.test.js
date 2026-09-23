'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Core=require('../scripts/demo-core');
const context=vm.createContext({window:{},Date,console});
for(const file of ['schema.js','calendar-core.js','quest-core.js']) vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../scripts',file),'utf8'),context);
const {TrackSchema:Schema,TrackCalendar:Cal,TrackQuest:Quest}=context.window;
const plain=value=>JSON.parse(JSON.stringify(value));

test('synthetic fixture uses canonical shape and preserves calendar meanings without mutation',()=>{
  const slot=Core.fixture(Schema,Cal,'2026-09-06'),before=JSON.stringify(slot);
  assert.equal(Schema.validateSlot(slot).ok,true,JSON.stringify(Schema.validateSlot(slot).errors));
  assert.equal(slot.notes[0].topic,'On noticing','notebook topics use Track’s actual field');
  assert.ok(slot.mms.every(mm=>['anchor','1','2'].includes(mm.type)),'MM types are separate from stages and activity names');
  const today=Cal.buildDaySchedule(slot,'2026-09-06');
  assert.equal(today.calNotes.length,3);
  const note=today.calNotes.find(n=>n.id==='note-untimed');
  assert.equal(Cal.noteTimed(note),false);
  assert.equal(today.blocks.find(b=>b.id===note.id).time,'08:00');
  assert.ok(!today.blocks.some(b=>b.id==='note-off'));
  assert.deepEqual(plain(today.deadlinesCaution.map(d=>d.id)),['deadline-folio']);
  assert.equal(Cal.buildDaySchedule(slot,'2026-09-07').deadlinesCaution.length,0,'the gap is not a caution day');
  assert.equal(Cal.buildDaySchedule(slot,'2026-09-08').deadlinesCaution.length,1);
  assert.equal(Cal.buildDaySchedule(slot,'2026-09-09').deadlinesCaution.length,0,'due day never warns');
  assert.equal(today.deadlines[0].done,true);
  const onDay=slot.sessions.filter(s=>s.date==='2026-09-06');
  assert.equal(onDay.filter(s=>s.skipped).length,1,'the fixture seeds exactly one skipped review on the day');
  assert.equal(today.sir.length,onDay.length-1,'skipped review stays excluded');
  assert.equal(today.refBlocks.length,1);
  assert.equal(today.refBlocks[0].detail,'Reference only · North terrace');
  assert.equal(today.mgCarried,true);
  assert.equal(JSON.stringify(slot),before);
});

test('fixture inherits canonical date shifts over leap/month/year boundaries',()=>{
  const leap=Core.fixture(Schema,Cal,'2024-02-28');
  assert.equal(leap.sessions.find(s=>s.id==='review-next').date,'2024-02-29');
  assert.equal(leap.deadlines.find(d=>d.id==='deadline-folio').date,'2024-03-02');
  const year=Core.fixture(Schema,Cal,'2026-12-31');
  assert.equal(year.sessions.find(s=>s.id==='review-next').date,'2027-01-01');
});

test('weather turns gradually and wet surfaces outlast rain',()=>{
  let state=Core.initialEnvironment();
  state=Core.advanceEnvironment(state,{rain:true,night:true},.1);
  assert.ok(state.rain>0&&state.rain<.1);
  for(let i=0;i<600;i++)state=Core.advanceEnvironment(state,{rain:true,night:true},1/60);
  assert.ok(state.rain>.98&&state.wetness>.9&&state.night>.9);
  for(let i=0;i<600;i++)state=Core.advanceEnvironment(state,{rain:false,night:false},1/60);
  assert.ok(state.rain<.01&&state.wetness>.5,'drying is slower than clearing');
  assert.deepEqual(Core.advanceEnvironment(state,{rain:false},NaN),state);
});

test('fantasy weather transitions share bounded precipitation, coverage and light state',()=>{
  let state=Core.initialEnvironment();
  for(let i=0;i<1200;i++)state=Core.advanceEnvironment(state,{weather:'snow'},1/60);
  assert.ok(state.snow>.99&&state.snowCover>.2&&state.rain<.01);
  const covered=state.snowCover;
  for(let i=0;i<1200;i++)state=Core.advanceEnvironment(state,{weather:'storm'},1/60);
  assert.ok(state.rain>.99&&state.storm>.99&&state.snow<.01&&state.snowCover<covered);
  assert.ok(state.wetness>.8&&state.wind>1);
  for(let i=0;i<1200;i++)state=Core.advanceEnvironment(state,{weather:'heavenly',night:true},1/60);
  assert.ok(state.halo>.99&&state.rain<.01&&state.storm<.01&&state.night>.99);
  for(const value of Object.values(state))assert.ok(Number.isFinite(value));
});

test('local clock follows midnight without mutating data; tomorrow preview requires a note, warning or deadline',()=>{
  const slot=Core.fixture(Schema,Cal,'2026-12-31'),before=JSON.stringify(slot);
  assert.deepEqual(Core.clockState('2026-12-31','local',new Date(2027,0,1,0,2),Cal),{day:'2027-01-01',time:'00:02'});
  assert.deepEqual(Core.clockState('2026-12-31','preview',new Date(2027,0,1),Cal),{day:'2026-12-31',time:'20:10'});
  const empty=Schema.createEmptySlot({id:'empty',name:'Empty'});
  empty.sessions=[{id:'review',mmId:1,date:'2027-01-01',done:false}];
  assert.equal(Core.tomorrowPreview(empty,Cal,'2026-12-31','20:10'),null,'reviews alone cannot widen the chosen preview trigger');
  empty.calendarNotes=[{id:'next-note',date:'2027-01-01',title:'Tomorrow'}];
  assert.equal(Core.tomorrowPreview(empty,Cal,'2026-12-31','19:59'),null);
  assert.equal(Core.tomorrowPreview(empty,Cal,'2026-12-31','20:00').date,'2027-01-01');
  assert.equal(JSON.stringify(slot),before);
});

test('fixed steps match at 30/60/120 fps and cap resume catch-up',()=>{
  for(const fps of [30,60,120]) {
    let distance=0;
    const sim=Core.stepper(dt=>distance+=3.5*dt);
    for(let frame=0;frame<fps*2;frame++)sim.advance(1/fps);
    assert.ok(Math.abs(distance-7)<1e-8);
    assert.equal(sim.advance(30),6);
    sim.reset();assert.equal(sim.advance(0),0);
  }
});

test('render interpolation fills the frames between fixed simulation steps',()=>{
  let previous=0,current=0;
  const sim=Core.stepper(dt=>{previous=current;current+=3.5*dt;});
  const frames=[];
  for(let frame=0;frame<16;frame++){
    sim.advance(1/120);frames.push(previous+(current-previous)*sim.alpha);
    assert.ok(sim.alpha>=0&&sim.alpha<1);
  }
  for(let i=2;i<frames.length;i++)assert.ok(Math.abs(frames[i]-frames[i-1]-3.5/120)<1e-10,'120 Hz rendering advances even between 60 Hz simulation ticks');
  sim.reset();assert.equal(sim.alpha,0);
  sim.advance(30);assert.ok(sim.alpha>=0&&sim.alpha<1,'resume never extrapolates beyond collision');
});

test('demo source has no storage or network plumbing and only loads four pure Track helpers',()=>{
  const files=['demo-core.js','flight-core.js','character-motion.js','character-animation.js','character-rig.js','sky-core.js','sky-view.js','sky-scene.js','map-core.js','map-view.js','scene.js','app.js'];
  for(const file of files) {
    const source=fs.readFileSync(path.resolve(__dirname,'../scripts',file),'utf8');
    assert.doesNotMatch(source,/\b(localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest|WebSocket|sendBeacon)\b/,file);
  }
  const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
  assert.deepEqual([...html.matchAll(/src="\/track-core\/([^?]+)\?v=\d+"/g)].map(m=>m[1]),['schema.js','calendar-core.js','quest-core.js','graph-layout.js']);
  assert.doesNotMatch(html,/firebase|storage-guard|https?:/);
  assert.ok(html.indexOf('storage-isolation.js')<html.indexOf('babylon.js'));
});

test('Quest fixture exercises saved order, promoted children, missing numeric MMs and parent rollup',()=>{
  const slot=Core.fixture(Schema,Cal,'2026-09-08'),before=JSON.stringify(slot);
  const tree=Quest.questTree(slot.goals,slot.mms),stars=Quest.starRollup(slot.goals,slot.mms);
  assert.deepEqual(plain(tree.map(e=>e.node.id)),['goal-journal','goal-water']);
  assert.equal(tree[0].quest,false,'ancestor is context only');
  assert.deepEqual(plain(tree[0].children.map(e=>e.node.id)),['task-pack','task-observe','task-cloud']);
  assert.equal(tree[0].learn[0].mm.id,103,'numeric linked MM resolves');
  assert.equal(tree[1].learn[1].mm,null,'missing MM stays visible');
  assert.deepEqual(plain(stars.map(e=>[e.kind,e.node.id,e.count])),[
    ['learn','goal-journal',1],['node','task-observe',1],['node','goal-water',5]
  ]);
  assert.equal(JSON.stringify(slot),before);
});

test('storage isolation absorbs the engine probe without reading the native storage getter',()=>{
  const win={};
  Object.defineProperty(win,'localStorage',{get(){throw new Error('Native storage must never be obtained');},configurable:true});
  const context=vm.createContext({window:win,Map,Object,Error,String});
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../scripts/storage-isolation.js'),'utf8'),context);
  win.localStorage.setItem('test','');assert.equal(win.localStorage.getItem('test'),'');
  win.localStorage.removeItem('test');assert.equal(win.localStorage.length,0);
  assert.throws(()=>win.localStorage.getItem('track_db'),/outside this synthetic demo/);
  assert.throws(()=>win.indexedDB,/Persistent databases/);
});
