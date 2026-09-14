import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {readVehicleGeometry} from '../tools/validate-vehicle-rebuild.mjs';
import {validateRealSurfacing,nearestActualSurface,inspectSmoothSeamSample,smoothRearSeamsReport,tailHousingFitReport} from '../tools/validate-real-surfacing.mjs';

// Production acceptance is mandatory. An explicit candidate path supports the
// same independent gate before a reviewed asset is promoted to public/models.
const asset=process.env.REAL_SURFACING_GLB||'public/models/solstice-lux-gt.glb';
test('vehicle real surfacing passes independent final-corner acceptance',()=>{
 const report=validateRealSurfacing(asset);
 assert.ok(report.pass,JSON.stringify(report.checks,null,2));
});

test('missing metadata cannot certify any actual rear corner',()=>{
 const model={declaration:{},geometries:[]};
 assert.equal(smoothRearSeamsReport(model).pass,false);
 assert.equal(tailHousingFitReport(model).pass,false);
});

function cylinderFixture(kink=0,shadeKink=0){
 const r=.08,center=new THREE.Vector3(.95,.72,-2.2),geometries=[];
 const surface=(d,rotation=0)=>new THREE.Vector3(r*Math.sin(d/r),r*Math.cos(d/r),0).applyAxisAngle(new THREE.Vector3(0,0,1),rotation).sub(new THREE.Vector3(-r*Math.sin(rotation),r*Math.cos(rotation),0)).add(center);
 for(const [name,sign]of[['fixtureA',-1],['fixtureB',1]]){
  const rotation=sign>0?kink:0,points=[],normals=[],triangles=[];
  for(let row=0;row<2;row++)for(let i=0;i<=40;i++){
   const d=sign*.001*i;points.push(surface(d,rotation).add(new THREE.Vector3(0,0,row*.02-.01)));
   normals.push(new THREE.Vector3(Math.sin(d/r),Math.cos(d/r),0).applyAxisAngle(new THREE.Vector3(0,0,1),rotation+(sign>0?shadeKink:0)));
  }
  for(let i=0;i<40;i++)for(let ids of [[i,i+1,i+42],[i,i+42,i+41]]){
   if(sign>0)ids=ids.toReversed();const [a,b,c]=ids.map(j=>points[j]);const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
   triangles.push({ids,a,b,c,normal,area:1,index:triangles.length,box:new THREE.Box3().setFromPoints([a,b,c])});
  }
  geometries.push({name,material:'Paint',points,normals,triangles,box:new THREE.Box3().setFromPoints(points)});
 }
 const sample={point:center.toArray(),a1:surface(-.003).toArray(),a2:surface(-.008).toArray(),b1:surface(.003,kink).toArray(),b2:surface(.008,kink).toArray()};
 return {model:{geometries},seam:{panelA:'fixtureA',panelB:'fixtureB'},sample};
}
test('curved C1 surface is accepted despite more than three degrees of near-side turning',()=>{
 const f=cylinderFixture(),result=inspectSmoothSeamSample(f.model,f.seam,f.sample,0);
 assert.ok(2*THREE.MathUtils.radToDeg(.003/.08)>3);
 assert.ok(result.pass,JSON.stringify(result));
 assert.ok(result.shadingLimitJumpDeg<.1);
});
test('real geometry kink fails independently of matching boundary positions',()=>{
 const f=cylinderFixture(THREE.MathUtils.degToRad(25)),result=inspectSmoothSeamSample(f.model,f.seam,f.sample,0);
 assert.ok(result.boundarySeparationM<1e-6);
 assert.ok(result.errors.includes('Geometric tangent limits disagree'),JSON.stringify(result));
});
test('wrong exported normals fail even when actual geometry is smooth',()=>{
 const f=cylinderFixture(0,THREE.MathUtils.degToRad(25)),result=inspectSmoothSeamSample(f.model,f.seam,f.sample,0);
 assert.ok(result.errors.includes('Shading normal limits disagree'),JSON.stringify(result));
});
test('dishonest metadata displaced from the exported triangles is rejected',()=>{
 const f=cylinderFixture();f.sample.point[1]+=.01;
 const result=inspectSmoothSeamSample(f.model,f.seam,f.sample,0);
 assert.ok(result.errors.includes('Declared common boundary misses actual surface'));
});

const legacyPath='output/vehicle-rebuild/failed-f2bd240/solstice-lux-gt.glb';
test('frozen 9a7a legacy mesh demonstrates an actual outer rear termination gap',{skip:!fs.existsSync(legacyPath)},()=>{
 const model=readVehicleGeometry(legacyPath);
 assert.equal(model.sha256,'9a7a3aff48dd824b4485f8c881f9b21863a7625447cf03ae746e54533f98114b');
 // Captured actual rear-deck corner, not a regenerated source formula.
 const corner=[.958306835,.665141133,-2.215093138];
 assert.ok(nearestActualSurface(model,corner,'Rear deck',{outer:false}).distance<1e-6);
 assert.ok(nearestActualSurface(model,corner,'Rear bumper',{outer:false}).distance>.03);
 assert.equal(validateRealSurfacing(legacyPath).pass,false);
});
