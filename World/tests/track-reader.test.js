'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Reader=require('../scripts/track-reader'),Core=require('../scripts/demo-core'),Sky=require('../scripts/sky-core');
const context=vm.createContext({window:{},Date});
for(const name of ['schema','calendar-core','graph-layout'])vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../scripts/'+name+'.js'),'utf8'),context);
const {TrackSchema:Schema,TrackCalendar:Cal,TrackGraphLayout:Layout}=context.window;
const plain=value=>JSON.parse(JSON.stringify(value));
const fixture=()=>Core.fixture(Schema,Cal,'2026-12-31');

test('Home single-slot JSON becomes an immutable memory snapshot with identities and unknown keys intact',()=>{
  const raw=fixture();raw.futureField={keep:['all',42]};raw.mms[0].futureMM={keep:true};
  const text=JSON.stringify(raw),result=Reader.parse(text,Schema);
  assert.equal(result.ok,true);assert.equal(result.warnings,0);
  assert.equal(JSON.stringify(result.slot),text);assert.deepEqual(plain(result.slot),plain(raw));
  assert.ok(Object.isFrozen(result.slot.mms[0].futureMM));
  assert.throws(()=>{result.slot.mms[0].name='changed';},TypeError);
  assert.throws(()=>result.slot.calendarNotes.push({}),TypeError);
  assert.equal(JSON.stringify(raw),text);
});
test('the complete day matches Track before and after loading, including moved/split prep and routine occurrences',()=>{
  const raw=fixture();
  raw.calendarNotes.push({id:'split',title:'On another day',date:'2027-01-01',parts:[{id:'one',title:'Placed earlier',date:'2026-12-31',time:'12:40',blockDuration:25}]});
  raw.goals.push({id:'routine',title:'Practice',taskType:'routine',routineDates:{'2026-12-31':{time:'11:15',duration:35,done:true}}});
  raw.deadlines.push({id:'prep',title:'Submit',date:'2027-01-03',time:'16:30',cautionDates:['2026-12-31','2027-01-02'],blockDate:'2026-12-31',blockTime:'15:00',blockDuration:45});
  const before=JSON.stringify(raw),loaded=Reader.parse(before,Schema).slot;
  for(const ds of ['2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']){
    const date=new Date(ds+'T12:00:00'),view=Reader.day(loaded,Cal,ds);
    assert.deepEqual(plain(view.schedule),plain(Cal.buildDaySchedule(raw,ds)));
    assert.deepEqual(plain(view.buckets),plain(Cal.buildBuckets(raw,date.getFullYear(),date.getMonth())[ds]||{}));
    assert.deepEqual(plain(view.milestones),plain(Cal.buildMilestoneLanes(raw,date.getFullYear(),date.getMonth()).lanesByDate[ds]||[]));
  }
  assert.equal(JSON.stringify(loaded),before);
});
test('the sky matches Track auto/manual coordinates, identity, color and review-day rules after loading',()=>{
  const raw=fixture();raw.mms[1].customColor=undefined;
  raw.sessions.push({id:'late-finish',mmId:101,date:'2026-12-30',done:true,finishDate:'2026-12-31'});
  const bytes=JSON.stringify(raw),loaded=Reader.parse(bytes,Schema).slot;
  assert.deepEqual(Sky.project(loaded,Layout,Cal,'2026-12-31'),Sky.project(raw,Layout,Cal,'2026-12-31'));
  assert.equal(JSON.stringify(loaded),bytes);
});
test('missing optional fields and null defaults are readable, with no stored migration',()=>{
  const raw={id:'legacy',name:'Legacy',mms:null,notes:null,future:{x:1}},bytes=JSON.stringify(raw);
  const result=Reader.parse(bytes,Schema);assert.equal(result.ok,true);
  assert.deepEqual(plain(result.slot.mms),[]);assert.deepEqual(plain(Reader.day(result.slot,Cal,'2026-12-31').schedule.blocks),[]);
  assert.equal(JSON.stringify(raw),bytes);assert.deepEqual(result.slot.future,{x:1});
});
test('wrong files, damaged structures and ambiguous MM identities are refused without echoing file text',()=>{
  for(const value of [null,[],{},42,{slots:[fixture()]},{id:'x',mms:[null]},{id:'x',goals:[{children:[null]}]},
    {id:'x',mms:[{id:1},{id:'1'}]},{id:'x',mms:[{name:'Missing identity'}]},{id:'x',mgSchedule:{'2026-12-31':'not a list'}}])
    assert.equal(Reader.parse(JSON.stringify(value),Schema).ok,false,JSON.stringify(value));
  const bad=Reader.parse('synthetic private-looking text',Schema);
  assert.equal(bad.ok,false);assert.doesNotMatch(bad.message,/private-looking/);
});
test('canonical warning records remain visible and unchanged; warnings are reported',()=>{
  const raw=fixture();raw.deadlines[0].cautionDates=['not-a-day'];const bytes=JSON.stringify(raw);
  const result=Reader.parse(bytes,Schema);assert.equal(result.ok,true);assert.ok(result.warnings>0);
  assert.equal(JSON.stringify(result.slot),bytes);assert.doesNotThrow(()=>Reader.day(result.slot,Cal,'2026-12-31'));
});
test('empty workspaces stay empty instead of falling back to demo',()=>{
  const result=Reader.parse(JSON.stringify(Schema.createEmptySlot({id:'empty',name:'Empty'})),Schema);
  assert.equal(result.ok,true);assert.equal(Reader.day(result.slot,Cal,'2026-12-31').schedule.blocks.length,0);
  assert.equal(Sky.project(result.slot,Layout,Cal,'2026-12-31').nodes.length,0);
});
test('file views follow local midnight, month/year rollover and do not move unfinished records',()=>{
  const raw=fixture(),slot=Reader.parse(JSON.stringify(raw),Schema).slot,before=JSON.stringify(slot);
  const late=Core.clockState('2026-12-31','local',new Date(2026,11,31,23,59),Cal);
  const early=Core.clockState('2026-12-31','local',new Date(2027,0,1,0,1),Cal);
  assert.equal(late.day,'2026-12-31');assert.equal(early.day,'2027-01-01');
  assert.ok(Reader.day(slot,Cal,late.day).schedule.calNotes.some(n=>n.id==='note-untimed'));
  assert.ok(!Reader.day(slot,Cal,early.day).schedule.calNotes.some(n=>n.id==='note-untimed'));
  assert.equal(JSON.stringify(slot),before);
});
test('reader has no storage, network, logging, or command boundary',()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../scripts/track-reader.js'),'utf8').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g,'');
  assert.doesNotMatch(source,/\b(localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest|WebSocket|sendBeacon|console|saveDB|normalizeSlot)\b/);
  assert.equal(Reader.parse('\ufeff'+JSON.stringify({id:'bom'}),Schema).ok,true);
});
