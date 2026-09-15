import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {coniferGeometry,broadleafCanopyGeometry,coniferWoodGeometry,broadleafWoodGeometry,canopyMaterial} from '../src/vegetation-trees.js';

test('leaf sprays have finite geometry and real open silhouettes at both detail levels',()=>{
 for(const make of [coniferGeometry,broadleafCanopyGeometry])for(const detailed of [false,true]){
  const g=make(detailed),p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
  g.computeBoundingBox();assert.ok(g.boundingBox.min.y>0);assert.ok(g.boundingBox.max.y<1.2);
  assert.ok(g.boundingBox.max.x-g.boundingBox.min.x<.9);assert.ok(g.index.count/3<2500);
  for(let i=0;i<p.count;i++){assert.ok(Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)));assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-5);assert.ok(uv.getX(i)>=0&&uv.getX(i)<=1);assert.ok(uv.getY(i)>=0&&uv.getY(i)<=1);}
  // Each disconnected spray is a quad with open boundary edges, never a solid green hull.
  assert.equal(p.count%4,0);assert.equal(g.index.count,p.count/4*6);g.dispose();
 }
});

test('branch structures reach tree base and canopy and retain a bounded mesh budget',()=>{
 for(const make of [coniferWoodGeometry,broadleafWoodGeometry]){
  const g=make();g.computeBoundingBox();assert.ok(g.boundingBox.min.y<0);assert.ok(g.boundingBox.max.y>.9);assert.ok(g.index.count/3<600);g.dispose();
 }
});

test('colour and shadow foliage share cutout and wind animation without translucent sorting',()=>{
 const world={uniforms:{time:{value:2}}},mat=canopyMaterial(world,'pine'),depth=mat.userData.foliageDepth;
 assert.equal(mat.transparent,false);assert.equal(mat.depthWrite,true);assert.equal(mat.side,THREE.DoubleSide);
 assert.equal(mat.map,depth.map);assert.equal(mat.alphaTest,depth.alphaTest);assert.ok(mat.alphaTest>0);
 const a={uniforms:{},vertexShader:THREE.ShaderLib.lambert.vertexShader,fragmentShader:THREE.ShaderLib.lambert.fragmentShader};
 const b={uniforms:{},vertexShader:THREE.ShaderLib.depth.vertexShader,fragmentShader:THREE.ShaderLib.depth.fragmentShader};
 mat.onBeforeCompile(a);depth.onBeforeCompile(b);
 assert.equal(a.uniforms.treeTime,world.uniforms.time);assert.equal(b.uniforms.treeTime,world.uniforms.time);
 const wind=a.vertexShader.match(/float phase=[\s\S]*?transformed.z\+=.*?;/)[0];assert.ok(b.vertexShader.includes(wind));
 mat.dispose();depth.dispose();
});
