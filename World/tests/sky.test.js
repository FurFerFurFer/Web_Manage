'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {Browser}=require('../../tests/lib/cdp');
const {startServer}=require('../tools/serve');
test('grounded Grove sky, selection, live weather, review cues and camera return',{timeout:180000},async t=>{
  const server=await startServer(0);let browser,page;
  try {
    browser=await Browser.launch();page=await browser.newPage();
    await page.session.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
    await page.goto('http://127.0.0.1:'+server.address().port,{waitFor:()=>!!window.WorldDemo});
    const click=selector=>page.evaluate(sel=>document.querySelector(sel).click(),selector);
    const key=code=>page.evaluate(code=>document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{code,key:code.startsWith('Key')?code.slice(-1).toLowerCase():code==='Space'?' ':code,bubbles:true})),code);
    const snapshot=()=>page.evaluate(()=>WorldDemo.snapshot());
    const frames=count=>page.evaluate(count=>new Promise(resolve=>{function step(){if(--count>0)requestAnimationFrame(step);else resolve();}requestAnimationFrame(step);}),count);
    const capture=async name=>{const shot=await page.session.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('/tmp/track-world-'+name+'.png',Buffer.from(shot.data,'base64'));};
    await click('#enter');await key('KeyG');assert.equal((await snapshot()).skyActive,false,'sky is a Grove interaction');
    // Walk the real controller into the Grove, without a writable scene/test hook.
    const walk=await page.evaluate(()=>new Promise(resolve=>{
      const canvas=document.getElementById('world');canvas.focus();let phase=0,frames=0;
      const down=code=>canvas.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));
      const up=code=>canvas.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));
      down('KeyW');down('KeyA');down('ShiftLeft');
      function step(){
        const state=WorldDemo.snapshot().world;
        if(phase===0&&state.position[0]<-11){up('KeyA');phase=1;}
        if(state.position[2]>13||++frames>500){up('KeyW');up('KeyA');up('ShiftLeft');resolve(state);return;}
        requestAnimationFrame(step);
      }requestAnimationFrame(step);
    }));
    assert.ok(walk.inGrove,JSON.stringify(walk.position));await frames(8);
    await t.test('jump clears Grove path contact and stargazing waits for landing',async()=>{
      const airborne=await page.evaluate(()=>new Promise(resolve=>{
        const canvas=document.getElementById('world');canvas.focus();let frames=0;
        canvas.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true}));
        function sample(){
          const state=WorldDemo.snapshot();
          if(state.world.vertical>0||++frames>20){
            if(state.world.vertical>0)canvas.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyG',key:'g',bubbles:true}));
            canvas.dispatchEvent(new KeyboardEvent('keyup',{code:'Space',bubbles:true}));
            resolve({vertical:state.world.vertical,skyActive:WorldDemo.snapshot().skyActive});return;
          }requestAnimationFrame(sample);
        }requestAnimationFrame(sample);
      }));
      assert.ok(airborne.vertical>0,JSON.stringify(airborne));assert.equal(airborne.skyActive,false);
      await page.waitFor(()=>WorldDemo.snapshot().world.grounded);
    });
    // Give the ordinary camera a non-default orientation to prove restoration.
    await page.session.send('Input.dispatchMouseEvent',{type:'mousePressed',x:600,y:280,button:'left',buttons:1,clickCount:2});
    await page.session.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:650,y:300,button:'left',buttons:1});
    await page.session.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:650,y:300,button:'left',buttons:0,clickCount:2});
    const before=await snapshot();
    await t.test('a fixed upward animation reveals scene stars and locks walking',async()=>{
      const trace=await page.evaluate(()=>new Promise(resolve=>{
        const canvas=document.getElementById('world'),samples=[];
        canvas.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyG',key:'g',bubbles:true}));
        canvas.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',bubbles:true}));
        function sample(){
          const state=WorldDemo.snapshot().world;samples.push(state);
          if(state.skyPhase!=='entering'||samples.length>180){canvas.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW',bubbles:true}));resolve(samples);}
          else requestAnimationFrame(sample);
        }sample();
      }));
      assert.equal(trace[0].skyPhase,'entering','opening begins an animation instead of snapping overhead');
      assert.equal(trace.at(-1).skyPhase,'viewing');
      assert.ok(trace.some(s=>s.cameraForward[1]>0&&s.cameraForward[1]<.95),'camera visibly passes through an upward tilt');
      assert.ok(trace.some(s=>s.skyReveal>0&&s.skyReveal<1),'stars fade into the sky');
      assert.ok(trace.every(s=>Math.hypot(s.position[0]-before.world.position[0],s.position[2]-before.world.position[2])<.02),'the character stays grounded and still');
      assert.ok(trace.at(-1).environment.elapsed>trace[0].environment.elapsed,'weather keeps advancing');
    });
    await frames(5);
    await t.test('overhead view contains the full network and matching review petals',async()=>{
      const current=await snapshot();assert.equal(current.skyActive,true);assert.equal(current.world.paused,false);
      assert.ok(current.world.cameraForward[1]>.999,'dedicated camera looks overhead');
      const blockedByAvatar=await page.evaluate(()=>{
        const B=window.BABYLON,scene=B.EngineStore.LastCreatedScene,camera=scene.activeCamera;
        return scene.pickWithRay(camera.getForwardRay(3),mesh=>mesh.name.startsWith('traveler-')).hit;
      });
      assert.equal(blockedByAvatar,false,'the avatar must not block the sky camera');
      assert.equal(current.sky.nodes.length,3);assert.equal(current.sky.edges.length,2);
      assert.equal(await page.evaluate(()=>BABYLON.EngineStore.LastCreatedScene.meshes.filter(mesh=>mesh.metadata?.skyMM!==undefined&&mesh.isVisible).length),3,'stars are visible Babylon scene meshes');
      assert.equal(await page.evaluate(()=>document.querySelectorAll('#sky-map svg,#sky-map polygon').length),0,'the constellation is not an SVG picture');
      assert.deepEqual(current.sky.nodes.map(n=>({id:n.id,pending:n.pending,reviewed:n.reviewed})),current.world.reviewCues);
      assert.ok(current.sky.nodes.some(n=>!n.pending&&!n.reviewed),'not restricted to due MMs');
      assert.deepEqual(current.sky.nodes.find(n=>n.id===103)&&[current.sky.nodes[2].x,current.sky.nodes[2].y],[510,70]);
      assert.ok(Math.abs(current.world.position[0]-before.world.position[0])<.02);
      assert.ok(Math.abs(current.world.position[2]-before.world.position[2])<.02);
      await capture('sky-day');
    });
    await t.test('pan/zoom and keyboard star selection return to the same live sky',async()=>{
      const initial=await snapshot();await click('#sky-in');
      assert.ok((await snapshot()).sky.view.width<initial.sky.view.width);
      await page.evaluate(()=>document.getElementById('sky-map').focus());await key('ArrowRight');
      const panned=await snapshot();assert.notEqual(panned.sky.view.x,initial.sky.view.x);
      assert.deepEqual(panned.world.skyStars,initial.world.skyStars,'pan and zoom never rearrange world stars');
      await page.evaluate(()=>document.querySelector('[data-sky-mm="101"]').focus());await key('Enter');
      assert.equal((await snapshot()).panel,'memory');
      assert.ok(await page.evaluate(()=>document.getElementById('panel-content').textContent.includes('Compare leaf edges before naming the plant.')));
      const reading=await snapshot();await frames(8);
      assert.ok((await snapshot()).world.environment.elapsed>reading.world.environment.elapsed);
      await key('Escape');assert.equal((await snapshot()).skyActive,true);
      assert.equal(await page.evaluate(()=>document.activeElement.dataset.skyMm),'101');
      await click('#sky-fit');
      assert.deepEqual((await snapshot()).sky.view,initial.sky.view);
    });
    await t.test('rain, midnight and narrow view keep selection and canonical day cues available',async()=>{
      await click('[data-panel="weather"]');
      await page.evaluate(()=>{
        for(const [id,value] of [['weather-choice','rain'],['demo-clock','midnight']]) {
          const input=document.getElementById(id);input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));
        }
      });
      await click('#close-panel');await page.waitFor(()=>WorldDemo.snapshot().world.environment.rain>.5);
      let current=await snapshot();assert.equal(current.skyActive,true);assert.equal(current.world.paused,false);
      assert.deepEqual(current.sky.nodes.map(n=>n.pending),[1,0,0]);
      assert.deepEqual(current.world.reviewCues.map(n=>n.pending),[1,0,0]);
      await capture('sky-rain');
      await page.session.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await frames(3);
      const fit=await page.evaluate(()=>{
        const sky=document.getElementById('sky-view').getBoundingClientRect(),tools=document.querySelector('.toolbelt').getBoundingClientRect();
        return {width:document.documentElement.scrollWidth,viewport:innerWidth,bottom:sky.bottom,toolbar:tools.top};
      });
      assert.ok(fit.width<=fit.viewport);assert.ok(fit.bottom<=fit.toolbar);
      await page.evaluate(()=>{const input=document.getElementById('sky-find');input.value='water';input.dispatchEvent(new Event('input',{bubbles:true}));});
      assert.equal(await page.evaluate(()=>document.querySelectorAll('#sky-results button').length),1);
      await click('#sky-results button');assert.equal((await snapshot()).selectedMM,1);await click('#close-panel');
      await page.evaluate(()=>{const input=document.getElementById('sky-find');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));});
      await capture('sky-narrow');
    });
    await key('Escape');
    assert.equal((await snapshot()).world.skyPhase,'leaving');
    await page.waitFor(()=>WorldDemo.snapshot().world.skyPhase==='garden');
    const after=await snapshot();assert.equal(after.skyActive,false);assert.equal(after.world.stargazing,false);
    assert.deepEqual([after.world.yaw,after.world.pitch,after.world.roll],[before.world.yaw,before.world.pitch,before.world.roll]);
    assert.ok(after.world.cameraForward.every((v,i)=>Math.abs(v-before.world.cameraForward[i])<.002));
    await t.test('the ordinary MM panel visibly opens the star sky and retains its draft',async()=>{
      await click('[data-panel="help"]');
      await page.evaluate(()=>[...document.querySelectorAll('#panel-content button')].find(button=>button.textContent==='Return to the start').click());
      await click('[data-panel="memory"]');
      assert.ok(await page.evaluate(()=>!!document.getElementById('memory-sky')),'star entry is visible in the MM panel');
      await page.evaluate(()=>{const input=document.getElementById('mm-observation');input.value='A thought before stargazing';input.dispatchEvent(new Event('input',{bubbles:true}));});
      const point=await page.evaluate(()=>{const box=document.getElementById('memory-sky').getBoundingClientRect();return {x:box.x+box.width/2,y:box.y+box.height/2};});
      await page.session.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
      await page.session.send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1});
      await page.waitFor(()=>WorldDemo.snapshot().world.skyPhase==='viewing');
      const opened=await snapshot();assert.equal(opened.skyActive,true);assert.equal(opened.panel,null);
      assert.equal(opened.world.inGrove,true);assert.equal(opened.world.grounded,true);
      assert.equal(opened.world.skyStars.filter(star=>star.visible).length,3,'actual scene stars render');
      const starPoint=await page.evaluate(()=>{
        const B=BABYLON,scene=B.EngineStore.LastCreatedScene,engine=scene.getEngine();
        const mesh=scene.meshes.find(mesh=>mesh.metadata?.skyMM===102);
        const point=B.Vector3.Project(mesh.position,B.Matrix.Identity(),scene.getTransformMatrix(),scene.activeCamera.viewport.toGlobal(engine.getRenderWidth(),engine.getRenderHeight()));
        return {x:point.x*innerWidth/engine.getRenderWidth(),y:point.y*innerHeight/engine.getRenderHeight()};
      });
      await page.session.send('Input.dispatchMouseEvent',{type:'mousePressed',...starPoint,button:'left',buttons:1,clickCount:1});
      await page.session.send('Input.dispatchMouseEvent',{type:'mouseReleased',...starPoint,button:'left',buttons:0,clickCount:1});
      assert.equal((await snapshot()).selectedMM,1,'clicking the visible scene star opens that MM');
      assert.equal(await page.evaluate(()=>document.getElementById('mm-observation').value),'A thought before stargazing');
      await click('#memory-sky');assert.equal((await snapshot()).skyActive,true,'selected record can return to the same sky');
      assert.equal((await snapshot()).panel,null);
    });
    await t.test('an early exit reverses the animation, and reduced motion skips it',async()=>{
      await key('Escape');await page.waitFor(()=>WorldDemo.snapshot().world.skyPhase==='garden');
      const standing=(await snapshot()).world.position;
      await key('KeyG');await key('Escape');
      assert.equal((await snapshot()).world.skyPhase,'leaving');
      await page.evaluate(()=>document.getElementById('world').dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',bubbles:true})));
      await page.waitFor(()=>WorldDemo.snapshot().world.skyPhase==='garden');
      const returned=await snapshot();
      assert.ok(Math.hypot(returned.world.position[0]-standing[0],returned.world.position[2]-standing[2])<.02);
      assert.ok(returned.world.skyStars.every(star=>!star.visible));
      await click('[data-panel="weather"]');
      await page.evaluate(()=>{const input=document.getElementById('reduce-motion');input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));});
      await click('#close-panel');await key('KeyG');await frames(2);
      assert.equal((await snapshot()).world.skyPhase,'viewing');
      await key('Escape');await frames(2);assert.equal((await snapshot()).world.skyPhase,'garden');
    });
    assert.equal((await snapshot()).fixtureUnchanged,true);assert.deepEqual(page.errors,[]);
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
});
