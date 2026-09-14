import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createImportedCar} from '../src/imported-car.js';
import {CARS} from '../src/physics.js';
import {DrivingCamera} from '../src/driving-camera.js';
import {vehicleDimensions} from '../src/vehicle-contacts.js';

function fixture(nativeCabin=true){
 const source=new THREE.Group(),vehicle=new THREE.Group();vehicle.name='Vehicle';source.add(vehicle);
 vehicle.userData={driverEye:[.38,1.08,.3],bonnetEye:[0,1.16,1.08],nativeCabin};
 const paint=new THREE.MeshStandardMaterial({color:'#123456'});paint.name='Paint';
 const shell=new THREE.Mesh(new THREE.BoxGeometry(2,1,4),paint);shell.name='Original body';vehicle.add(shell);
 for(const corner of ['lf','rf','lr','rr']){
  const wheel=new THREE.Group();wheel.name='Wheel_'+corner;wheel.position.set(corner[0]==='l'?1:-1,.35,corner[1]==='f'?1.4:-1.4);
  wheel.userData.radius=.35;wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(.35,.35,.2),paint));vehicle.add(wheel);
  const caliper=new THREE.Mesh(new THREE.BoxGeometry(.05,.1,.1),paint);caliper.name='Caliper_'+corner;caliper.position.copy(wheel.position);caliper.position.z+=.2;vehicle.add(caliper);
 }
 const steering=new THREE.Group();steering.name='SteeringWheel';steering.userData.steeringAxis=[0,-.333,.943];vehicle.add(steering);
 return source;
}
const pose={u:7,steer:.2,roll:0,pitch:0,brake:0};
test('authored vehicles retain independent wheels, fixed calipers and native geometry',()=>{
 const source=fixture(),config=CARS.find(c=>c.id==='db12'),car=createImportedCar(config,'#ff0000',false,source);
 assert.equal(car.wheels.length,4);assert.equal(car.frontWheels.length,2);
 assert.ok(car.body.getObjectByName('Original body'));assert.equal(car.body.getObjectByName('GT cockpit'),undefined);
 assert.equal(car.cabinInterior.stats().native,true);assert.deepEqual(car.driverEye,[.38,1.08,.3]);
 const caliper=car.body.getObjectByName('Caliper_lf'),before=caliper.position.clone();
 car.update(pose,.1);
 assert.ok(car.wheels.every(w=>Math.abs(w.userData.rollAngle-2)<1e-10));
 assert.equal(car.frontWheels[0].rotation.y,.2);assert.ok(caliper.position.distanceTo(before)<1e-10);
 assert.ok(caliper.quaternion.angleTo(new THREE.Quaternion())<1e-10,'caliper does not roll with tire');
 assert.ok(source.getObjectByName('Wheel_lf').quaternion.angleTo(new THREE.Quaternion())<1e-10,'template remains unchanged');
 assert.equal(source.getObjectByName('Original body').material.color.getHexString(),'123456','paint clones do not alter template');
 car.update({...pose,u:-7},.1);assert.ok(car.wheels.every(w=>Math.abs(w.userData.rollAngle)<1e-10),'reverse unwinds tire rotation');
 car.dispose();
});
test('Ferrari uses bonnet camera and never adds a substitute cockpit',()=>{
 const config=CARS.find(c=>c.id==='gtc4lusso'),car=createImportedCar(config,'#f00',false,fixture(false));
 assert.equal(car.cameraKind,'bonnet');assert.equal(car.cabinInterior.stats().native,false);
 assert.deepEqual(car.driverEye,[0,1.16,1.08]);car.setInterior(true);assert.equal(car.cockpit.visible,false);
 const camera=new THREE.PerspectiveCamera(60,1.5),rig=new DrivingCamera(camera);car.root.position.set(10,2,10);car.body.rotation.x=.1;
 rig.update(.016,car,{yaw:0},{heading:0},'race',1,()=>0);
 const local=car.body.worldToLocal(camera.position.clone());assert.ok(local.distanceTo(new THREE.Vector3(...car.driverEye))<1e-10);
 assert.equal(vehicleDimensions({config}).length,config.length);car.dispose();
});
test('missing authored wheel aborts construction rather than silently adding old wheels',()=>{
 const source=fixture();source.getObjectByName('Wheel_rr').removeFromParent();
 assert.throws(()=>createImportedCar(CARS.find(c=>c.id==='db12'),'#f00',false,source),/missing Wheel_rr/);
});

test('roster only offers the three authored models and rejects retired selections',async()=>{
 const {IMPORTED_MODELS}=await import('../src/imported-car.js');
 const {loadCarModel,createCar}=await import('../src/car.js');
 assert.deepEqual(CARS.map(c=>c.id),['db12','gtc4lusso','f812']);
 assert.deepEqual(Object.keys(IMPORTED_MODELS),CARS.map(c=>c.id));
 for(const id of ['gt','light','muscle']){
  await assert.rejects(loadCarModel({id}),/Unsupported vehicle/);
  assert.throws(()=>createCar({id}),/Unsupported vehicle/);
 }
});
test('native cabin support follows asset metadata for the 812 too',()=>{
 const config=CARS.find(c=>c.id==='f812'),source=fixture(true);
 source.getObjectByName('SteeringWheel').removeFromParent();
 const car=createImportedCar(config,'#f00',false,source);
 assert.equal(car.cameraKind,'driver');assert.equal(car.steeringWheel,undefined);
 car.setInterior(true);car.update(pose,.016);assert.equal(car.cockpit.visible,true);
 car.dispose();
 const exterior=createImportedCar(config,'#f00',false,fixture(false));
 assert.equal(exterior.cameraKind,'bonnet','asset metadata overrides a cabin-enabled roster entry');
 exterior.dispose();
});

 test('braking only changes assigned rear emitters, releases high stop and isolates cars',()=>{
 const source=fixture();
 for(const [role,idle,active] of [['combined',.22,2.8],['brake',0,2.8],['position',.3,.3],['reflector',0,0],['front',1,1]]){
 const m=new THREE.MeshStandardMaterial({emissive:'#ff0000',emissiveIntensity:idle});m.name=role;m.userData={vehicleLightRole:role,idleIntensity:idle,brakeIntensity:active};const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.1,.1),m);mesh.name=role;source.add(mesh);
 }
 const cfg=CARS[0],a=createImportedCar(cfg,'#f00',false,source),b=createImportedCar(cfg,'#f00',false,source);
 const intensity=(car,n)=>car.body.getObjectByName(n).material.emissiveIntensity;
 a.update({...pose,brake:1},0);
 assert.equal(intensity(a,'combined'),2.8);assert.equal(intensity(a,'brake'),2.8);
 assert.equal(intensity(a,'reflector'),0);assert.equal(intensity(a,'position'),.3);assert.equal(intensity(a,'front'),1);
 assert.equal(intensity(b,'brake'),0);assert.equal(source.getObjectByName('brake').material.emissiveIntensity,0);
 a.update({...pose,brake:0},0);assert.equal(intensity(a,'combined'),.22);assert.equal(intensity(a,'brake'),0);a.dispose();b.dispose();
 });
