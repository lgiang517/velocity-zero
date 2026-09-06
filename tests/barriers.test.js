import test from 'node:test';
import assert from 'node:assert/strict';
import {CoastTrack} from '../src/track.js';
import {VehiclePhysics,CARS} from '../src/physics.js';
import {BARRIER,vehicleEnvelope,barrierLimit} from '../src/road-boundaries.js';
const track=new CoastTrack();
function cornerLateral(p,x,z){
 const q=track.sample(p.s),sin=Math.sin(p.yaw),cos=Math.cos(p.yaw);
 const dx=p.d+x*cos+z*sin,dz=z*cos-x*sin;
 const px=q.p.x+q.right.x*dx+Math.sin(q.heading)*dz,pz=q.p.z+q.right.z*dx+Math.cos(q.heading)*dz;
 const index=Math.floor((((p.s%track.length)+track.length)%track.length)/track.step);
 let best=Infinity,lateral=0;
 for(let off=-4;off<=4;off++){
  const i=(index+off+track.count)%track.count,a=track.samples[i].p,b=track.samples[i+1].p;
  const vx=b.x-a.x,vz=b.z-a.z,len=vx*vx+vz*vz,t=Math.max(0,Math.min(1,((px-a.x)*vx+(pz-a.z)*vz)/len));
  const ex=px-a.x-t*vx,ez=pz-a.z-t*vz,d=ex*ex+ez*ez;
  if(d<best){best=d;lateral=(ex*vz-ez*vx)/Math.sqrt(len);}
 }
 return lateral;
}
test('Entire 6.75 km: all three car footprints clear both actual rails at every 3 m station',()=>{
 let checked=0;
 for(const config of CARS){
  const p=new VehiclePhysics(config),h=vehicleEnvelope(config);
  for(let i=0;i<track.count;i++)for(const side of [-1,1])for(const angle of [-2.8,-1.5,-.8,-.25,0,.25,.8,1.5,2.8]){
   p.reset(i*track.step,side*10.5);p.yaw=angle;p.u=70;p.v=side*8;
   p.resolveBarrier(track.samples[i].curvature);
   for(const x of [-h.halfWidth,h.halfWidth])for(const z of [-h.halfLength,h.halfLength]){
    const d=cornerLateral(p,x,z);assert.ok(Math.abs(d)<BARRIER.offset-BARRIER.halfThickness,`penetration at ${p.s}, ${config.id}, yaw ${angle}, d ${d}`);
   }checked++;
  }
 }
 assert.ok(checked>120000);
});
test('Continuous rail cross-section follows every slope, turn and loop seam',()=>{
 for(const side of [-1,1]){
  const g=track.barrierGeometry(side),p=g.attributes.position;
  assert.equal(p.count,(track.count+1)*4);
  for(let i=0;i<=track.count;i++)for(let j=0;j<4;j++){
   const q=track.samples[i],expectedHeight=j<2?BARRIER.bottom:BARRIER.top;
   assert.ok(Math.abs(p.getY(i*4+j)-q.p.y-expectedHeight)<.00002);
   const d=(p.getX(i*4+j)-q.p.x)*q.right.x+(p.getZ(i*4+j)-q.p.z)*q.right.z;
   assert.ok(Math.abs(Math.abs(d)-BARRIER.offset)<=BARRIER.halfThickness+.0001);
  }
  for(let j=0;j<4;j++)assert.ok(Math.hypot(p.getX(j)-p.getX(track.count*4+j),p.getY(j)-p.getY(track.count*4+j),p.getZ(j)-p.getZ(track.count*4+j))<.0001);
  g.dispose();
 }
});
test('High-speed angled impacts on both rails remain contained and allow inward recovery',()=>{
 for(const config of CARS)for(const side of [-1,1])for(const wet of [0,1]){
  const p=new VehiclePhysics(config);p.reset(45,side*8);p.u=90;p.yaw=side*.7;
  for(let i=0;i<120;i++){
   const q=track.sample(p.s);p.step(1/120,{steer:side,throttle:1},{...q,wet},true);
   assert.ok(Math.abs(p.d)<=barrierLimit(config,p.yaw,q.curvature)+1e-7);
   assert.ok(Number.isFinite(p.u)&&Number.isFinite(p.v));
  }
  p.yaw=0;p.v=0;p.r=0;p.u=12;const before=Math.abs(p.d);
  for(let i=0;i<90;i++){const q=track.sample(p.s);p.step(1/120,{steer:-side,throttle:.3},{...q,wet},true);}
  assert.ok(Math.abs(p.d)<before-.3);
 }
});

