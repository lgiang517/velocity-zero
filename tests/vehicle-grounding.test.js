import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createVehicleGrounding} from '../src/vehicle-grounding.js';
import {CoastTrack} from '../src/track.js';

function carFixture(){
 const root=new THREE.Group(),wheelRig=new THREE.Group(),body=new THREE.Group();root.add(wheelRig,body);const wheels=[];
 for(const x of[-.88,.88])for(const z of[-1.41,1.39]){const wheel=new THREE.Group();wheel.name=`Wheel_${x}_${z}`;wheel.position.set(x,.36,z);wheel.userData.radius=.36;const g=new THREE.CylinderGeometry(.36,.36,.24,16);g.rotateZ(Math.PI/2);wheel.add(new THREE.Mesh(g,new THREE.MeshBasicMaterial()));wheelRig.add(wheel);wheels.push(wheel);}
 return{root,wheelRig,body,wheels};
}
const flat={sample(s){return{p:new THREE.Vector3(0,3,s),right:new THREE.Vector3(1,0,0),curvature:0,asphaltHalfWidth:14,medianHalfWidth:1.35};}};
const close=(a,b,tolerance=1e-5)=>assert.ok(Math.abs(a-b)<tolerance,`${a} differs from ${b}`);

test('grounding uses actual wheel root coordinates despite a transformed car, in one bounded draw',()=>{
 const car=carFixture();car.root.position.set(450,20,-700);car.root.rotation.set(.08,.8,.03);
 const grounding=createVehicleGrounding(car,flat);
 assert.deepEqual(grounding.stats,{vertices:28,triangles:20,drawCalls:1,lights:0,textures:0});assert.equal(grounding.root.isMesh,true);assert.equal(grounding.root.children.length,0);
 for(const contact of grounding.wheelContacts){close(Math.abs(contact.x),.88);assert.ok(Math.abs(contact.z+1.41)<1e-8||Math.abs(contact.z-1.39)<1e-8);assert.ok(contact.halfWidth<.14);}
 assert.equal(grounding.root.material.depthWrite,false);assert.equal(grounding.root.castShadow,false);assert.equal(grounding.root.receiveShadow,false);grounding.dispose();
});

test('each tyre patch follows its real contact position and vehicle yaw rather than shell pitch or roll',()=>{
 const car=carFixture(),grounding=createVehicleGrounding(car,flat);car.body.rotation.set(.2,0,.3);
 for(const yaw of[0,.7,-.9]){grounding.update(120,7.475,yaw,{night:1});const positions=grounding.root.geometry.attributes.position;
  grounding.wheelContacts.forEach((contact,w)=>{const centre=new THREE.Vector3();for(let i=12+w*4;i<16+w*4;i++)centre.add(new THREE.Vector3().fromBufferAttribute(positions,i));centre.multiplyScalar(.25).add(grounding.root.position);
   close(centre.x,7.475+Math.cos(yaw)*contact.x+Math.sin(yaw)*contact.z);close(centre.z,120+Math.cos(yaw)*contact.z-Math.sin(yaw)*contact.x);close(centre.y,3.027);
  });
 }
 grounding.dispose();
});

test('sloped roads set every contact vertex height and road clipping bounds without raycasts',()=>{
 const car=carFixture(),slope={sample(s){return{p:new THREE.Vector3(0,10+s*.08,s),right:new THREE.Vector3(1,0,0),curvature:0,asphaltHalfWidth:14,medianHalfWidth:1.35};}},grounding=createVehicleGrounding(car,slope);
 grounding.update(310,11.225,.25);const p=grounding.root.geometry.attributes.position,b=grounding.root.geometry.attributes.roadBounds;
 for(let i=0;i<p.count;i++){const z=p.getZ(i)+grounding.root.position.z,y=p.getY(i)+grounding.root.position.y;close(y,10+z*.08+.027);close(b.getX(i),1.35);close(b.getY(i),14);close(b.getZ(i),p.getX(i)+grounding.root.position.x);}
 grounding.dispose();
});

test('contact patches remain small and finite through hairpins, route seams and widened bridge lanes',()=>{
 const track=new CoastTrack(),car=carFixture(),grounding=createVehicleGrounding(car,track);
 for(const s of[0,track.length-.1,track.sectionS('hzmb',.4),track.sectionS('duku',.3),track.sectionS('duku',.7)])for(const d of[-5.6,5.6])for(const yaw of[-.6,0,.6]){
  grounding.update(s,d,yaw);const p=grounding.root.geometry.attributes.position;
  for(let i=0;i<p.count;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i);assert.ok(v.toArray().every(Number.isFinite));assert.ok(v.length()<grounding.root.geometry.boundingSphere.radius);}
 }
 grounding.dispose();
});

test('night and low presets gently strengthen shadows; invisible cars skip work and disposal is complete',()=>{
 const car=carFixture(),grounding=createVehicleGrounding(car,flat),scene=new THREE.Scene();scene.add(grounding.root);
 grounding.update(40,-7.475,0);const day=grounding.root.material.uniforms.opacity.value;grounding.update(40,-7.475,0,{night:1,quality:'low'});const night=grounding.root.material.uniforms.opacity.value;
 assert.ok(night>day&&night<.30);const version=grounding.root.geometry.attributes.position.version;car.root.visible=false;grounding.update(200,0,0);assert.equal(grounding.root.visible,false);assert.equal(grounding.root.geometry.attributes.position.version,version);
 let geometryDisposed=0,materialDisposed=0;grounding.root.geometry.addEventListener('dispose',()=>geometryDisposed++);grounding.root.material.addEventListener('dispose',()=>materialDisposed++);grounding.dispose();grounding.dispose();assert.equal(geometryDisposed,1);assert.equal(materialDisposed,1);assert.equal(scene.children.length,0);
});
