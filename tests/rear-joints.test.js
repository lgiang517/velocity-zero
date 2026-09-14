import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {validateLuxCar} from '../tools/validate-lux-car.mjs';
import {rearSkinLayerReport,rearShoulderLayerReport,rearShoulderCrownReport,rearCpillarFinishReport} from '../tools/validate-rear-joints.mjs';

const report=validateLuxCar(process.env.VEHICLE_REBUILD_GLB||'public/models/solstice-lux-gt.glb');
test('rear-quarter upper body has a single outward paint skin without intersecting covers',()=>{
 const result=rearSkinLayerReport(report);
 assert.ok(result.covered>=result.sampled*.55,'The inspected rear-quarter surface must remain present');
 assert.equal(result.overlaps.length,0,`Overlapping rear skins at ${JSON.stringify(result.overlaps.slice(0,4))}`);
});
test('rear shoulder join does not retain folded or overlapping paint surfaces',()=>{
 const result=rearShoulderLayerReport(report);
 assert.ok(result.covered>=result.sampled*.5,'The shoulder join must retain an exterior surface');
 assert.equal(result.overlaps.length,0,`Folded shoulder skins at ${JSON.stringify(result.overlaps.slice(0,4))}`);
});

test('rear shoulder crown does not sag into a gutter below the side window',()=>{
 const result=rearShoulderCrownReport(report);
 assert.equal(result.missing.length,0,`Missing shoulder skin at ${JSON.stringify(result.missing)}`);
 assert.equal(result.dips.length,0,`Shoulder gutter at ${JSON.stringify(result.dips)}`);
});

test('C-pillar rear-facing exterior closes with paint rather than exposed cabin lining',()=>{
 const result=rearCpillarFinishReport(report);
 assert.equal(result.defects.length,0,`Exposed C-pillar lining or missing skin at ${JSON.stringify(result.defects)}`);
});


test('real extra upward deck skin remains a defect even with a closed bumper return',()=>{
 const source=report.geometries.find(g=>g.name==='Rear deck'||g.name==='Lux continuous body');
 assert.ok(source,'Actual upper skin required');
 const duplicate={...source,points:source.points.map(p=>p.clone().add(new THREE.Vector3(0,.002,0)))};
 const damaged={...report,geometries:[...report.geometries,duplicate]};
 assert.ok(rearSkinLayerReport(damaged).overlaps.length>0,'A 2 mm duplicate exterior cannot be hidden by the bumper exemption');
});

test('only a concealed front-facing bumper return is excluded from upper-skin overlaps',()=>{
 const plane=(name,y,tilt)=>({name,material:'Paint',points:[new THREE.Vector3(-1,y+tilt*.12,-1.8),new THREE.Vector3(-1,y-tilt*.12,-2.04),new THREE.Vector3(1,y+tilt*.12,-1.8)],indices:[0,2,1]});
 const deck=plane('Rear deck',.95,0),inward=plane('Rear bumper',.90,-.1),outward=plane('Rear bumper',.90,.1),above=plane('Rear bumper',1.0,-.1);
 const hidden=rearSkinLayerReport({geometries:[deck,inward]});
 assert.ok(hidden.internalReturns.length>0);assert.equal(hidden.overlaps.length,0);
 assert.ok(rearSkinLayerReport({geometries:[deck,outward]}).overlaps.length>0,'Outward bumper surface remains inspected');
 assert.ok(rearSkinLayerReport({geometries:[deck,above]}).overlaps.length>0,'A return above the exterior is not concealed');
});
