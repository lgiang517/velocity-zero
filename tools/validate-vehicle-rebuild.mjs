import fs from 'node:fs';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import {readGLB} from './validate-lux-car.mjs';

// These checks use exported triangles, not the surface generator. The locations
// cover the measured defects in f36cc7e; they are not a whole-car beauty metric.
const V=(p)=>new THREE.Vector3(...p);
const key=(p)=>p.toArray().map(v=>Math.round(v/1e-6)).join(',');
const clamp=(v)=>Math.min(1,Math.max(-1,v));
const rearNames=['Lux continuous body','Continuous canopy shoulder transition','Rear deck','Body side left','Body side right'];

export function readVehicleGeometry(path){
 const glb=readGLB(path),geometries=[];
 for(const instance of glb.instances){
  const {primitive:p,node,matrix,material}=instance;
  if((p.mode??4)!==4)continue;
  const positions=glb.accessor(p.attributes.POSITION),normals=p.attributes.NORMAL===undefined?null:glb.accessor(p.attributes.NORMAL);
  const points=[],normalPoints=[],normalMatrix=new THREE.Matrix3().getNormalMatrix(matrix);
  for(let i=0;i<positions.values.length;i+=3){
   points.push(V(positions.values.slice(i,i+3)).applyMatrix4(matrix));
   if(normals)normalPoints.push(V(normals.values.slice(i,i+3)).applyMatrix3(normalMatrix).normalize());
  }
  const indices=p.indices===undefined?points.map((_,i)=>i):glb.accessor(p.indices).values,triangles=[];
  for(let i=0;i<indices.length;i+=3){
   const ids=indices.slice(i,i+3),[a,b,c]=ids.map(id=>points[id]),normal=b.clone().sub(a).cross(c.clone().sub(a));
   const area=normal.length()/2;normal.normalize();
   triangles.push({ids,a,b,c,normal,area,index:i/3,box:new THREE.Box3().setFromPoints([a,b,c])});
  }
  geometries.push({name:node.name,material:material?.name,points,normals:normalPoints,triangles,box:new THREE.Box3().setFromPoints(points)});
 }
 const declaration=glb.json.nodes.find(n=>n.name==='Vehicle_assembly')?.extras?.vehicleAssembly??null;
 return {path,sha256:crypto.createHash('sha256').update(glb.file).digest('hex'),bytes:glb.file.length,geometries,declaration,nodes:glb.json.nodes,roots:glb.roots};
}

function hits(geometries,origin,direction,{frontOnly=false,epsilon=1e-7}={}){
 const ray=new THREE.Ray(V(origin),V(direction).normalize()),result=[];
 for(const g of geometries){
  if(!ray.intersectsBox(g.box))continue;
  for(const t of g.triangles){
   if(!ray.intersectsBox(t.box))continue;
   const point=ray.intersectTriangle(t.a,t.b,t.c,frontOnly,new THREE.Vector3());
   if(point)result.push({name:g.name,material:g.material,point:point.toArray(),distance:point.distanceTo(ray.origin),normal:t.normal.toArray(),face:t.index});
  }
 }
 result.sort((a,b)=>a.distance-b.distance);
 return result.filter((h,i)=>!result.slice(Math.max(0,i-4),i).some(a=>a.name===h.name&&a.material===h.material&&Math.abs(a.distance-h.distance)<=epsilon&&V(a.normal).dot(V(h.normal))>.99));
}
const topAt=(geometries,x,z)=>hits(geometries,[x,1.6,z],[0,-1,0],{frontOnly:true}).find(h=>h.point[1]>.65&&h.point[1]<1.2)??null;
const selectRear=(model)=>model.geometries.filter(g=>g.material==='Paint'&&rearNames.includes(g.name));

/** Allow broad convex crowns; reject the measured secondary trough/rebound only.
 * Chord comparisons do not require a panel to be flat or its slope to be zero. */
export function rearShoulderShapeReport(model){
 const skins=selectRear(model),crossSections=[],longSections=[],dips=[],rebounds=[],missing=[];
 for(const side of[-1,1])for(const z of[-1.70,-1.725,-1.75,-1.775,-1.8]){
  const samples=Array.from({length:19},(_,i)=>{const x=side*(.72+i*.01),hit=topAt(skins,x,z);return {x,z,y:hit?.point[1]??null};});
  missing.push(...samples.filter(s=>s.y===null));
  let worst=null;
  // Search only 60-160 mm chord spans, not full-car curvature or intended seams.
  for(let a=0;a<samples.length;a++)for(let b=a+6;b<Math.min(samples.length,a+17);b++){
   if(samples[a].y===null||samples[b].y===null)continue;
   for(let i=a+1;i<b;i++)if(samples[i].y!==null){
    const t=(i-a)/(b-a),depth=samples[a].y*(1-t)+samples[b].y*t-samples[i].y;
    if(!worst||depth>worst.depth)worst={...samples[i],depth,chord:[samples[a],samples[b]]};
   }
  }
  crossSections.push({side,z,samples,worst});if(worst?.depth>.003)dips.push(worst);
 }
 for(const side of[-1,1])for(const width of[.90,.92,.94,.96]){
  const samples=Array.from({length:31},(_,i)=>{const z=-1.705-i*.01,x=side*width,hit=topAt(skins,x,z);return {x,z,y:hit?.point[1]??null};});
  const valid=samples.filter(s=>s.y!==null);if(valid.length<samples.length*.6)missing.push({x:side*width,longitudinalCoverage:valid.length/samples.length});
  let low=null,worst=null;
  for(const sample of valid){
   if(!low||sample.y<low.y)low=sample;
   const rise=sample.y-low.y;
   if(!worst||rise>worst.rise)worst={rise,from:low,to:sample};
  }
  longSections.push({side,width,samples,worst});if(worst?.rise>.004)rebounds.push(worst);
 }
 return {pass:missing.length===0&&dips.length===0&&rebounds.length===0,toleranceM:{chordDip:.003,rebound:.004},missing,dips,rebounds,crossSections,longSections};
}

function distanceToSurface(point,geometries){
 const p=V(point),closest=new THREE.Vector3();let min=Infinity;
 for(const g of geometries)for(const t of g.triangles){
  if(t.box.distanceToPoint(p)>min)continue;
  new THREE.Triangle(t.a,t.b,t.c).closestPointToPoint(p,closest);min=Math.min(min,p.distanceTo(closest));
 }
 return min;
}

/** The declared seam, when present, must itself lie on the exported rear window.
 * Otherwise derive the actual lowest-Z window row; no canopy formula is copied. */
export function rearWindowBoundaryReport(model){
 const window=model.geometries.filter(g=>g.name==='Window rear'),skins=selectRear(model),all=window.flatMap(g=>g.points);
 const declared=model.declaration?.rearWindowLower;
 let boundary=Array.isArray(declared)?declared.map(p=>Array.isArray(p)?p:p.point):null;
 if(!boundary){
  const minZ=Math.min(...all.map(p=>p.z));
  boundary=[...new Map(all.filter(p=>p.z<=minZ+1e-5).map(p=>[key(p),p.toArray()])).values()].sort((a,b)=>a[0]-b[0]);
 }
 const samples=boundary.filter(p=>Array.isArray(p)&&p.length===3&&Math.abs(p[0])<=.841).map(p=>{
  const windowDistance=distanceToSurface(p,window),hit=topAt(skins,p[0],p[2]-.00001);
  return {point:p,windowDistance,hit,deltaY:hit?hit.point[1]-p[1]:null};
 });
 const defects=samples.filter(s=>s.windowDistance>.0005||s.deltaY===null||Math.abs(s.deltaY)>.0005);
 return {pass:samples.length>=9&&defects.length===0,boundarySource:declared?'asset declaration verified against mesh':'actual rear-window row',toleranceM:.0005,sampled:samples.length,defects,samples};
}

export function hoodNormalReport(model){
 const hood=model.geometries.filter(g=>g.name==='Driver_hood'&&g.material==='Paint'),defects=[];let inspected=0,maxAngleDeg=0;
 for(const g of hood)for(const t of g.triangles){
  const center=t.a.clone().add(t.b).add(t.c).divideScalar(3);
  if(t.area<1e-10)continue;
  inspected++;
  const angles=t.ids.map(i=>g.normals[i]?Math.acos(clamp(t.normal.dot(g.normals[i])))*180/Math.PI:180),angle=Math.max(...angles);
  maxAngleDeg=Math.max(maxAngleDeg,angle);
  if(angle>90)defects.push({name:g.name,face:t.index,center:center.toArray(),angleDeg:angle});
 }
 return {pass:inspected>10&&defects.length===0,inspected,maxAngleDeg,defects};
}

/** A valid underside is below the upward exterior by a real shell thickness.
 * Reject downward-facing sheets above/within .5 mm of it, not normal panel backs. */
export function hoodShellReport(model){
 const hood=model.geometries.filter(g=>g.name==='Driver_hood'),samples=[];
 for(const x of[-.65,-.35,0,.35,.65])for(const z of[.90,1,1.2,1.42,1.65]){
  const layers=hits(hood,[x,1.5,z],[0,-1,0],{epsilon:1e-9}),outer=layers.find(h=>h.normal[1]>.5&&h.material==='Paint');
  const reversed=outer?layers.filter(h=>h.normal[1]<-.5&&h.point[1]>=outer.point[1]-.0005):[];
  samples.push({x,z,outer,reversed});
 }
 const missing=samples.filter(s=>!s.outer),defects=samples.filter(s=>s.reversed.length);
 return {pass:missing.length===0&&defects.length===0,sampled:samples.length,minimumSeparationM:.0005,missing,defects,samples};
}

/** Scan the full exported hood footprint, including the formerly unchecked nose.
 * Empty samples outside the skin are not holes by assertion; all actual layers
 * must have an upward exterior and no reversed sheet above or nearly on it. */
export function wholeHoodShellReport(model){
 const hood=model.geometries.filter(g=>g.name==='Driver_hood'),box=new THREE.Box3();
 for(const g of hood)box.union(g.box);
 const samples=[],defects=[];
 if(box.isEmpty())return {pass:false,sampled:0,defects:[{reason:'Missing Driver_hood'}]};
 for(let ix=0;ix<29;ix++)for(let iz=0;iz<37;iz++){
  const x=box.min.x+(box.max.x-box.min.x)*(ix+.5)/29,z=box.min.z+(box.max.z-box.min.z)*(iz+.5)/37;
  const layers=hits(hood,[x,box.max.y+1,z],[0,-1,0],{epsilon:1e-8});
  if(!layers.length)continue;
  const outer=layers.find(h=>h.normal[1]>.25&&h.material==='Paint');
  const reversed=outer?layers.filter(h=>h.normal[1]<-.25&&h.point[1]>=outer.point[1]-.0005):layers;
  const sample={x,z,outer:outer??null,reversed};samples.push(sample);
  if(!outer||reversed.length)defects.push(sample);
 }
 return {pass:samples.length>=100&&defects.length===0,sampled:samples.length,minimumSeparationM:.0005,defects};
}

const expectedWheels=[
 {name:'Wheel_FL',translation:[.871874988079071,.39701804518699646,1.3882187604904175],tireRadius:.39040625,tireWidth:.2325},
 {name:'Wheel_FR',translation:[-.871874988079071,.39701804518699646,1.3882187604904175],tireRadius:.39040625,tireWidth:.2325},
 {name:'Wheel_RL',translation:[.871874988079071,.3902367949485779,-1.3388124704360962],tireRadius:.38769375,tireWidth:.2325},
 {name:'Wheel_RR',translation:[-.871874988079071,.3902367949485779,-1.3388124704360962],tireRadius:.38769375,tireWidth:.2325},
];
/** Frozen f36cc7e axle package; never derive expected positions from a candidate. */
export function wheelPreservationReport(model){
 const actual=model.nodes.filter(n=>n.name?.startsWith('Wheel_')),samples=[],defects=[];
 for(const expected of expectedWheels){
  const found=actual.filter(n=>n.name===expected.name),node=found[0],sample={name:expected.name,expected,actual:node??null,reasons:[]};
  if(found.length!==1)sample.reasons.push('Exactly one named wheel pivot required');
  if(node){
   if(!model.roots.includes(model.nodes.indexOf(node))||node.mesh!==undefined)sample.reasons.push('Wheel must remain a root Empty');
   if(node.matrix||node.rotation?.some((v,i)=>Math.abs(v-[0,0,0,1][i])>1e-7)||node.scale?.some(v=>Math.abs(v-1)>1e-7))sample.reasons.push('Wheel transform changed');
   if(!Array.isArray(node.translation)||node.translation.some((v,i)=>!Number.isFinite(v)||Math.abs(v-expected.translation[i])>1e-6))sample.reasons.push('Axle position drift exceeds 1 micrometre');
   for(const field of['tireRadius','tireWidth'])if(!Number.isFinite(node.extras?.[field])||Math.abs(node.extras[field]-expected[field])>1e-7)sample.reasons.push(field+' changed');
  }
  samples.push(sample);if(sample.reasons.length)defects.push(sample);
 }
 if(actual.length!==4)defects.push({reason:'Exactly four wheel pivots required',count:actual.length});
 return {pass:defects.length===0,source:'Frozen f36cc7e baseline wheelNodes',positionToleranceM:1e-6,defects,samples};
}

/** Shared assembly metadata is useful only if it describes the exported mesh.
 * Distance is measured against actual triangles, never the generator formula. */
export function assemblyBoundaryReport(model){
 const d=model.declaration,samples=[],defects=[];
 if(!d||d.coordinateSpace!=='vehicle-local-game-xyz'||d.units!=='m'||d.version!==1)return {pass:false,defects:[{reason:'Missing or unsupported assembly coordinate contract'}],samples};
 const targets=[['windscreenLower','Window windscreen'],['windscreenLower','Driver_cowl'],['windscreenUpper','Window windscreen'],['hoodRear','Driver_hood'],['rearWindowLower','Window rear']];
 for(const [field,name]of targets){
  const points=d[field],surface=model.geometries.filter(g=>g.name===name);
  if(!Array.isArray(points)||points.length<9){defects.push({field,reason:'Boundary requires at least nine samples'});continue;}
  let lastX=-Infinity;
  for(const point of points){
   const valid=Array.isArray(point)&&point.length===3&&point.every(Number.isFinite);
   const distance=valid?distanceToSurface(point,surface):Infinity;
   const sample={field,name,point,distance,ordered:valid&&point[0]>lastX};samples.push(sample);
   if(!valid||distance>.0005||!sample.ordered)defects.push(sample);
   if(valid)lastX=point[0];
  }
  if(!(points[0]?.[0]<-.5&&points.at(-1)?.[0]>.5))defects.push({field,reason:'Boundary must cover both sides, not repeat one point'});
 }
 return {pass:defects.length===0,toleranceM:.0005,defects,samples};
}

export function tailLensReport(model){
 const lenses=model.geometries.filter(g=>g.material==='Tail'),edges=new Map(),points=new Map();
 for(const g of lenses)for(const t of g.triangles){
  const ids=[t.a,t.b,t.c].map(p=>{const k=key(p);points.set(k,p);return k;});
  for(let i=0;i<3;i++){
   const a=ids[i],b=ids[(i+1)%3];if(a===b)continue;
   const k=[a,b].sort().join('|'),edge=edges.get(k)||{count:0,balance:0};edge.count++;edge.balance+=a<b?1:-1;edges.set(k,edge);
  }
 }
 const boundary=[...edges.values()].filter(e=>e.count===1).length,nonmanifold=[...edges.values()].filter(e=>e.count>2).length,inconsistent=[...edges.values()].filter(e=>e.count===2&&e.balance!==0).length;
 const front=lenses.flatMap(g=>g.triangles.filter(t=>t.normal.z<-.5&&t.area>1e-9).map(t=>t.a.clone().add(t.b).add(t.c).divideScalar(3))).sort((a,b)=>a.x-b.x);
 const samples=[];
 for(let i=0;i<Math.min(9,front.length);i++){
  const p=front[Math.floor((i+.5)*front.length/Math.min(9,front.length))],layers=hits(lenses,[p.x,p.y,-3],[0,0,1]),entry=layers.find(h=>h.normal[2]<-.1),exit=entry&&layers.find(h=>h.normal[2]>.1&&h.distance>entry.distance+1e-5);
  samples.push({point:p.toArray(),thickness:exit?exit.distance-entry.distance:null});
 }
 const thin=samples.filter(s=>s.thickness===null||s.thickness<.001);
 return {pass:lenses.length>0&&boundary===0&&nonmanifold===0&&inconsistent===0&&samples.length>=3&&thin.length===0,primitives:lenses.length,triangles:lenses.reduce((n,g)=>n+g.triangles.length,0),boundaryEdges:boundary,nonmanifoldEdges:nonmanifold,inconsistentEdges:inconsistent,minimumThicknessM:.001,thin,samples};
}

/** Sample inside each actual exhaust opening. An external valance/paint sheet
 * must not be the first visible surface; independent deep bore caps are valid. */
export function exhaustOpeningReport(model){
 const surfaces=model.geometries.filter(g=>!g.name.startsWith('Wheel_'));
 const declared=model.declaration?.exhaustAxes;
 const axes=Array.isArray(declared)?declared:[{center:[-.68,.355,-2.335],direction:[0,0,1]},{center:[.68,.355,-2.335],direction:[0,0,1]}];
 const interiorNames=new Set(['Exhaust interior left','Exhaust interior right','Rear exhaust left','Rear exhaust right']);
 const role=model.declaration?.roles?.exhaustInterior;if(typeof role==='string')interiorNames.add(role);if(Array.isArray(role))role.forEach(n=>interiorNames.add(n));
 const samples=[];
 for(const axis of axes){
  const center=axis.center??axis.point,dir=V(axis.direction??[0,0,1]).normalize(),u=V([1,0,0]).addScaledVector(dir,-dir.x).normalize(),v=dir.clone().cross(u).normalize();
  // Measure from the actual metal lip: a shallow cap with an interior name fails.
  const lipPoints=surfaces.filter(g=>g.material==='Exhaust brushed alloy').flatMap(g=>g.points).filter(p=>{
   const relative=p.clone().sub(V(center));return relative.clone().addScaledVector(dir,-relative.dot(dir)).length()<.10;
  });
  const lipProjection=Math.min(...lipPoints.map(p=>p.dot(dir)));
  for(const [du,dv]of[[0,0],[.015,0],[-.015,0],[0,.015],[0,-.015]]){
   const origin=V(center).addScaledVector(dir,-.25).addScaledVector(u,du).addScaledVector(v,dv),hit=hits(surfaces,origin.toArray(),dir.toArray(),{frontOnly:true})[0]??null;
   const cavityDepth=hit?V(hit.point).dot(dir)-lipProjection:null;
   samples.push({axis:center,offset:[du,dv],hit,cavityDepth,accepted:!!hit&&Number.isFinite(lipProjection)&&cavityDepth>=.06&&interiorNames.has(hit.name)});
  }
 }
 const defects=samples.filter(s=>!s.accepted);
 return {pass:axes.length===2&&samples.length===10&&defects.length===0,sampled:samples.length,minimumCavityDepthM:.06,defects,samples};
}

export function validateVehicleRebuild(path){
 const model=readVehicleGeometry(path),checks={
  rearShoulderShape:rearShoulderShapeReport(model),rearWindowBoundary:rearWindowBoundaryReport(model),
  hoodNormals:hoodNormalReport(model),hoodShell:hoodShellReport(model),wholeHoodShell:wholeHoodShellReport(model),assemblyBoundaries:assemblyBoundaryReport(model),wheelPreservation:wheelPreservationReport(model),tailLens:tailLensReport(model),exhaustOpenings:exhaustOpeningReport(model),
 };
 return {asset:path,sha256:model.sha256,bytes:model.bytes,pass:Object.values(checks).every(c=>c.pass),failed:Object.entries(checks).filter(([,c])=>!c.pass).map(([id])=>id),checks,limitations:[
  'Local fixed samples cover confirmed defects, not the entire vehicle or every possible styling problem.',
  'Rear crowns may be convex; tests reject local gutters/rebounds, not nonzero curvature.',
  'Only the optical lens is required to be a closed solid; separate vehicle panels need not be welded together.',
  'Image-based reflection and multi-angle visual review remain necessary after geometry passes.',
 ]};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=validateVehicleRebuild(process.argv[2]||'public/models/solstice-lux-gt.glb'),outIndex=process.argv.indexOf('--out');
 if(outIndex>=0)fs.writeFileSync(process.argv[outIndex+1],JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({asset:result.asset,sha256:result.sha256,pass:result.pass,failed:result.failed,checks:Object.fromEntries(Object.entries(result.checks).map(([id,c])=>[id,{pass:c.pass,defects:c.defects?.length,dips:c.dips?.length,rebounds:c.rebounds?.length,missing:c.missing?.length,boundaryEdges:c.boundaryEdges,thin:c.thin?.length}]))},null,2));
 if(!result.pass)process.exitCode=1;
}
