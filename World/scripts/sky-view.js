(function () {
  'use strict';
  window.createWorldSkyView=function (select,changeView) {
    const $=id=>document.getElementById(id),map=$('sky-map');
    let graph={nodes:[],edges:[],bounds:{x:0,y:0,width:720,height:520}},view,drag=null,wasDrag=false,ready=false;
    const targets=new Map();
    function paint(){
      if(!view)return;
      const rect=map.getBoundingClientRect();
      changeView(graph,{...view},{x:rect.x,y:rect.y,width:rect.width,height:rect.height,screenWidth:innerWidth,screenHeight:innerHeight});
    }
    function fit(){view={...graph.bounds};paint();}
    function zoom(factor) {
      const width=Math.max(graph.bounds.width/8,Math.min(graph.bounds.width*2,view.width*factor)),ratio=width/view.width;
      view={x:view.x+(view.width-width)/2,y:view.y+view.height*(1-ratio)/2,width,height:view.height*ratio};paint();
    }
    function focusNode(node) {
      view={...view,x:node.x-view.width/2,y:node.y-view.height/2};paint();
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
          if(node.label.x<view.x||node.label.x+240>view.x+view.width||node.label.y<view.y||node.label.y+105>view.y+view.height)focusNode(node);
        });
        targets.set(node.id,{star,label});map.append(star);
      }
      if(!graph.nodes.length){const empty=document.createElement('p');empty.className='sky-empty';empty.textContent='No mind maps in this workspace.';map.append(empty);}
      if(reset||!view)fit();else paint();search();
    }
    function frame(state) {
      ready=state.phase==='viewing';
      $('sky-view').dataset.phase=state.phase;
      $('sky-description').textContent=ready?'Select a star to read its mind map. Petals mark today’s reviews.':'Looking up into the Grove’s sky…';
      for(const node of [map,document.querySelector('.sky-tools'),$('sky-results')])node.inert=!ready;
      for(const point of state.points) {
        const target=targets.get(point.id);if(!target)continue;
        const {star,label}=target;
        star.hidden=!ready||point.z<0||point.z>1;
        if(!ready)continue;
        star.style.left=point.x+'px';star.style.top=point.y+'px';
        label.style.left=(point.label.x-point.x+22)+'px';label.style.top=(point.label.y-point.y+22)+'px';
        label.style.width=Math.max(110,Math.min(230,point.labelWidth))+'px';
      }
    }
    map.addEventListener('pointerdown',event=>{
      if(!ready||event.button!==0)return;
      wasDrag=false;drag={id:event.pointerId,x:event.clientX,y:event.clientY};
    });
    window.addEventListener('pointermove',event=>{
      if(!drag||event.pointerId!==drag.id)return;
      if(!(event.buttons&1)){drag=null;return;}
      const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
      if(!wasDrag&&Math.abs(dx)+Math.abs(dy)<5)return;
      if(!wasDrag){wasDrag=true;map.setPointerCapture(drag.id);}
      const rect=map.getBoundingClientRect(),unit=Math.max(view.width/rect.width,view.height/rect.height);
      view.x-=dx*unit;view.y-=dy*unit;drag.x=event.clientX;drag.y=event.clientY;paint();
    });
    function endDrag(event){if(!drag||drag.id!==event.pointerId)return;drag=null;if(map.hasPointerCapture(event.pointerId))map.releasePointerCapture(event.pointerId);}
    window.addEventListener('pointerup',endDrag);window.addEventListener('pointercancel',endDrag);
    window.addEventListener('blur',()=>{drag=null;});
    map.addEventListener('wheel',event=>{if(!ready)return;event.preventDefault();zoom(event.deltaY>0?1.15:1/1.15);},{passive:false});
    map.addEventListener('keydown',event=>{
      if(!ready)return;
      const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
      if(delta){event.preventDefault();view.x+=delta[0]*view.width*.1;view.y+=delta[1]*view.height*.1;paint();}
      else if(event.key==='Home'){event.preventDefault();fit();}
      else if(event.key==='+'||event.key==='='){event.preventDefault();zoom(1/1.25);}
      else if(event.key==='-'){event.preventDefault();zoom(1.25);}
    });
    $('sky-in').addEventListener('click',()=>zoom(1/1.25));$('sky-out').addEventListener('click',()=>zoom(1.25));
    $('sky-fit').addEventListener('click',fit);$('sky-find').addEventListener('input',search);
    new ResizeObserver(paint).observe(map);
    return {render,frame,snapshot:()=>({view:{...view},nodes:graph.nodes.map(node=>({...node,label:{...node.label}})),edges:graph.edges.map(edge=>({...edge}))})};
  };
})();
