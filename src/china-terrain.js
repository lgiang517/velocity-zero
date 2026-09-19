import * as THREE from 'three';
import {chinaMountainMaterial,chinaMountainColor,mountainNoise} from './china-mountain-material.js';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;

/** Indexed metre-scale segments; only nearby route cells are searched per query. */
export function createChinaGround(track,coastalHeight){
 const start=track.extensionStartS??track.legacyLength*.89,end=track.extensionEndS??track.length-track.legacyLength*.007;
 const cells=new Map(),segments=[],cellSize=240;
 for(let s=start;s<end;s+=18){const a=track.sample(s),e=Math.min(end,s+18),b=track.sample(e),segment={s,e,a,b};segments.push(segment);
  for(let iz=Math.floor(Math.min(a.p.z,b.p.z)/cellSize);iz<=Math.floor(Math.max(a.p.z,b.p.z)/cellSize);iz++)for(let ix=Math.floor(Math.min(a.p.x,b.p.x)/cellSize);ix<=Math.floor(Math.max(a.p.x,b.p.x)/cellSize);ix++){const key=ix+':'+iz;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(segment);}
 }
 const nearest=(x,z)=>{
  const cx=Math.floor(x/cellSize),cz=Math.floor(z/cellSize),seen=new Set();let best=null,minimum=Infinity,bt=0;
  const inspect=line=>{if(seen.has(line))return;seen.add(line);const dx=line.b.p.x-line.a.p.x,dz=line.b.p.z-line.a.p.z,t=clamp(((x-line.a.p.x)*dx+(z-line.a.p.z)*dz)/(dx*dx+dz*dz)),distance=Math.hypot(x-mix(line.a.p.x,line.b.p.x,t),z-mix(line.a.p.z,line.b.p.z,t));if(distance<minimum){minimum=distance;best=line;bt=t;}};
  for(let r=0;r<=7;r++){
   for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){if(r&&Math.abs(dx)!==r&&Math.abs(dz)!==r)continue;for(const line of cells.get((cx+dx)+':'+(cz+dz))||[])inspect(line);}
   const outside=Math.min(x-(cx-r)*cellSize,(cx+r+1)*cellSize-x,z-(cz-r)*cellSize,(cz+r+1)*cellSize-z);
   if(minimum<=outside)break;if(r===7)for(const line of segments)inspect(line);
  }
  const station=mix(best.s,best.e,bt);return{s:station,distance:minimum,p:best.a.p.clone().lerp(best.b.p,bt),right:best.a.right,section:track.sectionAt(station)};
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
  // Folded valley walls branch into oblique tributary ravines. Preserve the
  // foundation/road corridor and shoreline while replacing distant domes.
  const warp=(mountainNoise(x/360,z/290)-.5)*72;
  const westAxis=-3520+Math.sin(z*.0037)*42+warp,eastAxis=-2200+Math.sin(z*.0049+1.3)*57-warp*.65;
  const wx=(x-westAxis)/(x<westAxis?365:255),ex=(x-eastAxis)/(x<eastAxis?285:410);
  const westRidge=184*Math.exp(-Math.pow(Math.abs(wx),1.35)),eastRidge=218*Math.exp(-Math.pow(Math.abs(ex),1.45));
  const channel=mountainNoise((z+x*.24+warp*.4)/79,x/280);
  const tributary=Math.pow(1-Math.abs(channel*2-1),4)*38;
  const ribs=(mountainNoise((z-x*.31)/125,x/510)-.5)*24;
  const exposed=Math.max(westRidge,eastRidge)/218;
  const folded=14+westRidge+eastRidge+northHills+natural+ribs*exposed-tributary*exposed;
  land=mix(land,folded,smooth(55,155,dist)*smooth(-1080,-810,z));
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
  const duku=id==='duku',dukuMix=duku?smooth(0,140,Math.min(q.s-q.section.startS,q.section.endS-q.s)):0;
  if(duku){const edge=Math.min(q.s-q.section.startS,q.section.endS-q.s),bowl=q.p.y-2.2-85*smooth(22,150,dist),weight=smooth(22,65,dist)*(1-smooth(150,260,dist))*smooth(0,140,edge);value=mix(value,Math.min(value,bowl),weight);}
  const bedStart=mix(35,18,dukuMix),bedEnd=mix(115,70,dukuMix);
  value=mix(value,q.p.y-2.2,(1-smooth(bedStart,bedEnd,dist))*roadBed);
  value=mix(value,Math.min(value,q.p.y-3.2),1-smooth(mix(38,18,dukuMix),mix(85,52,dukuMix),dist));
  // Connected rills cut into the visible road banks without raising any road
  // or bridge foundation corridor. Channel amplitude fades at both ends.
  const rill=Math.pow(1-Math.abs(mountainNoise((z+x*.29)/36,x/140)*2-1),5);
  value-=rill*15*smooth(22,48,dist)*(1-smooth(130,190,dist))*shore;
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
 world.chinaGround=ground;const meshes=[],material=chinaMountainMaterial(world),vertexHeights=new Map();
 const xs=ground.segments.map(q=>q.a.p.x),zs=ground.segments.map(q=>q.a.p.z);
 const minX=Math.floor((Math.min(...xs)-400)/320)*320,maxX=Math.ceil((Math.max(...xs)+180)/320)*320,minZ=Math.floor((Math.min(...zs)-260)/320)*320,maxZ=Math.ceil((Math.max(...zs)+320)/320)*320;
 const stats={triangles:0,tiles:0,island:ground.island,river:false,assetDownloads:0,perFrameUpdates:0,terrainSpacing:20,textureSamples:material.userData.textureSamples};
 function tile(name,positions,indices,receive=false,continuousNormals=false){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();
  const p=g.attributes.position,normals=g.attributes.normal,colors=[],data=[];
  for(let i=0;i<p.count;i++){
   const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
   if(continuousNormals){const dx=(ground.height(x+5,z)-ground.height(x-5,z))/10,dz=(ground.height(x,z+5)-ground.height(x,z-5))/10,k=1/Math.hypot(dx,1,dz);normals.setXYZ(i,-dx*k,k,-dz*k);}
   const c=chinaMountainColor(x,y,z,normals.getX(i),normals.getY(i),normals.getZ(i));colors.push(...c.slice(0,3));data.push(c[4],c[3],c[5]);
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('mountainData',new THREE.Float32BufferAttribute(data,3));g.computeBoundingBox();g.computeBoundingSphere();
  const mesh=new THREE.Mesh(g,material);mesh.name=name;mesh.receiveShadow=receive;mesh.castShadow=false;world.scene.add(mesh);meshes.push(mesh);stats.triangles+=indices.length/3;stats.tiles++;
 }
 for(let z=minZ;z<maxZ;z+=320)for(let x=minX;x<maxX;x+=320){
  const positions=[],indices=[],n=16;
  for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){const wx=x+i*20,wz=z+j*20;const h=ground.height(wx,wz);positions.push(wx,h,wz);vertexHeights.set(wx+':'+wz,h);}
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){const wx=x+(i+.5)*20,wz=z+(j+.5)*20;if(wx>=-500&&wz>=-1200)continue;const a=j*(n+1)+i,b=a+n+1;indices.push(a,b,a+1,a+1,b,b+1);}
  if(indices.length)tile('China landscape '+x+':'+z,positions,indices,false,true);
 }
 // Near-road berms join the shoulder continuously; bridge spans remain open.
 const columns=[-90,-65,-44,-29,-19,-14,-10.3,10.3,14,19,29,44,65,90];
 for(let s=ground.start;s<ground.end;s+=160){const positions=[],indices=[],end=Math.min(ground.end,s+160),n=Math.ceil((end-s)/8);
  for(let i=0;i<=n;i++){const d=s+(end-s)*i/n,q=track.sample(d),section=track.sectionAt(d);for(const lateral of columns){const p=track.point(d,track.roadLateral(d,lateral)),base=ground.height(p.x,p.z),bridge=!!section?.elevated;p.y=bridge?base-.2:mix(q.p.y-.24,base,smooth(14,90,Math.abs(lateral)));positions.push(p.x,p.y,p.z);}}
  for(let i=0;i<n;i++)for(let j=0;j<columns.length-1;j++){if(j===6)continue;const a=i*columns.length+j,b=a+columns.length;indices.push(a,b,a+1,a+1,b,b+1);}tile('China roadside berm '+Math.round(s),positions,indices,true);
 }
 // A visible river runs across the canyon, beneath the suspension main span.
 const section=track.section('sichuan'),q=track.sample((section.startS+section.endS)/2),riverY=q.p.y-Math.min(165,q.p.y-12)-1.7;
 const positions=[],indices=[],colors=[];for(let i=0;i<=28;i++){const d=-700+i*50;for(const side of[-1,1]){const p=q.p.clone().addScaledVector(q.right,d).addScaledVector(q.tan,side*(26+5*Math.sin(i*.8))+15*Math.sin(i*.3));positions.push(p.x,riverY,p.z);colors.push(.14,.30,.28);}}
 for(let i=0;i<28;i++){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();const river=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:'#516b60',roughness:.25,metalness:.12}));river.name='Dadu River canyon water';world.scene.add(river);stats.river=true;const surfaceHeight=(x,z)=>{const gx=Math.floor(x/20)*20,gz=Math.floor(z/20)*20,u=(x-gx)/20,v=(z-gz)/20,a=vertexHeights.get(gx+':'+gz),b=vertexHeights.get((gx+20)+':'+gz),c=vertexHeights.get(gx+':'+(gz+20)),d=vertexHeights.get((gx+20)+':'+(gz+20));if([a,b,c,d].some(h=>h===undefined))return ground.height(x,z);return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);};
 world.chinaTerrain={meshes,stats,surfaceHeight};return world.chinaTerrain;
}
