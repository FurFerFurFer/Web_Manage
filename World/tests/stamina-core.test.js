'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Stamina=require('../scripts/stamina-core');
const context=vm.createContext({window:{},Date,console});
vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../scripts/calendar-core.js'),'utf8'),context);
const {TrackCalendar:Cal}=context.window;
const shift=Cal.dayShift;
// One sprinting-on-the-ground input; each case varies only what it is asking about.
const sprint=(budget,extra)=>({sprinting:true,moving:true,grounded:true,budget,...extra});
const run=(state,input,seconds,fps)=>{
  for(let i=0;i<Math.round(seconds*fps);i++)state=Stamina.advance(state,input,1/fps);
  return state;
};
// Sprint until the budget empties, stopping inside the recovery delay so the
// emptied state is observed before recovery can start refilling it.
const emptied=budget=>run(Stamina.initial(budget),sprint(budget),budget+Stamina.tuning.recoverDelay/2,60);

test('the sprint budget follows the KS03 streak, stays monotone and capped, and survives nonsense',()=>{
  assert.equal(Stamina.budgetFor(0),Stamina.tuning.base,'no streak still leaves a usable sprint');
  assert.ok(Stamina.budgetFor(3)>Stamina.budgetFor(1),'a longer streak buys a longer sprint');
  let previous=-Infinity;
  for(let days=0;days<=40;days++){
    const budget=Stamina.budgetFor(days);
    assert.ok(budget>=previous,'budget never falls as the streak grows');
    assert.ok(budget<=Stamina.tuning.cap,'budget never passes the cap');
    previous=budget;
  }
  assert.equal(Stamina.budgetFor(999),Stamina.tuning.cap,'a long streak settles at the cap');
  for(const bad of [undefined,null,NaN,-4,'7',{}])
    assert.equal(Stamina.budgetFor(bad),Stamina.tuning.base,'unusable streak reads as no streak');
});

test('draining is elapsed-time based and identical at 30, 60 and 120 fps',()=>{
  const budget=Stamina.budgetFor(1),results=[];
  for(const fps of [30,60,120]){
    const state=run(Stamina.initial(budget),sprint(budget),2,fps);
    results.push(state.value);
    assert.ok(state.value<budget,'sprinting spends the budget');
  }
  assert.ok(Math.max(...results)-Math.min(...results)<1e-9,'the frame rate cannot change the cost');
  const stalled=Stamina.advance(Stamina.initial(budget),sprint(budget),9999);
  assert.ok(stalled.value>=budget-.1*Stamina.tuning.drain-1e-9,'a stalled frame is clamped like the controller');
});

test('only grounded sprinting movement drains: walking, standing, climbing and gliding never do',()=>{
  const budget=Stamina.budgetFor(2);
  for(const extra of [{sprinting:false},{moving:false},{grounded:false}]){
    const state=run(Stamina.initial(budget),sprint(budget,extra),2,60);
    assert.equal(state.value,budget,'stamina is untouched: '+JSON.stringify(extra));
    assert.equal(state.exhausted,false);
  }
  const spent=run(Stamina.initial(budget),sprint(budget),2,60);
  assert.ok(spent.value<budget,'the control really did spend stamina');
  const climbed=run(spent,sprint(budget,{grounded:false}),1,60);
  assert.ok(climbed.value>=spent.value,'climbing and gliding never spend sprint stamina');
});

test('an emptied budget drops sprint and locks it out until recovery passes the resume threshold',()=>{
  const budget=Stamina.budgetFor(0),empty=emptied(budget);
  assert.equal(empty.value,0,'the budget empties');
  assert.equal(empty.exhausted,true,'emptying is exhaustion');
  assert.equal(Stamina.canSprint(empty),false,'sprint cannot be re-armed while exhausted');
  // Exhaustion has already turned the toggle off in the scene, so a still-held key
  // must not stall recovery -- it recovers, it just cannot sprint yet.
  const held=run(empty,sprint(budget),Stamina.tuning.recoverDelay,60);
  assert.ok(held.value>0,'a held key does not block recovery once sprint has dropped out');
  assert.equal(Stamina.canSprint(held),false,'the first drop of recovery does not re-arm sprint');
  let state=empty,waited=0;
  while(!Stamina.canSprint(state)&&waited<120){state=Stamina.advance(state,sprint(budget,{sprinting:false}),1/60);waited+=1/60;}
  assert.ok(Stamina.canSprint(state),'recovery re-arms sprint');
  assert.ok(state.value>=budget*Stamina.tuning.resumeFraction-1e-9,
    'it re-arms only past the resume threshold, not at the first drop of recovery');
  assert.equal(state.exhausted,false);
});

test('recovery waits its delay, refills to the budget and stops there',()=>{
  const budget=Stamina.budgetFor(1);
  const spent=run(Stamina.initial(budget),sprint(budget),2,60);
  const early=Stamina.advance(spent,sprint(budget,{sprinting:false}),Stamina.tuning.recoverDelay/2);
  assert.equal(early.value,spent.value,'recovery does not start inside the delay');
  const full=run(spent,sprint(budget,{sprinting:false}),60,60);
  assert.equal(full.value,budget,'recovery stops exactly at the budget');
  assert.equal(Stamina.canSprint(full),true);
});

test('advance never mutates the state it was handed',()=>{
  const budget=Stamina.budgetFor(1),before=Stamina.initial(budget),copy=JSON.parse(JSON.stringify(before));
  Stamina.advance(before,sprint(budget),1/60);
  assert.deepEqual(before,copy,'the caller keeps its own state');
  assert.equal(Stamina.canSprint(null),true,'a missing state never locks the player out of sprinting');
  assert.doesNotThrow(()=>Stamina.advance(null,null,null),'a damaged frame cannot throw into the loop');
});

test('streakFrom mirrors Track’s LIN streak definition and takes the day as a parameter',()=>{
  const day='2026-09-13';
  const lin=d=>({id:d,date:d,items:[{mmId:1,change:{type:'stageAdvance'}}]});
  const revert=d=>({id:d,date:d,items:[{mmId:1,change:{type:'stageRevert'}}]});
  assert.equal(Stamina.streakFrom([0,-1,-2].map(n=>lin(shift(day,n))),day,shift),3,'consecutive active days count');
  assert.equal(Stamina.streakFrom([lin(shift(day,-1)),lin(shift(day,-2))],day,shift),2,
    'an inactive today still counts yesterday’s streak');
  assert.equal(Stamina.streakFrom([lin(day),lin(shift(day,-2))],day,shift),1,'a gap ends the streak');
  assert.equal(Stamina.streakFrom([revert(day),revert(shift(day,-1))],day,shift),0,
    'a stage revert is not activity, exactly as Track counts it');
  assert.equal(Stamina.streakFrom([{id:'x',date:day,items:[]}],day,shift),0,'an empty record is not activity');
  assert.equal(Stamina.streakFrom([lin(day),null,{date:null},{date:day,items:null}],day,shift),1,
    'malformed records are skipped rather than thrown on');
  for(const bad of [undefined,null,'nope',42,{}])assert.equal(Stamina.streakFrom(bad,day,shift),0);
  assert.equal(Stamina.streakFrom([lin(day)],'not-a-day',shift),0,'a malformed day reads as no streak');
});

test('the streak crosses month, year and leap-day boundaries through the supplied day helper',()=>{
  const lin=d=>({id:d,date:d,items:[{change:{type:'stageAdvance'}}]});
  assert.equal(Stamina.streakFrom(['2026-03-01','2026-02-28','2026-02-27'].map(lin),'2026-03-01',shift),3,
    'a month boundary does not break the streak');
  assert.equal(Stamina.streakFrom(['2027-01-01','2026-12-31','2026-12-30'].map(lin),'2027-01-01',shift),3,
    'a year boundary does not break the streak');
  assert.equal(Stamina.streakFrom(['2024-03-01','2024-02-29','2024-02-28'].map(lin),'2024-03-01',shift),3,
    'a leap day is a real day');
});

test('the module holds no date code of its own: the day and its arithmetic are parameters',()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../scripts/stamina-core.js'),'utf8')
    .replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:])\/\/.*$/gm,'$1');
  for(const banned of ['new Date','Date.now','toISOString','getDay','getFullYear'])
    assert.ok(!source.includes(banned),'stamina-core must not compute a day itself: found '+banned);
});

// ── the sprint state machine: dash, hold-to-lock, short-dash unsprint ──────────
const SPEEDS={walkSpeed:3.85,runSpeed:12};
const press=(state,stamina)=>Stamina.sprintPress(state,stamina,SPEEDS);
const drive=(state,seconds,fps=60)=>{
  for(let i=0;i<Math.round(seconds*fps);i++)state=Stamina.sprintAdvance(state,{speeds:SPEEDS},1/fps);
  return state;
};
const full=()=>Stamina.initial(Stamina.budgetFor(5));

test('the sprint budget is one third of the first pass at the user’s direction',()=>{
  assert.equal(Stamina.budgetFor(0),2,'the origin duration is a third of the previous 6 s');
  assert.equal(Stamina.tuning.cap,8,'the cap is a third of the previous 24 s');
  assert.ok(Math.abs(Stamina.budgetFor(3)-4)<1e-9,'a third of the previous 12 s at a three-day streak');
});

test('a tap dashes above the running speed and settles back to a WALK',()=>{
  const dash=press(Stamina.sprintInitial(),full());
  assert.equal(dash.dashed,true);
  assert.equal(dash.cost,Stamina.tuning.dashCost,'the dash is paid for at the press');
  assert.ok(Stamina.sprintSpeed(dash.sprint,SPEEDS)>SPEEDS.runSpeed,'the burst is faster than an ordinary sprint');
  assert.equal(Stamina.isSprinting(dash.sprint,SPEEDS),true);
  // Released well before the dash has settled: this is a tap, so it decays to walking.
  const released=Stamina.sprintRelease(drive(dash.sprint,.2));
  assert.equal(released.locked,false,'a tap never locks running');
  const settled=drive(released,Stamina.tuning.dashSeconds*3);
  assert.ok(Math.abs(Stamina.sprintSpeed(settled,SPEEDS)-SPEEDS.walkSpeed)<.05,
    'a tap settles to the walking speed, measured '+Stamina.sprintSpeed(settled,SPEEDS));
  assert.equal(Stamina.isSprinting(settled,SPEEDS),false);
});

test('holding past x LOCKS the running state, and releasing the key does not stop it',()=>{
  const dash=press(Stamina.sprintInitial(),full());
  const held=drive(dash.sprint,Stamina.tuning.dashSeconds-.1);
  assert.equal(held.locked,false,'the lock waits for the full dash time');
  const locked=drive(held,.2);
  assert.equal(locked.locked,true,'holding past x locks running');
  const settled=drive(locked,Stamina.tuning.dashSeconds*3);
  assert.ok(Math.abs(Stamina.sprintSpeed(settled,SPEEDS)-SPEEDS.runSpeed)<.05,
    'a held dash settles to the running speed, measured '+Stamina.sprintSpeed(settled,SPEEDS));
  const letGo=drive(Stamina.sprintRelease(settled),2);
  assert.equal(letGo.locked,true,'releasing Shift after the lock keeps running');
  assert.ok(Math.abs(Stamina.sprintSpeed(letGo,SPEEDS)-SPEEDS.runSpeed)<.05,'and keeps the running speed');
});

test('a short dash is the only unsprint; a long one while locked stays locked',()=>{
  let state=drive(press(Stamina.sprintInitial(),full()).sprint,Stamina.tuning.dashSeconds+.1);
  state=drive(Stamina.sprintRelease(state),1);
  assert.equal(state.locked,true,'locked by the first hold');
  const shortDash=Stamina.sprintRelease(drive(press(state,full()).sprint,.2));
  assert.equal(shortDash.locked,false,'a short dash unsprints');
  assert.ok(Math.abs(Stamina.sprintSpeed(drive(shortDash,Stamina.tuning.dashSeconds*3),SPEEDS)-SPEEDS.walkSpeed)<.05,
    'and decays to a walk');
  let again=drive(press(state,full()).sprint,Stamina.tuning.dashSeconds+.1);
  again=drive(Stamina.sprintRelease(again),1);
  assert.equal(again.locked,true,'a dash held past x while locked stays locked');
});

test('the dash decay is elapsed-time based and identical at 30, 60 and 120 fps',()=>{
  const results=[30,60,120].map(fps=>{
    const dash=press(Stamina.sprintInitial(),full());
    return Stamina.sprintSpeed(drive(Stamina.sprintRelease(dash.sprint),.5,fps),SPEEDS);
  });
  assert.ok(Math.max(...results)-Math.min(...results)<1e-6,'the frame rate cannot change the dash curve');
  const stalled=Stamina.sprintAdvance(press(Stamina.sprintInitial(),full()).sprint,{speeds:SPEEDS},9999);
  assert.ok(Stamina.sprintSpeed(stalled,SPEEDS)>SPEEDS.walkSpeed,'a stalled frame is clamped, not collapsed to a walk');
});

test('an exhausted budget REFUSES the dash, and a refused press cannot lock later',()=>{
  const empty={value:0,exhausted:true,delay:0};
  const refused=press(Stamina.sprintInitial(),empty);
  assert.equal(refused.dashed,false,'no dash while exhausted');
  assert.equal(refused.cost,0,'a refused dash costs nothing');
  assert.deepEqual(refused.sprint,Stamina.sprintInitial(),'the press is discarded, not remembered as a hold');
  const waited=drive(refused.sprint,5);
  assert.equal(waited.locked,false,'a key still held through exhaustion cannot lock running');
  assert.equal(Stamina.sprintSpeed(waited,SPEEDS),SPEEDS.walkSpeed);
});

test('dashes are charged once each and empty the budget; exhaustion unlocks a locked run',()=>{
  const budget=Stamina.budgetFor(0);
  let stamina=Stamina.initial(budget),dashes=0;
  while(Stamina.canSprint(stamina)&&dashes<50){
    const dash=press(Stamina.sprintInitial(),stamina);
    if(!dash.dashed)break;
    stamina=Stamina.spend(stamina,budget,dash.cost);dashes++;
  }
  assert.equal(dashes,budget/Stamina.tuning.dashCost,'each dash costs exactly one chunk');
  assert.equal(stamina.value,0);assert.equal(stamina.exhausted,true,'dash-spamming runs the budget dry');
  const locked=drive(press(Stamina.sprintInitial(),Stamina.initial(budget)).sprint,Stamina.tuning.dashSeconds+.1);
  assert.equal(locked.locked,true);
  const unlocked=Stamina.sprintUnlock(locked);
  assert.equal(unlocked.locked,false,'emptying while locked unlocks the run');
  assert.equal(unlocked.held,false,'and does not remember the key as held');
  assert.equal(drive(unlocked,5).locked,false,'so a still-held key cannot re-lock without a fresh press');
});

test('sprint state readers stay total and never fall below the walking speed',()=>{
  for(const bad of [undefined,null,42,'x',{speed:NaN}]){
    assert.equal(Stamina.sprintSpeed(bad,SPEEDS),SPEEDS.walkSpeed);
    assert.equal(Stamina.isSprinting(bad,SPEEDS),false);
    assert.doesNotThrow(()=>Stamina.sprintAdvance(bad,{speeds:bad},1/60));
    assert.doesNotThrow(()=>Stamina.sprintRelease(bad));
  }
  assert.ok(Stamina.sprintSpeed(press(Stamina.sprintInitial(),full()).sprint,null)>0,'missing speeds cannot throw');
});

test('a press that cannot dash is still heard, so the unsprint never silently fails',()=>{
  let locked=drive(press(Stamina.sprintInitial(),full()).sprint,Stamina.tuning.dashSeconds+.1);
  locked=drive(Stamina.sprintRelease(locked),1);
  assert.equal(locked.locked,true,'running first');
  const speedBefore=Stamina.sprintSpeed(locked,SPEEDS);
  // Airborne, or bouncing over a tread: no burst and no cost, but the hold registers.
  const heard=Stamina.sprintHold(locked);
  assert.equal(Stamina.sprintSpeed(heard,SPEEDS),speedBefore,'no burst from a press that cannot dash');
  const ended=Stamina.sprintRelease(heard);
  assert.equal(ended.locked,false,'and the short release still unsprints');
  assert.ok(Math.abs(Stamina.sprintSpeed(drive(ended,Stamina.tuning.dashSeconds*3),SPEEDS)-SPEEDS.walkSpeed)<.05,
    'decaying to a walk afterwards');
  const stillHeld=drive(Stamina.sprintHold(locked),Stamina.tuning.dashSeconds+.1);
  assert.equal(stillHeld.locked,true,'holding it instead keeps the run');
});
