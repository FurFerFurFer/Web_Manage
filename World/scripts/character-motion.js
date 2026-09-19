(function (root, factory) {
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.WorldCharacterMotion=api;
})(typeof globalThis!=='undefined'?globalThis:this,function () {
  'use strict';
  // Presentation input only. Samples come AFTER collision/controller resolution.
  // No key handling, root motion, rig, pose timing or movement permissions live here.
  const copy=sample=>({...sample,position:[...sample.position]});
  function describe(sample,speed,turnRate){
    if(sample.paused)return 'idle';
    if(sample.climbing)return 'climb';
    if(sample.gliding)return 'glide';
    if(sample.detaching)return 'detach';
    if(!sample.grounded)return sample.vertical>0?'jump':'fall';
    if(sample.charge>0)return 'charge';
    if(speed>.05)return sample.sprinting?'sprint':'walk';
    return Math.abs(turnRate)>.15?'turn':'idle';
  }
  function reset(sample){
    return {sample:copy(sample),mode:describe(sample,0,0),modeTime:0,
      speed:0,climbSpeed:0,turnRate:0,distance:0,groundDistance:0,climbDistance:0,
      landed:false,detached:false,landings:0,detachments:0,landingAge:null,
      impactSpeed:0,elapsed:0,airTime:0,takeoffs:0,takeoffAge:null,takeoffUp:0,
      velocity:[0,0,0],notebook:sample.climbing||sample.gliding?'stowed':'carried'};
  }
  function advance(previous,sample,dt){
    if(!Number.isFinite(dt)||dt<=0)return previous;
    const before=previous.sample;
    const dx=sample.position[0]-before.position[0],dy=sample.position[1]-before.position[1],dz=sample.position[2]-before.position[2];
    const distance=sample.paused?0:Math.hypot(dx,dz);
    const climbDistance=sample.climbing&&!sample.paused?Math.hypot(dx,dy,dz):0;
    const speed=distance/dt;
    const turnRate=sample.paused?0:Math.atan2(Math.sin(sample.facing-before.facing),Math.cos(sample.facing-before.facing))/dt;
    const landed=!sample.paused&&!before.grounded&&sample.grounded;
    const detached=!sample.paused&&!before.detaching&&sample.detaching;
    // A coyote jump starts after ground contact was lost; the upward impulse is
    // the event. The observer does not grant or extend that controller window.
    const takeoff=!sample.paused&&!sample.climbing&&!sample.gliding&&!sample.detaching&&
      !sample.grounded&&sample.vertical>1&&(before.grounded||before.vertical<=1);
    const mode=describe(sample,speed,turnRate);
    return {sample:copy(sample),mode,modeTime:mode===previous.mode?previous.modeTime+dt:0,
      speed,climbSpeed:climbDistance/dt,turnRate,
      distance:previous.distance+distance,groundDistance:previous.groundDistance+(sample.grounded?distance:0),
      climbDistance:previous.climbDistance+climbDistance,
      landed,detached,landings:previous.landings+Number(landed),detachments:previous.detachments+Number(detached),
      landingAge:landed?0:previous.landingAge===null?null:previous.landingAge+dt,
      impactSpeed:landed?Math.max(0,-before.vertical):previous.impactSpeed,
      elapsed:previous.elapsed+dt,airTime:sample.grounded||sample.climbing||sample.paused?0:previous.airTime+dt,
      takeoffs:previous.takeoffs+Number(takeoff),
      takeoffAge:takeoff?0:sample.grounded?null:previous.takeoffAge===null?null:previous.takeoffAge+dt,
      takeoffUp:takeoff?sample.vertical:previous.takeoffUp,
      velocity:sample.paused?[0,0,0]:[dx/dt,dy/dt,dz/dt],
      notebook:sample.climbing||sample.gliding?'stowed':'carried'};
  }
  return Object.freeze({reset,advance});
});
