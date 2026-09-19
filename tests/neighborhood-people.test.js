import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildNeighborhoodPeople,neighborhoodPeopleBudget} from '../src/neighborhood-people.js';
const v=(x,y,z)=>new THREE.Vector3(x,y,z);
function setup(routes=[{points:[v(0,2,0),v(0,2,20)],length:20,siteIds:[1]}],coarse=false){
 const world={scene:new THREE.Scene(),quality:'balanced',time:0,coarsePointer:coarse};
 const system=buildNeighborhoodPeople(world,{routes,frontages:[]});
 const camera=new THREE.PerspectiveCamera();camera.position.set(0,4,10);
 const body=world.scene.getObjectByName('Neighborhood residents'),shadows=world.scene.getObjectByName('Resident contact shadows');
 return {world,system,camera,body,shadows};
}

test('residents have human proportions and coloured round geometry in two total batches',()=>{
 const {system,camera,body,shadows}=setup();system.update(camera,0,'balanced');
 assert.equal(body.isInstancedMesh,true);assert.equal(shadows.isInstancedMesh,true);assert.equal(body.count,system.stats.active*20);
 assert.equal(system.stats.drawCalls,2);assert.equal(body.material.map,null);assert.equal(body.material.transparent,false);
 assert.equal(body.castShadow,false);assert.equal(body.receiveShadow,true);assert.equal(body.instanceMatrix.usage,THREE.DynamicDrawUsage);
 const m=new THREE.Matrix4(),p=new THREE.Vector3(),box=new THREE.Box3();
 for(let i=0;i<20;i++){
  body.getMatrixAt(i,m);assert.ok(m.elements.every(Number.isFinite));assert.ok(Math.abs(m.determinant())>0);
  for(let j=0;j<body.geometry.attributes.position.count;j++)box.expandByPoint(p.fromBufferAttribute(body.geometry.attributes.position,j).applyMatrix4(m));
 }
 assert.ok(box.max.y-box.min.y>1.5&&box.max.y-box.min.y<1.9);assert.ok(box.max.x-box.min.x<.8);
 const shirt=new THREE.Color(),skin=new THREE.Color(),pants=new THREE.Color();body.getColorAt(0,shirt);body.getColorAt(2,skin);body.getColorAt(1,pants);
 assert.notEqual(shirt.getHex(),skin.getHex());assert.notEqual(shirt.getHex(),pants.getHex());system.dispose();
});

test('walking stays on supplied pavement and has stable endpoint pauses and turns',()=>{
 const {system,camera,body,shadows}=setup([{points:[v(0,2,0),v(0,4,12)],length:12}]);
 const m=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),scale=new THREE.Vector3();let previous=null,maxStep=0,maxTurn=0,stoppedFrames=0,footMoved=false;
 for(let frame=0;frame<2400;frame++){
  system.update(camera,frame/30,'balanced');shadows.getMatrixAt(0,m);p.setFromMatrixPosition(m);
  assert.ok(p.z>=-.001&&p.z<=12.001);assert.ok(Math.abs(p.x)<=.201);assert.ok(Math.abs(p.y-(2+p.z/6+.012))<1e-5);
  body.getMatrixAt(0,m);m.decompose(new THREE.Vector3(),q,scale);
  if(previous){maxStep=Math.max(maxStep,p.distanceTo(previous.p));maxTurn=Math.max(maxTurn,q.angleTo(previous.q));if(Math.abs(p.z-previous.p.z)<1e-6)stoppedFrames++;else footMoved=true;}
  previous={p:p.clone(),q:q.clone()};
 }
 assert.ok(footMoved);assert.ok(stoppedFrames>60,'residents pause at ends');assert.ok(maxStep<.055,'no teleports');assert.ok(maxTurn<.09,'smooth turnaround');system.dispose();
});

test('mobile and low quality cap active people; distant populations upload no matrices',()=>{
 const routes=Array.from({length:18},(_,i)=>({points:[v(i,0,0),v(i,0,20)],length:20}));
 const {system,camera,body,shadows}=setup(routes,true);system.update(camera,2,'balanced');
 assert.equal(system.stats.active,12);assert.equal(system.stats.matrixUpdates,12*21);assert.ok(system.stats.triangles<35000);assert.equal(body.castShadow,false);
 system.update(camera,2,'low');assert.equal(system.stats.active,6);assert.equal(body.castShadow,false);
 system.update(camera,2,{name:'high',coarse:false});assert.equal(system.stats.active,18);assert.equal(body.castShadow,true);
 const version=body.instanceMatrix.version;camera.position.set(10000,10000,10000);system.update(camera,4,'balanced');
 assert.equal(system.stats.active,0);assert.equal(system.stats.matrixUpdates,0);assert.equal(system.stats.drawCalls,0);assert.equal(body.count,0);assert.equal(body.instanceMatrix.version,version);assert.equal(shadows.visible,false);
 assert.equal(neighborhoodPeopleBudget('high',true).count,12);assert.equal(neighborhoodPeopleBudget('high',false).count,24);system.dispose();
});

test('invalid or tiny routes produce no residents and dispose frees only owned resources once',()=>{
 const {world,system,camera,body,shadows}=setup([{points:[]},{points:[v(0,0,0),v(0,0,1)]},{points:[v(0,0,0),v(NaN,0,5)]}]);
 const foreign=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());world.scene.add(foreign);
 const counts=new Map();for(const resource of [body,body.geometry,body.material,shadows,shadows.geometry,shadows.material]){counts.set(resource,0);resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)+1));}
 system.update(camera,0);assert.equal(system.stats.residents,0);assert.equal(system.stats.active,0);
 system.dispose();system.dispose();system.update(camera,10);assert.equal(system.stats.active,0);assert.deepEqual(world.scene.children,[foreign]);assert.ok([...counts.values()].every(n=>n===1));foreign.geometry.dispose();foreign.material.dispose();
});


test('long residential routes remain populated without exceeding the near-crowd budget',()=>{
 const {system,camera}=setup([{points:[v(0,0,0),v(0,0,1160)],length:1160}],true);
 assert.equal(system.stats.residents,26);
 for(const z of [80,400,700,1050]){
  camera.position.set(15,4,z);system.update(camera,17,'balanced');
  assert.ok(system.stats.active>=3,'long street has nearby residents');assert.ok(system.stats.active<=12);
 }
 system.dispose();
});
