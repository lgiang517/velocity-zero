import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';

const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
const formats={5120:[1,'getInt8'],5121:[1,'getUint8'],5122:[2,'getInt16'],5123:[2,'getUint16'],5125:[4,'getUint32'],5126:[4,'getFloat32']};
export function readGLB(path){
 const file=fs.readFileSync(path);assert.equal(file.readUInt32LE(0),0x46546c67,'GLB magic');assert.equal(file.readUInt32LE(4),2);assert.equal(file.readUInt32LE(8),file.length);
 let json,bin;for(let p=12;p<file.length;){const n=file.readUInt32LE(p),kind=file.readUInt32LE(p+4);assert.ok(p+8+n<=file.length);const chunk=file.subarray(p+8,p+8+n);if(kind===0x4e4f534a)json=JSON.parse(chunk.toString('utf8').trim());if(kind===0x004e4942)bin=chunk;p+=8+n;}
 assert.ok(json&&bin,'JSON and BIN chunks required');
 function accessor(id){const a=json.accessors[id];assert.ok(a&&!a.sparse,'Dense accessor required');const b=json.bufferViews[a.bufferView],format=formats[a.componentType],width=widths[a.type];assert.ok(b&&format&&width);assert.equal(b.buffer,0);const [bytes,get]=format,offset=(b.byteOffset||0)+(a.byteOffset||0),stride=b.byteStride||bytes*width;assert.ok(stride>=bytes*width);assert.ok(offset+(a.count-1)*stride+bytes*width<=(b.byteOffset||0)+b.byteLength);assert.ok((b.byteOffset||0)+b.byteLength<=bin.length);const dv=new DataView(bin.buffer,bin.byteOffset,bin.byteLength),values=[];for(let i=0;i<a.count;i++)for(let j=0;j<width;j++)values.push(dv[get](offset+i*stride+j*bytes,true));return {a,width,values};}
 const roots=json.scenes[json.scene||0].nodes,instances=[];
 function visit(index,parent){const n=json.nodes[index],local=n.matrix?new THREE.Matrix4().fromArray(n.matrix):new THREE.Matrix4().compose(new THREE.Vector3(...(n.translation||[0,0,0])),new THREE.Quaternion(...(n.rotation||[0,0,0,1])),new THREE.Vector3(...(n.scale||[1,1,1]))),matrix=parent.clone().multiply(local);if(n.mesh!==undefined)for(const primitive of json.meshes[n.mesh].primitives)instances.push({node:n,index,matrix,primitive,material:json.materials[primitive.material]});for(const child of n.children||[])visit(child,matrix);}
 for(const r of roots)visit(r,new THREE.Matrix4());
 return {file,json,bin,roots,instances,accessor};
}
function imageSize(buffer){
 if(buffer.readUInt32BE(0)===0x89504e47)return [buffer.readUInt32BE(16),buffer.readUInt32BE(20)];
 if(buffer.readUInt16BE(0)===0xffd8){let p=2;while(p<buffer.length){if(buffer[p++]!==255)continue;const marker=buffer[p++];if(marker===0xd8||marker===0xd9)continue;const length=buffer.readUInt16BE(p);if([0xc0,0xc1,0xc2].includes(marker))return [buffer.readUInt16BE(p+5),buffer.readUInt16BE(p+3)];p+=length;}}
 throw Error('Unsupported embedded image; verify dimensions explicitly');
}
export function validateLuxCar(path){
 const g=readGLB(path),{json,instances,accessor}=g,materials=json.materials.map(m=>m.name),bounds=new THREE.Box3(),windowNodes=new Set(),plateCenters=[],geometries=[];let triangles=0,colorPlate=false;
 for(const name of ['Paint','Window glass','Tail'])assert.ok(materials.includes(name),`Missing material ${name}`);
 for(const instance of instances){const {primitive:p,matrix,material,node}=instance;assert.equal(p.mode??4,4,'Triangle primitive required');const pos=accessor(p.attributes.POSITION),normal=accessor(p.attributes.NORMAL);assert.equal(pos.width,3);assert.equal(normal.width,3);assert.equal(pos.a.count,normal.a.count);for(const value of [...pos.values,...normal.values])assert.ok(Number.isFinite(value),'Finite vertex attributes');const indices=p.indices===undefined?Array.from({length:pos.a.count},(_,i)=>i):accessor(p.indices).values;assert.equal(indices.length%3,0);for(const index of indices)assert.ok(Number.isInteger(index)&&index>=0&&index<pos.a.count,'Index in range');triangles+=indices.length/3;
 const points=[];for(let k=0;k<pos.values.length;k+=3){const v=new THREE.Vector3(...pos.values.slice(k,k+3)).applyMatrix4(matrix);bounds.expandByPoint(v);points.push(v);}
 if(material.name==='Window glass')windowNodes.add(instance.index);
 if(material.name==='Plate'){assert.ok(p.attributes.COLOR_0!==undefined,'Plate vertex tint required');const color=accessor(p.attributes.COLOR_0);assert.equal(color.a.count,pos.a.count);for(const value of color.values)assert.ok(Number.isFinite(value));colorPlate=true;plateCenters.push(new THREE.Box3().setFromPoints(points).getCenter(new THREE.Vector3()).z);}
 geometries.push({name:node.name,material:material.name,points,indices});
 }
 // Dense sampling is confined to the rebuilt high-curvature rear; legacy assets retain their budget.
 const assembly=json.nodes.find(n=>n.name==='Vehicle_assembly')?.extras?.vehicleAssembly;
 const triangleBudget=assembly?.wheelFitmentVersion===2&&assembly?.surfacing?.version===1?160000:100000;
 assert.ok(triangles<triangleBudget,`Triangle budget exceeded: ${triangles} / ${triangleBudget}`);
 assert.ok(g.file.length<5*1024*1024,'Vehicle GLB must stay below 5 MiB');assert.ok(windowNodes.size>=4,'At least four separate glass nodes');assert.ok(colorPlate,'Plate material with COLOR_0');assert.ok(plateCenters.some(z=>z>1.5)&&plateCenters.some(z=>z<-1.5),'Physical plates at both vehicle ends');
 const wheels=g.roots.map(index=>json.nodes[index]).filter(n=>n.name?.startsWith('Wheel_'));assert.equal(wheels.length,4,'Four wheel pivots');for(const w of wheels){assert.ok(g.roots.includes(json.nodes.indexOf(w)),'Wheel pivot must be top-level');assert.equal(w.mesh,undefined,'Wheel pivot must be Empty');assert.ok(w.extras?.tireRadius>.2&&w.extras.tireRadius<.6,'Wheel radius');assert.ok(w.extras?.tireWidth>.1&&w.extras.tireWidth<.6,'Wheel width');assert.ok(Math.abs(w.translation?.[0])>.5&&Math.abs(w.translation?.[2])>.6,'Real wheel center');}
 assert.ok(geometries.some(m=>m.name==='Driver_hood'&&m.indices.length>3),'Driver_hood geometry');
 const images=(json.images||[]).map(im=>{assert.ok(im.bufferView!==undefined,'Embedded texture required');const view=json.bufferViews[im.bufferView],size=imageSize(g.bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength));assert.ok(size.every(n=>n>0&&n<=2048),'Texture <= 2K');return size;});
 return {bytes:g.file.length,triangles,triangleBudget,primitives:instances.length,materials,windows:windowNodes.size,wheels:wheels.map(w=>({name:w.name,position:w.translation,...w.extras})),textures:images,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},plateCenters,geometries};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const report=validateLuxCar(process.argv[2]||'public/models/solstice-lux-gt.glb');delete report.geometries;console.log(JSON.stringify(report,null,2));}


export function cabinRayReport(report){
 const hits=(origin,direction)=>{const ray=new THREE.Ray(origin,direction),result=[];for(const g of report.geometries)for(let i=0;i<g.indices.length;i+=3){const hit=ray.intersectTriangle(g.points[g.indices[i]],g.points[g.indices[i+1]],g.points[g.indices[i+2]],false,new THREE.Vector3());if(hit)result.push({name:g.name,material:g.material,distance:hit.distanceTo(origin),point:hit.toArray()});}return result.sort((a,b)=>a.distance-b.distance);};
 const eye=new THREE.Vector3(.35,1.03,-.4);
 const windows=report.geometries.filter(g=>g.material==='Window glass').map(g=>{const target=new THREE.Box3().setFromPoints(g.points).getCenter(new THREE.Vector3());return {name:g.name,hits:hits(eye,target.sub(eye).normalize())};});
 const vertical=[];for(const x of[-.35,.35])for(const z of[-.4,.1])for(const direction of[-1,1])vertical.push({x,z,direction,hit:hits(new THREE.Vector3(x,1.03,z),new THREE.Vector3(0,direction,0))[0]});
 return {windows,vertical};
}

/** Sample the inset convex footprint, excluding window frames and panel edge bevels. This is
 * a diagnostic of sampled holes, not a guarantee of watertightness or intentional cutout validity. */
export function panelCoverageReport(report,{resolution=13,inset=.18,backfaceCulling=false}={}){
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 function hull(points){const sorted=[...new Map(points.map(p=>[p.join(','),p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const lower=[],upper=[];for(const p of sorted){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}for(const p of sorted.reverse()){while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}return lower.slice(0,-1).concat(upper.slice(0,-1));}
 const panels=new Map();for(const g of report.geometries.filter(g=>g.name==='Driver_hood'||g.name==='Unified canopy roof'||g.material==='Window glass')){if(!panels.has(g.name))panels.set(g.name,{name:g.name,points:[],indices:[]});const panel=panels.get(g.name),offset=panel.points.length;panel.points.push(...g.points);panel.indices.push(...g.indices.map(i=>i+offset));}
 return [...panels.values()].map(g=>{
  const box=new THREE.Box3().setFromPoints(g.points),size=box.getSize(new THREE.Vector3()).toArray(),axis=g.name==='Driver_hood'?1:size.indexOf(Math.min(...size)),plane=[0,1,2].filter(n=>n!==axis),points=g.points.map(p=>p.toArray()),outline=hull(points.map(p=>plane.map(i=>p[i]))),center=outline.reduce((a,p)=>[a[0]+p[0]/outline.length,a[1]+p[1]/outline.length],[0,0]),inner=outline.map(p=>p.map((v,i)=>v*(1-inset)+center[i]*inset)),min=[0,1].map(i=>Math.min(...inner.map(p=>p[i]))),max=[0,1].map(i=>Math.max(...inner.map(p=>p[i]))),misses=[];let sampled=0;
  const direction=new THREE.Vector3();direction.setComponent(axis,-1);
  for(let u=0;u<resolution;u++)for(let v=0;v<resolution;v++){const p=[min[0]+(max[0]-min[0])*(u+.5)/resolution,min[1]+(max[1]-min[1])*(v+.5)/resolution];if(!inner.every((a,i)=>cross(a,inner[(i+1)%inner.length],p)>=-1e-9))continue;sampled++;const origin=new THREE.Vector3();origin.setComponent(axis,box.max.getComponent(axis)+1);plane.forEach((a,i)=>origin.setComponent(a,p[i]));const ray=new THREE.Ray(origin,direction);let hit=false;for(let k=0;k<g.indices.length;k+=3)if(ray.intersectTriangle(g.points[g.indices[k]],g.points[g.indices[k+1]],g.points[g.indices[k+2]],backfaceCulling,new THREE.Vector3())){hit=true;break;}if(!hit)misses.push(p);}
  return {name:g.name,axis,sampled,misses,coverage:(sampled-misses.length)/sampled};
 });
}


/** The driver eye is fixed in car-root space; the exported hood inherits body model scale. */
export function driverHoodVisibilityReport(report){
 const primitives=report.geometries.filter(g=>g.name==='Driver_hood');
 return [{id:'gt',heightScale:1},{id:'light',heightScale:1},{id:'muscle',heightScale:1.03}].map(({id,heightScale})=>{
  let maxY=-Infinity,aboveEye=0,vertices=0;for(const g of primitives)for(const point of g.points){const y=point.y*heightScale;maxY=Math.max(maxY,y);vertices++;if(y>1.03+1e-6)aboveEye++;}
  return {id,maxY,eyeY:1.03,aboveEye,vertices};
 });
}

/** Rays from the chase-camera side must meet the boot lid, never the trunk floor.
 * The inset rectangle stays clear of glass, wheel openings and the tail's outer lip. */
export function rearDeckCoverageReport(report){
 const geometries=report.geometries.filter(g=>!g.name.startsWith('Wheel_'));
 const failures=[],samples=[];const down=new THREE.Vector3(0,-1,0);
 for(let row=0;row<9;row++)for(let col=0;col<13;col++){
  const x=-.74+1.48*col/12,z=-2.22+.42*row/8,origin=new THREE.Vector3(x,2,z),ray=new THREE.Ray(origin,down);let nearest=null;
  for(const g of geometries)for(let i=0;i<g.indices.length;i+=3){
   const hit=ray.intersectTriangle(g.points[g.indices[i]],g.points[g.indices[i+1]],g.points[g.indices[i+2]],true,new THREE.Vector3());
   if(hit&&(!nearest||hit.y>nearest.y))nearest={y:hit.y,name:g.name,material:g.material};
  }
  const sample={x,z,hit:nearest};samples.push(sample);
  if(!nearest||nearest.y<.74||nearest.material!=='Paint')failures.push(sample);
 }
 return {sampled:samples.length,failures,samples};
}

/** The fascia above the diffuser must hide the rear wheel/cabin cavity. */
export function rearFasciaCoverageReport(report){
 const geometries=report.geometries.filter(g=>!g.name.startsWith('Wheel_'));
 const failures=[],samples=[];const forward=new THREE.Vector3(0,0,1);
 for(let row=0;row<9;row++)for(let col=0;col<13;col++){
  const x=-.78+1.56*col/12,y=.48+.31*row/8,ray=new THREE.Ray(new THREE.Vector3(x,y,-4),forward);let nearest=null;
  for(const g of geometries)for(let i=0;i<g.indices.length;i+=3){
   const hit=ray.intersectTriangle(g.points[g.indices[i]],g.points[g.indices[i+1]],g.points[g.indices[i+2]],true,new THREE.Vector3());
   if(hit&&(!nearest||hit.z<nearest.z))nearest={z:hit.z,name:g.name,material:g.material};
  }
  const sample={x,y,hit:nearest};samples.push(sample);if(!nearest||nearest.z> -2.18)failures.push(sample);
 }
 return {sampled:samples.length,failures,samples};
}
