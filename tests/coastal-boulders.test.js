import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {coastalBoulderGeometry,coastalBoulderMaterial} from '../src/coastal-boulders.js';
import {environmentAssets} from '../src/environment-assets.js';

test('shared boulder has bounded mobile geometry, valid surfaces and rounded fracture normals',()=>{
 const g=coastalBoulderGeometry(),p=g.attributes.position,n=g.attributes.normal;
 assert.equal(p.count/3,320);assert.ok(g.boundingSphere.radius<1.8);assert.ok(g.boundingBox.min.y<-.5&&g.boundingBox.max.y<1);
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),face=new THREE.Vector3(),normal=new THREE.Vector3();let rounded=0;
 for(let i=0;i<p.count;i+=3){
  a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);face.crossVectors(b.sub(a),c.sub(a));assert.ok(face.lengthSq()>1e-12,'no collapsed triangles');face.normalize();
  for(let j=0;j<3;j++){normal.fromBufferAttribute(n,i+j);assert.ok(Number.isFinite(normal.length())&&Math.abs(normal.length()-1)<1e-5);if(normal.dot(face)<.998)rounded++;}
 }
 assert.ok(rounded>p.count*.35,'weathered edges must not retain the original per-triangle flat shading');
 const second=coastalBoulderGeometry();assert.deepEqual(second.attributes.position.array,p.array,'deterministic mesh');g.dispose();second.dispose();
});

test('boulders borrow existing scans, map in world metres and use no extra render pass',()=>{
 const original={albedo:environmentAssets.albedo,normal:environmentAssets.normal};
 const color=new THREE.Texture(),normal=new THREE.Texture();let disposed=0;color.addEventListener('dispose',()=>disposed++);normal.addEventListener('dispose',()=>disposed++);
 Object.assign(environmentAssets,{albedo:color,normal});const m=coastalBoulderMaterial();
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};m.onBeforeCompile(shader);
 assert.equal(shader.uniforms.uBoulderColor.value,color);assert.equal(shader.uniforms.uBoulderNormal.value,normal);
 assert.ok(shader.vertexShader.includes('instanceMatrix*boulderWorld'));assert.ok(shader.vertexShader.includes('modelMatrix*boulderWorld'));
 assert.equal((shader.fragmentShader.match(/texture(?:2D|Grad)\(/g)||[]).length,6,'three color and three normal lookups, no new texture resources');
 assert.equal(m.metalness,0);assert.equal(m.transparent,false);assert.ok(m.roughness>.85);
 m.dispose();assert.equal(disposed,0,'borrowed textures remain owned by the world');Object.assign(environmentAssets,original);color.dispose();normal.dispose();
});
