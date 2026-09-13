import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CoastTrack} from '../src/track.js';
import {buildCoastalTerrain, terrainMaterial} from '../src/terrain.js';
import {buildCoastalScenery} from '../src/scenery.js';

const world={scene:new THREE.Scene(),track:new CoastTrack(),camera:new THREE.PerspectiveCamera(67,1.6,.1,7000),uniforms:{time:{value:0}},quality:'balanced'};
buildCoastalTerrain(world);buildCoastalScenery(world);
const meshes=prefix=>world.scene.children.filter(mesh=>mesh.name.startsWith(prefix));
const total=prefix=>meshes(prefix).reduce((sum,mesh)=>sum+mesh.count,0);
const tree=meshes('Continuous coastal fir crowns')[0].userData.sourceItems[0];
function faceTree(){world.camera.position.copy(tree.p).add(new THREE.Vector3(0,6,-35));world.camera.lookAt(tree.p.clone().add(new THREE.Vector3(0,4,0)));world.updateVegetationLod();}

test('terrain optimisation preserves sampled road, verge, hillside and bridge heights',()=>{
 // Baseline world-space heights, captured before grid partitioning/material changes.
 const samples=[[-23.709084669716948,139.16857508910456,13.697540464727858],[6.21993850172365,137.10615612018196,19.877303425760463],[36.14896167316425,135.04373715125936,20.296187842238076],[74.87036065424724,1056.8082224074158,125.13934560330976],[97.32809941387914,1036.917270449198,125.14249272135305],[434.2612625168869,1047.8494563781528,190.46640996148412],[407.62709985695665,1034.0428862246217,190.5611892531995],[558.9085563341662,789.8203828262531,140.31140428825393],[578.5682028127663,767.1598819417522,145.32382195882755],[598.2278492913665,744.4993810572514,148.7327023161755],[1223.2903379806942,957.778058264979,32.04060660416475],[1197.9570594802835,941.7086774299677,32.08844060263004],[1171.704182786563,-155.54383361301973,20.871114467976287],[1143.4338227102864,-165.58309360356017,21.04693148939995],[622.3475985726294,-892.8087517428204,40.37414834790868],[629.2008388011823,-863.6020213819986,45.932229985313654],[636.0540790297351,-834.3952910211768,47.50931344650659],[89.28826714480748,-399.9686776434872,-12],[116.32465386702896,-386.9673779774351,-12]];
 for(const [x,z,height] of samples) assert.equal(world.groundHeight(x,z),height);
 assert.equal(world.terrainStats.groundTriangles,115500);assert.equal(world.terrainStats.ridgeTriangles,68040);
});

test('terrain tiles share exact border normals and allow offscreen ground to be culled',()=>{
 const vertices=new Map();let shared=0;
 const ground=meshes('Coastal ground tile');assert.equal(ground.length,25);
 for(const tile of ground){
  const p=tile.geometry.attributes.position,n=tile.geometry.attributes.normal;
  for(let i=0;i<p.count;i++){
   const key=`${p.getX(i)},${p.getZ(i)}`,value=[p.getY(i),n.getX(i),n.getY(i),n.getZ(i)];
   if(vertices.has(key)){assert.deepEqual(value,vertices.get(key));shared++;}else vertices.set(key,value);
  }
 }
 assert.ok(shared>1000);
 faceTree();world.scene.updateMatrixWorld();
 const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(world.camera.projectionMatrix,world.camera.matrixWorldInverse));
 assert.ok(ground.filter(mesh=>frustum.intersectsObject(mesh)).length<ground.length);
 for(const ridge of meshes('Horizon ridge')){assert.equal(ridge.castShadow,false);assert.equal(ridge.receiveShadow,false);}
});

test('distant terrain shader has no texture sampling or normal-detail cost',()=>{
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
 terrainMaterial({distant:true}).onBeforeCompile(shader);
 assert.ok(!shader.fragmentShader.includes('texture2D('));
 assert.ok(!shader.uniforms.uRockNormal);
});

test('vegetation pools preserve every tree and avoid uploads for an unchanged camera',()=>{
 faceTree();assert.ok(world.sceneryStats.nearFirs>0);
 assert.equal(total('Continuous coastal fir crowns')+world.sceneryStats.nearFirs,440);
 assert.equal(total('Wind-shaped broadleaf crowns')+world.sceneryStats.nearBroadleaves,65);
 assert.ok(world.sceneryStats.needleTrees<=64);assert.ok(world.sceneryStats.visibleGrassClumps<=240);
 const uploads=world.sceneryStats.lodUploads,versions=world.scene.children.filter(mesh=>mesh.isInstancedMesh).map(mesh=>mesh.instanceMatrix.version);
 world.updateVegetationLod();world.updateVegetationLod();
 assert.equal(world.sceneryStats.lodUploads,uploads);
 assert.deepEqual(world.scene.children.filter(mesh=>mesh.isInstancedMesh).map(mesh=>mesh.instanceMatrix.version),versions);
});

test('stationary camera turns refresh detail selection, and distant cameras release all detail',()=>{
 faceTree();const uploads=world.sceneryStats.lodUploads;
 world.camera.rotateY(Math.PI);world.updateVegetationLod();assert.ok(world.sceneryStats.lodUploads>uploads);
 assert.equal(total('Continuous coastal fir crowns')+world.sceneryStats.nearFirs,440);
 world.quality='low';world.updateVegetationLod();assert.ok(world.sceneryStats.nearFirs<=12);assert.ok(world.sceneryStats.nearBroadleaves<=6);
 world.camera.position.set(100000,100000,100000);world.updateVegetationLod();
 assert.equal(world.sceneryStats.nearFirs,0);assert.equal(world.sceneryStats.nearBroadleaves,0);
 assert.equal(world.sceneryStats.needleTrees,0);assert.equal(world.sceneryStats.visibleGrassClumps,0);
 assert.equal(total('Continuous coastal fir crowns'),440);assert.equal(total('Wind-shaped broadleaf crowns'),65);
 world.quality='balanced';
});
