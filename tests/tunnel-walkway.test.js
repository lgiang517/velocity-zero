import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CoastTrack} from '../src/track.js';
import {tunnelWalkwayGeometry,buildDetailedTunnel} from '../src/structures.js';

const track=new CoastTrack({legacy:true});

test('both tunnel walkways follow the road height and lateral frame through every section',()=>{
 for(const side of [-1,1]){
  const geometry=tunnelWalkwayGeometry(track,side),p=geometry.attributes.position;
  const {stations,inner,outer,bottom,ramp}=geometry.userData,start=stations[0],end=stations.at(-1);
  assert.ok(stations.length>100);
  let heightMin=Infinity,heightMax=-Infinity,turn=0;
  const first=track.sample(start);
  for(let i=0;i<stations.length;i++){
   const s=stations[i],q=track.sample(s),top=.04+.22*Math.min(1,(s-start)/ramp,(end-s)/ramp);
   const low=Math.min(side*inner,side*outer),high=Math.max(side*inner,side*outer);
   heightMin=Math.min(heightMin,q.p.y);heightMax=Math.max(heightMax,q.p.y);turn=Math.max(turn,first.right.angleTo(q.right));
   for(const [j,d,h] of [[0,low,bottom],[1,high,bottom],[2,high,top],[3,low,top]]){
    const actual=new THREE.Vector3().fromBufferAttribute(p,i*4+j),expected=track.point(s,d,h);
    assert.ok(actual.distanceTo(expected)<.0002,'section must remain on the sampled road frame');
    assert.ok(Math.abs(actual.clone().sub(q.p).dot(q.right))>=10.2998,'walkway must remain outside the driving surface');
   }
   if(i)assert.ok(s-stations[i-1]<=1.500001);
  }
  assert.ok(heightMax-heightMin>5,'real tunnel provides a meaningful slope fixture');
  assert.ok(turn>.1,'real tunnel provides a meaningful curved fixture');
 }
});

test('continuous walkway is a closed manifold with no degenerate triangles or flipped top faces',()=>{
 for(const side of [-1,1]){
  const geometry=tunnelWalkwayGeometry(track,side),p=geometry.attributes.position,indices=geometry.index.array,edges=new Map();
  for(let i=0;i<indices.length;i+=3){
   const ids=Array.from(indices.slice(i,i+3)),points=ids.map(id=>new THREE.Vector3().fromBufferAttribute(p,id));
   const normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
   assert.ok(normal.lengthSq()>1e-8,'all faces have nonzero area');
   if(ids.every(id=>id%4>=2))assert.ok(normal.y>0,'top faces face upward on both sides');
   for(let j=0;j<3;j++){
    const a=ids[j],b=ids[(j+1)%3],key=Math.min(a,b)+':'+Math.max(a,b);
    const edge=edges.get(key)||{count:0,direction:0};edge.count++;edge.direction+=a<b?1:-1;edges.set(key,edge);
   }
  }
  for(const edge of edges.values()){
   assert.equal(edge.count,2,'each edge is shared by exactly two faces, including the end caps');
   assert.equal(edge.direction,0,'shared face edges have opposite winding');
  }
 }
});

test('tunnel runtime installs only two swept walkway meshes and short portal ramps',()=>{
 const world={track,scene:new THREE.Scene()};buildDetailedTunnel(world);
 const walkways=world.scene.children.filter(o=>o.name.startsWith('Continuous tunnel walkway'));
 assert.equal(walkways.length,2);assert.equal(walkways[0].material,walkways[1].material);
 for(const mesh of walkways){
  const {stations}=mesh.geometry.userData,p=mesh.geometry.attributes.position;
  for(const i of [0,stations.length-1])assert.ok(Math.abs(p.getY(i*4+2)-track.sample(stations[i]).p.y-.04)<.0001);
  const i=Math.floor(stations.length/2);assert.ok(Math.abs(p.getY(i*4+2)-track.sample(stations[i]).p.y-.26)<.0001);
  assert.ok(mesh.castShadow&&mesh.receiveShadow);
 }
});
