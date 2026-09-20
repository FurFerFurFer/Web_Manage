(function(root){
  'use strict';
  // Demo tuning, independent of Track records or streaks. A charged release is
  // an explicit input; blur, panel entry and leaving the pad cancel the charge.
  // Character scale (ruling 3). The BODY is 1.30x; the scene, the camera and every
  // controller value stay at their original size. Step length is speed/(2*rate), so a
  // longer leg is what cuts step/leg from 1.61 to 1.24 -- the world must NOT grow with
  // it or the character simply covers 30% less ground and nothing else changes.
  const characterScale=1.30;
  const tuning=Object.freeze({characterScale,walkSpeed:5.2,runSpeed:12,groundStart:18,groundStop:24,groundTurn:24,airResponse:12,glideResponse:8,climbResponse:18,turnResponse:20,poseResponse:16,
    jumpSpeed:6.2,gravity:18,chargeSeconds:1.2,minCharge:.12,launchMin:22,launchExtra:12,glideSpeed:8,descent:2.4,climbSpeed:2.2,detachSpeed:3,detachUp:2.2,detachSeconds:.18});
  const elapsed=dt=>Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
  const blend=(rate,dt)=>1-Math.exp(-rate*elapsed(dt));
  const turn=(from,to,amount)=>from+Math.atan2(Math.sin(to-from),Math.cos(to-from))*amount;
  // Rates tune the existing controller, not reference-game measurements. Ground
  // braking and reversals respond sooner; airborne steering preserves continuity.
  function steer(previous,target,mode,dt){
    const moving=Math.hypot(target.x,target.z)>0;
    const turning=previous.x*target.x+previous.z*target.z<Math.hypot(previous.x,previous.z)*Math.hypot(target.x,target.z)*.7;
    const rate=mode==='ground'?(!moving?tuning.groundStop:turning?tuning.groundTurn:tuning.groundStart):
      mode==='climb'?tuning.climbResponse:mode==='glide'&&moving?tuning.glideResponse:tuning.airResponse;
    const amount=blend(rate,dt);
    return {x:previous.x+(target.x-previous.x)*amount,z:previous.z+(target.z-previous.z)*amount};
  }
  const MIN_GLIDE_HEIGHT=4*tuning.jumpSpeed**2/(2*tuning.gravity);
  const canGlide=clearance=>typeof clearance==='number'&&clearance>=MIN_GLIDE_HEIGHT;
  // One physical Space press has exactly one meaning. Wall interaction wins,
  // and a rejected low glide press is discarded rather than queued for later.
  function spaceAction(input){
    if(input.climbing)return 'detach';
    if(input.wall)return 'climb';
    if(input.grounded||input.coyote>0)return 'jump';
    if(input.gliding)return 'fold';
    return canGlide(input.clearance)?'glide':'none';
  }
  const initial=()=>({charge:0,gliding:false,armed:false,impulse:0});
  function advance(previous,input,dt){
    dt=elapsed(dt);
    const next={...previous,impulse:0};
    if(input.grounded){
      next.gliding=false;next.armed=false;
      if(input.controls&&input.onPad){
        if(input.held)next.charge=Math.min(1,next.charge+dt/tuning.chargeSeconds);
        else {
          if(next.charge>=tuning.minCharge){next.impulse=tuning.launchMin+next.charge*tuning.launchExtra;next.armed=true;}
          next.charge=0;
        }
      }else next.charge=0;
    }else{
      next.charge=0;
      if(input.controls&&input.toggle){if(next.gliding||canGlide(input.clearance)){next.gliding=!next.gliding;next.armed=false;}}
      else if(next.armed&&input.vertical<=0&&canGlide(input.clearance)){next.gliding=true;next.armed=false;}
    }
    return next;
  }
  const api={tuning,blend,turn,steer,MIN_GLIDE_HEIGHT,canGlide,spaceAction,initial,advance};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WorldFlight=api;
})(typeof window!=='undefined'?window:globalThis);
