'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Sky=require('../scripts/sky-core'),Core=require('../scripts/demo-core');
const context=vm.createContext({window:{},Date});
for(const file of ['schema.js','calendar-core.js','graph-layout.js'])vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../scripts',file),'utf8'),context);
const {TrackSchema:Schema,TrackCalendar:Cal,TrackGraphLayout:Layout}=context.window;
test('the sky preserves the full KS03 arrangement, manual positions, colors and canonical reviews',()=>{
  const slot=Core.fixture(Schema,Cal,'2026-09-09'),before=JSON.stringify(slot),auto=Layout.computeLayerLayout(slot.mms);
  const sky=Sky.project(slot,Layout,Cal,'2026-09-09');
  assert.equal(sky.nodes.length,slot.mms.length);
  for(const node of sky.nodes) {
    const mm=slot.mms.find(m=>m.id===node.id),pos=slot.pos[node.id]||auto[node.id];
    assert.deepEqual([node.x,node.y,node.color],[pos.x,pos.y,mm.customColor]);
  }
  assert.deepEqual(sky.edges,[{from:101,to:102},{from:101,to:103}]);
  assert.deepEqual(sky.nodes.map(n=>[n.id,n.pending,n.reviewed]),[[101,0,0],[102,0,1],[103,1,0]]);
  assert.ok(sky.nodes[0].radius>sky.nodes[1].radius);
  assert.equal(Sky.project(slot,Layout,Cal,'2026-09-10').nodes[0].pending,1);
  assert.equal(JSON.stringify(slot),before);
});
test('review petals follow Track’s finished-day and skipped rules, not the scheduled day',()=>{
  const slot={mms:[{id:1,name:'A',type:'1'}],sessions:[
    {mmId:1,date:'2026-09-08',done:true,finishDate:'2026-09-09'},
    {mmId:1,date:'2026-09-09',skipped:true},
    {mmId:1,date:'2026-09-09',done:true,finishDate:'2026-09-10'}]};
  const node=Sky.project(slot,Layout,Cal,'2026-09-09').nodes[0];
  assert.deepEqual([node.pending,node.reviewed],[0,1]);
  assert.equal(node.color,'#ef4444');
});
test('shared parents, cycles and disconnected nodes keep one star per MM and bounded sizes',()=>{
  const slot={mms:[{id:1,parentIds:[2]},{id:2,parentIds:[1]},{id:3,parentIds:[1,2]},{id:4,parentIds:[3]},{id:5,parentIds:[999]}]};
  const sky=Sky.project(slot,Layout,Cal,'2026-09-09');
  assert.deepEqual(sky.nodes.map(n=>n.depth),[0,0,1,2,0]);
  assert.equal(sky.nodes[0].radius,sky.nodes[1].radius);
  assert.ok(sky.nodes[2].radius>sky.nodes[3].radius);
  assert.equal(sky.edges.length,5);
  assert.ok(sky.nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)&&n.radius>=10));
  assert.equal(Sky.project({mms:[]},Layout,Cal,'2026-09-09').nodes.length,0);
});
