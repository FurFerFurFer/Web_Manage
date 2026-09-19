(function () {
  'use strict';
  // Celestial meshes live above the Grove. UI projection follows these meshes;
  // panning/zooming moves the viewing camera, never the KS03 layout or star positions.
  window.createWorldSkyScene=function (scene) {
    const B=window.BABYLON,engine=scene.getEngine(),origin=new B.Vector3(-10,60,16);
    let graph=null,view=null,viewport=null,scale=1,center={x:0,y:0},stars=[],links=null,reveal=0;
    const point=(x,y)=>new B.Vector3(origin.x+(x-center.x)*scale,origin.y,origin.z+(y-center.y)*scale);
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
      view={...nextView};viewport={...nextViewport};
      if(next===graph)return;
      clear();graph=next;center={x:graph.bounds.x+graph.bounds.width/2,y:graph.bounds.y+graph.bounds.height/2};
      scale=50/Math.max(graph.bounds.width,graph.bounds.height);
      for(const node of graph.nodes) {
        const material=new B.StandardMaterial('celestial-material-'+node.id,scene),tex=texture(node);
        material.diffuseTexture=tex;material.emissiveTexture=tex;material.emissiveColor=B.Color3.White();
        material.disableLighting=true;material.useAlphaFromDiffuseTexture=true;material.backFaceCulling=false;
        material.fogEnabled=false;material.disableDepthWrite=true;material.alpha=reveal;
        const mesh=B.MeshBuilder.CreatePlane('celestial-mm-'+node.id,{size:2*(node.radius+23)*scale},scene);
        mesh.position.copyFrom(point(node.x,node.y));mesh.material=material;mesh.billboardMode=B.Mesh.BILLBOARDMODE_ALL;
        mesh.metadata={skyMM:node.id,mmIndex:node.index};mesh.isPickable=true;mesh.isVisible=reveal>0;
        // A separate celestial pass keeps knowledge legible through weather/foliage.
        // These remain scene meshes projected by the actual animated world camera.
        mesh.renderingGroupId=1;stars.push({node,mesh,material});
      }
      const byId=new Map(stars.map(star=>[star.node.id,star.mesh.position]));
      if(graph.edges.length) {
        links=B.MeshBuilder.CreateLineSystem('celestial-connections',{lines:graph.edges.map(edge=>[byId.get(edge.from),byId.get(edge.to)])},scene);
        links.color=B.Color3.FromHexString('#c6dfc7');links.alpha=reveal*.55;
        links.isPickable=false;links.isVisible=reveal>0;links.renderingGroupId=1;links.applyFog=false;
      }
    }
    function pose(eyeY) {
      if(!view||!viewport||!viewport.width||!viewport.height)return null;
      const unit=Math.max(view.width/viewport.width,view.height/viewport.height)*scale;
      const dx=viewport.x+viewport.width/2-viewport.screenWidth/2;
      const dy=viewport.y+viewport.height/2-viewport.screenHeight/2;
      return {position:new B.Vector3(origin.x+(view.x+view.width/2-center.x)*scale-dx*unit,eyeY,
        origin.z+(view.y+view.height/2-center.y)*scale-dy*unit),
        rotation:B.Quaternion.RotationYawPitchRoll(0,-Math.PI/2,0),
        fov:2*Math.atan(viewport.screenHeight*unit/(2*(origin.y-eyeY)))};
    }
    function setReveal(value) {
      reveal=value;
      for(const star of stars){star.material.alpha=value;star.mesh.isVisible=value>0;}
      if(links){links.alpha=value*.55;links.isVisible=value>0;}
    }
    function project() {
      if(!viewport)return [];
      const global=scene.activeCamera.viewport.toGlobal(engine.getRenderWidth(),engine.getRenderHeight());
      const screen=position=>{
        const p=B.Vector3.Project(position,B.Matrix.Identity(),scene.getTransformMatrix(),global);
        return {x:p.x*viewport.screenWidth/engine.getRenderWidth()-viewport.x,
          y:p.y*viewport.screenHeight/engine.getRenderHeight()-viewport.y,z:p.z};
      };
      return stars.map(({node,mesh})=>({id:node.id,...screen(mesh.position),label:screen(point(node.label.x,node.label.y)),
        labelWidth:Math.abs(screen(point(node.label.x+240,node.label.y)).x-screen(point(node.label.x,node.label.y)).x)}));
    }
    return {sync,pose,setReveal,project,dispose:clear,
      snapshot:()=>stars.map(({node,mesh})=>({id:node.id,position:mesh.position.asArray(),visible:mesh.isVisible}))};
  };
})();
