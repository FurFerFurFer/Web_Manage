(function () {
  'use strict';
  // Stargazing holds the viewpoint at the grounded player. Dragging rotates the
  // displayed constellation on a spherical sky; zoom changes magnification.
  // UI projection follows that display mapping, never changing KS03 or slot.pos.
  window.createWorldSkyScene=function (scene) {
    const B=window.BABYLON,Motion=window.WorldSkyMotion,engine=scene.getEngine(),eye=new B.Vector3(-10,0,16);
    let graph=null,view=null,viewport=null,stars=[],links=null,reveal=0,dirty=true,rotation=Motion.identity(),radius=60;
    const point=(x,y)=>eye.add(B.Vector3.FromArray(Motion.apply(rotation,Motion.direction(x,y,graph.bounds))).scale(radius));
    // The background universe: seeded, so every run and screenshot draws the same
    // sky. Decoration only - no MM identity, never pickable, never projected into
    // the HTML layer. It stays centred on the camera and turns with the displayed
    // constellation, so a drag reads as turning the whole sky rather than sliding
    // the mind maps across a fixed backdrop.
    const field=(()=>{
      let seed=0x5eed1e5;
      const rand=()=>{seed=seed+0x6d2b79f5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};
      const unit=v=>{const l=Math.hypot(...v);return v.map(n=>n/l);};
      const tints=[[1,1,1],[.82,.9,1],[1,.93,.78],[.9,.95,1]];
      const sphere=()=>{let v;do{const z=rand()*2-1,a=rand()*Math.PI*2,r=Math.sqrt(1-z*z);v=[r*Math.cos(a),z,r*Math.sin(a)];}while(v[1]<-.15);return v;};
      // A faint band on a tilted great circle, the one cue that reads as a galaxy.
      const n=unit([.35,.3,1]),e1=unit([n[2],0,-n[0]]),e2=[n[1]*e1[2]-n[2]*e1[1],n[2]*e1[0]-n[0]*e1[2],n[0]*e1[1]-n[1]*e1[0]];
      const band=()=>{let v;do{const a=rand()*Math.PI*2,g=(rand()+rand()+rand()-1.5)*.16;v=unit(e1.map((c,i)=>c*Math.cos(a)+e2[i]*Math.sin(a)+n[i]*g));}while(v[1]<-.15);return v;};
      const build=(name,count,size,direction,light)=>{
        const positions=[],colors=[],indices=[];
        for(let i=0;i<count;i++){const d=direction(),b=light(),t=tints[Math.floor(rand()*tints.length)];
          positions.push(d[0]*90,d[1]*90,d[2]*90);colors.push(b*t[0],b*t[1],b*t[2],1);indices.push(i);}
        const mesh=new B.Mesh(name,scene),data=new B.VertexData();
        data.positions=positions;data.colors=colors;data.indices=indices;data.applyToMesh(mesh);
        const material=new B.StandardMaterial(name+'-material',scene);
        material.pointsCloud=true;material.pointSize=size;material.disableLighting=true;
        // With lighting disabled the standard material outputs emissive x vertex
        // colour; a black emissive draws every star black, which adds nothing.
        material.emissiveColor=B.Color3.White();
        material.alphaMode=B.Engine.ALPHA_ADD;material.needAlphaBlending=()=>true;material.alpha=0;
        material.fogEnabled=false;material.disableDepthWrite=true;material.backFaceCulling=false;
        mesh.material=material;mesh.isPickable=false;mesh.applyFog=false;mesh.infiniteDistance=true;
        mesh.rotationQuaternion=B.Quaternion.Identity();mesh.isVisible=false;mesh.metadata={skyField:true};
        return mesh;
      };
      return [
        build('sky-field-dim',2400,1.5,sphere,()=>.18+.5*rand()**3),
        build('sky-field-band',1800,1.5,band,()=>.1+.22*rand()),
        build('sky-field-bright',160,2.6,sphere,()=>.65+.35*rand())
      ];
    })();
    function clear() {
      for(const star of stars){star.mesh.dispose();star.material.dispose(false,true);}
      stars=[];if(links)links.dispose();links=null;
    }
    function texture(node) {
      const tex=new B.DynamicTexture('sky-light-'+node.id,{width:256,height:256},scene,false);
      tex.hasAlpha=true;const ctx=tex.getContext(),unit=128/(node.radius+23),r=node.radius*unit;
      ctx.clearRect(0,0,256,256);ctx.translate(128,128);
      const rgb=B.Color3.FromHexString(node.color).asArray().map(n=>Math.round(n*255)).join(',');
      const halo=ctx.createRadialGradient(0,0,0,0,0,r*1.5);
      halo.addColorStop(0,'rgba(255,255,238,.98)');halo.addColorStop(.18,'rgba('+rgb+',.9)');
      halo.addColorStop(.5,'rgba('+rgb+',.3)');halo.addColorStop(1,'rgba('+rgb+',0)');
      ctx.fillStyle=halo;ctx.fillRect(-128,-128,256,256);
      ctx.beginPath();
      for(let i=0;i<8;i++) {const a=i*Math.PI/4-Math.PI/2,length=i%2?r*.15:r*1.12;ctx.lineTo(Math.cos(a)*length,Math.sin(a)*length);}
      ctx.closePath();ctx.fillStyle=node.color;ctx.fill();ctx.strokeStyle='#fff5c9';ctx.lineWidth=1.8;ctx.stroke();
      ctx.beginPath();ctx.arc(0,0,r*.12,0,Math.PI*2);ctx.fillStyle='#fffef3';ctx.fill();
      if(node.pending||node.reviewed)for(let i=0;i<8;i++) {
        const a=i*Math.PI/4,ring=(node.radius+15)*unit;
        ctx.save();ctx.translate(Math.sin(a)*ring,Math.cos(a)*ring);ctx.rotate(-a);
        ctx.beginPath();ctx.ellipse(0,0,3*unit,4.5*unit,0,0,Math.PI*2);
        if(node.pending){ctx.fillStyle='#ffe1a3';ctx.fill();}
        ctx.strokeStyle='#ffe1a3';ctx.lineWidth=1.6;ctx.stroke();ctx.restore();
      }
      tex.update();return tex;
    }
    function sync(next,nextView,nextViewport) {
      view={...nextView};viewport={...nextViewport};dirty=true;
      if(next===graph)return;
      clear();graph=next;
      for(const node of graph.nodes) {
        const material=new B.StandardMaterial('celestial-material-'+node.id,scene),tex=texture(node);
        material.diffuseTexture=tex;material.emissiveTexture=tex;material.emissiveColor=B.Color3.White();
        material.disableLighting=true;material.useAlphaFromDiffuseTexture=true;material.backFaceCulling=false;
        material.fogEnabled=false;material.disableDepthWrite=true;material.alpha=reveal;
        const mesh=B.MeshBuilder.CreatePlane('celestial-mm-'+node.id,{size:2*(node.radius+23)*Motion.scale(graph.bounds)},scene);
        mesh.material=material;mesh.billboardMode=B.Mesh.BILLBOARDMODE_ALL;
        mesh.metadata={skyMM:node.id,mmIndex:node.index};mesh.isPickable=true;mesh.isVisible=reveal>0;
        // A separate celestial pass keeps knowledge legible through weather/foliage.
        // These remain scene meshes projected by the actual animated world camera.
        mesh.renderingGroupId=1;stars.push({node,mesh,material});
      }
      const byId=new Map(stars.map(star=>[star.node.id,point(star.node.x,star.node.y)]));
      if(graph.edges.length) {
        links=B.MeshBuilder.CreateLineSystem('celestial-connections',{lines:graph.edges.map(edge=>[byId.get(edge.from),byId.get(edge.to)]),updatable:true},scene);
        links.color=B.Color3.FromHexString('#c6dfc7');links.alpha=reveal*.55;
        links.isPickable=false;links.isVisible=reveal>0;links.renderingGroupId=1;links.applyFog=false;
      }
    }
    function pose(eyeY,standing) {
      if(!view||!viewport||!viewport.width||!viewport.height)return null;
      const nextEye=new B.Vector3(standing.x,eyeY,standing.z);
      if(B.Vector3.DistanceSquared(eye,nextEye)>1e-12){eye.copyFrom(nextEye);radius=60-eyeY;dirty=true;}
      const optics=Motion.optics(view,graph.bounds,viewport);
      if(dirty) {
        rotation=Motion.multiply(optics.framing,view.rotation);
        for(const mesh of field)mesh.rotationQuaternion=B.Quaternion.FromArray(rotation);
        for(const {node,mesh} of stars) {
          mesh.position.copyFrom(point(node.x,node.y));
          mesh.scaling.setAll(radius*Motion.direction(node.x,node.y,graph.bounds)[1]);
          mesh.computeWorldMatrix(true);
        }
        if(links) {
          const byId=new Map(stars.map(star=>[star.node.id,star.mesh.position]));
          B.MeshBuilder.CreateLineSystem('celestial-connections',{lines:graph.edges.map(edge=>[byId.get(edge.from),byId.get(edge.to)]),instance:links});
        }
        dirty=false;
      }
      return {position:eye.clone(),rotation:B.Quaternion.RotationYawPitchRoll(0,-Math.PI/2,0),fov:optics.fov};
    }
    function setReveal(value) {
      reveal=value;
      for(const star of stars){star.material.alpha=value;star.mesh.isVisible=value>0;}
      if(links){links.alpha=value*.55;links.isVisible=value>0;}
      for(const mesh of field){mesh.material.alpha=value;mesh.isVisible=value>0;}
    }
    function project() {
      if(!viewport)return [];
      const global=scene.activeCamera.viewport.toGlobal(engine.getRenderWidth(),engine.getRenderHeight());
      const screen=position=>{
        const p=B.Vector3.Project(position,B.Matrix.Identity(),scene.getTransformMatrix(),global);
        return {x:p.x*viewport.screenWidth/engine.getRenderWidth()-viewport.x,
          y:p.y*viewport.screenHeight/engine.getRenderHeight()-viewport.y,z:p.z,
          front:B.Vector3.Dot(position.subtract(scene.activeCamera.position),scene.activeCamera.getForwardRay().direction)>0};
      };
      return stars.map(({node,mesh})=>({id:node.id,...screen(mesh.position),label:screen(point(node.label.x,node.label.y)),
        labelWidth:Math.abs(screen(point(node.label.x+240,node.label.y)).x-screen(point(node.label.x,node.label.y)).x)}));
    }
    const fieldSnapshot=()=>({count:field.reduce((sum,mesh)=>sum+mesh.getTotalVertices(),0),visible:field.map(mesh=>mesh.isVisible),
      alpha:field.map(mesh=>mesh.material.alpha),pickable:field.some(mesh=>mesh.isPickable),rotation:field.map(mesh=>mesh.rotationQuaternion.asArray())});
    return {sync,pose,setReveal,project,fieldSnapshot,dispose:()=>{clear();for(const mesh of field){mesh.material.dispose();mesh.dispose();}},
      snapshot:()=>stars.map(({node,mesh})=>({id:node.id,position:mesh.position.asArray(),visible:mesh.isVisible}))};
  };
})();
