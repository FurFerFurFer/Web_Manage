(function (root) {
  'use strict';
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  function fixture(schema, calendar, day) {
    const shiftDay=calendar.dayShift;
    const next = shiftDay(day, 1), due = shiftDay(day, 3);
    return schema.normalizeSlot({
      id: 'world-demo', name: 'A small season of learning', createdAt: day,
      mms: [
        {id:101, name:'Botany of the garden', customColor:'#80ad74', type:'2', ksStage:'sir', parentIds:[],rating:3,
          currentMG:'Compare leaf edges before naming the plant.',unclear:true,
          comments:[{id:201,text:'Look at the underside too.\nสังเกตด้านใต้ใบ',date:day,done:false}],
          links:[{id:202,label:'Field journal reference',url:'https://example.com/garden-journal'}]},
        {id:102, name:'How water shapes a place', customColor:'#7ec7d1', type:'2', ksStage:'sir', parentIds:[101],
          currentMG:'Follow one ripple from its origin to the bank.',rating:2},
        {id:103, name:'Light, color and observation', customColor:'#e9bd68', type:'1', ksStage:'sir', parentIds:[101]}
      ],
      pos:{103:{x:510,y:70}},
      goals:[
        {id:'goal-journal',title:'A garden field journal',toLearn:[103],questLearn:[103],starLearn:[103],children:[
          {id:'task-observe',title:'Sketch three leaf shapes',scheduledDate:day,scheduledTime:'18:00',duration:25,taskType:'task',quest:true,star:true,questOrder:1,children:[]},
          {id:'task-pack',title:'Choose a pencil and notebook',taskType:'task',quest:true,questOrder:0,completed:true,children:[]},
          {id:'milestone-weather',title:'Weather milestone',taskType:'milestone',children:[
            {id:'task-cloud',title:'Name the cloud shapes',taskType:'task',quest:true,questOrder:2,children:[]}
          ]}
        ]},
        {id:'goal-water',title:'Follow the water',quest:true,star:true,toLearn:[102,999],questLearn:[102,999],starLearn:[102],children:[
          {id:'task-ripple',title:'Draw a widening ripple',taskType:'task',quest:true,star:true,children:[]},
          {id:'routine-sketch',title:'Notice the stream each day',taskType:'routine',quest:true,completed:true,children:[]}
        ]},
        {id:'unselected-task',title:'Unselected background work',taskType:'task',children:[]},
        {id:'alias-observe',title:'Alias of the leaf sketch',isLink:true,quest:true,star:true,children:[]}
      ],
      calendarNotes:[
        {id:'note-untimed', title:'Look for a small change worth noticing', date:day},
        {id:'note-timed', title:'Compare both water sketches · เปรียบเทียบภาพร่าง', date:day, time:'19:00', blockDuration:20},
        {id:'note-off', title:'Bring a pencil to the garden', date:day, blockOff:true},
        {id:'note-next', title:'Return to the high garden', date:next, blockOff:true}
      ],
      deadlines:[
        {id:'deadline-folio', title:'Share the garden field notes', date:due, time:'18:00', cautionDates:[day,shiftDay(day,2)], blockDate:day, blockTime:'18:30', blockDuration:30},
        {id:'deadline-done', title:'Choose a field notebook', date:day, time:'16:00', done:true, cautionDates:[shiftDay(day,-1)]},
        {id:'deadline-quiet', title:'Send the water study', date:due, time:'12:00', done:true, cautionDates:[day], blockOff:true}
      ],
      sessions:[
        {id:'review-1', mmId:103, date:day, repIndex:1, done:false},
        {id:'review-2', mmId:102, date:day, repIndex:0, done:true, finishDate:day},
        {id:'review-skip', mmId:101, date:day, repIndex:0, skipped:true},
        {id:'review-next', mmId:101, date:next, repIndex:2, done:false}
      ],
      kolbs:[{id:301,mmId:101,date:day,isReflectingOnPrev:true,level:'3',
        experience:'I compared two leaves beside the bridge.',mgLookLike:'Name the leaf edge without guessing.',
        sequence:'Look closely. Sketch the edge. Compare the sketches.',feelings:'Curious, then uncertain.',
        difficultWell:'The outline was clear; the small teeth were difficult.',challenges:'The wind kept turning the leaf.',
        triggers:'A familiar shape made me answer too quickly.',whyActed:'I relied on the outline alone.',
        habits:'Pause before naming.',otherParts:'The underside gives another clue.',
        experiments:'Compare the same leaf in light and shade.',mgAdd:'Compare leaf edges before naming the plant.'}],
      mgChanges:[{id:302,mmId:101,kolbId:301,date:day,oldMG:'Sketch the overall leaf shape.',
        newMG:'Compare leaf edges before naming the plant.',experiment:'Compare the same leaf in light and shade.'}],
      // A small synthetic KS03 streak. The demo's sprint stamina budget is read from
      // these records and nothing else: five consecutive active days, with the sixth
      // day back holding only a stage revert, which Track does not count as activity
      // and neither does WorldStamina.streakFrom. The length is deliberate -- the
      // budget it buys has to outlast the longest sprint any browser case performs.
      linChanges:[{id:401,title:'An evening of closer looking',date:day,items:[
        {mmId:101,change:{type:'stageAdvance',oldValue:'4',newValue:'sir'}}
      ]},
        {id:402,title:'Leaf edges again',date:shiftDay(day,-1),items:[{mmId:101,change:{type:'ratingChange',oldValue:2,newValue:3}}]},
        {id:403,title:'The stream at dusk',date:shiftDay(day,-2),items:[{mmId:102,change:{type:'mgChange'}}]},
        {id:404,title:'Colour in shade',date:shiftDay(day,-3),items:[{mmId:103,change:{type:'stageAdvance',oldValue:'3',newValue:'4'}}]},
        {id:405,title:'A first look at the bank',date:shiftDay(day,-4),items:[{mmId:102,change:{type:'comment'}}]},
        {id:406,title:'Reconsidered too early',date:shiftDay(day,-5),items:[{mmId:101,change:{type:'stageRevert',oldValue:'sir',newValue:'4'}}]}],
      sourceDumps:[{id:501,title:'Garden field observations',createdAt:day,parentId:null,mmLinks:[
        {id:502,mmId:101,textBlocks:[{id:503,title:'Leaf margins',explanation:'The small teeth face toward the tip.\n<b>This is literal notebook text.</b>'}],
          links:[{id:504,label:'Observation reference',url:'https://example.com/leaf-margins'}]}
      ]}],
      saActions:[{id:'action-walk', title:'A quiet observation walk', color:'#75b4a5'}],
      saEntries:[{id:'walk-today', actionId:'action-walk', date:day, time:'17:45', duration:15, done:false}],
      mmEntries:[{id:'study-today', mmId:102, date:day, time:'19:30', duration:20, done:false}],
      mgSchedule:{[shiftDay(day,-1)]:[101]},
      refSchedules:[{id:'reference-talk', date:day, title:'Open garden talk', detail:'Reference only · North terrace', time:'17:00', duration:45}],
      notes:[{id:'notebook-demo', topic:'On noticing', content:'The garden feels different when I slow down.\n\nWhat did I notice today?'}]
    });
  }
  function clockState(baseDay,mode,now,calendar){
    if(mode==='local')return {day:calendar.toDateStr(now),time:String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0')};
    return {day:mode==='midnight'?calendar.dayShift(baseDay,1):baseDay,time:({preview:'20:10',midnight:'00:10'})[mode]||'17:40'};
  }
  function tomorrowPreview(slot,calendar,day,time){
    if(time<'20:00')return null;
    const date=calendar.dayShift(day,1),schedule=calendar.buildDaySchedule(slot,date);
    return schedule.calNotes.length||schedule.deadlines.length||schedule.deadlinesCaution.length?{date,schedule}:null;
  }
  const WEATHER=Object.freeze({clear:'Clear skies',rain:'Rain',snow:'Snowfall',storm:'Intense rain',heavenly:'Heavenly skies'});
  function initialEnvironment() { return {rain:0, snow:0, storm:0, halo:0, snowCover:0, wetness:0, night:0, wind:0.16, elapsed:0}; }
  function advanceEnvironment(state, target, dt) {
    dt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
    const weather=WEATHER[target.weather]?target.weather:target.rain?'rain':'clear';
    const blend=(value,want,seconds=2)=>value+(want-value)*(1-Math.exp(-dt/seconds));
    const rain=blend(state.rain,weather==='rain'||weather==='storm'?1:0);
    const snow=blend(state.snow,weather==='snow'?1:0),storm=blend(state.storm,weather==='storm'?1:0);
    const halo=blend(state.halo,weather==='heavenly'?1:0,3);
    const night = state.night + ((target.night ? 1 : 0) - state.night) * (1 - Math.exp(-dt / 3));
    const snowCover=clamp(state.snowCover+dt*(snow*.06-(1-snow)*.025),0,1);
    return {rain,snow,storm,halo,snowCover,night,wetness:clamp(state.wetness+dt*(rain*.18+(state.snowCover-snowCover)*3-(1-rain)*.025),0,1),
      wind:.16+rain*.68+storm*.55+snow*.12,elapsed:state.elapsed+dt};
  }
  // Movement uses fixed steps. A suspended/backgrounded tab cannot catch up by
  // firing seconds of movement when focus returns.
  function stepper(step, hz = 60) {
    let carry = 0;
    const dt = 1 / hz;
    return {advance(elapsed) {
      carry += clamp(Number.isFinite(elapsed) ? elapsed : 0, 0, .1);
      let count = 0;
      while (carry + 1e-9 >= dt && count < 6) { step(dt); carry -= dt; count++; }
      return count;
    }, get alpha() { return clamp(carry / dt, 0, 1); }, reset() { carry = 0; }};
  }
  const api = {clamp, fixture, clockState, tomorrowPreview, WEATHER, initialEnvironment, advanceEnvironment, stepper};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WorldDemoCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
