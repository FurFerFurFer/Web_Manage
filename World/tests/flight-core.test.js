'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Flight=require('../scripts/flight-core');

test('ground starts, reversals and braking stay responsive at 30/60/120 fps',()=>{
  const results=[];
  for(const fps of [30,60,120]){
    let motion={x:0,z:0};
    for(let i=0;i<fps/5;i++)motion=Flight.steer(motion,{x:0,z:6},'ground',1/fps);
    assert.ok(motion.z>5.8&&motion.z<6,'quick start without overshoot');
    const started=motion.z;
    for(let i=0;i<fps/5;i++)motion=Flight.steer(motion,{x:0,z:-6},'ground',1/fps);
    assert.ok(motion.z<-5.6&&motion.z>-6,'reversal responds without a lingering old direction');
    for(let i=0;i<fps/5;i++)motion=Flight.steer(motion,{x:0,z:0},'ground',1/fps);
    assert.ok(Math.abs(motion.z)<.06,'released input settles quickly');
    results.push(started);
  }
  assert.ok(Math.max(...results)-Math.min(...results)<1e-10,'response is elapsed-time based');
});

test('jump, glide and landing steering preserve velocity and remain bounded',()=>{
  let motion={x:0,z:6};
  motion=Flight.steer(motion,{x:0,z:6},'air',1/60);
  assert.deepEqual(motion,{x:0,z:6},'a running jump keeps its horizontal momentum');
  const opened=Flight.steer(motion,{x:0,z:8},'glide',1/60);
  assert.ok(opened.z>6&&opened.z<8,'opening a glider blends toward its existing speed');
  const landed=Flight.steer(opened,{x:0,z:6},'ground',1/60);
  assert.ok(landed.z>6&&landed.z<opened.z,'landing does not reset motion to zero');
  for(const mode of ['ground','air','glide','climb']){
    const before={x:2,z:3};
    for(const dt of [0,-1,NaN])assert.deepEqual(Flight.steer(before,{x:0,z:0},mode,dt),before);
    const resumed=Flight.steer(before,{x:0,z:0},mode,20);
    assert.ok(resumed.x>0&&resumed.x<before.x);
    assert.deepEqual(before,{x:2,z:3},'the input velocity is not mutated');
  }
  const grip=Flight.steer({x:0,z:0},{x:0,z:2.2},'climb',1/60);
  assert.ok(grip.z>0&&grip.z<2.2,'climbing starts without an instantaneous speed change');
  assert.ok(Flight.turn(3.1,-3.1,.5)>3.1,'turn across the angle wrap follows the short arc');
});

test('a deliberate charge and release launches once; lost input cancels without a launch',()=>{
  for(const fps of [30,60,120]){
    let state=Flight.initial();
    for(let i=0;i<fps*2;i++)state=Flight.advance(state,{grounded:true,onPad:true,controls:true,held:true},1/fps);
    assert.equal(state.charge,1);
    const launched=Flight.advance(state,{grounded:true,onPad:true,controls:true},1/fps);
    assert.ok(launched.impulse>=30&&launched.armed);
    assert.equal(Flight.advance(launched,{grounded:false,controls:true,vertical:30},1/fps).impulse,0);
    const cancelled=Flight.advance(state,{grounded:true,onPad:true,controls:false},1/fps);
    assert.equal(cancelled.impulse,0);assert.equal(cancelled.charge,0);
    assert.equal(Flight.advance(state,{grounded:true,onPad:false,controls:true},1/fps).impulse,0);
  }
});

test('launches deploy at the apex, manual folding stays folded, and landing restores ordinary movement',()=>{
  let state=Flight.advance({...Flight.initial(),armed:true},{grounded:false,vertical:-.1,controls:false,clearance:10},1/60);
  assert.equal(state.gliding,true,'automatic deployment works while a companion owns input');
  state=Flight.advance(state,{grounded:false,vertical:-2,controls:true,toggle:true,clearance:10},1/60);
  assert.equal(state.gliding,false);
  state=Flight.advance(state,{grounded:false,vertical:-2,controls:true},1/60);
  assert.equal(state.gliding,false,'folding does not immediately redeploy');
  state=Flight.advance(state,{grounded:false,vertical:-2,controls:true,toggle:true,clearance:10},1/60);
  assert.equal(state.gliding,true);
  state=Flight.advance(state,{grounded:true,controls:true},1/60);
  assert.equal(state.gliding,false);assert.equal(state.armed,false);
});

test('short taps, IME/panel input and invalid elapsed time cannot create launch energy',()=>{
  let state=Flight.advance(Flight.initial(),{grounded:true,onPad:true,controls:true,held:true},1/60);
  assert.equal(Flight.advance(state,{grounded:true,onPad:true,controls:true},1/60).impulse,0);
  state=Flight.advance(Flight.initial(),{grounded:false,vertical:-5,controls:false,toggle:true},1/60);
  assert.equal(state.gliding,false);
  for(const dt of [NaN,-1,0])assert.equal(Flight.advance(Flight.initial(),{grounded:true,onPad:true,controls:true,held:true},dt).charge,0);
  assert.ok(Flight.advance(Flight.initial(),{grounded:true,onPad:true,controls:true,held:true},100).charge<.1,'resume is bounded');
});

test('gliding needs four normal jump heights of clearance, and the gate applies only to opening',()=>{
  const min=4*Flight.tuning.jumpSpeed**2/(2*Flight.tuning.gravity);
  assert.equal(Flight.MIN_GLIDE_HEIGHT,min);
  assert.equal(Flight.canGlide(min-.001),false);assert.equal(Flight.canGlide(min),true);
  assert.equal(Flight.canGlide(NaN),false);assert.equal(Flight.canGlide(Infinity),true,'open air beyond an island has no ground below');
  const input={grounded:false,vertical:-1,controls:true,toggle:true};
  assert.equal(Flight.advance(Flight.initial(),{...input,clearance:1.1},1/60).gliding,false,'a normal jump cannot deploy');
  const opened=Flight.advance(Flight.initial(),{...input,clearance:min},1/60);
  assert.equal(opened.gliding,true);
  assert.equal(Flight.advance(opened,{...input,clearance:.5,toggle:false},1/60).gliding,true,'low approach keeps an open glider');
  assert.equal(Flight.advance(opened,{...input,clearance:.5},1/60).gliding,false,'folding remains available below the opening threshold');
  assert.equal(Flight.advance({...Flight.initial(),armed:true},{...input,controls:false,toggle:false,clearance:1},1/60).gliding,false,'apex auto-deployment uses the same height gate');
});

test('Space resolves wall detach and wall grab before jumping or gliding',()=>{
  assert.equal(Flight.spaceAction({climbing:true,wall:true,gliding:true,clearance:20}),'detach');
  assert.equal(Flight.spaceAction({wall:true,grounded:true,clearance:0}),'climb');
  assert.equal(Flight.spaceAction({wall:true,clearance:20}),'climb');
  assert.equal(Flight.spaceAction({grounded:true}),'jump');
  assert.equal(Flight.spaceAction({coyote:.05}),'jump');
  assert.equal(Flight.spaceAction({clearance:1}),'none');
  assert.equal(Flight.spaceAction({clearance:20}),'glide');
});
