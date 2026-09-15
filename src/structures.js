import * as THREE from 'three';

function batch(scene,geometry,material,items){
 const mesh=new THREE.InstancedMesh(geometry,material,items.length),dummy=new THREE.Object3D();
 for(let i=0;i<items.length;i++){const q=items[i];dummy.position.copy(q.p);dummy.rotation.set(q.pitch||0,q.heading||0,0,'YXZ');dummy.scale.set(...(q.scale||[1,1,1]));dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}
 mesh.receiveShadow=true;mesh.computeBoundingSphere();scene.add(mesh);return mesh;
}

export function addBridgeDetail(world){
 const {track,scene}=world,start=track.length*.90,end=track.length*.993;
 const deck=[],ribs=[],caps=[];
 // Pitch deck slabs with the road so their downhill ends stay below the asphalt.
 for(let s=start;s<end;s+=12){const q=track.sample(s),pitch=-Math.atan2(q.tan.y,Math.hypot(q.tan.x,q.tan.z));deck.push({p:track.point(s,0,-.64),heading:q.heading,pitch,scale:[22,.95,12.3]});ribs.push({p:track.point(s,0,-1.2),heading:q.heading,pitch,scale:[23,.6,.45]});}
 for(const f of[.25,.72])for(const side of[-1,1]){
  const s=start+(end-start)*f,q=track.sample(s);
  caps.push({p:track.point(s,side*12,1.7),heading:q.heading,scale:[2.2,3.4,3.2]});
  caps.push({p:track.point(s,side*12,64.1),heading:q.heading,scale:[2.1,.35,3.1]});
 }
 batch(scene,new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#8d9797',roughness:.7,metalness:.15}),deck);
 batch(scene,new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#4a6769',roughness:.45,metalness:.65}),ribs);
 batch(scene,new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#cc6d39',roughness:.42,metalness:.3}),caps);
}

// Shared section vertices form one closed swept solid per side. Sampling the
// road elevation and lateral frame removes the gaps caused by horizontal slabs.
export function tunnelWalkwayGeometry(track,side,{start=track.length*.22,end=track.length*.26,step=1.5}={}){
 if(![-1,1].includes(side)||!(end>start)||!(step>0))throw new Error('Invalid tunnel walkway sweep');
 const segments=Math.ceil((end-start)/step),positions=[],uv=[],indices=[],stations=[];
 const inner=10.3,outer=12.05,bottom=-.3,ramp=Math.min(4,(end-start)/4);
 const low=Math.min(side*inner,side*outer),high=Math.max(side*inner,side*outer);
 for(let i=0;i<=segments;i++){
  const s=start+(end-start)*i/segments,q=track.sample(s);
  const top=.04+.22*Math.min(1,(s-start)/ramp,(end-s)/ramp);
  stations.push(s);
  for(const [d,h] of [[low,bottom],[high,bottom],[high,top],[low,top]]){
   const p=q.p.clone().addScaledVector(q.right,d);p.y+=h;
   positions.push(p.x,p.y,p.z);uv.push(d,s-start);
  }
 }
 for(let i=0;i<segments;i++)for(let j=0;j<4;j++){
  const a=i*4+j,b=i*4+(j+1)%4,c=a+4,d=b+4;indices.push(a,b,c,b,d,c);
 }
 indices.push(0,3,2,0,2,1);
 const last=segments*4;indices.push(last,last+1,last+2,last,last+2,last+3);
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
 geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
 geometry.userData={stations,side,inner,outer,bottom,ramp};return geometry;
}

function tunnelWalkwayMaterial(){
 const material=new THREE.MeshStandardMaterial({color:'#697570',roughness:.9,flatShading:true});
 material.onBeforeCompile=shader=>{
  shader.vertexShader='varying vec2 vWalkway;\n'+shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvWalkway=uv;');
  shader.fragmentShader='varying vec2 vWalkway;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   float seamDistance=abs(mod(vWalkway.y+1.5,3.)-1.5);
   float seam=1.-smoothstep(.009,.026,seamDistance);
   float grain=fract(sin(dot(floor(vWalkway*85.),vec2(12.9898,78.233)))*43758.5453);
   diffuseColor.rgb*=(.96+grain*.06)*(1.-seam*.19);`);
 };
 material.customProgramCacheKey=()=> 'continuous-tunnel-walkway-v1';return material;
}

export function buildDetailedTunnel(world){
 const {track,scene}=world,start=track.length*.22,end=track.length*.26,steps=96,sides=24,positions=[],uv=[],indices=[];
 for(let i=0;i<=steps;i++){
  const s=start+(end-start)*i/steps,q=track.sample(s);
  for(let j=0;j<=sides;j++){
   const a=j/sides*Math.PI,p=q.p.clone().addScaledVector(q.right,Math.cos(a)*12);p.y+=Math.sin(a)*10;
   positions.push(p.x,p.y,p.z);uv.push(j/sides*36,s);
  }
 }
 for(let i=0;i<steps;i++)for(let j=0;j<sides;j++){const a=i*(sides+1)+j,b=a+sides+1;indices.push(a,b,a+1,a+1,b,b+1);}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();
 const concrete=new THREE.MeshStandardMaterial({color:'#7c8582',roughness:.9,side:THREE.DoubleSide,envMapIntensity:.15});
 concrete.onBeforeCompile=shader=>{
  shader.vertexShader='varying vec2 vTunnel;\n'+shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvTunnel=uv;');
  shader.fragmentShader='varying vec2 vTunnel;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   float joint=1.-smoothstep(.01,.055,min(mod(vTunnel.y,3.),mod(vTunnel.x,2.)));
   float stain=sin(vTunnel.x*.85+sin(vTunnel.y*.31))*sin(vTunnel.y*.092)*.05;
   diffuseColor.rgb*=.84+stain-joint*.22;
   float tiles=(1.-smoothstep(2.8,4.,vTunnel.x))+smoothstep(32.,33.2,vTunnel.x);
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.24,.30,.28)*(1.-joint*.18),tiles);`);
 };
 const shell=new THREE.Mesh(geo,concrete);shell.castShadow=true;shell.receiveShadow=true;scene.add(shell);
 const ribs=[],fixtures=[],lamps=[];
 for(let s=start+2;s<end;s+=18){const q=track.sample(s);ribs.push({p:q.p,heading:q.heading,scale:[1,.84,1]});}
 batch(scene,new THREE.TorusGeometry(11.94,.09,5,32,Math.PI),new THREE.MeshStandardMaterial({color:'#3e4b4a',roughness:.66,metalness:.25}),ribs);
 for(let s=start+2;s<end;s+=12){const q=track.sample(s);for(const d of[-5.3,5.3]){
  fixtures.push({p:track.point(s,d,8.82),heading:q.heading,scale:[.46,.18,3.2]});
  lamps.push({p:track.point(s,d,8.7),heading:q.heading,scale:[.25,.055,2.9]});
 }}
 batch(scene,new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#27393b',metalness:.5,roughness:.4}),fixtures);
 batch(scene,new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#fff1c9',emissive:'#ffd697',emissiveIntensity:3.6,toneMapped:false}),lamps);
 const walkwayMaterial=tunnelWalkwayMaterial();
 for(const side of[-1,1]){
  const pipePoints=[];
  for(let i=0;i<=48;i++){const s=start+(end-start)*i/48;pipePoints.push(track.point(s,side*11.15,2.2));}
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pipePoints),96,.07,5,false),new THREE.MeshStandardMaterial({color:'#a46c3f',roughness:.42,metalness:.6})));
  const walkway=new THREE.Mesh(tunnelWalkwayGeometry(track,side,{start,end}),walkwayMaterial);
  walkway.name='Continuous tunnel walkway '+side;walkway.castShadow=true;walkway.receiveShadow=true;scene.add(walkway);
 }
 for(const s of[start,end]){
  const q=track.sample(s),ring=new THREE.Mesh(new THREE.TorusGeometry(12,.67,8,40,Math.PI),new THREE.MeshStandardMaterial({color:'#bbc0b1',roughness:.82}));
  ring.position.copy(q.p);ring.scale.y=.84;ring.rotation.y=q.heading;ring.castShadow=true;ring.receiveShadow=true;scene.add(ring);
 }
 world.tunnelFill=new THREE.PointLight('#ffd3a2',0,46,2);world.tunnelFill2=new THREE.PointLight('#d3e5e6',0,42,2);scene.add(world.tunnelFill,world.tunnelFill2);world.tunnelAmount=0;
}
