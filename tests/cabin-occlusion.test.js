import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCabinFloor} from '../src/cabin-floor.js';

test('Driver footwell rays hit opaque cabin surfaces before the road',()=>{
 const cabin=createCabinFloor(),eye=new THREE.Vector3(.35,1.03,-.40);
 try{
  for(const x of[-.78,-.4,0,.4,.78])for(const z of[-.8,-.25,.30,.78,.94]){
   const road=new THREE.Vector3(x,0,z),delta=road.clone().sub(eye),ray=new THREE.Raycaster(eye,delta.clone().normalize());
   const hits=ray.intersectObject(cabin.root,true);
   assert.ok(hits.length>0,`Uncovered floor toward x=${x}, z=${z}`);
   assert.ok(hits[0].distance<delta.length()-.05,'Cabin surface must obscure the road below');
   assert.equal(hits[0].object.material.transparent,false);assert.equal(hits[0].object.material.depthWrite,true);assert.equal(hits[0].object.material.opacity,1);
  }
 }finally{cabin.dispose();}
});

test('Cabin floor stays below the windshield and dashboard instruments',()=>{
 const cabin=createCabinFloor();try{
  const bounds=new THREE.Box3().setFromObject(cabin.root);assert.ok(bounds.max.y<.61);
  const eye=new THREE.Vector3(.35,1.03,-.40),ray=new THREE.Raycaster(eye,new THREE.Vector3(0,0,1));assert.equal(ray.intersectObject(cabin.root,true).length,0);
 }finally{cabin.dispose();}
});
