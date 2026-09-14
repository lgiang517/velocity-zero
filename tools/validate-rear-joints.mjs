import * as THREE from 'three';

const shoulderNames=new Set(['Lux continuous body','Continuous canopy shoulder transition','Rear deck','Body side left','Body side right','Canopy sill left','Canopy sill right']);

function sampleLayers(skins,widths,startZ,rows,step){
 const samples=[],overlaps=[],internalReturns=[];
 for(const side of[-1,1])for(const width of widths)for(let row=0;row<rows;row++){
  const x=side*width,z=startZ-row*step,ray=new THREE.Ray(new THREE.Vector3(x,1.5,z),new THREE.Vector3(0,-1,0)),hits=[];
  for(const skin of skins)for(let i=0;i<skin.indices.length;i+=3){
   const point=ray.intersectTriangle(skin.points[skin.indices[i]],skin.points[skin.indices[i+1]],skin.points[skin.indices[i+2]],true,new THREE.Vector3());
   if(point&&point.y>.68&&point.y<1.15){
    const a=skin.points[skin.indices[i]],b=skin.points[skin.indices[i+1]],c=skin.points[skin.indices[i+2]],normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    hits.push({y:point.y,name:skin.name,normal:normal.toArray()});
   }
  }
  hits.sort((a,b)=>b.y-a.y);
  // A closed rear bumper has a front-facing (+Z) internal return under
  // the deck. It is not another outward skin. Never exempt an upward
  // deck duplicate, the bumper's rear-facing exterior, or a return above it.
  const exterior=hits.filter(hit=>{
   const backing=hit.name==='Rear bumper'&&hit.normal[2]>0&&hits.some(top=>top.y>hit.y&&shoulderNames.has(top.name));
   if(backing)internalReturns.push({x,z,...hit});return !backing;
  });
  const layers=exterior.filter((hit,index)=>index===0||Math.abs(hit.y-exterior[index-1].y)>.0001);
  const sample={x,z,layers};samples.push(sample);if(layers.length>1)overlaps.push(sample);
 }
 return {sampled:samples.length,covered:samples.filter(s=>s.layers.length>0).length,overlaps,internalReturns,samples};
}

/** Sample the known rear-quarter cover intersections. Back-face culling excludes
 * a solid panel's underside; coincident triangle-edge hits are deduplicated.
 * These local rays do not establish watertightness for the entire vehicle. */
export function rearSkinLayerReport(report) {
 const skins=report.geometries.filter(g=>g.material==='Paint'&&!g.name.startsWith('Wheel_'));
 return sampleLayers(skins,[.92,.94,.95,.96],-1.71,24,.02);
}

/** The old source return can form an upward-facing knife edge ahead of the deck
 * samples. Include the structural shoulder connector, while excluding the fixed window frame. */
export function rearShoulderLayerReport(report) {
 const skins=report.geometries.filter(g=>g.material==='Paint'&&shoulderNames.has(g.name));
 return sampleLayers(skins,[.91,.92,.94,.95,.96,.97,.98,1.0],-1.56,19,.01);
}

/** Check the repaired shoulder crown at the two sections where the welded
 * connector previously sagged into a visible gutter. A top skin may bulge
 * above its endpoints, but must not dip more than 1 mm below their chord. */
export function rearShoulderCrownReport(report) {
 const skins=report.geometries.filter(g=>g.material==='Paint'&&shoulderNames.has(g.name));
 const result=sampleLayers(skins,[.84,.86,.88,.90,.92,.94,.96,.98],-1,2,.2),sections=[],missing=[],dips=[];
 for(const side of[-1,1])for(const z of[-1,-1.2]){
  const samples=result.samples.filter(s=>Math.sign(s.x)===side&&Math.abs(s.z-z)<1e-6).sort((a,b)=>Math.abs(a.x)-Math.abs(b.x));
  for(const sample of samples)if(!sample.layers.length)missing.push({x:sample.x,z});
  if(samples.some(s=>!s.layers.length))continue;
  const first=samples[0],last=samples.at(-1),points=samples.slice(1,-1).map(s=>{
   const t=(Math.abs(s.x)-Math.abs(first.x))/(Math.abs(last.x)-Math.abs(first.x));
   const clearance=s.layers[0].y-(first.layers[0].y*(1-t)+last.layers[0].y*t);
   return {x:s.x,z,clearance};
  });
  sections.push({side,z,points});dips.push(...points.filter(p=>p.clearance<-.001));
 }
 return {sampled:result.sampled,sections,missing,dips};
}

/** Oblique rear rays cover the exposed C-pillar end faces. Vertical-only
 * sampling missed these nearly vertical faces when they retained cabin lining. */
export function rearCpillarFinishReport(report) {
 const targets=[[.86755,.90813,-1.69990],[.87515,.90181,-1.69988],[.88013,.89693,-1.69982],[.88787,.89264,-1.69989]],samples=[];
 const surfaces=report.geometries.filter(g=>g.material!=='Window glass'&&!g.name.startsWith('Wheel_'));
 for(const side of[-1,1])for(const [x,y,z]of targets){
  const origin=new THREE.Vector3(side*2.7,1.7,-3.5),target=new THREE.Vector3(side*x,y,z),ray=new THREE.Ray(origin,target.clone().sub(origin).normalize());
  let nearest=null;
  for(const g of surfaces)for(let i=0;i<g.indices.length;i+=3){
   const point=ray.intersectTriangle(g.points[g.indices[i]],g.points[g.indices[i+1]],g.points[g.indices[i+2]],true,new THREE.Vector3());
   if(point){const distance=point.distanceTo(origin);if(!nearest||distance<nearest.distance)nearest={name:g.name,material:g.material,distance,point:point.toArray()};}
  }
  samples.push({target:target.toArray(),hit:nearest});
 }
 return {sampled:samples.length,samples,defects:samples.filter(s=>s.hit?.material!=='Paint')};
}
