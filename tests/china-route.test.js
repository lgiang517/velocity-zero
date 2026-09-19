import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CoastTrack} from '../src/track.js';
import {CHINA_ROUTE_LAYOUT,CHINA_ROUTE_ID} from '../src/china-route.js';

const track=new CoastTrack(),old=track.legacyTrack;
const near=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<tolerance,`${a} differs from ${b}`);

test('extended route uses metre-based sections and retains the original coastal route independently',()=>{
 assert.equal(track.routeId,CHINA_ROUTE_ID);assert.equal(old.legacyTrack,undefined);
 assert.ok(track.length>13000&&track.length<16500,`route length ${track.length}`);
 near(track.legacyLength,6873.779692794547);
 for(const id of ['hzmb','sichuan','duku']){
  const section=track.section(id);assert.equal(section.id,id);near(section.endS-section.startS,section.length);
  near(track.sectionS(id,0),section.startS);near(track.sectionS(id,1),section.endS);
  assert.equal(track.sectionAt(track.sectionS(id,.5)).id,id);
  assert.equal(track.sectionAt(track.sectionS(id,.5)+track.length).id,id);
  assert.equal(track.sectionAt(track.sectionS(id,.5)-track.length).id,id);
  assert.equal(track.region(track.sectionS(id,.5)),section.region);
 }
 near(track.section('hzmb').length,3000);assert.ok(track.section('sichuan').length>=1300);
 assert.ok(track.section('duku').length>2400&&track.section('duku').length<2700);
 assert.ok(track.sections.filter(s=>s.id==='connector').every(s=>s.kind));
 assert.equal(track.legacyS(.94),null);
});

test('all retained legacy driving samples, landmarks and tunnel coordinates remain unchanged',()=>{
 for(let s=0;s<old.length*.89;s+=17){
  const a=old.sample(s),b=track.sample(s);
  assert.ok(a.p.distanceTo(b.p)<1e-9);near(a.heading,b.heading);near(a.curvature,b.curvature);near(a.slope,b.slope);
  assert.ok(track.curve.getPointAt(s/track.length).distanceTo(old.curve.getPointAt(s/old.length))<1e-8);
 }
 for(const fraction of [.993,.994,.997,.9999]){
  const a=old.sample(old.length*fraction),b=track.sample(track.legacyS(fraction));assert.ok(a.p.distanceTo(b.p)<1e-8);near(a.heading,b.heading);
 }
 for(const s of [135,485,890,1440,2610,4550,5590,6090])assert.ok(old.point(s).distanceTo(track.point(s))<1e-9);
 for(const fraction of [.219,.221,.24,.259,.261])assert.equal(track.inTunnel(track.legacyS(fraction)),old.inTunnel(old.length*fraction));
 for(const section of track.sections)assert.equal(track.inTunnel((section.startS+section.endS)/2),false);
});

test('every extension joint and the lap seam match positions and tangent directions',()=>{
 for(let i=1;i<track.parts.length;i++){
  const previous=track.parts[i-1].curve,next=track.parts[i].curve;
  assert.ok(previous.getPointAt(1).distanceTo(next.getPointAt(0))<1e-8,track.parts[i].id+' position gap');
  assert.ok(previous.getTangentAt(1).angleTo(next.getTangentAt(0))<.0005,track.parts[i].id+' tangent kink');
 }
 assert.ok(track.curve.getPointAt(0).distanceTo(track.curve.getPointAt(1))<1e-8);
 assert.ok(track.curve.getTangentAt(0).angleTo(track.curve.getTangentAt(1))<1e-7);
});

test('the new route stays within twelve percent grade and 45 metre minimum horizontal turn radius',()=>{
 for(let s=track.extensionStartS;s<track.extensionEndS-.5;s+=.5){
  const a=track.curve.getTangentAt(s/track.length),b=track.curve.getTangentAt((s+.5)/track.length);
  assert.ok(Math.abs(a.y)/Math.hypot(a.x,a.z)<=.12,`steep grade at ${s}`);
  const heading=Math.atan2(a.x,a.z),next=Math.atan2(b.x,b.z),curvature=Math.abs(Math.atan2(Math.sin(next-heading),Math.cos(next-heading))/.5);
  assert.ok(curvature<=1/45,`tight corner ${1/curvature}m at ${s}`);
 }
});

function pointSegment(p,a,b){const x=b.x-a.x,z=b.z-a.z,t=THREE.MathUtils.clamp(((p.x-a.x)*x+(p.z-a.z)*z)/(x*x+z*z),0,1);return Math.hypot(p.x-a.x-t*x,p.z-a.z-t*z);}
function segmentDistance(a,b,c,d){
 const cross=(p,q,r)=>(q.x-p.x)*(r.z-p.z)-(q.z-p.z)*(r.x-p.x);
 if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)return 0;
 return Math.min(pointSegment(a,c,d),pointSegment(b,c,d),pointSegment(c,a,b),pointSegment(d,a,b));
}
test('non-adjacent roads never cross and retain clearance for both full-width crash barriers',()=>{
 const segments=[],cells=new Map(),step=5,padding=28,cell=80;
 for(let s=0;s<track.length;s+=step){const end=Math.min(track.length,s+step),a=track.curve.getPointAt(s/track.length),b=track.curve.getPointAt(end/track.length);segments.push({s,end,a,b});}
 for(let i=0;i<segments.length;i++){
  const p=segments[i],seen=new Set();
  const x0=Math.floor((Math.min(p.a.x,p.b.x)-padding)/cell),x1=Math.floor((Math.max(p.a.x,p.b.x)+padding)/cell),z0=Math.floor((Math.min(p.a.z,p.b.z)-padding)/cell),z1=Math.floor((Math.max(p.a.z,p.b.z)+padding)/cell);
  for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){
   const key=x+':'+z,list=cells.get(key)||[];
   for(const j of list){if(seen.has(j))continue;seen.add(j);const q=segments[j],arc=Math.min(Math.abs(p.s-q.s),track.length-Math.abs(p.s-q.s));if(arc<85)continue;
    assert.ok(segmentDistance(p.a,p.b,q.a,q.b)>27,`road clearances overlap at ${p.s} and ${q.s}`);
   }
   list.push(i);cells.set(key,list);
  }
 }
});

test('HZMB gives its three navigational bridges seven towers, a level carriageway and a tapered protected median',()=>{
 const section=track.section('hzmb');assert.equal(section.spans.length,3);assert.equal(section.spans.reduce((n,s)=>n+s.towers.length,0),7);
 for(let local=0;local<section.length;local+=13){const q=track.sample(section.startS+local);near(q.p.y,45,1e-5);near(q.p.z,-1450,.001);assert.ok(q.medianHalfWidth>=0&&q.medianHalfWidth<=1.35);}
 assert.equal(track.sample(section.startS+100).medianHalfWidth,0);near(track.sample(section.startS+800).medianHalfWidth,1.35);
 assert.equal(track.sample(section.endS-20).medianHalfWidth,0);
 const ramp=section.startS+section.length*.08;assert.ok(track.sample(ramp+12.5).medianHalfWidth>.6&&track.sample(ramp+12.5).medianHalfWidth<.75);
 for(const id of ['duku','sichuan'])assert.equal(track.sample(track.sectionS(id,.5)).medianHalfWidth,0);
});

test('Sichuan has a clear straight 700 metre main span separated from the open sea bridge',()=>{
 const section=track.section('sichuan'),[a,b]=section.mainSpan,p=track.sample(section.startS+a),q=track.sample(section.startS+b);
 assert.ok(Math.hypot(q.p.x-p.p.x,q.p.z-p.p.z)>695);near(p.p.z,q.p.z,1e-5);
 assert.ok(p.p.z-track.section('hzmb').start[2]>=800);
 for(let local=a;local<=b;local+=10){const road=track.sample(section.startS+local);near(road.heading,Math.PI/2,1e-6);assert.ok(Math.abs(road.slope)<.08);}
});

test('Duku contains four full-size switchbacks with snow-pass elevation and route bounds remain truthful',()=>{
 const section=track.section('duku'),hairpins=track.parts.filter(p=>p.id.startsWith('duku-hairpin'));
 assert.equal(hairpins.length,4);let low=Infinity,high=-Infinity;
 for(const part of hairpins){const a=part.curve.getPointAt(0),b=part.curve.getPointAt(1);near(Math.hypot(a.x-b.x,a.z-b.z),120,1e-7);assert.ok(part.length>188);}
 for(let s=section.startS;s<section.endS;s+=5){const q=track.sample(s);low=Math.min(low,q.p.y);high=Math.max(high,q.p.y);assert.ok(q.p.x<-700&&q.p.z<1300);}
 assert.ok(high>202&&high-low>79);
 for(let s=0;s<track.length;s+=23){const q=track.sample(s);assert.ok(q.p.x>=track.bounds.minX-.01&&q.p.x<=track.bounds.maxX+.01&&q.p.z>=track.bounds.minZ-.01&&q.p.z<=track.bounds.maxZ+.01);assert.ok(Number.isFinite(q.s+q.slope+q.curvature));}
 assert.deepEqual(CHINA_ROUTE_LAYOUT.duku.end,section.end);
});
