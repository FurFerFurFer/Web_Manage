(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const Core=window.WorldDemoCore, Cal=window.TrackCalendar;
  const canvas=$('world'),panel=$('panel'),content=$('panel-content');
  const baseDay=Cal.toDateStr(new Date());
  const slot=Core.fixture(window.TrackSchema,Cal,baseDay);
  const initialBytes=JSON.stringify(slot);
  let world,entered=false,activePanel=null,returnFocus=null,selectedMM=0;
  let noteKept=slot.notes[0].content,noteDraft=noteKept;
  const mmDrafts=new Map(),mmKept=new Map();
  const settings={rain:false,night:false,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,clock:'evening',quality:'balanced',sensitivity:1};
  let latestMetrics=null;
  function el(tag, attrs={}, ...children) {
    const node=document.createElement(tag);
    for(const [key,value] of Object.entries(attrs)) {
      if(key==='class')node.className=value;
      else if(key.startsWith('on'))node.addEventListener(key.slice(2),value);
      else if(key==='text')node.textContent=value;
      else if(key==='value')node.value=value;
      else if(key==='checked')node.checked=value;
      else node.setAttribute(key,String(value));
    }
    for(const child of children.flat()) if(child!==null&&child!==undefined)node.append(child.nodeType?child:document.createTextNode(String(child)));
    return node;
  }
  const announce=text=>{$('announcement').textContent=text;};
  function stateDay(){return settings.clock==='midnight'?Cal.dayShift(baseDay,1):baseDay;}
  function stateTime(){return {evening:'17:40',preview:'20:10',midnight:'00:10'}[settings.clock];}
  function dateLabel(day){return new Date(day+'T12:00:00').toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'});}
  function updateClock(){$('clock-label').textContent='Demo clock · '+stateTime();}
  function button(text,handler,primary=false){return el('button',{class:primary?'primary':'secondary',onclick:handler},text);}
  function banner(text){return el('p',{class:'note-banner'},text);}
  function section(title,items,empty='Nothing here for this demo day.'){
    return el('section',{},el('h2',{class:'section-label'},title),items.length?items:el('p',{class:'subtle'},empty));
  }
  function row(time,title,detail,className='') {
    return el('div',{class:'schedule-row '+className},el('span',{class:'when'},time),el('div',{},el('strong',{},title),el('small',{},detail)));
  }
  function renderToday() {
    const ds=stateDay(),day=Cal.buildDaySchedule(slot,ds);
    content.append(el('p',{class:'subtle'},dateLabel(ds)+' · '+stateTime()+' · synthetic day'));
    content.append(section('Day notes',day.calNotes.map(note=>row(Cal.noteTimed(note)?note.time:'No time',note.title,
      Cal.noteTimed(note)?'Authored note time':'Untimed note · no reminder hour'))));
    content.append(section('Deadlines',day.deadlines.map(d=>row(d.time||'Due',d.title,Cal.dlDone(d)?'Handled · kept on its due day':'Due today',Cal.dlDone(d)?'complete':''))));
    content.append(section('Chosen caution days',day.deadlinesCaution.map(d=>row('!',d.title,'Due '+dateLabel(d.date)+' · today was individually chosen','caution')),'No deadline warnings for this day.'));
    content.append(section('On the schedule',day.blocks.map(block=>{
      let detail=block.kind+' · '+Cal.durLabel(block.duration);
      if(block.kind==='Day note'&&!Cal.noteTimed(block.item)&&!block.item.blockTime)detail+=' · automatic block time';
      if(block.kind.startsWith('Deadline'))detail+=' · preparation, not the due moment';
      if(block.done)detail+=' · handled';
      return row(block.time,block.title,detail,block.done?'complete':'');
    })));
    content.append(section('Spaced reviews',day.sir.map(review=>row(review.done?'✓':'SIR',review.label,review.done?'Reviewed':'Review due',review.done?'complete':''))));
    content.append(section('Marginal Gains focus',day.mgs.map(name=>row('MG',name,day.mgCarried?'Focus carried from the earlier selection':'Focus chosen for this day'))));
    content.append(section('Reference timetable',day.refBlocks.map(ref=>row(ref.time,ref.title,ref.detail+' · reference only','reference'))));
    if(settings.clock==='preview') {
      const next=Cal.buildDaySchedule(slot,Cal.dayShift(ds,1));
      content.append(section('Tomorrow preview',next.sir.map(r=>row('SIR',r.label,'Tomorrow · '+dateLabel(Cal.dayShift(ds,1))))));
    }
  }
  function exportText(name,text) {
    const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
    const a=el('a',{href:url,download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function renderNotebook() {
    content.append(banner('A notebook draft for this demo. Keep it here while you explore, or export a text copy. Reloading clears the session.'));
    const status=el('p',{class:'status-line',id:'note-status','aria-live':'polite'});
    const textarea=el('textarea',{id:'note-draft',oninput:event=>{noteDraft=event.target.value;status.textContent='Draft changed · demo memory only';}});
    textarea.value=noteDraft;
    content.append(el('div',{class:'form-row'},el('label',{for:'note-draft'},'On noticing'),textarea));
    content.append(el('div',{class:'button-row'},
      button('Keep in demo',()=>{noteKept=noteDraft;status.textContent='Kept in this demo session. Reload clears it.';},true),
      button('Cancel changes',()=>{noteDraft=noteKept;textarea.value=noteDraft;status.textContent='Returned to the last kept demo draft.';}),
      button('Export text',()=>exportText('track-world-notebook-draft.txt',noteDraft))));
    content.append(status,el('p',{class:'subtle'},'You can close this panel and continue walking. Your draft stays here until reload.'));
  }
  function renderMemory() {
    content.append(banner('Three synthetic mind maps live in the little grove. Click their stars in the garden or select one here.'));
    slot.mms.forEach((mm,i)=>{
      const dot=el('span',{class:'star-dot','aria-hidden':'true'},'✧');dot.style.color=mm.color;
      content.append(el('button',{class:'mm-choice','aria-pressed':selectedMM===i,onclick:()=>{selectedMM=i;renderPanel();}},dot,
        el('span',{},el('strong',{},mm.name),el('small',{},i===0?'Parent mind map · MG focus':'Connected mind map · '+mm.type))));
    });
    const mm=slot.mms[selectedMM];
    if(!mmDrafts.has(mm.id))mmDrafts.set(mm.id,{name:mm.name,observation:''});
    const draft=mmDrafts.get(mm.id);
    content.append(el('h2',{},'Selected mind map draft'));
    const name=el('input',{type:'text',id:'mm-name',value:draft.name,oninput:event=>{draft.name=event.target.value;}});
    const observation=el('textarea',{id:'mm-observation',oninput:event=>{draft.observation=event.target.value;}});observation.value=draft.observation;
    content.append(el('div',{class:'form-row'},el('label',{for:'mm-name'},'Name'),name),
      el('div',{class:'form-row'},el('label',{for:'mm-observation'},'Observation'),observation));
    const status=el('p',{class:'status-line',id:'mm-status','aria-live':'polite'});
    content.append(el('div',{class:'button-row'},button('Keep draft in demo',()=>{
      if(!draft.name.trim()){status.textContent='Give this draft a name.';name.focus();return;}
      mmKept.set(mm.id,{...draft});status.textContent='Draft kept for this mind map in demo memory only.';
    },true),button('Cancel changes',()=>{mmDrafts.set(mm.id,{...(mmKept.get(mm.id)||{name:mm.name,observation:''})});renderPanel();})));
    content.append(status,el('p',{class:'subtle'},'This first demo tests selection and drafts. The KS03 sky layout and full MG, Kolb, SIR, +Lin and source actions remain later work.'));
  }
  function select(label,id,choices,value,change) {
    const input=el('select',{id,onchange:event=>change(event.target.value)},choices.map(([val,text])=>el('option',{value:val},text)));
    input.value=value;return el('div',{class:'form-row'},el('label',{for:id},label),input);
  }
  function metricsView(metrics) {
    const host=$('metrics');if(!host||!metrics)return;
    host.replaceChildren(...[
      ['Frame rate',metrics.fps+' fps'],['Frame time · p95',metrics.p95+' ms'],
      ['World resolution',metrics.resolution],['Draw calls',metrics.drawCalls??'Unavailable'],
      ['Renderer',metrics.renderer],['Engine','Babylon.js '+metrics.version],['Active run',metrics.seconds+' seconds']
    ].flatMap(([name,value])=>[el('dt',{},name),el('dd',{},value)]));
  }
  function renderWeather() {
    content.append(el('p',{},'One weather state changes the light, wind, rain, water and wet stone together. Surfaces dry gradually after rain.'));
    content.append(select('Weather','weather-choice',[['clear','Clear skies'],['rain','Rain']],settings.rain?'rain':'clear',value=>{settings.rain=value==='rain';world?.setWeather({rain:settings.rain});}));
    content.append(select('Light study','light-choice',[['day','Daylight'],['night','Night']],settings.night?'night':'day',value=>{settings.night=value==='night';world?.setWeather({night:settings.night});}));
    content.append(select('Demo clock','demo-clock',[['evening','17:40 · today'],['preview','20:10 · today + tomorrow preview'],['midnight','00:10 · next day']],settings.clock,value=>{settings.clock=value;updateClock();}));
    content.append(el('p',{class:'subtle'},'The demo clock selects synthetic calendar examples. The light study is an independent art control.'));
    const reduced=el('input',{type:'checkbox',id:'reduce-motion',checked:settings.reduced,onchange:event=>{settings.reduced=event.target.checked;world?.setReduced(settings.reduced);}});
    content.append(el('div',{class:'form-row'},el('label',{for:'reduce-motion'},reduced,' Reduce environmental motion'),el('small',{class:'subtle'},'Keeps weather and light changes; stops moving foliage, stars and rain streaks.')));
    content.append(select('World detail','quality',[['balanced','Balanced · up to 720p'],['sharp','Sharper · window resolution']],settings.quality,value=>{settings.quality=value;world?.setQuality(value);}));
    const range=el('input',{type:'range',id:'sensitivity',min:'.3',max:'2',step:'.1',value:settings.sensitivity,oninput:event=>{settings.sensitivity=Number(event.target.value);world?.setSensitivity(settings.sensitivity);}});
    content.append(el('div',{class:'form-row'},el('label',{for:'sensitivity'},'Camera sensitivity'),range));
    content.append(el('h2',{},'Live performance'),el('dl',{class:'metric-list',id:'metrics'}));metricsView(latestMetrics);
    content.append(el('p',{class:'subtle'},'A short live reading, not a completed laptop benchmark. Target: 30 fps at 720p; the sustained route test is still required.'));
  }
  function renderHelp() {
    content.append(el('p',{},'Explore the clock ring, cross the little bridge, try the terrace steps, and find the three stars beneath the trees.'));
    content.append(el('ul',{class:'help-list'},[
      'W A S D or arrow keys: walk. Hold Shift to run. Space: jump.',
      'Drag anywhere on the garden to look. Q / E also turn the camera. Scroll to change camera distance.',
      'T: Today. N: Notebook. M: Mind maps. V: Weather and settings.',
      'Escape: close the panel. Movement rests while a panel is open. Click the garden to resume keyboard movement.',
      'The demo uses synthetic data and keeps drafts only in memory. Export any text you want to keep before reloading.'
    ].map(text=>el('li',{},text))));
    content.append(button('Return to the start',()=>{world?.reset();closePanel();canvas.focus();}));
    content.append(el('h2',{},'About this first scene'),el('p',{class:'subtle'},'Procedural shapes are placeholders. Advanced traversal, the full knowledge sky, production artwork, audio, real Track integration and persistent drafts are not implemented yet.'));
  }
  const titles={today:'Today',notebook:'Notebook',memory:'Memory Grove',weather:'Weather & settings',help:'A walk through the garden'};
  function renderPanel() {
    content.replaceChildren();$('panel-title').textContent=titles[activePanel];
    $('panel-kicker').textContent=activePanel==='today'?'A small season of learning':'Your garden companion';
    ({today:renderToday,notebook:renderNotebook,memory:renderMemory,weather:renderWeather,help:renderHelp})[activePanel]();
  }
  function openPanel(name) {
    if(activePanel===name){closePanel();return;}
    if(!activePanel)returnFocus=document.activeElement;
    activePanel=name;panel.hidden=false;world?.pause(true);canvas.inert=true;
    document.querySelectorAll('.day-bud,.bottom-ui,#welcome').forEach(node=>{node.inert=true;});
    if(document.pointerLockElement)document.exitPointerLock();
    renderPanel();document.querySelectorAll('[data-panel]').forEach(button=>button.setAttribute('aria-expanded',button.dataset.panel===name));
    $('close-panel').focus();announce(titles[name]+' opened. Movement paused.');
  }
  function closePanel() {
    activePanel=null;panel.hidden=true;canvas.inert=false;world?.pause(!entered);
    document.querySelectorAll('.day-bud,.bottom-ui,#welcome').forEach(node=>{node.inert=false;});
    document.querySelectorAll('[data-panel]').forEach(button=>button.setAttribute('aria-expanded','false'));
    if(returnFocus&&document.contains(returnFocus))returnFocus.focus();else canvas.focus();
    announce('Panel closed.');
  }
  function error(message){$('error-message').textContent=message;$('load-error').hidden=false;}
  document.querySelectorAll('[data-panel]').forEach(button=>button.addEventListener('click',()=>openPanel(button.dataset.panel)));
  $('close-panel').addEventListener('click',closePanel);
  $('retry').addEventListener('click',()=>location.reload());
  $('read-without-world').addEventListener('click',()=>{$('load-error').hidden=true;openPanel('notebook');});
  $('enter').addEventListener('click',()=>{entered=true;$('welcome').hidden=true;world.pause(false);canvas.focus();});
  document.addEventListener('keydown',event=>{
    if(event.isComposing||event.keyCode===229)return;
    if(event.key==='Escape'&&activePanel){event.preventDefault();closePanel();return;}
    if(activePanel&&event.key==='Tab') {
      const focusables=[...panel.querySelectorAll('button,input,textarea,select,summary,a[href]')].filter(node=>!node.disabled&&node.getClientRects().length);
      const first=focusables[0],last=focusables.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      return;
    }
    if(event.ctrlKey||event.metaKey||event.altKey||event.repeat||activePanel||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName))return;
    const name={KeyT:'today',KeyN:'notebook',KeyM:'memory',KeyV:'weather'}[event.code];
    if(name){event.preventDefault();openPanel(name);}
  });
  updateClock();
  try {
    world=window.createWorldScene(canvas,{
      selectMM(index){selectedMM=index;openPanel('memory');},error,
      tick({environment,position,metrics}) {
        latestMetrics=metrics;
        const [x,,z]=position;
        $('place-name').textContent=x< -9&&z>11?'Memory Grove':x>7&&z>8?'North terrace':Math.hypot(x,z-7)<9.5?'Clock Plaza':'Clockgarden approach';
        $('weather-label').textContent=(environment.rain>.8?'Rain':environment.rain>.05?'Weather turning':environment.wetness>.2?'Clearing · wet stone':'Clear skies')+(environment.night>.5?' · night':'');
        $('interaction').hidden=!entered||!!activePanel||!(x< -9&&z>11);
        $('interaction').textContent='Click a star or press M to inspect a mind map';
        if(activePanel==='weather')metricsView(metrics);
      }
    });
    $('enter').disabled=false;$('enter').textContent='Enter the garden';
  } catch(err) {error(err.message);$('enter').textContent='Garden unavailable';}
  // Read-only diagnostic surface, used by the isolated browser tests. Never
  // exposes a Track writer or an engine object that could mutate real data.
  window.WorldDemo=Object.freeze({ready:!!world,
    snapshot:()=>({entered,panel:activePanel,day:stateDay(),time:stateTime(),selectedMM,
      noteDraft,noteKept,fixtureUnchanged:JSON.stringify(slot)===initialBytes,world:world?.snapshot()||null})});
  window.addEventListener('pagehide',()=>world?.dispose(),{once:true});
})();
