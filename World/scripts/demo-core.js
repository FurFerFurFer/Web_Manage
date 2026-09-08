(function (root) {
  'use strict';
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  function fixture(schema, calendar, day) {
    const shiftDay=calendar.dayShift;
    const next = shiftDay(day, 1), due = shiftDay(day, 3);
    return schema.normalizeSlot({
      id: 'world-demo', name: 'A small season of learning', createdAt: day,
      mms: [
        {id:'mm-botany', name:'Botany of the garden', color:'#80ad74', type:'MG', parentIds:[]},
        {id:'mm-water', name:'How water shapes a place', color:'#7ec7d1', type:'Kolb', parentIds:['mm-botany']},
        {id:'mm-light', name:'Light, color and observation', color:'#e9bd68', type:'SIR', parentIds:['mm-botany']}
      ],
      goals:[{id:'task-observe', title:'Sketch three leaf shapes', scheduledDate:day, scheduledTime:'18:00', duration:25, taskType:'task', children:[]}],
      calendarNotes:[
        {id:'note-untimed', title:'Look for a small change worth noticing', date:day},
        {id:'note-timed', title:'Compare both water sketches · เปรียบเทียบภาพร่าง', date:day, time:'19:00', blockDuration:20},
        {id:'note-off', title:'Bring a pencil to the garden', date:day, blockOff:true}
      ],
      deadlines:[
        {id:'deadline-folio', title:'Share the garden field notes', date:due, time:'18:00', cautionDates:[day,shiftDay(day,2)], blockDate:day, blockTime:'18:30', blockDuration:30},
        {id:'deadline-done', title:'Choose a field notebook', date:day, time:'16:00', done:true, cautionDates:[shiftDay(day,-1)]},
        {id:'deadline-quiet', title:'Send the water study', date:due, time:'12:00', done:true, cautionDates:[day], blockOff:true}
      ],
      sessions:[
        {id:'review-1', mmId:'mm-light', date:day, repIndex:1, done:false},
        {id:'review-2', mmId:'mm-water', date:day, repIndex:0, done:true, finishDate:day},
        {id:'review-skip', mmId:'mm-botany', date:day, repIndex:0, skipped:true},
        {id:'review-next', mmId:'mm-botany', date:next, repIndex:2, done:false}
      ],
      saActions:[{id:'action-walk', title:'A quiet observation walk', color:'#75b4a5'}],
      saEntries:[{id:'walk-today', actionId:'action-walk', date:day, time:'17:45', duration:15, done:false}],
      mmEntries:[{id:'study-today', mmId:'mm-water', date:day, time:'19:30', duration:20, done:false}],
      mgSchedule:{[shiftDay(day,-1)]:['mm-botany']},
      refSchedules:[{id:'reference-talk', date:day, title:'Open garden talk', detail:'Reference only · North terrace', time:'17:00', duration:45}],
      notes:[{id:'notebook-demo', title:'On noticing', content:'The garden feels different when I slow down.\n\nWhat did I notice today?'}]
    });
  }
  function initialEnvironment() { return {rain:0, wetness:0, night:0, wind:0.16, elapsed:0}; }
  function advanceEnvironment(state, target, dt) {
    dt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
    const rain = state.rain + ((target.rain ? 1 : 0) - state.rain) * (1 - Math.exp(-dt / 2));
    const night = state.night + ((target.night ? 1 : 0) - state.night) * (1 - Math.exp(-dt / 3));
    return {rain, night, wetness:clamp(state.wetness + dt * (rain * .18 - (1 - rain) * .025),0,1),
      wind:.16 + rain * .68, elapsed:state.elapsed + dt};
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
    }, reset() { carry = 0; }};
  }
  const api = {clamp, fixture, initialEnvironment, advanceEnvironment, stepper};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WorldDemoCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
