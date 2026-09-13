import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCockpit} from '../src/cockpit.js';
function make(){
 const context=new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),createLinearGradient:()=>({addColorStop(){}})},{get:(o,k)=>o[k]||(()=>{})});
 const previous=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>context})};
 try{return createCockpit();}finally{globalThis.document=previous;}
}
test('tailored seams share two draw calls and retain the exact cabin mesh budget',()=>{
 const c=make();try{
  const seams=[];let draw=0;c.root.traverse(o=>{if(o.isMesh||o.isLine)draw++;if(o.isLineSegments)seams.push(o);});
  assert.equal(seams.length,2);assert.equal(draw,19);assert.equal(c.root.userData.cockpit.triangles,46362);assert.equal(c.root.userData.cockpit.textures,4);
  const seam=seams.find(o=>o.parent===c.root),positions=seam.geometry.attributes.position;
  assert.ok(positions.count>500);
  for(let i=0;i<positions.count;i+=2){const a=new THREE.Vector3().fromBufferAttribute(positions,i),b=new THREE.Vector3().fromBufferAttribute(positions,i+1);assert.ok(a.distanceTo(b)<=.003001);}
 }finally{c.dispose();}
});
test('added finish texture is shared and every owned resource is disposed once',()=>{
 const c=make(),resources=new Set();c.root.traverse(o=>{if(o.geometry)resources.add(o.geometry);if(o.material){resources.add(o.material);for(const value of Object.values(o.material))if(value?.isTexture)resources.add(value);}});
 const counts=new Map();for(const resource of resources){counts.set(resource,0);resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)+1));}
 c.dispose();for(const count of counts.values())assert.equal(count,1);
});
test('driver eye and wheel controls remain unchanged',()=>{
 const c=make();try{
  assert.deepEqual(c.steeringWheel.position.toArray(),[.35,.78,.17]);assert.equal(c.root.visible,false);c.root.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(new THREE.Vector3(.35,1.03,-.40),new THREE.Vector3(0,0,1));const meshes=[];c.root.traverse(o=>{if(o.isMesh)meshes.push(o);});assert.equal(ray.intersectObjects(meshes,false).length,0);
  c.update({steer:.1},.016);assert.equal(c.steeringWheel.rotation.z,-.5);
 }finally{c.dispose();}
});
