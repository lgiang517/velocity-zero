import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {clamp,damp} from './physics.js';

const noiseGLSL=`float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);} float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);} float fbm(vec2 p){return noise(p)*.55+noise(p*2.1)*.25+noise(p*4.2)*.13+noise(p*8.4)*.07;}`;
function seeded(n){return (Math.sin(n*127.1+311.7)*43758.5453)%1*.5+.5;}
function material(color,roughness=.8,metalness=0){return new THREE.MeshStandardMaterial({color,roughness,metalness});}
const dummy=new THREE.Object3D();
function instance(scene,geometry,mat,items){const m=new THREE.InstancedMesh(geometry,mat,items.length);dummy.rotation.order='YXZ';items.forEach((q,i)=>{dummy.position.copy(q.p);dummy.rotation.set(q.rx||0,q.ry||0,q.rz||0);dummy.scale.set(q.x||1,q.y||1,q.z||1);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);if(q.color)m.setColorAt(i,new THREE.Color(q.color));});m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();scene.add(m);return m;}

export class GameWorld {
  constructor(canvas,track){
    this.track=track;this.time=0;this.wet=0;this.night=0;this.weather='sunset';this.quality='balanced';
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.setSize(innerWidth,innerHeight);
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.94;this.renderer.info.autoReset=false;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.scene=new THREE.Scene();this.scene.fog=new THREE.FogExp2('#bbac96',.00058);
    this.camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.1,9000);
    this.scene.add(new THREE.HemisphereLight('#c4dbe4','#3b4940',2.3));
    this.ambient=this.scene.children[0];
    this.sun=new THREE.DirectionalLight('#ffe2b7',3.3);this.sun.position.set(-450,450,700);this.sun.castShadow=true;this.sun.shadow.mapSize.set(1024,1024);Object.assign(this.sun.shadow.camera,{left:-35,right:35,top:35,bottom:-35,near:1,far:1400});this.sun.shadow.bias=-.0005;this.sun.shadow.normalBias=.035;this.scene.add(this.sun,this.sun.target);
    const pmrem=new THREE.PMREMGenerator(this.renderer);const room=new RoomEnvironment();this.env=pmrem.fromScene(room,.04);this.scene.environment=this.env.texture;room.dispose();pmrem.dispose();
    this.uniforms={time:{value:0},wet:{value:0},night:{value:0},sunDir:{value:new THREE.Vector3(-.56,.14,.8).normalize()}};
    this.buildSky();this.buildOcean();this.buildRoad();this.buildTerrain();this.buildScenery();this.buildBridge();this.buildTunnel();this.buildSigns();this.buildParticles();
    this.headlight=new THREE.SpotLight('#f4edce',100,95,.45,.7,1.5);this.scene.add(this.headlight,this.headlight.target);
    this.composer=new EffectComposer(this.renderer);this.composer.addPass(new RenderPass(this.scene,this.camera));
    this.bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth/2,innerHeight/2),.22,.45,1.15);this.composer.addPass(this.bloom);this.composer.addPass(new OutputPass());
    this.cameraPos=new THREE.Vector3();this.cameraAim=new THREE.Vector3();this.initializedCamera=false;
  }
  buildSky(){
    const mat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:this.uniforms,vertexShader:`varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec3 vP;uniform float time,wet,night;uniform vec3 sunDir;${noiseGLSL}void main(){vec3 d=normalize(vP);float h=max(0.,d.y);vec3 low=mix(vec3(.62,.36,.19),vec3(.56,.66,.68),wet);vec3 high=mix(vec3(.09,.20,.27),vec3(.18,.27,.32),wet);vec3 col=mix(low,high,pow(h,.42));float sun=max(dot(d,sunDir),0.);col+=vec3(1.,.58,.23)*pow(sun,14.)*.3;col+=vec3(1.,.87,.61)*smoothstep(.99945,.99965,sun)*2.8*(1.-wet*.9);vec2 uv=d.xz/max(.12,d.y+.14);float clouds=fbm(uv*2.+vec2(time*.0015,0.));float cloud=smoothstep(.51,.72,clouds)*smoothstep(.0,.14,h)*(1.-smoothstep(.55,.9,h));col=mix(col,vec3(.81,.75,.65),cloud*.45);col=mix(col,vec3(.017,.036,.068)+col*.12,night);float stars=step(.9985,hash(floor(d.xz/max(.15,d.y)*900.)))*night*smoothstep(.1,.4,h);col+=stars*.7;gl_FragColor=vec4(col,1.);}`});
    this.sky=new THREE.Mesh(new THREE.SphereGeometry(7500,32,16),mat);this.scene.add(this.sky);
  }
  buildOcean(){
    const mat=new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:false,vertexShader:`varying vec3 vP;void main(){vec4 world=modelMatrix*vec4(position,1.);vP=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,fragmentShader:`varying vec3 vP;uniform float time,wet,night;uniform vec3 sunDir;${noiseGLSL}void main(){vec2 uv=vP.xz;float waves=fbm(uv*vec2(.043,.28)+vec2(time*.08,time*.16));vec3 view=normalize(cameraPosition-vP);float f=pow(1.-max(view.y,0.),3.);vec3 col=mix(vec3(.075,.23,.25),vec3(.38,.48,.47),f);float stripes=pow(max(0.,sin(uv.y*.42+noise(uv*.08)*8.+time*.7)),16.);vec3 normal=normalize(vec3((noise(uv*.1+time*.08)-.5)*.07,1.,(waves-.5)*.22));float spec=pow(max(dot(reflect(-sunDir,normal),view),0.),100.);col+=vec3(1.,.7,.37)*spec*(stripes*.8+.2)*1.4;col+=(waves-.5)*.045;col=mix(col,col*.15+vec3(.01,.02,.035),night);float far=smoothstep(700.,5500.,distance(cameraPosition,vP));col=mix(col,mix(vec3(.61,.57,.47),vec3(.055,.08,.11),night),far);gl_FragColor=vec4(col,1.);}`});
    const water=new THREE.Mesh(new THREE.PlaneGeometry(17000,17000),mat);water.rotation.x=-Math.PI/2;water.position.y=-4;this.scene.add(water);
  }
  buildRoad(){
    const roadMat=new THREE.MeshStandardMaterial({color:'#89908b',roughness:.9,metalness:.04,envMapIntensity:.23});
    roadMat.onBeforeCompile=shader=>{
      shader.uniforms.uWet=this.uniforms.wet;shader.uniforms.uTime=this.uniforms.time;
      shader.vertexShader='varying vec2 vRoad;\n'+shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvRoad=uv;');
      shader.fragmentShader='varying vec2 vRoad;uniform float uWet;uniform float uTime;\n'+noiseGLSL+'\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float grain=hash(vRoad*80.);float roadPatch=noise(vRoad*vec2(.35,.07));
        vec3 asphalt=vec3(.028,.036,.041)+(grain-.5)*.009+(roadPatch-.5)*.014;
        float edge=1.-smoothstep(.045,.083,abs(abs(vRoad.x)-7.65));
        float center=1.-smoothstep(.025,.053,abs(abs(vRoad.x)-.12));
        float lane=(1.-smoothstep(.025,.068,abs(abs(vRoad.x)-3.85)))*step(5.,mod(vRoad.y,13.));
        float crack=(1.-smoothstep(.013,.045,abs(vRoad.x-(noise(vec2(vRoad.y*.3,2.))-.5)*12.)))*step(.75,noise(vec2(vRoad.y*.05,4.)));
        asphalt*=1.-crack*.32;
        asphalt=mix(asphalt,vec3(.76,.75,.64),max(edge,lane)*.88);
        asphalt=mix(asphalt,vec3(.91,.66,.27),center*.9);
        float tire=exp(-pow(abs(abs(vRoad.x)-2.5)*3.,2.))*.06;asphalt-=tire*.15;
        diffuseColor.rgb=asphalt*(1.-uWet*.27);`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(.92,.19+noise(vRoad*.2)*.12,uWet);');
    };
    const road=new THREE.Mesh(this.track.ribbon(-8.4,8.4,.025),roadMat);road.receiveShadow=true;this.scene.add(road);
    for(const side of[-1,1]){
      const shoulder=new THREE.Mesh(this.track.ribbon(side<0?-10.3:8.4,side<0?-8.4:10.3,.0),material('#747366'));shoulder.receiveShadow=true;this.scene.add(shoulder);
      // Continuous drainage and the painted boundary keep the carriageway readable at speed.
      const drain=new THREE.Mesh(this.track.ribbon(side*9.05-.12,side*9.05+.12,.012),material('#384441'));this.scene.add(drain);
    }
    const rails=[],posts=[],reflectors=[];
    for(let s=0;s<this.track.length;s+=7){const q=this.track.sample(s);for(const side of[-1,1]){
      // Overlap each straight rail segment (z > spacing) so it reads as one continuous
      // barrier through corners; posts land on every node, rails are yawed then pitched
      // (YXZ in instance) so they stay glued to the road on slopes.
      rails.push({p:this.track.point(s,side*9.85,.79),ry:q.heading,rx:-Math.asin(q.slope),x:.14,y:.25,z:7.6});
      posts.push({p:this.track.point(s,side*9.91,.46),x:.13,y:.92,z:.15,ry:q.heading});
      if(Math.round(s/7)%2===0)reflectors.push({p:this.track.point(s,side*9.74,.84),x:.04,y:.1,z:.13,ry:q.heading,color:side<0?'#f4e8c4':'#f58542'});
    }}
    instance(this.scene,new THREE.BoxGeometry(1,1,1),material('#a9ada5',.34,.8),rails);
    instance(this.scene,new THREE.BoxGeometry(1,1,1),material('#5e6760',.45,.65),posts);
    instance(this.scene,new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#fff3cb',emissive:'#dd9f56',emissiveIntensity:.35}),reflectors);
  }
  buildTerrain(){
    // A single heightfield avoids overlapping strips at mountain switchbacks.
    const sampled=this.track.samples.filter((_,i)=>i%3===0);
    this.groundHeight=(x,z)=>{
      let nearest=null,min=Infinity,nearIndex=0;
      for(let i=0;i<sampled.length;i++){const q=sampled[i],dx=x-q.p.x,dz=z-q.p.z,d=dx*dx+dz*dz;if(d<min){min=d;nearest=q;nearIndex=i;}}
      const distance=Math.sqrt(min),side=(x-nearest.p.x)*nearest.right.x+(z-nearest.p.z)*nearest.right.z,t=nearIndex/sampled.length;
      const mountain=t>.18&&t<.48;
      if(t>.90&&t<.993&&distance<145)return -12;
      const rise=side>0?Math.min(100,Math.max(0,distance-20)*(mountain?.3:.10)): -Math.max(0,distance-20)*.55;
      return Math.max(-14,nearest.p.y-1.9+rise+(distance>30?Math.sin(x*.019)*Math.sin(z*.014)*Math.min(7,(distance-30)*.04):0));
    };
    const nx=180,nz=240,minX=-500,minZ=-1200,w=2300,h=3400,pos=[],colors=[],idx=[];
    for(let z=0;z<=nz;z++)for(let x=0;x<=nx;x++){
      const wx=minX+x/nx*w,wz=minZ+z/nz*h,y=this.groundHeight(wx,wz);pos.push(wx,y,wz);
      const noise=(Math.sin(wx*.07+wz*.017)+Math.sin(wz*.047-wx*.013))*.012,rock=y<26;
      colors.push((rock?.13:.065)+noise,(rock?.15:.105)+noise,(rock?.13:.071)+noise);
    }
    for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){const a=z*(nx+1)+x,b=a+nx+1;idx.push(a,b,a+1,a+1,b,b+1);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(idx);g.computeVertexNormals();
    this.scene.add(new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1})));
    for(const side of[-1,1]){const vg=this.track.ribbon(side<0?-20:10.3,side<0?-10.3:20,-.2);for(let i=0;i<vg.attributes.position.count;i++){const f=Math.floor(i/2)/this.track.count;if(f>.90&&f<.993)vg.attributes.position.setY(i,-14);}vg.computeVertexNormals();const verge=new THREE.Mesh(vg,material('#424d3c'));this.scene.add(verge);}
    for(let m=0;m<21;m++){
      const radius=190+seeded(m+4)*300,height=140+seeded(m+9)*320;
      const g=new THREE.ConeGeometry(radius,height,48,16),a=g.attributes.position;
      for(let i=0;i<a.count;i++){const x=a.getX(i),y=a.getY(i),z=a.getZ(i),variation=Math.sin(x*.02+z*.013+m)*.10+Math.cos(z*.036+x*.011)*.07;a.setXYZ(i,x*(1+variation),y+Math.sin(x*.013+z*.017)*radius*.045,z*(1+variation));}
      g.computeVertexNormals();const mesh=new THREE.Mesh(g,material(m%3===0?'#374b48':'#50645d'));
      if(m<14)mesh.position.set(-1800+m%7*330,height/2-28,1700+Math.floor(m/7)*480);
      else mesh.position.set(500+(m-14)*310,height/2-28,2400);
      this.scene.add(mesh);
    }
    // A distant inhabited shoreline gives the bay scale without adding roadside obstacles.
    const skyline=[];
    for(let i=0;i<90;i++){const x=-1300+seeded(i*4.7)*1100,z=850+seeded(i+6)*160,height=18+seeded(i+19)*90;skyline.push({p:new THREE.Vector3(x,height/2-7,z),x:12+seeded(i+2)*15,y:height,z:16+seeded(i+9)*17,color:['#748985','#9b9e89','#637b7b'][i%3]});}
    instance(this.scene,new THREE.BoxGeometry(1,1,1),material('#778b87',.6,.1),skyline);
  }
  buildScenery(){
    const trees=[],trunks=[],rocks=[],buildings=[],lamps=[],lampBulbs=[],poles=[];
    for(let i=0;i<1050;i++){
      const t=.07+seeded(i*3.19)*.43,s=t*this.track.length,side=seeded(i+1)>.25?1:-1,d=side*(17+seeded(i+8)*90),q=this.track.sample(s);
      if(this.track.inTunnel(s))continue;
      const mountain=t>.18&&t<.47;
      const y=q.p.y+(mountain?(Math.sin(s/this.track.step*.029)*.4+.8)*(Math.abs(d)-10)*.38:side>0?(Math.sin(s/this.track.step*.014)*.3+.5)*(Math.abs(d)-10)*.14:-(Math.abs(d)-10)*.65);
      if(y<-2)continue;
      const p=this.track.point(s,d,0);p.y=this.groundHeight(p.x,p.z);const h=6+seeded(i+3)*13;
      trunks.push({p:p.clone().add(new THREE.Vector3(0,h*.3,0)),x:.35,y:h*.65,z:.35});
      for(let tier=0;tier<3;tier++)trees.push({p:p.clone().add(new THREE.Vector3(0,h*(.45+tier*.2),0)),x:h*(.32-tier*.065),y:h*.48,z:h*(.32-tier*.065),ry:seeded(i)*6,color:['#344e3b','#3c5540','#4b6042','#2b493a'][i%4]});
    }
    instance(this.scene,new THREE.CylinderGeometry(.5,.65,1,5),material('#504c3a'),trunks);
    instance(this.scene,new THREE.ConeGeometry(.75,1,7),material('#496345'),trees);
    for(let i=0;i<180;i++){const s=seeded(i+7)*this.track.length,q=this.track.sample(s),side=i%3===0?-1:1;if(s/this.track.length>.90)continue;const p=this.track.point(s,side*(21+seeded(i+2)*9),0);p.y=this.groundHeight(p.x,p.z)+.3;rocks.push({p,x:2+seeded(i)*5,y:2+seeded(i+4)*6,z:2+seeded(i+9)*5,ry:i,color:['#696c60','#777968','#626b62'][i%3]});}
    instance(this.scene,new THREE.DodecahedronGeometry(1,1),material('#6b7469'),rocks);
    const tex=document.createElement('canvas');tex.width=128;tex.height=256;const ctx=tex.getContext('2d');ctx.fillStyle='#354a4c';ctx.fillRect(0,0,128,256);for(let x=5;x<128;x+=16)for(let y=5;y<256;y+=13){ctx.fillStyle=seeded(x+y)>.55?'#bdba91':'#537275';ctx.fillRect(x,y,7,7);}const map=new THREE.CanvasTexture(tex);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;
    for(let i=0;i<150;i++){const s=this.track.length*(.48+seeded(i*2.7)*.23),q=this.track.sample(s),side=i%2?-1:1;const p=this.track.point(s,side*(34+seeded(i+10)*210),0),h=15+seeded(i+20)*100;p.y=this.groundHeight(p.x,p.z)+h/2;buildings.push({p,x:9+seeded(i+7)*22,y:h,z:10+seeded(i+9)*23,ry:q.heading,color:['#8a9a98','#aab1a1','#748b89'][i%3]});}
    this.buildingMaterial=new THREE.MeshStandardMaterial({map,roughness:.45,metalness:.22,emissiveMap:map,emissive:'#fbd8a2',emissiveIntensity:.05});instance(this.scene,new THREE.BoxGeometry(1,1,1),this.buildingMaterial,buildings);
    for(let s=20;s<this.track.length;s+=55){const q=this.track.sample(s),side=1;const p=this.track.point(s,side*11.5,5.3);poles.push({p,x:.12,y:10.6,z:.12,ry:q.heading});lamps.push({p:this.track.point(s,10,10.6),x:3.1,y:.12,z:.13,ry:q.heading});lampBulbs.push({p:this.track.point(s,8.8,10.5),x:.7,y:.05,z:.4,ry:q.heading});}
    instance(this.scene,new THREE.BoxGeometry(1,1,1),material('#7e8c85',.4,.6),poles);instance(this.scene,new THREE.BoxGeometry(1,1,1),material('#88958e',.4,.5),lamps);
    this.lampMaterial=new THREE.MeshStandardMaterial({color:'#f1d5a5',emissive:'#ffca77',emissiveIntensity:1.3,toneMapped:false});instance(this.scene,new THREE.BoxGeometry(1,1,1),this.lampMaterial,lampBulbs);
    const containers=[];for(let i=0;i<65;i++){const s=this.track.length*(.68+seeded(i+3)*.09),q=this.track.sample(s);const p=this.track.point(s,22+seeded(i+8)*75,2+(i%3)*3);containers.push({p,x:3,y:2.8,z:10,ry:q.heading,color:['#975632','#406966','#8c8c6c','#4e5e71'][i%4]});}instance(this.scene,new THREE.BoxGeometry(1,1,1),material('#80654c',.72,.1),containers);
    for(let i=0;i<4;i++){const s=this.track.length*(.7+i*.018),q=this.track.sample(s);const group=new THREE.Group();group.position.copy(this.track.point(s,95,0));group.rotation.y=q.heading;const mat=material('#b08045',.6,.4);for(const x of[-8,8]){const beam=new THREE.Mesh(new THREE.BoxGeometry(1,42,1),mat);beam.position.set(x,21,0);group.add(beam);}const arm=new THREE.Mesh(new THREE.BoxGeometry(50,1.5,1.8),mat);arm.position.set(-5,42,0);group.add(arm);const wire=new THREE.Mesh(new THREE.BoxGeometry(.07,27,.07),material('#3d4e4b'));wire.position.set(-25,28,0);group.add(wire);this.scene.add(group);}
    this.turbines=[];for(let i=0;i<7;i++){const s=this.track.length*(.79+i*.012),base=this.track.point(s,90,0),g=new THREE.Group();g.position.copy(base);const mat=material('#c2c4b0',.7);const tower=new THREE.Mesh(new THREE.CylinderGeometry(.6,1.5,55,8),mat);tower.position.y=27.5;g.add(tower);const rotor=new THREE.Group();rotor.position.set(0,55,-2);for(let b=0;b<3;b++){const blade=new THREE.Mesh(new THREE.BoxGeometry(1.2,24,.25),mat);const holder=new THREE.Group();holder.rotation.z=b*Math.PI*2/3;blade.position.y=12;holder.add(blade);rotor.add(holder);}g.add(rotor);this.turbines.push(rotor);this.scene.add(g);}
  }
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
  buildTunnel(){
    const start=this.track.length*.22,end=this.track.length*.26,positions=[],indices=[],steps=80,sides=16;
    for(let i=0;i<=steps;i++){const s=start+(end-start)*i/steps,q=this.track.sample(s);for(let j=0;j<=sides;j++){const a=j/sides*Math.PI,p=q.p.clone().addScaledVector(q.right,Math.cos(a)*12);p.y+=Math.sin(a)*10;positions.push(p.x,p.y,p.z);}}
    for(let i=0;i<steps;i++)for(let j=0;j<sides;j++){const a=i*(sides+1)+j,b=a+sides+1;indices.push(a,b,a+1,a+1,b,b+1);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();const tunnel=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:'#6f746a',roughness:.93,side:THREE.DoubleSide}));this.scene.add(tunnel);
    const lights=[];for(let s=start;s<end;s+=12){const q=this.track.sample(s);for(const d of[-5,5])lights.push({p:this.track.point(s,d,8.9),x:.3,y:.1,z:3,ry:q.heading});}instance(this.scene,new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#ffddb0',emissive:'#ffb35c',emissiveIntensity:3,toneMapped:false}),lights);
    for(const s of[start,end]){const q=this.track.sample(s);const ring=new THREE.Mesh(new THREE.TorusGeometry(12,.65,8,32,Math.PI),material('#b0b0a1'));ring.position.copy(q.p);ring.scale.y=.84;ring.rotation.y=q.heading;this.scene.add(ring);}
  }
  buildSigns(){
    const signs=[[170,'PACIFIC COAST','KAZE PASS   2 km'],[this.track.length*.19,'KAZE TUNNEL','LIGHTS ON  ↗'],[this.track.length*.46,'SOLSTICE CITY','KEEP YOUR LINE'],[this.track.length*.87,'HORIZON BRIDGE','COASTAL ROUTE  01']];
    for(const[s,title,sub]of signs){const canvas=document.createElement('canvas');canvas.width=768;canvas.height=256;const c=canvas.getContext('2d');c.fillStyle='#244843';c.fillRect(0,0,768,256);c.strokeStyle='#cbd4b8';c.lineWidth=5;c.strokeRect(12,12,744,232);c.fillStyle='#e5e7d0';c.font='bold 54px sans-serif';c.fillText(title,38,105);c.font='30px sans-serif';c.fillText(sub,40,178);c.font='64px sans-serif';c.fillText('↗',670,165);const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;const sign=new THREE.Mesh(new THREE.BoxGeometry(9,3,.16),new THREE.MeshStandardMaterial({map,roughness:.8}));const q=this.track.sample(s);sign.position.copy(this.track.point(s,3,10.2));sign.rotation.y=q.heading+Math.PI;this.scene.add(sign);const posts=[{p:this.track.point(s,11,5.7),x:.25,y:11.4,z:.25,ry:q.heading},{p:this.track.point(s,3.7,11.5),x:15,y:.25,z:.25,ry:q.heading}];instance(this.scene,new THREE.BoxGeometry(1,1,1),material('#8e9b91',.4,.6),posts);}
    const chevrons=[];for(let s=0;s<this.track.length;s+=24){const q=this.track.sample(s);if(Math.abs(q.curvature)>.0045)chevrons.push({p:this.track.point(s,q.curvature>0?-10.2:10.2,1.6),ry:q.heading,x:1,y:.72,z:.055});}
    const c=document.createElement('canvas');c.width=64;c.height=64;const x=c.getContext('2d');x.fillStyle='#d1b35d';x.fillRect(0,0,64,64);x.fillStyle='#273a37';x.beginPath();x.moveTo(12,0);x.lineTo(37,0);x.lineTo(62,32);x.lineTo(37,64);x.lineTo(12,64);x.lineTo(37,32);x.fill();instance(this.scene,new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({map:new THREE.CanvasTexture(c),side:THREE.DoubleSide}),chevrons);
  }
  buildParticles(){
    const count=250,positions=new Float32Array(count*3),colors=new Float32Array(count*3);this.particleLife=new Float32Array(count);this.particleVelocity=new Float32Array(count*3);this.particleCursor=0;
    this.particleGeometry=new THREE.BufferGeometry();this.particleGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3));this.particleGeometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    this.particles=new THREE.Points(this.particleGeometry,new THREE.PointsMaterial({size:.12,vertexColors:true,transparent:true,opacity:.7,depthWrite:false,blending:THREE.AdditiveBlending}));this.particles.frustumCulled=false;this.scene.add(this.particles);
    const rainPos=new Float32Array(900*6);for(let i=0;i<900;i++){const x=(seeded(i+2)-.5)*100,y=seeded(i+5)*45,z=(seeded(i+9)-.5)*100;rainPos.set([x,y,z,x-.3,y-1.1,z],i*6);}const rainG=new THREE.BufferGeometry();rainG.setAttribute('position',new THREE.BufferAttribute(rainPos,3));this.rain=new THREE.LineSegments(rainG,new THREE.LineBasicMaterial({color:'#bed0c8',transparent:true,opacity:.35,depthWrite:false}));this.rain.visible=false;this.scene.add(this.rain);
    const markGeo=new THREE.BufferGeometry();this.skidPositions=new Float32Array(1600*6);markGeo.setAttribute('position',new THREE.BufferAttribute(this.skidPositions,3));this.skids=new THREE.LineSegments(markGeo,new THREE.LineBasicMaterial({color:'#182123',transparent:true,opacity:.45}));this.skids.frustumCulled=false;this.scene.add(this.skids);this.skidCursor=0;this.lastSkids=null;
  }
  emit(p,color,count=8){const positions=this.particleGeometry.attributes.position.array,colors=this.particleGeometry.attributes.color.array,col=new THREE.Color(color);for(let j=0;j<count;j++){const i=this.particleCursor++%this.particleLife.length;positions.set([p.x,p.y+.3,p.z],i*3);colors.set([col.r,col.g,col.b],i*3);this.particleLife[i]=.5+Math.random()*.5;this.particleVelocity.set([(Math.random()-.5)*7,Math.random()*4,(Math.random()-.5)*7],i*3);}this.particleGeometry.attributes.color.needsUpdate=true;}
  setQuality(value){this.quality=value;this.renderer.setPixelRatio(Math.min(devicePixelRatio,value==='high'?2:value==='low'?1:1.5));this.bloom.enabled=value!=='low';this.renderer.shadowMap.enabled=value!=='low';this.resize();}
  resize(){this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight);this.composer.setSize(innerWidth,innerHeight);}
  update(dt,player,car,mode='menu',cameraMode=0){
    this.time+=dt;this.uniforms.time.value=this.time;
    let targetWet=this.weather==='rain'?.7:this.weather==='storm'?1:0,targetNight=this.weather==='night'?1:this.weather==='storm'?.55:0;
    if(this.weather==='dynamic'){targetWet=clamp(Math.sin(this.time/60)*.9,0,1);targetNight=(Math.sin(this.time/110-.8)+1)*.42;}
    this.wet=damp(this.wet,targetWet,.7,dt);this.night=damp(this.night,targetNight,.7,dt);this.uniforms.wet.value=this.wet;this.uniforms.night.value=this.night;
    this.sun.intensity=2.6*(1-this.night*.94)*(1-this.wet*.66);this.ambient.intensity=1.35*(1-this.night*.72);this.renderer.toneMappingExposure=this.weather==='clear'?1.08:.94;
    this.scene.fog.color.set('#bbac96').lerp(new THREE.Color('#233c4b'),this.night).lerp(new THREE.Color('#718b8c'),this.wet*.5);
    this.scene.fog.density=damp(this.scene.fog.density,this.weather==='fog'?.004:this.weather==='storm'?.002:.00058,1,dt);
    this.buildingMaterial.emissiveIntensity=.05+this.night*.9;this.lampMaterial.emissiveIntensity=1.3+this.night*2;
    const q=this.track.sample(player.s);car.root.position.copy(q.p);car.root.rotation.set(-Math.asin(q.slope),q.heading+player.yaw,0,'YXZ');
    const pos=car.root.position,forward=new THREE.Vector3(Math.sin(q.heading+player.yaw),0,Math.cos(q.heading+player.yaw));
    car.root.position.addScaledVector(q.right,player.d);car.paint.roughness=.34-this.wet*.11;
    this.sun.target.position.copy(pos);this.sun.position.copy(pos).add(new THREE.Vector3(-240,330,390));
    this.sky.position.copy(this.camera.position);
    this.headlight.position.copy(pos).addScaledVector(forward,2).add(new THREE.Vector3(0,.7,0));this.headlight.target.position.copy(pos).addScaledVector(forward,50);this.headlight.intensity=25+this.night*140;
    const targetPos=new THREE.Vector3(),targetAim=new THREE.Vector3();let fov=53;
    car.cockpit.visible=cameraMode===2&&mode!=='menu';car.body.visible=!(cameraMode===2&&mode!=='menu');
    if(mode==='menu'){
      const orbit=Math.sin(this.time*.025)*.035;const angle=q.heading+.82+orbit;
      const rightOffset=innerWidth>900?-2.3:-.4;
      targetPos.copy(pos).add(new THREE.Vector3(Math.sin(angle)*9,3.25,-Math.cos(angle)*9));
      targetAim.copy(pos).add(new THREE.Vector3(0,.8,0)).addScaledVector(q.right,rightOffset).addScaledVector(q.tan,2.7);fov=46;
    }else{
      const roadF=q.tan.clone().setY(0).normalize();const velocityDir=roadF.clone().applyAxisAngle(new THREE.Vector3(0,1,0),player.yaw*.45);
      if(cameraMode===0){targetPos.copy(pos).addScaledVector(velocityDir,-7.8-player.u*.027-(player.boost?1.0:0)).add(new THREE.Vector3(0,3.5+player.u*.004,0));targetAim.copy(pos).addScaledVector(velocityDir,10+player.u*.15).add(new THREE.Vector3(0,.95,0));fov=55+clamp(player.u/90,0,1)*6;}
      else if(cameraMode===1){targetPos.copy(pos).addScaledVector(forward,1.05).add(new THREE.Vector3(0,1.14,0));targetAim.copy(pos).addScaledVector(forward,35).add(new THREE.Vector3(0,1.1,0));fov=64;}
      else if(cameraMode===2){targetPos.copy(pos).addScaledVector(forward,-.34).addScaledVector(q.right,.35).add(new THREE.Vector3(0,1.16,0));targetAim.copy(pos).addScaledVector(forward,32).add(new THREE.Vector3(0,1.1,0));fov=69;}
      else{targetPos.copy(pos).addScaledVector(velocityDir,-5.6).addScaledVector(q.right,2.5).add(new THREE.Vector3(0,.85,0));targetAim.copy(pos).addScaledVector(velocityDir,18).add(new THREE.Vector3(0,.8,0));fov=59;}
      // Camera impulses are tied to road texture, load and contact, never random noise.
      if(cameraMode===0)targetPos.addScaledVector(q.right,clamp(player.d,-5.5,5.5)-player.d);
      const pulse=Math.sin(player.s*1.3)*Math.min(player.u/90,1)*.012;
      targetPos.y+=pulse+Math.sin(player.impact*18)*player.impact*.15+player.pitch*.65;
    }
    if(!this.initializedCamera){this.cameraPos.copy(targetPos);this.cameraAim.copy(targetAim);this.initializedCamera=true;}
    this.cameraPos.lerp(targetPos,1-Math.exp(-(mode==='menu'?2:cameraMode===1||cameraMode===2?26:6)*dt));
    this.cameraAim.lerp(targetAim,1-Math.exp(-(mode==='menu'?2:9)*dt));
    // Keep the follow camera above the road on steep crests.
    if(mode!=='menu'&&cameraMode===0)this.cameraPos.y=Math.max(this.cameraPos.y,this.track.sample(player.s-9).p.y+1.1);
    this.camera.position.copy(this.cameraPos);this.camera.lookAt(this.cameraAim);this.camera.fov=damp(this.camera.fov,fov,3,dt);this.camera.updateProjectionMatrix();
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


