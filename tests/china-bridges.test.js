import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CoastTrack} from '../src/track.js';
import {BARRIER} from '../src/road-boundaries.js';
import {buildCoastalTerrain} from '../src/terrain.js';
import {buildChinaTerrain} from '../src/china-terrain.js';
import {buildChinaBridges,CHINA_BRIDGE_KINDS} from '../src/china-bridges.js';

const track=new CoastTrack();
function nearest(p,start=0,end=track.length){
 let best={distance:Infinity};
 const from=Math.max(0,Math.floor(start/track.step)-2),to=Math.min(track.samples.length-1,Math.ceil(end/track.step)+2);
 for(let i=from;i<to;i++){
  const a=track.samples[i].p,b=track.samples[i+1].p,dx=b.x-a.x,dz=b.z-a.z;
  const f=THREE.MathUtils.clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz),0,1),x=a.x+dx*f,z=a.z+dz*f,distance=Math.hypot(p.x-x,p.z-z);
  if(distance<best.distance)best={distance,height:a.y+(b.y-a.y)*f,s:(i+f)*track.step};
 }
 return best;
}
const world={scene:new THREE.Scene(),track,groundHeight:()=>-22},bridges=buildChinaBridges(world);
bridges.group.updateMatrixWorld(true);

test('bridge modules use metre-based named sections and the seven real HZMB tower identities',()=>{
 const hzmb=track.section('hzmb'),sichuan=track.section('sichuan');
 assert.ok(track.length>13000);assert.ok(hzmb.length>=2900);assert.ok(sichuan.length>1200);
 assert.deepEqual(CHINA_BRIDGE_KINDS,{jiuzhou:'sail',jianghai:'dolphin',qingzhou:'chinese-knot',sichuan:'suspension'});
 const towers=bridges.metadata.towers.filter(t=>t.name==='hzmb');
 assert.deepEqual(towers.map(t=>t.kind),['sail','sail','dolphin','dolphin','dolphin','chinese-knot','chinese-knot']);
 assert.deepEqual(bridges.metadata.navigationSpans.map(s=>s.mainSpans),[[268],[258,258],[458]]);
 for(const t of towers)assert.ok(t.s>hzmb.startS&&t.s<hzmb.endS);
 assert.equal(bridges.metadata.knots.length,2);assert.ok(bridges.metadata.knots.every(k=>k.closedEye&&k.curvedStrands===2));
});

test('bridge structures remain static, spatially batched and free of new lights or texture loads',()=>{
 assert.ok(bridges.stats.triangles<140000);assert.ok(bridges.stats.batches<=95);
 assert.equal(bridges.stats.textureCount,0);assert.equal(bridges.stats.lights,0);assert.ok(!('update' in bridges));
 assert.ok(bridges.group.children.every(m=>m.geometry.attributes.position.array.every(Number.isFinite)));
 assert.ok(bridges.group.children.filter(m=>m.castShadow).length<=3);
 assert.ok(bridges.group.children.every(m=>!m.material.map));
});

test('low cable segments either remain inside the median or outside the playable carriageway',()=>{
 for(const cable of bridges.metadata.cables){
  const a=new THREE.Vector3(...cable.start),b=new THREE.Vector3(...cable.end),station=cable.anchorS,other=cable.towerS??station;
  for(let i=0;i<=60;i++){
   const p=a.clone().lerp(b,i/60),road=nearest(p,Math.min(station,other)-20,Math.max(station,other)+20);
   if(p.y-road.height>8)continue;
   if(cable.zone==='median')assert.ok(road.distance+cable.radius<track.sample(road.s).medianHalfWidth,`${cable.name} stay escapes centre barrier at ${road.s}`);
   else assert.ok(road.distance-cable.radius>track.roadProfile(road.s).barrierOffset+BARRIER.halfThickness+.2,`${cable.name} enters road clear envelope`);
  }
 }
 for(const t of bridges.metadata.towers){
  if(t.median)assert.ok(t.width/2<=1.25);else{assert.ok(t.lateral-t.width/2>track.roadProfile(t.s).barrierOffset+BARRIER.halfThickness+.35);assert.ok(t.crossbeamBottom>9);}
 }
});

test('Xingkang has a 700 metre clear main span, two sagging main cables and vertical hangers',()=>{
 const section=bridges.metadata.sections.find(s=>s.name==='sichuan'),a=section.mainSpanStart,b=section.mainSpanEnd;
 assert.ok(b-a>=650);assert.equal(b-a,700);
 assert.equal(bridges.metadata.towers.filter(t=>t.name==='sichuan').length,2);
 assert.equal(bridges.metadata.mainCables.length,2);assert.ok(bridges.stats.suspensionHangers>=90);
 assert.ok(bridges.metadata.piers.every(p=>!(p.s>a+.01&&p.s<b-.01)),'no false column in the suspension opening');
 assert.equal(bridges.metadata.anchorages.length,4);
 for(const cable of bridges.metadata.mainCables){
  const midpoint=new THREE.Vector3(...cable.points[64]),road=nearest(midpoint,a,b);
  assert.ok(midpoint.y-road.height<25,'centre must sag well below the tower saddle');
  assert.ok(midpoint.y-road.height>15,'sag must leave vertical road clearance');
  for(const point of cable.points){const p=new THREE.Vector3(...point),road=nearest(p,cable.startS,cable.endS);assert.ok(road.distance>.99*BARRIER.offset);}
 }
 for(const hanger of bridges.metadata.cables.filter(c=>c.kind==='hanger')){
  assert.ok(Math.abs(hanger.start[0]-hanger.end[0])<1e-8);assert.ok(Math.abs(hanger.start[2]-hanger.end[2])<1e-8);assert.ok(hanger.end[1]>hanger.start[1]);
 }
});

test('both elevated connecting roads receive continuous girder support and approach foundations',()=>{
 for(const section of track.sections.filter(s=>s.id==='connector'&&s.elevated)){
  const name=section.kind,slabs=bridges.metadata.decks.filter(s=>s.name===name);
  assert.ok(Math.abs(slabs[0].start-section.startS)<1e-6);assert.ok(Math.abs(slabs.at(-1).end-section.endS)<1e-6);
  for(let i=1;i<slabs.length;i++)assert.ok(Math.abs(slabs[i-1].end-slabs[i].start)<1e-6);
  assert.ok(bridges.metadata.piers.filter(p=>p.name===name+'-approach').length>20);
 }
});

test('assembled girder geometry stays beneath road lanes on the bridges and graded connections',()=>{
 const ray=new THREE.Raycaster();
 for(const section of bridges.metadata.sections)for(let s=section.start+5;s<section.end-5;s+=43)for(const lateral of[-.87,-.43,.43,.87].map(f=>f*track.roadProfile(s).asphaltHalfWidth)){
  const p=track.point(s,lateral);ray.set(p.clone().add(new THREE.Vector3(0,.01,0)),new THREE.Vector3(0,-1,0));ray.far=8;
  const hit=ray.intersectObjects(bridges.group.children,false)[0];
  assert.ok(hit,`missing girder beneath ${section.name} at ${s}`);assert.ok(hit.point.y<p.y-.1,`girder rises through ${section.name} asphalt`);
 }
});

function renderedGround(w,x,z){
 if(w.chinaTerrain?.meshes){const ray=new THREE.Raycaster(new THREE.Vector3(x,10000,z),new THREE.Vector3(0,-1,0),0,20000),hit=ray.intersectObjects(w.chinaTerrain.meshes,false)[0];if(hit)return hit.point.y;}
 const f=w.coastalHeightField;if(!f||x<f.bounds.x||x>f.bounds.x+f.bounds.z||z<f.bounds.y||z>f.bounds.y+f.bounds.w)return w.groundHeight(x,z);
 const {texture,bounds:b,size}=f,data=texture.image.data,gx=(x-b.x)/b.z*(size.x-1),gz=(z-b.y)/b.w*(size.y-1),ix=Math.min(size.x-2,Math.floor(gx)),iz=Math.min(size.y-2,Math.floor(gz)),u=gx-ix,v=gz-iz;
 const at=(dx,dz)=>{const k=((iz+dz)*size.x+ix+dx)*4;return (data[k]*256+data[k+1])*512/65535-32;};
 return u+v<=1?at(0,0)*(1-u-v)+at(1,0)*u+at(0,1)*v:at(1,1)*(u+v-1)+at(1,0)*(1-v)+at(0,1)*(1-u);
}
const productionWorld={scene:new THREE.Scene(),track:new CoastTrack(),uniforms:{}};
buildCoastalTerrain(productionWorld);buildChinaTerrain(productionWorld);const productionBridges=buildChinaBridges(productionWorld);productionBridges.group.updateMatrixWorld(true);

test('production foundations embed into visible terrain, also outside the original coastal height texture',()=>{
 const ray=new THREE.Raycaster(),up=new THREE.Vector3(0,1,0);let outside=0;
 for(const p of productionBridges.metadata.piers){
  const floor=renderedGround(productionWorld,p.center[0],p.center[2]);
  assert.ok(p.bottom<floor-.1,`pier floats at ${p.s}`);assert.ok(p.bottom<p.footingTop-.5);assert.ok(p.top>p.bottom);
  const q=track.sample(p.s),bounds=productionWorld.coastalHeightField.bounds;
  if(p.center[0]<bounds.x||p.center[2]<bounds.y)outside++;
  for(const sx of[-1,0,1])for(const sz of[-1,0,1]){
   const offset=new THREE.Vector3(sx*((p.width+2.2)/2-.08),0,sz*((p.depth+2.2)/2-.08)).applyAxisAngle(up,q.heading),x=p.center[0]+offset.x,z=p.center[2]+offset.z,ground=renderedGround(productionWorld,x,z);
   ray.set(new THREE.Vector3(x,ground-100,z),up);ray.far=300;const hit=ray.intersectObjects(productionBridges.group.children,false)[0];
   assert.ok(hit&&hit.point.y<ground-.1,`footing floats at ${p.s}, ${p.lateral}, corner ${sx}:${sz}`);
  }
 }
 // The new route is intentionally beyond the old island's texture footprint.
 assert.ok(outside>10);assert.ok(productionBridges.metadata.piers.filter(p=>p.terrainSource==='china-mesh').length>100);
});

test('the HZMB box girder covers six lanes and changes width continuously at both connections',()=>{
 const slabs=bridges.metadata.decks.filter(s=>s.name==='hzmb');
 for(const slab of slabs){assert.ok(Math.abs(slab.halfWidthStart-16.55)<1e-8);assert.ok(Math.abs(slab.halfWidthEnd-16.55)<1e-8);}
 for(const connector of track.sections.filter(s=>s.id==='connector'&&s.elevated)){
  const slabs=bridges.metadata.decks.filter(s=>s.name===connector.kind);
  for(let i=1;i<slabs.length;i++)assert.ok(Math.abs(slabs[i].halfWidthStart-slabs[i-1].halfWidthEnd)<1e-8);
 }
 assert.ok(bridges.metadata.towers.filter(t=>t.id==='qingzhou').every(t=>t.lateral===18.2));
 assert.ok(bridges.metadata.cables.filter(c=>c.name==='qingzhou').every(c=>Math.abs(Math.abs(track.sample(c.anchorS).right.dot(new THREE.Vector3(...c.start).sub(track.sample(c.anchorS).p)))-16.1)<1e-7));
});

test('rendered median tapers match collision widths instead of twelve-metre block approximations',()=>{
 const median=bridges.metadata.medians[0],ray=new THREE.Raycaster();
 for(const base of[median.start,median.end-25])for(let offset=.5;offset<25;offset+=.5){
  const s=base+offset,q=track.sample(s),origin=track.point(s,5,.35);ray.set(origin,q.right.clone().negate());ray.far=6;
  const hit=ray.intersectObjects(bridges.group.children,false)[0];assert.ok(hit);
  const actual=hit.point.clone().sub(q.p).dot(q.right);assert.ok(Math.abs(actual-q.medianHalfWidth)<.004,`median mismatch ${actual} vs ${q.medianHalfWidth} at ${s}`);
 }
});

test('bridge lamps use supported geometry without actual point lights, and resources dispose once',()=>{
 assert.ok(bridges.metadata.lamps.every(l=>Math.abs(l.lateral)-l.baseWidth/2>l.barrierOffset+BARRIER.halfThickness));
 assert.equal(world.streetLampFixtures.length,bridges.stats.lamps);assert.equal(world.bridgeLampMaterials.length,1);
 assert.ok(world.bridgeLampMaterials[0].emissive.getHex()>0);
 for(const fixture of world.streetLampFixtures){const q=track.sample(fixture.s),d=fixture.roadPoint.clone().sub(q.p).dot(q.right);assert.ok(Math.abs(fixture.heading-q.heading)<1e-8);assert.ok(Math.abs(fixture.slope-q.slope)<1e-8);assert.ok(Math.abs(d)>q.medianHalfWidth&&Math.abs(d)<track.roadProfile(fixture.s).asphaltHalfWidth);assert.ok(Math.abs(fixture.roadPoint.y-q.p.y-.055)<1e-7);}
 assert.ok(!world.scene.children.some(o=>o.isLight));
 let geometries=0,materials=0;bridges.group.children.forEach(m=>m.geometry.addEventListener('dispose',()=>geometries++));
 const unique=new Set(bridges.group.children.map(m=>m.material));unique.forEach(m=>m.addEventListener('dispose',()=>materials++));
 bridges.dispose();bridges.dispose();assert.equal(geometries,bridges.stats.batches);assert.equal(materials,unique.size);assert.equal(bridges.group.parent,null);assert.equal(world.streetLampFixtures.length,0);assert.equal(world.bridgeLampMaterials.length,0);
});
