import * as THREE from 'three';
import {environmentAssets} from './environment-assets.js';

const UP=new THREE.Vector3(0,1,0),CENTRE=15,WIDTH=2.6,TOP=.04,CHUNK=210;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

// Interpolate the two rendered ribbon vertices, not a normalized interpolated
// right vector: both the height and bend then match the existing verge exactly.
function ribbonPoint(track,s,lateral,above=TOP){
 const d=clamp(s,0,track.length),i=Math.min(track.count-1,Math.floor(d/track.step)),f=d/track.step-i;
 const a=track.samples[i],b=track.samples[i+1];
 return a.p.clone().addScaledVector(a.right,lateral).lerp(b.p.clone().addScaledVector(b.right,lateral),f).addScaledVector(UP,above);
}

// The terrain's CPU height function is evaluated on a coarse rendered grid.
// Decode the already allocated coastal field and interpolate its actual two
// triangles so the new approaches cannot sit underneath that visible surface.
function renderedGround(world,p){
 const field=world.coastalHeightField;
 if(!field)return world.groundHeight(p.x,p.z);
 const {texture,bounds:b,size}=field,data=texture.image.data;
 const gx=clamp((p.x-b.x)/b.z*(size.x-1),0,size.x-1),gz=clamp((p.z-b.y)/b.w*(size.y-1),0,size.y-1);
 const x=Math.min(size.x-2,Math.floor(gx)),z=Math.min(size.y-2,Math.floor(gz)),u=gx-x,v=gz-z;
 const at=(dx,dz)=>{const k=((z+dz)*size.x+x+dx)*4;return (data[k]*256+data[k+1])*512/65535-32;};
 return u+v<=1?at(0,0)*(1-u-v)+at(1,0)*u+at(0,1)*v:at(1,1)*(u+v-1)+at(1,0)*(1-v)+at(0,1)*(1-u);
}

function pavementMaterial(){
 const asset=environmentAssets.roadside?.plaster;
 const mat=new THREE.MeshStandardMaterial({color:'#b6b0a1',roughness:.94,envMapIntensity:.19});
 if(asset){mat.map=asset.diffuse;mat.normalMap=asset.normal;mat.roughnessMap=asset.rough;mat.normalScale.set(.19,.19);}
 // Modest slab joints reuse metric UVs and existing photographs. No new
 // texture, transparent decal, frame update or additional render pass.
 mat.onBeforeCompile=shader=>{
  shader.vertexShader='varying vec2 vPavementUv;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvPavementUv=uv;');
  shader.fragmentShader='varying vec2 vPavementUv;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec2 joints=abs(fract(vPavementUv)-.5);
   float joint=min(joints.x,joints.y),pixel=max(fwidth(vPavementUv.x),fwidth(vPavementUv.y));
   diffuseColor.rgb*=mix(.79,1.,smoothstep(.006,.012+pixel,joint));`);
 };
 mat.customProgramCacheKey=()=> 'neighborhood-paving-v1';return mat;
}

export function buildNeighborhoodPaths(world,sites){
 const routes=[],frontages=[],buckets=new Map(),surfaces=[],groups=[];
 const stats={routes:0,frontages:0,sidewalkMetres:0,instances:0,batches:0,triangles:0};
 if(!sites.length)return {routes,frontages,stats,containsPoint:()=>false};
 const materials={paving:pavementMaterial(),curb:new THREE.MeshStandardMaterial({color:'#a7a697',roughness:.94,envMapIntensity:.13})};
 for(const side of[-1,1]){
  const sorted=sites.filter(site=>site.side===side).sort((a,b)=>a.s-b.s);
  for(const site of sorted){let group=groups.at(-1);if(!group||group.side!==side||site.s-group.sites.at(-1).s>260){group={side,sites:[]};groups.push(group);}group.sites.push(site);}
 }
 function solid(kind,top,bottom,uv){
  const centre=top.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).multiplyScalar(.25);
  const key=kind+'|'+Math.floor(centre.x/CHUNK)+':'+Math.floor(centre.z/CHUNK);
  if(!buckets.has(key))buckets.set(key,{kind,positions:[],uv:[]});
  const bucket=buckets.get(key),points=[...top,...top.map(p=>new THREE.Vector3(p.x,bottom,p.z))];
  const faces=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
  // Both side signs and connector headings may reverse polygon winding.
  const winding=new THREE.Vector3().subVectors(top[1],top[0]).cross(new THREE.Vector3().subVectors(top[2],top[0])).y;
  for(const face of faces){const order=winding>0?[face[0],face[2],face[1]]:face;for(const i of order){const p=points[i];bucket.positions.push(p.x,p.y,p.z);bucket.uv.push(...(uv?.[i%4]||[p.x/2,p.z/2]));}}
  stats.instances++;stats.triangles+=12;
 }
 const foot=(points)=>Math.min(...points.map(p=>Math.min(renderedGround(world,p),world.groundHeight(p.x,p.z))))-.45;
 for(const group of groups){
  const {side}=group,start=Math.max(0,group.sites[0].s-12),end=Math.min(world.track.length,group.sites.at(-1).s+12);
  const stations=[start,end,...group.sites.flatMap(site=>[site.s-1.2,site.s,site.s+1.2])];
  for(let i=Math.ceil(start/world.track.step);i*world.track.step<end;i++)stations.push(i*world.track.step);
  const ss=[...new Set(stations.filter(s=>s>=start&&s<=end))].sort((a,b)=>a-b);
  const points=ss.map(s=>ribbonPoint(world.track,s,side*CENTRE)),route={points,length:0,siteIds:group.sites.map(site=>site.id)};
  for(let i=1;i<points.length;i++)route.length+=points[i].distanceTo(points[i-1]);
  const routeIndex=routes.length;routes.push(route);stats.sidewalkMetres+=route.length;
  for(let i=0;i<ss.length-1;i++){
   const a=ss[i],b=ss[i+1],inner=side*(CENTRE-WIDTH/2),outer=side*(CENTRE+WIDTH/2);
   const corners=[ribbonPoint(world.track,a,inner),ribbonPoint(world.track,a,outer),ribbonPoint(world.track,b,outer),ribbonPoint(world.track,b,inner)];
   const uv=[[0,a/2],[WIDTH/2,a/2],[WIDTH/2,b/2],[0,b/2]];
   solid('paving',corners,foot(corners),uv);
   surfaces.push({a:points[i],b:points[i+1],half:WIDTH/2});
   for(const edge of[inner,outer]){
    if(edge===outer&&group.sites.some(site=>Math.abs((a+b)/2-site.s)<1.201))continue;
    const curb=[ribbonPoint(world.track,a,edge-.085,TOP+.10),ribbonPoint(world.track,a,edge+.085,TOP+.10),ribbonPoint(world.track,b,edge+.085,TOP+.10),ribbonPoint(world.track,b,edge-.085,TOP+.10)];
    solid('curb',curb,Math.min(corners[0].y,corners[2].y)-.25);
   }
  }
  for(const site of group.sites){
   const entryPoint=new THREE.Vector3(0,0,site.plotD/2+4.35).applyAxisAngle(UP,site.heading).add(site.p);
   entryPoint.y=Math.min(site.p.y+.12,world.groundHeight(entryPoint.x,entryPoint.z)+.12);
   const sidewalkPoint=ribbonPoint(world.track,site.s,side*CENTRE),outer=ribbonPoint(world.track,site.s,side*(CENTRE+WIDTH/2));
   const direction=outer.clone().sub(entryPoint).setY(0).normalize(),across=new THREE.Vector3(direction.z,0,-direction.x);
   // Cover the very end of the old stairs with a supported landing. This
   // resolves the 8–16 cm terrain-grid discrepancy at several existing doors.
   const startPoint=entryPoint.clone().addScaledVector(direction,-.62),run=Math.hypot(outer.x-startPoint.x,outer.z-startPoint.z),count=Math.max(2,Math.ceil(run/.40));
   const stations=Array.from({length:count+1},(_,i)=>startPoint.clone().lerp(outer,i/count));
   const base=world.track.sample(site.s),surface=p=>{
    const lateral=Math.abs((p.x-base.p.x)*base.right.x+(p.z-base.p.z)*base.right.z);
    return Math.max(renderedGround(world,p),lateral<=20.02?base.p.y-.2:-Infinity);
   };
   const oldEndY=world.groundHeight(entryPoint.x,entryPoint.z)-site.p.y+.12;
   const oldCount=Math.max(2,Math.min(18,Math.ceil((.12-oldEndY)/.18))),oldRun=4.35/oldCount;
   const oldStep=Math.min(oldCount-1,Math.floor((4.35-.62)/oldRun));
   const landingTop=site.p.y+.12+Math.min(0,oldEndY-.12)*(oldStep+1)/oldCount+.008;
   const heights=stations.map((p,i)=>Math.max(landingTop+(outer.y-landingTop)*i/count,...[-.90,0,.90].map(d=>surface(p.clone().addScaledVector(across,d))+.075)));
   // Spread the verge's vertical lip across human-scale risers. Propagation
   // raises only the supporting approach, never the house or the driving road.
   const rise=.16;
   for(let i=count-1;i>=0;i--)heights[i]=Math.max(heights[i],heights[i+1]-rise);
   for(let i=1;i<=count;i++)heights[i]=Math.max(heights[i],heights[i-1]-rise);
   const approachPoints=[];
   for(let i=0;i<count;i++){
    const a=stations[i],b=stations[i+1],ramp=Math.abs(heights[i+1]-heights[i])/(run/count)<.085;
    const ya=ramp?heights[i]:Math.max(heights[i],heights[i+1]),yb=ramp?heights[i+1]:ya;
    const corners=[a.clone().addScaledVector(across,-.9).setY(ya),a.clone().addScaledVector(across,.9).setY(ya),b.clone().addScaledVector(across,.9).setY(yb),b.clone().addScaledVector(across,-.9).setY(yb)];
    solid('paving',corners,foot(corners));surfaces.push({a:a.clone(),b:b.clone(),half:.9});
    approachPoints.push(a.clone().setY(ya),b.clone().setY(yb));
   }
   approachPoints.push(outer.clone().setY(heights[count]),sidewalkPoint.clone());
   frontages.push({siteId:site.id,sidewalkPoint,entryPoint,routeIndex,approachPoints});
  }
 }
 for(const [key,bucket] of buckets){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(bucket.positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(bucket.uv,2));geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,materials[bucket.kind]);mesh.name='Neighborhood '+key;mesh.castShadow=false;mesh.receiveShadow=true;world.scene.add(mesh);stats.batches++;
 }
 stats.routes=routes.length;stats.frontages=frontages.length;
 const containsPoint=(x,z,padding=0)=>surfaces.some(({a,b,half})=>{const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);return Math.hypot(x-a.x-t*dx,z-a.z-t*dz)<half+padding;});
 return {routes,frontages,stats,containsPoint};
}
