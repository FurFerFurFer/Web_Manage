(function (root) {
  'use strict';
  // Explicit file input only. No connection to Track's persistence or sync.
  const MAX_BYTES=32*1024*1024;
  const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const records=value=>Array.isArray(value)?value.filter(record):[];
  function freeze(value) {
    const pending=[value];
    while(pending.length){const next=pending.pop();if(next&&typeof next==='object'&&!Object.isFrozen(next)){Object.freeze(next);for(const child of Object.values(next))pending.push(child);}}
    return value;
  }
  function parse(text,schema) {
    try {
      if(typeof text!=='string'||text.length>MAX_BYTES)return {ok:false,message:'This file is too large to open here (32 MB maximum).'};
      const raw=JSON.parse(text.replace(/^\uFEFF/,''));
      if(!record(raw)||Object.hasOwn(raw,'slots')||typeof raw.id!=='string'||!raw.id.trim())
        return {ok:false,message:'Choose one workspace JSON exported from Track’s Home page.'};
      const validation=schema.validateSlot(raw);
      if(schema.hasFatalErrors(validation))return {ok:false,message:'This workspace has damaged records and was not opened. Export it again from Track.'};
      // Fill absence in this in-memory view only. Never repair a populated field,
      // remap an id, drop unknown keys, or write the result back anywhere.
      const slot={...raw},defaults=schema.createEmptySlot({id:raw.id,name:raw.name});
      for(const key of schema.SLOT_KEYS)if(slot[key]==null)slot[key]=defaults[key];
      const ids=new Set();
      for(const mm of slot.mms){
        if(!((typeof mm.id==='number'&&Number.isFinite(mm.id))||(typeof mm.id==='string'&&mm.id.length))||ids.has(String(mm.id)))
          return {ok:false,message:'Some mind maps have missing or repeated IDs. This file was not opened.'};
        ids.add(String(mm.id));
        if(mm.name!=null&&typeof mm.name!=='string')return {ok:false,message:'A mind-map name is not text. This file was not opened.'};
        if(mm.customColor&&!(typeof mm.customColor==='string'&&/^#[\da-f]{6}$/i.test(mm.customColor)))
          return {ok:false,message:'A mind-map color could not be displayed. This file was not opened.'};
      }
      // The shared calendar expects each MG day to hold a list of bare ids.
      if(Object.values(slot.mgSchedule).some(value=>value!=null&&!Array.isArray(value)))
        return {ok:false,message:'The MG schedule has an unreadable day. This file was not opened.'};
      return {ok:true,slot:freeze(slot),warnings:validation.errors.length};
    } catch {
      // Parser messages can quote personal text. Never log or display that text.
      return {ok:false,message:'This file could not be read as a Track workspace. Export it again from Track.'};
    }
  }
  function day(slot,calendar,ds) {
    const date=new Date(ds+'T12:00:00'),year=date.getFullYear(),month=date.getMonth();
    return {schedule:calendar.buildDaySchedule(slot,ds),
      buckets:calendar.buildBuckets(slot,year,month)[ds]||{},
      milestones:calendar.buildMilestoneLanes(slot,year,month).lanesByDate[ds]||[]};
  }
  const api={parse,day,records,MAX_BYTES};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WorldTrackReader=api;
})(typeof window!=='undefined'?window:globalThis);
