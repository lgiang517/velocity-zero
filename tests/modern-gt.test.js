import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readVehicleGeometry} from '../tools/validate-vehicle-rebuild.mjs';
const model=readVehicleGeometry(process.env.VEHICLE_REBUILD_GLB||'public/models/solstice-lux-gt.glb');
function firstHit(origin,direction,geometries=model.geometries){
 const ray=new THREE.Ray(new THREE.Vector3(...origin),new THREE.Vector3(...direction));let nearest=null;
 for(const g of geometries){if(!ray.intersectsBox(g.box))continue;for(const t of g.triangles){const point=ray.intersectTriangle(t.a,t.b,t.c,true,new THREE.Vector3());if(point){const distance=point.distanceTo(ray.origin);if(!nearest||distance<nearest.distance)nearest={name:g.name,point,distance};}}}
 return nearest;
}
test('modern GT rear keeps the flatter deck and broad wheel haunch without freezing exact styling',()=>{
 assert.equal(model.declaration.stylingVersion,2);
 const tail=firstHit([0,2,-2.265],[0,-1,0]);assert.equal(tail?.name,'Rear deck');
 assert.ok(tail.point.y>.865&&tail.point.y<.98,'Rear deck reverted to the old 149 mm droop');
 const points=model.geometries.filter(g=>g.name.startsWith('Body side')||g.name.startsWith('Canopy sill')).flatMap(g=>g.points).filter(p=>Math.abs(p.z+1.30)<.09&&p.y>.70);
 const width=Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x));assert.ok(width>2.12&&width<2.22,'Rear wheel haunch lost the agreed broad GT volume');
});
test('the complete physical rear plate stays visible above the formed bumper pocket',()=>{
 const plate=model.geometries.filter(g=>g.name.startsWith('Rear physical')&&g.material==='Plate');assert.ok(plate.length);
 const box=new THREE.Box3();for(const g of plate)box.union(g.box);
 for(const u of [.12,.3,.5,.7,.88])for(const v of [.2,.5,.8]){
  const x=THREE.MathUtils.lerp(box.min.x,box.max.x,u),y=THREE.MathUtils.lerp(box.min.y,box.max.y,v);
  const hit=firstHit([x,y,-4],[0,0,1]);assert.ok(hit?.name.startsWith('Rear physical'),`Body hides plate at ${x},${y}: ${hit?.name}`);
 }
});
test('rear canopy shaping leaves every retained front driving-interface vertex fixed',()=>{
 const source=readVehicleGeometry('art/lux3d/aholo-gt-package.glb');let checked=0;
 for(const original of source.geometries.filter(g=>g.name.startsWith('Window ')||g.name==='Unified canopy roof')){
  const current=model.geometries.filter(g=>g.name===original.name).flatMap(g=>g.points);assert.ok(current.length);
  for(const p of original.points.filter(p=>p.z>=-.39999)){
   assert.ok(current.some(q=>p.distanceToSquared(q)<1e-10),`${original.name} moved a front cabin interface`);checked++;
  }
 }
 assert.ok(checked>100);
});
