import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCoastalHeightTexture,createOceanGeometry,buildCoastalOcean} from '../src/ocean.js';

test('coastal height samples preserve centimetre accuracy including byte boundaries',()=>{
 const heights=[-14,-4.1,-4,-3.99,-2,0,19.4,210.75];
 const positions=heights.flatMap((h,i)=>[i,h,0]);
 const field=createCoastalHeightTexture(positions,heights.length,1,[0,0,7,1]);
 const data=field.texture.image.data;
 const decode=(r,g)=>(r*256+g)*512/65535-32;
 for(let i=0;i<heights.length;i++)assert.ok(Math.abs(decode(data[i*4],data[i*4+1])-heights[i])<.004);
 // Filtering across a high-byte carry must not produce a spurious coastline.
 for(let i=0;i<heights.length-1;i++)for(const mix of [.1,.5,.9]){
  const h=decode(data[i*4]*(1-mix)+data[(i+1)*4]*mix,data[i*4+1]*(1-mix)+data[(i+1)*4+1]*mix);
  assert.ok(Math.abs(h-(heights[i]*(1-mix)+heights[i+1]*mix))<.004);
 }
 assert.equal(field.texture.magFilter,THREE.LinearFilter);assert.equal(data.byteLength,heights.length*4);
 field.texture.dispose();
});

test('adaptive sea grid is watertight, upward facing and covers the horizon',()=>{
 const g=createOceanGeometry(),p=g.attributes.position,index=g.index;
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
 let min=Infinity,max=-Infinity;
 for(let i=0;i<p.count;i++){assert.ok(Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)));min=Math.min(min,p.getX(i));max=Math.max(max,p.getX(i));}
 assert.equal(min,-8500);assert.equal(max,8500);
 for(let i=0;i<index.count;i+=3){a.fromBufferAttribute(p,index.getX(i));b.fromBufferAttribute(p,index.getX(i+1));c.fromBufferAttribute(p,index.getX(i+2));assert.ok(b.sub(a).cross(c.sub(a)).y>0);}
 assert.ok(index.count/3<=52000);g.dispose();
});

test('ocean follows the main view but retains shared weather and animation uniforms',()=>{
 const shared={time:{value:3},wet:{value:.7},night:{value:0},daylight:{value:1},sunDir:{value:new THREE.Vector3(0,1,0)}};
 const world={scene:new THREE.Scene(),uniforms:shared,camera:new THREE.PerspectiveCamera()};buildCoastalOcean(world);
 for(const key of Object.keys(shared))assert.equal(world.ocean.material.uniforms[key],shared[key]);
 const g=world.ocean.geometry,vertices=g.attributes.position.array.slice();
 world.camera.position.set(321,50,-345);world.ocean.onBeforeRender();
 assert.deepEqual(world.ocean.material.uniforms.oceanCenter.value.toArray(),[320,-352]);
 assert.deepEqual(g.attributes.position.array,vertices,'camera movement must not rebuild or upload the ocean grid');
 assert.ok(!('coastHeight' in shared),'water-specific uniforms must not leak into sky materials');
 g.dispose();world.ocean.material.uniforms.coastHeight.value.dispose();world.ocean.material.dispose();
});
