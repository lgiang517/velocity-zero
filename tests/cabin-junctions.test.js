import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {DASH_HALF_WIDTH,DASH_END_CAP_WIDTH,dashFrontPoint,dashSectionPoint,createDashShellGeometry,createDashEndCapGeometry,createWindscreenLandingGeometry} from '../src/cabin-junctions.js';

const v=(p,i)=>new THREE.Vector3().fromBufferAttribute(p,i);
test('windscreen landing and dash use identical front boundary vertices',()=>{
 const dash=createDashShellGeometry(),landing=createWindscreenLandingGeometry();
 try{
  const a=dash.attributes.position,b=landing.attributes.position;
  // Every transverse station is the actual vertex on the upholstered shell.
  for(let i=0;i<=24;i++)assert.ok(v(a,i*48).distanceTo(v(b,i))<1e-7);
 }finally{dash.dispose();landing.dispose();}
});
test('windscreen landing cannot cross the padded dash in plan or reproduce the old z=1.01 crossing',()=>{
 const dash=createDashShellGeometry(),landing=createWindscreenLandingGeometry();
 try{
  for(const p of [dash.attributes.position])for(let i=0;i<25*48;i++)assert.ok(p.getZ(i)<=dashFrontPoint(p.getX(i)).z+1e-6);
  const p=landing.attributes.position;
  for(let i=0;i<p.count;i++)assert.ok(p.getZ(i)>=dashFrontPoint(p.getX(i)).z-1e-6);
  const mesh=new THREE.Mesh(landing,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld();
  for(const z of [1.01,1.02]){
   const ray=new THREE.Raycaster(new THREE.Vector3(.65,1.5,z),new THREE.Vector3(0,-1,0));assert.equal(ray.intersectObject(mesh).length,0);
  }
  mesh.material.dispose();
 }finally{dash.dispose();landing.dispose();}
});
test('dash end trims share their inner edge and leave at least a 5 mm door assembly gap',()=>{
 for(const side of[-1,1]){
  const g=createDashEndCapGeometry(side),p=g.attributes.position;
  try{
   for(let j=0;j<48;j++)assert.ok(v(p,j).distanceTo(dashSectionPoint(side*DASH_HALF_WIDTH,j/48))<1e-7);
   for(let i=0;i<p.count;i++)assert.ok(Math.abs(p.getX(i))<=.819-.005+1e-7);
   assert.ok(Math.abs(DASH_HALF_WIDTH+DASH_END_CAP_WIDTH-.814)<1e-9);
   // The exposed outer end cap must face the side door, not the cabin void.
   const idx=g.index,tri=idx.count-3,a=v(p,idx.getX(tri)),b=v(p,idx.getX(tri+1)),c=v(p,idx.getX(tri+2));
   assert.ok(b.sub(a).cross(c.sub(a)).x*side>0);
  }finally{g.dispose();}
 }
});
test('landing top faces upward with finite normals and clears the unchanged driving horizon',()=>{
 const g=createWindscreenLandingGeometry(),p=g.attributes.position,n=g.attributes.normal;
 try{
  for(let i=0;i<n.count;i++)assert.ok(Number.isFinite(n.getX(i)+n.getY(i)+n.getZ(i)));
  for(let i=0;i<10*24*6;i+=3){const a=v(p,g.index.getX(i)),b=v(p,g.index.getX(i+1)),c=v(p,g.index.getX(i+2));assert.ok(b.sub(a).cross(c.sub(a)).y>0);}
  for(let i=0;i<p.count;i++)assert.ok(p.getY(i)<.91);
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),mesh=new THREE.Mesh(g,material);mesh.updateMatrixWorld();
  const eye=new THREE.Vector3(.35,1.03,-.4);
  for(const x of[-.3,0,.3])assert.equal(new THREE.Raycaster(eye,new THREE.Vector3(x,0,1).normalize()).intersectObject(mesh).length,0);
  material.dispose();
 }finally{g.dispose();}
});

test('landing terminates at the supplied bonnet surface and blocks the former under-bonnet slit',()=>{
 const surface=(x,z)=>.8945-.012*x*x-.02*(z-1.42),g=createWindscreenLandingGeometry(surface);
 const p=g.attributes.position,material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),mesh=new THREE.Mesh(g,material);mesh.updateMatrixWorld();
 try{
  for(let col=0;col<=24;col++){const i=10*25+col;assert.ok(Math.abs(p.getY(i)-surface(p.getX(i),p.getZ(i)))<1e-7);}
  const eye=new THREE.Vector3(.35,1.03,-.40);
  for(const x of[-.50,0,.35,.65])for(const y of[.850,.865,.880]){
   const ray=new THREE.Raycaster(eye,new THREE.Vector3(x,y,1.04).sub(eye).normalize());assert.ok(ray.intersectObject(mesh).length>0,`under-bonnet sightline ${x},${y}`);
  }
 }finally{material.dispose();g.dispose();}
});
