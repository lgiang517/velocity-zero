import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createImportedCar,IMPORTED_MODELS,importedFrontLampProfile} from '../src/imported-car.js';
import {readFileSync} from 'node:fs';
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


for(const config of CARS)test(`${config.id}: physical paint and hood keep finish intensity and borrow fallback without changing glazing`,()=>{
 const source=fixture(),original=new THREE.MeshPhysicalMaterial();original.name='Paint';
 source.traverse(object=>{if(object.isMesh&&object.material.name==='Paint')object.material=original;});
 const hoodMaterial=original.clone();hoodMaterial.colorWrite=false;hoodMaterial.depthWrite=false;
 const hood=new THREE.Mesh(new THREE.BoxGeometry(),hoodMaterial);hood.name='Authored hood';source.add(hood);
 const glazing=new THREE.MeshPhysicalMaterial({transparent:true,opacity:.3,depthWrite:false});glazing.name='Window glass';
 const window=new THREE.Mesh(new THREE.PlaneGeometry(),glazing);window.name='Original window';source.add(window);
 const car=createImportedCar(config,'#e85824',false,source),paint=car.paint,hoodPaint=car.body.getObjectByName('Authored hood').material;
 assert.ok(paint.isMeshPhysicalMaterial);assert.ok(Number.isFinite(paint.userData.vehicleFinish.envIntensity));
 assert.equal(paint.envMapIntensity,paint.userData.vehicleFinish.envIntensity);assert.notEqual(paint.envMapIntensity,.85);
 const fallback=new THREE.Texture(),local=new THREE.Texture();let disposed=0;fallback.addEventListener('dispose',()=>disposed++);
 const glazingBefore={transparent:car.glass.transparent,opacity:car.glass.opacity,depthWrite:car.glass.depthWrite,side:car.glass.side};
 car.setEnvironment(null,{fallbackTexture:fallback,intensityScale:.108});
 for(const material of [paint,hoodPaint]){assert.equal(material.envMap,fallback);assert.equal(material.envMapIntensity,material.userData.vehicleFinish.envIntensity*.108);}
 assert.equal(car.glass.envMap,null);assert.equal(car.glass.envMapIntensity,.85);
 assert.deepEqual({transparent:car.glass.transparent,opacity:car.glass.opacity,depthWrite:car.glass.depthWrite,side:car.glass.side},glazingBefore);
 assert.equal(hoodPaint.colorWrite,false);assert.equal(hoodPaint.depthWrite,false);
 const version=paint.version;car.setEnvironment(null,{fallbackTexture:fallback,intensityScale:.27});assert.equal(paint.version,version,'lighting-only changes do not recompile shaders');
 car.setEnvironment(local,{fallbackTexture:fallback,intensityScale:1});assert.equal(paint.envMap,local);assert.equal(car.glass.envMap,local,'local reflection preserves the existing glazing map behavior');
 car.setEnvironment(null);assert.equal(paint.envMap,null);assert.equal(hoodPaint.envMap,null);assert.equal(car.glass.envMap,null);
 assert.equal(original.envMap,null);assert.equal(original.envMapIntensity,1,'template remains untouched');
 car.dispose();assert.equal(disposed,0);fallback.dispose();local.dispose();
});

function lampFixture(){
 const source=fixture();
 for(const [role,idle,active]of [['combined',.22,2.8],['brake',0,2.8],['position',.3,.3],['reflector',0,0],['front',.4,.4]]){
  const material=new THREE.MeshStandardMaterial({emissive:role==='front'?'#eef3ff':'#ff0000',emissiveIntensity:idle});material.name=role;material.userData={vehicleLightRole:role,idleIntensity:idle,brakeIntensity:active};const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.1,.1),material);mesh.name=role;source.add(mesh);
 }return source;
}
test('automatic lighting separates white headlights, red tails and brighter stop lamps',()=>{
 const car=createImportedCar(CARS[0],'#ff4411',false,lampFixture()),mat=name=>car.body.getObjectByName(name).material;
 car.setLighting({night:1});assert.ok(mat('front').emissiveIntensity>3);assert.ok(mat('front').emissive.b>mat('front').emissive.r*.9);assert.ok(mat('combined').emissiveIntensity>.7);assert.equal(mat('brake').emissiveIntensity,0);assert.equal(mat('reflector').emissiveIntensity,0);
 const running=mat('combined').emissiveIntensity;car.update({...pose,brake:1},0);assert.equal(mat('combined').emissiveIntensity,2.8);assert.ok(mat('combined').emissiveIntensity>running*3);assert.equal(mat('brake').emissiveIntensity,2.8);assert.ok(mat('combined').emissive.r>mat('combined').emissive.b*10);
 car.update({...pose,brake:0},0);assert.equal(mat('combined').emissiveIntensity,running);assert.equal(mat('brake').emissiveIntensity,0);
 car.setLighting({night:0,tunnel:0,wet:0});assert.equal(mat('combined').emissiveIntensity,.22);assert.equal(mat('position').emissiveIntensity,.3);assert.equal(mat('front').emissiveIntensity,.4);assert.equal(car.lightState.amount,0);car.dispose();
});
test('setLighting immediately applies the last brake state, independent of update order',()=>{
 const source=lampFixture(),a=createImportedCar(CARS[0],'#f00',false,source),b=createImportedCar(CARS[0],'#f00',false,source);
 a.update({...pose,brake:.8},0);a.setLighting({night:1});b.setLighting({night:1});b.update({...pose,brake:.8},0);assert.deepEqual(a.lightState,b.lightState);
 a.setLighting({night:0});assert.equal(a.body.getObjectByName('combined').material.emissiveIntensity,2.8,'lighting reset must not cancel a held brake');assert.equal(a.body.getObjectByName('brake').material.emissiveIntensity,2.8);
 a.update({...pose,brake:0},0);assert.equal(a.body.getObjectByName('combined').material.emissiveIntensity,.22);assert.equal(b.lightState.night,1);assert.equal(source.getObjectByName('combined').material.emissiveIntensity,.22,'source template is isolated');a.dispose();b.dispose();
});
test('tunnels and rain engage lamps without allocating a light object or changing geometry',()=>{
 const car=createImportedCar(CARS[0],'#f00',false,lampFixture()),objects=[];car.body.traverse(o=>objects.push(o));const geometry=car.body.getObjectByName('Original body').geometry;
 car.setLighting({tunnel:1});assert.equal(car.lightState.amount,1);assert.ok(car.lightState.frontIntensity>3);
 car.setLighting({wet:.7});assert.ok(car.lightState.amount>.5);car.setLighting({night:-1,tunnel:NaN,wet:0});assert.equal(car.lightState.amount,0);
 const after=[];car.body.traverse(o=>after.push(o));assert.deepEqual(after,objects);assert.equal(car.body.getObjectByName('Original body').geometry,geometry);assert.ok(after.every(o=>!o.isLight));car.dispose();
});

for(const config of CARS)test(`${config.id}: shipped GLB front-lamp names and material sharing are safely scoped`,()=>{
 const file=IMPORTED_MODELS[config.id].split('?')[0],buffer=readFileSync(new URL('../public/models/'+file,import.meta.url)),json=JSON.parse(buffer.subarray(20,20+buffer.readUInt32LE(12)).toString('utf8'));
 const realMaterials=json.materials.map(def=>{const material=new THREE.MeshStandardMaterial({emissiveIntensity:0});material.name=def.name;material.userData={...def.extras};if(def.pbrMetallicRoughness?.baseColorTexture)material.map=new THREE.Texture();return material;});
 const identified=[];for(const node of json.nodes){if(node.mesh===undefined)continue;for(const primitive of json.meshes[node.mesh].primitives){const profile=importedFrontLampProfile(config.id,node.name,realMaterials[primitive.material]);if(profile)identified.push({node,primitive,profile});}}
 assert.ok(identified.length>=1,'current GLB must contain recognized authored front lamps');
 if(config.id==='db12')assert.deepEqual(identified.map(x=>x.node.name).sort(),['extralight_1','extralight_2','headlight_l','headlight_r']);
 if(config.id==='gtc4lusso')assert.deepEqual(identified.map(x=>x.node.name).sort(),['chassis_pivot_chrome','chassis_pivot_details']);
 if(config.id==='f812')assert.ok(identified.every(x=>x.node.name.startsWith('Light_Geo_')&&x.profile.mask==='f812'));
 const source=fixture(),sourceGeometry=new THREE.BoxGeometry(.1,.1,.1);
 for(const {node,primitive}of identified){const mesh=new THREE.Mesh(sourceGeometry,realMaterials[primitive.material]);mesh.name=node.name;source.add(mesh);}
 const sharedOriginal=realMaterials[identified[0].primitive.material],nonLamp=new THREE.Mesh(sourceGeometry,sharedOriginal);nonLamp.name=config.id==='db12'?'reversinglight_l':'Unrelated shared material';source.add(nonLamp);
 const car=createImportedCar(config,'#f00',false,source),front=car.body.getObjectByName(identified[0].node.name).material,other=car.body.getObjectByName(nonLamp.name).material;
 assert.notEqual(front,other,'a front-lamp copy cannot illuminate reverse lamps or unrelated shared material');assert.equal(front.emissiveMap,front.map);assert.ok(car.lightState.frontCount>0);assert.equal(other.emissiveIntensity,0);car.setLighting({night:1});assert.ok(front.emissiveIntensity>=2.2);assert.equal(other.emissiveIntensity,0);assert.equal(sharedOriginal.emissiveIntensity,0);
 for(const {node,primitive,profile}of identified){const material=car.body.getObjectByName(node.name).material;if(profile.mask){const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};material.onBeforeCompile(shader);assert.ok(shader.fragmentShader.includes('totalEmissiveRadiance *='));assert.ok(shader.fragmentShader.includes('vImportedLampP.z'));assert.ok(shader.fragmentShader.includes(profile.mask==='gtc4'?'step(1.59,vImportedLampP.z)':'step(1.28,vImportedLampP.z)'));assert.equal(material.toneMapped,sharedOriginal.toneMapped,'body details keep their original PBR tone mapping');}
  const accessor=json.accessors[primitive.attributes.POSITION];assert.ok(accessor.max[2]>1.5,'the actual assigned primitive includes front-facing physical light geometry');
 }
 assert.equal(car.body.getObjectByName(identified[0].node.name).geometry,sourceGeometry,'lamp geometry is retained');car.dispose();sourceGeometry.dispose();for(const material of realMaterials){material.map?.dispose();material.dispose();}
});


test('GTC4 authored brake sprites cannot black out the four running-light rings at night',()=>{
 const b=readFileSync(new URL('../public/models/ferrari-gtc4lusso.glb',import.meta.url)),jsonLength=b.readUInt32LE(12),json=JSON.parse(b.subarray(20,20+jsonLength)),binaryStart=jsonLength+28;
 function values(id){const a=json.accessors[id],v=json.bufferViews[a.bufferView],offset=binaryStart+(v.byteOffset||0)+(a.byteOffset||0),components={SCALAR:1,VEC2:2,VEC3:3}[a.type],Type={5126:Float32Array,5123:Uint16Array,5125:Uint32Array}[a.componentType];return new Type(b.buffer.slice(b.byteOffset+offset,b.byteOffset+offset+a.count*components*Type.BYTES_PER_ELEMENT));}
 const source=fixture(false),lights=[],textures=[];
 for(const node of json.nodes){if(node.mesh===undefined)continue;for(const p of json.meshes[node.mesh].primitives){
  const def=json.materials[p.material],role=def.extras?.vehicleLightRole;if(!['combined','brake'].includes(role))continue;
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(values(p.attributes.POSITION),3));g.setAttribute('uv',new THREE.BufferAttribute(values(p.attributes.TEXCOORD_0),2));g.setIndex(new THREE.BufferAttribute(values(p.indices),1));
  const m=new THREE.MeshStandardMaterial({map:new THREE.Texture(),emissiveMap:new THREE.Texture(),side:THREE.DoubleSide});m.name=def.name;m.userData={...def.extras};textures.push(m.map,m.emissiveMap);
  const mesh=new THREE.Mesh(g,m);mesh.name=node.name;source.add(mesh);lights.push({mesh,role});
 }}
 assert.equal(lights.length,2);
 // Test the actual exported surfaces: every overlapping rear-view sample meets
 // the brake billboard first. An opaque zero-emission stop layer hides the ring.
 source.updateMatrixWorld(true);const ray=new THREE.Raycaster(),direction=new THREE.Vector3(0,0,1);let overlap=0,brakeFirst=0;
 for(let x=-.9;x<.9;x+=.02)for(let y=.71;y<.96;y+=.01){ray.set(new THREE.Vector3(x,y,-3),direction);const hits=ray.intersectObjects(lights.map(l=>l.mesh));if(new Set(hits.map(h=>h.object.material.userData.vehicleLightRole)).size===2){overlap++;if(hits[0].object.material.userData.vehicleLightRole==='brake')brakeFirst++;}}
 assert.ok(overlap>300);assert.equal(brakeFirst,overlap);
 const car=createImportedCar(CARS.find(c=>c.id==='gtc4lusso'),'#f00',false,source);car.setLighting({night:1});
 for(const {mesh,role}of lights){const copy=car.body.getObjectByName(mesh.name),m=copy.material;
  assert.equal(copy.geometry,mesh.geometry);assert.equal(m.map,mesh.material.map);assert.equal(m.emissiveMap,mesh.material.emissiveMap,'retain the source lamp-specific atlas and UVs');
  assert.equal(m.transparent,true);assert.equal(m.blending,THREE.AdditiveBlending);assert.equal(m.depthWrite,false);assert.equal(m.depthTest,true);assert.equal(m.forceSinglePass,true);assert.equal(m.fog,false);
  assert.equal(m.color.getHex(),0,'non-emitting black pixels contribute no diffuse rectangle');
  assert.equal(m.emissiveIntensity,role==='brake'?0:.82);
  const shader={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,uniforms:{}};m.onBeforeCompile(shader);
  const replacement=shader.fragmentShader.indexOf('outgoingLight=totalEmissiveRadiance;');assert.ok(replacement>shader.fragmentShader.indexOf('vec3 totalEmissiveRadiance'));assert.ok(replacement<shader.fragmentShader.indexOf('#include <opaque_fragment>'));
  assert.equal(mesh.material.transparent,false,'source template and unrelated car materials are not mutated');
 }
 car.update({...pose,brake:1},0);assert.equal(car.lightState.brakeIntensity,2.5);assert.ok(car.lightState.brakeIntensity>car.lightState.tailIntensity*3);
 car.update({...pose,brake:0},0);assert.equal(car.body.getObjectByName(lights.find(l=>l.role==='brake').mesh.name).material.emissiveIntensity,0);assert.equal(car.lightState.tailIntensity,.82);
 assert.equal(car.body.getObjectByName('Original body').material.transparent,false);car.dispose();for(const {mesh}of lights){mesh.geometry.dispose();mesh.material.dispose();}textures.forEach(t=>t.dispose());
});
