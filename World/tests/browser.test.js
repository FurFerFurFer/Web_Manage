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
    const pointerClick=async selector=>{
      const point=await page.evaluate(sel=>{const node=document.querySelector(sel);node.scrollIntoView({block:'nearest'});const r=node.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};},selector);
      await page.session.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...point});
      await page.session.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...point});
    };
    const key=async(code,key,type='keyDown')=>page.session.send('Input.dispatchKeyEvent',{type,code,key});
    await click('#enter');
    await page.waitFor(()=>!document.getElementById('quest-popup').hidden);
    const popup=await page.evaluate(()=>document.getElementById('quest-popup').innerText);
    assert.match(popup,/Follow the water/);assert.match(popup,/5 quests/);
    assert.doesNotMatch(popup,/Draw a widening ripple/,'a starred parent represents its descendants once');
    const before=await page.evaluate(()=>WorldDemo.snapshot().world.position);
    const yawBefore=await page.evaluate(()=>WorldDemo.snapshot().world.yaw);
    await page.session.send('Input.dispatchMouseEvent',{type:'mousePressed',x:450,y:350,button:'left',buttons:1,clickCount:2});
    await key('KeyW','w');
    await page.session.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:480,y:350,button:'left',buttons:1});
    await page.waitFor(z=>WorldDemo.snapshot().world.position[2]>z+1,{args:[before[2]],timeout:20000});
    await page.session.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:510,y:350,button:'left',buttons:1});
    assert.ok(await page.evaluate(yaw=>WorldDemo.snapshot().world.yaw>yaw+.2,yawBefore),'camera drag continues while walking');
    await page.session.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:510,y:350,button:'left',buttons:0,clickCount:2});
    await key('KeyW','w','keyUp');
    await page.waitFor(()=>WorldDemo.snapshot().world.grounded);
    const groundY=await page.evaluate(()=>WorldDemo.snapshot().world.position[1]);
    const jumpSamples=await page.evaluate(groundY=>new Promise(resolve=>{
      const samples=[];let count=0;
      document.getElementById('world').dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true}));
      samples.push(WorldDemo.snapshot().world);
      function sample(){
        const state=WorldDemo.snapshot();samples.push(state.world);
        if(!state.panel&&state.world.position[1]>groundY+.4) {
          document.querySelector('[data-panel="notebook"]').click();
          document.querySelector('[data-note-id]').click();
          document.getElementById('note-draft').focus();
          window.__airbornePanel=WorldDemo.snapshot();
        }
        if(++count<15)requestAnimationFrame(sample);else resolve(samples);
      }
      requestAnimationFrame(sample);
    }),groundY);
    assert.ok(jumpSamples.some(s=>s.position[1]>groundY+.4),'Jump samples: '+JSON.stringify(jumpSamples.map(s=>({y:s.position[1],v:s.vertical,g:s.grounded,j:s.jumpBuffer}))));
    await key('Space',' ','keyUp');
    await t.test('a notebook opened in mid-jump keeps physics live and owns input',async()=>{
      const opened=await page.evaluate(()=>window.__airbornePanel);
      try {
        assert.equal(opened.panel,'notebook');
        assert.equal(opened.world.paused,false,'opening a panel must not pause the simulation');
        await page.session.send('Input.insertText',{text:'wasd qe space — typing during a jump'});
        for(const [code,letter] of [['KeyW','w'],['KeyQ','q'],['Space',' ']]){await key(code,letter);await key(code,letter,'keyUp');}
        await page.waitFor(()=>WorldDemo.snapshot().world.grounded,{timeout:15000});
        const landed=await page.evaluate(()=>WorldDemo.snapshot());
        assert.ok(landed.world.position[1]<opened.world.position[1]);
        assert.ok(landed.world.environment.elapsed>opened.world.environment.elapsed);
        assert.ok(Math.abs(landed.world.position[2]-opened.world.position[2])<.05,'typing does not walk');
        assert.equal(landed.world.yaw,opened.world.yaw,'typing does not rotate');
      } finally {await click('#close-panel');await page.evaluate(()=>document.getElementById('world').focus());}
    });
    await page.waitFor(()=>WorldDemo.snapshot().world.grounded,{timeout:20000});
    await t.test('toolbar panels switch by real pointer and keyboard without closing',async()=>{
      await pointerClick('.toolbelt [data-panel="today"]');
      try {
        await pointerClick('.toolbelt [data-panel="notebook"]');
        assert.equal(await page.evaluate(()=>WorldDemo.snapshot().panel),'notebook');
        await pointerClick('[data-note-id]');
        await page.evaluate(()=>{const a=document.getElementById('note-draft');a.value='Draft across companion tabs';a.dispatchEvent(new Event('input',{bubbles:true}));});
        await pointerClick('.toolbelt [data-panel="memory"]');
        assert.equal(await page.evaluate(()=>WorldDemo.snapshot().panel),'memory');
        await page.evaluate(()=>document.getElementById('close-panel').focus());
        await page.session.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',modifiers:8});
        assert.equal(await page.evaluate(()=>document.activeElement.dataset.panel),'help','focus includes the companion toolbar');
        await page.session.send('Input.dispatchKeyEvent',{type:'keyDown',code:'Enter',key:'Enter',text:'\r',windowsVirtualKeyCode:13});
        await key('Enter','Enter','keyUp');
        assert.equal(await page.evaluate(()=>WorldDemo.snapshot().panel),'help');
        await pointerClick('.toolbelt [data-panel="notebook"]');
        await pointerClick('[data-note-id]');
        assert.equal(await page.evaluate(()=>document.getElementById('note-draft').value),'Draft across companion tabs');
      } finally {await click('#close-panel');await page.evaluate(()=>document.getElementById('world').focus());}
    });
    await key('KeyN','n');await key('KeyN','n','keyUp');
    assert.equal(await page.evaluate(()=>WorldDemo.snapshot().panel),'notebook');
    assert.equal(await page.evaluate(()=>!!document.getElementById('note-draft')),false,'opening the notebook starts at Track’s notes list');
    assert.equal(await page.evaluate(()=>document.getElementById('note-new').textContent),'+ Add note');
    await pointerClick('[data-note-id]');
    const resting=await page.evaluate(()=>WorldDemo.snapshot().world.position);
    await page.evaluate(()=>{
      const area=document.getElementById('note-draft');area.focus();area.value='ไทย + English\nA synthetic draft';area.dispatchEvent(new Event('input',{bubbles:true}));
      const topic=document.getElementById('note-topic');topic.value='A closer look';topic.dispatchEvent(new Event('input',{bubbles:true}));
      area.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',key:'w',bubbles:true}));
      area.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',key:'Escape',isComposing:true,bubbles:true}));
    });
    assert.equal(await page.evaluate(()=>WorldDemo.snapshot().panel),'notebook','IME Escape does not close draft');
    assert.ok(await page.evaluate(pos=>{const now=WorldDemo.snapshot().world.position;return Math.hypot(now[0]-pos[0],now[2]-pos[2])<.05;},resting),'typing does not add walking input');
    assert.equal(await page.evaluate(()=>document.querySelectorAll('#note-keep,#note-cancel,#note-export').length),0,'notes have no extra Keep, Cancel changes or Export workflow');
    await page.evaluate(()=>document.getElementById('close-panel').focus());
    await page.session.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',modifiers:8});
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.panel),'help','Shift+Tab stays inside companion controls');
    await page.session.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',modifiers:8});
    await click('#close-panel');await click('[data-panel="notebook"]');
    await pointerClick('[data-note-id]');
    assert.equal(await page.evaluate(()=>document.getElementById('note-draft').value),'ไทย + English\nA synthetic draft');
    assert.equal(await page.evaluate(()=>document.getElementById('note-topic').value),'A closer look');
    await t.test('Track-style notes auto-save by identity, return to the list and confirm deletion',async()=>{
      const edit=async(topic,body)=>page.evaluate(({topic,body})=>{
        document.getElementById('note-topic').focus();
        for(const [id,value] of [['note-topic',topic],['note-draft',body]]){const node=document.getElementById(id);node.value=value;node.dispatchEvent(new Event('input',{bubbles:true}));}
        document.getElementById('note-draft').focus();
      },{topic,body});
      const first=await page.evaluate(()=>WorldDemo.snapshot().notebook.selected);
      await edit('  First note  ','First body');
      await pointerClick('#note-list');
      assert.equal(await page.evaluate(()=>document.querySelector('[data-note-id]').textContent),'First note','topic is trimmed on blur like Track');
      await pointerClick('#note-new');
      const second=await page.evaluate(()=>WorldDemo.snapshot().notebook.selected);
      assert.notEqual(second,first);assert.equal(await page.evaluate(()=>document.activeElement.id),'note-draft');
      await edit('ไทย <b>Second note</b>','น้ำ 🌿 e\u0301\nA separate note');
      await pointerClick('#note-list');await capture('notebook-list');
      assert.equal(await page.evaluate(()=>document.querySelectorAll('[data-note-id]').length),2);
      assert.equal(await page.evaluate(()=>document.querySelectorAll('.notebook-list b').length),0,'note titles are literal text');
      await pointerClick('[data-note-id="'+first+'"]');
      assert.equal(await page.evaluate(()=>document.getElementById('note-topic').value),'First note');
      assert.equal(await page.evaluate(()=>document.getElementById('note-draft').value),'First body');
      await click('#note-list');await pointerClick('[data-note-id="'+second+'"]');
      assert.equal(await page.evaluate(()=>document.getElementById('note-draft').value),'น้ำ 🌿 e\u0301\nA separate note');
      await edit('ไทย <b>Second note</b>','Latest text before immediate switching');
      await click('.toolbelt [data-panel="map"]');await click('.toolbelt [data-panel="notebook"]');
      assert.equal(await page.evaluate(()=>WorldDemo.snapshot().notebook.view),'list','reopening starts at the same list as Track');
      await pointerClick('[data-note-id="'+second+'"]');
      assert.equal(await page.evaluate(()=>WorldDemo.snapshot().notebook.selected),second);
      assert.equal(await page.evaluate(()=>document.getElementById('note-draft').value),'Latest text before immediate switching');
      await capture('notebook-editor');
      const intact=await page.evaluate(()=>WorldDemo.snapshot().notebook.notes);
      await pointerClick('#note-remove');
      assert.match(await page.evaluate(()=>document.getElementById('note-delete-name').textContent),/ไทย <b>Second note<\/b>/);
      assert.equal(await page.evaluate(()=>document.activeElement.id),'note-delete-cancel');
      for(let i=0;i<4;i++){
        await page.session.send('Input.dispatchKeyEvent',{type:'keyDown',code:'Tab',key:'Tab',windowsVirtualKeyCode:9});
        await key('Tab','Tab','keyUp');
        assert.equal(await page.evaluate(()=>document.getElementById('note-delete-dialog').contains(document.activeElement)),true,'deletion confirmation contains keyboard focus');
      }
      const elapsed=await page.evaluate(()=>WorldDemo.snapshot().world.environment.elapsed);
      await page.waitFor(n=>WorldDemo.snapshot().world.environment.elapsed>n+.4,{args:[elapsed]});
      await pointerClick('#note-delete-cancel');assert.deepEqual(await page.evaluate(()=>WorldDemo.snapshot().notebook.notes),intact);
      await click('#note-remove');await key('Escape','Escape');await key('Escape','Escape','keyUp');
      assert.equal(await page.evaluate(()=>WorldDemo.snapshot().panel),'notebook','Escape dismisses only the confirmation');
      assert.deepEqual(await page.evaluate(()=>WorldDemo.snapshot().notebook.notes),intact,'declining deletion changes nothing');
      assert.equal(await page.evaluate(()=>document.getElementById('note-delete-dialog').open),false);
      await edit('Very long Thai / English title '.repeat(15),'Full note text\n'.repeat(300));
      for(const [width,height] of [[390,740],[1440,900]]){
        await page.session.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
        await capture('notebook-'+width);
        assert.ok(await page.evaluate(()=>{const c=document.getElementById('panel-content');return c.scrollWidth<=c.clientWidth&&document.documentElement.scrollWidth<=innerWidth;}),'long notes fit at '+width);
      }
      await click('#note-list');await capture('notebook-long-list');
      await pointerClick('[data-note-id="'+second+'"]');
      await pointerClick('#note-remove');await pointerClick('#note-confirm-remove');
      assert.deepEqual(await page.evaluate(()=>WorldDemo.snapshot().notebook.notes.map(note=>note.id)),[first]);
      assert.equal(await page.evaluate(()=>document.activeElement.id),'note-new');
      await pointerClick('[data-note-id="'+first+'"]');await click('#note-remove');await click('#note-confirm-remove');
      assert.match(await page.evaluate(()=>document.getElementById('notebook-empty').textContent),/No notes yet/);
      await pointerClick('#note-new');
      assert.equal(await page.evaluate(()=>document.getElementById('note-draft').value),'');
      assert.notEqual(await page.evaluate(()=>WorldDemo.snapshot().notebook.selected),second,'removed note identities are not reused');
      assert.equal(await page.evaluate(()=>WorldDemo.snapshot().fixtureUnchanged),true);
    });
    await click('#close-panel');await click('[data-panel="today"]');
    let today=await page.evaluate(()=>document.getElementById('panel-content').innerText);
    assert.match(today,/No time/);assert.match(today,/automatic block time/);assert.match(today,/Chosen caution days/);
    assert.match(today,/Share the garden field notes/);assert.match(today,/Reference timetable/);
    assert.doesNotMatch(today,/Send the water study/,'handled future deadline raises no caution');
    await capture('today');
    await click('#close-panel');await click('[data-panel="memory"]');
    await t.test('selected MM exposes record information without a summary gate',async()=>{
      const info=await page.evaluate(()=>document.getElementById('panel-content').innerText);
      for(const expected of ['T2','Learning stage','Current MG','Compare leaf edges before naming the plant.',
        'Kolb history','I compared two leaves beside the bridge.','Other parts','The underside gives another clue.',
        'Spaced reviews','Skipped','+Lin history','An evening of closer looking','สังเกตด้านใต้ใบ',
        'https://example.com/garden-journal','Garden field observations','<b>This is literal notebook text.</b>'])assert.ok(info.includes(expected),expected);
      assert.equal(await page.evaluate(()=>document.querySelectorAll('.mm-record b').length),0,'record content is text, never HTML');
      await capture('mm-information');
      await click('#panel-content .mm-choice:nth-of-type(3)');
      const other=await page.evaluate(()=>document.getElementById('panel-content').innerText);
      assert.match(other,/T1 has no Marginal Gains tracking/);
      assert.doesNotMatch(other,/I compared two leaves beside the bridge/,'another MM never inherits this Kolb record');
      await click('#panel-content .mm-choice:nth-of-type(1)');
    });
    await page.evaluate(()=>{const input=document.getElementById('mm-name');input.value='<b>A draft, not markup</b>';input.dispatchEvent(new Event('input',{bubbles:true}));});
    await click('#panel-content .primary');
    await click('#panel-content .mm-choice:nth-of-type(2)');
    assert.equal(await page.evaluate(()=>document.getElementById('mm-name').value),'How water shapes a place');
    await click('#panel-content .mm-choice:nth-of-type(1)');
    assert.equal(await page.evaluate(()=>document.getElementById('mm-name').value),'<b>A draft, not markup</b>');
    await pointerClick('.toolbelt [data-panel="quest"]');
    await t.test('Quest renders the canonical full tree, saved order and starred rollup read-only',async()=>{
      const rendered=await page.evaluate(()=>{
        const slot=WorldDemoCore.fixture(TrackSchema,TrackCalendar,WorldDemo.snapshot().day);
        const flatten=entries=>entries.flatMap(e=>[String(e.node.id),...flatten(e.children)]);
        return {
          actual:[...document.querySelectorAll('[data-quest-node]')].map(e=>e.dataset.questNode),
          expected:flatten(TrackQuest.questTree(slot.goals,slot.mms)),
          stars:[...document.querySelectorAll('[data-quest-star]')].map(e=>e.dataset.questStar),
          expectedStars:TrackQuest.starRollup(slot.goals,slot.mms).map(e=>e.kind==='learn'?e.node.id+':'+e.mmId:e.node.id),
          text:document.getElementById('panel-content').innerText,
          routine:document.querySelector('[data-quest-node="routine-sketch"]').textContent,
          editors:document.querySelectorAll('#panel-content input,#panel-content textarea,#panel-content select,[draggable="true"]').length
        };
      });
      assert.deepEqual(rendered.actual,rendered.expected);
      assert.deepEqual(rendered.stars,rendered.expectedStars);
      assert.match(rendered.text,/5 quests in this branch/);
      assert.match(rendered.text,/Mind map removed/);
      assert.match(rendered.text,/Task · Completed/);
      assert.doesNotMatch(rendered.routine,/Completed/,'routine completion is not a Quest daily tick');
      assert.equal(rendered.editors,0);
      await capture('quest');
      await pointerClick('[data-quest-learn="goal-journal:103"] button');
      await page.evaluate(()=>[...document.querySelectorAll('.quest-details button')].find(b=>b.textContent==='Open mind map').click());
      assert.equal(await page.evaluate(()=>document.getElementById('mm-name').value),'Light, color and observation');
      await click('#close-panel');await page.evaluate(()=>document.getElementById('world').focus());
      await key('KeyJ','j');await key('KeyJ','j','keyUp');
      assert.equal(await page.evaluate(()=>WorldDemo.snapshot().panel),'quest');
    });
    await click('#close-panel');await click('[data-panel="weather"]');
    await page.evaluate(()=>{
      for(const [id,value] of [['weather-choice','rain'],['light-choice','night'],['demo-clock','preview']]) {
        const input=document.getElementById(id);input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));
      }
    });
    await page.waitFor(()=>WorldDemo.snapshot().world.environment.rain>.65,{timeout:30000});
    await capture('rain-night');
    await t.test('snow, heavenly skies and intense rain share the live world and respect reduced motion',async()=>{
      const choose=value=>page.evaluate(value=>{const input=document.getElementById('weather-choice');input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));},value);
      await choose('snow');
      await page.waitFor(()=>WorldDemo.snapshot().world.environment.snow>.7,{timeout:25000});
      assert.equal(await page.evaluate(()=>WorldDemo.snapshot().world.effects.snow),true);
      assert.ok(await page.evaluate(()=>WorldDemo.snapshot().world.environment.snowCover>0));
      await capture('snow');
      await click('#reduce-motion');
      await page.waitFor(()=>!WorldDemo.snapshot().world.effects.snow);
      assert.ok(await page.evaluate(()=>WorldDemo.snapshot().world.environment.snow>.7),'reduced motion stops particles, not the weather state');
      await choose('heavenly');
      await page.waitFor(()=>WorldDemo.snapshot().world.environment.halo>.7,{timeout:25000});
      assert.equal(await page.evaluate(()=>WorldDemo.snapshot().world.effects.halos),true);
      await capture('heavenly');
      await choose('storm');await click('#reduce-motion');
      await page.waitFor(()=>WorldDemo.snapshot().world.environment.storm>.7,{timeout:25000});
      assert.equal(await page.evaluate(()=>WorldDemo.snapshot().world.effects.rain),true);
      await capture('storm');
      await choose('rain');
    });
    await click('#close-panel');await click('[data-panel="today"]');
    assert.match(await page.evaluate(()=>document.getElementById('panel-content').innerText),/Tomorrow preview/);
    assert.match(await page.evaluate(()=>document.getElementById('panel-content').innerText),/Return to the high garden/);
    assert.match(await page.evaluate(()=>document.getElementById('panel-content').innerText),/Kolb & MG records/);
    assert.match(await page.evaluate(()=>document.getElementById('panel-content').innerText),/Garden field observations/);
    await click('#close-panel');await click('[data-panel="weather"]');
    await page.evaluate(()=>{const clock=document.getElementById('demo-clock');clock.value='midnight';clock.dispatchEvent(new Event('change',{bubbles:true}));});
    await click('#close-panel');await click('[data-panel="today"]');
    today=await page.evaluate(()=>document.getElementById('panel-content').innerText);
    assert.match(today,/No deadline warnings/);assert.doesNotMatch(today,/Look for a small change/,'notes stay on original day');
    await click('#day-previous');
    assert.match(await page.evaluate(()=>document.getElementById('panel-content').innerText),/Dated history/);
    assert.match(await page.evaluate(()=>document.getElementById('panel-content').innerText),/Look for a small change/,'history remains reachable on its original date');
    await click('#day-today');
    await page.session.send('Emulation.setDeviceMetricsOverride',{width:800,height:650,deviceScaleFactor:1,mobile:false});
    await capture('narrow');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.equal(await page.evaluate(()=>document.getElementById('close-panel').getBoundingClientRect().right<=innerWidth),true);
    await page.session.send('Emulation.setDeviceMetricsOverride',{width:390,height:740,deviceScaleFactor:1,mobile:false});
    await pointerClick('.toolbelt [data-panel="quest"]');
    await capture('quest-narrow');
    assert.ok(await page.evaluate(()=>{
      const panel=document.getElementById('panel').getBoundingClientRect(),content=document.getElementById('panel-content').getBoundingClientRect(),bar=document.querySelector('.toolbelt').getBoundingClientRect();
      return panel.top===0&&panel.bottom===innerHeight&&content.bottom<=bar.top&&bar.left>=0&&bar.right<=innerWidth&&content.height>150;
    }),'narrow panels leave the entire companion toolbar reachable');
    await click('#close-panel');
    await page.waitFor(()=>!document.getElementById('gameplay-popup').hidden);
    assert.ok(await page.evaluate(()=>document.getElementById('gameplay-popup').getBoundingClientRect().bottom<document.querySelector('.toolbelt').getBoundingClientRect().top),'the gameplay popup clears the narrow toolbar');
    await capture('quest-gameplay');
    assert.deepEqual(await page.evaluate(()=>window.__storageAccess),[]);
    assert.ok(requests.every(url=>url.startsWith('http://127.0.0.1:'+server.address().port)||url.startsWith('data:')),JSON.stringify(requests));
    assert.equal(await page.evaluate(()=>window.__checkSentinel()),'synthetic sentinel - do not read or write');
    assert.equal(await page.evaluate(()=>WorldDemo.snapshot().fixtureUnchanged),true);
    for(const route of ['/track-core/firebase-sync.js','/track-core/storage-guard.js','/track-core/true-storage-core.js','/progress.html']) {
      const forbidden=await fetch('http://127.0.0.1:'+server.address().port+route);
      assert.equal(forbidden.status,404,route);
    }
    t.diagnostic('Behavior-test renderer only: '+JSON.stringify(await page.evaluate(()=>WorldDemo.snapshot().world.metrics)));
    await page.goto('http://127.0.0.1:'+server.address().port,{waitFor:()=>!!window.WorldDemo});
    assert.equal(await page.evaluate(()=>WorldDemo.snapshot().notebook.notes.length),1,'reload restores only the synthetic notebook fixture');
    assert.equal(await page.evaluate(()=>WorldDemo.snapshot().notebook.notes[0].topic),'On noticing');
    assert.deepEqual(await page.evaluate(()=>window.__storageAccess),[]);
    assert.deepEqual(page.errors,[]);
  } finally {
    if(page&&page.errors.length)t.diagnostic(JSON.stringify(page.errors));
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
});
