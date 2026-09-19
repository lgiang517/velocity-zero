import * as THREE from 'three';
import {terrainMaterial} from './terrain.js';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;

/** Indexed metre-scale segments; only nearby route cells are searched per query. */
export function createChinaGround(track,coastalHeight){
 const start=track.extensionStartS??track.legacyLength*.89,end=track.extensionEndS??track.length-track.legacyLength*.007;
 const cells=new Map(),segments=[],cellSize=240;
 for(let s=start;s<end;s+=18){const a=track.sample(s),e=Math.min(end,s+18),b=track.sample(e),segment={s,e,a,b};segments.push(segment);const key=Math.floor(a.p.x/cellSize)+':'+Math.floor(a.p.z/cellSize);if(!cells.has(key))cells.set(key,[]);cells.get(key).push(segment);}
 const nearest=(x,z)=>{
  const cx=Math.floor(x/cellSize),cz=Math.floor(z/cellSize);let candidates=[];
  for(let r=0;r<=2;r++){for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){if(r&&Math.abs(dx)!==r&&Math.abs(dz)!==r)continue;const group=cells.get((cx+dx)+':'+(cz+dz));if(group)candidates.push(...group);}if(r>=1&&candidates.length)break;}
  if(!candidates.length)candidates=segments;
  let best=null,minimum=Infinity;
  for(const line of candidates){const dx=line.b.p.x-line.a.p.x,dz=line.b.p.z-line.a.p.z,t=clamp(((x-line.a.p.x)*dx+(z-line.a.p.z)*dz)/(dx*dx+dz*dz)),px=mix(line.a.p.x,line.b.p.x,t),pz=mix(line.a.p.z,line.b.p.z,t),distance=Math.hypot(x-px,z-pz);if(distance<minimum){minimum=distance;const s=mix(line.s,line.e,t);best={s,distance,p:new THREE.Vector3(px,mix(line.a.p.y,line.b.p.y,t),pz),right:line.a.right,section:track.sectionAt(s)};}}
  return best;
 };
 const hzmb=track.section('hzmb'),sichuan=track.section('sichuan');
 const islandS=hzmb.endS-95,island=track.sample(islandS);
 const canyon=track.sample((sichuan.startS+sichuan.endS)/2),riverY=canyon.p.y-Math.min(165,canyon.p.y-12)-1.7;
 function height(x,z){
  if(x>=-500&&z>=-1200)return coastalHeight(x,z);
  const q=nearest(x,z),id=q.section?.id,dist=q.distance;
  const natural=Math.sin(x*.009+z*.004)*3+Math.sin(z*.019-x*.006)*2;
  const shore=smooth(-1120,-750,z);
  // Regional landforms remain continuous across nearest-road ownership changes.
  const westWall=150*Math.exp(-(((x+3520)/310)**2)),eastWall=180*Math.exp(-(((x+2200)/360)**2));
  const northHills=55*Math.exp(-(((z-80)/520)**2))*(0.6+0.4*Math.sin(x*.002));
  let land=14+westWall+eastWall+northHills+natural;
  const riverAlong=(x-canyon.p.x)*canyon.right.x+(z-canyon.p.z)*canyon.right.z;
  const riverAcross=(x-canyon.p.x)*canyon.tan.x+(z-canyon.p.z)*canyon.tan.z-15*Math.sin((riverAlong+700)/50*.3);
  const riverCut=(1-smooth(25,85,Math.abs(riverAcross)))*(1-smooth(540,740,Math.abs(riverAlong)));
  land=mix(land,riverY-1.4,riverCut);
  let value=mix(-22,land,shore);
  const delta=new THREE.Vector3(x-island.p.x,0,z-island.p.z),along=delta.dot(island.tan),across=delta.dot(island.right),ell=Math.hypot(along/190,across/120);
  value=Math.max(value,mix(5.5,-22,smooth(.72,1.12,ell)));
  let roadBed=1;
  if(id==='hzmb'||q.section?.kind==='sea-approach')roadBed=0;
  else if(id==='sichuan'){const edge=Math.min(q.s-sichuan.startS,sichuan.endS-q.s);roadBed=1-smooth(0,145,edge);}
  else if(q.section?.kind==='island-to-valley')roadBed=smooth(hzmb.endS+180,hzmb.endS+750,q.s);
  if(id==='duku'){const bowl=q.p.y-2.2-120*smooth(35,210,dist);value=mix(value,Math.min(value,bowl),smooth(35,80,dist));}
  value=mix(value,q.p.y-2.2,(1-smooth(35,115,dist))*roadBed);
  value=mix(value,Math.min(value,q.p.y-3.2),1-smooth(38,85,dist));
  // Feather the new western tiles into the exact old coastal surface.
  const outside=Math.hypot(Math.max(0,-500-x),Math.max(0,-1200-z));
  if(outside<170)value=mix(coastalHeight(x,z),value,smooth(0,170,outside));
  return value;
 }

 return {height,nearest,start,end,island:{s:islandS,position:island.p.toArray(),alongRadius:190,acrossRadius:120},segments};
}

/** Independent western terrain tiles preserve the original coast's resolution. */
export function buildChinaTerrain(world){
 const {track}=world,coastalHeight=world.groundHeight,ground=createChinaGround(track,coastalHeight);world.coastalGroundHeight=coastalHeight;world.groundHeight=ground.height;
 world.chinaGround=ground;const meshes=[],material=terrainMaterial({distant:true,weather:world.uniforms});
 const xs=ground.segments.map(q=>q.a.p.x),zs=ground.segments.map(q=>q.a.p.z);
 const minX=Math.floor((Math.min(...xs)-400)/320)*320,maxX=Math.ceil((Math.max(...xs)+180)/320)*320,minZ=Math.floor((Math.min(...zs)-260)/320)*320,maxZ=Math.ceil((Math.max(...zs)+320)/320)*320;
 const stats={triangles:0,tiles:0,island:ground.island,river:false,assetDownloads:0};
 function tile(name,positions,indices,colors,receive=false){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,material);mesh.name=name;mesh.receiveShadow=receive;mesh.castShadow=false;world.scene.add(mesh);meshes.push(mesh);stats.triangles+=indices.length/3;stats.tiles++;
 }
 const rock=new THREE.Color('#777967'),grass=new THREE.Color('#708055'),sand=new THREE.Color('#aaa08b');
 for(let z=minZ;z<maxZ;z+=320)for(let x=minX;x<maxX;x+=320){
  const positions=[],indices=[],colors=[],n=10;
  for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){const wx=x+i*32,wz=z+j*32,h=ground.height(wx,wz),q=ground.nearest(wx,wz),id=q.section?.id;positions.push(wx,h,wz);const c=(id==='hzmb'?sand:grass).clone().lerp(rock,clamp((q.distance-35)/260)*.75);c.multiplyScalar(.91+.12*Math.sin(wx*.023+wz*.017));colors.push(c.r,c.g,c.b);}
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){const wx=x+(i+.5)*32,wz=z+(j+.5)*32;if(wx>=-500&&wz>=-1200)continue;const a=j*(n+1)+i,b=a+n+1;indices.push(a,b,a+1,a+1,b,b+1);}
  if(indices.length)tile('China landscape '+x+':'+z,positions,indices,colors);
 }
 // Near-road berms join the shoulder continuously; bridge spans remain open.
 const columns=[-90,-55,-30,-14,-10.3,10.3,14,30,55,90];
 for(let s=ground.start;s<ground.end;s+=160){const positions=[],indices=[],colors=[],end=Math.min(ground.end,s+160),n=Math.ceil((end-s)/8);
  for(let i=0;i<=n;i++){const d=s+(end-s)*i/n,q=track.sample(d),section=track.sectionAt(d);for(const lateral of columns){const p=track.point(d,track.roadLateral(d,lateral)),base=ground.height(p.x,p.z),bridge=!!section?.elevated;p.y=bridge?base-.2:mix(q.p.y-.24,base,smooth(14,90,Math.abs(lateral)));positions.push(p.x,p.y,p.z);const c=grass.clone().lerp(rock,smooth(15,90,Math.abs(lateral))*.4);colors.push(c.r,c.g,c.b);}}
  for(let i=0;i<n;i++)for(let j=0;j<columns.length-1;j++){if(j===4)continue;const a=i*columns.length+j,b=a+columns.length;indices.push(a,b,a+1,a+1,b,b+1);}tile('China roadside berm '+Math.round(s),positions,indices,colors,true);
 }
 // A visible river runs across the canyon, beneath the suspension main span.
 const section=track.section('sichuan'),q=track.sample((section.startS+section.endS)/2),riverY=q.p.y-Math.min(165,q.p.y-12)-1.7;
 const positions=[],indices=[],colors=[];for(let i=0;i<=28;i++){const d=-700+i*50;for(const side of[-1,1]){const p=q.p.clone().addScaledVector(q.right,d).addScaledVector(q.tan,side*(26+5*Math.sin(i*.8))+15*Math.sin(i*.3));positions.push(p.x,riverY,p.z);colors.push(.14,.30,.28);}}
 for(let i=0;i<28;i++){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();const river=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:'#516b60',roughness:.25,metalness:.12}));river.name='Dadu River canyon water';world.scene.add(river);stats.river=true;world.chinaTerrain={meshes,stats};return world.chinaTerrain;
}
