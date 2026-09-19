import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createImportedCar,IMPORTED_MODELS} from '../src/imported-car.js';
import {CARS,VehiclePhysics} from '../src/physics.js';

// Parse the shipped binary positions and hierarchy without images or a DOM.
// This is a geometry-only GLB reader, not a replacement fixture wheel shape.
function readAuthoredScene(config){
 const bytes=readFileSync(new URL('../public/models/'+IMPORTED_MODELS[config.id].split('?')[0],import.meta.url));
 const jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength)),binaryStart=jsonLength+28;
 function attribute(id){
  const a=json.accessors[id],view=json.bufferViews[a.bufferView],components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
  const Type={5126:Float32Array,5125:Uint32Array,5123:Uint16Array,5121:Uint8Array}[a.componentType];
  assert.ok(Type&&components&&!a.sparse,'the asset must use supported uncompressed accessors');
  const values=new Type(a.count*components),stride=view.byteStride||components*Type.BYTES_PER_ELEMENT;
  const offset=binaryStart+(view.byteOffset||0)+(a.byteOffset||0),data=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const read={5126:'getFloat32',5125:'getUint32',5123:'getUint16',5121:'getUint8'}[a.componentType];
  for(let i=0;i<a.count;i++)for(let c=0;c<components;c++)values[i*components+c]=data[read](offset+i*stride+c*Type.BYTES_PER_ELEMENT,true);
  return new THREE.BufferAttribute(values,components,a.normalized);
 }
 const materials=json.materials.map(def=>{const m=new THREE.MeshStandardMaterial();m.name=def.name;m.userData={...def.extras};return m;});
 const meshes=json.meshes.map(def=>def.primitives.map(p=>{assert.ok(!p.extensions?.KHR_draco_mesh_compression);const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',attribute(p.attributes.POSITION));if(p.indices!==undefined)geometry.setIndex(attribute(p.indices));return{geometry,material:materials[p.material]};}));
 const nodes=json.nodes.map(n=>{
  let object;if(n.mesh===undefined)object=new THREE.Group();else{const parts=meshes[n.mesh];if(parts.length===1)object=new THREE.Mesh(parts[0].geometry,parts[0].material);else{object=new THREE.Group();for(const part of parts)object.add(new THREE.Mesh(part.geometry,part.material));}}
  object.name=n.name||'';object.userData={...n.extras};
  if(n.matrix)object.applyMatrix4(new THREE.Matrix4().fromArray(n.matrix));else{if(n.translation)object.position.fromArray(n.translation);if(n.rotation)object.quaternion.fromArray(n.rotation);if(n.scale)object.scale.fromArray(n.scale);}
  return object;
 });
 json.nodes.forEach((n,i)=>n.children?.forEach(child=>nodes[i].add(nodes[child])));
 const source=new THREE.Group(),scene=json.scenes[json.scene||0];source.userData={...scene.extras};scene.nodes.forEach(i=>source.add(nodes[i]));source.updateMatrixWorld(true);
 return{source,dispose(){meshes.flat().forEach(m=>m.geometry.dispose());materials.forEach(m=>m.dispose());}};
}
const rest={u:0,steer:0,roll:0,pitch:0,brake:0};
const vec=new THREE.Vector3(),matrix=new THREE.Matrix4();
function wheelBottoms(car){
 car.root.updateMatrixWorld(true);const inverse=new THREE.Matrix4().copy(car.root.matrixWorld).invert();
 return car.wheels.map(wheel=>{let lowest=Infinity;wheel.traverse(object=>{if(!object.isMesh)return;matrix.multiplyMatrices(inverse,object.matrixWorld);const p=object.geometry.attributes.position;for(let i=0;i<p.count;i++){vec.fromBufferAttribute(p,i).applyMatrix4(matrix);lowest=Math.min(lowest,vec.y);}});return lowest;});
}
function setWheelPhase(car,radians){for(const w of car.wheels)w.userData.rollAngle=radians;}
function bodyPoint(car,x,y,z){car.root.updateMatrixWorld(true);const world=new THREE.Vector3(x,y,z).applyMatrix4(car.body.matrixWorld);return car.root.worldToLocal(world);}

for(const config of CARS)test(`${config.id}: real GLB wheels retain contact through rotation, steering and shell weight transfer`,()=>{
 const asset=readAuthoredScene(config),source=asset.source;
 const originals=['lf','rf','lr','rr'].map(c=>source.getObjectByName('Wheel_'+c));
 const originalBounds=originals.map(w=>new THREE.Box3().setFromObject(w,true));
 const originalGeometry=originals.map(w=>{const list=[];w.traverse(o=>{if(o.isMesh)list.push(o.geometry);});return list;});
 const car=createImportedCar(config,'#e85824',false,source);car.update(rest,0);car.root.updateMatrixWorld(true);
 assert.equal(car.wheelRig.parent,car.root);assert.equal(car.wheelRig.children.length,4);
 assert.ok(car.chassisPivotHeight>.34&&car.chassisPivotHeight<.37);
 for(let i=0;i<4;i++){
  const w=car.wheels[i],currentBounds=new THREE.Box3().setFromObject(w,true);
  assert.ok(currentBounds.min.distanceTo(originalBounds[i].min)<1e-6);assert.ok(currentBounds.max.distanceTo(originalBounds[i].max)<1e-6,'reparenting preserves the authored world-space placement');
  const geometry=[];w.traverse(o=>{if(o.isMesh)geometry.push(o.geometry);});assert.deepEqual(geometry,originalGeometry[i]);assert.equal(w.userData.radius,originals[i].userData.radius);
  assert.equal(w.parent.parent,car.wheelRig);assert.equal(car.body.getObjectByName(w.name),undefined);
  const axis=new THREE.Vector3(1,0,0).applyQuaternion(w.getWorldQuaternion(new THREE.Quaternion()));assert.ok(axis.distanceTo(new THREE.Vector3(1,0,0))<1e-6);
  const caliper=car.root.getObjectByName('Caliper_'+w.name.slice(6));assert.ok(caliper,config.id+' missing authored caliper');assert.equal(caliper.parent,w.parent,'all four fixed calipers share their non-rolling axle pivot');
 }
 const baseline=wheelBottoms(car);assert.ok(baseline.every(y=>y>=-1e-5&&y<.0015),'model baseline remains unchanged; world owns the road surface offset');
 const cases=[rest,{...rest,roll:.09},{...rest,roll:-.09},{...rest,pitch:.035},{...rest,pitch:-.045},{...rest,roll:.09,pitch:-.045},{...rest,roll:-.09,pitch:.035}];
 // Even with a world road grade and heading, suspension clearance is measured
 // along the road's local up direction, independently of the shell pose.
 car.root.position.set(12,20,-15);car.root.rotation.set(-.12,.47,0,'YXZ');
 for(const phase of[0,Math.PI/2,Math.PI,Math.PI*1.5])for(const steer of[-.47,0,.47]){
  setWheelPhase(car,phase);car.update({...rest,steer},0);const reference=wheelBottoms(car);
  assert.ok(reference.every((y,i)=>Math.abs(y-baseline[i])<.0015),'only sub-millimetre authored tire tessellation changes the contact height');
  for(const pose of cases){car.update({...pose,steer},0);const actual=wheelBottoms(car);assert.ok(actual.every((y,i)=>Math.abs(y-reference[i])<1e-8),`${config.id} wheel contact follows shell roll/pitch`);}
 }
 const pivot=new THREE.Vector3(0,car.chassisPivotHeight,0);assert.ok(bodyPoint(car,...pivot.toArray()).distanceTo(pivot)<1e-9,'the shell rotates about axle height, not the road origin');
 for(const w of car.wheels){const caliper=car.root.getObjectByName('Caliper_'+w.name.slice(6)),before=caliper.quaternion.clone();car.update({...rest,u:7},.1);assert.ok(caliper.quaternion.angleTo(before)<1e-8,'calipers never roll with the tires');}
 setWheelPhase(car,0);car.update({...rest,u:7},.1);for(const w of car.wheels)assert.ok(Math.abs(w.userData.rollAngle-.7/w.userData.radius)<1e-10);car.update({...rest,u:-7},.1);assert.ok(car.wheels.every(w=>Math.abs(w.userData.rollAngle)<1e-10));
 for(const original of originals)assert.equal(original.userData.rollAngle,undefined,'the loaded source template is not animated');
 car.dispose();asset.dispose();
});

test('real positive-X steering leans the shell outward; acceleration lifts the nose and braking lowers it',()=>{
 const config=CARS[0],asset=readAuthoredScene(config),car=createImportedCar(config,'#f00',false,asset.source),road={curvature:0,slope:0,wet:0};
 const right=new VehiclePhysics(config);right.u=20;for(let i=0;i<48;i++)right.step(1/120,{steer:.4,throttle:.5},road,true);
 assert.ok(right.d>0&&right.yaw>0&&right.steer>0&&right.roll<0,'physics positive steering is a right turn toward +X');
 car.update(right,0);assert.ok(bodyPoint(car,.8,1,0).y>bodyPoint(car,-.8,1,0).y,'right turn raises the inside/right shell and compresses the outside/left');
 const forward=new THREE.Vector3(0,0,1).applyQuaternion(car.frontWheels[0].quaternion);assert.ok(forward.x>0,'visible front wheels follow positive-X steering');
 for(const [kind,input,speed,sign]of[['accelerating',{steer:0,throttle:1},15,1],['braking',{steer:0,throttle:0,brake:1},25,-1]]){
  const p=new VehiclePhysics(config);p.u=speed;for(let i=0;i<48;i++)p.step(1/120,input,road,true);assert.ok(p.lastAccel*sign>0&&p.pitch*sign>0);
  car.update(p,0);const front=bodyPoint(car,0,1,1.4),rear=bodyPoint(car,0,1,-1.4);assert.ok((front.y-rear.y)*sign>0,kind+' has the correct visible load transfer');assert.ok(wheelBottoms(car).every(y=>Math.abs(y)<.0015),'body weight transfer never lifts a wheel');
 }
 car.dispose();asset.dispose();
});
