import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTireEffects} from '../src/tire-effects.js';

const flat={sample(s){return{p:new THREE.Vector3(0,3,s),right:new THREE.Vector3(1,0,0),curvature:0,heading:0,slope:0};}};
function carFixture(){return{grounding:{wheelContacts:[{x:-.9,z:-1.45},{x:.9,z:-1.45},{x:-.9,z:1.35},{x:.9,z:1.35}]}};}
function playerFixture(extra={}){return{s:100,d:2,u:35,v:0,slip:0,yaw:0,brake:1,...extra};}
function run(effect,player,car,seconds=1,hz=60,extra={}){for(let i=0;i<seconds*hz;i++){player.s+=player.u/hz;effect.update(1/hz,{player,car,...extra});}}

test('ordinary ABS braking creates no smoke; genuine dry sliding creates a soft non-additive bounded draw',()=>{
 const effects=createTireEffects(flat,{random:()=>.5}),car=carFixture(),player=playerFixture();
 run(effects,player,car);assert.equal(effects.stats.active,0);assert.equal(effects.root.visible,false);
 player.slip=.23;run(effects,player,car);assert.ok(effects.stats.smoke>0);assert.equal(effects.stats.mist,0);assert.equal(effects.stats.drawCalls,1);
 assert.equal(effects.root.material.blending,THREE.NormalBlending);assert.equal(effects.root.material.depthWrite,false);assert.equal(effects.stats.textures,0);assert.ok(effects.stats.active<=effects.stats.capacity);effects.dispose();
});

test('dry skid emission is time-based at 30, 60 and 120 fps; mobile pool is bounded',()=>{
 const totals=[];
 for(const hz of[30,60,120]){
  const effects=createTireEffects(flat,{coarse:true,random:()=>.5});run(effects,playerFixture({slip:.3}),carFixture(),3,hz);
  totals.push(effects.stats.emittedSmoke);assert.equal(effects.stats.capacity,64);assert.ok(effects.stats.active<=64);assert.equal(effects.root.geometry.instanceCount,64);effects.dispose();
 }
 assert.ok(Math.max(...totals)-Math.min(...totals)<=1,totals.join(', '));
});

test('wet driving sprays from tyres without smoke, then fully clears after stopping',()=>{
 const effects=createTireEffects(flat,{random:()=>.5}),car=carFixture(),player=playerFixture({slip:.25});run(effects,player,car,1,60,{wet:.9});
 assert.ok(effects.stats.mist>0);assert.equal(effects.stats.smoke,0);assert.equal(effects.stats.emittedSmoke,0);
 player.u=0;run(effects,player,car,2,60,{wet:.9});assert.equal(effects.stats.active,0);assert.equal(effects.root.visible,false);assert.equal(effects.stats.drawCalls,0);effects.dispose();
});

test('rear wheel emission follows authored track width, yaw and slope with no centre exhaust source',()=>{
 const slope={sample(s){return{p:new THREE.Vector3(0,10+s*.08,s),right:new THREE.Vector3(1,0,0),curvature:0,heading:0,slope:.08};}},effects=createTireEffects(slope,{random:()=>.5}),car=carFixture(),player=playerFixture({slip:.3,yaw:.25});
 // Two particles are emitted in this single update, one from each rear tyre.
 const delta=2/96;effects.update(delta,{player,car});const centres=effects.root.geometry.attributes.particleCentre,appearance=effects.root.geometry.attributes.appearance;
 assert.equal(effects.stats.active,2);const xs=[];
 for(let i=0;i<effects.stats.capacity;i++)if(appearance.getY(i)>0){
  xs.push(centres.getX(i));assert.ok(Math.abs(centres.getY(i)-(10+centres.getZ(i)*.08))<.3);assert.ok(centres.getZ(i)<player.s-1);
 }
 assert.equal(xs.length,2);const forwardX=Math.sin(player.yaw)/Math.hypot(1,.08),expectedSpacing=Math.cos(player.yaw)*1.8-forwardX*player.u*delta/2;assert.ok(Math.abs(xs[1]-xs[0]-expectedSpacing)<.001);
 const midpoint=(xs[0]+xs[1])/2;assert.ok(midpoint<player.d-.2,'rear axle rotates with yaw');effects.dispose();
});

test('a stopped effect does not resume a stale trail after a teleport or vehicle swap',()=>{
 const effects=createTireEffects(flat,{random:()=>.5}),car=carFixture(),player=playerFixture({slip:.3});run(effects,player,car);
 assert.ok(effects.stats.active>0);player.s+=500;player.slip=0;effects.update(1/60,{player,car});assert.equal(effects.stats.active,0);
 run(effects,player,car);player.slip=.3;run(effects,player,car);assert.ok(effects.stats.active>0);player.slip=0;effects.update(1/60,{player,car:carFixture()});assert.equal(effects.stats.active,0);effects.dispose();
});

test('inactivity stops emission, night and tunnel lighting keep smoke from glowing, disposal is idempotent',()=>{
 const effects=createTireEffects(flat,{random:()=>.5}),car=carFixture(),player=playerFixture({slip:.3}),scene=new THREE.Scene();scene.add(effects.root);
 run(effects,player,car);const emitted=effects.stats.emittedSmoke;
 run(effects,player,car,2,60,{active:false,night:1,tunnel:1});assert.equal(effects.stats.emittedSmoke,emitted);assert.equal(effects.stats.active,0);assert.ok(effects.root.material.uniforms.lightLevel.value<.2);
 let geometryDisposed=0,materialDisposed=0;effects.root.geometry.addEventListener('dispose',()=>geometryDisposed++);effects.root.material.addEventListener('dispose',()=>materialDisposed++);effects.dispose();effects.dispose();assert.equal(geometryDisposed,1);assert.equal(materialDisposed,1);assert.equal(scene.children.length,0);
});
