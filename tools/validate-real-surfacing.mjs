/** Independent final-rear-corner acceptance. Metadata locates surfaces; exported
 * positions, triangle face normals and vertex normals establish acceptance.
 * A passed numerical report still requires actual-car and reflection review. */
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import {readVehicleGeometry} from './validate-vehicle-rebuild.mjs';

export const SURFACING_LIMITS=Object.freeze({surfaceDistanceM:.0005,boundarySeparationM:.00075,normalLimitDeg:3,maximumDiscretizationAllowanceDeg:3,fitOffsetErrorM:.001,fitLateralErrorM:.001,maximumHousingOffsetM:.026});
const REQUIRED_SEAMS=['rear-deck-side-left','rear-deck-side-right','rear-deck-bumper','rear-side-bumper-left','rear-side-bumper-right'];
const V=p=>new THREE.Vector3(...p);
const validPoint=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
const angle=(a,b)=>THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(V(a).dot(V(b)),-1,1)));
const hint=(name,p)=>name==='Rear deck'?new THREE.Vector3(0,1,0):name==='Rear bumper'?new THREE.Vector3(0,0,-1):name.startsWith('Body side ')?new THREE.Vector3(Math.sign(p[0])||1,0,0):null;

export function nearestActualSurface(model,p,panel,{outer=true}={}){
 const point=V(p),outward=outer?hint(panel,p):null;let best=null;
 for(const g of model.geometries.filter(g=>g.name===panel))for(const t of g.triangles){
  if(outward&&t.normal.dot(outward)<.02)continue;
  if(best&&t.box.distanceToPoint(point)>best.distance+1e-8)continue;
  const triangle=new THREE.Triangle(t.a,t.b,t.c),q=triangle.closestPointToPoint(point,new THREE.Vector3()),distance=q.distanceTo(point);
  if(best&&distance>=best.distance-1e-9)continue;
  const bary=triangle.getBarycoord(q,new THREE.Vector3());
  const shading=g.normals.length?g.normals[t.ids[0]].clone().multiplyScalar(bary.x).addScaledVector(g.normals[t.ids[1]],bary.y).addScaledVector(g.normals[t.ids[2]],bary.z).normalize():t.normal.clone();
  best={point:q.toArray(),distance,normal:t.normal.toArray(),shading:shading.toArray(),face:t.index};
 }
 return best;
}

/** Extrapolate the two same-side normal observations to zero distance from the
 * common boundary. Curvature across the seam is not itself a discontinuity. */
export function extrapolatedNormal(n1,n2,d1,d2){
 if(d2<=d1+1e-7)return n1;
 return V(n1).multiplyScalar(d2).addScaledVector(V(n2),-d1).normalize().toArray();
}
export function inspectSmoothSeamSample(model,seam,s,index){
 const errors=[];const result={index,point:s.point,errors};
 if(!['point','a1','a2','b1','b2'].every(k=>validPoint(s[k])))return {...result,errors:['Invalid finite XYZ boundary/guide coordinates']};
 const p=V(s.point),a=nearestActualSurface(model,s.point,seam.panelA),b=nearestActualSurface(model,s.point,seam.panelB);
 if(!a||!b)return {...result,errors:['Named boundary panel has no actual outward triangles']};
 Object.assign(result,{boundaryA:a,boundaryB:b,boundarySeparationM:V(a.point).distanceTo(V(b.point))});
 if(a.distance>SURFACING_LIMITS.surfaceDistanceM||b.distance>SURFACING_LIMITS.surfaceDistanceM)errors.push('Declared common boundary misses actual surface');
 if(result.boundarySeparationM>SURFACING_LIMITS.boundarySeparationM)errors.push('Actual panel boundaries are separated');
 const guides={};
 for(const side of ['a','b']){
  const panel=side==='a'?seam.panelA:seam.panelB,q1=s[side+'1'],q2=s[side+'2'];
  const d1=p.distanceTo(V(q1)),d2=p.distanceTo(V(q2));
  if(d1<.001||d1>.02||d2<d1*1.3||d2>.04){errors.push('Guide distances do not establish an ordered local limit');continue;}
  if(V(q1).sub(p).normalize().dot(V(q2).sub(p).normalize())<.8){errors.push('Guides must proceed into one side of the surface');continue;}
  const n1=nearestActualSurface(model,q1,panel),n2=nearestActualSurface(model,q2,panel);
  if(!n1||!n2){errors.push('Guide panel missing');continue;}
  if(Math.max(n1.distance,n2.distance)>SURFACING_LIMITS.surfaceDistanceM)errors.push('Guide misses actual exported surface');
  guides[side]={d1,d2,surfaceErrorM:Math.max(n1.distance,n2.distance),faceLimit:extrapolatedNormal(n1.normal,n2.normal,d1,d2),shadingLimit:extrapolatedNormal(n1.shading,n2.shading,d1,d2),localFaceTurnDeg:angle(n1.normal,n2.normal),localShadingTurnDeg:angle(n1.shading,n2.shading)};
 }
 result.guides=guides;
 if(guides.a&&guides.b){
  result.geometricLimitJumpDeg=angle(guides.a.faceLimit,guides.b.faceLimit);
  result.shadingLimitJumpDeg=angle(guides.a.shadingLimit,guides.b.shadingLimit);
  // A bounded allowance handles planar tessellation error, without accepting the
  // old 17-32 degree geometric kink or 45-51 degree shading discontinuity.
  result.discretizationAllowanceDeg=Math.min(SURFACING_LIMITS.maximumDiscretizationAllowanceDeg,.35*(guides.a.localFaceTurnDeg+guides.b.localFaceTurnDeg));
  if(result.geometricLimitJumpDeg>SURFACING_LIMITS.normalLimitDeg+result.discretizationAllowanceDeg)errors.push('Geometric tangent limits disagree');
  if(result.shadingLimitJumpDeg>SURFACING_LIMITS.normalLimitDeg)errors.push('Shading normal limits disagree');
 }
 result.pass=errors.length===0;return result;
}

export function smoothRearSeamsReport(model){
 const declared=model.declaration?.surfacing,seams=[],defects=[];
 if(declared?.version!==1||!Array.isArray(declared.smoothSeams))return {pass:false,defects:[{reason:'Missing version 1 surfacing seam declaration; cannot certify unmeasured corners'}],seams};
 for(const id of REQUIRED_SEAMS){
  const matches=declared.smoothSeams.filter(s=>s.id===id);
  if(matches.length!==1){defects.push({id,reason:'Required rear seam must be declared exactly once'});continue;}
  const seam=matches[0];
  const expectedPanels=id==='rear-deck-bumper'?['Rear deck','Rear bumper']:id.startsWith('rear-deck-side')?['Rear deck','Body side '+(id.endsWith('left')?'left':'right')]:['Body side '+(id.endsWith('left')?'left':'right'),'Rear bumper'];
  if(seam.panelA!==expectedPanels[0]||seam.panelB!==expectedPanels[1]){defects.push({id,reason:'Seam must compare its two independently named production panels',expectedPanels});continue;}
  if(typeof seam.panelA!=='string'||typeof seam.panelB!=='string'||!Array.isArray(seam.samples)){defects.push({id,reason:'Invalid seam panels/samples'});continue;}
  const samples=seam.samples.map((s,i)=>inspectSmoothSeamSample(model,seam,s,i));
  const points=seam.samples.map(s=>s.point).filter(validPoint),box=new THREE.Box3().setFromPoints(points.map(V)),size=box.getSize(new THREE.Vector3());
  const sufficient=points.length>=9&&(id==='rear-deck-bumper'?size.x>=1.7:id.startsWith('rear-deck-side')?size.z>=.35:size.y>=.25)&&box.min.z< -2.10;
  if(!sufficient)defects.push({id,reason:'Samples do not span the actual final rear corner',sampleCount:points.length,size:size.toArray()});
  const failed=samples.filter(s=>!s.pass);defects.push(...failed.map(s=>({id,index:s.index,errors:s.errors})));
  seams.push({id,panelA:seam.panelA,panelB:seam.panelB,pass:sufficient&&failed.length===0,samples});
 }
 return {pass:defects.length===0,defects,seams};
}

export function tailHousingFitReport(model){
 const entries=model.declaration?.surfacing?.tailHousingFit,samples=[],defects=[];
 if(!Array.isArray(entries)||!entries.length)return {pass:false,defects:[{reason:'Missing actual tail housing fit sampling'}],samples};
 for(const entry of entries){
  if(!Array.isArray(entry.samples)){defects.push({id:entry.id,reason:'Missing housing samples'});continue;}
  for(const [index,s]of entry.samples.entries()){
   const errors=[];const result={id:entry.id,index,...s,errors};
   if(!validPoint(s.housingPoint)||!validPoint(s.bodyPoint)||!validPoint(s.outward)||!Number.isFinite(s.expectedOffsetM)){defects.push({id:entry.id,index,reason:'Invalid housing fit coordinates'});continue;}
   const normal=V(s.outward).normalize();
   if(normal.z>-.25||V(s.outward).length()<.9||V(s.outward).length()>1.1)errors.push('Tail outward direction is invalid');
   const housing=nearestActualSurface(model,s.housingPoint,entry.housingPanel,{outer:false}),body=nearestActualSurface(model,s.bodyPoint,entry.bumperPanel);
   if(!housing||!body){defects.push({id:entry.id,index,reason:'Missing actual housing/bumper geometry'});continue;}
   const delta=V(housing.point).sub(V(body.point)),offset=delta.dot(normal),lateral=delta.clone().addScaledVector(normal,-offset).length();
   Object.assign(result,{actualHousing:housing,actualBody:body,actualOffsetM:offset,lateralErrorM:lateral});
   if(Math.max(housing.distance,body.distance)>SURFACING_LIMITS.surfaceDistanceM)errors.push('Fit declaration misses actual mesh');
   if(s.expectedOffsetM<-.01||s.expectedOffsetM>SURFACING_LIMITS.maximumHousingOffsetM)errors.push('Declared offset exceeds controlled recessed-housing range');
   if(Math.abs(offset-s.expectedOffsetM)>SURFACING_LIMITS.fitOffsetErrorM)errors.push('Actual housing offset disagrees with fitted rear surface');
   if(lateral>SURFACING_LIMITS.fitLateralErrorM)errors.push('Housing is laterally displaced from its corresponding rear surface');
   result.pass=errors.length===0;samples.push(result);if(errors.length)defects.push({id:entry.id,index,errors});
  }
 }
 // Coverage follows the actual exported housing, not the previous styling width.
 // Keep the physical error gates above unchanged when a legitimate redesign
 // narrows or widens the tail. Both terminal regions and center remain mandatory.
 const housingPoints=model.geometries.filter(g=>g.name==='Tail lamp recessed housing').flatMap(g=>g.points);
 const box=new THREE.Box3().setFromPoints(housingPoints),width=box.max.x-box.min.x;
 const xs=samples.filter(s=>s.actualHousing).map(s=>s.actualHousing.point[0]);
 const center=(box.min.x+box.max.x)/2,terminalAllowance=width*.025;
 const coverage={actualBoundsX:[box.min.x,box.max.x],sampleBoundsX:xs.length?[Math.min(...xs),Math.max(...xs)]:null,minimumSpanFraction:.95,terminalAllowanceM:terminalAllowance};
 if(!Number.isFinite(width)||width<=0||xs.length<9||Math.min(...xs)>box.min.x+terminalAllowance||Math.max(...xs)<box.max.x-terminalAllowance||!xs.some(x=>Math.abs(x-center)<=width*.05))defects.push({reason:'Fit samples must span 95 percent of the actual housing and include both terminals and center',coverage});
 return {pass:defects.length===0,defects,samples,coverage};
}

export function validateRealSurfacing(path){
 const model=readVehicleGeometry(path),checks={smoothRearSeams:smoothRearSeamsReport(model),tailHousingFit:tailHousingFitReport(model)};
 return {asset:path,sha256:model.sha256,pass:Object.values(checks).every(c=>c.pass),failed:Object.entries(checks).filter(([,c])=>!c.pass).map(([id])=>id),limits:SURFACING_LIMITS,checks,limitations:['This checks declared final-rear seams against actual triangles and independently stored normals; full-car visual comparison to real vehicles remains required.','Intentional hard creases and physical panel gaps require separate declared treatment; do not label them smooth to satisfy this validator.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=validateRealSurfacing(process.argv[2]||'output/vehicle-rebuild/candidate/solstice-lux-gt.glb'),out=process.argv.indexOf('--out');
 if(out>=0)fs.writeFileSync(process.argv[out+1],JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({asset:result.asset,sha256:result.sha256,pass:result.pass,failed:result.failed,checks:Object.fromEntries(Object.entries(result.checks).map(([id,c])=>[id,{pass:c.pass,defects:c.defects.slice(0,12)}]))},null,2));
 if(!result.pass)process.exitCode=1;
}
