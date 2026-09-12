import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createWheelSet} from '../src/wheels.js';

test('Forged wheels retain the original contact radius and mirror their outer face',()=>{
 const set=createWheelSet();
 for(const side of[-1,1]){
  const assembly=set.create(side);assembly.root.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(assembly.root);
  assert.ok(Math.abs(box.min.y+.375)<1e-6&&Math.abs(box.max.y-.375)<1e-6);
  assert.ok(Math.max(Math.abs(box.min.x),Math.abs(box.max.x))<.172);
  assembly.root.traverse(o=>{if(o.isMesh){for(const v of o.geometry.attributes.position.array)assert.ok(Number.isFinite(v));}});
  assert.equal(assembly.fixed.parent,assembly.root);assert.equal(assembly.rotating.parent,assembly.root);
  assembly.rotating.rotation.x=1.1;assert.equal(assembly.fixed.rotation.x,0);
 }
 set.dispose();
});

test('Simple wheel batches reduce draw calls and geometry without changing tire size',()=>{
 const detailed=createWheelSet(),simple=createWheelSet({simple:true});
 assert.equal(detailed.drawCallsPerWheel,6);assert.equal(simple.drawCallsPerWheel,4);
 assert.ok(simple.trianglesPerWheel<detailed.trianglesPerWheel*.65);
 detailed.dispose();simple.dispose();
});

test('Wheel geometry is shared safely while cockpit visibility and disposal stay per car',()=>{
 const a=createWheelSet(),b=createWheelSet(),aa=a.create(),bb=b.create();
 const tireA=aa.rotating.getObjectByName('rubber'),tireB=bb.rotating.getObjectByName('rubber');
 assert.equal(tireA.geometry,tireB.geometry);assert.notEqual(tireA.material,tireB.material);
 let disposed=0;tireA.geometry.addEventListener('dispose',()=>disposed++);
 a.setInterior(true);assert.equal(tireA.material.depthWrite,false);assert.equal(tireB.material.depthWrite,true);
 a.dispose();assert.equal(disposed,0);b.dispose();assert.equal(disposed,1);b.dispose();assert.equal(disposed,1);
});
