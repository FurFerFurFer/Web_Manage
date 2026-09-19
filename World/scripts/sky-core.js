(function (root) {
  'use strict';
  // Display sizes are a demo treatment. Condense cycles before measuring parent
  // depth so a cycle never demands that each of its members be larger than itself.
  function depths(nodes, edges) {
    const out=new Map(nodes.map(n=>[n.id,[]])),back=new Map(nodes.map(n=>[n.id,[]]));
    edges.forEach(e=>{out.get(e.from).push(e.to);back.get(e.to).push(e.from);});
    const seen=new Set(),order=[];
    for(const node of nodes) {
      if(seen.has(node.id))continue;
      seen.add(node.id);const stack=[[node.id,0]];
      while(stack.length) {
        const top=stack[stack.length-1],children=out.get(top[0]);
        if(top[1]<children.length) {
          const child=children[top[1]++];
          if(!seen.has(child)){seen.add(child);stack.push([child,0]);}
        } else {order.push(top[0]);stack.pop();}
      }
    }
    const groups=new Map();let count=0;
    for(const id of order.reverse()) {
      if(groups.has(id))continue;
      const stack=[id];groups.set(id,count);
      while(stack.length)for(const parent of back.get(stack.pop()))if(!groups.has(parent)){groups.set(parent,count);stack.push(parent);}
      count++;
    }
    const dag=Array.from({length:count},()=>new Set()),incoming=Array(count).fill(0),depth=Array(count).fill(0);
    for(const edge of edges) {
      const a=groups.get(edge.from),b=groups.get(edge.to);
      if(a!==b&&!dag[a].has(b)){dag[a].add(b);incoming[b]++;}
    }
    const ready=incoming.flatMap((n,i)=>n===0?[i]:[]);
    for(let i=0;i<ready.length;i++)for(const child of dag[ready[i]]) {
      depth[child]=Math.max(depth[child],depth[ready[i]]+1);
      if(--incoming[child]===0)ready.push(child);
    }
    return new Map(nodes.map(n=>[n.id,depth[groups.get(n.id)]]));
  }
  function project(slot, layout, calendar, day) {
    const mms=slot.mms||[],known=new Set(mms.map(mm=>mm.id));
    const edges=mms.flatMap(mm=>[...new Set(layout.parentIdsOf(mm))].filter(id=>known.has(id)).map(id=>({from:id,to:mm.id})));
    const auto=layout.computeLayerLayout(mms),levels=depths(mms,edges);
    const palette=['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#8b5cf6','#14b8a6','#f97316','#06b6d4','#a3e635'];
    const sessions=new Map(mms.map(mm=>[mm.id,[]]));
    for(const session of slot.sessions||[])sessions.get(session.mmId)?.push(session);
    const nodes=mms.map((mm,index)=>{
      const manual=slot.pos?.[mm.id],position=manual&&Number.isFinite(manual.x)&&Number.isFinite(manual.y)?manual:auto[mm.id];
      // Track's calendar owns skipped/finished-day semantics. Ask it per identity
      // because its display rows intentionally do not carry a source MM id.
      const reviews=calendar.buildDaySchedule({mms:[mm],sessions:sessions.get(mm.id)},day).sir;
      return {id:mm.id,index,name:mm.name,x:position.x,y:position.y,manual:position===manual,
        color:mm.customColor||(mm.type==='anchor'?'#6b7280':mm.type==='1'?'#ef4444':palette[index%palette.length]),
        radius:10+18/(levels.get(mm.id)+1),depth:levels.get(mm.id),
        pending:reviews.filter(r=>!r.done).length,reviewed:reviews.filter(r=>r.done).length};
    });
    // Only labels move to avoid covering a neighbour. Star coordinates remain
    // byte-for-byte KS03 coordinates, including the user's manual placements.
    const occupied=nodes.map(n=>({x:n.x-n.radius-23,y:n.y-n.radius-23,width:n.radius*2+46,height:n.radius*2+46}));
    const overlap=(a,b)=>Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
    for(const node of nodes) {
      const r=node.radius;
      const candidates=[[node.x-120,node.y+r+28],[node.x+r+28,node.y-28],[node.x-r-268,node.y-28],[node.x-120,node.y-r-133]]
        .map(([x,y])=>({x,y,width:240,height:105}));
      node.label=candidates.reduce((best,rect)=>occupied.reduce((sum,other)=>sum+overlap(rect,other),0)<occupied.reduce((sum,other)=>sum+overlap(best,other),0)?rect:best);
      occupied.push(node.label);
    }
    const bounds=nodes.length?{x:Math.min(...occupied.map(r=>r.x))-24,y:Math.min(...occupied.map(r=>r.y))-24,
      width:Math.max(...occupied.map(r=>r.x+r.width))-Math.min(...occupied.map(r=>r.x))+48,
      height:Math.max(...occupied.map(r=>r.y+r.height))-Math.min(...occupied.map(r=>r.y))+48}:{x:0,y:0,width:720,height:520};
    return {nodes,edges,bounds};
  }
  const api={project};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WorldSkyCore=api;
})(typeof window!=='undefined'?window:globalThis);
