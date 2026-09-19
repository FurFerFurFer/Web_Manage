'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const MapCore=require('../scripts/map-core');

test('map projection round trips north-up world coordinates at all zooms',()=>{
  for(const zoom of [.6,1,5])for(const size of [[800,600],[320,420]]) {
    const view={x:-7,z:12,zoom},point={x:9.5,z:5};
    const pixel=MapCore.project(point,view,...size),back=MapCore.unproject(pixel,view,...size);
    assert.ok(Math.abs(back.x-point.x)<1e-9&&Math.abs(back.z-point.z)<1e-9);
    assert.ok(MapCore.project({x:0,z:20},{x:0,z:0,zoom},...size).y<size[1]/2);
  }
});

test('navigation uses position and camera heading, and reaching never clears the target',()=>{
  const destination={id:'pin-1',x:3,z:4,name:'A place'},before=JSON.stringify(destination);
  assert.equal(MapCore.locator(destination,{x:0,z:0,yaw:0}).distance,5);
  assert.equal(MapCore.locator({x:0,z:10},{x:0,z:0,yaw:Math.PI/2}).angle,-Math.PI/2);
  assert.equal(MapCore.locator(destination,{x:3,z:4,yaw:0}).arrived,true);
  assert.equal(JSON.stringify(destination),before);
});

test('synthetic quest mapping is explicit; unknown and removed entries never acquire a location',()=>{
  const landmarks=[{id:'bridge',name:'Little bridge',x:9.5,z:5},{id:'grove',name:'Memory Grove',x:-13,z:15}];
  assert.equal(MapCore.questDestination({kind:'node',node:{id:'task-ripple'}},landmarks).id,'bridge');
  assert.equal(MapCore.questDestination({kind:'node',node:{id:'task-pack'}},landmarks),null);
  assert.equal(MapCore.questDestination({kind:'learn',node:{id:'goal-water'},mm:null,mmId:999},landmarks),null);
  assert.equal(MapCore.questDestination({kind:'learn',node:{id:'goal-water'},mm:{id:102},mmId:102},landmarks).id,'grove');
});

test('navigation accounts for height instead of reporting arrival on another level',()=>{
  const cue=MapCore.locator({x:0,y:8,z:0},{x:0,y:0,z:0,yaw:0});
  assert.equal(cue.arrived,false);
  assert.equal(cue.distance,8);
  assert.equal(cue.height,8);
  assert.equal(MapCore.locator({x:3,y:12,z:4},{x:0,y:0,z:0,yaw:0}).distance,13);
});
