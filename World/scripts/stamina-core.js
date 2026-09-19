(function(root){
  'use strict';
  // Sprint stamina. TUNING FOR REVIEW, not a settled formula: the user's 2026-09-09
  // direction is that a longer KS03 streak buys a longer sprint, while the
  // streak-to-duration rule and the recovery behaviour remain their open decision
  // (concept draft section 4). These numbers are an implementation choice awaiting
  // the check the user asked for, exactly like the earlier 10% ground-speed increase.
  //
  // Scope is SPRINT ONLY, by the user's explicit choice: climbing and gliding never
  // spend stamina. Widening it is a new direction, not a tidier rule.
  //
  // This module also owns the SPRINT STATE MACHINE that spends the budget — the dash,
  // the hold-to-lock and the short-dash unsprint. It lives here rather than in a third
  // module because what sprint does and what it costs are one rule; splitting them is
  // how a call site ends up re-spelling half of it.
  //
  // Durations are ONE THIRD of the first pass, at the user's 2026-09-13 direction.
  const tuning=Object.freeze({base:2,perStreakDay:2/3,cap:8,drain:1,recover:1.4,recoverDelay:.6,resumeFraction:.25,
    dashSeconds:1,dashHold:.35,dashBoost:1.35,dashCost:1});
  // The controller's own clamp: a stalled frame must not empty the bar at once.
  const elapsed=dt=>Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const streakDays=n=>Number.isFinite(n)&&n>0?Math.floor(n):0;
  // drain is 1 stamina per second, so a budget IS seconds of sprint at full tilt.
  const budgetFor=streak=>Math.min(tuning.cap,tuning.base+streakDays(streak)*tuning.perStreakDay);
  const usableBudget=budget=>Number.isFinite(budget)&&budget>0?budget:budgetFor(0);
  const initial=budget=>({value:usableBudget(budget),exhausted:false,delay:0});
  // The ONE gate. No call site re-spells it, and a missing or damaged state must
  // never lock the player out of sprinting: a view value cannot be allowed to
  // take movement away.
  function canSprint(state){
    if(!state||typeof state!=='object')return true;
    if(state.exhausted)return false;
    return !Number.isFinite(state.value)||state.value>0;
  }
  function advance(previous,input,dt){
    dt=elapsed(dt);
    const request=input&&typeof input==='object'?input:{};
    const budget=usableBudget(request.budget);
    const prior=previous&&typeof previous==='object'?previous:null;
    const state={value:clamp(Number.isFinite(prior&&prior.value)?prior.value:budget,0,budget),
      exhausted:!!(prior&&prior.exhausted),
      delay:clamp(Number.isFinite(prior&&prior.delay)?prior.delay:0,0,tuning.recoverDelay)};
    // Only real ground travel costs anything: the toggle being on while standing
    // still, climbing a wall or gliding spends nothing.
    if(request.sprinting&&request.moving&&request.grounded&&!state.exhausted){
      state.value=Math.max(0,state.value-tuning.drain*dt);
      state.delay=tuning.recoverDelay;
      if(state.value===0)state.exhausted=true;
    }else{
      state.delay=Math.max(0,state.delay-dt);
      if(state.delay===0)state.value=Math.min(budget,state.value+tuning.recover*dt);
      // Exhaustion holds past the first drop of recovery, so an emptied bar cannot
      // be tapped straight back into a stutter of one-frame sprints.
      if(state.exhausted&&state.value>=budget*tuning.resumeFraction)state.exhausted=false;
    }
    return state;
  }
  // Mirrors Track's LIN streak definition (progress.html: computeLinActiveDays and
  // calcStreak) -- a day is active when it holds an item whose change type is not
  // 'stageRevert', and the run is counted back from today, or from yesterday when
  // today has no activity yet.
  //
  // TWO DELIBERATE DIFFERENCES. The day and its arithmetic are PARAMETERS, the way
  // quest-core.js takes its day: Track's own copy reads a UTC calendar day, which
  // the root AGENTS.md forbids for new code, so the caller passes its local day and
  // the local day-shift helper instead. And every malformed record is skipped rather
  // than thrown on, because this runs inside a frame loop, not a React render.
  function streakFrom(linChanges,today,shiftDay){
    if(typeof today!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(today))return 0;
    const active=new Set();
    (Array.isArray(linChanges)?linChanges:[]).forEach(record=>{
      if(!record||typeof record!=='object'||typeof record.date!=='string')return;
      const items=Array.isArray(record.items)?record.items:[];
      if(items.some(item=>item&&typeof item==='object'&&(!item.change||item.change.type!=='stageRevert')))
        active.add(record.date);
    });
    if(typeof shiftDay!=='function')return active.has(today)?1:0;
    let cursor=active.has(today)?today:shiftDay(today,-1),count=0;
    while(active.has(cursor)&&count<4000){count++;cursor=shiftDay(cursor,-1);}
    return count;
  }
  // A dash is paid for at the press. Emptying this way exhausts exactly as draining
  // does, and it pauses recovery, so dash-spamming runs the budget dry.
  function spend(previous,budgetInput,amount){
    const budget=usableBudget(budgetInput);
    const prior=previous&&typeof previous==='object'?previous:null;
    const value=clamp(Number.isFinite(prior&&prior.value)?prior.value:budget,0,budget);
    const cost=Number.isFinite(amount)&&amount>0?amount:0;
    const next=Math.max(0,value-cost);
    return {value:next,exhausted:!!(prior&&prior.exhausted)||next===0,delay:tuning.recoverDelay};
  }
  // THE SPRINT STATE MACHINE. One press of Shift is a DASH, slightly faster than the
  // running speed, and what happens afterwards depends only on how long the key is held:
  //
  //   tap (released before dashSeconds)  -> settles to WALK, unlocked
  //   hold >= dashSeconds                -> settles to RUN and LOCKS running
  //   tap while locked                   -> settles to WALK and UNLOCKS
  //
  // Releasing the key after the lock does NOT stop running: a short dash is the only
  // unsprint, which is the user's 2026-09-13 rule and supersedes the tap-to-toggle
  // sprint accepted on 2026-09-12.
  const SPRINT_DECAY=3;
  function speedsOf(speeds){
    const source=speeds&&typeof speeds==='object'?speeds:{};
    const walk=Number.isFinite(source.walkSpeed)&&source.walkSpeed>0?source.walkSpeed:1;
    const run=Number.isFinite(source.runSpeed)&&source.runSpeed>walk?source.runSpeed:walk;
    return {walk,run};
  }
  const sprintInitial=()=>({speed:0,dashAge:Infinity,held:false,locked:false});
  const sprintState=previous=>({...sprintInitial(),...(previous&&typeof previous==='object'?previous:null)});
  // A refused press is DISCARDED, not remembered as a hold. Recording it would let an
  // exhausted key that is still down lock running the moment stamina came back.
  function sprintPress(previous,stamina,speeds){
    const state=sprintState(previous);
    if(!canSprint(stamina))return {sprint:state,cost:0,dashed:false};
    return {sprint:{...state,speed:speedsOf(speeds).run*tuning.dashBoost,dashAge:0,held:true},
      cost:tuning.dashCost,dashed:true};
  }
  // A press that cannot dash -- airborne, mid-reversal over a tread -- must still be
  // heard while running, or the short-dash UNSPRINT silently fails to register and the
  // player presses again into a run they were trying to end. It marks the hold without
  // the burst and without a cost, so the release can still mean what it means.
  const sprintHold=previous=>({...sprintState(previous),dashAge:0,held:true});
  function sprintRelease(previous){
    const state=sprintState(previous);
    if(!state.held)return state;
    return {...state,held:false,locked:state.dashAge<tuning.dashSeconds?false:state.locked};
  }
  function sprintAdvance(previous,input,dt){
    dt=elapsed(dt);
    const request=input&&typeof input==='object'?input:{};
    const {walk,run}=speedsOf(request.speeds);
    const state=sprintState(previous);
    if(Number.isFinite(state.dashAge))state.dashAge=state.dashAge+dt;
    if(state.held&&Number.isFinite(state.dashAge)&&state.dashAge>=tuning.dashSeconds)state.locked=true;
    // Ease toward the CURRENT target rather than ramping along a fixed line: a key
    // released mid-dash re-aims at the walk and has to slide down continuously, and a
    // straight ramp would drop several units per second in a single frame.
    const target=state.locked||state.held?run:walk;
    const speed=Number.isFinite(state.speed)?state.speed:walk;
    // The burst HOLDS briefly before it descends. Without that window the decay races
    // the controller's own acceleration and a dash from standing still never actually
    // reaches its speed -- measured 11.8 against a 12 run before this was added.
    //
    // The frame that CROSSES the end of the hold decays only for the part of itself
    // that lies past it. Charging the whole frame would make the curve depend on where
    // the frame boundaries happened to fall, which is the one thing these rates exist
    // to avoid: at 30 fps the descent would start a frame later than at 120.
    const decaying=speed>target?Math.min(dt,Math.max(0,state.dashAge-tuning.dashHold)):dt;
    if(decaying>0)state.speed=speed+(target-speed)*(1-Math.exp(-SPRINT_DECAY/tuning.dashSeconds*decaying));
    return state;
  }
  // Exhaustion UNLOCKS; it does not remember the key as held, so running resumes only
  // on a fresh press once stamina has recovered past the resume threshold.
  const sprintUnlock=previous=>({...sprintState(previous),locked:false,held:false});
  const sprintSpeed=(previous,speeds)=>{
    const {walk}=speedsOf(speeds),state=sprintState(previous);
    return Number.isFinite(state.speed)&&state.speed>walk?state.speed:walk;
  };
  // The decay is exponential, so the speed approaches the walk without ever reaching
  // it. A bare `> walk` test would report a settled tap as still sprinting forever and
  // hold the gait in its sprint pose; the band is a share of the walk-to-run gap.
  const isSprinting=(previous,speeds)=>{
    const {walk,run}=speedsOf(speeds);
    return sprintSpeed(previous,speeds)>walk+(run-walk)*.02;
  };
  const api={tuning,budgetFor,initial,advance,canSprint,streakFrom,spend,
    sprintInitial,sprintPress,sprintHold,sprintRelease,sprintAdvance,sprintUnlock,sprintSpeed,isSprinting};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WorldStamina=api;
})(typeof window!=='undefined'?window:globalThis);
