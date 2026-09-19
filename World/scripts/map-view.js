(function(){
  'use strict';
  window.createWorldMapView=function({el,button,announce,openMap,resolveSurface,onDestination}){
    const Core=window.WorldMapCore;
    const symbols={path:'◇',clock:'◷',star:'✧',bridge:'═',leaf:'❧',gate:'Π',pin:'◆',flag:'⚑',launch:'↑',island:'◇'};
    let atlas={features:[],landmarks:[]},player={x:0,y:0,z:-6,facing:0,yaw:0};
    let view={x:0,z:7,zoom:1},pins=[],nextPin=1,target=null,selected=null,draft=null;
    let host=null,area=null,surface=null,markers=null,details=null,markerNodes=[],observer=null;
    const filters={landmarks:true,pins:true};
    const mini=document.getElementById('minimap-canvas'),locator=document.getElementById('destination-locator'),waypoint=document.getElementById('world-destination');
    let miniVisible=false,showWorld=false;
    const distanceText=place=>{const cue=Core.locator(place,player);return cue.arrived?'At destination':Math.round(cue.distance)+' m away'+(Math.abs(cue.height)>=2?' · '+(cue.height>0?'↑ ':'↓ ')+Math.abs(cue.height).toFixed(1)+' m':'');};
    const places=()=>[...atlas.landmarks,...pins];
    const selectedPlace=()=>places().find(p=>p.id===selected)||null;
    function fittedView(){
      const terrain=atlas.features.filter(f=>f.name==='garden-floor'||f.name.startsWith('floating-island-'));
      if(!terrain.length)return {x:0,z:7,zoom:1};
      const left=Math.min(...terrain.map(f=>f.x-f.width/2)),right=Math.max(...terrain.map(f=>f.x+f.width/2));
      const bottom=Math.min(...terrain.map(f=>f.z-f.depth/2)),top=Math.max(...terrain.map(f=>f.z+f.depth/2));
      return {x:(left+right)/2,z:(bottom+top)/2,zoom:Math.min(1,90/(Math.max(right-left,top-bottom)+12))};
    }
    function setTarget(place){target=place?{...place}:null;player.destination=null;onDestination(target);updateWaypoint();}
    function navigate(place){setTarget(place);announce('Navigating to '+place.name+'. Close the map to follow its marker.');draw();}
    function stop(){setTarget(null);announce('Navigation stopped.');draw();if(details)renderDetails();}
    function selectPlace(place){draft=null;selected=place.id;}
    function goTo(place){selectPlace(place);view={x:place.x,z:place.z,zoom:2};openMap();}
    function setupCanvas(canvas){
      const rect=canvas.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,2);
      if(!rect.width||!rect.height)return null;
      const w=Math.round(rect.width*ratio),h=Math.round(rect.height*ratio);
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      const ctx=canvas.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);
      ctx.clearRect(0,0,rect.width,rect.height);return {ctx,width:rect.width,height:rect.height};
    }
    function paint(canvas,camera,small=false){
      const setup=setupCanvas(canvas);if(!setup)return;
      const {ctx,width,height}=setup,s=Core.scale(camera,width,height);
      ctx.fillStyle='#689f9f';ctx.fillRect(0,0,width,height);
      // Terrain is measured from the scene, with a quiet cartographic palette.
      for(const f of atlas.features){
        const p=Core.project(f,camera,width,height);
        ctx.fillStyle=f.name==='garden-floor'||f.name.startsWith('floating-island-')?'#acc28e':f.name.startsWith('crown-')?'#648c6a':f.name==='stream'?'#6eaab2':f.name==='clock-plinth'||f.name.startsWith('launch-pad-')?'#bba065':'#e5dec0';
        ctx.strokeStyle=f.name==='garden-floor'?'#d9d9ac':'#668567';ctx.lineWidth=f.name==='garden-floor'?3:1;
        ctx.beginPath();if(f.round)ctx.ellipse(p.x,p.y,f.width*s/2,f.depth*s/2,0,0,Math.PI*2);
        else ctx.rect(p.x-f.width*s/2,p.y-f.depth*s/2,f.width*s,f.depth*s);
        ctx.fill();if(f.name==='garden-floor'||f.name==='plaza-base')ctx.stroke();
      }
      if(!small){
        ctx.fillStyle='#264d45';ctx.textAlign='center';ctx.font='italic 19px Georgia, serif';
        const p=Core.project({x:0,z:-20},camera,width,height);ctx.fillText('Clockgarden',p.x,p.y);
      }
      if(small){
        for(const place of places()){
          const p=Core.project(place,camera,width,height);
          if(Math.hypot(p.x-width/2,p.y-height/2)>width/2-12)continue;
          ctx.fillStyle='#faf7e9';ctx.strokeStyle='#345e53';
          ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.fill();ctx.stroke();
          ctx.fillStyle='#244c4b';ctx.font='11px Georgia,serif';ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.fillText(symbols[place.icon]||symbols.pin,p.x,p.y);ctx.textBaseline='alphabetic';
        }
      }
      if(target){
        let p=Core.project(target,camera,width,height);
        if(small){const dx=p.x-width/2,dy=p.y-height/2,d=Math.hypot(dx,dy),r=width/2-12;if(d>r)p={x:width/2+dx/d*r,y:height/2+dy/d*r};}
        ctx.strokeStyle='#fff2b1';ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x,p.y,small?8:22,0,Math.PI*2);ctx.stroke();
      }
      const p=Core.project(player,camera,width,height);
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(player.yaw);ctx.fillStyle='#fffdf0';ctx.strokeStyle='#244c4b';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(0,-11);ctx.lineTo(7,8);ctx.lineTo(0,4);ctx.lineTo(-7,8);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
    }
    function draw(){
      mini.dataset.heading=String(player.yaw);
      if(!mini.parentElement.hidden)paint(mini,{x:player.x,z:player.z,zoom:2.7},true);
      locator.hidden=!target;
      if(target){
        const cue=Core.locator(target,player);
        document.getElementById('destination-arrow').style.transform='rotate('+cue.angle+'rad)';
        document.getElementById('destination-name').textContent=target.name;
        document.getElementById('destination-distance').textContent=distanceText(target);
      }
      if(!host?.isConnected)return;
      paint(surface,view);
      const {width,height}=area.getBoundingClientRect();
      const playerPoint=Core.project(player,view,width,height),playerMarker=host.querySelector('.map-player');
      playerMarker.style.left=playerPoint.x+'px';playerMarker.style.top=playerPoint.y+'px';
      playerMarker.style.transform='translate(-50%,-50%) rotate('+player.yaw+'rad)';
      syncPreview(width,height);
      for(const {node,place} of markerNodes){
        const p=Core.project(place,view,width,height);
        node.hidden=p.x<22||p.x>width-22||p.y<22||p.y>height-22;
        node.style.left=p.x+'px';node.style.top=p.y+'px';
        node.setAttribute('aria-pressed',String(place.id===selected));
      }
      const readout=host.querySelector('#map-scale');if(readout)readout.textContent=Math.round(view.zoom*100)+'% · North ↑';
      const dist=host.querySelector('#map-distance');if(dist&&selectedPlace())dist.textContent=distanceText(selectedPlace());
      const stopButton=host.querySelector('#map-stop');if(stopButton)stopButton.hidden=!target;
      const nav=host.querySelector('#map-navigate');if(nav)nav.textContent=target?.id===selected?'Navigating · stop':'Navigate';
    }
    function syncPreview(width,height){
      let preview=area.querySelector('#map-pin-preview');
      if(!draft){preview?.remove();return;}
      if(!preview){preview=el('div',{id:'map-pin-preview',class:'map-pin-preview','aria-label':'Unconfirmed pin'},el('span',{'aria-hidden':'true'}),el('small',{},'Unconfirmed'));area.append(preview);}
      const p=Core.project(draft,view,width,height);
      preview.style.left=p.x+'px';preview.style.top=p.y+'px';
      preview.querySelector('span').textContent=symbols[draft.icon]||symbols.pin;
      preview.dataset.valid=String(Number.isFinite(draft.y));
    }
    function updateWaypoint(){
      const projection=player.destination;
      waypoint.hidden=!showWorld||!target||!projection?.inView;
      if(waypoint.hidden)return;
      waypoint.style.left=projection.x+'px';waypoint.style.top=projection.y+'px';
      waypoint.setAttribute('aria-label',target.name+' · '+distanceText(target));
      document.getElementById('world-destination-distance').textContent=distanceText(target);
    }
    function rebuildMarkers(){
      markers.replaceChildren();markerNodes=[];
      const visible=places().filter(p=>(p.id.startsWith('pin-')?filters.pins:filters.landmarks)||target?.id===p.id);
      for(const place of visible){
        const node=el('button',{class:'map-marker','data-map-place':place.id,'aria-label':place.name,onclick:()=>choose(place)},
          el('span',{'aria-hidden':'true'},symbols[place.icon]||symbols.pin),el('small',{},place.name));
        markers.append(node);markerNodes.push({node,place});
      }
    }
    function choose(place){selectPlace(place);renderDetails();draw();details.querySelector('h2').focus();}
    function editPin(pin,move=false){
      const point=pin||{x:view.x,z:view.z};
      if(move&&draft)draft={...draft,x:point.x,z:point.z,y:resolveSurface(point)?.y??null};
      else if(!draft)draft={id:null,name:'',icon:'pin',...point,y:resolveSurface(point)?.y??null};
      else announce('Save or cancel the current pin draft first.');
      renderDetails();draw();details.querySelector('input').focus();
    }
    function renderDetails(){
      details.replaceChildren();
      if(draft){
        details.append(el('h2',{tabindex:'-1'},draft.id?'Edit pin':'Place a pin'));
        const name=el('input',{type:'text',id:'pin-name',value:draft.name,maxlength:80,oninput:e=>{draft.name=e.target.value;}});
        const icon=el('select',{id:'pin-icon',onchange:e=>{draft.icon=e.target.value;draw();}},['pin','star','leaf','flag','clock'].map(id=>el('option',{value:id},symbols[id]+' '+({pin:'Diamond',star:'Star',leaf:'Leaf',flag:'Flag',clock:'Clock'}[id]))));icon.value=draft.icon;
        const status=el('p',{class:'status-line','aria-live':'polite',id:'pin-status'});
        const save=button('Save pin',()=>{
          if(!Number.isFinite(draft.y)){status.textContent='Choose a point on the garden.';return;}
          if(!draft.name.trim()){status.textContent='Give this pin a name.';name.focus();return;}
          const pin={...draft,id:draft.id||'pin-'+nextPin++,name:draft.name.trim()};
          const index=pins.findIndex(p=>p.id===pin.id);if(index<0)pins.push(pin);else pins[index]=pin;
          if(target?.id===pin.id)setTarget(pin);selected=pin.id;draft=null;refresh();details.querySelector('h2').focus();announce('Pin saved for this session.');
        },true);
        save.disabled=!Number.isFinite(draft.y);
        if(save.disabled)status.textContent='No surface here. Click a point on the garden to move the preview.';
        details.append(el('div',{class:'form-row'},el('label',{for:'pin-name'},'Pin name'),name),el('div',{class:'form-row'},el('label',{for:'pin-icon'},'Symbol'),icon),
          el('p',{class:'subtle'},'Click another point to move this preview. Pan or zoom to check its position.'),
          el('div',{class:'button-row'},save,button('Cancel',()=>{draft=null;renderDetails();draw();details.querySelector('h2').focus();})),status);
        return;
      }
      const place=selectedPlace();
      if(!place){
        details.append(el('h2',{tabindex:'-1'},'A small world to explore'),el('p',{},'Choose a landmark, or click the map to name a place of your own.'),
          button('Pin at map center',()=>editPin(null)),el('p',{class:'subtle'},'Drag or use arrow keys to pan. Scroll or use + / − to zoom. Home recenters on you.'));
      }else{
        details.append(el('span',{class:'map-detail-symbol','aria-hidden':'true'},symbols[place.icon]),el('h2',{tabindex:'-1'},place.name),
          el('p',{id:'map-distance',class:'subtle'},distanceText(place)),el('p',{},place.id==='gateway'?'Walk through the gateway and follow the path to the Windseed launcher.':place.id==='launcher'?'Hold X inside the gold ring, then release to launch. Cloudrest floats straight ahead to the north.':place.icon==='island'?'A floating island with a landing garden and Windseed launcher. Reach it by gliding.':place.id.startsWith('pin-')?'A place you marked in this garden.':'A landmark in the garden. Follow its bearing while you explore.'),
          el('button',{id:'map-navigate',class:'primary',onclick:()=>{if(target?.id===place.id)stop();else navigate(place);}},target?.id===place.id?'Navigating · stop':'Navigate'));
        if(place.id.startsWith('pin-')){
          const actions=el('div',{class:'button-row'},button('Edit pin',()=>editPin(place)),button('Remove pin',()=>{
            actions.replaceChildren(el('p',{},'Remove “'+place.name+'”?'),button('Confirm remove',()=>{
              pins=pins.filter(p=>p.id!==place.id);if(target?.id===place.id)setTarget(null);selected=null;refresh();details.querySelector('h2').focus();announce('Pin removed.');
            }),button('Keep pin',()=>{renderDetails();details.querySelector('h2').focus();}));
            actions.querySelector('button').focus();
          }));details.append(actions);
        }
        details.append(button('Pin at map center',()=>editPin(null)));
      }
      const list=el('select',{id:'map-location',onchange:e=>{const place=places().find(p=>p.id===e.target.value);if(place){view={...view,x:place.x,z:place.z};choose(place);}}},el('option',{value:''},'Choose a location…'),places().map(p=>el('option',{value:p.id},p.name)));
      list.value=selected||'';
      details.append(el('div',{class:'form-row'},el('label',{for:'map-location'},'Landmarks and saved pins'),list),el('p',{class:'map-session-note'},'Pins last until reload. Navigation does not complete a quest.'));
    }
    function refresh(){rebuildMarkers();renderDetails();draw();}
    function render(container){
      hide();host=container;
      const layout=el('div',{class:'world-map-layout'});area=el('div',{class:'world-map-area',id:'world-map-area',tabindex:'0','aria-label':'Garden map. Arrow keys pan, plus and minus zoom, Home recenters, Enter places a pin at the center.'});
      surface=el('canvas',{class:'world-map-canvas','aria-hidden':'true'});markers=el('div',{class:'map-markers'});details=el('aside',{class:'map-details','aria-label':'Selected location'});
      area.append(surface,markers,el('span',{class:'map-crosshair','aria-hidden':'true'},'+'),el('span',{class:'map-player','aria-label':'Your position'},'▲'));
      const zoom=factor=>{view.zoom=Core.clamp(view.zoom*factor,.6,5);draw();};
      const recenter=()=>{view={...view,x:player.x,z:player.z};draw();};
      const tools=el('div',{class:'map-controls'},el('button',{class:'secondary',id:'map-zoom-out','aria-label':'Zoom map out',onclick:()=>zoom(1/1.25)},'−'),el('button',{class:'secondary',id:'map-zoom-in','aria-label':'Zoom map in',onclick:()=>zoom(1.25)},'+'),
        el('button',{class:'secondary',id:'map-recenter',onclick:recenter},'Recenter'),button('Fit garden',()=>{view=fittedView();draw();}),el('span',{id:'map-scale'}));
      const filterBar=el('div',{class:'map-filters'});
      for(const [id,label] of [['landmarks','Landmarks'],['pins','Pins']])filterBar.append(el('label',{},el('input',{type:'checkbox',checked:filters[id],onchange:e=>{filters[id]=e.target.checked;rebuildMarkers();draw();}}),' '+label));
      filterBar.append(el('button',{id:'map-stop',class:'secondary',onclick:stop},'Stop navigation'));
      area.append(tools,filterBar);layout.append(area,details);host.append(layout);
      let drag=null;
      const point=e=>{const r=area.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
      area.addEventListener('pointerdown',e=>{
        if(e.button!==0||e.target.closest('button,input,label'))return;
        area.focus();drag={id:e.pointerId,start:point(e),last:point(e),moved:0};area.setPointerCapture(e.pointerId);
      });
      area.addEventListener('pointermove',e=>{
        if(!drag||e.pointerId!==drag.id)return;
        const p=point(e),dx=p.x-drag.last.x,dy=p.y-drag.last.y;
        const {width,height}=area.getBoundingClientRect(),s=Core.scale(view,width,height);view.x=Core.clamp(view.x-dx/s,-60,60);view.z=Core.clamp(view.z+dy/s,-53,67);
        drag.moved+=Math.abs(dx)+Math.abs(dy);drag.last=p;draw();
      });
      area.addEventListener('pointerup',e=>{
        if(!drag||e.pointerId!==drag.id)return;
        const click=drag.moved<5;drag=null;if(area.hasPointerCapture(e.pointerId))area.releasePointerCapture(e.pointerId);
        if(click){const {width,height}=area.getBoundingClientRect(),p=Core.unproject(point(e),view,width,height);editPin(p,true);}
      });
      area.addEventListener('pointercancel',()=>{drag=null;});area.addEventListener('lostpointercapture',()=>{drag=null;});area.addEventListener('blur',()=>{drag=null;});
      area.addEventListener('wheel',e=>{
        if(e.target.closest('button,input'))return;e.preventDefault();
        const {width,height}=area.getBoundingClientRect(),p=point(e),before=Core.unproject(p,view,width,height);
        view.zoom=Core.clamp(view.zoom*Math.exp(-e.deltaY*.0015),.6,5);
        const after=Core.unproject(p,view,width,height);view.x+=before.x-after.x;view.z+=before.z-after.z;draw();
      },{passive:false});
      area.addEventListener('keydown',e=>{
        if(e.isComposing||e.ctrlKey||e.metaKey||e.altKey||e.target!==area)return;
        if(e.key==='Home'){e.preventDefault();recenter();return;}
        if(['+','=','-'].includes(e.key)){e.preventDefault();zoom(e.key==='-'?1/1.25:1.25);return;}
        if(e.key==='Enter'){e.preventDefault();editPin(null);return;}
        const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[e.key];
        if(direction){e.preventDefault();view.x=Core.clamp(view.x+direction[0]*4/view.zoom,-60,60);view.z=Core.clamp(view.z+direction[1]*4/view.zoom,-53,67);draw();}
      });
      refresh();observer=new ResizeObserver(draw);observer.observe(area);draw();
    }
    function hide(){observer?.disconnect();observer=null;host=null;area=null;surface=null;markers=null;details=null;markerNodes=[];}
    document.getElementById('stop-navigation').addEventListener('click',stop);
    return {render,hide,navigate,goTo,stop,setAtlas(value){atlas=value;view=fittedView();draw();},updatePlayer(value,visible){
      const changed=['x','y','z','yaw'].some(key=>player[key]!==value[key]);player=value;showWorld=visible;
      if(changed||miniVisible!==!mini.parentElement.hidden){miniVisible=!mini.parentElement.hidden;draw();}
      updateWaypoint();
    },
      destination:item=>Core.questDestination(item,atlas.landmarks),
      snapshot:()=>({view:{...view},pins:pins.map(p=>({...p})),target:target?{...target}:null,selected,draft:draft?{...draft}:null,player:{...player},landmarks:atlas.landmarks.map(p=>({...p}))})};
  };
})();
