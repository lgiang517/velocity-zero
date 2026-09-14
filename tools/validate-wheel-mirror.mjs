import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import {createWheelSet,GT_WHEEL_SPEC} from '../src/wheels.js';
import {readVehicleGeometry} from './validate-vehicle-rebuild.mjs';

// This exercises the real runtime wheel geometry at the actual exported Empty
// transforms. Tire dimensions come from the four anchors, never an old GT size.
export function validateWheelMirrors(asset){
 const model=readVehicleGeometry(asset),set=createWheelSet(),failures=[];
 const check=(condition,message)=>{if(!condition)failures.push(message);};
 const spec=GT_WHEEL_SPEC,unit=set.create(1);
 const alloy=unit.rotating.getObjectByName('alloy').geometry.attributes.position;
 const cp=unit.fixed.getObjectByName('caliper').geometry.attributes.position;
 const lip=unit.rotating.getObjectByName('cut').geometry.attributes.position;
 let lipRadius=0,caliperFront=-Infinity,maxCaliperRadius=0,spokeBack=Infinity;
 for(let i=0;i<lip.count;i++)lipRadius=Math.max(lipRadius,Math.hypot(lip.getY(i),lip.getZ(i)));
 for(let i=0;i<cp.count;i++){
  caliperFront=Math.max(caliperFront,cp.getX(i));
  maxCaliperRadius=Math.max(maxCaliperRadius,Math.hypot(cp.getY(i),cp.getZ(i)));
 }
 // Axial back-plane clearance is invariant over a full revolution. Include
 // every spoke angle throughout the complete radial interval of the caliper.
 for(let i=0;i<alloy.count;i++){
  const r=Math.hypot(alloy.getY(i),alloy.getZ(i));
  if(r>.13&&r<maxCaliperRadius)spokeBack=Math.min(spokeBack,alloy.getX(i));
 }
 const unitCaliperClearance=spokeBack-caliperFront;
 check(unitCaliperClearance>.012,'Normalized spoke/caliper clearance must exceed 12 mm for every wheel angle');
 check(maxCaliperRadius<.24,'Caliper exceeds the verified inner barrel envelope');
 check(lipRadius/spec.normalizedRadius>.76&&lipRadius/spec.normalizedRadius<.79,'Outer flange / tire radius ratio must retain the road-tire sidewall');
 check(model.declaration?.wheelFitmentVersion===2,'Expected wheelFitmentVersion 2');
 const names=['Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR'],anchors=[],steering=[];
 const thresholds={innerWallX:.544,archRadius:.388,minWallClearance:.005,minArchClearance:.001,minActualCaliperClearance:.006};
 for(const name of names){
  const matches=model.nodes.map((node,index)=>({node,index})).filter(({node})=>node.name===name);
  check(matches.length===1,`${name}: exactly one anchor is required`);
  if(matches.length!==1)continue;
  const {node,index}=matches[0],front=name.includes('_F'),expected=front?spec.front:spec.rear;
  const radius=Number(node.extras?.tireRadius),width=Number(node.extras?.tireWidth);
  check(node.mesh===undefined&&model.roots.includes(index),`${name}: axle must be a top-level Empty`);
  check(Number.isFinite(radius)&&Math.abs(radius-expected.radius)<1e-7,`${name}: tire radius does not match ${expected.designation}`);
  check(Number.isFinite(width)&&Math.abs(width-expected.width)<1e-7,`${name}: width does not match ${expected.designation}`);
  if(!Number.isFinite(radius)||!Number.isFinite(width)||radius<=0||width<=0)continue;
  const transform=node.matrix?new THREE.Matrix4().fromArray(node.matrix):new THREE.Matrix4().compose(
   new THREE.Vector3(...(node.translation||[0,0,0])),new THREE.Quaternion(...(node.rotation||[0,0,0,1])),new THREE.Vector3(...(node.scale||[1,1,1])));
  const position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3();transform.decompose(position,quaternion,scale);
  const side=Math.sign(position.x);
  check(side!==0&&Math.abs(transform.determinant())>1e-9,`${name}: non-singular lateral axle transform required`);
  check(Math.abs(position.y-radius-.004)<1e-6,`${name}: rolling tire must sit 4 mm above the ground`);
  const assembly=set.create(side),pivot=new THREE.Group();pivot.position.copy(position);pivot.quaternion.copy(quaternion);pivot.scale.copy(scale);pivot.add(assembly.root);
  assembly.root.scale.set(width/spec.normalizedWidth,radius/spec.normalizedRadius,radius/spec.normalizedRadius);
  const beadDiameterInches=2*spec.beadSeatRadius*radius/spec.normalizedRadius/.0254;
  const flangeDiameter=2*lipRadius*radius/spec.normalizedRadius;
  const actualCaliperClearance=unitCaliperClearance*width/spec.normalizedWidth*Math.abs(scale.x);
  check(Math.abs(beadDiameterInches-21)<.06,`${name}: bead seat diameter is not 21 inches`);
  check(flangeDiameter>.55&&flangeDiameter<.565,`${name}: outer flange diameter outside 550-565 mm`);
  check(actualCaliperClearance>thresholds.minActualCaliperClearance,`${name}: actual caliper-to-spoke clearance is below 6 mm`);
  for(const angle of front?[-.56,-.48,0,.48,.56]:[0]){
   assembly.root.rotation.y=angle;pivot.updateMatrixWorld(true);
   const tire=assembly.rotating.getObjectByName('rubber'),p=tire.geometry.attributes.position;
   let inner=Infinity,maxRadial=0,minY=Infinity;
   const v=new THREE.Vector3();
   for(let i=0;i<p.count;i++){
    v.fromBufferAttribute(p,i).applyMatrix4(tire.matrixWorld);
    inner=Math.min(inner,side*v.x);maxRadial=Math.max(maxRadial,Math.hypot(v.y-position.y,v.z-position.z));minY=Math.min(minY,v.y);
   }
   const sample={anchor:name,side,angle,wallClearance:inner-thresholds.innerWallX,archClearance:thresholds.archRadius-maxRadial,groundClearance:minY};
   sample.pass=sample.wallClearance>thresholds.minWallClearance&&sample.archClearance>thresholds.minArchClearance;
   check(sample.pass,`${name} steering ${angle}: wheelhouse clearance regression`);steering.push(sample);
  }
  anchors.push({name,position:position.toArray(),scale:scale.toArray(),radius,width,designation:expected.designation,beadDiameterInches,flangeDiameter,actualCaliperClearance});
 }
 check(anchors.length===4,'Exactly four measured axle assemblies are required');
 const mirrors=[];
 for(const label of['left','right']){
  const surfaces=model.geometries.filter(g=>g.name.startsWith('Mirror ')&&g.name.endsWith(label));
  const face=surfaces.filter(g=>g.material==='Glass').flatMap(g=>g.triangles.filter(t=>t.normal.z<-.5&&t.area>1e-9));
  const samples=[];
  for(let i=0;i<Math.min(9,face.length);i++){
   const t=face[Math.floor((i+.5)*face.length/Math.min(9,face.length))];
   const point=t.a.clone().add(t.b).add(t.c).divideScalar(3),eye=new THREE.Vector3(.35,1.03,-.4);
   const ray=new THREE.Ray(eye,point.clone().sub(eye).normalize()),hits=[];
   for(const g of surfaces)for(const f of g.triangles){
    const p=ray.intersectTriangle(f.a,f.b,f.c,true,new THREE.Vector3());
    if(p)hits.push({name:g.name,material:g.material,distance:p.distanceTo(eye)});
   }
   hits.sort((a,b)=>a.distance-b.distance);samples.push({point:point.toArray(),normal:t.normal.toArray(),first:hits[0]});
  }
  const pass=samples.length===9&&samples.every(s=>s.first?.material==='Glass');
  check(pass,`${label}: nine original driver-eye rays must first hit Glass`);mirrors.push({label,pass,samples});
 }
 const report={asset,sha256:model.sha256,wheelFitmentVersion:model.declaration?.wheelFitmentVersion,
  thresholds,wheel:{spokeBack,caliperFront,unitCaliperClearance,maxCaliperRadius,unitLipRadius:lipRadius,anchors},steering,mirrors,failures,pass:failures.length===0};
 set.dispose();return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const asset=process.argv[2]||'public/models/solstice-lux-gt.glb';
 const output=process.argv[3]||'output/playwright/wheel-mirror-inspection/geometry-validation.json';
 const report=validateWheelMirrors(asset);fs.mkdirSync(path.dirname(output),{recursive:true});
 fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 assert.ok(report.pass,'Wheel / mirror geometry regression: '+report.failures.join('; '));
}
