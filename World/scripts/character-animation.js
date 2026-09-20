(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.WorldCharacterAnimation=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Presentation only: choreography observes resolved travel. No input, collision,
  // root motion or controller writes. Angles in radians; poses use model units, contact points use world units.
  const TAU=Math.PI*2,clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n)),mix=(a,b,t)=>a+(b-a)*t;
  const ease=t=>{t=clamp(t);return t*t*(3-2*t);},wrap=t=>((t%1)+1)%1;
  const sides=['left','right'],sign=side=>side==='left'?-1:1;
  // Shared by the actual mesh pivots and IK. Longer legs carry the pelvis higher
  // without straightening the supporting knee into a fast end-of-stance snap.
  const dimensions=Object.freeze({thigh:.49,shin:.46,hipWidth:.115,ankleHeight:.105,restPelvis:1.035,
    toePivotY:-.055,toePivotZ:.095,toeSoleY:-.05,toeSoleZ:.045});
  // Four independent sets. These are local design curves, not extracted clips.
  // Each owns support/flight timing, heel path, arm phrasing and weight transfer.
  // The selector uses observed speed; jog is crossed during acceleration/braking.
  const sets={
    walk:{speed:5.2,rate:1.70,slope:.15,duty:.26,lean:.015,twist:.065,elbow:.32,
      heel:[[0,0],[.28,.30],[.55,.16],[.82,.03],[1,0]],
      recovery:[[0,0],[.28,0],[.55,.12],[.78,.60],[1,1]],
      arm:[[0,.25],[.22,.12],[.50,-.30],[.78,-.12],[1,.25]],
      landingKnee:.50,push:.055,toeOff:.90,
      back:.47,pitch:.22},
    jog:{speed:8,rate:1.88,slope:.025,duty:.18,lean:.075,twist:.09,elbow:.82,
      heel:[[0,0],[.22,.23],[.49,.15],[.76,.045],[1,0]],
      recovery:[[0,0],[.22,0],[.45,.15],[.70,.50],[.88,.90],[1,1]],
      arm:[[0,.43],[.18,.34],[.48,-.48],[.68,-.38],[1,.43]],
      landingKnee:.53,push:.060,toeOff:.93,
      back:.47,pitch:.44},
    run:{speed:12,rate:2.05,slope:.02,duty:.12,lean:.20,twist:.14,elbow:1.10,
      heel:[[0,0],[.20,.38],[.43,.22],[.70,.08],[1,0]],
      recovery:[[0,0],[.20,0],[.40,.12],[.65,.45],[.85,.88],[1,1]],
      arm:[[0,.73],[.14,.59],[.43,-.69],[.60,-.63],[.88,.62],[1,.73]],
      landingKnee:.56,push:.070,toeOff:.96,
      back:.51,pitch:.68},
    dash:{speed:16.2,rate:2.20,slope:.025,duty:.085,lean:.32,twist:.105,elbow:1.25,
      heel:[[0,0],[.16,.45],[.36,.29],[.62,.10],[.85,.035],[1,0]],
      recovery:[[0,0],[.18,0],[.38,.10],[.63,.42],[.85,.88],[1,1]],
      arm:[[0,.88],[.22,.36],[.45,-.92],[.65,-.48],[.86,.72],[1,.88]],
      landingKnee:.60,push:.075,toeOff:1.00,
      back:.53,pitch:.85}
  };
  function curve(keys,t){
    if(t<=keys[0][0])return keys[0][1];
    for(let i=1;i<keys.length;i++)if(t<=keys[i][0])return mix(keys[i-1][1],keys[i][1],ease((t-keys[i-1][0])/(keys[i][0]-keys[i-1][0])));
    return keys[keys.length-1][1];
  }
  function neutral(){
    const p={pelvisY:dimensions.restPelvis,pelvisX:0,pelvisZ:0,pelvisYaw:0,pelvisRoll:0,
      spineX:.035,spineY:0,spineZ:0,chestX:0,chestY:0,chestZ:0,headX:0,headY:0,headZ:0,footIK:0};
    for(const side of sides)Object.assign(p,{[side+'Hip']:0,[side+'HipZ']:0,[side+'Knee']:.13,
      [side+'Ankle']:0,[side+'AnkleZ']:0,[side+'Toe']:0,[side+'ShoulderX']:.03,
      [side+'ShoulderY']:0,[side+'ShoulderZ']:sign(side)*.13,[side+'Elbow']:-.28,
      [side+'WristX']:0,[side+'WristZ']:0,[side+'FootPitch']:0,[side+'FootYaw']:0});
    p.rightElbow=-.48;return p;
  }
  const toWorld=(s,x,z)=>[s.position[0]+Math.cos(s.facing)*x+Math.sin(s.facing)*z,
    s.position[2]-Math.sin(s.facing)*x+Math.cos(s.facing)*z];
  const toLocal=(s,point)=>{const x=point[0]-s.position[0],z=point[1]-s.position[2];
    return [Math.cos(s.facing)*x-Math.sin(s.facing)*z,Math.sin(s.facing)*x+Math.cos(s.facing)*z];};
  function soleOffset(pitch,toe){
    const d=dimensions,a=pitch+toe;
    return {y:d.toePivotY*Math.cos(pitch)-d.toePivotZ*Math.sin(pitch)+d.toeSoleY*Math.cos(a)-d.toeSoleZ*Math.sin(a),
      z:d.toePivotY*Math.sin(pitch)+d.toePivotZ*Math.cos(pitch)+d.toeSoleY*Math.sin(a)+d.toeSoleZ*Math.cos(a)};
  }
  function leg(p,side,target){
    let x=target.x-p.pelvisX,y=target.y-p.pelvisY,z=target.z-p.pelvisZ;
    const c=Math.cos(p.pelvisYaw),s=Math.sin(p.pelvisYaw),rx=c*x-s*z;z=s*x+c*z;x=rx;
    const cr=Math.cos(p.pelvisRoll),sr=Math.sin(p.pelvisRoll),ry=-sr*x+cr*y;x=cr*x+sr*y;y=ry;
    x-=sign(side)*dimensions.hipWidth;y+=.01;
    const {thigh,shin}=dimensions,d=clamp(Math.hypot(x,y,z),.14,thigh+shin-.002);
    const knee=Math.acos(clamp((d*d-thigh*thigh-shin*shin)/(2*thigh*shin),-1,1));
    const a=thigh+shin*Math.cos(knee),b=shin*Math.sin(knee),roll=Math.asin(clamp(x/a,-.58,.58));
    p[side+'HipZ']=roll;p[side+'Hip']=Math.atan2(-z,-y)-Math.atan2(b,a*Math.cos(roll));
    p[side+'Knee']=knee;p[side+'Ankle']=target.pitch-p[side+'Hip']-knee;
    p[side+'AnkleZ']=-roll-p.pelvisRoll;p[side+'Toe']=target.toe||0;
  }
  function create(tuning){
    const scale=tuning.characterScale||1;
    const world=(s,x,z)=>toWorld(s,x*scale,z*scale);
    const local=(s,p)=>toLocal(s,p).map(n=>n/scale);
    let state;
    function reset(motion){
      const sample=motion.sample;
      state={clock:0,phase:0,cycles:0,speed:0,weight:0,accel:0,turn:0,yawLag:0,
        gait:'walk',weights:{walk:1,jog:0,run:0,dash:0},cadence:0,
        moving:false,stopAge:1,entryAge:1,domain:null,pose:null,offset:{},transitionAge:1,
        lastSample:{...sample,position:[...sample.position]},lastFacing:sample.facing,
        takeoffs:motion.takeoffs,lead:'left',feet:{},climbPhase:0,lastClimb:motion.climbDistance,
        climbVertical:0,climbLateral:0};
      for(const side of sides){const at=world(sample,sign(side)*dimensions.hipWidth,0);
        state.feet[side]={point:at,from:at,groundPoint:world(sample,sign(side)*dimensions.hipWidth,soleOffset(0,0).z),
          support:true,height:dimensions.ankleHeight,pitch:0,toe:0,cycle:0,plantFacing:sample.facing};}
      tick(motion,0,false,true);return result();
    }
    function property(name,phase){
      return Object.entries(state.weights).reduce((v,[key,w])=>v+w*(phase===undefined?sets[key][name]:curve(sets[key][name],phase)),0);
    }
    function chooseGait(speed){
      const names=['walk','jog','run','dash'],bounds=[6.2,9.8,13.7];let index=names.indexOf(state.gait);
      while(index<3&&speed>bounds[index]+.15)index++;
      while(index>0&&speed<bounds[index-1]-.15)index--;
      return names[index];
    }
    function supportedBody(){
      // One trajectory per step: load the supporting leg, push through its toes,
      // then carry that upward velocity into the airborne arc. No separate bob.
      const c=wrap(state.phase*2)*.5,side=wrap(state.phase)<.5?'left':'right',plan=state.feet[side].plan;
      // The pose's arc uses the set's design clock. Near a stop the observed
      // stride clock slows, which must not create an enormous slow-motion hop.
      const rate=property('rate'),duty=plan?.duty??property('duty');
      // Do not jump body height when the next foot replaces an old stride plan
      // during acceleration. The blend supplies one shared landing height.
      const reach=Object.entries(state.weights).reduce((v,[key,w])=>v+w*sets[key].speed/scale/sets[key].rate*sets[key].duty*.5,0);
      const knee=property('landingKnee'),{thigh,shin}=dimensions;
      const length2=thigh*thigh+shin*shin+2*thigh*shin*Math.cos(knee);
      const land=dimensions.ankleHeight+.01+Math.sqrt(Math.max(.3,length2-reach*reach));
      const stance=duty/rate,flight=(.5-duty)/rate,push=property('push');
      const gravity=tuning.gravity/scale,out=gravity*flight/2-push/flight,incoming=out-gravity*flight;
      if(c>=duty){const t=(c-duty)/rate;return land+push+out*t-gravity*t*t/2;}
      const s=clamp(c/duty),s2=s*s,s3=s2*s;
      return (2*s3-3*s2+1)*land+(s3-2*s2+s)*stance*incoming+
        (-2*s3+3*s2)*(land+push)+(s3-s2)*stance*out;
    }
    function groundFeet(sample,dt,moving){
      const targets={},h=dimensions.ankleHeight;
      if(moving){
        const turnStep=clamp(Math.abs(state.turn)/2),travelRate=Object.entries(state.weights).reduce((v,[key,w])=>v+w*Math.max(.55,sets[key].rate+(state.speed-sets[key].speed)*sets[key].slope),0);
        state.cadence=travelRate*clamp(Math.max(state.speed/.7,turnStep));
        const advance=state.cadence*dt;state.phase+=advance;state.cycles+=advance;
        for(const side of sides){
          const f=state.feet[side],c=wrap(state.phase+(side==='right'?.5:0));
          if(!f.plan||c<f.cycle){
            // Freeze geometry for one stride. Changing sets never changes a foot's
            // support boundary half-way through its planted phase.
            f.plan={duty:property('duty'),rate:Math.max(.55,state.cadence),weights:{...state.weights}};
            f.plan.reach=clamp(state.speed/scale/f.plan.rate*f.plan.duty*.5,.02,.54);
            f.earlyLift=false;
          }
          const plan=f.plan,at=local(sample,f.point),yaw=Math.atan2(Math.sin(sample.facing-f.plantFacing),Math.cos(sample.facing-f.plantFacing));
          if(f.support&&(Math.abs(yaw)>.32||Math.abs(at[0]-sign(side)*dimensions.hipWidth)>.23||Math.abs(at[1])>.44))f.earlyLift=true;
          const support=c<plan.duty&&!f.earlyLift;
          if(support){
            if(!f.support){
              // Strike at the substep's actual phase. The last swing ends here with
              // a backwards local tangent, so its world velocity reaches zero.
              f.plantFacing=sample.facing;
              f.groundPoint=world(sample,sign(side)*dimensions.hipWidth,plan.reach-state.speed/scale*c/plan.rate+soleOffset(0,0).z);
            }
            // The forefoot stays on the ground while the heel rises. Holding the
            // ankle fixed during toe-off made the foot rotate through the floor.
            f.pitch=property('toeOff')*ease((c/plan.duty-.25)/.75);f.toe=-f.pitch;
            const sole=soleOffset(f.pitch,f.toe);
            f.point=[f.groundPoint[0]-Math.sin(f.plantFacing)*sole.z*scale,f.groundPoint[1]-Math.cos(f.plantFacing)*sole.z*scale];
            f.height=-sole.y;f.yaw=Math.atan2(Math.sin(sample.facing-f.plantFacing),Math.cos(sample.facing-f.plantFacing));
          }else{
            if(f.support||f.swingStart===undefined){
              f.swingStart=c;f.swingX=at[0];f.swingZ=at[1];f.swingHeight=f.height-h;f.swingPitch=f.pitch;f.swingToe=f.toe;
              // Capture lift-off velocity with the current clock. A live speed
              // divided by an old slow stride rate explodes during a restart.
              f.swingTangent=-state.speed/scale*(1-c)/Math.max(.55,state.cadence);
            }
            const q=clamp((c-f.swingStart)/Math.max(.04,1-f.swingStart));
            const tangent=f.swingTangent;
            const weights=plan.weights,fromSet=prop=>Object.entries(weights).reduce((v,[key,w])=>v+w*(Array.isArray(sets[key][prop])?curve(sets[key][prop],q):sets[key][prop]),0);
            // Match ground velocity only near lift/strike, then recover locally.
            // Extending the endpoint tangent through one full Hermite span made
            // the heel sweep far behind the hips at these fixed travel speeds.
            // Fold the heel behind the hip before bringing the thigh through.
            // Interpolating the foot directly toward strike put BOTH knees in
            // front for a third of every cycle, even with correct foot contacts.
            const boundary=q*(1-q)**20+(q-1)*q**30,back=fromSet('back');
            const z=mix(-back,plan.reach,fromSet('recovery'))+(f.swingZ+back)*(1-ease(q/.2))+tangent*boundary;
            f.point=world(sample,mix(f.swingX,sign(side)*dimensions.hipWidth,ease(q)),z);
            f.height=h+fromSet('heel')+(f.swingHeight||0)*(1-ease(q));
            f.pitch=mix(f.swingPitch,0,ease(q))+fromSet('pitch')*Math.sin(Math.PI*q)**2;
            f.toe=(f.swingToe||0)*(1-ease(q/.25));f.yaw=yaw*(1-ease(q));
          }
          if(support)f.swingStart=undefined;
          f.support=support;f.cycle=c;
          const point=local(sample,f.point);targets[side]={x:point[0],y:f.height,z:point[1],pitch:f.pitch,toe:f.toe,yaw:-f.yaw};
        }
      }else{
        state.cadence=0;state.stopAge+=dt;
        for(const side of sides){
          const f=state.feet[side],first=side===state.settleFirst,start=first?0:.12;
          const q=clamp((state.stopAge-start)/.24),to=world(sample,sign(side)*dimensions.hipWidth,0);
          f.point=q===1?to:[mix(f.from[0],to[0],ease(q)),mix(f.from[1],to[1],ease(q))];
          f.height=h+(1-ease(q))*(f.stopHeight||0)+Math.sin(q*Math.PI)**2*.065;
          f.pitch=mix(f.stopPitch||0,0,ease(q));f.support=q===1;f.toe=0;f.plan=null;
          if(f.support)f.groundPoint=world(sample,sign(side)*dimensions.hipWidth,soleOffset(0,0).z);
          const at=local(sample,f.point);targets[side]={x:at[0],y:f.height,z:at[1],pitch:f.pitch,toe:0};
        }
      }
      return targets;
    }
    function tick(motion,dt,reduced,snap=false){
      const sample=motion.sample,blend=1-Math.exp(-20*dt),priorSpeed=state.speed;
      if(!sample.paused)state.clock+=dt;
      state.speed=mix(state.speed,motion.speed,snap?1:blend);
      const accel=dt?(state.speed-priorSpeed)/dt:0;
      state.accel=mix(state.accel,clamp(accel,-35,35),1-Math.exp(-12*dt));
      const next=chooseGait(state.speed);
      state.entryAge=next==='dash'&&state.gait!=='dash'?0:state.entryAge+dt;state.gait=next;
      for(const name of Object.keys(sets))state.weights[name]=mix(state.weights[name],name===next?1:0,1-Math.exp(-22*dt));
      state.turn=mix(state.turn,clamp(motion.turnRate,-9,9),1-Math.exp(-12*dt));
      const yawDelta=Math.atan2(Math.sin(sample.facing-state.lastFacing),Math.cos(sample.facing-state.lastFacing));
      state.yawLag=clamp((state.yawLag-yawDelta)*Math.exp(-14*dt),-.30,.30);state.lastFacing=sample.facing;
      const air=!sample.grounded&&(motion.takeoffAge!==null||motion.airTime>.18||(motion.airTime>.10&&sample.vertical/scale<-2));
      const domain=sample.paused?'ground':sample.climbing?'climb':sample.gliding?'glide':sample.detaching?'detach':air?'air':'ground';
      const moving=domain==='ground'&&!sample.paused&&sample.charge===0&&(state.speed>.22||Math.abs(state.turn)>.5);
      const changed=domain!==state.domain,transition=changed||moving!==state.moving;
      if(moving&&!state.moving){
        state.phase=state.lead==='left'?0:.5;
        for(const side of sides){const f=state.feet[side];f.support=false;f.plan=null;f.swingStart=undefined;}
      }
      if(!moving&&state.moving){
        state.stopAge=0;state.settleFirst=state.feet.left.support?'right':'left';
        for(const side of sides){const f=state.feet[side];f.from=[...f.point];f.stopHeight=f.height-dimensions.ankleHeight;f.stopPitch=f.pitch;}
      }
      if(motion.takeoffs!==state.takeoffs){state.takeoffs=motion.takeoffs;state.lead=wrap(state.phase)<.5?'right':'left';}
      if(changed&&domain==='ground'){
        state.phase=state.lead==='left'?0:.5;
        for(const side of sides){const f=state.feet[side];
          f.point=world(sample,sign(side)*dimensions.hipWidth,moving?(side===state.lead?.25:-.2):0);
          f.from=[...f.point];f.stopHeight=0;f.stopPitch=0;f.support=false;f.plan=null;f.swingStart=undefined;}
      }
      state.weight=mix(state.weight,moving?1:0,1-Math.exp(-14*dt));
      const p=neutral(),w=state.weight,turn=state.turn;
      if(domain==='ground'){
        const targets=groundFeet(sample,dt,moving);
        const impact=motion.impactSpeed/scale>2&&motion.landingAge!==null&&motion.landingAge<.36?
          curve([[0,0],[.07,1],[.18,.55],[.36,0]],motion.landingAge)*clamp(motion.impactSpeed/scale/9)*.13:0;
        const brake=clamp(-state.accel/25)*(moving?1:1-ease(state.stopAge/.4));
        const entry=curve([[0,0],[.06,1],[.18,.65],[.35,0]],state.entryAge)*w;
        p.pelvisY=mix(dimensions.restPelvis,supportedBody(),w*clamp(state.speed/3))-impact-sample.charge*.21-brake*.045-entry*.025;
        p.pelvisX=Math.sin(state.phase*TAU)*w*.015;
        p.pelvisZ=clamp(state.accel*.0015,-.045,.035);
        p.pelvisYaw=Math.sin(state.phase*TAU)*w*property('twist')+state.yawLag*.55;
        p.pelvisRoll=-Math.sin(state.phase*TAU)*w*.025;
        p.spineX=.035+w*property('lean')+clamp(state.accel*.003,-.075,.10)+sample.charge*.26+impact*.7+entry*.14;
        p.spineY=-Math.sin(state.phase*TAU)*w*property('twist')*.70+state.yawLag*.45;
        p.spineZ=-clamp(turn*.019,-.15,.15)*clamp(state.speed/5);
        p.chestX=-.01+w*property('lean')*.12;
        p.chestY=-Math.sin(state.phase*TAU+.35)*w*property('twist')*.45;
        p.headX=-(p.spineX+p.chestX)*.72;p.headY=clamp(turn*.035,-.28,.28)-p.spineY*.45;p.headZ=-p.spineZ*.65;
        for(const side of sides){
          const c=wrap(state.phase+(side==='right'?.5:0)),arm=property('arm',c)*w;
          p[side+'ShoulderX']=arm*(side==='right'?.58:1)-.04;
          p[side+'ShoulderY']=sign(side)*.06*w;
          p[side+'ShoulderZ']=sign(side)*(.13+(side==='right'?.055:0)+Math.max(0,turn*sign(side))*.012);
          p[side+'Elbow']=-mix(.28,property('elbow'),w)-Math.max(0,-arm)*.24;
          p[side+'WristX']=-arm*.18;p[side+'WristZ']=sign(side)*.035*w;
        }
        p.rightElbow-=.18;
        if(!reduced&&!sample.paused){const breath=Math.sin(state.clock*1.8)*.003*(1-w);p.pelvisY+=breath;p.chestX+=breath*2;}
        // A supporting leg can constrain body height. A recovering leg cannot
        // drag the pelvis down: lift that unweighted foot into its reach instead.
        for(const side of sides){const f=targets[side],dx=f.x-sign(side)*dimensions.hipWidth-p.pelvisX;
          const reach=dimensions.thigh+dimensions.shin-.008;
          if(state.feet[side].support)p.pelvisY=Math.min(p.pelvisY,f.y+.01+Math.sqrt(Math.max(.20,reach*reach-dx*dx-(f.z-p.pelvisZ)**2)));}
        p.footIK=1;
        for(const side of sides){
          const f=targets[side],dx=f.x-sign(side)*dimensions.hipWidth-p.pelvisX,reach=dimensions.thigh+dimensions.shin-.035;
          if(!state.feet[side].support){f.y=Math.max(f.y,p.pelvisY-.01-Math.sqrt(Math.max(.20,reach*reach-dx*dx-(f.z-p.pelvisZ)**2)));state.feet[side].height=f.y;}
          leg(p,side,f);p[side+'FootPitch']=f.pitch;p[side+'FootYaw']=f.yaw||0;
        }
      }else if(domain==='climb'){
        const delta=Math.max(0,motion.climbDistance-state.lastClimb);state.climbPhase+=delta/scale/2.2;
        if(delta>1e-7){
          const velocity=motion.velocity||[0,0,0],speed=Math.max(.01,motion.climbSpeed);
          state.climbVertical=mix(state.climbVertical,clamp(velocity[1]/speed,-1,1),blend);
          state.climbLateral=mix(state.climbLateral,clamp((velocity[0]*Math.cos(sample.facing)-velocity[2]*Math.sin(sample.facing))/speed,-1,1),blend);
        }
        const stroke=state.climbPhase,vertical=state.climbVertical,lateral=state.climbLateral;
        p.pelvisY=dimensions.restPelvis-.055;p.pelvisX=lateral*.045;p.pelvisYaw=Math.sin(stroke*TAU)*.07;
        p.spineX=.11;p.chestY=-Math.sin(stroke*TAU)*.09;p.headX=-.18;p.headY=lateral*.2;
        for(const side of sides){
          const c=wrap(stroke+(side==='right'?.5:0));
          // Dwell/pull/reach, offset between hands and feet. Down and sideways
          // travel change the reach; a held grip preserves every curve's phase.
          const hand=curve([[0,0],[.48,1],[.66,1],[1,0]],c);
          const knee=curve([[0,.2],[.30,.2],[.57,1],[.78,1],[1,.2]],wrap(c+.16));
          p[side+'Hip']=-.72-knee*.40*vertical;p[side+'HipZ']=sign(side)*(.12+knee*.05)+lateral*.12;
          p[side+'Knee']=1.35+knee*.30;p[side+'Ankle']=-.40;
          p[side+'ShoulderX']=-2.72+hand*.43*vertical;
          p[side+'ShoulderZ']=sign(side)*.20+lateral*.16;
          p[side+'Elbow']=-.25-hand*.75;p[side+'WristX']=-.16;
        }
      }else if(domain==='glide'){
        p.pelvisY=dimensions.restPelvis;p.spineX=.10;p.spineZ=-clamp(turn*.045,-.18,.18);p.headX=-.08;p.headZ=-p.spineZ*.5;
        const sway=reduced?0:Math.sin(state.clock*2.2)*.025;
        for(const side of sides){p[side+'ShoulderX']=-2.70;p[side+'ShoulderZ']=sign(side)*.42;p[side+'Elbow']=-.25;
          p[side+'Hip']=.10+sign(side)*sway;p[side+'Knee']=side==='left'?.38:.5;p[side+'Ankle']=-.2;}
      }else{
        const duration=2*Math.max(tuning.jumpSpeed,motion.takeoffUp)/tuning.gravity;
        const progress=motion.takeoffAge===null?.92:clamp(motion.takeoffAge/duration);
        const gather=curve([[0,.1],[.20,1],[.46,.75],[.85,0],[1,0]],progress);
        const reach=curve([[0,0],[.25,.2],[.52,1],[.86,.8],[1,.55]],progress);
        const running=clamp(state.speed/tuning.runSpeed);
        p.pelvisY=dimensions.restPelvis;p.spineX=.04+running*.08+gather*.05-reach*.10;
        p.chestY=(state.lead==='left'?1:-1)*gather*.11;p.headX=-.06;
        for(const side of sides){const lead=side===state.lead;
          p[side+'Hip']=lead?-.10-gather*(.35+running*.28):.12-gather*.13;
          p[side+'Knee']=.17+gather*(lead?1.35:.85);p[side+'Ankle']=.08-gather*.35;
          p[side+'ShoulderX']=lead?-.25-gather*.37:-.13+gather*.12;
          p[side+'ShoulderZ']=sign(side)*(.27+reach*(lead?.58:.75));
          p[side+'Elbow']=lead?-.65-gather*.35:-.35-gather*.20;
        }
        if(domain==='detach'){p.spineX=-.17;p.leftShoulderZ=-.8;p.rightShoulderZ=.8;p.leftHip=.22;p.rightHip=.34;}
      }
      // State changes inherit the current pose. Cycles are not low-pass filtered:
      // contacts survive at full extent, and gait profiles only blend on selection.
      if(transition&&state.pose){state.offset={};for(const key of Object.keys(p))state.offset[key]=state.pose[key]-p[key];state.transitionAge=0;}
      else state.transitionAge+=dt;
      const t=state.transitionAge/.055,decay=(1+t)*Math.exp(-t);
      for(const key of Object.keys(p))p[key]+=(state.offset[key]||0)*decay;
      state.pose=p;state.domain=domain;state.moving=moving;state.lastClimb=motion.climbDistance;
    }
    function result(){return {scale,pose:{...state.pose},phase:state.phase*TAU,cycles:state.cycles,
      climbPhase:state.climbPhase*TAU,domain:state.domain,gait:state.gait,weights:{...state.weights},cadence:state.cadence,
      moving:state.moving,settled:!state.moving&&state.stopAge>=.36,
      feet:Object.fromEntries(sides.map(side=>[side,{point:[...state.feet[side].point],groundPoint:[...state.feet[side].groundPoint],from:[...state.feet[side].from],support:state.feet[side].support,height:state.feet[side].height*scale,pitch:state.feet[side].pitch}]))};}
    function update(motion,dt,reduced=false){
      if(!state)return reset(motion);
      dt=Number.isFinite(dt)?clamp(dt,0,.1):0;if(!dt)return result();
      const before=state.lastSample,after=motion.sample,count=Math.ceil(dt*240),angle=Math.atan2(Math.sin(after.facing-before.facing),Math.cos(after.facing-before.facing));
      const climbStart=state.lastClimb;
      for(let i=1;i<=count;i++){
        const t=i/count,sample={...after,position:after.position.map((n,j)=>mix(before.position[j],n,t)),facing:before.facing+angle*t};
        tick({...motion,sample,climbDistance:mix(climbStart,motion.climbDistance,t)},dt/count,reduced);
      }
      state.lastSample={...after,position:[...after.position]};return result();
    }
    return {reset,update,snapshot:result};
  }
  return Object.freeze({create,dimensions});
});
