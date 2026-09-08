'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Core=require('../scripts/demo-core');
const context=vm.createContext({window:{},Date,console});
for(const file of ['schema.js','calendar-core.js']) vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../scripts',file),'utf8'),context);
const {TrackSchema:Schema,TrackCalendar:Cal}=context.window;
const plain=value=>JSON.parse(JSON.stringify(value));

test('synthetic fixture uses canonical shape and preserves calendar meanings without mutation',()=>{
  const slot=Core.fixture(Schema,Cal,'2026-09-06'),before=JSON.stringify(slot);
  assert.equal(Schema.validateSlot(slot).ok,true,JSON.stringify(Schema.validateSlot(slot).errors));
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
  assert.equal(today.sir.length,2,'skipped review stays excluded');
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

test('demo source has no storage or network plumbing and only loads two pure Track helpers',()=>{
  const files=['demo-core.js','scene.js','app.js'];
  for(const file of files) {
    const source=fs.readFileSync(path.resolve(__dirname,'../scripts',file),'utf8');
    assert.doesNotMatch(source,/\b(localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest|WebSocket|sendBeacon)\b/,file);
  }
  const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
  assert.deepEqual([...html.matchAll(/src="\/track-core\/([^?]+)\?v=\d+"/g)].map(m=>m[1]),['schema.js','calendar-core.js']);
  assert.doesNotMatch(html,/firebase|storage-guard|https?:/);
  assert.ok(html.indexOf('storage-isolation.js')<html.indexOf('babylon.js'));
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
