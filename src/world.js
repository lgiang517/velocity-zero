import {SunShadows} from './lighting.js';
import {DrivingCamera} from './driving-camera.js';
import {buildCoastalScenery} from './scenery.js';
import {addBridgeDetail,buildDetailedTunnel} from './structures.js';
import {BARRIER} from './road-boundaries.js';
import * as THREE from 'three';
import {buildAtmosphere,buildCoastalOcean,createOutdoorEnvironment} from './atmosphere.js';
import {buildCoastalTerrain} from './terrain.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {clamp,damp} from './physics.js';

const noiseGLSL=`float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);} float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);} float fbm(vec2 p){return noise(p)*.55+noise(p*2.1)*.25+noise(p*4.2)*.13+noise(p*8.4)*.07;}`;
function seeded(n){return (Math.sin(n*127.1+311.7)*43758.5453)%1*.5+.5;}
function material(color,roughness=.8,metalness=0){return new THREE.MeshStandardMaterial({color,roughness,metalness});}
const dummy=new THREE.Object3D();
function instance(scene,geometry,mat,items){const m=new THREE.InstancedMesh(geometry,mat,items.length);dummy.rotation.order='YXZ';items.forEach((q,i)=>{dummy.position.copy(q.p);dummy.rotation.set(q.rx||0,q.ry||0,q.rz||0);dummy.scale.set(q.x||1,q.y||1,q.z||1);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);if(q.color)m.setColorAt(i,new THREE.Color(q.color));});m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;}

export class GameWorld {
  constructor(canvas,track){
    this.track=track;this.time=0;this.wet=0;this.night=0;this.weather='sunset';this.quality='balanced';
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,matchMedia('(pointer:coarse)').matches?1:1.5));this.renderer.setSize(canvas.clientWidth||innerWidth,canvas.clientHeight||innerHeight,false);
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.94;this.renderer.info.autoReset=false;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.scene=new THREE.Scene();this.scene.fog=new THREE.FogExp2('#bbac96',.00058);
    this.camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.1,9000);
    this.scene.add(new THREE.HemisphereLight('#c4dbe4','#3b4940',2.3));
    this.ambient=this.scene.children[0];
    this.sun=new THREE.DirectionalLight('#ffe2b7',3.3);this.sun.position.set(-450,450,700);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);Object.assign(this.sun.shadow.camera,{left:-28,right:28,top:28,bottom:-28,near:1,far:1400});this.sun.shadow.bias=-.00010;this.sun.shadow.normalBias=.018;this.scene.add(this.sun,this.sun.target);
    this.env=createOutdoorEnvironment(this.renderer);this.scene.environment=this.env.texture;
    this.uniforms={time:{value:0},wet:{value:0},night:{value:0},sunDir:{value:new THREE.Vector3(-.56,.32,.77).normalize()}};
    this.buildSky();this.buildOcean();this.buildRoad();this.buildTerrain();this.buildScenery();this.buildBridge();addBridgeDetail(this);this.buildTunnel();this.buildSigns();this.buildParticles();
    this.headlight=new THREE.SpotLight('#f4edce',100,95,.45,.7,1.5);this.scene.add(this.headlight,this.headlight.target);
    const target=new THREE.WebGLRenderTarget(innerWidth,innerHeight,{type:THREE.HalfFloatType,samples:4});
    this.composer=new EffectComposer(this.renderer,target);this.composer.addPass(new RenderPass(this.scene,this.camera));
    this.bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth/2,innerHeight/2),.22,.45,1.15);this.composer.addPass(this.bloom);this.composer.addPass(new OutputPass());
    this.cameraRig=new DrivingCamera(this.camera);this.initializedCamera=false;this.sunShadows=new SunShadows(this);
  }
  prepareShadows(root){this.sunShadows.prepare(root);}
  buildSky(){buildAtmosphere(this);}
  buildOcean(){buildCoastalOcean(this);}
  buildRoad(){
    const surface=document.createElement('canvas');surface.width=surface.height=256;const surfaceCtx=surface.getContext('2d'),pixels=surfaceCtx.createImageData(256,256);
    for(let i=0;i<256*256;i++){const n=95+seeded(i*1.73)*90;pixels.data.set([n,n,n,255],i*4);}surfaceCtx.putImageData(pixels,0,0);
    const aggregate=new THREE.CanvasTexture(surface);aggregate.wrapS=aggregate.wrapT=THREE.RepeatWrapping;aggregate.repeat.set(.25,.25);aggregate.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());
    const roadMat=new THREE.MeshStandardMaterial({color:'#89908b',roughness:.9,metalness:.03,envMapIntensity:.65,bumpMap:aggregate,bumpScale:.016});
    roadMat.onBeforeCompile=shader=>{
      shader.uniforms.uWet=this.uniforms.wet;shader.uniforms.uTime=this.uniforms.time;
      shader.vertexShader='varying vec2 vRoad;\n'+shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvRoad=uv;');
      shader.fragmentShader='varying vec2 vRoad;uniform float uWet;uniform float uTime;\n'+noiseGLSL+'\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float detailFade=1.-smoothstep(18.,65.,length(vViewPosition));float grain=mix(.5,hash(vRoad*80.),detailFade);float roadPatch=noise(vRoad*vec2(.35,.07));
        vec3 asphalt=vec3(.040,.047,.050)+(grain-.5)*.016+(roadPatch-.5)*.026;
        float edge=1.-smoothstep(.045,.083,abs(abs(vRoad.x)-7.65));
        float center=1.-smoothstep(.025,.053,abs(abs(vRoad.x)-.12));
        float lane=(1.-smoothstep(.025,.068,abs(abs(vRoad.x)-3.85)))*step(5.,mod(vRoad.y,13.));
        float crack=(1.-smoothstep(.013,.045,abs(vRoad.x-(noise(vec2(vRoad.y*.3,2.))-.5)*12.)))*step(.75,noise(vec2(vRoad.y*.05,4.)));
        asphalt*=1.-crack*.26;float repair=step(.76,noise(vRoad*vec2(.065,.035)));asphalt*=1.-repair*.19;
        asphalt=mix(asphalt,vec3(.76,.75,.64),max(edge,lane)*.88);
        asphalt=mix(asphalt,vec3(.91,.66,.27),center*.9);
        float tire=exp(-pow(abs(abs(vRoad.x)-2.5)*3.,2.))*.06;asphalt-=tire*.15;
        diffuseColor.rgb=asphalt*(1.-uWet*.27);`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(mix(.94,.48,max(max(edge,lane),center)),.14+noise(vRoad*.2)*.16,uWet);');
    };
    const road=new THREE.Mesh(this.track.roadRibbon(-8.4,8.4,.025),roadMat);road.receiveShadow=true;this.scene.add(road);
    for(const side of[-1,1]){
      const shoulder=new THREE.Mesh(this.track.ribbon(side<0?-10.3:8.4,side<0?-8.4:10.3,.0),new THREE.MeshStandardMaterial({color:'#69685d',bumpMap:aggregate,bumpScale:.035,roughness:.97}));shoulder.receiveShadow=true;this.scene.add(shoulder);
      // Continuous drainage and the painted boundary keep the carriageway readable at speed.
      const drain=new THREE.Mesh(this.track.ribbon(side*9.05-.12,side*9.05+.12,.012),material('#384441'));this.scene.add(drain);
    }
    const studs=[];
    for(let s=0;s<this.track.length;s+=12){const q=this.track.sample(s);for(const d of[-7.68,0,7.68])studs.push({p:this.track.point(s,d,.052),x:.095,y:.045,z:.13,ry:q.heading,color:d===0?'#e9bb66':'#dddccb'});}
    instance(this.scene,new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.32,metalness:.12,emissive:'#bb7d33',emissiveIntensity:.10}),studs);
    const posts=[],reflectors=[];
    for(const side of [-1,1]){const rail=new THREE.Mesh(this.track.barrierGeometry(side),material('#a9ada5',.34,.8));rail.material.side=THREE.DoubleSide;rail.receiveShadow=true;rail.castShadow=true;this.scene.add(rail);}
    for(let s=0;s<this.track.length;s+=7){const q=this.track.sample(s);for(const side of[-1,1]){
      posts.push({p:this.track.point(s,side*(BARRIER.offset+.06),.46),x:.13,y:.92,z:.15,ry:q.heading});
      if(Math.round(s/7)%2===0)reflectors.push({p:this.track.point(s,side*(BARRIER.offset-.11),.84),x:.04,y:.1,z:.13,ry:q.heading,color:side<0?'#f4e8c4':'#f58542'});
    }}
    instance(this.scene,new THREE.BoxGeometry(1,1,1),material('#5e6760',.45,.65),posts);
    instance(this.scene,new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#fff3cb',emissive:'#dd9f56',emissiveIntensity:.35}),reflectors);
  }
  buildTerrain(){buildCoastalTerrain(this);}
  buildScenery(){buildCoastalScenery(this);}
  buildBridge(){
    const start=this.track.length*.90,end=this.track.length*.993,length=end-start;
    const beams=[],hangers=[];
    const mat=material('#929d95',.45,.5);
    for(const fraction of[.25,.72]){const s=start+length*fraction,q=this.track.sample(s);for(const side of[-1,1]){beams.push({p:this.track.point(s,side*12,25),x:1.8,y:87,z:2.8,ry:q.heading});}beams.push({p:this.track.point(s,0,64),x:26,y:2,z:2.8,ry:q.heading});beams.push({p:this.track.point(s,0,47),x:26,y:1.4,z:2.2,ry:q.heading});}
    instance(this.scene,new THREE.BoxGeometry(1,1,1),mat,beams);
    for(const side of[-1,1]){
      const pts=[];
      for(let i=0;i<=100;i++){const f=i/100,s=start+length*f;let h;
        if(f<.25)h=5+59*f/.25;else if(f>.72)h=5+59*(1-f)/.28;else h=16+48*Math.pow((f-.485)/.235,2);
        pts.push(this.track.point(s,side*12,h));if(i%3===0)hangers.push({p:this.track.point(s,side*11.8,h/2),x:.07,y:h,z:.07});
      }
      this.scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),100,.16,5,false),mat));
    }
    instance(this.scene,new THREE.BoxGeometry(1,1,1),mat,hangers);
  }
  buildTunnel(){buildDetailedTunnel(this);}
  buildSigns(){
    const signs=[[170,'PACIFIC COAST','KAZE PASS   2 km'],[this.track.length*.19,'KAZE TUNNEL','LIGHTS ON  ↗'],[this.track.length*.46,'SOLSTICE CITY','KEEP YOUR LINE'],[this.track.length*.87,'HORIZON BRIDGE','COASTAL ROUTE  01']];
    for(const[s,title,sub]of signs){const canvas=document.createElement('canvas');canvas.width=768;canvas.height=256;const c=canvas.getContext('2d');c.fillStyle='#244843';c.fillRect(0,0,768,256);c.strokeStyle='#cbd4b8';c.lineWidth=5;c.strokeRect(12,12,744,232);c.fillStyle='#e5e7d0';c.font='bold 54px sans-serif';c.fillText(title,38,105);c.font='30px sans-serif';c.fillText(sub,40,178);c.font='64px sans-serif';c.fillText('↗',670,165);const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;const sign=new THREE.Mesh(new THREE.BoxGeometry(9,3,.16),new THREE.MeshStandardMaterial({map,roughness:.8}));const q=this.track.sample(s);sign.position.copy(this.track.point(s,3,10.2));sign.rotation.y=q.heading+Math.PI;this.scene.add(sign);const posts=[{p:this.track.point(s,11,5.7),x:.25,y:11.4,z:.25,ry:q.heading},{p:this.track.point(s,3.7,11.5),x:15,y:.25,z:.25,ry:q.heading}];instance(this.scene,new THREE.BoxGeometry(1,1,1),material('#8e9b91',.4,.6),posts);}
    const chevrons=[];for(let s=0;s<this.track.length;s+=24){const q=this.track.sample(s);if(Math.abs(q.curvature)>.0045)chevrons.push({p:this.track.point(s,q.curvature>0?-10.2:10.2,1.6),ry:q.heading,x:1,y:.72,z:.055});}
    const c=document.createElement('canvas');c.width=64;c.height=64;const x=c.getContext('2d');x.fillStyle='#dcff00';x.fillRect(0,0,64,64);x.fillStyle='#273a37';x.beginPath();x.moveTo(12,0);x.lineTo(37,0);x.lineTo(62,32);x.lineTo(37,64);x.lineTo(12,64);x.lineTo(37,32);x.fill();const signTexture=new THREE.CanvasTexture(c);signTexture.colorSpace=THREE.SRGBColorSpace;instance(this.scene,new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({map:signTexture,emissive:'#ffffff',emissiveMap:signTexture,emissiveIntensity:.42,roughness:.5,side:THREE.DoubleSide}),chevrons);
  }
  buildParticles(){
    const count=250,positions=new Float32Array(count*3),colors=new Float32Array(count*3);this.particleLife=new Float32Array(count);this.particleVelocity=new Float32Array(count*3);this.particleCursor=0;
    this.particleGeometry=new THREE.BufferGeometry();this.particleGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3));this.particleGeometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    this.particles=new THREE.Points(this.particleGeometry,new THREE.PointsMaterial({size:.12,vertexColors:true,transparent:true,opacity:.7,depthWrite:false,blending:THREE.AdditiveBlending}));this.particles.frustumCulled=false;this.scene.add(this.particles);
    const rainPos=new Float32Array(900*6);for(let i=0;i<900;i++){const x=(seeded(i+2)-.5)*100,y=seeded(i+5)*45,z=(seeded(i+9)-.5)*100;rainPos.set([x,y,z,x-.3,y-1.1,z],i*6);}const rainG=new THREE.BufferGeometry();rainG.setAttribute('position',new THREE.BufferAttribute(rainPos,3));this.rain=new THREE.LineSegments(rainG,new THREE.LineBasicMaterial({color:'#bed0c8',transparent:true,opacity:.35,depthWrite:false}));this.rain.visible=false;this.scene.add(this.rain);
    const markGeo=new THREE.BufferGeometry();this.skidPositions=new Float32Array(1600*6);markGeo.setAttribute('position',new THREE.BufferAttribute(this.skidPositions,3));this.skids=new THREE.LineSegments(markGeo,new THREE.LineBasicMaterial({color:'#182123',transparent:true,opacity:.45}));this.skids.frustumCulled=false;this.scene.add(this.skids);this.skidCursor=0;this.lastSkids=null;
  }
  emit(p,color,count=8){const positions=this.particleGeometry.attributes.position.array,colors=this.particleGeometry.attributes.color.array,col=new THREE.Color(color);for(let j=0;j<count;j++){const i=this.particleCursor++%this.particleLife.length;positions.set([p.x,p.y+.3,p.z],i*3);colors.set([col.r,col.g,col.b],i*3);this.particleLife[i]=.5+Math.random()*.5;this.particleVelocity.set([(Math.random()-.5)*7,Math.random()*4,(Math.random()-.5)*7],i*3);}this.particleGeometry.attributes.color.needsUpdate=true;}
  setQuality(value){this.quality=value;this.bloom.enabled=value!=='low';this.renderer.shadowMap.enabled=value!=='low';this.resize();}
  resize(){const canvas=this.renderer.domElement,width=Math.max(1,canvas.clientWidth),height=Math.max(1,canvas.clientHeight),cap=this.quality==='high'?2:this.quality==='low'||matchMedia('(pointer:coarse)').matches?1:1.5,ratio=Math.min(devicePixelRatio,cap);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.renderer.setPixelRatio(ratio);this.renderer.setSize(width,height,false);this.composer.setPixelRatio(ratio);this.composer.setSize(width,height);}
  update(dt,player,car,mode='menu',cameraMode=0){
    this.time+=dt;this.uniforms.time.value=this.time;
    this.tunnelAmount=damp(this.tunnelAmount,this.track.inTunnel(player.s)?1:0,3,dt);
    let targetWet=this.weather==='rain'?.7:this.weather==='storm'?1:0,targetNight=this.weather==='night'?1:this.weather==='storm'?.55:0;
    if(this.weather==='dynamic'){targetWet=clamp(Math.sin(this.time/60)*.9,0,1);targetNight=(Math.sin(this.time/110-.8)+1)*.42;}
    this.wet=damp(this.wet,targetWet,.7,dt);this.night=damp(this.night,targetNight,.7,dt);this.uniforms.wet.value=this.wet;this.uniforms.night.value=this.night;
    this.uniforms.daylight.value=this.weather==='clear'?1:0;
    this.sun.intensity=3.6*(1-this.night*.96)*(1-this.wet*.75);this.ambient.intensity=1.0*(1-this.night*.67);
    this.sun.intensity*=1-this.tunnelAmount*.9;this.ambient.intensity*=1-this.tunnelAmount*.68;
    this.sun.color.set(this.weather==='clear'?'#fff3df':'#ffdaa0');this.ambient.color.set('#b8d4e4');this.ambient.groundColor.set('#3b4337');
    this.scene.environmentIntensity=.22*(1-this.night*.73)*(1-this.tunnelAmount*.60);this.renderer.toneMappingExposure=this.weather==='clear'?1:.95;
    this.scene.fog.color.set('#b9c5c4').lerp(new THREE.Color('#233c4b'),this.night).lerp(new THREE.Color('#718b8c'),this.wet*.5);
    this.scene.fog.density=damp(this.scene.fog.density,this.weather==='fog'?.004:this.weather==='storm'?.002:.00058,1,dt);
    this.buildingMaterial.emissiveIntensity=.05+this.night*.9;this.lampMaterial.emissiveIntensity=1.3+this.night*2;
    const q=this.track.sample(player.s);car.root.position.copy(q.p);car.root.rotation.set(-Math.asin(q.slope),q.heading+player.yaw,0,'YXZ');
    const pos=car.root.position,forward=new THREE.Vector3(Math.sin(q.heading+player.yaw),0,Math.cos(q.heading+player.yaw));
    car.root.position.addScaledVector(q.right,player.d);car.paint.roughness=.24-this.wet*.08;if(car.brakeGlow)car.brakeGlow.intensity*=.06+this.night*.50;
    this.sky.position.copy(this.camera.position);
    this.headlight.position.copy(pos).addScaledVector(forward,2).add(new THREE.Vector3(0,.7,0));this.headlight.target.position.copy(pos).addScaledVector(forward,50);this.headlight.intensity=25+this.night*140+this.tunnelAmount*160;
    this.tunnelFill.position.copy(this.track.point(player.s+9,0,6));this.tunnelFill.intensity=this.tunnelAmount*230;
    this.tunnelFill2.position.copy(this.track.point(player.s-13,0,5));this.tunnelFill2.intensity=this.tunnelAmount*160;
    if(!this.initializedCamera)this.cameraRig.reset();
    this.cameraRig.update(dt,car,player,q,mode,cameraMode,this.groundHeight);this.initializedCamera=true;this.sunShadows.update();
    this.rain.visible=this.wet>.1;this.rain.position.copy(pos);this.rain.position.y-=this.time*22%30;this.rain.material.opacity=this.wet*.36;
    for(const rotor of this.turbines)rotor.rotation.z+=dt*.34;
    const a=this.particleGeometry.attributes.position.array;for(let i=0;i<this.particleLife.length;i++){if(this.particleLife[i]>0){this.particleLife[i]-=dt;this.particleVelocity[i*3+1]-=dt*9;for(let j=0;j<3;j++)a[i*3+j]+=this.particleVelocity[i*3+j]*dt;}else a[i*3+1]=-50;}this.particleGeometry.attributes.position.needsUpdate=true;
    if(mode==='race'&&player.u>15&&(player.slip>.10||player.brake>.8)){
      const marks=[this.track.point(player.s-1.35,player.d-.8,.06),this.track.point(player.s-1.35,player.d+.8,.06)];if(this.lastSkids)for(let i=0;i<2;i++){const k=this.skidCursor++%1600;this.skidPositions.set([...this.lastSkids[i].toArray(),...marks[i].toArray()],k*6);}this.lastSkids=marks;this.skids.geometry.attributes.position.needsUpdate=true;
      if(Math.random()<.3)this.emit(this.track.point(player.s-2,player.d,.12),this.wet>.3?'#b8d3d0':'#818e82',2);
    }else this.lastSkids=null;
    if(mode==='race'&&this.wet>.4&&player.u>20&&Math.random()<.4)this.emit(this.track.point(player.s-2,player.d,.05),'#a3bbb8',2);
  }
  render(){this.renderer.info.reset();if(this.quality==='low')this.renderer.render(this.scene,this.camera);else this.composer.render();}
}


