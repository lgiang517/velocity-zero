import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CoastTrack} from '../src/track.js';
import {landmarkProfile,selectLandmarkLevel,placeLandmarks,clearOfRoad} from '../src/coastal-landmarks.js';

test('Lux3D runtime asset has three finite bounded LODs sharing its material images',()=>{
 const file=readFileSync(new URL('../public/models/coastal-rock/coastal-rock-lods.glb',import.meta.url));
 assert.equal(file.readUInt32LE(0),0x46546c67);
 const jsonSize=file.readUInt32LE(12),doc=JSON.parse(file.subarray(20,20+jsonSize).toString()),binary=28+jsonSize;
 assert.equal(doc.images.length,2);assert.equal(doc.materials.length,1);
 for(const [level,budget] of [[0,24000],[1,7000],[2,1400]]){
  const node=doc.nodes.find(n=>n.name==='CoastalRock_LOD'+level);assert.ok(node);
  let triangles=0;
  for(const primitive of doc.meshes[node.mesh].primitives){
   triangles+=doc.accessors[primitive.indices].count/3;
   const accessor=doc.accessors[primitive.attributes.POSITION],view=doc.bufferViews[accessor.bufferView];
   assert.equal(accessor.componentType,5126);
   for(let i=0;i<accessor.count;i++)for(let j=0;j<3;j++)assert.ok(Number.isFinite(file.readFloatLE(binary+(view.byteOffset||0)+(accessor.byteOffset||0)+i*(view.byteStride||12)+j*4)));
  }
  assert.ok(triangles<=budget&&triangles>budget*.9);
 }
});
test('Landmark footprints stay clear of the entire drivable route',()=>{
 const track=new CoastTrack(),sites=placeLandmarks(track,()=>15,{x:12.2,z:7.5});
 assert.ok(sites.length>=6);
 for(const site of sites){assert.ok(clearOfRoad(track,site.p,site.radius));assert.ok(site.p.y<15);}
});
test('Touch and performance profiles avoid dense rocks, with stable LOD boundaries',()=>{
 for(const quality of ['balanced','low'])assert.notEqual(selectLandmarkLevel(1,landmarkProfile(quality,true)),0);
 const desktop=landmarkProfile('balanced');
 assert.equal(selectLandmarkLevel(desktop.near+1,desktop,0),0);
 assert.equal(selectLandmarkLevel(desktop.near*1.13,desktop,0),1);
 assert.equal(selectLandmarkLevel(1000,desktop),2);
});
