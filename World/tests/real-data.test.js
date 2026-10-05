'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {Browser}=require('../../tests/lib/cdp');
const {startServer}=require('../tools/serve');

// All file contents, names, storage and captures in this suite are synthetic.
test('workspace file: canonical read-only Today and sky, refresh, labels and isolation',{timeout:180000},async t=>{
  const server=await startServer(0);let browser,page;
  try{
    browser=await Browser.launch();page=await browser.newPage();
    await page.session.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    await page.session.send('Emulation.setTimezoneOverride',{timezoneId:'Asia/Bangkok'});
    const requests=[];await page.session.send('Network.enable');
    page.session.on('Network.requestWillBeSent',e=>requests.push({url:e.request.url,method:e.request.method}));
    await page.addInitScript(`
      const NativeDate=Date;window.__now=new NativeDate(2026,11,31,23,59).getTime();
      window.Date=class extends NativeDate {constructor(...args){super(...(args.length?args:[window.__now]));}static now(){return window.__now;}};
      const real=localStorage,get=Storage.prototype.getItem,set=Storage.prototype.setItem;
      set.call(real,'track_db','synthetic sentinel');window.__storage=[];
      for(const method of ['getItem','setItem','removeItem','clear'])Storage.prototype[method]=function(){window.__storage.push(method);throw Error('Native storage access');};
      window.__sentinel=()=>get.call(real,'track_db');
    `);
    const url='http://127.0.0.1:'+server.address().port;
    await page.goto(url,{waitFor:()=>!!window.WorldDemo});
    assert.equal(await page.evaluate(()=>WorldDemo.ready),true);
    const click=selector=>page.evaluate(selector=>document.querySelector(selector).click(),selector);
    const panel=async name=>{if(await page.evaluate(()=>WorldDemo.snapshot().panel)!==name)await click('.toolbelt [data-panel="'+name+'"]');};
    const text=()=>page.evaluate(()=>document.getElementById('panel-content').innerText);
    const upload=async(value,name='synthetic-workspace.json')=>{
      await page.evaluate(({value,name})=>{
        const transfer=new DataTransfer();transfer.items.add(new File([typeof value==='string'?value:JSON.stringify(value)],name,{type:'application/json'}));
        const input=document.getElementById('track-export');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
      },{value,name});
      await page.waitFor(()=>!WorldDemo.snapshot().fileBusy);
    };
    const fixture=await page.evaluate(()=>{
      const slot=WorldDemoCore.fixture(TrackSchema,TrackCalendar,'2026-12-31');
      slot.id='file-a';slot.name='Synthetic export A';slot.mms.forEach(mm=>mm.name='File A: '+mm.name);
      slot.calendarNotes.push({id:'split',title:'Next-day note',date:'2027-01-01',parts:[{id:'p',title:'Placed today',date:'2026-12-31',time:'12:40',blockDuration:25}]});
      slot.goals.push({id:'routine',title:'File routine',taskType:'routine',routineDates:{'2026-12-31':{time:'11:15',duration:35,done:true}}});
      slot.pos[102]={x:800,y:120};slot.mms[1].customColor='#abcdef';
      window.__synthetic=slot;return slot;
    });
    const before=JSON.stringify(fixture);
    await click('#enter');await panel('today');
    await t.test('loading a Home export keeps full canonical schedule rows, dates and source status',async()=>{
      assert.match(await text(),/Demo data/);await upload(fixture);
      assert.equal(await page.evaluate(()=>WorldDemo.snapshot().source),'file');
      assert.match(await text(),/Real data · export file · read-only/);assert.match(await text(),/Synthetic export A/);
      const rows=await page.evaluate(()=>[...document.querySelectorAll('[data-block-id]')].map(n=>({id:n.dataset.blockId,kind:n.dataset.blockKind,day:n.dataset.blockDay,time:n.querySelector('.when').textContent,title:n.querySelector('strong').textContent,done:n.classList.contains('complete')})));
      const expected=await page.evaluate(()=>TrackCalendar.buildDaySchedule(window.__synthetic,'2026-12-31').blocks.sort((a,b)=>a.time.localeCompare(b.time)).map(b=>({id:String(b.id),kind:b.kind,day:'2026-12-31',time:b.time,title:b.title,done:!!b.done})));
      assert.deepEqual(rows,expected);assert.ok(rows.some(r=>r.id==='split:p'&&r.time==='12:40'));
      assert.match(await text(),/Untimed note · no reminder hour/);assert.match(await text(),/reference only/);
      assert.match(await text(),/Tomorrow preview/);assert.match(await text(),/tomorrow/i);
      await click('#day-next');assert.equal(await page.evaluate(()=>document.querySelector('[data-today-date]').dataset.todayDate),'2027-01-01');
      await click('#day-today');
      const shot=await page.session.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('/tmp/track-world-file-today-synthetic.png',Buffer.from(shot.data,'base64'));
    });
    await t.test('rendered sky keeps imported coordinates and star identity; real details expose no draft or review writes',async()=>{
      await panel('memory');assert.equal(await page.evaluate(()=>document.querySelectorAll('#mm-name,#mm-observation').length),0);
      await click('#memory-sky');await page.waitFor(()=>WorldDemo.snapshot().world.skyPhase==='viewing');
      assert.match(await page.evaluate(()=>document.getElementById('sky-source').textContent),/Real data.*read-only/);
      const node=await page.evaluate(()=>WorldDemo.snapshot().sky.nodes.find(n=>n.id===102));
      assert.deepEqual([node.x,node.y,node.color],[800,120,'#abcdef']);
      assert.equal(await page.evaluate(()=>document.querySelectorAll('[data-sky-mm]').length),fixture.mms.length);
      await page.evaluate(()=>{const input=document.getElementById('sky-find');input.value='File A: How water';input.dispatchEvent(new Event('input',{bubbles:true}));});
      await click('#sky-results button');
      assert.match(await text(),/File A: How water shapes a place/);
      assert.equal(await page.evaluate(()=>document.querySelector('[data-mm-detail]').dataset.mmDetail),'102');
      assert.equal(await page.evaluate(()=>document.querySelectorAll('#mm-name,#mm-observation,#mm-status').length),0);
      assert.doesNotMatch(await text(),/Keep draft|Cancel changes/);
      await click('#close-panel');
      const shot=await page.session.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('/tmp/track-world-file-sky-synthetic.png',Buffer.from(shot.data,'base64'));
      await click('#leave-sky');await page.waitFor(()=>WorldDemo.snapshot().world.skyPhase==='garden');
    });
    await t.test('notebook, Quest, map, ground cues and stamina stay demo; matching numeric IDs never retarget a demo link',async()=>{
      const cues=await page.evaluate(()=>WorldDemo.snapshot().world.reviewCues);
      const stamina=await page.evaluate(()=>WorldDemo.snapshot().world.stamina.max);
      await panel('notebook');assert.match(await page.evaluate(()=>document.querySelector('.panel-footer').textContent),/Demo data/);
      assert.doesNotMatch(await text(),/Synthetic export A|File A:/);
      await panel('quest');assert.match(await page.evaluate(()=>document.getElementById('panel-kicker').textContent),/Demo/);
      await click('[data-quest-learn] .quest-select');assert.match(await text(),/This is a demo link/);
      assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.quest-details button')].some(b=>b.textContent==='Open mind map')),false);
      await panel('map');assert.match(await page.evaluate(()=>document.getElementById('panel-kicker').textContent),/Demo map/);
      await panel('weather');assert.equal(await page.evaluate(()=>document.getElementById('demo-clock').options.length),1);
      assert.equal(await page.evaluate(()=>WorldDemo.snapshot().world.stamina.max),stamina);
      assert.deepEqual(await page.evaluate(()=>WorldDemo.snapshot().world.reviewCues),cues);
      assert.equal(await page.evaluate(()=>WorldDemo.snapshot().fixtureUnchanged),true);
    });
    await t.test('malformed files preserve the loaded source, show an error and never echo parser content',async()=>{
      await panel('today');
      for(const invalid of ['synthetic secret-like broken JSON',{slots:[fixture]},{id:'broken',goals:[{children:[null]}]}]){
        await upload(invalid);assert.equal(await page.evaluate(()=>WorldDemo.snapshot().source),'file');
        assert.match(await text(),/current view has been kept/);assert.match(await text(),/Synthetic export A/);
        assert.doesNotMatch(await text(),/secret-like/);
      }
    });
    await t.test('local midnight follows the real day without moving unfinished records; previous day remains reachable',async()=>{
      await page.evaluate(()=>{window.__now=new Date(2027,0,1,0,1).getTime();});
      await page.waitFor(()=>WorldDemo.snapshot().day==='2027-01-01'&&document.querySelector('[data-today-date]').dataset.todayDate==='2027-01-01');
      assert.equal(await page.evaluate(()=>document.querySelector('[data-block-id="note-untimed"]')!==null),false);
      await click('#day-previous');assert.ok(await page.evaluate(()=>!!document.querySelector('[data-block-id="note-untimed"]')));
      await click('#day-today');assert.equal(await page.evaluate(()=>JSON.stringify(window.__synthetic)),before);
    });
    await t.test('refresh replaces both views and clears selected identities, names and search from the previous workspace',async()=>{
      await panel('memory');
      const replacement={id:'file-b',name:'Synthetic export B',mms:[{id:102,name:'B different identity',type:'1'}],calendarNotes:[{id:'b-note',date:'2027-01-01',title:'B schedule'}]};
      await upload(replacement,'synthetic-b.json');
      assert.equal(await page.evaluate(()=>WorldDemo.snapshot().selectedMM),-1);
      assert.equal(await page.evaluate(()=>document.getElementById('sky-find').value),'');
      assert.doesNotMatch(await text(),/File A:/);assert.match(await text(),/B different identity/);
      await click('.mm-choice');assert.equal(await page.evaluate(()=>document.querySelector('[data-mm-detail]').textContent),'B different identity');
      await click('#memory-sky');await page.waitFor(()=>WorldDemo.snapshot().world.skyPhase==='viewing');
      assert.deepEqual(await page.evaluate(()=>WorldDemo.snapshot().world.skyStars.map(n=>n.id)),[102]);
      await click('#leave-sky');await panel('today');assert.match(await text(),/B schedule/);assert.doesNotMatch(await text(),/File A:/);
    });
    await t.test('empty exports keep empty Today and sky without returning to demo or leaving old meshes',async()=>{
      await upload({id:'empty',name:'Synthetic empty'});assert.equal(await page.evaluate(()=>document.querySelectorAll('[data-block-id]').length),0);
      await panel('memory');assert.match(await text(),/No mind maps in this workspace/);
      await click('#memory-sky');await page.waitFor(()=>WorldDemo.snapshot().world.skyPhase==='viewing');
      assert.equal(await page.evaluate(()=>WorldDemo.snapshot().sky.nodes.length),0);
      assert.equal(await page.evaluate(()=>WorldDemo.snapshot().world.skyStars.length),0);
      assert.match(await page.evaluate(()=>document.getElementById('sky-map').textContent),/No mind maps/);
      await click('#leave-sky');await panel('today');
    });
    await t.test('newest file choice wins, and returning to demo cancels an unfinished read',async()=>{
      await page.evaluate(()=>{
        window.__originalText=File.prototype.text;
        File.prototype.text=function(){if(this.name==='slow.json')return new Promise(resolve=>{window.__finishSlow=()=>resolve(JSON.stringify({id:'slow',name:'Stale read',mms:[]}));});return window.__originalText.call(this);};
        const transfer=new DataTransfer();transfer.items.add(new File(['{}'],'slow.json'));
        const input=document.getElementById('track-export');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
      });
      await page.waitFor(()=>WorldDemo.snapshot().fileBusy);
      await upload({id:'newest',name:'Newest file'});await page.evaluate(()=>window.__finishSlow());
      assert.match(await text(),/Newest file/);assert.doesNotMatch(await text(),/Stale read/);
      await page.evaluate(()=>{
        const transfer=new DataTransfer();transfer.items.add(new File(['{}'],'slow.json'));
        const input=document.getElementById('track-export');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
      });
      await click('#use-demo');await page.evaluate(()=>{window.__finishSlow();File.prototype.text=window.__originalText;});
      assert.equal(await page.evaluate(()=>WorldDemo.snapshot().source),'demo');assert.doesNotMatch(await text(),/Stale read/);
    });
    await t.test('reload forgets the file; native Track bytes and network remain untouched throughout',async()=>{
      await upload(fixture);
      assert.deepEqual(await page.evaluate(()=>window.__storage),[],'no native reads or writes before reload');
      assert.equal(await page.evaluate(()=>window.__sentinel()),'synthetic sentinel');
      await page.reload({waitFor:()=>!!window.WorldDemo});
      assert.equal(await page.evaluate(()=>WorldDemo.snapshot().source),'demo');
      assert.deepEqual(await page.evaluate(()=>window.__storage),[]);
      assert.equal(await page.evaluate(()=>window.__sentinel()),'synthetic sentinel');
      assert.ok(requests.every(r=>r.method==='GET'&&(r.url.startsWith(url+'/')||r.url.startsWith('data:'))),JSON.stringify(requests));
      assert.deepEqual(page.errors,[]);
    });
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
});
