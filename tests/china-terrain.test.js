import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CoastTrack} from '../src/track.js';
import {createChinaGround,buildChinaTerrain} from '../src/china-terrain.js';
import {chinaMountainMaterial} from '../src/china-mountain-material.js';
const track=new CoastTrack(),coast=(x,z)=>19+Math.sin(x*.01),world={track,scene:new THREE.Scene(),groundHeight:coast,uniforms:{}};
buildChinaTerrain(world);
test('extended landscape preserves original coastal heights and leaves the sea main span open',()=>{
 for(const p of [[0,0],[300,500],[1200,-300]])assert.equal(world.groundHeight(...p),coast(...p));
 for(const t of [.2,.4,.65]){const q=track.sample(track.sectionS('hzmb',t));assert.ok(world.groundHeight(q.p.x,q.p.z)<-18);}
 const island=world.chinaGround.island.position;assert.ok(world.groundHeight(island[0],island[2])>4);
 const q=track.sample(track.sectionS('sichuan',.5));assert.ok(q.p.y-world.groundHeight(q.p.x,q.p.z)>80);
});
test('rendered extension terrain and berms stay below the asphalt at metre-scale driving samples',()=>{
 world.scene.updateMatrixWorld(true);const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);let samples=0;
 for(let s=track.extensionStartS+5;s<track.extensionEndS-5;s+=27){const q=track.sample(s);for(const d of[-.96,-.5,0,.5,.96].map(f=>f*q.asphaltHalfWidth)){const p=track.point(s,d,800);ray.set(p,down);const hits=ray.intersectObjects(world.chinaTerrain.meshes,false);for(const hit of hits)assert.ok(hit.point.y<q.p.y+.10,`ground intrudes at ${s}/${d}: ${hit.point.y}>${q.p.y}`);samples++;}}
 assert.ok(samples>700);assert.ok(world.chinaTerrain.stats.triangles<150000);
});
test('static terrain tiles have finite bounds and independent frustum culling',()=>{
 for(const mesh of world.chinaTerrain.meshes){assert.equal(mesh.castShadow,false);assert.ok(mesh.geometry.boundingSphere.radius<1000);assert.ok(Number.isFinite(mesh.geometry.boundingSphere.radius));}
});


test('nearest-road search stays exact across spatial-index cell boundaries',()=>{
 const ground=world.chinaGround;
 for(const x of[-3760,-3520,-2880,-2480,-2240,-1760,-1440])for(const z of[-720.01,-719.99,-240.01,-239.99,-.01,.01,239.99,240.01]){
  let exact=Infinity;
  for(const line of ground.segments){const a=line.a.p,b=line.b.p,dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));exact=Math.min(exact,Math.hypot(x-a.x-t*dx,z-a.z-t*dz));}
  assert.ok(Math.abs(ground.nearest(x,z).distance-exact)<1e-7,`nearest road differs at ${x},${z}`);
 }
 assert.ok(Math.abs(ground.height(-2480,-.01)-ground.height(-2480,.01))<.05,'the previous 55m cliff across a hash-cell boundary must not return');
});

test('mountain tiles share continuous lighting and retain vegetated low slopes',()=>{
 const edges=new Map();let duplicates=0,green=0,rock=0;
 for(const mesh of world.chinaTerrain.meshes.filter(m=>m.name.startsWith('China landscape'))){const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal,d=mesh.geometry.attributes.mountainData;
  for(let i=0;i<p.count;i++){
   const key=p.getX(i)+':'+p.getZ(i),previous=edges.get(key),current=[p.getY(i),n.getX(i),n.getY(i),n.getZ(i)];
   if(previous){assert.deepEqual(current,previous,'tile boundary normals and elevations must match');duplicates++;}else edges.set(key,current);
   if(p.getY(i)>15&&n.getY(i)>.96&&d.getX(i)>.6)green++;
   if(n.getY(i)<.68){assert.ok(d.getX(i)<.2,'steep cuttings must reveal rock');rock++;}
  }
 }
 assert.ok(duplicates>1000);assert.ok(green>500);assert.ok(rock>50);
 assert.equal(world.chinaTerrain.stats.perFrameUpdates,0);assert.equal(world.chinaTerrain.stats.tiles,157);
});


test('Duku and connector banks meet continuously at both named section ends',()=>{
 const section=track.section('duku');
 for(const station of[section.startS,section.endS])for(const lateral of[-90,-60,-40,40,60,90]){
  const a=track.point(station-.1,lateral),b=track.point(station+.1,lateral);
  assert.ok(Math.abs(world.groundHeight(a.x,a.z)-world.groundHeight(b.x,b.z))<2,`section bank jumps at ${station}/${lateral}`);
 }
});


test('coarse-pointer mountain shader uses four texture reads and no fragment hash noise',()=>{
 const original=globalThis.matchMedia;
 try{
  for(const coarse of[false,true]){
   globalThis.matchMedia=()=>({matches:coarse});const wet={value:.4},material=chinaMountainMaterial({quality:'balanced',uniforms:{wet}}),shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
   material.onBeforeCompile(shader);
   assert.equal((shader.fragmentShader.match(/texture2D\(uChina/g)||[]).length,coarse?4:7);
   assert.equal(shader.fragmentShader.includes('chinaNoise('),false);assert.equal(shader.fragmentShader.includes('chinaHash('),false);assert.ok(shader.vertexShader.includes('vMountainWarp=vec3(chinaNoise'));
   assert.equal(shader.uniforms.uChinaWet,wet);assert.equal(material.userData.textureSamples,coarse?4:7);assert.ok(material.customProgramCacheKey().endsWith(coarse?'coarse':'desktop'));material.dispose();
  }
 }finally{if(original===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=original;}
});
