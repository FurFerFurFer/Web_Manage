(function () {
  'use strict';
  window.createWorldSkyView=function (select,changeView) {
    const $=id=>document.getElementById(id),map=$('sky-map'),Motion=window.WorldSkyMotion;
    let graph={nodes:[],edges:[],bounds:{x:0,y:0,width:720,height:520}},view,drag=null,wasDrag=false,ready=false;
    const targets=new Map(),held=new Set();let keyFrame=0,keyTime=0;
    function viewport(){const rect=map.getBoundingClientRect();return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,screenWidth:innerWidth,screenHeight:innerHeight};}
    const available=()=>ready&&!document.hidden&&!$('sky-view').hidden&&!$('sky-view').inert;
    function stopDrag(){if(drag&&map.hasPointerCapture(drag.id))map.releasePointerCapture(drag.id);drag=null;}
    function paint(){
      if(!view)return;
      changeView(graph,{...view},viewport());
    }
    function fit(){view={...graph.bounds,rotation:Motion.identity()};paint();}
    function zoom(factor) {
      const width=Math.max(graph.bounds.width/8,Math.min(graph.bounds.width*2,view.width*factor)),ratio=width/view.width;
      view={...view,width,height:view.height*ratio};paint();
    }
    function focusNode(node) {
      view=Motion.focus(view,node,graph.bounds);paint();
    }
    function stopKeys(){held.clear();cancelAnimationFrame(keyFrame);keyFrame=0;}
    function keyStep(time) {
      keyFrame=0;
      if(!available()||!held.size||!map.contains(document.activeElement)){stopKeys();return;}
      const seconds=Math.min(.1,(time-keyTime)/1000);keyTime=time;
      view=Motion.arrows(view,graph.bounds,viewport(),Number(held.has('ArrowRight'))-Number(held.has('ArrowLeft')),
        Number(held.has('ArrowDown'))-Number(held.has('ArrowUp')),seconds);paint();
      keyFrame=requestAnimationFrame(keyStep);
    }
    function reviewText(node){return node.pending?node.pending+' review'+(node.pending===1?'':'s')+' due'+(node.reviewed?' · '+node.reviewed+' reviewed':''):node.reviewed?node.reviewed+' reviewed':'No reviews today';}
    function search() {
      const query=$('sky-find').value.trim().toLocaleLowerCase(),host=$('sky-results');
      host.replaceChildren();host.hidden=!query;if(!query)return;
      const matches=graph.nodes.filter(node=>node.name.toLocaleLowerCase().includes(query));
      if(!matches.length)host.textContent='No matching mind maps.';
      for(const node of matches) {
        const button=document.createElement('button');button.className='secondary';button.textContent=node.name;
        button.addEventListener('click',()=>{focusNode(node);select(node.index);});host.append(button);
      }
    }
    function render(next,reset=false) {
      graph=next;map.replaceChildren();targets.clear();
      if(reset){ready=false;$('sky-view').dataset.phase='entering';}
      for(const node of graph.nodes) {
        // Transparent hit targets and readable labels follow the projected scene
        // stars. Star light, petals and connections are drawn only by Babylon.
        const star=document.createElement('button');star.className='sky-target';star.dataset.skyMm=node.id;
        star.hidden=true;
        star.setAttribute('aria-label',node.name+' · '+reviewText(node));
        const label=document.createElement('span');label.className='sky-star-label';label.setAttribute('aria-hidden','true');
        const name=document.createElement('strong');name.textContent=node.name;
        const status=document.createElement('small');status.textContent=(node.pending?'✿ ':node.reviewed?'✓ ':'')+reviewText(node);
        label.append(name,status);star.append(label);
        star.addEventListener('click',()=>{if(ready&&!wasDrag)select(node.index);});
        star.addEventListener('keydown',event=>{
          if(ready&&(event.key==='Enter'||event.key===' ')){event.preventDefault();event.stopPropagation();select(node.index);}
        });
        star.addEventListener('focus',()=>{
          const box=map.getBoundingClientRect(),hit=star.getBoundingClientRect(),text=label.getBoundingClientRect();
          if(star.style.opacity==='0'||label.style.visibility==='hidden'||[hit,text].some(rect=>rect.left<box.left||rect.right>box.right||rect.top<box.top||rect.bottom>box.bottom))focusNode(node);
        });
        targets.set(node.id,{star,label});map.append(star);
      }
      if(!graph.nodes.length){const empty=document.createElement('p');empty.className='sky-empty';empty.textContent='No mind maps in this workspace.';map.append(empty);}
      if(reset||!view)fit();else paint();search();
    }
    function frame(state) {
      ready=state.phase==='viewing';if(!available()){stopKeys();stopDrag();}
      $('sky-view').dataset.phase=state.phase;
      $('sky-description').textContent=ready?'Select a star to read its mind map. Petals mark today’s reviews.':'Looking up into the Grove’s sky…';
      for(const node of [map,document.querySelector('.sky-tools'),$('sky-results')])node.inert=!ready;
      for(const point of state.points) {
        const target=targets.get(point.id);if(!target)continue;
        const {star,label}=target;
        star.hidden=!ready;
        if(!ready)continue;
        const visible=point.front&&point.z>=0&&point.z<=1&&Number.isFinite(point.x)&&Number.isFinite(point.y);
        // Keep off-sky identities in Tab order. Their focus handler turns them
        // back into view; invisible projections never intercept pointer clicks.
        star.style.opacity=visible?'1':'0';star.style.pointerEvents=visible?'':'none';
        star.style.left=(visible?point.x:-88)+'px';star.style.top=(visible?point.y:0)+'px';
        label.style.visibility=visible&&point.label.front?'':'hidden';
        label.style.left=(point.label.x-point.x+22)+'px';label.style.top=(point.label.y-point.y+22)+'px';
        label.style.width=Math.max(110,Math.min(230,point.labelWidth))+'px';
      }
    }
    map.addEventListener('pointerdown',event=>{
      if(!available()||event.button!==0)return;
      wasDrag=false;drag={id:event.pointerId,x:event.clientX,y:event.clientY};
    });
    window.addEventListener('pointermove',event=>{
      if(!drag||event.pointerId!==drag.id)return;
      if(!available()||!(event.buttons&1)){stopDrag();return;}
      const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
      if(!wasDrag&&Math.abs(dx)+Math.abs(dy)<5)return;
      if(!wasDrag){wasDrag=true;map.setPointerCapture(drag.id);}
      view=Motion.drag(view,graph.bounds,viewport(),drag,{x:event.clientX,y:event.clientY});
      drag.x=event.clientX;drag.y=event.clientY;paint();
    });
    function endDrag(event){if(!drag||drag.id!==event.pointerId)return;stopDrag();}
    window.addEventListener('pointerup',endDrag);window.addEventListener('pointercancel',endDrag);
    window.addEventListener('blur',()=>{stopDrag();stopKeys();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){stopDrag();stopKeys();}});
    window.addEventListener('keyup',event=>{held.delete(event.key);if(!held.size)stopKeys();});
    map.addEventListener('focusout',event=>{if(!map.contains(event.relatedTarget))stopKeys();});
    map.addEventListener('wheel',event=>{if(!ready)return;event.preventDefault();zoom(event.deltaY>0?1.15:1/1.15);},{passive:false});
    map.addEventListener('keydown',event=>{
      if(!ready)return;
      const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
      if(delta){event.preventDefault();held.add(event.key);if(!keyFrame){keyTime=performance.now();keyFrame=requestAnimationFrame(keyStep);}}
      else if(event.key==='Home'){event.preventDefault();stopKeys();fit();}
      else if(event.key==='+'||event.key==='='){event.preventDefault();zoom(1/1.25);}
      else if(event.key==='-'){event.preventDefault();zoom(1.25);}
    });
    $('sky-in').addEventListener('click',()=>zoom(1/1.25));$('sky-out').addEventListener('click',()=>zoom(1.25));
    $('sky-fit').addEventListener('click',fit);$('sky-find').addEventListener('input',search);
    new ResizeObserver(paint).observe(map);
    return {render,frame,snapshot:()=>({view:{...view,rotation:view?[...view.rotation]:Motion.identity()},nodes:graph.nodes.map(node=>({...node,label:{...node.label}})),edges:graph.edges.map(edge=>({...edge}))})};
  };
})();
