import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readVehicleAssembly,createDriverExterior,driverExteriorRole,createDriverGlazingMaterial} from '../src/vehicle-assembly.js';
import {createCockpit} from '../src/cockpit.js';
import {createWindscreenLandingGeometry,createDashShellGeometry,createAPillarJunctionGeometry,DASH_HALF_WIDTH,dashFrontPoint} from '../src/cabin-junctions.js';

async function load(file){const b=fs.readFileSync(file);return (await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene;}
function cockpit(assembly){
 const context=new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),createLinearGradient:()=>({addColorStop(){}})},{get:(o,k)=>o[k]||(()=>{})});
 const previous=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>context})};
 try{return createCockpit({assembly});}finally{globalThis.document=previous;}
}
function opaqueMeshes(root){const list=[];root.traverse(m=>{if(m.isMesh&&(Array.isArray(m.material)?m.material:[m.material]).every(p=>!p.transparent&&!/glass/i.test(p.name)))list.push(m);});return list;}
const asset=process.env.VEHICLE_REBUILD_GLB||'public/models/solstice-lux-gt.glb',source=await load(asset),hasAssembly=readVehicleAssembly(source).fromExtras;
const eye=new THREE.Vector3(.35,1.03,-.40),oldLeaks=[[-1.001998,.781674,1.600959],[-1.025604,.781852,1.556058],[-.682767,.897268,.918597]];

// The importer normalizes node names; a role stored under a Blender display name
// must survive that import instead of silently dropping an opaque window frame.
test('driver exterior roles survive GLTF node-name normalization and nested material primitives',()=>{
 const parent=new THREE.Group();parent.name='Window_windscreen';const child=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());child.name='Window_windscreen_1';parent.add(child);
 const a={fromExtras:true,roles:{'Window windscreen':{driverVisibleExterior:true}}};
 assert.equal(driverExteriorRole(child,a),true);child.userData.driverVisibleExterior=false;assert.equal(driverExteriorRole(child,a),false);child.geometry.dispose();child.material.dispose();
});

test('assembly metadata is scaled once while structural copies remain in the rigid driving frame',{skip:!hasAssembly},()=>{
 const body=source.clone(true),frame=new THREE.Group();frame.position.set(100,2,-83);frame.rotation.y=.71;frame.add(body);body.scale.set(.96,1.03,1.06);frame.updateMatrixWorld(true);
 const canonical=readVehicleAssembly(body,{scale:new THREE.Vector3(1,1,1)}),a=readVehicleAssembly(body),driver=createDriverExterior(body,a);
 const lo=canonical.windscreenLower[0];assert.deepEqual(a.windscreenLower[0],lo.map((v,i)=>v*body.scale.toArray()[i]));
 const original=[];body.traverse(o=>{if(o.isMesh&&driverExteriorRole(o,a))original.push(o);});assert.ok(original.length>=4);assert.equal(driver.children.length,original.length);
 for(let i=0;i<original.length;i++){
  const expected=frame.matrixWorld.clone().invert().multiply(original[i].matrixWorld);driver.children[i].updateMatrix();
  assert.ok(expected.elements.every((v,j)=>Math.abs(v-driver.children[i].matrix.elements[j])<1e-9));
 }
});

test('shared dash and landing close their common edge; pillar foot is capped without a low hanging flange',{skip:!hasAssembly},()=>{
 const a=readVehicleAssembly(source),dash=createDashShellGeometry(a),landing=createWindscreenLandingGeometry(a);
 try{
  for(let col=0;col<=24;col++){
   const p=new THREE.Vector3().fromBufferAttribute(dash.attributes.position,col*48),q=new THREE.Vector3().fromBufferAttribute(landing.attributes.position,col);assert.ok(p.distanceTo(q)<1e-7);
  }
  for(const side of[-1,1]){
   const g=createAPillarJunctionGeometry(a,side),edges=new Map(),p=g.attributes.position,index=g.index;
   try{
    let volume=0;for(let i=0;i<index.count;i+=3){const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];
     const v=ids.map(j=>new THREE.Vector3().fromBufferAttribute(p,j));assert.ok(v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).length()>1e-10,'collapsed pillar triangle');volume+=v[0].dot(v[1].clone().cross(v[2]));
     for(let j=0;j<3;j++){const key=[ids[j],ids[(j+1)%3]].sort((x,y)=>x-y).join(':');edges.set(key,(edges.get(key)||0)+1);}
    }
    assert.ok(volume>0);for(const n of edges.values())assert.equal(n,2,'open pillar edge');
    const floor=a.fixedCorners[side<0?'left':'right'].doorFrontUpper[1]-.012;
    for(const point of g.userData.junction.base)assert.ok(point[1]>=floor,'pillar extends below the fixed door corner');
   }finally{g.dispose();}
  }
 }finally{dash.dispose();landing.dispose();}
});

for(const [id,scale]of[['gt',[1,1,1]],['light',[.96,1,.95]],['muscle',[1,1.03,1.06]]])test(`${id}: original eye has no known front-quarter leaks and continuous opaque coverage`,{skip:!hasAssembly},()=>{
 const body=source.clone(true),frame=new THREE.Group();frame.add(body);body.scale.set(...scale);frame.updateMatrixWorld(true);
 const a=readVehicleAssembly(body),local=readVehicleAssembly(body,{scale:new THREE.Vector3(1,1,1)}),c=cockpit(local),driver=createDriverExterior(body,a);
 c.root.scale.copy(body.scale);driver.add(c.root);const g=createWindscreenLandingGeometry(local);g.scale(...scale);const mat=new THREE.MeshBasicMaterial(),landing=new THREE.Mesh(g,mat);driver.add(landing);driver.updateMatrixWorld(true);
 try{
  const full=opaqueMeshes(body),visible=opaqueMeshes(driver),camera=new THREE.PerspectiveCamera(67,1.5,.04,2400);camera.position.copy(eye);camera.lookAt(.35,1.03,32);camera.updateMatrixWorld(true);
  for(const target of oldLeaks)assert.ok(new THREE.Raycaster(eye,new THREE.Vector3(...target).sub(eye).normalize(),0,5).intersectObjects(visible).length,`known audit leak ${target}`);
  const ray=new THREE.Raycaster();ray.far=5;let expected=0,missing=[];
  // Scan both quarter panels and the actual windscreen lower band, including the
  // previously uncovered passenger side. Transparent glass never counts as closure.
  for(let y=520;y<=640;y+=12)for(let x=80;x<=1360;x+=12){
   ray.setFromCamera(new THREE.Vector2(x/1440*2-1,1-y/960*2),camera);const hit=ray.intersectObjects(full,false)[0];
   if(!hit||hit.point.z<.622*scale[2]||hit.point.z>2.4*scale[2]||hit.point.y<.65||hit.point.y>1.01)continue;
   expected++;if(!ray.intersectObjects(visible,false).length)missing.push({pixel:[x,y],part:hit.object.name});
  }
  assert.ok(expected>500,'insufficient actual-body coverage');assert.deepEqual(missing,[]);
  for(const x of[-.30,0,.30])assert.equal(new THREE.Raycaster(eye,new THREE.Vector3(x,0,1).normalize(),0,5).intersectObjects(visible).length,0,'opaque structure blocks the road horizon');
 }finally{c.dispose();g.dispose();mat.dispose();}
});

const baseline='output/vehicle-rebuild/baseline/solstice-lux-gt.glb';
test('frozen pre-repair asset reproduces all three measured passenger-side gaps',{skip:!fs.existsSync(baseline)},async()=>{
 const old=await load(baseline),hood=old.getObjectByName('Driver_hood').clone(true),c=cockpit(null),visible=new THREE.Group();visible.add(hood,c.root);visible.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(hood),r=new THREE.Raycaster();
 const sample=(x,z)=>{r.set(new THREE.Vector3(THREE.MathUtils.clamp(x,bounds.min.x+.002,bounds.max.x-.002),bounds.max.y+.2,z),new THREE.Vector3(0,-1,0));const hit=r.intersectObject(hood,true)[0],height=(hit?.point.y??bounds.max.y)-.0002,extent=x<0?-bounds.min.x:bounds.max.x;return THREE.MathUtils.lerp(height,dashFrontPoint(x).y+.006,THREE.MathUtils.smoothstep(Math.abs(x),extent-.020,DASH_HALF_WIDTH));};
 const g=createWindscreenLandingGeometry(sample),mat=new THREE.MeshBasicMaterial();visible.add(new THREE.Mesh(g,mat));visible.updateMatrixWorld(true);
 try{const meshes=opaqueMeshes(visible);for(const target of oldLeaks)assert.equal(new THREE.Raycaster(eye,new THREE.Vector3(...target).sub(eye).normalize(),0,5).intersectObjects(meshes).length,0,`baseline no longer reproduces ${target}`);}finally{c.dispose();g.dispose();mat.dispose();}
});


test('driver glazing is independently blended, low-reflection standard glass with no exterior shader hook',()=>{
 const glass=createDriverGlazingMaterial();try{
  assert.equal(glass.isMeshStandardMaterial,true);assert.equal(glass.isMeshPhysicalMaterial,undefined);
  assert.equal(glass.transparent,true);assert.equal(glass.depthWrite,false);assert.equal(glass.forceSinglePass,true);assert.equal(glass.side,THREE.DoubleSide);
  assert.ok(glass.opacity>0&&glass.opacity<.10);assert.ok(glass.envMapIntensity<.15);
  assert.equal(glass.onBeforeCompile,THREE.Material.prototype.onBeforeCompile);
  assert.equal(glass.customProgramCacheKey,THREE.Material.prototype.customProgramCacheKey);
 }finally{glass.dispose();}
});


test('vent backing plates stay ahead of the actual curved fascia over their whole opening',{skip:!hasAssembly},()=>{
 const a=readVehicleAssembly(source),c=cockpit(a),dash=new THREE.Mesh(createDashShellGeometry(a),new THREE.MeshBasicMaterial({side:THREE.DoubleSide})),ray=new THREE.Raycaster();
 try{
  assert.equal(c.root.userData.ventPlacements.length,4);
  for(const {x,y,z,width}of c.root.userData.ventPlacements){
   for(const dx of[-width*.4,0,width*.4])for(const dy of[-.016,0,.016]){
    ray.set(new THREE.Vector3(x+dx,y+dy,0),new THREE.Vector3(0,0,1));const hit=ray.intersectObject(dash)[0];
    assert.ok(hit&&z-.017<hit.point.z-.006,`dashboard swallows vent backing at ${x+dx},${y+dy}`);
   }
  }
 }finally{c.dispose();dash.geometry.dispose();dash.material.dispose();}
});
