import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const path = process.argv[2] || 'public/models/solstice-gt.glb';
const bytes = fs.readFileSync(path);
assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
const json = JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
const buffer = bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const gltf = await new GLTFLoader().parseAsync(buffer,'');
gltf.scene.updateMatrixWorld(true);
let triangles=0,primitives=0,vertices=0;
const bounds=new THREE.Box3(),point=new THREE.Vector3();
gltf.scene.traverse(object=>{
 if(!object.isMesh)return;
 primitives++;const geometry=object.geometry,positions=geometry.attributes.position;
 triangles+=(geometry.index?.count??positions.count)/3;vertices+=positions.count;
 for(const [name,attribute] of Object.entries(geometry.attributes)) for(const value of attribute.array) assert.ok(Number.isFinite(value),`${object.name}.${name} is finite`);
 for(let index=0;index<positions.count;index++){point.fromBufferAttribute(positions,index).applyMatrix4(object.matrixWorld);bounds.expandByPoint(point);}
 const material=object.material;
 for(const key of ['metalness','roughness','opacity'])if(material[key]!==undefined)assert.ok(Number.isFinite(material[key])&&material[key]>=0&&material[key]<=1,key);
});
const expectedMaterials=['Alloy','Caliper','Glass','Graphite','Headlight','Intake mesh','Paint','Plate','Tail','Rubber','Window glass'];
assert.deepEqual(json.materials.map(m=>m.name).sort(),expectedMaterials.sort());
assert.equal(primitives,25,'Four separately sortable windows with existing static batches');assert.ok(triangles<=85000,'Complete GT asset triangle allowance');
const pivots={};
for(const [name,expected] of Object.entries({Wheel_FL:[.965,.385,1.38],Wheel_FR:[-.965,.385,1.38],Wheel_RL:[.965,.385,-1.34],Wheel_RR:[-.965,.385,-1.34]})){
 const node=json.nodes.find(n=>n.name===name);assert.ok(node,name);pivots[name]={translation:node.translation,rotation:node.rotation??[0,0,0,1],scale:node.scale??[1,1,1]};
 node.translation.forEach((value,index)=>assert.ok(Math.abs(value-expected[index])<1e-6,name));
 assert.deepEqual(pivots[name].rotation,[0,0,0,1]);assert.deepEqual(pivots[name].scale,[1,1,1]);
}
const expectedMin=[-1.136,.010,-2.348],expectedMax=[1.136,1.34,2.311231];
bounds.min.toArray().forEach((v,i)=>assert.ok(v>=expectedMin[i]-1e-5,'No exterior expansion'));
bounds.max.toArray().forEach((v,i)=>assert.ok(v<=expectedMax[i]+1e-5,'No exterior expansion'));
const plateIndex=json.materials.findIndex(m=>m.name==='Plate');assert.ok(json.meshes.some(m=>m.primitives.some(p=>p.material===plateIndex&&p.attributes.COLOR_0!==undefined)),'Plate band vertex tint retained');
const visibility=[];
const ray=new THREE.Raycaster();
for(const side of [-1,1]){
 for(const [part,y,z,direction] of [['lamp inner wall',.656,2.13,[-side,0,0]],['lamp backing',.656,2.16,[0,0,-1]],['intake inner floor',.47,2.17,[0,-1,0]]]){
  ray.set(new THREE.Vector3(side*.66,y,z),new THREE.Vector3(...direction));const lining=ray.intersectObject(gltf.scene,true)[0];
  assert.equal(lining?.object.material.name,'Graphite',part+' must be black lining');visibility.push({part,x:side*.66,hit:lining.point.toArray()});
 }
 for(const x of [.553,.714]){
  ray.set(new THREE.Vector3(side*x,.656,3),new THREE.Vector3(0,0,-1));const hit=ray.intersectObject(gltf.scene,true)[0];
  assert.equal(hit?.object.material.name,'Headlight','Projector must be visible through the nose');visibility.push({part:'projector',x:side*x,frontZ:hit.point.z});
 }
 ray.set(new THREE.Vector3(side*.66,.466,3),new THREE.Vector3(0,0,-1));const inlet=ray.intersectObject(gltf.scene,true)[0];
 assert.ok(inlet&&inlet.object.material.name!=='Paint','Side intake must be open');assert.ok(inlet.point.z<2.23,'Side intake remains recessed');visibility.push({part:'side intake',x:side*.66,frontZ:inlet.point.z});
 ray.set(new THREE.Vector3(side*.66,.47,3),new THREE.Vector3(0,0,-1));const backing=ray.intersectObject(gltf.scene,true)[0];
 assert.equal(backing?.object.material.name,'Graphite','Intake backing must hide the paint wall');assert.ok(backing.point.z<2.16,'Backing remains deep inside the nose');visibility.push({part:'intake backing',x:side*.66,backZ:backing.point.z});
 ray.set(new THREE.Vector3(side*.64,.355,-3),new THREE.Vector3(0,0,1));const exhaust=ray.intersectObject(gltf.scene,true)[0];
 assert.ok(exhaust&&exhaust.point.z>-2.25,'Exhaust has a real deep bore');visibility.push({part:'exhaust',x:side*.64,backZ:exhaust.point.z});
}
const windows=[];const paintMeshes=[];const opaqueMeshes=[];
gltf.scene.traverse(object=>{if(object.isMesh&&object.material.name==='Window glass')windows.push(object);if(object.isMesh&&object.material.name==='Paint')paintMeshes.push(object);if(object.isMesh&&object.material.name!=='Window glass')opaqueMeshes.push(object);});
assert.equal(windows.length,4,'Exactly four real windows');
const windowChecks=[];
for(const window of windows){
 const positions=window.geometry.attributes.position,normals=window.geometry.attributes.normal;let tested=0;
 for(const row of [6,12,18])for(const column of [4,7,10]){
  const index=row*15+column;assert.ok(index<positions.count);
  const center=new THREE.Vector3().fromBufferAttribute(positions,index).applyMatrix4(window.matrixWorld);
  const normal=new THREE.Vector3().fromBufferAttribute(normals,index).transformDirection(window.matrixWorld);
  ray.set(center.clone().addScaledVector(normal,.025),normal.clone().negate());ray.far=.07;
  assert.equal(ray.intersectObjects(paintMeshes,true).length,0,window.name+' has no Paint backing');tested++;
 }
 windowChecks.push({name:window.name,clearSamples:tested});
}
ray.far=Infinity;
const cabinChecks=[];
for(const x of [-.35,0,.35])for(const z of [-.8,-.4,0,.5]){
 ray.set(new THREE.Vector3(x,.73,z),new THREE.Vector3(0,-1,0));const floor=ray.intersectObjects(opaqueMeshes,true)[0];
 assert.ok(floor&&floor.point.y<=.28,'Passenger well reaches below seat cushions');cabinChecks.push({x,z,floorY:floor.point.y});
}
for(const [name,direction]of [['forward',[0,0,1]],['left',[-1,0,0]],['right',[1,0,0]]]){
 ray.set(new THREE.Vector3(.35,1.03,-.4),new THREE.Vector3(...direction));const obstruction=ray.intersectObjects(paintMeshes,true)[0];
 const window=ray.intersectObjects(windows,true)[0];assert.ok(window,name+' eye ray crosses a real window');
 assert.ok(!obstruction||obstruction.distance>window.distance+.02,name+' view not blocked by Paint');
}
const cabinLining=[];
for(const side of [-1,1])for(const z of [-.8,-.4,0,.5]){
 ray.set(new THREE.Vector3(side*.65,.80,z),new THREE.Vector3(side,0,0));const lining=ray.intersectObjects(opaqueMeshes,true)[0];
 assert.equal(lining?.object.material.name,'Graphite','Exposed upper cabin wall must have dark lining');cabinLining.push({side,z,hit:lining.point.toArray()});
}
const report={cabinLining,windowChecks,cabinChecks,visibility,bytes:bytes.length,triangles,addedTriangles:triangles-49718,primitives,vertices,materials:expectedMaterials,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},pivots,checks:'GLTFLoader parse, finite attributes, normalized material scalar ranges, wheel transforms, exterior envelope, plate tint, geometry budget'};
console.log(JSON.stringify(report,null,2));
if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n');
