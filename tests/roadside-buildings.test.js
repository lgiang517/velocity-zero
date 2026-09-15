import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CoastTrack} from '../src/track.js';
import {buildCoastalTerrain} from '../src/terrain.js';
import {buildCoastalScenery} from '../src/scenery.js';
const world={scene:new THREE.Scene(),track:new CoastTrack(),camera:new THREE.PerspectiveCamera(),quality:'balanced',uniforms:{time:{value:0}}};
buildCoastalTerrain(world);buildCoastalScenery(world);
test('houses face the road and their complete plots clear every route segment',()=>{
 assert.ok(world.roadsideSites.length>=15);
 for(const site of world.roadsideSites){
  const front=new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0),site.heading),q=world.track.sample(site.s);
  assert.ok(front.dot(q.right.clone().multiplyScalar(-site.side))>.999);
  for(const sample of world.track.samples)assert.ok(Math.hypot(site.p.x-sample.p.x,site.p.z-sample.p.z)-site.radius>14.5);
  assert.ok(site.foundationBottom<site.groundMin-.69);assert.ok(site.p.y>site.groundMax);
 }
});
test('entry stairs have solid ground contact and no instance escapes its declared plot',()=>{
 const matrix=new THREE.Matrix4(),point=new THREE.Vector3(),bottom=new THREE.Vector3();let steps=0;
 for(const mesh of world.scene.children.filter(m=>m.name.startsWith('Roadside'))){
  const positions=mesh.geometry.attributes.position;
  for(let i=0;i<mesh.count;i++){
   mesh.getMatrixAt(i,matrix);const centre=new THREE.Vector3().setFromMatrixPosition(matrix);
   const site=world.roadsideSites.reduce((a,b)=>Math.hypot(a.p.x-centre.x,a.p.z-centre.z)<Math.hypot(b.p.x-centre.x,b.p.z-centre.z)?a:b);
   for(let j=0;j<positions.count;j++){
    point.fromBufferAttribute(positions,j).applyMatrix4(matrix);
    assert.ok(Math.hypot(point.x-site.p.x,point.z-site.p.z)<=site.radius+.01,'geometry must remain within plot');
   }
   const local=centre.clone().sub(site.p).applyAxisAngle(new THREE.Vector3(0,1,0),-site.heading);
   if(mesh.name.startsWith('Roadside stone|box')&&local.z>site.plotD/2&&Math.abs(local.x)<.1){
    bottom.set(0,-.5,0).applyMatrix4(matrix);
    assert.ok(bottom.y<world.groundHeight(bottom.x,bottom.z),'stair must reach terrain');steps++;
   }
  }
 }
 assert.ok(steps>=world.roadsideSites.length*2);
});
test('near-detail batches release outside range without hiding building shells',()=>{
 world.camera.position.set(100000,100000,100000);world.scene.onBeforeRender(null,world.scene,world.camera);
 assert.equal(world.roadsideStats.visibleDetailBatches,0);
 assert.ok(world.scene.children.some(m=>m.name.startsWith('Roadside plaster|box|false')&&m.visible));
 assert.ok(world.roadsideStats.triangles<130000);
});
