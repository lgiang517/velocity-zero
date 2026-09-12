import * as THREE from 'three';

function batch(scene,geometry,material,items){
 const mesh=new THREE.InstancedMesh(geometry,material,items.length),dummy=new THREE.Object3D();
 for(let i=0;i<items.length;i++){const q=items[i];dummy.position.copy(q.p);dummy.rotation.set(0,q.heading||0,0);dummy.scale.set(...(q.scale||[1,1,1]));dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}
 mesh.receiveShadow=true;mesh.computeBoundingSphere();scene.add(mesh);return mesh;
}

export function addBridgeDetail(world){
 const {track,scene}=world,start=track.length*.90,end=track.length*.993;
 const deck=[],ribs=[],caps=[];
 for(let s=start;s<end;s+=12){const q=track.sample(s);deck.push({p:track.point(s,0,-.64),heading:q.heading,scale:[22,.95,12.3]});ribs.push({p:track.point(s,0,-1.2),heading:q.heading,scale:[23,.6,.45]});}
 for(const f of[.25,.72])for(const side of[-1,1]){
  const s=start+(end-start)*f,q=track.sample(s);
  caps.push({p:track.point(s,side*12,1.7),heading:q.heading,scale:[2.2,3.4,3.2]});
  caps.push({p:track.point(s,side*12,64.1),heading:q.heading,scale:[2.1,.35,3.1]});
 }
 batch(scene,new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#8d9797',roughness:.7,metalness:.15}),deck);
 batch(scene,new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#4a6769',roughness:.45,metalness:.65}),ribs);
 batch(scene,new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#cc6d39',roughness:.42,metalness:.3}),caps);
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
 const ribs=[],fixtures=[],lamps=[],walkways=[];
 for(let s=start+2;s<end;s+=18){const q=track.sample(s);ribs.push({p:q.p,heading:q.heading,scale:[1,.84,1]});}
 batch(scene,new THREE.TorusGeometry(11.94,.09,5,32,Math.PI),new THREE.MeshStandardMaterial({color:'#3e4b4a',roughness:.66,metalness:.25}),ribs);
 for(let s=start+2;s<end;s+=12){const q=track.sample(s);for(const d of[-5.3,5.3]){
  fixtures.push({p:track.point(s,d,8.82),heading:q.heading,scale:[.46,.18,3.2]});
  lamps.push({p:track.point(s,d,8.7),heading:q.heading,scale:[.25,.055,2.9]});
 }}
 batch(scene,new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#27393b',metalness:.5,roughness:.4}),fixtures);
 batch(scene,new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#fff1c9',emissive:'#ffd697',emissiveIntensity:3.6,toneMapped:false}),lamps);
 for(const side of[-1,1]){
  const pipePoints=[];
  for(let i=0;i<=48;i++){const s=start+(end-start)*i/48;pipePoints.push(track.point(s,side*11.15,2.2));}
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pipePoints),96,.07,5,false),new THREE.MeshStandardMaterial({color:'#a46c3f',roughness:.42,metalness:.6})));
  for(let s=start;s<end;s+=6){const q=track.sample(s);walkways.push({p:track.point(s,side*11,.13),heading:q.heading,scale:[1.4,.26,6.05]});}
 }
 batch(scene,new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#697570',roughness:.85}),walkways);
 for(const s of[start,end]){
  const q=track.sample(s),ring=new THREE.Mesh(new THREE.TorusGeometry(12,.67,8,40,Math.PI),new THREE.MeshStandardMaterial({color:'#bbc0b1',roughness:.82}));
  ring.position.copy(q.p);ring.scale.y=.84;ring.rotation.y=q.heading;ring.castShadow=true;ring.receiveShadow=true;scene.add(ring);
 }
 world.tunnelFill=new THREE.PointLight('#ffd3a2',0,46,2);world.tunnelFill2=new THREE.PointLight('#d3e5e6',0,42,2);scene.add(world.tunnelFill,world.tunnelFill2);world.tunnelAmount=0;
}
