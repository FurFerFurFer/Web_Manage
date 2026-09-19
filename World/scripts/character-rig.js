(function () {
  'use strict';
  // A1: local, articulated botanical traveler. All transforms below are decorative;
  // the simulation owns position/facing, collision, Space priority and glide eligibility.
  window.createWorldCharacter=function(scene,root,{cloth,skin,boots,gold,book,shadows}){
    const B=window.BABYLON,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
    const joints={},meshes=[],D=window.WorldCharacterAnimation.dimensions;
    const vec=(x=0,y=0,z=0)=>new B.Vector3(x,y,z);
    function pivot(name,parent,position){
      const node=new B.TransformNode('traveler-'+name,scene);node.parent=parent;node.position.copyFrom(vec(...position));
      joints[name]=node;return node;
    }
    function finish(mesh,parent,position,mat){
      mesh.parent=parent;mesh.position.copyFrom(vec(...position));mesh.material=mat;
      mesh.isPickable=false;mesh.checkCollisions=false;mesh.receiveShadows=true;
      shadows.addShadowCaster(mesh);meshes.push(mesh);return mesh;
    }
    function oval(name,parent,position,size,mat){
      const mesh=finish(B.MeshBuilder.CreateSphere('traveler-'+name,{diameter:1,segments:8},scene),parent,position,mat);
      mesh.scaling.copyFrom(vec(...size));return mesh;
    }
    function box(name,parent,position,size,mat){
      return finish(B.MeshBuilder.CreateBox('traveler-'+name,{width:size[0],height:size[1],depth:size[2]},scene),parent,position,mat);
    }
    function segment(name,parent,length,top,bottom,mat){
      return finish(B.MeshBuilder.CreateCylinder('traveler-'+name,{height:length,diameterTop:top,diameterBottom:bottom,tessellation:10},scene),parent,[0,-length/2,0],mat);
    }
    function material(name,color){
      const mat=new B.StandardMaterial('traveler-'+name,scene);mat.diffuseColor=B.Color3.FromHexString(color);
      mat.specularColor=new B.Color3(.035,.035,.035);return mat;
    }
    cloth=material('tunic','#4b7050');
    const trousers=material('trousers','#52654c'),hair=material('hair','#34382d'),pages=material('pages','#e6debb');
    const pelvis=pivot('pelvis',root,[0,D.restPelvis,0]);
    oval('trousers-seat',pelvis,[0,-.035,0],[.37,.23,.25],trousers);
    const spine=pivot('spine',pelvis,[0,.10,0]);
    const chest=pivot('chest-joint',spine,[0,.18,0]);
    // Overlapping tapered volumes keep the waist/shoulders connected while the
    // existing articulated hierarchy bends. These are still rigid surfaces.
    oval('lower-tunic',spine,[0,.045,0],[.35,.32,.25],cloth);
    oval('tunic',chest,[0,.065,0],[.425,.315,.27],cloth);
    oval('tunic-hem',pelvis,[0,.01,0],[.385,.18,.275],cloth);
    const belt=finish(B.MeshBuilder.CreateCylinder('traveler-belt',{height:.045,diameter:.36,tessellation:12},scene),pelvis,[0,.09,0],boots);belt.scaling.z=.74;
    box('buckle',pelvis,[0,.09,.14],[.065,.05,.02],gold);
    oval('leaf-pin',chest,[-.11,.12,.129],[.035,.075,.012],gold).rotation.z=-.45;
    segment('neck',chest,.10,.12,.12,skin).position.set(0,.255,0);
    const head=pivot('head-joint',chest,[0,.42,0]);
    oval('head',head,[0,0,0],[.265,.335,.255],skin);
    oval('hair-cap',head,[0,.115,-.018],[.287,.185,.278],hair);
    oval('hair-back',head,[0,.025,-.096],[.28,.22,.095],hair);
    oval('fringe',head,[.04,.112,.087],[.24,.115,.11],hair).rotation.z=-.23;
    for(const side of [-1,1]){
      oval('ear',head,[side*.13,0,0],[.055,.09,.06],skin);
      oval('eye',head,[side*.052,.02,.119],[.026,.029,.015],boots);
      box('brow',head,[side*.052,.060,.114],[.041,.009,.012],hair).rotation.z=side*.09;
    }
    oval('nose',head,[0,-.019,.131],[.037,.066,.038],skin);
    box('mouth',head,[0,-.082,.106],[.04,.008,.012],boots);
    for(const side of ['left','right']){
      const sign=side==='left'?-1:1;
      const hip=pivot(side+'Hip',pelvis,[sign*D.hipWidth,-.01,0]);
      oval(side+'HipCover',hip,[0,-.02,0],[.19,.20,.20],trousers);
      segment(side+'Thigh',hip,D.thigh,.165,.12,trousers);
      oval(side+'ThighForm',hip,[0,-D.thigh*.43,0],[.167,D.thigh*.85,.17],trousers);
      const knee=pivot(side+'Knee',hip,[0,-D.thigh,0]);
      oval(side+'KneeCover',knee,[0,0,0],[.133,.135,.137],trousers);
      segment(side+'Shin',knee,D.shin,.12,.085,trousers);
      oval(side+'CalfForm',knee,[0,-D.shin*.36,-.008],[.122,D.shin*.70,.133],trousers);
      const ankle=pivot(side+'Ankle',knee,[0,-D.shin,0]);
      // The cuff follows the shin, not the foot: ankle flex must not stick
      // a rigid boot tube out through the heel.
      segment(side+'BootTop',knee,.13,.095,.115,boots).position.y=-D.shin+.065;
      oval(side+'Boot',ankle,[0,-.047,.045],[.14,.12,.225],boots);
      const toe=pivot(side+'Toe',ankle,[0,D.toePivotY,D.toePivotZ]);
      oval(side+'BootToe',toe,[0,0,.045],[.135,.10,.14],boots);
      const shoulder=pivot(side+'Shoulder',chest,[sign*.222,.17,0]);
      oval(side+'SleeveCap',shoulder,[0,-.04,0],[.16,.20,.18],cloth);
      segment(side+'UpperArm',shoulder,.29,.135,.095,cloth);
      const elbow=pivot(side+'Elbow',shoulder,[0,-.29,0]);
      oval(side+'ElbowCover',elbow,[0,0,0],[.096,.096,.098],skin);
      segment(side+'Forearm',elbow,.26,.095,.063,skin);
      const wrist=pivot(side+'Wrist',elbow,[0,-.26,0]);
      oval(side+'Hand',wrist,[0,-.058,0],[.082,.135,.067],skin);
      oval(side+'Thumb',wrist,[-sign*.035,-.047,.018],[.039,.074,.042],skin);
    }
    const carry=pivot('carry-socket',joints.rightWrist,[.055,-.10,.015]);
    const stow=pivot('stow-socket',pelvis,[.205,-.025,-.17]);stow.rotation.set(0,-.35,.16);
    const notebook=new B.TransformNode('traveler-notebook',scene);notebook.parent=carry;
    box('notebook-pages',notebook,[0,0,0],[.056,.255,.175],pages);
    for(const sign of [-1,1])box('notebook-cover',notebook,[sign*.036,0,0],[.018,.28,.195],book);
    box('notebook-spine',notebook,[0,0,-.095],[.085,.28,.018],book);
    box('notebook-clasp',notebook,[.048,0,.01],[.012,.035,.055],gold);
    const animator=window.WorldCharacterAnimation.create(window.WorldFlight.tuning);
    let animation,lastMode='idle',stowed=false,transfer=null;
    function socketPose(socket){
      root.computeWorldMatrix(true);socket.computeWorldMatrix(true);
      const matrix=socket.getWorldMatrix().multiply(B.Matrix.Invert(root.getWorldMatrix()));
      const position=vec(),rotation=B.Quaternion.Identity();matrix.decompose(vec(),rotation,position);
      return {position,rotation};
    }
    function moveNotebook(wantsStow,dt,snap){
      const socket=wantsStow?stow:carry;
      if(snap){stowed=wantsStow;transfer=null;notebook.parent=socket;notebook.position.setAll(0);notebook.rotationQuaternion=B.Quaternion.Identity();}
      else{
        if((transfer?transfer.to:stowed)!==wantsStow){
          const from=socketPose(notebook);transfer={to:wantsStow,age:0,...from};
          notebook.parent=root;notebook.position.copyFrom(from.position);notebook.rotationQuaternion=from.rotation.clone();
        }
        if(transfer){
          transfer.age+=dt;const t=clamp(transfer.age/.30,0,1),u=t*t*(3-2*t),to=socketPose(socket);
          notebook.position.copyFrom(B.Vector3.Lerp(transfer.position,to.position,u));
          notebook.position.y+=Math.sin(Math.PI*u)*.10;
          notebook.position.x+=Math.sin(Math.PI*u)*.10;
          notebook.rotationQuaternion.copyFrom(B.Quaternion.Slerp(transfer.rotation,to.rotation,u));
          if(t===1){stowed=wantsStow;transfer=null;notebook.parent=socket;notebook.position.setAll(0);notebook.rotationQuaternion=B.Quaternion.Identity();}
        }
      }
      notebook.scaling.setAll(1);
    }
    function update(motion,dt,reduced=false,snap=false){
      dt=Number.isFinite(dt)?clamp(dt,0,.1):0;
      animation=snap?animator.reset(motion):animator.update(motion,dt,reduced);
      const p=animation.pose;
      pelvis.position.set(p.pelvisX,p.pelvisY,p.pelvisZ);pelvis.rotation.set(0,p.pelvisYaw,p.pelvisRoll);
      spine.rotation.set(p.spineX,p.spineY,p.spineZ);chest.rotation.set(p.chestX,p.chestY,p.chestZ);
      head.rotation.set(p.headX,p.headY,p.headZ);
      for(const side of ['left','right']){
        joints[side+'Hip'].rotation.set(p[side+'Hip'],0,p[side+'HipZ']);
        joints[side+'Knee'].rotation.x=p[side+'Knee'];
        const ankle=joints[side+'Ankle'];ankle.rotationQuaternion=null;
        ankle.rotation.set(p[side+'Ankle'],0,p[side+'AnkleZ']);
        if(p.footIK>.001){
          // Keep the supporting forefoot's world orientation while pelvis and
          // knee turn above it. Local ankle Euler cancellation cannot do this.
          root.computeWorldMatrix(true);ankle.parent.computeWorldMatrix(true);
          const parentRotation=B.Quaternion.Identity(),rootRotation=B.Quaternion.Identity();
          ankle.parent.getWorldMatrix().decompose(vec(),parentRotation,vec());
          root.getWorldMatrix().decompose(vec(),rootRotation,vec());
          const desired=rootRotation.multiply(B.Quaternion.RotationYawPitchRoll(p[side+'FootYaw'],p[side+'FootPitch'],0));
          const relative=parentRotation.conjugate().multiply(desired);
          ankle.rotationQuaternion=B.Quaternion.Slerp(B.Quaternion.RotationYawPitchRoll(0,p[side+'Ankle'],p[side+'AnkleZ']),relative,clamp(p.footIK,0,1));
        }
        joints[side+'Toe'].rotation.x=p[side+'Toe'];
        joints[side+'Shoulder'].rotation.set(p[side+'ShoulderX'],p[side+'ShoulderY'],p[side+'ShoulderZ']);
        joints[side+'Elbow'].rotation.x=p[side+'Elbow'];
        joints[side+'Wrist'].rotation.set(p[side+'WristX'],0,p[side+'WristZ']);
      }
      moveNotebook(motion.notebook==='stowed',dt,snap);lastMode=motion.mode;
    }
    return {meshes,update,reset(motion){update(motion,0,false,true);},
      snapshot(){return {kind:'articulated-botanical-traveler',mode:lastMode,phase:animation.phase,climbPhase:animation.climbPhase,
        animation:{domain:animation.domain,gait:animation.gait,weights:animation.weights,cycles:animation.cycles,cadence:animation.cadence,settled:animation.settled,
          feet:animation.feet,pose:animation.pose},
        notebook:stowed?'stowed':'carried',notebookScale:notebook.scaling.x,notebookTransferring:!!transfer,
        joints:Object.fromEntries(Object.entries(joints).map(([name,node])=>[name,(node.rotationQuaternion?node.rotationQuaternion.toEulerAngles():node.rotation).asArray()]))};}};
  };
})();
