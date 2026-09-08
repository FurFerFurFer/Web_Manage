'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {Browser}=require('../../tests/lib/cdp');
const {startServer}=require('../tools/serve');

test('isolated playable scene: controls, truthful panels, drafts, weather and zero storage access',{timeout:150000},async t=>{
  const server=await startServer(0);let browser,page;
  try {
    browser=await Browser.launch();page=await browser.newPage();
    const requests=[];
    await page.session.send('Network.enable');
    page.session.on('Network.requestWillBeSent',event=>requests.push(event.request.url));
    await page.session.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    await page.addInitScript(`
      window.__storageAccess=[];
      const originalGet=Storage.prototype.getItem,originalSet=Storage.prototype.setItem,realStorage=localStorage;
      originalSet.call(realStorage,'track_db','synthetic sentinel - do not read or write');
      for (const method of ['getItem','setItem','removeItem','clear']) {
        Storage.prototype[method]=function(){window.__storageAccess.push(method);throw new Error('Unexpected storage access: '+method);};
      }
      window.__checkSentinel=()=>originalGet.call(realStorage,'track_db');
    `);
    await page.goto('http://127.0.0.1:'+server.address().port, {waitFor:()=>!!window.WorldDemo});
    const startup=await page.evaluate(()=>({snapshot:WorldDemo.snapshot(),error:document.getElementById('error-message').textContent}));
    assert.equal(await page.evaluate(()=>WorldDemo.ready),true,JSON.stringify(startup));
    await page.waitFor(()=>WorldDemo.snapshot().world.metrics.fps>0);
    const capture=async name=>{const shot=await page.session.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('/tmp/track-world-'+name+'.png',Buffer.from(shot.data,'base64'));};
    await capture('welcome');
    const click=selector=>page.evaluate(sel=>document.querySelector(sel).click(),selector);
    const key=async(code,key,type='keyDown')=>page.session.send('Input.dispatchKeyEvent',{type,code,key});
    await click('#enter');
    const before=await page.evaluate(()=>WorldDemo.snapshot().world.position);
    await key('KeyW','w');
    await page.waitFor(z=>WorldDemo.snapshot().world.position[2]>z+1,{args:[before[2]],timeout:20000});
    await key('KeyW','w','keyUp');
    await page.waitFor(()=>WorldDemo.snapshot().world.grounded);
    const groundY=await page.evaluate(()=>WorldDemo.snapshot().world.position[1]);
    await key('Space',' ');
    const jumpSamples=await page.evaluate(()=>new Promise(resolve=>{
      const samples=[];let count=0;
      function sample(){samples.push(WorldDemo.snapshot().world);if(++count<15)requestAnimationFrame(sample);else resolve(samples);}
      requestAnimationFrame(sample);
    }));
    assert.ok(jumpSamples.some(s=>s.position[1]>groundY+.4),'Jump samples: '+JSON.stringify(jumpSamples.map(s=>({y:s.position[1],v:s.vertical,g:s.grounded,j:s.jumpBuffer}))));
    await key('Space',' ','keyUp');
    await page.waitFor(()=>WorldDemo.snapshot().world.grounded,{timeout:20000});
    await key('KeyN','n');await key('KeyN','n','keyUp');
    assert.equal(await page.evaluate(()=>WorldDemo.snapshot().panel),'notebook');
    const resting=await page.evaluate(()=>WorldDemo.snapshot().world.position);
    await page.evaluate(()=>{
      const area=document.getElementById('note-draft');area.focus();area.value='ไทย + English\nA synthetic draft';area.dispatchEvent(new Event('input',{bubbles:true}));
      area.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',key:'w',bubbles:true}));
      area.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',key:'Escape',isComposing:true,bubbles:true}));
    });
    assert.equal(await page.evaluate(()=>WorldDemo.snapshot().panel),'notebook','IME Escape does not close draft');
    assert.deepEqual(await page.evaluate(()=>WorldDemo.snapshot().world.position),resting);
    await click('#panel-content .primary');
    await page.evaluate(()=>document.getElementById('close-panel').focus());
    await page.session.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',modifiers:8});
    assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Export text','Shift+Tab stays inside the dialog');
    await page.session.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',modifiers:8});
    await click('#close-panel');await click('[data-panel="notebook"]');
    assert.equal(await page.evaluate(()=>document.getElementById('note-draft').value),'ไทย + English\nA synthetic draft');
    await click('#close-panel');await click('[data-panel="today"]');
    let today=await page.evaluate(()=>document.getElementById('panel-content').innerText);
    assert.match(today,/No time/);assert.match(today,/automatic block time/);assert.match(today,/Chosen caution days/);
    assert.match(today,/Share the garden field notes/);assert.match(today,/Reference timetable/);
    assert.doesNotMatch(today,/Send the water study/,'handled future deadline raises no caution');
    await capture('today');
    await click('#close-panel');await click('[data-panel="memory"]');
    await page.evaluate(()=>{const input=document.getElementById('mm-name');input.value='<b>A draft, not markup</b>';input.dispatchEvent(new Event('input',{bubbles:true}));});
    await click('#panel-content .primary');
    await click('#panel-content .mm-choice:nth-of-type(2)');
    assert.equal(await page.evaluate(()=>document.getElementById('mm-name').value),'How water shapes a place');
    await click('#panel-content .mm-choice:nth-of-type(1)');
    assert.equal(await page.evaluate(()=>document.getElementById('mm-name').value),'<b>A draft, not markup</b>');
    await click('#close-panel');await click('[data-panel="weather"]');
    await page.evaluate(()=>{
      for(const [id,value] of [['weather-choice','rain'],['light-choice','night'],['demo-clock','preview']]) {
        const input=document.getElementById(id);input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));
      }
    });
    await page.waitFor(()=>WorldDemo.snapshot().world.environment.rain>.65,{timeout:30000});
    await capture('rain-night');
    await click('#close-panel');await click('[data-panel="today"]');
    assert.match(await page.evaluate(()=>document.getElementById('panel-content').innerText),/Tomorrow preview/);
    await click('#close-panel');await click('[data-panel="weather"]');
    await page.evaluate(()=>{const clock=document.getElementById('demo-clock');clock.value='midnight';clock.dispatchEvent(new Event('change',{bubbles:true}));});
    await click('#close-panel');await click('[data-panel="today"]');
    today=await page.evaluate(()=>document.getElementById('panel-content').innerText);
    assert.match(today,/No deadline warnings/);assert.doesNotMatch(today,/Look for a small change/,'notes stay on original day');
    await page.session.send('Emulation.setDeviceMetricsOverride',{width:800,height:650,deviceScaleFactor:1,mobile:false});
    await capture('narrow');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.equal(await page.evaluate(()=>document.getElementById('close-panel').getBoundingClientRect().right<=innerWidth),true);
    assert.deepEqual(await page.evaluate(()=>window.__storageAccess),[]);
    assert.ok(requests.every(url=>url.startsWith('http://127.0.0.1:'+server.address().port)||url.startsWith('data:')),JSON.stringify(requests));
    assert.equal(await page.evaluate(()=>window.__checkSentinel()),'synthetic sentinel - do not read or write');
    assert.equal(await page.evaluate(()=>WorldDemo.snapshot().fixtureUnchanged),true);
    const forbidden=await fetch('http://127.0.0.1:'+server.address().port+'/track-core/firebase-sync.js');
    assert.equal(forbidden.status,404);
    t.diagnostic('Behavior-test renderer only: '+JSON.stringify(await page.evaluate(()=>WorldDemo.snapshot().world.metrics)));
    assert.deepEqual(page.errors,[]);
  } finally {
    if(page&&page.errors.length)t.diagnostic(JSON.stringify(page.errors));
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
});
