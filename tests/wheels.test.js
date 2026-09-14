import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createWheelSet,selectWheelAnchors} from '../src/wheels.js';

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

test('Road wheel proportions retain a visible tire sidewall and keep calipers behind every spoke angle',()=>{
 const set=createWheelSet(),wheel=set.create(),alloy=wheel.rotating.getObjectByName('alloy').geometry.attributes.position,cut=wheel.rotating.getObjectByName('cut').geometry.attributes.position,caliper=wheel.fixed.getObjectByName('caliper').geometry.attributes.position;
 let lip=0,spokeBack=Infinity,caliperFront=-Infinity;
 for(let i=0;i<cut.count;i++)lip=Math.max(lip,Math.hypot(cut.getY(i),cut.getZ(i)));
 // A realistic road tire must not be a thin rubber band around a near-full-radius rim.
 assert.ok(lip/.375>.65&&lip/.375<.75);
 for(let i=0;i<alloy.count;i++){const r=Math.hypot(alloy.getY(i),alloy.getZ(i));if(r>.15&&r<.237)spokeBack=Math.min(spokeBack,alloy.getX(i));}
 for(let i=0;i<caliper.count;i++)caliperFront=Math.max(caliperFront,caliper.getX(i));
 assert.ok(spokeBack-caliperFront>.006,`caliper-to-spoke gap ${spokeBack-caliperFront}`);
 set.dispose();
});


test('Wheel arch body meshes cannot become axle anchors or produce singular wheel matrices',()=>{
 const body=new THREE.Group(),set=createWheelSet();
 for(const [name,x,z]of[['Wheel_FL',.87,1.37],['Wheel_FR',-.87,1.37],['Wheel_RL',.87,-1.37],['Wheel_RR',-.87,-1.37]]){
  const anchor=new THREE.Object3D();anchor.name=name;anchor.position.set(x,.39,z);body.add(anchor);
 }
 const arch=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());arch.name='Wheel_arch_rolled_lip';body.add(arch);
 const anchors=selectWheelAnchors(body);assert.equal(anchors.length,4);assert.ok(!anchors.includes(arch));
 try{for(const anchor of anchors){const wheel=set.create(Math.sign(anchor.position.x));anchor.add(wheel.root);body.updateMatrixWorld(true);wheel.root.traverse(o=>assert.ok(Math.abs(o.matrixWorld.determinant())>1e-9));}}
 finally{set.dispose();arch.geometry.dispose();arch.material.dispose();}
 anchors[0].position.x=0;assert.throws(()=>selectWheelAnchors(body),/Invalid vehicle axle anchor: Wheel_FL/);
});
