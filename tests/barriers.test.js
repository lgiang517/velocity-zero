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
test('Entire route: all three car footprints clear both actual rails at every 3 m station',()=>{
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


test('Road paint follows the curve within 1.5 cm even at the tightest hairpins',()=>{
 const g=track.roadRibbon(),p=g.attributes.position,uv=g.attributes.uv,columns=g.userData.lateralStations,stride=columns.length,rows=g.userData.longitudinalSegments;
 for(const d of [-.12,.12]){
  const column=columns.indexOf(d);assert.ok(column>=0);
  for(let row=0;row<rows;row++){
   const a=row*stride+column,b=a+stride,s=(uv.getY(a)+uv.getY(b))*.5;
   const exact=track.curve.getPointAt(s/track.length),tan=track.curve.getTangentAt(s/track.length),norm=Math.hypot(tan.x,tan.z);
   const x=exact.x+tan.z/norm*d,z=exact.z-tan.x/norm*d;
   const error=Math.hypot((p.getX(a)+p.getX(b))*.5-x,(p.getY(a)+p.getY(b))*.5-exact.y,(p.getZ(a)+p.getZ(b))*.5-z);
   assert.ok(error<.015,`paint deviates ${error} m at station ${s}`);
  }
 }
 for(let column=0;column<stride;column++)assert.equal(Math.hypot(p.getX(column)-p.getX(rows*stride+column),p.getY(column)-p.getY(rows*stride+column),p.getZ(column)-p.getZ(rows*stride+column)),0);
 const legacy=track.ribbon(-20,-10.3);assert.equal(legacy.attributes.position.count,(track.count+1)*2);
 g.dispose();legacy.dispose();
});
