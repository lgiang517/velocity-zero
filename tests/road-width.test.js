import test from 'node:test';
import assert from 'node:assert/strict';
import {CoastTrack} from '../src/track.js';
import {BARRIER,barrierLimit} from '../src/road-boundaries.js';
import {VehiclePhysics,DriverAI,CARS} from '../src/physics.js';
const track=new CoastTrack(),hzmb=track.section('hzmb');
const close=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<tolerance,`${a} differs from ${b}`);

test('bridge width grows over 220 m, remains six lanes, then smoothly returns to the original road',()=>{
 for(const s of[0,4000,hzmb.startS-220,hzmb.endS+220,track.length+40]){const q=track.roadProfile(s);close(q.asphaltHalfWidth,8.4);close(q.barrierOffset,9.85);close(q.widthMix,0);}
 for(let s=hzmb.startS;s<=hzmb.endS;s+=13){const q=track.sample(s);close(q.widthMix,1);close(q.asphaltHalfWidth,14);close(q.barrierOffset,15.7);}
 close(track.roadProfile(hzmb.startS-110).widthMix,.5);close(track.roadProfile(hzmb.endS+110).widthMix,.5);
 for(const edge of[hzmb.startS-220,hzmb.startS,hzmb.endS,hzmb.endS+220]){
  const a=track.roadProfile(edge-.001),b=track.roadProfile(edge+.001);assert.ok(Math.abs(a.barrierOffset-b.barrierOffset)<1e-7);
 }
});

test('canonical road furniture coordinates map continuously to the widened asphalt, rail and verge',()=>{
 const s=hzmb.startS+400;
 for(const side of[-1,1]){close(track.roadLateral(s,side*8.4),side*14);close(track.roadLateral(s,side*9.85),side*15.7);close(track.roadLateral(s,side*10.3),side*16.15);close(track.roadLateral(45,side*10.3),side*10.3);}
 for(let d=-22;d<22;d+=.01)assert.ok(track.roadLateral(s,d+.01)>track.roadLateral(s,d));
});

test('road vertices, UV metres, marking columns and width attribute describe the same six-lane surface',()=>{
 const g=track.roadRibbon(),positions=g.attributes.position,uv=g.attributes.uv,mix=g.attributes.roadWidthMix,stride=g.userData.lateralStations.length;
 let full=0,transition=0;
 for(let row=0;row<=g.userData.longitudinalSegments;row+=19){const first=row*stride,s=uv.getY(first),p=track.curve.getPointAt(s/track.length),tan=track.curve.getTangentAt(s/track.length),norm=Math.hypot(tan.x,tan.z),profile=track.roadProfile(s);
  close(Math.abs(uv.getX(first)),profile.asphaltHalfWidth,.00002);close(mix.getX(first),profile.widthMix,.00001);
  for(let column=0;column<stride;column++){const i=first+column,d=((positions.getX(i)-p.x)*tan.z-(positions.getZ(i)-p.z)*tan.x)/norm;close(d,uv.getX(i),.001);}
  if(profile.widthMix===1){const rowColumns=Array.from({length:stride},(_,c)=>uv.getX(first+c));for(const line of[1.85,5.6,9.35,13.1])assert.ok(rowColumns.some(d=>Math.abs(d-line)<.00001));full++;}
  if(profile.widthMix>0&&profile.widthMix<1)transition++;
 }
 assert.ok(full>50&&transition>5);g.dispose();
});

test('all six lane centres preserve asphalt grip and the outside lane is no longer clamped to the old rail',()=>{
 const s=hzmb.startS+500;
 for(const config of CARS){let grip;
  for(const side of[-1,1])for(const lane of[3.725,7.475,11.225]){const p=new VehiclePhysics(config);p.reset(s,side*lane);p.u=30;p.step(1/120,{throttle:.3},{...track.sample(s),wet:0});close(p.d,side*lane,.001);assert.equal(p.collisions,0);if(grip!==undefined)close(p.grip,grip);grip=p.grip;}
 }
 const old=new VehiclePhysics(CARS[0]);old.reset(0,11.225);old.resolveBarrier();assert.ok(old.d<9.85);
});

test('high-speed wide-road impacts obey the new rail on both sides',()=>{
 for(const config of CARS)for(const side of[-1,1]){const p=new VehiclePhysics(config);p.reset(hzmb.startS+500,side*14.8);p.u=80;p.yaw=side*.6;
  for(let i=0;i<60;i++){const q=track.sample(p.s);p.step(1/120,{steer:side,throttle:1},{...q,wet:0});assert.ok(Math.abs(p.d)<=barrierLimit(config,p.yaw,q.curvature,q.barrierOffset)+1e-7);}
  assert.ok(Math.abs(p.d)>BARRIER.offset&&p.collisions>0);
 }
});

test('AI uses each real bridge lane and overtakes without crossing the protected median',()=>{
 const s=hzmb.startS+700;
 for(const side of[-1,1])for(let seed=0;seed<3;seed++){
  const p=new VehiclePhysics(CARS[0]);p.reset(s,side*3.725);p.u=22;const ai=new DriverAI(p,'precision',seed);ai.lane=side*2.8;
  const player=new VehiclePhysics(CARS[0]);player.reset(s+300,-side*3.725);ai.controls(track,player,[p,player],0);
  close(ai.targetLane,side*[3.725,7.475,11.225][seed],.1);
 }
 const p=new VehiclePhysics(CARS[0]);p.reset(s,11.225);p.u=24;const lead=new VehiclePhysics(CARS[0]);lead.reset(s+12,11.225);lead.u=18;const ai=new DriverAI(p,'precision',2);ai.lane=5.6;
 ai.controls(track,lead,[p,lead],0);assert.ok(ai.targetLane>1.35&&ai.targetLane<9.35);
});

test('outer-lane AI rejoins the narrower connector without a rail strike',()=>{
 for(const side of[-1,1]){
  const p=new VehiclePhysics(CARS[0]);p.reset(hzmb.endS-100,side*11.225);p.u=36;
  const player=new VehiclePhysics(CARS[0]);player.reset(hzmb.endS+1000,0);
  const ai=new DriverAI(p,'precision',2);ai.lane=side*5.6;
  for(let i=0;i<3600&&p.s<hzmb.endS+260;i++){const q=track.sample(p.s);p.step(1/120,ai.controls(track,player,[p,player],i/120),{...q,wet:0});}
  assert.ok(p.s>hzmb.endS+260);assert.equal(p.collisions,0);assert.ok(Math.abs(p.d)<7.5);
 }
});
