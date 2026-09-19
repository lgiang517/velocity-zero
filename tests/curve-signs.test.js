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
 for(const item of result.plan.warnings){const group=result.plan.groups[item.groupId],expected=item.travel>0?group.startS-85:group.endS+85;assert.ok(Math.abs(wrap(expected,track.length)-item.s)<1e-8);assert.equal(item.leadMetres,85);assert.ok(item.leadMetres>=70&&item.leadMetres<=100);const q=track.sample(item.s),driverRight=new THREE.Vector3().crossVectors(q.tan.clone().multiplyScalar(item.travel),new THREE.Vector3(0,1,0)).normalize();assert.ok(track.point(item.s,item.lateral).sub(q.p).dot(driverRight)>0,'advance sign sits on the actual driver-right shoulder');}
 assert.equal(result.plan.warnings.length,result.plan.groups.length*2);
 const synthetic={length:1000,sample:s=>({curvature:s>=200&&s<260?.012:s>=340&&s<410?-.015:s>=600&&s<604?.8:0})};
 const {bends,groups}=detectSharpBends(synthetic);assert.equal(bends.length,2);assert.equal(groups.length,1);assert.equal(groups[0].winding,true,'adjacent opposite bends merge, an isolated spike does not create a warning');
});

test('chevrons occupy the physical outside of each bend and reverse arrows face opposing traffic',()=>{
 for(const item of result.plan.chevrons){const bend=result.plan.bends[item.bendIndex];assert.equal(Math.sign(item.lateral),-bend.turn);const q=track.sample(item.s),right=new THREE.Vector3().crossVectors(q.tan.clone().multiplyScalar(item.travel),new THREE.Vector3(0,1,0)).normalize(),actual=track.point(item.s+item.travel*16).sub(q.p).dot(right);assert.equal(Math.sign(item.turn),Math.sign(actual));assert.equal(item.icon,actual>0?'chevron-right':'chevron-left');}
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


// Record the real canvas drawing commands (including mirror transforms), then
// locate those atlas pixels on the FINAL merged sign triangles. This catches a
// correct metadata label rendered through the wrong cell, UV flip or face yaw.
function recordedAtlas(){
 const polygons=[],stack=[];let transform={x:0,y:0,sx:1,sy:1},path=[];
 const point=(x,y)=>[transform.x+x*transform.sx,transform.y+y*transform.sy];
 const ctx={fillStyle:'',strokeStyle:'',beginPath(){path=[];},moveTo(x,y){path.push(point(x,y));},lineTo(x,y){path.push(point(x,y));},closePath(){},
  quadraticCurveTo(_x,_y,x,y){path.push(point(x,y));},bezierCurveTo(_a,_b,_c,_d,x,y){path.push(point(x,y));},stroke(){},fillRect(){},fillText(){},
  fill(){polygons.push({style:this.fillStyle,points:path.map(p=>[...p])});},save(){stack.push({...transform,fillStyle:this.fillStyle});},
  restore(){const old=stack.pop();this.fillStyle=old.fillStyle;transform=old;},translate(x,y){transform.x+=x*transform.sx;transform.y+=y*transform.sy;},scale(x,y){transform.sx*=x;transform.sy*=y;}
 };
 return{polygons,canvas:{width:0,height:0,getContext:()=>ctx}};
}
function faceTriangles(built,item){
 const centre=new THREE.Vector3(...item.position),normal=new THREE.Vector3(...item.faceNormal),triangles=[];
 for(const mesh of built.meshes){const g=mesh.geometry,p=g.attributes.position,uv=g.attributes.uv,index=g.index;
  for(let i=0;i<(index?.count??p.count);i+=3){const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),vertices=ids.map(j=>new THREE.Vector3().fromBufferAttribute(p,j));
   if(!vertices.every(v=>Math.abs(v.clone().sub(centre).dot(normal))<.001&&v.distanceTo(centre)<Math.hypot(item.width,item.height)/2+.004))continue;
   const n=new THREE.Vector3().crossVectors(vertices[1].clone().sub(vertices[0]),vertices[2].clone().sub(vertices[0])).normalize();if(n.dot(normal)<.999)continue;
   triangles.push({vertices,uv:ids.map(j=>[uv.getX(j),uv.getY(j)])});
  }
 }
 assert.ok(triangles.length>0,'locate actual front-face triangles');return triangles;
}
function atlasWorldPoint(triangles,pixel){
 const u=pixel[0]/512,v=1-pixel[1]/256;
 for(const triangle of triangles){const[[a,b],[c,d],[e,f]]=triangle.uv,den=(d-f)*(a-e)+(e-c)*(b-f);if(Math.abs(den)<1e-12)continue;
  const x=((d-f)*(u-e)+(e-c)*(v-f))/den,y=((f-b)*(u-e)+(a-e)*(v-f))/den,z=1-x-y;
  if(Math.min(x,y,z)>=-.00001)return triangle.vertices[0].clone().multiplyScalar(x).addScaledVector(triangle.vertices[1],y).addScaledVector(triangle.vertices[2],z);
 }
 assert.fail('actual painted arrow pixel is not covered by the sign UV triangles: '+JSON.stringify({pixel,uv:triangles.map(t=>t.uv)}));
}

test('actual atlas arrows projected through final meshes agree with road geometry in BOTH driving directions',()=>{
 const previous=globalThis.document,atlas=recordedAtlas();globalThis.document={createElement:()=>atlas.canvas};let built;
 try{built=buildCurveSigns({track,scene:new THREE.Scene()});}finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
 assert.equal(built.meshes[0].material.map.flipY,true,'pixel mapping below matches CanvasTexture upload');
 let checked=0,winding=0;
 for(const item of built.items.filter(i=>i.kind==='warning'||i.kind==='chevron')){
  const triangles=faceTriangles(built,item),uv=triangles[0].uv,meanU=uv.reduce((n,p)=>n+p[0],0)/3,meanV=uv.reduce((n,p)=>n+p[1],0)/3,column=Math.floor(meanU*4),row=Math.floor((1-meanV)*2);
  const polygon=atlas.polygons.find(p=>p.style===(item.kind==='chevron'?'#181d17':'#141713')&&p.points.length===(item.kind==='chevron'?6:3)&&p.points.every(([x,y])=>x>=column*128&&x<(column+1)*128&&y>=row*128&&y<(row+1)*128));
  assert.ok(polygon,`find the artwork actually selected by UV: ${item.kind}, ${item.s}`);
  const points=polygon.points,tip=item.kind==='chevron'?points[2]:points[0],tails=item.kind==='chevron'?[points[0],points[4]]:[points[1],points[2]],tail=[(tails[0][0]+tails[1][0])/2,(tails[0][1]+tails[1][1])/2];
  const q=track.sample(item.s),camera=new THREE.PerspectiveCamera(65,16/9,.1,300);camera.position.copy(track.point(item.s-item.travel*20,0,1.4));camera.lookAt(camera.position.clone().addScaledVector(q.tan,item.travel*35));camera.updateMatrixWorld(true);
  assert.ok(new THREE.Vector3(...item.faceNormal).dot(camera.position.clone().sub(new THREE.Vector3(...item.position)))>0,'approaching driver sees the painted front');
  const visibleArrow=atlasWorldPoint(triangles,tip).project(camera).x-atlasWorldPoint(triangles,tail).project(camera).x;
  let bendS=item.s;
  if(item.kind==='warning'){const group=built.plan.groups[item.groupId],first=item.travel>0?group.bends[0]:group.bends.at(-1);bendS=(first.startS+first.endS)/2;if(group.winding)winding++;}
  const road=track.sample(bendS),driverRight=new THREE.Vector3().crossVectors(road.tan.clone().multiplyScalar(item.travel),new THREE.Vector3(0,1,0)).normalize(),actualTurn=track.point(bendS+item.travel*16).sub(road.p).dot(driverRight);
  assert.equal(Math.sign(visibleArrow),Math.sign(actualTurn),`rendered arrow contradicts actual road: ${item.kind} s=${item.s} travel=${item.travel}`);checked++;
 }
 assert.ok(checked>150&&winding>=4);built.dispose();
});

test('disposal releases only the curve-sign meshes and does not alter the track',()=>{
 const start=track.sample(track.sectionS('duku',.5)).p.toArray(),other=new THREE.Object3D();world.scene.add(other);let disposals=0;for(const mesh of result.meshes)mesh.geometry.addEventListener('dispose',()=>disposals++);result.dispose();assert.equal(disposals,result.meshes.length);assert.deepEqual(track.sample(track.sectionS('duku',.5)).p.toArray(),start);assert.ok(world.scene.children.includes(other));assert.ok(result.meshes.every(m=>!world.scene.children.includes(m)));
});
