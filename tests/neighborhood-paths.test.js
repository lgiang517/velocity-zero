import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CoastTrack} from '../src/track.js';
import {buildCoastalTerrain} from '../src/terrain.js';
import {buildRoadsideBuildings} from '../src/roadside-buildings.js';
import {buildNeighborhoodPaths} from '../src/neighborhood-paths.js';
import {buildNeighborhood} from '../src/neighborhood.js';

const world={scene:new THREE.Scene(),track:new CoastTrack({legacy:true}),quality:'balanced'};
buildCoastalTerrain(world);
const sample=world.track.samples.filter((_,i)=>i%4===0);
function roadDistance(p){let best=Infinity;for(let i=1;i<sample.length;i++){const a=sample[i-1].p,b=sample[i].p,dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));best=Math.min(best,Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz));}return best;}
const sites=buildRoadsideBuildings(world,{land(s,lateral,radius){const p=world.track.point(s,lateral);if(roadDistance(p)<14.7+radius)return null;p.y=world.groundHeight(p.x,p.z);return p;}});
const neighborhood=buildNeighborhood(world,sites),paths=neighborhood.paths,meshes=world.scene.children.filter(mesh=>mesh.name.startsWith('Neighborhood'));
world.scene.updateMatrixWorld(true);

test('real homes share two connected neighborhood networks instead of disconnected door pads',()=>{
 assert.equal(paths.routes.length,2);assert.equal(paths.frontages.length,sites.length);assert.ok(sites.length>=15);
 assert.deepEqual(paths.routes.flatMap(route=>route.siteIds).sort((a,b)=>a-b),sites.map(site=>site.id).sort((a,b)=>a-b));
 assert.ok(paths.stats.sidewalkMetres>1300&&paths.stats.sidewalkMetres<1600);
 for(const route of paths.routes){assert.ok(route.length>8);assert.ok(route.points.length>2);for(const p of route.points){assert.ok(Number.isFinite(p.y));assert.ok(roadDistance(p)>14.4);assert.ok(paths.containsPoint(p.x,p.z));}}
 assert.ok(paths.stats.triangles<35000);assert.ok(paths.stats.batches<=30);
});

test('walking route centres and every entrance junction coincide with real paving faces',()=>{
 const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0),paving=meshes.filter(mesh=>mesh.name.startsWith('Neighborhood paving'));
 const points=[...paths.routes.flatMap(route=>route.points.slice(0,-1).filter((_,i)=>i%5===0).map((p,i)=>p.clone().lerp(route.points[i*5+1],.5))),...paths.frontages.map(front=>front.sidewalkPoint)];
 for(const p of points){ray.set(p.clone().add(new THREE.Vector3(0,5,0)),down);const hit=ray.intersectObjects(paving,false)[0];assert.ok(hit,'walking route must have a physical paving top');assert.ok(Math.abs(hit.point.y-p.y)<.002,'route foot height must match the rendered ribbon');}
});

test('approaches attach to the existing stairs with bounded risers and solid terrain footings',()=>{
 for(const front of paths.frontages){
  const site=sites.find(site=>site.id===front.siteId),points=front.approachPoints;
  assert.equal(paths.routes[front.routeIndex].siteIds.includes(front.siteId),true);
  assert.ok(points.at(-1).distanceTo(front.sidewalkPoint)<.00001);
  assert.ok(Math.abs(points.at(-2).y-front.sidewalkPoint.y)<.002,'outer curb must have a flush entrance gap');
  for(let i=1;i<points.length;i++)assert.ok(Math.abs(points[i].y-points[i-1].y)<=.161,'human-scale continuous stair risers');
  const local=points[0].clone().sub(site.p).applyAxisAngle(new THREE.Vector3(0,1,0),-site.heading);
  const endY=world.groundHeight(front.entryPoint.x,front.entryPoint.z)-site.p.y+.12;
  const count=Math.max(2,Math.min(18,Math.ceil((.12-endY)/.18))),run=4.35/count;
  const step=Math.max(0,Math.min(count-1,Math.floor((local.z-site.plotD/2)/run)));
  const oldTop=site.p.y+.12+Math.min(0,endY-.12)*(step+1)/count;
  assert.ok(Math.abs(points[0].y-oldTop)<.20,'new landing must meet, not jump above, an existing tread');
 }
 for(const mesh of meshes.filter(mesh=>mesh.name.startsWith('Neighborhood paving'))){const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal;for(let i=0;i<p.count;i++){if(n.getY(i)>-.9)continue;assert.ok(p.getY(i)<world.groundHeight(p.getX(i),p.getZ(i))+.02,'closed underside remains embedded in the ground');}}
});

test('footpath exclusion is restricted to paving and cannot consume the driving road',()=>{
 for(const front of paths.frontages){for(const p of front.approachPoints)assert.ok(paths.containsPoint(p.x,p.z));const site=sites.find(site=>site.id===front.siteId),road=world.track.point(site.s);assert.equal(paths.containsPoint(road.x,road.z,3),false);}
 for(const mesh of meshes){const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i+=36){assert.ok(roadDistance(new THREE.Vector3(p.getX(i),p.getY(i),p.getZ(i)))>13.2,'every batch remains outside the rail and driving envelope');}}
 assert.equal(buildNeighborhoodPaths(world,[]).containsPoint(0,0,100),false);
});

test('neighborhood runtime keeps sidewalks and everyday props without residents or their shadows',()=>{
 assert.ok(neighborhood.stats.paths.sidewalkMetres>0);
 assert.ok(neighborhood.stats.props.benches>0);
 assert.ok(neighborhood.stats.props.planters>0);
 const camera=new THREE.PerspectiveCamera();camera.position.copy(paths.routes[0].points[0]);
 for(const quality of ['low','balanced','high'])neighborhood.update(camera,100,quality);
 assert.ok(neighborhood.stats.props.visibleBatches>0);
 assert.deepEqual(neighborhood.stats.people,{routes:0,residents:0,active:0,maxActive:0,drawCalls:0,triangles:0,matrixUpdates:0,shadowCasters:false});
 assert.equal(world.scene.getObjectByName('Neighborhood residents'),undefined);
 assert.equal(world.scene.getObjectByName('Resident contact shadows'),undefined);
});
