import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CoastTrack} from '../src/track.js';
import {buildCoastalTerrain,distantRidgeHeight,terrainMaterial} from '../src/terrain.js';

const world={scene:new THREE.Scene(),track:new CoastTrack()};
buildCoastalTerrain(world);
const ridges=world.scene.children.filter(mesh=>mesh.name.startsWith('Horizon ridge'));

test('baked ridge colors stay continuous across culled tiles within the existing geometry budget',()=>{
 const edges=new Map();let shared=0,colorBytes=0,min=Infinity,max=-Infinity;
 assert.equal(ridges.length,21);
 for(const mesh of ridges){
  const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal,c=mesh.geometry.attributes.color;
  assert.equal(c.count,p.count);assert.equal(mesh.material.vertexColors,true);
  assert.equal(mesh.castShadow,false);assert.equal(mesh.receiveShadow,false);
  colorBytes+=c.array.byteLength;
  const layer=mesh.name.split(' ')[2];
  for(let i=0;i<p.count;i++){
   const values=[p.getY(i),n.getX(i),n.getY(i),n.getZ(i),c.getX(i),c.getY(i),c.getZ(i)];
   assert.ok(values.every(Number.isFinite));
   for(const v of values.slice(4)){assert.ok(v>=0&&v<=1);min=Math.min(min,v);max=Math.max(max,v);}
   const key=`${layer}:${p.getX(i)},${p.getZ(i)}`;
   if(edges.has(key)){assert.deepEqual(values,edges.get(key));shared++;}else edges.set(key,values);
  }
 }
 assert.ok(shared>=990,'adjacent mountain tiles must share baked normals and mineral colors');
 assert.ok(max-min>.08,'mineral exposure remains distinct from sheltered vegetation');
 assert.ok(colorBytes<450000,'one static RGB attribute stays below 450 kB');
 assert.equal(world.terrainStats.ridgeTriangles,68040);
 assert.equal(world.terrainStats.groundTriangles,115500);
 for(const mesh of world.scene.children.filter(mesh=>mesh.name.startsWith('Coastal ground tile'))){
  assert.equal(mesh.geometry.attributes.color,undefined);
 }
});

test('eroded ridges are deterministic, finite, and terminate at their buried outer boundaries',()=>{
 for(let layer=0;layer<3;layer++)for(let x=-2600;x<=3300;x+=47){
  assert.equal(distantRidgeHeight(x,1450,0,layer),0);
  assert.equal(distantRidgeHeight(x,2600,1,layer),0);
  for(const across of [.01,.2,.47,.62,.85,.99]){
   const z=1450+layer*560+across*1150,h=distantRidgeHeight(x,z,across,layer);
   assert.ok(Number.isFinite(h)&&h>=0&&h<900);
   assert.equal(h,distantRidgeHeight(x,z,across,layer));
   assert.ok(Math.abs(h-distantRidgeHeight(x+.001,z,across,layer))<.02,'drainage introduces no height discontinuities');
  }
 }
});

test('surface shader bounds sample cost and reuses a single albedo for the distant ridges',()=>{
 for(const distant of [false,true]){
  const mat=terrainMaterial({distant});
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  mat.onBeforeCompile(shader);
  assert.equal((shader.fragmentShader.match(/texture(?:2D|Grad)\(/g)||[]).length,distant?3:8);
  assert.equal(Object.keys(shader.uniforms).length,distant?5:4);
  assert.equal(shader.uniforms.uRockRough,undefined);
 }
});


test('mountain haze shares live weather values and leaves near-ground fog untouched',()=>{
 const weather={daylight:{value:1},wet:{value:0},night:{value:0},sunDir:{value:new THREE.Vector3(-.56,.32,.77).normalize()}};
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
 terrainMaterial({distant:true,weather}).onBeforeCompile(shader);
 assert.equal(shader.uniforms.uMountainDaylight,weather.daylight);assert.equal(shader.uniforms.uMountainWet,weather.wet);assert.equal(shader.uniforms.uMountainNight,weather.night);assert.equal(shader.uniforms.uMountainSun,weather.sunDir);
 weather.night.value=.9;assert.equal(shader.uniforms.uMountainNight.value,.9);
 const near={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};terrainMaterial().onBeforeCompile(near);
 assert.ok(near.fragmentShader.includes('#include <fog_fragment>'));assert.equal(near.uniforms.uMountainDaylight,undefined);
});
