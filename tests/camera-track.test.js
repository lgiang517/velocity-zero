import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CoastTrack} from '../src/track.js';
import {DrivingCamera,renderPose,snapshotPose} from '../src/driving-camera.js';

test('hairpin radius leaves room for the full road and its barrier',()=>{
 const track=new CoastTrack();let previous=null,peak=0;
 for(let s=0;s<=track.length;s+=.5){const tangent=track.curve.getTangentAt(Math.min(1,s/track.length));const heading=Math.atan2(tangent.x,tangent.z);if(previous!==null)peak=Math.max(peak,Math.abs(Math.atan2(Math.sin(heading-previous),Math.cos(heading-previous))/.5));previous=heading;}
 assert.ok(1/peak>30,`minimum centre radius ${1/peak}`);assert.ok(1-peak*8.4>.65,'inside road must not trigger the physics coordinate clamp');
});
test('render poses interpolate every car and cross the yaw wrap without spinning',()=>{
 const before={s:5,d:2,u:10,v:0,steer:.2,roll:.01,pitch:.02,yaw:Math.PI-.02};
 const after={...before,s:7,d:3,yaw:-Math.PI+.02};const p=renderPose(after,snapshotPose(before),.5);
 assert.equal(p.s,6);assert.equal(p.d,2.5);assert.ok(Math.abs(p.yaw-Math.PI)<1e-10);assert.deepEqual(before,{s:5,d:2,u:10,v:0,steer:.2,roll:.01,pitch:.02,yaw:Math.PI-.02});
});
test('driver camera stays in the same chassis position through slopes and mode changes',()=>{
 const camera=new THREE.PerspectiveCamera(),rig=new DrivingCamera(camera),root=new THREE.Group();
 const car={root,body:{},cockpit:{},setInterior(inside){this.cockpit.visible=inside;}},p={s:0,yaw:0},road={heading:0,right:new THREE.Vector3(1,0,0),tan:new THREE.Vector3(0,0,1)};
 for(const slope of[-.17,0,.17]){root.position.set(100,50,200);root.rotation.set(slope,.5,0);root.updateMatrixWorld();
  for(let i=0;i<3;i++){rig.update(1/60,car,p,road,'race',0,()=>0);rig.update(1/60,car,p,road,'race',1,()=>0);const local=root.worldToLocal(camera.position.clone());assert.ok(local.distanceTo(new THREE.Vector3(.35,1.03,-.40))<1e-10);assert.equal(camera.fov,67);assert.ok(car.cockpit.visible);}
 }
});
