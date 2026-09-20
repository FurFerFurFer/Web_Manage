'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Browser}=require('../../tests/lib/cdp');
const {startServer}=require('../tools/serve');

test('upright orbit camera, drag continuity, reset and reading input',{timeout:120000},async t=>{
  const server=await startServer(0);let browser,page;
  try {
    browser=await Browser.launch();page=await browser.newPage();
    await page.session.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
    await page.goto('http://127.0.0.1:'+server.address().port,{waitFor:()=>!!window.WorldDemo});
    assert.equal(await page.evaluate(()=>WorldDemo.ready),true);
    await page.evaluate(()=>document.getElementById('enter').click());
    const snapshot=()=>page.evaluate(()=>WorldDemo.snapshot().world);
    const reset=()=>page.evaluate(()=>{
      document.querySelector('[data-panel="help"]').click();
      [...document.querySelectorAll('#panel-content button')].find(b=>b.textContent==='Return to the start').click();
    });
    const held=code=>page.evaluate(code=>new Promise(resolve=>{
      const canvas=document.getElementById('world');canvas.focus();
      canvas.dispatchEvent(new KeyboardEvent('keydown',{code,key:code.slice(-1).toLowerCase(),bubbles:true}));
      let frames=0;function sample(){
        if(++frames<18){requestAnimationFrame(sample);return;}
        canvas.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));resolve(WorldDemo.snapshot().world);
      }requestAnimationFrame(sample);
    }),code);
    await t.test('horizontal orbit is free and vertical tilt cannot flip the view',async()=>{
      try {
        await page.session.send('Input.dispatchMouseEvent',{type:'mousePressed',x:400,y:300,button:'left',buttons:1,clickCount:2});
        for(let i=1;i<=4;i++)await page.session.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:400+i*400,y:300+i*400,button:'left',buttons:1});
        await page.session.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:2000,y:1900,button:'left',buttons:0,clickCount:2});
        const state=await snapshot();
        assert.ok(state.pitch<Math.PI/2&&state.pitch>0,'downward tilt stops before flipping');
        assert.ok(state.yaw>2*Math.PI,'horizontal orbit is not clamped');
        const expected=[Math.sin(state.yaw)*Math.cos(state.pitch),-Math.sin(state.pitch),Math.cos(state.yaw)*Math.cos(state.pitch)];
        assert.ok(state.cameraForward.every((v,i)=>Math.abs(v-expected[i])<.002),'rendered camera follows orbit');
        assert.ok(state.cameraUp[1]>0,'camera remains upright');
        await page.session.send('Input.dispatchMouseEvent',{type:'mousePressed',x:400,y:300,button:'left',buttons:1,clickCount:2});
        await page.session.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:400,y:-1700,button:'left',buttons:1});
        await page.session.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:400,y:-1700,button:'left',buttons:0,clickCount:2});
        const upward=await snapshot();assert.ok(upward.pitch>-Math.PI/2&&upward.pitch<0,'upward tilt also stops before flipping');
      } finally {await reset();}
    });
    await t.test('keyboard tilt is bounded, roll is removed and Home never teleports',async()=>{
      try {
        const initial=await snapshot();
        const pitched=await held('KeyR');
        assert.ok(pitched.pitch>initial.pitch+.3&&pitched.pitch<Math.PI/2,'R tilts within the limit');
        const rolled=await held('KeyC');
        assert.equal(rolled.roll,0,'C does not roll the camera');
        assert.ok(Math.abs(rolled.cameraUp[0])<.002);
        const other=await held('KeyZ');assert.equal(other.roll,0,'Z does not roll the camera');
        const raised=await held('KeyF');assert.ok(raised.pitch<other.pitch-.3,'F pitches the other way');
        // Compare inside the same event turn: a separate CDP round trip allows
        // collision settling (including floating-point noise) between samples.
        const {beforeReset,upright}=await page.evaluate(()=>{
          const beforeReset=WorldDemo.snapshot().world;
          document.getElementById('world').dispatchEvent(new KeyboardEvent('keydown',{code:'Home',key:'Home',bubbles:true}));
          return {beforeReset,upright:WorldDemo.snapshot().world};
        });
        assert.deepEqual([upright.yaw,upright.pitch,upright.roll],[0,.31,0]);
        assert.equal(upright.position[0],beforeReset.position[0]);assert.equal(upright.position[2],beforeReset.position[2]);
      } finally {await reset();}
    });
    await t.test('a held drag continues after capture is lost while walking',async()=>{
      try {
        await page.session.send('Input.dispatchMouseEvent',{type:'mousePressed',x:400,y:300,button:'left',buttons:1,clickCount:2});
        await page.evaluate(()=>document.getElementById('world').dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',bubbles:true})));
        await page.session.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:430,y:300,button:'left',buttons:1});
        const before=await snapshot();
        await page.evaluate(()=>{const canvas=document.getElementById('world');for(let id=0;id<5;id++)if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);});
        await page.session.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:490,y:300,button:'left',buttons:1});
        const after=await snapshot();
        assert.ok(after.yaw>before.yaw+.2,'losing capture does not discard an active button-held gesture');
        assert.ok(after.position[2]>before.position[2],'walking continues');
        await page.session.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:490,y:300,button:'left',buttons:0,clickCount:2});
        const released=await snapshot();
        await page.session.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:590,y:300,button:'none',buttons:0});
        assert.equal((await snapshot()).yaw,released.yaw,'release ends the drag');
      } finally {await reset();}
    });
    await t.test('camera shortcuts have no effect while typing in the notebook',async()=>{
      await page.evaluate(()=>{document.querySelector('[data-panel="notebook"]').click();document.querySelector('[data-note-id]').click();document.getElementById('note-draft').focus();});
      const before=await snapshot();
      await page.evaluate(()=>new Promise(resolve=>{
        const input=document.getElementById('note-draft');
        for(const code of ['KeyQ','KeyE','KeyR','KeyF','KeyZ','KeyC','Home'])input.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));
        let frames=0;function sample(){if(++frames<8)requestAnimationFrame(sample);else resolve();}requestAnimationFrame(sample);
      }));
      const after=await snapshot();
      assert.deepEqual([after.yaw,after.pitch,after.roll],[before.yaw,before.pitch,before.roll]);
      assert.ok(after.environment.elapsed>before.environment.elapsed);
      assert.equal(await page.evaluate(()=>WorldDemo.snapshot().fixtureUnchanged),true);
    });
    assert.deepEqual(page.errors,[]);
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
});
