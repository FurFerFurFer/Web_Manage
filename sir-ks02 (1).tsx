import { useState, useMemo, useRef, useEffect, useCallback } from "react";

const SIR_INTERVALS = [1, 7, 14, 30, 90];
const STAGE_COLORS = {
  1:"bg-purple-900 text-purple-200", 2:"bg-blue-900 text-blue-200",
  3:"bg-cyan-900 text-cyan-200", 4:"bg-teal-900 text-teal-200",
  sir:"bg-emerald-900 text-emerald-200", finished:"bg-gray-700 text-gray-300"
};
const STAGE_RING = {1:"#7c3aed",2:"#2563eb",3:"#0891b2",4:"#0d9488",sir:"#059669",finished:"#4b5563"};
const STAGE_KEYS = [1,2,3,4,"sir"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const PALETTE = ["#6366f1","#ec4899","#f59e0b","#10b981","#3b82f6","#8b5cf6","#14b8a6","#f97316","#06b6d4","#a3e635"];

let uid = 1;
const nid = () => uid++;
const today = () => new Date().toISOString().split("T")[0];
const addDays = (d,n) => { const x=new Date(d); x.setDate(x.getDate()+n); return x.toISOString().split("T")[0]; };
const getDIM = (y,m) => new Date(y,m+1,0).getDate();
const getFirstDay = (y,m) => new Date(y,m,1).getDay();
const dStr = (y,m,d) => `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
const EMPTY_KOLB = {isReflectingOnPrev:false,experience:"",mgLookLike:"",sequence:"",feelings:"",difficultWell:"",challenges:"",triggers:"",whyActed:"",habits:"",otherParts:"",experiments:"",mgAdd:""};

function computeRadialLayout(mms) {
  if (!mms.length) return {};
  const childMap={};
  mms.forEach(m=>{
    childMap[m.id]=childMap[m.id]||[];
    (m.parentIds||[]).forEach(pid=>{
      childMap[pid]=childMap[pid]||[];
      if (!childMap[pid].includes(m.id)) childMap[pid].push(m.id);
    });
  });
  const mmById=Object.fromEntries(mms.map(m=>[m.id,m]));
  const roots=mms.filter(m=>!(m.parentIds||[]).some(p=>mmById[p]));
  const pos={},visited=new Set();
  const CX=360,CY=260,RADII=[0,130,220,300,370];
  function place(ids,depth,a0,a1){
    if (!ids.length) return;
    const r=RADII[Math.min(depth,RADII.length-1)];
    ids.forEach((id,i)=>{
      if (visited.has(id)) return; visited.add(id);
      const angle=ids.length===1?(a0+a1)/2:a0+(a1-a0)*(i/(ids.length-1||1));
      pos[id]=depth===0?{x:CX,y:CY}:{x:CX+r*Math.cos(angle),y:CY+r*Math.sin(angle)};
      const ch=(childMap[id]||[]).filter(c=>!visited.has(c));
      if (ch.length){const sp=(a1-a0)/Math.max(ids.length,1);place(ch,depth+1,angle-sp*0.45,angle+sp*0.45);}
    });
  }
  if (roots.length===1){place([roots[0].id],0,0,2*Math.PI);}
  else {
    roots.forEach((r,i)=>{const a=(2*Math.PI*i/roots.length)-Math.PI/2;pos[r.id]={x:CX+RADII[1]*Math.cos(a),y:CY+RADII[1]*Math.sin(a)};visited.add(r.id);});
    roots.forEach((r,i)=>{const a=(2*Math.PI*i/roots.length)-Math.PI/2,sp=2*Math.PI/roots.length;place((childMap[r.id]||[]).filter(c=>!visited.has(c)),2,a-sp*0.4,a+sp*0.4);});
  }
  mms.forEach((m,i)=>{if (!pos[m.id])pos[m.id]={x:CX+90*Math.cos(2*Math.PI*i/mms.length),y:CY+90*Math.sin(2*Math.PI*i/mms.length)};});
  return pos;
}

// ── SIR Wheel ──
function SIRWheel({sessions,onSessionClick,onRevert}) {
  const total=5,CX=80,CY=80,R_OUT=65,R_IN=32,arc=(2*Math.PI)/total;
  function segPath(i){
    const a0=-Math.PI/2+i*arc+0.03,a1=a0+arc-0.06;
    return `M${CX+R_OUT*Math.cos(a0)},${CY+R_OUT*Math.sin(a0)} A${R_OUT},${R_OUT} 0 0,1 ${CX+R_OUT*Math.cos(a1)},${CY+R_OUT*Math.sin(a1)} L${CX+R_IN*Math.cos(a1)},${CY+R_IN*Math.sin(a1)} A${R_IN},${R_IN} 0 0,0 ${CX+R_IN*Math.cos(a0)},${CY+R_IN*Math.sin(a0)} Z`;
  }
  function lp(i){const a=-Math.PI/2+i*arc+arc/2,r=(R_OUT+R_IN)/2;return{x:CX+r*Math.cos(a),y:CY+r*Math.sin(a)};}
  const doneCount=sessions.filter(s=>s.done).length;
  return (
    <div className="flex flex-col items-center">
      <svg width={160} height={160}>
        {sessions.map((s,i)=>{
          const p=lp(i),col=s.done?"#059669":s.skipped?"#374151":"#0891b2";
          return (
            <g key={s.id} onClick={()=>!s.done&&onSessionClick(s)} style={{cursor:s.done?"default":"pointer"}}>
              <path d={segPath(i)} fill={col} fillOpacity={s.done?0.9:0.4} stroke={col} strokeWidth="1"/>
              <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="white" style={{pointerEvents:"none"}}>{s.done?"✓":s.skipped?"—":`D${SIR_INTERVALS[i]}`}</text>
            </g>
          );
        })}
        <circle cx={CX} cy={CY} r={R_IN-2} fill="#0f172a" stroke="#1f2937"/>
        <text x={CX} y={CY-5} textAnchor="middle" fontSize="9" fill="#9ca3af">reps</text>
        <text x={CX} y={CY+8} textAnchor="middle" fontSize="13" fill="white" fontWeight="bold">{doneCount}/{total}</text>
      </svg>
      {doneCount===total&&<div className="text-xs text-emerald-400 font-bold tracking-widest mt-1">ALL DONE → FINISHED</div>}
      <button onClick={onRevert} className="mt-1 text-xs text-red-500 hover:text-red-300">revert to KS02 stage</button>
    </div>
  );
}

// ── KS02 Wheel ──
function KS02Wheel({mms,onSelectStage,selectedStage}) {
  const CX=200,CY=200,R_OUTER=175,R_INNER=55,arc=(2*Math.PI)/STAGE_KEYS.length;
  const counts=useMemo(()=>{const c={};STAGE_KEYS.forEach(s=>{c[s]=mms.filter(m=>m.ksStage===s).length;});return c;},[mms]);
  function segPath(i){
    const a0=-Math.PI/2+i*arc,a1=a0+arc-0.04;
    return `M${CX+R_OUTER*Math.cos(a0)},${CY+R_OUTER*Math.sin(a0)} A${R_OUTER},${R_OUTER} 0 0,1 ${CX+R_OUTER*Math.cos(a1)},${CY+R_OUTER*Math.sin(a1)} L${CX+R_INNER*Math.cos(a1)},${CY+R_INNER*Math.sin(a1)} A${R_INNER},${R_INNER} 0 0,0 ${CX+R_INNER*Math.cos(a0)},${CY+R_INNER*Math.sin(a0)} Z`;
  }
  function lp(i){const a=-Math.PI/2+i*arc+arc/2,r=(R_OUTER+R_INNER)/2;return{x:CX+r*Math.cos(a),y:CY+r*Math.sin(a)};}
  return (
    <div className="flex flex-col items-center py-4">
      <svg width={400} height={400} style={{maxWidth:"100%"}}>
        <circle cx={CX} cy={CY} r={R_OUTER+10} fill="none" stroke="#059669" strokeWidth="1" strokeOpacity="0.15" strokeDasharray="4,4"/>
        {STAGE_KEYS.map((s,i)=>{
          const col=STAGE_RING[s],p=lp(i),count=counts[s]||0,isSel=selectedStage===s;
          return (
            <g key={s} onClick={()=>onSelectStage(isSel?null:s)} style={{cursor:"pointer"}}>
              <path d={segPath(i)} fill={col} fillOpacity={isSel?0.85:0.35} stroke={col} strokeWidth={isSel?2:1} strokeOpacity="0.6"/>
              <text x={p.x} y={p.y-6} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="white" fontWeight="bold" style={{pointerEvents:"none"}}>{s==="sir"?"SIR":`S${s}`}</text>
              <text x={p.x} y={p.y+8} textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="white" fillOpacity="0.7" style={{pointerEvents:"none"}}>{count}</text>
            </g>
          );
        })}
        <circle cx={CX} cy={CY} r={R_INNER-2} fill="#0f172a" stroke="#1f2937"/>
        <text x={CX} y={CY-6} textAnchor="middle" fontSize="11" fill="#9ca3af">total</text>
        <text x={CX} y={CY+9} textAnchor="middle" fontSize="16" fill="white" fontWeight="bold">{mms.length}</text>
      </svg>
      {mms.filter(m=>!m.ksStage).length>0&&<div className="text-xs text-gray-500 mt-1">{mms.filter(m=>!m.ksStage).length} unassigned</div>}
    </div>
  );
}

// ── MG Timeline ──
function MGTimeline({mms,mgChanges,mmColor,onSelectMM}) {
  const TL_LEFT=90,COL_W=100,LANE_H=64;
  const [hovered,setHovered]=useState(null);
  const [pinned,setPinned]=useState(null);
  const type2mms=mms.filter(m=>m.type==="2"&&mgChanges.some(c=>c.mmId===m.id));
  const allDates=[...new Set(mgChanges.map(c=>c.date))].sort();
  const changeMap=Object.fromEntries(mgChanges.map(c=>[c.id,c]));
  const active=pinned||hovered;
  const activeChange=active?changeMap[active]:null;
  const activeMM=activeChange?mms.find(m=>m.id===activeChange.mmId):null;
  if (!type2mms.length) return <div className="text-gray-600 text-center py-20 text-xs">No MG changes yet.</div>;
  return (
    <div className="flex-1 overflow-auto p-2 relative">
      {activeChange&&(
        <div className="sticky top-0 z-10 bg-gray-900 border border-gray-700 rounded p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{backgroundColor:activeMM?mmColor(activeMM.id):"#6b7280"}}/>
              <span className="text-xs font-bold" style={{color:activeMM?mmColor(activeMM.id):"#9ca3af"}}>{activeMM?.name}</span>
              <span className="text-xs text-gray-500">{activeChange.date}</span>
            </div>
            {pinned&&<button onClick={()=>setPinned(null)} className="text-gray-600 hover:text-white text-xs">✕</button>}
          </div>
          {activeChange.experiment&&(
            <div className="mb-2">
              <div className="text-xs text-yellow-400 mb-0.5 font-bold">EXPERIMENT</div>
              <div className="text-xs text-yellow-100">{activeChange.experiment}</div>
            </div>
          )}
          <div>
            <div className="text-xs text-gray-500 mb-0.5">OLD MG <span className="line-through">{activeChange.oldMG}</span></div>
            <div className="text-xs text-emerald-400 mb-0.5 font-bold">NEW MG</div>
            <div className="text-xs text-emerald-200">{activeChange.newMG}</div>
          </div>
          {pinned&&activeMM&&(
            <button onClick={()=>onSelectMM(activeMM.id)} className="mt-2 text-xs text-indigo-400 hover:text-indigo-200 underline">open MM →</button>
          )}
        </div>
      )}
      <div style={{position:"relative",width:TL_LEFT+allDates.length*COL_W+40,height:type2mms.length*LANE_H+60}}>
        <svg style={{position:"absolute",inset:0,width:"100%",height:"100%"}}>
          {allDates.map((d,di)=><line key={d} x1={TL_LEFT+di*COL_W+COL_W/2} y1={36} x2={TL_LEFT+di*COL_W+COL_W/2} y2={type2mms.length*LANE_H+20} stroke="#1f2937" strokeWidth="1" style={{pointerEvents:"none"}}/>)}
          {type2mms.map((mm,li)=><line key={mm.id} x1={TL_LEFT-10} y1={50+li*LANE_H} x2={TL_LEFT+allDates.length*COL_W+20} y2={50+li*LANE_H} stroke={mmColor(mm.id)} strokeWidth="1.5" strokeOpacity="0.35" style={{pointerEvents:"none"}}/>)}
          {type2mms.map((mm,li)=>mgChanges.filter(c=>c.mmId===mm.id).map(c=>{
            const di=allDates.indexOf(c.date);if (di<0) return null;
            const x=TL_LEFT+di*COL_W+COL_W/2,y=50+li*LANE_H,isActive=active===c.id;
            return (
              <g key={c.id} style={{cursor:"pointer"}}
                onMouseEnter={()=>!pinned&&setHovered(c.id)}
                onMouseLeave={()=>!pinned&&setHovered(null)}
                onClick={()=>setPinned(pinned===c.id?null:c.id)}>
                <circle cx={x} cy={y} r={18} fill="transparent"/>
                <circle cx={x} cy={y} r={isActive?12:8} fill={mmColor(mm.id)} fillOpacity={isActive?1:0.7} stroke={isActive?"white":"#030712"} strokeWidth={isActive?2:1.5} style={{pointerEvents:"none"}}/>
                {isActive&&<circle cx={x} cy={y} r={16} fill="none" stroke={mmColor(mm.id)} strokeWidth="1" strokeOpacity="0.4" style={{pointerEvents:"none"}}/>}
              </g>
            );
          }))}
        </svg>
        {allDates.map((d,di)=><div key={d} style={{position:"absolute",left:TL_LEFT+di*COL_W,top:10,width:COL_W,textAlign:"center"}} className="text-xs text-gray-500">{d.slice(5)}</div>)}
        {type2mms.map((mm,li)=>(
          <div key={mm.id} onClick={()=>onSelectMM(mm.id)} style={{position:"absolute",right:`calc(100% - ${TL_LEFT-4}px)`,top:50+li*LANE_H-8,width:TL_LEFT-8,cursor:"pointer"}} className="text-right">
            <span className="text-xs font-bold truncate block" style={{color:mmColor(mm.id)}}>{mm.name}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 px-2 pt-2 border-t border-gray-800 text-xs text-gray-500">
        <span>hover = preview · click = pin</span>
        {type2mms.map(mm=>(
          <div key={mm.id} className="flex items-center gap-1 cursor-pointer" onClick={()=>onSelectMM(mm.id)}>
            <div className="w-2 h-2 rounded-full" style={{backgroundColor:mmColor(mm.id)}}/>
            <span className="text-gray-400">{mm.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Parent/Children Picker ──
function ConnectionsPicker({mms,mm,onSaveParents,onDetachChild,mmColor}) {
  const [editMode,setEditMode]=useState(false);
  const [editParentIds,setEditParentIds]=useState([...(mm.parentIds||[])]);
  const [editChildIds,setEditChildIds]=useState([]);
  const [q,setQ]=useState("");
  const parents=mms.filter(m=>(mm.parentIds||[]).includes(m.id));
  const children=mms.filter(m=>(m.parentIds||[]).includes(mm.id));

  // for child editing: find MMs that could be children (not self, not already a parent)
  const potentialChildren=mms.filter(m=>m.id!==mm.id&&!(mm.parentIds||[]).includes(m.id));
  const filteredOptions=potentialChildren.filter(m=>m.name.toLowerCase().includes(q.toLowerCase()));

  function saveAll(){
    onSaveParents(mm.id,editParentIds);
    // add mm.id to parentIds of newly selected children
    editChildIds.forEach(cid=>{
      const child=mms.find(m=>m.id===cid);
      if (child&&!(child.parentIds||[]).includes(mm.id)) onSaveParents(cid,[...(child.parentIds||[]),mm.id]);
    });
    setEditMode(false);setEditChildIds([]);setQ("");
  }

  if (!editMode) return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500">Connections</span>
        <button onClick={()=>{setEditMode(true);setEditParentIds([...(mm.parentIds||[])]);setEditChildIds([]);}} className="text-xs text-indigo-400 hover:text-indigo-200">edit</button>
      </div>
      <div className="space-y-1">
        {parents.length>0&&(
          <div><div className="text-xs text-gray-600 mb-1">Parents ↑</div>
            <div className="flex flex-wrap gap-1">{parents.map(p=>(
              <div key={p.id} className="flex items-center gap-1 bg-gray-900 border border-gray-700 rounded pl-2 pr-1 py-1 text-xs">
                <div className="w-1.5 h-1.5 rounded-full" style={{backgroundColor:p.type==="1"?"#ef4444":mmColor(p.id)}}/>
                <span>{p.name}</span>
                <button onClick={()=>onSaveParents(mm.id,(mm.parentIds||[]).filter(x=>x!==p.id))} className="ml-1 text-gray-600 hover:text-red-400">⊗</button>
              </div>
            ))}</div>
          </div>
        )}
        {children.length>0&&(
          <div><div className="text-xs text-gray-600 mb-1 mt-2">Children ↓</div>
            <div className="flex flex-wrap gap-1">{children.map(c=>(
              <div key={c.id} className="flex items-center gap-1 bg-gray-900 border border-gray-700 rounded pl-2 pr-1 py-1 text-xs">
                <div className="w-1.5 h-1.5 rounded-full" style={{backgroundColor:c.type==="1"?"#ef4444":mmColor(c.id)}}/>
                <span>{c.name}</span>
                <button onClick={()=>onDetachChild(c.id,mm.id)} className="ml-1 text-gray-600 hover:text-red-400">⊗</button>
              </div>
            ))}</div>
          </div>
        )}
        {!parents.length&&!children.length&&<span className="text-xs text-gray-600">No connections</span>}
      </div>
    </div>
  );

  return (
    <div className="bg-gray-900 border border-gray-700 rounded p-3 mb-2">
      <div className="text-xs font-bold text-gray-300 mb-3">EDIT CONNECTIONS</div>
      {/* parents */}
      <div className="mb-3">
        <div className="text-xs text-gray-400 mb-1">Parents ↑</div>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search MMs..."
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 mb-1 text-white placeholder-gray-600 text-xs"/>
        <div className="max-h-24 overflow-y-auto space-y-0.5 mb-1">
          <button onClick={()=>setEditParentIds([])} className={`w-full text-left text-xs px-2 py-1 rounded ${editParentIds.length===0?"bg-gray-600 text-white":"bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>No parents (root)</button>
          {mms.filter(m=>m.id!==mm.id&&m.name.toLowerCase().includes(q.toLowerCase())).map(m=>(
            <button key={m.id} onClick={()=>setEditParentIds(p=>p.includes(m.id)?p.filter(x=>x!==m.id):[...p,m.id])}
              className={`w-full text-left text-xs px-2 py-1 rounded flex items-center gap-2 ${editParentIds.includes(m.id)?"bg-indigo-800 text-white":"bg-gray-800 text-gray-300 hover:bg-gray-700"}`}>
              <div className="w-2 h-2 rounded-full shrink-0" style={{backgroundColor:m.type==="1"?"#ef4444":mmColor(m.id)}}/>
              <span className="truncate">{m.name}</span>
            </button>
          ))}
        </div>
      </div>
      {/* children */}
      <div className="mb-3">
        <div className="text-xs text-gray-400 mb-1">Add Children ↓ (new only)</div>
        <div className="max-h-24 overflow-y-auto space-y-0.5">
          {filteredOptions.filter(m=>!children.find(c=>c.id===m.id)).map(m=>(
            <button key={m.id} onClick={()=>setEditChildIds(p=>p.includes(m.id)?p.filter(x=>x!==m.id):[...p,m.id])}
              className={`w-full text-left text-xs px-2 py-1 rounded flex items-center gap-2 ${editChildIds.includes(m.id)?"bg-teal-800 text-white":"bg-gray-800 text-gray-300 hover:bg-gray-700"}`}>
              <div className="w-2 h-2 rounded-full shrink-0" style={{backgroundColor:m.type==="1"?"#ef4444":mmColor(m.id)}}/>
              <span className="truncate">{m.name}</span>
            </button>
          ))}
          {filteredOptions.filter(m=>!children.find(c=>c.id===m.id)).length===0&&<div className="text-xs text-gray-600 px-2">No options.</div>}
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={saveAll} className="flex-1 bg-indigo-700 hover:bg-indigo-600 text-white py-1.5 rounded text-xs font-bold">SAVE</button>
        <button onClick={()=>{setEditMode(false);setQ("");}} className="flex-1 bg-gray-800 text-gray-300 py-1.5 rounded text-xs">CANCEL</button>
      </div>
    </div>
  );
}

// ── Multiverse Canvas ──
function MultiverseCanvas({mms,mgChanges,manualPos,setManualPos,onOpen,mmColor}) {
  const svgRef=useRef(null);
  const dragNode=useRef(null);
  const dragOffset=useRef({x:0,y:0});
  const didDrag=useRef(false);
  const autoPos=useMemo(()=>computeRadialLayout(mms),[mms]);
  const nodePos=useMemo(()=>({...autoPos,...manualPos}),[autoPos,manualPos]);
  const edges=useMemo(()=>{
    const seen=new Set(),res=[];
    mms.forEach(m=>(m.parentIds||[]).forEach(pid=>{const k=[pid,m.id].join("-");if (!seen.has(k)){seen.add(k);res.push([pid,m.id]);}}));
    return res;
  },[mms]);
  useEffect(()=>{
    function onMove(e){
      if (!dragNode.current) return; didDrag.current=true;
      const rect=svgRef.current?.getBoundingClientRect();if (!rect) return;
      setManualPos(p=>({...p,[dragNode.current]:{x:e.clientX-rect.left-dragOffset.current.x,y:e.clientY-rect.top-dragOffset.current.y}}));
    }
    function onUp(){dragNode.current=null;}
    window.addEventListener("mousemove",onMove);window.addEventListener("mouseup",onUp);
    return()=>{window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
  },[setManualPos]);
  function onMouseDown(e,id){
    e.preventDefault();e.stopPropagation();
    const rect=svgRef.current.getBoundingClientRect(),cur=nodePos[id]||{x:200,y:200};
    dragOffset.current={x:e.clientX-rect.left-cur.x,y:e.clientY-rect.top-cur.y};
    dragNode.current=id;didDrag.current=false;
  }
  function onMouseUp(e,id){
    e.stopPropagation();
    if (!didDrag.current) onOpen(id);
    didDrag.current=false;dragNode.current=null;
  }
  return (
    <div className="flex-1 relative overflow-hidden">
      {mms.length===0&&<div className="text-gray-600 text-center py-20 text-xs">No MMs yet.</div>}
      <svg ref={svgRef} style={{position:"absolute",inset:0,width:"100%",height:"100%"}}>
        <defs><marker id="arr" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#4b5563"/></marker></defs>
        {edges.map(([pid,cid])=>{
          const a=nodePos[pid],b=nodePos[cid];if (!a||!b) return null;
          const dx=b.x-a.x,dy=b.y-a.y,len=Math.sqrt(dx*dx+dy*dy)||1,r=mms.find(m=>m.id===cid)?.type==="2"?26:20;
          return <line key={`${pid}-${cid}`} x1={a.x} y1={a.y} x2={b.x-dx/len*r} y2={b.y-dy/len*r} stroke="#374151" strokeWidth="1.5" markerEnd="url(#arr)"/>;
        })}
        {mms.map(mm=>{
          const p=nodePos[mm.id]||{x:200,y:200},col=mm.type==="1"?"#ef4444":mmColor(mm.id),r=mm.type==="2"?26:20;
          const hasMG=mgChanges&&mgChanges.some(c=>c.mmId===mm.id),stageCol=mm.ksStage?STAGE_RING[mm.ksStage]:null;
          return (
            <g key={mm.id} transform={`translate(${p.x},${p.y})`} onMouseDown={e=>onMouseDown(e,mm.id)} onMouseUp={e=>onMouseUp(e,mm.id)} style={{cursor:"pointer"}}>
              {hasMG&&<circle r={r+7} fill="none" stroke={col} strokeWidth="1" strokeOpacity="0.25"/>}
              {stageCol&&<circle r={r+4} fill="none" stroke={stageCol} strokeWidth="1.5" strokeOpacity="0.5" strokeDasharray="3,2"/>}
              <circle r={r} fill="#0f172a" stroke={col} strokeWidth={mm.type==="1"?1.5:2} strokeDasharray={mm.type==="1"?"4,3":"none"}/>
              <text textAnchor="middle" dominantBaseline="middle" fontSize="9" fill={col} style={{pointerEvents:"none",userSelect:"none"}}>{mm.name.length>11?mm.name.slice(0,10)+"…":mm.name}</text>
              {mm.type==="2"&&<text y={r-6} textAnchor="middle" fontSize="7" fill="#6b7280" style={{pointerEvents:"none",userSelect:"none"}}>MG</text>}
            </g>
          );
        })}
      </svg>
      <div className="absolute bottom-3 left-3 flex gap-4 text-xs text-gray-600">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full border border-dashed border-red-500 inline-block"/>T1</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full border border-indigo-400 inline-block"/>T2</span>
        <span>drag · click to open</span>
      </div>
    </div>
  );
}

// ── Kolb Form ──
function KolbForm({mmOptions,initialMMId,onSave,onCancel}) {
  const [form,setForm]=useState(EMPTY_KOLB);
  const [step,setStep]=useState(1);
  const [mmId,setMMId]=useState(initialMMId||"");
  const [mmSearch,setMmSearch]=useState("");
  const f=(v,k)=>setForm(p=>({...p,[k]:v}));
  const filtered=mmOptions.filter(m=>m.name.toLowerCase().includes(mmSearch.toLowerCase()));
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-5 w-full max-w-md my-4">
        <div className="flex items-center justify-between mb-1">
          <div className="font-bold tracking-widest text-xs text-indigo-300">KOLB</div>
          <div className="text-xs text-gray-500">Step {step}/4</div>
        </div>
        <div className="flex gap-1 mb-4">{[1,2,3,4].map(i=><div key={i} className={`flex-1 h-1 rounded ${step>=i?"bg-indigo-400":"bg-gray-700"}`}/>)}</div>
        {step===1&&(<div className="space-y-3">
          <div className="text-xs font-bold text-gray-300">STEP 1 — EXPERIENCE</div>
          <div><label className="text-xs text-gray-400">Reflecting on a previous Kolb?</label>
            <div className="flex gap-2 mt-1">{[true,false].map(v=>(
              <button key={String(v)} onClick={()=>f(v,"isReflectingOnPrev")} className={`flex-1 py-1.5 rounded text-xs ${form.isReflectingOnPrev===v?"bg-indigo-600 text-white":"bg-gray-800 text-gray-400"}`}>{v?"Yes":"No"}</button>
            ))}</div>
          </div>
          {[["experience","What experience to reflect on?",3],["mgLookLike","What would an MG look like?",2]].map(([k,l,r])=>(
            <div key={k}><label className="text-xs text-gray-400 block mb-1">{l}</label>
            <textarea value={form[k]} onChange={e=>f(e.target.value,k)} rows={r} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-xs resize-none"/></div>
          ))}
        </div>)}
        {step===2&&(<div className="space-y-3">
          <div className="text-xs font-bold text-gray-300">STEP 2 — REFLECTION</div>
          {[["sequence","Sequence of events:",4],["feelings","How did you feel?",2],["difficultWell","Difficult vs went well?",2],["challenges","Response to challenges?",2],["triggers","Triggers?",2],["whyActed","Why did you act that way?",2]].map(([k,l,r])=>(
            <div key={k}><label className="text-xs text-gray-400 block mb-1">{l}</label>
            <textarea value={form[k]} onChange={e=>f(e.target.value,k)} rows={r} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-xs resize-none"/></div>
          ))}
        </div>)}
        {step===3&&(<div className="space-y-3">
          <div className="text-xs font-bold text-gray-300">STEP 3 — ABSTRACT</div>
          {[["habits","Habits/beliefs/tendencies?",3],["otherParts","Similar patterns elsewhere?",2]].map(([k,l,r])=>(
            <div key={k}><label className="text-xs text-gray-400 block mb-1">{l}</label>
            <textarea value={form[k]} onChange={e=>f(e.target.value,k)} rows={r} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-xs resize-none"/></div>
          ))}
        </div>)}
        {step===4&&(<div className="space-y-4">
          <div className="text-xs font-bold text-emerald-300">STEP 4 — EXPERIMENT & MG</div>
          {/* substep 4a */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-yellow-400">4.1 EXPERIMENT</span>
              <span className="text-xs text-gray-500">— actions to test</span>
            </div>
            <textarea value={form.experiments} onChange={e=>f(e.target.value,"experiments")} rows={3}
              className="w-full bg-gray-800 border border-yellow-700 rounded px-3 py-2 text-white text-xs resize-none" placeholder="List solutions / actions to experiment on..."/>
          </div>
          {/* substep 4b */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-emerald-300">4.2 MG ADD</span>
              <span className="text-xs text-gray-500">— the actual marginal gain</span>
            </div>
            <textarea value={form.mgAdd} onChange={e=>f(e.target.value,"mgAdd")} rows={3}
              className="w-full bg-gray-800 border border-emerald-700 rounded px-3 py-2 text-white text-xs resize-none" placeholder="What is the new MG? (becomes current MG)"/>
          </div>
          {!initialMMId&&(<div>
            <div className="text-xs text-gray-400 mb-1">Link to MM (optional — T2 only):</div>
            <input value={mmSearch} onChange={e=>setMmSearch(e.target.value)} placeholder="Search T2 MMs..."
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 mb-1 text-white placeholder-gray-600 text-xs"/>
            <div className="max-h-24 overflow-y-auto space-y-0.5">
              <button onClick={()=>setMMId("")} className={`w-full text-left text-xs px-3 py-1.5 rounded ${!mmId?"bg-gray-600 text-white":"bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>No MM (store unlinked)</button>
              {filtered.map(m=>(
                <button key={m.id} onClick={()=>setMMId(m.id)} className={`w-full text-left text-xs px-3 py-1.5 rounded ${mmId===m.id?"bg-indigo-800 text-white":"bg-gray-800 text-gray-300 hover:bg-gray-700"}`}>{m.name}</button>
              ))}
            </div>
          </div>)}
        </div>)}
        <div className="flex gap-2 mt-4">
          {step>1&&<button onClick={()=>setStep(p=>p-1)} className="flex-1 bg-gray-800 text-gray-300 py-2 rounded text-xs">← BACK</button>}
          {step<4&&<button onClick={()=>setStep(p=>p+1)} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded text-xs font-bold">NEXT →</button>}
          {step===4&&<button onClick={()=>onSave(form,mmId||initialMMId||null)} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded text-xs font-bold">SAVE</button>}
          <button onClick={onCancel} className="bg-gray-800 text-gray-400 px-3 py-2 rounded text-xs">✕</button>
        </div>
      </div>
    </div>
  );
}

// ── Unified MM Detail (KS03 mode + MG mode) ──
function MMDetail({mm,mms,mgChanges,kolbs,mmColor,sirSessionsMap,initialMode,
  onBack,onNavigate,onSaveParents,onDetachChild,onAddComment,onRemoveComment,
  onAddLink,onRemoveLink,onNewKolb,onDupeKolb,onSetStage,onDelete,onSessionAction,onRevertFromSIR}) {
  const [mode,setMode]=useState(initialMode||"ks03");
  const [newComment,setNewComment]=useState("");
  const [newLink,setNewLink]=useState({label:"",url:""});
  const [showLinkForm,setShowLinkForm]=useState(false);
  const [confirmDelete,setConfirmDelete]=useState(false);
  const [sessionDetail,setSessionDetail]=useState(null);
  const changes=mgChanges.filter(c=>c.mmId===mm.id).sort((a,b)=>b.date.localeCompare(a.date));
  const mmById=Object.fromEntries(mms.map(m=>[m.id,m]));
  const recentKolbs=kolbs.filter(k=>k.mmId!==mm.id&&k.mmId).slice(-5);
  const mySessions=sirSessionsMap[mm.id]||[];
  const allRepsDone=mySessions.length===5&&mySessions.every(s=>s.done);
  const mmKolbs=kolbs.filter(k=>k.mmId===mm.id).sort((a,b)=>b.date.localeCompare(a.date));

  return (
    <div className="p-4 max-w-2xl mx-auto overflow-y-auto pb-20" style={{height:"calc(100vh - 52px)"}}>
      {/* header */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={onBack} className="text-gray-500 hover:text-white text-xs">← back</button>
        <button onClick={()=>setConfirmDelete(true)} className="text-red-700 hover:text-red-400 text-xs">delete</button>
      </div>
      {confirmDelete&&(
        <div className="bg-red-950 border border-red-700 rounded p-3 mb-3">
          <div className="text-xs text-red-300 mb-2">Delete <span className="font-bold text-white">{mm.name}</span>?</div>
          <div className="flex gap-2">
            <button onClick={()=>onDelete(mm.id)} className="flex-1 bg-red-700 hover:bg-red-600 text-white py-1.5 rounded text-xs font-bold">CONFIRM</button>
            <button onClick={()=>setConfirmDelete(false)} className="flex-1 bg-gray-800 text-gray-300 py-1.5 rounded text-xs">CANCEL</button>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-3 h-3 rounded-full" style={{backgroundColor:mm.type==="1"?"#ef4444":mmColor(mm.id)}}/>
        <span className="font-bold text-lg">{mm.name}</span>
        <span className={`text-xs px-2 py-0.5 rounded ${mm.type==="2"?"bg-indigo-900 text-indigo-300":"bg-red-900 text-red-300"}`}>T{mm.type}</span>
        {mm.ksStage&&<span className={`text-xs px-2 py-0.5 rounded ${STAGE_COLORS[mm.ksStage]||""}`}>{mm.ksStage==="sir"?"SIR":mm.ksStage==="finished"?"FINISHED":`S${mm.ksStage}`}</span>}
      </div>

      {/* mode toggle */}
      <div className="flex gap-1 mb-4">
        {[["ks03","KS03"],["mg","MG"]].map(([m,l])=>(
          <button key={m} onClick={()=>setMode(m)}
            className={`px-4 py-1.5 rounded text-xs font-bold transition ${mode===m?"bg-white text-gray-950":"bg-gray-800 text-gray-400 hover:text-white"}`}>{l}</button>
        ))}
      </div>

      {/* ── KS03 MODE ── */}
      {mode==="ks03"&&(<>
        {/* stage */}
        <div className="mb-4">
          <div className="text-xs text-gray-500 mb-2 tracking-widest">KS02 STAGE</div>
          <div className="flex gap-1 flex-wrap">
            {STAGE_KEYS.map(s=>(
              <button key={s} onClick={()=>onSetStage(mm.id,mm.ksStage===s?null:s)}
                className={`px-3 py-1.5 rounded text-xs font-bold transition ${mm.ksStage===s?STAGE_COLORS[s]:"bg-gray-800 text-gray-500 hover:bg-gray-700"}`}>
                {s==="sir"?"SIR":`S${s}`}
              </button>
            ))}
          </div>
        </div>

        {/* SIR wheel */}
        {mm.ksStage==="sir"&&mySessions.length>0&&(
          <div className="mb-4 bg-gray-900 border border-emerald-800 rounded p-3">
            <div className="text-xs text-emerald-400 mb-3 tracking-widest">SIR SESSIONS</div>
            {allRepsDone&&(
              <div className="mb-3 bg-emerald-950 border border-emerald-700 rounded px-3 py-2 text-xs text-emerald-300 font-bold">
                All reps complete! → <button onClick={()=>onSetStage(mm.id,"finished")} className="underline hover:text-white">Mark as FINISHED</button>
              </div>
            )}
            <SIRWheel sessions={mySessions} onSessionClick={setSessionDetail} onRevert={()=>onRevertFromSIR(mm.id)}/>
          </div>
        )}
        {mm.ksStage==="finished"&&(
          <div className="mb-4 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-xs text-gray-300">
            ✓ FINISHED — all SIR reps completed.
            <button onClick={()=>onRevertFromSIR(mm.id)} className="ml-2 text-indigo-400 hover:text-indigo-200 underline">revert</button>
          </div>
        )}
        {sessionDetail&&(
          <div className="mb-4 bg-gray-900 border border-cyan-800 rounded p-3">
            <div className="text-xs text-cyan-400 mb-2">REP {sessionDetail.repIndex+1} — {sessionDetail.date}</div>
            <div className="flex gap-2 mb-2">
              <button onClick={()=>{onSessionAction(sessionDetail.id,"done");setSessionDetail(null);}} className="flex-1 bg-emerald-700 hover:bg-emerald-600 text-white py-1.5 rounded text-xs font-bold">✓ DONE</button>
              <button onClick={()=>{onSessionAction(sessionDetail.id,"skip");setSessionDetail(null);}} className="flex-1 bg-gray-700 text-gray-300 py-1.5 rounded text-xs">SKIP</button>
            </div>
            <div className="flex gap-2">
              <input type="date" defaultValue={sessionDetail.date} id="sir-date-input" className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs"/>
              <button onClick={()=>{const v=document.getElementById("sir-date-input").value;if(v){onSessionAction(sessionDetail.id,"reschedule",v);setSessionDetail(null);}}} className="bg-blue-800 hover:bg-blue-700 text-white px-3 rounded text-xs">RESCHEDULE</button>
            </div>
            <button onClick={()=>setSessionDetail(null)} className="mt-2 text-gray-500 text-xs hover:text-white">cancel</button>
          </div>
        )}

        {/* connections */}
        <div className="mb-4">
          <ConnectionsPicker mms={mms} mm={mm} onSaveParents={onSaveParents} onDetachChild={onDetachChild} mmColor={mmColor}/>
        </div>

        {/* links */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500 tracking-widest">LINKS</span>
            <button onClick={()=>setShowLinkForm(!showLinkForm)} className="text-xs text-indigo-400 hover:text-indigo-200">+ add</button>
          </div>
          {showLinkForm&&(
            <div className="bg-gray-900 border border-gray-700 rounded p-2 mb-2 space-y-1">
              <input value={newLink.label} onChange={e=>setNewLink(p=>({...p,label:e.target.value}))} placeholder="Label (optional)" className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white placeholder-gray-600 text-xs"/>
              <input value={newLink.url} onChange={e=>setNewLink(p=>({...p,url:e.target.value}))} placeholder="URL https://..." className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white placeholder-gray-600 text-xs"/>
              <button onClick={()=>{onAddLink(mm.id,newLink);setNewLink({label:"",url:""});setShowLinkForm(false);}} className="w-full bg-indigo-700 hover:bg-indigo-600 text-white py-1 rounded text-xs">SAVE</button>
            </div>
          )}
          {(mm.links||[]).map(l=>(
            <div key={l.id} className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded px-3 py-1.5 mb-1">
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-300 hover:text-indigo-100 truncate">{l.label}</a>
              <button onClick={()=>onRemoveLink(mm.id,l.id)} className="text-gray-600 hover:text-red-400 text-xs ml-2 shrink-0">×</button>
            </div>
          ))}
          {!(mm.links||[]).length&&!showLinkForm&&<div className="text-xs text-gray-600">No links.</div>}
        </div>

        {/* comments */}
        <div className="mb-4">
          <div className="text-xs text-gray-500 mb-1 tracking-widest">COMMENTS</div>
          {(mm.comments||[]).map(c=>(
            <div key={c.id} className="flex items-start justify-between bg-gray-900 border border-gray-800 rounded px-3 py-2 mb-1">
              <div><div className="text-xs text-gray-300">{c.text}</div><div className="text-xs text-gray-600 mt-0.5">{c.date}</div></div>
              <button onClick={()=>onRemoveComment(mm.id,c.id)} className="text-gray-600 hover:text-red-400 text-xs ml-2">×</button>
            </div>
          ))}
          <div className="flex gap-2 mt-1">
            <input value={newComment} onChange={e=>setNewComment(e.target.value)} placeholder="Add comment..."
              onKeyDown={e=>{if(e.key==="Enter"){onAddComment(mm.id,newComment);setNewComment("");}}}
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-white placeholder-gray-600 text-xs"/>
            <button onClick={()=>{onAddComment(mm.id,newComment);setNewComment("");}} className="bg-gray-700 hover:bg-gray-600 text-white px-3 rounded text-xs">+</button>
          </div>
        </div>
      </>)}

      {/* ── MG MODE ── */}
      {mode==="mg"&&(<>
        {mm.type!=="2"&&<div className="bg-gray-900 border border-red-900 rounded p-3 text-xs text-red-300">Type 1 anchor — no MG.</div>}
        {mm.type==="2"&&(<>
          <div className="bg-gray-900 border border-emerald-800 rounded p-3 mb-4">
            <div className="text-xs text-emerald-400 mb-1">CURRENT MG</div>
            <div className="text-emerald-200 text-sm">{mm.currentMG||"No MG yet"}</div>
          </div>
          <button onClick={onNewKolb} className="w-full bg-indigo-700 hover:bg-indigo-600 text-white py-2 rounded text-xs font-bold mb-4">+ NEW KOLB → UPDATE MG</button>

          {/* dupe from recent */}
          {recentKolbs.length>0&&(
            <div className="mb-4">
              <div className="text-xs text-gray-500 mb-2 tracking-widest">DUPLICATE FROM RECENT KOLB</div>
              {recentKolbs.map(k=>(
                <div key={k.id} className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded px-3 py-2 mb-1">
                  <div className="text-xs text-gray-300 truncate flex-1">{mmById[k.mmId]?.name} · {k.date}</div>
                  <button onClick={()=>onDupeKolb(k.id,mm.id)} className="ml-2 bg-gray-700 hover:bg-gray-600 text-xs px-2 py-1 rounded">dupe</button>
                </div>
              ))}
            </div>
          )}

          {/* MG progression */}
          <div className="text-xs text-gray-500 mb-3 tracking-widest">MG PROGRESSION</div>
          {!changes.length&&<div className="text-gray-600 text-xs mb-4">No changes yet.</div>}
          <div className="relative pl-5 mb-6">
            {changes.map((c,i)=>(
              <div key={c.id} className="relative mb-5">
                <div className="absolute -left-5 top-1.5 w-2.5 h-2.5 rounded-full" style={{backgroundColor:mmColor(mm.id)}}/>
                {i<changes.length-1&&<div className="absolute left-[-14px] top-4 bottom-0 w-px bg-gray-700"/>}
                <div className="text-xs text-gray-500 mb-1">{c.date}</div>
                {c.experiment&&(
                  <div className="mb-1">
                    <div className="text-xs text-yellow-400 font-bold mb-0.5">EXPERIMENT</div>
                    <div className="text-xs text-yellow-100 bg-gray-900 border border-yellow-900 rounded px-2 py-1">{c.experiment}</div>
                  </div>
                )}
                <div className="text-xs text-gray-500 line-through mb-0.5">{c.oldMG}</div>
                <div className="text-xs text-emerald-400 font-bold mb-0.5">MG</div>
                <div className="text-xs text-emerald-200">{c.newMG}</div>
              </div>
            ))}
          </div>

          {/* Kolb history */}
          <div className="text-xs text-gray-500 mb-3 tracking-widest">KOLB HISTORY</div>
          {!mmKolbs.length&&<div className="text-gray-600 text-xs mb-4">No Kolbs logged yet.</div>}
          {mmKolbs.map(k=>(
            <div key={k.id} className="bg-gray-900 border border-gray-800 rounded p-3 mb-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-indigo-300 font-bold">Kolb</span>
                <span className="text-xs text-gray-500">{k.date}</span>
              </div>
              {[["Experience",k.experience],["MG Look Like",k.mgLookLike],["Sequence",k.sequence],["Feelings",k.feelings],["Difficult/Well",k.difficultWell],["Challenges",k.challenges],["Triggers",k.triggers],["Why Acted",k.whyActed],["Habits",k.habits],["Other Parts",k.otherParts]].map(([l,v])=>v?(
                <div key={l} className="mb-1">
                  <span className="text-xs text-gray-500">{l}: </span>
                  <span className="text-xs text-gray-300">{v}</span>
                </div>
              ):null)}
              {(k.experiments||k.mgAdd)&&(
                <div className="mt-2 pt-2 border-t border-gray-800 space-y-2">
                  {k.experiments&&(
                    <div>
                      <div className="text-xs text-yellow-400 font-bold mb-0.5">4.1 EXPERIMENT</div>
                      <div className="text-xs text-yellow-100">{k.experiments}</div>
                    </div>
                  )}
                  {k.mgAdd&&(
                    <div>
                      <div className="text-xs text-emerald-400 font-bold mb-0.5">4.2 MG ADD</div>
                      <div className="text-xs text-emerald-200">{k.mgAdd}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </>)}
      </>)}
    </div>
  );
}

// ── Kolb Edit View ──
function KolbEditView({kolb,mm,hasMG,filteredT2,kolbLinkSearch,setKolbLinkSearch,mmColor,onBack,onSave}) {
  const [form,setForm]=useState({...kolb});
  const [dirty,setDirty]=useState(false);
  const f=(v,k)=>{setForm(p=>({...p,[k]:v}));setDirty(true);}
  const STEP1=[["experience","What experience to reflect on?",3],["mgLookLike","What would an MG look like?",2]];
  const STEP2=[["sequence","Sequence of events:",4],["feelings","How did you feel?",2],["difficultWell","Difficult vs went well?",2],["challenges","Response to challenges?",2],["triggers","Triggers?",2],["whyActed","Why did you act that way?",2]];
  const STEP3=[["habits","Habits/beliefs/tendencies?",3],["otherParts","Similar patterns elsewhere?",2]];
  const currentMM=mm;

  return (
    <div className="p-4 max-w-2xl mx-auto overflow-y-auto" style={{maxHeight:"calc(100vh - 52px)"}}>
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="text-gray-500 hover:text-white text-xs">← back</button>
        <div className="flex items-center gap-2">
          {dirty&&<span className="text-xs text-yellow-400">unsaved</span>}
          <span className="text-xs text-gray-500">{kolb.date}</span>
        </div>
      </div>

      {/* MM link */}
      <div className="mb-4 bg-gray-900 border border-indigo-800 rounded p-3">
        <div className="text-xs text-indigo-300 mb-2 font-bold tracking-widest">MM LINK</div>
        {form.mmId&&(()=>{const m=filteredT2.find(m=>m.id===form.mmId)||currentMM;return m?(
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{backgroundColor:mmColor(m.id)}}/>
              <span className="text-xs text-gray-200 font-bold">{m.name}</span>
              {hasMG&&<span className="text-xs bg-emerald-900 text-emerald-300 px-1.5 py-0.5 rounded">MG</span>}
            </div>
            <button onClick={()=>f(null,"mmId")} className="text-xs text-red-500 hover:text-red-300">unlink</button>
          </div>
        ):null;})()}
        <input value={kolbLinkSearch} onChange={e=>setKolbLinkSearch(e.target.value)} placeholder="Search T2 MMs to link..."
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 mb-1 text-white placeholder-gray-600 text-xs"/>
        <div className="max-h-24 overflow-y-auto space-y-0.5">
          <button onClick={()=>{f(null,"mmId");setDirty(true);}} className={`w-full text-left text-xs px-3 py-1.5 rounded ${!form.mmId?"bg-gray-600 text-white":"bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>No MM (unlinked)</button>
          {filteredT2.map(m=>(
            <button key={m.id} onClick={()=>{f(m.id,"mmId");setDirty(true);}}
              className={`w-full text-left text-xs px-3 py-1.5 rounded flex items-center gap-2 ${form.mmId===m.id?"bg-indigo-800 text-white":"bg-gray-800 text-gray-300 hover:bg-gray-700"}`}>
              <div className="w-2 h-2 rounded-full" style={{backgroundColor:mmColor(m.id)}}/>{m.name}
            </button>
          ))}
        </div>
      </div>

      {/* Step 1 */}
      <div className="mb-4">
        <div className="text-xs font-bold text-gray-300 mb-2 tracking-widest">STEP 1 — EXPERIENCE</div>
        <div className="mb-2">
          <label className="text-xs text-gray-400">Reflecting on a previous Kolb?</label>
          <div className="flex gap-2 mt-1">{[true,false].map(v=>(
            <button key={String(v)} onClick={()=>f(v,"isReflectingOnPrev")} className={`flex-1 py-1.5 rounded text-xs ${form.isReflectingOnPrev===v?"bg-indigo-600 text-white":"bg-gray-800 text-gray-400"}`}>{v?"Yes":"No"}</button>
          ))}</div>
        </div>
        {STEP1.map(([k,l,r])=>(
          <div key={k} className="mb-2"><label className="text-xs text-gray-400 block mb-1">{l}</label>
          <textarea value={form[k]||""} onChange={e=>f(e.target.value,k)} rows={r} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-xs resize-none"/></div>
        ))}
      </div>

      {/* Step 2 */}
      <div className="mb-4">
        <div className="text-xs font-bold text-gray-300 mb-2 tracking-widest">STEP 2 — REFLECTION</div>
        {STEP2.map(([k,l,r])=>(
          <div key={k} className="mb-2"><label className="text-xs text-gray-400 block mb-1">{l}</label>
          <textarea value={form[k]||""} onChange={e=>f(e.target.value,k)} rows={r} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-xs resize-none"/></div>
        ))}
      </div>

      {/* Step 3 */}
      <div className="mb-4">
        <div className="text-xs font-bold text-gray-300 mb-2 tracking-widest">STEP 3 — ABSTRACT</div>
        {STEP3.map(([k,l,r])=>(
          <div key={k} className="mb-2"><label className="text-xs text-gray-400 block mb-1">{l}</label>
          <textarea value={form[k]||""} onChange={e=>f(e.target.value,k)} rows={r} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-xs resize-none"/></div>
        ))}
      </div>

      {/* Step 4 */}
      <div className="mb-6">
        <div className="text-xs font-bold text-emerald-300 mb-2 tracking-widest">STEP 4 — EXPERIMENT & MG</div>
        <div className="mb-3">
          <label className="text-xs text-yellow-400 font-bold block mb-1">4.1 EXPERIMENT</label>
          <textarea value={form.experiments||""} onChange={e=>f(e.target.value,"experiments")} rows={3}
            className="w-full bg-gray-800 border border-yellow-700 rounded px-3 py-2 text-white text-xs resize-none" placeholder="Actions/solutions to test..."/>
        </div>
        <div>
          <label className="text-xs text-emerald-300 font-bold block mb-1">4.2 MG ADD</label>
          <textarea value={form.mgAdd||""} onChange={e=>f(e.target.value,"mgAdd")} rows={3}
            className="w-full bg-gray-800 border border-emerald-700 rounded px-3 py-2 text-white text-xs resize-none" placeholder="The actual marginal gain..."/>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gray-950 border-t border-gray-800">
        <button onClick={()=>onSave(form)} className="w-full max-w-2xl mx-auto block bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded text-xs font-bold">SAVE CHANGES</button>
      </div>
    </div>
  );
}

// ── App ──
export default function App() {
  const [view,setView]=useState("calendar");
  const [sessions,setSessions]=useState([]);
  const [mms,setMms]=useState([]);
  const [kolbs,setKolbs]=useState([]);
  const [mgChanges,setMgChanges]=useState([]);
  const [calDate,setCalDate]=useState({year:new Date().getFullYear(),month:new Date().getMonth()});
  const [selDay,setSelDay]=useState(null);
  const [addMMModal,setAddMMModal]=useState(false);
  const [kolbModal,setKolbModal]=useState(null);
  const [selectedMM,setSelectedMM]=useState(null);
  const [selectedMMMode,setSelectedMMMode]=useState("ks03");
  const [mgViewMode,setMgViewMode]=useState("timeline");
  const [newMM,setNewMM]=useState({name:"",type:"1",parentIds:[],ksStage:null});
  const [manualPos,setManualPos]=useState({});
  const [kolbView,setKolbView]=useState("all");
  const [selectedKolbId,setSelectedKolbId]=useState(null);
  const [kolbLinkSearch,setKolbLinkSearch]=useState("");
  const [ks02SelectedStage,setKs02SelectedStage]=useState(null);

  const [revertModal,setRevertModal]=useState(null);

  const selectedKolb=useMemo(()=>kolbs.find(k=>k.id===selectedKolbId)||null,[kolbs,selectedKolbId]);
  const kolbMap=useMemo(()=>Object.fromEntries(kolbs.map(k=>[k.id,k])),[kolbs]);
  const sessionsByDate=useMemo(()=>{const m={};sessions.forEach(s=>{(m[s.date]=m[s.date]||[]).push(s);});return m;},[sessions]);
  const sirSessionsMap=useMemo(()=>{const m={};sessions.forEach(s=>{(m[s.mmId]=m[s.mmId]||[]).push(s);});Object.keys(m).forEach(k=>{m[k].sort((a,b)=>a.repIndex-b.repIndex);});return m;},[sessions]);
  const mmColor=useCallback((id)=>{const i=mms.findIndex(m=>m.id===id);return i>=0?PALETTE[i%PALETTE.length]:"#6b7280";},[mms]);
  const type2mms=useMemo(()=>mms.filter(m=>m.type==="2"),[mms]);
  const sortedKolbs=useMemo(()=>[...kolbs].sort((a,b)=>b.date.localeCompare(a.date)),[kolbs]);
  const displayKolbs=kolbView==="unlinked"?sortedKolbs.filter(k=>!k.mmId):sortedKolbs;
  const ks02StageMMs=useMemo(()=>ks02SelectedStage?mms.filter(m=>m.ksStage===ks02SelectedStage):[],[mms,ks02SelectedStage]);

  function openMM(id,mode="ks03"){setSelectedMM(id);setSelectedMMMode(mode);}

  function setMMStage(mmId,stage){
    const mm=mmMap[mmId],prevStage=mm?.ksStage;
    if (prevStage==="sir"&&stage!=="sir"){setRevertModal({mmId});return;}
    setMms(p=>p.map(m=>m.id===mmId?{...m,ksStage:stage}:m));
    if (stage==="sir"&&prevStage!=="sir"&&!sessions.filter(s=>s.mmId===mmId).length)
      setSessions(p=>[...p,...SIR_INTERVALS.map((iv,i)=>({id:nid(),mmId,date:addDays(today(),iv),repIndex:i,done:false,skipped:false}))]);
  }
  function revertFromSIR(mmId){setRevertModal({mmId});}
  function doRevert(mmId,stage){
    setSessions(p=>p.filter(s=>s.mmId!==mmId));
    setMms(p=>p.map(m=>m.id===mmId?{...m,ksStage:stage}:m));
    setRevertModal(null);
  }
  function sessionAction(sid,action,newDate){
    setSessions(p=>p.map(s=>s.id!==sid?s:action==="done"?{...s,done:true}:action==="skip"?{...s,skipped:true}:{...s,date:newDate}));
    const mmId=sessions.find(s=>s.id===sid)?.mmId;
    if (mmId&&action==="done"){
      const upd=sessions.map(s=>s.id===sid?{...s,done:true}:s);
      if (upd.filter(s=>s.mmId===mmId).length===5&&upd.filter(s=>s.mmId===mmId).every(s=>s.done))
        setMms(p=>p.map(m=>m.id===mmId?{...m,ksStage:"finished"}:m));
    }
  }
  function addMM(){
    if (!newMM.name.trim()) return;
    const id=nid();
    setMms(p=>[...p,{id,name:newMM.name.trim(),type:newMM.type,parentIds:[...newMM.parentIds],createdAt:today(),currentMG:"",comments:[],links:[],ksStage:newMM.ksStage||null}]);
    if (newMM.ksStage==="sir") setSessions(p=>[...p,...SIR_INTERVALS.map((iv,i)=>({id:nid(),mmId:id,date:addDays(today(),iv),repIndex:i,done:false,skipped:false}))]);
    setNewMM({name:"",type:"1",parentIds:[],ksStage:null});setAddMMModal(false);
  }
  function deleteMMFn(mmId){
    setMms(p=>p.filter(m=>m.id!==mmId).map(m=>({...m,parentIds:(m.parentIds||[]).filter(p=>p!==mmId)})));
    setSessions(p=>p.filter(s=>s.mmId!==mmId));setSelectedMM(null);
  }
  function saveParents(mmId,pids){setMms(p=>p.map(m=>m.id===mmId?{...m,parentIds:pids}:m));}
  function detachChild(childId,parentId){setMms(p=>p.map(m=>m.id===childId?{...m,parentIds:(m.parentIds||[]).filter(x=>x!==parentId)}:m));}
  function addComment(mmId,text){if (!text.trim()) return;setMms(p=>p.map(m=>m.id===mmId?{...m,comments:[...(m.comments||[]),{id:nid(),text:text.trim(),date:today()}]}:m));}
  function removeComment(mmId,cid){setMms(p=>p.map(m=>m.id===mmId?{...m,comments:(m.comments||[]).filter(c=>c.id!==cid)}:m));}
  function addLink(mmId,link){if (!link.url.trim()) return;setMms(p=>p.map(m=>m.id===mmId?{...m,links:[...(m.links||[]),{id:nid(),label:link.label||link.url,url:link.url}]}:m));}
  function removeLink(mmId,lid){setMms(p=>p.map(m=>m.id===mmId?{...m,links:(m.links||[]).filter(l=>l.id!==lid)}:m));}
  function saveKolb(form,mmId){
    const kid=nid();
    const mgValue=(form.mgAdd||form.experiments||"").trim();
    setKolbs(p=>[...p,{id:kid,mmId:mmId||null,...form,date:today()}]);
    if (mmId){const mm=mmMap[mmId];if (mm&&mm.type==="2"&&mgValue){
      setMgChanges(p=>[...p,{id:nid(),mmId,kolbId:kid,oldMG:mm.currentMG||"(none)",newMG:mgValue,experiment:form.experiments||"",date:today()}]);
      setMms(p=>p.map(m=>m.id===mmId?{...m,currentMG:mgValue}:m));
    }}
    setKolbModal(null);
  }
  function linkKolbToMM(kolbId,mmId){
    const k=kolbs.find(k=>k.id===kolbId),mm=mmMap[mmId];
    if (!k||!mm||mm.type!=="2") return;
    const mgValue=(k.mgAdd||k.experiments||"").trim();
    setKolbs(p=>p.map(kb=>kb.id===kolbId?{...kb,mmId}:kb));
    setMgChanges(p=>[...p,{id:nid(),mmId,kolbId,oldMG:mm.currentMG||"(none)",newMG:mgValue,experiment:k.experiments||"",date:today()}]);
    setMms(p=>p.map(m=>m.id===mmId?{...m,currentMG:mgValue}:m));
    setSelectedKolb(null);
  }
  function duplicateKolb(kid,targetMMId){
    const k=kolbMap[kid],mm=mmMap[targetMMId];if (!k||!mm) return;
    const nkid=nid();
    const mgValue=(k.mgAdd||k.experiments||"").trim();
    setKolbs(p=>[...p,{...k,id:nkid,mmId:targetMMId,date:today()}]);
    if (mm.type==="2"&&mgValue){
      setMgChanges(p=>[...p,{id:nid(),mmId:targetMMId,kolbId:nkid,oldMG:mm.currentMG||"(none)",newMG:mgValue,experiment:k.experiments||"",date:today()}]);
      setMms(p=>p.map(m=>m.id===targetMMId?{...m,currentMG:mgValue}:m));
    }
  }

  const {year,month}=calDate;
  const selSessions=selDay?(sessionsByDate[dStr(year,month,selDay)]||[]):[];
  const currentMM=selectedMM?mmMap[selectedMM]:null;

  const mmDetailProps={
    mms,mgChanges,kolbs,mmColor,sirSessionsMap,
    onBack:()=>setSelectedMM(null),onNavigate:(id,mode)=>openMM(id,mode||selectedMMMode),
    onSaveParents:saveParents,onDetachChild:detachChild,
    onAddComment:addComment,onRemoveComment:removeComment,
    onAddLink:addLink,onRemoveLink:removeLink,
    onNewKolb:()=>setKolbModal({mmId:selectedMM}),
    onDupeKolb:duplicateKolb,onSetStage:setMMStage,
    onDelete:deleteMMFn,onSessionAction:sessionAction,onRevertFromSIR:revertFromSIR,
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-mono text-sm select-none">
      <div className="flex items-center justify-between px-3 py-3 bg-gray-900 border-b border-gray-800">
        <span className="text-white font-bold tracking-widest text-xs hidden sm:block">SIR × KS02 × MG</span>
        <div className="flex gap-1">
          {[["calendar","CAL"],["ks02","KS02"],["mg","MG"],["ks03","KS03"],["kolb","KOLB"]].map(([v,l])=>(
            <button key={v} onClick={()=>{setView(v);setSelectedMM(null);setSelectedKolbId(null);setKs02SelectedStage(null);}}
              className={`px-2 py-1 rounded text-xs font-bold transition ${view===v?"bg-white text-gray-950":"text-gray-400 hover:text-white"}`}>{l}</button>
          ))}
        </div>
        <div className="flex gap-1">
          <button onClick={()=>setAddMMModal(true)} className="bg-indigo-700 hover:bg-indigo-600 text-white px-2 py-1 rounded text-xs font-bold">+MM</button>
          <button onClick={()=>setKolbModal({free:true})} className="bg-purple-700 hover:bg-purple-600 text-white px-2 py-1 rounded text-xs font-bold">+Kolb</button>
        </div>
      </div>

      {/* CALENDAR */}
      {view==="calendar"&&(
        <div className="p-4 max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <button onClick={()=>{setCalDate(p=>p.month===0?{year:p.year-1,month:11}:{...p,month:p.month-1});setSelDay(null);}} className="text-gray-400 hover:text-white px-2">◀</button>
            <span className="font-bold tracking-widest">{MONTH_NAMES[month]} {year}</span>
            <button onClick={()=>{setCalDate(p=>p.month===11?{year:p.year+1,month:0}:{...p,month:p.month+1});setSelDay(null);}} className="text-gray-400 hover:text-white px-2">▶</button>
          </div>
          <div className="grid grid-cols-7 mb-1">{["Su","Mo","Tu","We","Th","Fr","Sa"].map(d=><div key={d} className="text-center text-gray-500 text-xs py-1">{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {Array(getFirstDay(year,month)).fill(null).map((_,i)=><div key={`e${i}`}/>)}
            {Array(getDIM(year,month)).fill(null).map((_,i)=>{
              const day=i+1,ds=dStr(year,month,day);
              const active=(sessionsByDate[ds]||[]).filter(s=>!s.done&&!s.skipped);
              const isToday=ds===today(),isSel=selDay===day;
              return (
                <div key={day} onClick={()=>setSelDay(isSel?null:day)}
                  className={`rounded p-1 cursor-pointer min-h-[48px] border transition ${isSel?"border-white":"border-gray-800 hover:border-gray-600"} ${isToday?"bg-gray-800":"bg-gray-900"}`}>
                  <div className={`text-xs mb-1 ${isToday?"text-white font-bold":"text-gray-400"}`}>{day}</div>
                  <div className="flex flex-wrap gap-0.5">
                    {active.slice(0,4).map(s=><div key={s.id} className="w-2 h-2 rounded-full" style={{backgroundColor:mmColor(s.mmId)}}/>)}
                    {active.length>4&&<span className="text-gray-500 text-xs">+{active.length-4}</span>}
                  </div>
                </div>
              );
            })}
          </div>
          {selDay&&(
            <div className="mt-4 bg-gray-900 rounded border border-gray-700 p-3">
              <div className="font-bold mb-2 text-xs tracking-widest text-gray-300">{MONTH_NAMES[month]} {selDay}</div>
              {!selSessions.length&&<div className="text-gray-500 text-xs">No sessions.</div>}
              {selSessions.map(s=>(
                <div key={s.id} onClick={()=>{openMM(s.mmId,"ks03");setView("ks02");}}
                  className="flex items-center justify-between rounded px-3 py-2 mb-1 cursor-pointer hover:opacity-80 bg-emerald-900 text-emerald-200">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{backgroundColor:mmColor(s.mmId)}}/>
                    <span className="font-bold">{mmMap[s.mmId]?.name||"?"}</span>
                  </div>
                  <span className="text-xs opacity-70">rep {s.repIndex+1} · D{SIR_INTERVALS[s.repIndex]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* KS02 */}
      {view==="ks02"&&!selectedMM&&(
        <div className="p-4 max-w-2xl mx-auto">
          <div className="text-xs text-gray-500 mb-2 tracking-widest">KS02 — ENCODING WHEEL</div>
          <KS02Wheel mms={mms} onSelectStage={s=>setKs02SelectedStage(p=>p===s?null:s)} selectedStage={ks02SelectedStage}/>
          {ks02SelectedStage&&(
            <div className="mt-2">
              <div className="text-xs mb-2 font-bold tracking-widest" style={{color:STAGE_RING[ks02SelectedStage]||"#9ca3af"}}>
                {ks02SelectedStage==="sir"?"SIR":`STAGE ${ks02SelectedStage}`} — {ks02StageMMs.length} MM{ks02StageMMs.length!==1?"s":""}
              </div>
              {!ks02StageMMs.length&&<div className="text-gray-600 text-xs text-center py-4">No MMs in this stage.</div>}
              {ks02StageMMs.map(mm=>(
                <div key={mm.id} onClick={()=>openMM(mm.id,"ks03")} className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded px-3 py-2 mb-1 cursor-pointer hover:border-gray-600">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{backgroundColor:mm.type==="1"?"#ef4444":mmColor(mm.id)}}/>
                    <span className="font-bold text-sm">{mm.name}</span>
                    <span className="text-xs text-gray-500">T{mm.type}</span>
                    {mm.ksStage==="sir"&&(()=>{const s=sirSessionsMap[mm.id]||[];return <span className="text-xs text-emerald-400">{s.filter(x=>x.done).length}/5 reps</span>;})()}
                  </div>
                  <span className="text-gray-500 text-xs">→</span>
                </div>
              ))}
            </div>
          )}
          {mms.filter(m=>m.ksStage==="finished").length>0&&(
            <div className="mt-4">
              <div className="text-xs font-bold tracking-widest mb-2 text-gray-400">FINISHED</div>
              {mms.filter(m=>m.ksStage==="finished").map(mm=>(
                <div key={mm.id} onClick={()=>openMM(mm.id,"ks03")} className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded px-3 py-2 mb-1 cursor-pointer hover:border-gray-500 opacity-60">
                  <div className="w-2 h-2 rounded-full" style={{backgroundColor:mmColor(mm.id)}}/>
                  <span className="text-sm">{mm.name}</span>
                  <span className="text-xs text-gray-500 ml-auto">✓</span>
                </div>
              ))}
            </div>
          )}
          {mms.filter(m=>!m.ksStage).length>0&&(
            <div className="mt-4">
              <div className="text-xs text-gray-600 mb-2 tracking-widest">UNASSIGNED</div>
              {mms.filter(m=>!m.ksStage).map(mm=>(
                <div key={mm.id} onClick={()=>openMM(mm.id,"ks03")} className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded px-3 py-2 mb-1 cursor-pointer hover:border-gray-600 opacity-40">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{backgroundColor:mm.type==="1"?"#ef4444":mmColor(mm.id)}}/>
                    <span className="text-sm">{mm.name}</span>
                  </div>
                  <span className="text-gray-500 text-xs">assign →</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {view==="ks02"&&selectedMM&&currentMM&&<MMDetail mm={currentMM} {...mmDetailProps} initialMode={selectedMMMode}/>}

      {/* MG */}
      {view==="mg"&&!selectedMM&&(
        <div className="flex flex-col" style={{height:"calc(100vh - 52px)"}}>
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 shrink-0">
            <div className="text-xs text-gray-500 tracking-widest">MG — MARGINAL GAINS</div>
            <div className="flex gap-1">
              {[["timeline","TIMELINE"],["multiverse","MULTIVERSE"]].map(([m,l])=>(
                <button key={m} onClick={()=>setMgViewMode(m)} className={`px-3 py-1 rounded text-xs font-bold ${mgViewMode===m?"bg-white text-gray-950":"text-gray-400 hover:text-white"}`}>{l}</button>
              ))}
            </div>
          </div>
          {mgViewMode==="timeline"&&<MGTimeline mms={mms} mgChanges={mgChanges} mmColor={mmColor} onSelectMM={id=>openMM(id,"mg")}/>}
          {mgViewMode==="multiverse"&&<MultiverseCanvas mms={mms} mgChanges={mgChanges} manualPos={manualPos} setManualPos={setManualPos} onOpen={id=>openMM(id,"mg")} mmColor={mmColor}/>}
        </div>
      )}
      {view==="mg"&&selectedMM&&currentMM&&<MMDetail mm={currentMM} {...mmDetailProps} initialMode="mg"/>}

      {/* KS03 */}
      {view==="ks03"&&!selectedMM&&(
        <div className="flex flex-col" style={{height:"calc(100vh - 52px)"}}>
          <div className="px-4 py-2 border-b border-gray-800 shrink-0"><div className="text-xs text-gray-500 tracking-widest">KS03 — MIND MAP STORAGE</div></div>
          <MultiverseCanvas mms={mms} mgChanges={mgChanges} manualPos={manualPos} setManualPos={setManualPos} onOpen={id=>openMM(id,"ks03")} mmColor={mmColor}/>
        </div>
      )}
      {view==="ks03"&&selectedMM&&currentMM&&<MMDetail mm={currentMM} {...mmDetailProps} initialMode="ks03"/>}

      {/* KOLB */}
      {view==="kolb"&&!selectedKolb&&(
        <div className="p-4 max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs text-gray-500 tracking-widest">KOLB — ALL ENTRIES</div>
            <div className="flex gap-1">
              {[["all","ALL"],["unlinked","UNLINKED"]].map(([v,l])=>(
                <button key={v} onClick={()=>setKolbView(v)} className={`px-3 py-1 rounded text-xs font-bold ${kolbView===v?"bg-white text-gray-950":"text-gray-400 hover:text-white"}`}>{l}</button>
              ))}
            </div>
          </div>
          {!displayKolbs.length&&<div className="text-gray-600 text-center py-10 text-xs">No Kolbs yet.</div>}
          {displayKolbs.map(k=>{
            const mm=k.mmId?mmMap[k.mmId]:null,hasMG=mgChanges.some(c=>c.kolbId===k.id);
            return (
              <div key={k.id} onClick={()=>setSelectedKolbId(k.id)} className="bg-gray-900 border border-gray-800 hover:border-gray-600 rounded px-4 py-3 mb-2 cursor-pointer">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {mm?(<><div className="w-2 h-2 rounded-full" style={{backgroundColor:mmColor(mm.id)}}/><span className="text-xs text-gray-300">{mm.name}</span></>):<span className="text-xs text-gray-500 italic">unlinked</span>}
                    {hasMG&&<span className="text-xs bg-emerald-900 text-emerald-300 px-1.5 py-0.5 rounded">MG</span>}
                  </div>
                  <span className="text-xs text-gray-500">{k.date}</span>
                </div>
                <div className="text-xs text-gray-300 truncate">{k.experience||"(no experience noted)"}</div>
                {k.experiments&&<div className="text-xs text-emerald-300 truncate mt-0.5">→ {k.experiments}</div>}
              </div>
            );
          })}
        </div>
      )}
      {view==="kolb"&&selectedKolb&&(()=>{
        const k=selectedKolb,mm=k.mmId?mmMap[k.mmId]:null,hasMG=mgChanges.some(c=>c.kolbId===k.id);
        const filteredT2=type2mms.filter(m=>m.name.toLowerCase().includes(kolbLinkSearch.toLowerCase()));
        return (
          <KolbEditView
            kolb={k} mm={mm} hasMG={hasMG} filteredT2={filteredT2}
            kolbLinkSearch={kolbLinkSearch} setKolbLinkSearch={setKolbLinkSearch}
            mmColor={mmColor}
            onBack={()=>setSelectedKolb(null)}
            onSave={(updated)=>{
              const mgValue=(updated.mgAdd||updated.experiments||"").trim();
              setKolbs(p=>p.map(kb=>kb.id===k.id?{...kb,...updated}:kb));
              // if MM linked and T2, update MG chain
              if (updated.mmId&&mmMap[updated.mmId]?.type==="2"&&mgValue&&updated.mmId!==k.mmId){
                // newly linked
                const targetMM=mmMap[updated.mmId];
                setMgChanges(p=>[...p,{id:nid(),mmId:updated.mmId,kolbId:k.id,oldMG:targetMM.currentMG||"(none)",newMG:mgValue,experiment:updated.experiments||"",date:k.date}]);
                setMms(p=>p.map(m=>m.id===updated.mmId?{...m,currentMG:mgValue}:m));
              } else if (updated.mmId&&mmMap[updated.mmId]?.type==="2"&&mgValue&&updated.mmId===k.mmId){
                // already linked, update existing mgChange for this kolb
                setMgChanges(p=>p.map(c=>c.kolbId===k.id?{...c,newMG:mgValue,experiment:updated.experiments||""}:c));
                // update MM currentMG only if this was the latest change
                const mmChanges=mgChanges.filter(c=>c.mmId===updated.mmId).sort((a,b)=>b.date.localeCompare(a.date));
                if (!mmChanges.length||mmChanges[0].kolbId===k.id)
                  setMms(p=>p.map(m=>m.id===updated.mmId?{...m,currentMG:mgValue}:m));
              }
              setSelectedKolb({...k,...updated});
            }}
          />
        );
      })()}

      {/* ADD MM */}
      {addMMModal&&(
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-5 w-full max-w-sm my-4">
            <div className="font-bold mb-4 tracking-widest text-xs">NEW MIND MAP</div>
            <input value={newMM.name} onChange={e=>setNewMM(p=>({...p,name:e.target.value}))} placeholder="MM name"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 mb-3 text-white placeholder-gray-600 text-sm"/>
            <div className="flex gap-2 mb-3">
              {["1","2"].map(t=>(
                <button key={t} onClick={()=>setNewMM(p=>({...p,type:t}))}
                  className={`flex-1 py-2 rounded text-xs font-bold ${newMM.type===t?"bg-white text-gray-950":"bg-gray-800 text-gray-400"}`}>
                  T{t} {t==="1"?"Anchor":"MG"}
                </button>
              ))}
            </div>
            <div className="mb-3">
              <div className="text-xs text-gray-400 mb-1">KS02 Stage:</div>
              <div className="flex gap-1 flex-wrap">
                {[null,...STAGE_KEYS].map(s=>(
                  <button key={String(s)} onClick={()=>setNewMM(p=>({...p,ksStage:s}))}
                    className={`px-2 py-1 rounded text-xs font-bold ${newMM.ksStage===s?(s?STAGE_COLORS[s]:"bg-gray-600 text-white"):"bg-gray-800 text-gray-500 hover:bg-gray-700"}`}>
                    {s===null?"—":s==="sir"?"SIR":`S${s}`}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-1 text-xs text-gray-400">Parent MM:</div>
            <div className="max-h-32 overflow-y-auto space-y-0.5 mb-3">
              <button onClick={()=>setNewMM(p=>({...p,parentIds:[]}))} className={`w-full text-left text-xs px-3 py-1.5 rounded ${newMM.parentIds.length===0?"bg-gray-600 text-white":"bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>No parent (root)</button>
              {mms.map(m=>(
                <button key={m.id} onClick={()=>setNewMM(p=>({...p,parentIds:p.parentIds.includes(m.id)?p.parentIds.filter(x=>x!==m.id):[...p.parentIds,m.id]}))}
                  className={`w-full text-left text-xs px-3 py-1.5 rounded flex items-center gap-2 ${newMM.parentIds.includes(m.id)?"bg-indigo-800 text-white":"bg-gray-800 text-gray-300 hover:bg-gray-700"}`}>
                  <div className="w-2 h-2 rounded-full shrink-0" style={{backgroundColor:m.type==="1"?"#ef4444":mmColor(m.id)}}/>
                  <span className="truncate">{m.name}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={addMM} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded font-bold text-xs">ADD</button>
              <button onClick={()=>setAddMMModal(false)} className="flex-1 bg-gray-800 text-gray-300 py-2 rounded text-xs">CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {kolbModal&&<KolbForm mmOptions={type2mms} initialMMId={kolbModal.mmId||null} onSave={saveKolb} onCancel={()=>setKolbModal(null)}/>}

      {revertModal&&(
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-5 w-full max-w-sm">
            <div className="font-bold mb-1 tracking-widest text-xs text-red-400">REVERT FROM SIR</div>
            <div className="text-gray-300 mb-4 text-sm">Send <span className="font-bold text-white">{mmMap[revertModal.mmId]?.name}</span> back to:</div>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[1,2,3,4].map(s=>(
                <button key={s} onClick={()=>doRevert(revertModal.mmId,s)}
                  className={`py-3 rounded font-bold text-sm ${STAGE_COLORS[s]} hover:opacity-80`}>S{s}</button>
              ))}
            </div>
            <button onClick={()=>setRevertModal(null)} className="w-full text-gray-500 hover:text-white text-xs py-1">CANCEL</button>
          </div>
        </div>
      )}
    </div>
  );
}
