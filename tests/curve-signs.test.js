import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CoastTrack} from '../src/track.js';
import {BARRIER} from '../src/road-boundaries.js';
import {buildCurveSigns,planCurveSigns,detectSharpBends,CURVE_SIGN_BUDGET} from '../src/curve-signs.js';
const track=new CoastTrack(),world={scene:new THREE.Scene(),track},result=buildCurveSigns(world);
const wrap=(s,length)=>((s%length)+length)%length;
function nearestRoad(x,z){let best={distance:Infinity,s:0};for(let i=0;i<track.samples.length-1;i+=2){const a=track.samples[i],b=track.samples[Math.min(i+2,track.samples.length-1)],dx=b.p.x-a.p.x,dz=b.p.z-a.p.z,t=Math.max(0,Math.min(1,((x-a.p.x)*dx+(z-a.p.z)*dz)/(dx*dx+dz*dz))),distance=Math.hypot(x-a.p.x-dx*t,z-a.p.z-dz*t);if(distance<best.distance)best={distance,s:a.s+(b.s-a.s)*t};}return best;}

test('all four Duku hairpins and the original mountain pass are detected',()=>{
 const duku=track.section('duku'),dukuBends=result.plan.bends.filter(b=>b.startS>=duku.startS&&b.endS<=duku.endS);
 assert.equal(dukuBends.length,4);assert.ok(dukuBends.every(b=>b.peakCurvature>.016&&b.peakCurvature<.018));
 assert.ok(result.plan.bends.some(b=>b.startS<track.legacyLength*.4));
 const hzmb=track.section('hzmb');assert.ok(result.plan.chevrons.every(s=>s.s<hzmb.startS||s.s>hzmb.endS),'no chevrons on the straight sea bridge');
 assert.equal(result.plan.groups.filter(g=>g.startS>=duku.startS&&g.endS<=duku.endS).length,2,'each pair of nearby U turns shares a winding-road warning');
});

test('advance warnings sit 85m before each bend group for both directions',()=>{
 for(const item of result.plan.warnings){const group=result.plan.groups[item.groupId],expected=item.travel>0?group.startS-85:group.endS+85;assert.ok(Math.abs(wrap(expected,track.length)-item.s)<1e-8);assert.equal(item.leadMetres,85);assert.ok(item.leadMetres>=70&&item.leadMetres<=100);assert.ok(Math.sign(item.lateral)===item.travel);}
 assert.equal(result.plan.warnings.length,result.plan.groups.length*2);
 const synthetic={length:1000,sample:s=>({curvature:s>=200&&s<260?.012:s>=340&&s<410?-.015:s>=600&&s<604?.8:0})};
 const {bends,groups}=detectSharpBends(synthetic);assert.equal(bends.length,2);assert.equal(groups.length,1);assert.equal(groups[0].winding,true,'adjacent opposite bends merge, an isolated spike does not create a warning');
});

test('chevrons occupy the physical outside of each bend and reverse arrows face opposing traffic',()=>{
 for(const item of result.plan.chevrons){const bend=result.plan.bends[item.bendIndex];assert.equal(Math.sign(item.lateral),-bend.turn);assert.equal(item.turn,bend.turn*item.travel);assert.equal(item.icon,item.turn>0?'chevron-right':'chevron-left');}
 for(const item of result.items.filter(i=>i.faceNormal)){
  const q=track.sample(item.s),expected=q.tan.clone();expected.y=0;expected.normalize().multiplyScalar(-item.travel);assert.ok(new THREE.Vector3(...item.faceNormal).dot(expected)>.99999);
 }
 const posts=result.items.filter(i=>i.kind==='post');assert.equal(posts.length,result.stats.chevronPosts+result.stats.warningFaces,'the two chevron faces share one physical pole');
});

test('all signs remain outside the guardrail and high-mounted boards stay above 1.7m',()=>{
 for(const item of result.items){assert.ok(Math.abs(item.lateral)>=item.barrierOffset+.8);if(item.bottomY!==undefined)assert.ok(item.bottomY-track.sample(item.s).p.y>=1.7);}
 for(const mesh of result.meshes){const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++){const nearest=nearestRoad(p.getX(i),p.getZ(i));assert.ok(nearest.distance>BARRIER.offset+BARRIER.halfThickness+.15,`${mesh.name} intrudes: ${nearest.distance}`);}}
 const variableTrack=Object.create(track);variableTrack.roadProfile=s=>({barrierOffset:s<track.length*.5?8.8:12.2});const plan=planCurveSigns(variableTrack);for(const item of [...plan.warnings,...plan.chevrons]){const offset=variableTrack.roadProfile(item.s).barrierOffset;assert.equal(item.barrierOffset,offset);assert.ok(Math.abs(item.lateral)>=offset+.8);}
});

test('all guidance is spatially merged into a small static shared-material budget',()=>{
 assert.ok(result.stats.triangles<3000);assert.ok(result.stats.batches<35);assert.equal(result.stats.newLights,0);assert.equal(result.stats.perFrameUpdates,0);assert.equal(typeof result.update,'undefined');
 const material=result.meshes[0].material;for(const mesh of result.meshes){assert.equal(mesh.material,material);assert.equal(mesh.castShadow,false);assert.equal(mesh.receiveShadow,false);assert.ok(mesh.frustumCulled);assert.ok(mesh.geometry.boundingSphere);}
 assert.ok(material.emissiveIntensity>0&&material.emissiveIntensity<.3);assert.equal(material.side,THREE.FrontSide,'both travel directions have independent artwork rather than mirrored DoubleSide backs');
 assert.equal(CURVE_SIGN_BUDGET.atlasWidth,512);assert.equal(CURVE_SIGN_BUDGET.atlasHeight,256);
});

test('a browser build creates one shared atlas, no external images or per-sign canvases',()=>{
 const previous=globalThis.document;let canvases=0;
 const ctx=new Proxy({}, {get:(target,key)=>target[key]??(()=>{}),set:(target,key,value)=>(target[key]=value,true)});
 globalThis.document={createElement:tag=>{assert.equal(tag,'canvas');canvases++;return{width:0,height:0,getContext:()=>ctx};}};
 try{const scene=new THREE.Scene(),built=buildCurveSigns({track,scene});assert.equal(canvases,1);assert.equal(built.stats.atlasTextures,1);const textures=new Set(built.meshes.map(m=>m.material.map));assert.equal(textures.size,1);assert.ok([...textures][0].isCanvasTexture);built.dispose();assert.equal(scene.children.length,0);}finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('disposal releases only the curve-sign meshes and does not alter the track',()=>{
 const start=track.sample(track.sectionS('duku',.5)).p.toArray(),other=new THREE.Object3D();world.scene.add(other);let disposals=0;for(const mesh of result.meshes)mesh.geometry.addEventListener('dispose',()=>disposals++);result.dispose();assert.equal(disposals,result.meshes.length);assert.deepEqual(track.sample(track.sectionS('duku',.5)).p.toArray(),start);assert.ok(world.scene.children.includes(other));assert.ok(result.meshes.every(m=>!world.scene.children.includes(m)));
});
