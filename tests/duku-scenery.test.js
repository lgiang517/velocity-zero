import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CoastTrack} from '../src/track.js';
import {buildCoastalTerrain} from '../src/terrain.js';
import {buildChinaTerrain} from '../src/china-terrain.js';
import {buildDukuScenery,createDukuLandforms} from '../src/duku-scenery.js';
const world={scene:new THREE.Scene(),track:new CoastTrack(),uniforms:{}};
buildCoastalTerrain(world);buildChinaTerrain(world);
const routeBaseline=world.track.samples.map(q=>q.p.toArray()),heights=[[.1,0],[.27,24],[.48,-45],[.8,100]].map(([f,l])=>{const p=world.track.point(world.track.sectionS('duku',f),l);return[p.x,p.z,world.groundHeight(p.x,p.z)];});
const scene=buildDukuScenery(world),section=world.track.section('duku');

test('Duku reconstruction follows the new 2.5km four-hairpin road, not an old fraction',()=>{
 assert.ok(section.length>2400&&section.length<2700);assert.equal(section.hairpins.length,4);assert.equal(scene.section.startS,section.startS);
 assert.ok(scene.landforms.bounds[2]<-600);assert.ok(scene.meshes.every(m=>m.geometry.boundingBox.max.x<0));
 assert.deepEqual(scene.features.referenceFeatures,['four-hairpins','rock-cut-and-gorge','snow-walls','314m-open-avalanche-gallery','snow-filled-gullies']);
 assert.equal(scene.views.length,5);for(const view of scene.views){assert.ok(view.s>section.startS&&view.s<section.endS);assert.ok(view.eye.every(Number.isFinite));}
});

test('the real-feature module stays static and below the 40k source triangle budget',()=>{
 assert.ok(scene.stats.triangles<40000);assert.ok(scene.stats.batches<40);assert.equal(scene.stats.galleryMetres,314);assert.equal(scene.stats.snowWallMetres,256);assert.ok(scene.stats.snowVertices>400);assert.ok(scene.stats.markers>60);
 assert.equal(scene.stats.newAssetDownloads,0);assert.equal(scene.stats.perFrameUpdates,0);assert.equal(typeof scene.update,'undefined');
 for(const mesh of scene.meshes){assert.equal(mesh.castShadow,false);assert.equal(mesh.receiveShadow,false);assert.ok(mesh.frustumCulled);assert.ok(mesh.geometry.boundingSphere);}
});

test('every vertex and triangle centre preserves the full road driving envelope',()=>{
 let checked=0;
 function clear(x,y,z,name){const q=scene.landforms.nearestRoad(x,z);if(q.distance<10.6)assert.ok(y<q.y-.08||y>q.y+6.10,`${name} road clearance: d=${q.distance.toFixed(2)},dy=${(y-q.y).toFixed(2)}`);checked++;}
 for(const mesh of scene.meshes){const p=mesh.geometry.attributes.position,indices=mesh.geometry.index;
  for(let i=0;i<p.count;i++){assert.ok(Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)));clear(p.getX(i),p.getY(i),p.getZ(i),mesh.name);}
  for(let i=0;i<(indices?.count??p.count);i+=3){const a=indices?indices.getX(i):i,b=indices?indices.getX(i+1):i+1,c=indices?indices.getX(i+2):i+2;clear((p.getX(a)+p.getX(b)+p.getX(c))/3,(p.getY(a)+p.getY(b)+p.getY(c))/3,(p.getZ(a)+p.getZ(b)+p.getZ(c))/3,mesh.name);}
 }
 assert.ok(checked>40000);
});

test('the gallery is 314m long, with open valley piers and no road-level cross wall',()=>{
 const gallery=scene.features.gallery,piers=scene.sourceItems.filter(p=>p.kind==='gallery-open-pier'),walls=scene.sourceItems.filter(p=>p.kind==='gallery-mountain-wall');
 assert.equal(gallery.endS-gallery.startS,314);assert.ok(piers.length>=38);assert.ok(walls.length>=100);
 assert.ok(piers.every(p=>p.lateral>11.5));assert.ok(walls.every(p=>p.lateral< -11.5));
 for(const item of [...piers,...walls])assert.ok(item.position[1]-item.size[1]/2<world.track.sample(item.s).p.y-.2,'supports penetrate the rendered verge');
 const roof=scene.meshes.find(m=>m.userData.source.kind==='gallery-roof'),position=roof.geometry.attributes.position,index=roof.geometry.index,a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
 a.fromBufferAttribute(position,index.getX(0));b.fromBufferAttribute(position,index.getX(1));c.fromBufferAttribute(position,index.getX(2));assert.ok(b.sub(a).cross(c.sub(a)).y<0,'ceiling is visible from the road, not culled inside-out');
});

test('snow-wall cut faces point at drivers and their tapered ends are grounded',()=>{
 for(const mesh of scene.meshes.filter(m=>m.userData.source.kind==='snow-wall')){
  const p=mesh.geometry.attributes.position,n=p.count/6-1,side=mesh.userData.source.side,start=mesh.userData.source.startS,end=mesh.userData.source.endS;
  for(const row of[0,n])for(let j=0;j<5;j++){const i=row*6+j,s=row===0?start:end;assert.ok(Math.abs(p.getY(i)-(world.track.sample(s).p.y-.35))<.001,'snow cut ends taper to the verge');}
  const index=mesh.geometry.index,row=Math.floor(n/2),k=row*5*6,a=new THREE.Vector3().fromBufferAttribute(p,index.getX(k)),b=new THREE.Vector3().fromBufferAttribute(p,index.getX(k+1)),c=new THREE.Vector3().fromBufferAttribute(p,index.getX(k+2)),normal=b.sub(a).cross(c.sub(a)).normalize();
  const right=world.track.sample((start+end)/2).right;assert.ok(normal.dot(right)*side<-.7,'vertical snow face must face inward toward the road');
 }
});

test('landform skirts match the base and cannot bury adjacent switchback shelves',()=>{
 const [minX,minZ,maxX,maxZ]=scene.landforms.bounds;
 for(const [x,z]of [[minX,minZ],[maxX,minZ],[minX,maxZ],[maxX,maxZ],[(minX+maxX)/2,minZ]]){const base=world.groundHeight(x,z);assert.ok(scene.landforms.heightAt(x,z,base)<=base+.001);}
 for(let s=section.startS;s<section.endS;s+=19)for(const lateral of[-14,-10,0,10,14]){const p=world.track.point(s,lateral),base=world.groundHeight(p.x,p.z);assert.ok(scene.landforms.heightAt(p.x,p.z,base)<=base+.001);}
 const expected=scene.features.summits;assert.equal(expected.length,3);for(const [x,y,z]of expected){assert.ok(scene.landforms.nearestRoad(x,z).distance>200);assert.ok(y>430&&y<550);}
 assert.ok(scene.stats.maxMountainHeight>430&&scene.stats.maxMountainHeight<525);
});

test('building the scenery preserves the new route physics and base height field',()=>{
 assert.deepEqual(world.track.samples.map(q=>q.p.toArray()),routeBaseline);for(const [x,z,y]of heights)assert.equal(world.groundHeight(x,z),y);
 const legacy={scene:new THREE.Scene(),track:new CoastTrack({legacy:true}),uniforms:{}};assert.equal(createDukuLandforms(legacy.track),null);assert.equal(buildDukuScenery(legacy).stats.enabled,false);
});

test('high mountain snow is patchy, and steep cuttings retain exposed rock',()=>{
 let high=0,snow=0,bare=0,steep=0;
 for(const mesh of scene.meshes.filter(m=>m.userData.source.kind==='landform')){const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal,d=mesh.geometry.attributes.mountainData;
  for(let i=0;i<p.count;i++){
   if(p.getY(i)>330){high++;if(d.getY(i)>.6)snow++;if(d.getY(i)<.25)bare++;}
   if(n.getY(i)<.7){steep++;assert.ok(d.getX(i)<.15,'a steep cliff must not be grass-coated');}
  }
 }
 assert.ok(high>1000&&steep>1000);assert.ok(snow/high>.10&&snow/high<.65,'snow should collect in lee patches, not bleach whole summits');assert.ok(bare/high>.20,'wind-exposed ribs remain bare');
});

test('rendered outer mountain skirts stay embedded in the actual coarse base mesh',()=>{
 const [minX,minZ,maxX,maxZ]=scene.landforms.bounds,ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0),land=scene.meshes.filter(m=>m.userData.source.kind==='landform');let checked=0;
 world.scene.updateMatrixWorld(true);
 const check=(x,z)=>{ray.set(new THREE.Vector3(x,1000,z),down);const lower=ray.intersectObjects(world.chinaTerrain.meshes,false)[0],upper=ray.intersectObjects(land,false)[0];if(lower&&upper){assert.ok(upper.point.y<=lower.point.y+.1,`floating skirt ${x},${z}: ${upper.point.y-lower.point.y}`);checked++;}};
 for(let x=minX+.03;x<maxX-.03;x+=10){check(x,minZ+.03);check(x,maxZ-.03);}
 for(let z=minZ+.03;z<maxZ-.03;z+=10){check(minX+.03,z);check(maxX-.03,z);}
 assert.ok(checked>200);
});

test('all Duku-owned geometry is disposed without removing existing terrain',()=>{
 const existing=world.scene.children.find(m=>!m.userData.dukuScenery);let releases=0,sharedReleased=false;world.chinaMountainMaterial.addEventListener('dispose',()=>sharedReleased=true);for(const mesh of scene.meshes)mesh.geometry.addEventListener('dispose',()=>releases++);scene.dispose();assert.equal(releases,scene.meshes.length);assert.equal(sharedReleased,false);assert.ok(world.scene.children.includes(existing));assert.ok(scene.meshes.every(m=>!world.scene.children.includes(m)));
});
