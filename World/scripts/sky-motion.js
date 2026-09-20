(function (root) {
  'use strict';
  // Presentation only: never changes the canonical KS03 graph. User-selected
  // settings: 40° fitted span, 1× direct dragging, 20°/s held arrow rotation.
  const tuning=Object.freeze({span:40*Math.PI/180,dragGain:1,keySpeed:20*Math.PI/180});
  const identity=()=>[0,0,0,1];
  const normalize=v=>{const length=Math.hypot(...v);return v.map(n=>n/length);};
  function multiply(a,b) {
    const [x,y,z,w]=a,[X,Y,Z,W]=b;
    return normalize([w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z]);
  }
  const inverse=q=>[-q[0],-q[1],-q[2],q[3]];
  function turn(a,b) {
    const dot=a.reduce((sum,n,i)=>sum+n*b[i],0);
    if(dot<-.999999) {
      const axis=Math.abs(a[0])<.9?[1,0,0]:[0,0,1];
      return [...normalize([a[1]*axis[2]-a[2]*axis[1],a[2]*axis[0]-a[0]*axis[2],a[0]*axis[1]-a[1]*axis[0]]),0];
    }
    return normalize([a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0],1+dot]);
  }
  function apply(q,v) {
    const [x,y,z,w]=q,[X,Y,Z]=v;
    const tx=2*(y*Z-z*Y),ty=2*(z*X-x*Z),tz=2*(x*Y-y*X);
    return [X+w*tx+y*tz-z*ty,Y+w*ty+z*tx-x*tz,Z+w*tz+x*ty-y*tx];
  }
  const scale=bounds=>2*Math.tan(tuning.span/2)/Math.max(bounds.width,bounds.height);
  function direction(x,y,bounds) {
    const k=scale(bounds);
    return normalize([(x-bounds.x-bounds.width/2)*k,1,(y-bounds.y-bounds.height/2)*k]);
  }
  function optics(view,bounds,viewport) {
    const focal=1/(scale(bounds)*Math.max(view.width/viewport.width,view.height/viewport.height));
    const ray=(x,y)=>normalize([(x-viewport.screenWidth/2)/focal,1,(y-viewport.screenHeight/2)/focal]);
    const framing=turn([0,1,0],ray(viewport.x+viewport.width/2,viewport.y+viewport.height/2));
    return {focal,framing,ray,fov:2*Math.atan(viewport.screenHeight/(2*focal))};
  }
  function rotate(view,bounds,viewport,delta) {
    const {framing}=optics(view,bounds,viewport);
    return {...view,rotation:multiply(inverse(framing),multiply(delta,multiply(framing,view.rotation)))};
  }
  function drag(view,bounds,viewport,from,to) {
    const {ray}=optics(view,bounds,viewport);
    return rotate(view,bounds,viewport,turn(ray(from.x,from.y),ray(from.x+(to.x-from.x)*tuning.dragGain,from.y+(to.y-from.y)*tuning.dragGain)));
  }
  function arrows(view,bounds,viewport,x,y,seconds) {
    const length=Math.hypot(x,y);if(!length)return view;
    const half=tuning.keySpeed*seconds/2,s=Math.sin(half)/length;
    return rotate(view,bounds,viewport,[y*s,0,-x*s,Math.cos(half)]);
  }
  function focus(view,node,bounds) {
    const left=Math.min(node.x-node.radius-23,node.label.x),right=Math.max(node.x+node.radius+23,node.label.x+240);
    const top=Math.min(node.y-node.radius-23,node.label.y),bottom=Math.max(node.y+node.radius+23,node.label.y+105);
    const ratio=Math.max(1,(right-left+48)/view.width,(bottom-top+48)/view.height);
    return {...view,width:view.width*ratio,height:view.height*ratio,
      rotation:turn(direction((left+right)/2,(top+bottom)/2,bounds),[0,1,0])};
  }
  const api={tuning,identity,multiply,apply,direction,scale,optics,drag,arrows,focus};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WorldSkyMotion=api;
})(typeof window!=='undefined'?window:globalThis);
