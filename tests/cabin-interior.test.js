import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';import {createCabinInterior} from '../src/cabin-interior.js';
test('fallback and traffic cabins fit geometry budgets and hide for driver view',()=>{
 for(const simple of[false,true]){const c=createCabinInterior({simple});try{assert.ok(c.stats().triangles<6000);assert.ok(c.stats().drawCalls<=5);if(simple)assert.ok(c.stats().triangles<600);c.setInterior(true);assert.equal(c.root.visible,false);c.setInterior(false);assert.equal(c.root.visible,true);}finally{c.dispose();}}
});
test('external cabin floor blocks downward view through the windows',()=>{
 const c=createCabinInterior();try{c.root.updateMatrixWorld(true);for(const x of[-.65,0,.65])for(const z of[-.95,-.4,.3,.72]){const ray=new THREE.Raycaster(new THREE.Vector3(x,1.1,z),new THREE.Vector3(0,-1,0));const hits=ray.intersectObject(c.root,true);assert.ok(hits.length>0);assert.ok(hits[0].point.y>=.22);assert.equal(hits[0].object.material.transparent,false);}}finally{c.dispose();}
});
test('two template seats share source assets and cabin disposal never frees caller resources',()=>{
 const source=new THREE.Group(),g=new THREE.BoxGeometry(.49,.74,.56),m=new THREE.MeshStandardMaterial();const mesh=new THREE.Mesh(g,m);mesh.position.y=.37;source.add(mesh);
 let freed=0;g.addEventListener('dispose',()=>freed++);m.addEventListener('dispose',()=>freed++);
 const c=createCabinInterior({seatTemplate:source});assert.equal(c.stats().templateAccepted,true);const seats=c.root.getObjectByName('Front seats');assert.equal(seats.children.length,2);
 for(const pivot of seats.children){const clone=pivot.children[0].children[0];assert.equal(clone.geometry,g);assert.equal(clone.material,m);const bounds=new THREE.Box3().setFromObject(pivot);assert.ok(Math.abs(bounds.min.y-.31)<1e-6);assert.ok(bounds.max.y<=1.051);}
 c.setSeatTemplate(null);assert.equal(c.stats().templateAccepted,false);c.dispose();c.dispose();assert.equal(freed,0);g.dispose();m.dispose();
});
test('fallback resources are released once without leaking on seat replacements',()=>{
 const c=createCabinInterior(),resources=new Set();c.root.traverse(o=>{if(o.geometry)resources.add(o.geometry);if(o.material)resources.add(o.material);});const counts=new Map();for(const r of resources){counts.set(r,0);r.addEventListener('dispose',()=>counts.set(r,counts.get(r)+1));}c.setSeatTemplate(null);c.dispose();for(const count of counts.values())assert.equal(count,1);
});

test('cabin fits the hollow shell and exterior wheel follows driver steering',()=>{
 const c=createCabinInterior();try{const bounds=new THREE.Box3().setFromObject(c.root);assert.ok(bounds.min.x>=-.701&&bounds.max.x<=.701);assert.ok(bounds.min.z>=-1.181&&bounds.max.z<=.781);c.update({steer:.18});assert.ok(Math.abs(c.root.getObjectByName('Exterior steering wheel').rotation.z+.9)<1e-10);c.update({steer:0});assert.ok(Math.abs(c.root.getObjectByName('Exterior steering wheel').rotation.z)<1e-10);}finally{c.dispose();}
});
