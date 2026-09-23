(function () {
  'use strict';
  window.createWorldScene = function (canvas, hooks) {
    const B = window.BABYLON, Core = window.WorldDemoCore, Flight = window.WorldFlight, CharacterMotion = window.WorldCharacterMotion, Stamina = window.WorldStamina;
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
    // Ruling 3 scales the BODY, never the world. b()/bv() convert a character
    // measurement -- collider half-extents, the feet offset below the collider
    // centre, limb reach used to probe walls and ledges, head/eye heights -- into
    // world units. Scene geometry, camera framing and controller values are NOT
    // body measurements and stay exactly as authored.
    const S=Flight.tuning.characterScale,b=n=>n*S,bv=(x,y,z)=>v(b(x),b(y),b(z));
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
      // Local landing clearance for the 1.30x body; world and controller units stay fixed.
      // Extend behind the original front face, preserving the approach and grab.
      // Depth includes room to finish landing and brake after releasing forward.
      box('gateway-pier',[1.5,5.7,2.2],v(x,2.85,18.55),stone,true,true);
      box('gateway-cap',[2.1,.35,2.8],v(x,5.8,18.55),stoneSide,false,true);
    }
    box('gateway-lintel',[13.2,.65,1.35],v(0,5.75,18),stone,false,true);
    const suspended=ring('hanging-clock',1.7,.09,v(0,4.8,18),gold); suspended.rotation.x=Math.PI/2;
    for(let i=0;i<5;i++) box('lintel-vine-'+i,[.16,1+i%2*.5,.16],v(-4+i*2,5.1-i%2*.25,17.4),leaf);
    // The small flight loop sits beyond the garden's edge, so the geographic
    // map still has one walkable surface at each horizontal coordinate.
    const pads=[],islands=[];
    function launchPad(id,x,y,z){
      cylinder('launch-pad-'+id,3.4,.16,v(x,y-.08,z),stone,true);
      ring('launch-rim-'+id,1.55,.12,v(x,y+.03,z),gold);
      const petals=[];
      for(let i=0;i<4;i++){
        const a=i*Math.PI/2;
        const petal=sphere('launch-petal-'+id+'-'+i,[.4,1.8,.5],v(x+Math.sin(a)*1.7,y+.7,z+Math.cos(a)*1.7),glow);
        petal.rotation.z=-Math.sin(a)*.45;petal.rotation.x=Math.cos(a)*.45;petals.push(petal);
      }
      pads.push({id,x,y,z});
    }
    launchPad('garden',0,.18,29);
    for(const spec of [{id:'cloudrest',name:'Cloudrest',x:0,y:19,z:56,r:7},{id:'windward',name:'Windward Isle',x:21,y:12,z:57,r:6}]){
      finish(B.MeshBuilder.CreateCylinder('floating-rock-'+spec.id,{diameterTop:spec.r*2,diameterBottom:2,height:7,tessellation:10},scene),stoneSide,v(spec.x,spec.y-3.5,spec.z),true,true);
      cylinder('floating-island-'+spec.id,spec.r*2,.18,v(spec.x,spec.y-.09,spec.z),grass,true,48);
      cylinder('island-walk-'+spec.id,5,.12,v(spec.x,spec.y+.06,spec.z),stone,true);
      launchPad(spec.id,spec.x,spec.y+.28,spec.z);
      for(const dx of [-3.5,3.5]){
        cylinder('island-column-'+spec.id+'-'+dx,.45,2.5,v(spec.x+dx,spec.y+1.25,spec.z+1),stone,false,8);
        sphere('island-flower-'+spec.id+'-'+dx,[1.1,.45,1.1],v(spec.x+dx,spec.y+2.55,spec.z+1),flower);
      }
      islands.push(spec);
    }
    for(let i=0;i<7;i++)box('launch-path-'+i,[1.8,.1,1.1],v(0,.08,20+i*1.2),stone,true);
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
    // The three authored stations greet the path; the rest of the network stands
    // deeper in the grove on a phyllotaxis spiral, squashed along x so every
    // plinth stays west of the grove boundary and leaves a walking corridor.
    const grovePositions=[[-13,15],[-16,18],[-11,20]],petalRings=[];
    // Solved offline: >=2.3m between any two stations (plinth diameter 1.5),
    // x <= -10.4, z >= 15, and every centre within 36.1m of the 38.5m floor's.
    const groveSpot=k=>{const a=k*2.39996323,r=2.8+1.35*Math.sqrt(k);
      return [-18.5+Math.cos(a)*r*.9,28+Math.sin(a)*r*.85];};
    hooks.mindMaps.forEach((node,i)=>{
      const color=node.color,[x,z]=grovePositions[i]||groveSpot(i-grovePositions.length);
      cylinder('grove-plinth-'+i,1.5,.45,v(x,.3,z),stone,true);
      const sm=material('star-material-'+i,color,.4);
      const star=finish(B.MeshBuilder.CreatePolyhedron('memory-star-'+i,{type:1,size:i===0?.7:.45},scene),sm,v(x,1.6,z));
      star.isPickable=true;star.metadata={mmIndex:i};stars.push(star);
      ring('star-ring-'+i,.75,.045,v(x,.57,z),gold);
      const petals=[];
      for(let j=0;j<8;j++) {
        const angle=j*Math.PI/4,position=v(x+Math.sin(angle)*.58,.59,z+Math.cos(angle)*.58);
        const outline=ring('review-petal-'+i+'-'+j,.105,.024,position,gold);
        const fill=sphere('review-petal-fill-'+i+'-'+j,[.17,.035,.17],position,gold);
        petals.push({outline,fill});
      }
      petalRings.push({outline:B.Mesh.MergeMeshes(petals.map(p=>p.outline),true,true),fill:B.Mesh.MergeMeshes(petals.map(p=>p.fill),true,true)});
    });
    for(const [x,z] of [[-4,-3],[4,-3],[-6,13],[6,13]]) {
      cylinder('lamp-post',.15,1.8,v(x,.9,z),gold,false,8);
      const lm=sphere('lamp-'+x+'-'+z,[.42,.55,.42],v(x,1.9,z),glow);lampMeshes.push(lm);
    }
    // Capsule collision is independent of the decorative body. Its position is
    // the character's center, while feet are center minus .9 world units.
    const player=B.MeshBuilder.CreateBox('player-collider',{size:1},scene);
    player.isVisible=false; player.isPickable=false;
    player.ellipsoid=bv(.35,.88,.35);player.ellipsoidOffset=v(0,0,0);player.position=v(0,.18+b(.9),-6);
    const avatar=new B.TransformNode('avatar',scene);
    const character=window.createWorldCharacter(scene,avatar,{cloth,skin,boots,gold,book,shadows});
    const glider=new B.TransformNode('traveler-glider',scene);glider.parent=avatar;glider.position.y=2.15;
    const wing=finish(B.MeshBuilder.CreateCylinder('glider-canopy',{diameterTop:0,diameterBottom:3.8,height:.48,tessellation:8},scene),cloth,v(0,0,0),false,true);
    wing.parent=glider;wing.scaling.z=.62;
    for(const x of [-.45,.45]){const line=box('glider-cord',[.025,.4,.025],v(x,-.18,.14),gold);line.parent=glider;line.rotation.z=x*.5;}
    glider.setEnabled(false);
    const avatarMeshes=avatar.getChildMeshes();
    const camera=new B.FreeCamera('camera',v(0,5,-13),scene);camera.minZ=.15;camera.fov=.85;
    scene.activeCamera=camera;
    let yaw=0,pitch=.31,distance=8.8,sensitivity=1,paused=true,inputEnabled=true,disposed=false,stargazing=false;
    const skyRenderer=window.createWorldSkyScene(scene);
    let skyMotion={phase:'garden',elapsed:0},skyReveal=0;
    const tilt=value=>Core.clamp(value,-1.15,1.25);
    let vertical=0,grounded=false,coyote=0,jumpBuffer=0,velocity=v(0,0,0);
    let flight=Flight.initial(),glideToggle=false,checkpoint={x:0,y:.18,z:-6},lastIsland=null;
    let climbing=null,detachTime=0,sprinting=false,climbMotion={x:0,z:0};
    // Sprint stamina. The budget is the KS03 streak's, read once from synthetic data
    // by app.js: movement never reads or writes a Track record for it. Sprint only --
    // climbing and gliding spend nothing (WorldStamina holds that rule).
    const staminaBudget=Number.isFinite(hooks?.staminaBudget)?hooks.staminaBudget:Stamina.budgetFor(0);
    let stamina=Stamina.initial(staminaBudget),sprint=Stamina.sprintInitial(),dashPending=false;
    let facing=0,previousFacing=0,gliderOpen=0;
    const previousPosition=player.position.clone(),renderPosition=player.position.clone();
    let characterMotion=CharacterMotion.reset(characterSample());
    let previousCharacterMotion=characterMotion;
    character.reset(characterMotion);
    function characterSample(){return {position:player.position.asArray(),facing,vertical,grounded,climbing:!!climbing,
      gliding:flight.gliding,detaching:detachTime>0,sprinting,charge:flight.charge,paused};}
    function syncPose(){previousPosition.copyFrom(player.position);renderPosition.copyFrom(player.position);previousFacing=facing;
      characterMotion=CharacterMotion.reset(characterSample());previousCharacterMotion=characterMotion;character.reset(characterMotion);}
    const visitedIslands=new Set();
    const currentPad=()=>pads.find(p=>Math.hypot(player.position.x-p.x,player.position.z-p.z)<1.5&&Math.abs(player.position.y-b(.9)-p.y)<.35)||null;
    let reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    let environment=Core.initialEnvironment(),target={rain:false,night:false};
    const keys=new Set(),cleanup=[];
    const on=(object,event,fn,options)=>{object.addEventListener(event,fn,options);cleanup.push(()=>object.removeEventListener(event,fn,options));};
    const blocked=()=>paused||stargazing||!inputEnabled||document.hidden||document.activeElement!==canvas;
    const inGrove=()=>player.position.x< -9&&player.position.z>11;
    let destination=null;
    // The single surface lookup for geographic pins and landmarks. This demo
    // has one surface layer: a downward ray chooses its highest solid surface.
    function surfacePoint(point){
      if(!Number.isFinite(point?.x)||!Number.isFinite(point?.z))return null;
      const hit=scene.pickWithRay(new B.Ray(v(point.x,100,point.z),v(0,-1,0),150),mesh=>mesh.checkCollisions&&mesh!==player);
      return hit.hit?{x:point.x,y:hit.pickedPoint.y,z:point.z}:null;
    }
    // Clearance is measured BELOW the feet, never from world zero or a ray
    // starting above an island. Open air beyond a ledge has infinite clearance.
    function groundClearance(){
      const hit=scene.pickWithRay(new B.Ray(player.position,v(0,-1,0),200),mesh=>mesh.checkCollisions&&mesh!==player);
      return hit.hit?Math.max(0,player.position.y-b(.9)-hit.pickedPoint.y):Infinity;
    }
    function wallAhead(direction=v(Math.sin(facing),0,Math.cos(facing))){
      for(const height of [.25,-.5]){
        const hit=scene.pickWithRay(new B.Ray(player.position.add(bv(0,height,0)),direction,b(.9)),mesh=>mesh.checkCollisions&&mesh!==player);
        const normal=hit.hit&&hit.getNormal(true);
        if(!normal||Math.abs(normal.y)>.75)continue;
        normal.y=0;normal.normalize();
        if(B.Vector3.Dot(normal,direction)>0)normal.scaleInPlace(-1);
        return {normal,point:hit.pickedPoint.clone()};
      }
      return null;
    }
    function detachWall(){
      const normal=climbing.normal.clone();climbing=null;climbMotion={x:0,z:0};flight=Flight.initial();
      grounded=false;coyote=0;jumpBuffer=0;glideToggle=false;
      velocity.copyFrom(normal.scale(Flight.tuning.detachSpeed));vertical=Flight.tuning.detachUp;detachTime=Flight.tuning.detachSeconds;
    }
    function stepClimb(dt,controls){
      const up=controls?((keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)):0;
      const side=controls?((keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)):0;
      const inward=climbing.normal.scale(-1),wall=wallAhead(inward);
      if(!wall){
        // Step over a reached ledge only with upward input. Opening a panel
        // never moves the character onto a protective landing.
        if(up>0){
          const ahead=player.position.add(inward.scale(b(.85)));
          const top=scene.pickWithRay(new B.Ray(ahead.add(bv(0,1.2,0)),v(0,-1,0),b(3)),mesh=>mesh.checkCollisions&&mesh!==player);
          if(top.hit&&top.getNormal(true)?.y>.7&&top.pickedPoint.y>=player.position.y-b(1.1)&&top.pickedPoint.y<=player.position.y+b(.3)){
            player.position.y=top.pickedPoint.y+b(.92);player.moveWithCollisions(inward.scale(b(.85)));grounded=true;
          }
        }
        climbing=null;climbMotion={x:0,z:0};vertical=-.8;return;
      }
      climbing=wall;grounded=false;vertical=0;velocity.setAll(0);lastIsland=null;
      player.position.x=wall.point.x+wall.normal.x*b(.4);player.position.z=wall.point.z+wall.normal.z*b(.4);
      facing=Flight.turn(facing,Math.atan2(-wall.normal.x,-wall.normal.z),Flight.blend(Flight.tuning.turnResponse,dt));
      const factor=Flight.tuning.climbSpeed/(Math.hypot(side,up)||1),tangent=v(-wall.normal.z,0,wall.normal.x);
      climbMotion=controls?Flight.steer(climbMotion,{x:side*factor,z:up*factor},'climb',dt):{x:0,z:0};
      player.moveWithCollisions(v(tangent.x*climbMotion.x*dt,climbMotion.z*dt,tangent.z*climbMotion.x*dt));
      if(up<0&&groundClearance()<.12){climbing=null;grounded=true;vertical=-.8;}
    }
    function setDestination(point){
      destination=point&&['x','y','z'].every(key=>Number.isFinite(point[key]))?{...point}:null;
    }
    // Page coordinates for a world point, shared by the destination waypoint and the
    // sprint bar that rides beside the character. One projection, one inView rule.
    function projectPoint(point){
      const rect=canvas.getBoundingClientRect();
      const global=camera.viewport.toGlobal(engine.getRenderWidth(),engine.getRenderHeight());
      const p=B.Vector3.Project(point,B.Matrix.Identity(),scene.getTransformMatrix(),global);
      const x=rect.left+p.x*rect.width/engine.getRenderWidth(),y=rect.top+p.y*rect.height/engine.getRenderHeight();
      const inFront=B.Vector3.Dot(point.subtract(camera.position),camera.getForwardRay().direction)>camera.minZ;
      return {x,y,inView:inFront&&p.z>=0&&p.z<=1&&x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom};
    }
    function destinationProjection(){
      return destination?projectPoint(v(destination.x,destination.y,destination.z)):null;
    }
    // The rendered body, not the collider origin: the bar must sit beside the traveler
    // the player can see, which is the interpolated render position. It also reports the
    // traveler's ON-SCREEN height, because anything placed beside them has to clear a
    // body whose apparent size changes with the camera distance: a fixed pixel offset
    // clears the model at the default distance and sits on their chest zoomed in.
    function playerProjection(){
      const base=projectPoint(renderPosition.add(bv(0,.35,0)));
      const crown=projectPoint(renderPosition.add(bv(0,1.3,0)));
      return {...base,scale:Math.abs(crown.y-base.y)};
    }
    function destinationOccluded(){
      if(!destination)return false;
      const delta=v(destination.x,destination.y,destination.z).subtract(camera.position),length=delta.length();
      if(length<.1)return false;
      return !!scene.pickWithRay(new B.Ray(camera.position,delta.normalize(),length-.05),mesh=>mesh.checkCollisions&&mesh!==player).hit;
    }
    function lookAtSky(value) {
      if(value&&(!inGrove()||!grounded))return {ok:false,reason:!inGrove()?'Walk into the Memory Grove to look at the MM sky.':'Land first to begin grounded stargazing.'};
      if(!value&&skyMotion.phase==='garden')return {ok:true};
      skyMotion={phase:value?'entering':'leaving',elapsed:0,fromPosition:camera.position.clone(),
        fromRotation:(camera.rotationQuaternion||B.Quaternion.RotationYawPitchRoll(yaw,pitch,0)).clone(),
        fromFov:camera.fov,fromReveal:skyReveal};
      // Keep walking locked through both camera transitions, including early exit.
      stargazing=true;clearInput();velocity.setAll(0);vertical=0;
      return {ok:true};
    }
    function visitGrove() {
      const destination=v(-10,5,16);
      const floor=scene.pickWithRay(new B.Ray(destination,v(0,-1,0),8),mesh=>mesh.checkCollisions&&mesh!==player);
      if(!floor.hit)return false;
      clearInput();stargazing=false;velocity.setAll(0);vertical=0;
      flight=Flight.initial();climbing=null;detachTime=0;
      player.position.copyFrom(destination);player.position.y=floor.pickedPoint.y+b(.9);grounded=true;syncPose();
      return true;
    }
    function resetCamera() {yaw=0;pitch=.31;distance=8.8;}
    function reset() {stargazing=false;skyMotion={phase:'garden',elapsed:0};skyReveal=0;skyRenderer.setReveal(0);player.position.copyFrom(v(0,.18+b(.9),-6));vertical=0;velocity.setAll(0);clearInput();flight=Flight.initial();climbing=null;detachTime=0;sprinting=false;stamina=Stamina.initial(staminaBudget);sprint=Stamina.sprintInitial();dashPending=false;facing=0;syncPose();checkpoint={x:0,y:.18,z:-6};lastIsland=null;resetCamera();}
    function visitLauncher(){
      if(stargazing)return false;
      clearInput();flight=Flight.initial();velocity.setAll(0);vertical=0;
      climbing=null;detachTime=0;
      const pad=pads[0];player.position.set(pad.x,pad.y+b(.9),pad.z);grounded=true;syncPose();resetCamera();return true;
    }
    function recover(){
      clearInput();flight=Flight.initial();velocity.setAll(0);vertical=0;
      climbing=null;detachTime=0;
      player.position.set(checkpoint.x,checkpoint.y+b(.9),checkpoint.z);grounded=true;syncPose();
      hooks.announce?.('Back on solid ground. Nothing was lost.');
    }
    function step(dt) {
      previousPosition.copyFrom(player.position);previousFacing=facing;
      environment=Core.advanceEnvironment(environment,target,dt);
      if(paused||document.hidden)return;
      // Sprint stamina observes the resolved body once per step, ABOVE the climbing
      // return below, so no branch can skip it. Exhaustion drops the toggle here and
      // nowhere else, which is what keeps `sprinting` from disagreeing with the speed
      // it picks further down.
      sprint=Stamina.sprintAdvance(sprint,{speeds:Flight.tuning},dt);
      sprinting=Stamina.isSprinting(sprint,Flight.tuning);
      // Only the LOCKED run drains: a dash was already paid for at its press.
      stamina=Stamina.advance(stamina,{sprinting:sprint.locked,moving:Math.hypot(velocity.x,velocity.z)>.05,
        grounded:grounded&&!climbing,budget:staminaBudget},dt);
      // A dash can exhaust the budget BEFORE its hold reaches the run lock. Clear
      // that pending hold too, or a short budget recovers in time to lock itself.
      if((sprint.locked||sprint.held)&&!Stamina.canSprint(stamina)){sprint=Stamina.sprintUnlock(sprint);hooks.announce?.('Out of sprint. It comes back as you walk.');}
      // A companion owns input, not time: inertia, gravity and collision stay live.
      const controls=!blocked();
      if(controls&&keys.has('KeyQ')) yaw-=dt*1.6;
      if(controls&&keys.has('KeyE')) yaw+=dt*1.6;
      if(controls&&keys.has('KeyR')) pitch=tilt(pitch+dt*1.6);
      if(controls&&keys.has('KeyF')) pitch=tilt(pitch-dt*1.6);
      if(climbing){stepClimb(dt,controls);return;}
      const x=controls?((keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)):0;
      const z=controls?((keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)):0;
      const direction=v(x*Math.cos(yaw)+z*Math.sin(yaw),0,z*Math.cos(yaw)-x*Math.sin(yaw));
      const floor=scene.pickWithRay(new B.Ray(player.position,v(0,-1,0),b(1.15)),mesh=>mesh.checkCollisions&&mesh!==player);
      const clearance=floor.hit?player.position.y-floor.pickedPoint.y:Infinity;
      grounded=clearance<=b(.94)&&vertical<=0;
      // Keep the ellipsoid above the contacted tread before launching a jump.
      // Starting slightly inside a path stone made collision recovery cancel the
      // upward impulse, so Space silently failed at some Grove path positions.
      if(grounded&&clearance<b(.9))player.position.y+=b(.9)-clearance;
      const pad=currentPad();
      flight=Flight.advance(flight,{grounded,onPad:!!pad,controls,held:keys.has('KeyX'),toggle:glideToggle,vertical,
        clearance:glideToggle||flight.armed?groundClearance():0},dt);
      glideToggle=false;
      coyote=grounded?.1:Math.max(0,coyote-dt);jumpBuffer=Math.max(0,jumpBuffer-dt);
      if(flight.impulse){vertical=flight.impulse;grounded=false;coyote=0;jumpBuffer=0;hooks.announce?.('Launched. Hold W to reach Cloudrest; Space opens the glider.');}
      else if(jumpBuffer>0&&coyote>0) {vertical=Flight.tuning.jumpSpeed;grounded=false;coyote=0;jumpBuffer=0;flight=Flight.initial();}
      const speed=flight.gliding?Flight.tuning.glideSpeed:Stamina.sprintSpeed(sprint,Flight.tuning);
      if(flight.charge>0)direction.setAll(0);
      if(direction.lengthSquared()>0)direction.normalize().scaleInPlace(speed);
      // A dash is an IMPULSE, not merely a raised target. Steering toward a target that
      // is already decaying never catches it from a standstill -- the burst measured 9.1
      // against a 12 running speed -- so the press sets the body moving at dash speed,
      // along the held direction or, with no input, the way the traveler is facing.
      if(dashPending){
        dashPending=false;
        const heading=direction.lengthSquared()>0?direction.clone().normalize():v(Math.sin(facing),0,Math.cos(facing));
        velocity.x=heading.x*speed;velocity.z=heading.z*speed;
      }
      if(detachTime===0){
        const next=Flight.steer(velocity,direction,grounded?'ground':flight.gliding?'glide':'air',dt);
        velocity.x=next.x;velocity.z=next.z;
      }
      detachTime=Math.max(0,detachTime-dt);
      if(grounded) vertical=-.8;else vertical=Math.max(flight.gliding?-Flight.tuning.descent:-18,vertical-Flight.tuning.gravity*dt);
      const before=player.position.clone();
      // Low stairs use a bounded step-up; high ledges still require a jump.
      if(grounded&&direction.lengthSquared()>.1) {
        const ahead=player.position.add(v(velocity.x,0,velocity.z).normalize().scale(.5));
        const stepHit=scene.pickWithRay(new B.Ray(ahead.add(bv(0,.45,0)),v(0,-1,0),b(1.65)),mesh=>mesh.checkCollisions&&mesh!==player);
        if(stepHit.hit) {const rise=stepHit.pickedPoint.y+b(.9)-player.position.y;if(rise>.025&&rise<.24) player.position.y+=rise;}
      }
      player.moveWithCollisions(v(velocity.x*dt,vertical*dt,velocity.z*dt));
      if(vertical>0&&player.position.y-before.y<vertical*dt*.15) vertical=0;
      if(player.position.y< -7)recover();
      if(!grounded)lastIsland=null;
      if(grounded){
        const island=islands.find(p=>Math.hypot(player.position.x-p.x,player.position.z-p.z)<p.r&&Math.abs(player.position.y-b(.9)-p.y)<.65);
        lastIsland=island?.id||null;
        if(island){
          checkpoint={x:island.x,y:island.y+.28,z:island.z};
          if(!visitedIslands.has(island.id)){visitedIslands.add(island.id);hooks.announce?.('Landed on '+island.name+'. '+(visitedIslands.size===2?'Both islands explored. Glide back to the garden whenever you like.':'The next island is east.'));}
        }else if(player.position.y<2)checkpoint={x:0,y:.18,z:-6};
      }
      if(direction.lengthSquared()>.05) {
        const desired=Math.atan2(direction.x,direction.z);
        facing=Flight.turn(facing,desired,Flight.blend(Flight.tuning.turnResponse,dt));
      }
    }
    // Observe resolved simulation state, including the early climbing return.
    // This feed drives presentation only; it cannot move the body.
    const simulation=Core.stepper(dt=>{previousCharacterMotion=characterMotion;step(dt);characterMotion=CharacterMotion.advance(characterMotion,characterSample(),dt);});
    let drag=null;
    function endDrag() {
      const previousDrag=drag;drag=null;
      if(previousDrag&&canvas.hasPointerCapture(previousDrag.id))canvas.releasePointerCapture(previousDrag.id);
    }
    function clearInput() {
      keys.clear();jumpBuffer=0;glideToggle=false;flight.charge=0;climbMotion={x:0,z:0};endDrag();
      // The physical key is gone, so the hold ends -- but a LOCKED run is not input and
      // survives, which is what keeps a run alive across opening a companion panel.
      sprint=Stamina.sprintRelease(sprint);dashPending=false;
    }
    on(canvas,'keydown',event=>{
      if(event.isComposing||event.ctrlKey||event.metaKey||event.altKey||blocked())return;
      if(event.code==='Home'){event.preventDefault();if(!event.repeat)resetCamera();return;}
      if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','Space','KeyQ','KeyE','KeyR','KeyF','KeyX'].includes(event.code)) {
        event.preventDefault();
        // One press is a DASH. Holding it past dashSeconds locks running, and a short
        // dash is the only unsprint; WorldStamina owns every part of that rule.
        // Sprint is a GROUND move, so the BURST is grounded-only. A press that cannot
        // dash is still heard while running, because the short-dash unsprint has to
        // reach a body that is mid-jump or bouncing over a tread -- otherwise the press
        // vanishes and the player is stuck in a run they asked to end.
        if((event.code==='ShiftLeft'||event.code==='ShiftRight')&&!event.repeat&&!keys.has(event.code)&&!climbing&&!flight.gliding){
          if(grounded){
            const dash=Stamina.sprintPress(sprint,stamina,Flight.tuning);
            sprint=dash.sprint;
            if(dash.dashed){stamina=Stamina.spend(stamina,staminaBudget,dash.cost);dashPending=true;}
          }else if(sprint.locked)sprint=Stamina.sprintHold(sprint);
        }
        keys.add(event.code);
        if(event.code==='Space'&&!event.repeat){
          const wall=!climbing&&detachTime===0?wallAhead():null;
          const action=Flight.spaceAction({climbing:!!climbing,wall:!!wall,grounded,coyote,gliding:flight.gliding,clearance:groundClearance()});
          if(action==='detach')detachWall();
          else if(action==='climb'){climbing=wall;climbMotion={x:0,z:0};flight=Flight.initial();vertical=0;velocity.setAll(0);grounded=false;coyote=0;jumpBuffer=0;glideToggle=false;}
          else if(action==='jump')jumpBuffer=.13;
          else if(action==='glide'||action==='fold')glideToggle=true;
        }
      }
    });
    on(window,'keyup',event=>{
      keys.delete(event.code);
      // The release decides what the press meant, so it only counts once BOTH Shift
      // keys are up: letting go of one while the other is held is still a hold.
      if((event.code==='ShiftLeft'||event.code==='ShiftRight')&&!keys.has('ShiftLeft')&&!keys.has('ShiftRight'))
        sprint=Stamina.sprintRelease(sprint);
    });
    on(window,'blur',()=>{clearInput();simulation.reset();});
    on(document,'visibilitychange',()=>{clearInput();simulation.reset();});
    on(canvas,'blur',clearInput);
    on(canvas,'pointerdown',event=>{if(paused||stargazing||!inputEnabled||event.button!==0)return;canvas.focus();drag={x:event.clientX,y:event.clientY,moved:0,id:event.pointerId};canvas.setPointerCapture(event.pointerId);});
    // Capture is an event-routing aid, not the lifetime of a held gesture.
    // Window listeners keep a drag alive if capture is lost while W is held.
    // Release/cancel, focus loss and panel entry still end it explicitly.
    on(window,'pointermove',event=>{
      if(!drag||event.pointerId!==drag.id||blocked())return;
      if(!(event.buttons&1)){endDrag();return;}
      const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
      drag.moved+=Math.abs(dx)+Math.abs(dy);yaw+=dx*.005*sensitivity;pitch=tilt(pitch+dy*.004*sensitivity);drag.x=event.clientX;drag.y=event.clientY;
    });
    on(window,'pointerup',event=>{
      if(!drag||event.pointerId!==drag.id)return;
      if(drag&&drag.moved<6&&!blocked()) {
        const rect=canvas.getBoundingClientRect();
        const hit=scene.pick(event.clientX-rect.left,event.clientY-rect.top,mesh=>!!mesh.metadata?.mmIndex||mesh.metadata?.mmIndex===0);
        if(hit?.hit)hooks.selectMM(hit.pickedMesh.metadata.mmIndex);
      }
      endDrag();
    });
    on(window,'pointercancel',event=>{if(drag?.id===event.pointerId)endDrag();});
    on(canvas,'contextmenu',event=>event.preventDefault());
    on(canvas,'wheel',event=>{if(paused||!inputEnabled)return;event.preventDefault();distance=Core.clamp(distance+event.deltaY*.008,3,13);},{passive:false});
    // Rain is a bounded line batch, not hundreds of independent scene objects.
    const rainLines=Array.from({length:120},()=>[v(0,0,0),v(0,0,0)]);
    const rainSeeds=rainLines.map(()=>({x:random()*22-11,z:random()*20-10,y:random()*12}));
    const rainMesh=B.MeshBuilder.CreateLineSystem('rain',{lines:rainLines,updatable:true},scene);
    rainMesh.color=c('#d2e5df');rainMesh.isPickable=false;rainMesh.alwaysSelectAsActiveMesh=true;
    const snowLines=Array.from({length:160},()=>[v(0,0,0),v(0,0,0)]);
    const snowMesh=B.MeshBuilder.CreateLineSystem('snow',{lines:snowLines,updatable:true},scene);
    snowMesh.color=c('#fffaf0');snowMesh.isPickable=false;snowMesh.alwaysSelectAsActiveMesh=true;
    const skyGold=material('sky-halo','#fff1c0',.65),halos=[];
    for(let i=0;i<3;i++){
      const halo=ring('heavenly-halo-'+i,15+i*6,.22,v(-13,40+i*3,80),skyGold);
      halo.rotation.x=.4;halo.rotation.z=-.28;halo.isPickable=false;halos.push(halo);
    }
    // Read the authored meshes before batching: the geographic map shares the
    // scene's coordinates and dimensions rather than maintaining another island.
    const mapNames=/^(garden-floor|floating-island-|launch-pad-|launch-path-|plaza-base|arrival-stone-|grove-path-|terrace-step-|terrace$|stream$|bridge$|clock-plinth$|gateway-pier$|gateway-lintel$|crown-|grove-plinth-)/;
    // The first render has not happened yet. Update EVERY collider transform,
    // including the island below the map floor, before any height ray is cast.
    scene.meshes.forEach(mesh=>mesh.computeWorldMatrix(true));
    const mapFeatures=scene.meshes.filter(mesh=>mapNames.test(mesh.name)).map(mesh=>{
      const bounds=mesh.getBoundingInfo().boundingBox;
      return {name:mesh.name,x:bounds.centerWorld.x,z:bounds.centerWorld.z,width:bounds.extendSizeWorld.x*2,depth:bounds.extendSizeWorld.z*2,
        round:/^(garden-floor|floating-island-|launch-pad-|plaza-base|clock-plinth|crown-|grove-plinth)/.test(mesh.name)};
    });
    const landmarkSpecs=[['arrival','Garden approach','arrival-stone-3','path'],['plaza','Clock Plaza','clock-plinth','clock'],
      ['grove','Memory Grove','grove-plinth-0','star'],['bridge','Little bridge','bridge','bridge'],
      ['terrace','North terrace','terrace','leaf'],['gateway','Garden gateway','gateway-lintel','gate'],
      ['launcher','Windseed launcher','launch-pad-garden','launch'],['cloudrest','Cloudrest','launch-pad-cloudrest','island'],['windward','Windward Isle','launch-pad-windward','island']];
    const landmarks=landmarkSpecs.map(([id,name,meshName,icon])=>{
      const f=mapFeatures.find(feature=>feature.name===meshName);return {id,name,icon,...surfacePoint(f)};
    });
    hooks.cartography?.({features:mapFeatures,landmarks});
    // Batch stationary pieces by material and collision behavior. Animated
    // foliage, the avatar and selectable stars retain their individual meshes.
    const animated=new Set([...foliage.map(f=>f.mesh),...stars,...halos,...petalRings.flatMap(petal=>[petal.outline,petal.fill]),player,rainMesh,snowMesh]);
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
      // Interpolate presentation only. Collision, wall probes and glide clearance
      // always use the fixed-step body; extra rendered frames do not repeat a pose.
      renderPosition.copyFrom(B.Vector3.Lerp(previousPosition,player.position,simulation.alpha));
      avatar.position.copyFrom(renderPosition.subtract(bv(0,.9,0)));
      avatar.rotation.y=Flight.turn(previousFacing,facing,simulation.alpha);
      const poseBlend=Flight.blend(Flight.tuning.poseResponse,dt);
      const renderedMotion={...characterMotion,sample:{...characterMotion.sample,
        position:renderPosition.asArray(),facing:avatar.rotation.y}};
      for(const key of ['groundDistance','climbDistance','speed','turnRate'])
        renderedMotion[key]=previousCharacterMotion[key]+(characterMotion[key]-previousCharacterMotion[key])*simulation.alpha;
      character.update(renderedMotion,dt,reduced);
      glider.setEnabled(flight.gliding);
      gliderOpen=flight.gliding?gliderOpen+(1-gliderOpen)*poseBlend:0;
      glider.scaling.y=.15+.85*gliderOpen;
      const focus=renderPosition.add(bv(0,.65,0));
      const desired=focus.add(v(-Math.sin(yaw)*distance*Math.cos(pitch),distance*Math.sin(pitch),-Math.cos(yaw)*distance*Math.cos(pitch)));
      const delta=desired.subtract(focus),len=delta.length();
      const obstruction=scene.pickWithRay(new B.Ray(focus,delta.normalize(),len),mesh=>mesh.checkCollisions&&mesh!==player);
      const safe=obstruction.hit?focus.add(delta.scale(Math.max(.45,obstruction.distance-.35))):desired;
      const normalPose={position:safe,rotation:B.Quaternion.RotationYawPitchRoll(yaw,pitch,0),fov:.85};
      const skyPose=skyRenderer.pose(player.position.y+b(1.45),player.position)||normalPose;
      if(skyMotion.phase==='entering'||skyMotion.phase==='leaving') {
        const entering=skyMotion.phase==='entering',destination=entering?skyPose:normalPose;
        skyMotion.elapsed+=Math.min(dt,.25);
        const t=reduced?1:Core.clamp(skyMotion.elapsed/(entering?1.6:1.1),0,1),ease=t*t*(3-2*t);
        camera.position.copyFrom(B.Vector3.Lerp(skyMotion.fromPosition,destination.position,ease));
        camera.rotationQuaternion=B.Quaternion.Slerp(skyMotion.fromRotation,destination.rotation,ease);
        camera.fov=skyMotion.fromFov+(destination.fov-skyMotion.fromFov)*ease;
        skyReveal=entering?Core.clamp((t-.65)/.35,0,1):skyMotion.fromReveal*(1-Core.clamp(t*3,0,1));
        if(t===1){skyMotion.phase=entering?'viewing':'garden';stargazing=entering;}
      } else {
        const pose=skyMotion.phase==='viewing'?skyPose:normalPose;
        camera.position.copyFrom(pose.position);camera.rotationQuaternion=pose.rotation;camera.fov=pose.fov;
        skyReveal=stargazing?1:0;
      }
      // Collision can bring the camera into the traveler during a climb.
      // Fade only the character's meshes, preserving shared world materials.
      const avatarVisibility=Core.clamp((B.Vector3.Distance(camera.position,focus)-b(1.2)),0,1);
      avatarMeshes.forEach(mesh=>{mesh.visibility=avatarVisibility;});
      skyRenderer.setReveal(skyReveal);
      // Stargazing darkens what is DRAWN as the stars appear; the live weather
      // and clock state in environment is never written, so every cue that
      // reads it is unchanged and the garden returns to the real hour on exit.
      const env=environment,night=Math.max(env.night,skyReveal),dim=1-night*.76;
      scene.clearColor=B.Color4.Lerp(new B.Color4(.68,.82,.83,1),new B.Color4(.34,.47,.5,1),env.rain);
      scene.clearColor=B.Color4.Lerp(scene.clearColor,new B.Color4(.12,.22,.28,1),env.storm*.65);
      scene.clearColor=B.Color4.Lerp(scene.clearColor,new B.Color4(.75,.81,.83,1),env.snow*.7);
      scene.clearColor=B.Color4.Lerp(scene.clearColor,new B.Color4(.74,.7,.83,1),env.halo*.65);
      scene.clearColor=B.Color4.Lerp(scene.clearColor,new B.Color4(.055,.095,.16,1),night);
      scene.fogColor=new B.Color3(scene.clearColor.r,scene.clearColor.g,scene.clearColor.b);
      scene.fogDensity=.008+env.rain*.009+env.snow*.005+env.storm*.004;
      sun.intensity=(.8-env.rain*.5)*dim;hemi.intensity=.65-env.rain*.13-night*.25;
      hemi.diffuse=B.Color3.Lerp(c('#f2f3d6'),c('#809fcb'),night);
      stone.diffuseColor=B.Color3.Lerp(c('#ddd9b8'),c('#9eae9e'),env.wetness);
      stone.diffuseColor=B.Color3.Lerp(stone.diffuseColor,c('#ecf0ec'),env.snowCover*.9);
      grass.diffuseColor=B.Color3.Lerp(c('#82ad72'),c('#e2eeee'),env.snowCover);
      leaf.diffuseColor=B.Color3.Lerp(c('#55936e'),c('#cfdfd8'),env.snowCover*.8);
      leafLight.diffuseColor=B.Color3.Lerp(c('#91b573'),c('#edf0e6'),env.snowCover*.8);
      stone.specularColor=new B.Color3(.06,.06,.06).scale(1+env.wetness*5);
      water.diffuseColor=B.Color3.Lerp(c('#68b8ba'),c('#507e8c'),env.rain*.6+night*.4);
      glow.emissiveColor=c('#f1dea0').scale(.2+night*.8);
      foliage.forEach(({mesh,phase,base})=>{mesh.rotation.z=base+(reduced?0:Math.sin(env.elapsed*1.3+phase)*.02*env.wind);});
      stars.forEach((star,i)=>{star.rotation.y=reduced?0:env.elapsed*.24;star.position.y=1.6+(reduced?0:Math.sin(env.elapsed+i)*.08);});
      rainMesh.setEnabled(env.rain>.02&&!reduced);rainMesh.alpha=env.rain*.5;
      if(rainMesh.isEnabled()) {
        rainSeeds.forEach((drop,i)=>{const y=((drop.y-env.elapsed*(9+env.rain*3))%12+12)%12;
          const x=player.position.x+drop.x,z=player.position.z+drop.z,altitude=player.position.y-2;
          rainLines[i][0].set(x,y+altitude,z);rainLines[i][1].set(x-env.wind*.18,y+.65+altitude,z-.09);
        });
        B.MeshBuilder.CreateLineSystem('rain',{lines:rainLines,instance:rainMesh});
      }
      snowMesh.setEnabled(env.snow>.02&&!reduced);snowMesh.alpha=env.snow*.85;
      if(snowMesh.isEnabled()){
        for(let i=0;i<80;i++){
          const drop=rainSeeds[i],y=((drop.y-env.elapsed*1.3)%12+12)%12+player.position.y-2;
          const x=player.position.x+drop.x+Math.sin(env.elapsed*.5+i)*.6,z=player.position.z+drop.z;
          snowLines[i*2][0].set(x-.045,y,z);snowLines[i*2][1].set(x+.045,y,z);
          snowLines[i*2+1][0].set(x,y-.045,z);snowLines[i*2+1][1].set(x,y+.045,z);
        }
        B.MeshBuilder.CreateLineSystem('snow',{lines:snowLines,instance:snowMesh});
      }
      halos.forEach(halo=>{halo.setEnabled(env.halo>.02);halo.visibility=env.halo*.65;});
      scene.render();
      // Match the displayed camera every rendered frame, including a stationary
      // orbit. Map arrows follow the view; the avatar's facing is separate.
      hooks.navigation?.({x:player.position.x,y:player.position.y-b(.9),z:player.position.z,facing:avatar.rotation.y,yaw,
        destination:destinationProjection()});
      if(stargazing)hooks.skyFrame({phase:skyMotion.phase,reveal:skyReveal,points:skyRenderer.project()});
      if(dt>0&&dt<1){samples.push(dt*1000);if(samples.length>600)samples.shift();}
      uiElapsed+=dt;
      if(uiElapsed>.1){uiElapsed=0;hooks.tick({environment:env,position:player.position.asArray(),inGrove:inGrove(),grounded,flight:flightStatus(),metrics:metrics(),
        stamina:{value:stamina.value,max:staminaBudget,exhausted:stamina.exhausted},sprinting,
        sprint:{locked:sprint.locked,held:sprint.held,speed:sprint.speed},player:playerProjection()});}
    }
    function flightStatus(){return {...flight,pad:currentPad()?.id||null,island:lastIsland,visited:[...visitedIslands],checkpoint:{...checkpoint},climbing:!!climbing,
      wallNormal:climbing?.normal.asArray()||null,clearance:groundClearance(),minGlideHeight:Flight.MIN_GLIDE_HEIGHT};}
    function metrics() {
      const sorted=[...samples].sort((a,b)=>a-b);
      return {fps:samples.length?Math.round(1000/(samples.reduce((a,b)=>a+b,0)/samples.length)):0,
        p95:sorted.length?Math.round(sorted[Math.floor((sorted.length-1)*.95)]):0,
        drawCalls:instrumentation.drawCallsCounter.current,meshes:scene.meshes.length,
        resolution:engine.getRenderWidth()+' × '+engine.getRenderHeight(),seconds:Math.round(elapsedRun),
        renderer:engine.getGlInfo().renderer,version:B.Engine.Version};
    }
    let reviewCues=[];
    function setReviewCues(nodes) {
      reviewCues=nodes.map(node=>({id:node.id,pending:node.pending,reviewed:node.reviewed}));
      petalRings.forEach((petal,i)=>{
        petal.outline.setEnabled(!!(nodes[i]?.pending||nodes[i]?.reviewed));
        petal.fill.setEnabled(!!nodes[i]?.pending);
      });
    }
    setReviewCues(hooks.mindMaps);
    on(canvas,'webglcontextlost',event=>{event.preventDefault();paused=true;hooks.error('The graphics context was lost. Notebook drafts remain available; reload when ready.');});
    engine.runRenderLoop(render);
    return {
      pause(value){paused=value;clearInput();simulation.reset();},
      setInputEnabled(value){inputEnabled=value;clearInput();},
      reset, resetCamera, lookAtSky, visitGrove, visitLauncher, setReviewCues, surfacePoint, setDestination,
      setSkyView(graph,view,viewport){skyRenderer.sync(graph,view,viewport);},setWeather(patch){target={...target,...patch};},
      setReduced(value){reduced=value;},setSensitivity(value){sensitivity=value;},
      setQuality(value){quality=value;resize();},metrics,
      snapshot(){return {characterScale:S,position:player.position.asArray(),grounded,sprinting,
        stamina:{value:stamina.value,max:staminaBudget,exhausted:stamina.exhausted},
        sprint:{locked:sprint.locked,held:sprint.held,speed:sprint.speed},player:playerProjection(),
        motion:{velocity:velocity.asArray(),facing,renderPosition:renderPosition.asArray()},flight:flightStatus(),gliderVisible:glider.isEnabled(),effects:{rain:rainMesh.isEnabled(),snow:snowMesh.isEnabled(),halos:halos.some(h=>h.isEnabled())},inGrove:inGrove(),stargazing,skyPhase:skyMotion.phase,skyReveal,skyStars:skyRenderer.snapshot(),skyField:skyRenderer.fieldSnapshot(),reviewCues:reviewCues.map(cue=>({...cue})),paused,inputEnabled,vertical,jumpBuffer,coyote,environment:{...environment},target:{...target},reduced,yaw,pitch,roll:0,
        characterMotion:{...characterMotion,sample:{...characterMotion.sample,position:[...characterMotion.sample.position]}},
        character:character.snapshot(),
        cameraForward:camera.getForwardRay().direction.asArray(),cameraUp:camera.getDirection(B.Axis.Y).asArray(),
        destination:destination?{...destination,projection:destinationProjection(),occluded:destinationOccluded()}:null,quality,metrics:metrics()};},
      dispose(){disposed=true;engine.stopRenderLoop(render);cleanup.forEach(fn=>fn());skyRenderer.dispose();instrumentation.dispose();scene.dispose();engine.dispose();}
    };
  };
})();
