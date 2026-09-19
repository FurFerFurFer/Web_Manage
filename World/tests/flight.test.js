'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {Browser}=require('../../tests/lib/cdp');
const {startServer}=require('../tools/serve');

test('ground movement responds promptly and releases into a short smooth stop',{timeout:60000},async t=>{
  const server=await startServer(0);let browser,page;
  try{
    browser=await Browser.launch();page=await browser.newPage();
    await page.session.send('Emulation.setDeviceMetricsOverride',{width:960,height:640,deviceScaleFactor:1,mobile:false});
    await page.goto('http://127.0.0.1:'+server.address().port,{waitFor:()=>!!window.WorldDemo});
    await page.evaluate(()=>document.getElementById('enter').click());
    await page.waitFor(()=>WorldDemo.snapshot().world.grounded);
    const rig=await page.evaluate(()=>{
      const scene=BABYLON.Engine.Instances[0].scenes[0],state=WorldDemo.snapshot().world;
      return {kind:state.character.kind,collider:scene.getMeshByName('player-collider').ellipsoid.asArray(),
        decorative:scene.meshes.filter(mesh=>mesh.name.startsWith('traveler-')).every(mesh=>!mesh.checkCollisions&&!mesh.isPickable),
        leftElbowParent:scene.getTransformNodeByName('traveler-leftElbow').parent.name,
        leftKneeParent:scene.getTransformNodeByName('traveler-leftKnee').parent.name,
        notebookParent:scene.getTransformNodeByName('traveler-notebook').parent.name};
    });
    assert.equal(rig.kind,'articulated-botanical-traveler');assert.equal(rig.decorative,true);
    assert.deepEqual(rig.collider,[.35,.88,.35],'human proportions do not change the collision body');
    assert.equal(rig.leftElbowParent,'traveler-leftShoulder');assert.equal(rig.leftKneeParent,'traveler-leftHip');
    assert.equal(rig.notebookParent,'traveler-carry-socket');
    const animationProof=await page.evaluate(()=>{
      // Execute the real Babylon hierarchy at a stable sample rate as well as the
      // software-rendered route below. Compare ankle positions, not rig metadata alone.
      const B=BABYLON,engine=new B.NullEngine(),scene=new B.Scene(engine),root=new B.TransformNode('test-root',scene);
      const mat=new B.StandardMaterial('test-material',scene),character=createWorldCharacter(scene,root,
        {cloth:mat,skin:mat,boots:mat,gold:mat,book:mat,shadows:{addShadowCaster(){}}});
      const sample=patch=>({position:[0,.9,0],facing:0,vertical:0,grounded:true,climbing:false,gliding:false,detaching:false,sprinting:true,charge:0,paused:false,...patch});
      let motion=WorldCharacterMotion.reset(sample()),x=0,z=0,checks=0,maxError=0,previousBook=null,maxBookStep=0;
      character.reset(motion);
      const gaitProof=[];
      for(const [name,speed] of [['walk',5.2],['jog',8],['run',12],['dash',16.2]]){
        let postureSamples=0,seated=0,lowestPelvis=Infinity,forwardKnee=0;
        let previousFoot=null,previousPelvis=0,loading=null,maxSoleError=0;const pushes=[];
        x=0;z=0;checks=0;maxError=0;motion=WorldCharacterMotion.reset(sample());character.reset(motion);
        for(let i=0;i<1200;i++){
          const facing=Math.max(0,i-180)*.004;x+=Math.sin(facing)*speed/120;z+=Math.cos(facing)*speed/120;
          motion=WorldCharacterMotion.advance(motion,sample({position:[x,.9,z],facing}),1/120);
          root.position.set(x,0,z);root.rotation.y=facing;character.update(motion,1/120);
          const pose=character.snapshot();
          if(i>240){
            // Measure the rendered bones in the actor's facing direction. Passing
            // ankle contacts alone missed the seated silhouette in every gait.
            const forward=new B.Vector3(Math.sin(facing),0,Math.cos(facing));
            const knees=['left','right'].map(side=>{
              const hip=scene.getTransformNodeByName('traveler-'+side+'Hip'),knee=scene.getTransformNodeByName('traveler-'+side+'Knee');
              hip.computeWorldMatrix(true);knee.computeWorldMatrix(true);
              const thigh=knee.getAbsolutePosition().subtract(hip.getAbsolutePosition());
              return B.Vector3.Dot(thigh,forward)/thigh.length();
            });
            const pelvis=scene.getTransformNodeByName('traveler-pelvis');pelvis.computeWorldMatrix(true);
            const height=pelvis.getAbsolutePosition().y-root.position.y,left=pose.animation.feet.left;
            lowestPelvis=Math.min(lowestPelvis,height);
            seated+=Number(knees.every(z=>z>Math.sin(.30)));forwardKnee=Math.max(forwardKnee,...knees);postureSamples++;
            if(left.support&&previousFoot&&!previousFoot.support)loading={low:height};
            if(loading){
              loading.low=Math.min(loading.low,height);
              if(previousFoot?.support&&!left.support){
                pushes.push({velocity:(height-previousPelvis)*120,rise:height-loading.low});loading=null;
              }
            }
            previousFoot=left;previousPelvis=height;
          }
          if(i>240)for(const side of ['left','right']){
            const f=pose.animation.feet[side];if(!f.support)continue;
            const joint=scene.getTransformNodeByName('traveler-'+side+'Ankle');joint.computeWorldMatrix(true);
            const actual=joint.getAbsolutePosition();maxError=Math.max(maxError,Math.hypot(actual.x-f.point[0],actual.y-f.height,actual.z-f.point[1]));checks++;
            const toe=scene.getTransformNodeByName('traveler-'+side+'Toe');toe.computeWorldMatrix(true);
            // The visible toe mesh's bottom, not a contact marker moved by the solver.
            const sole=B.Vector3.TransformCoordinates(new B.Vector3(0,-.05,.045),toe.getWorldMatrix());
            const contact=f.groundPoint||[f.point[0]+Math.sin(facing)*.14,f.point[1]+Math.cos(facing)*.14];
            maxSoleError=Math.max(maxSoleError,Math.hypot(sole.x-contact[0],sole.y,sole.z-contact[1]));
          }
        }
        gaitProof.push({name,checks,maxError,maxSoleError,pushChecks:pushes.length,
          minPushVelocity:Math.min(...pushes.map(p=>p.velocity)),minPushRise:Math.min(...pushes.map(p=>p.rise)),postureSamples,seated:seated/postureSamples,lowestPelvis,
          forwardKneeDegrees:Math.asin(Math.min(1,forwardKnee))*180/Math.PI});
      }
      root.position.setAll(0);root.rotation.setAll(0);motion=WorldCharacterMotion.reset(sample());character.reset(motion);
      const mounts=[];
      for(let i=0;i<150;i++){
        // Includes a reversal before the first transfer finishes.
        const stow=i<10||(i>=20&&i<80);
        motion=WorldCharacterMotion.advance(motion,sample({grounded:!stow,climbing:stow}),1/60);character.update(motion,1/60);
        const book=scene.getTransformNodeByName('traveler-notebook');book.computeWorldMatrix(true);
        const position=book.getAbsolutePosition().clone();if(previousBook)maxBookStep=Math.max(maxBookStep,B.Vector3.Distance(position,previousBook));previousBook=position;
        if(book.scaling.x!==1)throw new Error('notebook changed size');
        if([65,149].includes(i))mounts.push(book.parent.name);
      }
      const result={gaitProof,maxBookStep,mounts,groundSpeeds:[WorldFlight.tuning.walkSpeed,WorldFlight.tuning.runSpeed]};
      scene.dispose();engine.dispose();return result;
    });
    t.diagnostic(JSON.stringify({animationProof}));
    for(const proof of animationProof.gaitProof){
      assert.ok(proof.checks>100,proof.name+' sustained contacts');
      assert.ok(proof.maxError<.025,proof.name+' rendered support ankles must follow contacts through turns, error '+proof.maxError);
      assert.ok(proof.pushChecks>=10,proof.name+' exercises repeated rendered pushes');
      assert.ok(proof.minPushVelocity>.05,proof.name+' rendered body must rise at foot release, velocity '+proof.minPushVelocity);
      assert.ok(proof.minPushRise>.025,proof.name+' rendered body must rise from loading into push-off');
      assert.ok(proof.maxSoleError<.01,proof.name+' forefoot must stay planted through heel rise, error '+proof.maxSoleError);
      assert.ok(proof.seated<.15,proof.name+' rendered thighs both stay forward for '+(proof.seated*100).toFixed(1)+'% of the cycle');
      assert.ok(proof.lowestPelvis>.87,proof.name+' rendered pelvis must not collapse');
      assert.ok(proof.forwardKneeDegrees<{walk:48,jog:50,run:53,dash:55}[proof.name],proof.name+' rendered forward knee envelope');
    }
    assert.ok(animationProof.maxBookStep<.20,'notebook transfer and reversal must not teleport');
    assert.deepEqual(animationProof.mounts,['traveler-stow-socket','traveler-carry-socket']);
    assert.deepEqual(animationProof.groundSpeeds,[5.2,12],'ordinary speed and the distinctly faster sprint are present');
    const travel=await page.evaluate(()=>new Promise(resolve=>{
      const canvas=document.getElementById('world'),key=(code,type)=>canvas.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true}));
      let start=WorldDemo.snapshot().world,release=null;
      key('ShiftLeft','keydown');key('KeyW','keydown');
      function sample(){
        const state=WorldDemo.snapshot().world;
        if(!release&&state.environment.elapsed-start.environment.elapsed>=.6){
          release=state;key('KeyW','keyup');key('ShiftLeft','keyup');
        }else if(release&&state.environment.elapsed-release.environment.elapsed>=.4){
          resolve({run:release.position[2]-start.position[2],coast:state.position[2]-release.position[2],
            runMode:release.characterMotion.mode,stopMode:state.characterMotion.mode,
            travel:state.characterMotion.distance-start.characterMotion.distance,runSpeed:WorldFlight.tuning.runSpeed});return;
        }
        requestAnimationFrame(sample);
      }requestAnimationFrame(sample);
    }));
    t.diagnostic(JSON.stringify(travel));
    assert.ok(travel.coast>0&&travel.coast/travel.runSpeed<.05,'released sprint preserves the short stopping response at its new speed, measured '+travel.coast);
    assert.ok(travel.run>2.8,'starts remain responsive, measured '+travel.run);
    assert.equal(travel.runMode,'sprint');assert.equal(travel.stopMode,'idle');
    assert.ok(Math.abs(travel.travel-travel.run-travel.coast)<.03,'animation travel follows the collision body');
    // Rewritten on 2026-09-13: Shift is no longer a toggle. One press is a dash, and
    // the hold-to-lock / short-dash-unsprint half is covered in the sprint stamina case
    // below, which can let real time pass. What belongs here is unchanged in spirit --
    // one press does one thing, key repeats do not repeat it, and typing cannot move.
    const dashRules=await page.evaluate(()=>{
      const canvas=document.getElementById('world'),key=(code,type,repeat=false)=>canvas.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true,repeat}));
      const cost=WorldStamina.tuning.dashCost,before=WorldDemo.snapshot().world.stamina.value;
      key('ShiftRight','keydown');const afterPress=WorldDemo.snapshot().world.stamina.value;
      key('ShiftRight','keydown',true);const afterRepeat=WorldDemo.snapshot().world.stamina.value;
      key('ShiftRight','keyup');
      const tapped=WorldDemo.snapshot().world.sprint;
      document.querySelector('[data-panel="notebook"]').click();document.querySelector('[data-note-id]').click();
      const typingBefore=WorldDemo.snapshot().world.stamina.value;
      document.getElementById('note-draft').dispatchEvent(new KeyboardEvent('keydown',{code:'ShiftLeft',bubbles:true}));
      const round=n=>Number(n.toFixed(3));
      return {cost,spent:round(before-afterPress),repeatSpent:round(afterPress-afterRepeat),
        locked:tapped.locked,typingSpent:round(typingBefore-WorldDemo.snapshot().world.stamina.value)};
    });
    t.diagnostic(JSON.stringify(dashRules));
    assert.equal(dashRules.spent,dashRules.cost,'one press is one dash, charged once');
    assert.equal(dashRules.repeatSpent,0,'a held key’s repeats do not dash again');
    assert.equal(dashRules.locked,false,'a tap never locks the run');
    assert.equal(dashRules.typingSpent,0,'typing in a companion cannot dash');
    await page.evaluate(()=>{document.getElementById('close-panel').click();document.getElementById('world').focus();});
    // Shift is HELD from here: running is a held dash that locks, not a toggle, and the
    // running-jump assertions below need the run speed.
    await page.evaluate(()=>{const canvas=document.getElementById('world');
      canvas.dispatchEvent(new KeyboardEvent('keydown',{code:'ShiftLeft',bubbles:true}));
      canvas.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyS',bubbles:true}));});
    await page.waitFor(()=>{
      const leg=BABYLON.Engine.Instances[0].scenes[0].getTransformNodeByName('traveler-leftHip');
      return WorldDemo.snapshot().world.grounded&&WorldDemo.snapshot().world.motion.velocity[2]<-5.5&&Math.abs(leg.rotation.x)>.18;
    });
    const jump=await page.evaluate(()=>new Promise(resolve=>{
      const canvas=document.getElementById('world'),leg=BABYLON.Engine.Instances[0].scenes[0].getTransformNodeByName('traveler-leftHip');
      let before=null,takeoffs=0;
      function sample(){
        const state=WorldDemo.snapshot().world;
        // Dispatch on this grounded frame. A CDP round trip can otherwise advance
        // over a tread, and !grounded alone mistakes that tiny drop for the jump.
        if(before===null&&state.grounded&&state.motion.velocity[2]<-5.5){
          before=leg.rotation.x;takeoffs=state.characterMotion.takeoffs;
          canvas.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',bubbles:true}));
          canvas.dispatchEvent(new KeyboardEvent('keyup',{code:'Space',bubbles:true}));
        }else if(before!==null&&state.characterMotion.takeoffs>takeoffs){
          canvas.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyS',bubbles:true}));
          resolve({before,after:leg.rotation.x,speed:state.motion.velocity[2],animation:state.characterMotion,pose:state.character});return;
        }requestAnimationFrame(sample);
      }requestAnimationFrame(sample);
    }));
    assert.ok(Math.abs(jump.after)>.005,'the running leg pose blends into the jump instead of snapping to zero');
    t.diagnostic(JSON.stringify({takeoffHip:{before:jump.before,after:jump.after},takeoffAge:jump.animation.takeoffAge}));
    assert.ok(Math.abs(jump.after-jump.before)<.85,'the articulated hip blends into its airborne pose, delta '+Math.abs(jump.after-jump.before));
    assert.ok(jump.pose.joints.leftKnee[0]>0&&jump.pose.joints.rightKnee[0]>0,'knees articulate instead of swinging rigid legs');
    assert.ok(Object.values(jump.pose.joints).flat().every(Number.isFinite),'rendered joint transforms remain finite');
    assert.ok(jump.speed<-5.5,'a running jump keeps its horizontal speed');
    assert.equal(jump.animation.mode,'jump');assert.equal(jump.animation.notebook,'carried');
    await page.waitFor(()=>WorldDemo.snapshot().world.grounded);
    assert.ok(await page.evaluate(()=>WorldDemo.snapshot().world.characterMotion.landings>0),'landing event reaches the animation feed');
    assert.equal(await page.evaluate(()=>WorldDemo.snapshot().fixtureUnchanged),true);
    assert.deepEqual(page.errors,[]);
  }finally{if(page?.errors.length)t.diagnostic(JSON.stringify(page.errors));if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
});

test('sprint handoff regressions: exhaustion and visible instructions',{timeout:60000},async t=>{
  const server=await startServer(0);let browser,page;
  try{
    browser=await Browser.launch();page=await browser.newPage();
    await page.session.send('Emulation.setDeviceMetricsOverride',{width:960,height:640,deviceScaleFactor:1,mobile:false});
    // A supported fixture with no active streak; the stamina rules themselves are
    // unchanged. The default five-day fixture recovers too slowly to expose this bug.
    await page.session.send('Page.addScriptToEvaluateOnNewDocument',{source:`
      Object.defineProperty(window,'WorldDemoCore',{configurable:true,set(api){
        Object.defineProperty(window,'WorldDemoCore',{value:{...api,
          fixture(...args){return {...api.fixture(...args),linChanges:[]};}
        },configurable:true});
      }});`});
    await page.goto('http://127.0.0.1:'+server.address().port,{waitFor:()=>!!window.WorldDemo});
    await t.test('canvas, hint and help describe dash and hold instead of the superseded toggle',async()=>{
      const surfaces=await page.evaluate(()=>{
        document.querySelector('[data-panel="help"]').click();
        const surfaces={canvas:document.getElementById('world').getAttribute('aria-label'),
          hint:document.querySelector('.control-hint').textContent,help:document.getElementById('panel-content').textContent};
        document.getElementById('close-panel').click();return surfaces;
      });
      const incorrect=Object.entries(surfaces).filter(([,text])=>/toggle sprint|sprint on\s*\/\s*off/i.test(text)||!/dash/i.test(text)||!/hold/i.test(text)).map(([name])=>name);
      assert.deepEqual(incorrect,[],'every instruction surface must explain the current Shift action');
    });
    await page.evaluate(()=>document.getElementById('enter').click());
    await page.waitFor(()=>WorldDemo.snapshot().world.grounded);
    await t.test('an exhausting dash discards its hold before recovery can lock running',async()=>{
      const result=await page.evaluate(()=>new Promise(resolve=>{
        const canvas=document.getElementById('world'),key=type=>canvas.dispatchEvent(new KeyboardEvent(type,{code:'ShiftLeft',bubbles:true}));
        key('keydown');key('keyup');key('keydown');
        const start=WorldDemo.snapshot().world;
        (function sample(){const state=WorldDemo.snapshot().world;
          if(state.environment.elapsed-start.environment.elapsed>=1.3){
            key('keyup');resolve({initial:start.stamina,after:state.stamina,sprint:state.sprint});return;
          }requestAnimationFrame(sample);
        })();
      }));
      t.diagnostic(JSON.stringify({exhaustingDash:result}));
      assert.equal(result.initial.max,2,'exercise the real zero-streak budget');
      assert.equal(result.initial.exhausted,true,'the held dash emptied that budget');
      assert.equal(result.after.exhausted,false,'recovery has passed the resume threshold');
      assert.equal(result.sprint.locked,false,'an exhausting dash must not re-lock without a fresh press');
      assert.equal(result.sprint.held,false,'the old physical hold is discarded on exhaustion');
      const fresh=await page.evaluate(()=>{
        const canvas=document.getElementById('world');canvas.dispatchEvent(new KeyboardEvent('keydown',{code:'ShiftLeft',bubbles:true}));
        const state=WorldDemo.snapshot().world;canvas.dispatchEvent(new KeyboardEvent('keyup',{code:'ShiftLeft',bubbles:true}));return state.sprint;
      });
      assert.equal(fresh.held,true,'a fresh press works after recovery');
      assert.ok(fresh.speed>12,'the fresh press still produces the unchanged dash');
    });
    assert.equal(await page.evaluate(()=>WorldDemo.snapshot().fixtureUnchanged),true);
    assert.deepEqual(page.errors,[]);
  }finally{if(page?.errors.length)t.diagnostic(JSON.stringify(page.errors));if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
});

test('playable flight route: deliberate launch, two islands, unpaused reading and safe recovery',{timeout:240000},async t=>{
  const server=await startServer(0);let browser,page;
  try{
    browser=await Browser.launch();page=await browser.newPage();
    await page.session.send('Emulation.setDeviceMetricsOverride',{width:960,height:640,deviceScaleFactor:1,mobile:false});
    await page.goto('http://127.0.0.1:'+server.address().port,{waitFor:()=>!!window.WorldDemo});
    assert.equal(await page.evaluate(()=>WorldDemo.ready),true);
    const click=selector=>page.evaluate(sel=>document.querySelector(sel).click(),selector);
    const state=()=>page.evaluate(()=>WorldDemo.snapshot().world);
    const key=(code,type='keydown')=>page.evaluate(({code,type})=>document.getElementById('world').dispatchEvent(new KeyboardEvent(type,{code,bubbles:true})),{code,type});
    const wait=predicate=>page.waitFor(predicate,{timeout:45000});
    const capture=async name=>{const result=await page.session.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('/tmp/track-world-'+name+'.png',Buffer.from(result.data,'base64'));};
    // Stop on a rendered frame, not after a CDP round trip: at low software-renderer
    // frame rates that round trip could walk past the narrow gateway pillar.
    const walkTo=(code,axis,value)=>page.evaluate(({code,axis,value})=>new Promise(resolve=>{
      const canvas=document.getElementById('world');let released=null;
      canvas.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));
      function sample(){
        const state=WorldDemo.snapshot().world;
        if(released===null&&state.position[axis]>=value){
          canvas.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));released=state.environment.elapsed;
        }else if(released!==null&&state.environment.elapsed-released>=.3){resolve();return;}
        requestAnimationFrame(sample);
      }requestAnimationFrame(sample);
    }),{code,axis,value});
    await click('#enter');
    await wait(()=>WorldDemo.snapshot().world.grounded);
    await t.test('ordinary jumps ignore a second Space press instead of deploying the glider',async()=>{
      await key('Space');await wait(()=>!WorldDemo.snapshot().world.grounded&&WorldDemo.snapshot().world.vertical>0);
      await key('Space','keyup');await key('Space');await key('Space','keyup');
      await page.waitFor(()=>WorldDemo.snapshot().world.vertical<0,{timeout:10000});
      assert.equal((await state()).flight.gliding,false);
      await wait(()=>WorldDemo.snapshot().world.grounded);
    });
    await t.test('Space grabs the wall first, climbing owns input, and Space detaches outward without gliding',async()=>{
      await walkTo('KeyD',0,5.85);await walkTo('KeyW',2,16.85);
      await page.evaluate(()=>{
        window.climbCameraProbe={running:true,close:0,blocked:0};
        const scene=BABYLON.Engine.Instances[0].scenes[0],head=scene.getMeshByName('traveler-head');
        function sample(){
          const probe=window.climbCameraProbe;if(!probe.running)return;
          const position=WorldDemo.snapshot().world.position;
          const distance=BABYLON.Vector3.Distance(scene.activeCamera.position,new BABYLON.Vector3(position[0],position[1]+.65,position[2]));
          if(distance<1.5){probe.close++;if(head.visibility>=.5)probe.blocked++;}
          requestAnimationFrame(sample);
        }requestAnimationFrame(sample);
      });
      const approach=await state();
      await key('Space');await key('Space','keyup');
      const grabbed=await state();
      assert.equal(grabbed.flight.climbing,true,'Space grabs the approached wall: '+JSON.stringify({before:approach.position,facing:approach.motion.facing,after:grabbed.position,flight:grabbed.flight}));
      assert.equal(grabbed.flight.gliding,false);
      assert.ok(grabbed.flight.wallNormal[2]<-.9,'normal points away from the gateway wall');
      await key('KeyE');await wait(()=>WorldDemo.snapshot().world.yaw>Math.PI-.1);await key('KeyE','keyup');
      await wait(()=>window.climbCameraProbe.close>3);
      await capture('climb-close-camera');
      await key('Home');await key('Home','keyup');
      await key('KeyW');await wait(()=>WorldDemo.snapshot().world.position[1]>5.25);await key('KeyW','keyup');
      await click('[data-panel="notebook"]');await click('[data-note-id]');
      const held=await state();
      await page.evaluate(()=>{const input=document.getElementById('note-draft');input.focus();input.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',bubbles:true}));});
      await page.waitFor(elapsed=>WorldDemo.snapshot().world.environment.elapsed>elapsed+.5,{args:[held.environment.elapsed],timeout:10000});
      const reading=await state();assert.equal(reading.flight.climbing,true);assert.ok(Math.abs(reading.position[1]-held.position[1])<.02);
      assert.equal(reading.characterMotion.mode,'climb');assert.equal(reading.characterMotion.climbSpeed,0);
      assert.equal(reading.characterMotion.notebook,'stowed');
      assert.equal(reading.character.notebook,'stowed');assert.ok(reading.character.notebookScale>.95,'stowing retains a visible book');
      assert.ok(reading.character.joints.leftShoulder[0]<-2&&reading.character.joints.rightShoulder[0]<-2,'both arms reach above the shoulders');
      assert.ok(reading.character.joints.leftKnee[0]>1&&reading.character.joints.rightKnee[0]>1,'climbing bends both knees');
      assert.equal(await page.evaluate(()=>BABYLON.Engine.Instances[0].scenes[0].getTransformNodeByName('traveler-notebook').parent.name),'traveler-stow-socket');
      await capture('climbing');
      await click('#close-panel');await page.evaluate(()=>document.getElementById('world').focus());
      const before=await state();assert.ok(before.flight.clearance>=before.flight.minGlideHeight,'this grip is high enough to glide, but detachment must win');
      await key('Space');await key('Space','keyup');
      await page.waitFor(z=>WorldDemo.snapshot().world.position[2]<z-.25,{args:[before.position[2]],timeout:10000});
      const detached=await state();assert.equal(detached.flight.climbing,false);assert.equal(detached.flight.gliding,false);
      assert.ok(detached.characterMotion.detachments>0,'a detach event survives until the rendered frame');
      assert.equal(detached.characterMotion.notebook,'carried');
      assert.ok(detached.position[1]<=before.position[1]+.3,'the outward push is small, not a full jump');
      await wait(()=>WorldDemo.snapshot().world.grounded);
      await walkTo('KeyW',2,16.85);
      await key('Space');await key('Space','keyup');await wait(()=>WorldDemo.snapshot().world.flight.climbing);
      await key('KeyW');await wait(()=>WorldDemo.snapshot().world.grounded&&WorldDemo.snapshot().world.position[1]>6);await key('KeyW','keyup');
      assert.equal((await state()).flight.climbing,false,'upward input can step onto the reached ledge');
      assert.equal((await state()).flight.gliding,false);
      const framing=await page.evaluate(()=>{window.climbCameraProbe.running=false;return window.climbCameraProbe;});
      assert.ok(framing.close>3,'the route exercises a camera squeezed between the traveler and wall');
      assert.equal(framing.blocked,0,'close collision camera must not fill the view with the opaque avatar');
      await capture('climb-ledge');
    });
    await click('#try-flight-welcome');
    await wait(()=>WorldDemo.snapshot().world.flight.pad==='garden');
    await t.test('a reading panel cancels charge without releasing it later',async()=>{
      await key('KeyX');await wait(()=>WorldDemo.snapshot().world.flight.charge>.4);
      const before=await state();
      await click('[data-panel="notebook"]');await key('KeyX','keyup');
      await page.waitFor(elapsed=>WorldDemo.snapshot().world.environment.elapsed>elapsed+.5,{args:[before.environment.elapsed],timeout:15000});
      assert.equal((await state()).flight.charge,0);assert.equal((await state()).grounded,true);
      await click('#close-panel');await page.evaluate(()=>document.getElementById('world').focus());
      assert.ok(Math.abs((await state()).position[1]-before.position[1])<.05);
    });
    await key('KeyX');await wait(()=>WorldDemo.snapshot().world.flight.charge===1);
    await capture('launch-charge');await key('KeyX','keyup');await key('KeyW');
    await wait(()=>WorldDemo.snapshot().world.flight.gliding);
    assert.ok((await state()).position[1]>25,'charged launch reaches above the first island');
    assert.equal((await state()).gliderVisible,true);
    assert.equal((await state()).characterMotion.mode,'glide');
    assert.equal((await state()).characterMotion.notebook,'stowed');
    await wait(()=>WorldDemo.snapshot().world.character.notebook==='stowed'&&WorldDemo.snapshot().world.character.joints.leftShoulder[0]<-2.5);
    assert.ok((await state()).character.joints.rightShoulder[0]<-2.5,'both gliding arms rise toward the canopy cords');
    await capture('island-flight');
    await wait(()=>WorldDemo.snapshot().world.position[2]>=55.4);await key('KeyW','keyup');
    await t.test('gliding keeps descending while the notebook owns keyboard input',async()=>{
      await click('[data-panel="notebook"]');await click('[data-note-id]');
      const before=await state();
      await page.evaluate(()=>{const input=document.getElementById('note-draft');input.focus();input.value='Flying notes · ไทย';input.dispatchEvent(new Event('input',{bubbles:true}));for(const code of ['KeyX','Space','KeyQ'])input.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));});
      await wait(()=>WorldDemo.snapshot().world.grounded&&WorldDemo.snapshot().world.flight.island==='cloudrest');
      const landed=await state();
      assert.ok(landed.position[1]<before.position[1]);assert.equal(landed.yaw,before.yaw);
      assert.equal(landed.flight.gliding,false);assert.equal(landed.gliderVisible,false);
      assert.equal(landed.characterMotion.notebook,'carried');assert.ok(landed.characterMotion.landings>0);
      await wait(()=>WorldDemo.snapshot().world.character.notebook==='carried'&&WorldDemo.snapshot().world.character.notebookScale>.95);
      assert.equal(await page.evaluate(()=>BABYLON.Engine.Instances[0].scenes[0].getTransformNodeByName('traveler-notebook').parent.name),'traveler-carry-socket');
      assert.deepEqual(landed.flight.visited,['cloudrest']);
      assert.equal(await page.evaluate(()=>document.getElementById('note-draft').value),'Flying notes · ไทย');
      await click('#close-panel');await page.evaluate(()=>document.getElementById('world').focus());
    });
    await capture('cloudrest');
    await t.test('height means clearance above the island, not absolute world altitude',async()=>{
      await key('Space');await wait(()=>!WorldDemo.snapshot().world.grounded&&WorldDemo.snapshot().world.vertical>0);
      await key('Space','keyup');await key('Space');await key('Space','keyup');
      await page.waitFor(()=>WorldDemo.snapshot().world.vertical<0,{timeout:10000});
      assert.equal((await state()).flight.gliding,false);
      await wait(()=>WorldDemo.snapshot().world.grounded);
    });
    await key('KeyD');await wait(()=>WorldDemo.snapshot().world.position[0]>5.2);
    await key('Space');await wait(()=>!WorldDemo.snapshot().world.grounded&&WorldDemo.snapshot().world.vertical>0);
    await key('Space','keyup');await wait(()=>WorldDemo.snapshot().world.position[0]>7.5);await key('Space');await key('Space','keyup');
    await wait(()=>WorldDemo.snapshot().world.position[0]>=20.5);await key('KeyD','keyup');
    await wait(()=>WorldDemo.snapshot().world.grounded&&WorldDemo.snapshot().world.flight.island==='windward');
    assert.deepEqual((await state()).flight.visited,['cloudrest','windward']);
    await capture('windward');
    await t.test('missing an island returns to the last solid checkpoint',async()=>{
      await key('KeyW');await wait(()=>WorldDemo.snapshot().world.position[2]>61);
      await key('Space');await wait(()=>!WorldDemo.snapshot().world.grounded&&WorldDemo.snapshot().world.vertical>0);await key('Space','keyup');
      await wait(()=>WorldDemo.snapshot().world.position[2]>63.5);await key('Space');await key('Space','keyup');
      await wait(()=>WorldDemo.snapshot().world.position[2]>78);await key('KeyW','keyup');
      if((await state()).flight.gliding){await key('Space');await key('Space','keyup');}
      await wait(()=>WorldDemo.snapshot().world.grounded&&WorldDemo.snapshot().world.flight.island==='windward');
      const recovered=await state();assert.ok(Math.abs(recovered.position[0]-21)<.1&&Math.abs(recovered.position[2]-57)<.1);
      assert.equal(recovered.flight.charge,0);assert.equal(recovered.flight.gliding,false);
    });
    await click('[data-panel="map"]');
    const atlas=await page.evaluate(()=>WorldDemo.snapshot().map.landmarks);
    assert.ok(atlas.find(p=>p.id==='cloudrest').y>19&&atlas.find(p=>p.id==='windward').y>12,'map uses actual landing surfaces');
    await capture('island-map');
    assert.equal(await page.evaluate(()=>WorldDemo.snapshot().fixtureUnchanged),true);
    assert.deepEqual(page.errors,[]);
  }finally{if(page?.errors.length)t.diagnostic(JSON.stringify(page.errors));if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
});

test('Shift dashes, a hold locks running, a short dash unsprints, and the bar rides beside the character',{timeout:180000},async t=>{
  const server=await startServer(0);let browser,page;
  try{
    browser=await Browser.launch();page=await browser.newPage();
    await page.session.send('Emulation.setDeviceMetricsOverride',{width:960,height:640,deviceScaleFactor:1,mobile:false});
    await page.goto('http://127.0.0.1:'+server.address().port,{waitFor:()=>!!window.WorldDemo});
    await page.evaluate(()=>document.getElementById('enter').click());
    await page.waitFor(()=>WorldDemo.snapshot().world.grounded);
    // The synthetic fixture holds five consecutive active LIN days and a sixth that is
    // only a stage revert, so the streak the budget is read from is five.
    const start=await page.evaluate(()=>({stamina:WorldDemo.snapshot().world.stamina,
      streakBudget:WorldStamina.budgetFor(5),tuning:WorldStamina.tuning,
      speeds:{walk:WorldFlight.tuning.walkSpeed,run:WorldFlight.tuning.runSpeed},
      hidden:document.getElementById('sprint-stamina').hidden}));
    t.diagnostic(JSON.stringify(start));
    assert.equal(start.stamina.max,start.streakBudget,'the five-day synthetic KS03 streak sets the budget');
    assert.ok(Math.abs(start.streakBudget-16/3)<1e-6,'the budget is one third of the first pass, measured '+start.streakBudget);
    assert.equal(start.hidden,true,'a full, unused bar stays out of the way');
    // 1. A TAP is a dash: faster than running, then settling back to a walk.
    const tap=await page.evaluate(()=>new Promise(resolve=>{
      const canvas=document.getElementById('world'),key=(code,type)=>canvas.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true}));
      key('KeyW','keydown');key('ShiftLeft','keydown');key('ShiftLeft','keyup');
      const began=WorldDemo.snapshot().world.environment.elapsed;
      let peak=0;
      function sample(){
        const state=WorldDemo.snapshot().world,now=state.environment.elapsed;
        peak=Math.max(peak,Math.hypot(state.motion.velocity[0],state.motion.velocity[2]));
        if(now-began>=2.2){
          key('KeyW','keyup');
          resolve({peak,settled:Math.hypot(state.motion.velocity[0],state.motion.velocity[2]),
            locked:state.sprint.locked,sprinting:state.sprinting});return;
        }
        requestAnimationFrame(sample);
      }requestAnimationFrame(sample);
    }));
    t.diagnostic(JSON.stringify(tap));
    assert.ok(tap.peak>start.speeds.run,'a dash is faster than the ordinary running speed, measured '+tap.peak);
    assert.equal(tap.locked,false,'a tap never locks the run');
    assert.ok(Math.abs(tap.settled-start.speeds.walk)<.4,'a tap settles back to WALKING, measured '+tap.settled);
    assert.equal(tap.sprinting,false,'and stops reading as sprinting');
    // 2. A HOLD past x locks running, and letting go of Shift does not stop it.
    const hold=await page.evaluate(()=>new Promise(resolve=>{
      const canvas=document.getElementById('world'),key=(code,type)=>canvas.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true}));
      key('KeyW','keydown');key('ShiftLeft','keydown');
      const began=WorldDemo.snapshot().world.environment.elapsed;
      let early=null;
      function sample(){
        const state=WorldDemo.snapshot().world,now=state.environment.elapsed;
        if(early===null&&now-began>=WorldStamina.tuning.dashSeconds*.5)early=state.sprint.locked;
        if(now-began>=WorldStamina.tuning.dashSeconds+.4){
          key('ShiftLeft','keyup');
          const released=WorldDemo.snapshot().world;
          resolve({early,locked:released.sprint.locked,held:released.sprint.held,
            speed:Math.hypot(released.motion.velocity[0],released.motion.velocity[2])});return;
        }
        requestAnimationFrame(sample);
      }requestAnimationFrame(sample);
    }));
    t.diagnostic(JSON.stringify(hold));
    assert.equal(hold.early,false,'the lock waits for the full dash time');
    assert.equal(hold.locked,true,'holding past x LOCKS running');
    assert.equal(hold.held,false,'the key is released');
    assert.ok(Math.abs(hold.speed-start.speeds.run)<1,'and running continues at the running speed, measured '+hold.speed);
    const kept=await page.evaluate(()=>new Promise(resolve=>{
      const began=WorldDemo.snapshot().world.environment.elapsed;
      (function sample(){
        const state=WorldDemo.snapshot().world;
        if(state.environment.elapsed-began>=1){resolve({locked:state.sprint.locked,
          speed:Math.hypot(state.motion.velocity[0],state.motion.velocity[2])});return;}
        requestAnimationFrame(sample);
      })();
    }));
    assert.equal(kept.locked,true,'releasing Shift after the lock does not unsprint');
    assert.ok(kept.speed>start.speeds.walk+1,'the run keeps its speed with no key held, measured '+kept.speed);
    // 3. The bar rides beside the character, not pinned under the screen.
    const anchored=await page.evaluate(()=>{
      const bar=document.getElementById('sprint-stamina'),rect=bar.getBoundingClientRect();
      return {hidden:bar.hidden,left:bar.style.left,top:bar.style.top,x:rect.left,y:rect.top,
        state:bar.dataset.state,bottomGap:innerHeight-rect.bottom,
        width:Math.round(rect.width),height:Math.round(rect.height),
        fill:document.getElementById('sprint-stamina-bar').style.height,
        valueNow:Number(bar.getAttribute('aria-valuenow'))};
    });
    t.diagnostic(JSON.stringify(anchored));
    assert.equal(anchored.hidden,false,'the bar shows while the budget is being spent');
    assert.ok(/px$/.test(anchored.left)&&/px$/.test(anchored.top),'it is placed from the world projection');
    assert.ok(anchored.bottomGap>120,'it rides beside the character, not along the bottom of the screen');
    assert.equal(anchored.state,'running');
    assert.ok(anchored.height>anchored.width*3,'the bar is VERTICAL, measured '+anchored.width+'x'+anchored.height);
    assert.ok(/%$/.test(anchored.fill),'the fill is driven by height, measured '+anchored.fill);
    assert.ok(anchored.valueNow<100&&anchored.valueNow>0,
      'and it reports the spent budget, measured '+anchored.valueNow+'%');
    // The camera follows the traveler, so moving does not shift them on screen. What
    // actually distinguishes "beside the character" from "pinned to the screen" is that
    // the bar sits at the character's OWN projected position, and to their side.
    const tracks=await page.evaluate(()=>{
      const bar=document.getElementById('sprint-stamina'),rect=bar.getBoundingClientRect();
      const projection=WorldDemo.snapshot().world.player;
      return {anchorGap:Math.abs(parseFloat(bar.style.left)-projection.x)+Math.abs(parseFloat(bar.style.top)-projection.y),
        toTheSide:rect.left-projection.x,verticallyLevel:Math.abs(rect.top+rect.height/2-projection.y),
        inView:projection.inView};
    });
    t.diagnostic(JSON.stringify(tracks));
    assert.equal(tracks.inView,true);
    assert.ok(tracks.anchorGap<1,'the bar is anchored to the character’s own projected position, off by '+tracks.anchorGap+'px');
    // 46px at the default camera distance clears a traveler roughly 50px wide on screen;
    // the user asked for it shifted right specifically so it stops obstructing the model.
    assert.ok(tracks.toTheSide>30,'it clears the character model rather than overlapping it, measured '+tracks.toTheSide+'px');
    assert.ok(tracks.verticallyLevel<12,'and level with them rather than below, off by '+tracks.verticallyLevel+'px');
    // 4. A SHORT dash is the only unsprint.
    const unsprint=await page.evaluate(()=>new Promise(resolve=>{
      const canvas=document.getElementById('world'),key=(code,type)=>canvas.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true}));
      const lockedBefore=WorldDemo.snapshot().world.sprint.locked;
      key('ShiftLeft','keydown');key('ShiftLeft','keyup');
      const began=WorldDemo.snapshot().world.environment.elapsed;
      // Reverse inside the garden and re-press every frame: running off an edge trips a
      // checkpoint recovery, which clears held input and would read as a dead stop.
      let leg='KeyW',flipped=began;
      (function sample(){
        const state=WorldDemo.snapshot().world,now=state.environment.elapsed;
        key(leg,'keydown');
        if(now-flipped>1.1){key(leg,'keyup');leg=leg==='KeyW'?'KeyS':'KeyW';flipped=now;key(leg,'keydown');}
        if(now-began>=2.4){
          resolve({lockedBefore,locked:state.sprint.locked,
            speed:Math.hypot(state.motion.velocity[0],state.motion.velocity[2]),
            settled:state.sprint.speed,sprinting:state.sprinting,
            position:state.position.map(n=>Number(n.toFixed(1)))});
          key(leg,'keyup');return;
        }
        requestAnimationFrame(sample);
      })();
    }));
    t.diagnostic(JSON.stringify(unsprint));
    assert.equal(unsprint.lockedBefore,true,'the run was still locked before the short dash');
    assert.equal(unsprint.locked,false,'a short dash is the unsprint');
    assert.ok(Math.abs(unsprint.settled-start.speeds.walk)<.1,
      'the sprint decays back to the walking speed, measured '+unsprint.settled);
    assert.equal(unsprint.sprinting,false,'and the traveler stops reading as sprinting');
    // Terrain can slow the body further -- what must not happen is that it kept running.
    assert.ok(unsprint.speed<start.speeds.walk+.4,'the body is no longer running, measured '+unsprint.speed);
    // 5. Dashing while exhausted is refused outright.
    const drained=await page.evaluate(()=>new Promise(resolve=>{
      const canvas=document.getElementById('world'),key=(code,type)=>canvas.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true}));
      const began=WorldDemo.snapshot().world.environment.elapsed;
      (function sample(){
        const state=WorldDemo.snapshot().world,now=state.environment.elapsed;
        if(state.stamina.exhausted||now-began>30){
          const before=WorldDemo.snapshot().world;
          key('ShiftLeft','keydown');key('ShiftLeft','keyup');
          const after=WorldDemo.snapshot().world;
          const result={exhausted:before.stamina.exhausted,value:before.stamina.value,seconds:Number((now-began).toFixed(2)),
            dashed:after.sprint.speed>before.sprint.speed+.5,locked:after.sprint.locked};
          // The HUD is written on its own ~0.1 s tick, so let two of them pass before
          // reading it back: asserting immediately races the tick, not the rule.
          const settled=now;
          (function wait(){
            if(WorldDemo.snapshot().world.environment.elapsed-settled>=.3){
              result.state=document.getElementById('sprint-stamina').dataset.state;resolve(result);return;
            }
            requestAnimationFrame(wait);
          })();
          return;
        }
        key('ShiftLeft','keydown');key('ShiftLeft','keyup');
        requestAnimationFrame(sample);
      })();
    }));
    t.diagnostic(JSON.stringify(drained));
    assert.equal(drained.exhausted,true,'repeated dashing runs the budget dry: '+JSON.stringify(drained));
    assert.equal(drained.dashed,false,'an exhausted budget refuses the dash outright');
    assert.equal(drained.locked,false,'and a refused press cannot lock running');
    assert.equal(drained.state,'empty');
    await page.waitFor(()=>!WorldDemo.snapshot().world.stamina.exhausted,
      {timeout:60000,message:'walking should recover past the resume threshold'});
    const back=await page.evaluate(()=>{
      const canvas=document.getElementById('world'),key=(code,type)=>canvas.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true}));
      const before=WorldDemo.snapshot().world.sprint.speed;
      key('ShiftLeft','keydown');key('ShiftLeft','keyup');
      return {dashed:WorldDemo.snapshot().world.sprint.speed>before+.5};
    });
    assert.equal(back.dashed,true,'the dash returns once stamina passes the resume threshold');
    // Reference data only: a movement budget must never write a Track record.
    assert.equal(await page.evaluate(()=>WorldDemo.snapshot().fixtureUnchanged),true,
      'sprint stamina reads the synthetic streak and writes nothing');
    assert.deepEqual(page.errors,[]);
  }finally{if(page?.errors.length)t.diagnostic(JSON.stringify(page.errors));if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
});
