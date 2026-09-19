import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const UP=new THREE.Vector3(0,1,0);
const palette={wood:'#88705a',dark:'#343c3b',cream:'#e1d7bd',green:'#486d66',clay:'#92725b',leaf:'#617346',flower:'#c28673',fabric:'#a9bab3'};

/** Furniture is merged into spatial chunks once; only nearby chunks are drawn. */
export function buildNeighborhoodProps(world,sites){
 const prototypes={box:new THREE.BoxGeometry(1,1,1),cylinder:new THREE.CylinderGeometry(1,1,1,10),pot:new THREE.CylinderGeometry(.72,.56,1,10),bush:new THREE.IcosahedronGeometry(1,1),wheel:new THREE.TorusGeometry(1,.10,4,16),shade:new THREE.ConeGeometry(1,.24,12,1,false)};
 const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.82,metalness:.04,envMapIntensity:.2});
 const chunks=new Map(),labels=[],items=[];
 const stats={benches:0,bicycles:0,cafes:0,planters:0,laundry:0,triangles:0,batches:0,visibleBatches:0};
 function put(site,shape,x,y,z,sx,sy,sz,color,{rx=0,ry=0,rz=0,kind='detail'}={}){
  const p=new THREE.Vector3(x,y,z).applyAxisAngle(UP,site.heading).add(site.p),local=new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz,'YXZ')),heading=new THREE.Quaternion().setFromAxisAngle(UP,site.heading);heading.multiply(local);
  const matrix=new THREE.Matrix4().compose(p,heading,new THREE.Vector3(sx,sy,sz)),g=prototypes[shape].index?prototypes[shape].toNonIndexed():prototypes[shape].clone();g.applyMatrix4(matrix);g.deleteAttribute('uv');
  const col=new THREE.Color(color),colors=new Float32Array(g.attributes.position.count*3);for(let i=0;i<colors.length;i+=3){colors[i]=col.r;colors[i+1]=col.g;colors[i+2]=col.b;}g.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const key=Math.floor(p.x/180)+':'+Math.floor(p.z/180);if(!chunks.has(key))chunks.set(key,[]);chunks.get(key).push(g);items.push({siteId:site.id,kind,position:p});
 }
 function beam(site,a,b,r,color,kind='detail'){
  const delta=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),mid=new THREE.Vector3(...a).add(new THREE.Vector3(...b)).multiplyScalar(.5),q=new THREE.Quaternion().setFromUnitVectors(UP,delta.clone().normalize()),e=new THREE.Euler().setFromQuaternion(q,'YXZ');
  put(site,'cylinder',mid.x,mid.y,mid.z,r,delta.length(),r,color,{rx:e.x,ry:e.y,rz:e.z,kind});
 }
 function planter(site,x,z){
  put(site,'pot',x,.40,z,.31,.52,.31,palette.clay,{kind:'planter'});put(site,'bush',x,.80,z,.32,.39,.32,palette.leaf);
  for(const [dx,dz]of [[-.13,.05],[.12,.08],[0,-.13]])put(site,'bush',x+dx,1.08,z+dz,.065,.08,.065,palette.flower);
  stats.planters++;
 }
 function bicycle(site,x,z){
  const y=.14;
  for(const dx of[-.52,.52]){put(site,'wheel',x+dx,y+.35,z,.33,.33,.33,palette.dark,{kind:'bicycle'});put(site,'wheel',x+dx,y+.35,z,.27,.27,.19,'#a4aaa5');
   for(const a of[0,Math.PI/3,2*Math.PI/3])beam(site,[x+dx-Math.cos(a)*.27,y+.35-Math.sin(a)*.27,z],[x+dx+Math.cos(a)*.27,y+.35+Math.sin(a)*.27,z],.007,'#b5bbb2');}
  const a=[x-.52,y+.35,z],b=[x-.16,y+.88,z],c=[x+.04,y+.34,z],d=[x+.39,y+.90,z],e=[x+.52,y+.35,z];
  for(const [f,t]of [[a,b],[b,c],[c,a],[b,d],[d,c],[d,e]])beam(site,f,t,.023,palette.green,'bicycle');
  beam(site,b,[x-.18,y+1.01,z],.017,palette.dark);put(site,'box',x-.22,y+1.02,z,.27,.06,.16,palette.dark);
  beam(site,d,[x+.42,y+1.11,z],.017,palette.dark);beam(site,[x+.42,y+1.11,z-.18],[x+.42,y+1.11,z+.18],.02,palette.dark);
  beam(site,c,[x+.14,y+.13,z+.16],.012,palette.dark);stats.bicycles++;
 }
 for(const site of sites){
  const gardenZ=site.plotD/2-1.35,frontZ=-1.35+site.d/2,bays=Math.max(2,Math.floor(site.w/2.6)),doorX=-site.w/2+site.w/bays*(Math.floor(bays/2)+.5);
  // Complete the existing seat into a back-supported garden bench.
  const benchZ=gardenZ+.95;
  put(site,'box',-2,.95,benchZ-.23,1.75,.52,.085,palette.wood,{kind:'bench'});
  for(const x of[-2.72,-1.28]){put(site,'box',x,.77,benchZ,.055,.43,.055,palette.dark);put(site,'box',x,.93,benchZ,.075,.06,.51,palette.wood);}stats.benches++;
  planter(site,site.w*.31,gardenZ-.95);planter(site,-site.w*.40,frontZ+.7);
  if(site.variant!==3&&site.id%2===0){const parked={...site,p:new THREE.Vector3(site.w/2+.62,0,frontZ-1.5).applyAxisAngle(UP,site.heading).add(site.p),heading:site.heading+Math.PI/2};bicycle(parked,0,0);}
  // Useful entrance identity; shared small atlas instead of per-house textures.
  labels.push({site,x:doorX-.90,y:1.6,z:frontZ+.17,w:.38,h:.22,cell:labels.length+2});
  if(site.variant===3){
   stats.cafes++;const awningW=site.w*.78,stripes=14;
   for(let i=0;i<stripes;i++){const x=-awningW/2+(i+.5)*awningW/stripes,color=i%2?palette.cream:palette.green;put(site,'box',x,2.95,frontZ+1.0,awningW/stripes+.006,.09,1.95,color,{rx:.055,kind:'cafe'});put(site,'box',x,2.78,frontZ+1.97,awningW/stripes+.006,.29,.055,color);}
   labels.push({site,x:0,y:3.26,z:frontZ+.17,w:2.3,h:.32,cell:0});
   // Tables occupy the far side of the terrace, leaving the central entrance clear.
   const x=site.w*.27,z=gardenZ-.1;
   put(site,'cylinder',x,.92,z,.48,.08,.48,palette.wood,{kind:'cafe'});put(site,'cylinder',x,.53,z,.075,.74,.075,palette.dark);put(site,'cylinder',x,.18,z,.31,.08,.31,palette.dark);
   for(const dx of[-.75,.75]){put(site,'box',x+dx,.54,z,.43,.085,.43,palette.wood);for(const dz of[-.16,.16])put(site,'box',x+dx,.32,z+dz,.055,.46,.055,palette.dark);put(site,'box',x+dx,.85,z-.22,.43,.52,.07,palette.green);}
   put(site,'cylinder',x,1.32,z,.032,2.3,.032,palette.wood);put(site,'shade',x,2.55,z,1.16,1.16,1.16,site.id%2?palette.cream:palette.green);
   // Cups make the scale legible when inspecting a terrace.
   for(const dx of[-.17,.18])put(site,'cylinder',x+dx,1.02,z+.08,.047,.11,.047,palette.cream);
  }
  if(site.floors>1&&site.variant!==3){
   const x=-site.w/2+site.w/Math.max(2,Math.floor(site.w/2.6))*.5,z=frontZ+1.02,y=4.10;
   beam(site,[x-.78,y,z],[x+.72,y,z],.013,palette.dark,'laundry');
   for(let i=0;i<3;i++)put(site,'box',x-.56+i*.44,y-.27,z,.33,.50,.025,[palette.fabric,palette.cream,'#a48271'][i],{rz:(i-1)*.06,kind:'laundry'});
   stats.laundry++;
  }
 }
 const meshes=[];
 for(const [key,parts]of chunks){const geometry=mergeGeometries(parts,false);for(const part of parts)part.dispose();geometry.computeBoundingBox();geometry.computeBoundingSphere();const mesh=new THREE.Mesh(geometry,material);mesh.name='Neighborhood daily life '+key;mesh.castShadow=false;mesh.receiveShadow=true;world.scene.add(mesh);meshes.push(mesh);stats.triangles+=geometry.attributes.position.count/3;}
 let atlas=null;
 if(typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const ctx=canvas.getContext('2d');
  for(let cell=0;cell<32;cell++){const x=cell%4*128,y=Math.floor(cell/4)*32;ctx.fillStyle='#354c45';ctx.fillRect(x,y,128,32);ctx.strokeStyle='#b8b497';ctx.strokeRect(x+2,y+2,124,28);ctx.fillStyle='#f1ead5';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=cell===0?'bold 15px sans-serif':'bold 21px sans-serif';ctx.fillText(cell===0?'COAST CAFE':cell===1?'OPEN':String(cell-1).padStart(2,'0'),x+64,y+17);}
  atlas=new THREE.CanvasTexture(canvas);atlas.colorSpace=THREE.SRGBColorSpace;
 }
 const labelMaterial=new THREE.MeshStandardMaterial({color:'#e6e2ca',map:atlas,roughness:.84}),labelParts=[];
 for(const label of labels){const {site,x,y,z,w,h,cell}=label,g=new THREE.PlaneGeometry(w,h).toNonIndexed(),uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,(cell%4+uv.getX(i))/4,1-(Math.floor(cell/4)+1-uv.getY(i))/8);g.rotateY(site.heading);g.translate(...new THREE.Vector3(x,y,z).applyAxisAngle(UP,site.heading).add(site.p).toArray());labelParts.push(g);}
 if(labelParts.length){const geometry=mergeGeometries(labelParts,false);labelParts.forEach(g=>g.dispose());geometry.computeBoundingSphere();const mesh=new THREE.Mesh(geometry,labelMaterial);mesh.name='Neighborhood door numbers and cafe signs';world.scene.add(mesh);meshes.push(mesh);stats.triangles+=geometry.attributes.position.count/3;}
 for(const g of Object.values(prototypes))g.dispose();stats.batches=meshes.length;
 return {stats,items,update(camera,quality){const range=quality==='low'?95:quality==='high'?230:155;stats.visibleBatches=0;for(const mesh of meshes){const b=mesh.geometry.boundingSphere;mesh.visible=camera.position.distanceTo(b.center)<range+b.radius;if(mesh.visible)stats.visibleBatches++;}},dispose(){for(const mesh of meshes){world.scene.remove(mesh);mesh.geometry.dispose();}material.dispose();labelMaterial.dispose();atlas?.dispose();}};
}
