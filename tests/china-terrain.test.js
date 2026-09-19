import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CoastTrack} from '../src/track.js';
import {createChinaGround,buildChinaTerrain} from '../src/china-terrain.js';
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
