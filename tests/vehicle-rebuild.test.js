import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateVehicleRebuild,readVehicleGeometry,assemblyBoundaryReport,wheelPreservationReport,hoodNormalReport,wholeHoodShellReport} from '../tools/validate-vehicle-rebuild.mjs';

const asset=process.env.VEHICLE_REBUILD_GLB||'public/models/solstice-lux-gt.glb';
const report=validateVehicleRebuild(asset);
const descriptions={
 rearShoulderShape:'rear shoulder has no measured secondary gutter or abrupt rearward rebound',
 rearWindowBoundary:'rear deck meets the actual rear-window lower boundary',
 hoodNormals:'all hood paint has no oppositely directed corner normals',
 wholeHoodShell:'full hood footprint has no inverted or nearly coincident exterior sheet',
 assemblyBoundaries:'shared assembly boundaries lie on actual exported panels',
 wheelPreservation:'all four wheel pivots and tire dimensions retain the frozen axle package',
 hoodShell:'hood underside does not flip above or almost coincide with its exterior',
 tailLens:'rear optical lens has thickness and closed consistently oriented edges',
 exhaustOpenings:'both exhaust openings see their interior instead of an uncut exterior sheet',
};
for(const [id,title]of Object.entries(descriptions))test(title,()=>{
 const check=report.checks[id];
 const details={defects:check.defects?.slice(0,3),missing:check.missing?.slice(0,3),dips:check.dips?.slice(0,2),rebounds:check.rebounds?.slice(0,2),boundaryEdges:check.boundaryEdges,thin:check.thin?.slice(0,2)};
 assert.ok(check.pass,`${id}: ${JSON.stringify(details)}`);
});

// The intentionally defective audit fixture is kept outside production. On
// developer machines retaining it, ensure this validator detects all known classes.
const baseline='output/vehicle-rebuild/baseline/solstice-lux-gt.glb';
test('frozen audit baseline demonstrates the six original defects',{skip:!fs.existsSync(baseline)},()=>{
 const old=validateVehicleRebuild(baseline);
 assert.equal(old.sha256,'f36cc7ea33220924f411738476ee6b6f8e00019d2a0d767c0308db7d1c5747da');
 for(const id of ['rearShoulderShape','rearWindowBoundary','hoodNormals','hoodShell','tailLens','exhaustOpenings'])assert.ok(old.failed.includes(id),id+' must detect the known baseline defect');
 assert.ok(old.checks.wheelPreservation.pass,'The historical axle package itself is valid');
});


test('assembly verification rejects declared seam displaced off the actual mesh',()=>{
 const model=readVehicleGeometry(asset);
 assert.ok(model.declaration,'Candidate requires assembly metadata');
 model.declaration=structuredClone(model.declaration);
 model.declaration.hoodRear=model.declaration.hoodRear.map(p=>[p[0],p[1]+.02,p[2]]);
 assert.ok(!assemblyBoundaryReport(model).pass);
});

test('wheel preservation rejects a millimetre axle move and changed tire dimensions',()=>{
 const model=readVehicleGeometry(asset);
 model.nodes=structuredClone(model.nodes);
 const wheel=model.nodes.find(n=>n.name==='Wheel_FL');wheel.translation[0]+=.001;
 assert.ok(!wheelPreservationReport(model).pass);
 wheel.translation[0]-=.001;wheel.extras.tireRadius+=.001;
 assert.ok(!wheelPreservationReport(model).pass);
});

test('hood checks detect corruption at the front beyond the original audit sampling area',()=>{
 const model=readVehicleGeometry(asset),hood=model.geometries.filter(g=>g.name==='Driver_hood');
 let changed=0;
 for(const g of hood)for(const t of g.triangles)if(t.normal.y>.5&&t.a.z>1.8){
  for(const id of t.ids)g.normals[id]=t.normal.clone().negate();changed++;
 }
 assert.ok(changed>0,'Nose triangles inspected');
 assert.ok(!hoodNormalReport(model).pass);
 for(const g of hood)for(const t of g.triangles)if(t.normal.y>.5&&t.a.z>1.8){
  const a=t.a;t.a=t.c;t.c=a;t.normal.negate();
 }
 assert.ok(!wholeHoodShellReport(model).pass);
});
