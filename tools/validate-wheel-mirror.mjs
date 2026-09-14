import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createWheelSet} from '../src/wheels.js';
import {readVehicleGeometry} from './validate-vehicle-rebuild.mjs';
const path=process.argv[2]||'output/vehicle-rebuild/candidate-next/solstice-lux-gt.glb';
const model=readVehicleGeometry(path),set=createWheelSet(),wheel=set.create(1),alloy=wheel.rotating.getObjectByName('alloy').geometry.attributes.position,caliper=wheel.fixed.getObjectByName('caliper').geometry.attributes.position;
let spokeBack=Infinity,caliperFront=-Infinity,lipRadius=0;
for(let i=0;i<alloy.count;i++){const r=Math.hypot(alloy.getY(i),alloy.getZ(i));if(r>.15&&r<.237)spokeBack=Math.min(spokeBack,alloy.getX(i));}
for(let i=0;i<caliper.count;i++)caliperFront=Math.max(caliperFront,caliper.getX(i));
const lip=wheel.rotating.getObjectByName('cut').geometry.attributes.position;for(let i=0;i<lip.count;i++)lipRadius=Math.max(lipRadius,Math.hypot(lip.getY(i),lip.getZ(i)));
const steering=[];
for(const side of[-1,1])for(const angle of[-.56,-.48,0,.48,.56]){
 const a=set.create(side);a.root.position.set(side*.871874988,.397018045,1.38821876);a.root.scale.set(.2325/.276,.39040625/.375,.39040625/.375);a.root.rotation.y=angle;a.root.updateMatrixWorld(true);const tire=a.rotating.getObjectByName('rubber'),p=tire.geometry.attributes.position;
 let inner=Infinity,maxRadial=0;
 for(let i=0;i<p.count;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(tire.matrixWorld);inner=Math.min(inner,side*v.x);maxRadial=Math.max(maxRadial,Math.hypot(v.y-.397018045,v.z-1.38821876));}
 steering.push({side,angle,wallClearance:inner-.544,archClearance:.412-maxRadial});
}
const mirrors=[];
for(const label of['left','right']){
 const surfaces=model.geometries.filter(g=>g.name.startsWith('Mirror ')&&g.name.endsWith(label)),glass=surfaces.filter(g=>g.material==='Glass');let samples=[];
 const face=glass.flatMap(g=>g.triangles.filter(t=>t.normal.z<-.5));
 for(let i=0;i<Math.min(9,face.length);i++){
  const t=face[Math.floor((i+.5)*face.length/Math.min(9,face.length))],point=t.a.clone().add(t.b).add(t.c).divideScalar(3),eye=new THREE.Vector3(.35,1.03,-.4),ray=new THREE.Ray(eye,point.clone().sub(eye).normalize()),hits=[];
  for(const g of surfaces)for(const f of g.triangles){const p=ray.intersectTriangle(f.a,f.b,f.c,true,new THREE.Vector3());if(p)hits.push({name:g.name,material:g.material,distance:p.distanceTo(eye)});}
  hits.sort((a,b)=>a.distance-b.distance);samples.push({point:point.toArray(),normal:t.normal.toArray(),first:hits[0]});
 }
 mirrors.push({label,pass:samples.length===9&&samples.every(s=>s.first?.material==='Glass'),samples});
}
const report={asset:path,sha256:model.sha256,wheel:{spokeBack,caliperFront,caliperClearance:spokeBack-caliperFront,unitLipRadius:lipRadius,gtLipRadius:lipRadius*.39040625/.375,tireRadius:.39040625},steering,mirrors};
report.pass=report.wheel.caliperClearance>.006&&report.wheel.gtLipRadius>.26&&report.wheel.gtLipRadius<.28&&steering.every(s=>s.wallClearance>.005&&s.archClearance>.001)&&mirrors.every(m=>m.pass);
set.dispose();fs.writeFileSync('output/playwright/wheel-mirror-inspection/geometry-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));assert.ok(report.pass,'Wheel / mirror geometry regression');
