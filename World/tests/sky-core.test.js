'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Sky=require('../scripts/sky-core'),Core=require('../scripts/demo-core');
const Motion=require('../scripts/sky-motion');
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
  // Every resolvable parentId becomes one edge, de-duplicated, with dangling
  // parents dropped. Computed independently of project() so it stays an oracle.
  const known=new Set(slot.mms.map(mm=>mm.id));
  assert.deepEqual(sky.edges,slot.mms.flatMap(mm=>[...new Set(mm.parentIds||[])].filter(id=>known.has(id)).map(id=>({from:id,to:mm.id}))));
  assert.deepEqual(sky.edges.filter(e=>known.has(e.from)&&[101,102,103].includes(e.to)&&[101,102,103].includes(e.from)),
    [{from:101,to:102},{from:101,to:103}],'the canonical three-MM arrangement is unchanged by the denser network');
  const cues=new Map(sky.nodes.map(n=>[n.id,[n.pending,n.reviewed]]));
  for(const [id,expected] of [[101,[0,0]],[102,[0,1]],[103,[1,0]],[110,[1,0]],[115,[0,1]],[131,[1,0]],[150,[1,0]],[163,[0,1]]])
    assert.deepEqual(cues.get(id),expected,'review cues for MM '+id);
  assert.equal(sky.nodes.filter(n=>cues.get(n.id).some(Boolean)).length,7,'only the seven MMs with a session today claim a petal');
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
test('the spherical display spans the chosen 40 degrees without altering KS03 or manual overrides',()=>{
  const slot=Core.fixture(Schema,Cal,'2026-09-09'),before=JSON.stringify(slot),sky=Sky.project(slot,Layout,Cal,'2026-09-09');
  const original=JSON.stringify(sky),b=sky.bounds,cy=b.y+b.height/2;
  const left=Motion.direction(b.x,cy,b),right=Motion.direction(b.x+b.width,cy,b);
  const angle=Math.acos(left.reduce((sum,v,i)=>sum+v*right[i],0));
  assert.ok(Math.abs(angle-40*Math.PI/180)<1e-12);
  for(const node of sky.nodes)assert.ok(Math.abs(Math.hypot(...Motion.direction(node.x,node.y,b))-1)<1e-12);
  assert.deepEqual(sky.nodes.filter(n=>n.id===103).map(n=>[n.x,n.y]),[[510,70]]);
  assert.equal(JSON.stringify(sky),original);assert.equal(JSON.stringify(slot),before);
});
test('direct drag keeps the grabbed sky ray under the pointer at both fit and zoom',()=>{
  const bounds={x:216,y:4,width:605,height:441},viewport={x:54,y:276,width:1172,height:367,screenWidth:1280,screenHeight:800};
  for(const zoom of [1,.25]) {
    const view={...bounds,width:bounds.width*zoom,height:bounds.height*zoom,rotation:Motion.identity()};
    const from={x:640,y:400},to={x:840,y:450},optics=Motion.optics(view,bounds,viewport);
    const source=Motion.apply([-optics.framing[0],-optics.framing[1],-optics.framing[2],optics.framing[3]],optics.ray(from.x,from.y));
    const moved=Motion.drag(view,bounds,viewport,from,to);
    const ray=Motion.apply(Motion.multiply(optics.framing,moved.rotation),source);
    assert.ok(Math.abs(640+optics.focal*ray[0]/ray[1]-to.x)<1e-9);
    assert.ok(Math.abs(400+optics.focal*ray[2]/ray[1]-to.y)<1e-9);
    assert.deepEqual(view.rotation,[0,0,0,1]);
  }
});
test('held arrows turn 20 degrees per second on a sphere and can recover any selected identity',()=>{
  const sky=Sky.project(Core.fixture(Schema,Cal,'2026-09-09'),Layout,Cal,'2026-09-09'),bounds=sky.bounds;
  const viewport={x:54,y:276,width:1172,height:367,screenWidth:1280,screenHeight:800};
  const initial={...bounds,rotation:Motion.identity()};
  const moved=Motion.arrows(initial,bounds,viewport,1,0,1);
  assert.ok(Math.abs(2*Math.acos(moved.rotation[3])-20*Math.PI/180)<1e-12);
  let around=initial;
  for(let i=0;i<180;i++)around=Motion.arrows(around,bounds,viewport,1,0,.1);
  assert.ok(Math.abs(Math.abs(around.rotation[3])-1)<1e-12,'18 seconds makes a full revolution without clamping');
  for(const node of sky.nodes) {
    const focused=Motion.focus(Motion.arrows(initial,bounds,viewport,1,0,9),node,bounds);
    const ray=Motion.apply(focused.rotation,Motion.direction(node.x,node.y,bounds));
    assert.ok(ray[1]>.9,'focus restores each star to the front of the sky');
  }
  assert.deepEqual(initial.rotation,[0,0,0,1]);
});
