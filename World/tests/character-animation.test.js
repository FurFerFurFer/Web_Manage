'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Animation=require('../scripts/character-animation'),Motion=require('../scripts/character-motion'),Flight=require('../scripts/flight-core');
const sample=patch=>({position:[0,.9,0],facing:0,vertical:0,grounded:true,climbing:false,gliding:false,detaching:false,sprinting:false,charge:0,paused:false,...patch});
function actor(hz=120){
  let motion=Motion.reset(sample()),rig=Animation.create(Flight.tuning),pose=rig.reset(motion),z=0;
  return {step(speed,patch={}){z+=speed/hz;motion=Motion.advance(motion,sample({position:[0,.9,z],sprinting:speed>Flight.tuning.walkSpeed,...patch}),1/hz);pose=rig.update(motion,1/hz);return pose;},
    get pose(){return pose;},get motion(){return motion;},reset(patch){motion=Motion.reset(sample(patch));z=motion.sample.position[2];pose=rig.reset(motion);return pose;}};
}
const S=Flight.tuning.worldScale;
const modes=[['walk',5.2],['jog',8],['run',12],['dash',16.2]];
test('grounded loading and push-off give the body upward momentum before either foot releases',t=>{
  const measured=[];
  for(const [name,speed] of modes){
    const a=actor();for(let i=0;i<240;i++)a.step(speed);
    let before=a.pose,older=null,active=null,airChecks=0,gravityError=0;const pushes=[];
    for(let i=0;i<720;i++){
      const p=a.step(speed);
      if(p.feet.left.support&&!before.feet.left.support)active={low:p.pose.pelvisY,heel:p.feet.left.height,knee:p.pose.leftKnee};
      if(active){
        active.low=Math.min(active.low,p.pose.pelvisY);
        if(p.feet.left.support)active.knee=Math.max(active.knee,p.pose.leftKnee);
        if(before.feet.left.support&&!p.feet.left.support){
          pushes.push({velocity:(p.pose.pelvisY-before.pose.pelvisY)*120,rise:p.pose.pelvisY-active.low,
            heelRise:before.feet.left.height-active.heel,kneeExtension:active.knee-before.pose.leftKnee});active=null;
        }
      }
      if(older&&[older,before,p].every(frame=>!frame.feet.left.support&&!frame.feet.right.support)){
        const acceleration=(p.pose.pelvisY-2*before.pose.pelvisY+older.pose.pelvisY)*120*120;
        gravityError=Math.max(gravityError,Math.abs(acceleration*S+Flight.tuning.gravity));airChecks++;
      }
      older=before;before=p;
    }
    measured.push({name,checks:pushes.length,velocity:Math.min(...pushes.map(p=>p.velocity)),
      rise:Math.min(...pushes.map(p=>p.rise)),heelRise:Math.min(...pushes.map(p=>p.heelRise)),
      kneeExtension:Math.min(...pushes.map(p=>p.kneeExtension)),airChecks,gravityError});
  }
  t.diagnostic(JSON.stringify({pushOff:measured}));
  for(const p of measured){
    assert.ok(p.checks>=8,p.name+' samples repeated pushes');
    assert.ok(p.velocity>.05,p.name+' body falls instead of rising at foot release: '+p.velocity);
    assert.ok(p.rise>.025,p.name+' push must lift the body from its loaded pose');
    assert.ok(p.heelRise>.025,p.name+' heel must rise over the supporting forefoot before release');
    assert.ok(p.kneeExtension>.05,p.name+' loaded knee must extend while the foot still supports the body');
    assert.ok(p.airChecks>100,p.name+' samples the arc between pushes');
    assert.ok(p.gravityError<.1,p.name+' body must carry its release velocity through a gravity arc, error '+p.gravityError);
  }
});
test('all four gaits carry the hips above the legs instead of sitting between two forward thighs',t=>{
  const measured=[];
  for(const [name,speed] of modes){
    const a=actor();for(let i=0;i<240;i++)a.step(speed);
    let seated=0,lowest=Infinity,forward=0;
    for(let i=0;i<480;i++){
      const p=a.step(speed).pose;
      // Sagittal knee positions relative to their hips, normalized by thigh length.
      // These are local silhouette bounds, not claimed 3D angles extracted from video.
      const knees=['left','right'].map(side=>-Math.sin(p[side+'Hip']));
      seated+=Number(knees.every(z=>z>Math.sin(.30)));
      forward=Math.max(forward,...knees);lowest=Math.min(lowest,p.pelvisY);
    }
    measured.push({name,seated:seated/480,lowest,forwardDegrees:Math.asin(forward)*180/Math.PI});
  }
  t.diagnostic(JSON.stringify({posture:measured}));
  for(const p of measured){
    assert.ok(p.seated<.15,p.name+' both thighs stay forward for '+(p.seated*100).toFixed(1)+'% of the cycle');
    assert.ok(p.lowest>.87,p.name+' pelvis collapses during ordinary travel: '+p.lowest);
    assert.ok(p.forwardDegrees<{walk:48,jog:50,run:53,dash:55}[p.name],p.name+' knee reaches too far forward: '+p.forwardDegrees);
  }
});
test('all four motion sets match travel with distinct cadence, contact and recovery',()=>{
  const envelopes=[];
  for(const [name,speed] of modes){
    const a=actor();for(let i=0;i<240;i++)a.step(speed);const start=a.pose.cycles;
    let min=Infinity,max=-Infinity,hipDelta=0,hip=a.pose.pose.leftHip,support=0,lean=0,armMin=Infinity,armMax=-Infinity,flight=0;
    for(let i=0;i<480;i++){
      const p=a.step(speed);min=Math.min(min,p.pose.leftKnee);max=Math.max(max,p.pose.leftKnee);
      hipDelta=Math.max(hipDelta,Math.abs(p.pose.leftHip-hip));hip=p.pose.leftHip;
      support+=Number(p.feet.left.support);flight+=Number(!p.feet.left.support&&!p.feet.right.support);
      lean+=p.pose.spineX+p.pose.chestX;armMin=Math.min(armMin,p.pose.leftShoulderX);armMax=Math.max(armMax,p.pose.leftShoulderX);
    }
    const cadence=(a.pose.cycles-start)/4;
    assert.ok(Math.abs(cadence-{walk:1.70,jog:1.88,run:2.05,dash:2.20}[name])<.001,name+' keeps the user-accepted rhythm');
    const band={walk:[1.55,1.8],jog:[1.8,1.98],run:[1.98,2.13],dash:[2.13,2.3]}[name];
    assert.ok(cadence>=band[0]&&cadence<=band[1],name+' must retain deliberate timing, measured '+cadence);
    assert.ok(max-min>.65,name+' needs an articulated recovery');
    // Dash has a higher angular-speed budget at its fixed faster cadence.
    const bound={walk:.23,jog:.23,run:.25,dash:.29}[name];
    assert.ok(hipDelta<bound,name+' continuous hip delta '+hipDelta);
    envelopes.push({name,cadence,support:support/480,flight:flight/480,knee:max,lean:lean/480,arm:armMax-armMin});
  }
  for(let i=1;i<envelopes.length;i++){
    const a=envelopes[i-1],b=envelopes[i];
    assert.ok(b.cadence>a.cadence+.07,b.name+' has its own faster cadence');
    assert.ok(b.support<a.support-.02,b.name+' has a distinct contact window');
    assert.ok(b.lean>a.lean+.035,b.name+' changes the body silhouette');
    assert.ok(Math.abs(b.arm-a.arm)>.10,b.name+' changes the arm action');
  }
  assert.ok(envelopes[0].support>envelopes[1].support,'the relaxed walk has longer support than jog');
  assert.ok(envelopes[1].flight>.2,'jog has a flight phase');
});
test('dash retains its own deliberate cadence instead of rapid limb cycling',()=>{
  const observed=[];
  for(const speed of [12,16.2]){const a=actor();for(let i=0;i<240;i++)a.step(speed);const start=a.pose.cycles;
    for(let i=0;i<240;i++)a.step(speed);observed.push((a.pose.cycles-start)/2);}
  assert.ok(observed[1]>observed[0]+.07,'dash has its own timing');
  assert.ok(observed[1]<2.3,'dash may not turn into rapid limb cycling');
});
test('every gait recovers its feet beneath the body instead of a split-leg lunge',()=>{
  for(const [name,speed] of modes){const a=actor();for(let i=0;i<240;i++)a.step(speed);
    for(let i=0;i<480;i++){const p=a.step(speed);
      for(const f of Object.values(p.feet))assert.ok(Math.abs(f.point[1]-a.motion.sample.position[2])/S<.62,name+' excessive fore/aft reach');
    }
  }
});
test('walk, jog, run and dash hold world contacts through advances and turns',()=>{
  for(const [name,speed] of modes){
    const a=actor();let checks=0,previous;
    for(let i=0;i<960;i++){
      const p=a.step(speed,{facing:i/960*.7});
      for(const side of ['left','right']){
        const foot=p.feet[side],before=previous?.feet[side];
        if(i>240&&foot.support&&before?.support){assert.deepEqual(foot.groundPoint||foot.point,before.groundPoint||before.point,name);checks++;}
      }
      previous=p;
    }
    assert.ok(checks>80,name+' exercises sustained contact');
  }
});
test('a 90 or 180 degree turn, stop and restart keeps all four sets continuous and feet beside their own hip',()=>{
  for(const [name,speed] of modes)for(const angle of [Math.PI/2,Math.PI]){
    const a=actor();for(let i=0;i<180;i++)a.step(speed);
    let previous=a.pose.pose,facing=0,x=0,z=speed*1.5,velocity={x:0,z:speed};
    for(let i=0;i<240;i++){
      const target=i<140?angle:0,travel=i>=60&&i<140?0:speed;
      velocity=Flight.steer(velocity,{x:Math.sin(target)*travel,z:Math.cos(target)*travel},'ground',1/120);
      if(Math.hypot(velocity.x,velocity.z)>.05)facing=Flight.turn(facing,Math.atan2(velocity.x,velocity.z),Flight.blend(Flight.tuning.turnResponse,1/120));
      x+=velocity.x/120;z+=velocity.z/120;
      const p=a.step(0,{position:[x,.9,z],facing});
      for(const side of ['left','right']){
        assert.ok(Math.abs(p.pose[side+'Hip']-previous[side+'Hip'])<.40,name+' turn/restart hip continuity at '+i+', delta '+Math.abs(p.pose[side+'Hip']-previous[side+'Hip']));
        assert.ok(Math.abs(p.pose[side+'HipZ'])<.65,name+' cannot sweep a foot across the body');
      }
      assert.ok(Object.values(p.pose).every(Number.isFinite));previous=p.pose;
    }
  }
});
test('walk-jog-run-dash and back keep phase, compact reach and continuous joints',()=>{
  const a=actor();let speed=0,previous=a.pose;
  for(const target of [5.2,8,12,16.2,12,8,5.2]){
    for(let i=0;i<120;i++){
      speed+=(target-speed)*(1-Math.exp(-18/120));const p=a.step(speed);
      assert.ok(p.cycles>=previous.cycles,'crossing a set boundary cannot rewind the stride');
      for(const side of ['left','right']){
        assert.ok(Math.abs(p.pose[side+'Hip']-previous.pose[side+'Hip'])<.40,'changing set must not snap the hip');
        assert.ok(Math.abs(p.feet[side].point[1]-a.motion.sample.position[2])/S<.70,'a speed transition cannot stretch the step');
      }
      previous=p;
    }
  }
});
test('climbing has directional hand and knee reaches, with still grips between steps',()=>{
  const ends=[];
  for(const direction of [-1,1]){
    const a=actor();for(let i=0;i<90;i++)a.step(0,{position:[0,4+direction*i/90,0],grounded:false,climbing:true});
    ends.push(a.pose.pose.leftHip);
    const phase=a.pose.climbPhase;for(let i=0;i<90;i++)a.step(0,{position:[0,4+direction*89/90,0],grounded:false,climbing:true});
    assert.equal(a.pose.climbPhase,phase,'reading holds the grip');
  }
  assert.ok(Math.abs(ends[0]-ends[1])>.12,'descending must not play the upward reach unchanged');
});
test('release finishes the recovery step and rests both feet; a blocked sprint stays idle',()=>{
  const a=actor();for(let i=0;i<120;i++)a.step(Flight.tuning.runSpeed);
  for(let i=0;i<120;i++)a.step(0,{sprinting:true});
  assert.equal(a.pose.settled,true);assert.equal(a.pose.moving,false);
  for(const foot of Object.values(a.pose.feet)){assert.equal(foot.support,true);assert.equal(foot.height,.105*S);}
  const cycles=a.pose.cycles;for(let i=0;i<60;i++)a.step(0,{sprinting:true});assert.equal(a.pose.cycles,cycles);
});
test('takeoff, apex and reach for landing have different poses without a rest-pose reset',()=>{
  const a=actor();for(let i=0;i<120;i++)a.step(Flight.tuning.runSpeed);
  const before=a.pose.pose.leftHip,v=Flight.tuning.jumpSpeed,g=Flight.tuning.gravity,poses=[];
  for(let i=0;i<85;i++){
    const t=i/120,grounded=t>=2*v/g;
    const p=a.step(Flight.tuning.runSpeed,{position:[0,.9+Math.max(0,v*t-g*t*t/2),Flight.tuning.runSpeed*(1+t)],grounded,vertical:grounded?0:v-g*t});
    if(i===0)assert.ok(Math.abs(p.pose.leftHip-before)<.15,'takeoff inherits the current leg pose');
    if([20,42,72].includes(i))poses.push(p.pose);
  }
  assert.ok(Math.abs(poses[0].leftKnee-poses[2].leftKnee)>.45,'legs unfold before landing');
  assert.ok(Math.abs(poses[0].rightShoulderZ-poses[1].rightShoulderZ)>.1,'arms change through the jump');
  assert.ok(a.motion.landings>0);assert.equal(a.pose.domain,'ground');
});
test('climbing holds its phase while reading and glide uses both overhead arms',()=>{
  const a=actor();for(let i=0;i<60;i++)a.step(0,{position:[0,2+i/60,0],grounded:false,climbing:true});
  const phase=a.pose.climbPhase;for(let i=0;i<60;i++)a.step(0,{position:[0,2+59/60,0],grounded:false,climbing:true});
  assert.equal(a.pose.climbPhase,phase);
  for(let i=0;i<60;i++)a.step(0,{grounded:false,gliding:true,vertical:-2});
  assert.ok(a.pose.pose.leftShoulderX<-2.5&&a.pose.pose.rightShoulderX<-2.5);
});
test('takeoff remains continuous after a long rendered frame at any stride phase',()=>{
  for(let offset=0;offset<60;offset+=3){
    const a=actor();for(let i=0;i<120+offset;i++)a.step(Flight.tuning.runSpeed);
    const rig=Animation.create(Flight.tuning);rig.reset(a.motion);
    // Warm this independent presentation at the same ground speed.
    for(let i=0;i<120+offset;i++){a.step(Flight.tuning.runSpeed);rig.update(a.motion,1/120);}
    const before=rig.snapshot().pose.leftHip;
    let motion=a.motion;
    for(let i=1;i<=12;i++)motion=Motion.advance(motion,sample({position:[0,1+i*.04,motion.sample.position[2]+Flight.tuning.runSpeed/120],grounded:false,vertical:6.2-18*i/120,sprinting:true}),1/120);
    const after=rig.update(motion,.1).pose.leftHip;
    assert.ok(Math.abs(after-before)<.85,'takeoff hip jump '+Math.abs(after-before)+' at sample '+offset);
  }
});
test('frame rate does not set cadence, and reset discards old contacts after travel',()=>{
  for(const [name,speed] of modes){
    const results=[];
    for(const hz of [30,60,144]){const a=actor(hz);for(let i=0;i<hz*3;i++)a.step(speed);results.push(a.pose.cycles);}
    assert.ok(Math.max(...results)-Math.min(...results)<.08,name+' frame cadence must not change the gait clock');
  }
  const a=actor();for(let i=0;i<120;i++)a.step(Flight.tuning.runSpeed);
  const reset=a.reset({position:[50,30,80]});assert.equal(reset.cycles,0);
  for(const f of Object.values(reset.feet))assert.ok(Math.abs(f.point[0]-50)<.2&&Math.abs(f.point[1]-80)<.2);
  const frozen=Object.freeze({...a.motion,sample:Object.freeze({...a.motion.sample,position:Object.freeze([...a.motion.sample.position])})});
  const rig=Animation.create(Flight.tuning);rig.reset(frozen);rig.update(frozen,1/60,true);
  assert.deepEqual(frozen.sample.position,[50,30,80]);
});
