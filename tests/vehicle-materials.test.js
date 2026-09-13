import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {refineVehicleMaterial,setVehicleWetness} from '../src/vehicle-materials.js';
test('refinement touches cloned material only and owns no additional resources',()=>{
 const original=new THREE.MeshPhysicalMaterial({color:'#e85824',roughness:.28});original.name='Paint';
 const clone=refineVehicleMaterial(original.clone());assert.equal(original.roughness,.28);assert.equal(clone.roughness,.29);assert.equal(clone.color.getHex(),original.color.getHex());assert.equal(clone.transmission,0);
 for(const key of Object.keys(clone))assert.ok(!clone[key]?.isTexture);
 let disposed=0;clone.addEventListener('dispose',()=>disposed++);clone.dispose();assert.equal(disposed,1);original.dispose();
});
test('player finish has derivative anti-aliasing; simple cars use unmodified shaders',()=>{
 const p=new THREE.MeshPhysicalMaterial();p.name='Paint';refineVehicleMaterial(p);
 const shader={vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <roughnessmap_fragment>'};p.onBeforeCompile(shader);
 assert.ok(shader.fragmentShader.includes('fwidth(finishPhase)'));assert.ok(shader.fragmentShader.includes('0.012 * finishVisibility'));assert.ok(!shader.fragmentShader.includes('texture2D'));
 const q=new THREE.MeshPhysicalMaterial();q.name='Paint';refineVehicleMaterial(q,{simple:true});const plain={vertexShader:'plain',fragmentShader:'plain'};q.onBeforeCompile(plain);assert.equal(plain.fragmentShader,'plain');p.dispose();q.dispose();
});
test('glass refinement adds no transmission and does not alter hidden interior flags',()=>{
 const m=new THREE.MeshPhysicalMaterial();m.name='Glass';m.colorWrite=false;m.depthWrite=false;refineVehicleMaterial(m);assert.equal(m.transmission,0);assert.equal(m.colorWrite,false);assert.equal(m.depthWrite,false);m.dispose();
});

test('paint and driver hood share bounded wetness response without changing color or visibility',()=>{
 const base=new THREE.MeshPhysicalMaterial({color:'#e85824'});base.name='Paint';
 const paint=refineVehicleMaterial(base),hood=refineVehicleMaterial(base.clone());hood.colorWrite=false;hood.depthWrite=false;
 for(const wet of[0,.5,1,-2,4,NaN]){
  setVehicleWetness(paint,wet);setVehicleWetness(hood,wet);
  assert.equal(paint.roughness,hood.roughness);assert.equal(paint.clearcoatRoughness,hood.clearcoatRoughness);
  assert.ok(paint.roughness>=.19&&paint.roughness<=.29);assert.ok(paint.clearcoatRoughness>=.075&&paint.clearcoatRoughness<=.15);
  assert.equal(paint.color.getHex(),0xe85824);assert.equal(hood.colorWrite,false);assert.equal(hood.depthWrite,false);
 }
 paint.dispose();hood.dispose();
});
