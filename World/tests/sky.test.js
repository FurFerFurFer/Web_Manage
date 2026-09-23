'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {Browser}=require('../../tests/lib/cdp');
const {startServer}=require('../tools/serve');
const Motion=require('../scripts/sky-motion');
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
    const camera=()=>page.evaluate(()=>{
      const B=BABYLON,scene=B.EngineStore.LastCreatedScene,eye=scene.activeCamera,engine=scene.getEngine(),forward=eye.getForwardRay().direction;
      const map=document.getElementById('sky-map').getBoundingClientRect();
      return {position:eye.position.asArray(),forward:forward.asArray(),up:eye.getDirection(B.Axis.Y).asArray(),fov:eye.fov,
        links:Array.from(scene.getMeshByName('celestial-connections')?.getVerticesData(B.VertexBuffer.PositionKind)||[]),
        stars:scene.meshes.filter(mesh=>mesh.metadata?.skyMM!==undefined).map(mesh=>{
          const p=B.Vector3.Project(mesh.position,B.Matrix.Identity(),scene.getTransformMatrix(),eye.viewport.toGlobal(engine.getRenderWidth(),engine.getRenderHeight()));
          const target=document.querySelector('[data-sky-mm="'+mesh.metadata.skyMM+'"]'),box=target.getBoundingClientRect(),label=target.querySelector('.sky-star-label').getBoundingClientRect();
          return {id:mesh.metadata.skyMM,position:mesh.position.asArray(),distance:B.Vector3.Distance(mesh.position,eye.position),
            ahead:B.Vector3.Dot(mesh.position.subtract(eye.position).normalize(),forward),
            screen:{x:p.x*innerWidth/engine.getRenderWidth(),y:p.y*innerHeight/engine.getRenderHeight()},
            target:{x:box.x+box.width/2,y:box.y+box.height/2,hidden:target.hidden,tabIndex:target.tabIndex},
            label:{left:label.left-map.left,top:label.top-map.top,right:label.right-map.left,bottom:label.bottom-map.top}};
        }),map:{width:map.width,height:map.height}};
    });
    const fixedEye=(actual,expected)=>{
      for(const field of ['position','forward','up'])assert.ok(actual[field].every((v,i)=>Math.abs(v-expected[field][i])<1e-6),'stargazing keeps camera '+field+' fixed');
    };
    const aligned=state=>{
      for(const star of state.stars.filter(star=>star.ahead>0)) {
        assert.equal(star.target.hidden,false);
        assert.ok(Math.hypot(star.target.x-star.screen.x,star.target.y-star.screen.y)<1,'HTML hit target follows projected MM '+star.id);
        assert.ok(Object.values(star.label).every(Number.isFinite),'label projection stays finite');
      }
    };
    const drag=async(dx=100,dy=30)=>{
      const start=await page.evaluate(({dx,dy})=>{
        const map=document.getElementById('sky-map'),box=map.getBoundingClientRect();
        for(const fy of [.2,.8,.5])for(const fx of [.1,.3,.5]) {
          const point={x:box.left+box.width*fx,y:box.top+box.height*fy};
          if(point.x+dx<box.right-2&&point.y+dy<box.bottom-2&&document.elementFromPoint(point.x,point.y)===map)return point;
        }
        throw new Error('No empty sky position for pointer drag');
      },{dx,dy});
      await page.session.send('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',buttons:1,clickCount:1});
      await page.session.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:start.x+dx,y:start.y+dy,button:'left',buttons:1});
      await page.session.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:start.x+dx,y:start.y+dy,button:'left',buttons:0,clickCount:1});
      await frames(3);
    };
    const tab=async()=>{
      await page.session.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
      await page.session.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
      await frames(3);
    };
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
      // The demo fixture's network: 35 MMs, 30 resolvable parent links.
      assert.equal(current.sky.nodes.length,35);assert.equal(current.sky.edges.length,30);
      assert.equal(await page.evaluate(()=>BABYLON.EngineStore.LastCreatedScene.meshes.filter(mesh=>mesh.metadata?.skyMM!==undefined&&mesh.isVisible).length),35,'stars are visible Babylon scene meshes');
      assert.equal(await page.evaluate(()=>document.querySelectorAll('#sky-map svg,#sky-map polygon').length),0,'the constellation is not an SVG picture');
      assert.deepEqual(current.sky.nodes.map(n=>({id:n.id,pending:n.pending,reviewed:n.reviewed})),current.world.reviewCues);
      assert.ok(current.sky.nodes.some(n=>!n.pending&&!n.reviewed),'not restricted to due MMs');
      assert.deepEqual(current.sky.nodes.find(n=>n.id===103)&&[current.sky.nodes[2].x,current.sky.nodes[2].y],[510,70]);
      assert.ok(Math.abs(current.world.position[0]-before.world.position[0])<.02);
      assert.ok(Math.abs(current.world.position[2]-before.world.position[2])<.02);
      await capture('sky-day');
    });
    await t.test('the sky takes the screen: one compact strip, the garden HUD steps aside, nothing under the toolbelt',async()=>{
      const layout=await page.evaluate(()=>{
        const rect=sel=>document.querySelector(sel).getBoundingClientRect().toJSON(),shown=sel=>getComputedStyle(document.querySelector(sel)).display!=='none';
        const description=document.getElementById('sky-description');
        return {flag:document.body.dataset.sky,map:rect('#sky-map'),bar:rect('.sky-bar'),view:rect('#sky-view'),tools:rect('.toolbelt'),
          identity:shown('.identity'),minimap:shown('#minimap'),bud:shown('.day-bud'),toolbelt:shown('.toolbelt'),
          hint:{text:description.textContent,width:description.getBoundingClientRect().width},screen:{w:innerWidth,h:innerHeight}};
      });
      assert.ok(layout.map.height>=layout.screen.h*.72,'the constellation gets most of the screen height: '+layout.map.height);
      assert.ok(layout.map.width>=layout.screen.w-40,'and nearly all of its width: '+layout.map.width);
      assert.ok(layout.bar.height<=64,'one compact strip: '+layout.bar.height);
      assert.equal(layout.flag,'true');
      assert.deepEqual([layout.identity,layout.minimap,layout.bud],[false,false,false],'the garden-only HUD steps aside');
      assert.equal(layout.toolbelt,true,'the toolbelt stays reachable');
      assert.ok(layout.view.bottom<=layout.tools.top,'no star, label or target is drawn beneath the toolbelt: sky bottom '+layout.view.bottom+', toolbelt top '+layout.tools.top);
      assert.ok(layout.hint.text.length>0&&layout.hint.width<=1,'the usage hint stays in the accessibility tree without taking sky');
      const typed=await page.evaluate(()=>{
        const map=()=>document.getElementById('sky-map').getBoundingClientRect().toJSON(),before=map(),input=document.getElementById('sky-find');
        input.value='a';input.dispatchEvent(new Event('input',{bubbles:true}));
        const results=document.getElementById('sky-results'),out={before,during:map(),shown:!results.hidden,count:results.querySelectorAll('button').length};
        input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));out.after=map();return out;
      });
      assert.ok(typed.shown&&typed.count>1,'the search actually showed results');
      assert.deepEqual(typed.during,typed.before,'searching never resizes the map, so it never reframes the stars');
      assert.deepEqual(typed.after,typed.before);
    });
    await t.test('a seeded universe turns with the constellation, darkens only what is drawn, and is never a target',async()=>{
      const read=()=>page.evaluate(()=>{
        const B=BABYLON,scene=B.EngineStore.LastCreatedScene,camera=scene.activeCamera,M=window.WorldSkyMotion;
        const field=scene.getMeshByName('sky-field-bright'),local=B.Vector3.FromArray(field.getVerticesData(B.VertexBuffer.PositionKind).slice(0,3));
        const drawn=B.Vector3.TransformCoordinates(local,field.computeWorldMatrix(true)).subtract(camera.position).normalize();
        return {state:WorldDemo.snapshot().world,clear:[scene.clearColor.r,scene.clearColor.g,scene.clearColor.b],
          vertex:{drawn:drawn.asArray(),expected:M.apply(field.rotationQuaternion.asArray(),local.normalizeToNew().asArray())},
          stars:scene.meshes.filter(m=>m.metadata?.skyMM!==undefined).map(m=>({id:m.metadata.skyMM,dir:m.position.subtract(camera.position).normalize().asArray()})),
          targets:document.querySelectorAll('#sky-map .sky-target').length};
      });
      const first=await read(),field=first.state.skyField;
      assert.ok(first.clear.every((v,i)=>Math.abs(v-[.055,.095,.16][i])<1e-3),'the sky is drawn at night while stargazing: '+first.clear);
      assert.ok(first.state.environment.night<.999,'while the live clock is not itself night: '+first.state.environment.night);
      assert.ok(field.count>=4000,'thousands of background stars: '+field.count);
      assert.deepEqual(field.visible,[true,true,true]);assert.deepEqual(field.alpha,[1,1,1]);assert.equal(field.pickable,false);
      assert.equal(first.targets,first.stars.length,'the backdrop adds no HTML target');
      assert.ok(first.vertex.drawn.every((v,i)=>Math.abs(v-first.vertex.expected[i])<1e-4),'Babylon draws the field with the MM stars\' rotation convention');
      await drag(160,40);
      const second=await read(),q1=field.rotation[0],q2=second.state.skyField.rotation[0];
      assert.ok(q1.some((v,i)=>Math.abs(v-q2[i])>1e-4),'the drag turned the backdrop');
      assert.ok(second.state.skyField.rotation.every(q=>q.every((v,i)=>Math.abs(v-q2[i])<1e-12)),'all three layers share one rotation');
      const turn=Motion.multiply(q2,[-q1[0],-q1[1],-q1[2],q1[3]]);
      for(const star of first.stars) {
        const moved=second.stars.find(s=>s.id===star.id),predicted=Motion.apply(turn,star.dir);
        assert.ok(predicted.every((v,i)=>Math.abs(v-moved.dir[i])<1e-3),'MM '+star.id+' turned exactly as the backdrop did');
      }
      await click('#sky-fit');await frames(3);
    });
    await t.test('drag rotates the displayed sky around a fixed eye and preserves KS03 coordinates',async()=>{
      const initial=await snapshot(),eye=await camera();aligned(eye);
      await drag();
      const moved=await snapshot(),rotated=await camera();fixedEye(rotated,eye);aligned(rotated);
      assert.notDeepEqual(moved.sky.view.rotation,initial.sky.view.rotation);
      assert.deepEqual([moved.sky.view.x,moved.sky.view.y],[initial.sky.view.x,initial.sky.view.y]);
      assert.deepEqual(moved.sky.nodes.map(n=>[n.id,n.x,n.y]),initial.sky.nodes.map(n=>[n.id,n.x,n.y]),'every source KS03 coordinate stays read-only');
      assert.deepEqual(moved.sky.nodes.filter(n=>n.id===103).map(n=>[n.x,n.y]),[[510,70]],'manual MM 103 stays in its saved position');
      assert.deepEqual(moved.world.position,initial.world.position,'the avatar stays in the Grove');
      for(const star of rotated.stars) {
        const original=eye.stars.find(s=>s.id===star.id);
        assert.ok(Math.hypot(...star.position.map((v,i)=>v-original.position[i]))>.1,'displayed MM '+star.id+' moves');
        assert.ok(Math.abs(star.distance-original.distance)<1e-6,'MM '+star.id+' follows a spherical orbit');
      }
      assert.ok(rotated.stars.some((star,i)=>Math.abs(star.position[1]-eye.stars[i].position[1])>.01),'the motion curves in depth instead of translating a flat sheet');
      for(const [i,edge] of moved.sky.edges.entries())for(const [end,id] of [edge.from,edge.to].entries()) {
        const position=rotated.stars.find(star=>star.id===id).position,vertex=rotated.links.slice(i*6+end*3,i*6+end*3+3);
        assert.ok(vertex.length===3&&vertex.every((v,axis)=>Math.abs(v-position[axis])<1e-5),'connection endpoints rotate with MM '+id);
      }
      const target=rotated.stars.find(star=>star.id===102);
      await page.session.send('Input.dispatchMouseEvent',{type:'mousePressed',...target.screen,button:'left',buttons:1,clickCount:1});
      await page.session.send('Input.dispatchMouseEvent',{type:'mouseReleased',...target.screen,button:'left',buttons:0,clickCount:1});
      assert.equal((await snapshot()).selectedMM,1,'clicking a star after rotation still selects its own MM');
      await key('Escape');await frames(3);
      await click('#sky-fit');await frames(3);
      assert.deepEqual((await snapshot()).sky.view,initial.sky.view,'Fit all restores orientation and magnification');
      fixedEye(await camera(),eye);
    });
    await t.test('zoom changes the field of view, held arrows rotate at 20 degrees per second, and Home fits',async()=>{
      const initial=await snapshot(),eye=await camera();
      await click('#sky-in');await frames(3);
      const zoomed=await camera();fixedEye(zoomed,eye);
      assert.ok((await snapshot()).sky.view.width<initial.sky.view.width);
      assert.ok(zoomed.fov<eye.fov,'zoom magnifies through camera field of view');
      assert.deepEqual((await snapshot()).sky.view.rotation,initial.sky.view.rotation,'zoom preserves the chosen constellation orientation');
      assert.ok(zoomed.stars.every((star,i)=>Math.abs(star.distance-eye.stars[i].distance)<1e-6),'zoom keeps the constellation on its sphere');
      const held=await page.evaluate(()=>new Promise(resolve=>{
        const map=document.getElementById('sky-map');map.focus();
        const before=WorldDemo.snapshot().sky.view.rotation;let first,last,elapsed=0;
        function step(time){
          if(first===undefined){first=last=time;map.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowRight',key:'ArrowRight',bubbles:true}));}
          else {elapsed+=Math.min((time-last)/1000,.1);last=time;}
          if(time-first<600){requestAnimationFrame(step);return;}
          map.dispatchEvent(new KeyboardEvent('keyup',{code:'ArrowRight',key:'ArrowRight',bubbles:true}));
          resolve({before,after:WorldDemo.snapshot().sky.view.rotation,elapsed});
        }requestAnimationFrame(step);
      }));
      await frames(3);
      const angle=2*Math.acos(Math.min(1,Math.abs(held.before.reduce((sum,v,i)=>sum+v*held.after[i],0))));
      assert.ok(Math.abs(angle-held.elapsed*20*Math.PI/180)<.04,'held arrow has the chosen angular speed: '+JSON.stringify({angle,elapsed:held.elapsed}));
      assert.ok(angle>.05,'holding the key moves the sky');
      const stopped=(await snapshot()).sky.view.rotation;await frames(3);
      assert.deepEqual((await snapshot()).sky.view.rotation,stopped,'releasing an arrow stops rotation');
      fixedEye(await camera(),eye);
      await key('Home');await frames(3);
      assert.deepEqual((await snapshot()).sky.view,initial.sky.view,'Home restores orientation and magnification');
      fixedEye(await camera(),eye);aligned(await camera());
    });
    await t.test('Tab reaches stars behind the view and MM inspection returns to the same live sky',async()=>{
      const initial=await snapshot(),eye=await camera();
      let turned=await camera(),attempts=0;
      while(turned.stars.find(star=>star.id===101).ahead>-.1&&attempts++<12){await drag(400,0);turned=await camera();}
      assert.ok(turned.stars.find(star=>star.id===101).ahead<0,'the keyboard recovery seed is actually behind the fixed viewpoint');
      fixedEye(turned,eye);
      const hiddenStar=turned.stars.find(star=>star.id===101);
      assert.equal(hiddenStar.target.hidden,false,'a star behind the camera remains in keyboard navigation');
      assert.equal(hiddenStar.target.tabIndex,0);
      await page.evaluate(()=>document.getElementById('sky-map').focus());
      for(const id of [101,102,103]) {
        await tab();
        assert.equal(await page.evaluate(()=>document.activeElement.dataset.skyMm),String(id),'Tab reaches MM '+id);
        const focused=(await camera()).stars.find(star=>star.id===id),bounds=(await camera()).map;
        assert.ok(focused.ahead>0,'focus turns the selected star back into view');
        assert.ok(focused.label.left>=-1&&focused.label.top>=-1&&focused.label.right<=bounds.width+1&&focused.label.bottom<=bounds.height+1,'the focused label fits the sky viewport: '+JSON.stringify({id,label:focused.label,bounds}));
      }
      await page.evaluate(()=>document.querySelector('[data-sky-mm="101"]').focus());await frames(3);
      const selectedView=(await snapshot()).sky.view;
      await key('Enter');
      assert.equal((await snapshot()).panel,'memory');
      assert.ok(await page.evaluate(()=>document.getElementById('panel-content').textContent.includes('Compare leaf edges before naming the plant.')));
      const reading=await snapshot();await frames(8);
      assert.ok((await snapshot()).world.environment.elapsed>reading.world.environment.elapsed);
      await key('Escape');await frames(3);assert.equal((await snapshot()).skyActive,true);
      assert.equal(await page.evaluate(()=>document.activeElement.dataset.skyMm),'101');
      assert.deepEqual((await snapshot()).sky.view,selectedView,'inspection returns to the same oriented sky');
      await click('#sky-fit');await frames(3);
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
      // Only MM 101 has a session dated the fixture's next day; an unfinished
      // review from an earlier day does not carry forward in Track's calendar.
      const midnight=current.sky.nodes.map(n=>n.id===101?1:0);
      assert.deepEqual(current.sky.nodes.map(n=>n.pending),midnight);
      assert.deepEqual(current.world.reviewCues.map(n=>n.pending),midnight);
      await capture('sky-rain');
      await page.session.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await frames(3);
      const fit=await page.evaluate(()=>{
        const sky=document.getElementById('sky-view').getBoundingClientRect(),tools=document.querySelector('.toolbelt').getBoundingClientRect();
        return {width:document.documentElement.scrollWidth,viewport:innerWidth,bottom:sky.bottom,toolbar:tools.top};
      });
      assert.ok(fit.width<=fit.viewport);assert.ok(fit.bottom<=fit.toolbar);
      await page.evaluate(()=>{const input=document.getElementById('sky-find');input.value='shapes a place';input.dispatchEvent(new Event('input',{bubbles:true}));});
      assert.equal(await page.evaluate(()=>document.querySelectorAll('#sky-results button').length),1);
      await click('#sky-results button');assert.equal((await snapshot()).selectedMM,1);await click('#close-panel');
      await page.evaluate(()=>{const input=document.getElementById('sky-find');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));});
      await capture('sky-narrow');
    });
    await key('Escape');
    assert.equal((await snapshot()).world.skyPhase,'leaving');
    await page.waitFor(()=>WorldDemo.snapshot().world.skyPhase==='garden');
    const after=await snapshot();assert.equal(after.skyActive,false);assert.equal(after.world.stargazing,false);
    assert.deepEqual(after.world.skyField.visible,[false,false,false],'the backdrop leaves with the sky');
    const hud=await page.evaluate(()=>({flag:document.body.dataset.sky,bud:getComputedStyle(document.querySelector('.day-bud')).display}));
    assert.equal(hud.flag,undefined);assert.notEqual(hud.bud,'none','the Today bud returns with the garden');
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
      assert.equal(opened.world.skyStars.filter(star=>star.visible).length,35,'actual scene stars render');
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
    await t.test('opening an MM panel or leaving the sky cancels a held pointer drag',async()=>{
      const begin=async()=>{
        const point=await page.evaluate(()=>{
          const map=document.getElementById('sky-map'),rect=map.getBoundingClientRect();
          for(const fy of [.2,.8,.5])for(const fx of [.1,.3,.5]) {
            const point={x:rect.left+rect.width*fx,y:rect.top+rect.height*fy};
            if(document.elementFromPoint(point.x,point.y)===map)return point;
          }
          throw new Error('No empty sky position for held-pointer check');
        });
        await page.session.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
        await page.session.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+35,y:point.y+10,button:'left',buttons:1});
        await frames(2);return {x:point.x+80,y:point.y+20};
      };
      for(const exit of ['panel','sky']) {
        const point=await begin();
        if(exit==='panel')await click('[data-panel="memory"]');else await key('Escape');
        const held=(await snapshot()).sky.view;
        await page.session.send('Input.dispatchMouseEvent',{type:'mouseMoved',...point,button:'left',buttons:1});
        await frames(3);
        const current=await snapshot();
        assert.deepEqual(current.sky.view,held,'a held drag cannot rotate the '+(exit==='panel'?'inert':'hidden')+' sky');
        assert.ok(current.sky.view.rotation.every(Number.isFinite));
        await page.session.send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1});
        if(exit==='panel') {
          assert.equal((await snapshot()).panel,'memory','releasing the cancelled drag does not dismiss the MM panel');
          await key('Escape');await frames(3);
        } else {
          assert.equal((await snapshot()).skyActive,false);
          await page.waitFor(()=>WorldDemo.snapshot().world.skyPhase==='garden');
          await key('KeyG');await page.waitFor(()=>WorldDemo.snapshot().world.skyPhase==='viewing');
        }
      }
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
      const reducedEye=await camera(),reducedView=(await snapshot()).sky.view;
      await drag();
      assert.notDeepEqual((await snapshot()).sky.view.rotation,reducedView.rotation,'Reduce motion preserves intentional direct dragging');
      fixedEye(await camera(),reducedEye);
      await key('Escape');await frames(2);assert.equal((await snapshot()).world.skyPhase,'garden');
    });
    assert.equal((await snapshot()).fixtureUnchanged,true);assert.deepEqual(page.errors,[]);
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
});
