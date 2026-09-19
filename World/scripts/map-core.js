(function(root){
  'use strict';
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const scale=(view,width,height)=>Math.min(width,height)/90*view.zoom;
  function project(point,view,width,height){const s=scale(view,width,height);return {x:width/2+(point.x-view.x)*s,y:height/2-(point.z-view.z)*s};}
  function unproject(point,view,width,height){const s=scale(view,width,height);return {x:view.x+(point.x-width/2)/s,z:view.z-(point.y-height/2)/s};}
  function locator(target,player){
    if(!target)return null;
    const dx=target.x-player.x,dz=target.z-player.z;
    const height=Number.isFinite(target.y)&&Number.isFinite(player.y)?target.y-player.y:0;
    const distance=Math.hypot(dx,height,dz);
    const bearing=Math.atan2(dx,dz),delta=bearing-player.yaw;
    return {distance,height,angle:Math.atan2(Math.sin(delta),Math.cos(delta)),bearing,arrived:distance<2};
  }
  // Authored destinations for THIS synthetic fixture, independent of Track records.
  // Unknown quests stay unmapped. A missing MM cannot lead to a replacement star.
  function questDestination(item,landmarks){
    let id=null;
    if(item.kind==='learn')id=item.mm&&[101,102,103].includes(item.mm.id)?'grove':null;
    else id=({'task-observe':'grove','task-cloud':'terrace','goal-water':'bridge','task-ripple':'bridge','routine-sketch':'bridge'})[item.node.id];
    return landmarks.find(place=>place.id===id)||null;
  }
  const api={clamp,scale,project,unproject,locator,questDestination};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WorldMapCore=api;
})(typeof window!=='undefined'?window:globalThis);
