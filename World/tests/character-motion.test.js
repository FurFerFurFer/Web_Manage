'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Motion=require('../scripts/character-motion');
const sample=patch=>({position:[0,.9,0],facing:0,vertical:0,grounded:true,
  climbing:false,gliding:false,detaching:false,sprinting:false,charge:0,paused:false,...patch});

test('animation follows resolved travel, not a sprint toggle or attempted wall movement',()=>{
  const origin=sample({sprinting:true});let state=Motion.reset(origin);
  state=Motion.advance(state,origin,.1);
  assert.equal(state.mode,'idle');assert.equal(state.distance,0);
  state=Motion.advance(state,sample({position:[0,.9,.6],sprinting:true}),.1);
  assert.equal(state.mode,'sprint');assert.ok(Math.abs(state.speed-6)<1e-10);
  state=Motion.advance(state,sample({position:[0,.9,.95]}),.1);
  assert.equal(state.mode,'walk');assert.ok(Math.abs(state.speed-3.5)<1e-10);
  state=Motion.advance(state,sample({position:[0,.9,.95],facing:.2}),.1);
  assert.equal(state.mode,'turn');assert.equal(state.speed,0);
  state=Motion.advance(state,sample({position:[0,.9,.95],facing:.2}),.1);
  assert.equal(state.mode,'idle');
});

test('jump/fall/landing events survive multiple simulation steps between render frames',()=>{
  let state=Motion.reset(sample());
  state=Motion.advance(state,sample({grounded:false,vertical:6,position:[0,1.5,0]}),.1);
  assert.equal(state.mode,'jump');assert.equal(state.notebook,'carried');
  assert.equal(state.takeoffs,1);assert.equal(state.takeoffAge,0);assert.equal(state.takeoffUp,6);
  state=Motion.advance(state,sample({grounded:false,vertical:-4,position:[0,1.3,0]}),.1);
  assert.equal(state.mode,'fall');
  assert.equal(state.takeoffs,1);assert.equal(state.takeoffAge,.1);assert.equal(state.airTime,.2);
  state=Motion.advance(state,sample(),.1);
  assert.equal(state.landed,true);assert.equal(state.impactSpeed,4);
  assert.equal(state.takeoffAge,null);assert.equal(state.airTime,0);
  state=Motion.advance(state,sample(),.1);
  assert.equal(state.landed,false);assert.equal(state.landings,1);assert.equal(state.landingAge,.1);
  // The accepted coyote window may launch after a tread has already lost contact.
  state=Motion.advance(state,sample({grounded:false,vertical:-1,position:[0,.88,0]}),1/60);
  state=Motion.advance(state,sample({grounded:false,vertical:5.9,position:[0,1,0]}),1/60);
  assert.equal(state.takeoffs,2);assert.equal(state.takeoffAge,0);
});

test('climbing holds still while reading; detach, glide and landing carry the existing notebook contract',()=>{
  let state=Motion.reset(sample({climbing:true,grounded:false,position:[0,3,0]}));
  state=Motion.advance(state,sample({climbing:true,grounded:false,position:[0,3.22,0]}),.1);
  assert.equal(state.mode,'climb');assert.ok(Math.abs(state.climbSpeed-2.2)<1e-10);
  const held=state.climbDistance;
  state=Motion.advance(state,state.sample,.1);
  assert.equal(state.climbSpeed,0);assert.equal(state.climbDistance,held);assert.equal(state.notebook,'stowed');
  state=Motion.advance(state,sample({grounded:false,detaching:true,vertical:2,position:[0,3.3,-.3]}),.1);
  assert.equal(state.mode,'detach');assert.equal(state.detached,true);assert.equal(state.notebook,'carried');
  state=Motion.advance(state,state.sample,.1);
  assert.equal(state.detachments,1);assert.equal(state.detached,false);
  state=Motion.advance(state,sample({grounded:false,gliding:true,vertical:-2,position:[0,3,0]}),.1);
  assert.equal(state.mode,'glide');assert.equal(state.notebook,'stowed');
  state=Motion.advance(state,sample(),.1);
  assert.equal(state.notebook,'carried');assert.equal(state.landings,1);
});

test('teleport/reset produces no travel, turn or impact and sampling cannot change its caller',()=>{
  const input=Object.freeze(sample({position:Object.freeze([80,30,20]),facing:3.1}));
  let state=Motion.reset(input);
  assert.equal(state.distance,0);assert.equal(state.landings,0);assert.equal(state.landingAge,null);
  const next=Object.freeze(sample({position:input.position,facing:-3.1}));
  state=Motion.advance(state,next,.1);
  assert.ok(state.turnRate>0&&state.turnRate<1,'angle wrap takes the short path');
  state.sample.position[0]=0;assert.equal(input.position[0],80,'retained position is detached from the controller');
  for(const dt of [0,-1,NaN])assert.equal(Motion.advance(state,input,dt),state);
  const charging=Motion.advance(Motion.reset(sample()),sample({charge:.5}),.1);
  assert.equal(charging.mode,'charge');assert.equal(charging.notebook,'carried');
  assert.equal(Motion.advance(charging,sample({paused:true}),.1).mode,'idle');
});
