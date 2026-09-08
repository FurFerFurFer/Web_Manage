(function () {
  'use strict';
  window.createWorldScene = function (canvas, hooks) {
    const B = window.BABYLON, Core = window.WorldDemoCore;
    if (!B || !B.Engine.isSupported()) throw new Error('Babylon.js or WebGL is unavailable.');
    const engine = new B.Engine(canvas, true, {stencil:true, preserveDrawingBuffer:false, disableWebGL2Support:false}, false);
    const scene = new B.Scene(engine);
    const instrumentation = new B.SceneInstrumentation(scene);
    scene.clearColor = new B.Color4(.68,.82,.83,1);
    scene.fogMode = B.Scene.FOGMODE_EXP2;
    scene.fogDensity = .009;
    scene.collisionsEnabled = true;
    scene.skipPointerMovePicking = true;
    const c = hex => B.Color3.FromHexString(hex);
    const v = (x,y,z) => new B.Vector3(x,y,z);
    const mats = {};
    function material(name, color, emissive = 0) {
      const m = new B.StandardMaterial(name, scene);
      m.diffuseColor = c(color); m.specularColor = new B.Color3(.07,.07,.07);
      if (emissive) m.emissiveColor = c(color).scale(emissive);
      mats[name] = m; return m;
    }
    const grass = material('grass','#82ad72'), stone = material('limestone','#ddd9b8'),
      stoneSide = material('stone-side','#aab795'), gold = material('brass','#c3a15b'),
      bark = material('bark','#6d7860'), leaf = material('leaf','#55936e'),
      leafLight = material('leaf-light','#91b573'), water = material('water','#68b8ba'),
      cloth = material('cloak','#346b66'), boots = material('boots','#39463c'),
      skin = material('skin','#dcb995'), book = material('book','#4e6851'),
      flower = material('flowers','#d5b8d2'), lightFlower = material('light-flowers','#e8d89b'),
      glow = material('glow','#f1dea0', .5);
    water.specularColor = c('#c7e7e0'); water.specularPower = 50;
    const hemi = new B.HemisphericLight('sky',v(0,1,0),scene);
    hemi.intensity = .65; hemi.groundColor = c('#77956f');
    const sun = new B.DirectionalLight('sun',v(-.4,-1,.35),scene);
    sun.position = v(12,25,-12); sun.intensity = .8;
    const shadows = new B.ShadowGenerator(1024,sun);
    shadows.usePercentageCloserFiltering = true;
    shadows.filteringQuality = B.ShadowGenerator.QUALITY_LOW;
    shadows.bias = .001; shadows.normalBias = .04;
    shadows.forceBackFacesOnly = true;
    sun.shadowMinZ = 1; sun.shadowMaxZ = 65;
    const solids = [], foliage = [], stars = [], lampMeshes = [];
    function finish(mesh, mat, position, solid = false, shadow = false) {
      mesh.material = mat; if(position) mesh.position.copyFrom(position);
      mesh.isPickable = solid; mesh.checkCollisions = solid;
      mesh.receiveShadows = true;
      if(solid) solids.push(mesh);
      if(shadow) shadows.addShadowCaster(mesh);
      return mesh;
    }
    function box(name, size, position, mat, solid = false, shadow = false) {
      return finish(B.MeshBuilder.CreateBox(name,{width:size[0],height:size[1],depth:size[2]},scene),mat,position,solid,shadow);
    }
    function cylinder(name, diameter, height, position, mat, solid = false, tess = 32) {
      return finish(B.MeshBuilder.CreateCylinder(name,{diameter,height,tessellation:tess},scene),mat,position,solid);
    }
    function sphere(name, size, position, mat, shadow = false) {
      const mesh=finish(B.MeshBuilder.CreateSphere(name,{diameter:1,segments:4},scene),mat,position,false,shadow);
      mesh.scaling.copyFrom(v(...size));return mesh;
    }
    function ring(name, radius, thickness, position, mat) {
      return finish(B.MeshBuilder.CreateTorus(name,{diameter:radius*2,thickness,tessellation:64},scene),mat,position);
    }
    // The route is deliberately small: arrival, clock ring, a water channel,
    // low stairs and one grove. All meshes are authored here as placeholders.
    cylinder('island',78,4,v(0,-2,7),stoneSide,true,64);
    cylinder('garden-floor',77,.12,v(0,-.04,7),grass,true,64);
    cylinder('plaza-base',19,.18,v(0,.08,7),stone,true,64);
    ring('outer-time-ring',8.8,.07,v(0,.19,7),gold);
    ring('inner-time-ring',6.8,.05,v(0,.19,7),gold);
    for(let i=0;i<48;i++) {
      const a=i/48*Math.PI*2;
      const mark=box('clock-tick-'+i,[i%4===0?.1:.045,.035,i%4===0?.6:.28],v(Math.sin(a)*8.4,.21,7+Math.cos(a)*8.4),gold);
      mark.rotation.y=a;
    }
    for(let i=0;i<9;i++) box('arrival-stone-'+i,[2.6,.1,1.15],v(Math.sin(i*.55)*.15,.09,-11+i*1.45),stone,true);
    for(let i=0;i<7;i++) box('grove-path-'+i,[2,.1,1.2],v(-6-i*1.05,.09,9+i*.9),stone,true);
    for(let i=0;i<4;i++) box('terrace-step-'+i,[5,.2*(i+1),1.1],v(12,.1*(i+1),9+i*.95),stone,true,true);
    box('terrace',[7,.8,5],v(12,.4,15),stone,true,true);
    box('stream-bed',[3,.16,23],v(9.5,.02,-1),stoneSide,true);
    box('stream',[2.5,.035,22.6],v(9.5,.12,-1),water);
    box('bridge',[5.5,.35,3],v(9.5,.25,5),stone,true,true);
    for(const z of [3.7,6.3]) {
      for(const x of [7.2,11.8]) box('bridge-post',[.22,1.5,.22],v(x,1,z),stone,true,true);
      box('bridge-rail',[4.9,.14,.15],v(9.5,1.65,z),gold);
    }
    cylinder('clock-plinth',3.2,.6,v(0,.4,7),stone,true);
    cylinder('clock-bowl',2.7,.35,v(0,.86,7),gold,true);
    cylinder('clock-water',2.3,.06,v(0,1.07,7),water);
    const globe=ring('clock-globe',1,.07,v(0,2.35,7),gold); globe.rotation.x=Math.PI/2;
    const globe2=ring('clock-globe-tilted',1,.07,v(0,2.35,7),gold); globe2.rotation.z=.65;
    cylinder('clock-spire',.12,2.8,v(0,2,7),gold);
    sphere('clock-heart',[.36,.36,.36],v(0,2.35,7),glow);
    for(const x of [-6,6]) {
      box('gateway-pier',[1.1,5.7,1.1],v(x,2.85,18),stone,true,true);
      box('gateway-cap',[1.7,.35,1.7],v(x,5.8,18),stoneSide,false,true);
    }
    box('gateway-lintel',[13.2,.65,1.35],v(0,5.75,18),stone,false,true);
    const suspended=ring('hanging-clock',1.7,.09,v(0,4.8,18),gold); suspended.rotation.x=Math.PI/2;
    for(let i=0;i<5;i++) box('lintel-vine-'+i,[.16,1+i%2*.5,.16],v(-4+i*2,5.1-i%2*.25,17.4),leaf);
    // Deterministic arrangement makes screenshots and performance routes repeatable.
    let seed=93;
    const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    function tree(x,z,scale=1) {
      cylinder('trunk-'+x+'-'+z,.55*scale,3.6*scale,v(x,1.8*scale,z),bark,true,7);
      for(let j=0;j<3;j++) {
        const canopy=sphere('crown-'+x+'-'+z+'-'+j,[3.8*scale,2.8*scale,3.4*scale],v(x+(j-1)*.95*scale,(3.8+(j%2)*1.3)*scale,z+(j%2)*.8),j%2?leafLight:leaf,true);
        foliage.push({mesh:canopy,phase:random()*6,base:canopy.rotation.z});
      }
    }
    for(const [x,z,s] of [[-11,-4,1.1],[-13,7,1],[-18,12,1.2],[-13,20,1.15],[13,-7,1.2],[17,0,1.1],[19,10,1.25],[10,24,1.3],[-7,27,1.2],[-23,0,1.4],[24,23,1.5]]) tree(x,z,s);
    for(let i=0;i<46;i++) {
      const angle=random()*Math.PI*2, rad=11+random()*19;
      const x=Math.sin(angle)*rad,z=7+Math.cos(angle)*rad;
      if(x>6&&x<14&&z<18) continue;
      const bush=sphere('bush-'+i,[1.4+random()*1.2,.8+random(),1.4],v(x,.4,z),i%3?leafLight:leaf);
      foliage.push({mesh:bush,phase:random()*6,base:0});
      if(i%2===0) for(let j=0;j<3;j++) sphere('flower-'+i+'-'+j,[.3,.28,.3],v(x+(j-1)*.4,1,z-.45),i%3?flower:lightFlower);
    }
    for(let i=0;i<10;i++) {
      const a=i/10*Math.PI*2,rad=33;
      const rock=sphere('rock-'+i,[3,1.8+random()*2,2.6],v(Math.sin(a)*rad,.6,7+Math.cos(a)*rad),stoneSide,true);
      rock.checkCollisions=true; rock.isPickable=true;solids.push(rock);
    }
    for(let i=0;i<5;i++) {
      const peak=finish(B.MeshBuilder.CreateCylinder('distant-hill-'+i,{diameterTop:2,diameterBottom:28+i*2,height:12+i%3*5,tessellation:6},scene),material('hill-'+i,i%2?'#8fb5a1':'#93b4af'),v(-60+i*30,1,68+i%2*10));
      peak.rotation.y=i*.7;
    }
    const grovePositions=[[-13,15],[-16,18],[-11,20]];
    ['#80ad74','#7ec7d1','#e9bd68'].forEach((color,i)=>{
      const [x,z]=grovePositions[i];
      cylinder('grove-plinth-'+i,1.5,.45,v(x,.3,z),stone,true);
      const sm=material('star-material-'+i,color,.4);
      const star=finish(B.MeshBuilder.CreatePolyhedron('memory-star-'+i,{type:1,size:i===0?.7:.45},scene),sm,v(x,1.6,z));
      star.isPickable=true;star.metadata={mmIndex:i};stars.push(star);
      ring('star-ring-'+i,.75,.045,v(x,.57,z),gold);
    });
    for(const [x,z] of [[-4,-3],[4,-3],[-6,13],[6,13]]) {
      cylinder('lamp-post',.15,1.8,v(x,.9,z),gold,false,8);
      const lm=sphere('lamp-'+x+'-'+z,[.42,.55,.42],v(x,1.9,z),glow);lampMeshes.push(lm);
    }
    // Capsule collision is independent of the decorative body. Its position is
    // the character's center, while feet are center minus .9 world units.
    const player=B.MeshBuilder.CreateBox('player-collider',{size:1},scene);
    player.isVisible=false; player.isPickable=false;
    player.ellipsoid=v(.35,.88,.35);player.ellipsoidOffset=v(0,0,0);player.position=v(0,1.08,-6);
    const avatar=new B.TransformNode('avatar',scene);
    const body=finish(B.MeshBuilder.CreateCylinder('traveler-cloak',{diameterTop:.58,diameterBottom:1,height:1.05,tessellation:8},scene),cloth,v(0,0,0),false,true);body.parent=avatar;body.position.y=.87;
    const head=sphere('traveler-head',[.46,.52,.46],v(0,1.64,0),skin,true);head.parent=avatar;
    const hair=sphere('traveler-hair',[.51,.34,.51],v(0,1.85,-.025),boots,true);hair.parent=avatar;
    const legs=[];
    for(const x of [-.21,.21]) {const leg=box('traveler-leg',[.24,.6,.3],v(x,.3,0),boots,false,true);leg.parent=avatar;legs.push(leg);}
    const notebook=box('traveler-notebook',[.12,.4,.3],v(.45,.75,0),book,false,true);notebook.parent=avatar;notebook.rotation.z=-.12;
    const scarf=box('traveler-scarf',[.18,.7,.045],v(-.18,1.13,-.38),gold,false,true);scarf.parent=avatar;
    const camera=new B.FreeCamera('camera',v(0,5,-13),scene);camera.minZ=.15;camera.fov=.85;
    scene.activeCamera=camera;
    let yaw=0,pitch=.31,distance=8.8,sensitivity=1,paused=true,disposed=false;
    let vertical=0,grounded=false,coyote=0,jumpBuffer=0,velocity=v(0,0,0),walkPhase=0;
    let reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    let environment=Core.initialEnvironment(),target={rain:false,night:false};
    const keys=new Set(),cleanup=[];
    const on=(object,event,fn,options)=>{object.addEventListener(event,fn,options);cleanup.push(()=>object.removeEventListener(event,fn,options));};
    const blocked=()=>paused||document.hidden||document.activeElement!==canvas;
    function reset() {player.position.copyFrom(v(0,1.08,-6));vertical=0;velocity.setAll(0);keys.clear();jumpBuffer=0;yaw=0;pitch=.31;distance=8.8;}
    function step(dt) {
      environment=Core.advanceEnvironment(environment,target,dt);
      if(blocked()) {velocity.setAll(0);return;}
      if(keys.has('KeyQ')) yaw-=dt*1.6;
      if(keys.has('KeyE')) yaw+=dt*1.6;
      const x=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
      const z=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0);
      const speed=keys.has('ShiftLeft')||keys.has('ShiftRight')?6:3.5;
      const direction=v(x*Math.cos(yaw)+z*Math.sin(yaw),0,z*Math.cos(yaw)-x*Math.sin(yaw));
      if(direction.lengthSquared()>0) direction.normalize().scaleInPlace(speed);
      const blend=1-Math.exp(-dt*12);velocity.x+=(direction.x-velocity.x)*blend;velocity.z+=(direction.z-velocity.z)*blend;
      const floor=scene.pickWithRay(new B.Ray(player.position,v(0,-1,0),1.15),mesh=>mesh.checkCollisions&&mesh!==player);
      const clearance=floor.hit?player.position.y-floor.pickedPoint.y:Infinity;
      grounded=clearance<=.94&&vertical<=0;
      coyote=grounded?.1:Math.max(0,coyote-dt);jumpBuffer=Math.max(0,jumpBuffer-dt);
      if(jumpBuffer>0&&coyote>0) {vertical=6.2;grounded=false;coyote=0;jumpBuffer=0;}
      if(grounded) vertical=-.8;else vertical=Math.max(-18,vertical-18*dt);
      const before=player.position.clone();
      // Low stairs use a bounded step-up; high ledges still require a jump.
      if(grounded&&direction.lengthSquared()>.1) {
        const ahead=player.position.add(v(velocity.x,0,velocity.z).normalize().scale(.5));
        const stepHit=scene.pickWithRay(new B.Ray(ahead.add(v(0,.45,0)),v(0,-1,0),1.65),mesh=>mesh.checkCollisions&&mesh!==player);
        if(stepHit.hit) {const rise=stepHit.pickedPoint.y+.9-player.position.y;if(rise>.025&&rise<.24) player.position.y+=rise;}
      }
      player.moveWithCollisions(v(velocity.x*dt,vertical*dt,velocity.z*dt));
      if(vertical>0&&player.position.y-before.y<vertical*dt*.15) vertical=0;
      if(player.position.y< -7) reset();
      if(direction.lengthSquared()>.05) {
        const desired=Math.atan2(direction.x,direction.z);
        const delta=Math.atan2(Math.sin(desired-avatar.rotation.y),Math.cos(desired-avatar.rotation.y));
        avatar.rotation.y+=delta*(1-Math.exp(-dt*15));
      }
      walkPhase+=Math.hypot(velocity.x,velocity.z)*dt*2.5;
    }
    const simulation=Core.stepper(step);
    on(canvas,'keydown',event=>{
      if(event.isComposing||event.ctrlKey||event.metaKey||event.altKey||paused)return;
      if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','Space','KeyQ','KeyE'].includes(event.code)) {
        event.preventDefault();keys.add(event.code);if(event.code==='Space'&&!event.repeat)jumpBuffer=.13;
      }
    });
    on(window,'keyup',event=>keys.delete(event.code));
    on(window,'blur',()=>{keys.clear();simulation.reset();});
    on(document,'visibilitychange',()=>{keys.clear();simulation.reset();});
    on(canvas,'blur',()=>keys.clear());
    let drag=null;
    on(canvas,'pointerdown',event=>{if(paused)return;canvas.focus();drag={x:event.clientX,y:event.clientY,moved:0,id:event.pointerId};canvas.setPointerCapture(event.pointerId);});
    on(canvas,'pointermove',event=>{
      if(!drag||paused)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
      drag.moved+=Math.abs(dx)+Math.abs(dy);yaw+=dx*.005*sensitivity;pitch=Core.clamp(pitch+dy*.004*sensitivity,.12,1.05);drag.x=event.clientX;drag.y=event.clientY;
    });
    on(canvas,'pointerup',event=>{
      if(drag&&drag.moved<6&&!paused) {
        const hit=scene.pick(event.offsetX,event.offsetY,mesh=>!!mesh.metadata?.mmIndex||mesh.metadata?.mmIndex===0);
        if(hit?.hit)hooks.selectMM(hit.pickedMesh.metadata.mmIndex);
      }
      drag=null;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
    });
    on(canvas,'pointercancel',()=>{drag=null;});
    on(canvas,'contextmenu',event=>event.preventDefault());
    on(canvas,'wheel',event=>{if(paused)return;event.preventDefault();distance=Core.clamp(distance+event.deltaY*.008,3,13);},{passive:false});
    // Rain is a bounded line batch, not hundreds of independent scene objects.
    const rainLines=Array.from({length:120},()=>[v(0,0,0),v(0,0,0)]);
    const rainSeeds=rainLines.map(()=>({x:random()*22-11,z:random()*20-10,y:random()*12}));
    const rainMesh=B.MeshBuilder.CreateLineSystem('rain',{lines:rainLines,updatable:true},scene);
    rainMesh.color=c('#d2e5df');rainMesh.isPickable=false;rainMesh.alwaysSelectAsActiveMesh=true;
    // Batch stationary pieces by material and collision behavior. Animated
    // foliage, the avatar and selectable stars retain their individual meshes.
    const animated=new Set([...foliage.map(f=>f.mesh),...stars,player,rainMesh]);
    const batches=new Map();
    for(const mesh of scene.meshes) {
      if(animated.has(mesh)||mesh.parent||!mesh.material||!mesh.getTotalVertices())continue;
      const key=mesh.material.name+':'+mesh.checkCollisions;
      if(!batches.has(key))batches.set(key,[]);
      batches.get(key).push(mesh);
    }
    for(const meshes of batches.values()) {
      if(meshes.length<2)continue;
      const solid=meshes[0].checkCollisions;
      const shadow=meshes.some(mesh=>shadows.getShadowMap().renderList.includes(mesh));
      meshes.forEach(mesh=>shadows.removeShadowCaster(mesh));
      const merged=B.Mesh.MergeMeshes(meshes,true,true,undefined,false,false);
      merged.checkCollisions=solid;merged.isPickable=solid;merged.receiveShadows=true;
      if(shadow)shadows.addShadowCaster(merged);
    }
    let quality='balanced';
    function resize() {
      const rect=canvas.getBoundingClientRect();
      const scale=quality==='sharp'?1:Math.max(1,rect.width/1280,rect.height/720);
      engine.setHardwareScalingLevel(scale);engine.resize();
    }
    on(window,'resize',resize);resize();
    let previous=performance.now(),uiElapsed=0,samples=[],elapsedRun=0;
    function render() {
      if(disposed)return;
      const now=performance.now(),dt=(now-previous)/1000;previous=now;
      if(document.hidden){simulation.reset();return;}
      simulation.advance(dt);elapsedRun+=Math.min(dt,.1);
      avatar.position.copyFrom(player.position.subtract(v(0,.9,0)));
      const moving=!blocked()&&Math.hypot(velocity.x,velocity.z)>.1;
      legs.forEach((leg,i)=>{leg.rotation.x=moving&&grounded?Math.sin(walkPhase+i*Math.PI)*.45:0;});
      scarf.rotation.x=reduced?0:Math.sin(environment.elapsed*2)*environment.wind*.12;
      const focus=player.position.add(v(0,.65,0));
      const desired=focus.add(v(-Math.sin(yaw)*distance*Math.cos(pitch),distance*Math.sin(pitch),-Math.cos(yaw)*distance*Math.cos(pitch)));
      const delta=desired.subtract(focus),len=delta.length();
      const obstruction=scene.pickWithRay(new B.Ray(focus,delta.normalize(),len),mesh=>mesh.checkCollisions&&mesh!==player);
      const safe=obstruction.hit?focus.add(delta.scale(Math.max(.45,obstruction.distance-.35))):desired;
      camera.position.copyFrom(safe);camera.setTarget(focus);
      const env=environment,dim=1-env.night*.76;
      scene.clearColor=B.Color4.Lerp(new B.Color4(.68,.82,.83,1),new B.Color4(.34,.47,.5,1),env.rain);
      scene.clearColor=B.Color4.Lerp(scene.clearColor,new B.Color4(.055,.095,.16,1),env.night);
      scene.fogColor=new B.Color3(scene.clearColor.r,scene.clearColor.g,scene.clearColor.b);
      scene.fogDensity=.008+env.rain*.009;
      sun.intensity=(.8-env.rain*.5)*dim;hemi.intensity=.65-env.rain*.13-env.night*.25;
      hemi.diffuse=B.Color3.Lerp(c('#f2f3d6'),c('#809fcb'),env.night);
      stone.diffuseColor=B.Color3.Lerp(c('#ddd9b8'),c('#9eae9e'),env.wetness);
      stone.specularColor=new B.Color3(.06,.06,.06).scale(1+env.wetness*5);
      water.diffuseColor=B.Color3.Lerp(c('#68b8ba'),c('#507e8c'),env.rain*.6+env.night*.4);
      glow.emissiveColor=c('#f1dea0').scale(.2+env.night*.8);
      foliage.forEach(({mesh,phase,base})=>{mesh.rotation.z=base+(reduced?0:Math.sin(env.elapsed*1.3+phase)*.02*env.wind);});
      stars.forEach((star,i)=>{star.rotation.y=reduced?0:env.elapsed*.24;star.position.y=1.6+(reduced?0:Math.sin(env.elapsed+i)*.08);});
      rainMesh.setEnabled(env.rain>.02&&!reduced);rainMesh.alpha=env.rain*.5;
      if(rainMesh.isEnabled()) {
        rainSeeds.forEach((drop,i)=>{const y=((drop.y-env.elapsed*(9+env.rain*3))%12+12)%12;
          const x=player.position.x+drop.x,z=player.position.z+drop.z;
          rainLines[i][0].set(x,y,z);rainLines[i][1].set(x-env.wind*.18,y+.65,z-.09);
        });
        B.MeshBuilder.CreateLineSystem('rain',{lines:rainLines,instance:rainMesh});
      }
      scene.render();
      if(dt>0&&dt<1){samples.push(dt*1000);if(samples.length>600)samples.shift();}
      uiElapsed+=dt;
      if(uiElapsed>.5){uiElapsed=0;hooks.tick({environment:env,position:player.position.asArray(),metrics:metrics()});}
    }
    function metrics() {
      const sorted=[...samples].sort((a,b)=>a-b);
      return {fps:samples.length?Math.round(1000/(samples.reduce((a,b)=>a+b,0)/samples.length)):0,
        p95:sorted.length?Math.round(sorted[Math.floor((sorted.length-1)*.95)]):0,
        drawCalls:instrumentation.drawCallsCounter.current,meshes:scene.meshes.length,
        resolution:engine.getRenderWidth()+' × '+engine.getRenderHeight(),seconds:Math.round(elapsedRun),
        renderer:engine.getGlInfo().renderer,version:B.Engine.Version};
    }
    on(canvas,'webglcontextlost',event=>{event.preventDefault();paused=true;hooks.error('The graphics context was lost. Notebook drafts remain available; reload when ready.');});
    engine.runRenderLoop(render);
    return {
      pause(value){paused=value;keys.clear();jumpBuffer=0;drag=null;simulation.reset();},
      reset, setWeather(patch){target={...target,...patch};},
      setReduced(value){reduced=value;},setSensitivity(value){sensitivity=value;},
      setQuality(value){quality=value;resize();},metrics,
      snapshot(){return {position:player.position.asArray(),grounded,paused,vertical,jumpBuffer,coyote,environment:{...environment},target:{...target},reduced,yaw,pitch,quality,metrics:metrics()};},
      dispose(){disposed=true;engine.stopRenderLoop(render);cleanup.forEach(fn=>fn());instrumentation.dispose();scene.dispose();engine.dispose();}
    };
  };
})();
