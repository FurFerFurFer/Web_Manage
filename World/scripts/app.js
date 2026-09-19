(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const Core=window.WorldDemoCore, Cal=window.TrackCalendar, Quest=window.TrackQuest;
  const canvas=$('world'),panel=$('panel'),content=$('panel-content');
  const baseDay=Cal.toDateStr(new Date());
  const slot=Core.fixture(window.TrackSchema,Cal,baseDay);
  const initialBytes=JSON.stringify(slot);
  // The KS03 streak buys sprint duration (draft section 4). It is READ once, here,
  // from synthetic records, with the local day and the day-shift helper passed in --
  // movement itself never reads or writes a Track record, and never a streak.
  const sprintStreak=window.WorldStamina.streakFrom(slot.linChanges,baseDay,Cal.dayShift);
  const sprintBudget=window.WorldStamina.budgetFor(sprintStreak);
  let world,entered=false,activePanel=null,returnFocus=null,selectedMM=0,skyActive=false;
  // Track-shaped session records. The live Track command boundary is still separate.
  let notebookNotes=slot.notes.map(note=>({...note}));
  let selectedNote=null,nextNote=1;
  const currentNote=()=>notebookNotes.find(note=>note.id===selectedNote)||null;
  const mmDrafts=new Map(),mmKept=new Map();
  const settings={weather:'clear',night:false,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,clock:'local',quality:'balanced',sensitivity:1};
  let selectedDay=null,lastClock='';
  let latestMetrics=null;
  const skyView=window.createWorldSkyView(index=>{selectedMM=index;openPanel('memory');},
    (graph,view,viewport)=>world?.setSkyView(graph,view,viewport));
  const skyGraph=()=>window.WorldSkyCore.project(slot,window.TrackGraphLayout,Cal,stateDay());
  function refreshSky(){const graph=skyGraph();skyView.render(graph);world?.setReviewCues(graph.nodes);}
  function enterSky() {
    if(!entered||activePanel)return;
    const result=world?.lookAtSky(true);
    if(!result?.ok){announce(result?.reason||'The garden is unavailable.');return;}
    skyActive=true;$('sky-view').hidden=false;canvas.inert=true;world.setInputEnabled(false);
    skyView.render(skyGraph(),true);$('leave-sky').focus();announce('Memory Grove sky opened. The garden keeps moving.');
  }
  function leaveSky() {
    skyActive=false;$('sky-view').hidden=true;$('sky-view').inert=false;world?.lookAtSky(false);
    canvas.inert=!!activePanel;world?.setInputEnabled(!activePanel);canvas.focus();announce('Back in the Memory Grove.');
  }
  function openSkyFromMemory() {
    if(!world)return;
    if(skyActive){closePanel();$('leave-sky').focus();return;}
    // Explicit demo travel, offered by name. Merely opening a panel never moves
    // the character, and ordinary G entry still requires standing in the Grove.
    if(!world.snapshot().inGrove&&!world.visitGrove())return;
    if(!entered){entered=true;$('welcome').hidden=true;world.pause(false);}
    closePanel();enterSky();
  }
  function tryFlight(){
    if(!world)return;
    if(skyActive)leaveSky();
    world.reset();world.visitLauncher();
    entered=true;$('welcome').hidden=true;world.pause(false);
    if(activePanel)closePanel();canvas.focus();
    announce('Windseed launcher. Hold X to charge, then release. Cloudrest is straight ahead.');
  }
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
  const mapView=window.createWorldMapView({el,button,announce,
    resolveSurface:point=>world?.surfacePoint(point)||null,onDestination:point=>world?.setDestination(point),
    openMap:()=>{if(activePanel!=='map')openPanel('map');else renderPanel();}});
  let selectedQuest=null;
  const clock=()=>Core.clockState(baseDay,settings.clock,new Date(),Cal);
  function stateDay(){return clock().day;}
  function stateTime(){return clock().time;}
  function dateLabel(day){return new Date(day+'T12:00:00').toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'});}
  function updateClock(){const value=clock();$('clock-label').textContent=(settings.clock==='local'?'Local time':'Demo clock')+' · '+value.time;lastClock=value.day+' '+value.time;}
  function button(text,handler,primary=false){return el('button',{class:primary?'primary':'secondary',onclick:handler},text);}
  function banner(text){return el('p',{class:'note-banner'},text);}
  function section(title,items,empty='Nothing here for this demo day.'){
    return el('section',{},el('h2',{class:'section-label'},title),items.length?items:el('p',{class:'subtle'},empty));
  }
  function row(time,title,detail,className='') {
    return el('div',{class:'schedule-row '+className},el('span',{class:'when'},time),el('div',{},el('strong',{},title),el('small',{},detail)));
  }
  function renderToday() {
    const ds=selectedDay||stateDay(),day=Cal.buildDaySchedule(slot,ds);
    content.append(el('p',{class:'subtle'},dateLabel(ds)+' · '+stateTime()+' · synthetic day'));
    const showDay=date=>{selectedDay=date;renderPanel();};
    content.append(el('div',{class:'button-row'},
      el('button',{id:'day-previous',class:'secondary','aria-label':'Previous day',onclick:()=>showDay(Cal.dayShift(ds,-1))},'←'),
      el('button',{id:'day-today',class:'secondary',onclick:()=>showDay(null)},'Today'),
      el('button',{id:'day-next',class:'secondary','aria-label':'Next day',onclick:()=>showDay(Cal.dayShift(ds,1))},'→')));
    if(ds<stateDay())content.append(banner('Dated history · records stay on this day. Open work keeps its original date and status.'));
    else if(ds>stateDay())content.append(banner('Upcoming · these records belong to '+dateLabel(ds)+'.'));
    content.append(section('Day notes',day.calNotes.map(note=>row(Cal.noteTimed(note)?note.time:'No time',note.title,
      Cal.noteTimed(note)?'Authored note time':'Untimed note · no reminder hour'))));
    content.append(section('Deadlines',day.deadlines.map(d=>row(d.time||'Due',d.title,Cal.dlDone(d)?'Handled · kept on its due day':'Due today',Cal.dlDone(d)?'complete':''))));
    content.append(section('Chosen caution days',day.deadlinesCaution.map(d=>row('!',d.title,'Due '+dateLabel(d.date)+' · today was individually chosen','caution')),'No deadline warnings for this day.'));
    content.append(section('On the schedule',[...day.blocks].sort((a,b)=>a.time.localeCompare(b.time)).map(block=>{
      let detail=block.kind+' · '+Cal.durLabel(block.duration);
      if(block.kind==='Day note'&&!Cal.noteTimed(block.item)&&!block.item.blockTime)detail+=' · automatic block time';
      if(block.kind.startsWith('Deadline'))detail+=' · preparation, not the due moment';
      if(block.done)detail+=' · handled';
      return row(block.time,block.title,detail,block.done?'complete':'');
    })));
    content.append(section('Spaced reviews',day.sir.map(review=>row(review.done?'✓':'SIR',review.label,review.done?'Reviewed':'Review due',review.done?'complete':''))));
    content.append(section('Marginal Gains focus',Cal.mgsForDay(ds,slot.mgSchedule).map(id=>{
      const mm=slot.mms.find(m=>m.id===id);
      const item=row('MG',mm?.name||'Mind map removed',(day.mgCarried?'Carried focus':'Focus today')+(mm?.currentMG?' · '+mm.currentMG:''));
      if(mm)item.lastChild.append(button('Open mind map',()=>{selectedMM=slot.mms.indexOf(mm);openPanel('memory');}));
      return item;
    })));
    content.append(section('Reference timetable',day.refBlocks.map(ref=>row(ref.time,ref.title,ref.detail+' · reference only','reference'))));
    const date=new Date(ds+'T12:00:00'),buckets=Cal.buildBuckets(slot,date.getFullYear(),date.getMonth())[ds]||{};
    const lanes=Cal.buildMilestoneLanes(slot,date.getFullYear(),date.getMonth()).lanesByDate[ds]||[];
    content.append(section('Milestone periods',lanes.map(m=>row('◇',m.title,m.owner+' · '+m.startDate+' – '+m.endDate))));
    for(const [kind,title] of [['kolbmg','Kolb & MG records'],['lin','+Lin records'],['note','Notebook captures'],['dump','Source captures']]){
      content.append(section(title,(buckets[kind]||[]).map(item=>row('•',item.label,item.meta||'Recorded on this day'))));
    }
    const preview=ds===stateDay()?Core.tomorrowPreview(slot,Cal,ds,stateTime()):null;
    if(preview) {
      const next=preview.schedule,dated='Tomorrow · '+dateLabel(preview.date);
      content.append(section('Tomorrow preview',[
        ...next.calNotes.map(n=>row(Cal.noteTimed(n)?n.time:'No time',n.title,dated+' · Day note')),
        ...next.deadlines.map(d=>row(d.time||'Due',d.title,dated+' · Deadline')),
        ...next.deadlinesCaution.map(d=>row('!',d.title,dated+' · Chosen caution day','caution')),
        ...next.blocks.map(b=>row(b.time,b.title,dated+' · '+b.kind)),
        ...next.sir.map(r=>row('SIR',r.label,dated)),
        ...next.refBlocks.map(r=>row(r.time,r.title,dated+' · Reference only','reference'))
      ]));
    }
    if(ds===stateDay()&&ds!==baseDay){
      content.append(button('View original demo day',()=>showDay(baseDay)));
    }
  }
  function renderNotebook() {
    const note=currentNote();
    panel.dataset.notebook=note?'detail':'list';
    document.querySelector('.panel-footer').textContent='Demo data · changes last until reload';
    const showList=()=>{selectedNote=null;renderPanel();$('note-new').focus();};
    const showNote=id=>{selectedNote=id;renderPanel();$('note-draft').focus();};
    if(!note){
      const list=el('div',{class:'notebook-list','aria-label':'Notebook notes'});
      for(const entry of notebookNotes){
        list.append(el('button',{class:'notebook-entry','data-note-id':entry.id,onclick:()=>showNote(entry.id)},
          el('span',{class:'notebook-dot','aria-hidden':'true'}),el('span',{},entry.topic||'(untitled)')));
      }
      content.append(list);
      if(!notebookNotes.length)content.append(el('p',{id:'notebook-empty'},'No notes yet. Hit + to add one.'));
      content.append(el('button',{id:'note-new',class:'secondary',onclick:()=>{
        const note={id:'notebook-session-'+nextNote++,topic:'',content:'',createdAt:Date.now()};
        notebookNotes.push(note);showNote(note.id);
      }},'+ Add note'));
      return;
    }
    const topic=el('input',{id:'note-topic',type:'text','aria-label':'Topic name',placeholder:'Topic name…',value:note.topic,
      oninput:event=>{note.topic=event.target.value;},onblur:event=>{note.topic=event.target.value.trim();event.target.value=note.topic;},
      onkeydown:event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();event.target.blur();}}});
    const textarea=el('textarea',{id:'note-draft','aria-label':'Note',placeholder:'Write anything…',oninput:event=>{note.content=event.target.value;}});
    textarea.value=note.content;
    const dialog=el('dialog',{class:'note-delete-dialog',id:'note-delete-dialog','aria-labelledby':'note-delete-title'});
    const remove=el('button',{id:'note-remove',class:'secondary','aria-label':'Delete note',title:'Delete note',onclick:()=>{
      $('note-delete-name').textContent='Delete “'+(note.topic||'(untitled)')+'”?';dialog.showModal();$('note-delete-cancel').focus();
    }});
    // Same static trash symbol as Track's notes widget; note text is never HTML.
    remove.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>';
    dialog.append(el('h2',{id:'note-delete-title'},'Delete note'),el('p',{id:'note-delete-name'}),el('div',{class:'button-row'},
      el('button',{id:'note-delete-cancel',class:'secondary',onclick:()=>dialog.close()},'Cancel'),
      el('button',{id:'note-confirm-remove',class:'primary',onclick:()=>{
        notebookNotes=notebookNotes.filter(entry=>entry.id!==note.id);dialog.close();showList();announce('Note deleted.');
      }},'Delete')));
    dialog.addEventListener('close',()=>{if(remove.isConnected)remove.focus();});
    content.append(el('div',{class:'notebook-editor-heading'},
      el('button',{id:'note-list',class:'secondary','aria-label':'Back to notes list',title:'Back to list',onclick:showList},'←'),topic,remove),textarea,dialog);
  }
  function renderMemory() {
    content.append(el('div',{class:'memory-sky-entry'},el('span',{'aria-hidden':'true',class:'memory-sky-symbol'},'✧'),
      el('div',{},el('h2',{},'Mind maps among the stars'),
        el('p',{},skyActive?'Return to the constellation behind this record.':'Visit the Grove and open its sky of connected mind maps.'),
        el('button',{id:'memory-sky',class:'secondary',onclick:openSkyFromMemory},skyActive?'Back to the stars':'View stars in the Grove'),
        !skyActive?el('small',{},'Demo travel shortcut · takes you to the Grove'):null)));
    slot.mms.forEach((mm,i)=>{
      const dot=el('span',{class:'star-dot','aria-hidden':'true'},'✧');dot.style.color=mm.customColor;
      content.append(el('button',{class:'mm-choice','aria-pressed':selectedMM===i,onclick:()=>{selectedMM=i;renderPanel();}},dot,
        el('span',{},el('strong',{},mm.name),el('small',{},(mm.type==='anchor'?'Anchor':'T'+mm.type)+' · '+stageLabel(mm.ksStage)))));
    });
    const mm=slot.mms[selectedMM];
    renderMMInformation(mm);
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
    content.append(status,el('p',{class:'subtle'},'The record above is read-only. These two draft fields stay in demo memory. Full action forms and inherited source views are still in development.'));
  }
  function stageLabel(stage){return stage==='sir'?'SIR':stage==='finished'?'Finished':stage?'Stage '+stage:'Unassigned';}
  function linDescription(change) {
    const labels={stageAdvance:'Stage advanced',stageRevert:'Stage reverted',stageClear:'Stage cleared',stageFinish:'Learning finished',
      sirDone:'Review completed',sirSkip:'Review skipped',sirPostpone:'Review postponed',sirRevert:'Review reverted'};
    return labels[change.type]||'Recorded change';
  }
  function fields(pairs) {
    return el('dl',{class:'record-fields'},pairs.flatMap(([name,value])=>value===undefined||value===null||value===''?[]:
      [el('dt',{},name),el('dd',{},value)]));
  }
  function record(title,...children){return el('article',{class:'mm-record'},el('h3',{},title),...children);}
  function linkRecord(link) {
    // Synthetic references are visible in full, with no content loaded remotely.
    return fields([['Link',link.label||link.url],['URL',link.url]]);
  }
  function renderMMInformation(mm) {
    const navigate=other=>button(other.name,()=>{selectedMM=slot.mms.indexOf(other);renderPanel();});
    content.append(section('Mind map information',[fields([
      ['Type',mm.type==='anchor'?'Anchor':'T'+mm.type],['Learning stage',mm.type==='anchor'?null:stageLabel(mm.ksStage)],
      ['Clarity',mm.unclear?'Marked unclear':'Not marked unclear'],['Explanation',mm.explanation]
    ])]));
    const parents=(mm.parentIds||[]).map(id=>slot.mms.find(m=>m.id===id));
    const children=slot.mms.filter(m=>(m.parentIds||[]).includes(mm.id));
    content.append(section('Connections',[
      record('Parents',parents.length?el('div',{class:'button-row'},parents.map(parent=>parent?navigate(parent):el('p',{},'Parent mind map removed'))):el('p',{class:'subtle'},'No parent mind maps.')),
      record('Children',children.length?el('div',{class:'button-row'},children.map(navigate)):el('p',{class:'subtle'},'No child mind maps.'))
    ]));
    if(mm.type!=='anchor') {
      content.append(section('Marginal Gains',mm.type==='2'?[
        fields([['Current MG',mm.currentMG||'No MG yet.'],['Rating',mm.rating==null?'Not set':mm.rating+' / 10']]),
        ...slot.mgChanges.filter(change=>change.mmId===mm.id).sort((a,b)=>b.date.localeCompare(a.date)).map(change=>
          record(change.date,fields([['Previous MG',change.oldMG],['New MG',change.newMG],['Experiment',change.experiment]])))
      ]:[el('p',{class:'subtle'},'T1 has no Marginal Gains tracking.')]));
      const kolbFields=[['experience','Experience'],['level','Level'],['mgLookLike','What the MG looks like'],
        ['sequence','Sequence'],['feelings','Feelings'],['difficultWell','Difficult / went well'],['challenges','Challenges'],
        ['triggers','Triggers'],['whyActed','Why I acted'],['habits','Habits'],['otherParts','Other parts'],['experiments','Experiments'],['mgAdd','MG addition']];
      content.append(section('Kolb history',slot.kolbs.filter(k=>k.mmId===mm.id).sort((a,b)=>b.date.localeCompare(a.date)).map(k=>
        record(k.date,fields([['Reflecting on a previous experiment',k.isReflectingOnPrev?'Yes':'No'],...kolbFields.map(([key,label])=>[label,k[key]])]))),'No Kolb records for this mind map.'));
      content.append(section('Spaced reviews',slot.sessions.filter(s=>s.mmId===mm.id).sort((a,b)=>a.repIndex-b.repIndex).map(s=>
        record('Review '+(s.repIndex+1),fields([['Scheduled day',s.date],['Status',s.done?'Reviewed':s.skipped?'Skipped':'Pending'],['Finished day',s.finishDate]]))),'No review records for this mind map.'));
      content.append(section('+Lin history',slot.linChanges.flatMap(entry=>(entry.items||[]).filter(item=>item.mmId===mm.id).map(item=>
        record(entry.title||entry.date,fields([['Day',entry.date],['Change',linDescription(item.change)],['Previous value',item.change.oldValue],['New value',item.change.newValue],
          ['Review',item.change.repIndex==null?null:item.change.repIndex+1]])))),'No +Lin records for this mind map.'));
    }
    content.append(section('Comments',(mm.comments||[]).map(comment=>record(comment.date,fields([['Comment',comment.text],['Status',comment.done?'Handled':'Open']]))),'No comments.'));
    content.append(section('Links',(mm.links||[]).map(linkRecord),'No links.'));
    content.append(section('Direct source connections',slot.sourceDumps.flatMap(dump=>(dump.mmLinks||[]).filter(link=>link.mmId===mm.id).map(link=>
      record(dump.title,...(link.textBlocks?.length?link.textBlocks.map(block=>fields([['Title',block.title],['Text',block.explanation]])):[fields([['Text',link.text]])]),
        ...(link.links||[]).map(linkRecord)))),'No direct source connections.'));
  }
  function select(label,id,choices,value,change) {
    const input=el('select',{id,onchange:event=>change(event.target.value)},choices.map(([val,text])=>el('option',{value:val},text)));
    input.value=value;return el('div',{class:'form-row'},el('label',{for:id},label),input);
  }
  function renderQuest() {
    const layout=el('div',{class:'quest-layout'}),list=el('div',{class:'quest-list','aria-label':'Quest list'}),detail=el('article',{class:'quest-details','aria-label':'Selected quest'});
    content.append(layout);layout.append(list,detail);
    const items=[];
    const keyOf=item=>item.kind==='learn'?item.node.id+':'+item.mmId:item.node.id;
    const titleOf=item=>item.kind==='learn'?(item.mm?.name||'Mind map removed'):(item.node.title||'Untitled');
    function showDetail(item,focus=true){
      selectedQuest=keyOf(item);detail.replaceChildren();
      list.querySelectorAll('[data-select-quest]').forEach(node=>node.setAttribute('aria-pressed',String(node.dataset.selectQuest===selectedQuest)));
      const node=item.node,destination=mapView.destination(item),routine=node.taskType==='routine';
      detail.append(el('span',{class:'quest-detail-kind'},item.kind==='learn'?'To learn':!item.quest?'Goal context':node.children?.length?'Goal':routine?'Routine':'Task'),el('h2',{tabindex:'-1'},titleOf(item)));
      detail.append(fields([['Goal',item.kind==='learn'?node.title:null],['Scheduled day',node.scheduledDate],['Time',node.scheduledTime],['Duration',node.duration?Cal.durLabel(node.duration):null]]));
      for(const note of node.notes||[])detail.append(record(note.title||'Note',fields([['Detail',note.detail]])));
      if(item.kind==='learn'){
        detail.append(el('p',{},item.mm?'Read this mind map’s full learning record in Memory Grove.':'This linked mind map is no longer available.'));
        if(item.mm)detail.append(button('Open mind map',()=>{selectedMM=slot.mms.indexOf(item.mm);openPanel('memory');}));
      }else if(item.quest){
        detail.append(el('p',{},routine?'A routine quest. Its daily ticks remain in Track.':node.children?.length?'This quest includes the branch beneath it.':node.completed?'Completed in Track.':'An open quest from Track.'));
      }else detail.append(el('p',{},'This goal provides context for the quests beneath it.'));
      if(node.description)detail.append(el('p',{class:'quest-description'},node.description));
      detail.append(el('div',{class:'quest-destination'},el('h3',{},destination?.name||'No destination mapped'),el('p',{},destination?'Explore this location in the demo garden. Reaching it leaves your Track progress unchanged.':'This entry remains readable here. A world location has not been assigned.')));
      const actions=el('div',{class:'quest-actions'});
      if(destination){
        actions.append(button('Show on map',()=>mapView.goTo(destination)),el('button',{class:'primary',id:'quest-navigate',onclick:()=>{mapView.navigate({...destination,name:titleOf(item)+' · '+destination.name});closePanel();canvas.focus();}},'Navigate'));
      }
      detail.append(actions,el('p',{class:'subtle'},'Synthetic workspace · Quest changes belong in Track.'));
      if(focus)detail.querySelector('h2').focus();
    }
    const tree=Quest.questTree(slot.goals,slot.mms),stars=Quest.starRollup(slot.goals,slot.mms);
    list.append(section('Starred',stars.map(item=>el('div',{class:'quest-starred','data-quest-star':keyOf(item)},
      el('span',{class:'quest-star','aria-hidden':'true'},'★'),
      el('div',{},el('button',{class:'quest-select','data-select-quest':keyOf(item),onclick:()=>showDetail({...item,quest:true})},titleOf(item)),
        item.count>1?el('small',{},item.count+' quests in this branch'):null,
        item.kind==='learn'?el('small',{},'To learn · '+(item.node.title||'Untitled')):null))),
      'No starred quests in this workspace.'));
    function branch(entries) {
      return el('ul',{class:'quest-tree'},entries.map(entry=>{
        const node=entry.node,routine=node.taskType==='routine';
        const kind=node.isSubGoal?'Sub-goal':node.children?.length?'Goal':routine?'Routine':'Task';
        const done=entry.quest&&!routine&&!node.children?.length&&!!node.completed;
        const item={...entry,kind:'node'};items.push(item);
        const line=el('div',{class:'quest-entry'+(entry.quest?'':' quest-context'),'data-quest-node':node.id},
          el('button',{class:'quest-select','data-select-quest':node.id,onclick:()=>showDetail(item)},node.title||'Untitled'),
          entry.star?el('span',{class:'quest-star','aria-label':'Starred'},'★'):null,
          el('small',{},entry.quest?kind+(done?' · Completed':''):kind+' · Context'));
        const learns=entry.learn.length?el('ul',{class:'quest-tree'},entry.learn.map(learn=>{
          const item={...learn,node,kind:'learn'};items.push(item);
          const title=learn.mm?.name||'Mind map removed';
          const label=el('button',{class:'quest-select','data-select-quest':keyOf(item),onclick:()=>showDetail(item)},title);
          return el('li',{},el('div',{class:'quest-entry quest-learn','data-quest-learn':node.id+':'+learn.mmId},label,
            learn.star?el('span',{class:'quest-star','aria-label':'Starred'},'★'):null,
            el('small',{},'To learn')));
        })):null;
        return el('li',{},line,learns,entry.children.length?branch(entry.children):null);
      }));
    }
    list.append(section('Quests',tree.length?[branch(tree)]:[],'No quests in this workspace.'));
    const selected=items.find(item=>keyOf(item)===selectedQuest)||items.find(item=>item.quest)||items[0];
    if(selected)showDetail(selected,false);else detail.append(el('h2',{},'No quest selected'),el('p',{},'Quests added in Track will appear here when a real read connection is available.'));
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
    content.append(el('p',{},'Choose the garden’s fantasy weather. Light, wind, precipitation, water and surfaces turn together. Snow settles and melts; stone dries gradually. Weather never changes movement or your records.'));
    content.append(select('Weather','weather-choice',Object.entries(Core.WEATHER),settings.weather,value=>{settings.weather=value;world?.setWeather({weather:value});}));
    content.append(select('Light study','light-choice',[['day','Daylight'],['night','Night']],settings.night?'night':'day',value=>{settings.night=value==='night';world?.setWeather({night:settings.night});}));
    content.append(select('Clock','demo-clock',[['local','Local clock · follows this computer'],['evening','17:40 · fixture day'],['preview','20:10 · fixture day + tomorrow preview'],['midnight','00:10 · next day']],settings.clock,value=>{settings.clock=value;selectedDay=null;updateClock();refreshSky();}));
    content.append(el('p',{class:'subtle'},'Local time follows your computer, including after sleep. The other clock choices preview the same dated fixture; midnight never moves a record. Daylight/night remains an independent visual control.'));
    const reduced=el('input',{type:'checkbox',id:'reduce-motion',checked:settings.reduced,onchange:event=>{settings.reduced=event.target.checked;world?.setReduced(settings.reduced);}});
    content.append(el('div',{class:'form-row'},el('label',{for:'reduce-motion'},reduced,' Reduce motion'),el('small',{class:'subtle'},'Keeps weather and light changes; skips the sky camera animation and stops moving foliage, ground stars, rain and snow.')));
    content.append(select('World detail','quality',[['balanced','Balanced · up to 720p'],['sharp','Sharper · window resolution']],settings.quality,value=>{settings.quality=value;world?.setQuality(value);}));
    const range=el('input',{type:'range',id:'sensitivity',min:'.3',max:'2',step:'.1',value:settings.sensitivity,oninput:event=>{settings.sensitivity=Number(event.target.value);world?.setSensitivity(settings.sensitivity);}});
    content.append(el('div',{class:'form-row'},el('label',{for:'sensitivity'},'Camera sensitivity'),range));
    content.append(el('p',{class:'subtle'},'Drag to orbit the character and look up or down. The horizon stays upright. Q / E turn, R / F tilt. Home resets the camera without moving you.'));
    content.append(button('Reset camera',()=>world?.resetCamera()));
    content.append(el('h2',{},'Live performance'),el('dl',{class:'metric-list',id:'metrics'}));metricsView(latestMetrics);
    content.append(el('p',{class:'subtle'},'A short live reading, not a completed laptop benchmark. Target: 30 fps at 720p; the sustained route test is still required.'));
  }
  function renderHelp() {
    content.append(el('p',{},'Explore the clock ring and Memory Grove, then follow the path through the stone gateway to the Windseed launcher. Cloudrest floats to the north; Windward Isle is east of it.'));
    content.append(el('button',{id:'try-flight',class:'primary',onclick:tryFlight},'Try island flight'),el('p',{class:'subtle'},'Demo travel shortcut · takes you to the garden launcher.'));
    content.append(section('The island route',[
      row('1','Windseed launcher','Stand inside the gold ring. Hold X until charged, then release. Hold W to move toward Cloudrest.'),
      row('2','Cloudrest','Space opens the glider once the ground is at least four jump heights below you. Launches also deploy at their apex. WASD steers. Release movement to descend onto the island.'),
      row('3','Windward Isle','Jump off Cloudrest’s eastern edge, then press Space over the gap and hold D toward the lower island. An ordinary jump above the island will not open the glider. Or use its launcher for another high flight.'),
      row('4','Return to the garden','Turn toward the garden, jump and glide home. Falling below the world returns you to your last island or the garden; there is no penalty.')
    ]));
    content.append(el('ul',{class:'help-list'},[
      'W A S D or arrow keys: move or steer in flight. Tap Shift to dash and settle to a walk. Hold Shift for about 1 s to lock running; release it to keep running, or tap it again to unsprint. Exhaustion clears the run and needs a fresh press after recovery. Space jumps normally; the glider only opens with at least four jump heights of ground clearance (about 4.3 m). Once open, it stays open until folded or landed.',
      'Face a nearby wall and press Space to climb. Wall detection takes priority over jump and glide. W/S climb up/down; A/D move sideways. Space lets go with a small push away from the wall. An upward climb steps onto a reachable ledge.',
      'Stand on a Windseed launcher, hold X to charge, then release. Moving off the pad or opening a companion cancels the charge. A deployed glider keeps descending while you read.',
      'Drag on the garden to orbit and look up or down. Vertical tilt stops before flipping. Scroll to change camera distance.',
      'Q / E turn. R / F tilt. Home resets the camera without moving the character.',
      'T: Today. N: Notebook. K: Mind maps. J: Quest. M: World map. V: Weather and settings.',
      'Use the minimap to open the world map. Drag or use arrow keys to pan; scroll or + / − to zoom. Name pins and navigate to a pin, landmark or mapped quest. Pins last until reload.',
      'Mind maps → View stars in the Grove takes you straight to the constellation. G also opens it while you stand in the Grove. Select a star, pan, zoom or search; Escape returns to the garden.',
      'Switch companions directly from the bottom toolbar. Tab moves through the panel and companion buttons; Escape closes the panel.',
      'The garden and character physics continue while you read. Typing controls the panel. Click the garden after closing to resume keyboard movement.',
      'The demo uses synthetic data and keeps notes and drafts only in memory. Reloading resets them.'
    ].map(text=>el('li',{},text))));
    content.append(button('Return to the start',()=>{if(skyActive)leaveSky();world?.reset();closePanel();canvas.focus();}));
    content.append(button('Reset camera',()=>{if(skyActive)leaveSky();world?.resetCamera();closePanel();canvas.focus();}));
    content.append(section('Dash, run and stamina',[
      row('»','Tap Shift to dash','One press is a dash, slightly faster than running, that settles back to a walk. Each dash costs stamina.'),
      row('≡','Hold Shift to run','Keep Shift down for about '+window.WorldStamina.tuning.dashSeconds+' s and the run locks in. Letting go does not stop it — only a quick dash unsprints.'),
      row('◔','A streak buys the duration','The synthetic KS03 streak of '+sprintStreak+' active '+(sprintStreak===1?'day':'days')+' buys about '+sprintBudget.toFixed(1)+' seconds of running. Only the locked run drains; climbing and gliding cost nothing.'),
      row('!','Tuning for playtest','The dash time, formula, drain and recovery are demo tuning. Their feel and the character animation still need your playtest.')]));
    content.append(el('h2',{},'About this demo'),el('p',{class:'subtle'},'Garden walking, jumping, basic wall climbing, charged launches and island gliding use procedural placeholder art. Sprint stamina reads a synthetic streak only. Swimming, full MM actions, production artwork, audio, real Track integration and persistent drafts remain part of the larger project.'));
  }
  const titles={today:'Today',notebook:'Notes',memory:'Memory Grove',quest:'Quest',map:'World map',weather:'Weather & settings',help:'A walk through the garden'};
  function renderPanel() {
    mapView.hide();
    content.replaceChildren();$('panel-title').textContent=titles[activePanel];
    panel.classList.toggle('panel-full',activePanel==='quest'||activePanel==='map');
    panel.dataset.kind=activePanel;
    delete panel.dataset.notebook;
    document.querySelector('.panel-footer').textContent='The garden keeps moving while you read';
    document.body.dataset.menu=activePanel;
    $('panel-kicker').textContent=activePanel==='map'?'Clockgarden · Surface':activePanel==='quest'||activePanel==='today'?'A small season of learning':'Your garden companion';
    ({today:renderToday,notebook:renderNotebook,memory:renderMemory,quest:renderQuest,map:()=>mapView.render(content),weather:renderWeather,help:renderHelp})[activePanel]();
  }
  function openPanel(name) {
    if(activePanel===name){closePanel();return;}
    if(!activePanel)returnFocus=document.activeElement;
    else if(document.activeElement.matches('[data-panel]'))returnFocus=document.activeElement;
    if(name==='notebook')selectedNote=null;
    activePanel=name;panel.hidden=false;world?.setInputEnabled(false);canvas.inert=true;
    $('sky-view').inert=true;
    $('welcome').inert=true;
    if(document.pointerLockElement)document.exitPointerLock();
    renderPanel();document.querySelectorAll('[data-panel]').forEach(button=>button.setAttribute('aria-expanded',button.dataset.panel===name));
    updateGameplayVisibility();
    $('close-panel').focus();announce(titles[name]+' opened. The garden keeps moving.');
  }
  function closePanel() {
    mapView.hide();delete document.body.dataset.menu;
    activePanel=null;panel.hidden=true;canvas.inert=skyActive;world?.setInputEnabled(!skyActive);$('sky-view').inert=false;
    $('welcome').inert=false;
    document.querySelectorAll('[data-panel]').forEach(button=>button.setAttribute('aria-expanded','false'));
    updateGameplayVisibility(); // Make HUD openers visible before restoring their focus.
    if(returnFocus&&document.contains(returnFocus))returnFocus.focus();else (skyActive?$('sky-map'):canvas).focus();
    announce('Panel closed.');
  }
  function error(message){$('error-message').textContent=message;$('load-error').hidden=false;}
  document.querySelectorAll('[data-panel]').forEach(button=>button.addEventListener('click',()=>openPanel(button.dataset.panel)));
  $('close-panel').addEventListener('click',closePanel);
  $('enter-sky').addEventListener('click',enterSky);$('leave-sky').addEventListener('click',leaveSky);
  $('retry').addEventListener('click',()=>location.reload());
  $('read-without-world').addEventListener('click',()=>{$('load-error').hidden=true;openPanel('notebook');});
  $('enter').addEventListener('click',()=>{entered=true;$('welcome').hidden=true;world.pause(false);canvas.focus();});
  $('try-flight-welcome').addEventListener('click',tryFlight);
  document.addEventListener('keydown',event=>{
    if(event.isComposing||event.keyCode===229)return;
    const confirmation=$('note-delete-dialog');
    if(confirmation?.open){
      if(event.key==='Escape'){event.preventDefault();confirmation.close();}
      if(event.key==='Tab'){
        const controls=[...confirmation.querySelectorAll('button')],index=controls.indexOf(document.activeElement);
        event.preventDefault();controls[(index+(event.shiftKey?-1:1)+controls.length)%controls.length].focus();
      }
      return; // Confirmation owns input; physics continues.
    }
    if(event.key==='Escape'&&activePanel){event.preventDefault();closePanel();return;}
    if(event.key==='Escape'&&skyActive){event.preventDefault();leaveSky();return;}
    if(activePanel&&event.key==='Tab') {
      const focusables=[...panel.querySelectorAll('button,input,textarea,select,summary,a[href],[tabindex="0"]'),
        ...document.querySelectorAll('.day-bud button,.toolbelt button')].filter(node=>!node.disabled&&node.getClientRects().length);
      const index=focusables.indexOf(document.activeElement);
      event.preventDefault();focusables[(index+(event.shiftKey?-1:1)+focusables.length)%focusables.length].focus();
      return;
    }
    if(event.ctrlKey||event.metaKey||event.altKey||event.repeat||activePanel||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName))return;
    if(event.code==='KeyG'){event.preventDefault();if(skyActive)leaveSky();else enterSky();return;}
    const name={KeyT:'today',KeyN:'notebook',KeyK:'memory',KeyM:'map',KeyJ:'quest',KeyV:'weather'}[event.code];
    if(name){event.preventDefault();openPanel(name);}
  });
  updateClock();
  const starred=Quest.starRollup(slot.goals,slot.mms);
  $('quest-popup').append(...starred.map(item=>el('div',{class:'popup-quest'},
    el('span',{'aria-hidden':'true'},'★'),el('span',{},item.kind==='learn'?(item.mm?.name||'Mind map removed'):(item.node.title||'Untitled')),
    item.count>1?el('small',{},item.count+' quests'):null)),el('small',{},'J opens the full Quest list'));
  function updateGameplayVisibility() {
    const reading=!entered||!!activePanel||skyActive;
    $('quest-popup').hidden=reading||!starred.length;
    $('gameplay-popup').hidden=reading||(!starred.length&&$('interaction').hidden&&!mapView.snapshot().target);
    $('minimap').hidden=reading;
    if(reading)$('flight-hint').hidden=true;
  }
  try {
    world=window.createWorldScene(canvas,{
      cartography:atlas=>mapView.setAtlas(atlas),navigation:state=>mapView.updatePlayer(state,entered&&!activePanel&&!skyActive),announce,
      staminaBudget:sprintBudget,
      mindMaps:skyGraph().nodes,
      skyFrame:state=>skyView.frame(state),
      selectMM(index){selectedMM=index;openPanel('memory');},error,
      tick({environment,position,inGrove,grounded,flight,metrics,stamina,sprinting,sprint,player}) {
        const now=clock();
        if(lastClock!==now.day+' '+now.time){
          updateClock();refreshSky();
          if(activePanel==='today'){
            const focused=document.activeElement.id,scroll=content.scrollTop;
            renderPanel();if(focused)$(focused)?.focus({preventScroll:true});content.scrollTop=scroll;
          }
        }
        document.body.dataset.playing=String(entered);
        latestMetrics=metrics;
        const [x,y,z]=position;
        $('place-name').textContent=flight.island==='cloudrest'?'Cloudrest':flight.island==='windward'?'Windward Isle':y>5?'Above the Clockgarden':flight.pad?'Windseed launcher':x< -9&&z>11?'Memory Grove':x>7&&z>8?'North terrace':Math.hypot(x,z-7)<9.5?'Clock Plaza':'Clockgarden approach';
        $('weather-label').textContent=Core.WEATHER[settings.weather]+(environment.night>.5?' · night':'')+(settings.weather==='clear'&&environment.wetness>.2?' · wet stone':'');
        $('interaction').hidden=!entered||!!activePanel||skyActive||!inGrove;
        $('interaction').textContent=grounded?'Click a star, press K to read, or look at the MM sky.':'Land to look at the MM sky. K still opens mind map information.';
        $('enter-sky').hidden=$('interaction').hidden;$('enter-sky').disabled=!grounded;
        updateGameplayVisibility();
        const flying=!grounded&&(flight.gliding||flight.armed||y>4);
        $('flight-hint').hidden=!entered||!!activePanel||skyActive||(!flight.pad&&!flying&&!flight.island&&!flight.climbing);
        $('flight-title').textContent=flight.climbing?'Climbing':flight.charge>0?'Windseed · '+Math.round(flight.charge*100)+'%':flight.gliding?'Gliding':flying?'In flight':flight.island?({cloudrest:'Cloudrest',windward:'Windward Isle'}[flight.island]):'Windseed launcher';
        $('flight-instruction').textContent=flight.climbing?'W/S up / down · A/D sideways · Space lets go and pushes away':flight.charge>0?'Release X to launch · W toward Cloudrest':flying?(flight.gliding?'WASD steer · Space folds glider · release movement to descend':'Space glides above a large drop · ordinary jumps stay jumps'):flight.visited.length===2?'Both islands explored · glide back to the garden':flight.island?'Jump off the edge, then Space over the gap · X charges the launcher':'Hold X to charge, then release · Cloudrest is ahead';
        $('launch-charge').hidden=flight.charge===0;$('launch-charge').value=flight.charge;
        // The bar rides BESIDE the character rather than sitting in the bottom bar,
        // so it is placed from the same world-to-screen projection the destination
        // waypoint uses, and hides when the traveler is off screen.
        const staminaFull=stamina.value>=stamina.max-1e-6;
        const bar=$('sprint-stamina');
        bar.hidden=!entered||!!activePanel||skyActive||!player?.inView||(staminaFull&&!sprinting);
        if(!bar.hidden){
          bar.style.left=player.x+'px';bar.style.top=player.y+'px';
          // Clear the model at ANY camera distance: the offset tracks the traveler's
          // apparent height rather than a fixed number of pixels.
          const clearance=Math.max(46,Math.round((player.scale||0)*.62));
          bar.style.setProperty('--sprint-bar-offset',clearance+'px');
        }
        bar.dataset.state=stamina.exhausted?'empty':sprint?.locked?'running':sprinting?'dashing':staminaFull?'full':'recovering';
        const share=stamina.max>0?Math.max(0,Math.min(1,stamina.value/stamina.max)):0;
        $('sprint-stamina-bar').style.height=(share*100).toFixed(1)+'%';
        bar.setAttribute('aria-valuenow',String(Math.round(share*100)));
        $('sprint-stamina-label').textContent=stamina.exhausted?'Out of sprint':sprint?.locked?'Running':sprinting?'Dash':staminaFull?'Sprint ready':'Sprint returning';
        if(activePanel==='weather')metricsView(metrics);
      }
    });
    $('enter').disabled=false;$('enter').textContent='Enter the garden';
    $('try-flight-welcome').disabled=false;
    refreshSky();
  } catch(err) {error(err.message);$('enter').textContent='Garden unavailable';}
  // Read-only diagnostic surface, used by the isolated browser tests. Never
  // exposes a Track writer or an engine object that could mutate real data.
  window.WorldDemo=Object.freeze({ready:!!world,
    snapshot:()=>({entered,panel:activePanel,day:stateDay(),time:stateTime(),selectedMM,skyActive,sky:skyView.snapshot(),
      notebook:{selected:selectedNote,view:currentNote()?'detail':'list',notes:notebookNotes.map(note=>({...note}))},
      map:mapView.snapshot(),fixtureUnchanged:JSON.stringify(slot)===initialBytes,world:world?.snapshot()||null})});
  window.addEventListener('pagehide',()=>{mapView.hide();world?.dispose();},{once:true});
})();
