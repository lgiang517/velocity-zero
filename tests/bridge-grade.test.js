import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CoastTrack} from '../src/track.js';
import {addBridgeDetail} from '../src/structures.js';

test('bridge deck follows the road grade and stays beneath the driving surface',()=>{
 const track=new CoastTrack(),scene=new THREE.Scene();addBridgeDetail({track,scene});
 const deck=scene.children[0],m=new THREE.Matrix4();let steep=0;
 for(let i=0;i<deck.count;i++){
  const s=track.length*.90+i*12,q=track.sample(s);deck.getMatrixAt(i,m);
  const forward=new THREE.Vector3(0,0,1).transformDirection(m);assert.ok(forward.dot(q.tan)>.999999);
  if(Math.abs(q.tan.y)>.08)steep++;
  for(const z of[-.5,0,.5]){
   const top=new THREE.Vector3(0,.5,z).applyMatrix4(m);
   const road=track.sample(s+z*12.3).p;
   assert.ok(top.y<road.y-.08,`deck segment ${i} protrudes above road near ${s}`);
  }
 }
 assert.ok(steep>10,'exercise sloping spans rather than a flat fixture');
});
